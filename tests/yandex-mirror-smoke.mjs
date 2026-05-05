import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'playwright', 'yandex-mirror-smoke');
fs.mkdirSync(outputDir, { recursive: true });

const versionMeta = JSON.parse(fs.readFileSync(path.join(root, 'js', 'version.json'), 'utf8'));
const expectedVersion = versionMeta.version;
const baseOrigin = process.env.RO_YANDEX_URL || 'https://calc2.recycleobject.ru/';
const smokeUserId = process.env.RO_SMOKE_USER_ID || '1772715209137';

function buildUrl(hash = '#warehouse') {
  const url = new URL(baseOrigin);
  url.searchParams.set('targetVersion', expectedVersion);
  url.searchParams.set('reload', `yandex-smoke-${Date.now()}`);
  url.hash = hash;
  return url.toString();
}

async function authenticate(page) {
  await page.waitForFunction(
    () => typeof App !== 'undefined'
      && Array.isArray(App.authAccounts)
      && App.authAccounts.length > 0,
    null,
    { timeout: 90_000 }
  );

  const result = await page.evaluate(async (userId) => {
    const accounts = App.authAccounts || [];
    const account = accounts.find(entry => String(entry.id) === String(userId))
      || accounts.find(entry => entry.is_active !== false);
    if (!account) return { ok: false, accountCount: accounts.length };

    localStorage.setItem('ro_calc_auth_method', 'user');
    localStorage.setItem('ro_calc_auth_ts', Date.now().toString());
    localStorage.setItem('ro_calc_auth_user_id', String(account.id));
    localStorage.setItem('ro_calc_last_user_id', String(account.id));
    localStorage.setItem('ro_calc_last_user_name', account.employee_name || account.username || 'Сотрудник');

    await App.restoreAuthenticatedUser();
    if (typeof App.showApp === 'function') await App.showApp();
    if (typeof App.navigate === 'function') await App.navigate('warehouse', false, null);
    return {
      ok: true,
      accountId: String(account.id),
      accountName: account.employee_name || account.username || 'Сотрудник',
    };
  }, smokeUserId);

  assert.equal(result.ok, true, `Yandex mirror auth failed: ${JSON.stringify(result)}`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const failedRequests = [];
  const consoleMessages = [];
  let blockedSupabaseRequests = 0;
  let yandexProxyRequests = 0;

  page.on('request', request => {
    if (request.url().includes('apigw.yandexcloud.net')) {
      yandexProxyRequests += 1;
    }
  });
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText || '',
    });
  });
  page.on('console', message => {
    const text = message.text();
    if (/bootstrap|supabase|warehouse|auth|error/i.test(text)) {
      consoleMessages.push({
        type: message.type(),
        text: text.slice(0, 500),
      });
    }
  });

  await page.route('**/*supabase.co/**', route => {
    blockedSupabaseRequests += 1;
    route.abort('blockedbyclient');
  });

  try {
    await page.goto(buildUrl('#warehouse'), {
      waitUntil: 'domcontentloaded',
      timeout: 90_000,
    });
    await authenticate(page);
    await page.waitForTimeout(3_000);

    const state = await page.evaluate(async () => {
      const bootstrap = await fetch('/data/bootstrap.json', { cache: 'no-store' })
        .then(async response => {
          const payload = await response.json();
          const orders = Array.isArray(payload.data?.orders) ? payload.data.orders : [];
          return {
            ok: response.ok,
            status: response.status,
            generatedAt: payload.generated_at || '',
            warehouseItems: payload.data?.warehouseItems?.length || 0,
            warehouseReservations: payload.data?.warehouseReservations?.length || 0,
            orders: orders.length,
            draftOrders: orders.filter(order => ['draft', 'calculated'].includes(String(order.status || ''))).length,
            cancelledOrders: orders.filter(order => String(order.status || '') === 'cancelled').length,
            orderItems: payload.data?.orderItems?.length || 0,
            shipments: payload.data?.shipments?.length || 0,
            chinaPurchases: payload.data?.chinaPurchases?.length || 0,
          };
        })
        .catch(error => ({ ok: false, error: error.message }));

      const warehouseItems = typeof loadWarehouseItems === 'function'
        ? await loadWarehouseItems()
        : [];
      const orders = typeof loadOrders === 'function'
        ? await loadOrders()
        : [];
      const orderItems = typeof getLocal === 'function' && typeof LOCAL_KEYS !== 'undefined'
        ? (getLocal(LOCAL_KEYS.orderItems) || [])
        : [];
      const chinaPurchases = typeof loadChinaPurchases === 'function'
        ? await loadChinaPurchases({}).catch(() => [])
        : [];
      const shipments = typeof loadShipments === 'function'
        ? await loadShipments().catch(() => [])
        : [];

      let demandRows = [];
      let demandOrder = null;
      if (typeof Warehouse !== 'undefined' && typeof Warehouse._collectWarehouseDemandFromOrderItems === 'function') {
        Warehouse.allItems = warehouseItems;
        const projectStatuses = new Set([
          'sample',
          'production_casting',
          'production_printing',
          'production_hardware',
          'production_packaging',
          'in_production',
          'delivery',
          'completed',
        ]);
        for (const order of orders.filter(item => projectStatuses.has(String(item.status || ''))).slice(0, 20)) {
          const detail = typeof loadOrder === 'function'
            ? await loadOrder(order.id).catch(() => null)
            : null;
          const rows = Warehouse._collectWarehouseDemandFromOrderItems(detail?.items || []);
          if (rows.length > 0) {
            demandRows = rows;
            demandOrder = { id: order.id, name: order.order_name || '', status: order.status || '' };
            break;
          }
        }
      }

      if (typeof Warehouse !== 'undefined' && typeof Warehouse.setView === 'function') {
        Warehouse.allItems = warehouseItems;
        Warehouse.setView('project-hardware', { force: true });
        await new Promise(resolve => setTimeout(resolve, 2_000));
      }

      return {
        appVersion: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
        currentHost: location.hostname,
        bootstrap,
        warehouseItemCount: Array.isArray(warehouseItems) ? warehouseItems.length : 0,
        ordersCount: Array.isArray(orders) ? orders.length : 0,
        orderItemsCount: Array.isArray(orderItems) ? orderItems.length : 0,
        chinaPurchaseCount: Array.isArray(chinaPurchases) ? chinaPurchases.length : 0,
        shipmentsCount: Array.isArray(shipments) ? shipments.length : 0,
        demandRowsCount: demandRows.length,
        demandOrder,
        firstDemandRows: demandRows.slice(0, 5),
        totalItemsText: document.querySelector('#wh-total-items')?.textContent?.trim() || '',
        reservedText: document.querySelector('#wh-total-reserved')?.textContent?.trim() || '',
        projectHardwareText: document.querySelector('#wh-content')?.innerText?.slice(0, 1000) || '',
        supabaseScript: Array.from(document.scripts).find(script => /supabase\.js/.test(script.src))?.src || '',
        supabaseRuntimeUrl: typeof window.__roSupabaseRuntimeUrl === 'string' ? window.__roSupabaseRuntimeUrl : '',
      };
    });

    fs.writeFileSync(path.join(outputDir, 'state.json'), JSON.stringify({
      state,
      blockedSupabaseRequests,
      yandexProxyRequests,
      failedRequests,
      consoleMessages,
    }, null, 2));
    await page.screenshot({
      path: path.join(outputDir, 'warehouse.png'),
      fullPage: true,
    });

    assert.equal(state.appVersion, expectedVersion, `Expected mirror version ${expectedVersion}, got ${state.appVersion}`);
    assert.equal(state.bootstrap.ok, true, `Yandex bootstrap must load: ${JSON.stringify(state.bootstrap)}`);
    assert.ok(state.bootstrap.warehouseItems > 0, `Expected warehouse items in bootstrap, got ${state.bootstrap.warehouseItems}`);
    assert.ok(state.bootstrap.orders > 0, `Expected project orders in bootstrap, got ${state.bootstrap.orders}`);
    assert.ok(state.bootstrap.draftOrders > 0, `Expected draft orders in bootstrap, got ${state.bootstrap.draftOrders}`);
    assert.equal(state.bootstrap.cancelledOrders, 0, `Cancelled orders should stay out of the default mirror snapshot, got ${state.bootstrap.cancelledOrders}`);
    assert.ok(state.bootstrap.orderItems > 0, `Expected order items in bootstrap, got ${state.bootstrap.orderItems}`);
    assert.ok(state.bootstrap.chinaPurchases > 0, `Expected China purchases in bootstrap, got ${state.bootstrap.chinaPurchases}`);
    assert.ok(state.bootstrap.shipments >= 0, `Expected shipments field in bootstrap, got ${state.bootstrap.shipments}`);
    assert.ok(state.warehouseItemCount > 0, `Expected warehouse items from mirror fallback, got ${state.warehouseItemCount}`);
    assert.ok(state.ordersCount > 0, `Expected orders from mirror fallback, got ${state.ordersCount}`);
    assert.ok(state.orderItemsCount > 0, `Expected cached order items from mirror fallback, got ${state.orderItemsCount}`);
    assert.ok(state.chinaPurchaseCount > 0, `Expected China purchases from mirror fallback, got ${state.chinaPurchaseCount}`);
    assert.ok(state.shipmentsCount >= 0, `Expected shipments from mirror fallback, got ${state.shipmentsCount}`);
    assert.ok(state.demandRowsCount > 0, `Expected at least one project hardware demand row, got ${JSON.stringify(state.demandOrder)}`);
    assert.ok(
      blockedSupabaseRequests > 0 || yandexProxyRequests > 0 || state.supabaseRuntimeUrl.includes('apigw.yandexcloud.net'),
      'Smoke must verify either Russian mirror fallback or the Yandex Supabase proxy path'
    );

    console.log(JSON.stringify({
      ok: true,
      url: baseOrigin,
      version: state.appVersion,
      warehouseItemCount: state.warehouseItemCount,
      ordersCount: state.ordersCount,
      orderItemsCount: state.orderItemsCount,
      chinaPurchaseCount: state.chinaPurchaseCount,
      shipmentsCount: state.shipmentsCount,
      demandRowsCount: state.demandRowsCount,
      demandOrder: state.demandOrder,
      blockedSupabaseRequests,
      yandexProxyRequests,
      supabaseRuntimeUrl: state.supabaseRuntimeUrl,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

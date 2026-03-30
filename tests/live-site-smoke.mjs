import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'playwright', 'live-site-smoke');
fs.mkdirSync(outputDir, { recursive: true });

const versionMeta = JSON.parse(
  fs.readFileSync(path.join(root, 'js', 'version.json'), 'utf8')
);
const expectedVersion = versionMeta.version;
const baseOrigin =
  process.env.RO_LIVE_URL || 'https://polinacherpovitskaya-glitch.github.io/ro-calculator/';
const smokeUserId = process.env.RO_SMOKE_USER_ID || '1772715209137';

function buildUrl(hash) {
  const url = new URL(baseOrigin);
  url.searchParams.set('targetVersion', expectedVersion);
  url.searchParams.set('reload', Date.now().toString());
  url.hash = hash;
  return url.toString();
}

async function ensureAuthenticated(page) {
  await page.waitForFunction(
    () => typeof App !== 'undefined'
      && Array.isArray(App.authAccounts)
      && App.authAccounts.length > 0,
    null,
    { timeout: 60_000 }
  );

  const authResult = await page.evaluate(async (userId) => {
    const accounts = App?.authAccounts || [];
    const account =
      accounts.find((entry) => String(entry.id) === String(userId))
      || accounts.find((entry) => entry.is_active !== false);

    if (!account) {
      return {
        ok: false,
        accountCount: accounts.length
      };
    }

    localStorage.setItem('ro_calc_auth_method', 'user');
    localStorage.setItem('ro_calc_auth_ts', Date.now().toString());
    localStorage.setItem('ro_calc_auth_user_id', String(account.id));
    localStorage.setItem('ro_calc_last_user_id', String(account.id));
    localStorage.setItem(
      'ro_calc_last_user_name',
      account.employee_name || account.username || 'Сотрудник'
    );

    await App.restoreAuthenticatedUser();
    if (typeof App.showApp === 'function') {
      await App.showApp();
    }

    return {
      ok: true,
      accountId: String(account.id),
      accountName: account.employee_name || account.username || 'Сотрудник'
    };
  }, smokeUserId);

  assert.equal(authResult.ok, true, `Live auth bootstrap failed: ${JSON.stringify(authResult)}`);
  await page.waitForTimeout(1_500);
}

async function openAuthedHash(page, hash) {
  await page.goto(buildUrl(hash), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000
  });
  await ensureAuthenticated(page);
  await page.evaluate(async (nextHash) => {
    if (location.hash !== nextHash) {
      location.hash = nextHash;
    }
    if (typeof App !== 'undefined') {
      const [pageName, subId] = String(nextHash || '#orders')
        .replace(/^#/, '')
        .split('/');
      if (typeof App.navigate === 'function') {
        await App.navigate(pageName || 'orders', false, subId || null);
      } else if (typeof App.handleRoute === 'function') {
        await App.handleRoute();
      }
    }
  }, hash);
  await page.waitForTimeout(2_000);
}

async function smokeBugDoneFallback(page) {
  await openAuthedHash(page, '#bugs');

  await page.waitForFunction(() => {
    return typeof BugReports !== 'undefined'
      && Array.isArray(BugReports?.bundle?.tasks)
      && BugReports.bundle.tasks.length > 0
      && Array.isArray(BugReports?.bundle?.bugReports)
      && BugReports.bundle.bugReports.length > 0;
  }, null, { timeout: 60_000 });

  const boot = await page.evaluate(() => ({
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
    hasBugReports: typeof BugReports !== 'undefined',
    hasTasksModule: typeof Tasks !== 'undefined',
    taskCount: BugReports?.bundle?.tasks?.length ?? null,
    reportCount: BugReports?.bundle?.bugReports?.length ?? null
  }));

  assert.equal(boot.version, expectedVersion, `Expected live version ${expectedVersion}, got ${boot.version}`);
  assert.equal(boot.hasBugReports, true, 'BugReports module must be available on live page');
  assert.equal(boot.hasTasksModule, true, 'Tasks module must be available on live page');
  assert.ok(boot.taskCount && boot.taskCount > 0, `Expected bug tasks on live page, got ${boot.taskCount}`);
  assert.ok(boot.reportCount && boot.reportCount > 0, `Expected bug reports on live page, got ${boot.reportCount}`);

  const prepared = await page.evaluate(() => {
    const bugTasks = BugReports?.bundle?.tasks || [];
    const bugReports = BugReports?.bundle?.bugReports || [];
    const existingTask = bugTasks.find((task) => /^\[Баг\]/.test(task.title || ''));
    if (!existingTask) {
      return { ok: false, reason: 'no-bug-task' };
    }

    const report = bugReports.find((item) => Number(item.task_id) === Number(existingTask.id));
    if (!report) {
      return { ok: false, reason: 'no-linked-report', taskId: Number(existingTask.id) };
    }

    const original = {
      task: { ...existingTask },
      tasksBundle: Tasks.bundle,
      taskById: Tasks.taskById,
      changeStatus: Tasks.changeStatus,
      emitTaskEvents: Tasks.emitTaskEvents,
      isOverdue: Tasks.isOverdue,
      saveWorkTask,
      showToast: typeof showToast !== 'undefined' ? showToast : null,
      filters: { ...BugReports.filters }
    };

    const taskIndex = bugTasks.findIndex((task) => Number(task.id) === Number(existingTask.id));
    window.__liveBugDoneSmoke = {
      original,
      state: {
        saved: null,
        emitted: null,
        toast: null,
        changeStatusCalled: false,
        taskId: Number(existingTask.id),
        reportId: Number(report.id)
      }
    };

    bugTasks[taskIndex] = {
      ...existingTask,
      status: 'incoming',
      completed_at: null,
      updated_at: '2026-03-30T20:00:00.000+00:00'
    };

    Tasks.bundle = null;
    Tasks.taskById = () => null;
    Tasks.changeStatus = async () => {
      window.__liveBugDoneSmoke.state.changeStatusCalled = true;
    };
    Tasks.isOverdue = () => false;
    Tasks.emitTaskEvents = async (nextTask, prevTask, previousOverdue, options) => {
      window.__liveBugDoneSmoke.state.emitted = {
        nextStatus: nextTask?.status ?? null,
        prevStatus: prevTask?.status ?? null,
        previousOverdue,
        preserveSelection: options?.preserveSelection ?? null
      };
    };
    saveWorkTask = async (task) => {
      window.__liveBugDoneSmoke.state.saved = {
        id: Number(task.id),
        status: task.status
      };
      return {
        ...task,
        updated_at: '2026-03-30T20:10:00.000+00:00'
      };
    };
    showToast = (message) => {
      window.__liveBugDoneSmoke.state.toast = message;
    };

    BugReports.filters = { ...BugReports.filters, status: 'all' };
    BugReports.render();

    return {
      ok: true,
      buttonCount: document.querySelectorAll('.bug-report-done-btn').length
    };
  });

  assert.equal(prepared.ok, true, `Failed to prepare bug fallback smoke: ${JSON.stringify(prepared)}`);
  assert.ok(prepared.buttonCount >= 1, `Expected at least one live bug done button, got ${prepared.buttonCount}`);

  await page.locator('.bug-report-done-btn').first().click();

  const bugResult = await page.evaluate(() => window.__liveBugDoneSmoke?.state || null);
  assert.ok(bugResult, 'Expected live bug fallback state after click');
  assert.equal(bugResult.changeStatusCalled, false, 'Fallback path must not rely on Tasks.changeStatus');
  assert.equal(bugResult.saved?.status, 'done', 'Fallback path must save bug task as done');
  assert.equal(bugResult.emitted?.nextStatus, 'done', 'Fallback path must emit done task events');
  assert.equal(bugResult.emitted?.preserveSelection, false, 'Fallback path must preserve selection=false');

  await page.screenshot({
    path: path.join(outputDir, 'bugs-done-fallback.png'),
    fullPage: true
  });

  await page.evaluate(() => {
    const smoke = window.__liveBugDoneSmoke;
    if (!smoke) {
      return;
    }
    const original = smoke.original;
    const bugTasks = BugReports?.bundle?.tasks || [];
    const idx = bugTasks.findIndex((task) => Number(task.id) === Number(smoke.state.taskId));
    if (idx >= 0 && original.task) {
      bugTasks[idx] = original.task;
    }
    Tasks.bundle = original.tasksBundle;
    Tasks.taskById = original.taskById;
    Tasks.changeStatus = original.changeStatus;
    Tasks.emitTaskEvents = original.emitTaskEvents;
    Tasks.isOverdue = original.isOverdue;
    saveWorkTask = original.saveWorkTask;
    if (original.showToast) {
      showToast = original.showToast;
    }
    BugReports.filters = original.filters;
    delete window.__liveBugDoneSmoke;
    BugReports.render();
  });
}

async function smokeWarehouseLoads(page) {
  await openAuthedHash(page, '#warehouse');

  await page.waitForFunction(() => {
    return typeof Warehouse !== 'undefined'
      && Array.isArray(Warehouse?.allItems)
      && Warehouse.allItems.length > 0
      && document.body.innerText.includes('Склад фурнитуры');
  }, null, { timeout: 30_000 });

  const warehouseState = await page.evaluate(() => ({
    itemCount: Warehouse?.allItems?.length ?? null,
    shipmentCount: Warehouse?.allShipments?.length ?? null,
    currentView: Warehouse?.currentView ?? null,
    hasHeading: document.body.innerText.includes('Склад фурнитуры'),
    hasTable: document.body.innerText.includes('Таблица')
  }));

  assert.equal(warehouseState.hasHeading, true, 'Warehouse page must render heading on live site');
  assert.equal(warehouseState.currentView, 'table', `Expected warehouse table view, got ${warehouseState.currentView}`);
  assert.equal(warehouseState.hasTable, true, 'Warehouse page must render table section');
  assert.ok(
    Number.isFinite(warehouseState.itemCount) && warehouseState.itemCount > 0,
    `Expected live warehouse items, got ${warehouseState.itemCount}`
  );

  await page.screenshot({
    path: path.join(outputDir, 'warehouse.png'),
    fullPage: true
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await smokeBugDoneFallback(page);
  await smokeWarehouseLoads(page);
  console.log(`live site smoke checks passed (${expectedVersion})`);
} catch (error) {
  try {
    await page.screenshot({
      path: path.join(outputDir, 'failure.png'),
      fullPage: true
    });
  } catch {
    // Ignore screenshot capture failures in error path.
  }
  throw error;
} finally {
  await browser.close();
}

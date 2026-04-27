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
const browserLogs = [];

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
      && typeof Tasks !== 'undefined'
      && typeof BugReports.render === 'function';
  }, null, { timeout: 60_000 });

  const boot = await page.evaluate(() => ({
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
    hasBugReports: typeof BugReports !== 'undefined',
    hasTasksModule: typeof Tasks !== 'undefined',
    taskCount: BugReports?.bundle?.tasks?.length ?? 0,
    reportCount: BugReports?.bundle?.bugReports?.length ?? 0
  }));

  assert.equal(boot.version, expectedVersion, `Expected live version ${expectedVersion}, got ${boot.version}`);
  assert.equal(boot.hasBugReports, true, 'BugReports module must be available on live page');
  assert.equal(boot.hasTasksModule, true, 'Tasks module must be available on live page');

  const prepared = await page.evaluate(() => {
    const existingBundle = typeof Tasks.normalizeBundle === 'function'
      ? Tasks.normalizeBundle(Tasks.bundle || {})
      : (Tasks.bundle || {});
    const bugTasks = Array.isArray(existingBundle.tasks) ? existingBundle.tasks.map(task => ({ ...task })) : [];
    const bugReports = Array.isArray(BugReports?.bundle?.bugReports)
      ? BugReports.bundle.bugReports.map(report => ({ ...report }))
      : (Array.isArray(existingBundle.bugReports) ? existingBundle.bugReports.map(report => ({ ...report })) : []);

    let seeded = false;
    if (!bugTasks.some(task => /^\[Баг\]/i.test(String(task?.title || '')) || String(task?.type || '').trim().toLowerCase() === 'bug')) {
      const now = new Date().toISOString();
      const smokeTaskId = 990001;
      bugTasks.push({
        id: smokeTaskId,
        title: '[Баг] Другое / Другое — Smoke fallback task',
        description: 'Проблема: smoke fallback path\\n\\nОжидалось: баг уходит в done без Tasks.changeStatus',
        status: 'incoming',
        type: 'bug',
        priority: 'high',
        created_at: now,
        updated_at: now,
        created_by_name: 'Smoke',
      });
      bugReports.push({
        id: 'smoke-report-1',
        task_id: smokeTaskId,
        title: 'Smoke fallback task',
        section_key: 'general',
        section_name: 'Другое',
        subsection_key: 'other',
        subsection_name: 'Другое',
        severity: 'high',
        actual_result: 'Fallback smoke path',
        expected_result: 'Task becomes done',
        steps_to_reproduce: '1. Open bugs\\n2. Click done',
        submitted_by_name: 'Smoke',
        created_at: now,
        updated_at: now,
        synthetic: true,
      });
      seeded = true;
    }

    Tasks.bundle = (typeof Tasks.normalizeBundle === 'function'
      ? Tasks.normalizeBundle({ ...(Tasks.bundle || {}), tasks: bugTasks, bugReports })
      : { ...(Tasks.bundle || {}), tasks: bugTasks, bugReports });
    BugReports.bundle = BugReports._hydrateBundle({ ...(BugReports.bundle || {}), tasks: bugTasks, bugReports });

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
        reportId: Number(report.id),
        seeded
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
      seeded,
      buttonCount: document.querySelectorAll('.bug-report-done-btn').length
    };
  });

  assert.equal(prepared.ok, true, `Failed to prepare bug fallback smoke: ${JSON.stringify(prepared)}`);
  assert.ok(prepared.buttonCount >= 1, `Expected at least one live bug done button, got ${prepared.buttonCount}`);
  await page.evaluate(() => {
    const button = document.querySelector('.bug-report-done-btn');
    if (!button) {
      throw new Error('missing live bug done button');
    }
    button.click();
  });
  await page.waitForTimeout(500);

  const bugResult = await page.evaluate(() => window.__liveBugDoneSmoke?.state || null);
  assert.ok(bugResult, 'Expected live bug fallback state after click');
  assert.equal(bugResult.changeStatusCalled, false, 'Fallback path must not rely on Tasks.changeStatus');
  assert.equal(bugResult.saved?.status, 'done', 'Fallback path must save bug task as done');
  assert.equal(bugResult.emitted?.nextStatus, 'done', 'Fallback path must emit done task events');
  assert.equal(bugResult.emitted?.preserveSelection, false, 'Fallback path must preserve selection=false');

  await page.screenshot({
    path: path.join(outputDir, 'bugs-done-fallback.png'),
    fullPage: false
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
    fullPage: false
  });
}

async function smokeMoldsPageLoads(page) {
  await openAuthedHash(page, '#molds');

  await page.waitForFunction(() => {
    return typeof App !== 'undefined'
      && App.currentPage === 'molds'
      && typeof Molds !== 'undefined'
      && !!document.querySelector('#page-molds.active')
      && document.body.innerText.includes('Справочник бланков');
  }, null, { timeout: 30_000 });

  const moldsState = await page.evaluate(() => ({
    currentPage: App?.currentPage ?? null,
    hasActivePage: !!document.querySelector('#page-molds.active'),
    hasTitle: document.body.innerText.includes('Справочник бланков'),
    cardsMounted: !!document.getElementById('molds-cards-container'),
  }));

  assert.equal(moldsState.currentPage, 'molds', `Expected current page molds, got ${moldsState.currentPage}`);
  assert.equal(moldsState.hasActivePage, true, 'Molds page must become active on live site');
  assert.equal(moldsState.hasTitle, true, 'Molds page must render visible title on live site');
  assert.equal(moldsState.cardsMounted, true, 'Molds page must mount cards container on live site');

  await page.screenshot({
    path: path.join(outputDir, 'molds.png'),
    fullPage: false
  });
}

async function smokeMonitoringLoads(page) {
  await openAuthedHash(page, '#monitoring');

  await page.waitForFunction(() => {
    return typeof Monitoring !== 'undefined'
      && Array.isArray(Monitoring?.state?.workflows)
      && Monitoring.state.workflows.length >= 3
      && document.body.innerText.includes('Панель спокойствия')
      && document.body.innerText.includes('Deploy')
      && document.body.innerText.includes('Live smoke')
      && document.body.innerText.includes('Warehouse stress');
  }, null, { timeout: 60_000 });

  const monitoringState = await page.evaluate(() => ({
    version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : null,
    workflows: (Monitoring?.state?.workflows || []).map((item) => ({
      name: item.name,
      shortLabel: item.shortLabel,
      found: item.found,
      statusKey: item.statusKey,
      htmlUrl: item.htmlUrl
    })),
    hasTitle: document.body.innerText.includes('Панель спокойствия')
  }));

  assert.equal(monitoringState.version, expectedVersion, `Expected monitoring page on ${expectedVersion}, got ${monitoringState.version}`);
  assert.equal(monitoringState.hasTitle, true, 'Monitoring page must render title on live site');
  assert.equal(monitoringState.workflows.length >= 3, true, `Expected at least 3 monitoring workflows, got ${monitoringState.workflows.length}`);

  const requiredNames = ['Deploy GitHub Pages', 'Live site smoke', 'Warehouse stress smoke'];
  requiredNames.forEach((name) => {
    const workflow = monitoringState.workflows.find((item) => item.name === name);
    assert.ok(workflow, `Expected monitoring workflow ${name} on live site`);
    assert.ok(['success', 'running', 'warning', 'failure', 'neutral', 'missing'].includes(workflow.statusKey), `Unexpected status key for ${name}: ${workflow.statusKey}`);
  });

  await page.screenshot({
    path: path.join(outputDir, 'monitoring.png'),
    fullPage: false
  });
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const smokePages = [
    'calculator', 'orders', 'factual',
    'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'wiki', 'gantt', 'tpa',
    'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
  ];
  localStorage.setItem('ro_calc_auth_accounts', JSON.stringify([{
    id: '1772715209137',
    employee_id: 5,
    employee_name: 'Smoke',
    username: 'smoke',
    role: 'admin',
    is_active: true,
    pages: smokePages,
  }]));
  localStorage.setItem('ro_calc_employees', JSON.stringify([{
    id: 5,
    name: 'Smoke',
    role: 'admin',
    is_active: true,
  }]));
  localStorage.setItem('ro_employee_pages', JSON.stringify({ '5': smokePages }));
  window.__RO_AUTH_ACCOUNTS_LOAD_TIMEOUT_MS = 20000;
  window.__RO_REMOTE_LOAD_TIMEOUT_MS = 12000;
});
page.on('console', (msg) => {
  browserLogs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (error) => {
  browserLogs.push(`[pageerror] ${error.message}`);
});

try {
  await smokeBugDoneFallback(page);
  await smokeMoldsPageLoads(page);
  await smokeWarehouseLoads(page);
  await smokeMonitoringLoads(page);
  console.log(`live site smoke checks passed (${expectedVersion})`);
} catch (error) {
  try {
    await page.screenshot({
      path: path.join(outputDir, 'failure.png'),
      fullPage: false
    });
  } catch {
    // Ignore screenshot capture failures in error path.
  }
  if (browserLogs.length) {
    console.error('live site smoke browser logs:');
    console.error(browserLogs.slice(-80).join('\n'));
  }
  throw error;
} finally {
  await browser.close();
}

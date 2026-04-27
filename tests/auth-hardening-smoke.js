const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createTrackedClassList(element, initial = '') {
    const classes = new Set(String(initial || '').split(/\s+/).filter(Boolean));
    const sync = () => {
        element.className = Array.from(classes).join(' ');
    };
    sync();
    return {
        add(...tokens) {
            tokens.forEach(token => token && classes.add(token));
            sync();
        },
        remove(...tokens) {
            tokens.forEach(token => classes.delete(token));
            sync();
        },
        toggle(token, force) {
            if (force === true) {
                classes.add(token);
            } else if (force === false) {
                classes.delete(token);
            } else if (classes.has(token)) {
                classes.delete(token);
            } else {
                classes.add(token);
            }
            sync();
            return classes.has(token);
        },
        contains(token) {
            return classes.has(token);
        },
    };
}

function createElement(id = '') {
    return {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        checked: false,
        disabled: false,
        style: {},
        dataset: {},
        className: '',
        __clicked: false,
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
        appendChild() {},
        remove() {},
        focus() {},
        click() {
            this.__clicked = true;
        },
        setAttribute() {},
        getAttribute() { return null; },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        insertAdjacentHTML() {},
        closest() { return null; },
    };
}

function createDocument() {
    const elements = new Map();
    return {
        body: createElement('body'),
        addEventListener() {},
        createElement(tag) {
            return createElement(tag);
        },
        getElementById(id) {
            if (!elements.has(id)) {
                elements.set(id, createElement(id));
            }
            return elements.get(id);
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
    };
}

function createLocalStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}

function createContext() {
    const document = createDocument();
    const localStorage = createLocalStorage();
    const context = {
        console,
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        setTimeout,
        clearTimeout,
        document,
        localStorage,
        navigator: {
            userAgent: 'Smoke Browser',
            clipboard: { writeText() {} },
        },
        location: {
            pathname: '/ro-calculator/',
            search: '',
            hash: '#calculator',
            reload() {},
        },
        fetch: async () => ({ ok: true, json: async () => [] }),
        confirm: () => true,
        prompt: () => 'Reset#123',
        Blob: class FakeBlob {
            constructor(parts, options = {}) {
                this.parts = parts;
                this.type = options.type || '';
            }
        },
        URL: {
            createObjectURL() { return 'blob:smoke'; },
            revokeObjectURL() {},
        },
        loadEmployees: async () => clone(context.__employeesSource),
        loadAuthAccounts: async () => clone(context.__authAccountsSource),
        saveAuthAccounts: async (accounts) => {
            context.__savedAuthAccounts = clone(accounts);
            context.__authAccountsSource = clone(accounts);
        },
        loadAuthActivity: async () => clone(context.__authActivitySource),
        loadAuthSessions: async () => clone(context.__authSessionsSource),
        appendAuthActivity: async (entry) => {
            context.__appendedAuthActivity.push(clone(entry));
        },
        initSupabase() {},
        IndirectCosts: { load() {} },
        loadEmployeesForPayroll: async () => [],
        loadSettings: async () => ({}),
        saveSettings: async () => {},
        getProductionParams: () => ({}),
    };

    context.__employeesSource = [{ id: 5, name: 'Полина', role: 'admin', is_active: true }];
    context.__authAccountsSource = [];
    context.__authActivitySource = [{ id: 1, type: 'login', actor: 'Smoke', at: '2026-03-16T00:00:00.000Z' }];
    context.__authSessionsSource = [{ id: 'sess-1', actor: 'Smoke', started_at: '2026-03-16T00:00:00.000Z', duration_sec: 60 }];
    context.__savedAuthAccounts = null;
    context.__appendedAuthActivity = [];

    context.window = context;
    context.window.addEventListener = () => {};
    context.window.removeEventListener = () => {};
    context.window.crypto = {
        getRandomValues(buffer) {
            for (let i = 0; i < buffer.length; i++) buffer[i] = i + 1;
            return buffer;
        },
    };
    context.history = {
        replaceState(_state, _title, url) {
            context.__lastHistoryUrl = url;
        },
    };
    context.window.history = context.history;

    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

async function smokeHashVersioning(context) {
    const v2Hash = String(vm.runInContext(`App.hashUserPassword('polina', 'secret123')`, context));
    assert.match(v2Hash, /^v2:/);

    const v2Ok = vm.runInContext(`App.verifyUserPassword({
        username: 'polina',
        password_hash: ${JSON.stringify(v2Hash)},
        password_hash_version: 2
    }, 'secret123')`, context);
    assert.equal(v2Ok, true);

    const legacyHash = String(vm.runInContext(`App.legacyHashUserPassword('legacy', 'demo123')`, context));
    const legacyOk = vm.runInContext(`App.verifyUserPassword({
        username: 'legacy',
        password_hash: ${JSON.stringify(legacyHash)}
    }, 'demo123')`, context);
    assert.equal(legacyOk, true);
}

async function smokeSaveAuthAccount(context) {
    context.document.getElementById('auth-account-employee').value = '5';
    context.document.getElementById('auth-account-username').value = '';
    context.document.getElementById('auth-account-password').value = '';
    context.document.getElementById('auth-account-active').value = '1';
    context.document.getElementById('auth-account-form').style.display = '';
    context.document.getElementById('auth-account-delete-btn').style.display = 'none';
    context.document.getElementById('auth-accounts-table-body');
    context.document.getElementById('auth-activity-table-body');
    context.document.getElementById('auth-issued-credentials');

    await vm.runInContext(`(async () => {
        App.toast = () => {};
        App.getCurrentEmployeeName = () => 'Smoke';
        App.refreshAuthUsers = async () => {};
        Settings.authAccountsData = [];
        Settings.employeesData = await loadEmployees();
        await Settings.saveAuthAccount();
    })()`, context);

    const saved = clone(context.__savedAuthAccounts);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].password_hash_version, 2);
    assert.match(String(saved[0].password_hash || ''), /^v2:/);
    assert.match(String(saved[0].password_rotated_at || ''), /T/);
    assert.match(String(saved[0].username || ''), /_ro/);
    assert.equal(typeof context.__savedAuthAccounts[0].password_plain, 'undefined');
    const issued = clone(await vm.runInContext(`Settings.lastIssuedAuthCredentials`, context));
    assert.equal(issued.username, saved[0].username);
    assert.ok(String(issued.password || '').length >= 12);
}

async function smokeRenderSecurityState(context) {
    const modernHash = String(vm.runInContext(`App.hashUserPassword('modern', 'Secret#123')`, context));
    await vm.runInContext(`(() => {
        Settings.authAccountsData = [
            {
                id: 1,
                employee_name: 'Legacy User',
                username: 'legacy',
                password_hash: '12345',
                is_active: true,
                last_login_at: null
            },
            {
                id: 2,
                employee_name: 'Modern User',
                username: 'modern',
                password_hash: ${JSON.stringify(modernHash)},
                password_hash_version: 2,
                password_rotated_at: '2026-03-16T00:00:00.000Z',
                is_active: true,
                last_login_at: '2026-03-16T12:00:00.000Z'
            }
        ];
        Settings.renderAuthAccountsTable();
    })()`, context);

    const html = context.document.getElementById('auth-accounts-table-body').innerHTML;
    assert.match(html, /Legacy hash v1/);
    assert.match(html, /Hash v2/);
    assert.match(html, /выдать новый/);
    assert.match(html, /скрыт/);
    assert.match(html, /Сбросить/);
}

async function smokeAuthBackup(context) {
    const backup = clone(await vm.runInContext(`Settings.downloadAuthBackup()`, context));
    assert.equal(backup._meta.type, 'auth-backup');
    assert.equal(Array.isArray(backup.auth_accounts), true);
    assert.equal(Array.isArray(backup.auth_activity), true);
    assert.equal(Array.isArray(backup.auth_sessions), true);
    assert.equal(backup.auth_accounts[0].password_plain, undefined);
}

async function smokeLegacyLoginUpgrade(context) {
    const legacyHash = String(vm.runInContext(`App.legacyHashUserPassword('legacy', 'demo123')`, context));
    context.__authAccountsSource = [{
        id: 11,
        employee_id: 5,
        employee_name: 'Legacy User',
        username: 'legacy',
        password_hash: legacyHash,
        is_active: true,
        pages: ['orders'],
    }];
    context.__savedAuthAccounts = null;
    context.__appendedAuthActivity = [];
    context.__showAppCalled = false;
    context.document.getElementById('auth-user-select').value = '11';
    context.document.getElementById('auth-password').value = 'demo123';
    context.document.getElementById('auth-error');

    await vm.runInContext(`(async () => {
        App.authAccounts = await loadAuthAccounts();
        App.showApp = () => { window.__showAppCalled = true; };
        await App.login();
    })()`, context);

    const saved = clone(context.__savedAuthAccounts);
    assert.equal(context.__showAppCalled, true);
    assert.equal(saved[0].password_hash_version, 2);
    assert.match(String(saved[0].password_hash || ''), /^v2:/);
    assert.match(String(saved[0].password_rotated_at || ''), /T/);
    assert.equal(context.localStorage.getItem('ro_calc_auth_user_id'), '11');
    assert.equal(context.__appendedAuthActivity.some(entry => entry.type === 'password_hash_upgrade'), true);
}

async function smokeDisabledRestore(context) {
    context.__authAccountsSource = [{
        id: 21,
        employee_id: 5,
        employee_name: 'Disabled User',
        username: 'disabled',
        password_hash: String(vm.runInContext(`App.hashUserPassword('disabled', 'demo123')`, context)),
        password_hash_version: 2,
        is_active: false,
    }];
    context.localStorage.setItem('ro_calc_auth_user_id', '21');
    context.localStorage.setItem('ro_calc_auth_ts', String(Date.now()));

    await vm.runInContext(`(async () => {
        App.currentUser = null;
        await App.restoreAuthenticatedUser();
    })()`, context);

    assert.equal(context.localStorage.getItem('ro_calc_auth_user_id'), null);
    assert.equal(context.document.getElementById('auth-error').style.display, 'block');
    assert.match(String(context.document.getElementById('auth-error').textContent || ''), /логин отключен|данные обновились/i);
}

async function smokePermissionFallback(context) {
    const defaultOnly = vm.runInContext(`(() => {
        App.currentUser = { id: 'legacy', employee_id: null, role: 'employee', pages: null };
        return {
            orders: App.canAccess('orders'),
            settings: App.canAccess('settings'),
            warehouse: App.canAccess('warehouse'),
        };
    })()`, context);
    assert.equal(defaultOnly.orders, true);
    assert.equal(defaultOnly.settings, false);
    assert.equal(defaultOnly.warehouse, false);

    const explicitPages = vm.runInContext(`(() => {
        App.currentUser = { id: 'legacy', employee_id: null, role: 'employee', pages: ['warehouse', 'settings'] };
        return {
            settings: App.canAccess('settings'),
            warehouse: App.canAccess('warehouse'),
            orders: App.canAccess('orders'),
        };
    })()`, context);
    assert.equal(explicitPages.settings, true);
    assert.equal(explicitPages.warehouse, true);
    assert.equal(explicitPages.orders, false);
}

async function smokeAutoUsernameDedup(context) {
    const deduped = String(vm.runInContext(`(() => {
        Settings.authAccountsData = [{ id: 1, username: 'тая_ro', employee_id: 101 }];
        return Settings.getSuggestedUsernameForEmployee({ id: 202, name: 'Тая' });
    })()`, context));
    assert.equal(deduped, 'тая_ro_1');
}

async function smokePasswordResetDisclosure(context) {
    context.document.getElementById('auth-issued-credentials');
    await vm.runInContext(`(async () => {
        App.toast = () => {};
        App.getCurrentEmployeeName = () => 'Smoke';
        Settings.authAccountsData = [{
            id: 7,
            employee_id: 5,
            employee_name: 'Полина',
            username: 'polina_cherp',
            password_hash: App.hashUserPassword('polina_cherp', 'OldPass#123'),
            password_hash_version: 2,
            is_active: true,
        }];
        await Settings.resetAuthPassword(7);
    })()`, context);

    const issued = clone(await vm.runInContext(`Settings.lastIssuedAuthCredentials`, context));
    assert.equal(issued.username, 'polina_cherp');
    assert.equal(issued.mode, 'reset');
    assert.ok(String(issued.password || '').length >= 12);
    assert.match(String(context.document.getElementById('auth-issued-credentials').innerHTML || ''), /Пароль/);
}

async function smokeLogoutCleanup(context) {
    context.localStorage.setItem('ro_calc_auth_user_id', '11');
    context.localStorage.setItem('ro_calc_auth_ts', String(Date.now()));
    context.localStorage.setItem('ro_calc_auth_method', 'user');
    context.localStorage.setItem('ro_calc_editing_order_id', '123');
    context.document.getElementById('toast').textContent = 'Заказ сохранен';
    context.document.getElementById('auth-screen');
    context.document.getElementById('app-layout');
    context.document.getElementById('sidebar-user-info').textContent = 'Полина';

    await vm.runInContext(`(() => {
        App.endSessionTracking = () => {};
        App.trackAuthEvent = () => {};
        App.currentUser = { id: '11', name: 'Полина', role: 'admin' };
        App.logout();
    })()`, context);

    assert.equal(context.localStorage.getItem('ro_calc_auth_user_id'), null);
    assert.equal(context.localStorage.getItem('ro_calc_auth_ts'), null);
    assert.equal(context.localStorage.getItem('ro_calc_auth_method'), null);
    assert.equal(context.localStorage.getItem('ro_calc_editing_order_id'), null);
    assert.equal(context.document.getElementById('auth-screen').style.display, 'flex');
    assert.equal(context.document.getElementById('toast').textContent, '');
    assert.equal(context.document.getElementById('sidebar-user-info').textContent, '');
    assert.equal(context.__lastHistoryUrl, '/ro-calculator/');
}

async function smokeInitSkipsShowAppWithoutRestoredUser(context) {
    context.__showAppCalled = false;
    vm.runInContext(`(() => {
        window.__origPrepareAuthUI = App.prepareAuthUI;
        window.__origMigratePages = App._migratePagePermsToAuthAccounts;
        window.__origIsAuthenticated = App.isAuthenticated;
        window.__origRestoreAuthenticatedUser = App.restoreAuthenticatedUser;
        window.__origShowApp = App.showApp;
    })()`, context);
    await vm.runInContext(`(async () => {
        App.prepareAuthUI = async () => {};
        App._migratePagePermsToAuthAccounts = async () => {};
        App.isAuthenticated = () => true;
        App.restoreAuthenticatedUser = async () => {
            App.currentUser = null;
        };
        App.showApp = async () => {
            window.__showAppCalled = true;
        };
        await App.init();
    })()`, context);

    assert.equal(context.__showAppCalled, false);
    vm.runInContext(`(() => {
        App.prepareAuthUI = window.__origPrepareAuthUI;
        App._migratePagePermsToAuthAccounts = window.__origMigratePages;
        App.isAuthenticated = window.__origIsAuthenticated;
        App.restoreAuthenticatedUser = window.__origRestoreAuthenticatedUser;
        App.showApp = window.__origShowApp;
    })()`, context);
}

async function smokePrepareAuthUILoadsAccountsWithoutWaitingForEmployees(context) {
    context.__employeesSettled = false;
    context.__authStartedBeforeEmployeesSettled = false;
    context.__employeesSource = [{ id: 5, name: 'Полина', role: 'admin', is_active: true }];
    context.__authAccountsSource = [{
        id: '1772715209137',
        employee_name: 'Smoke User',
        username: 'smoke_user',
        is_active: true,
    }];

    context.loadEmployees = async () => new Promise((resolve) => {
        setTimeout(() => {
            context.__employeesSettled = true;
            resolve(clone(context.__employeesSource));
        }, 25);
    });
    context.loadAuthAccounts = async () => {
        context.__authStartedBeforeEmployeesSettled = context.__employeesSettled === false;
        return clone(context.__authAccountsSource);
    };

    await vm.runInContext(`App.prepareAuthUI()`, context);

    assert.equal(context.__authStartedBeforeEmployeesSettled, true, 'auth accounts should load in parallel with employees');
    assert.equal(vm.runInContext(`App.authAccounts.length`, context), 1);
    assert.match(String(context.document.getElementById('auth-user-select').innerHTML || ''), /Smoke User/);
}

async function smokeShowAppPrimesRouteShellBeforeDataReady(context) {
    const authScreen = context.document.getElementById('auth-screen');
    const appLayout = context.document.getElementById('app-layout');
    const pageOrders = context.document.getElementById('page-orders');
    const pageMolds = context.document.getElementById('page-molds');
    const navOrders = createElement('nav-orders');
    const navMolds = createElement('nav-molds');

    appLayout.classList = createTrackedClassList(appLayout);
    pageOrders.classList = createTrackedClassList(pageOrders, 'page');
    pageMolds.classList = createTrackedClassList(pageMolds, 'page');
    navOrders.classList = createTrackedClassList(navOrders);
    navMolds.classList = createTrackedClassList(navMolds);
    navOrders.dataset.page = 'orders';
    navMolds.dataset.page = 'molds';

    context.document.querySelectorAll = (selector) => {
        if (selector === '.page') return [pageOrders, pageMolds];
        if (selector === '.sidebar-nav a') return [navOrders, navMolds];
        return [];
    };
    context.location.hash = '#molds';
    context.__settingsResolved = false;
    context.__settingsWaiter = null;
    context.loadSettings = async () => new Promise((resolve) => {
        context.__settingsWaiter = () => {
            context.__settingsResolved = true;
            resolve({});
        };
    });
    context.loadTemplates = async () => [];

    vm.runInContext(`(() => {
        App.currentUser = { id: '11', name: 'Smoke', role: 'admin', pages: ['orders', 'molds'] };
        App.toast = () => {};
        App.startUpdateChecker = () => {};
        App.startSessionTracking = () => {};
        App.trackAuthEvent = () => {};
        App.initEmployeeContext = async () => {};
        App.applyNavVisibility = () => {};
        App.syncQuickBugButton = () => {};
        window.Molds = { load() {} };
    })()`, context);

    const pendingShowApp = vm.runInContext(`App.showApp()`, context);

    assert.equal(authScreen.style.display, 'none');
    assert.equal(appLayout.classList.contains('active'), true);
    assert.equal(pageMolds.classList.contains('active'), true, 'molds shell should activate before data load resolves');
    assert.equal(pageOrders.classList.contains('active'), false);
    assert.equal(navMolds.classList.contains('active'), true, 'molds nav should highlight immediately');
    assert.equal(vm.runInContext(`App.currentPage`, context), 'molds');
    assert.equal(context.__settingsResolved, false, 'route shell should activate before settings resolve');

    context.__settingsWaiter();
    await pendingShowApp;
}

async function main() {
    const context = createContext();
    runScript(context, 'js/app.js');
    runScript(context, 'js/settings.js');

    await smokeHashVersioning(context);
    await smokeSaveAuthAccount(context);
    await smokeRenderSecurityState(context);
    await smokeAuthBackup(context);
    await smokeLegacyLoginUpgrade(context);
    await smokeDisabledRestore(context);
    await smokePermissionFallback(context);
    await smokeAutoUsernameDedup(context);
    await smokePasswordResetDisclosure(context);
    await smokeLogoutCleanup(context);
    await smokeInitSkipsShowAppWithoutRestoredUser(context);
    await smokePrepareAuthUILoadsAccountsWithoutWaitingForEmployees(context);

    const routeContext = createContext();
    runScript(routeContext, 'js/app.js');
    runScript(routeContext, 'js/settings.js');
    await smokeShowAppPrimesRouteShellBeforeDataReady(routeContext);

    console.log('auth hardening smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

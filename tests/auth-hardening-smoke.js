const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
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
        location: { reload() {} },
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
    };

    context.__employeesSource = [{ id: 5, name: 'Полина', role: 'admin', is_active: true }];
    context.__authAccountsSource = [];
    context.__authActivitySource = [{ id: 1, type: 'login', actor: 'Smoke', at: '2026-03-16T00:00:00.000Z' }];
    context.__authSessionsSource = [{ id: 'sess-1', actor: 'Smoke', started_at: '2026-03-16T00:00:00.000Z', duration_sec: 60 }];
    context.__savedAuthAccounts = null;
    context.__appendedAuthActivity = [];

    context.window = context;
    context.window.crypto = {
        getRandomValues(buffer) {
            for (let i = 0; i < buffer.length; i++) buffer[i] = i + 1;
            return buffer;
        },
    };
    context.history = { replaceState() {} };
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
    context.document.getElementById('auth-account-username').value = 'polina';
    context.document.getElementById('auth-account-password').value = 'Secret#123';
    context.document.getElementById('auth-account-active').value = '1';
    context.document.getElementById('auth-account-form').style.display = '';
    context.document.getElementById('auth-account-delete-btn').style.display = 'none';
    context.document.getElementById('auth-accounts-table-body');
    context.document.getElementById('auth-activity-table-body');

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
}

async function smokeAuthBackup(context) {
    const backup = clone(await vm.runInContext(`Settings.downloadAuthBackup()`, context));
    assert.equal(backup._meta.type, 'auth-backup');
    assert.equal(Array.isArray(backup.auth_accounts), true);
    assert.equal(Array.isArray(backup.auth_activity), true);
    assert.equal(Array.isArray(backup.auth_sessions), true);
    assert.equal(backup.auth_accounts[0].password_plain, undefined);
}

async function main() {
    const context = createContext();
    runScript(context, 'js/app.js');
    runScript(context, 'js/settings.js');

    await smokeHashVersioning(context);
    await smokeSaveAuthAccount(context);
    await smokeRenderSecurityState(context);
    await smokeAuthBackup(context);

    console.log('auth hardening smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

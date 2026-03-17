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
        style: {},
        className: '',
        dataset: {},
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
        addEventListener() {},
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        focus() {},
        click() {},
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
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        querySelectorAll() { return []; },
        querySelector() { return null; },
    };
}

function createContext() {
    const document = createDocument();
    const context = {
        console,
        Math,
        Date,
        JSON,
        Intl,
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
        window: null,
        navigator: { clipboard: { writeText() {} } },
        localStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {},
        },
        loadEmployees: async () => [],
        loadAuthAccounts: async () => [],
        loadAuthActivity: async () => [],
        loadAuthSessions: async () => [],
        saveAuthAccounts: async (accounts) => {
            context.__savedAuthAccounts = clone(accounts);
        },
        appendAuthActivity: async () => {},
        App: {
            isAdmin() { return true; },
            DEFAULT_PAGES: ['orders'],
            ALL_PAGES: ['orders', 'settings'],
            getEmployeePages() { return ['orders']; },
            setEmployeePages() {},
            normalizePageList(pages) { return pages; },
            refreshAuthUsers: async () => {},
            refreshEmployees: async () => {},
            getCurrentEmployeeName() { return 'Smoke'; },
            toast() {},
        },
        saveEmployee: async () => 1,
        deleteEmployee: async () => {},
        saveAllSettings: async () => {},
        loadMolds: async () => [],
        saveMold: async () => {},
        refreshTemplatesFromMolds() {},
        IndirectCosts: { load() {} },
        formatRub(v) { return `${Math.round(parseFloat(v) || 0)} ₽`; },
        loadTimeEntries: async () => clone(context.__timeEntriesSource),
        loadSettings: async () => ({}),
        saveSetting: async () => {},
        getLocal() { return []; },
        setLocal() {},
        LOCAL_KEYS: {},
    };
    context.window = context;
    context.__savedAuthAccounts = null;
    context.__timeEntriesSource = [];
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

async function smokeEmployeeStatusAndAuthSync(context) {
    await vm.runInContext(`(() => {
        Settings.authAccountsData = [{
            id: 10,
            employee_id: 42,
            employee_name: 'Женя',
            username: 'jenya_ro',
            role: 'office',
            is_active: true,
            updated_at: '2026-03-17T00:00:00.000Z',
        }];
    })()`, context);

    const firedStatus = String(vm.runInContext(`Settings.getEmployeeEmploymentStatus({ is_active: false, fired_date: '2026-03-17' })`, context));
    const inactiveStatus = String(vm.runInContext(`Settings.getEmployeeEmploymentStatus({ is_active: false, fired_date: null })`, context));
    const activeStatus = String(vm.runInContext(`Settings.getEmployeeEmploymentStatus({ is_active: true, fired_date: null })`, context));
    assert.equal(firedStatus, 'fired');
    assert.equal(inactiveStatus, 'inactive');
    assert.equal(activeStatus, 'active');

    await vm.runInContext(`(async () => {
        await Settings.syncAuthAccountWithEmployee({
            id: 42,
            name: 'Женя Г',
            role: 'production',
            is_active: false,
        });
    })()`, context);

    const saved = clone(context.__savedAuthAccounts);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].employee_name, 'Женя Г');
    assert.equal(saved[0].role, 'production');
    assert.equal(saved[0].is_active, false);
}

async function smokeDynamicIndirectShare(context) {
    context.__timeEntriesSource = [
        { employee_id: 1772827635013, worker_name: 'Леша', date: '2026-03-05', hours: 20 },
        { employee_id: 1772827635013, worker_name: 'Леша', date: '2026-03-12', hours: 10 },
    ];
    await vm.runInContext(`(() => {
        IndirectCosts.currentMonth = '2026-03';
        IndirectCosts.timeEntries = ${JSON.stringify(context.__timeEntriesSource)};
        IndirectCosts._shareOverrides = {};
        IndirectCosts.employees = [{
            id: 1772827635013,
            name: 'Леша',
            role: 'management',
            payroll_profile: 'management_salary_with_production_allocation',
            pay_base_hours_month: 120,
            pay_white_salary: 0,
            pay_black_salary: 180000,
            is_active: true,
        }];
    })()`, context);

    const share = Number(vm.runInContext(`IndirectCosts._getEffectiveProductionShare(IndirectCosts.employees[0])`, context));
    const indirectTotal = Number(vm.runInContext(`IndirectCosts.calcEmployeeIndirectTotal()`, context));
    assert.equal(share, 25);
    assert.equal(indirectTotal, 135000);
}

async function main() {
    const context = createContext();
    runScript(context, 'js/settings.js');
    runScript(context, 'js/indirect_costs.js');
    await smokeEmployeeStatusAndAuthSync(context);
    await smokeDynamicIndirectShare(context);
    console.log('employee auth payroll smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

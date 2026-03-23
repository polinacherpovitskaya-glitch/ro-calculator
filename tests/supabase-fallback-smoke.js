const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createStorage() {
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
    const localStorage = createStorage();
    const sessionStorage = createStorage();
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
        localStorage,
        sessionStorage,
        navigator: {},
        document: {},
        location: { href: 'http://localhost' },
        __remoteCalls: [],
        __RO_REMOTE_LOAD_TIMEOUT_MS: 10,
        __RO_REMOTE_WRITE_TIMEOUT_MS: 10,
        __invalidTables: new Set(),
        __missingTables: new Set(),
        __hangingTables: new Set(),
        __settingsStore: new Map(),
    };

    context.window = context;
    context.supabase = {
        createClient() {
            function remoteError(table) {
                if (!context.__invalidTables.has(table)) return null;
                return {
                    code: '401',
                    message: 'Invalid API key',
                };
            }
            function missingTableError(table) {
                if (!context.__missingTables.has(table) && table !== 'sales_records') return null;
                return {
                    code: 'PGRST205',
                    message: `Could not find the table 'public.${table}' in the schema cache`,
                };
            }
            return {
                from(table) {
                    const state = { eqValue: null };
                    return {
                        select() {
                            return {
                                eq(_column, value) {
                                    state.eqValue = value;
                                    return {
                                        maybeSingle() {
                                            context.__remoteCalls.push({ table, action: 'maybeSingle' });
                                            if (context.__hangingTables.has(table)) {
                                                return new Promise(() => {});
                                            }
                                            if (remoteError(table)) {
                                                return Promise.resolve({ data: null, error: remoteError(table) });
                                            }
                                            if (missingTableError(table)) {
                                                return Promise.resolve({ data: null, error: missingTableError(table) });
                                            }
                                            if (table === 'settings' && state.eqValue === 'auth_accounts_json') {
                                                return new Promise(() => {});
                                            }
                                            if (table === 'settings' && context.__settingsStore.has(state.eqValue)) {
                                                return Promise.resolve({
                                                    data: { value: context.__settingsStore.get(state.eqValue) },
                                                    error: null,
                                                });
                                            }
                                            return Promise.resolve({ data: null, error: null });
                                        },
                                    };
                                },
                                order() {
                                    context.__remoteCalls.push({ table, action: 'order' });
                                    if (remoteError(table)) {
                                        return Promise.resolve({ data: null, error: remoteError(table) });
                                    }
                                    if (missingTableError(table)) {
                                        return Promise.resolve({ data: null, error: missingTableError(table) });
                                    }
                                    return Promise.resolve({ data: [], error: null });
                                },
                            };
                        },
                        async upsert(payload) {
                            context.__remoteCalls.push({ table, action: 'upsert', payload });
                            if (context.__hangingTables.has(table)) {
                                return new Promise(() => {});
                            }
                            if (remoteError(table)) {
                                return { error: remoteError(table) };
                            }
                            if (missingTableError(table)) {
                                return { error: missingTableError(table) };
                            }
                            if (table === 'settings' && payload && payload.key) {
                                context.__settingsStore.set(payload.key, payload.value);
                            }
                            return { error: null };
                        },
                    };
                },
            };
        },
    };

    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

async function main() {
    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            setLocal(LOCAL_KEYS.readyGoods, [{ id: 99, payload: 'x'.repeat(20000) }]);
            setLocal(LOCAL_KEYS.readyGoodsHistory, [{ id: 50, type: 'manual_add', qty: 3 }]);
            initSupabase();
            setLocal(LOCAL_KEYS.salesRecords, [{ id: 1, product_name: 'Smoke Sale', qty: 2 }]);
            setLocal(LOCAL_KEYS.authAccounts, [{ id: 10, username: 'fallback_user', employee_name: 'Fallback' }]);
        `, context);

        const movedReadyGoods = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.readyGoods)', context)));
        assert.equal(movedReadyGoods.length, 1);
        assert.equal(movedReadyGoods[0].id, 99);
        assert.equal(context.localStorage.getItem('ro_calc_ready_goods_stock'), null);

        const firstReadyGoods = JSON.parse(JSON.stringify(await vm.runInContext('loadReadyGoods()', context)));
        assert.equal(firstReadyGoods.length, 1);
        assert.equal(firstReadyGoods[0].id, 99);

        const readyGoodsHistory = JSON.parse(JSON.stringify(await vm.runInContext('loadReadyGoodsHistory()', context)));
        assert.equal(readyGoodsHistory.length, 1);
        assert.equal(readyGoodsHistory[0].type, 'manual_add');

        const firstLoad = JSON.parse(JSON.stringify(await vm.runInContext('loadSalesRecords()', context)));
        assert.equal(firstLoad.length, 1);
        assert.equal(firstLoad[0].product_name, 'Smoke Sale');
        assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records').length, 0);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'ready_goods').length, 0);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'ready_goods_history').length, 0);

        const readyGoodsRemote = JSON.parse(context.__settingsStore.get('ready_goods_stock_json') || '[]');
        assert.equal(readyGoodsRemote.length, 1);
        assert.equal(readyGoodsRemote[0].id, 99);

        const readyGoodsHistoryRemote = JSON.parse(context.__settingsStore.get('ready_goods_history_json') || '[]');
        assert.equal(readyGoodsHistoryRemote.length, 1);
        assert.equal(readyGoodsHistoryRemote[0].type, 'manual_add');

        const salesRecordsRemote = JSON.parse(context.__settingsStore.get('ready_goods_sales_records_json') || '[]');
        assert.equal(salesRecordsRemote.length, 1);
        assert.equal(salesRecordsRemote[0].product_name, 'Smoke Sale');

        const sourceStatus = JSON.parse(JSON.stringify(vm.runInContext('getReadyGoodsSourceStatus()', context)));
        assert.equal(sourceStatus.ready_goods.source, 'shared-settings');
        assert.equal(sourceStatus.ready_goods_history.source, 'shared-settings');
        assert.equal(sourceStatus.sales_records.source, 'shared-settings');

        const secondLoad = JSON.parse(JSON.stringify(await vm.runInContext('loadSalesRecords()', context)));
        assert.equal(secondLoad.length, 1);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records').length, 0);

        const authAccounts = JSON.parse(JSON.stringify(await vm.runInContext('loadAuthAccounts()', context)));
        assert.equal(authAccounts.length, 1);
        assert.equal(authAccounts[0].username, 'fallback_user');

        await vm.runInContext(`
            saveSalesRecords([{ id: 2, product_name: 'Saved Locally', qty: 5 }]);
        `, context);

        const savedLocal = JSON.parse(context.localStorage.getItem('ro_calc_sales_records') || '[]');
        assert.equal(savedLocal.length, 1);
        assert.equal(savedLocal[0].product_name, 'Saved Locally');
        const updatedRemoteSales = JSON.parse(context.__settingsStore.get('ready_goods_sales_records_json') || '[]');
        assert.equal(updatedRemoteSales.length, 1);
        assert.equal(updatedRemoteSales[0].product_name, 'Saved Locally');
        assert.equal(context.__remoteCalls.filter(call => call.table === 'settings' && call.action === 'upsert').length >= 3, true);
    }

    {
        const context = createContext();
        context.__invalidTables = new Set(['settings']);
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.readyGoods, [{ id: 7, product_name: 'Local only ready good', qty: 4 }]);
        `, context);

        const readyGoods = JSON.parse(JSON.stringify(await vm.runInContext('loadReadyGoods()', context)));
        assert.equal(readyGoods.length, 1);
        assert.equal(readyGoods[0].product_name, 'Local only ready good');
        const sourceStatus = JSON.parse(JSON.stringify(vm.runInContext('getReadyGoodsSourceStatus()', context)));
        assert.equal(sourceStatus.ready_goods.source, 'local-cache');
    }

    {
        const context = createContext();
        context.__invalidTables = new Set(['tasks', 'bug_reports', 'settings']);
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`
            _upsertWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, [{
                id: 101,
                task_id: 501,
                title: 'Smoke bug',
                actual_result: 'Nothing renders',
                updated_at: '2026-03-19T09:30:00.000Z'
            }], 'id')
        `, context);

        const savedBugReports = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.bugReports)', context)));
        assert.equal(savedBugReports.length, 1);
        assert.equal(savedBugReports[0].task_id, 501);
        assert.equal(vm.runInContext('_canUseWorkModuleRemote()', context), false);
        assert.equal(vm.runInContext('_hasSupabaseAccessProblem()', context), true);

        const loadedBugReports = JSON.parse(JSON.stringify(await vm.runInContext(`
            _loadWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, 'updated_at', false)
        `, context)));
        assert.equal(loadedBugReports.length, 1);
        assert.equal(loadedBugReports[0].title, 'Smoke bug');
        assert.equal(context.__remoteCalls.filter(call => call.table === 'bug_reports' && call.action === 'order').length, 0);
    }

    {
        const context = createContext();
        context.__missingTables = new Set(['bug_reports']);
        context.__settingsStore.set('bug_reports_json', JSON.stringify([
            {
                id: 1,
                task_id: 10,
                title: 'Old remote fallback bug',
                updated_at: '2026-03-18T09:00:00.000Z',
            },
        ]));
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`
            _upsertWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, [{
                id: 2,
                task_id: 20,
                title: 'Fresh local bug',
                updated_at: '2026-03-19T09:00:00.000Z'
            }], 'id')
        `, context);

        const loadedBugReports = JSON.parse(JSON.stringify(await vm.runInContext(`
            _loadWorkTableRows('bug_reports', LOCAL_KEYS.bugReports, 'updated_at', false)
        `, context)));
        assert.equal(loadedBugReports.length, 2);
        assert.equal(loadedBugReports[0].title, 'Fresh local bug');
        assert.equal(loadedBugReports[1].title, 'Old remote fallback bug');

        const persistedFallback = JSON.parse(context.__settingsStore.get('bug_reports_json') || '[]');
        assert.equal(persistedFallback.length, 2);
        assert.equal(persistedFallback.some(item => item.title === 'Fresh local bug'), true);
    }

    {
        const context = createContext();
        context.__hangingTables = new Set(['tasks', 'settings']);
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`
            _upsertWorkTableRows('tasks', LOCAL_KEYS.workTasks, [{
                id: 303,
                title: 'Timeout fallback task',
                updated_at: '2026-03-23T10:00:00.000Z'
            }], 'id')
        `, context);

        const savedTasks = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.workTasks)', context)));
        assert.equal(savedTasks.length, 1);
        assert.equal(savedTasks[0].title, 'Timeout fallback task');
        assert.equal(vm.runInContext('_canUseWorkModuleRemote()', context), false);
        assert.equal(context.__remoteCalls.some(call => call.table === 'tasks' && call.action === 'upsert'), true);
        assert.equal(context.__remoteCalls.some(call => call.table === 'settings' && call.action === 'maybeSingle'), true);
        assert.equal(context.__remoteCalls.some(call => call.table === 'settings' && call.action === 'upsert'), true);
    }

    console.log('supabase fallback smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

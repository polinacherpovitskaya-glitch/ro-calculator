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
            initSupabase();
            setLocal(LOCAL_KEYS.orderItems, [{
                id: 1,
                order_id: 9001,
                item_data: 'x'.repeat(50000),
            }]);
            setLocal(LOCAL_KEYS.settings, { version: 'persist-me' });
        `, context);

        const cachedOrderItems = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orderItems)', context)));
        assert.equal(cachedOrderItems.length, 1);
        assert.equal(cachedOrderItems[0].order_id, 9001);
        assert.equal(context.localStorage.getItem('ro_calc_order_items'), null, 'heavy shared-db cache should stay in memory instead of filling localStorage');

        const storedSettings = JSON.parse(context.localStorage.getItem('ro_calc_settings') || '{}');
        assert.equal(storedSettings.version, 'persist-me', 'lightweight local settings should still persist across reloads');
    }

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
        assert.equal(firstReadyGoods.length, 0);

        const readyGoodsHistory = JSON.parse(JSON.stringify(await vm.runInContext('loadReadyGoodsHistory()', context)));
        assert.equal(readyGoodsHistory.length, 0);

        const firstLoad = JSON.parse(JSON.stringify(await vm.runInContext('loadSalesRecords()', context)));
        assert.equal(firstLoad.length, 0);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records').length, 0);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'ready_goods').length, 0);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'ready_goods_history').length, 0);

        const readyGoodsRemote = JSON.parse(context.__settingsStore.get('ready_goods_stock_json') || '[]');
        assert.equal(readyGoodsRemote.length, 0);

        const readyGoodsHistoryRemote = JSON.parse(context.__settingsStore.get('ready_goods_history_json') || '[]');
        assert.equal(readyGoodsHistoryRemote.length, 0);

        const salesRecordsRemote = JSON.parse(context.__settingsStore.get('ready_goods_sales_records_json') || '[]');
        assert.equal(salesRecordsRemote.length, 0);

        const sourceStatus = JSON.parse(JSON.stringify(vm.runInContext('getReadyGoodsSourceStatus()', context)));
        assert.equal(sourceStatus.ready_goods.source, 'shared-settings');
        assert.equal(sourceStatus.ready_goods_history.source, 'shared-settings');
        assert.equal(sourceStatus.sales_records.source, 'shared-settings');

        const secondLoad = JSON.parse(JSON.stringify(await vm.runInContext('loadSalesRecords()', context)));
        assert.equal(secondLoad.length, 0);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records').length, 0);

        const authAccounts = JSON.parse(JSON.stringify(await vm.runInContext('loadAuthAccounts()', context)));
        assert.equal(authAccounts.length, 1);
        assert.equal(authAccounts[0].username, 'fallback_user');

        await vm.runInContext(`
            saveSalesRecords([{ id: 2, product_name: 'Saved Locally', qty: 5 }]);
        `, context);

        const savedLocal = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.salesRecords)', context)));
        assert.equal(savedLocal.length, 1);
        assert.equal(savedLocal[0].product_name, 'Saved Locally');
        assert.equal(context.localStorage.getItem('ro_calc_sales_records'), null);
        const updatedRemoteSales = JSON.parse(context.__settingsStore.get('ready_goods_sales_records_json') || '[]');
        assert.equal(updatedRemoteSales.length, 1);
        assert.equal(updatedRemoteSales[0].product_name, 'Saved Locally');
        assert.equal(context.__remoteCalls.filter(call => call.table === 'settings' && call.action === 'upsert').length >= 3, true);
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            setLocal(LOCAL_KEYS.warehouseItems, [{
                id: '501',
                name: 'Молд Петушок',
                sku: 'MOLD-CUSTOM-777',
                category: 'molds',
                mold_type: 'customer',
                linked_order_id: '777',
                linked_order_name: 'Заказ #777',
                mold_capacity_total: 1000,
                mold_capacity_used: 150,
            }]);
        `, context);

        await vm.runInContext(`
            saveWarehouseItem({
                id: 501,
                name: 'Молд Петушок',
                sku: 'MOLD-BLANK-ПЕТУШОК',
                category: 'molds',
                mold_type: 'blank',
                linked_order_id: '',
                linked_order_name: '',
                mold_capacity_total: 5000,
                mold_capacity_used: 150,
            });
        `, context);

        const updatedWarehouse = JSON.parse(JSON.stringify(await vm.runInContext('loadWarehouseItems()', context)));
        assert.equal(updatedWarehouse.length, 1, 'warehouse item save should overwrite string-id fallback row instead of duplicating');
        assert.equal(updatedWarehouse[0].id, 501);
        assert.equal(updatedWarehouse[0].mold_type, 'blank');
        assert.equal(updatedWarehouse[0].sku, 'MOLD-BLANK-ПЕТУШОК');
        assert.equal(updatedWarehouse[0].linked_order_id, '');
        assert.equal(updatedWarehouse[0].mold_capacity_total, 5000);

        await vm.runInContext('deleteWarehouseItem(501)', context);
        const afterDelete = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.warehouseItems)', context)));
        assert.equal(afterDelete.length, 0, 'warehouse delete should also remove string-id fallback row');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            setLocal(LOCAL_KEYS.warehouseItems, [{
                id: 7001,
                name: 'Карабин',
                sku: 'CR-SMOKE',
                category: 'carabiners',
                qty: 75,
                reserved_qty: 0,
                available_qty: 200,
            }]);
            setLocal(LOCAL_KEYS.warehouseReservations, [{
                id: 1,
                item_id: 7001,
                order_id: 9001,
                qty: 15,
                status: 'active',
                source: 'project_hardware',
            }]);
        `, context);

        const hydratedWarehouse = JSON.parse(JSON.stringify(await vm.runInContext('loadWarehouseItems()', context)));
        assert.equal(hydratedWarehouse.length, 1);
        assert.equal(hydratedWarehouse[0].qty, 75);
        assert.equal(hydratedWarehouse[0].reserved_qty, 15, 'warehouse load should rebuild reserved qty from live reservations');
        assert.equal(hydratedWarehouse[0].available_qty, 60, 'warehouse load should not trust stale available qty from cached item_data');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            setLocal(LOCAL_KEYS.orders, [{
                id: 9001,
                order_name: 'Legacy Local Order',
                status: 'draft',
            }]);
            setLocal(LOCAL_KEYS.orderItems, [{
                id: 1,
                order_id: '9001',
                item_number: 1,
                item_type: 'product',
                product_name: 'Legacy local item',
                quantity: 3,
            }]);
        `, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadOrder(9001)', context)));
        assert.equal(loaded.order.order_name, 'Legacy Local Order');
        assert.equal(loaded.items.length, 1, 'loadOrder should match local rows even when order_id was saved as string');
        assert.equal(loaded.items[0].product_name, 'Legacy local item');
        assert.equal(loaded.items[0].order_id, '9001');
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
        assert.equal(readyGoods.length, 0);
        const sourceStatus = JSON.parse(JSON.stringify(vm.runInContext('getReadyGoodsSourceStatus()', context)));
        assert.equal(sourceStatus.ready_goods.source, 'shared-unavailable');
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

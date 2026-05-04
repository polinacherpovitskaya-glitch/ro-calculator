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
        location: { href: 'http://localhost/', origin: 'http://localhost', protocol: 'http:' },
        __remoteCalls: [],
        __RO_REMOTE_LOAD_TIMEOUT_MS: 10,
        __RO_REMOTE_WRITE_TIMEOUT_MS: 10,
        __RO_AUTH_ACCOUNTS_LOAD_TIMEOUT_MS: 10,
        __invalidTables: new Set(),
        __missingTables: new Set(),
        __hangingTables: new Set(),
        __settingsStore: new Map(),
        __productTemplatesData: [],
        __tableRows: Object.create(null),
        App: {},
    };

    context.URL = URL;
    context.URLSearchParams = URLSearchParams;
    context.fetch = async (input) => {
        const url = String(input);
        context.__remoteCalls.push({ table: 'fetch', action: 'request', url });
        const parsed = new URL(url, 'http://localhost');
        if (parsed.pathname === '/api/bootstrap') {
            const keys = String(parsed.searchParams.get('keys') || '')
                .split(',')
                .map(key => key.trim())
                .filter(Boolean);
            if ((context.__hangingBootstrapKeys || new Set()).has(keys.join(',')) || keys.some(key => (context.__hangingBootstrapKeys || new Set()).has(key))) {
                return new Promise(() => {});
            }
            const data = {};
            if (keys.includes('orders')) data.orders = context.__bootstrapOrders || [];
            if (keys.includes('timeEntries')) data.timeEntries = context.__bootstrapTimeEntries || [];
            if (keys.includes('employees')) data.employees = context.__bootstrapEmployees || [];
            if (keys.includes('authAccounts')) data.authAccounts = context.__bootstrapAuthAccounts || [];
            if (keys.includes('factualSnapshots')) data.factualSnapshots = context.__bootstrapFactualSnapshots || {};
            if (keys.includes('warehouseItems')) data.warehouseItems = context.__bootstrapWarehouseItems || [];
            return {
                ok: true,
                async json() {
                    return { ok: true, data, errors: {} };
                },
            };
        }
        throw new Error(`Unexpected fetch ${url}`);
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
                                    if (context.__hangingTables.has(table)) {
                                        return new Promise(() => {});
                                    }
                                    if (remoteError(table)) {
                                        return Promise.resolve({ data: null, error: remoteError(table) });
                                    }
                                    if (missingTableError(table)) {
                                        return Promise.resolve({ data: null, error: missingTableError(table) });
                                    }
                                    if (table === 'product_templates') {
                                        return Promise.resolve({ data: context.__productTemplatesData, error: null });
                                    }
                                    if (Array.isArray(context.__tableRows[table])) {
                                        return Promise.resolve({ data: context.__tableRows[table], error: null });
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
                            persistTableRows(context, table, payload);
                            return { error: null };
                        },
                    };
                },
            };
        },
    };

    return vm.createContext(context);
}

function persistTableRows(context, table, payload) {
    if (table === 'settings') return;
    const rows = Array.isArray(payload) ? payload : [payload];
    const existing = Array.isArray(context.__tableRows[table]) ? context.__tableRows[table].map(row => ({ ...row })) : [];
    let nextId = existing.reduce((max, row) => Math.max(max, Number(row?.id || 0) || 0), 0);
    const keyFor = (row) => {
        if (!row || typeof row !== 'object') return '';
        if (table === 'finance_sources') return `slug:${row.slug || ''}`;
        if (table === 'finance_accounts') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_categories') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_directions') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_counterparties') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_transactions') return `legacy:${row.legacy_tx_key || ''}`;
        if (table === 'finance_rules') return `legacy:${row.legacy_id || ''}`;
        if (table === 'bank_accounts') return `bank:${row.provider || ''}:${row.external_id || ''}`;
        if (table === 'bank_transactions') return `banktx:${row.provider || ''}:${row.external_id || ''}`;
        if (table === 'legacy_finance_import_runs') return `run:${row.id || ''}`;
        if (table === 'legacy_finance_transactions') return `legacytx:${row.import_run_id || ''}:${row.legacy_transaction_id || ''}`;
        return `id:${row.id || ''}`;
    };
    const map = new Map(existing.map(row => [keyFor(row), row]));
    rows.forEach(rawRow => {
        if (!rawRow || typeof rawRow !== 'object') return;
        const row = { ...rawRow };
        const key = keyFor(row);
        const current = map.get(key);
        if (row.id == null) row.id = current?.id || ++nextId;
        map.set(key, current ? { ...current, ...row } : row);
    });
    context.__tableRows[table] = Array.from(map.values());
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

function persistTableRows(context, table, payload) {
    if (table === 'settings') return;
    const rows = Array.isArray(payload) ? payload : [payload];
    const existing = Array.isArray(context.__tableRows[table]) ? context.__tableRows[table].map(row => ({ ...row })) : [];
    let nextId = existing.reduce((max, row) => Math.max(max, Number(row?.id || 0) || 0), 0);
    const keyFor = (row) => {
        if (!row || typeof row !== 'object') return '';
        if (table === 'finance_sources') return `slug:${row.slug || ''}`;
        if (table === 'finance_accounts') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_categories') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_directions') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_counterparties') return `legacy:${row.legacy_id || ''}`;
        if (table === 'finance_transactions') return `legacy:${row.legacy_tx_key || ''}`;
        if (table === 'finance_rules') return `legacy:${row.legacy_id || ''}`;
        if (table === 'bank_accounts') return `bank:${row.provider || ''}:${row.external_id || ''}`;
        if (table === 'bank_transactions') return `banktx:${row.provider || ''}:${row.external_id || ''}`;
        if (table === 'legacy_finance_import_runs') return `run:${row.id || ''}`;
        if (table === 'legacy_finance_transactions') return `legacytx:${row.import_run_id || ''}:${row.legacy_transaction_id || ''}`;
        return `id:${row.id || ''}`;
    };
    const map = new Map(existing.map(row => [keyFor(row), row]));
    rows.forEach(rawRow => {
        if (!rawRow || typeof rawRow !== 'object') return;
        const row = { ...rawRow };
        const key = keyFor(row);
        const current = map.get(key);
        if (row.id == null) row.id = current?.id || ++nextId;
        map.set(key, current ? { ...current, ...row } : row);
    });
    context.__tableRows[table] = Array.from(map.values());
}

async function main() {
    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        assert.equal(
            vm.runInContext('getDefaultSettings().cutting_speed', context),
            300,
            'cold-start defaults should already use the fixed cutting speed so blanks do not flash old prices before settings refresh',
        );
        assert.equal(
            vm.runInContext('getDefaultSettings().indirect_costs_monthly', context),
            1900000,
            'cold-start defaults should already use the fixed indirect costs so molds do not flash stale prices before settings refresh',
        );

        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.templates, [{
                id: 321,
                name: 'Фото-бланк',
                category: 'blank',
                collection: 'Пластик',
                photo_url: 'https://example.com/photo-blank.jpg',
                pieces_per_hour_min: 42,
                pieces_per_hour_max: 42,
                pieces_per_hour_avg: 42,
                weight_grams: 18,
                width_mm: 24,
                height_mm: 18,
                depth_mm: 3,
                cost_cny: 800,
                cny_rate: 12.5,
                delivery_cost: 8000,
                mold_count: 1,
            }]);
        `, context);

        const moldsFromTemplates = JSON.parse(JSON.stringify(await vm.runInContext('loadMolds()', context)));
        assert.equal(moldsFromTemplates.length, 1);
        assert.equal(moldsFromTemplates[0].name, 'Фото-бланк');
        assert.equal(moldsFromTemplates[0].photo_url, 'https://example.com/photo-blank.jpg');
        assert.equal(moldsFromTemplates[0].pph_actual, 42);
        assert.equal(moldsFromTemplates[0].weight_grams, 18);
        assert.equal(moldsFromTemplates[0].width_mm, 24);
        assert.equal(moldsFromTemplates[0].height_mm, 18);
        assert.equal(moldsFromTemplates[0].depth_mm, 3);
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.templates, [{
                id: 501,
                name: 'NFC Звезда',
                category: 'blank',
                collection: 'NFC',
                photo_url: 'https://example.com/nfc-star.jpg',
                pieces_per_hour_avg: 25,
                weight_grams: 30,
            }]);
            localStorage.setItem('ro_calc_templates', 'x'.repeat(40000));
            localStorage.setItem('ro_calc_molds', 'x'.repeat(40000));
            _cleanupLocalStorage({ aggressive: true });
        `, context);

        assert.notEqual(context.localStorage.getItem('ro_calc_templates'), null, 'templates must stay in persistent storage during aggressive cleanup');
        assert.notEqual(context.localStorage.getItem('ro_calc_molds'), null, 'molds must stay in persistent storage during aggressive cleanup');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');

        context.supabase = {
            createClient() {
                return {
                    from(table) {
                        return {
                            select() {
                                return {
                                    order() {
                                        if (table !== 'molds') return Promise.resolve({ data: [], error: null });
                                        return Promise.resolve({
                                            data: [{
                                                id: 777,
                                                name: 'NFC Звезда',
                                                mold_data: JSON.stringify({
                                                    id: 777,
                                                    name: 'NFC Звезда',
                                                    category: 'nfc',
                                                    collection: '',
                                                    photo_url: '',
                                                    pph_actual: 0,
                                                    weight_grams: 0,
                                                    cost_cny: 800,
                                                    cny_rate: 12.5,
                                                    delivery_cost: 8000,
                                                    mold_count: 1,
                                                }),
                                            }],
                                            error: null,
                                        });
                                    },
                                };
                            },
                            delete() {
                                return { in() { return Promise.resolve({ error: null }); } };
                            },
                            upsert(payload) {
                                context.__remoteCalls.push({ table, action: 'upsert', payload });
                                return Promise.resolve({ error: null });
                            },
                        };
                    },
                };
            },
        };

        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.templates, [{
                id: 777,
                name: 'NFC Звезда',
                category: 'blank',
                collection: 'NFC',
                photo_url: 'https://example.com/nfc-star.jpg',
                pieces_per_hour_avg: 25,
                weight_grams: 30,
                cost_cny: 800,
                cny_rate: 12.5,
                delivery_cost: 8000,
                mold_count: 1,
            }]);
        `, context);

        const restoredMolds = JSON.parse(JSON.stringify(await vm.runInContext('loadMolds()', context)));
        await new Promise(resolve => setTimeout(resolve, 20));
        assert.equal(restoredMolds.length, 1);
        assert.equal(restoredMolds[0].photo_url, 'https://example.com/nfc-star.jpg');
        assert.equal(restoredMolds[0].collection, 'NFC');
        assert.equal(restoredMolds[0].pph_actual, 25);
        assert.equal(restoredMolds[0].weight_grams, 30);
        assert.equal(context.__remoteCalls.filter(call => call.table === 'molds' && call.action === 'upsert').length, 1, 'hydrated mold should be synced back to shared molds');
    }

    {
        const context = createContext();
        context.__productTemplatesData = [{
            id: 901,
            name: 'NFC Сердце',
            category: 'blank',
            collection: 'NFC',
            photo_url: 'https://example.com/nfc-heart.jpg',
            pieces_per_hour_min: 13,
            pieces_per_hour_max: 13,
            pieces_per_hour_avg: 13,
            weight_grams: 30,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            mold_count: 1,
        }];
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            initSupabase();
        `, context);

        const remoteFallbackMolds = JSON.parse(JSON.stringify(await vm.runInContext('loadMolds()', context)));
        assert.equal(remoteFallbackMolds.length, 1);
        assert.equal(remoteFallbackMolds[0].name, 'NFC Сердце');
        assert.equal(remoteFallbackMolds[0].photo_url, 'https://example.com/nfc-heart.jpg');
        assert.equal(remoteFallbackMolds[0].pph_actual, 13);
        assert.equal(remoteFallbackMolds[0].weight_grams, 30);

        const persistedTemplates = JSON.parse(context.localStorage.getItem('ro_calc_templates') || '[]');
        assert.equal(persistedTemplates.length, 1);
        assert.equal(persistedTemplates[0].photo_url, 'https://example.com/nfc-heart.jpg');
    }

    {
        const context = createContext();
        context.__productTemplatesData = [{
            id: 902,
            name: 'NFC Квадрат',
            category: 'blank',
            collection: 'NFC',
            photo_url: '',
            pieces_per_hour_min: 25,
            pieces_per_hour_max: 25,
            pieces_per_hour_avg: 25,
            weight_grams: 30,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            mold_count: 1,
        }];
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            initSupabase();
        `, context);

        const bundledPhotoMolds = JSON.parse(JSON.stringify(await vm.runInContext('loadMolds()', context)));
        assert.equal(bundledPhotoMolds.length, 1);
        assert.equal(bundledPhotoMolds[0].photo_url, 'assets/molds/nfc-square.jpg');
    }

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
        vm.runInContext(`initSupabase();`, context);
        context.__invalidTables.add('warehouse_items');
        context.__settingsStore.set('warehouse_items_json', JSON.stringify([{
            id: 8801,
            name: 'Снэпшотный карабин',
            sku: 'SNAP-CARABIN',
            category: 'hardware',
            qty: 21,
        }]));

        const snapshotWarehouse = JSON.parse(JSON.stringify(await vm.runInContext('loadWarehouseItems()', context)));
        assert.equal(snapshotWarehouse.length, 1, 'warehouse load should fall back to shared snapshot when table request fails');
        assert.equal(snapshotWarehouse[0].id, 8801);
        assert.equal(snapshotWarehouse[0].available_qty, 21);
        const cachedSnapshot = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.warehouseItems)', context)));
        assert.equal(cachedSnapshot.length, 1, 'shared warehouse snapshot should hydrate local cache');
        assert.equal(cachedSnapshot[0].sku, 'SNAP-CARABIN');
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

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.authAccounts, [{
                id: 11,
                username: 'cached_user',
                employee_name: 'Cached User',
                is_active: true,
            }]);
        `, context);

        const winner = await Promise.race([
            vm.runInContext(`loadAuthAccounts().then(rows => ({
                kind: 'resolved',
                usernames: rows.map(row => row.username)
            }))`, context),
            new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 50)),
        ]);

        assert.equal(winner.kind, 'resolved', 'auth accounts should resolve from warm local cache without waiting for remote settings');
        assert.equal(winner.usernames[0], 'cached_user');
    }

    {
        const context = createContext();
        context.__hangingTables = new Set(['settings']);
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.employees, [{
                id: 501,
                name: 'Warm Employee',
                is_active: true,
            }]);
        `, context);

        const winner = await Promise.race([
            vm.runInContext(`loadEmployees().then(rows => ({
                kind: 'resolved',
                names: rows.map(row => row.name)
            }))`, context),
            new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 50)),
        ]);

        assert.equal(winner.kind, 'resolved', 'employees should resolve from warm local cache without waiting for remote payroll extras');
        assert.equal(winner.names[0], 'Warm Employee');
    }

    {
        const context = createContext();
        context.__hangingTables = new Set(['molds']);
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.molds, [{
                id: 771,
                name: 'Теплый бланк',
                category: 'blank',
                collection: 'Пластик',
                pph_actual: 42,
                weight_grams: 18,
                cost_cny: 900,
                cny_rate: 12.5,
                delivery_cost: 3000,
                mold_count: 1
            }]);
        `, context);

        const winner = await Promise.race([
            vm.runInContext(`loadMolds().then(rows => ({
                kind: 'resolved',
                firstName: rows[0]?.name || ''
            }))`, context),
            new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 50)),
        ]);

        assert.equal(winner.kind, 'resolved', 'molds should resolve from warm local cache without hanging on remote table');
        assert.equal(winner.firstName, 'Теплый бланк');
    }

    {
        const context = createContext();
        context.__hangingTables = new Set(['orders']);
        context.__bootstrapOrders = [{
            id: 9102,
            status: 'sample',
            client_name: 'Bootstrap Order',
            created_at: '2026-04-30T10:00:00.000Z',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
        `, context);

        const winner = await Promise.race([
            vm.runInContext(`loadOrders({}).then(rows => ({
                kind: 'resolved',
                count: rows.length,
                firstClient: rows[0]?.client_name || ''
            }))`, context),
            new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 50)),
        ]);

        assert.equal(winner.kind, 'resolved', 'orders should resolve from same-origin bootstrap when remote list hangs');
        assert.equal(winner.count, 1);
        assert.equal(winner.firstClient, 'Bootstrap Order');
    }

    {
        const context = createContext();
        context.__hangingBootstrapKeys = new Set(['orders']);
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.orders, [{
                id: 501,
                status: 'sample',
                client_name: 'Warm Cached Order',
                created_at: '2026-05-02T10:00:00.000Z'
            }]);
        `, context);

        const winner = await Promise.race([
            vm.runInContext(`loadOrders({}).then(rows => ({
                kind: 'resolved',
                count: rows.length,
                firstClient: rows[0]?.client_name || ''
            }))`, context),
            new Promise(resolve => setTimeout(() => resolve({ kind: 'timeout' }), 50)),
        ]);

        assert.equal(winner.kind, 'resolved', 'orders should resolve from warm local cache without waiting for bootstrap');
        assert.equal(winner.count, 1);
        assert.equal(winner.firstClient, 'Warm Cached Order');
    }

    {
        const context = createContext();
        context.__hangingTables = new Set(['settings']);
        context.__bootstrapAuthAccounts = [{
            id: 77,
            username: 'polina_cherp',
            employee_name: 'Полина',
            password_hash: 'v2:test',
            is_active: true,
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);

        const accounts = JSON.parse(JSON.stringify(await vm.runInContext(`loadAuthAccounts()`, context)));
        assert.equal(accounts.length, 1, 'auth accounts should resolve from same-origin bootstrap when settings hang');
        assert.equal(accounts[0].username, 'polina_cherp');
    }

    {
        const context = createContext();
        context.__hangingTables = new Set(['settings']);
        context.__bootstrapFactualSnapshots = {
            '2026-04': { revenue: 123456 },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);

        const snapshots = JSON.parse(JSON.stringify(await vm.runInContext(`loadFactualSnapshots()`, context)));
        assert.equal(snapshots['2026-04'].revenue, 123456, 'factual snapshots should resolve from same-origin bootstrap when settings hang');
    }

    {
        const context = createContext();
        const staleRemoteRow = {
            id: 4242,
            name: 'Тестовый бланк',
            mold_data: JSON.stringify({
                id: 4242,
                name: 'Тестовый бланк',
                category: 'blank',
                collection: 'Пластик',
                pph_actual: 25,
                weight_grams: 10,
                cost_cny: 800,
                cny_rate: 12.5,
                delivery_cost: 3000,
                mold_count: 1,
                updated_at: '2026-04-27T10:00:00.000Z',
            }),
            updated_at: '2026-04-27T10:00:00.000Z',
        };
        context.supabase = {
            createClient() {
                return {
                    from(table) {
                        return {
                            select() {
                                return {
                                    order() {
                                        if (table === 'molds') {
                                            return Promise.resolve({ data: [staleRemoteRow], error: null });
                                        }
                                        return Promise.resolve({ data: [], error: null });
                                    },
                                };
                            },
                            delete() {
                                return { in() { return Promise.resolve({ error: null }); } };
                            },
                            upsert(payload) {
                                context.__remoteCalls.push({ table, action: 'upsert', payload });
                                if (table === 'molds') {
                                    return Promise.resolve({ error: { code: '500', message: 'write failed' } });
                                }
                                return Promise.resolve({ error: null });
                            },
                        };
                    },
                };
            },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        const saveResult = JSON.parse(JSON.stringify(await vm.runInContext(`saveMold({
            id: 4242,
            name: 'Тестовый бланк',
            category: 'blank',
            collection: 'Пластик',
            pph_actual: 110,
            weight_grams: 10,
            cost_cny: 900,
            cny_rate: 12.5,
            delivery_cost: 3000,
            mold_count: 1
        })`, context)));
        assert.equal(saveResult.remoteOk, false, 'saveMold should surface shared-db write failures');

        const mergedMolds = JSON.parse(JSON.stringify(await vm.runInContext('loadMolds()', context)));
        assert.equal(mergedMolds.length, 1);
        assert.equal(mergedMolds[0].pph_actual, 110, 'newer local mold must not be overwritten by stale shared row');
        assert.equal(mergedMolds[0].cost_cny, 900, 'loadMolds should preserve the latest local edit when shared save lags');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`saveFinanceWorkspace({
            sources: [
                { id: 'tochka_api', name: 'Точка API', kind: 'bank_api', status: 'active' }
            ],
            accounts: [
                {
                    id: 'bank_tochka_main',
                    name: 'Точка ••••6756',
                    type: 'bank',
                    owner: 'Компания',
                    source_id: 'tochka_api',
                    status: 'active',
                    external_ref: '40802810902500136756'
                }
            ],
            categories: [
                {
                    id: 'site_services',
                    name: 'Сайт и сервисы',
                    group: 'commercial',
                    bucket: 'monthly',
                    source_id: 'cash_manual',
                    mapping: 'site / services',
                    active: true
                }
            ],
            projects: [
                {
                    id: 'site',
                    name: 'Сайт',
                    type: 'channel',
                    default_income_category_id: 'site_services',
                    active: true
                }
            ],
            counterparties: [
                {
                    id: 'cp_vercel',
                    name: 'Vercel',
                    role: 'service',
                    default_project_id: 'site',
                    default_category_id: 'site_services',
                    active: true
                }
            ],
            recurringTransactions: [
                {
                    id: 'recurring_vercel',
                    active: true,
                    name: 'Vercel Pro',
                    account_id: 'bank_tochka_main',
                    kind: 'expense',
                    amount: 1800,
                    cadence: 'monthly',
                    start_date: '2026-04-29',
                    day_of_month: 29,
                    category_id: 'site_services',
                    project_id: 'site',
                    counterparty_name: 'Vercel',
                    description: 'Ежемесячная подписка',
                    note: 'USD card flow'
                }
            ]
        })`, context);

        const upserts = JSON.parse(JSON.stringify(context.__remoteCalls.filter(call => call.action === 'upsert')));
        assert.equal(upserts.some(call => call.table === 'settings' && call.payload.key === 'finance_workspace_json'), true, 'workspace JSON should still be saved');
        assert.equal(upserts.some(call => call.table === 'finance_sources'), true, 'finance sources should dual-write into relational phase1 table');
        assert.equal(upserts.some(call => call.table === 'finance_categories'), true, 'finance categories should dual-write into relational phase1 table');
        assert.equal(upserts.some(call => call.table === 'finance_directions'), true, 'finance directions should dual-write into relational phase1 table');
        assert.equal(upserts.some(call => call.table === 'finance_counterparties'), true, 'finance counterparties should dual-write into relational phase1 table');
        assert.equal(upserts.some(call => call.table === 'finance_accounts'), true, 'finance accounts should dual-write into relational phase1 table');
        assert.equal(upserts.some(call => call.table === 'finance_rules'), true, 'recurring transactions should dual-write into finance rules table');
    }

    {
        const context = createContext();
        context.__tableRows.finance_sources = [{ id: 1, slug: 'tochka_api' }];
        context.__tableRows.finance_accounts = [{ id: 2, legacy_id: 'bank_tochka_main' }];
        context.__tableRows.finance_categories = [{ id: 3, legacy_id: 'direct_hardware' }];
        context.__tableRows.finance_directions = [{ id: 4, legacy_id: 'project_recycle_object' }];
        context.__tableRows.finance_counterparties = [{ id: 5, legacy_id: 'cp_marketplaces' }];
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`saveFinanceTransactions([{
            account_id: 'bank_tochka_main',
            category_id: 'direct_hardware',
            direction_id: 'project_recycle_object',
            counterparty_id: 'cp_marketplaces',
            amount: 12500,
            amount_rub: 12500,
            currency: 'RUB',
            date: '2026-04-30',
            description: 'Фурнитура для заказа',
            external_id: 'tx_123'
        }], {
            prefix: 'manual',
            source_slug: 'tochka_api',
            imported_from: 'finance_smoke'
        })`, context);

        await vm.runInContext(`saveFinanceRules([{
            id: 'recurring_hardware',
            active: true,
            name: 'Фурнитура ежемесячно',
            account_id: 'bank_tochka_main',
            kind: 'expense',
            amount: 4500,
            cadence: 'monthly',
            start_date: '2026-04-29',
            day_of_month: 29,
            category_id: 'direct_hardware',
            project_id: 'project_recycle_object',
            description: 'Поставка фурнитуры',
            note: 'monthly'
        }])`, context);

        const financeTxUpsert = context.__remoteCalls.find(call => call.table === 'finance_transactions' && call.action === 'upsert');
        const financeRuleUpsert = context.__remoteCalls.find(call => call.table === 'finance_rules' && call.action === 'upsert');
        assert.equal(Array.isArray(financeTxUpsert?.payload), true, 'finance transaction upsert should be captured');
        assert.equal(financeTxUpsert.payload[0].source_id, 1, 'finance transactions should resolve source FK from source_slug');
        assert.equal(financeTxUpsert.payload[0].account_id, 2, 'finance transactions should resolve account FK from legacy account id');
        assert.equal(financeTxUpsert.payload[0].category_id, 3, 'finance transactions should resolve category FK from legacy category id');
        assert.equal(financeTxUpsert.payload[0].direction_id, 4, 'finance transactions should resolve direction FK from legacy direction id');
        assert.equal(financeTxUpsert.payload[0].counterparty_id, 5, 'finance transactions should resolve counterparty FK from legacy counterparty id');
        assert.equal(Array.isArray(financeRuleUpsert?.payload), true, 'finance rule upsert should be captured');
        assert.equal(financeRuleUpsert.payload[0].target_category_id, 3, 'finance rules should resolve target category FK');
        assert.equal(financeRuleUpsert.payload[0].target_direction_id, 4, 'finance rules should resolve target direction FK');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`saveTochkaSnapshot({
            synced_at: '2026-04-29T12:00:00.000Z',
            range: ['2026-04-01', '2026-04-29'],
            accounts: [{
                accountId: '40802810902500136756',
                displayName: 'Точка *6756'
            }],
            transactions: [{
                accountId: '40802810902500136756',
                direction: 'out',
                amount: 12500,
                currency: 'RUB',
                date: '2026-04-28',
                description: 'Налог',
                counterpartyName: 'ФНС'
            }]
        })`, context);

        const upserts = JSON.parse(JSON.stringify(context.__remoteCalls.filter(call => call.action === 'upsert')));
        assert.equal(upserts.some(call => call.table === 'settings' && call.payload.key === 'tochka_snapshot_json'), true, 'tochka snapshot JSON should still be saved');
        assert.equal(upserts.some(call => call.table === 'bank_sync_runs'), true, 'tochka sync should dual-write sync runs');
        assert.equal(upserts.some(call => call.table === 'bank_accounts'), true, 'tochka sync should dual-write bank accounts');
        assert.equal(upserts.some(call => call.table === 'bank_transactions'), true, 'tochka sync should dual-write bank transactions');
        assert.equal(upserts.some(call => call.table === 'finance_transactions'), true, 'tochka sync should also seed canonical finance transactions');
        const bankTxUpsert = upserts.find(call => call.table === 'bank_transactions');
        assert.equal(bankTxUpsert.payload[0].bank_account_id > 0, true, 'bank transactions should resolve bank_account_id from bank_accounts');
        assert.equal(bankTxUpsert.payload[0].finance_transaction_id > 0, true, 'bank transactions should resolve finance_transaction_id from canonical finance transactions');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`saveFintabloSnapshot({
            synced_at: '2026-04-29T12:10:00.000Z',
            range: ['2024-01-01', '2026-04-29'],
            transactions: [{
                accountId: 'fintablo_112021',
                amount: 45000,
                currency: 'RUB',
                date: '2026-04-17',
                description: 'Поступление от заказа',
                source_label: 'FinTablo'
            }]
        })`, context);

        const upserts = JSON.parse(JSON.stringify(context.__remoteCalls.filter(call => call.action === 'upsert')));
        assert.equal(upserts.some(call => call.table === 'settings' && call.payload.key === 'fintablo_snapshot_json'), true, 'fintablo snapshot JSON should still be saved');
        assert.equal(upserts.some(call => call.table === 'legacy_finance_import_runs'), true, 'fintablo snapshot should dual-write import runs');
        assert.equal(upserts.some(call => call.table === 'legacy_finance_transactions'), true, 'fintablo snapshot should dual-write legacy rows');
        assert.equal(upserts.some(call => call.table === 'finance_transactions'), true, 'fintablo snapshot should also seed canonical finance transactions');
        const legacyTxUpsert = upserts.find(call => call.table === 'legacy_finance_transactions');
        assert.equal(legacyTxUpsert.payload[0].finance_transaction_id > 0, true, 'legacy finance rows should resolve finance_transaction_id from canonical finance transactions');
    }

    console.log('supabase fallback smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

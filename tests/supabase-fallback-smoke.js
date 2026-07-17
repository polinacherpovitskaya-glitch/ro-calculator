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
        // recovery-probe (PR #152) вызывает setInterval + window.addEventListener('focus');
        // в юнит-тесте гонять его не надо → no-op (не падать и не держать процесс 12с-интервалом).
        setInterval: () => 0,
        clearInterval: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
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
        if (parsed.pathname === '/api/bootstrap' || parsed.pathname === '/data/bootstrap.json') {
            let keys = String(parsed.searchParams.get('keys') || '')
                .split(',')
                .map(key => key.trim())
                .filter(Boolean);
            if (parsed.pathname === '/data/bootstrap.json' && keys.length === 0) {
                keys = [
                    'orders',
                    'orderItems',
                    'timeEntries',
                    'employees',
                    'authAccounts',
                    'factualSnapshots',
                    'projectHardwareState',
                    'warehouseItems',
                    'shipments',
                    'chinaPurchases',
                ];
            }
            if ((context.__hangingBootstrapKeys || new Set()).has(keys.join(',')) || keys.some(key => (context.__hangingBootstrapKeys || new Set()).has(key))) {
                return new Promise(() => {});
            }
            const data = {};
            if (keys.includes('orders')) data.orders = context.__bootstrapOrders || [];
            if (keys.includes('orderItems')) data.orderItems = context.__bootstrapOrderItems || [];
            if (keys.includes('timeEntries')) data.timeEntries = context.__bootstrapTimeEntries || [];
            if (keys.includes('employees')) data.employees = context.__bootstrapEmployees || [];
            if (keys.includes('authAccounts')) data.authAccounts = context.__bootstrapAuthAccounts || [];
            if (keys.includes('factualSnapshots')) data.factualSnapshots = context.__bootstrapFactualSnapshots || {};
            if (keys.includes('projectHardwareState')) data.projectHardwareState = context.__bootstrapProjectHardwareState || {};
            if (keys.includes('warehouseItems')) data.warehouseItems = context.__bootstrapWarehouseItems || [];
            if (keys.includes('shipments')) data.shipments = context.__bootstrapShipments || [];
            if (keys.includes('chinaPurchases')) data.chinaPurchases = context.__bootstrapChinaPurchases || [];
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
                            const resolveRows = () => {
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
                            };
                            return {
                                eq(_column, value) {
                                    state.eqValue = value;
                                    return {
                                        then(resolve, reject) {
                                            context.__remoteCalls.push({ table, action: 'selectEq', column: _column, value });
                                            if (context.__hangingTables.has(table)) {
                                                return new Promise(() => {}).then(resolve, reject);
                                            }
                                            if (remoteError(table)) {
                                                return Promise.resolve({ data: null, error: remoteError(table) }).then(resolve, reject);
                                            }
                                            if (missingTableError(table)) {
                                                return Promise.resolve({ data: null, error: missingTableError(table) }).then(resolve, reject);
                                            }
                                            const rows = Array.isArray(context.__tableRows[table])
                                                ? context.__tableRows[table].filter(item => String(item?.[_column]) === String(value))
                                                : [];
                                            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                                        },
                                        catch(reject) {
                                            return this.then(undefined, reject);
                                        },
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
                                            if (Array.isArray(context.__tableRows[table])) {
                                                const row = context.__tableRows[table].find(item => String(item.id) === String(state.eqValue)) || null;
                                                return Promise.resolve({ data: row, error: null });
                                            }
                                            return Promise.resolve({ data: null, error: null });
                                        },
                                    };
                                },
                                in(column, values) {
                                    const selectedValues = new Set((Array.isArray(values) ? values : []).map(value => String(value)));
                                    const chain = {
                                        order() {
                                            return chain;
                                        },
                                        then(resolve, reject) {
                                            context.__remoteCalls.push({ table, action: 'selectIn', column, values });
                                            if (context.__hangingTables.has(table)) {
                                                return new Promise(() => {}).then(resolve, reject);
                                            }
                                            if (remoteError(table)) {
                                                return Promise.resolve({ data: null, error: remoteError(table) }).then(resolve, reject);
                                            }
                                            if (missingTableError(table)) {
                                                return Promise.resolve({ data: null, error: missingTableError(table) }).then(resolve, reject);
                                            }
                                            const rows = Array.isArray(context.__tableRows[table])
                                                ? context.__tableRows[table].filter(item => selectedValues.has(String(item?.[column])))
                                                : [];
                                            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
                                        },
                                        catch(reject) {
                                            return this.then(undefined, reject);
                                        },
                                    };
                                    return chain;
                                },
                                order() {
                                    return resolveRows();
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
                        update(fields) {
                            return {
                                eq(column, value) {
                                    context.__remoteCalls.push({ table, action: 'update', column, value, fields });
                                    if (context.__hangingTables.has(table)) {
                                        return new Promise(() => {});
                                    }
                                    if (remoteError(table)) {
                                        return Promise.resolve({ error: remoteError(table) });
                                    }
                                    if (missingTableError(table)) {
                                        return Promise.resolve({ error: missingTableError(table) });
                                    }
                                    const rows = Array.isArray(context.__tableRows[table]) ? context.__tableRows[table] : [];
                                    context.__tableRows[table] = rows.map(row => (
                                        String(row[column]) === String(value) ? { ...row, ...fields } : row
                                    ));
                                    return Promise.resolve({ error: null });
                                },
                            };
                        },
                        delete() {
                            return {
                                eq(column, value) {
                                    context.__remoteCalls.push({ table, action: 'delete', column, value });
                                    if (context.__hangingTables.has(table)) {
                                        return new Promise(() => {});
                                    }
                                    if (remoteError(table)) {
                                        return Promise.resolve({ error: remoteError(table) });
                                    }
                                    if (missingTableError(table)) {
                                        return Promise.resolve({ error: missingTableError(table) });
                                    }
                                    const rows = Array.isArray(context.__tableRows[table]) ? context.__tableRows[table] : [];
                                    context.__tableRows[table] = rows.filter(row => String(row[column]) !== String(value));
                                    return Promise.resolve({ error: null });
                                },
                            };
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
        context.__consoleWarnings = [];
        context.__consoleInfos = [];
        context.console = {
            ...console,
            warn(...args) {
                context.__consoleWarnings.push(args.map(String).join(' '));
            },
            info(...args) {
                context.__consoleInfos.push(args.map(String).join(' '));
            },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase();', context);
        context.__hangingTables.add('warehouse_reservations');

        await vm.runInContext(`saveWarehouseReservations([{
            id: 41,
            item_id: 7001,
            order_id: 9001,
            qty: 3,
            status: 'active',
            source: 'project_hardware',
        }])`, context);

        const cachedReservations = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.warehouseReservations)', context)));
        assert.equal(cachedReservations.length, 1, 'warehouse reservations timeout should still keep local snapshot');
        assert.equal(cachedReservations[0].qty, 3);
        assert.equal(
            context.__consoleWarnings.some((line) => line.includes('saveWarehouseReservations timed out')),
            false,
            'warehouse reservations timeout fallback should not emit a warning when local snapshot is kept'
        );
        assert.equal(
            context.__consoleInfos.some((line) => line.includes('saveWarehouseReservations timed out')),
            true,
            'warehouse reservations timeout fallback should remain visible as diagnostic info'
        );
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
        vm.runInContext(`initSupabase();`, context);
        context.__hangingTables.add('warehouse_items');

        await assert.rejects(
            vm.runInContext(`
                saveWarehouseItem({
                    id: 9901,
                    name: 'Новая фурнитура из Китая',
                    sku: 'CN-HARDWARE-SMOKE',
                    category: 'carabiners',
                    qty: 0,
                })
            `, context),
            /timeout \(save warehouse item|Не удалось сохранить позицию склада/,
            'warehouse item save should fail fast when the canonical stock table hangs',
        );
        const cachedWarehouse = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.warehouseItems) || []', context)));
        assert.equal(cachedWarehouse.length, 0, 'failed shared warehouse save should not pretend the stock item was saved locally');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);
        context.__hangingTables.add('shipments');

        await assert.rejects(
            vm.runInContext(`
                saveShipment({
                    id: 9902,
                    shipment_name: 'Smoke China box',
                    items: [],
                    status: 'draft',
                })
            `, context),
            /timeout \(save shipment|Не удалось сохранить приёмку/,
            'shipment save should fail fast when the canonical shipments table hangs',
        );
        const cachedShipments = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.shipments) || []', context)));
        assert.equal(cachedShipments.length, 0, 'failed shared shipment save should not pretend the receipt was saved locally');
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
        runScript(context, 'js/supabase.js');

        vm.runInContext(`
            setLocal(LOCAL_KEYS.orders, [{
                id: 9101,
                order_name: 'Semantic duplicate hardware order',
                status: 'draft',
            }]);
            setLocal(LOCAL_KEYS.orderItems, [{
                id: 9101001,
                order_id: 9101,
                item_number: 1,
                item_type: 'product',
                product_name: 'Кроссовки кастом',
                quantity: 600,
            }, {
                id: 9101100,
                order_id: 9101,
                item_number: 100,
                item_type: 'hardware',
                product_name: 'Круглый карабин с ушком · 2,3 см · серебряный',
                quantity: 600,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 701,
                hardware_warehouse_sku: 'CR-RING-HOOK',
                hardware_parent_item_index: 0,
                hardware_assembly_speed: 360,
                hardware_price_per_unit: 7.86,
                sell_price_hardware: 40,
                updated_at: '2026-05-13T20:00:00.000Z',
            }, {
                id: 9101101,
                order_id: 9101,
                item_number: 101,
                item_type: 'hardware',
                product_name: 'Соединительное кольцо · 12мм · серебряный',
                quantity: 600,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 702,
                hardware_warehouse_sku: 'RNG-12-SV',
                hardware_parent_item_index: 0,
                hardware_assembly_speed: 360,
                hardware_price_per_unit: 1.02,
                sell_price_hardware: 30,
                updated_at: '2026-05-13T20:00:00.000Z',
            }, {
                id: 9101102,
                order_id: 9101,
                item_number: 102,
                item_type: 'hardware',
                product_name: 'Круглый карабин с ушком · 2,3 см · серебряный',
                quantity: 600,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 701,
                hardware_warehouse_sku: 'CR-RING-HOOK',
                hardware_parent_item_index: 0,
                hardware_assembly_speed: 360,
                hardware_price_per_unit: 7.86,
                sell_price_hardware: 40,
                hardware_from_template: true,
                updated_at: '2026-05-13T20:05:00.000Z',
            }, {
                id: 9101103,
                order_id: 9101,
                item_number: 103,
                item_type: 'hardware',
                product_name: 'Соединительное кольцо · 12мм · серебряный',
                quantity: 600,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 702,
                hardware_warehouse_sku: 'RNG-12-SV',
                hardware_parent_item_index: 0,
                hardware_assembly_speed: 360,
                hardware_price_per_unit: 1.02,
                sell_price_hardware: 30,
                hardware_from_template: true,
                updated_at: '2026-05-13T20:05:00.000Z',
            }]);
        `, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadOrder(9101)', context)));
        assert.equal(loaded.repaired_duplicates, true, 'semantic duplicate hardware rows should be repaired on load');
        assert.equal(loaded.items.length, 3, 'loadOrder should keep product plus one row per unique hardware item');
        assert.equal(loaded.items.filter(item => item.item_type === 'hardware').length, 2);
        const cachedItems = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orderItems) || []', context)));
        assert.equal(cachedItems.filter(item => String(item.order_id) === '9101').length, 3, 'local order_items should be rewritten without duplicate hardware rows');
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#orders',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        const orderId = 1777468761780;
        context.__bootstrapOrders = [{
            id: orderId,
            order_name: 'кроссовки петрович',
            status: 'production_casting',
            updated_at: '2026-05-15T09:30:00.000Z',
        }];
        context.__bootstrapOrderItems = [{
            id: orderId * 1000 + 1,
            order_id: orderId,
            item_number: 1,
            item_type: 'product',
            product_name: 'кроссовки кастом',
            quantity: 600,
        }, {
            id: orderId * 1000 + 100,
            order_id: orderId,
            item_number: 100,
            item_type: 'hardware',
            product_name: 'Круглый карабин с ушком · 2,3 см · серебряный',
            quantity: 600,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 1771942065391,
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            setLocal(LOCAL_KEYS.orders, [{
                id: ${orderId},
                order_name: 'кроссовки петрович',
                status: 'production_casting',
                updated_at: '2026-05-14T09:30:00.000Z'
            }]);
            setLocal(LOCAL_KEYS.orderItems, []);
        `, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext(`loadOrder(${orderId})`, context)));
        assert.equal(loaded.order.order_name, 'кроссовки петрович');
        assert.equal(loaded.items.length, 2, 'calc2 static fallback loadOrder should hydrate order_items from bootstrap');
        assert.equal(loaded.items[1].item_type, 'hardware');

        const cachedItems = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orderItems) || []', context)));
        assert.equal(cachedItems.filter(item => String(item.order_id) === String(orderId)).length, 2, 'bootstrap order_items should refresh local detail cache');
    }

    {
        const context = createContext();
        context.__bootstrapProjectHardwareState = {
            checks: {},
            actual_qtys: {},
            updated_at: '2026-05-15T09:00:00.000Z',
        };
        context.__settingsStore.set('project_hardware_state_json', JSON.stringify({
            checks: { '771:501': true },
            actual_qtys: { '771:501': 40 },
            updated_at: '2026-05-15T10:00:00.000Z',
        }));
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadProjectHardwareState()', context)));
        assert.equal(loaded.checks['771:501'], true, 'live project hardware state should win over stale bootstrap');
        assert.equal(loaded.actual_qtys['771:501'], 40);
        assert.equal(
            context.__remoteCalls.some(call => call.table === 'settings' && call.action === 'maybeSingle'),
            true,
            'project hardware state should check shared settings before bootstrap fallback',
        );
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#warehouse',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        context.__bootstrapProjectHardwareState = {
            checks: { '88:601': true },
            actual_qtys: { '88:601': 100 },
            updated_at: '2026-05-15T11:00:00.000Z',
        };
        context.__hangingTables.add('settings');
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadProjectHardwareState()', context)));
        assert.equal(loaded.checks['88:601'], true, 'calc2 should still fall back to bootstrap when shared settings are unreachable');
        assert.equal(loaded.actual_qtys['88:601'], 100);
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#warehouse',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        context.__bootstrapWarehouseItems = [{
            id: 9301,
            name: 'Карабин тестовый',
            sku: 'CR-TEST',
            category: 'Карабины',
            qty: 248,
        }];
        context.__hangingTables.add('warehouse_items');
        context.__hangingTables.add('warehouse_reservations');
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.warehouseItems, []);
            localStorage.setItem('ro_calc_dirty_datasets', JSON.stringify({ warehouseItems: Date.now() }));
        `, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadWarehouseItems()', context)));
        assert.equal(loaded.length, 1, 'empty dirty local warehouse cache must not hide calc2 bootstrap warehouse items');
        assert.equal(loaded[0].name, 'Карабин тестовый');
        const dirtyMap = JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}');
        assert.equal(Boolean(dirtyMap.warehouseItems), false, 'empty dirty warehouse flag should be cleared after recovery');
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#warehouse',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.__tableRows.warehouse_items = [{
            id: 9401,
            name: 'Живой складской трос',
            sku: 'TR-LIVE',
            category: 'cables',
            item_data: JSON.stringify({
                id: 9401,
                name: 'Живой складской трос',
                sku: 'TR-LIVE',
                category: 'cables',
                qty: 245,
            }),
        }];
        context.__hangingTables.add('warehouse_reservations');
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.warehouseItems, [{
                id: 9402,
                name: 'Старый локальный склад',
                sku: 'OLD',
                category: 'cables',
                qty: 1
            }]);
            localStorage.setItem('ro_calc_dirty_datasets', JSON.stringify({ warehouseItems: Date.now() }));
        `, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadWarehouseItems()', context)));
        assert.equal(loaded.length, 1, 'calc2 should load shared warehouse even when stale local warehouse is marked dirty');
        assert.equal(loaded[0].id, 9401);
        assert.equal(loaded[0].sku, 'TR-LIVE');
        const dirtyMap = JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}');
        assert.equal(Boolean(dirtyMap.warehouseItems), false, 'successful shared warehouse load should clear stale dirty flag');
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#warehouse',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.__bootstrapWarehouseItems = [{
            id: 9602,
            name: 'Старые цепочки',
            sku: 'CH-MTL-10CM',
            category: 'chains',
            qty: 1900,
        }];
        context.__tableRows.warehouse_items = [{
            id: 9601,
            name: 'Цепочки металл 10см',
            sku: 'CH-MTL-10CM',
            category: 'chains',
            item_data: JSON.stringify({
                id: 9601,
                name: 'Цепочки металл 10см',
                sku: 'CH-MTL-10CM',
                category: 'chains',
                qty: 6500,
            }),
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase();', context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext('loadWarehouseItems()', context)));
        assert.equal(loaded.length, 1, 'calc2 warehouse should prefer live shared stock over stale static bootstrap');
        assert.equal(loaded[0].id, 9601);
        assert.equal(loaded[0].sku, 'CH-MTL-10CM');
        assert.equal(loaded[0].qty, 6500);
        assert.ok(
            context.__remoteCalls.some(call => call.table === 'warehouse_items' && call.action === 'order'),
            'calc2 warehouse must query live warehouse_items before using static bootstrap'
        );
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            localStorage.setItem('ro_calc_dirty_datasets', JSON.stringify({ warehouseItems: Date.now() }));
        `, context);

        await vm.runInContext(`
            saveWarehouseItem({
                id: 9501,
                name: 'Карабин после успешного сохранения',
                sku: 'CR-SAVED',
                category: 'hooks',
                qty: 10
            })
        `, context);

        const dirtyMap = JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}');
        assert.equal(Boolean(dirtyMap.warehouseItems), false, 'successful warehouse save must not leave calc2 pinned to local cache');
        assert.equal(context.__tableRows.warehouse_items.length, 1);
        assert.equal(context.__tableRows.warehouse_items[0].sku, 'CR-SAVED');
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
        context.__consoleErrors = [];
        context.__consoleWarnings = [];
        context.__consoleInfos = [];
        context.console = {
            ...console,
            error(...args) {
                context.__consoleErrors.push(args.map(String).join(' '));
            },
            warn(...args) {
                context.__consoleWarnings.push(args.map(String).join(' '));
            },
            info(...args) {
                context.__consoleInfos.push(args.map(String).join(' '));
            },
        };
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
        assert.equal(
            context.__consoleErrors.some((line) => line.includes('upsert tasks exception')),
            false,
            'work task write timeout fallback should not emit a console error'
        );
        assert.equal(
            context.__consoleWarnings.some((line) => line.includes('Work management remote is temporarily unavailable')),
            false,
            'work task write timeout fallback should not emit a warning'
        );
        assert.equal(
            context.__consoleInfos.some((line) => line.includes('Work management remote is temporarily unavailable')),
            true,
            'work task write timeout fallback should remain visible as diagnostic info'
        );
    }

    {
        const context = createContext();
        context.__consoleErrors = [];
        context.__consoleWarnings = [];
        context.__consoleInfos = [];
        context.console = {
            ...console,
            error(...args) {
                context.__consoleErrors.push(args.map(String).join(' '));
            },
            warn(...args) {
                context.__consoleWarnings.push(args.map(String).join(' '));
            },
            info(...args) {
                context.__consoleInfos.push(args.map(String).join(' '));
            },
        };
        context.__hangingTables = new Set(['work_assets']);
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.workAssets, [{
                id: 909,
                task_id: 303,
                kind: 'link',
                title: 'Warm local asset',
                created_at: '2026-03-23T10:00:00.000Z'
            }]);
        `, context);

        const loadedAssets = JSON.parse(JSON.stringify(await vm.runInContext(`
            _loadWorkTableRows('work_assets', LOCAL_KEYS.workAssets, 'created_at', true)
        `, context)));
        assert.equal(loadedAssets.length, 1, 'work assets timeout should resolve from local fallback');
        assert.equal(loadedAssets[0].title, 'Warm local asset');
        assert.equal(
            context.__consoleErrors.some((line) => line.includes('load work_assets exception')),
            false,
            'work assets timeout fallback should not emit a console error'
        );
        assert.equal(
            context.__consoleWarnings.some((line) => line.includes('Work management remote is temporarily unavailable')),
            false,
            'work assets timeout fallback should not emit a warning'
        );
        assert.equal(
            context.__consoleInfos.some((line) => line.includes('Work management remote is temporarily unavailable')),
            true,
            'work assets timeout fallback should remain visible as diagnostic info'
        );
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
        runScript(context, 'js/supabase.js');
        const template = vm.runInContext(`_moldToTemplate({
            id: 772,
            name: 'Отельный брелок',
            category: 'blank',
            collection: 'Аксессуары',
            pph_actual: 25,
            pph_min: 0,
            pph_max: 0,
            weight_grams: 30
        })`, context);

        assert.equal(template.pieces_per_hour, 25, 'calculator template should inherit live pph_actual from molds');
        assert.equal(template.pieces_per_hour_avg, 25, 'template average should fall back to live pph_actual');
        assert.equal(template.pieces_per_hour_display, '25', 'template picker should show live pph_actual instead of dash');
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
        context.location = {
            href: 'https://calc2.recycleobject.ru/#orders',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        context.__hangingTables = new Set(['order_items']);
        context.__bootstrapOrderItems = [{
            id: 3001,
            order_id: 7001,
            item_number: 2,
            name: 'Bootstrap item',
        }, {
            id: 3002,
            order_id: 7002,
            item_number: 1,
            name: 'Other item',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);

        const items = JSON.parse(JSON.stringify(await vm.runInContext(`loadOrderItemsByOrderIds([7001])`, context)));
        assert.equal(items.length, 1, 'static Yandex mirror should resolve order items from bootstrap');
        assert.equal(items[0].name, 'Bootstrap item');
        assert.equal(
            context.__remoteCalls.some(call => call.table === 'order_items'),
            true,
            'static Yandex mirror should try live order_items before falling back to bootstrap'
        );
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#warehouse',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        context.__tableRows.order_items = [{
            id: 4001,
            order_id: 7001,
            item_number: 1,
            product_name: 'Live item',
            item_data: JSON.stringify({
                item_type: 'hardware',
                product_name: 'Live item',
                quantity: 12,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 501,
            }),
        }];
        context.__bootstrapOrderItems = [{
            id: 3001,
            order_id: 7001,
            item_number: 1,
            product_name: 'Stale bootstrap item',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`initSupabase();`, context);

        const items = JSON.parse(JSON.stringify(await vm.runInContext(`loadOrderItemsByOrderIds([7001])`, context)));
        assert.equal(items.length, 1, 'static Yandex mirror should load order items from live proxy when available');
        assert.equal(items[0].product_name, 'Live item');
        assert.equal(items[0].hardware_warehouse_item_id, 501);
        assert.equal(
            context.__remoteCalls.some(call => call.table === 'fetch' && String(call.url).includes('orderItems')),
            false,
            'fresh live order items should not be overwritten by static bootstrap'
        );
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#calculator',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        const orderId = 1777974526025;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'бифри 100 шт юла+цветок',
            status: 'draft',
            updated_at: '2026-05-13T13:25:50.539+00:00',
        }];
        context.__tableRows.order_items = [{
            id: orderId * 1000 + 1,
            order_id: orderId,
            item_number: 1,
            product_name: 'Маленький цветочек',
            quantity: 100,
            updated_at: '2026-05-13T13:25:50.539+00:00',
            item_data: JSON.stringify({
                item_type: 'product',
                product_name: 'Маленький цветочек',
                quantity: 100,
            }),
        }];
        context.supabase = {
            createClient() {
                return {
                    from(table) {
                        return {
                            select() {
                                return {
                                    eq(column, value) {
                                        const rows = context.__tableRows[table] || [];
                                        const filtered = rows.filter(row => String(row[column]) === String(value));
                                        return {
                                            single() {
                                                context.__remoteCalls.push({ table, action: 'single', column, value });
                                                return Promise.resolve({ data: filtered[0] || null, error: filtered[0] ? null : { code: 'PGRST116', message: 'not found' } });
                                            },
                                            order(orderColumn) {
                                                context.__remoteCalls.push({ table, action: 'order', column, value, orderColumn });
                                                const sorted = filtered.slice().sort((a, b) => (Number(a[orderColumn]) || 0) - (Number(b[orderColumn]) || 0));
                                                return Promise.resolve({ data: sorted, error: null });
                                            },
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.orders, [{
                id: ${orderId},
                order_name: 'бифри 100 шт юла+цветок',
                status: 'draft',
                updated_at: '2026-05-13T10:00:00.000+00:00'
            }]);
            setLocal(LOCAL_KEYS.orderItems, [{
                id: ${orderId * 1000 + 1},
                order_id: ${orderId},
                item_number: 1,
                product_name: 'Маленький цветочек',
                quantity: 98,
                updated_at: '2026-05-13T10:00:00.000+00:00',
                item_data: JSON.stringify({ item_type: 'product', product_name: 'Маленький цветочек', quantity: 98 })
            }]);
        `, context);

        const loaded = JSON.parse(JSON.stringify(await vm.runInContext(`loadOrder(${orderId})`, context)));
        assert.equal(loaded.items.length, 1, 'static Yandex order detail should load remote items through proxy');
        assert.equal(loaded.items[0].quantity, 100, 'fresh remote order item quantity should override stale local/bootstrap cache');

        const cachedQty = vm.runInContext(`
            (getLocal(LOCAL_KEYS.orderItems) || []).find(item => String(item.order_id) === String(${orderId}))?.quantity
        `, context);
        assert.equal(cachedQty, 100, 'fresh order detail load should refresh the local cache too');
    }

    {
        const context = createContext();
        context.location = {
            href: 'https://calc2.recycleobject.ru/#import',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
            hostname: 'calc2.recycleobject.ru',
        };
        context.window.location = context.location;
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.fintabloSnapshot, {
                transactions: [{
                    id: 'ft-1',
                    date: '2026-05-01',
                    amount: 1234,
                    description: 'FinTablo row'
                }]
            });
        `, context);

        const transactions = JSON.parse(JSON.stringify(await vm.runInContext(`loadFinanceTransactions()`, context)));
        assert.equal(transactions.length, 1, 'static Yandex mirror should build finance data from snapshots');
        assert.equal(
            context.__remoteCalls.some(call => call.table === 'finance_transactions'),
            false,
            'static Yandex mirror should not call Phase 1 finance tables'
        );
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
        context.__bootstrapChinaPurchases = [{
            id: 501,
            status: 'ordered',
            name: 'NFC партия',
            supplier: 'Shenzhen NFC',
            created_at: '2026-05-01T10:00:00.000Z',
        }];
        context.__bootstrapShipments = [{
            id: 601,
            status: 'in_transit',
            name: 'Приемка NFC',
            created_at: '2026-05-02T10:00:00.000Z',
        }];
        runScript(context, 'js/supabase.js');

        const [purchases, shipments] = await Promise.all([
            vm.runInContext('loadChinaPurchases({})', context),
            vm.runInContext('loadShipments()', context),
        ]);

        assert.equal(purchases.length, 1, 'china purchases should resolve from same-origin bootstrap on calc2 mirror');
        assert.equal(purchases[0].name, 'NFC партия', 'china purchase payload should keep business fields from bootstrap');
        assert.equal(shipments.length, 1, 'shipments should resolve from same-origin bootstrap on calc2 mirror');
        assert.equal(shipments[0].name, 'Приемка NFC', 'shipment payload should keep business fields from bootstrap');
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

    {
        const context = createContext();
        context.supabase = {
            createClient() {
                return {
                    from(table) {
                        return {
                            select() {
                                return {
                                    eq() {
                                        return {
                                            maybeSingle() {
                                                context.__remoteCalls.push({ table, action: 'maybeSingle' });
                                                return Promise.resolve({
                                                    data: null,
                                                    error: { code: '500', message: 'lookup failed' },
                                                });
                                            },
                                        };
                                    },
                                };
                            },
                        };
                    },
                };
            },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        const message = await vm.runInContext(`
            saveOrder({ id: 12345, order_name: 'Broken save' }, [])
                .then(() => '')
                .catch(error => error && error.message)
        `, context);

        assert.match(message, /Не удалось проверить заказ перед сохранением/, 'saveOrder should reject instead of silently returning null');
        const cachedOrders = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orders) || []', context)));
        assert.equal(cachedOrders.length, 1, 'failed remote lookup should keep an emergency local order copy');
        assert.equal(cachedOrders[0].order_name, 'Broken save', 'emergency local order copy should keep the order payload');
        const dirtyMap = JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}');
        assert.ok(dirtyMap.orders, 'failed remote lookup should mark local orders dirty');
        assert.ok(dirtyMap.orderItems, 'failed remote lookup should mark local order items dirty');
    }

    {
        const context = createContext();
        const orderId = 777123;
        const oldItemId = orderId * 1000 + 1;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'бифри 100 шт юла+цветок',
            status: 'draft',
            deleted_at: null,
        }];
        context.__tableRows.order_items = [{
            id: oldItemId,
            order_id: orderId,
            item_number: 1,
            item_type: 'product',
            product_name: 'Старая сохраненная позиция',
            item_data: JSON.stringify({ product_name: 'Старая сохраненная позиция' }),
        }];
        context.supabase = {
            createClient() {
                return {
                    from(table) {
                        const state = {};
                        return {
                            select() {
                                return {
                                    eq(column, value) {
                                        state.eqColumn = column;
                                        state.eqValue = value;
                                        return {
                                            maybeSingle() {
                                                context.__remoteCalls.push({ table, action: 'maybeSingle', column, value });
                                                const rows = context.__tableRows[table] || [];
                                                return Promise.resolve({
                                                    data: rows.find(row => String(row[column]) === String(value)) || null,
                                                    error: null,
                                                });
                                            },
                                            then(resolve, reject) {
                                                context.__remoteCalls.push({ table, action: 'selectEq', column, value });
                                                const rows = context.__tableRows[table] || [];
                                                return Promise.resolve({
                                                    data: rows.filter(row => String(row[column]) === String(value)),
                                                    error: null,
                                                }).then(resolve, reject);
                                            },
                                        };
                                    },
                                };
                            },
                            update(fields) {
                                return {
                                    eq(column, value) {
                                        context.__remoteCalls.push({ table, action: 'update', column, value, fields });
                                        const rows = context.__tableRows[table] || [];
                                        context.__tableRows[table] = rows.map(row => (
                                            String(row[column]) === String(value) ? { ...row, ...fields } : row
                                        ));
                                        return Promise.resolve({ error: null });
                                    },
                                };
                            },
                            upsert(payload) {
                                context.__remoteCalls.push({ table, action: 'upsert', payload });
                                if (table === 'order_items') {
                                    return Promise.resolve({ error: { code: '500', message: 'insert failed' } });
                                }
                                persistTableRows(context, table, payload);
                                return Promise.resolve({ error: null });
                            },
                            delete() {
                                return {
                                    eq(column, value) {
                                        context.__remoteCalls.push({ table, action: 'delete', column, value });
                                        const rows = context.__tableRows[table] || [];
                                        context.__tableRows[table] = rows.filter(row => String(row[column]) !== String(value));
                                        return Promise.resolve({ error: null });
                                    },
                                };
                            },
                        };
                    },
                };
            },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        const message = await vm.runInContext(`
            saveOrder(
                { id: ${orderId}, order_name: 'бифри 100 шт юла+цветок', status: 'draft' },
                [{ item_number: 1, item_type: 'product', product_name: 'Новая позиция', quantity: 100 }]
            )
                .then(() => '')
                .catch(error => error && error.message)
        `, context);

        assert.match(message, /Не удалось сохранить состав заказа/, 'saveOrder should surface item-write failures');
        assert.equal(context.__tableRows.order_items.length, 1, 'failed item upsert must not wipe existing order items');
        assert.equal(context.__tableRows.order_items[0].id, oldItemId, 'old saved item should remain after failed item upsert');
        assert.equal(context.__remoteCalls.some(call => call.table === 'order_items' && call.action === 'delete'), false, 'saveOrder must not delete old items before new items are saved');
        const cachedOrders = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orders) || []', context)));
        const cachedItems = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orderItems) || []', context)));
        assert.equal(cachedOrders.some(order => String(order.id) === String(orderId)), true, 'failed item upsert should keep an emergency local order copy');
        assert.equal(cachedItems.some(item => String(item.order_id) === String(orderId) && item.product_name === 'Новая позиция'), true, 'failed item upsert should keep attempted items in local backup');
        const dirtyMap = JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}');
        assert.ok(dirtyMap.orders, 'failed item upsert should mark local orders dirty');
        assert.ok(dirtyMap.orderItems, 'failed item upsert should mark local order items dirty');
    }

    {
        const context = createContext();
        const orderId = 777125;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'NFC save with string template',
            status: 'draft',
            deleted_at: null,
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        const savedOrderId = await vm.runInContext(`
            saveOrder(
                { id: ${orderId}, order_name: 'NFC save with string template', status: 'draft' },
                [{
                    item_number: 1,
                    item_type: 'product',
                    product_name: 'NFC метка',
                    quantity: 100,
                    template_id: 'nfc-embedded-template',
                    is_nfc: true,
                    nfc_warehouse_item_id: 197
                }]
            )
        `, context);

        assert.equal(savedOrderId, orderId);
        const itemUpsert = context.__remoteCalls.find(call => call.table === 'order_items' && call.action === 'upsert');
        assert.equal(Boolean(itemUpsert), true, 'order item save should upsert rows');
        assert.equal(
            Object.prototype.hasOwnProperty.call(itemUpsert.payload[0], 'template_id'),
            false,
            'string template_id should not be sent to bigint order_items.template_id',
        );
        const savedItemData = (v => typeof v === 'string' ? JSON.parse(v) : v)(itemUpsert.payload[0].item_data);
        assert.equal(
            savedItemData.template_id,
            'nfc-embedded-template',
            'string template_id should remain in item_data for calculator restore',
        );

        context.__rowToHydrate = { ...context.__tableRows.order_items[0], template_id: null };
        const hydrated = JSON.parse(JSON.stringify(vm.runInContext('_hydrateOrderItemRow(__rowToHydrate)', context)));
        assert.equal(
            hydrated.template_id,
            'nfc-embedded-template',
            'order item hydration should restore string template_id from item_data when DB column is empty',
        );
    }

    {
        const context = createContext();
        const orderId = 777124;
        const currentItemId = orderId * 1000 + 1;
        const staleItemId = orderId * 1000 + 9;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'cleanup save',
            status: 'draft',
            deleted_at: null,
        }];
        context.__tableRows.order_items = [{
            id: currentItemId,
            order_id: orderId,
            item_number: 1,
            item_type: 'product',
            product_name: 'Старая версия позиции',
        }, {
            id: staleItemId,
            order_id: orderId,
            item_number: 9,
            item_type: 'product',
            product_name: 'Лишняя старая позиция',
        }];
        context.supabase = {
            createClient() {
                return {
                    from(table) {
                        return {
                            select() {
                                return {
                                    eq(column, value) {
                                        return {
                                            maybeSingle() {
                                                context.__remoteCalls.push({ table, action: 'maybeSingle', column, value });
                                                const rows = context.__tableRows[table] || [];
                                                return Promise.resolve({
                                                    data: rows.find(row => String(row[column]) === String(value)) || null,
                                                    error: null,
                                                });
                                            },
                                            then(resolve, reject) {
                                                context.__remoteCalls.push({ table, action: 'selectEq', column, value });
                                                const rows = context.__tableRows[table] || [];
                                                return Promise.resolve({
                                                    data: rows.filter(row => String(row[column]) === String(value)),
                                                    error: null,
                                                }).then(resolve, reject);
                                            },
                                        };
                                    },
                                };
                            },
                            update(fields) {
                                return {
                                    eq(column, value) {
                                        context.__remoteCalls.push({ table, action: 'update', column, value, fields });
                                        const rows = context.__tableRows[table] || [];
                                        context.__tableRows[table] = rows.map(row => (
                                            String(row[column]) === String(value) ? { ...row, ...fields } : row
                                        ));
                                        return Promise.resolve({ error: null });
                                    },
                                };
                            },
                            upsert(payload) {
                                context.__remoteCalls.push({ table, action: 'upsert', payload });
                                persistTableRows(context, table, payload);
                                return Promise.resolve({ error: null });
                            },
                            delete() {
                                return {
                                    eq(column, value) {
                                        context.__remoteCalls.push({ table, action: 'delete', column, value });
                                        const rows = context.__tableRows[table] || [];
                                        context.__tableRows[table] = rows.filter(row => String(row[column]) !== String(value));
                                        return Promise.resolve({ error: null });
                                    },
                                };
                            },
                        };
                    },
                };
            },
        };
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        const savedOrderId = await vm.runInContext(`
            saveOrder(
                { id: ${orderId}, order_name: 'cleanup save', status: 'draft' },
                [{ item_number: 1, item_type: 'product', product_name: 'Новая версия позиции', quantity: 100 }]
            )
        `, context);

        assert.equal(savedOrderId, orderId);
        assert.deepEqual(
            context.__tableRows.order_items.map(item => item.id).sort((a, b) => a - b),
            [currentItemId],
            'successful save should keep current item and remove stale order items',
        );
        assert.equal(context.__tableRows.order_items[0].product_name, 'Новая версия позиции');
        assert.equal(context.__remoteCalls.some(call => call.table === 'order_items' && call.action === 'delete' && call.value === staleItemId), true, 'stale item should be deleted after successful upsert');
    }

    {
        const context = createContext();
        const orderId = 1777974526025;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'бифри 100 шт юла+цветок',
            status: 'draft',
            calculator_data: JSON.stringify({
                id: orderId,
                order_name: 'бифри 100 шт юла+цветок',
                status: 'draft',
            }),
            updated_at: '2026-05-13T12:00:00.000Z',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.orders, [{
                id: ${orderId},
                order_name: 'бифри 100 шт юла+цветок',
                status: 'draft',
                updated_at: '2026-05-13T12:00:00.000Z',
            }]);
        `, context);

        await vm.runInContext(`updateOrderStatus(${orderId}, 'production_casting')`, context);

        assert.equal(context.__tableRows.orders[0].status, 'production_casting', 'remote status should be updated');
        assert.equal(
            JSON.parse(context.__tableRows.orders[0].calculator_data).status,
            'production_casting',
            'remote calculator_data status should stay in sync with board status',
        );
        const cachedOrders = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orders)', context)));
        assert.equal(cachedOrders[0].status, 'production_casting', 'successful remote status update should refresh local cache');
        assert.equal(
            JSON.parse(cachedOrders[0].calculator_data).status,
            'production_casting',
            'local calculator_data status should stay in sync with board status',
        );
        assert.equal(
            JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}').orders,
            undefined,
            'successful remote status update should not leave orders dirty',
        );
    }

    {
        const context = createContext();
        const orderId = 1777468761780;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'кроссовки петрович',
            status: 'production_casting',
            calculator_data: JSON.stringify({
                id: orderId,
                order_name: 'кроссовки петрович',
                status: 'draft',
            }),
            updated_at: '2026-05-14T14:20:00.000Z',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`
            saveOrder(
                { id: ${orderId}, order_name: 'кроссовки петрович', status: 'draft', total_revenue_plan: 252000 },
                []
            )
        `, context);

        assert.equal(
            context.__tableRows.orders[0].status,
            'production_casting',
            'stale calculator autosave must not revert a production order to draft',
        );
        assert.equal(
            JSON.parse(context.__tableRows.orders[0].calculator_data).status,
            'production_casting',
            'saved calculator_data should mirror preserved workflow status',
        );
        const cachedOrders = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orders)', context)));
        assert.equal(cachedOrders[0].status, 'production_casting', 'local backup should mirror preserved workflow status');
    }

    {
        const context = createContext();
        const orderId = 1778581363060;
        context.__tableRows.orders = [{
            id: orderId,
            order_name: 'цветы для иллан',
            status: 'production_casting',
            calculator_data: JSON.stringify({
                id: orderId,
                order_name: 'цветы для иллан',
                status: 'production_casting',
            }),
            updated_at: '2026-05-15T14:20:00.000Z',
        }];
        context.__tableRows.order_items = [{
            id: '1778581363060-product-1',
            order_id: orderId,
            item_number: 1,
            item_type: 'product',
            product_name: 'цветы для иллан',
            quantity: 100,
            item_data: JSON.stringify({
                product_name: 'цветы для иллан',
                quantity: 100,
                sell_price: 375,
            }),
            updated_at: '2026-05-15T14:20:00.000Z',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        await vm.runInContext(`
            saveOrder(
                { id: ${orderId}, order_name: 'цветы для иллан', status: 'production_casting', total_revenue_plan: 37500 },
                []
            )
        `, context);

        assert.equal(
            context.__tableRows.order_items.length,
            1,
            'empty save payload for an existing order must not delete previously saved order_items',
        );
        assert.equal(
            context.__remoteCalls.some(call => call.table === 'order_items' && call.action === 'delete'),
            false,
            'empty save payload should not issue order_items delete when existing items are present',
        );
        const cachedItems = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orderItems)', context)));
        assert.equal(cachedItems.length, 1, 'local backup should preserve existing order items after empty save payload');
        assert.equal(cachedItems[0].quantity, 100, 'preserved local item should keep full item_data fields');
    }

    {
        const context = createContext();
        const orderId = 1777974526025;
        context.location = {
            href: 'https://calc2.recycleobject.ru/#orders',
            origin: 'https://calc2.recycleobject.ru',
            protocol: 'https:',
        };
        context.__bootstrapOrders = [{
            id: orderId,
            order_name: 'бифри 100 шт юла+цветок',
            status: 'draft',
            updated_at: '2026-05-13T12:00:00.000Z',
        }];
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.orders, [{
                id: ${orderId},
                order_name: 'бифри 100 шт юла+цветок',
                status: 'production_casting',
                updated_at: '2026-05-13T13:40:00.000Z',
            }]);
        `, context);

        const loadedOrders = JSON.parse(JSON.stringify(await vm.runInContext('loadOrders({})', context)));
        assert.equal(loadedOrders[0].status, 'production_casting');

        await new Promise(resolve => setTimeout(resolve, 20));
        const cachedOrders = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.orders)', context)));
        assert.equal(cachedOrders[0].status, 'production_casting', 'older calc2 bootstrap must not overwrite a newer local status after refresh');
    }

    {
        const context = createContext();
        const orderId = 1780600000001;
        runScript(context, 'js/supabase.js');
        vm.runInContext(`
            initSupabase();
            setLocal(LOCAL_KEYS.orders, [{
                id: ${orderId},
                order_name: 'Яндекс юла',
                client_name: 'Яндекс',
                status: 'production_casting',
                created_at: '2026-06-04T08:20:00.000Z',
                updated_at: '2026-06-04T08:47:00.000Z'
            }]);
            setLocal(LOCAL_KEYS.orderItems, [{
                id: '${orderId}-product-1',
                order_id: ${orderId},
                item_number: 1,
                item_type: 'product',
                product_name: 'брелок',
                quantity: 100,
                created_at: '2026-06-04T08:20:00.000Z',
                updated_at: '2026-06-04T08:47:00.000Z'
            }]);
            localStorage.setItem('ro_calc_dirty_datasets', JSON.stringify({ orders: Date.now(), orderItems: Date.now() }));
        `, context);

        const result = JSON.parse(JSON.stringify(await vm.runInContext(`syncDirtyLocalOrders({ silent: true })`, context)));

        assert.equal(result.synced, true, 'dirty local order sync should report success');
        assert.equal(result.count, 1, 'dirty local order sync should count synced orders');
        assert.equal(context.__tableRows.orders.some(order => String(order.id) === String(orderId)), true, 'dirty local order should be upserted to remote orders');
        assert.equal(context.__tableRows.order_items.some(item => String(item.order_id) === String(orderId)), true, 'dirty local order items should be upserted to remote order_items');
        const dirtyMap = JSON.parse(context.localStorage.getItem('ro_calc_dirty_datasets') || '{}');
        assert.equal(dirtyMap.orders, undefined, 'successful dirty order sync should clear orders dirty flag');
        assert.equal(dirtyMap.orderItems, undefined, 'successful dirty order sync should clear orderItems dirty flag');
    }

    console.log('supabase fallback smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

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
    };

    context.window = context;
    context.supabase = {
        createClient() {
            return {
                from(table) {
                    return {
                        select() {
                            return {
                                eq() {
                                    return {
                                        async maybeSingle() {
                                            context.__remoteCalls.push({ table, action: 'maybeSingle' });
                                            if (table === 'sales_records') {
                                                return {
                                                    data: null,
                                                    error: {
                                                        code: 'PGRST205',
                                                        message: "Could not find the table 'public.sales_records' in the schema cache",
                                                    },
                                                };
                                            }
                                            return { data: null, error: null };
                                        },
                                    };
                                },
                            };
                        },
                        async upsert(payload) {
                            context.__remoteCalls.push({ table, action: 'upsert', payload });
                            if (table === 'sales_records') {
                                return {
                                    error: {
                                        code: 'PGRST205',
                                        message: "Could not find the table 'public.sales_records' in the schema cache",
                                    },
                                };
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
    const context = createContext();
    runScript(context, 'js/supabase.js');

    vm.runInContext(`
        setLocal(LOCAL_KEYS.readyGoods, [{ id: 99, payload: 'x'.repeat(20000) }]);
        initSupabase();
        setLocal(LOCAL_KEYS.salesRecords, [{ id: 1, product_name: 'Smoke Sale', qty: 2 }]);
    `, context);

    const movedReadyGoods = JSON.parse(JSON.stringify(vm.runInContext('getLocal(LOCAL_KEYS.readyGoods)', context)));
    assert.equal(movedReadyGoods.length, 1);
    assert.equal(movedReadyGoods[0].id, 99);
    assert.equal(context.localStorage.getItem('ro_calc_ready_goods_stock'), null);

    const firstLoad = JSON.parse(JSON.stringify(await vm.runInContext('loadSalesRecords()', context)));
    assert.equal(firstLoad.length, 1);
    assert.equal(firstLoad[0].product_name, 'Smoke Sale');
    assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records' && call.action === 'maybeSingle').length, 1);

    const cache = JSON.parse(context.sessionStorage.getItem('ro_calc_ready_goods_remote_cache') || '{}');
    assert.equal(cache.sales_records.state, false);

    const secondLoad = JSON.parse(JSON.stringify(await vm.runInContext('loadSalesRecords()', context)));
    assert.equal(secondLoad.length, 1);
    assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records' && call.action === 'maybeSingle').length, 1);

    await vm.runInContext(`
        saveSalesRecords([{ id: 2, product_name: 'Saved Locally', qty: 5 }]);
    `, context);

    const savedLocal = JSON.parse(context.localStorage.getItem('ro_calc_sales_records') || '[]');
    assert.equal(savedLocal.length, 1);
    assert.equal(savedLocal[0].product_name, 'Saved Locally');
    assert.equal(context.__remoteCalls.filter(call => call.table === 'sales_records' && call.action === 'upsert').length, 0);

    console.log('supabase fallback smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

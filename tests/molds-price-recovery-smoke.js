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

function createContext(remoteMolds = []) {
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
        window: null,
        __remoteMolds: remoteMolds,
        __moldUpserts: [],
        supabase: {
            createClient() {
                return {
                    from(table) {
                        return {
                            select() {
                                return {
                                    order() {
                                        if (table === 'molds') {
                                            return Promise.resolve({ data: context.__remoteMolds, error: null });
                                        }
                                        return Promise.resolve({ data: [], error: null });
                                    },
                                    eq() {
                                        return {
                                            maybeSingle() {
                                                return Promise.resolve({ data: null, error: null });
                                            },
                                        };
                                    },
                                };
                            },
                            upsert(payload) {
                                if (table === 'molds') {
                                    context.__moldUpserts.push(payload);
                                }
                                return Promise.resolve({ error: null });
                            },
                            delete() {
                                return Promise.resolve({ error: null });
                            },
                        };
                    },
                };
            },
        },
    };
    context.window = context;
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

    const defaultTagPrices = JSON.parse(JSON.stringify(vm.runInContext(`
        (() => {
            const mold = getDefaultMolds().find(item => item.name === 'Бланк тэг');
            return mold ? mold.custom_prices : null;
        })()
    `, context)));
    assert.ok(defaultTagPrices, 'Default molds should expose custom prices for tag blank');
    assert.equal(defaultTagPrices['50'], 185, 'Tag blank should recover historical 50-tier price');
    assert.equal(defaultTagPrices['3000'], 80, 'Tag blank should recover historical 3000-tier price');

    const defaultCirclePrices = JSON.parse(JSON.stringify(vm.runInContext(`
        (() => {
            const mold = getDefaultMolds().find(item => item.name === 'Бланк круг');
            return mold ? mold.custom_prices : null;
        })()
    `, context)));
    assert.equal(defaultCirclePrices['50'], 475, 'Circle blank should recover historical 50-tier price');
    assert.equal(defaultCirclePrices['1000'], 220, 'Circle blank should recover historical 1000-tier price');

    const preMigrationMolds = [
        { id: 2, name: 'Бланк круг', custom_prices: {}, custom_margins: {} },
        { id: 15, name: 'Новый кардхолдер', custom_prices: { 50: 1500 }, custom_margins: {} },
    ];
    context.localStorage.setItem('ro_calc_molds', JSON.stringify(preMigrationMolds));
    context.localStorage.setItem('ro_calc_molds_version', '9');

    vm.runInContext('checkMoldsVersion()', context);

    const migrated = JSON.parse(context.localStorage.getItem('ro_calc_molds') || '[]');
    const circle = migrated.find(item => Number(item.id) === 2);
    const cardholder = migrated.find(item => Number(item.id) === 15);
    assert.equal(circle.custom_prices['100'], 400, 'Migration should backfill missing historical prices');
    assert.equal(circle.custom_prices['3000'], 200, 'Migration should backfill all historical tiers');
    assert.equal(cardholder.custom_prices['50'], 1500, 'Migration must preserve existing non-empty price overrides');
    assert.equal(cardholder.custom_prices['100'], 945, 'Migration should fill missing tiers for aliased names');
    assert.equal(context.localStorage.getItem('ro_calc_molds_version'), '10', 'Migration should bump molds version');

    const remoteContext = createContext([
        {
            id: 2,
            name: 'Бланк круг',
            mold_data: JSON.stringify({ id: 2, name: 'Бланк круг', custom_prices: {} }),
            updated_at: '2026-02-01T10:00:00.000Z',
        },
    ]);
    runScript(remoteContext, 'js/supabase.js');
    vm.runInContext('initSupabase()', remoteContext);
    const remoteLoaded = JSON.parse(JSON.stringify(await vm.runInContext('loadMolds()', remoteContext)));
    assert.equal(remoteLoaded[0].custom_prices['50'], 475, 'Remote molds should also recover historical prices');
    assert.ok(remoteContext.__moldUpserts.length > 0, 'Remote repair should write recovered custom_prices back to Supabase');

    console.log('molds price recovery smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

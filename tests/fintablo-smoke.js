const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id = '') {
    return {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        scrollIntoView() {},
    };
}

function createDocument() {
    const elements = new Map();
    return {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
    };
}

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
        URL,
        document,
        localStorage: createStorage(),
        __savedImports: [],
        __fetchHandlers: [],
        fetch: async (url) => {
            const next = context.__fetchHandlers.shift();
            if (typeof next === 'function') return next(url);
            return { ok: true, status: 200, json: async () => ({ status: 200, items: [] }) };
        },
        loadOrders: async () => [],
        saveFintabloImport: async (payload) => {
            context.__savedImports.push(payload);
            return 1;
        },
        formatRub(value) {
            const num = Number(value) || 0;
            return `${num.toLocaleString('ru-RU')} ₽`;
        },
        App: {
            toast() {},
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

function smokeExtractSplitAllocations(context) {
    const allocations = vm.runInContext(`FinTablo._extractSplitAllocations(${JSON.stringify(
        'Счет ... 303 - доставка точка 626 - диденок образцы спорт 953 (476+477) - образцы для сплат кардхолдер 853 - лемана про образцы'
    )})`, context);

    assert.equal(Array.isArray(allocations), true);
    assert.equal(allocations.length, 4);
    assert.deepEqual(
        JSON.parse(JSON.stringify(allocations)),
        [
            { amount: 303, label: 'доставка точка' },
            { amount: 626, label: 'диденок образцы спорт' },
            { amount: 953, label: 'образцы для сплат кардхолдер' },
            { amount: 853, label: 'лемана про образцы' },
        ]
    );
}

function smokeBuildImportUsesOnlyOrderSplit(context) {
    const result = vm.runInContext(`(() => {
        FinTablo._categories = {};
        return FinTablo._buildImportData(
            { id: 77, order_name: 'Сплат кардхолдеры' },
            { id: 501, name: 'Сплат кардхолдеры' },
            [
                {
                    group: 'outcome',
                    value: 30000,
                    description: 'Счет на оплату ... 303 - доставка точка 626 - диденок образцы спорт 953 (476+477) - образцы для сплат кардхолдер 853 - лемана про образцы',
                    categoryId: 0,
                },
                {
                    group: 'outcome',
                    value: 19620,
                    description: 'Оплата счета №60 от 13.03.2026, без НДС',
                    categoryId: 0,
                }
            ]
        );
    })()`, context);

    assert.equal(result.fact_total, 20573);
    assert.equal(result.fact_other, 20573);
    assert.equal(result.raw_data.splitApplied, true);
  }

function smokeBuildImportKeepsFullIncomeForAttachedDeal(context) {
    const result = vm.runInContext(`(() => {
        FinTablo._categories = {};
        return FinTablo._buildImportData(
            { id: 501, order_name: 'Карабины ту-ту' },
            { id: 77, name: 'Карабины ту-ту' },
            [
                {
                    group: 'income',
                    value: 75600,
                    description: 'Оплата по сделке, деньги пришли и прикреплены к этой сделке',
                    categoryId: 0,
                }
            ]
        );
    })()`, context);

    assert.equal(result.fact_revenue, 75600);
    assert.equal(result.fact_total, 0);
}

function smokeRenderDetailShowsAllocatedValue(context) {
    vm.runInContext(`(() => {
        FinTablo._categories = {};
        FinTablo._matchMap = {
            501: { id: 77, order_name: 'Сплат кардхолдеры' }
        };
        FinTablo._renderDetail(
            { id: 501, name: 'Сплат кардхолдеры' },
            [
                {
                    group: 'outcome',
                    value: 30000,
                    description: 'Счет на оплату ... 303 - доставка точка 626 - диденок образцы спорт 953 (476+477) - образцы для сплат кардхолдер 853 - лемана про образцы',
                    categoryId: 0,
                    date: '2026-02-16',
                    timestamp: 100,
                }
            ]
        );
    })()`, context);

    const html = context.document.getElementById('ft-detail-content').innerHTML;
    assert.ok(html.includes('953 ₽'), 'detail should show allocated amount for the current order');
    assert.ok(html.includes('из 30\u00a0000 ₽') || html.includes('из 30 000 ₽'), 'detail should keep original transaction amount as reference');
    assert.ok(html.includes('953 ₽</span></div>') || html.includes('953 ₽'), 'summary total should use allocated amount');
}

async function smokeAutoSyncMatchedImports(context) {
    context.localStorage.setItem('ro_fintablo_api_key', 'test-key');
    context.__fetchHandlers = [
        async () => ({ ok: true, status: 200, json: async () => ({ status: 200, items: [{ id: 77, name: 'Карабины ту-ту', amount: 75600 }] }) }),
        async () => ({ ok: true, status: 200, json: async () => ({ status: 200, items: [] }) }),
        async () => ({ ok: true, status: 200, json: async () => ({ status: 200, items: [] }) }),
        async () => ({ ok: true, status: 200, json: async () => ({
            status: 200,
            items: [
                { group: 'income', value: 75600, description: 'Поступление по сделке', categoryId: 0 },
            ],
        }) }),
    ];

    context.loadOrders = async () => [
        { id: 501, order_name: 'Карабины ту-ту' },
    ];

    const result = await vm.runInContext(`FinTablo.autoSyncMatchedImports({ force: true, silent: true })`, context);

    assert.equal(result.synced, 1);
    assert.equal(context.__savedImports.length, 1);
    assert.equal(context.__savedImports[0].fact_revenue, 75600);
}

async function main() {
    const context = createContext();
    runScript(context, 'js/fintablo.js');

    smokeExtractSplitAllocations(context);
    smokeBuildImportUsesOnlyOrderSplit(context);
    smokeBuildImportKeepsFullIncomeForAttachedDeal(context);
    smokeRenderDetailShowsAllocatedValue(context);
    await smokeAutoSyncMatchedImports(context);

    console.log('fintablo-smoke: ok');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

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
        document,
        localStorage: createStorage(),
        fetch: async () => ({ ok: true, status: 200, json: async () => ({ status: 200, items: [] }) }),
        loadOrders: async () => [],
        saveFintabloImport: async () => 1,
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

function main() {
    const context = createContext();
    runScript(context, 'js/fintablo.js');

    smokeExtractSplitAllocations(context);
    smokeBuildImportUsesOnlyOrderSplit(context);
    smokeRenderDetailShowsAllocatedValue(context);

    console.log('fintablo-smoke: ok');
}

main();

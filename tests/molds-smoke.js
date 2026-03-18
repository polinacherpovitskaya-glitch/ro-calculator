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
        src: '',
        files: [],
        classList: {
            add() {},
            remove() {},
            toggle() {},
            contains() { return false; },
        },
        appendChild() {},
        remove() {},
        focus() {},
        click() {},
        closest() { return null; },
        setAttribute() {},
        getAttribute() { return null; },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        insertAdjacentHTML() {},
        scrollIntoView() {},
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
        querySelector() { return null; },
        querySelectorAll() { return []; },
    };
}

function createContext() {
    const document = createDocument();
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
        window: null,
        formatRub(value) {
            return `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
        },
        round2(value) {
            return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
        },
        App: {
            toast() {},
            params: {},
        },
        loadMolds: async () => [],
        refreshTemplatesFromMolds() {},
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
    runScript(context, 'js/molds.js');

    [
        'hw-blank-wh-search',
        'hw-blank-wh-dropdown',
        'hw-blank-notes',
        'hw-blank-name',
        'hw-blank-price-rub',
        'hw-blank-photo',
        'hw-blank-wh-id',
        'hw-blank-china-id',
        'hw-blank-selected',
        'hw-blank-selected-name',
        'hw-blank-selected-info',
        'hw-blank-photo-preview',
    ].forEach(id => context.document.getElementById(id));

    vm.runInContext(`
        Molds.recalcHwCost = () => {};
        Molds._warehouseHwItems = [{
            id: 501,
            name: 'Карабин',
            sku: 'CRB-501',
            size: '5 см',
            color: 'черный',
            category: 'chains',
            price_per_unit: 10,
            photo_thumbnail: 'https://example.com/hw.jpg',
        }];
        document.getElementById('hw-blank-wh-search').value = 'CRB-501';
    `, context);

    vm.runInContext(`Molds.searchHwWarehouse()`, context);
    const dropdownHtml = String(context.document.getElementById('hw-blank-wh-dropdown').innerHTML || '');
    assert.match(dropdownHtml, /CRB-501/);
    assert.match(dropdownHtml, /Карабин/);
    assert.match(dropdownHtml, /5 см/);

    vm.runInContext(`Molds.selectHwWarehouseItem(501)`, context);
    assert.equal(context.document.getElementById('hw-blank-wh-id').value, 501);
    assert.match(String(context.document.getElementById('hw-blank-selected-info').textContent || ''), /Артикул: CRB-501/);
    assert.match(String(context.document.getElementById('hw-blank-selected-info').textContent || ''), /10 ₽/);

    console.log('molds smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

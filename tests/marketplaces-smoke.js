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
        checked: false,
        disabled: false,
        style: {},
        dataset: {},
        className: '',
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
            if (!elements.has(id)) {
                elements.set(id, createElement(id));
            }
            return elements.get(id);
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
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
        localStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {},
        },
        navigator: { clipboard: { writeText() {} } },
        confirm: () => true,
        prompt: () => '',
        formatRub(value) {
            return `${Number(value || 0).toLocaleString('ru-RU')} ₽`;
        },
        round2(value) {
            return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
        },
        App: {
            toast() {},
            escHtml(value) { return String(value || ''); },
        },
        loadMarketplaceSets: async () => [],
        loadMolds: async () => [],
        loadHwBlanks: async () => [],
        loadPkgBlanks: async () => [],
        loadWarehouseItems: async () => [],
        loadWarehouseReservations: async () => [],
        loadColors: async () => [],
        saveMarketplaceSet: async () => {},
        deleteMarketplaceSet: async () => {},
        ChinaCatalog: { _cnyRate: 12.5 },
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
    runScript(context, 'js/warehouse.js');
    runScript(context, 'js/marketplaces.js');

    context.document.getElementById('mp-plastic-items');
    context.document.getElementById('mp-hw-items');
    context.document.getElementById('mp-pkg-items');

    vm.runInContext(`
        Marketplaces._plasticItems = [];
        Marketplaces._hwCatalog = [{
            id: 101,
            name: 'Карабин каталог',
            sell_price: 25,
            warehouse_item_id: 501,
            assembly_speed: 120,
            photo_url: '',
        }];
        Marketplaces._pkgCatalog = [{
            id: 201,
            name: 'Конверт каталог',
            price_per_unit: 7,
            delivery_per_unit: 1,
            warehouse_item_id: 601,
            assembly_speed: 90,
            photo_url: '',
        }];
        Marketplaces._allWarehouseHw = [{
            id: 501,
            category: 'chains',
            name: 'Карабин черный',
            sku: 'CRB-501',
            size: '5 см',
            color: 'черный',
            qty: 12,
            available_qty: 7,
            unit: 'шт',
            price_per_unit: 10,
            photo_thumbnail: 'https://example.com/hw.jpg',
        }];
        Marketplaces._allWarehousePkg = [{
            id: 601,
            category: 'packaging',
            name: 'Конверт',
            sku: 'ENV-150x90',
            size: '15x9',
            color: 'калька',
            qty: 30,
            available_qty: 22,
            unit: 'шт',
            price_per_unit: 5,
            photo_thumbnail: 'https://example.com/pkg.jpg',
        }];
        Marketplaces._hwItems = [{
            source: 'catalog',
            blank_id: 101,
            wh_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            qty: 1,
            name: '',
            cost_per_unit: 0,
            assembly_speed: 120,
        }];
        Marketplaces._pkgItems = [{
            source: 'catalog',
            blank_id: 201,
            wh_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            qty: 1,
            name: '',
            cost_per_unit: 0,
            assembly_speed: 90,
        }];
        Marketplaces.renderColorVariants = () => {};
        Marketplaces.recalcSet = () => {};
        Marketplaces.renderFormItems();
    `, context);

    const hwHtml = String(context.document.getElementById('mp-hw-items').innerHTML || '');
    const pkgHtml = String(context.document.getElementById('mp-pkg-items').innerHTML || '');

    assert.match(hwHtml, /wh-img-picker/);
    assert.match(hwHtml, /CRB-501/);
    assert.match(hwHtml, /Каталог/);
    assert.match(hwHtml, /Склад/);
    assert.match(hwHtml, /Поиск по названию или артикулу/);
    assert.match(pkgHtml, /ENV-150x90/);
    assert.match(pkgHtml, /каталог/);
    assert.match(pkgHtml, /склад/);

    vm.runInContext(`Marketplaces._selectHw(0, 'warehouse:501')`, context);
    const hwState = vm.runInContext(`JSON.stringify(Marketplaces._hwItems[0])`, context);
    const hwItem = JSON.parse(hwState);
    assert.equal(hwItem.source, 'warehouse');
    assert.equal(hwItem.wh_id, 501);
    assert.equal(hwItem.warehouse_sku, 'CRB-501');

    vm.runInContext(`Marketplaces._selectPkg(0, 'catalog:201')`, context);
    const pkgState = vm.runInContext(`JSON.stringify(Marketplaces._pkgItems[0])`, context);
    const pkgItem = JSON.parse(pkgState);
    assert.equal(pkgItem.source, 'catalog');
    assert.equal(pkgItem.blank_id, 201);
    assert.equal(pkgItem.warehouse_sku, 'ENV-150x90');

    const pickerHost = context.document.getElementById('picker-filter-host');
    const filteredItems = [
        { textContent: 'Карабин черный 5 см CRB-501 склад', style: {} },
        { textContent: 'Цепочка белая 10 см CHN-100 склад', style: {} },
    ];
    pickerHost.querySelectorAll = (selector) => selector === '.wh-picker-item' ? filteredItems : [];
    vm.runInContext(`Warehouse.filterPicker('picker-filter-host', 'CRB-501')`, context);
    assert.equal(filteredItems[0].style.display, '');
    assert.equal(filteredItems[1].style.display, 'none');

    console.log('marketplaces smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

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
        setAttribute() {},
        getAttribute() { return null; },
        addEventListener() {},
        removeEventListener() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        insertAdjacentHTML() {},
        closest() { return null; },
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
        navigator: { clipboard: { writeText() {} } },
        fetch: async () => ({ ok: true, json: async () => [] }),
        confirm: () => true,
        prompt: () => '',
        App: {
            toast() {},
            navigate() {},
            getCurrentEmployeeName() { return 'Smoke'; },
            escHtml(value) { return String(value || ''); },
            statusLabel(value) { return String(value || ''); },
            params: {
                wasteFactor: 1.1,
                fotPerHour: 100,
                indirectCostMode: 'none',
                indirectPerHour: 0,
                cnyRate: 12.5,
            },
            settings: {},
        },
        ChinaCatalog: { _cnyRate: 12.5 },
        round2(value) {
            return Math.round((Number(value) || 0) * 100) / 100;
        },
        formatRub(value) {
            return `${Math.round((Number(value) || 0) * 100) / 100} ₽`;
        },
        getProductionParams(settings) {
            return settings || {};
        },
        calculateItemCost() {
            return {
                costTotal: 10,
                costFot: 1,
                costIndirect: 0,
                costPlastic: 2,
                costMoldAmortization: 1,
                costCutting: 0,
                costCuttingIndirect: 0,
                costNfcTag: 0,
                costNfcProgramming: 0,
                costNfcIndirect: 0,
                hoursPlastic: 1,
                hoursCutting: 0,
                hoursNfc: 0,
            };
        },
        calculateHardwareCost(item) {
            return {
                costPerUnit: Number(item.price || 0) + 1,
                hoursHardware: 0.5,
            };
        },
        calculatePackagingCost(item) {
            return {
                costPerUnit: Number(item.price || 0) + 1,
                hoursPackaging: 0.25,
            };
        },
        loadMarketplaceSets: async () => [],
        loadMolds: async () => [],
        loadHwBlanks: async () => [],
        loadPkgBlanks: async () => [],
        loadWarehouseItems: async () => [],
        loadColors: async () => [],
        saveOrder: async () => 1,
    };
    context.window = context;
    context.history = { replaceState() {} };
    context.window.history = context.history;
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

async function smokeSharedPickerRender(context) {
    const originalRenderColorVariants = vm.runInContext('Marketplaces.renderColorVariants', context);
    context.__originalRenderColorVariants = originalRenderColorVariants;
    await vm.runInContext(`(() => {
        Marketplaces._plasticBlanks = [];
        Marketplaces._plasticItems = [];
        Marketplaces._colorVariants = [];
        Marketplaces._hwCatalog = [{
            id: 11,
            name: 'Цепочка металл 10см',
            price_rub: 20,
            assembly_speed: 60,
            warehouse_item_id: 701,
            photo_url: ''
        }];
        Marketplaces._pkgCatalog = [{
            id: 21,
            name: 'Конверт 10x10',
            price_per_unit: 7,
            delivery_per_unit: 0,
            assembly_speed: 30,
            warehouse_item_id: 801,
            photo_url: ''
        }];
        Marketplaces._allWarehouseHw = [{
            id: 701,
            category: 'chains',
            name: 'Цепочка металл',
            size: '10 см',
            color: 'желтый',
            sku: 'CHAIN-10-Y',
            qty: 12,
            available_qty: 9,
            unit: 'шт',
            price_per_unit: 25,
            photo_thumbnail: 'https://img.example/hw.jpg'
        }];
        Marketplaces._allWarehousePkg = [{
            id: 801,
            category: 'packaging',
            name: 'Конверт',
            size: '10x10',
            color: 'калька',
            sku: 'ENV-10x10',
            qty: 30,
            available_qty: 25,
            unit: 'шт',
            price_per_unit: 7,
            photo_thumbnail: 'https://img.example/pkg.jpg'
        }];
        Marketplaces._hwItems = [{
            source: 'catalog',
            blank_id: 11,
            wh_id: 701,
            qty: 1,
            name: 'Цепочка металл 10см',
            cost_per_unit: 0,
            assembly_speed: 60,
            warehouse_sku: 'CHAIN-10-Y',
            photo_thumbnail: 'https://img.example/hw.jpg'
        }];
        Marketplaces._pkgItems = [{
            source: 'catalog',
            blank_id: 21,
            wh_id: 801,
            qty: 1,
            name: 'Конверт 10x10',
            cost_per_unit: 7,
            assembly_speed: 30,
            warehouse_sku: 'ENV-10x10',
            photo_thumbnail: 'https://img.example/pkg.jpg'
        }];
        document.getElementById('mp-plastic-items');
        document.getElementById('mp-hw-items');
        document.getElementById('mp-pkg-items');
        Marketplaces.renderColorVariants = () => {};
        Marketplaces.renderFormItems();
    })()`, context);

    const hwHtml = context.document.getElementById('mp-hw-items').innerHTML;
    const pkgHtml = context.document.getElementById('mp-pkg-items').innerHTML;
    assert.match(hwHtml, /Поиск фурнитуры по названию или артикулу/);
    assert.match(hwHtml, /CHAIN-10-Y/);
    assert.match(hwHtml, /https:\/\/img\.example\/hw\.jpg/);
    assert.match(hwHtml, /catalog:11/);
    assert.match(pkgHtml, /Поиск упаковки по названию или артикулу/);
    assert.match(pkgHtml, /ENV-10x10/);
    assert.match(pkgHtml, /https:\/\/img\.example\/pkg\.jpg/);
    assert.match(pkgHtml, /warehouse:801/);

    vm.runInContext('Marketplaces.renderColorVariants = globalThis.__originalRenderColorVariants', context);
    delete context.__originalRenderColorVariants;
}

async function smokeSelectionAndWarehouseBridge(context) {
    await vm.runInContext(`(() => {
        Marketplaces.renderFormItems = () => {};
        Marketplaces.recalcSet = () => {};
        Marketplaces._hwCatalog = [{
            id: 11,
            name: 'Цепочка металл 10см',
            price_rub: 20,
            assembly_speed: 60,
            warehouse_item_id: 701,
            photo_url: ''
        }];
        Marketplaces._pkgCatalog = [{
            id: 21,
            name: 'Конверт 10x10',
            price_per_unit: 7,
            delivery_per_unit: 0,
            assembly_speed: 30,
            warehouse_item_id: 801,
            photo_url: ''
        }];
        Marketplaces._allWarehouseHw = [{
            id: 701,
            category: 'chains',
            name: 'Цепочка металл',
            size: '10 см',
            color: 'желтый',
            sku: 'CHAIN-10-Y',
            qty: 12,
            available_qty: 9,
            unit: 'шт',
            price_per_unit: 25,
            photo_thumbnail: 'https://img.example/hw.jpg'
        }];
        Marketplaces._allWarehousePkg = [{
            id: 801,
            category: 'packaging',
            name: 'Конверт',
            size: '10x10',
            color: 'калька',
            sku: 'ENV-10x10',
            qty: 30,
            available_qty: 25,
            unit: 'шт',
            price_per_unit: 7,
            photo_thumbnail: 'https://img.example/pkg.jpg'
        }];
        Marketplaces._hwItems = [{ source: 'catalog', blank_id: null, wh_id: null, qty: 1, name: '', cost_per_unit: 0, assembly_speed: 0, warehouse_sku: '', photo_thumbnail: '' }];
        Marketplaces._pkgItems = [{ source: 'catalog', blank_id: null, wh_id: null, qty: 1, name: '', cost_per_unit: 0, assembly_speed: 0, warehouse_sku: '', photo_thumbnail: '' }];
        Marketplaces._selectHw(0, 'catalog:11');
        Marketplaces._selectPkg(0, 'warehouse:801');
    })()`, context);

    const hwItem = clone(vm.runInContext('Marketplaces._hwItems[0]', context));
    const pkgItem = clone(vm.runInContext('Marketplaces._pkgItems[0]', context));
    assert.equal(hwItem.source, 'catalog');
    assert.equal(hwItem.blank_id, 11);
    assert.equal(hwItem.wh_id, 701);
    assert.equal(hwItem.warehouse_sku, 'CHAIN-10-Y');
    assert.equal(hwItem.photo_thumbnail, 'https://img.example/hw.jpg');
    assert.equal(pkgItem.source, 'warehouse');
    assert.equal(pkgItem.wh_id, 801);
    assert.equal(pkgItem.warehouse_sku, 'ENV-10x10');

    context.__savedOrderItems = null;
    context.__warehouseSyncCall = null;
    context.saveOrder = async (order, items) => {
        context.__savedOrder = clone(order);
        context.__savedOrderItems = clone(items);
        return 77;
    };
    vm.runInContext(`
        globalThis.Orders = {
            _syncWarehouseByStatus: async (...args) => {
                globalThis.__warehouseSyncCall = args;
            }
        };
        App.toast = () => {};
        App.navigate = () => {};
        Marketplaces.hideProductionBuilder = () => {};
        Marketplaces.allSets = [{
            id: 1,
            name: 'B2C bridge',
            mp_actual_price: 100,
            plastic_items: [],
            hw_items: [Marketplaces._hwItems[0]],
            pkg_items: [{
                source: 'catalog',
                blank_id: 21,
                wh_id: 801,
                qty: 1,
                name: 'Конверт 10x10',
                cost_per_unit: 7,
                assembly_speed: 30,
                warehouse_sku: 'ENV-10x10',
                photo_thumbnail: 'https://img.example/pkg.jpg'
            }]
        }];
    `, context);

    await vm.runInContext(`Marketplaces._createProductionOrderFromSets([{ id: 1, qty: 3 }], 'B2C bridge order', '2026-03-30')`, context);

    const savedItems = clone(context.__savedOrderItems);
    const hwOrderItem = savedItems.find(item => item.item_type === 'hardware');
    const pkgOrderItem = savedItems.find(item => item.item_type === 'packaging');
    assert.equal(hwOrderItem.hardware_source, 'warehouse');
    assert.equal(hwOrderItem.hardware_warehouse_item_id, 701);
    assert.equal(hwOrderItem.hardware_warehouse_sku, 'CHAIN-10-Y');
    assert.equal(pkgOrderItem.packaging_source, 'warehouse');
    assert.equal(pkgOrderItem.packaging_warehouse_item_id, 801);
    assert.equal(pkgOrderItem.packaging_warehouse_sku, 'ENV-10x10');
    assert.deepEqual(clone(context.__warehouseSyncCall), [77, 'draft', 'production_casting', 'B2C bridge order', 'Smoke']);
}

async function smokePhotoTriggers(context) {
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(indexHtml, /<label for="mp-photo-file" title="Загрузить фото набора"/);
    assert.match(indexHtml, /<label for="mp-photo-file" class="btn btn-sm btn-outline">Выбрать фото<\/label>/);
    assert.match(indexHtml, /id="mp-photo-file" class="file-input-visually-hidden"/);

    await vm.runInContext(`(() => {
        Marketplaces._plasticItems = [{ name: 'Картхолдер нью' }];
        Marketplaces._colors = [{
            id: 27,
            number: '027',
            name: 'Бирюзовый мрамор',
            photo_url: 'https://img.example/color.jpg'
        }];
        Marketplaces._colorVariants = [{
            id: 1,
            name: 'Бирюзовый мрамор',
            photo_url: 'https://img.example/variant.jpg',
            assignments: [{
                color_id: 27,
                color_number: '027',
                color_name: 'Бирюзовый мрамор',
                color_photo: 'https://img.example/color.jpg'
            }]
        }];
        document.getElementById('mp-color-variants');
        Marketplaces.renderColorVariants();
    })()`, context);

    const variantsHtml = context.document.getElementById('mp-color-variants').innerHTML;
    assert.match(variantsHtml, /<label for="mp-var-photo-0"/);
    assert.match(variantsHtml, /id="mp-var-photo-0" class="file-input-visually-hidden"/);
    assert.ok(!variantsHtml.includes('document.getElementById(\\\'mp-var-photo-'));
}

async function main() {
    const context = createContext();
    ['js/warehouse.js', 'js/marketplaces.js'].forEach(file => runScript(context, file));

    await smokeSharedPickerRender(context);
    await smokeSelectionAndWarehouseBridge(context);
    await smokePhotoTriggers(context);

    console.log('marketplaces smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

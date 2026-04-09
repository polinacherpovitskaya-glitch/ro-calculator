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
    context.Warehouse = {
        async getItemsForPicker() {
            return {
                packaging: {
                    label: 'Упаковка',
                    icon: '📦',
                    items: [{
                        id: 601,
                        name: 'Коробка',
                        sku: 'ENV-150',
                        size: '15x9',
                        color: 'калька',
                        available_qty: 42,
                        price_per_unit: 12,
                        photo_thumbnail: 'https://example.com/pkg.jpg',
                    }],
                },
                chains: {
                    label: 'Карабины',
                    icon: '🔗',
                    items: [{
                        id: 501,
                        name: 'Карабин',
                        sku: 'CRB-501',
                        size: '5 см',
                        color: 'черный',
                        available_qty: 12,
                        price_per_unit: 10,
                        photo_thumbnail: 'https://example.com/hw.jpg',
                    }],
                },
            };
        },
        buildImagePicker(containerId, grouped, selectedId) {
            context.__pickerArgs = {
                containerId,
                selectedId,
                groupedKeys: Object.keys(grouped || {}),
            };
            return `<div class="wh-img-picker" data-container="${containerId}"><input class="wh-picker-search" placeholder="Поиск по названию или артикулу..."></div>`;
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
    runScript(context, 'js/molds.js');

    assert.equal(vm.runInContext('getBlankMargin(10)', context), 0.65);
    assert.equal(vm.runInContext('getBlankMargin(50)', context), 0.60);
    assert.equal(vm.runInContext('getBlankMargin(100)', context), 0.55);
    assert.equal(vm.runInContext('getBlankMargin(300)', context), 0.50);
    assert.equal(vm.runInContext('getBlankMargin(500)', context), 0.45);
    assert.equal(vm.runInContext('getBlankMargin(1000)', context), 0.40);
    assert.equal(vm.runInContext('getBlankMargin(3000)', context), 0.35);
    assert.equal(vm.runInContext('roundTo5(1162)', context), 1160);
    assert.equal(vm.runInContext('roundTo5(1163)', context), 1165);

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
        'mold-hw-warehouse-picker-host',
        'pkg-blank-wh-id',
        'pkg-blank-name',
        'pkg-blank-price',
        'pkg-blank-delivery',
        'pkg-blank-speed',
        'pkg-blank-sell',
        'pkg-blank-notes',
        'pkg-blank-photo',
        'pkg-blank-selected',
        'pkg-blank-selected-name',
        'pkg-blank-selected-info',
        'pkg-blank-photo-preview',
        'mold-pkg-warehouse-picker-host',
    ].forEach(id => context.document.getElementById(id));

    vm.runInContext(`
        Molds.recalcHwCost = () => {};
        Molds.recalcPkgCost = () => {};
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
        Molds._warehousePkgItems = [{
            id: 601,
            name: 'Конверт',
            sku: 'ENV-150',
            size: '15x9',
            color: 'калька',
            category: 'packaging',
            price_per_unit: 12,
            photo_thumbnail: 'https://example.com/pkg.jpg',
        }];
        document.getElementById('hw-blank-wh-search').value = 'CRB-501';
    `, context);

    vm.runInContext(`Molds.searchHwWarehouse()`, context);
    const dropdownHtml = String(context.document.getElementById('hw-blank-wh-dropdown').innerHTML || '');
    assert.match(dropdownHtml, /CRB-501/);
    assert.match(dropdownHtml, /Карабин/);
    assert.match(dropdownHtml, /5 см/);

    const skuOnlySnapshot = JSON.parse(vm.runInContext(`JSON.stringify(Molds._getWarehouseHwSnapshot(501, 'CRB-501'))`, context));
    assert.equal(skuOnlySnapshot.notes, '');
    const prefixedNotesSnapshot = JSON.parse(vm.runInContext(`JSON.stringify(Molds._getWarehouseHwSnapshot(501, 'CRB-501 + полная сборка'))`, context));
    assert.equal(prefixedNotesSnapshot.notes, 'полная сборка');

    vm.runInContext(`document.getElementById('hw-blank-wh-id').value = '501'; Molds.renderWarehouseHwPicker();`, context);
    const pickerHtml = String(context.document.getElementById('mold-hw-warehouse-picker-host').innerHTML || '');
    const pickerArgs = context.__pickerArgs;
    assert.match(pickerHtml, /wh-img-picker/);
    assert.match(pickerHtml, /Поиск по названию или артикулу/);
    assert.equal(pickerArgs.containerId, 'moldhw-picker-0');
    assert.equal(pickerArgs.selectedId, '501');

    vm.runInContext(`Molds.selectHwWarehouseItem(501)`, context);
    assert.equal(context.document.getElementById('hw-blank-wh-id').value, 501);
    assert.match(String(context.document.getElementById('hw-blank-selected-info').textContent || ''), /Артикул: CRB-501/);
    assert.match(String(context.document.getElementById('hw-blank-selected-info').textContent || ''), /10 ₽/);
    assert.equal(String(context.document.getElementById('hw-blank-notes').value || ''), '');

    const pkgSkuOnlySnapshot = JSON.parse(vm.runInContext(`JSON.stringify(Molds._getWarehousePkgSnapshot(601, 'ENV-150'))`, context));
    assert.equal(pkgSkuOnlySnapshot.notes, '');
    const pkgPrefixedNotesSnapshot = JSON.parse(vm.runInContext(`JSON.stringify(Molds._getWarehousePkgSnapshot(601, 'ENV-150 + подарочный'))`, context));
    assert.equal(pkgPrefixedNotesSnapshot.notes, 'подарочный');

    await vm.runInContext(`Molds.renderWarehousePkgPicker()`, context);
    const pkgPickerHtml = String(context.document.getElementById('mold-pkg-warehouse-picker-host').innerHTML || '');
    const pkgPickerArgs = context.__pickerArgs;
    assert.match(pkgPickerHtml, /wh-img-picker/);
    assert.match(pkgPickerHtml, /Поиск по названию или артикулу/);
    assert.equal(pkgPickerArgs.containerId, 'moldpkg-picker-0');

    vm.runInContext(`Molds.selectPkgWarehouseItem(0, 601)`, context);
    assert.equal(context.document.getElementById('pkg-blank-wh-id').value, 601);
    assert.equal(String(context.document.getElementById('pkg-blank-name').value || ''), 'Конверт · 15x9 · калька');
    assert.equal(String(context.document.getElementById('pkg-blank-price').value || ''), '12');
    assert.equal(Number(context.document.getElementById('pkg-blank-delivery').value || 0), 0);
    assert.match(String(context.document.getElementById('pkg-blank-selected-info').textContent || ''), /Артикул: ENV-150/);
    assert.equal(String(context.document.getElementById('pkg-blank-notes').value || ''), '');

    console.log('molds smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

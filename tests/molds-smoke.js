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
    context.__warehouseItems = [];
    context.loadWarehouseItems = async () => JSON.parse(JSON.stringify(context.__warehouseItems || []));
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
    context.calculateItemCost = () => ({ costTotal: 100, costMoldAmortization: 0 });
    context.App.params = { taxRate: 0.06, vatRate: 0.05, charityRate: 0.01 };
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
        'mold-builtin-hw-warehouse-picker-host',
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
        App.params = { fotPerHour: 400, indirectPerHour: 100, taxRate: 0.06, charityRate: 0.01 };
        globalThis.__warehouseItems = [{
            id: 77,
            name: 'NFC',
            sku: 'NFC',
            category: 'other',
            price_per_unit: 39,
            photo_thumbnail: '',
        }, {
            id: 501,
            name: 'Карабин',
            sku: 'CRB-501',
            size: '5 см',
            color: 'черный',
            category: 'chains',
            price_per_unit: 10,
            photo_thumbnail: 'https://example.com/hw.jpg',
        }];
        Molds._warehouseHwItems = [{
            id: 77,
            name: 'NFC',
            sku: 'NFC',
            category: 'other',
            price_per_unit: 39,
            photo_thumbnail: '',
        }, {
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
    const pickerHtml = String(
        context.document.getElementById('mold-builtin-hw-warehouse-picker-host').innerHTML
        || context.document.getElementById('mold-hw-warehouse-picker-host').innerHTML
        || ''
    );
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

    vm.runInContext(`
        Molds._hwBlanks = [{
            id: 91,
            name: 'Карабин-кольцо',
            price_rub: 10,
            sell_price: 0,
            warehouse_item_id: 501,
            assembly_speed: 540,
            notes: '',
            photo_url: '',
            hw_form_source: 'warehouse',
        }];
        Molds.enrichHwBlanks();
        document.getElementById('hw-blanks-container');
        Molds.renderHwTable();
    `, context);
    const hwTableHtml = String(context.document.getElementById('hw-blanks-container').innerHTML || '');
    assert.match(hwTableHtml, /авто 40%/);
    assert.match(hwTableHtml, /Карабин черный 5 см/);

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

    context.App.params.nfcTagCost = 39;
    context.__savedInlineMold = null;
    context.__reloadedInlineMolds = false;
    context.saveMold = async (mold) => {
        context.__savedInlineMold = JSON.parse(JSON.stringify(mold));
        return mold.id;
    };
    vm.runInContext(`
        Molds.allMolds = [{
            id: 77,
            name: 'Тестовый бланк',
            status: 'active',
            pph_min: 80,
            pph_max: 100,
            pph_actual: null,
            weight_grams: 5,
            complexity: 'simple',
            mold_count: 1,
            hw_name: '',
            hw_price_per_unit: 0,
            hw_delivery_total: 0,
            hw_speed: null,
            use_manual_prices: true,
            custom_prices: { 50: 500 },
            custom_margins: {},
            disable_historical_blank_price_recovery: false,
            total_orders: 0,
            total_units_produced: 0
        }];
        Molds.load = async () => { __reloadedInlineMolds = true; };
    `, context);
    context.document.getElementById('mold-inline-pph-77').value = '120';
    context.document.getElementById('mold-inline-weight-77').value = '7.5';
    context.document.getElementById('mold-inline-complexity-77').value = 'complex';
    context.document.getElementById('mold-inline-nfc-77').checked = true;

    await vm.runInContext(`Molds.saveInlineMold(77)`, context);
    assert.equal(context.__savedInlineMold.pph_actual, 120);
    assert.equal(context.__savedInlineMold.weight_grams, 7.5);
    assert.equal(context.__savedInlineMold.complexity, 'complex');
    assert.equal(context.__savedInlineMold.mold_count, 1);
    assert.equal(context.__savedInlineMold.hw_source, 'warehouse');
    assert.equal(context.__savedInlineMold.hw_name, 'NFC');
    assert.equal(context.__savedInlineMold.hw_price_per_unit, 39);
    assert.equal(context.__savedInlineMold.hw_warehouse_item_id, 77);
    assert.equal(context.__savedInlineMold.hw_warehouse_sku, 'NFC');
    assert.equal(context.__savedInlineMold.use_manual_prices, true);
    assert.deepEqual(context.__savedInlineMold.custom_prices, { 50: 500 });
    assert.deepEqual(context.__savedInlineMold.custom_margins, {});
    assert.equal(context.__savedInlineMold.disable_historical_blank_price_recovery, false);
    assert.equal(context.__reloadedInlineMolds, true);
    const inlineHtml = String(vm.runInContext(`Molds._renderInlineControls(Molds.allMolds[0])`, context));
    assert.doesNotMatch(inlineHtml, /Кол-во частей/);
    assert.match(inlineHtml, /39 ₽/);
    assert.doesNotMatch(inlineHtml, /\+10 ₽/);

    vm.runInContext(`
        Molds.allMolds = [{
            id: 91,
            name: 'Формульный бланк',
            status: 'active',
            pph_min: 25,
            pph_max: 25,
            pph_actual: 25,
            weight_grams: 30,
            complexity: 'simple',
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            mold_count: 1,
            hw_name: '',
            hw_price_per_unit: 0,
            hw_delivery_total: 0,
            hw_speed: null,
            custom_prices: { 50: 999 },
            custom_margins: {},
            use_manual_prices: false,
            total_orders: 0,
            total_units_produced: 0
        }];
        Molds.enrichMolds();
    `, context);
    const formulaPrice = vm.runInContext(`Molds.allMolds[0].tiers[50].sellPrice`, context);
    assert.equal(formulaPrice, 390);

    vm.runInContext(`
        Molds.allMolds[0].use_manual_prices = true;
        Molds.enrichMolds();
    `, context);
    const manualPrice = vm.runInContext(`Molds.allMolds[0].tiers[50].sellPrice`, context);
    assert.equal(manualPrice, 999);

    console.log('molds smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

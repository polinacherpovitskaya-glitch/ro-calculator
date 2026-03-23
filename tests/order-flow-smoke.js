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
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
    };
}

function createLocalStorage() {
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
    const document = createDocument();
    const localStorage = createLocalStorage();
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
        localStorage,
        navigator: { clipboard: { writeText() {} } },
        fetch: async () => ({ ok: true, json: async () => [] }),
        confirm: () => true,
        prompt: () => '',
        App: {
            init() {},
            toast() {},
            navigate() {},
            formatDate(value) { return String(value || ''); },
            getCurrentEmployeeName() { return 'Smoke'; },
            todayLocalYMD() { return '2026-03-16'; },
            applyCurrentEmployeeToCalculator() {},
            escHtml(value) { return String(value || ''); },
            statusLabel(status) { return String(status || ''); },
            settings: {},
            templates: [],
            params: {
                wasteFactor: 1.1,
                fotPerHour: 100,
                indirectCostMode: 'none',
                indirectPerHour: 0,
                taxRate: 0.06,
                packagingHours: 8,
                plasticHours: 8,
                hardwareHours: 8,
            },
        },
        Colors: { data: [] },
        Settings: { getTimingData: () => [] },
        Pendant: { renderAllCards() {} },
        KPGenerator: { generate: async () => {} },
        STATUS_OPTIONS: [],
        loadHwBlanks: async () => [],
        loadPkgBlanks: async () => [],
        loadWarehouseReservations: async () => [],
        saveWarehouseReservations: async () => {},
        loadWarehouseItems: async () => [],
        saveWarehouseItems: async () => {},
        loadWarehouseHistory: async () => [],
        saveWarehouseHistory: async () => {},
        loadProjectHardwareState: async () => ({ checks: {} }),
        saveProjectHardwareState: async () => {},
        loadOrders: async () => [],
        loadOrder: async () => ({ order: {}, items: [] }),
        updateOrderStatus: async () => {},
        updateOrderFields: async () => {},
        saveOrder: async () => 1,
        loadReadyGoods: async () => [],
        saveReadyGoods: async () => {},
        loadReadyGoodsHistory: async () => [],
        saveReadyGoodsHistory: async () => {},
        loadSalesRecords: async () => [],
        saveSalesRecords: async () => {},
        loadChinaPurchases: async () => [],
        loadChinaPurchase: async () => null,
        loadChinaOrders: async () => [],
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

function stubRuntime(context) {
    vm.runInContext(`
        globalThis.appendAuthActivity = async () => {};
        App.toast = () => {};
        App.navigate = () => {};
        App.formatDate = (value) => String(value || '');
        App.getCurrentEmployeeName = () => 'Smoke';
        App.todayLocalYMD = () => '2026-03-16';
        App.applyCurrentEmployeeToCalculator = () => {};
        App.escHtml = (value) => String(value || '');
        App.statusLabel = (status) => String(status || '');
        App.settings = {};
        App.templates = [];
        App.params = {
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            taxRate: 0.06,
            packagingHours: 8,
            plasticHours: 8,
            hardwareHours: 8,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
            nfcTagCost: 0,
            nfcWriteSpeed: 1000,
        };
    `, context);
}

async function buildCollectedItems(context) {
    return clone(await vm.runInContext(`(async () => {
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.items[0].product_name = 'Smoke Product';
        Calculator.items[0].quantity = 10;
        Calculator.items[0].pieces_per_hour = 120;
        Calculator.items[0].weight_grams = 8;
        Calculator.items[0].sell_price_item = 42;
        Calculator.items[0].color_id = 12;
        Calculator.items[0].color_name = 'Красный';
        Calculator.items[0].colors = [
            { id: 12, name: 'Красный' },
            { id: 13, name: 'Синий' },
        ];
        Calculator.items[0].color_solution_attachment = {
            name: 'palette.pdf',
            type: 'application/pdf',
            data_url: 'data:application/pdf;base64,AAA',
            size: 1234,
        };
        Calculator.items[0].result = {
            costTotal: 120,
            hoursPlastic: 1,
            hoursCutting: 0,
            hoursNfc: 0,
        };

        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(null), {
            source: 'china',
            name: 'Smoke Hardware',
            qty: 15,
            assembly_speed: 60,
            price: 18,
            delivery_total: 45,
            delivery_price: 3,
            sell_price: 25,
            china_item_id: 501,
            china_delivery_method: 'auto',
            price_cny: 2.7,
            weight_grams: 6.5,
            result: { costPerUnit: 21, hoursHardware: 0.5 },
        })];

        Calculator.packagingItems = [Object.assign(Calculator.getEmptyPackaging(null), {
            source: 'china',
            name: 'Smoke Packaging',
            qty: 15,
            assembly_speed: 30,
            price: 12,
            delivery_total: 30,
            delivery_price: 2,
            sell_price: 19,
            china_item_id: 601,
            china_delivery_method: 'avia_fast',
            price_cny: 1.8,
            weight_grams: 4.2,
            result: { costPerUnit: 14, hoursPackaging: 0.75 },
        }), Object.assign(Calculator.getEmptyPackaging(null), {
            source: 'warehouse',
            name: 'Warehouse Envelope',
            qty: 100,
            assembly_speed: 300,
            assembly_minutes: 5,
            price: 15.48,
            delivery_total: 0,
            delivery_price: 0,
            sell_price: 18,
            warehouse_item_id: 701,
            warehouse_sku: 'ENV-150x90-EGG',
            result: { costPerUnit: 16.1, hoursPackaging: 0.5 },
        })];

        Calculator.extraCosts = [];
        Calculator.pendants = [{
            item_type: 'pendant',
            name: 'ABC',
            quantity: 5,
            elements: [
                { char: 'A', color: 'Red' },
                { char: 'B', color: 'Blue' },
                { char: 'C', color: 'Green' },
            ],
            cord: { name: 'Smoke Cord', unit: 'м', price_per_unit: 12, delivery_price: 1, assembly_speed: 60 },
            carabiner: { name: 'Smoke Carabiner', price_per_unit: 2, delivery_price: 0.5, assembly_speed: 120 },
            _totalSellPerUnit: 99,
            result: { costPerUnit: 17, sellPerUnit: 99 },
        }];

        return Calculator._collectItemsForSave();
    })()`, context));
}

async function smokeCalculatorPersistence(context) {
    const items = await buildCollectedItems(context);
    const productRow = items.find(item => item.item_type === 'product');
    const hardwareRow = items.find(item => item.item_type === 'hardware');
    const packagingRows = items.filter(item => item.item_type === 'packaging');
    const packagingRow = packagingRows.find(item => item.packaging_source === 'china');
    const warehousePackagingRow = packagingRows.find(item => item.packaging_source === 'warehouse');
    const pendantRow = items.find(item => item.item_type === 'pendant');

    assert.equal(productRow.color_id, 12);
    assert.equal(productRow.color_name, 'Красный');
    assert.deepEqual(JSON.parse(productRow.colors), [
        { id: 12, name: 'Красный' },
        { id: 13, name: 'Синий' },
    ]);
    assert.equal(JSON.parse(productRow.color_solution_attachment).name, 'palette.pdf');

    assert.equal(hardwareRow.china_item_id, 501);
    assert.equal(hardwareRow.china_delivery_method, 'auto');
    assert.equal(hardwareRow.price_cny, 2.7);
    assert.equal(hardwareRow.weight_grams, 6.5);

    assert.equal(packagingRow.china_item_id, 601);
    assert.equal(packagingRow.china_delivery_method, 'avia_fast');
    assert.equal(packagingRow.price_cny, 1.8);
    assert.equal(packagingRow.weight_grams, 4.2);
    assert.equal(warehousePackagingRow.packaging_warehouse_item_id, 701);
    assert.equal(warehousePackagingRow.packaging_warehouse_sku, 'ENV-150x90-EGG');
    assert.equal(warehousePackagingRow.packaging_assembly_speed, 300);

    assert.equal(pendantRow.name, 'ABC');
    assert.equal(pendantRow._totalSellPerUnit, 99);
    assert.equal(Array.isArray(pendantRow.elements), true);
    assert.equal(pendantRow.elements.length, 3);
    assert.equal('item_data' in pendantRow, false);

    context.__loadOrderData = {
        order: {
            id: 9001,
            order_name: 'Smoke Order',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'draft',
        },
        items: clone(items),
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);

    vm.runInContext(`
        Calculator.renderItemBlock = () => {};
        Calculator.renderHardwareRow = () => {};
        Calculator.renderPackagingRow = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.recalculate = () => {};
        Calculator.showOrderHistory = () => {};
        Calculator._ensureWhPickerData = async () => ({});
    `, context);

    await vm.runInContext('Calculator.loadOrder(9001)', context);
    const restored = clone(await vm.runInContext(`({
        product: Calculator.items[0],
        hardware: Calculator.hardwareItems[0],
        packagingChina: Calculator.packagingItems.find(pkg => pkg.source === 'china'),
        packagingWarehouse: Calculator.packagingItems.find(pkg => pkg.source === 'warehouse'),
        pendant: Calculator.pendants[0],
    })`, context));

    assert.equal(restored.product.color_id, 12);
    assert.equal(restored.product.color_name, 'Красный');
    assert.equal(Array.isArray(restored.product.colors), true);
    assert.equal(restored.product.colors.length, 2);
    assert.equal(restored.product.colors[1].name, 'Синий');
    assert.equal(restored.product.color_solution_attachment.name, 'palette.pdf');

    assert.equal(restored.hardware.china_item_id, 501);
    assert.equal(restored.hardware.china_delivery_method, 'auto');
    assert.equal(restored.hardware.price_cny, 2.7);
    assert.equal(restored.hardware.weight_grams, 6.5);

    assert.equal(restored.packagingChina.china_item_id, 601);
    assert.equal(restored.packagingChina.china_delivery_method, 'avia_fast');
    assert.equal(restored.packagingChina.price_cny, 1.8);
    assert.equal(restored.packagingChina.weight_grams, 4.2);
    assert.equal(restored.packagingWarehouse.warehouse_item_id, 701);
    assert.equal(restored.packagingWarehouse.warehouse_sku, 'ENV-150x90-EGG');
    assert.equal(restored.packagingWarehouse.assembly_speed, 300);
    assert.equal(restored.packagingWarehouse.assembly_minutes, 5);

    assert.equal(restored.pendant.name, 'ABC');
    assert.equal(restored.pendant._totalSellPerUnit, 99);
    assert.equal(restored.pendant.cord.name, 'Smoke Cord');
    assert.equal(restored.pendant.carabiner.name, 'Smoke Carabiner');
    assert.equal(restored.pendant.elements.length, 3);

    const selectedWarehouseItem = clone(vm.runInContext(`
        Warehouse._findInGrouped({
            packaging: { items: [{ id: 701, name: 'Warehouse Envelope', available_qty: 20, unit: 'шт', price_per_unit: 15.48 }] }
        }, '701')
    `, context));
    assert.equal(selectedWarehouseItem.id, 701);
}

async function smokeHardwareOnlyAutosave(context) {
    await vm.runInContext(`(async () => {
        window.__savedDraftPayload = null;
        saveOrder = async (order, items) => {
            window.__savedDraftPayload = { order, items };
            return 555;
        };

        Calculator.resetForm();
        document.getElementById('calc-order-name').value = 'Hardware only draft';
        document.getElementById('calc-manager-name').value = 'Smoke';
        document.getElementById('calc-autosave-status');

        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(null), {
            source: 'warehouse',
            name: 'Smoke Warehouse Hardware',
            qty: 8,
            warehouse_item_id: 777,
            warehouse_sku: 'HW-777',
            assembly_speed: 120,
            result: { costPerUnit: 15, hoursHardware: 0.4 },
        })];

        await Calculator._doAutosave();
    })()`, context);

    const saved = clone(await vm.runInContext(`window.__savedDraftPayload`, context));
    assert.ok(saved, 'hardware-only draft triggers autosave');
    assert.equal(saved.order.order_name, 'Hardware only draft');
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].item_type, 'hardware');
    assert.equal(saved.items[0].hardware_warehouse_item_id, 777);
    assert.equal(context.localStorage.getItem('ro_calc_editing_order_id'), '555');
}

async function smokePackagingWarehousePickerDefaults(context) {
    context.__warehouseItems = [{
        id: 701,
        name: 'Warehouse Envelope',
        sku: 'ENV-150x90-EGG',
        size: '15x9см',
        color: 'калька',
        available_qty: 565,
        qty: 565,
        unit: 'шт',
        price_per_unit: 15.48,
        photo_thumbnail: '',
        category: 'packaging',
    }];
    vm.runInContext(`
        Calculator.packagingItems = [Calculator.getEmptyPackaging(null)];
        Calculator.packagingItems[0].source = 'warehouse';
        Calculator._findWhItem = (itemId) => (globalThis.__warehouseItems || []).find(item => Number(item.id) === Number(itemId)) || null;
        Calculator._ensureBlanksCatalog = async () => {};
        Calculator._pkgBlanksCatalog = [{
            warehouse_item_id: 701,
            assembly_speed: 300,
            sell_price: 19,
            updated_at: '2026-03-17T12:00:00.000Z',
        }];
        Calculator._rerenderPkgItem = () => {};
        Calculator.recalculate = () => {};
        Calculator.scheduleAutosave = () => {};
    `, context);

    await vm.runInContext(`Calculator.onPkgWarehouseSelect(0, '701')`, context);

    const pkg = clone(await vm.runInContext(`Calculator.packagingItems[0]`, context));
    assert.equal(pkg.warehouse_item_id, 701);
    assert.equal(pkg.warehouse_sku, 'ENV-150x90-EGG');
    assert.equal(pkg.assembly_speed, 300);
    assert.equal(pkg.assembly_minutes, 5);
    assert.equal(pkg.sell_price, 19);
}

async function smokePendantWarehousePickerRichUI() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js', 'js/warehouse.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    pendantContext.__pendantWhData = {
        cords: {
            label: 'Шнуры',
            icon: '🧵',
            items: [{
                id: 701,
                category: 'cords',
                name: 'Шнур с силик. наконечником',
                sku: 'SLS-800-BL-NN',
                size: '80 см',
                color: 'синий',
                qty: 1232,
                available_qty: 732,
                price_per_unit: 23,
                unit: 'шт',
                photo_thumbnail: 'https://example.com/cord-thumb.png',
            }],
        },
        carabiners: {
            label: 'Карабины',
            icon: '🔗',
            items: [{
                id: 801,
                category: 'carabiners',
                name: 'Карабин с ушком',
                sku: 'CR-STD-SV-H',
                size: '2,3 см',
                color: 'серебряный',
                qty: 850,
                available_qty: 820,
                price_per_unit: 10,
                unit: 'шт',
                photo_thumbnail: 'https://example.com/carabiner-thumb.png',
            }],
        },
    };

    vm.runInContext(`
        Calculator._whPickerData = globalThis.__pendantWhData;
        Calculator._findHwBlankByWarehouseItemId = () => null;
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.cord = {
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'SLS-800-BL-NN',
            photo_thumbnail: 'https://example.com/cord-thumb.png',
            name: 'Шнур с силик. наконечником синий 80 см',
            price_per_unit: 23,
            delivery_price: 0,
            unit: 'шт',
        };
        Pendant._wizardData.carabiner = {
            source: 'warehouse',
            warehouse_item_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            name: '',
            price_per_unit: 0,
            delivery_price: 0,
            unit: 'шт',
        };
    `, pendantContext);

    const cordHtml = String(vm.runInContext(`Pendant._renderWhDropdown('cord', Pendant._wizardData.cord, Calculator._whPickerData)`, pendantContext));
    assert.match(cordHtml, /Поиск по названию или артикулу/);
    assert.match(cordHtml, /SLS-800-BL-NN/);
    assert.match(cordHtml, /cord-thumb\.png/);
    assert.match(cordHtml, /img src=/);

    vm.runInContext(`Pendant._wizardStep = 4`, pendantContext);
    const wizardClassName = String(vm.runInContext(`Pendant._wizardClassName()`, pendantContext));
    assert.match(wizardClassName, /pendant-wizard-step-4/);

    await vm.runInContext(`Pendant._onWhSelect('carabiner', '801')`, pendantContext);
    const carabiner = clone(await vm.runInContext(`Pendant._wizardData.carabiner`, pendantContext));
    assert.equal(carabiner.warehouse_item_id, 801);
    assert.equal(carabiner.warehouse_sku, 'CR-STD-SV-H');
    assert.equal(carabiner.photo_thumbnail, 'https://example.com/carabiner-thumb.png');

    const carabinerHtml = String(vm.runInContext(`Pendant._renderWhDropdown('carabiner', Pendant._wizardData.carabiner, Calculator._whPickerData)`, pendantContext));
    assert.match(carabinerHtml, /CR-STD-SV-H/);
    assert.match(carabinerHtml, /carabiner-thumb\.png/);
}

async function smokePendantIgnoresSpaces() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    await vm.runInContext(`(() => {
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardStep = 1;
        document.getElementById('pw-qty').value = '10';
        document.getElementById('pw-name').value = 'A ❤️ 😊';
        Pendant._readCurrentStep();
    })()`, pendantContext);

    const pendantState = clone(await vm.runInContext(`({
        name: Pendant._wizardData.name,
        chars: Pendant._wizardData.elements.map(el => el.char),
        previewHtml: Pendant._renderBeads('A ❤️ 😊', []),
    })`, pendantContext));

    assert.equal(pendantState.name, 'A❤️😊');
    assert.deepEqual(pendantState.chars, ['A', '❤️', '😊']);
    assert.equal((pendantState.previewHtml.match(/pendant-bead-char/g) || []).length, 3);

    const pendantCost = clone(await vm.runInContext(`calculatePendantCost({
        quantity: 2,
        elements: [
            { char: 'A', has_print: false, print_price: 0 },
            { char: ' ', has_print: false, print_price: 0 },
            { char: '😊', has_print: true, print_price: 4 }
        ],
        element_price_per_unit: 3,
        cord: { price_per_unit: 1, delivery_price: 0, unit: 'шт' },
        carabiner: { price_per_unit: 2, delivery_price: 0 },
        _totalSellPerUnit: 20
    }, App.params)`, pendantContext));

    assert.equal(pendantCost.costPerUnit, 13);

    const legacyPendantCost = clone(await vm.runInContext(`calculatePendantCost({
        quantity: 1,
        elements: [
            { char: 'А', has_print: false, print_price: 0 },
            { char: 'Л', has_print: false, print_price: 0 },
            { char: 'А', has_print: false, print_price: 0 },
            { char: '❤', has_print: false, print_price: 0 },
            { char: '️', has_print: false, print_price: 0 },
            { char: '😊', has_print: false, print_price: 0 }
        ],
        element_price_per_unit: 3,
        cord: { price_per_unit: 0, delivery_price: 0, unit: 'шт' },
        carabiner: { price_per_unit: 0, delivery_price: 0 },
        _totalSellPerUnit: 20
    }, App.params)`, pendantContext));

    assert.equal(legacyPendantCost.costPerUnit, 15);

    const fallbackContext = createContext();
    stubRuntime(fallbackContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(fallbackContext, file));
    vm.runInContext('delete globalThis.Pendant; globalThis.Intl = undefined;', fallbackContext);
    runScript(fallbackContext, 'js/pendant.js');

    const fallbackState = clone(await vm.runInContext(`(() => {
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.elements = [
            { char: 'А', color: 'red', has_print: false, print_price: 0 },
            { char: '❤', color: 'pink', has_print: false, print_price: 0 },
            { char: '️', color: 'ghost', has_print: false, print_price: 0 },
            { char: '😊', color: 'yellow', has_print: false, print_price: 0 }
        ];
        const chars = Pendant._nameChars('А❤️😊');
        Pendant._syncElements(chars);
        return {
            chars,
            elements: Pendant._wizardData.elements
        };
    })()`, fallbackContext));

    assert.deepEqual(fallbackState.chars, ['А', '❤️', '😊']);
    assert.deepEqual(fallbackState.elements.map(el => el.char), ['А', '❤️', '😊']);
    assert.equal(fallbackState.elements[1].color, 'pink');
    assert.equal(fallbackState.elements[2].color, 'yellow');
}

async function smokePendantStepNavigationSync() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    const navState = clone(await vm.runInContext(`(() => {
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.name = 'OLD';
        Pendant._wizardData.elements = [{ char: 'O', color: 'blue', has_print: false, print_price: 0 }];
        Pendant._wizardStep = 1;
        document.getElementById('pw-qty').value = '10';
        document.getElementById('pw-name').value = 'A ❤️ 😊';
        Pendant._goToStep(2);
        return {
            step: Pendant._wizardStep,
            name: Pendant._wizardData.name,
            chars: Pendant._wizardData.elements.map(el => el.char)
        };
    })()`, pendantContext));

    assert.equal(navState.step, 2);
    assert.equal(navState.name, 'A❤️😊');
    assert.deepEqual(navState.chars, ['A', '❤️', '😊']);

    const staleState = clone(await vm.runInContext(`(() => {
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.name = 'A❤️😊';
        Pendant._wizardData.elements = [
            { char: 'A', color: 'red', has_print: false, print_price: 0 },
            { char: ' ', color: 'ghost', has_print: false, print_price: 0 },
            { char: '❤️', color: 'pink', has_print: false, print_price: 0 },
            { char: '😊', color: 'yellow', has_print: false, print_price: 0 }
        ];
        Pendant._wizardStep = 1;
        document.getElementById('pw-qty').value = '10';
        document.getElementById('pw-name').value = 'A❤️😊';
        Pendant._readCurrentStep();
        return {
            chars: Pendant._wizardData.elements.map(el => el.char),
            colors: Pendant._wizardData.elements.map(el => el.color)
        };
    })()`, pendantContext));

    assert.deepEqual(staleState.chars, ['A', '❤️', '😊']);
    assert.deepEqual(staleState.colors, ['red', 'pink', 'yellow']);
}

async function smokePendantAutoPriceFromBlanks() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    await vm.runInContext(`(() => {
        App.templates = [{
            id: 30,
            category: 'blank',
            custom_prices: { 500: 17 },
            custom_margins: {},
            pieces_per_hour_avg: 100,
            pieces_per_hour_min: 100,
            weight_grams: 5,
            mold_count: 1,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            hw_name: '',
            hw_price_per_unit: 0,
            hw_speed: 0,
        }];
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.name = 'ВВВ❤️❤️';
        Pendant._wizardData.quantity = 100;
        Pendant._syncElements(Pendant._nameChars(Pendant._wizardData.name));
    })()`, pendantContext);

    const autoState = clone(await vm.runInContext(`(() => {
        const html = Pendant._renderStep5();
        return {
            sells: Pendant._wizardData.elements.map(el => el.sell_price),
            autoFlags: Pendant._wizardData.elements.map(el => el.sell_price_auto),
            html
        };
    })()`, pendantContext));

    assert.deepEqual(autoState.sells, [17, 17, 17, 17, 17]);
    assert.deepEqual(autoState.autoFlags, [true, true, true, true, true]);
    assert.match(autoState.html, /value="17"/);

    const manualState = clone(await vm.runInContext(`(() => {
        Pendant._setGroupSellPrice(0, 25);
        Pendant._renderStep5();
        return {
            sells: Pendant._wizardData.elements.map(el => el.sell_price),
            autoFlags: Pendant._wizardData.elements.map(el => el.sell_price_auto)
        };
    })()`, pendantContext));

    assert.deepEqual(manualState.sells, [25, 25, 25, 25, 25]);
    assert.deepEqual(manualState.autoFlags, [false, false, false, false, false]);

    const restoredAutoState = clone(await vm.runInContext(`(() => {
        Pendant._setGroupSellPrice(0, 0);
        Pendant._renderStep5();
        return {
            sells: Pendant._wizardData.elements.map(el => el.sell_price),
            autoFlags: Pendant._wizardData.elements.map(el => el.sell_price_auto)
        };
    })()`, pendantContext));

    assert.deepEqual(restoredAutoState.sells, [17, 17, 17, 17, 17]);
    assert.deepEqual(restoredAutoState.autoFlags, [true, true, true, true, true]);

    const marginFallbackState = clone(await vm.runInContext(`(() => {
        App.params = {
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            taxRate: 0.06,
            packagingHours: 8,
            plasticHours: 8,
            hardwareHours: 8,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
            nfcTagCost: 0,
            nfcWriteSpeed: 1000,
        };
        App.templates = [{
            id: 30,
            category: 'blank',
            custom_prices: {},
            custom_margins: { 500: 0.30 },
            pieces_per_hour_avg: 100,
            pieces_per_hour_min: 100,
            weight_grams: 5,
            mold_count: 1,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            hw_name: '',
            hw_price_per_unit: 0,
            hw_speed: 0,
        }];
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.name = 'ВВВ❤️❤️';
        Pendant._wizardData.quantity = 100;
        Pendant._syncElements(Pendant._nameChars(Pendant._wizardData.name));

        const tierQty = 500;
        const singleMoldCost = (800 * 12.5) + 8000;
        const moldAmortPerUnit = singleMoldCost / 4500;
        const item = {
            quantity: tierQty,
            pieces_per_hour: 100,
            weight_grams: 5,
            extra_molds: 0,
            complex_design: false,
            is_nfc: false,
            nfc_programming: false,
            hardware_qty: 0,
            packaging_qty: 0,
            printing_qty: 0,
            delivery_included: false,
        };
        const result = calculateItemCost(item, App.params);
        const cost = round2(result.costTotal - result.costMoldAmortization + moldAmortPerUnit);
        const expectedSellPrice = Math.ceil((round2(cost / (1 - 0.30) / (1 - 0.06 - 0.05))) / 5) * 5;

        const html = Pendant._renderStep5();
        return {
            sells: Pendant._wizardData.elements.map(el => el.sell_price),
            autoFlags: Pendant._wizardData.elements.map(el => el.sell_price_auto),
            expectedSellPrice,
            html
        };
    })()`, pendantContext));

    assert.deepEqual(
        marginFallbackState.sells,
        Array(5).fill(marginFallbackState.expectedSellPrice)
    );
    assert.deepEqual(marginFallbackState.autoFlags, [true, true, true, true, true]);
    assert.match(
        marginFallbackState.html,
        new RegExp(`value="${marginFallbackState.expectedSellPrice}"`)
    );
}

async function smokeLegacyPendantRestore(context) {
    const legacyNestedPendant = {
        item_type: 'pendant',
        name: 'LEGACY',
        quantity: 7,
        elements: [{ char: 'L' }, { char: 'G' }],
        cord: { name: 'Legacy Cord' },
        carabiner: { name: 'Legacy Carabiner' },
        _totalSellPerUnit: 77,
    };
    const legacyRow = {
        item_number: 400,
        item_type: 'pendant',
        product_name: 'Подвес "LEGACY"',
        quantity: 7,
        cost_total: 20,
        sell_price_item: 77,
        item_data: JSON.stringify({
            item_number: 400,
            item_type: 'pendant',
            product_name: 'Подвес "LEGACY"',
            quantity: 7,
            cost_total: 20,
            sell_price_item: 77,
            item_data: JSON.stringify(legacyNestedPendant),
        }),
    };

    context.__loadOrderData = {
        order: {
            id: 9002,
            order_name: 'Legacy Smoke Order',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'draft',
        },
        items: [clone(legacyRow)],
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);

    await vm.runInContext('Calculator.loadOrder(9002)', context);
    const restored = clone(await vm.runInContext('Calculator.pendants[0]', context));

    assert.equal(restored.name, 'LEGACY');
    assert.equal(restored._totalSellPerUnit, 77);
    assert.equal(restored.cord.name, 'Legacy Cord');
    assert.equal(restored.carabiner.name, 'Legacy Carabiner');
    assert.equal(restored.elements.length, 2);
}

async function smokeReadyGoodsRollback(context) {
    context.__readyGoods = [
        { id: 1, order_id: 42, order_name: 'Smoke Order', product_name: 'Ready Item', qty: 10, cost_per_unit: 15 },
        { id: 2, order_id: 77, order_name: 'Another Order', product_name: 'Keep Item', qty: 3, cost_per_unit: 9 },
    ];
    context.__readyGoodsHistory = [];
    context.loadReadyGoods = async () => clone(context.__readyGoods);
    context.saveReadyGoods = async (items) => { context.__readyGoods = clone(items); };
    context.loadReadyGoodsHistory = async () => clone(context.__readyGoodsHistory);
    context.saveReadyGoodsHistory = async (history) => { context.__readyGoodsHistory = clone(history); };

    const removed = await vm.runInContext(`Warehouse.removeOrderFromReadyGoods(42, 'Smoke Order', 'delivery')`, context);
    assert.equal(removed, 1);
    assert.equal(context.__readyGoods.length, 1);
    assert.equal(context.__readyGoods[0].order_id, 77);
    assert.equal(context.__readyGoodsHistory.length, 1);
    assert.equal(context.__readyGoodsHistory[0].type, 'return_to_order');
    assert.equal(context.__readyGoodsHistory[0].qty, -10);
    assert.match(context.__readyGoodsHistory[0].notes, /completed/i);

    context.__originalMoveOrderToReadyGoods = vm.runInContext('Warehouse.moveOrderToReadyGoods', context);
    context.__originalRemoveOrderFromReadyGoods = vm.runInContext('Warehouse.removeOrderFromReadyGoods', context);
    context.__moveCalls = [];
    context.__removeCalls = [];

    try {
        vm.runInContext(`
            Warehouse.moveOrderToReadyGoods = async (orderId, orderName) => {
                globalThis.__moveCalls.push({ orderId, orderName });
                return 1;
            };
            Warehouse.removeOrderFromReadyGoods = async (orderId, orderName, nextStatus) => {
                globalThis.__removeCalls.push({ orderId, orderName, nextStatus });
                return 1;
            };
        `, context);

        await vm.runInContext(`Orders._syncReadyGoodsByStatus(42, { order_name: 'Smoke Order' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(42, { order_name: 'Smoke Order' }, 'completed', 'delivery')`, context);

        assert.deepEqual(clone(context.__moveCalls), [{ orderId: 42, orderName: 'Smoke Order' }]);
        assert.deepEqual(clone(context.__removeCalls), [{ orderId: 42, orderName: 'Smoke Order', nextStatus: 'delivery' }]);
    } finally {
        vm.runInContext(`
            Warehouse.moveOrderToReadyGoods = globalThis.__originalMoveOrderToReadyGoods;
            Warehouse.removeOrderFromReadyGoods = globalThis.__originalRemoveOrderFromReadyGoods;
        `, context);
    }
}

async function smokeReadyGoodsSalesAndManualAdd(context) {
    context.__readyGoods = [
        {
            id: 11,
            product_name: 'Ready Smoke Product',
            order_name: 'Smoke Order',
            order_id: 42,
            marketplace_set: 'Smoke Set',
            qty: 7,
            cost_per_unit: 19,
            added_at: '2026-03-15T00:00:00.000Z',
        },
    ];
    context.__readyGoodsHistory = [];
    context.__salesRecords = [];
    context.loadReadyGoods = async () => clone(context.__readyGoods);
    context.saveReadyGoods = async (items) => { context.__readyGoods = clone(items); };
    context.loadReadyGoodsHistory = async () => clone(context.__readyGoodsHistory);
    context.saveReadyGoodsHistory = async (history) => { context.__readyGoodsHistory = clone(history); };
    context.loadSalesRecords = async () => clone(context.__salesRecords);
    context.saveSalesRecords = async (records) => { context.__salesRecords = clone(records); };

    context.document.getElementById('rg-wo-product').value = '0';
    context.document.getElementById('rg-wo-qty').value = '3';
    context.document.getElementById('rg-wo-channel').value = 'marketplace';
    context.document.getElementById('rg-wo-revenue').value = '1500';
    context.document.getElementById('rg-wo-payout').value = '1200';
    context.document.getElementById('rg-wo-notes').value = 'WB test';

    await vm.runInContext('Warehouse.doWriteOff()', context);

    assert.equal(context.__readyGoods[0].qty, 4);
    assert.equal(context.__salesRecords.length, 1);
    assert.equal(context.__salesRecords[0].ready_goods_id, 11);
    assert.equal(context.__salesRecords[0].channel, 'marketplace');
    assert.equal(context.__salesRecords[0].qty, 3);
    assert.equal(context.__salesRecords[0].revenue, 1500);
    assert.equal(context.__salesRecords[0].payout, 1200);
    assert.equal(context.__readyGoodsHistory.length, 1);
    assert.equal(context.__readyGoodsHistory[0].type, 'writeoff');
    assert.equal(context.__readyGoodsHistory[0].qty, -3);
    assert.match(context.__readyGoodsHistory[0].notes, /WB test/);

    context.document.getElementById('rg-add-name').value = 'Manual Smoke Product';
    context.document.getElementById('rg-add-qty').value = '5';
    context.document.getElementById('rg-add-cost').value = '22.5';
    context.document.getElementById('rg-add-set').value = 'Manual Set';

    await vm.runInContext('Warehouse.doAddReadyGoods()', context);

    assert.equal(context.__readyGoods.length, 2);
    const manualItem = context.__readyGoods.find(item => item.product_name === 'Manual Smoke Product');
    assert.equal(manualItem.qty, 5);
    assert.equal(manualItem.cost_per_unit, 22.5);
    assert.equal(manualItem.marketplace_set, 'Manual Set');
    assert.equal(context.__readyGoodsHistory.length, 2);
    assert.equal(context.__readyGoodsHistory[1].type, 'manual_add');
    assert.equal(context.__readyGoodsHistory[1].qty, 5);
    assert.match(context.__readyGoodsHistory[1].notes, /Ручное добавление/);
}

async function smokeChinaShipmentMetadata(context) {
    const fieldValues = {
        'wh-sh-name': 'Smoke Shipment',
        'wh-sh-date': '2026-03-16',
        'wh-sh-supplier': 'Smoke Supplier',
        'wh-sh-cny-rate': '12.5',
        'wh-sh-fee-cashout': '5',
        'wh-sh-fee-crypto': '2',
        'wh-sh-fee-1688': '1',
        'wh-sh-delivery-china': '2500',
        'wh-sh-delivery-moscow': '500',
        'wh-sh-total-delivery': '3000',
        'wh-sh-pricing-mode': 'weighted_avg',
        'wh-sh-notes': 'Smoke note',
    };
    Object.entries(fieldValues).forEach(([id, value]) => {
        context.document.getElementById(id).value = value;
    });

    await vm.runInContext(`(async () => {
        Warehouse.editingShipmentId = 55;
        Warehouse.allShipments = [{
            id: 55,
            source: 'china_consolidation',
            status: 'delivered',
            china_purchase_ids: [701],
            china_box_status: 'delivered',
            china_delivery_type: 'air',
            china_estimated_days: 12,
            china_tracking_number: 'TRACK-55',
            china_delivery_estimated_usd: 95,
            waybill_pdf_name: 'waybill.pdf',
            waybill_pdf_data: 'data:application/pdf;base64,AAA',
            customs_fees: 777,
        }];
        Warehouse.shipmentItems = [{
            china_purchase_id: 701,
            purchase_price_cny: 30,
            weight_grams: 120,
            qty_received: 10,
        }];
    })()`, context);

    const shipment = clone(await vm.runInContext('Warehouse._buildShipmentData()', context));
    assert.equal(shipment.source, 'china_consolidation');
    assert.deepEqual(shipment.china_purchase_ids, [701]);
    assert.equal(shipment.china_box_status, 'delivered');
    assert.equal(shipment.china_delivery_type, 'air');
    assert.equal(shipment.china_estimated_days, 12);
    assert.equal(shipment.china_tracking_number, 'TRACK-55');
    assert.equal(shipment.china_delivery_estimated_usd, 95);
    assert.equal(shipment.waybill_pdf_name, 'waybill.pdf');
    assert.equal(shipment.customs_fees, 777);
}

async function smokeChinaReceiptStatusLinkage(context) {
    const fieldValues = {
        'wh-sh-name': 'Receipt Shipment',
        'wh-sh-date': '2026-03-16',
        'wh-sh-supplier': 'Receipt Supplier',
        'wh-sh-cny-rate': '12.5',
        'wh-sh-fee-cashout': '5',
        'wh-sh-fee-crypto': '2',
        'wh-sh-fee-1688': '1',
        'wh-sh-delivery-china': '2500',
        'wh-sh-delivery-moscow': '500',
        'wh-sh-total-delivery': '3000',
        'wh-sh-pricing-mode': 'weighted_avg',
        'wh-sh-notes': 'Receipt note',
    };
    Object.entries(fieldValues).forEach(([id, value]) => {
        context.document.getElementById(id).value = value;
    });

    context.__savedShipment = null;
    context.__savedPurchase = null;
    context.__adjustStockCalls = [];
    context.__warehouseItems = [
        { id: 999, qty: 20, price_per_unit: 11, updated_at: '2026-03-15T00:00:00.000Z' },
    ];
    context.__chinaPurchases = {
        701: {
            id: 701,
            purchase_name: 'Receipt Purchase',
            status: 'delivered',
            delivery_type: 'air',
            tracking_number: 'OLD-TRACK',
            estimated_days: 10,
            status_history: [],
        },
    };

    context.confirm = () => true;
    context.saveShipment = async (shipment) => {
        context.__savedShipment = clone(shipment);
        return shipment.id || 88;
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadChinaPurchase = async (id) => clone(context.__chinaPurchases[id] || null);
    context.saveChinaPurchase = async (purchase) => {
        context.__savedPurchase = clone(purchase);
        context.__chinaPurchases[purchase.id] = clone(purchase);
        return purchase.id;
    };

    context.__originalHideShipmentForm = vm.runInContext('Warehouse.hideShipmentForm', context);
    context.__originalWarehouseLoad = vm.runInContext('Warehouse.load', context);
    context.__originalWarehouseSetView = vm.runInContext('Warehouse.setView', context);
    context.__originalWarehouseAdjustStock = vm.runInContext('Warehouse.adjustStock', context);

    try {
        vm.runInContext(`
            Warehouse.hideShipmentForm = () => {};
            Warehouse.load = async () => {};
            Warehouse.setView = () => {};
            Warehouse.adjustStock = async (itemId, delta, type, refName, note) => {
                globalThis.__adjustStockCalls.push({ itemId, delta, type, refName, note });
            };
            Warehouse.editingShipmentId = 88;
            Warehouse.allShipments = [{
                id: 88,
                status: 'received',
                shipment_name: 'Receipt Shipment',
                source: 'china_consolidation',
                china_purchase_ids: [701],
                china_box_status: 'delivered',
                china_delivery_type: 'air',
                china_estimated_days: 14,
                china_tracking_number: 'TRACK-88',
                china_delivery_estimated_usd: 120,
                delivery_china_to_russia: 2500,
                delivery_moscow: 500,
                customs_fees: 333,
                items: [{
                    warehouse_item_id: 999,
                    qty_received: 10,
                    total_cost_per_unit: 15,
                }],
            }];
            Warehouse.shipmentItems = [{
                warehouse_item_id: 999,
                source: 'existing',
                name: 'Receipt Item',
                category: 'other',
                unit: 'шт',
                qty_received: 10,
                weight_grams: 120,
                purchase_price_cny: 30,
                purchase_price_rub: 0,
                delivery_allocated: 0,
                total_cost_per_unit: 15,
                china_purchase_id: 701,
            }];
        `, context);

        await vm.runInContext('Warehouse.confirmShipment()', context);

        assert.equal(context.__savedShipment.status, 'received');
        assert.equal(context.__savedShipment.source, 'china_consolidation');
        assert.equal(context.__savedShipment.china_box_status, 'received');
        assert.deepEqual(context.__savedShipment.china_purchase_ids, [701]);
        assert.equal(context.__savedShipment.china_tracking_number, 'TRACK-88');
        assert.match(String(context.__savedShipment.received_at || ''), /T/);

        assert.equal(context.__savedPurchase.id, 701);
        assert.equal(context.__savedPurchase.shipment_id, 88);
        assert.equal(context.__savedPurchase.status, 'received');
        assert.equal(context.__savedPurchase.delivery_type, 'air');
        assert.equal(context.__savedPurchase.tracking_number, 'TRACK-88');
        assert.equal(context.__savedPurchase.estimated_days, 14);
        assert.equal(context.__savedPurchase.status_history.slice(-1)[0].status, 'received');
        assert.match(context.__savedPurchase.status_history.slice(-1)[0].note, /Принято на склад/);

        assert.deepEqual(clone(context.__adjustStockCalls), []);
    } finally {
        vm.runInContext(`
            Warehouse.hideShipmentForm = globalThis.__originalHideShipmentForm;
            Warehouse.load = globalThis.__originalWarehouseLoad;
            Warehouse.setView = globalThis.__originalWarehouseSetView;
            Warehouse.adjustStock = globalThis.__originalWarehouseAdjustStock;
        `, context);
    }
}

async function smokeChinaReceiptCreatesMoldAndPromotesOrder(context) {
    const fieldValues = {
        'wh-sh-name': 'Mold Receipt Shipment',
        'wh-sh-date': '2026-03-20',
        'wh-sh-supplier': 'China Mold Supplier',
        'wh-sh-cny-rate': '12.5',
        'wh-sh-fee-cashout': '5',
        'wh-sh-fee-crypto': '2',
        'wh-sh-fee-1688': '1',
        'wh-sh-delivery-china': '2500',
        'wh-sh-delivery-moscow': '500',
        'wh-sh-total-delivery': '3000',
        'wh-sh-pricing-mode': 'weighted_avg',
        'wh-sh-notes': 'Customer mold arrived',
    };
    Object.entries(fieldValues).forEach(([id, value]) => {
        context.document.getElementById(id).value = value;
    });

    context.__savedShipment = null;
    context.__savedPurchase = null;
    context.__savedOrder = null;
    context.__savedOrderItems = null;
    context.__statusUpdates = [];
    context.__orderChangeCalls = [];
    context.__warehouseItems = [];
    context.__warehouseHistory = [];
    context.__chinaPurchases = {
        701: {
            id: 701,
            purchase_name: 'Customer Mold Purchase',
            order_id: 555,
            status: 'in_transit',
            delivery_type: 'air',
            tracking_number: 'MOLD-TRACK',
            estimated_days: 12,
            status_history: [],
        },
    };
    context.__orderDetails = {
        555: {
            order: {
                id: 555,
                order_name: 'Waiting Mold Order',
                manager_name: 'Smoke',
                status: 'sample',
                created_at: '2026-03-19T10:00:00.000Z',
            },
            items: [{
                item_type: 'product',
                product_name: 'Custom Tag',
                quantity: 120,
                is_blank_mold: false,
                base_mold_in_stock: false,
            }],
        },
    };

    context.confirm = () => true;
    context.saveShipment = async (shipment) => {
        shipment.id = shipment.id || 188;
        context.__savedShipment = clone(shipment);
        return shipment.id;
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.saveWarehouseItem = async (item) => {
        const id = 1201 + context.__warehouseItems.length;
        context.__warehouseItems.push({ ...clone(item), id });
        return id;
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };
    context.loadChinaPurchase = async (id) => clone(context.__chinaPurchases[id] || null);
    context.saveChinaPurchase = async (purchase) => {
        context.__savedPurchase = clone(purchase);
        context.__chinaPurchases[purchase.id] = clone(purchase);
        return purchase.id;
    };
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.saveOrder = async (order, items) => {
        context.__savedOrder = clone(order);
        context.__savedOrderItems = clone(items);
        context.__orderDetails[Number(order.id)] = {
            order: clone(order),
            items: clone(items),
        };
        return order.id;
    };
    context.updateOrderStatus = async (orderId, status) => {
        context.__statusUpdates.push({ orderId: Number(orderId), status });
        if (context.__orderDetails[Number(orderId)]) {
            context.__orderDetails[Number(orderId)].order.status = status;
        }
    };

    context.__originalHideShipmentForm = vm.runInContext('Warehouse.hideShipmentForm', context);
    context.__originalWarehouseLoad = vm.runInContext('Warehouse.load', context);
    context.__originalWarehouseSetView = vm.runInContext('Warehouse.setView', context);
    context.__originalOrdersAddChangeRecord = vm.runInContext('Orders.addChangeRecord', context);

    try {
        vm.runInContext(`
            Warehouse.hideShipmentForm = () => {};
            Warehouse.load = async () => {};
            Warehouse.setView = () => {};
            Orders.addChangeRecord = async (orderId, payload) => {
                globalThis.__orderChangeCalls.push({ orderId, payload });
            };
            Warehouse.editingShipmentId = null;
            Warehouse.allShipments = [];
            Warehouse.shipmentItems = [{
                source: 'new',
                category: 'molds',
                mold_type: 'customer',
                name: 'Mold for Waiting Order',
                sku: '',
                unit: 'шт',
                qty_received: 1,
                weight_grams: 320,
                purchase_price_cny: 120,
                purchase_price_rub: 0,
                delivery_allocated: 0,
                total_cost_per_unit: 0,
                china_purchase_id: 701,
            }];
        `, context);

        await vm.runInContext('Warehouse.confirmShipment()', context);

        const moldItem = context.__warehouseItems.find(item => String(item.category) === 'molds');
        assert.ok(moldItem, 'mold warehouse item created');
        assert.equal(context.__savedShipment.status, 'received');
        assert.equal(context.__savedShipment.id, 188);
        assert.equal(moldItem.qty, 1);
        assert.equal(moldItem.mold_type, 'customer');
        assert.equal(moldItem.sku, 'MOLD-CUSTOM-555');
        assert.equal(moldItem.linked_order_id, 555);
        assert.equal(moldItem.linked_order_name, 'Waiting Mold Order');
        assert.equal(moldItem.mold_capacity_total, 1000);
        assert.equal(moldItem.mold_capacity_used, 0);
        assert.equal(moldItem.mold_arrived_at, '2026-03-20');
        assert.ok(String(moldItem.mold_storage_until || '').startsWith('2027-03-'));

        assert.equal(context.__savedPurchase.id, 701);
        assert.equal(context.__savedPurchase.shipment_id, 188);
        assert.equal(context.__savedPurchase.status, 'received');

        assert.equal(context.__savedOrder.id, 555);
        assert.equal(context.__savedOrderItems[0].base_mold_in_stock, true);
        assert.equal(context.__savedOrderItems[0].warehouse_mold_item_id, moldItem.id);
        assert.deepEqual(clone(context.__statusUpdates), [{ orderId: 555, status: 'production_casting' }]);
        assert.equal(context.__orderChangeCalls.length, 1);
        assert.equal(context.__orderChangeCalls[0].payload.old_value, 'sample');
        assert.equal(context.__orderChangeCalls[0].payload.new_value, 'production_casting');
    } finally {
        vm.runInContext(`
            Warehouse.hideShipmentForm = globalThis.__originalHideShipmentForm;
            Warehouse.load = globalThis.__originalWarehouseLoad;
            Warehouse.setView = globalThis.__originalWarehouseSetView;
            Orders.addChangeRecord = globalThis.__originalOrdersAddChangeRecord;
        `, context);
    }
}

async function smokeBlankMoldAutoFieldsWithoutVisibleTemplate(context) {
    context.loadOrders = async () => ([
        { id: 901, order_name: 'Order 901', status: 'sample' },
    ]);
    vm.runInContext(`
        App.templates = [{
            id: 'tmpl-petushok',
            name: 'Петушок',
            category: 'blank',
        }];
        Warehouse.moldOrders = [];
        Warehouse.shipmentItems = [{
            source: 'new',
            category: 'molds',
            mold_type: 'blank',
            name: 'Петушок',
            sku: '',
            linked_order_id: '',
            mold_capacity_total: 0,
            unit: 'шт',
        }];
        Warehouse._syncShipmentMoldDerivedFields(Warehouse.shipmentItems[0]);
    `, context);

    const row = clone(vm.runInContext('Warehouse.shipmentItems[0]', context));
    assert.equal(row.sku, 'MOLD-BLANK-ПЕТУШОК');
    assert.equal(row.mold_capacity_total, 5000);
    assert.equal(row.linked_order_id, '');
    assert.equal(row.template_id, 'tmpl-petushok');
}

async function smokeOrderStatusWarehouseSync(context) {
    const orderData = {
        order: { id: 42, order_name: 'Sync Order', status: 'sample' },
        items: [
            {
                item_type: 'packaging',
                product_name: 'Sync Packaging',
                quantity: 4,
                packaging_source: 'warehouse',
                packaging_warehouse_item_id: 501,
            },
            {
                item_type: 'hardware',
                product_name: 'Sync Hardware',
                quantity: 2,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 601,
            },
        ],
    };

    context.loadOrder = async () => clone(orderData);
    context.__projectHardwareCalls = [];
    context.__savedReservations = null;
    context.__savedHistory = null;
    context.saveWarehouseReservations = async (reservations) => {
        context.__savedReservations = clone(reservations);
    };
    context.saveWarehouseHistory = async (history) => {
        context.__savedHistory = clone(history);
    };
    context.__originalSyncProjectHardwareOrderState = vm.runInContext('Warehouse.syncProjectHardwareOrderState', context);

    try {
        vm.runInContext(`
            Warehouse.syncProjectHardwareOrderState = async (payload) => {
                globalThis.__projectHardwareCalls.push(payload);
            };
        `, context);

        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'sample', 'delivery', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        const payload = clone(context.__projectHardwareCalls[0]);
        assert.equal(payload.status, 'delivery');
        assert.equal(payload.orderId, 42);
        assert.equal(payload.currentItems.length, 2);
        assert.equal(payload.currentItems.find(item => item.item_type === 'packaging').packaging_warehouse_item_id, 501);
        assert.equal(payload.currentItems.find(item => item.item_type === 'hardware').hardware_warehouse_item_id, 601);
        assert.equal(payload.previousItems.length, 2);
        assert.equal(context.__savedReservations, null);
        assert.equal(context.__savedHistory, null);
    } finally {
        vm.runInContext(`
            Warehouse.syncProjectHardwareOrderState = globalThis.__originalSyncProjectHardwareOrderState;
        `, context);
    }
}

async function smokePackagingWarehouseSaveSync(context) {
    const currentItems = [{
        item_type: 'packaging',
        product_name: 'Warehouse Envelope',
        quantity: 100,
        packaging_source: 'warehouse',
        packaging_warehouse_item_id: 501,
        packaging_warehouse_sku: 'ENV-150x90-EGG',
        packaging_assembly_speed: 300,
    }];
    context.__projectHardwareState = { checks: {} };
    context.__savedProjectHardwareState = null;
    context.__savedReservations = [];
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 501,
        name: 'Warehouse Envelope',
        sku: 'ENV-150x90-EGG',
        category: 'packaging',
        qty: 120,
        unit: 'шт',
    }];
    context.__warehouseHistory = [];
    context.__toasts = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__savedProjectHardwareState = clone(state);
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__savedReservations = clone(reservations);
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    try {
        context.__currentPackagingItems = clone(currentItems);
        vm.runInContext(`
            Warehouse.projectHardwareState = null;
            App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        `, context);

        await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
            orderId: 42,
            orderName: 'Packaging Save Sync',
            managerName: 'Smoke',
            status: 'production_packaging',
            currentItems: globalThis.__currentPackagingItems,
            previousItems: []
        })`, context);

        const activeReservation = context.__savedReservations.find(item => item.order_id === 42);
        assert.equal(activeReservation.item_id, 501);
        assert.equal(activeReservation.qty, 100);
        assert.equal(activeReservation.status, 'active');
        assert.equal(activeReservation.source, 'project_hardware');
        assert.equal(context.__warehouseItems[0].qty, 120);
        assert.equal(context.__warehouseHistory.length, 0);
        assert.equal(Boolean(context.__projectHardwareState.checks['42:501']), false);

        context.__savedReservations = [];
        context.__reservations = [];
        context.__warehouseItems = [{ id: 501, qty: 80, unit: 'шт' }];
        context.__warehouseHistory = [];
        context.__toasts = [];
        context.__samplePackagingItems = clone(currentItems);
        await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
            orderId: 42,
            orderName: 'Packaging Sample Save',
            managerName: 'Smoke',
            status: 'production_packaging',
            currentItems: globalThis.__samplePackagingItems,
            previousItems: []
        })`, context);

        const sampleReservation = context.__savedReservations.find(item => item.order_id === 42);
        assert.equal(sampleReservation.item_id, 501);
        assert.equal(sampleReservation.qty, 80);
        assert.equal(sampleReservation.source, 'project_hardware');
        assert.ok(context.__toasts.some(message => /позиций со склада.*полный резерв/i.test(message)));
    } finally {
        vm.runInContext(`
            delete globalThis.__currentPackagingItems;
            delete globalThis.__samplePackagingItems;
        `, context);
        delete context.__currentPackagingItems;
        delete context.__samplePackagingItems;
    }
}

async function smokeWarehouseManualAdjustment(context) {
    context.__warehouseItems = [
        {
            id: 501,
            name: 'Manual Adjust Item',
            sku: 'ADJ-1',
            category: 'other',
            qty: 10,
            price_per_unit: 7,
            updated_at: '2026-03-15T00:00:00.000Z',
        },
    ];
    context.__warehouseHistory = [];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    await vm.runInContext(`Warehouse.adjustStock(501, 4, 'addition', '', 'Ручная правка', 'Smoke')`, context);

    assert.equal(context.__warehouseItems[0].qty, 14);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].type, 'addition');
    assert.equal(context.__warehouseHistory[0].qty_change, 4);
    assert.equal(context.__warehouseHistory[0].qty_before, 10);
    assert.equal(context.__warehouseHistory[0].qty_after, 14);
    assert.match(context.__warehouseHistory[0].notes, /Ручная правка/);

    const clampResult = clone(await vm.runInContext(`Warehouse.adjustStock(501, -20, 'deduction', 'Clamp Order', 'Проверка частичного списания', 'Smoke')`, context));

    assert.equal(clampResult.ok, true);
    assert.equal(clampResult.requestedQtyChange, -20);
    assert.equal(clampResult.appliedQtyChange, -14);
    assert.equal(clampResult.qtyBefore, 14);
    assert.equal(clampResult.qtyAfter, 0);
    assert.equal(clampResult.clamped, true);
    assert.equal(context.__warehouseItems[0].qty, 0);
    assert.equal(context.__warehouseHistory.length, 2);
    assert.equal(context.__warehouseHistory[1].qty_change, -14);
    assert.equal(context.__warehouseHistory[1].requested_qty_change, -20);
    assert.equal(context.__warehouseHistory[1].qty_before, 14);
    assert.equal(context.__warehouseHistory[1].qty_after, 0);
    assert.equal(context.__warehouseHistory[1].clamped, true);
    assert.match(context.__warehouseHistory[1].notes, /Проверка частичного списания/);
}

async function smokeProjectHardwarePersistenceAndBuckets(context) {
    context.__projectHardwareState = {
        checks: {
            '200:504': true,
            '300:501': true,
            '999:999': true,
        },
    };
    context.__savedProjectHardwareState = null;
    context.__savedReservations = null;
    context.__warehouseItems = [
        { id: 501, name: 'Collected Hardware', sku: 'COL-1', qty: 0 },
        { id: 502, name: 'Active Hardware', sku: 'ACT-1', qty: 10 },
        { id: 503, name: 'Sample Hardware', sku: 'SMP-1', qty: 5 },
        { id: 504, name: 'Delivery Hardware', sku: 'DLV-1', qty: 0 },
        { id: 505, name: 'Active Envelope', sku: 'ENV-1', category: 'packaging', qty: 40 },
    ];
    context.__orders = [
        { id: 100, order_name: 'Active Hardware Order', manager_name: 'Маша', status: 'production_hardware', created_at: '2026-03-17T10:00:00.000Z' },
        { id: 200, order_name: 'Collected Delivery Order', manager_name: 'Оля', status: 'delivery', created_at: '2026-03-17T09:30:00.000Z' },
        { id: 300, order_name: 'Collected Hardware Order', manager_name: 'Склад', status: 'completed', created_at: '2026-03-17T09:00:00.000Z' },
        { id: 400, order_name: 'Sample Hardware Order', manager_name: 'Лена', status: 'sample', created_at: '2026-03-17T08:00:00.000Z' },
    ];
    context.__orderDetails = {
        100: {
            order: clone(context.__orders[0]),
            items: [
                {
                    item_type: 'hardware',
                    product_name: 'Active product',
                    quantity: 3,
                    hardware_source: 'warehouse',
                    hardware_warehouse_item_id: 502,
                },
                {
                    item_type: 'packaging',
                    product_name: 'Active envelope',
                    quantity: 2,
                    packaging_source: 'warehouse',
                    packaging_warehouse_item_id: 505,
                },
            ],
        },
        200: {
            order: clone(context.__orders[1]),
            items: [{
                item_type: 'hardware',
                product_name: 'Collected delivery product',
                quantity: 1,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 504,
            }],
        },
        300: {
            order: clone(context.__orders[2]),
            items: [{
                item_type: 'hardware',
                product_name: 'Collected product',
                quantity: 2,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 501,
            }],
        },
        400: {
            order: clone(context.__orders[3]),
            items: [{
                item_type: 'hardware',
                product_name: 'Sample product',
                quantity: 1,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 503,
            }],
        },
    };
    context.__reservations = [{
        id: 1,
        item_id: 503,
        order_id: 400,
        order_name: 'Sample Hardware Order',
        qty: 1,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-17T08:00:00.000Z',
    }];
    context.__warehouseHistory = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__savedProjectHardwareState = clone(state);
        context.__projectHardwareState = clone(state);
    };
    context.loadOrders = async () => clone(context.__orders);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__savedReservations = clone(reservations);
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.allItems = globalThis.__warehouseItems;
        Warehouse.currentView = 'project-hardware';
        Warehouse._viewToken = 77;
    `, context);

    const reconcileResult = clone(await vm.runInContext(`Warehouse.reconcileProjectHardwareReservations()`, context));
    assert.equal(reconcileResult.stateChanged, true);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(200, 504)`, context), true);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(300, 501)`, context), true);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(100, 502)`, context), false);
    assert.equal(Boolean(context.__projectHardwareState.checks['999:999']), false);
    assert.equal(Boolean(context.__projectHardwareState.checks['200:504']), true);
    assert.equal(Boolean(context.__projectHardwareState.checks['300:501']), true);

    context.__warehouseHistory = [];
    const stickyReconcile = clone(await vm.runInContext(`Warehouse.reconcileProjectHardwareReservations()`, context));
    assert.equal(stickyReconcile.stateChanged, false);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(200, 504)`, context), true);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(300, 501)`, context), true);

    await vm.runInContext(`Warehouse.renderProjectHardwareView(77)`, context);
    const html = String(context.document.getElementById('wh-content').innerHTML || '');
    assert.match(html, /Фурнитура и упаковка для проектов \(к сборке\)/);
    assert.match(html, /Уже собрано/);
    assert.match(html, /1 заказ · скрыто из активного списка/);
    assert.match(html, /<details class="card" style="margin-top:12px;">/);
    assert.equal((html.match(/Collected Hardware Order/g) || []).length, 0);
    assert.equal((html.match(/Collected Delivery Order/g) || []).length, 1);
    assert.equal((html.match(/Active Hardware Order/g) || []).length, 1);
    assert.equal((html.match(/Sample Hardware Order/g) || []).length, 1);
    assert.match(html, /Завершенные заказы скрыты автоматически: 1/);
    assert.match(html, /Delivery Hardware/);
    assert.match(html, /Active Hardware/);
    assert.match(html, /Active Envelope/);
    assert.match(html, /Упаковка/);
    assert.match(html, /Собрано 1 из 1/);
    assert.match(html, /Собрано 0 из 2/);
}

async function smokeProjectHardwareToggleShortageGuard(context) {
    const originalWarehouseLoad = vm.runInContext('Warehouse.load', context);
    context.__originalWarehouseLoad = originalWarehouseLoad;
    const baseOrder = {
        id: 42,
        order_name: 'Shortage Project Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-17T11:00:00.000Z',
    };
    const baseDetail = {
        order: clone(baseOrder),
        items: [{
            item_type: 'hardware',
            product_name: 'Shortage Hardware Product',
            quantity: 5,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 501,
        }],
    };

    context.__projectHardwareState = { checks: {} };
    context.__reservations = [{
        id: 1,
        item_id: 501,
        order_id: 42,
        order_name: 'Shortage Project Order',
        qty: 2,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-17T11:00:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 501,
        name: 'Shortage Hardware',
        sku: 'SH-1',
        category: 'hardware',
        qty: 2,
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = { 42: baseDetail };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.__toasts = [];
    vm.runInContext(`App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };`, context);
    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
    `, context);

    try {
        await vm.runInContext(`Warehouse.toggleProjectHardwareReady(42, 501, true)`, context);

        assert.equal(Boolean(context.__projectHardwareState.checks['42:501']), false);
        assert.equal(context.__warehouseItems[0].qty, 2);
        assert.equal(context.__warehouseHistory.length, 0);
        assert.equal(context.__reservations[0].status, 'active');
        assert.ok(context.__toasts.some(message => /не удалось отметить как собрано/i.test(message)));

        context.__projectHardwareState = { checks: { '42:501': true } };
        context.__reservations = [];
        context.__warehouseItems = [{
            id: 501,
            name: 'Shortage Hardware',
            sku: 'SH-1',
            category: 'hardware',
            qty: 0,
            price_per_unit: 10,
        }];
        context.__warehouseHistory = [{
            id: 11,
            item_id: 501,
            item_name: 'Shortage Hardware',
            item_sku: 'SH-1',
            item_category: 'hardware',
            type: 'deduction',
            qty_change: -2,
            requested_qty_change: -5,
            qty_before: 2,
            qty_after: 0,
            unit_price: 10,
            total_cost_change: 20,
            order_id: 42,
            order_name: 'Shortage Project Order',
            notes: 'Списание собранной фурнитуры: 5 шт',
            clamped: true,
            created_at: '2026-03-17T11:05:00.000Z',
            created_by: 'Smoke',
        }];
        context.__toasts = [];
        vm.runInContext(`Warehouse.projectHardwareState = null;`, context);

        await vm.runInContext(`Warehouse.toggleProjectHardwareReady(42, 501, false)`, context);

        assert.equal(Boolean(context.__projectHardwareState.checks['42:501']), false);
        assert.equal(context.__warehouseItems[0].qty, 2);
        assert.equal(context.__warehouseHistory.length, 2);
        assert.equal(context.__warehouseHistory[1].qty_change, 2);
        assert.equal(context.__warehouseHistory[1].requested_qty_change, 2);
        assert.match(context.__warehouseHistory[1].notes, /Возврат собранной позиции на склад: 2 шт/);
        const restoredReservation = context.__reservations.find(item => item.order_id === 42 && item.status === 'active');
        assert.equal(restoredReservation.qty, 2);
        assert.ok(context.__toasts.some(message => /не в полный резерв/i.test(message)));

        context.__projectHardwareState = { checks: { '42:501': true } };
        context.__reservations = [];
        context.__warehouseItems = [{
            id: 501,
            name: 'Shortage Hardware',
            sku: 'SH-1',
            category: 'hardware',
            qty: 0,
        }];
        context.__warehouseHistory = [{
            id: 12,
            item_id: 501,
            item_name: 'Shortage Hardware',
            item_sku: 'SH-1',
            item_category: 'hardware',
            type: 'deduction',
            qty_change: -2,
            requested_qty_change: -5,
            qty_before: 2,
            qty_after: 0,
            unit_price: 10,
            total_cost_change: 20,
            order_id: 42,
            order_name: 'Shortage Project Order',
            notes: 'Списание собранной фурнитуры: 5 шт',
            clamped: true,
            created_at: '2026-03-17T11:05:00.000Z',
            created_by: 'Smoke',
        }];
        context.__orders = [clone(baseOrder)];
        context.__orderDetails = { 42: clone(baseDetail) };
        context.loadOrders = async () => clone(context.__orders);
        context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
        vm.runInContext(`
            Warehouse.projectHardwareState = null;
            Warehouse.allItems = globalThis.__warehouseItems;
        `, context);

        const reconcileResult = clone(await vm.runInContext(`Warehouse.reconcileProjectHardwareReservations()`, context));

        assert.equal(reconcileResult.stateChanged, true);
        assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(42, 501)`, context), false);
    } finally {
        context.__toasts = [];
        vm.runInContext(`
            Warehouse.load = globalThis.__originalWarehouseLoad;
            delete globalThis.__originalWarehouseLoad;
        `, context);
    }
}

async function smokeProjectHardwareLegacyQtyAndStringIdDeduction(context) {
    const order = {
        id: 91,
        order_name: 'Legacy Hardware Qty Order',
        manager_name: 'Склад',
        status: 'production_hardware',
        created_at: '2026-03-18T11:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'hardware',
            product_name: 'Legacy Hardware Qty',
            hardware_qty: 3,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: '501',
        }],
    };

    context.__projectHardwareState = { checks: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: '501',
        name: 'Legacy Hardware Qty',
        sku: 'LHQ-1',
        category: 'hardware',
        qty: 10,
        price_per_unit: 15,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = { 91: clone(detail) };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
    `, context);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 91,
        orderName: 'Legacy Hardware Qty Order',
        managerName: 'Склад',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(detail.items))}),
        previousItems: []
    })`, context);

    assert.equal(context.__reservations.length, 1);
    assert.equal(Number(context.__reservations[0].item_id), 501);
    assert.equal(context.__reservations[0].qty, 3);
    assert.equal(context.__reservations[0].status, 'active');

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(91, 501, true)`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['91:501']), true);
    assert.equal(context.__warehouseItems[0].qty, 7);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_change, -3);
    assert.equal(context.__warehouseHistory[0].requested_qty_change, -3);
    assert.equal(context.__warehouseHistory[0].project_hardware_flow, 'ready_toggle');
    assert.match(context.__warehouseHistory[0].notes, /Списание собранной позиции со склада: 3 шт/);
    assert.equal(context.__reservations[0].status, 'released');
}

async function smokeCompletedOrderConsumesBlankMoldCapacity(context) {
    const orderItems = [{
        item_type: 'product',
        product_name: 'Петушок',
        quantity: 600,
        is_blank_mold: true,
        template_id: 'tmpl-petushok',
    }];

    vm.runInContext(`
        App.templates = [{
            id: 'tmpl-petushok',
            name: 'Петушок',
            category: 'blank',
        }];
    `, context);

    context.__projectHardwareState = { checks: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 910,
        name: 'Петушок',
        sku: 'MOLD-BLANK-1',
        category: 'molds',
        mold_type: 'blank',
        template_id: '',
        mold_capacity_total: 5000,
        mold_capacity_used: 100,
        qty: 1,
        price_per_unit: 0,
        updated_at: '2026-03-20T00:00:00.000Z',
    }];
    context.__warehouseHistory = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
        globalThis.__completedMoldItems = ${JSON.stringify(orderItems)};
    `, context);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 777,
        orderName: 'Blank Mold Completed',
        managerName: 'Smoke',
        status: 'completed',
        currentItems: globalThis.__completedMoldItems,
        previousItems: globalThis.__completedMoldItems
    })`, context);

    assert.equal(context.__warehouseItems[0].mold_capacity_used, 700);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].mold_flow, 'usage_completed');
    assert.equal(context.__warehouseHistory[0].mold_usage_change, 600);
    assert.match(context.__warehouseHistory[0].notes, /Списание ресурса молда/);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 777,
        orderName: 'Blank Mold Completed',
        managerName: 'Smoke',
        status: 'production_casting',
        currentItems: globalThis.__completedMoldItems,
        previousItems: globalThis.__completedMoldItems
    })`, context);

    assert.equal(context.__warehouseItems[0].mold_capacity_used, 100);
    assert.equal(context.__warehouseHistory.length, 2);
    assert.equal(context.__warehouseHistory[1].mold_flow, 'usage_completed');
    assert.equal(context.__warehouseHistory[1].mold_usage_change, -600);
    assert.match(context.__warehouseHistory[1].notes, /Возврат ресурса молда/);

    vm.runInContext('delete globalThis.__completedMoldItems', context);
}

async function smokeMoldUsageThresholdCreatesTasksWithoutDuplicates(context) {
    const orderItems = [{
        item_type: 'product',
        product_name: 'Петушок',
        quantity: 600,
        is_blank_mold: true,
        template_id: 'tmpl-petushok',
    }];

    vm.runInContext(`
        App.currentEmployeeId = 9001;
        App.getCurrentEmployeeName = () => 'Smoke';
        App.templates = [{
            id: 'tmpl-petushok',
            name: 'Петушок',
            category: 'blank',
        }];
    `, context);

    context.__projectHardwareState = { checks: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 911,
        name: 'Петушок',
        sku: 'MOLD-BLANK-PETUSHOK',
        category: 'molds',
        mold_type: 'blank',
        template_id: '',
        mold_capacity_total: 5000,
        mold_capacity_used: 3900,
        qty: 1,
        price_per_unit: 0,
        updated_at: '2026-03-20T00:00:00.000Z',
    }];
    context.__warehouseHistory = [];
    context.__savedTasks = [];
    context.__taskEvents = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };
    context.loadEmployees = async () => ([
        { id: 1772827635013, name: 'Леша' },
        { id: 1741700002000, name: 'Анастасия' },
    ]);
    context.loadWorkAreas = async () => ([
        { id: 9103, slug: 'warehouse', name: 'Склад' },
        { id: 9104, slug: 'china', name: 'China' },
        { id: 9107, slug: 'general', name: 'Общее' },
    ]);
    context.saveWorkTask = async (task) => {
        const saved = {
            id: context.__savedTasks.length + 1,
            ...clone(task),
        };
        context.__savedTasks.push(saved);
        return saved;
    };
    context.TaskEvents = {
        emit: async (eventType, payload) => {
            context.__taskEvents.push({ eventType, payload: clone(payload) });
            return { id: context.__taskEvents.length };
        },
    };

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
        globalThis.__thresholdMoldItems = ${JSON.stringify(orderItems)};
    `, context);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 778,
        orderName: 'Threshold Mold Order',
        managerName: 'Smoke',
        status: 'completed',
        currentItems: globalThis.__thresholdMoldItems,
        previousItems: globalThis.__thresholdMoldItems
    })`, context);

    assert.equal(context.__warehouseItems[0].mold_capacity_used, 4500);
    assert.deepEqual(context.__warehouseItems[0].mold_alerted_thresholds, [4000]);
    assert.equal(context.__savedTasks.length, 2);
    assert.match(context.__savedTasks[0].title, /Проверить пригодность молда/);
    assert.match(context.__savedTasks[1].title, /Согласовать повтор молда/);
    assert.equal(context.__savedTasks[0].assignee_id, 1772827635013);
    assert.equal(context.__savedTasks[1].assignee_id, 1741700002000);
    assert.equal(context.__savedTasks[1].reviewer_id, 1772827635013);
    assert.equal(context.__savedTasks[0].warehouse_item_id, 911);
    assert.equal(context.__savedTasks[0].order_id, 778);
    assert.equal(context.__taskEvents.length, 2);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 778,
        orderName: 'Threshold Mold Order',
        managerName: 'Smoke',
        status: 'completed',
        currentItems: globalThis.__thresholdMoldItems,
        previousItems: globalThis.__thresholdMoldItems
    })`, context);

    assert.equal(context.__savedTasks.length, 2);
    assert.equal(context.__taskEvents.length, 2);

    vm.runInContext('delete globalThis.__thresholdMoldItems', context);
}

async function smokeProjectHardwareLegacyStatusRepair(context) {
    const order = {
        id: 77,
        order_name: 'Legacy Envelope Order',
        manager_name: 'Склад',
        status: 'production_packaging',
        created_at: '2026-03-17T11:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'packaging',
            product_name: 'Legacy Envelope',
            quantity: 100,
            packaging_source: 'warehouse',
            packaging_warehouse_item_id: 501,
        }],
    };

    context.__projectHardwareState = { checks: { '77:501': true } };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 501,
        name: 'Legacy Envelope',
        sku: 'ENV-LEG',
        category: 'packaging',
        qty: 465,
        price_per_unit: 5,
    }];
    context.__warehouseHistory = [{
        id: 1,
        item_id: 501,
        item_name: 'Legacy Envelope',
        item_sku: 'ENV-LEG',
        item_category: 'packaging',
        type: 'deduction',
        qty_change: -100,
        requested_qty_change: -100,
        qty_before: 565,
        qty_after: 465,
        unit_price: 5,
        total_cost_change: 500,
        order_id: 77,
        order_name: 'Legacy Envelope Order',
        notes: 'Списание при смене статуса: Черновик → Производство: Упаковка',
        clamped: false,
        created_at: '2026-03-17T11:02:00.000Z',
        created_by: 'Smoke',
    }];
    context.__orders = [clone(order)];
    context.__orderDetails = { 77: clone(detail) };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadOrders = async () => clone(context.__orders);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.allItems = globalThis.__warehouseItems;
    `, context);

    const reconcileResult = clone(await vm.runInContext(`Warehouse.reconcileProjectHardwareReservations()`, context));

    assert.equal(reconcileResult.stateChanged, true);
    assert.equal(context.__warehouseItems[0].qty, 565);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(77, 501)`, context), false);
    assert.equal(Boolean(context.__projectHardwareState.checks['77:501']), false);
    assert.equal(context.__warehouseHistory.length, 2);
    assert.match(context.__warehouseHistory[1].notes, /Автоисправление legacy-списания проектной позиции: \+100 шт/);
    assert.equal(context.__warehouseHistory[1].project_hardware_flow, 'legacy_status_repair');
    const reservation = context.__reservations.find(item => item.order_id === 77 && item.status === 'active');
    assert.equal(reservation.item_id, 501);
    assert.equal(reservation.qty, 100);
  }

async function smokeProjectHardwareLegacyAndCollectedNetting(context) {
    const order = {
        id: 88,
        order_name: 'Collected Cord Order',
        manager_name: 'Склад',
        status: 'delivery',
        created_at: '2026-03-17T11:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'hardware',
            product_name: 'Collected Cord',
            quantity: 100,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 601,
        }],
    };

    context.__projectHardwareState = { checks: { '88:601': true } };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 601,
        name: 'Collected Cord',
        sku: 'CORD-1',
        category: 'hardware',
        qty: 343,
        price_per_unit: 30,
    }];
    context.__warehouseHistory = [
        {
            id: 1,
            item_id: 601,
            item_name: 'Collected Cord',
            item_sku: 'CORD-1',
            item_category: 'hardware',
            type: 'deduction',
            qty_change: -100,
            requested_qty_change: -100,
            qty_before: 543,
            qty_after: 443,
            unit_price: 30,
            total_cost_change: 3000,
            order_id: 88,
            order_name: 'Collected Cord Order',
            notes: 'Списание при смене статуса: Черновик → Производство: Выливание',
            clamped: false,
            created_at: '2026-03-17T10:02:00.000Z',
            created_by: 'Smoke',
        },
        {
            id: 2,
            item_id: 601,
            item_name: 'Collected Cord',
            item_sku: 'CORD-1',
            item_category: 'hardware',
            type: 'deduction',
            qty_change: -100,
            requested_qty_change: -100,
            qty_before: 443,
            qty_after: 343,
            unit_price: 30,
            total_cost_change: 3000,
            order_id: 88,
            order_name: 'Collected Cord Order',
            notes: 'Списание собранной позиции со склада: 100 шт',
            clamped: false,
            created_at: '2026-03-17T10:15:00.000Z',
            created_by: 'Smoke',
        },
    ];
    context.__orders = [clone(order)];
    context.__orderDetails = { 88: clone(detail) };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadOrders = async () => clone(context.__orders);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.allItems = globalThis.__warehouseItems;
    `, context);

    const reconcileResult = clone(await vm.runInContext(`Warehouse.reconcileProjectHardwareReservations()`, context));

    assert.equal(reconcileResult.stateChanged, false);
    assert.equal(context.__warehouseItems[0].qty, 443);
    assert.equal(vm.runInContext(`Warehouse._isProjectHardwareReady(88, 601)`, context), true);
    assert.equal(Boolean(context.__projectHardwareState.checks['88:601']), true);
    assert.equal(context.__warehouseHistory.length, 3);
    assert.match(context.__warehouseHistory[2].notes, /Автоисправление legacy-списания проектной позиции: \+100 шт/);
    assert.equal(context.__warehouseHistory[2].project_hardware_flow, 'legacy_status_repair');
    assert.equal(context.__reservations.length, 0);
}

async function smokeOrderDetailColorRendering(context) {
    const rendered = String(await vm.runInContext(`(() => {
        const rawProduct = {
            item_type: 'product',
            product_name: 'Color Smoke Product',
            quantity: 3,
            cost_total: 18,
            sell_price_item: 27,
            color_id: 12,
            color_name: 'Красный',
            colors: JSON.stringify([
                { id: 12, name: 'Красный' },
                { id: 13, name: 'Синий' },
            ]),
            color_solution_attachment: JSON.stringify({
                name: 'palette.pdf',
                type: 'application/pdf',
                data_url: 'data:application/pdf;base64,AAA',
            }),
        };
        return OrderDetail._renderItemCard(rawProduct, 'product');
    })()`, context));

    assert.match(rendered, /Цвета:/);
    assert.match(rendered, /Красный/);
    assert.match(rendered, /Синий/);
    assert.match(rendered, /palette\.pdf/);
    assert.match(rendered, /download="palette\.pdf"/);

    const legacyRendered = String(await vm.runInContext(`(() => {
        const legacyProduct = {
            item_type: 'product',
            product_name: 'Legacy Color Product',
            quantity: 1,
            cost_total: 5,
            sell_price_item: 9,
            color_id: 77,
            color_name: 'Лайм',
        };
        return OrderDetail._renderItemCard(legacyProduct, 'product');
    })()`, context));

    assert.match(legacyRendered, /Лайм/);
}

async function main() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js'].forEach(file => runScript(context, file));
    stubRuntime(context);

    await smokeCalculatorPersistence(context);
    await smokeHardwareOnlyAutosave(context);
    await smokePackagingWarehousePickerDefaults(context);
    await smokePendantWarehousePickerRichUI();
    await smokePendantIgnoresSpaces();
    await smokePendantStepNavigationSync();
    await smokePendantAutoPriceFromBlanks();
    await smokeLegacyPendantRestore(context);
    await smokeReadyGoodsRollback(context);
    await smokeReadyGoodsSalesAndManualAdd(context);
    await smokeChinaShipmentMetadata(context);
    await smokeChinaReceiptStatusLinkage(context);
    await smokeChinaReceiptCreatesMoldAndPromotesOrder(context);
    await smokeBlankMoldAutoFieldsWithoutVisibleTemplate(context);
    await smokeOrderStatusWarehouseSync(context);
    await smokePackagingWarehouseSaveSync(context);
    await smokeWarehouseManualAdjustment(context);
    await smokeProjectHardwarePersistenceAndBuckets(context);
    await smokeProjectHardwareToggleShortageGuard(context);
    await smokeProjectHardwareLegacyQtyAndStringIdDeduction(context);
    await smokeCompletedOrderConsumesBlankMoldCapacity(context);
    await smokeMoldUsageThresholdCreatesTasksWithoutDuplicates(context);
    await smokeProjectHardwareLegacyStatusRepair(context);
    await smokeProjectHardwareLegacyAndCollectedNetting(context);
    await smokeOrderDetailColorRendering(context);

    console.log('order-flow smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

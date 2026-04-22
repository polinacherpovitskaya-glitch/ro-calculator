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
                taxRate: 0.12,
                packagingHours: 8,
                plasticHours: 8,
                hardwareHours: 8,
            },
        },
        Colors: { data: [] },
        Settings: { getTimingData: () => [] },
        Pendant: { renderAllCards() {} },
        refreshTemplatesFromMolds() {},
        KPGenerator: { generate: async () => {} },
        STATUS_OPTIONS: [],
        loadHwBlanks: async () => [],
        loadPkgBlanks: async () => [],
        loadWarehouseReservations: async () => [],
        saveWarehouseReservations: async () => {},
        loadWarehouseItems: async () => [],
        saveWarehouseItem: async () => {},
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
            taxRate: 0.12,
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
        Calculator.items[0].color_solution_attachment = [
            {
                name: 'palette.pdf',
                type: 'application/pdf',
                data_url: 'data:application/pdf;base64,AAA',
                size: 1234,
            },
            {
                name: 'reference.png',
                type: 'image/png',
                data_url: 'data:image/png;base64,BBB',
                size: 4321,
            },
        ];
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
            cords: [
                { name: 'Smoke Cord', unit: 'м', length_cm: 80, price_per_unit: 12, delivery_price: 1, assembly_speed: 60, qty_per_pendant: 1, allocated_qty: 2 },
                { name: 'Smoke Cord 2', unit: 'шт', price_per_unit: 4, delivery_price: 0, assembly_speed: 0, qty_per_pendant: 2, allocated_qty: 3 },
            ],
            carabiners: [
                { name: 'Smoke Carabiner', price_per_unit: 2, delivery_price: 0.5, assembly_speed: 120, qty_per_pendant: 1, allocated_qty: 2 },
                { name: 'Smoke Carabiner 2', price_per_unit: 3, delivery_price: 0.5, assembly_speed: 0, qty_per_pendant: 2, allocated_qty: 3 },
            ],
            cord: { name: 'Smoke Cord', unit: 'м', length_cm: 80, price_per_unit: 12, delivery_price: 1, assembly_speed: 60, qty_per_pendant: 1, allocated_qty: 2 },
            cord_length_cm: 80,
            carabiner: { name: 'Smoke Carabiner', price_per_unit: 2, delivery_price: 0.5, assembly_speed: 120, qty_per_pendant: 1, allocated_qty: 2 },
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
    const savedAttachments = JSON.parse(productRow.color_solution_attachment);
    assert.equal(Array.isArray(savedAttachments), true);
    assert.equal(savedAttachments.length, 2);
    assert.equal(savedAttachments[0].name, 'palette.pdf');
    assert.equal(savedAttachments[1].name, 'reference.png');

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
            discount_mode: 'percent',
            discount_value: 10,
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
        discountMode: Calculator.discountMode,
        discountValue: Calculator.discountValue,
    })`, context));

    assert.equal(restored.product.color_id, 12);
    assert.equal(restored.product.color_name, 'Красный');
    assert.equal(Array.isArray(restored.product.colors), true);
    assert.equal(restored.product.colors.length, 2);
    assert.equal(restored.product.colors[1].name, 'Синий');
    assert.equal(Array.isArray(restored.product.color_solution_attachment), true);
    assert.equal(restored.product.color_solution_attachment.length, 2);
    assert.equal(restored.product.color_solution_attachment[0].name, 'palette.pdf');
    assert.equal(restored.product.color_solution_attachment[1].name, 'reference.png');

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
    assert.equal(restored.pendant.cords.length, 2);
    assert.equal(restored.pendant.carabiners.length, 2);
    assert.equal(restored.pendant.cords[0].allocated_qty, 2);
    assert.equal(restored.pendant.cords[1].qty_per_pendant, 2);
    assert.equal(restored.pendant.cords[1].allocated_qty, 3);
    assert.equal(restored.pendant.carabiners[1].allocated_qty, 3);
    assert.equal(restored.pendant.elements.length, 3);
    assert.equal(restored.discountMode, 'percent');
    assert.equal(restored.discountValue, 10);

    const selectedWarehouseItem = clone(vm.runInContext(`
        Warehouse._findInGrouped({
            packaging: { items: [{ id: 701, name: 'Warehouse Envelope', available_qty: 20, unit: 'шт', price_per_unit: 15.48 }] }
        }, '701')
    `, context));
    assert.equal(selectedWarehouseItem.id, 701);
}

async function smokeEmptyPlaceholderProductIsNotSaved(context) {
    const items = clone(await vm.runInContext(`(async () => {
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(null), {
            source: 'warehouse',
            warehouse_item_id: 901,
            warehouse_sku: 'TR-050-WH',
            name: 'Трос · 50 см · белый',
            qty: 60,
            result: { costPerUnit: 5, hoursHardware: 0.5 },
        })];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        return Calculator._collectItemsForSave();
    })()`, context));

    assert.equal(items.some(item => item.item_type === 'product'), false);
    assert.equal(items.filter(item => item.item_type === 'hardware').length, 1);
}

async function smokeOrderDiscountAffectsSummaryAndFinDirector(context) {
    const data = clone(await vm.runInContext(`(() => {
        const params = { ...App.params, taxRate: 0.12, vatRate: 0.05, charityRate: 0.01 };
        const items = [{
            quantity: 1,
            sell_price_item: 100,
            sell_price_printing: 0,
            result: { costTotal: 50 },
            printings: [],
        }];
        return {
            amountSummary: calculateOrderSummary(items, [], [], [], params, [], { mode: 'amount', value: 10 }),
            percentSummary: calculateOrderSummary(items, [], [], [], params, [], { mode: 'percent', value: 10 }),
            fin: calculateFinDirectorData(items, [], [], params, [], { mode: 'amount', value: 10 }),
        };
    })()`, context));

    assert.equal(data.amountSummary.grossRevenue, 100);
    assert.equal(data.amountSummary.discountAmount, 10);
    assert.equal(data.amountSummary.discountPercent, 10);
    assert.equal(data.amountSummary.totalRevenue, 90);
    assert.equal(data.amountSummary.vatOnRevenue, 4.5);
    assert.equal(data.amountSummary.totalWithVat, 94.5);
    assert.equal(data.amountSummary.totalEarned, 22.12);

    assert.equal(data.percentSummary.discountAmount, 10);
    assert.equal(data.percentSummary.totalRevenue, 90);

    assert.equal(data.fin.grossRevenue, 100);
    assert.equal(data.fin.discountAmount, 10);
    assert.equal(data.fin.revenue, 90);
    assert.equal(data.fin.taxes, 10.8);
    assert.equal(data.fin.commercial, 6.14);
    assert.equal(data.fin.charity, 0.95);
}

async function smokeDiscountShownInCustomerInvoice(context) {
    await vm.runInContext(`(() => {
        Calculator.resetForm();
        Calculator.discountMode = 'amount';
        Calculator.discountValue = 30;
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.items[0].product_name = 'Smoke Product';
        Calculator.items[0].quantity = 2;
        Calculator.items[0].sell_price_item = 100;
        Calculator.items[0].result = {
            costTotal: 50,
            costPrinting: 0,
            costPrintingDetails: [],
        };
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        Calculator.renderOrderInvoice(App.params, '', document.getElementById('calc-pricing-content'));
    })()`, context);

    const invoiceHtml = String(vm.runInContext(`document.getElementById('calc-pricing-content').innerHTML`, context));
    assert.match(invoiceHtml, /Скидка/i);
    assert.match(invoiceHtml, /Итого после скидки/i);
}

async function smokeCalculatorSupportsMoreThanSixItems(context) {
    const state = clone(await vm.runInContext(`(() => {
        Calculator.resetForm();
        Calculator.renderItemBlock = () => {};
        Calculator._updateItemsEmptyState = () => {};
        for (let i = 0; i < 14; i += 1) {
            Calculator.addItem();
        }
        const btn = document.getElementById('calc-add-item-btn');
        return {
            count: Calculator.items.length,
            lastNumber: Calculator.items[13]?.item_number || 0,
            btnDisplay: btn ? btn.style.display : '',
        };
    })()`, context));

    assert.equal(state.count, 14);
    assert.equal(state.lastNumber, 14);
    assert.notEqual(state.btnDisplay, 'none');
}

async function smokeRemovedPrintingDoesNotLeakIntoInvoiceOrSummary(context) {
    const summary = clone(await vm.runInContext(`(() => {
        Calculator.resetForm();
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.items[0].product_name = 'Ласты для плавания';
        Calculator.items[0].quantity = 200;
        Calculator.items[0].sell_price_item = 630;
        Calculator.items[0].sell_price_printing = 150;
        Calculator.items[0].printings = [{ name: '', qty: 0, price: 0, sell_price: 0, delivery_total: 0 }];
        Calculator.items[0].result = {
            costTotal: 400,
            costPrinting: 0,
            costPrintingDetails: [],
        };
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        Calculator.renderOrderInvoice(App.params, '', document.getElementById('calc-pricing-content'));
        return calculateOrderSummary(Calculator.items, [], [], [], App.params, [], { mode: 'none', value: 0 });
    })()`, context));

    const invoiceHtml = String(vm.runInContext(`document.getElementById('calc-pricing-content').innerHTML`, context));
    assert.doesNotMatch(invoiceHtml, /Нанесение/i);
    assert.equal(summary.grossRevenue, 126000);
    assert.equal(summary.totalRevenue, 126000);
}

async function smokeGenerateKPPassesDiscount(context) {
    await vm.runInContext(`(async () => {
        globalThis.__kpArgs = null;
        KPGenerator.generate = async (...args) => { globalThis.__kpArgs = args; };
        Calculator.resetForm();
        document.getElementById('calc-order-name').value = 'КП со скидкой';
        document.getElementById('calc-client-name').value = 'Smoke Client';
        Calculator.discountMode = 'percent';
        Calculator.discountValue = 10;
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.items[0].product_name = 'Smoke Product';
        Calculator.items[0].quantity = 2;
        Calculator.items[0].sell_price_item = 100;
        Calculator.items[0].result = {
            costTotal: 50,
            costPrinting: 0,
            costPrintingDetails: [],
        };
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        await Calculator.generateKP();
    })()`, context);

    const kpArgs = clone(await vm.runInContext(`globalThis.__kpArgs`, context));
    assert.equal(kpArgs.length, 6);
    assert.equal(kpArgs[5].discount.mode, 'percent');
    assert.equal(kpArgs[5].discount.value, 10);
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

async function smokeZeroCostWarehouseHardwareStillShowsInPricing(context) {
    vm.runInContext(`
        App.getItemOriginLabel = () => 'кастом';
        Calculator.resetForm();

        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.items[0].product_name = 'Smoke Product';
        Calculator.items[0].quantity = 10;
        Calculator.items[0].result = {
            costTotal: 120,
            costPrinting: 0,
            costPrintingDetails: [],
        };

        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(null), {
            source: 'warehouse',
            name: 'Хуп · 2 см · серебро',
            warehouse_item_id: 701,
            warehouse_sku: 'HP-020-SVL',
            qty: 50,
            price: 0,
            delivery_total: 0,
            delivery_price: 0,
            sell_price: 0,
            result: { costPerUnit: 0, hoursHardware: 0 },
        })];

        Calculator.packagingItems = [Object.assign(Calculator.getEmptyPackaging(null), {
            source: 'warehouse',
            name: 'Крафт-конверт',
            warehouse_item_id: 801,
            warehouse_sku: 'ENV-KRAFT-01',
            qty: 25,
            price: 0,
            delivery_total: 0,
            delivery_price: 0,
            sell_price: 0,
            result: { costPerUnit: 0, hoursPackaging: 0 },
        })];
        Calculator.extraCosts = [];
        Calculator.pendants = [];

        document.getElementById('calc-pricing').style.display = 'none';
        document.getElementById('calc-pricing-content').innerHTML = '';

        Calculator.renderPricingCard(App.params);
    `, context);

    const pricingDisplay = vm.runInContext(`document.getElementById('calc-pricing').style.display`, context);
    const pricingHtml = String(vm.runInContext(`document.getElementById('calc-pricing-content').innerHTML`, context));

    assert.equal(pricingDisplay, '');
    assert.match(pricingHtml, /Общая фурнитура/);
    assert.match(pricingHtml, /Хуп · 2 см · серебро/);
    assert.match(pricingHtml, /sell-hw-0/);
    assert.match(pricingHtml, /Общая упаковка/);
    assert.match(pricingHtml, /Крафт-конверт/);
    assert.match(pricingHtml, /sell-pkg-0/);
    assert.match(pricingHtml, /pricing-grid-compact/);
}

async function smokeLoadOrderHydratesZeroWarehousePriceFromCurrentStock(context) {
    context.__loadOrderData = {
        order: {
            id: 9011,
            order_name: 'Warehouse Price Recovery Order',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'completed',
        },
        items: [{
            item_type: 'hardware',
            product_name: 'Карабины · 5 см · красный',
            quantity: 35,
            hardware_source: 'warehouse',
            hardware_price_per_unit: 0,
            hardware_delivery_total: 0,
            hardware_assembly_speed: 0,
            hardware_warehouse_item_id: 501,
            hardware_warehouse_sku: '',
        }],
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
        Calculator._ensureWhPickerData = async function () {
            this._whPickerData = {
                carabiners: {
                    label: 'Карабины',
                    items: [{
                        id: 501,
                        name: 'Карабины',
                        sku: 'CR-STD-050-RD',
                        size: '5 см',
                        color: 'красный',
                        price_per_unit: 10,
                        available_qty: 355,
                    }],
                },
            };
            return this._whPickerData;
        };
    `, context);

    await vm.runInContext('Calculator.loadOrder(9011)', context);
    const restored = clone(await vm.runInContext('Calculator.hardwareItems[0]', context));

    assert.equal(restored.price, 10);
    assert.equal(restored.warehouse_sku, 'CR-STD-050-RD');
    assert.equal(restored.name, 'Карабины · 5 см · красный');
}

async function smokeOrderListAndDetailUseLiveFinancialSnapshot(context) {
    const state = clone(await vm.runInContext(`(() => {
        App.templates = [{
            id: 77,
            name: 'Live Blank',
            pieces_per_hour_avg: 200,
            pieces_per_hour_min: 200,
            weight_grams: 8,
            hw_name: '',
            hw_price_per_unit: 0,
            hw_delivery_total: 0,
            hw_speed: 0,
        }];
        App.params = {
            ...App.params,
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
            nfcTagCost: 0,
            nfcWriteSpeed: 1000,
            taxRate: 0.12,
            vatRate: 0.05,
            charityRate: 0.01,
            deliveryCostMoscow: 0,
        };

        const order = {
            id: 77,
            order_name: 'Live Snapshot Order',
            payment_status: 'paid_100',
            total_revenue_plan: 1000,
            margin_percent_plan: 5,
            total_hours_plan: 99,
            discount_mode: 'none',
            discount_value: 0,
        };
        const items = [{
            item_type: 'product',
            template_id: 77,
            quantity: 100,
            pieces_per_hour: 50,
            weight_grams: 20,
            sell_price_item: 150,
            printings: [],
        }];

        const snapshot = getOrderLiveCalculatorSnapshot(order, items, App.params, App.templates);

        Orders.metaByOrderId = {
            77: {
                financial: {
                    revenue: snapshot.revenue,
                    marginPercent: snapshot.marginPercent,
                    hours: snapshot.hours,
                },
            },
        };
        const boardHtml = Orders.renderBoardCard(order);

        OrderDetail.currentOrder = order;
        OrderDetail.currentItems = items;
        OrderDetail.renderStats();

        return {
            snapshot,
            formattedMargin: formatPercent(snapshot.marginPercent),
            formattedHours: snapshot.hours.toFixed(1) + ' ч',
            boardHtml,
            statsHtml: document.getElementById('od-stats').innerHTML,
        };
    })()`, context));

    assert.ok(state.snapshot.marginPercent > 5, 'live snapshot should differ from stale saved margin');
    assert.ok(state.snapshot.hours < 99, 'live snapshot should use current template productivity');
    assert.match(state.boardHtml, new RegExp(state.formattedMargin.replace('.', '[,.]')));
    assert.match(state.statsHtml, new RegExp(state.formattedMargin.replace('.', '[,.]')));
    assert.match(state.statsHtml, new RegExp(state.formattedHours.replace('.', '[,.]')));
}

async function smokeBlankPricingSeparatesCatalogPriceAndNetMargin(context) {
    vm.runInContext(`
        App.getItemOriginLabel = (item) => item?.is_blank_mold ? 'бланк' : 'кастом';
        App.templates = [{
            id: 'blank-price-smoke',
            name: 'Blank Smoke',
            custom_prices: { 500: 210 },
            custom_margins: {},
        }];
        Calculator.resetForm();
        Calculator._calcBlankBaseCostFromTemplate = () => 108.25;

        Calculator.items = [Calculator.getEmptyItem(1), Calculator.getEmptyItem(2)];

        Calculator.items[0].product_name = 'Blank Smoke Product';
        Calculator.items[0].quantity = 500;
        Calculator.items[0].template_id = 'blank-price-smoke';
        Calculator.items[0].is_blank_mold = true;
        Calculator.items[0].sell_price_item = 210;
        Calculator.items[0].result = {
            costTotal: 108.25,
            costPrinting: 0,
            costPrintingDetails: [],
        };

        Calculator.items[1].product_name = 'Custom Smoke Product';
        Calculator.items[1].quantity = 500;
        Calculator.items[1].template_id = '';
        Calculator.items[1].is_blank_mold = false;
        Calculator.items[1].sell_price_item = 0;
        Calculator.items[1].result = {
            costTotal: 100,
            costPrinting: 0,
            costPrintingDetails: [],
        };

        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];

        document.getElementById('calc-pricing').style.display = 'none';
        document.getElementById('calc-pricing-content').innerHTML = '';

        Calculator.renderPricingCard(App.params);
    `, context);

    const pricingHtml = String(vm.runInContext(`document.getElementById('calc-pricing-content').innerHTML`, context));

    assert.match(pricingHtml, /Маржа 40%/);
    assert.match(pricingHtml, /Рекоменд\. цена/);
    assert.match(pricingHtml, /вручную в бланке/);
    assert.match(pricingHtml, /Чистая маржа/);
    assert.match(pricingHtml, /налогов 12%/);
    assert.match(pricingHtml, /pricing-grid-compact/);
}

async function smokeBlankTargetFormulaMatchesVatExclusiveMargin(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = { ...App.params, taxRate: 0.12, vatRate: 0.05, charityRate: 0.01 };
        const cost = 277;
        const qty = 1000;
        return {
            blankTarget: calcBlankTargetPrice(cost, qty, params),
            blankSell: calcBlankSellPrice(cost, qty, params),
            blankNet40: calcSellByNetMargin40(cost, params),
            customTarget: calculateTargetPrice(cost, params, qty),
            blankMargin: calculateActualMargin(calcBlankSellPrice(cost, qty, params), cost).percent,
        };
    })()`, context));

    assert.equal(state.blankTarget, 690.34, 'blank target price should use the same VAT-exclusive base formula as custom items');
    assert.equal(state.blankNet40, 690.34, '40% blank helper price should match the calculator target formula');
    assert.equal(state.customTarget, 690.34, 'custom target formula should stay aligned with blank target formula');
    assert.equal(state.blankSell, 690, 'blank catalog sell price should round the VAT-exclusive target to the nearest 5');
    assert.equal(state.blankMargin, 39.98, 'rounded blank price should stay very close to the 40% net target');
}

async function smokePendantFallbackTierMatchesVatExclusiveMargin() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant; delete globalThis.getPendantLetterBlankMetrics; delete globalThis.Molds;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    const state = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            taxRate: 0.12,
            vatRate: 0.05,
            charityRate: 0.01,
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            plasticHours: 8,
            packagingHours: 8,
            hardwareHours: 8,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
        };
        App.params = params;
        App.templates = [{
            id: 30,
            pph_min: 120,
            pph_max: 120,
            pph_actual: 120,
            weight_grams: 5,
            mold_count: 1,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            custom_prices: {},
            custom_margins: {},
            hw_name: '',
            hw_price_per_unit: 0,
            hw_delivery_total: 0,
            hw_speed: 0,
            builtin_assembly_name: 'Сборка букв на шнур',
            builtin_assembly_speed: 600,
        }];
        Pendant._wizardData = Pendant.getEmpty();
        const tier = Pendant._getLetterBlankTier(1000);
        const expectedTarget = calculateTargetPrice(tier.cost, params, tier.tierQty);
        const expectedRounded = Math.round(expectedTarget / 5) * 5;
        return {
            tier,
            margin: calculateActualMargin(tier.sellPrice, tier.cost).percent,
            expectedTarget,
            expectedRounded,
            expectedMargin: calculateActualMargin(expectedRounded, tier.cost).percent,
        };
    })()`, pendantContext));

    assert.ok(state.tier && state.tier.sellPrice > 0, 'pendant fallback tier should resolve a live sell price');
    assert.equal(state.tier.sellPrice, state.expectedRounded, 'pendant fallback tier should round the same VAT-exclusive target formula as blanks');
    assert.equal(state.margin, state.expectedMargin, 'pendant fallback tier should keep the same net-margin logic as blanks after rounding');
}

async function smokeFinDirectorPendantsUseAllAttachments(context) {
    const fin = clone(await vm.runInContext(`(() => {
        const pendant = {
            quantity: 10,
            element_price_per_unit: 3,
            elements: [
                { char: 'A', has_print: false, print_price: 0 },
                { char: 'B', has_print: false, print_price: 0 },
                { char: 'C', has_print: false, print_price: 0 },
            ],
            cords: [
                { name: 'Smoke Cord', unit: 'м', length_cm: 80, price_per_unit: 12, delivery_price: 1, qty_per_pendant: 1 },
                { name: 'Smoke Cord 2', unit: 'шт', price_per_unit: 4, delivery_price: 0.5, qty_per_pendant: 2 },
            ],
            carabiners: [
                { name: 'Smoke Carabiner', unit: 'шт', price_per_unit: 2, delivery_price: 0.5, qty_per_pendant: 1 },
                { name: 'Smoke Carabiner 2', unit: 'шт', price_per_unit: 3, delivery_price: 0.25, qty_per_pendant: 2 },
            ],
            result: {
                assemblyHours: 1,
                packagingHours: 0,
                totalRevenue: 500,
            },
        };
        return calculateFinDirectorData([], [], [], { ...App.params, fotPerHour: 100 }, [pendant]);
    })()`, context));

    assert.equal(fin.salary, 100);
    assert.equal(fin.hardwarePurchase, 346);
    assert.equal(fin.nfcTotal, 0);
    assert.equal(fin.hardwareDelivery, 30);
    assert.equal(fin.revenue, 500);
}

async function smokeFinDirectorSeparatesHardwareAndNfc(context) {
    const fin = clone(await vm.runInContext(`(() => {
        const params = { ...App.params, nfcTagCost: 8, taxRate: 0, vatRate: 0, charityRate: 0, moldBaseCost: 0, deliveryCostMoscow: 0 };
        const items = [{
            quantity: 10,
            is_nfc: true,
            is_blank_mold: true,
            base_mold_in_stock: true,
            complex_design: false,
            delivery_included: false,
            printings: [],
            sell_price_item: 0,
            sell_price_printing: 0,
            result: {
                hoursTotalPlasticNfc: 0,
                hoursBuiltinHw: 0,
                costIndirect: 0,
                costCuttingIndirect: 0,
                costNfcIndirect: 0,
                costBuiltinHwIndirect: 0,
            },
        }];
        const hardware = [{
            qty: 10,
            price: 5,
            delivery_price: 1,
            sell_price: 0,
        }];
        return calculateFinDirectorData(items, hardware, [], params, []);
    })()`, context));

    assert.equal(fin.hardwarePurchase, 50, 'ordinary hardware should stay in hardware row');
    assert.equal(fin.hardwareDelivery, 10, 'ordinary hardware delivery should stay in hardware delivery row');
    assert.equal(fin.nfcTotal, 80, 'product NFC should go to dedicated NFC row');
    assert.equal(fin.totalCosts, 140, 'fin director total should include hardware and NFC separately');
}

async function smokeFinDirectorBlankMoldsUseAmortization(context) {
    const fin = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            fotPerHour: 0,
            taxRate: 0,
            vatRate: 0,
            charityRate: 0,
            moldBaseCost: 20000,
            deliveryCostMoscow: 0,
        };
        const items = [{
            quantity: 100,
            is_nfc: false,
            is_blank_mold: true,
            base_mold_in_stock: false,
            extra_molds: 0,
            complex_design: false,
            delivery_included: false,
            printings: [],
            sell_price_item: 0,
            sell_price_printing: 0,
            result: {
                hoursTotalPlasticNfc: 0,
                hoursBuiltinHw: 0,
                hoursBuiltinAssembly: 0,
                costIndirect: 0,
                costCuttingIndirect: 0,
                costNfcIndirect: 0,
                costBuiltinHwIndirect: 0,
                costBuiltinAssemblyIndirect: 0,
                costPlastic: 0,
                costMoldAmortization: 4.44,
                costDelivery: 0,
            },
        }];
        return calculateFinDirectorData(items, [], [], params, []);
    })()`, context));

    assert.equal(fin.molds, 444, 'blank orders should send mold amortization, not full mold purchase, to fin director');
    assert.equal(fin.totalCosts, 444, 'blank mold amortization should contribute to fin director total cost');
}

async function smokeFinDirectorRevenueMatchesNetSummaryAndProfit(context) {
    const data = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            fotPerHour: 100,
            taxRate: 0.12,
            vatRate: 0.05,
            charityRate: 0.01,
            moldBaseCost: 0,
            deliveryCostMoscow: 0,
        };
        const items = [{
            quantity: 100,
            sell_price_item: 855,
            sell_price_printing: 0,
            printings: [],
            is_blank_mold: true,
            result: {
                costFot: 25.9,
                costIndirect: 181.28,
                costPlastic: 8.25,
                costMoldAmortization: 4.44,
                costDesign: 0,
                costCutting: 0,
                costCuttingIndirect: 0,
                costNfcTag: 6.22,
                costNfcProgramming: 0,
                costNfcIndirect: 0,
                costPrinting: 0,
                costDelivery: 0,
                costBuiltinHw: 0,
                costBuiltinHwIndirect: 0,
                costBuiltinAssembly: 0,
                costBuiltinAssemblyIndirect: 0,
                costTotal: 226.09,
                hoursBuiltinHw: 0,
                hoursBuiltinAssembly: 0,
            },
            builtin_hw_name: '',
            builtin_hw_price: 0,
            builtin_hw_delivery_total: 0,
        }];
        const summary = calculateOrderSummary(items, [], [], [], params, [], { mode: 'none', value: 0 });
        const fin = calculateFinDirectorData(items, [], [], params, [], { mode: 'none', value: 0 });
        return { summary, fin };
    })()`, context));

    assert.equal(data.fin.revenue, data.summary.totalRevenue, 'fin director revenue should use the same net-of-VAT base as summary');
    assert.equal(data.fin.revenueWithVat, data.summary.totalWithVat, 'fin director should still expose the gross customer total with VAT');
    assert.ok(
        Math.abs((Math.round((data.fin.revenue - data.fin.totalCosts) * 100) / 100) - data.summary.totalEarned) <= 0.5,
        'fin director profit should stay aligned with summary earned within row-rounding tolerance'
    );
}

async function smokePendantAttachmentCostsIncludeAssemblyAndIndirect(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            wasteFactor: 1,
            fotPerHour: 100,
            indirectCostMode: 'all',
            indirectPerHour: 50,
            taxRate: 0.12,
            charityRate: 0.01,
        };
        const pendant = {
            quantity: 10,
            name: 'AA',
            elements: [],
            cords: [
                {
                    name: 'Smoke Cord',
                    unit: 'шт',
                    allocated_qty: 10,
                    qty_per_pendant: 1,
                    price_per_unit: 20,
                    delivery_price: 1,
                    assembly_speed: 10,
                },
            ],
            carabiners: [],
        };
        return calculatePendantCost(pendant, params);
    })()`, context));

    assert.equal(state.costPerUnit, 36);
    assert.equal(state.totalCost, 360);
    assert.equal(state.attachmentPurchaseTotal, 200);
    assert.equal(state.attachmentDeliveryTotal, 10);
    assert.equal(state.attachmentAssemblyTotal, 100);
    assert.equal(state.attachmentIndirectTotal, 50);
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

async function smokeHardwareWarehousePickerUpdatesImmediately(context) {
    context.__warehouseItems = [{
        id: 702,
        name: 'Warehouse Carabiner',
        sku: 'CR-STD-050-RD+',
        size: '5 см',
        color: 'красный',
        available_qty: 100,
        qty: 100,
        unit: 'шт',
        price_per_unit: 10,
        photo_thumbnail: '',
        category: 'carabiners',
    }];
    vm.runInContext(`
        globalThis.__hwPickerEvents = [];
        globalThis.__resolveHwCatalog = null;
        globalThis.__hwCatalogPending = new Promise(resolve => {
            globalThis.__resolveHwCatalog = resolve;
        });
        Calculator.hardwareItems = [Calculator.getEmptyHardware(null)];
        Calculator.hardwareItems[0].source = 'warehouse';
        Calculator._findWhItem = (itemId) => (globalThis.__warehouseItems || []).find(item => Number(item.id) === Number(itemId)) || null;
        Calculator._ensureBlanksCatalog = async () => globalThis.__hwCatalogPending;
        Calculator._findHwBlankByWarehouseItemId = () => ({
            warehouse_item_id: 702,
            assembly_speed: 300,
            sell_price: 19,
            updated_at: '2026-03-17T12:00:00.000Z',
        });
        Calculator._rerenderHwItem = () => { globalThis.__hwPickerEvents.push('rerender'); };
        Calculator.recalculate = () => { globalThis.__hwPickerEvents.push('recalc'); };
        Calculator.scheduleAutosave = () => { globalThis.__hwPickerEvents.push('save'); };
        document.querySelectorAll = () => [];
        globalThis.__hwSelectPromise = Calculator.onHwWarehouseSelect(0, '702');
    `, context);

    const immediate = clone(await vm.runInContext(`({
        events: globalThis.__hwPickerEvents.slice(),
        hw: Calculator.hardwareItems[0],
    })`, context));
    assert.deepEqual(
        immediate.events,
        ['rerender', 'recalc', 'save'],
        'Hardware picker should update the row immediately, before blank defaults finish loading',
    );
    assert.equal(immediate.hw.warehouse_item_id, 702);
    assert.equal(immediate.hw.name, 'Warehouse Carabiner · 5 см · красный');
    assert.equal(immediate.hw.price, 10);
    assert.equal(immediate.hw.assembly_speed, 0);
    assert.equal(immediate.hw.sell_price, 0);

    const resolved = clone(await vm.runInContext(`(async () => {
        globalThis.__resolveHwCatalog();
        await globalThis.__hwSelectPromise;
        return {
            events: globalThis.__hwPickerEvents.slice(),
            hw: Calculator.hardwareItems[0],
        };
    })()`, context));
    assert.deepEqual(
        resolved.events,
        ['rerender', 'recalc', 'save', 'rerender', 'recalc', 'save'],
        'Hardware picker should apply linked blank defaults in a second pass after the async catalog load',
    );
    assert.equal(resolved.hw.assembly_speed, 300);
    assert.equal(resolved.hw.assembly_minutes, 5);
    assert.equal(resolved.hw.sell_price, 19);
}

async function smokeCurrentOrderReservationRestoresWarehouseQuota() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/warehouse.js'].forEach(file => runScript(context, file));
    stubRuntime(context);
    vm.runInContext(`
        globalThis.ChinaCatalog = {
            DELIVERY_METHODS: {
                avia: { label: 'Авиа', rate_usd: 33 },
                auto: { label: 'Авто', rate_usd: 4.8 },
                avia_fast: { label: 'Авиа быстрая', rate_usd: 38 },
            },
        };
    `, context);

    context.__reservations = [
        {
            id: 1,
            item_id: 901,
            order_id: 88,
            qty: 60,
            status: 'active',
            source: 'project_hardware',
        },
        {
            id: 2,
            item_id: 901,
            order_id: 99,
            qty: 20,
            status: 'active',
            source: 'project_hardware',
        },
        {
            id: 3,
            item_id: 902,
            order_id: 88,
            qty: 70,
            status: 'active',
            source: 'project_hardware',
        },
    ];
    context.loadWarehouseReservations = async () => clone(context.__reservations);

    vm.runInContext(`
        App.editingOrderId = 88;
        globalThis.__lastToast = '';
        globalThis.__lastHwHtml = '';
        globalThis.__lastPkgHtml = '';
        App.toast = (message) => { globalThis.__lastToast = String(message || ''); };

        Calculator._whPickerData = {
            hardware: {
                label: 'Фурнитура',
                icon: '🔩',
                items: [{
                    id: 901,
                    category: 'hardware',
                    name: 'Трос',
                    sku: 'TR-050-WH',
                    size: '50 см',
                    color: 'белый',
                    qty: 120,
                    available_qty: 40,
                    unit: 'шт',
                    price_per_unit: 12,
                    photo_thumbnail: '',
                }],
            },
            packaging: {
                label: 'Упаковка',
                icon: '📦',
                items: [{
                    id: 902,
                    category: 'packaging',
                    name: 'Коробка',
                    sku: 'BOX-010',
                    size: '10x10',
                    color: 'крафт',
                    qty: 100,
                    available_qty: 30,
                    unit: 'шт',
                    price_per_unit: 8,
                    photo_thumbnail: '',
                }],
            },
        };
        Calculator._whCurrentOrderReservationMap = null;
        Calculator._whReservationOrderId = null;
        Calculator._whReservationLoading = false;
        Calculator._findWhItem = function(itemId) {
            if (!this._whPickerData) return null;
            for (const catKey of Object.keys(this._whPickerData)) {
                const found = (this._whPickerData[catKey].items || []).find(item => Number(item.id) === Number(itemId));
                if (found) return found;
            }
            return null;
        };
        Calculator.hardwareItems = [
            Object.assign(Calculator.getEmptyHardware(null), {
                source: 'warehouse',
                warehouse_item_id: 901,
                warehouse_sku: 'TR-050-WH',
                name: 'Трос · 50 см · белый',
                qty: 60,
            }),
            Object.assign(Calculator.getEmptyHardware(null), {
                source: 'warehouse',
                warehouse_item_id: 901,
                warehouse_sku: 'TR-050-WH',
                name: 'Трос · 50 см · белый',
                qty: 0,
            }),
        ];
        Calculator.packagingItems = [
            Object.assign(Calculator.getEmptyPackaging(null), {
                source: 'warehouse',
                warehouse_item_id: 902,
                warehouse_sku: 'BOX-010',
                name: 'Коробка · крафт',
                qty: 0,
            }),
        ];
        Calculator.pendants = [];
        Calculator.recalculate = () => {};
        Calculator.scheduleAutosave = () => {};
        Calculator._ensureBlanksCatalog = async () => {};
        Calculator._hwBlanksCatalog = [];
        Calculator._pkgBlanksCatalog = [];
        document.getElementById('calc-hardware-list').insertAdjacentHTML = (position, html) => {
            globalThis.__lastHwHtml = html;
        };
        document.getElementById('calc-packaging-list').insertAdjacentHTML = (position, html) => {
            globalThis.__lastPkgHtml = html;
        };
    `, context);

    await vm.runInContext(`Calculator._ensureWhReservationContext(true)`, context);

    const pickerData = clone(vm.runInContext(`Calculator._getWhPickerDataForCurrentOrder()`, context));
    assert.equal(pickerData.hardware.items[0].available_qty, 100);
    assert.equal(pickerData.packaging.items[0].available_qty, 100);

    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(901, { kind: 'hardware', idx: 0 })`, context), 100);
    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(901, { kind: 'hardware', idx: 1 })`, context), 40);
    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(902, { kind: 'packaging', idx: 0 })`, context), 100);

    vm.runInContext(`Calculator.renderHardwareRow(0)`, context);
    const hwHtml = String(vm.runInContext(`globalThis.__lastHwHtml`, context));
    assert.match(hwHtml, /макс:\s*100/i);
    assert.match(hwHtml, /TR-050-WH/);

    vm.runInContext(`
        globalThis.__lastToast = '';
        Calculator.onHwNum(0, 'qty', '101');
    `, context);
    assert.equal(vm.runInContext(`Calculator.hardwareItems[0].qty`, context), 100);
    assert.match(String(vm.runInContext(`globalThis.__lastToast`, context)), /Максимум на складе:\s*100/i);

    vm.runInContext(`
        Calculator.hardwareItems[0].qty = 60;
        globalThis.__lastToast = '';
        Calculator.onHwNum(1, 'qty', '41');
    `, context);
    assert.equal(vm.runInContext(`Calculator.hardwareItems[1].qty`, context), 40);
    assert.match(String(vm.runInContext(`globalThis.__lastToast`, context)), /Максимум на складе:\s*40/i);

    vm.runInContext(`Calculator.renderPackagingRow(0)`, context);
    const pkgHtml = String(vm.runInContext(`globalThis.__lastPkgHtml`, context));
    assert.match(pkgHtml, /макс:\s*100/i);
    assert.match(pkgHtml, /BOX-010/);

    vm.runInContext(`
        globalThis.__lastToast = '';
        Calculator.onPkgNum(0, 'qty', '101');
    `, context);
    assert.equal(vm.runInContext(`Calculator.packagingItems[0].qty`, context), 100);
    assert.match(String(vm.runInContext(`globalThis.__lastToast`, context)), /Максимум на складе:\s*100/i);
}

async function smokeCommittedOrderDemandRestoresWarehouseQuotaWithoutActiveReservation() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/warehouse.js'].forEach(file => runScript(context, file));
    stubRuntime(context);
    vm.runInContext(`
        globalThis.ChinaCatalog = {
            DELIVERY_METHODS: {
                avia: { label: 'Авиа', rate_usd: 33 },
                auto: { label: 'Авто', rate_usd: 4.8 },
                avia_fast: { label: 'Авиа быстрая', rate_usd: 38 },
            },
        };
    `, context);

    context.__reservations = [];
    context.loadWarehouseReservations = async () => clone(context.__reservations);

    vm.runInContext(`
        App.editingOrderId = 88;
        globalThis.__lastToast = '';
        globalThis.__lastHwHtml = '';
        globalThis.__lastPkgHtml = '';
        App.toast = (message) => { globalThis.__lastToast = String(message || ''); };

        Calculator._whPickerData = {
            hardware: {
                label: 'Фурнитура',
                icon: '🔩',
                items: [{
                    id: 901,
                    category: 'hardware',
                    name: 'Трос',
                    sku: 'TR-050-WH',
                    size: '50 см',
                    color: 'белый',
                    qty: 120,
                    available_qty: 40,
                    unit: 'шт',
                    price_per_unit: 12,
                    photo_thumbnail: '',
                }],
            },
            packaging: {
                label: 'Упаковка',
                icon: '📦',
                items: [{
                    id: 902,
                    category: 'packaging',
                    name: 'Коробка',
                    sku: 'BOX-010',
                    size: '10x10',
                    color: 'крафт',
                    qty: 100,
                    available_qty: 30,
                    unit: 'шт',
                    price_per_unit: 8,
                    photo_thumbnail: '',
                }],
            },
        };
        Calculator._whCurrentOrderReservationMap = null;
        Calculator._whReservationOrderId = null;
        Calculator._whReservationLoading = false;
        Calculator._whCommittedOrderDemandMap = null;
        Calculator._whCommittedDemandOrderId = null;
        Calculator._findWhItem = function(itemId) {
            if (!this._whPickerData) return null;
            for (const catKey of Object.keys(this._whPickerData)) {
                const found = (this._whPickerData[catKey].items || []).find(item => Number(item.id) === Number(itemId));
                if (found) return found;
            }
            return null;
        };
        Calculator.hardwareItems = [
            Object.assign(Calculator.getEmptyHardware(null), {
                source: 'warehouse',
                warehouse_item_id: 901,
                warehouse_sku: 'TR-050-WH',
                name: 'Трос · 50 см · белый',
                qty: 60,
            }),
            Object.assign(Calculator.getEmptyHardware(null), {
                source: 'warehouse',
                warehouse_item_id: 901,
                warehouse_sku: 'TR-050-WH',
                name: 'Трос · 50 см · белый',
                qty: 0,
            }),
        ];
        Calculator.packagingItems = [
            Object.assign(Calculator.getEmptyPackaging(null), {
                source: 'warehouse',
                warehouse_item_id: 902,
                warehouse_sku: 'BOX-010',
                name: 'Коробка · крафт',
                qty: 70,
            }),
        ];
        Calculator.pendants = [];
        Calculator.recalculate = () => {};
        Calculator.scheduleAutosave = () => {};
        Calculator._ensureBlanksCatalog = async () => {};
        Calculator._hwBlanksCatalog = [];
        Calculator._pkgBlanksCatalog = [];
        document.getElementById('calc-hardware-list').insertAdjacentHTML = (position, html) => {
            globalThis.__lastHwHtml = html;
        };
        document.getElementById('calc-packaging-list').insertAdjacentHTML = (position, html) => {
            globalThis.__lastPkgHtml = html;
        };
        Calculator._captureCommittedWhDemandSnapshot(88);
    `, context);

    await vm.runInContext(`Calculator._ensureWhReservationContext(true)`, context);

    const pickerData = clone(vm.runInContext(`Calculator._getWhPickerDataForCurrentOrder()`, context));
    assert.equal(pickerData.hardware.items[0].available_qty, 100);
    assert.equal(pickerData.packaging.items[0].available_qty, 100);

    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(901, { kind: 'hardware', idx: 0 })`, context), 100);
    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(901, { kind: 'hardware', idx: 1 })`, context), 40);
    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(902, { kind: 'packaging', idx: 0 })`, context), 100);

    vm.runInContext(`Calculator.renderHardwareRow(0)`, context);
    const hwHtml = String(vm.runInContext(`globalThis.__lastHwHtml`, context));
    assert.match(hwHtml, /макс:\s*100/i);

    vm.runInContext(`Calculator.renderPackagingRow(0)`, context);
    const pkgHtml = String(vm.runInContext(`globalThis.__lastPkgHtml`, context));
    assert.match(pkgHtml, /макс:\s*100/i);

    vm.runInContext(`
        Calculator.hardwareItems[0].qty = 50;
        globalThis.__lastToast = '';
        Calculator.onHwNum(1, 'qty', '51');
    `, context);
    assert.equal(vm.runInContext(`Calculator._getWhEffectiveAvailableQty(901, { kind: 'hardware', idx: 0 })`, context), 50);
    assert.equal(vm.runInContext(`Calculator.hardwareItems[1].qty`, context), 50);
    assert.match(String(vm.runInContext(`globalThis.__lastToast`, context)), /Максимум на складе:\s*50/i);
}

async function smokePendantWarehousePickerRestoresCurrentOrderQuota() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(context, file));
    stubRuntime(context);
    vm.runInContext('delete globalThis.Pendant;', context);
    runScript(context, 'js/pendant.js');

    context.__reservations = [
        {
            id: 1,
            item_id: 701,
            order_id: 88,
            qty: 100,
            status: 'active',
            source: 'project_hardware',
        },
    ];
    context.loadWarehouseReservations = async () => clone(context.__reservations);

    vm.runInContext(`
        App.editingOrderId = 88;
        Calculator._whPickerData = {
            cords: {
                label: 'Шнуры',
                icon: '🧵',
                items: [{
                    id: 701,
                    category: 'cords',
                    name: 'Шнур с лазерной гравировкой',
                    sku: 'SLS-800-LZR-NN',
                    size: '80 см',
                    color: 'черный',
                    qty: 138,
                    available_qty: 38,
                    unit: 'шт',
                    price_per_unit: 25,
                    photo_thumbnail: '',
                }],
            },
            carabiners: {
                label: 'Карабины',
                icon: '🔗',
                items: [],
            },
            rings: {
                label: 'Кольца',
                icon: '⭕',
                items: [],
            },
        };
        Calculator._whCurrentOrderReservationMap = null;
        Calculator._whReservationOrderId = null;
        Calculator._whReservationLoading = false;
        Calculator._findWhItem = function(itemId) {
            if (!this._whPickerData) return null;
            for (const catKey of Object.keys(this._whPickerData)) {
                const found = (this._whPickerData[catKey].items || []).find(item => Number(item.id) === Number(itemId));
                if (found) return found;
            }
            return null;
        };
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [{
            ...Pendant.getEmpty(),
            name: 'Обвеcы Озон банк КЕШШШ',
            quantity: 100,
            cords: [{
                source: 'warehouse',
                warehouse_item_id: 701,
                warehouse_sku: 'SLS-800-LZR-NN',
                name: 'Шнур с лазерной гравировкой',
                price_per_unit: 25,
                delivery_price: 0,
                unit: 'шт',
                qty_per_pendant: 1,
                allocated_qty: 100,
            }],
            carabiners: [],
        }];
        Pendant._editingIndex = 0;
        Pendant._wizardData = JSON.parse(JSON.stringify(Calculator.pendants[0]));
        Pendant._ensureAttachmentCollections(Pendant._wizardData, { preserveEmpty: true });
    `, context);

    await vm.runInContext(`Calculator._ensureWhReservationContext(true)`, context);

    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, context),
        138
    );

    const currentRowHtml = String(vm.runInContext(`Pendant._renderWhDropdown('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, context));
    assert.match(currentRowHtml, /SLS-800-LZR-NN/);
    assert.match(currentRowHtml, /138 шт/);

    vm.runInContext(`
        Pendant._wizardData.cords.push({
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'SLS-800-LZR-NN',
            name: 'Шнур с лазерной гравировкой',
            price_per_unit: 25,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 0,
        });
        Pendant._syncLegacyAttachments(Pendant._wizardData);
    `, context);

    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[1], Calculator._whPickerData, 1)`, context),
        38
    );
}

async function smokePendantCommittedDemandRestoresQuotaWithoutActiveReservation() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(context, file));
    stubRuntime(context);
    vm.runInContext('delete globalThis.Pendant;', context);
    runScript(context, 'js/pendant.js');

    context.__reservations = [];
    context.loadWarehouseReservations = async () => clone(context.__reservations);

    vm.runInContext(`
        App.editingOrderId = 88;
        Calculator._whPickerData = {
            cords: {
                label: 'Шнуры',
                icon: '🧵',
                items: [{
                    id: 701,
                    category: 'cords',
                    name: 'Шнур с лазерной гравировкой',
                    sku: 'SLS-800-LZR-NN',
                    size: '80 см',
                    color: 'черный',
                    qty: 138,
                    available_qty: 38,
                    unit: 'шт',
                    price_per_unit: 25,
                    photo_thumbnail: '',
                }],
            },
            carabiners: {
                label: 'Карабины',
                icon: '🔗',
                items: [],
            },
            rings: {
                label: 'Кольца',
                icon: '⭕',
                items: [],
            },
        };
        Calculator._whCurrentOrderReservationMap = null;
        Calculator._whReservationOrderId = null;
        Calculator._whReservationLoading = false;
        Calculator._whCommittedOrderDemandMap = null;
        Calculator._whCommittedDemandOrderId = null;
        Calculator._findWhItem = function(itemId) {
            if (!this._whPickerData) return null;
            for (const catKey of Object.keys(this._whPickerData)) {
                const found = (this._whPickerData[catKey].items || []).find(item => Number(item.id) === Number(itemId));
                if (found) return found;
            }
            return null;
        };
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [{
            ...Pendant.getEmpty(),
            name: 'Обвеcы Озон банк КЕШШШ',
            quantity: 100,
            cords: [{
                source: 'warehouse',
                warehouse_item_id: 701,
                warehouse_sku: 'SLS-800-LZR-NN',
                name: 'Шнур с лазерной гравировкой',
                price_per_unit: 25,
                delivery_price: 0,
                unit: 'шт',
                qty_per_pendant: 1,
                allocated_qty: 100,
            }],
            carabiners: [],
        }];
        Pendant._editingIndex = 0;
        Pendant._wizardData = JSON.parse(JSON.stringify(Calculator.pendants[0]));
        Pendant._ensureAttachmentCollections(Pendant._wizardData, { preserveEmpty: true });
        Calculator._captureCommittedWhDemandSnapshot(88);
    `, context);

    await vm.runInContext(`Calculator._ensureWhReservationContext(true)`, context);

    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, context),
        138
    );

    const currentRowHtml = String(vm.runInContext(`Pendant._renderWhDropdown('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, context));
    assert.match(currentRowHtml, /138 шт/);

    vm.runInContext(`
        Pendant._wizardData.cords.push({
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'SLS-800-LZR-NN',
            name: 'Шнур с лазерной гравировкой',
            price_per_unit: 25,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 0,
        });
        Pendant._syncLegacyAttachments(Pendant._wizardData);
    `, context);

    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[1], Calculator._whPickerData, 1)`, context),
        38
    );

    vm.runInContext(`
        Pendant._wizardData.cords[0].allocated_qty = 90;
        Pendant._syncLegacyAttachments(Pendant._wizardData);
    `, context);

    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, context),
        138
    );
    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[1], Calculator._whPickerData, 1)`, context),
        48
    );
}

async function smokeLoadOrderRestoresCommittedPendantQuotaWithoutActiveReservation() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(context, file));
    stubRuntime(context);
    vm.runInContext('delete globalThis.Pendant;', context);
    runScript(context, 'js/pendant.js');

    context.__reservations = [];
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.__pendantPickerData = {
        cords: {
            label: 'Шнуры',
            icon: '🧵',
            items: [{
                id: 701,
                category: 'cords',
                name: 'Шнур с лазерной гравировкой',
                sku: 'SLS-800-LZR-NN',
                size: '80 см',
                color: 'черный',
                qty: 138,
                available_qty: 38,
                unit: 'шт',
                price_per_unit: 25,
                photo_thumbnail: '',
            }],
        },
        carabiners: {
            label: 'Карабины',
            icon: '🔗',
            items: [],
        },
        rings: {
            label: 'Кольца',
            icon: '⭕',
            items: [],
        },
    };
    context.__loadOrderData = {
        order: {
            id: 9008,
            order_name: 'Обвеcы Озон банк КЕШШШ',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'production',
        },
        items: [{
            item_type: 'pendant',
            item_number: 1,
            product_name: 'Обвеcы Озон банк КЕШШШ',
            quantity: 100,
            item_data: JSON.stringify({
                name: 'Обвеcы Озон банк КЕШШШ',
                quantity: 100,
                cords: [{
                    source: 'warehouse',
                    warehouse_item_id: 701,
                    warehouse_sku: 'SLS-800-LZR-NN',
                    name: 'Шнур с лазерной гравировкой',
                    price_per_unit: 25,
                    delivery_price: 0,
                    unit: 'шт',
                    qty_per_pendant: 1,
                    allocated_qty: 100,
                }],
                carabiners: [],
            }),
        }],
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

    await vm.runInContext(`Calculator.loadOrder(9008)`, context);

    vm.runInContext(`
        Calculator._whPickerData = globalThis.__pendantPickerData;
        Calculator._findWhItem = function(itemId) {
            if (!this._whPickerData) return null;
            for (const catKey of Object.keys(this._whPickerData)) {
                const found = (this._whPickerData[catKey].items || []).find(item => Number(item.id) === Number(itemId));
                if (found) return found;
            }
            return null;
        };
        Pendant.openWizard(0);
    `, context);

    assert.equal(vm.runInContext(`Calculator._getCommittedOrderWarehouseDemandQty(701)`, context), 100);
    assert.equal(
        vm.runInContext(`Pendant._getSelectedStock('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, context),
        138
    );
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
            }, {
                id: 702,
                category: 'cords',
                name: 'Шнур плоский',
                sku: 'FLC-550-BK',
                size: '55 см',
                color: 'черный',
                qty: 420,
                available_qty: 400,
                price_per_unit: 19,
                unit: 'шт',
                photo_thumbnail: 'https://example.com/cord-flat.png',
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
            }, {
                id: 802,
                category: 'carabiners',
                name: 'Кольцо-карабин',
                sku: 'CR-RING-BK',
                size: '3 см',
                color: 'черный',
                qty: 640,
                available_qty: 600,
                price_per_unit: 12,
                unit: 'шт',
                photo_thumbnail: 'https://example.com/carabiner-ring.png',
            }],
        },
        rings: {
            label: 'Кольца',
            icon: '⭕',
            items: [{
                id: 803,
                category: 'rings',
                name: 'Кольцо плоское',
                sku: 'RNG-FLAT-25-SV',
                size: '2,5 см',
                color: 'серебряное',
                qty: 950,
                available_qty: 910,
                price_per_unit: 2,
                unit: 'шт',
                photo_thumbnail: 'https://example.com/ring-flat.png',
            }],
        },
    };

    vm.runInContext(`
        Calculator._whPickerData = globalThis.__pendantWhData;
        Calculator._findHwBlankByWarehouseItemId = () => null;
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.quantity = 12;
        Pendant._commitName('AB');
        Pendant._wizardData.cords = [{
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'SLS-800-BL-NN',
            photo_thumbnail: 'https://example.com/cord-thumb.png',
            name: 'Шнур с силик. наконечником синий 80 см',
            price_per_unit: 23,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
        }];
        Pendant._wizardData.carabiners = [{
            source: 'warehouse',
            warehouse_item_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            name: '',
            price_per_unit: 0,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
        }];
        Pendant._syncLegacyAttachments(Pendant._wizardData);
    `, pendantContext);

    const cordHtml = String(vm.runInContext(`Pendant._renderWhDropdown('cord', Pendant._wizardData.cords[0], Calculator._whPickerData, 0)`, pendantContext));
    assert.match(cordHtml, /Поиск по названию или артикулу/);
    assert.match(cordHtml, /SLS-800-BL-NN/);
    assert.match(cordHtml, /cord-thumb\.png/);
    assert.match(cordHtml, /img src=/);
    const carabinerHtml = String(vm.runInContext(`Pendant._renderWhDropdown('carabiner', Pendant._wizardData.carabiners[0], Calculator._whPickerData, 0)`, pendantContext));
    assert.match(carabinerHtml, /Карабины/);
    assert.match(carabinerHtml, /Кольца/);
    assert.match(carabinerHtml, /RNG-FLAT-25-SV/);

    vm.runInContext(`Pendant._wizardStep = 4`, pendantContext);
    const wizardClassName = String(vm.runInContext(`Pendant._wizardClassName()`, pendantContext));
    assert.match(wizardClassName, /pendant-wizard-step-4/);

    await vm.runInContext(`Pendant._onWhSelect('carabiner', 0, '801')`, pendantContext);
    await vm.runInContext(`Pendant._addAttachment('cord')`, pendantContext);
    const emptyCordState = clone(await vm.runInContext(`({
        cords: Pendant._wizardData.cords,
        html: Pendant._renderStep4()
    })`, pendantContext));
    assert.equal(emptyCordState.cords.length, 2);
    assert.match(emptyCordState.html, /Шнур 2/);
    await vm.runInContext(`Pendant._updateAttachmentField('cord', 0, 'allocated_qty', 5)`, pendantContext);
    await vm.runInContext(`Pendant._onWhSelect('cord', 1, '702')`, pendantContext);
    await vm.runInContext(`Pendant._updateAttachmentField('cord', 1, 'allocated_qty', 7)`, pendantContext);
    await vm.runInContext(`Pendant._addAttachment('carabiner')`, pendantContext);
    const emptyCarabinerState = clone(await vm.runInContext(`({
        carabiners: Pendant._wizardData.carabiners,
        html: Pendant._renderStep4()
    })`, pendantContext));
    assert.equal(emptyCarabinerState.carabiners.length, 2);
    assert.match(emptyCarabinerState.html, /Фурнитура 2/);
    await vm.runInContext(`Pendant._updateAttachmentField('carabiner', 0, 'allocated_qty', 4)`, pendantContext);
    await vm.runInContext(`Pendant._onWhSelect('carabiner', 1, '803')`, pendantContext);
    await vm.runInContext(`Pendant._updateAttachmentField('carabiner', 1, 'allocated_qty', 8)`, pendantContext);
    await vm.runInContext(`Pendant._updateAttachmentField('carabiner', 1, 'qty_per_pendant', 2)`, pendantContext);

    const attachmentState = clone(await vm.runInContext(`({
        cords: Pendant._wizardData.cords,
        carabiners: Pendant._wizardData.carabiners,
        cord: Pendant._wizardData.cord,
        carabiner: Pendant._wizardData.carabiner
    })`, pendantContext));
    assert.equal(attachmentState.cords.length, 2);
    assert.equal(attachmentState.carabiners.length, 2);
    assert.equal(attachmentState.cord.warehouse_item_id, 701);
    assert.equal(attachmentState.carabiner.warehouse_item_id, 801);
    assert.equal(attachmentState.carabiners[1].warehouse_item_id, 803);
    assert.equal(attachmentState.cords[0].allocated_qty, 5);
    assert.equal(attachmentState.cords[1].allocated_qty, 7);
    assert.equal(attachmentState.carabiners[0].allocated_qty, 4);
    assert.equal(attachmentState.carabiners[1].allocated_qty, 8);

    const step4Html = String(vm.runInContext(`Pendant._renderStep4()`, pendantContext));
    assert.match(step4Html, /FLC-550-BK/);
    assert.match(step4Html, /RNG-FLAT-25-SV/);
    assert.match(step4Html, /pendant-step4-layout/);
    assert.match(step4Html, /Сколько подвесов с этой позицией/);
    assert.match(step4Html, /Кол-во на 1 подвес/);
    assert.match(step4Html, /Распределено <b>12<\/b> из <b>12<\/b> шт/);

    const step5Html = String(vm.runInContext(`Pendant._renderStep5()`, pendantContext));
    assert.match(step5Html, /Шнур с силик\. наконечником синий 80 см/);
    assert.match(step5Html, /Шнур плоский/);
    assert.match(step5Html, /Кольцо плоское/);
    assert.match(step5Html, /× 2/);
    assert.match(step5Html, /pendant-summary-table-wrap/);
}

async function smokePendantPickerRepairsMissingRequiredSku() {
    const warehouseContext = createContext();
    stubRuntime(warehouseContext);
    runScript(warehouseContext, 'js/warehouse.js');

    warehouseContext.__warehouseItems = [{
        id: 501,
        category: 'carabiners',
        name: 'Круглый карабин',
        sku: 'CR-RNG-023-SV',
        size: '2,3 см',
        color: 'серебряный',
        unit: 'шт',
        qty: 0,
        min_qty: 10,
        price_per_unit: 5,
        notes: '',
        created_at: '2026-03-01T00:00:00.000Z',
        updated_at: '2026-03-01T00:00:00.000Z',
    }];
    warehouseContext.__savedWarehouseItems = null;
    warehouseContext.loadWarehouseItems = async () => clone(warehouseContext.__warehouseItems);
    warehouseContext.saveWarehouseItems = async (items) => {
        warehouseContext.__savedWarehouseItems = clone(items);
        warehouseContext.__warehouseItems = clone(items);
    };
    warehouseContext.loadWarehouseReservations = async () => [];

    const grouped = clone(await vm.runInContext(`Warehouse.getItemsForPicker()`, warehouseContext));
    assert.ok(grouped.carabiners, 'picker should expose carabiners group');
    assert.ok(
        grouped.carabiners.items.some(item => item.sku === 'CR-RNG-025-SV'),
        'picker should repair and expose the missing required pendant hardware SKU'
    );
    assert.ok(
        Array.isArray(warehouseContext.__savedWarehouseItems)
        && warehouseContext.__savedWarehouseItems.some(item => item.sku === 'CR-RNG-025-SV'),
        'required SKU repair should persist the inserted warehouse row'
    );
}

async function smokePendantCentimeterCordPricing() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    const state = clone(await vm.runInContext(`(() => {
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.name = 'CM';
        Pendant._wizardData.quantity = 300;
        Pendant._wizardData.cords = [{
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'MSN-LV',
            name: 'Миланский шнур фиолетовый',
            price_per_unit: 0.7,
            delivery_price: 0,
            sell_price: 1.4,
            unit: 'см',
            length_cm: 50,
            qty_per_pendant: 1,
        }];
        Pendant._wizardData.carabiners = [];
        Pendant._syncLegacyAttachments(Pendant._wizardData);
        return {
            costPerPendant: Pendant._getAttachmentCostPerPendant('cord', Pendant._wizardData.cords[0]),
            sellPerPendant: Pendant._getAttachmentSellPerPendant('cord', Pendant._wizardData.cords[0]),
            step4Html: Pendant._renderStep4(),
            calcResult: calculatePendantCost({
                quantity: 300,
                elements: [],
                cords: Pendant._wizardData.cords,
                carabiners: [],
                _totalSellPerUnit: 0
            }, { wasteFactor: 1.1, fotPerHour: 100 }),
        };
    })()`, pendantContext));

    assert.equal(state.costPerPendant, 35);
    assert.equal(state.sellPerPendant, 70);
    assert.equal(state.calcResult.costPerUnit, 40.5);
    assert.match(state.step4Html, /Нужно: <b>150 м<\/b>/);
    assert.match(state.step4Html, /Цена за подвес: <b>35 ₽<\/b>/);
}

async function smokePendantSplitAllocationUsesAllocatedQty() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    const state = clone(await vm.runInContext(`(() => {
        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.name = 'SPLIT';
        Pendant._wizardData.quantity = 300;
        Pendant._wizardData.cords = [{
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'SLS-800-HNY-NN',
            name: 'Шнур 80 см медовый',
            price_per_unit: 23,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 100,
        }, {
            source: 'warehouse',
            warehouse_item_id: 702,
            warehouse_sku: 'SLS-800-SLD-NN',
            name: 'Шнур 80 см салатовый',
            price_per_unit: 25,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 200,
        }];
        Pendant._wizardData.carabiners = [{
            source: 'warehouse',
            warehouse_item_id: 801,
            warehouse_sku: 'CR-STD-050-RD+',
            name: 'Карабин 5 см красный',
            price_per_unit: 10,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 100,
        }, {
            source: 'warehouse',
            warehouse_item_id: 802,
            warehouse_sku: 'CR-STD-050-VT+',
            name: 'Карабин 5 см фиолетовый',
            price_per_unit: 12,
            delivery_price: 0,
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 200,
        }];
        Pendant._syncLegacyAttachments(Pendant._wizardData);
        return {
            step4Html: Pendant._renderStep4(),
            step5Html: Pendant._renderStep5(),
            calcResult: calculatePendantCost({
                quantity: 300,
                elements: [],
                cords: Pendant._wizardData.cords,
                carabiners: Pendant._wizardData.carabiners,
                _totalSellPerUnit: 0
            }, { ...App.params, wasteFactor: 1.1, fotPerHour: 100 }),
        };
    })()`, pendantContext));

    assert.match(state.step4Html, /Нужно: <b>100 шт<\/b> · Подвесов: <b>100 шт<\/b>/);
    assert.match(state.step4Html, /Нужно: <b>200 шт<\/b> · Подвесов: <b>200 шт<\/b>/);
    assert.doesNotMatch(state.step4Html, /30000/);
    assert.match(state.step5Html, /100 шт · 100 подв\./);
    assert.match(state.step5Html, /200 шт · 200 подв\./);
    assert.equal(state.calcResult.costPerUnit, 41.17);
    assert.equal(state.calcResult.totalCost, 12350);
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

async function smokePendantOverlayDoesNotCloseWizard() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    const modalState = clone(await vm.runInContext(`(() => {
        const originalCreateElement = document.createElement.bind(document);
        const originalGetElementById = document.getElementById.bind(document);
        document.createElement = (tag) => {
            const el = originalCreateElement(tag);
            el._listeners = {};
            el.addEventListener = function(name, handler) {
                this._listeners[name] = handler;
            };
            return el;
        };
        document.body.appendChild = (el) => {
            globalThis.__lastPendantModal = el;
        };
        document.getElementById = (id) => {
            if (id === 'pendant-wizard-modal') return globalThis.__lastPendantModal || null;
            return originalGetElementById(id);
        };

        Pendant._wizardData = Pendant.getEmpty();
        Pendant._wizardData.quantity = 10;
        Pendant._commitName('AB');
        Pendant._wizardStep = 1;
        Pendant._showWizardModal();

        const modal = globalThis.__lastPendantModal;
        return {
            hasOverlayClickHandler: !!modal?._listeners?.click,
            html: modal?.innerHTML || ''
        };
    })()`, pendantContext));

    assert.equal(modalState.hasOverlayClickHandler, false);
    assert.match(modalState.html, /Pendant\._closeWizard\(\)/);
    assert.match(modalState.html, /&times;/);
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
            taxRate: 0.12,
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

        const expectedSellPrice = getPendantLetterBlankMetrics(500, App.params).sellPrice;

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

async function smokePendantLettersContributePlasticLoad() {
    const pendantContext = createContext();
    stubRuntime(pendantContext);
    ['js/calculator.js', 'js/app.js'].forEach(file => runScript(pendantContext, file));
    vm.runInContext('delete globalThis.Pendant;', pendantContext);
    runScript(pendantContext, 'js/pendant.js');

    const state = clone(await vm.runInContext(`(() => {
        const params = {
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'all',
            indirectPerHour: 50,
            taxRate: 0.12,
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
        App.params = params;
        App.templates = [{
            id: 30,
            category: 'blank',
            custom_prices: { 3000: 17 },
            custom_margins: {},
            pieces_per_hour_avg: 100,
            pieces_per_hour_min: 100,
            weight_grams: 5,
            mold_count: 1,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            builtin_assembly_name: 'Сборка букв на шнур',
            builtin_assembly_speed: 600,
        }];

        const metrics = getPendantLetterBlankMetrics(1200, params);
        const pendant = {
            item_type: 'pendant',
            name: 'CCCC',
            quantity: 300,
            elements: [{ char: 'C' }, { char: 'C' }, { char: 'C' }, { char: 'C' }],
            cords: [],
            carabiners: [],
            element_price_per_unit: 3,
            _totalSellPerUnit: 99,
        };
        pendant.result = calculatePendantCost(pendant, params);
        const load = calculateProductionLoad([], [], [], params, [pendant]);
        return { result: pendant.result, load, metrics };
    })()`, pendantContext));

    assert.ok(state.result.hoursPlasticZone > 0, 'letter pendant should contribute casting/trim load');
    assert.ok(state.result.hoursPlastic > 0, 'letter pendant should contribute casting hours');
    assert.ok(state.result.hoursCutting > 0, 'letter pendant should contribute trimming hours');
    assert.ok(state.result.hoursBuiltinAssembly > 0, 'letter pendant should include built-in blank assembly time');
    assert.equal(
        state.result.costPerUnit,
        clone(state.metrics).cost * 4,
        'letter pendant cost should follow the current blanks formula instead of stale stored per-letter cost'
    );
    assert.equal(state.load.hoursPlasticTotal, state.result.hoursPlasticZone);
    assert.equal(state.load.hoursHardwareTotal, state.result.assemblyHours);
}

async function smokeCyrillicPendantUsesLiveBlankPphFields(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            taxRate: 0.12,
            vatRate: 0.05,
            charityRate: 0.01,
            packagingHours: 8,
            plasticHours: 8,
            hardwareHours: 8,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
        };
        App.params = params;
        App.templates = [{
            id: 31,
            category: 'blank',
            custom_prices: {},
            custom_margins: {},
            pph_min: 100,
            pph_max: 120,
            pph_actual: null,
            weight_grams: 10,
            mold_count: 1,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            builtin_assembly_name: 'Сборка букв на шнур',
            builtin_assembly_speed: 600,
        }];
        const pendant = {
            item_type: 'pendant',
            name: 'ФНТР',
            quantity: 250,
            elements: [{ char: 'Ф' }, { char: 'Н' }, { char: 'Т' }, { char: 'Р' }],
            cords: [],
            carabiners: [],
            element_price_per_unit: 145.95,
            _totalSellPerUnit: 876,
        };
        const metrics = getPendantLetterBlankMetrics(1000, params, pendant);
        const result = calculatePendantCost(pendant, params);
        return { metrics, result };
    })()`, context));

    assert.ok(state.metrics && state.metrics.cost > 0, 'cyrillic pendant should resolve live blank metrics');
    assert.ok(state.result.hoursPlastic > 0, 'cyrillic pendant should contribute casting hours');
    assert.ok(state.result.hoursCutting > 0, 'cyrillic pendant should contribute trimming hours');
    assert.ok(state.result.hoursBuiltinAssembly > 0, 'cyrillic pendant should contribute built-in assembly hours');
    assert.equal(
        state.result.costPerUnit,
        Math.round(state.metrics.cost * 4 * 100) / 100,
        'cyrillic pendant should ignore stale saved per-letter cost and use current blank formula'
    );
}

async function smokeBlankBuiltinAssemblyUsesAssemblyLoad(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'all',
            indirectPerHour: 50,
            taxRate: 0.12,
            vatRate: 0.05,
            charityRate: 0.01,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
        };
        const item = {
            quantity: 600,
            pieces_per_hour: 120,
            weight_grams: 10,
            extra_molds: 0,
            complex_design: false,
            is_nfc: false,
            nfc_programming: false,
            delivery_included: false,
            builtin_assembly_name: 'Сборка букв на шнур',
            builtin_assembly_speed: 600,
        };
        const result = calculateItemCost(item, params);
        const load = calculateProductionLoad([{ result }], [], [], params, []);
        return { result, load };
    })()`, context));

    assert.ok(state.result.hoursPlasticZone > 0, 'blank should keep casting hours in plastic zone');
    assert.ok(state.result.hoursAssemblyZone > 0, 'blank should expose built-in assembly in assembly zone');
    assert.ok(state.result.costBuiltinAssembly > 0, 'blank should price built-in assembly as labor');
    assert.equal(state.load.hoursPlasticTotal, state.result.hoursPlasticZone, 'production load should keep plastic hours separate');
    assert.equal(state.load.hoursHardwareTotal, state.result.hoursAssemblyZone, 'production load should send built-in assembly to assembly bucket');
}

async function smokeBlankTemplateMoldCostOverridesGlobalDefault(context) {
    const state = clone(await vm.runInContext(`(() => {
        App.templates = [{
            id: 'blank-mold-override',
            name: 'Blank Mold Override',
            category: 'blank',
            pieces_per_hour_avg: 100,
            weight_grams: 10,
            cost_cny: 1000,
            cny_rate: 10,
            delivery_cost: 5000,
            mold_count: 2,
        }];
        const params = {
            ...App.params,
            wasteFactor: 1,
            fotPerHour: 0,
            indirectPerHour: 0,
            indirectCostMode: 'production',
            plasticCostPerKg: 0,
            cuttingSpeed: 1000,
            moldBaseCost: 20000,
        };
        const item = Calculator.getEmptyItem(1);
        item.quantity = 100;
        Calculator.items = [item];
        Calculator.onTemplatePickerSelect(0, 'blank-mold-override');
        Calculator.items[0].quantity = 100;
        const result = calculateItemCost(Calculator.items[0], params);
        return {
            blankMoldTotalCost: Calculator.items[0].blank_mold_total_cost,
            moldAmortization: result.costMoldAmortization,
        };
    })()`, context));

    assert.equal(state.blankMoldTotalCost, 30000, 'template should carry its real mold total cost into calculator items');
    assert.equal(state.moldAmortization, 6.67, 'blank mold amortization should come from template cost, not global mold setting');
}

async function smokeSavedBlankMoldCostSurvivesOrderReload(context) {
    const prepared = clone(await vm.runInContext(`(() => {
        App.templates = [{
            id: 'blank-mold-persist',
            name: 'Blank Mold Persist',
            pieces_per_hour_avg: 100,
            weight_grams: 10,
            cost_cny: 1500,
            cny_rate: 10,
            delivery_cost: 5000,
            mold_count: 2,
        }];
        Calculator.resetForm();
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.items[0].product_name = 'Blank Mold Persist';
        Calculator.items[0].template_id = 'blank-mold-persist';
        Calculator.items[0].is_blank_mold = true;
        Calculator.items[0].quantity = 100;
        Calculator.items[0].pieces_per_hour = 100;
        Calculator.items[0].weight_grams = 10;
        Calculator.items[0].blank_mold_total_cost = 30000;
        const saved = Calculator._collectItemsForSave()[0];
        return {
            saved,
            templateCurrent: getBlankTemplateTotalMoldCost(App.templates[0]),
        };
    })()`, context));

    context.__loadOrderData = {
        order: {
            id: 93003,
            order_name: 'Blank Mold Persist Order',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'draft',
        },
        items: [prepared.saved],
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);

    await vm.runInContext(`
        Calculator.renderItemBlock = () => {};
        Calculator.renderHardwareRow = () => {};
        Calculator.renderPackagingRow = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.recalculate = () => {};
        Calculator.showOrderHistory = () => {};
        Calculator._ensureWhPickerData = async () => ({});
    `, context);

    await vm.runInContext(`Calculator.loadOrder(93003)`, context);
    const restored = clone(await vm.runInContext(`({
        blankMoldTotalCost: Calculator.items[0].blank_mold_total_cost,
        savedBlankMoldTotalCost: Calculator._collectItemsForSave()[0].blank_mold_total_cost,
    })`, context));

    assert.equal(prepared.templateCurrent, 40000, 'test should use a current template cost different from the saved historical one');
    assert.equal(restored.blankMoldTotalCost, 30000, 'loading an order should preserve the saved blank mold total cost');
    assert.equal(restored.savedBlankMoldTotalCost, 30000, 're-saving a loaded order should keep the same blank mold total cost');
}

async function smokePendantFinDirectorUsesCurrentLetterCost(context) {
    const finState = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            taxRate: 0.12,
            vatRate: 0.05,
            charityRate: 0.01,
            packagingHours: 8,
            plasticHours: 8,
            hardwareHours: 8,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
        };
        App.params = params;
        App.templates = [{
            id: 30,
            category: 'blank',
            custom_prices: {},
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
        const pendant = {
            quantity: 100,
            name: 'AB',
            elements: [{ char: 'A' }, { char: 'B' }],
            cords: [],
            carabiners: [],
            element_price_per_unit: 999,
            result: {
                assemblyHours: 0,
                packagingHours: 0,
                totalRevenue: 0,
            },
        };
        const metrics = getPendantLetterBlankMetrics(200, params);
        const fin = calculateFinDirectorData([], [], [], params, [pendant]);
        return {
            fin,
            expected: metrics ? {
                salary: metrics.breakdown.salaryTotal,
                indirect: metrics.breakdown.omittedIndirectTotal,
                hardwarePurchase: metrics.breakdown.hardwarePurchaseTotal,
                hardwareDelivery: metrics.breakdown.hardwareDeliveryTotal,
                nfcTotal: metrics.breakdown.nfcTotal,
                plastic: metrics.breakdown.plasticTotal,
                molds: metrics.breakdown.moldsTotal,
                printing: metrics.breakdown.printingTotal,
            } : null,
        };
    })()`, context));

    assert.ok(finState.expected, 'pendant letter metrics should be available for fin director split');
    assert.equal(finState.fin.salary, finState.expected.salary, 'fin director salary should include letter production labour');
    assert.equal(finState.fin.indirect, finState.expected.indirect, 'fin director should expose pendant indirect production separately');
    assert.equal(finState.fin.hardwarePurchase, finState.expected.hardwarePurchase, 'fin director hardware purchase should only include built-in hardware purchase for letters');
    assert.equal(finState.fin.hardwareDelivery, finState.expected.hardwareDelivery, 'fin director hardware delivery should include built-in hardware delivery for letters');
    assert.equal(finState.fin.nfcTotal, finState.expected.nfcTotal, 'fin director should keep built-in NFC separate from ordinary hardware');
    assert.equal(finState.fin.plastic, finState.expected.plastic, 'fin director plastic should include letter plastic cost');
    assert.equal(finState.fin.molds, finState.expected.molds, 'fin director molds should include letter mold amortization');
    assert.equal(finState.fin.printing, finState.expected.printing, 'fin director printing should include letter printing cost');
    assert.ok(finState.fin.plastic > 0, 'pendant letters should not disappear from plastic budget');
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

async function smokeCurrentPendantPayloadBeatsStaleNested(context) {
    const staleNestedPendant = {
        item_type: 'pendant',
        name: 'STALE',
        quantity: 7,
        elements: [{ char: 'S' }],
        cord: { name: 'Stale Cord' },
        carabiner: { name: 'Stale Carabiner' },
        element_price_per_unit: 999,
        _totalSellPerUnit: 11,
    };
    const currentPendant = {
        item_type: 'pendant',
        name: 'CURRENT',
        quantity: 7,
        elements: [{ char: 'C' }, { char: 'U' }],
        cords: [{ name: 'Current Cord', allocated_qty: 7, qty_per_pendant: 1 }],
        carabiners: [{ name: 'Current Carabiner', allocated_qty: 7, qty_per_pendant: 1 }],
        element_price_per_unit: 55,
        _totalSellPerUnit: 77,
        item_data: JSON.stringify(staleNestedPendant),
    };
    const currentRow = {
        item_number: 400,
        item_type: 'pendant',
        product_name: 'Подвес "CURRENT"',
        quantity: 7,
        cost_total: 20,
        sell_price_item: 77,
        item_data: JSON.stringify(currentPendant),
    };

    context.__loadOrderData = {
        order: {
            id: 9003,
            order_name: 'Current Smoke Order',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'draft',
        },
        items: [clone(currentRow)],
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);

    await vm.runInContext('Calculator.loadOrder(9003)', context);
    const restored = clone(await vm.runInContext('Calculator.pendants[0]', context));

    assert.equal(restored.name, 'CURRENT');
    assert.equal(restored._totalSellPerUnit, 77);
    assert.equal(restored.cords[0].name, 'Current Cord');
    assert.equal(restored.carabiners[0].name, 'Current Carabiner');
    assert.equal(restored.element_price_per_unit, 55);
    assert.equal('item_data' in restored, false);
}

async function smokeCloneOrderRestoresLegacySnapshotItems(context) {
    context.__savedClonePayload = null;
    context.__loadedCloneOrderId = null;
    context.__loadOrderData = {
        order: {
            id: 9003,
            order_name: 'Legacy Snapshot Order',
            status: 'production_hardware',
            items_snapshot: JSON.stringify([{
                item_type: 'product',
                item_number: 1,
                product_name: 'Legacy Product',
                quantity: 50,
                pieces_per_hour: 120,
                printings: [{ name: 'Лого', qty: 1, price: 5 }],
                colors: [{ id: 12, name: 'Белый' }],
                color_solution_attachment: { name: 'legacy.pdf' },
            }]),
            hardware_snapshot: JSON.stringify([{
                name: 'Legacy Hook',
                qty: 50,
                assembly_minutes: 1,
                price: 3,
                delivery_total: 15,
                delivery_price: 0.3,
                sell_price: 5,
                source: 'warehouse',
                warehouse_item_id: 501,
                warehouse_sku: 'HK-501',
            }]),
            packaging_snapshot: JSON.stringify([{
                name: 'Legacy Pouch',
                qty: 50,
                assembly_speed: 120,
                price: 2,
                delivery_total: 10,
                delivery_price: 0.2,
                sell_price: 4,
                source: 'china',
                china_item_id: 601,
                china_delivery_method: 'avia_fast',
                price_cny: 0.5,
                weight_grams: 3.2,
            }]),
            calculator_data: JSON.stringify({
                extraCosts: [
                    { name: 'Монтаж', amount: 250 },
                ],
                pendants: [
                    {
                        name: 'LEGACY',
                        quantity: 2,
                        elements: [{ char: 'L' }],
                        result: { costPerUnit: 11, sellPerUnit: 44 },
                    },
                ],
            }),
        },
        items: [],
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);
    context.saveOrder = async (order, items) => {
        context.__savedClonePayload = {
            order: clone(order),
            items: clone(items),
        };
        return 9103;
    };

    vm.runInContext(`
        Calculator.loadOrder = (id) => {
            globalThis.__loadedCloneOrderId = id;
        };
    `, context);

    await vm.runInContext(`Orders.cloneOrder(9003)`, context);

    const saved = clone(context.__savedClonePayload);
    assert.ok(saved, 'clone fallback should save rebuilt order payload');
    assert.equal(saved.order.order_name, 'Legacy Snapshot Order (копия)');
    assert.equal(saved.order.status, 'draft');
    assert.equal(saved.items.length, 5);

    const product = saved.items.find(item => item.item_type === 'product');
    const hardware = saved.items.find(item => item.item_type === 'hardware');
    const packaging = saved.items.find(item => item.item_type === 'packaging');
    const extraCost = saved.items.find(item => item.item_type === 'extra_cost');
    const pendant = saved.items.find(item => item.item_type === 'pendant');

    assert.equal(product.product_name, 'Legacy Product');
    assert.equal(product.quantity, 50);
    assert.equal(JSON.parse(product.printings)[0].name, 'Лого');
    assert.equal(JSON.parse(product.colors)[0].name, 'Белый');
    assert.equal(JSON.parse(product.color_solution_attachment).name, 'legacy.pdf');

    assert.equal(hardware.product_name, 'Legacy Hook');
    assert.equal(hardware.quantity, 50);
    assert.equal(hardware.hardware_assembly_speed, 60);
    assert.equal(hardware.hardware_price_per_unit, 3);
    assert.equal(hardware.hardware_warehouse_item_id, 501);
    assert.equal(hardware.hardware_warehouse_sku, 'HK-501');

    assert.equal(packaging.product_name, 'Legacy Pouch');
    assert.equal(packaging.quantity, 50);
    assert.equal(packaging.packaging_assembly_speed, 120);
    assert.equal(packaging.packaging_source, 'china');
    assert.equal(packaging.china_item_id, 601);
    assert.equal(packaging.china_delivery_method, 'avia_fast');

    assert.equal(extraCost.product_name, 'Монтаж');
    assert.equal(extraCost.cost_total, 250);
    assert.equal(extraCost.sell_price_item, 250);

    assert.equal(pendant.product_name, 'Подвес "LEGACY"');
    assert.equal(pendant.quantity, 2);
    assert.equal(pendant.cost_total, 11);
    assert.equal(pendant.sell_price_item, 44);

    assert.equal(context.__loadedCloneOrderId, 9103);
}

async function smokeCloneOrderPrefersNormalizedItems(context) {
    context.__savedClonePayload = null;
    context.__loadedCloneOrderId = null;
    context.__loadOrderData = {
        order: {
            id: 9010,
            order_name: 'Normalized Source Order',
            status: 'completed',
            items_snapshot: JSON.stringify([
                { item_number: 1, item_type: 'product', product_name: 'Stale Snapshot Product', quantity: 1 },
            ]),
            calculator_data: JSON.stringify({
                extraCosts: [
                    { name: 'Stale Extra', amount: 999 },
                ],
            }),
        },
        items: [
            {
                id: 7001,
                order_id: 9010,
                item_number: 1,
                item_type: 'product',
                product_name: 'Normalized Product',
                quantity: 10,
                cost_total: 100,
                sell_price_item: 150,
            },
            {
                id: 7002,
                order_id: 9010,
                item_number: 2,
                item_type: 'hardware',
                product_name: 'Normalized Hardware',
                quantity: 10,
                hardware_price_per_unit: 5,
            },
        ],
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);
    context.saveOrder = async (order, items) => {
        context.__savedClonePayload = {
            order: clone(order),
            items: clone(items),
        };
        return 9110;
    };

    vm.runInContext(`
        Calculator.loadOrder = (id) => {
            globalThis.__loadedCloneOrderId = id;
        };
    `, context);

    await vm.runInContext(`Orders.cloneOrder(9010)`, context);

    const saved = clone(context.__savedClonePayload);
    assert.ok(saved, 'normalized clone should save payload');
    assert.equal(saved.order.order_name, 'Normalized Source Order (копия)');
    assert.equal(saved.order.status, 'draft');
    assert.equal(saved.items.length, 2);
    assert.deepEqual(saved.items.map(item => item.product_name), ['Normalized Product', 'Normalized Hardware']);
    assert.equal(saved.items[0].id, undefined);
    assert.equal(saved.items[0].order_id, undefined);
    assert.equal(saved.items[1].item_type, 'hardware');
    assert.equal(context.__loadedCloneOrderId, 9110);
}

async function smokeReadyGoodsRollback(context) {
    context.getReadyGoodsSourceStatus = () => ({
        ready_goods: { source: 'shared-settings' },
        ready_goods_history: { source: 'shared-settings' },
        sales_records: { source: 'shared-settings' },
    });
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

        await vm.runInContext(`Orders._syncReadyGoodsByStatus(42, { order_name: 'Smoke Order', client_name: 'Acme' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(77, { order_name: 'B2C Stock', client_name: 'B2C' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(42, { order_name: 'Smoke Order' }, 'completed', 'delivery')`, context);

        assert.deepEqual(clone(context.__moveCalls), [{ orderId: 77, orderName: 'B2C Stock' }]);
        assert.deepEqual(clone(context.__removeCalls), [{ orderId: 42, orderName: 'Smoke Order', nextStatus: 'delivery' }]);
    } finally {
        vm.runInContext(`
            Warehouse.moveOrderToReadyGoods = globalThis.__originalMoveOrderToReadyGoods;
            Warehouse.removeOrderFromReadyGoods = globalThis.__originalRemoveOrderFromReadyGoods;
        `, context);
    }
}

async function smokeReadyGoodsSalesAndManualAdd(context) {
    context.getReadyGoodsSourceStatus = () => ({
        ready_goods: { source: 'shared-settings' },
        ready_goods_history: { source: 'shared-settings' },
        sales_records: { source: 'shared-settings' },
    });
    context.__readyGoods = [
        {
            id: 11,
            product_name: 'Ready Smoke Product',
            order_name: 'Smoke Order',
            order_id: 42,
            marketplace_set: 'Smoke Set',
            location_type: 'partner',
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
    assert.equal(context.__salesRecords[0].location_type, 'partner');
    assert.equal(context.__salesRecords[0].qty, 3);
    assert.equal(context.__salesRecords[0].revenue, 1500);
    assert.equal(context.__salesRecords[0].payout, 1200);
    assert.equal(context.__readyGoodsHistory.length, 1);
    assert.equal(context.__readyGoodsHistory[0].type, 'writeoff');
    assert.equal(context.__readyGoodsHistory[0].location_type, 'partner');
    assert.equal(context.__readyGoodsHistory[0].qty, -3);
    assert.match(context.__readyGoodsHistory[0].notes, /WB test/);

    context.document.getElementById('rg-add-name').value = 'Manual Smoke Product';
    context.document.getElementById('rg-add-qty').value = '5';
    context.document.getElementById('rg-add-cost').value = '22.5';
    context.document.getElementById('rg-add-location').value = 'our';
    context.document.getElementById('rg-add-set').value = 'Manual Set';

    await vm.runInContext('Warehouse.doAddReadyGoods()', context);

    assert.equal(context.__readyGoods.length, 2);
    const manualItem = context.__readyGoods.find(item => item.product_name === 'Manual Smoke Product');
    assert.equal(manualItem.qty, 5);
    assert.equal(manualItem.cost_per_unit, 22.5);
    assert.equal(manualItem.marketplace_set, 'Manual Set');
    assert.equal(manualItem.location_type, 'our');
    assert.equal(context.__readyGoodsHistory.length, 2);
    assert.equal(context.__readyGoodsHistory[1].type, 'manual_add');
    assert.equal(context.__readyGoodsHistory[1].location_type, 'our');
    assert.equal(context.__readyGoodsHistory[1].qty, 5);
    assert.match(context.__readyGoodsHistory[1].notes, /Ручное добавление/);

    await vm.runInContext('Warehouse.renderReadyGoodsView()', context);
    const readyGoodsHtml = String(context.document.getElementById('wh-content').innerHTML || '');
    assert.match(readyGoodsHtml, /Наш склад/);
    assert.match(readyGoodsHtml, /Склад партнёра/);
    assert.match(readyGoodsHtml, /Со склада/);
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

async function smokeChinaReceiptBlocksWeakAutoCreatedItems(context) {
    const fieldValues = {
        'wh-sh-name': 'Weak Receipt Shipment',
        'wh-sh-date': '2026-03-16',
        'wh-sh-supplier': 'China Supplier',
        'wh-sh-cny-rate': '12.5',
        'wh-sh-fee-cashout': '5',
        'wh-sh-fee-crypto': '2',
        'wh-sh-fee-1688': '1',
        'wh-sh-delivery-china': '2500',
        'wh-sh-delivery-moscow': '500',
        'wh-sh-total-delivery': '3000',
        'wh-sh-pricing-mode': 'weighted_avg',
        'wh-sh-notes': 'Weak note',
    };
    Object.entries(fieldValues).forEach(([id, value]) => {
        context.document.getElementById(id).value = value;
    });

    context.__savedShipment = null;
    context.__savedWarehouseItem = null;
    context.__alerts = [];
    context.__toasts = [];
    context.alert = (message) => { context.__alerts.push(String(message || '')); };
    context.window.alert = context.alert;
    context.saveShipment = async (shipment) => {
        context.__savedShipment = clone(shipment);
        return shipment.id || 89;
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems || []);
    context.saveWarehouseItem = async (item) => {
        context.__savedWarehouseItem = clone(item);
        return item.id || 1900;
    };

    vm.runInContext(`
        App.toast = (message) => {
            globalThis.__toasts.push(String(message || ''));
        };
        Warehouse.editingShipmentId = null;
        Warehouse.allShipments = [];
        Warehouse.shipmentItems = [{
            source: 'new',
            category: 'other',
            name: 'Шнур с силиконом',
            sku: '',
            color: '',
            size: '',
            unit: 'шт',
            qty_received: 2000,
            weight_grams: 120,
            purchase_price_cny: 30,
            purchase_price_rub: 0,
            delivery_allocated: 0,
            total_cost_per_unit: 22.49,
        }];
    `, context);

    await vm.runInContext('Warehouse.confirmShipment()', context);

    assert.equal(context.__savedShipment, null, 'weak shipment rows should block receipt confirmation');
    assert.equal(context.__savedWarehouseItem, null, 'weak shipment rows should not auto-create warehouse items');
    assert.match(String(context.__alerts.join('\n')), /нельзя автоматически принять/i);
    assert.match(String(context.__alerts.join('\n')), /Шнур с силиконом/);
    assert.match(String(context.__toasts.join('\n')), /не хватает данных/i);
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
        const normalized = clone(item);
        const existingIdx = context.__warehouseItems.findIndex(entry => Number(entry.id) === Number(normalized.id));
        if (existingIdx >= 0) {
            context.__warehouseItems[existingIdx] = normalized;
            return normalized.id;
        }
        const id = normalized.id || (1201 + context.__warehouseItems.length);
        context.__warehouseItems.push({ ...normalized, id });
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

async function smokeCompletedStatusGuardBlocksUntilAllCollected(context) {
    context.__projectHardwareState = { checks: { '42:501': true } };
    context.__warehouseHistory = [{
        id: 1,
        item_id: 501,
        item_name: 'Collected hardware',
        item_sku: 'COL-501',
        item_category: 'hardware',
        type: 'deduction',
        qty_change: -2,
        requested_qty_change: -2,
        qty_before: 10,
        qty_after: 8,
        unit_price: 10,
        total_cost_change: 20,
        order_id: 42,
        order_name: 'Guarded Order',
        notes: 'Списание собранной позиции со склада: 2 шт',
        clamped: false,
        created_at: '2026-03-17T10:10:00.000Z',
        created_by: 'Smoke',
        project_hardware_flow: 'ready_toggle',
        project_hardware_target_qty: 2,
    }];
    context.__orderDetails = {
        42: {
            order: { id: 42, order_name: 'Guarded Order', status: 'delivery' },
            items: [
                {
                    item_type: 'hardware',
                    product_name: 'Collected hardware',
                    quantity: 2,
                    hardware_source: 'warehouse',
                    hardware_warehouse_item_id: 501,
                },
                {
                    item_type: 'packaging',
                    product_name: 'Pending packaging',
                    quantity: 1,
                    packaging_source: 'warehouse',
                    packaging_warehouse_item_id: 601,
                },
            ],
        },
    };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.__ordersUpdateCalls = [];
    context.updateOrderStatus = async (orderId, status) => {
        context.__ordersUpdateCalls.push({ orderId: Number(orderId), status: String(status) });
    };
    context.__toasts = [];

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        globalThis.__syncWarehouseCalls = [];
        globalThis.__readyGoodsCalls = [];
        globalThis.__changeRecordCalls = [];
        globalThis.__renderCount = 0;
        globalThis.__loadListCount = 0;
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Orders.allOrders = [{ id: 42, order_name: 'Guarded Order', status: 'delivery' }];
        Orders.render = () => { globalThis.__renderCount += 1; };
        Orders.loadList = () => { globalThis.__loadListCount += 1; };
        Orders._syncWarehouseByStatus = async (...args) => { globalThis.__syncWarehouseCalls.push(args); };
        Orders._syncReadyGoodsByStatus = async (...args) => { globalThis.__readyGoodsCalls.push(args); };
        Orders.addChangeRecord = async (...args) => { globalThis.__changeRecordCalls.push(args); };
    `, context);

    const blocked = clone(await vm.runInContext(`Orders._ensureStatusTransitionAllowed(42, 'completed')`, context));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.summary.totalRows, 2);
    assert.equal(blocked.summary.readyRows, 1);
    assert.equal(blocked.summary.pendingRows, 1);
    assert.ok(context.__toasts.some(message => /нельзя перевести заказ в «готово»/i.test(message)));
    assert.ok(context.__toasts.some(message => /собрано 1 из 2/i.test(message)));

    context.__toasts = [];
    vm.runInContext(`globalThis.__toasts = [];`, context);
    await vm.runInContext(`Orders.onStatusChange(42, 'completed', 'delivery')`, context);

    assert.equal(context.__ordersUpdateCalls.length, 0);
    assert.deepEqual(clone(context.__syncWarehouseCalls || []), []);
    assert.deepEqual(clone(context.__readyGoodsCalls || []), []);
    assert.deepEqual(clone(context.__changeRecordCalls || []), []);
    assert.equal(vm.runInContext(`globalThis.__renderCount`, context), 1);
    assert.equal(vm.runInContext(`globalThis.__loadListCount`, context), 0);

    context.__projectHardwareState = { checks: { '42:501': true, '42:601': true } };
    context.__warehouseHistory = [
        ...context.__warehouseHistory,
        {
            id: 2,
            item_id: 601,
            item_name: 'Pending packaging',
            item_sku: 'PKG-601',
            item_category: 'packaging',
            type: 'deduction',
            qty_change: -1,
            requested_qty_change: -1,
            qty_before: 7,
            qty_after: 6,
            unit_price: 5,
            total_cost_change: 5,
            order_id: 42,
            order_name: 'Guarded Order',
            notes: 'Списание собранной позиции со склада: 1 шт',
            clamped: false,
            created_at: '2026-03-17T10:12:00.000Z',
            created_by: 'Smoke',
            project_hardware_flow: 'ready_toggle',
            project_hardware_target_qty: 1,
        }
    ];
    context.__toasts = [];
    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        globalThis.__toasts = [];
        globalThis.__renderCount = 0;
        globalThis.__loadListCount = 0;
    `, context);
    context.__ordersUpdateCalls = [];
    vm.runInContext(`
        globalThis.__syncWarehouseCalls = [];
        globalThis.__readyGoodsCalls = [];
        globalThis.__changeRecordCalls = [];
    `, context);

    await vm.runInContext(`Orders.onStatusChange(42, 'completed', 'delivery')`, context);

    assert.deepEqual(clone(context.__ordersUpdateCalls), [{ orderId: 42, status: 'completed' }]);
    assert.equal((clone(context.__syncWarehouseCalls) || []).length, 1);
    assert.equal((clone(context.__readyGoodsCalls) || []).length, 1);
    assert.equal((clone(context.__changeRecordCalls) || []).length, 1);
    assert.equal(vm.runInContext(`globalThis.__loadListCount`, context), 1);
}

async function smokeOrderDetailCompletedGuard(context) {
    context.__projectHardwareState = { checks: {} };
    context.__warehouseHistory = [];
    context.__orderDetails = {
        77: {
            order: { id: 77, order_name: 'Order Detail Guard', status: 'delivery' },
            items: [{
                item_type: 'hardware',
                product_name: 'Detail hardware',
                quantity: 1,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 701,
            }],
        },
    };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.__ordersUpdateCalls = [];
    context.updateOrderStatus = async (orderId, status) => {
        context.__ordersUpdateCalls.push({ orderId: Number(orderId), status: String(status) });
    };
    context.__toasts = [];
    context.__promptQueue = ['7', 'Smoke'];
    context.prompt = () => context.__promptQueue.shift() || '';

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Orders._syncWarehouseByStatus = async () => { throw new Error('status sync should not run when completed is blocked'); };
        Orders._syncReadyGoodsByStatus = async () => { throw new Error('ready goods sync should not run when completed is blocked'); };
        Orders.addChangeRecord = async () => { throw new Error('change record should not run when completed is blocked'); };
        OrderDetail.currentOrder = { id: 77, order_name: 'Order Detail Guard', status: 'delivery' };
        OrderDetail.currentItems = [];
    `, context);

    await vm.runInContext(`OrderDetail.changeStatus()`, context);

    assert.equal(context.__ordersUpdateCalls.length, 0);
    assert.ok((clone(context.__toasts) || []).some(message => /нельзя перевести заказ в «готово»/i.test(message)));
}

async function smokeProductionPlanCompletedGuard(context) {
    if (!vm.runInContext(`typeof ProductionPlan !== 'undefined'`, context)) {
        runScript(context, 'js/production_plan.js');
    }

    context.__projectHardwareState = { checks: {} };
    context.__warehouseHistory = [];
    context.__orderDetails = {
        91: {
            order: { id: 91, order_name: 'Plan Guard', status: 'delivery' },
            items: [{
                item_type: 'hardware',
                product_name: 'Plan hardware',
                quantity: 1,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 801,
            }],
        },
    };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.__ordersUpdateCalls = [];
    context.updateOrderStatus = async (orderId, status) => {
        context.__ordersUpdateCalls.push({ orderId: Number(orderId), status: String(status) });
    };
    context.__toasts = [];

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        globalThis.__toasts = [];
        globalThis.__planLoadCount = 0;
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Orders._syncWarehouseByStatus = async () => { throw new Error('status sync should not run when production plan completed is blocked'); };
        Orders.addChangeRecord = async () => { throw new Error('change record should not run when production plan completed is blocked'); };
        ProductionPlan.load = async () => { globalThis.__planLoadCount += 1; };
        ProductionPlan.allRows = [{ id: 91, status: 'delivery', orderName: 'Plan Guard' }];
    `, context);

    await vm.runInContext(`ProductionPlan.goNextStage(91)`, context);

    assert.equal(context.__ordersUpdateCalls.length, 0);
    assert.equal(vm.runInContext(`ProductionPlan.allRows[0].status`, context), 'delivery');
    assert.equal(vm.runInContext(`globalThis.__planLoadCount`, context), 0);
    assert.ok((clone(context.__toasts) || []).some(message => /нельзя перевести заказ в «готово»/i.test(message)));

    context.__projectHardwareState = { checks: { '91:801': true } };
    context.__warehouseHistory = [{
        id: 1,
        item_id: 801,
        item_name: 'Plan hardware',
        item_sku: 'PLN-801',
        item_category: 'hardware',
        type: 'deduction',
        qty_change: -1,
        requested_qty_change: -1,
        qty_before: 4,
        qty_after: 3,
        unit_price: 10,
        total_cost_change: 10,
        order_id: 91,
        order_name: 'Plan Guard',
        notes: 'Списание собранной позиции со склада: 1 шт',
        clamped: false,
        created_at: '2026-03-17T10:15:00.000Z',
        created_by: 'Smoke',
        project_hardware_flow: 'ready_toggle',
        project_hardware_target_qty: 1,
    }];
    context.__ordersUpdateCalls = [];
    context.__toasts = [];
    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        globalThis.__toasts = [];
        globalThis.__planLoadCount = 0;
        globalThis.__warehouseSyncCalls = [];
        globalThis.__changeRecordCalls = [];
        Orders._syncWarehouseByStatus = async (...args) => { globalThis.__warehouseSyncCalls.push(args); };
        Orders.addChangeRecord = async (...args) => { globalThis.__changeRecordCalls.push(args); };
        ProductionPlan.allRows = [{ id: 91, status: 'delivery', orderName: 'Plan Guard' }];
    `, context);

    await vm.runInContext(`ProductionPlan.goNextStage(91)`, context);

    assert.deepEqual(clone(context.__ordersUpdateCalls), [{ orderId: 91, status: 'completed' }]);
    assert.equal(vm.runInContext(`ProductionPlan.allRows[0].status`, context), 'completed');
    assert.equal(vm.runInContext(`globalThis.__planLoadCount`, context), 1);
    assert.equal((clone(vm.runInContext(`globalThis.__warehouseSyncCalls`, context)) || []).length, 1);
    assert.equal((clone(vm.runInContext(`globalThis.__changeRecordCalls`, context)) || []).length, 1);
}

async function smokePendantWarehouseDemandSync(context) {
    context.__smokePendantDemandItems = [{
        item_type: 'pendant',
        name: 'AB',
        product_name: 'Подвес "AB"',
        quantity: 300,
        cords: [{
            source: 'warehouse',
            warehouse_item_id: 701,
            warehouse_sku: 'SLS-800-HNY-NN',
            name: 'Шнур 80 см медовый',
            unit: 'шт',
            qty_per_pendant: 1,
            allocated_qty: 100,
            price_per_unit: 23,
        }, {
            source: 'warehouse',
            warehouse_item_id: 702,
            warehouse_sku: 'SLS-800-SLD-NN',
            name: 'Шнур 80 см салатовый',
            unit: 'шт',
            allocated_qty: 200,
            qty_per_pendant: 1,
            price_per_unit: 23,
        }],
        carabiners: [{
            source: 'warehouse',
            warehouse_item_id: 801,
            warehouse_sku: 'CR-STD-050-RD+',
            name: 'Карабин 5 см красный',
            unit: 'шт',
            allocated_qty: 100,
            qty_per_pendant: 1,
            price_per_unit: 10,
        }, {
            source: 'warehouse',
            warehouse_item_id: 802,
            warehouse_sku: 'CR-STD-050-VT+',
            name: 'Карабин 5 см фиолетовый',
            unit: 'шт',
            allocated_qty: 200,
            qty_per_pendant: 1,
            price_per_unit: 10,
        }],
    }];

    const demandRows = clone(await vm.runInContext(`(() => {
        return Warehouse._collectWarehouseDemandFromOrderItems(globalThis.__smokePendantDemandItems);
    })()`, context));
    demandRows.sort((a, b) => Number(a.warehouse_item_id) - Number(b.warehouse_item_id));

    assert.equal(demandRows.length, 4);
    assert.equal(demandRows[0].warehouse_item_id, 701);
    assert.equal(demandRows[0].qty, 100);
    assert.equal(demandRows[0].material_type, 'hardware');
    assert.match(demandRows[0].names[0], /Подвес "AB" · Шнур 80 см медовый/);
    assert.equal(demandRows[1].warehouse_item_id, 702);
    assert.equal(demandRows[1].qty, 200);
    assert.equal(demandRows[2].warehouse_item_id, 801);
    assert.equal(demandRows[2].qty, 100);
    assert.equal(demandRows[3].warehouse_item_id, 802);
    assert.equal(demandRows[3].qty, 200);

    const orderDemand = clone(await vm.runInContext(`(() => {
        return Array.from(Orders._collectWarehouseDemand(globalThis.__smokePendantDemandItems, { hardware: true, packaging: false }).entries());
    })()`, context));
    orderDemand.sort((a, b) => Number(a[0]) - Number(b[0]));

    assert.deepEqual(orderDemand, [
        [701, 100],
        [702, 200],
        [801, 100],
        [802, 200],
    ]);

    const meta = clone(await vm.runInContext(`Orders.buildHardwareMeta(globalThis.__smokePendantDemandItems)`, context));
    assert.equal(meta.label, 'Фурнитура из наличия');

    const calcDemand = clone(await vm.runInContext(`(() => {
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = globalThis.__smokePendantDemandItems;
        return Array.from(Calculator._collectWarehouseReservationDemand({ hardware: true, packaging: false }).entries());
    })()`, context));
    calcDemand.sort((a, b) => Number(a[0]) - Number(b[0]));

    assert.deepEqual(calcDemand, [
        [701, 100],
        [702, 200],
        [801, 100],
        [802, 200],
    ]);
}

async function smokeProductNfcWarehouseDemandSync(context) {
    context.__smokeNfcWarehouseItems = [{
        id: 197,
        name: 'NFC',
        sku: 'NFC',
        category: 'other',
        qty: 160,
        unit: 'шт',
        price_per_unit: 8,
    }];
    context.__smokeNfcDemandItems = [{
        item_type: 'product',
        product_name: 'Кастомная бирка',
        quantity: 12,
        is_nfc: true,
        nfc_programming: false,
        nfc_warehouse_item_id: 197,
    }];

    const demandRows = clone(await vm.runInContext(`(() => {
        Warehouse.allItems = globalThis.__smokeNfcWarehouseItems;
        return Warehouse._collectWarehouseDemandFromOrderItems(globalThis.__smokeNfcDemandItems);
    })()`, context));
    assert.equal(demandRows.length, 1);
    assert.equal(demandRows[0].warehouse_item_id, 197);
    assert.equal(demandRows[0].qty, 12);
    assert.equal(demandRows[0].material_type, 'hardware');
    assert.match(demandRows[0].names[0], /Кастомная бирка · NFC/);

    const orderDemand = clone(await vm.runInContext(`(() => {
        return Array.from(Orders._collectWarehouseDemand(globalThis.__smokeNfcDemandItems, { hardware: true, packaging: false }).entries());
    })()`, context));
    assert.deepEqual(orderDemand, [[197, 12]]);

    const meta = clone(await vm.runInContext(`Orders.buildHardwareMeta(globalThis.__smokeNfcDemandItems)`, context));
    assert.equal(meta.label, 'Фурнитура из наличия');

    const calcDemand = clone(await vm.runInContext(`(() => {
        Calculator._whPickerData = { other: { items: globalThis.__smokeNfcWarehouseItems } };
        Calculator.items = globalThis.__smokeNfcDemandItems;
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        return Array.from(Calculator._collectWarehouseReservationDemand({ hardware: true, packaging: false }).entries());
    })()`, context));
    assert.deepEqual(calcDemand, [[197, 12]]);

    context.__smokeNfcDemandItemsWithManualDuplicate = [
        ...context.__smokeNfcDemandItems,
        {
            item_type: 'hardware',
            product_name: 'NFC',
            quantity: 12,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 197,
        },
    ];

    const dedupedWarehouseDemand = clone(await vm.runInContext(`(() => {
        Warehouse.allItems = globalThis.__smokeNfcWarehouseItems;
        return Warehouse._collectWarehouseDemandFromOrderItems(globalThis.__smokeNfcDemandItemsWithManualDuplicate);
    })()`, context));
    assert.equal(dedupedWarehouseDemand.length, 1);
    assert.equal(dedupedWarehouseDemand[0].warehouse_item_id, 197);
    assert.equal(dedupedWarehouseDemand[0].qty, 12);

    const dedupedOrderDemand = clone(await vm.runInContext(`(() => {
        return Array.from(Orders._collectWarehouseDemand(globalThis.__smokeNfcDemandItemsWithManualDuplicate, { hardware: true, packaging: false }).entries());
    })()`, context));
    assert.deepEqual(dedupedOrderDemand, [[197, 12]]);

    const dedupedCalcDemand = clone(await vm.runInContext(`(() => {
        Calculator._whPickerData = { other: { items: globalThis.__smokeNfcWarehouseItems } };
        Calculator.items = globalThis.__smokeNfcDemandItemsWithManualDuplicate.filter(item => item.item_type === 'product');
        Calculator.hardwareItems = [{
            source: 'warehouse',
            warehouse_item_id: 197,
            qty: 12,
        }];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        return Array.from(Calculator._collectWarehouseReservationDemand({ hardware: true, packaging: false }).entries());
    })()`, context));
    assert.deepEqual(dedupedCalcDemand, [[197, 12]]);
}

async function smokeTemplateBuiltInNfcUsesWarehouseDemand(context) {
    vm.runInContext(`
        App.templates = [{
            id: 'tmpl-builtin-nfc',
            name: 'NFC Бирка',
            category: 'blank',
            hw_name: 'NFC',
            hw_price_per_unit: 10,
            hw_delivery_total: 0,
            hw_speed: 0,
            hw_source: 'warehouse',
            hw_warehouse_item_id: 197,
            hw_warehouse_sku: 'NFC',
        }];
        Calculator.items = [Object.assign(Calculator.getEmptyItem(1), {
            product_name: 'Встроенная NFC',
            quantity: 12,
            is_blank_mold: true,
            template_id: 'tmpl-builtin-nfc',
        })];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        Calculator._whPickerData = { other: { items: [{
            id: 197,
            name: 'NFC',
            sku: 'NFC',
            category: 'other',
            qty: 160,
            unit: 'шт',
            price_per_unit: 8,
        }] } };
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.rerenderAllHardware = () => {};
        Calculator._syncTemplateHardware(0, App.templates[0]);
        globalThis.__templateHw = Calculator.hardwareItems[0];
        globalThis.__templateDemand = Array.from(Calculator._collectWarehouseReservationDemand({ hardware: true, packaging: false }).entries());
    `, context);

    const hw = clone(vm.runInContext('globalThis.__templateHw', context));
    assert.equal(hw.source, 'warehouse');
    assert.equal(hw.warehouse_item_id, 197);
    assert.equal(hw.warehouse_sku, 'NFC');
    assert.equal(hw.price, 10);

    const demand = clone(vm.runInContext('globalThis.__templateDemand', context));
    assert.deepEqual(demand, [[197, 12]]);

    vm.runInContext('delete globalThis.__templateHw; delete globalThis.__templateDemand;', context);
}

async function smokeProjectHardwareShortageDetailsForHiddenNfc(context) {
    const order = {
        id: 656,
        order_name: 'NFC Shortage Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-04-02T09:00:00.000Z',
    };
    const items = [{
        item_type: 'product',
        product_name: 'Карточка с NFC',
        quantity: 12,
        is_nfc: true,
        nfc_programming: false,
        nfc_warehouse_item_id: 197,
    }];

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 197,
        name: 'NFC',
        sku: 'NFC',
        category: 'other',
        qty: 5,
        unit: 'шт',
        price_per_unit: 8,
    }];
    context.__warehouseHistory = [];
    context.__toasts = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => { context.__projectHardwareState = clone(state); };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => { context.__reservations = clone(reservations); };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (itemsArg) => { context.__warehouseItems = clone(itemsArg); };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => { context.__warehouseHistory = clone(history); };
    context.loadOrder = async (orderId) => clone({ order: clone(order), items: clone(items) });

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
        App.toast = (msg) => { globalThis.__toasts.push(String(msg)); };
    `, context);

    const result = clone(await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 656,
        orderName: 'NFC Shortage Order',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(items))}),
        previousItems: []
    })`, context));

    assert.equal(result.shortage, true);
    assert.equal(result.shortageRows.length, 1);
    assert.equal(result.shortageRows[0].itemId, 197);
    assert.match(result.shortageRows[0].name, /Карточка с NFC · NFC/);
    assert.equal(result.shortageRows[0].requestedQty, 12);
    assert.equal(result.shortageRows[0].availableQty, 5);
    assert.match(String(context.__toasts[context.__toasts.length - 1] || ''), /Карточка с NFC · NFC/);
}

async function smokeProjectHardwareShortageDetailsShowBlockingOrders(context) {
    const order = {
        id: 777,
        order_name: 'Workshop MTS',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-04-02T09:00:00.000Z',
    };
    const items = [{
        item_type: 'hardware',
        product_name: 'Тросы · 5 см · белые',
        quantity: 100,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 197,
        hardware_warehouse_sku: 'TR-050-WH',
    }];

    context.__projectHardwareState = { checks: {}, actual_qtys: { '777:197': 100 } };
    context.__reservations = [{
        id: 1,
        item_id: 197,
        order_id: 888,
        order_name: 'брелки Лемана Про',
        qty: 40,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-04-02T10:00:00.000Z',
        created_by: 'Smoke',
    }];
    context.__warehouseItems = [{
        id: 197,
        name: 'Тросы',
        sku: 'TR-050-WH',
        category: 'cables',
        qty: 100,
        unit: 'шт',
        price_per_unit: 5,
    }];
    context.__warehouseHistory = [];
    context.__toasts = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => { context.__projectHardwareState = clone(state); };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => { context.__reservations = clone(reservations); };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (itemsArg) => { context.__warehouseItems = clone(itemsArg); };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => { context.__warehouseHistory = clone(history); };
    context.loadOrder = async () => clone({ order: clone(order), items: clone(items) });

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
        App.toast = (msg) => { globalThis.__toasts.push(String(msg)); };
    `, context);

    const result = clone(await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 777,
        orderName: 'Workshop MTS',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(items))}),
        previousItems: []
    })`, context));

    assert.equal(result.shortage, true);
    assert.equal(result.shortageRows.length, 1);
    assert.equal(result.shortageRows[0].itemId, 197);
    assert.equal(result.shortageRows[0].requestedQty, 100);
    assert.equal(result.shortageRows[0].availableQty, 60);
    assert.equal(result.shortageRows[0].blockers[0].orderName, 'брелки Лемана Про');
    assert.equal(result.shortageRows[0].blockers[0].qty, 40);
    assert.match(String(context.__toasts[context.__toasts.length - 1] || ''), /брелки Лемана Про/);
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
        assert.ok(context.__toasts.some(message => /позиций со склада.*не встала.*80/i.test(message)));
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

async function smokeWarehouseAdjustmentPersistsWithoutBulkSave(context) {
    context.__warehouseItems = [
        {
            id: 801,
            name: 'Fallback Persist Item',
            sku: 'ADJ-801',
            category: 'other',
            qty: 10,
            price_per_unit: 9,
            updated_at: '2026-03-15T00:00:00.000Z',
        },
    ];
    context.__warehouseHistory = [];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async () => {};
    context.saveWarehouseItem = async (item) => {
        const normalized = clone(item);
        const idx = context.__warehouseItems.findIndex(entry => Number(entry.id) === Number(normalized.id));
        if (idx >= 0) context.__warehouseItems[idx] = normalized;
        else context.__warehouseItems.push(normalized);
        return normalized.id;
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    await vm.runInContext(`Warehouse.adjustStock(801, -3, 'deduction', '', 'Проверка без batch-save', 'Smoke')`, context);

    assert.equal(context.__warehouseItems[0].qty, 7);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_before, 10);
    assert.equal(context.__warehouseHistory[0].qty_after, 7);
    assert.match(context.__warehouseHistory[0].notes, /batch-save/);
}

async function smokeWarehouseReserveLabelsShowSource(context) {
    context.__warehouseItems = [
        {
            id: 811,
            name: 'Reserve Label Item',
            sku: 'RSV-811',
            category: 'other',
            qty: 20,
            reserved_qty: 7,
            available_qty: 13,
            price_per_unit: 9,
        },
    ];
    context.__warehouseReservations = [
        {
            id: 81101,
            item_id: 811,
            order_id: 42,
            order_name: 'ФНТР 1 партия',
            source: 'project_hardware',
            qty: 5,
            status: 'active',
            created_at: '2026-04-02T08:00:00.000Z',
            created_by: 'Smoke',
        },
        {
            id: 81102,
            item_id: 811,
            order_name: 'Цеховой запас',
            qty: 2,
            status: 'active',
            created_at: '2026-04-02T09:00:00.000Z',
            created_by: 'Smoke',
        },
    ];

    vm.runInContext(`
        globalThis.__lastNavigation = null;
        App.navigate = (page, pushHash, subId) => { globalThis.__lastNavigation = { page, pushHash, subId }; };
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.allReservations = globalThis.__warehouseReservations.map(item => ({ ...item }));
    `, context);

    await vm.runInContext(`Warehouse.renderTable(Warehouse.allItems)`, context);
    const tableHtml = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(tableHtml, /ФНТР 1 партия/);
    assert.match(tableHtml, /проект · 5 шт/);
    assert.match(tableHtml, /Цеховой запас/);
    assert.match(tableHtml, /вручную · 2 шт/);

    await vm.runInContext(`Warehouse.renderItemReservations(811)`, context);
    const detailHtml = String(vm.runInContext(`document.getElementById('wh-reservations-section').innerHTML`, context));
    assert.match(detailHtml, /проект/);
    assert.match(detailHtml, /вручную/);
    assert.match(detailHtml, /Открыть/);
}

async function smokeWarehouseStockTruthShowsAvailableAndCorrections(context) {
    context.__warehouseItems = [
        {
            id: 8115,
            name: 'Шнур с силик. наконечником фиолетовый 80 см',
            sku: 'SLS-800-VT-NN',
            category: 'cords',
            unit: 'шт',
            qty: 945,
            reserved_qty: 433,
            available_qty: 512,
            price_per_unit: 23,
        },
    ];
    context.__warehouseReservations = [
        {
            id: 811501,
            item_id: 8115,
            order_id: 1774617825968,
            order_name: 'обвесы Яндекс Музыка',
            source: 'project_hardware',
            qty: 433,
            status: 'active',
            created_at: '2026-04-21T11:00:00.000Z',
            created_by: 'Smoke',
        },
    ];
    context.__warehouseHistory = [
        {
            id: 8115901,
            item_id: 8115,
            item_name: 'Шнур с силик. наконечником фиолетовый 80 см',
            item_sku: 'SLS-800-VT-NN',
            type: 'addition',
            qty_change: 500,
            qty_before: 445,
            qty_after: 945,
            notes: 'Ручная правка',
            created_at: '2026-04-03T09:00:00.000Z',
            created_by: 'Полина',
        },
        {
            id: 8115900,
            item_id: 8115,
            item_name: 'Шнур с силик. наконечником фиолетовый 80 см',
            item_sku: 'SLS-800-VT-NN',
            type: 'deduction',
            qty_change: -225,
            qty_before: 670,
            qty_after: 445,
            notes: 'Ручная правка по фото 2026-04-02',
            created_at: '2026-04-02T08:30:00.000Z',
            created_by: 'Полина',
        },
        {
            id: 8115899,
            item_id: 8115,
            item_name: 'Шнур с силик. наконечником фиолетовый 80 см',
            item_sku: 'SLS-800-VT-NN',
            type: 'deduction',
            qty_change: -250,
            qty_before: 1000,
            qty_after: 750,
            order_id: 1774868781815,
            order_name: 'ФНТР 1 партия',
            notes: 'Списание собранной позиции со склада: 250 шт',
            created_at: '2026-03-31T09:06:32.225Z',
            created_by: 'Smoke',
        },
    ];
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);

    vm.runInContext(`
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.allReservations = globalThis.__warehouseReservations.map(item => ({ ...item }));
    `, context);

    await vm.runInContext(`Warehouse.renderItemStockTruth(8115)`, context);
    const truthHtml = String(vm.runInContext(`document.getElementById('wh-stock-truth-section').innerHTML`, context));
    assert.match(truthHtml, /Разбор остатка/);
    assert.match(truthHtml, /945/);
    assert.match(truthHtml, /433/);
    assert.match(truthHtml, /512/);
    assert.match(truthHtml, /обвесы Яндекс Музыка/);
    assert.match(truthHtml, /ФНТР 1 партия/);
    assert.match(truthHtml, /Ручная правка/);
    assert.match(truthHtml, /Корректировки/);
}

async function smokeWarehouseProjectReserveCannotBeEditedInline(context) {
    context.__warehouseItems = [
        {
            id: 812,
            name: 'Locked Reserve Item',
            sku: 'RSV-812',
            category: 'other',
            qty: 100,
            reserved_qty: 60,
            available_qty: 40,
            price_per_unit: 5,
        },
    ];
    context.__reservations = [
        {
            id: 81201,
            item_id: 812,
            order_id: 77,
            order_name: 'ФНТР 1 партия',
            source: 'project_hardware',
            qty: 60,
            status: 'active',
            created_at: '2026-04-02T08:00:00.000Z',
            created_by: 'Smoke',
        },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.__toasts = [];

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.allReservations = globalThis.__reservations.map(item => ({ ...item }));
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
            this.allReservations = await loadWarehouseReservations();
            this.recalcReservations();
        };
    `, context);

    await vm.runInContext(`Warehouse.renderTable(Warehouse.allItems)`, context);
    const html = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(html, /через заказ/);
    assert.match(html, /disabled/);

    await vm.runInContext(`Warehouse.inlineReserve(812, '0', 60)`, context);
    assert.equal(context.__reservations[0].status, 'active');
    assert.match(String(context.__toasts.join('\\n')), /создан из заказа/i);
}

async function smokeWarehouseLoadRendersBeforeBackgroundSync() {
    const warehouseContext = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js'].forEach(file => runScript(warehouseContext, file));
    stubRuntime(warehouseContext);

    warehouseContext.__warehouseItems = [
        {
            id: 813,
            name: 'Fast Load Item',
            sku: 'FAST-813',
            category: 'other',
            qty: 12,
            price_per_unit: 3,
            created_at: '2026-04-02T10:00:00.000Z',
            updated_at: '2026-04-02T10:00:00.000Z',
        },
    ];
    warehouseContext.loadWarehouseItems = async () => clone(warehouseContext.__warehouseItems);
    warehouseContext.loadWarehouseReservations = async () => [];
    warehouseContext.loadProjectHardwareState = async () => ({ checks: {}, actual_qtys: {} });

    vm.runInContext(`
        localStorage.setItem('wh_photo_fix_v3', '1');
        localStorage.setItem('wh_photo_fix_v4', '1');
        globalThis.__events = [];
        Warehouse._ensureRequiredSeedItems = async (items) => items;
        Warehouse._loadMoldOrders = async () => {};
        Warehouse._refreshBlankHardwareWarehouseItemIds = async () => {};
        Warehouse._cleanupZeroDuplicateItems = () => false;
        Warehouse.applyTabStyles = () => {};
        Warehouse.reconcileProjectHardwareReservations = async function () {
            await new Promise(resolve => setTimeout(resolve, 25));
            globalThis.__events.push('reconcile');
            return { reservationsChanged: false, stateChanged: false, shortage: false };
        };
        Warehouse._reconcileBlankHardwareLowStockAlerts = async function () {
            globalThis.__events.push('blank-alerts');
            return { changed: false, alertsCreated: 0 };
        };
        Warehouse.recalcReservations = function () { globalThis.__events.push('recalc'); };
        Warehouse.populateCategoryFilter = function () { globalThis.__events.push('populate'); };
        Warehouse.renderStats = function () { globalThis.__events.push('stats'); };
        Warehouse.filterAndRender = function () { globalThis.__events.push('table-render'); };
        Warehouse.currentView = 'table';
        Warehouse._viewInitialized = false;
        Warehouse._viewToken = 0;
        Warehouse._backgroundSyncPromise = null;
        Warehouse._backgroundSyncScheduled = false;
    `, warehouseContext);

    await vm.runInContext(`Warehouse.load()`, warehouseContext);
    await vm.runInContext(`Warehouse.renderProjectHardwareView(Warehouse._viewToken)`, warehouseContext);

    const immediateEvents = clone(vm.runInContext(`globalThis.__events.slice()`, warehouseContext));
    assert.deepEqual(immediateEvents, ['recalc', 'populate', 'stats', 'table-render']);

    await new Promise(resolve => setTimeout(resolve, 60));

    const finalEvents = clone(vm.runInContext(`globalThis.__events.slice()`, warehouseContext));
    assert.deepEqual(finalEvents, [
        'recalc',
        'populate',
        'stats',
        'table-render',
        'reconcile',
        'blank-alerts',
        'recalc',
        'populate',
        'stats',
        'table-render',
    ]);
}

async function smokeWarehouseLoadPreservesManualPhotos() {
    const warehouseContext = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js'].forEach(file => runScript(warehouseContext, file));
    stubRuntime(warehouseContext);

    warehouseContext.__warehouseItems = [
        {
            id: 814,
            name: 'Photo Keep Item',
            sku: 'PHOTO-814',
            category: 'other',
            qty: 12,
            price_per_unit: 3,
            photo_thumbnail: 'data:image/png;base64,manual-thumb',
            photo_url: 'https://example.com/manual-photo.png',
            created_at: '2026-04-02T10:00:00.000Z',
            updated_at: '2026-04-02T10:00:00.000Z',
        },
    ];
    warehouseContext.__savedSnapshots = [];
    warehouseContext.loadWarehouseItems = async () => clone(warehouseContext.__warehouseItems);
    warehouseContext.saveWarehouseItems = async (items) => {
        warehouseContext.__savedSnapshots.push(clone(items));
        warehouseContext.__warehouseItems = clone(items);
    };
    warehouseContext.loadWarehouseReservations = async () => [];
    warehouseContext.loadProjectHardwareState = async () => ({ checks: {}, actual_qtys: {} });

    vm.runInContext(`
        localStorage.removeItem('wh_photo_fix_v3');
        localStorage.removeItem('wh_photo_fix_v4');
        Warehouse._ensureRequiredSeedItems = async (items) => items;
        Warehouse._loadMoldOrders = async () => {};
        Warehouse._refreshBlankHardwareWarehouseItemIds = async () => {};
        Warehouse._cleanupZeroDuplicateItems = () => false;
        Warehouse.applyTabStyles = () => {};
        Warehouse.reconcileProjectHardwareReservations = async function () {
            return { reservationsChanged: false, stateChanged: false, shortage: false };
        };
        Warehouse._reconcileBlankHardwareLowStockAlerts = async function () {
            return { changed: false, alertsCreated: 0 };
        };
        Warehouse.recalcReservations = function () {};
        Warehouse.populateCategoryFilter = function () {};
        Warehouse.renderStats = function () {};
        Warehouse.filterAndRender = function () {};
        Warehouse.currentView = 'table';
        Warehouse._viewInitialized = false;
        Warehouse._viewToken = 0;
        Warehouse._backgroundSyncPromise = null;
        Warehouse._backgroundSyncScheduled = false;
    `, warehouseContext);

    await vm.runInContext(`Warehouse.load()`, warehouseContext);

    const loadedItem = clone(vm.runInContext(`Warehouse.allItems[0]`, warehouseContext));
    assert.equal(loadedItem.photo_thumbnail, 'data:image/png;base64,manual-thumb');
    assert.equal(loadedItem.photo_url, 'https://example.com/manual-photo.png');
    assert.equal(warehouseContext.__savedSnapshots.length, 0);
    assert.equal(vm.runInContext(`localStorage.getItem('wh_photo_fix_v3')`, warehouseContext), '1');
    assert.equal(vm.runInContext(`localStorage.getItem('wh_photo_fix_v4')`, warehouseContext), '1');
}

async function smokeWarehouseThumbnailGetsWhiteBackground(context) {
    vm.runInContext(`
        globalThis.__drawOps = [];
        const ctx = {
            _fillStyle: '',
            set fillStyle(value) {
                this._fillStyle = value;
                globalThis.__drawOps.push(['fillStyle', value]);
            },
            get fillStyle() { return this._fillStyle; },
            save() { globalThis.__drawOps.push(['save']); },
            restore() { globalThis.__drawOps.push(['restore']); },
            fillRect(x, y, w, h) { globalThis.__drawOps.push(['fillRect', x, y, w, h, this._fillStyle]); },
            drawImage(img, x, y, w, h) { globalThis.__drawOps.push(['drawImage', x, y, w, h]); },
        };
        Warehouse._drawThumbnailOnWhiteBackground(ctx, { width: 40, height: 30 }, 40, 30);
    `, context);

    const ops = clone(vm.runInContext(`globalThis.__drawOps`, context));
    assert.deepEqual(ops, [
        ['save'],
        ['fillStyle', '#ffffff'],
        ['fillRect', 0, 0, 40, 30, '#ffffff'],
        ['drawImage', 0, 0, 40, 30],
        ['restore'],
    ]);
}

async function smokeProjectHardwarePersistenceAndBuckets(context) {
    context.__projectHardwareState = {
        checks: {
            '200:504': true,
            '300:501': true,
            '999:999': true,
        },
        actual_qtys: {
            '200:504': 1,
            '300:501': 2,
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
    assert.match(html, /2 заказа · активные заказы выше, собранные и завершённые — здесь/);
    assert.match(html, /<details class="card" style="margin-top:12px;">/);
    assert.equal((html.match(/Collected Hardware Order/g) || []).length, 1);
    assert.equal((html.match(/Collected Delivery Order/g) || []).length, 1);
    assert.equal((html.match(/Active Hardware Order/g) || []).length, 1);
    assert.equal((html.match(/Sample Hardware Order/g) || []).length, 1);
    assert.match(html, /Включая завершённые заказы: 1/);
    assert.match(html, /Delivery Hardware/);
    assert.match(html, /Collected Hardware/);
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

async function smokeProjectHardwareActualQtyEditableFlow(context) {
    const order = {
        id: 321,
        order_name: 'Actual Qty Project Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'hardware',
            product_name: 'Editable Hardware Qty',
            quantity: 5,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 901,
        }],
    };

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [{
        id: 1,
        item_id: 901,
        order_id: 321,
        order_name: 'Actual Qty Project Order',
        qty: 5,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 901,
        name: 'Editable Hardware Qty',
        sku: 'AHQ-1',
        category: 'hardware',
        qty: 10,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = { 321: clone(detail) };
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

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
    `, context);

    await vm.runInContext(`Warehouse.setProjectHardwareActualQty(321, 901, '3')`, context);

    assert.equal(context.__projectHardwareState.actual_qtys['321:901'], 3);
    assert.equal(Boolean(context.__projectHardwareState.checks['321:901']), false);
    assert.equal(context.__warehouseItems[0].qty, 10);
    assert.equal(context.__warehouseHistory.length, 0);
    const adjustedReservation = context.__reservations.find(item => Number(item.order_id) === 321 && item.status === 'active');
    assert.equal(adjustedReservation.qty, 3);

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(321, 901, true)`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['321:901']), true);
    assert.equal(context.__projectHardwareState.actual_qtys['321:901'], 3);
    assert.equal(context.__warehouseItems[0].qty, 7);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_change, -3);
    assert.equal(context.__warehouseHistory[0].project_hardware_flow, 'ready_toggle');
    assert.equal(context.__reservations[0].status, 'released');

    await vm.runInContext(`Warehouse.setProjectHardwareActualQty(321, 901, '2')`, context);

    assert.equal(context.__projectHardwareState.actual_qtys['321:901'], 2);
    assert.equal(context.__warehouseItems[0].qty, 8);
    assert.equal(context.__warehouseHistory.length, 2);
    assert.equal(context.__warehouseHistory[1].qty_change, 1);
    assert.equal(context.__warehouseHistory[1].project_hardware_flow, 'ready_delta');
    assert.match(context.__warehouseHistory[1].notes, /Корректировка собранной позиции: -1 шт/);

    await vm.runInContext(`Warehouse.setProjectHardwareActualQty(321, 901, '')`, context);

    assert.equal(Object.prototype.hasOwnProperty.call(context.__projectHardwareState.actual_qtys, '321:901'), false);
    assert.equal(context.__warehouseItems[0].qty, 5);
    assert.equal(context.__warehouseHistory.length, 3);
    assert.equal(context.__warehouseHistory[2].qty_change, -3);
    assert.equal(context.__warehouseHistory[2].project_hardware_flow, 'ready_delta');

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(321, 901, false)`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['321:901']), false);
    assert.equal(context.__warehouseItems[0].qty, 10);
    assert.equal(context.__warehouseHistory.length, 4);
    assert.equal(context.__warehouseHistory[3].qty_change, 5);
    const restoredReservation = context.__reservations.find(item => Number(item.order_id) === 321 && item.status === 'active');
    assert.equal(restoredReservation.qty, 5);
}

async function smokeProjectHardwareZeroActualCanStayReady(context) {
    const order = {
        id: 322,
        order_name: 'Zero Actual Hardware Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'hardware',
            product_name: 'Zero Actual Hardware',
            quantity: 5,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 9021,
        }],
    };

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [{
        id: 1,
        item_id: 9021,
        order_id: 322,
        order_name: 'Zero Actual Hardware Order',
        qty: 5,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 9021,
        name: 'Zero Actual Hardware',
        sku: 'ZAH-1',
        category: 'hardware',
        qty: 10,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = { 322: clone(detail) };
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

    await vm.runInContext(`Warehouse.setProjectHardwareActualQty(322, 9021, '0')`, context);
    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(322, 9021, true)`, context);

    assert.equal(context.__projectHardwareState.actual_qtys['322:9021'], 0);
    assert.equal(Boolean(context.__projectHardwareState.checks['322:9021']), true);
    assert.equal(context.__warehouseItems[0].qty, 10);
    assert.equal(context.__warehouseHistory.length, 0);
    assert.equal(context.__reservations.filter(item => Number(item.order_id) === 322 && item.status === 'active').length, 0);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 322,
        orderName: 'Zero Actual Hardware Order',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(detail.items))}),
        previousItems: JSON.parse(${JSON.stringify(JSON.stringify(detail.items))})
    })`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['322:9021']), true);
    const completion = clone(await vm.runInContext(`Warehouse.getOrderProjectHardwareCompletion(322, JSON.parse(${JSON.stringify(JSON.stringify(detail))}))`, context));
    assert.equal(completion.canComplete, true);
    assert.equal(completion.readyRows, 1);
}

async function smokeProjectHardwareConcurrentMutationsStayConsistent(context) {
    const order = {
        id: 323,
        order_name: 'Concurrent Hardware Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'hardware',
            product_name: 'Concurrent Hardware',
            quantity: 5,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 9022,
        }],
    };

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [{
        id: 1,
        item_id: 9022,
        order_id: 323,
        order_name: 'Concurrent Hardware Order',
        qty: 5,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 9022,
        name: 'Concurrent Hardware',
        sku: 'CH-1',
        category: 'hardware',
        qty: 10,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = { 323: clone(detail) };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        const snapshot = clone(state);
        const hasReady = Boolean(snapshot?.checks?.['323:9022']);
        await new Promise(resolve => setTimeout(resolve, hasReady ? 10 : 30));
        context.__projectHardwareState = snapshot;
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

    await vm.runInContext(`Promise.all([
        Warehouse.setProjectHardwareActualQty(323, 9022, '0'),
        Warehouse.toggleProjectHardwareReady(323, 9022, true)
    ])`, context);

    assert.equal(context.__projectHardwareState.actual_qtys['323:9022'], 0);
    assert.equal(Boolean(context.__projectHardwareState.checks['323:9022']), true);
    assert.equal(context.__warehouseItems[0].qty, 10);
    assert.equal(context.__warehouseHistory.length, 0);
    assert.equal(context.__reservations.filter(item => Number(item.order_id) === 323 && item.status === 'active').length, 0);
}

async function smokeOrderDetailHardwareTabShowsAndEditsProjectHardware(context) {
    const order = {
        id: 777,
        order_name: 'Order Detail Hardware',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
        total_revenue_plan: 0,
        margin_percent_plan: 0,
        total_hours_plan: 0,
        payment_status: 'not_sent',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_type: 'hardware',
            product_name: 'Card Hardware',
            quantity: 5,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 915,
        }],
    };

    context.__projectHardwareState = { checks: {}, actual_qtys: { '777:915': 3 } };
    context.__reservations = [{
        id: 1,
        item_id: 915,
        order_id: 777,
        order_name: 'Order Detail Hardware',
        qty: 3,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T12:00:00.000Z',
    }, {
        id: 2,
        item_id: 915,
        order_id: 778,
        order_name: 'обвесы Яндекс Музыка',
        qty: 4,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-19T12:00:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 915,
        name: 'Трос',
        sku: 'TR-050-WH',
        category: 'hardware',
        qty: 10,
        unit: 'шт',
        price_per_unit: 5,
    }];
    context.__warehouseHistory = [{
        id: 101,
        item_id: 915,
        item_name: 'Трос',
        item_sku: 'TR-050-WH',
        type: 'addition',
        qty_change: 5,
        qty_before: 5,
        qty_after: 10,
        notes: 'Ручная правка',
        created_at: '2026-03-20T12:00:00.000Z',
        created_by: 'Smoke',
    }, {
        id: 100,
        item_id: 915,
        item_name: 'Трос',
        item_sku: 'TR-050-WH',
        type: 'deduction',
        qty_change: -3,
        qty_before: 8,
        qty_after: 5,
        order_id: 777,
        order_name: 'Order Detail Hardware',
        notes: 'Списание собранной позиции со склада: 3 шт',
        created_at: '2026-03-19T12:00:00.000Z',
        created_by: 'Smoke',
    }];
    context.__orderDetails = { 777: clone(detail) };
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
        App.toast = () => {};
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
        OrderDetail.currentOrder = ${JSON.stringify(order)};
        OrderDetail.currentItems = ${JSON.stringify(detail.items)};
    `, context);

    await vm.runInContext(`OrderDetail.renderHardwareTab()`, context);

    const html = String(vm.runInContext(`document.getElementById('od-tab-hardware').innerHTML`, context));
    assert.match(html, /Фурнитура и упаковка заказа/i);
    assert.match(html, /Трос/);
    assert.match(html, /TR-050-WH/);
    assert.match(html, /Уже собрано/);
    assert.match(html, /value="3"/);
    assert.match(html, /На складе 10 шт/);
    assert.match(html, /Почему такой остаток/);
    assert.match(html, /обвесы Яндекс Музыка 4 шт/);
    assert.match(html, /Ручная правка/);

    await vm.runInContext(`OrderDetail.setProjectHardwareActualQty(915, '4')`, context);

    assert.equal(context.__projectHardwareState.actual_qtys['777:915'], 4);
    const activeReservation = context.__reservations.find(item => Number(item.order_id) === 777 && item.status === 'active');
    assert.equal(activeReservation, undefined);
}

async function smokeProjectHardwareReadySyncDoesNotAutoReturnConsumedStock(context) {
    const order = {
        id: 654,
        order_name: 'Sticky Collected Hardware Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T13:00:00.000Z',
    };
    const initialItems = [{
        item_type: 'hardware',
        product_name: 'Sticky Hardware Qty',
        quantity: 5,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 902,
    }];
    const reducedItems = [{
        item_type: 'hardware',
        product_name: 'Sticky Hardware Qty',
        quantity: 3,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 902,
    }];

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 902,
        name: 'Sticky Hardware Qty',
        sku: 'SHQ-1',
        category: 'hardware',
        qty: 10,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = {
        654: {
            order: clone(order),
            items: clone(initialItems),
        },
    };
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
        orderId: 654,
        orderName: 'Sticky Collected Hardware Order',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(initialItems))}),
        previousItems: []
    })`, context);

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(654, 902, true)`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['654:902']), true);
    assert.equal(context.__warehouseItems[0].qty, 5);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_change, -5);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 654,
        orderName: 'Sticky Collected Hardware Order',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(reducedItems))}),
        previousItems: JSON.parse(${JSON.stringify(JSON.stringify(initialItems))})
    })`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['654:902']), true);
    assert.equal(context.__warehouseItems[0].qty, 5);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__reservations.filter(item => Number(item.order_id) === 654 && item.status === 'active').length, 0);
}

async function smokeProjectHardwareCollectedStateSurvivesStateLoss(context) {
    const order = {
        id: 655,
        order_name: 'Collected State Recovery Order',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T13:30:00.000Z',
    };
    const items = [{
        item_type: 'hardware',
        product_name: 'Recovered Hardware Qty',
        quantity: 5,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 903,
    }];

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 903,
        name: 'Recovered Hardware Qty',
        sku: 'RHQ-1',
        category: 'hardware',
        qty: 7,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [{
        id: 1,
        item_id: 903,
        item_name: 'Recovered Hardware Qty',
        item_sku: 'RHQ-1',
        item_category: 'hardware',
        type: 'deduction',
        qty_change: -3,
        requested_qty_change: -3,
        qty_before: 10,
        qty_after: 7,
        unit_price: 10,
        total_cost_change: 30,
        order_id: 655,
        order_name: 'Collected State Recovery Order',
        notes: 'Списание собранной позиции со склада: 3 шт',
        clamped: false,
        created_at: '2026-03-18T13:35:00.000Z',
        created_by: 'Smoke',
    }];
    context.__orderDetails = {
        655: {
            order: clone(order),
            items: clone(items),
        },
    };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (itemsArg) => {
        context.__warehouseItems = clone(itemsArg);
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
        orderId: 655,
        orderName: 'Collected State Recovery Order',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(items))}),
        previousItems: JSON.parse(${JSON.stringify(JSON.stringify(items))})
    })`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['655:903']), true);
    assert.equal(context.__warehouseItems[0].qty, 7);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__reservations.filter(item => Number(item.order_id) === 655 && item.status === 'active').length, 0);

    const displayActual = vm.runInContext(`(() => {
        const history = Warehouse._buildProjectHardwareHistoryDeltaMap(globalThis.__warehouseHistory);
        return Warehouse._getProjectHardwareDisplayActualQty(655, 903, 5, history, globalThis.__warehouseHistory);
    })()`, context);
    assert.equal(displayActual, 3);
}

async function smokeProjectHardwareSavedCheckWithoutHistoryIsNotReady(context) {
    const order = {
        id: 657,
        order_name: 'Stale Project Hardware Check',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T14:30:00.000Z',
    };
    const items = [{
        item_type: 'hardware',
        product_name: 'Stale Hardware Qty',
        quantity: 5,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 905,
    }];

    context.__projectHardwareState = { checks: { '657:905': true }, actual_qtys: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 905,
        name: 'Stale Hardware Qty',
        sku: 'STL-905',
        category: 'hardware',
        qty: 12,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = {
        657: {
            order: clone(order),
            items: clone(items),
        },
    };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (itemsArg) => {
        context.__warehouseItems = clone(itemsArg);
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

    const completionBefore = clone(await vm.runInContext(`Warehouse.getOrderProjectHardwareCompletion(657, JSON.parse(${JSON.stringify(JSON.stringify({
        order,
        items,
    }))}))`, context));

    assert.equal(completionBefore.canComplete, false);
    assert.equal(completionBefore.readyRows, 0);
    assert.equal(completionBefore.pendingRows, 1);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 657,
        orderName: 'Stale Project Hardware Check',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(items))}),
        previousItems: JSON.parse(${JSON.stringify(JSON.stringify(items))})
    })`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['657:905']), false);
    assert.equal(context.__warehouseItems[0].qty, 12);
    assert.equal(context.__warehouseHistory.length, 0);
    const reservation = context.__reservations.find(item => Number(item.order_id) === 657 && item.status === 'active');
    assert.equal(reservation.qty, 5);
}

async function smokeProjectHardwareReadyToggleReloadsAndClosesProject() {
    const warehouseContext = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js'].forEach(file => runScript(warehouseContext, file));
    stubRuntime(warehouseContext);

    const order = {
        id: 656,
        order_name: 'Hardware Close After Ready',
        manager_name: 'Smoke',
        status: 'production_hardware',
        created_at: '2026-03-18T14:00:00.000Z',
    };
    const items = [{
        item_type: 'hardware',
        product_name: 'Closable Hardware',
        quantity: 5,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 904,
    }];

    warehouseContext.__orders = [clone(order)];
    warehouseContext.__orderDetails = {
        656: {
            order: clone(order),
            items: clone(items),
        },
    };
    warehouseContext.__projectHardwareState = { checks: {}, actual_qtys: {} };
    warehouseContext.__reservations = [{
        id: 1,
        item_id: 904,
        order_id: 656,
        order_name: 'Hardware Close After Ready',
        qty: 5,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T14:00:00.000Z',
        created_by: 'Smoke',
    }];
    warehouseContext.__warehouseItems = [{
        id: 904,
        name: 'Closable Hardware',
        sku: 'CLS-904',
        category: 'hardware',
        qty: 5,
        unit: 'шт',
        price_per_unit: 10,
        created_at: '2026-03-18T13:50:00.000Z',
        updated_at: '2026-03-18T13:50:00.000Z',
    }];
    warehouseContext.__warehouseHistory = [];
    warehouseContext.__toasts = [];
    warehouseContext.loadOrders = async () => clone(warehouseContext.__orders);
    warehouseContext.loadOrder = async (orderId) => clone(warehouseContext.__orderDetails[Number(orderId)] || null);
    warehouseContext.loadProjectHardwareState = async () => clone(warehouseContext.__projectHardwareState);
    warehouseContext.saveProjectHardwareState = async (state) => {
        warehouseContext.__projectHardwareState = clone(state);
    };
    warehouseContext.loadWarehouseReservations = async () => clone(warehouseContext.__reservations);
    warehouseContext.saveWarehouseReservations = async (reservations) => {
        warehouseContext.__reservations = clone(reservations);
    };
    warehouseContext.loadWarehouseItems = async () => clone(warehouseContext.__warehouseItems);
    warehouseContext.saveWarehouseItem = async (item) => {
        warehouseContext.__warehouseItems = warehouseContext.__warehouseItems.map(existing =>
            Number(existing.id) === Number(item.id) ? clone(item) : existing
        );
    };
    warehouseContext.saveWarehouseItems = async (itemsArg) => {
        warehouseContext.__warehouseItems = clone(itemsArg);
    };
    warehouseContext.loadWarehouseHistory = async () => clone(warehouseContext.__warehouseHistory);
    warehouseContext.saveWarehouseHistory = async (history) => {
        warehouseContext.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        localStorage.setItem('wh_photo_fix_v3', '1');
        localStorage.setItem('wh_photo_fix_v4', '1');
        Warehouse._ensureRequiredSeedItems = async (items) => items;
        Warehouse._loadMoldOrders = async () => {};
        Warehouse._refreshBlankHardwareWarehouseItemIds = async () => {};
        Warehouse._cleanupZeroDuplicateItems = () => false;
        Warehouse._reconcileBlankHardwareLowStockAlerts = async () => ({ changed: false, alertsCreated: 0 });
        Warehouse.applyTabStyles = () => {};
        document.getElementById('wh-content');
        document.getElementById('wh-shipments-content');
        document.getElementById('wh-filters-card');
        Warehouse.currentView = 'project-hardware';
        Warehouse._viewInitialized = false;
        Warehouse._viewToken = 0;
        Warehouse._backgroundSyncPromise = null;
        Warehouse._backgroundSyncScheduled = false;
    `, warehouseContext);

    await vm.runInContext(`Warehouse.load()`, warehouseContext);

    const result = await Promise.race([
        vm.runInContext(`Warehouse.toggleProjectHardwareReady(656, 904, true).then(() => 'done')`, warehouseContext),
        new Promise(resolve => setTimeout(() => resolve('timeout'), 200)),
    ]);
    assert.equal(result, 'done');

    assert.equal(Boolean(warehouseContext.__projectHardwareState.checks['656:904']), true);
    assert.equal(warehouseContext.__warehouseItems[0].qty, 0);
    assert.equal(warehouseContext.__warehouseHistory.length, 1);
    assert.equal(warehouseContext.__warehouseHistory[0].qty_change, -5);
    assert.equal(warehouseContext.__reservations.filter(item => Number(item.order_id) === 656 && item.status === 'active').length, 0);

    const completion = clone(await vm.runInContext(`Warehouse.getOrderProjectHardwareCompletion(656)`, warehouseContext));
    assert.equal(completion.canComplete, true);
    assert.equal(completion.totalRows, 1);
    assert.equal(completion.readyRows, 1);
    assert.equal(completion.pendingRows, 0);
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

async function smokeBlankHardwareFilterAndLowStockAlerts(context) {
    context.__savedTasks = [];
    context.__taskEvents = [];
    context.__warehouseItems = [
        {
            id: 501,
            name: 'Кольцо 25 мм',
            sku: 'RING-25',
            category: 'rings',
            unit: 'шт',
            qty: 900,
            price_per_unit: 12,
        },
        {
            id: 601,
            name: 'Обычный карабин',
            sku: 'KAR-01',
            category: 'carabiners',
            unit: 'шт',
            qty: 500,
            price_per_unit: 25,
        },
    ];
    context.__warehouseReservations = [];
    context.__warehouseHistory = [];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseReservations = async () => clone(context.__warehouseReservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__warehouseReservations = clone(reservations);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };
    context.loadHwBlanks = async () => ([
        {
            id: 7001,
            name: 'Blank ring binding',
            warehouse_item_id: 501,
            hw_form_source: 'warehouse',
        },
    ]);
    context.loadEmployees = async () => ([
        { id: 1772827635013, name: 'Леша' },
        { id: 1741700002000, name: 'Анастасия' },
    ]);
    context.loadWorkAreas = async () => ([
        { id: 9103, slug: 'warehouse', name: 'Склад' },
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
        Warehouse.allItems = ${JSON.stringify(context.__warehouseItems)};
        Warehouse._blankHardwareWarehouseItemIds = new Set();
        Warehouse.renderTable = (items) => {
            globalThis.__blankHardwareRenderedIds = items.map(item => Number(item.id));
        };
        document.getElementById('wh-filter-category').value = 'blank_hardware';
        document.getElementById('wh-filter-stock').value = '';
        document.getElementById('wh-search').value = '';
        document.getElementById('wh-sort').value = 'name';
    `, context);

    await vm.runInContext(`Warehouse._refreshBlankHardwareWarehouseItemIds()`, context);
    vm.runInContext(`Warehouse.filterAndRender()`, context);

    assert.deepEqual(clone(vm.runInContext(`globalThis.__blankHardwareRenderedIds`, context)), [501]);

    await vm.runInContext(`Warehouse._reconcileBlankHardwareLowStockAlerts()`, context);

    assert.equal(context.__warehouseItems[0].blank_hardware_low_stock_alerted, true);
    assert.equal(context.__savedTasks.length, 1);
    assert.match(context.__savedTasks[0].title, /Заказать бланковую фурнитуру/);
    assert.equal(context.__savedTasks[0].assignee_id, 1741700002000);
    assert.equal(context.__savedTasks[0].warehouse_item_id, 501);
    assert.equal(context.__taskEvents.length, 1);

    await vm.runInContext(`Warehouse._reconcileBlankHardwareLowStockAlerts()`, context);
    assert.equal(context.__savedTasks.length, 1);

    context.__warehouseItems[0].qty = 1200;
    vm.runInContext(`Warehouse.allItems = ${JSON.stringify(context.__warehouseItems)}`, context);
    await vm.runInContext(`Warehouse._reconcileBlankHardwareLowStockAlerts()`, context);
    assert.equal(Boolean(context.__warehouseItems[0].blank_hardware_low_stock_alerted), false);

    context.__warehouseItems[0].qty = 800;
    vm.runInContext(`Warehouse.allItems = ${JSON.stringify(context.__warehouseItems)}`, context);
    await vm.runInContext(`Warehouse._reconcileBlankHardwareLowStockAlerts()`, context);
    assert.equal(context.__savedTasks.length, 2);

    vm.runInContext(`delete globalThis.__blankHardwareRenderedIds`, context);
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
        price_per_unit: 0.7,
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
    assert.equal(context.__warehouseHistory[2].unit_price, 30, 'legacy repair should preserve original legacy movement price instead of current item price');
    assert.equal(context.__warehouseHistory[2].total_cost_change, 3000);
    assert.equal(context.__reservations.length, 0);
}

async function smokeProjectHardwareExplicitActualReadySurvivesLegacyOnlyHistory(context) {
    const order = {
        id: 89,
        order_name: 'Legacy Actual Qty Order',
        manager_name: 'Склад',
        status: 'production_hardware',
        created_at: '2026-03-18T11:00:00.000Z',
    };
    const items = [{
        item_type: 'hardware',
        product_name: 'Legacy Actual Qty Hardware',
        quantity: 5,
        hardware_source: 'warehouse',
        hardware_warehouse_item_id: 602,
    }];

    context.__projectHardwareState = { checks: { '89:602': true }, actual_qtys: { '89:602': 3 } };
    context.__reservations = [{
        id: 1,
        item_id: 602,
        order_id: 89,
        order_name: 'Legacy Actual Qty Order',
        qty: 5,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T11:05:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 602,
        name: 'Legacy Actual Qty Hardware',
        sku: 'LAQ-1',
        category: 'hardware',
        qty: 17,
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [{
        id: 1,
        item_id: 602,
        item_name: 'Legacy Actual Qty Hardware',
        item_sku: 'LAQ-1',
        item_category: 'hardware',
        type: 'deduction',
        qty_change: -5,
        requested_qty_change: -5,
        qty_before: 22,
        qty_after: 17,
        unit_price: 10,
        total_cost_change: 50,
        order_id: 89,
        order_name: 'Legacy Actual Qty Order',
        notes: 'Списание при смене статуса: Черновик → Производство: Фурнитура',
        clamped: false,
        created_at: '2026-03-18T11:06:00.000Z',
        created_by: 'Smoke',
    }];
    context.__orderDetails = {
        89: {
            order: clone(order),
            items: clone(items),
        },
    };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__projectHardwareState = clone(state);
    };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => {
        context.__reservations = clone(reservations);
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (itemsArg) => {
        context.__warehouseItems = clone(itemsArg);
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
        orderId: 89,
        orderName: 'Legacy Actual Qty Order',
        managerName: 'Smoke',
        status: 'production_hardware',
        currentItems: JSON.parse(${JSON.stringify(JSON.stringify(items))}),
        previousItems: JSON.parse(${JSON.stringify(JSON.stringify(items))})
    })`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['89:602']), true);
    assert.equal(context.__projectHardwareState.actual_qtys['89:602'], 3);
    assert.equal(context.__warehouseItems[0].qty, 19);
    assert.equal(context.__warehouseHistory.length, 3);
    assert.equal(context.__warehouseHistory[1].project_hardware_flow, 'legacy_status_repair');
    assert.equal(context.__warehouseHistory[1].qty_change, 5);
    assert.equal(context.__warehouseHistory[2].project_hardware_flow, 'ready_delta');
    assert.equal(context.__warehouseHistory[2].qty_change, -3);
    assert.equal(context.__reservations.filter(item => Number(item.order_id) === 89 && item.status === 'active').length, 0);
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
            color_solution_attachment: JSON.stringify([
                {
                    name: 'palette.pdf',
                    type: 'application/pdf',
                    data_url: 'data:application/pdf;base64,AAA',
                },
                {
                    name: 'reference.png',
                    type: 'image/png',
                    data_url: 'data:image/png;base64,BBB',
                },
            ]),
        };
        return OrderDetail._renderItemCard(rawProduct, 'product');
    })()`, context));

    assert.match(rendered, /Цвета:/);
    assert.match(rendered, /Красный/);
    assert.match(rendered, /Синий/);
    assert.match(rendered, /palette\.pdf/);
    assert.match(rendered, /reference\.png/);
    assert.match(rendered, /download="palette\.pdf"/);
    assert.match(rendered, /download="reference\.png"/);

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

async function smokeWarehouseInventoryAuditDraftAndFinalize(context) {
    context.__warehouseItems = [
        {
            id: 701,
            name: 'Инвентаризационный трос',
            sku: 'AUD-701',
            category: 'cables',
            qty: 120,
            price_per_unit: 12,
            photo_thumbnail: 'https://example.com/audit-701.jpg',
        },
        {
            id: 702,
            name: 'Инвентаризационная упаковка',
            sku: 'AUD-702',
            category: 'packaging',
            qty: 10,
            price_per_unit: 5,
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

    vm.runInContext(`
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.auditDraft = null;
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
        };
    `, context);

    await vm.runInContext(`Warehouse.showAudit()`, context);

    assert.equal(vm.runInContext(`document.getElementById('wh-audit-form').style.display`, context), '');
    const renderedTable = String(vm.runInContext(`document.getElementById('wh-audit-table').innerHTML`, context));
    assert.match(renderedTable, /audit-701\.jpg/);
    assert.match(renderedTable, /Инвентаризационный трос/);

    vm.runInContext(`
        Warehouse.onAuditInput({
            dataset: { id: '701', system: '120' },
            value: '100'
        });
    `, context);

    const draftRaw = context.localStorage.getItem('ro_wh_audit_draft_v2');
    assert.ok(draftRaw, 'audit draft should autosave');
    assert.equal(JSON.parse(draftRaw).values['701'], '100');
    const summaryText = String(vm.runInContext(`document.getElementById('wh-audit-summary').textContent`, context));
    assert.match(summaryText, /Недостача:/);
    assert.match(summaryText, /240/);

    await vm.runInContext(`Warehouse.saveAuditResults()`, context);

    assert.equal(context.__warehouseItems.find(item => item.id === 701).qty, 100);
    assert.equal(context.localStorage.getItem('ro_wh_audit_draft_v2'), null);
    assert.equal(vm.runInContext(`document.getElementById('wh-audit-form').style.display`, context), 'none');
    assert.ok(context.__warehouseHistory.some(entry => entry.type === 'adjustment' && /Инвентаризация/.test(entry.notes || '')));
    assert.ok(context.__warehouseHistory.some(entry => entry.type === 'inventory_audit' && /недостача/i.test(entry.notes || '')));

    const auditEntry = context.__warehouseHistory.find(entry => entry.type === 'inventory_audit');
    assert.equal(auditEntry.inventory_entered_positions, 1);
    assert.equal(auditEntry.inventory_positions_changed, 1);
    assert.equal(auditEntry.inventory_positions_unchanged, 0);
    assert.equal(auditEntry.inventory_positions_omitted, 1);
    assert.equal(auditEntry.inventory_total_positions, 2);
    assert.equal(auditEntry.inventory_details.length, 1);
    assert.equal(auditEntry.inventory_details[0].item_id, 701);
    assert.equal(auditEntry.inventory_details[0].actual_qty, 100);
    assert.equal(auditEntry.inventory_details[0].diff, -20);

    vm.runInContext(`Warehouse.currentView = 'inventory';`, context);
    await vm.runInContext(`Warehouse.renderInventoryView()`, context);

    const inventoryHtml = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(inventoryHtml, /Инвентаризация от/);
    assert.match(inventoryHtml, /Вписано/);
    assert.match(inventoryHtml, /AUD-701/);
    assert.match(inventoryHtml, /Совпадает/);

    context.__warehouseItems = context.__warehouseItems.map(item => item.id === 702 ? { ...item, qty: 8 } : item);
    context.__warehouseHistory.push({
        id: 8001,
        item_id: 702,
        item_name: 'Инвентаризационная упаковка',
        item_sku: 'AUD-702',
        item_category: 'packaging',
        type: 'adjustment',
        qty_change: -2,
        requested_qty_change: -2,
        qty_before: 10,
        qty_after: 8,
        unit_price: 5,
        total_cost_change: 10,
        notes: 'Инвентаризация: факт 8, было 10',
        created_at: '2026-03-10T10:00:00.000Z',
        created_by: 'Smoke',
    });
    context.__warehouseHistory.push({
        id: 8002,
        item_id: 0,
        item_name: 'Инвентаризация склада',
        item_sku: '',
        item_category: '',
        type: 'inventory_audit',
        qty_change: -2,
        requested_qty_change: -2,
        qty_before: 0,
        qty_after: 0,
        unit_price: 0,
        total_cost_change: 10,
        notes: 'Legacy inventory audit',
        created_at: '2026-03-10T10:00:05.000Z',
        created_by: 'Smoke',
        inventory_shortage_value: 10,
        inventory_surplus_value: 0,
        inventory_net_value: -10,
        inventory_positions_changed: 1,
    });
    vm.runInContext(`
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
    `, context);

    await vm.runInContext(`Warehouse.renderInventoryView()`, context);

    const legacyHtml = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(legacyHtml, /восстановлены из истории корректировок/i);
    assert.match(legacyHtml, /Инвентаризационная упаковка/);
}

async function smokeWarehouseInventoryAuditSurplusAndDiffMath(context) {
    context.__warehouseItems = [
        {
            id: 801,
            name: 'Складской трос',
            sku: 'AUD-801',
            category: 'cables',
            qty: 10,
            price_per_unit: 5,
            unit: 'шт',
        },
        {
            id: 802,
            name: 'Складская коробка',
            sku: 'AUD-802',
            category: 'packaging',
            qty: 20,
            price_per_unit: 7,
            unit: 'шт',
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

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.auditDraft = null;
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
        };
    `, context);

    await vm.runInContext(`Warehouse.showAudit()`, context);
    vm.runInContext(`
        Warehouse.onAuditInput({ dataset: { id: '801', system: '10' }, value: '8' });
        Warehouse.onAuditInput({ dataset: { id: '802', system: '20' }, value: '25' });
    `, context);
    await vm.runInContext(`Warehouse.saveAuditResults()`, context);

    assert.equal(context.__warehouseItems.find(item => item.id === 801).qty, 8);
    assert.equal(context.__warehouseItems.find(item => item.id === 802).qty, 25);

    const auditEntry = context.__warehouseHistory.find(entry => entry.type === 'inventory_audit');
    assert.ok(auditEntry, 'inventory summary should be saved');
    assert.equal(auditEntry.inventory_shortage_value, 10);
    assert.equal(auditEntry.inventory_surplus_value, 35);
    assert.equal(auditEntry.inventory_net_value, 25);
    assert.equal(auditEntry.inventory_positions_changed, 2);

    const detail801 = auditEntry.inventory_details.find(detail => detail.item_id === 801);
    const detail802 = auditEntry.inventory_details.find(detail => detail.item_id === 802);
    assert.equal(detail801.diff, -2);
    assert.equal(detail801.value_diff, -10);
    assert.equal(detail802.diff, 5);
    assert.equal(detail802.value_diff, 35);

    const auditAdjustments = context.__warehouseHistory.filter(entry => entry.type === 'adjustment' && entry.inventory_audit_id === auditEntry.id);
    assert.equal(auditAdjustments.length, 2);
    assert.ok(auditAdjustments.some(entry => entry.item_id === 801 && entry.qty_change === -2));
    assert.ok(auditAdjustments.some(entry => entry.item_id === 802 && entry.qty_change === 5));
}

async function smokeWarehouseInventoryAuditEditRewritesAudit(context) {
    context.__warehouseItems = [
        {
            id: 701,
            name: 'Инвентаризационный трос',
            sku: 'AUD-701',
            category: 'cables',
            qty: 100,
            price_per_unit: 12,
            unit: 'шт',
        },
        {
            id: 702,
            name: 'Инвентаризационная упаковка',
            sku: 'AUD-702',
            category: 'packaging',
            qty: 10,
            price_per_unit: 5,
            unit: 'шт',
        },
    ];
    context.__warehouseHistory = [
        {
            id: 91001,
            item_id: 701,
            item_name: 'Инвентаризационный трос',
            item_sku: 'AUD-701',
            item_category: 'cables',
            type: 'adjustment',
            qty_change: -20,
            requested_qty_change: -20,
            qty_before: 120,
            qty_after: 100,
            unit_price: 12,
            total_cost_change: 240,
            order_id: null,
            order_name: '',
            notes: 'Инвентаризация: факт 100, было 120',
            clamped: false,
            created_at: '2026-03-20T10:00:00.000Z',
            created_by: 'Smoke',
            inventory_audit: true,
            inventory_audit_id: 9100,
        },
        {
            id: 9100,
            item_id: 0,
            item_name: 'Инвентаризация склада',
            item_sku: '',
            item_category: '',
            type: 'inventory_audit',
            qty_change: -20,
            requested_qty_change: -20,
            qty_before: 0,
            qty_after: 0,
            unit_price: 0,
            total_cost_change: 240,
            order_id: null,
            order_name: '',
            notes: 'Скорректировано 1 поз.',
            clamped: false,
            created_at: '2026-03-20T10:00:05.000Z',
            created_by: 'Smoke',
            inventory_shortage_value: 240,
            inventory_surplus_value: 0,
            inventory_net_value: -240,
            inventory_positions_changed: 1,
            inventory_entered_positions: 1,
            inventory_positions_unchanged: 0,
            inventory_total_positions: 2,
            inventory_positions_omitted: 1,
            inventory_details: [
                {
                    item_id: 701,
                    item_name: 'Инвентаризационный трос',
                    item_sku: 'AUD-701',
                    item_category: 'cables',
                    unit: 'шт',
                    system_qty_before: 120,
                    actual_qty: 100,
                    diff: -20,
                    value_diff: -240,
                    price_per_unit: 12,
                },
            ],
        },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.auditDraft = null;
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
        };
    `, context);

    await vm.runInContext(`Warehouse.renderInventoryView()`, context);
    const inventoryHtmlBeforeEdit = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(inventoryHtmlBeforeEdit, /Редактировать/);
    assert.match(inventoryHtmlBeforeEdit, /Удалить/);

    await vm.runInContext(`Warehouse.editInventoryAudit(9100)`, context);

    assert.equal(vm.runInContext(`Warehouse.auditDraft.mode`, context), 'edit');
    assert.equal(vm.runInContext(`Warehouse.auditDraft.audit_id`, context), 9100);
    assert.equal(vm.runInContext(`Warehouse.auditDraft.baseline["701"]`, context), '120');
    assert.equal(vm.runInContext(`Warehouse.auditDraft.values["701"]`, context), '100');
    assert.match(String(vm.runInContext(`document.getElementById('wh-audit-title').textContent`, context)), /Редактирование инвентаризации/);
    assert.match(String(vm.runInContext(`document.getElementById('wh-audit-table').innerHTML`, context)), /120 шт/);

    vm.runInContext(`
        Warehouse.onAuditInput({ dataset: { id: '701', system: '120' }, value: '120' });
        Warehouse.onAuditInput({ dataset: { id: '702', system: '10' }, value: '8' });
    `, context);
    await vm.runInContext(`Warehouse.saveAuditResults()`, context);

    assert.equal(context.__warehouseItems.find(item => item.id === 701).qty, 120);
    assert.equal(context.__warehouseItems.find(item => item.id === 702).qty, 8);

    const summaryEntries = context.__warehouseHistory.filter(entry => entry.type === 'inventory_audit' && entry.id === 9100);
    assert.equal(summaryEntries.length, 1, 'edited audit summary should be rewritten in place');
    const auditEntry = summaryEntries[0];
    assert.equal(auditEntry.created_at, '2026-03-20T10:00:05.000Z');
    assert.equal(auditEntry.inventory_positions_changed, 1);

    const detail701 = auditEntry.inventory_details.find(detail => detail.item_id === 701);
    const detail702 = auditEntry.inventory_details.find(detail => detail.item_id === 702);
    assert.equal(detail701.system_qty_before, 120);
    assert.equal(detail701.actual_qty, 120);
    assert.equal(detail701.diff, 0);
    assert.equal(detail702.system_qty_before, 10);
    assert.equal(detail702.actual_qty, 8);
    assert.equal(detail702.diff, -2);

    const auditAdjustments = context.__warehouseHistory.filter(entry => entry.type === 'adjustment' && entry.inventory_audit_id === 9100);
    assert.equal(auditAdjustments.length, 1);
    assert.ok(auditAdjustments.some(entry => entry.item_id === 702 && entry.qty_change === -2 && entry.qty_before === 10 && entry.qty_after === 8));

    await vm.runInContext(`Warehouse.renderInventoryView()`, context);
    const inventoryHtmlAfterEdit = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(inventoryHtmlAfterEdit, /С расхождением в инвентаризации/);
    assert.match(inventoryHtmlAfterEdit, /Совпало в инвентаризации/);
    assert.match(inventoryHtmlAfterEdit, /Проверка сейчас на складе: совпадает 2 из 2 детализированных строк\./);
    assert.match(inventoryHtmlAfterEdit, /Было в системе/);
    assert.match(inventoryHtmlAfterEdit, /Факт в инвентаризации/);
    assert.match(inventoryHtmlAfterEdit, /Разница в инвентаризации/);
    assert.match(inventoryHtmlAfterEdit, /Только расхождения \(1\)/);
    assert.ok(
        inventoryHtmlAfterEdit.indexOf('Инвентаризационная упаковка') < inventoryHtmlAfterEdit.indexOf('Инвентаризационный трос'),
        'changed inventory rows should be rendered before unchanged rows'
    );

    await vm.runInContext(`Warehouse.toggleInventoryAuditOnlyChanged(9100, true)`, context);
    const filteredInventoryHtml = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(filteredInventoryHtml, /Только расхождения \(1\)/);
    assert.match(filteredInventoryHtml, /Инвентаризационная упаковка/);
    assert.doesNotMatch(filteredInventoryHtml, /Инвентаризационный трос/);
    assert.equal(vm.runInContext(`Boolean(Warehouse.inventoryAuditDetailFilters["9100"])`, context), true);

    await vm.runInContext(`Warehouse.toggleInventoryAuditOnlyChanged(9100, false)`, context);
    vm.runInContext(`
        globalThis.__warehouseItems = globalThis.__warehouseItems.map(item => {
            if (Number(item.id) === 701) {
                return { ...item, qty: 118 };
            }
            return { ...item };
        });
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
    `, context);
    await vm.runInContext(`Warehouse.renderInventoryView()`, context);
    const inventoryHtmlWithCurrentMismatch = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(inventoryHtmlWithCurrentMismatch, /Только несовпадающие сейчас \(1\)/);
    assert.match(inventoryHtmlWithCurrentMismatch, /Проверка сейчас на складе: совпадает 1 из 2 детализированных строк\./);

    await vm.runInContext(`Warehouse.toggleInventoryAuditOnlyCurrentMismatch(9100, true)`, context);
    const currentMismatchOnlyHtml = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(currentMismatchOnlyHtml, /Только несовпадающие сейчас \(1\)/);
    assert.match(currentMismatchOnlyHtml, /Инвентаризационный трос/);
    assert.doesNotMatch(currentMismatchOnlyHtml, /Инвентаризационная упаковка/);
    assert.equal(vm.runInContext(`Warehouse.inventoryAuditDetailFilters["9100"].onlyCurrentMismatch === true`, context), true);
}

async function smokeWarehouseInventoryAuditDeleteRollsBackStock(context) {
    context.__warehouseItems = [
        {
            id: 701,
            name: 'Инвентаризационный трос',
            sku: 'AUD-701',
            category: 'cables',
            qty: 90,
            price_per_unit: 12,
            unit: 'шт',
        },
        {
            id: 702,
            name: 'Инвентаризационная упаковка',
            sku: 'AUD-702',
            category: 'packaging',
            qty: 8,
            price_per_unit: 5,
            unit: 'шт',
        },
    ];
    context.__warehouseHistory = [
        {
            id: 92001,
            item_id: 701,
            item_name: 'Инвентаризационный трос',
            item_sku: 'AUD-701',
            item_category: 'cables',
            type: 'adjustment',
            qty_change: -30,
            requested_qty_change: -30,
            qty_before: 120,
            qty_after: 90,
            unit_price: 12,
            total_cost_change: 360,
            order_id: null,
            order_name: '',
            notes: 'Инвентаризация: факт 90, было 120',
            clamped: false,
            created_at: '2026-03-21T10:00:00.000Z',
            created_by: 'Smoke',
            inventory_audit: true,
            inventory_audit_id: 9200,
        },
        {
            id: 92002,
            item_id: 702,
            item_name: 'Инвентаризационная упаковка',
            item_sku: 'AUD-702',
            item_category: 'packaging',
            type: 'adjustment',
            qty_change: -2,
            requested_qty_change: -2,
            qty_before: 10,
            qty_after: 8,
            unit_price: 5,
            total_cost_change: 10,
            order_id: null,
            order_name: '',
            notes: 'Инвентаризация: факт 8, было 10',
            clamped: false,
            created_at: '2026-03-21T10:00:00.000Z',
            created_by: 'Smoke',
            inventory_audit: true,
            inventory_audit_id: 9200,
        },
        {
            id: 9200,
            item_id: 0,
            item_name: 'Инвентаризация склада',
            item_sku: '',
            item_category: '',
            type: 'inventory_audit',
            qty_change: -32,
            requested_qty_change: -32,
            qty_before: 0,
            qty_after: 0,
            unit_price: 0,
            total_cost_change: 370,
            order_id: null,
            order_name: '',
            notes: 'Скорректировано 2 поз.',
            clamped: false,
            created_at: '2026-03-21T10:00:05.000Z',
            created_by: 'Smoke',
            inventory_shortage_value: 370,
            inventory_surplus_value: 0,
            inventory_net_value: -370,
            inventory_positions_changed: 2,
            inventory_entered_positions: 2,
            inventory_positions_unchanged: 0,
            inventory_total_positions: 2,
            inventory_positions_omitted: 0,
            inventory_details: [
                {
                    item_id: 701,
                    item_name: 'Инвентаризационный трос',
                    item_sku: 'AUD-701',
                    item_category: 'cables',
                    unit: 'шт',
                    system_qty_before: 120,
                    actual_qty: 90,
                    diff: -30,
                    value_diff: -360,
                    price_per_unit: 12,
                },
                {
                    item_id: 702,
                    item_name: 'Инвентаризационная упаковка',
                    item_sku: 'AUD-702',
                    item_category: 'packaging',
                    unit: 'шт',
                    system_qty_before: 10,
                    actual_qty: 8,
                    diff: -2,
                    value_diff: -10,
                    price_per_unit: 5,
                },
            ],
        },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.auditDraft = null;
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
        };
    `, context);

    await vm.runInContext(`Warehouse.deleteInventoryAudit(9200)`, context);

    assert.equal(context.__warehouseItems.find(item => item.id === 701).qty, 120);
    assert.equal(context.__warehouseItems.find(item => item.id === 702).qty, 10);
    assert.equal(context.__warehouseHistory.filter(entry => entry.inventory_audit_id === 9200 || entry.id === 9200).length, 0);
    assert.match(String(context.__toasts.join('\n')), /Инвентаризация удалена/i);
}

async function smokeWarehouseInventoryAuditMutationBlockedAfterLaterMovement(context) {
    context.__warehouseItems = [
        {
            id: 701,
            name: 'Инвентаризационный трос',
            sku: 'AUD-701',
            category: 'cables',
            qty: 95,
            price_per_unit: 12,
            unit: 'шт',
        },
    ];
    context.__warehouseHistory = [
        {
            id: 93001,
            item_id: 701,
            item_name: 'Инвентаризационный трос',
            item_sku: 'AUD-701',
            item_category: 'cables',
            type: 'adjustment',
            qty_change: -25,
            requested_qty_change: -25,
            qty_before: 120,
            qty_after: 95,
            unit_price: 12,
            total_cost_change: 300,
            order_id: null,
            order_name: '',
            notes: 'Инвентаризация: факт 95, было 120',
            clamped: false,
            created_at: '2026-03-22T10:00:00.000Z',
            created_by: 'Smoke',
            inventory_audit: true,
            inventory_audit_id: 9300,
        },
        {
            id: 9300,
            item_id: 0,
            item_name: 'Инвентаризация склада',
            item_sku: '',
            item_category: '',
            type: 'inventory_audit',
            qty_change: -25,
            requested_qty_change: -25,
            qty_before: 0,
            qty_after: 0,
            unit_price: 0,
            total_cost_change: 300,
            order_id: null,
            order_name: '',
            notes: 'Скорректировано 1 поз.',
            clamped: false,
            created_at: '2026-03-22T10:00:05.000Z',
            created_by: 'Smoke',
            inventory_shortage_value: 300,
            inventory_surplus_value: 0,
            inventory_net_value: -300,
            inventory_positions_changed: 1,
            inventory_entered_positions: 1,
            inventory_positions_unchanged: 0,
            inventory_total_positions: 1,
            inventory_positions_omitted: 0,
            inventory_details: [
                {
                    item_id: 701,
                    item_name: 'Инвентаризационный трос',
                    item_sku: 'AUD-701',
                    item_category: 'cables',
                    unit: 'шт',
                    system_qty_before: 120,
                    actual_qty: 95,
                    diff: -25,
                    value_diff: -300,
                    price_per_unit: 12,
                },
            ],
        },
        {
            id: 93002,
            item_id: 701,
            item_name: 'Инвентаризационный трос',
            item_sku: 'AUD-701',
            item_category: 'cables',
            type: 'addition',
            qty_change: 5,
            requested_qty_change: 5,
            qty_before: 95,
            qty_after: 100,
            unit_price: 12,
            total_cost_change: 60,
            order_id: null,
            order_name: '',
            notes: 'Позже пришла поставка',
            clamped: false,
            created_at: '2026-03-22T11:00:00.000Z',
            created_by: 'Smoke',
        },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        globalThis.__toasts = [];
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.auditDraft = null;
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
        };
    `, context);

    const historyBefore = clone(context.__warehouseHistory);
    const itemsBefore = clone(context.__warehouseItems);

    await vm.runInContext(`Warehouse.editInventoryAudit(9300)`, context);
    await vm.runInContext(`Warehouse.deleteInventoryAudit(9300)`, context);
    await vm.runInContext(`Warehouse.renderInventoryView()`, context);

    assert.deepEqual(context.__warehouseItems, itemsBefore);
    assert.deepEqual(context.__warehouseHistory, historyBefore);
    assert.match(String(context.__toasts.join('\n')), /нельзя безопасно менять/i);
    const inventoryHtml = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(inventoryHtml, /нельзя безопасно менять/i);
}

async function main() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js', 'js/molds.js'].forEach(file => runScript(context, file));
    stubRuntime(context);

    await smokeCalculatorPersistence(context);
    await smokeEmptyPlaceholderProductIsNotSaved(context);
    await smokeHardwareOnlyAutosave(context);
    await smokeZeroCostWarehouseHardwareStillShowsInPricing(context);
    await smokeLoadOrderHydratesZeroWarehousePriceFromCurrentStock(context);
    await smokeOrderListAndDetailUseLiveFinancialSnapshot(context);
    await smokeBlankPricingSeparatesCatalogPriceAndNetMargin(context);
    await smokeBlankTargetFormulaMatchesVatExclusiveMargin(context);
    await smokePendantFallbackTierMatchesVatExclusiveMargin();
    await smokeOrderDiscountAffectsSummaryAndFinDirector(context);
    await smokeDiscountShownInCustomerInvoice(context);
    await smokeCalculatorSupportsMoreThanSixItems(context);
    await smokeRemovedPrintingDoesNotLeakIntoInvoiceOrSummary(context);
    await smokeGenerateKPPassesDiscount(context);
    await smokeFinDirectorPendantsUseAllAttachments(context);
    await smokeFinDirectorSeparatesHardwareAndNfc(context);
    await smokeFinDirectorBlankMoldsUseAmortization(context);
    await smokeFinDirectorRevenueMatchesNetSummaryAndProfit(context);
    await smokePendantAttachmentCostsIncludeAssemblyAndIndirect(context);
    await smokeHardwareWarehousePickerUpdatesImmediately(context);
    await smokePackagingWarehousePickerDefaults(context);
    await smokeCurrentOrderReservationRestoresWarehouseQuota(context);
    await smokeCommittedOrderDemandRestoresWarehouseQuotaWithoutActiveReservation();
    await smokePendantWarehousePickerRestoresCurrentOrderQuota();
    await smokePendantCommittedDemandRestoresQuotaWithoutActiveReservation();
    await smokeLoadOrderRestoresCommittedPendantQuotaWithoutActiveReservation();
    await smokePendantWarehousePickerRichUI();
    await smokePendantPickerRepairsMissingRequiredSku();
    await smokePendantCentimeterCordPricing();
    await smokePendantSplitAllocationUsesAllocatedQty();
    await smokePendantIgnoresSpaces();
    await smokePendantStepNavigationSync();
    await smokePendantOverlayDoesNotCloseWizard();
    await smokePendantAutoPriceFromBlanks();
    await smokePendantLettersContributePlasticLoad();
    await smokeCyrillicPendantUsesLiveBlankPphFields(context);
    await smokeBlankBuiltinAssemblyUsesAssemblyLoad(context);
    await smokeBlankTemplateMoldCostOverridesGlobalDefault(context);
    await smokeSavedBlankMoldCostSurvivesOrderReload(context);
    await smokePendantFinDirectorUsesCurrentLetterCost(context);
    await smokeLegacyPendantRestore(context);
    await smokeCurrentPendantPayloadBeatsStaleNested(context);
    await smokeCloneOrderRestoresLegacySnapshotItems(context);
    await smokeCloneOrderPrefersNormalizedItems(context);
    await smokeReadyGoodsRollback(context);
    await smokeReadyGoodsSalesAndManualAdd(context);
    await smokeChinaShipmentMetadata(context);
    await smokeChinaReceiptStatusLinkage(context);
    await smokeChinaReceiptBlocksWeakAutoCreatedItems(context);
    await smokeChinaReceiptCreatesMoldAndPromotesOrder(context);
    await smokeBlankMoldAutoFieldsWithoutVisibleTemplate(context);
    await smokeOrderStatusWarehouseSync(context);
    await smokeCompletedStatusGuardBlocksUntilAllCollected(context);
    await smokeOrderDetailCompletedGuard(context);
    await smokeProductionPlanCompletedGuard(context);
    await smokePendantWarehouseDemandSync(context);
    await smokeProductNfcWarehouseDemandSync(context);
    await smokeTemplateBuiltInNfcUsesWarehouseDemand(context);
    await smokeProjectHardwareShortageDetailsForHiddenNfc(context);
    await smokeProjectHardwareShortageDetailsShowBlockingOrders(context);
    await smokePackagingWarehouseSaveSync(context);
    await smokeWarehouseManualAdjustment(context);
    await smokeWarehouseAdjustmentPersistsWithoutBulkSave(context);
    await smokeWarehouseReserveLabelsShowSource(context);
    await smokeWarehouseStockTruthShowsAvailableAndCorrections(context);
    await smokeWarehouseProjectReserveCannotBeEditedInline(context);
    await smokeWarehouseLoadRendersBeforeBackgroundSync();
    await smokeWarehouseLoadPreservesManualPhotos();
    await smokeWarehouseThumbnailGetsWhiteBackground(context);
    await smokeProjectHardwarePersistenceAndBuckets(context);
    await smokeProjectHardwareToggleShortageGuard(context);
    await smokeProjectHardwareLegacyQtyAndStringIdDeduction(context);
    await smokeProjectHardwareActualQtyEditableFlow(context);
    await smokeProjectHardwareZeroActualCanStayReady(context);
    await smokeProjectHardwareConcurrentMutationsStayConsistent(context);
    await smokeOrderDetailHardwareTabShowsAndEditsProjectHardware(context);
    await smokeProjectHardwareReadySyncDoesNotAutoReturnConsumedStock(context);
    await smokeProjectHardwareCollectedStateSurvivesStateLoss(context);
    await smokeProjectHardwareSavedCheckWithoutHistoryIsNotReady(context);
    await smokeProjectHardwareReadyToggleReloadsAndClosesProject(context);
    await smokeCompletedOrderConsumesBlankMoldCapacity(context);
    await smokeMoldUsageThresholdCreatesTasksWithoutDuplicates(context);
    await smokeBlankHardwareFilterAndLowStockAlerts(context);
    await smokeProjectHardwareLegacyStatusRepair(context);
    await smokeProjectHardwareLegacyAndCollectedNetting(context);
    await smokeProjectHardwareExplicitActualReadySurvivesLegacyOnlyHistory(context);
    await smokeWarehouseInventoryAuditDraftAndFinalize(context);
    await smokeWarehouseInventoryAuditSurplusAndDiffMath(context);
    await smokeWarehouseInventoryAuditEditRewritesAudit(context);
    await smokeWarehouseInventoryAuditDeleteRollsBackStock(context);
    await smokeWarehouseInventoryAuditMutationBlockedAfterLaterMovement(context);
    await smokeOrderDetailColorRendering(context);

    console.log('order-flow smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

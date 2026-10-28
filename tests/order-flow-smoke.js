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
                taxRate: 0.07,
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
            taxRate: 0.07,
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
        const params = { ...App.params, taxRate: 0.07, vatRate: 0.05, charityRate: 0.01 };
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
    assert.equal(data.amountSummary.totalEarned, 26.5);

    assert.equal(data.percentSummary.discountAmount, 10);
    assert.equal(data.percentSummary.totalRevenue, 90);

    assert.equal(data.fin.grossRevenue, 100);
    assert.equal(data.fin.discountAmount, 10);
    assert.equal(data.fin.revenue, 90);
    assert.equal(data.fin.taxes, 6.3);
    assert.equal(data.fin.commercial, 6.3);
    assert.equal(data.fin.charity, 0.9);
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
            return order.id;
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
    assert.ok(saved.order.id, 'new autosave reserves a stable order id before writing');
    assert.equal(saved.items.length, 1);
    assert.equal(saved.items[0].item_type, 'hardware');
    assert.equal(saved.items[0].hardware_warehouse_item_id, 777);
    assert.equal(context.localStorage.getItem('ro_calc_editing_order_id'), String(saved.order.id));
}

async function smokeCalculatorLocalDraftSurvivesRefresh(context) {
    const state = clone(await vm.runInContext(`(async () => {
        Calculator.resetForm();
        Calculator.renderItemBlock = () => {};
        Calculator.rerenderAllHardware = () => {};
        Calculator.rerenderAllPackaging = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator.recalculate = () => {};
        Calculator._updateItemsEmptyState = () => {};

        document.getElementById('calc-order-name').value = 'T-bank ambassadors';
        document.getElementById('calc-client-name').value = 'T-bank';
        document.getElementById('calc-manager-name').value = 'Alina';
        document.getElementById('calc-autosave-status');

        const item = Calculator.getEmptyItem(1);
        item.product_name = 'Cardholder';
        item.quantity = 800;
        item.sell_price_item = 300;
        item.result = { ...getEmptyCostResult(), costTotal: 120 };
        Calculator.items = [item];

        Calculator.scheduleAutosave();
        clearTimeout(Calculator._autosaveTimer);
        Calculator.resetForm({ preserveLocalDraft: true });
        const restored = await Calculator._restoreLocalDraftIfAvailable();

        return {
            restored,
            orderName: document.getElementById('calc-order-name').value,
            clientName: document.getElementById('calc-client-name').value,
            itemCount: Calculator.items.length,
            productName: Calculator.items[0]?.product_name || '',
            quantity: Calculator.items[0]?.quantity || 0,
            status: document.getElementById('calc-autosave-status').textContent,
        };
    })()`, context));

    assert.equal(state.restored, true, 'dirty calculator snapshot should restore after refresh-like reset');
    assert.equal(state.orderName, 'T-bank ambassadors');
    assert.equal(state.clientName, 'T-bank');
    assert.equal(state.itemCount, 1);
    assert.equal(state.productName, 'Cardholder');
    assert.equal(state.quantity, 800);
    assert.match(state.status, /Восстановлен/);
}

async function smokeLegacyLocalDraftRestoresAsNewOrder(context) {
    const state = clone(await vm.runInContext(`(async () => {
        Calculator.resetForm();
        Calculator.renderItemBlock = () => {};
        Calculator.rerenderAllHardware = () => {};
        Calculator.rerenderAllPackaging = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator.recalculate = () => {};
        Calculator._updateItemsEmptyState = () => {};

        localStorage.setItem(Calculator._localDraftKey, JSON.stringify({
            app_version: 'v382',
            saved_at: new Date().toISOString(),
            reason: 'beforeunload',
            editing_order_id: 4011,
            current_order_status: 'sample',
            order_fields: {
                order_name: '100 желтых ключей',
                client_name: 'Алина',
                manager_name: 'Алина',
                deadline_start: '2026-06-30',
            },
            items: [],
            hardwareItems: [],
            packagingItems: [],
            extraCosts: [],
            pendants: [],
        }));

        const restored = await Calculator._restoreLocalDraftIfAvailable();
        return {
            restored,
            editingOrderId: App.editingOrderId,
            storedOrderId: localStorage.getItem('ro_calc_editing_order_id'),
            currentStatus: Calculator._currentOrderStatus,
            orderName: document.getElementById('calc-order-name').value,
        };
    })()`, context));

    assert.equal(state.restored, true, 'legacy local draft should still restore form contents');
    assert.equal(state.orderName, '100 желтых ключей');
    assert.equal(state.editingOrderId, null, 'legacy local draft must not keep stale editing order id');
    assert.equal(state.storedOrderId, null, 'legacy local draft must clear stale stored order id');
    assert.equal(state.currentStatus, 'draft', 'legacy local draft should save as a new draft after restore');
}

async function smokeNewDraftAutosaveAndManualSaveShareReservedId(context) {
    const result = clone(await vm.runInContext(`(async () => {
        const saveCalls = [];
        const saveResolvers = [];
        saveOrder = (order, items) => new Promise(resolve => {
            saveCalls.push({ order: { ...order }, items: JSON.parse(JSON.stringify(items)) });
            saveResolvers.push(() => resolve(order.id));
        });

        loadOrder = async (orderId) => ({
            order: { id: orderId, status: 'draft' },
            items: [],
        });

        Calculator.resetForm();
        document.getElementById('calc-order-name').value = 'Race-safe draft';
        document.getElementById('calc-manager-name').value = 'Smoke';
        document.getElementById('calc-autosave-status');

        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(null), {
            source: 'warehouse',
            name: 'Race Hardware',
            qty: 3,
            warehouse_item_id: 778,
            warehouse_sku: 'HW-778',
            assembly_speed: 120,
            result: { costPerUnit: 15, hoursHardware: 0.4 },
        })];

        const autosavePromise = Calculator._doAutosave();
        await Promise.resolve();
        Calculator.hardwareItems[0].qty = 7;
        const manualSavePromise = Calculator.saveOrder();
        await Promise.resolve();
        await Promise.resolve();

        const writesBeforeFirstResolve = saveCalls.length;
        const idsBeforeResolve = saveCalls.map(call => call.order.id);
        saveResolvers[0]();
        await Promise.resolve();
        await Promise.resolve();
        const writesBeforeSecondResolve = saveCalls.length;
        saveResolvers[1]();
        await Promise.all([autosavePromise, manualSavePromise]);

        return {
            saveCalls,
            idsBeforeResolve,
            writesBeforeFirstResolve,
            writesBeforeSecondResolve,
            editingOrderId: App.editingOrderId,
            storedOrderId: localStorage.getItem('ro_calc_editing_order_id'),
        };
    })()`, context));

    assert.equal(result.writesBeforeFirstResolve, 1, 'manual save waits for an in-flight autosave write');
    assert.equal(result.writesBeforeSecondResolve, 2, 'manual save starts only after autosave write resolves');
    assert.equal(result.saveCalls.length, 2, 'autosave and manual save both persist in sequence');
    assert.ok(result.idsBeforeResolve[0], 'autosave reserves an id before the first write resolves');
    assert.equal(
        new Set(result.idsBeforeResolve).size,
        1,
        'manual save must reuse the in-flight autosave id instead of creating a duplicate draft'
    );
    assert.equal(result.saveCalls[0].items[0].quantity, 3, 'the first write contains the old autosave snapshot');
    assert.equal(result.saveCalls[1].items[0].quantity, 7, 'the final manual write contains the edited state');
    assert.equal(String(result.editingOrderId), String(result.idsBeforeResolve[0]));
    assert.equal(result.storedOrderId, String(result.idsBeforeResolve[0]));
}

async function smokeManualSaveInvalidatesPreparedAutosave(context) {
    const result = clone(await vm.runInContext(`(async () => {
        const originalSaveOrder = saveOrder;
        const originalLoadOrder = loadOrder;
        const originalPrepare = Calculator._prepareColorAttachmentsForSave;
        const writes = [];
        let releaseAutosavePreparation = null;
        let prepareCalls = 0;

        try {
            saveOrder = async (order, items) => {
                writes.push({ order: { ...order }, items: JSON.parse(JSON.stringify(items)) });
                return order.id;
            };
            loadOrder = async (orderId) => ({ order: { id: orderId, status: 'draft' }, items: [] });
            Calculator._prepareColorAttachmentsForSave = async () => {
                prepareCalls += 1;
                if (prepareCalls === 1) {
                    await new Promise(resolve => { releaseAutosavePreparation = resolve; });
                }
            };

            Calculator.resetForm();
            document.getElementById('calc-order-name').value = 'Prepared autosave must not win';
            document.getElementById('calc-manager-name').value = 'Smoke';
            document.getElementById('calc-autosave-status');
            Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(null), {
                source: 'warehouse',
                name: 'Race Hardware',
                qty: 3,
                warehouse_item_id: 779,
                warehouse_sku: 'HW-779',
                assembly_speed: 120,
                result: { costPerUnit: 15, hoursHardware: 0.4 },
            })];

            const autosavePromise = Calculator._doAutosave();
            await Promise.resolve();
            Calculator.hardwareItems[0].qty = 7;
            await Calculator.saveOrder();
            const writesAfterManualSave = JSON.parse(JSON.stringify(writes));
            releaseAutosavePreparation();
            await autosavePromise;

            return { writesAfterManualSave, writes, prepareCalls, autosaving: Calculator._autosaving };
        } finally {
            saveOrder = originalSaveOrder;
            loadOrder = originalLoadOrder;
            Calculator._prepareColorAttachmentsForSave = originalPrepare;
        }
    })()`, context));

    assert.equal(result.prepareCalls, 2, 'autosave and manual save both reached preparation');
    assert.equal(result.writesAfterManualSave.length, 1, 'manual save persists while autosave is still preparing');
    assert.equal(result.writes.length, 1, 'obsolete autosave does not write after manual save');
    assert.equal(result.writes[0].items[0].quantity, 7, 'only the manual snapshot reaches persistence');
    assert.equal(result.autosaving, false, 'obsolete autosave must release the autosave lock');
}

async function smokeLegacyProductionStatusAppearsInOrdersViews(context) {
    const state = clone(await vm.runInContext(`(() => {
        Orders.allOrders = [
            { id: 1, order_name: 'Т-банк Амбассадоры', status: 'production' },
            { id: 2, order_name: 'Черновик', status: 'draft' },
        ];
        Orders.mode = 'board';
        const board = Orders.getModeOrders().map(order => order.id);
        Orders.mode = 'production';
        const production = Orders.getModeOrders().map(order => order.id);
        Orders.mode = 'active';
        const active = Orders.getModeOrders().map(order => order.id);
        return {
            board,
            production,
            active,
            className: Orders.statusClassName('production'),
            consumed: Orders._isConsumedStatus('production'),
        };
    })()`, context));

    assert.deepEqual(state.board, [1, 2]);
    assert.deepEqual(state.production, [1]);
    assert.deepEqual(state.active, [1]);
    assert.equal(state.className, 'badge-yellow');
    assert.equal(state.consumed, true);
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

async function smokeLegacyPerItemHardwareClearsBuiltinTemplateHardware(context) {
    context.__loadOrderData = {
        order: {
            id: 9012,
            order_name: 'Legacy doubled hardware order',
            client_name: 'Smoke Client',
            manager_name: 'Smoke',
            status: 'draft',
        },
        items: [{
            item_type: 'product',
            item_number: 1,
            product_name: 'Брелок',
            quantity: 100,
            template_id: 77,
            is_blank_mold: true,
            builtin_hw_name: 'Карабин',
            builtin_hw_price: 8,
            builtin_hw_delivery_total: 0,
            builtin_hw_speed: 120,
        }, {
            item_type: 'hardware',
            product_name: 'Карабин',
            quantity: 100,
            hardware_source: 'custom',
            hardware_parent_item_index: 0,
            hardware_assembly_speed: 120,
            hardware_price_per_unit: 8,
            sell_price_hardware: 20,
        }],
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);

    vm.runInContext(`
        App.templates = [{
            id: 77,
            name: 'Брелок',
            category: 'blank',
            weight_grams: 10,
            pieces_per_hour_avg: 100,
            hw_name: 'Карабин',
            hw_price_per_unit: 8,
            hw_delivery_total: 0,
            hw_speed: 120,
        }];
        Calculator.renderItemBlock = () => {};
        Calculator.renderHardwareRow = () => {};
        Calculator.renderPackagingRow = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.recalculate = () => {};
        Calculator.showOrderHistory = () => {};
        Calculator._ensureWhPickerData = async () => ({});
    `, context);

    await vm.runInContext('Calculator.loadOrder(9012)', context);
    const state = clone(await vm.runInContext(`({
        builtinName: Calculator.items[0].builtin_hw_name,
        builtinPrice: Calculator.items[0].builtin_hw_price,
        hardwareCount: Calculator.hardwareItems.length,
        hardwareName: Calculator.hardwareItems[0]?.name || '',
    })`, context));

    assert.equal(state.hardwareCount, 1);
    assert.equal(state.hardwareName, 'Карабин');
    assert.equal(state.builtinName, '', 'legacy per-item hardware should suppress template builtin hardware');
    assert.equal(state.builtinPrice, 0);
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
            taxRate: 0.07,
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
            is_blank_mold: true,
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

async function smokeOrderListUsesStoredFinancialMetaWhenItemsMissing(context) {
    const state = clone(await vm.runInContext(`(() => {
        const order = {
            id: 88,
            order_name: 'Stored Margin Order',
            payment_status: 'paid_100',
            total_revenue_plan: 2600,
            margin_percent_plan: 24.7,
            total_hours_plan: 3.5,
        };
        const financial = Orders.buildFinancialMeta(order, []);
        Orders.metaByOrderId = { 88: { financial } };
        return {
            financial,
            boardHtml: Orders.renderBoardCard(order),
        };
    })()`, context));

    assert.equal(state.financial.revenue, 2600, 'orders list should keep stored revenue when items are missing');
    assert.equal(state.financial.marginPercent, 24.7, 'orders list should keep stored margin when items are missing');
    assert.match(state.boardHtml, /24[,.]7\s*%/, 'board card should render stored margin instead of 0%');
}

async function smokeOrderListRejectsPartialTextSummary(context) {
    const state = clone(await vm.runInContext(`(() => {
        const order = {
            id: 89,
            order_name: 'Legacy TEXT summary',
            total_revenue_plan: 42000,
            margin_percent_plan: 17.5,
            total_hours_plan: 8.25,
        };
        // This is the real shape returned by PostgREST while item_data is TEXT:
        // physical columns exist, projected JSON calculation fields are null.
        const partialRows = [{
            order_id: 89,
            item_number: 1,
            product_name: 'Купер 500',
            quantity: 500,
            sell_price_item: 84,
            item_type: null,
            pieces_per_hour: null,
            weight_grams: null,
        }];
        return Orders.buildFinancialMeta(order, partialRows);
    })()`, context));

    assert.deepEqual(state, {
        revenue: 42000,
        marginPercent: 17.5,
        hours: 8.25,
    }, 'partial TEXT summary must never be recalculated with zero costs');
}

async function smokeOrderListSummaryMatchesCardForAllInputs(context) {
    const state = clone(await vm.runInContext(`(() => {
        App.params = {
            ...App.params,
            wasteFactor: 1.1,
            fotPerHour: 120,
            indirectCostMode: 'all',
            indirectPerHour: 80,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 4000,
            cuttingSpeed: 1000,
            nfcTagCost: 10,
            nfcWriteSpeed: 500,
            taxRate: 0.07,
            vatRate: 0.05,
            charityRate: 0.01,
            commercialRate: 0.07,
            deliveryCostMoscow: 800,
            printingDeliveryCost: 300,
            setupHoursPerBatch: 2,
        };
        App.templates = [];

        const order = {
            id: 90,
            order_name: 'Parity fixture',
            discount_mode: 'percent',
            discount_value: 10,
            total_revenue_plan: 1,
            margin_percent_plan: 1,
            total_hours_plan: 1,
        };
        const fullItems = [{
            item_type: 'product',
            item_number: 1,
            product_name: 'Two-color blank',
            quantity: 100,
            pieces_per_hour: 100,
            weight_grams: 12,
            extra_molds: 1,
            complex_design: true,
            is_nfc: false,
            nfc_programming: false,
            is_blank_mold: true,
            base_mold_in_stock: false,
            blank_mold_total_cost: 20000,
            setup_hours_override: 0.5,
            colors: [{ id: 1 }, { id: 2 }],
            sell_price_item: 190,
            sell_price_printing: 12,
            printing_qty: 100,
            printing_price_per_unit: 4,
            printings: [],
            color_solution_attachment: 'data:image/png;base64,SHOULD_NOT_BE_IN_SUMMARY',
        }, {
            item_type: 'hardware',
            item_number: 2,
            product_name: 'Ring',
            quantity: 100,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 501,
            hardware_warehouse_sku: 'RING-1',
            hardware_price_per_unit: 7,
            hardware_delivery_per_unit: 1,
            hardware_delivery_total: 100,
            hardware_assembly_speed: 200,
            sell_price_hardware: 20,
        }, {
            item_type: 'packaging',
            item_number: 3,
            product_name: 'Box',
            quantity: 100,
            packaging_source: 'warehouse',
            packaging_warehouse_item_id: 601,
            packaging_warehouse_sku: 'BOX-1',
            packaging_price_per_unit: 8,
            packaging_delivery_per_unit: 2,
            packaging_delivery_total: 200,
            packaging_assembly_speed: 250,
            sell_price_packaging: 25,
        }, {
            item_type: 'pendant',
            item_number: 4,
            name: 'AB pendant',
            product_name: 'AB pendant',
            quantity: 20,
            elements: [{ char: 'A', has_print: true, print_price: 3 }, { char: 'B' }],
            cords: [{
                source: 'custom', name: 'Cord', allocated_qty: 20,
                price_per_unit: 4, delivery_price: 1, assembly_speed: 100,
            }],
            carabiners: [{
                source: 'custom', name: 'Carabiner', allocated_qty: 20,
                price_per_unit: 6, delivery_price: 1, assembly_speed: 120,
            }],
            cord_length_cm: 50,
            element_price_per_unit: 15,
            _totalSellPerUnit: 95,
        }, {
            item_type: 'extra_cost',
            item_number: 5,
            product_name: 'Rush fee',
            cost_total: 500,
        }];

        // Mirror ORDER_ITEM_SUMMARY_SELECT: all calculation inputs, no heavy
        // attachment blobs. The order itself is already hydrated from the
        // compact calculator_data selected by loadOrders().
        const summaryItems = fullItems.map(item => {
            const copy = { ...item };
            delete copy.color_solution_attachment;
            return copy;
        });
        const card = getOrderLiveCalculatorSnapshot(order, fullItems, App.params, App.templates);
        const list = Orders.buildFinancialMeta(order, summaryItems);
        return {
            card: { revenue: card.revenue, marginPercent: card.marginPercent, hours: card.hours },
            list,
        };
    })()`, context));

    assert.deepEqual(state.list, state.card, 'list summary and card must use identical live inputs');
    assert.ok(state.card.revenue > 0);
    assert.ok(state.card.hours > 0);
}

async function smokeOrderMetaBundleUsesLightItemsForHardware(context) {
    const originalLoadOrderItemsByOrderIds = context.loadOrderItemsByOrderIds;
    context.__orderItemLoadCalls = [];
    context.loadWorkProjects = async () => [];
    context.loadWorkTasks = async () => [];
    context.loadChinaPurchases = async () => [];
    context.loadOrderItemsByOrderIds = async (orderIds, options = {}) => {
        context.__orderItemLoadCalls.push({ orderIds: clone(orderIds), options: clone(options || {}) });
        if (options && options.summary === true) {
            return [{
                order_id: 42,
                item_number: 1,
                product_name: 'Summary-only row',
                quantity: 5,
            }];
        }
        return [{
            order_id: 42,
            item_number: 1,
            item_type: 'hardware',
            product_name: 'Warehouse ring',
            quantity: 5,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 501,
        }];
    };

    try {
        const state = clone(await vm.runInContext(`(async () => {
            const bundle = await Orders.loadMetaBundleLocal([42]);
            const meta = Orders.buildOrderMeta(
                { id: 42, order_name: 'Hardware Order', production_hours_hardware: 1.25 },
                bundle.orderItems,
                bundle.chinaPurchases,
                bundle.tasks
            );
            return {
                calls: globalThis.__orderItemLoadCalls,
                itemType: bundle.orderItems[0]?.item_type || '',
                hardwareLabel: meta.hardware.label,
                hardwareTitle: meta.hardware.title,
            };
        })()`, context));

        assert.equal(state.calls.length, 1);
        assert.equal(state.calls[0].options.summary, true, 'orders meta must avoid loading bulky item_data for every order');
        assert.equal(state.itemType, '');
        assert.equal(state.hardwareLabel, 'Фурнитура / сборка');
        assert.match(state.hardwareTitle, /плановые часы сборки/i);
    } finally {
        context.loadOrderItemsByOrderIds = originalLoadOrderItemsByOrderIds;
    }
}

async function smokeBlankPricingSeparatesCatalogPriceAndNetMargin(context) {
    vm.runInContext(`
        App.getItemOriginLabel = (item) => item?.is_blank_mold ? 'бланк' : 'кастом';
        App.templates = [{
            id: 'blank-price-smoke',
            name: 'Blank Smoke',
            custom_prices: { 500: 210 },
            custom_margins: {},
            use_manual_prices: true,
        }];
        Calculator.resetForm();
        Calculator.__blankCostSmokeOriginal = Calculator._calcBlankBaseCostFromTemplate;
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
    assert.match(pricingHtml, /налога 7%/);
    assert.match(pricingHtml, /коммерческого 6\.5%/);
    assert.match(pricingHtml, /pricing-grid-compact/);
    vm.runInContext(`
        Calculator._calcBlankBaseCostFromTemplate = Calculator.__blankCostSmokeOriginal;
        delete Calculator.__blankCostSmokeOriginal;
    `, context);
}

async function smokeNfcBlankPricingMatchesCatalogTier(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = {
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'all',
            indirectPerHour: 50,
            taxRate: 0.07,
            charityRate: 0.01,
            commercialRate: 0.07,
            packagingHours: 8,
            plasticHours: 8,
            hardwareHours: 8,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 300,
            nfcTagCost: 39,
            nfcWriteSpeed: 350,
            setupHoursBlank: 0.5,
            setupHoursCustom: 1,
            orderProcessingCost: 4000,
            printingDeliveryCost: 0,
            deliveryCostMoscow: 0,
        };
        const dormantHistoricalPrice = 910;
        const blank = {
            id: 'nfc-blank-parity',
            name: 'NFC галька',
            category: 'nfc',
            status: 'active',
            pph_actual: 20,
            pph_min: 18,
            pph_max: 22,
            weight_grams: 30,
            cost_cny: 1200,
            cny_rate: 12.5,
            delivery_cost: 3000,
            mold_count: 1,
            hw_name: 'NFC',
            hw_price_per_unit: 25,
            hw_delivery_total: 0,
            hw_speed: 0,
            builtin_assembly_name: '',
            builtin_assembly_speed: 0,
            custom_prices: { 3000: dormantHistoricalPrice },
            custom_margins: {},
            use_manual_prices: false,
            disable_historical_blank_price_recovery: false,
        };

        App.params = params;
        Molds.allMolds = [blank];
        Molds.enrichMolds();
        App.templates = [{ ...blank }];
        App.getItemOriginLabel = () => 'бланк';

        Calculator.resetForm();
        const item = Calculator.getEmptyItem(1);
        item.product_name = blank.name;
        item.quantity = 3000;
        item.template_id = blank.id;
        item.pieces_per_hour = blank.pph_actual;
        item.weight_grams = blank.weight_grams;
        item.is_blank_mold = true;
        item.is_nfc = true;
        item.nfc_programming = true;
        item.result = calculateItemCost(item, params);

        Calculator.items = [item];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];

        const catalogTier = Molds.allMolds[0].tiers[3000];
        const calculatorCost = Calculator._calcBlankBaseCostFromTemplate(item, item.quantity, params);
        Calculator.renderPricingCard(params);
        const html = document.getElementById('calc-pricing-content').innerHTML;

        return {
            catalogCost: catalogTier.cost,
            catalogPrice: catalogTier.sellPrice,
            calculatorCost,
            hasCatalogPrice: html.includes(formatRub(catalogTier.sellPrice)),
            hasDormantHistoricalPrice: html.includes(formatRub(dormantHistoricalPrice)),
            marksPriceAsManual: html.includes('вручную в бланке'),
        };
    })()`, context));

    assert.equal(
        state.calculatorCost,
        state.catalogCost,
        'calculator NFC blank cost must use the same 3K tier model as the blanks directory',
    );
    assert.equal(state.hasCatalogPrice, true, 'calculator must show the 3K sell price from the blanks formula');
    assert.equal(state.hasDormantHistoricalPrice, false, 'inactive historical prices must not override the live formula');
    assert.equal(state.marksPriceAsManual, false, 'inactive historical prices must not be labeled as manual');
}

async function smokeBlankTargetFormulaMatchesVatExclusiveMargin(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = { ...App.params, taxRate: 0.07, vatRate: 0.05, charityRate: 0.01 };
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

    assert.equal(state.blankTarget, 615.56, 'blank target price should treat tax, commercial and charity as deductions from the VAT-free base');
    assert.equal(state.blankNet40, 615.56, '40% blank helper price should match the blanks catalog target formula');
    assert.equal(state.customTarget, 615.56, 'generic calculator target formula should now use the same VAT-free retention canon as blanks');
    assert.equal(state.blankSell, 615, 'blank catalog sell price should round the VAT-free target to the nearest 5');
    assert.equal(state.blankMargin, 39.96, 'generic margin helper should now reflect the same VAT-free retention canon as blanks');
}

async function smokeWarehouseBackedNfcDoesNotDoubleCountFallback(context) {
    const result = clone(await vm.runInContext(`(() => {
        return calculateItemCost({
            quantity: 1,
            pieces_per_hour: 1,
            weight_grams: 0,
            extra_molds: 0,
            complex_design: false,
            is_blank_mold: false,
            is_nfc: true,
            nfc_programming: false,
            delivery_included: false,
            printings: [],
            builtin_hw_name: 'NFC',
            builtin_hw_price: 6.5,
            builtin_hw_delivery_total: 0,
            builtin_hw_speed: 0,
            builtin_assembly_name: '',
            builtin_assembly_speed: 0,
        }, {
            fotPerHour: 0,
            indirectPerHour: 0,
            plasticCostPerKg: 0,
            moldBaseCost: 0,
            designCost: 0,
            nfcTagCost: 10,
            nfcWriteSpeed: 350,
            wasteFactor: 1,
            cuttingSpeed: 0,
            printingDeliveryCost: 0,
            deliveryCostMoscow: 0,
            indirectCostMode: 'all',
        });
    })()`, context));

    assert.equal(result.costNfcTag, 0, 'warehouse-backed NFC should replace the generic tag fallback instead of stacking on top of it');
    assert.equal(result.costBuiltinHw, 6.5, 'warehouse-backed NFC should keep its real purchase price');
    assert.equal(result.costTotal, 6.5, 'warehouse-backed NFC should not double count fallback and hardware prices');
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
            taxRate: 0.07,
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
            taxRate: 0.07,
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
            taxRate: 0.07,
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
        cables: {
            label: 'Тросы',
            icon: '⚙',
            items: [{
                id: 804,
                category: 'cables',
                name: 'Тросы',
                sku: 'TR-050-YL',
                size: '5 см',
                color: 'желтый',
                qty: 215,
                available_qty: 200,
                price_per_unit: 5,
                unit: 'шт',
                photo_thumbnail: 'https://example.com/cable-yellow.png',
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
    assert.match(carabinerHtml, /Тросы/);
    assert.match(carabinerHtml, /Кольца/);
    assert.match(carabinerHtml, /TR-050-YL/);
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
    await vm.runInContext(`Pendant._onWhSelect('carabiner', 1, '804')`, pendantContext);
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
    assert.equal(attachmentState.carabiners[1].warehouse_item_id, 804);
    assert.equal(attachmentState.carabiners[1].category, 'cables');
    assert.equal(attachmentState.cords[0].allocated_qty, 5);
    assert.equal(attachmentState.cords[1].allocated_qty, 7);
    assert.equal(attachmentState.carabiners[0].allocated_qty, 4);
    assert.equal(attachmentState.carabiners[1].allocated_qty, 8);

    const step4Html = String(vm.runInContext(`Pendant._renderStep4()`, pendantContext));
    assert.match(step4Html, /FLC-550-BK/);
    assert.match(step4Html, /TR-050-YL/);
    assert.match(step4Html, /pendant-step4-layout/);
    assert.match(step4Html, /Сколько подвесов с этой позицией/);
    assert.match(step4Html, /Кол-во на 1 подвес/);
    assert.match(step4Html, /Распределено <b>12<\/b> из <b>12<\/b> шт/);

    const step5Html = String(vm.runInContext(`Pendant._renderStep5()`, pendantContext));
    assert.match(step5Html, /Шнур с силик\. наконечником синий 80 см/);
    assert.match(step5Html, /Шнур плоский/);
    assert.match(step5Html, /Тросы желтый 5 см/);
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
            taxRate: 0.07,
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
            taxRate: 0.07,
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
            taxRate: 0.07,
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
            taxRate: 0.07,
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

async function smokeOrderItemsLossGuard(context) {
    const originals = await vm.runInContext(`({
        renderItemBlock: Calculator.renderItemBlock,
        renderHardwareRow: Calculator.renderHardwareRow,
        renderPackagingRow: Calculator.renderPackagingRow,
        renderExtraCosts: Calculator.renderExtraCosts,
        _renderPerItemHwPkg: Calculator._renderPerItemHwPkg,
        recalculate: Calculator.recalculate,
        showOrderHistory: Calculator.showOrderHistory,
        _ensureWhPickerData: Calculator._ensureWhPickerData,
        _prepareColorAttachmentsForSave: Calculator._prepareColorAttachmentsForSave,
    })`, context);
    const originalLoadOrder = context.loadOrder;
    const originalSaveOrder = context.saveOrder;
    const saveCalls = [];
    context.saveOrder = async (order, items, options) => {
        saveCalls.push({ order: clone(order), items: clone(items), options: clone(options || {}) });
        return order.id;
    };
    const orderId = 93777;
    const rows = [
        { id: orderId * 1000 + 1, order_id: orderId, item_number: 1, item_type: 'product', product_name: 'Лимон', quantity: 100, pieces_per_hour: 30 },
        { id: orderId * 1000 + 100, order_id: orderId, item_number: 100, item_type: 'hardware', product_name: 'Цепочка', quantity: 100, hardware_source: 'custom' },
    ];
    const loadWith = (source) => {
        context.__loadOrderData = { order: { id: orderId, order_name: 'Лимон', status: 'draft' }, items: clone(rows), source };
    };
    context.loadOrder = async () => clone(context.__loadOrderData);
    try {
        await vm.runInContext(`
            Calculator.renderItemBlock = () => {};
            Calculator.renderHardwareRow = () => {};
            Calculator.renderPackagingRow = () => {};
            Calculator.renderExtraCosts = () => {};
            Calculator._renderPerItemHwPkg = () => {};
            Calculator.recalculate = () => {};
            Calculator.showOrderHistory = () => {};
            Calculator._prepareColorAttachmentsForSave = async () => {};
            globalThis.__releaseWhPicker = null;
            Calculator._ensureWhPickerData = () => new Promise(resolve => { globalThis.__releaseWhPicker = resolve; });
        `, context);

        // 0. Form reset while hardware is loading: the rest of the old order must
        // not pour into the fresh form (it used to autosave as a new draft).
        loadWith('remote');
        const interrupted = vm.runInContext(`Calculator.loadOrder(${orderId})`, context);
        await new Promise(resolve => setTimeout(resolve, 0));
        await vm.runInContext(`Calculator.resetForm(); globalThis.__releaseWhPicker({})`, context);
        await interrupted;
        const afterReset = clone(await vm.runInContext(`({
            hardwareCount: Calculator.hardwareItems.length,
            editingOrderId: App.editingOrderId,
            known: Calculator._knownItemIds.slice(),
        })`, context));
        assert.equal(afterReset.hardwareCount, 0, 'an interrupted load must not add old hardware to a reset form');
        assert.equal(afterReset.editingOrderId, null);
        assert.deepEqual(afterReset.known, []);

        // 1. While hardware is still loading, no save may run.
        loadWith('remote');
        const loading = vm.runInContext(`Calculator.loadOrder(${orderId})`, context);
        await new Promise(resolve => setTimeout(resolve, 0));
        const midLoad = clone(await vm.runInContext(`(async () => {
            const state = {
                loading: Calculator._loadingOrder,
                hardwareCount: Calculator.hardwareItems.length,
                blockReason: Calculator._orderSaveBlockReason(),
            };
            await Calculator._doAutosave();
            clearTimeout(Calculator._autosaveTimer);
            Calculator._autosaveTimer = null;
            return state;
        })()`, context));
        assert.equal(midLoad.loading, true, 'form must be marked as loading while hardware is pending');
        assert.equal(midLoad.hardwareCount, 0, 'test must observe the half-loaded form');
        assert.ok(midLoad.blockReason, 'a half-loaded form must refuse saves');
        assert.equal(saveCalls.length, 0, 'autosave must not write a half-loaded order');
        await vm.runInContext(`globalThis.__releaseWhPicker({})`, context);
        await loading;

        // 2. After a full remote load the known ids authorize deletions.
        const loaded = clone(await vm.runInContext(`({
            loading: Calculator._loadingOrder,
            stale: Calculator._staleOrderCopy,
            known: Calculator._knownItemIds.slice().sort(),
        })`, context));
        assert.equal(loaded.loading, false);
        assert.equal(loaded.stale, false);
        assert.deepEqual(loaded.known, rows.map(row => String(row.id)).sort());
        await vm.runInContext(`Calculator._doAutosave()`, context);
        assert.equal(saveCalls.length, 1, 'fully loaded order must autosave');
        assert.deepEqual(saveCalls[0].options.knownItemIds.slice().sort(), loaded.known);

        // 3. A fallback copy (server did not answer) is never written back.
        await vm.runInContext(`Calculator._ensureWhPickerData = async () => ({})`, context);
        loadWith('local');
        await vm.runInContext(`Calculator.loadOrder(${orderId})`, context);
        const stale = clone(await vm.runInContext(`({
            stale: Calculator._staleOrderCopy,
            known: Calculator._knownItemIds.slice(),
        })`, context));
        assert.equal(stale.stale, true, 'order loaded from a local copy must be marked stale');
        assert.deepEqual(stale.known, [], 'stale copy must not authorize deletions');
        await vm.runInContext(`Calculator._doAutosave()`, context);
        await vm.runInContext(`Calculator.saveOrder()`, context);
        assert.equal(saveCalls.length, 1, 'stale copy must not be autosaved or manually saved');
    } finally {
        await vm.runInContext(`Calculator.resetForm()`, context);
        context.loadOrder = originalLoadOrder;
        context.saveOrder = originalSaveOrder;
        context.__orderItemsLossGuardOriginals = originals;
        await vm.runInContext(`Object.assign(Calculator, __orderItemsLossGuardOriginals)`, context);
    }
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
            taxRate: 0.07,
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

        // Клиентский заказ тоже идёт на склад: есть ли у него штуки «на продажу», решает
        // Warehouse.moveOrderToReadyGoods по строкам. Переделка, сток/образец и сборка из
        // остатков туда не попадают.
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(42, { order_name: 'Smoke Order', client_name: 'Acme' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(77, { order_name: 'B2C Stock', client_name: 'B2C' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(43, { order_name: 'Rework', client_name: 'Acme', production_purpose: 'rework' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(44, { order_name: 'Sample', client_name: 'Acme', production_purpose: 'stock_sample' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(45, { order_name: 'Leftovers', production_purpose: 'leftover_assembly' }, 'delivery', 'completed')`, context);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(42, { order_name: 'Smoke Order' }, 'completed', 'delivery')`, context);

        assert.deepEqual(clone(context.__moveCalls), [
            { orderId: 42, orderName: 'Smoke Order' },
            { orderId: 77, orderName: 'B2C Stock' },
        ]);
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

// Ready goods live only in the shared base. A save that does not reach it must be
// reported to the user and must not leave the screen looking as if it had worked.
async function smokeReadyGoodsWritersReportFailedSave(context) {
    const FAILED = 'Не удалось сохранить готовую продукцию — нет связи с общей базой. Попробуйте ещё раз.';
    const PARTIAL = 'Готовая продукция сохранена не полностью — нет связи с общей базой. Проверьте остатки, прежде чем повторять.';
    const names = ['getReadyGoodsSourceStatus', 'loadReadyGoods', 'saveReadyGoods', 'loadReadyGoodsHistory', 'saveReadyGoodsHistory', 'loadSalesRecords', 'saveSalesRecords'];
    const originals = Object.fromEntries(names.map(name => [name, context[name]]));
    const writeOffDialog = context.document.getElementById('rg-writeoff-dialog');
    const addDialog = context.document.getElementById('rg-add-dialog');
    const originalRemove = [writeOffDialog.remove, addDialog.remove];

    context.__failing = new Set();
    context.__toasts = [];
    context.__renders = [];
    context.__removed = [];
    const failable = (name, apply) => async (value) => {
        if (context.__failing.has(name)) throw new Error('READY_GOODS_SHARED_UNAVAILABLE');
        apply(clone(value));
    };
    context.getReadyGoodsSourceStatus = () => ({
        ready_goods: { source: 'shared-settings' },
        ready_goods_history: { source: 'shared-settings' },
        sales_records: { source: 'shared-settings' },
    });
    context.loadReadyGoods = async () => clone(context.__readyGoods);
    context.saveReadyGoods = failable('stock', items => { context.__readyGoods = items; });
    context.loadReadyGoodsHistory = async () => clone(context.__readyGoodsHistory);
    context.saveReadyGoodsHistory = failable('history', history => { context.__readyGoodsHistory = history; });
    context.loadSalesRecords = async () => clone(context.__salesRecords);
    context.saveSalesRecords = failable('sales', records => { context.__salesRecords = records; });
    writeOffDialog.remove = () => { context.__removed.push('writeoff'); };
    addDialog.remove = () => { context.__removed.push('add'); };
    vm.runInContext(`
        globalThis.__origToast = App.toast;
        globalThis.__origRenderStats = Warehouse.renderStats;
        globalThis.__origRenderView = Warehouse.renderReadyGoodsView;
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.renderStats = () => { globalThis.__renders.push('stats'); };
        Warehouse.renderReadyGoodsView = () => { globalThis.__renders.push('view'); };
    `, context);

    const reset = (...failing) => {
        context.__readyGoods = [{
            id: 11, product_name: 'Ready Smoke Product', order_name: 'Smoke Order', order_id: 42,
            location_type: 'our', qty: 7, cost_per_unit: 19, added_at: '2026-03-15T00:00:00.000Z',
        }];
        context.__readyGoodsHistory = [];
        context.__salesRecords = [];
        context.__failing = new Set(failing);
        context.__toasts = [];
        context.__renders = [];
        context.__removed = [];
    };
    const fillWriteOff = () => {
        context.document.getElementById('rg-wo-product').value = '0';
        context.document.getElementById('rg-wo-qty').value = '3';
        context.document.getElementById('rg-wo-channel').value = 'marketplace';
        context.document.getElementById('rg-wo-revenue').value = '1500';
        context.document.getElementById('rg-wo-payout').value = '1200';
        context.document.getElementById('rg-wo-notes').value = 'outage test';
    };
    const fillAdd = () => {
        context.document.getElementById('rg-add-name').value = 'Outage Product';
        context.document.getElementById('rg-add-qty').value = '5';
        context.document.getElementById('rg-add-cost').value = '10';
        context.document.getElementById('rg-add-location').value = 'our';
        context.document.getElementById('rg-add-set').value = '';
    };
    const state = () => ({
        stockQty: context.__readyGoods.map(item => item.qty),
        sales: context.__salesRecords.length,
        history: context.__readyGoodsHistory.length,
    });

    try {
        // Write-off: the very first write fails, nothing reached the base.
        reset('stock');
        fillWriteOff();
        await vm.runInContext('Warehouse.doWriteOff()', context);
        assert.deepEqual(clone(context.__toasts), [FAILED], 'write-off: the failure is shown, not a success');
        assert.deepEqual(clone(context.__removed), [], 'write-off: the dialog stays open for another try');
        assert.deepEqual(clone(context.__renders), [], 'write-off: the screen is not redrawn as if it had worked');
        assert.deepEqual(state(), { stockQty: [7], sales: 0, history: 0 });

        // The same click once the base is back goes through.
        context.__failing.clear();
        context.__toasts = [];
        await vm.runInContext('Warehouse.doWriteOff()', context);
        assert.equal(context.__toasts.length, 1);
        assert.match(context.__toasts[0], /^Списано 3 шт/);
        assert.deepEqual(clone(context.__removed), ['writeoff']);
        assert.deepEqual(clone(context.__renders), ['stats', 'view']);
        assert.deepEqual(state(), { stockQty: [4], sales: 1, history: 1 });

        // Write-off: the stock is already off the shelf when the sale record fails. A plain
        // "try again" would take the goods off twice, so the screen shows the real state.
        reset('sales');
        fillWriteOff();
        await vm.runInContext('Warehouse.doWriteOff()', context);
        assert.deepEqual(clone(context.__toasts), [PARTIAL]);
        assert.deepEqual(clone(context.__removed), ['writeoff'], 'write-off: no stale dialog to retry from');
        assert.deepEqual(clone(context.__renders), ['stats', 'view'], 'write-off: the screen shows what is really saved');
        assert.deepEqual(state(), { stockQty: [4], sales: 0, history: 0 });

        reset('history');
        fillWriteOff();
        await vm.runInContext('Warehouse.doWriteOff()', context);
        assert.deepEqual(clone(context.__toasts), [PARTIAL]);
        assert.deepEqual(state(), { stockQty: [4], sales: 1, history: 0 });

        // Manual add: same rules.
        reset('stock');
        fillAdd();
        await vm.runInContext('Warehouse.doAddReadyGoods()', context);
        assert.deepEqual(clone(context.__toasts), [FAILED], 'manual add: the failure is shown, not a success');
        assert.deepEqual(clone(context.__removed), [], 'manual add: the dialog stays open for another try');
        assert.deepEqual(clone(context.__renders), []);
        assert.deepEqual(state(), { stockQty: [7], sales: 0, history: 0 });

        context.__failing.clear();
        context.__toasts = [];
        await vm.runInContext('Warehouse.doAddReadyGoods()', context);
        assert.equal(context.__toasts.length, 1);
        assert.match(context.__toasts[0], /^Добавлено 5 шт/);
        assert.deepEqual(clone(context.__removed), ['add']);
        assert.deepEqual(clone(context.__renders), ['stats', 'view']);
        assert.deepEqual(state(), { stockQty: [7, 5], sales: 0, history: 1 });

        reset('history');
        fillAdd();
        await vm.runInContext('Warehouse.doAddReadyGoods()', context);
        assert.deepEqual(clone(context.__toasts), [PARTIAL]);
        assert.deepEqual(clone(context.__removed), ['add']);
        assert.deepEqual(clone(context.__renders), ['stats', 'view']);
        assert.deepEqual(state(), { stockQty: [7, 5], sales: 0, history: 0 });
    } finally {
        names.forEach(name => { context[name] = originals[name]; });
        writeOffDialog.remove = originalRemove[0];
        addDialog.remove = originalRemove[1];
        vm.runInContext(`
            App.toast = globalThis.__origToast;
            Warehouse.renderStats = globalThis.__origRenderStats;
            Warehouse.renderReadyGoodsView = globalThis.__origRenderView;
        `, context);
    }
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

async function smokeStatusTransitionConfirmsPrimaryWriteBeforeSideEffects(context) {
    context.__ordersUpdateCalls = [];
    context.updateOrderStatus = async (orderId, status) => {
        context.__ordersUpdateCalls.push({ orderId: Number(orderId), status: String(status) });
    };

    vm.runInContext(`
        globalThis.__statusTransitionToasts = [];
        globalThis.__statusTransitionRenderCount = 0;
        globalThis.__statusTransitionLoadListCount = 0;
        globalThis.__statusTransitionReadyGoodsCount = 0;
        globalThis.__statusTransitionHistoryCount = 0;
        globalThis.__statusTransitionWarehouseStarted = false;
        globalThis.__statusTransitionWarehousePromise = new Promise((resolve, reject) => {
            globalThis.__resolveStatusTransitionWarehouse = resolve;
            globalThis.__rejectStatusTransitionWarehouse = reject;
        });
        App.toast = (message) => { globalThis.__statusTransitionToasts.push(String(message || '')); };
        Orders.allOrders = [{ id: 42, order_name: 'Immediate Status Order', status: 'draft' }];
        Orders.render = () => { globalThis.__statusTransitionRenderCount += 1; };
        Orders.loadList = () => { globalThis.__statusTransitionLoadListCount += 1; };
        Orders._syncWarehouseByStatus = async () => {
            globalThis.__statusTransitionWarehouseStarted = true;
            return globalThis.__statusTransitionWarehousePromise;
        };
        Orders._syncReadyGoodsByStatus = async () => {
            globalThis.__statusTransitionReadyGoodsCount += 1;
        };
        Orders.addChangeRecord = async () => {
            globalThis.__statusTransitionHistoryCount += 1;
        };
        globalThis.__statusTransitionPromise = Orders.onStatusChange(42, 'production_casting', 'draft');
    `, context);

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.deepEqual(clone(context.__ordersUpdateCalls), [{ orderId: 42, status: 'production_casting' }]);
    assert.equal(vm.runInContext(`Orders.allOrders[0].status`, context), 'production_casting');
    assert.equal(vm.runInContext(`globalThis.__statusTransitionRenderCount`, context), 1);
    assert.equal(vm.runInContext(`globalThis.__statusTransitionLoadListCount`, context), 0);
    assert.equal(vm.runInContext(`globalThis.__statusTransitionWarehouseStarted`, context), true);
    assert.equal(vm.runInContext(`globalThis.__statusTransitionReadyGoodsCount`, context), 1);
    assert.equal(vm.runInContext(`globalThis.__statusTransitionHistoryCount`, context), 1);
    assert.ok(clone(context.__statusTransitionToasts).some(message => /статус сохранён.*production_casting/i.test(message)));

    vm.runInContext(`globalThis.__rejectStatusTransitionWarehouse(new Error('warehouse timeout'))`, context);
    await vm.runInContext(`globalThis.__statusTransitionPromise`, context);

    assert.equal(vm.runInContext(`Orders.allOrders[0].status`, context), 'production_casting');
    assert.equal(vm.runInContext(`globalThis.__statusTransitionLoadListCount`, context), 1);
    assert.ok(clone(context.__statusTransitionToasts).some(message => /статус сохранён, но не завершилась синхронизация склада/i.test(message)));
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
        Orders._syncReadyGoodsByStatus = async () => { throw new Error('ready goods sync should not run when production plan completed is blocked'); };
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
        globalThis.__readyGoodsSyncCalls = [];
        globalThis.__changeRecordCalls = [];
        Orders._syncWarehouseByStatus = async (...args) => { globalThis.__warehouseSyncCalls.push(args); };
        Orders._syncReadyGoodsByStatus = async (...args) => { globalThis.__readyGoodsSyncCalls.push(args); };
        Orders.addChangeRecord = async (...args) => { globalThis.__changeRecordCalls.push(args); };
        ProductionPlan.allRows = [{ id: 91, status: 'delivery', orderName: 'Plan Guard' }];
    `, context);

    await vm.runInContext(`ProductionPlan.goNextStage(91)`, context);

    assert.deepEqual(clone(context.__ordersUpdateCalls), [{ orderId: 91, status: 'completed' }]);
    assert.equal(vm.runInContext(`ProductionPlan.allRows[0].status`, context), 'completed');
    assert.equal(vm.runInContext(`globalThis.__planLoadCount`, context), 1);
    assert.equal((clone(vm.runInContext(`globalThis.__warehouseSyncCalls`, context)) || []).length, 1);
    assert.equal((clone(vm.runInContext(`globalThis.__changeRecordCalls`, context)) || []).length, 1);
    // Готовая продукция синхронизируется и при смене статуса из плана производства.
    const readyGoodsSyncCalls = clone(vm.runInContext(`globalThis.__readyGoodsSyncCalls`, context)) || [];
    assert.equal(readyGoodsSyncCalls.length, 1);
    assert.equal(readyGoodsSyncCalls[0][0], 91);
    assert.deepEqual(readyGoodsSyncCalls[0].slice(2), ['delivery', 'completed']);
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
            is_nfc: true,
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
        Calculator._applyNfcTemplateToItem(Calculator.items[0], App.templates[0]);
        Calculator._syncTemplateHardware(0, App.templates[0]);
        globalThis.__templateHw = Calculator.hardwareItems[0] || null;
        globalThis.__templateDemand = Array.from(Calculator._collectWarehouseReservationDemand({ hardware: true, packaging: false }).entries());
    `, context);

    const hw = clone(vm.runInContext('globalThis.__templateHw', context));
    assert.equal(hw, null, 'NFC mold hardware should stay embedded in the product row');

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

async function smokeWarehouseInlineQtyUsesLatestCloudQty(context) {
    context.__warehouseItems = [
        {
            id: 802,
            name: 'Stale Render Qty Item',
            sku: 'ADJ-802',
            category: 'other',
            qty: 4,
            price_per_unit: 9,
            updated_at: '2026-03-15T00:00:00.000Z',
        },
    ];
    context.__warehouseHistory = [];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItem = async (item) => {
        const normalized = clone(item);
        const idx = context.__warehouseItems.findIndex(entry => Number(entry.id) === Number(normalized.id));
        if (idx >= 0) context.__warehouseItems[idx] = normalized;
        else context.__warehouseItems.push(normalized);
        return normalized.id;
    };
    context.saveWarehouseItems = async (items) => {
        context.__warehouseItems = clone(items);
    };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => {
        context.__warehouseHistory = clone(history);
    };

    vm.runInContext(`
        App.toast = () => {};
        Warehouse._inlineSaved = () => {};
        Warehouse.load = async () => {};
        Warehouse.allItems = [{ id: 802, name: 'Stale Render Qty Item', qty: 10 }];
    `, context);

    await vm.runInContext(`Warehouse.inlineQty(802, '1', 10)`, context);

    assert.equal(context.__warehouseItems[0].qty, 1);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_before, 4);
    assert.equal(context.__warehouseHistory[0].qty_after, 1);
    assert.equal(context.__warehouseHistory[0].requested_qty_change, -3);
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

    const waitForEvents = async (expectedCount, timeoutMs = 500) => {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
            const events = clone(vm.runInContext(`globalThis.__events.slice()`, warehouseContext));
            if (events.length >= expectedCount) return events;
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return clone(vm.runInContext(`globalThis.__events.slice()`, warehouseContext));
    };

    const finalEvents = await waitForEvents(10);
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

async function smokeWarehouseViewsShowLoadingImmediately() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js'].forEach(file => runScript(context, file));
    stubRuntime(context);

    context.loadOrders = async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return [];
    };
    context.loadWarehouseReservations = async () => [];
    context.loadWarehouseHistory = async () => [];
    context.loadShipments = async () => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return [];
    };

    vm.runInContext(`
        document.getElementById('wh-content');
        document.getElementById('wh-shipments-list');
        document.getElementById('wh-shipments-content');
        document.getElementById('wh-filters-card');
        Warehouse.allItems = [];
        Warehouse.currentView = 'table';
        Warehouse._viewInitialized = false;
        Warehouse._viewToken = 0;
        Warehouse.setView('project-hardware', { force: true });
    `, context);

    const projectLoadingHtml = String(context.document.getElementById('wh-content').innerHTML || '');
    assert.match(projectLoadingHtml, /Загружаем фурнитуру для проектов/);
    assert.match(projectLoadingHtml, /wh-loading-progress/);

    await new Promise(resolve => setTimeout(resolve, 60));
    const projectFinalHtml = String(context.document.getElementById('wh-content').innerHTML || '');
    assert.match(projectFinalHtml, /Фурнитура и упаковка для проектов/);

    vm.runInContext(`Warehouse.setView('shipments', { force: true });`, context);
    const shipmentsLoadingHtml = String(context.document.getElementById('wh-shipments-list').innerHTML || '');
    assert.match(shipmentsLoadingHtml, /Загружаем приёмки из Китая/);
    assert.match(shipmentsLoadingHtml, /wh-loading-progress/);
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
    context.__projectHardwareItemLoadCalls = [];
    context.__projectHardwareFullOrderLoadCalls = [];
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => {
        context.__savedProjectHardwareState = clone(state);
        context.__projectHardwareState = clone(state);
    };
    context.loadOrders = async () => clone(context.__orders);
    context.loadOrder = async (orderId) => {
        context.__projectHardwareFullOrderLoadCalls.push(Number(orderId));
        return clone(context.__orderDetails[Number(orderId)] || null);
    };
    context.loadOrderItemsByOrderIds = async (orderIds, options = {}) => {
        context.__projectHardwareItemLoadCalls.push({ orderIds: clone(orderIds), options: clone(options) });
        assert.equal(options.summary, true, 'project hardware batches must exclude bulky item_data attachments');
        return orderIds.flatMap(orderId => clone(context.__orderDetails[Number(orderId)]?.items || [])
            .map(item => ({ ...item, order_id: Number(orderId) })));
    };
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
    assert.equal(context.__projectHardwareItemLoadCalls.length, 3);
    context.__projectHardwareItemLoadCalls.forEach(call => {
        assert.deepEqual(call.orderIds.slice().sort((a, b) => a - b), [100, 200, 300, 400]);
        assert.equal(call.options.summary, true);
    });
    assert.equal(context.__projectHardwareFullOrderLoadCalls.length, 0, 'batched project hardware reads must avoid per-order loadOrder calls');
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
        globalThis.__warehouseLoadCalls = 0;
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => { globalThis.__warehouseLoadCalls += 1; };
    `, context);

    try {
        await vm.runInContext(`Warehouse.toggleProjectHardwareReady(42, 501, true)`, context);

        assert.equal(Boolean(context.__projectHardwareState.checks['42:501']), false);
        assert.equal(context.__warehouseItems[0].qty, 2);
        assert.equal(context.__warehouseHistory.length, 0);
        assert.equal(context.__reservations[0].status, 'active');
        assert.ok(context.__toasts.some(message => /не удалось отметить как собрано/i.test(message)));
        assert.ok(context.__toasts.some(message => /на складе 2 шт, нужно 5 шт/i.test(message)));
        assert.equal(context.__warehouseLoadCalls, 1);

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
            delete globalThis.__warehouseLoadCalls;
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

    const readyClickPromise = vm.runInContext(`
        globalThis.__readyLabel = { textContent: 'собрано', style: {}, isConnected: false };
        globalThis.__readyProgress = { textContent: 'Собрано 0 из 1' };
        globalThis.__readyBadge = { textContent: 'не готово', style: {} };
        globalThis.__readyClickInput = {
            dataset: { ready: '0' },
            checked: true,
            disabled: false,
            isConnected: false,
            setAttribute(name, value) { this[name] = value; },
            removeAttribute(name) { delete this[name]; },
        };
        globalThis.__readyRow = {
            dataset: { projectHardwareRow: '321:901', projectHardwareReady: '0' },
            style: {},
            querySelector(selector) {
                if (String(selector).includes('checkbox')) return globalThis.__readyClickInput;
                if (selector === '[data-project-hardware-ready-label]') return globalThis.__readyLabel;
                return null;
            },
            closest(selector) {
                return selector === '[data-project-hardware-order-card]' ? globalThis.__readyCard : null;
            },
        };
        globalThis.__readyCard = {
            querySelectorAll(selector) {
                return selector === '[data-project-hardware-row]' ? [globalThis.__readyRow] : [];
            },
            querySelector(selector) {
                if (selector === '[data-project-hardware-order-progress]') return globalThis.__readyProgress;
                if (selector === '[data-project-hardware-order-badge]') return globalThis.__readyBadge;
                return null;
            },
        };
        globalThis.__readyOriginalQuerySelectorAll = document.querySelectorAll;
        document.querySelectorAll = (selector) => selector === '[data-project-hardware-row]' ? [globalThis.__readyRow] : globalThis.__readyOriginalQuerySelectorAll.call(document, selector);
        globalThis.__readyPromise = Warehouse.handleProjectHardwareReadyClick({
            preventDefault() { globalThis.__readyPrevented = true; },
            currentTarget: globalThis.__readyClickInput,
        }, 321, 901);
        globalThis.__readyAfterClick = {
            checked: globalThis.__readyClickInput.checked,
            disabled: globalThis.__readyClickInput.disabled,
            rowReady: globalThis.__readyRow.dataset.projectHardwareReady,
            label: globalThis.__readyLabel.textContent,
            progress: globalThis.__readyProgress.textContent,
            badge: globalThis.__readyBadge.textContent,
        };
        globalThis.__readyPromise
    `, context);

    assert.equal(context.__readyAfterClick.checked, true);
    assert.equal(context.__readyAfterClick.disabled, true);
    assert.equal(context.__readyAfterClick.rowReady, '1');
    assert.equal(context.__readyAfterClick.label, 'собрано, записываем...');
    assert.equal(context.__readyAfterClick.progress, 'Собрано 1 из 1');
    assert.equal(context.__readyAfterClick.badge, 'готово');

    await readyClickPromise;
    vm.runInContext(`document.querySelectorAll = globalThis.__readyOriginalQuerySelectorAll;`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['321:901']), true);
    assert.equal(context.__readyPrevented, true);
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

    const reservedButEmptyDetail = {
        order: {
            id: 324,
            order_name: 'Reserved Empty Stock Order',
            manager_name: 'Smoke',
            status: 'production_hardware',
            created_at: '2026-03-18T12:30:00.000Z',
        },
        items: [{
            item_type: 'hardware',
            product_name: 'Reserved Empty Stock Hardware',
            quantity: 10,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 903,
        }],
    };

    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [{
        id: 11,
        item_id: 903,
        order_id: 324,
        order_name: 'Reserved Empty Stock Order',
        qty: 10,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-03-18T12:30:00.000Z',
    }];
    context.__warehouseItems = [{
        id: 903,
        name: 'Reserved Empty Stock Hardware',
        sku: 'RESH-1',
        category: 'hardware',
        qty: 0,
        unit: 'шт',
        price_per_unit: 10,
    }];
    context.__warehouseHistory = [];
    context.__orderDetails = { 324: clone(reservedButEmptyDetail) };
    vm.runInContext(`
        globalThis.__toasts = [];
        Warehouse.projectHardwareState = null;
        Warehouse.load = async () => {};
    `, context);

    await vm.runInContext(`Warehouse.setProjectHardwareActualQty(324, 903, '10')`, context);

    assert.equal(context.__projectHardwareState.actual_qtys['324:903'], 10);
    assert.equal(context.__reservations.find(item => Number(item.order_id) === 324 && item.status === 'active').qty, 10);
    assert.equal(context.__warehouseItems[0].qty, 0);

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(324, 903, true)`, context);

    assert.equal(Boolean(context.__projectHardwareState.checks['324:903']), true);
    assert.equal(context.__warehouseItems[0].qty, -10);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_change, -10);
    assert.equal(context.__warehouseHistory[0].requested_qty_change, -10);
    assert.equal(context.__warehouseHistory[0].project_hardware_flow, 'ready_toggle');
    assert.equal(context.__warehouseHistory[0].clamped, false);
    assert.equal(context.__reservations[0].status, 'released');
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

async function smokeCompletedUnreadyProjectHardwareCanBeWrittenOff(context) {
    const order = {
        id: 771,
        order_name: 'Completed With Pending Hardware',
        manager_name: 'Алина',
        status: 'completed',
        created_at: '2026-05-15T09:00:00.000Z',
    };
    const detail = {
        order: clone(order),
        items: [{
            item_number: 100,
            item_type: 'hardware',
            product_name: 'Круглый карабин для готового проекта',
            quantity: 40,
            hardware_source: 'warehouse',
            hardware_warehouse_item_id: 501,
            hardware_warehouse_sku: 'READY-HW-501',
        }],
    };

    context.__orders = [clone(order)];
    context.__orderDetails = { 771: clone(detail) };
    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__reservations = [];
    context.__warehouseItems = [{
        id: 501,
        name: 'Круглый карабин для готового проекта',
        sku: 'READY-HW-501',
        category: 'hardware',
        qty: 50,
        price_per_unit: 9,
        unit: 'шт',
    }];
    context.__warehouseHistory = [];
    context.loadOrders = async () => clone(context.__orders);
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => { context.__projectHardwareState = clone(state); };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => { context.__reservations = clone(reservations); };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItem = async (item) => {
        const idx = context.__warehouseItems.findIndex(entry => Number(entry.id) === Number(item.id));
        if (idx >= 0) context.__warehouseItems[idx] = clone(item);
        else context.__warehouseItems.push(clone(item));
    };
    context.saveWarehouseItems = async (itemsArg) => { context.__warehouseItems = clone(itemsArg); };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => { context.__warehouseHistory = clone(history); };

    vm.runInContext(`
        Warehouse.projectHardwareState = null;
        Warehouse.allItems = globalThis.__warehouseItems.map(item => ({ ...item }));
        Warehouse.currentView = 'project-hardware';
        Warehouse._viewToken = 1;
        Warehouse.load = async function () {
            this.allItems = await loadWarehouseItems();
        };
    `, context);

    await vm.runInContext(`Warehouse.renderProjectHardwareView(1)`, context);
    const htmlBefore = String(vm.runInContext(`document.getElementById('wh-content').innerHTML`, context));
    assert.match(htmlBefore, /Completed With Pending Hardware/);
    assert.match(htmlBefore, /не готово/);
    assert.match(htmlBefore, /Собрано 0 из 1/);

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(771, 501, true)`, context);

    assert.equal(context.__warehouseItems[0].qty, 10, 'completed unready project hardware should still deduct stock when marked collected');
    assert.equal(Boolean(context.__projectHardwareState.checks['771:501']), true);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_change, -40);
    assert.equal(context.__warehouseHistory[0].project_hardware_flow, 'ready_toggle');
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

async function smokeStandaloneLetterBlankUsesPendantTierPricing(context) {
    const state = clone(await vm.runInContext(`(() => {
        const params = {
            ...App.params,
            wasteFactor: 1.1,
            fotPerHour: 100,
            indirectCostMode: 'none',
            indirectPerHour: 0,
            taxRate: 0.07,
            vatRate: 0.05,
            charityRate: 0.01,
            commercialRate: 0.07,
            plasticCostPerKg: 2500,
            moldBaseCost: 18000,
            designCost: 0,
            cuttingSpeed: 1000,
        };
        App.params = params;
        Molds.allMolds = [];
        App.templates = [{
            id: 30,
            name: 'Буквы (бланк)',
            category: 'blank',
            custom_prices: { 3000: 140 },
            custom_margins: {},
            use_manual_prices: true,
            pph_min: 60,
            pph_max: 60,
            pph_actual: 100,
            pieces_per_hour_avg: 60,
            pieces_per_hour_min: 60,
            weight_grams: 10,
            mold_count: 1,
            cost_cny: 800,
            cny_rate: 12.5,
            delivery_cost: 8000,
            hw_name: '',
            hw_price_per_unit: 0,
            hw_delivery_total: 0,
            hw_speed: 0,
            builtin_assembly_name: 'Сборка букв на шнур',
            builtin_assembly_speed: 600,
        }];
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.onTemplatePickerSelect(0, 30);
        Calculator.items[0].quantity = 15000;
        Calculator.items[0].sell_price_item = 140;
        Calculator.items[0].result = calculateItemCost(Calculator.items[0], params);
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        Calculator.extraCosts = [];

        const standaloneCost = Calculator._calcBlankBaseCostFromTemplate(Calculator.items[0], 15000, params);
        const pendantMetrics = getPendantLetterBlankMetrics(15000, params, {
            quantity: 7500,
            elements: [{ char: 'A' }, { char: 'B' }],
        });
        Calculator.renderPricingCard(params);
        const html = document.getElementById('calc-pricing-content').innerHTML;
        return {
            selectedPph: Calculator.items[0].pieces_per_hour,
            standaloneAssemblySpeed: Calculator.items[0].builtin_assembly_speed,
            tierQty: getBlankCatalogTierQty(15000),
            standaloneCost,
            pendantCost: pendantMetrics.cost,
            pendantSellPrice: pendantMetrics.sellPrice,
            html,
        };
    })()`, context));

    assert.equal(state.selectedPph, 100, 'standalone blank picker should prefer live pph_actual over stale average');
    assert.equal(state.standaloneAssemblySpeed, 0, 'standalone letter blanks should be loose letters without built-in pendant assembly');
    assert.equal(state.tierQty, 3000, '15000 loose letters should use the top blank catalog tier');
    assert.equal(state.pendantSellPrice, 140, 'pendant letter pricing should use the top-tier manual blank price');
    assert.match(state.html, /140 ₽/, 'standalone blank pricing card should show the same top-tier blank price');
    assert.doesNotMatch(state.html, /170 ₽/, 'standalone blank pricing card should not recalculate a higher non-tier price at 15000');
}

async function smokeNonCommercialPurposeTurnsSalesIntoInternalLoss(context) {
    const state = clone(await vm.runInContext(`(() => {
        Calculator.resetForm();
        document.getElementById('calc-production-purpose').value = 'rework';
        Calculator.setProductionPurpose('rework');

        const item = Calculator.getEmptyItem(1);
        item.product_name = 'Переделываемая форма';
        item.quantity = 100;
        item.sell_price_item = 500; // старая цена может остаться в форме, но это не продажа
        item.result = { ...getEmptyCostResult(), costTotal: 120 };
        Calculator.items = [item];

        const summary = Calculator.getPurposeAwareOrderSummary(App.params, { mode: 'none', value: 0 });
        const snapshot = Calculator._getOrderFormSnapshot();
        return { summary, snapshot, purpose: Calculator.getProductionPurpose() };
    })()`, context));

    assert.equal(state.purpose, 'rework');
    assert.equal(state.snapshot.production_purpose, 'rework', 'purpose survives local draft snapshots');
    assert.equal(state.summary.totalRevenue, 0, 'a rework must never be counted as customer revenue');
    assert.equal(state.summary.totalEarned, -12000, 'the composition cost becomes an internal loss');
    assert.equal(state.summary.nonCommercialLoss, 12000);
    assert.equal(state.summary.marginPercent, 0);
}

async function smokeCustomCompositePersistence(context) {
    const saved = clone(await vm.runInContext(`(() => {
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        const item = Calculator.items[0];
        item.product_name = 'Составной кастом';
        item.quantity = 500;
        item.custom_composite = true;
        item.custom_parts = [
            { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: true },
            { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: false },
        ];
        return Calculator._collectItemsForSave();
    })()`, context));
    const row = saved.find(item => item.item_type === 'product');
    assert.equal(row.custom_composite, true);
    assert.equal(typeof row.custom_parts, 'string', 'parts are stored as JSON like printings/colors');
    assert.deepEqual(JSON.parse(row.custom_parts).map(part => part.name), ['Корпус', 'Кнопка']);

    const meaningful = vm.runInContext(`Calculator._isMeaningfulProductItem({ ...Calculator.getEmptyItem(1), custom_composite: true })`, context);
    assert.equal(meaningful, true, 'an item with only the composite toggle on is still saved');

    context.__loadOrderData = {
        order: { id: 9101, order_name: 'Composite', status: 'draft' },
        items: clone(saved),
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
    await vm.runInContext('Calculator.loadOrder(9101)', context);
    const restored = clone(vm.runInContext('Calculator.items[0]', context));
    assert.equal(restored.custom_composite, true);
    assert.equal(Array.isArray(restored.custom_parts), true, 'parts are parsed back into an array');
    assert.equal(restored.custom_parts.length, 2);
    assert.equal(restored.custom_parts[0].mold_in_stock, true);
    assert.equal(restored.custom_parts[1].qty, 2);
}

async function smokeCustomCompositeEditing(context) {
    const state = clone(await vm.runInContext(`(() => {
        const originals = {
            renderItemBlock: Calculator.renderItemBlock,
            recalculate: Calculator.recalculate,
            scheduleAutosave: Calculator.scheduleAutosave,
            _syncTemplateHardware: Calculator._syncTemplateHardware,
        };
        try {
        Calculator.renderItemBlock = () => {};
        Calculator.recalculate = () => {};
        Calculator.scheduleAutosave = () => {};
        Calculator.items = [Calculator.getEmptyItem(1)];
        const item = Calculator.items[0];
        item.product_name = 'Корпус';
        item.quantity = 500;
        item.pieces_per_hour = 60;
        item.weight_grams = 30;

        Calculator.toggleCustomComposite(0, true);
        const afterEnable = JSON.parse(JSON.stringify(item));

        Calculator.updateCustomPart(0, 1, 'name', 'Кнопка');
        Calculator.updateCustomPart(0, 1, 'pieces_per_hour', '120');
        Calculator.updateCustomPart(0, 1, 'weight_grams', '5');
        Calculator.updateCustomPart(0, 1, 'qty', '2');
        const afterParts = { pph: item.pieces_per_hour, weight: item.weight_grams, stock: item.base_mold_in_stock };

        Calculator.updateCustomPart(0, 0, 'mold_in_stock', true);
        Calculator.updateCustomPart(0, 1, 'mold_in_stock', true);
        const allStock = item.base_mold_in_stock;

        Calculator.removeCustomPart(0, 1);
        const partsAfterBlockedRemove = item.custom_parts.length;
        Calculator.addCustomPart(0);
        const partsAfterAdd = item.custom_parts.length;
        Calculator.removeCustomPart(0, 2);

        Calculator.onCustomAssemblySpeedChange(0, '60');
        const assembly = { name: item.builtin_assembly_name, speed: item.builtin_assembly_speed };

        const html = Calculator._renderCustomCompositeBlock(0, item);

        Calculator.toggleCustomComposite(0, false);
        const afterDisable = JSON.parse(JSON.stringify(item));

        Calculator.toggleCustomComposite(0, true);
        Calculator.onCustomAssemblySpeedChange(0, '60');
        Calculator._syncTemplateHardware = () => {};
        Calculator.setMoldType(0, true);
        const afterBlank = JSON.parse(JSON.stringify(item));

        return { afterEnable, afterParts, allStock, partsAfterBlockedRemove, partsAfterAdd, assembly, html, afterDisable, afterBlank };
        } finally {
            Object.assign(Calculator, originals);
        }
    })()`, context));

    assert.equal(state.afterEnable.custom_composite, true);
    assert.equal(state.afterEnable.custom_parts.length, 2, 'enabling creates two parts');
    assert.deepEqual(
        { name: state.afterEnable.custom_parts[0].name, pph: state.afterEnable.custom_parts[0].pieces_per_hour, weight: state.afterEnable.custom_parts[0].weight_grams },
        { name: 'Корпус', pph: 60, weight: 30 },
        'the first part is prefilled from the item',
    );
    assert.equal(state.afterEnable.pieces_per_hour, 0, 'an unfinished second part leaves the item uncalculated');

    assert.deepEqual(state.afterParts, { pph: 30, weight: 40, stock: false });
    assert.equal(state.allStock, true, 'all parts in stock clears the mold wait');
    assert.equal(state.partsAfterBlockedRemove, 2, 'cannot go below two parts');
    assert.equal(state.partsAfterAdd, 3);
    assert.deepEqual(state.assembly, { name: 'Сборка частей', speed: 60 });

    assert.match(state.html, /Составное изделие/);
    assert.match(state.html, /Итог: 30 изд\/ч · 40 г · 3 детали на изделие · 0 новых молдов/);
    assert.match(state.html, /value="Кнопка"/);

    assert.equal(state.afterDisable.custom_composite, false);
    assert.equal(state.afterDisable.custom_parts.length, 2, 'parts survive switching the mode off');
    assert.equal(state.afterDisable.builtin_assembly_speed, 0, 'part assembly is dropped with the mode');
    assert.equal(state.afterDisable.pieces_per_hour, 30, 'last computed speed stays editable');

    assert.equal(state.afterBlank.custom_composite, false, 'blank mold turns composite off');
    assert.equal(state.afterBlank.builtin_assembly_speed, 0, 'part assembly does not leak into a blank');

    // Реальная карточка: оригинальный renderItemBlock сохранён в main() до стабов.
    const cardHtml = String(await vm.runInContext(`(() => {
        const originalHwPkg = Calculator._renderPerItemHwPkg;
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.items = [Calculator.getEmptyItem(1)];
        const item = Calculator.items[0];
        item.quantity = 500;
        item.custom_composite = true;
        item.custom_parts = [
            { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: false },
            { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: false },
        ];
        Calculator._applyCustomCompositeToItem(item);
        globalThis.__originalRenderItemBlock.call(Calculator, 0);
        Calculator._renderPerItemHwPkg = originalHwPkg;
        return document.getElementById('item-block-0').outerHTML;
    })()`, context));
    assert.match(cardHtml, /Составное изделие \(2\+ части\)/);
    assert.match(cardHtml, /id="item-pph-0" readonly/, 'speed is derived from the parts');
    assert.match(cardHtml, /id="item-weight-0" readonly/, 'weight is derived from the parts');
    assert.doesNotMatch(cardHtml, /item-stock-mold-0/, 'per-part stock replaces the item stock toggle');
    assert.match(cardHtml, /2 части/, 'collapsed summary shows the part count');
    assert.match(cardHtml, /2 новых молда/);
}

async function smokeCustomCompositeToggleSafety(context) {
    const state = clone(await vm.runInContext(`(() => {
        const originals = {
            renderItemBlock: Calculator.renderItemBlock,
            recalculate: Calculator.recalculate,
            scheduleAutosave: Calculator.scheduleAutosave,
            _syncTemplateHardware: Calculator._syncTemplateHardware,
        };
        try {
            Calculator.renderItemBlock = () => {};
            Calculator.recalculate = () => {};
            Calculator.scheduleAutosave = () => {};
            Calculator._syncTemplateHardware = () => {};
            Calculator.items = [Calculator.getEmptyItem(1)];
            const item = Calculator.items[0];
            item.product_name = 'Повторный кастом';
            item.quantity = 500;
            item.pieces_per_hour = 60;
            item.weight_grams = 30;
            item.base_mold_in_stock = true;

            Calculator.toggleCustomComposite(0, true);
            Calculator.toggleCustomComposite(0, false);
            const afterAccidentalTick = {
                pph: item.pieces_per_hour, weight: item.weight_grams, stock: item.base_mold_in_stock,
            };

            Calculator.toggleCustomComposite(0, true);
            Calculator.updateCustomPart(0, 1, 'pieces_per_hour', '120');
            Calculator.updateCustomPart(0, 1, 'weight_grams', '5');
            Calculator.updateCustomPart(0, 1, 'qty', '2');
            Calculator.onCustomAssemblySpeedChange(0, '60');
            Calculator.setMoldType(0, false);
            const afterCustomClick = {
                composite: item.custom_composite,
                assemblyName: item.builtin_assembly_name,
                assemblySpeed: item.builtin_assembly_speed,
            };
            return { afterAccidentalTick, afterCustomClick };
        } finally {
            Object.assign(Calculator, originals);
        }
    })()`, context));

    assert.deepEqual(
        state.afterAccidentalTick,
        { pph: 60, weight: 30, stock: true },
        'ticking the composite box on and off without finishing the parts leaves the item untouched',
    );
    assert.deepEqual(
        state.afterCustomClick,
        { composite: true, assemblyName: 'Сборка частей', assemblySpeed: 60 },
        'clicking the already active custom button keeps part assembly',
    );

    // Старый кастом с template_id: загрузка не должна затирать сборку частей шаблоном.
    const saved = clone(await vm.runInContext(`(() => {
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        const item = Calculator.items[0];
        item.product_name = 'Кастом со старым шаблоном';
        item.quantity = 500;
        item.template_id = 77;
        item.custom_composite = true;
        item.builtin_assembly_name = 'Сборка частей';
        item.builtin_assembly_speed = 60;
        item.custom_parts = [
            { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1 },
            { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2 },
        ];
        return Calculator._collectItemsForSave();
    })()`, context));
    context.__loadOrderData = {
        order: { id: 9102, order_name: 'Composite template', status: 'draft' },
        items: clone(saved),
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);
    vm.runInContext(`
        globalThis.__savedTemplates = App.templates;
        App.templates = [{ id: 77, name: 'Old blank', category: 'blank', builtin_assembly_name: '', builtin_assembly_speed: 0 }];
        Calculator.renderItemBlock = () => {};
        Calculator.renderHardwareRow = () => {};
        Calculator.renderPackagingRow = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.recalculate = () => {};
        Calculator.showOrderHistory = () => {};
        Calculator._ensureWhPickerData = async () => ({});
    `, context);
    try {
        await vm.runInContext('Calculator.loadOrder(9102)', context);
    } finally {
        vm.runInContext('App.templates = globalThis.__savedTemplates;', context);
    }
    const restored = clone(vm.runInContext('Calculator.items[0]', context));
    assert.equal(restored.custom_composite, true);
    assert.equal(restored.builtin_assembly_speed, 60, 'a legacy template link does not overwrite part assembly');
    assert.equal(restored.builtin_assembly_name, 'Сборка частей');
}

// Строка счёта по значку и названию: количество штук или null, если строки нет.
function invoiceRowQty(html, icon, name) {
    const row = String(html || '').split('<tr').find(chunk => chunk.includes(icon) && chunk.includes(name));
    if (!row) return null;
    const match = row.match(/>([\d\s.,]+) шт</);
    return match ? Number(match[1].replace(/\s/g, '').replace(',', '.')) : NaN;
}

// Calculator.loadOrder без отрисовки; заглушки снимаются, даже если загрузка упала.
async function loadCalculatorOrderQuietly(context, orderId) {
    await vm.runInContext(`(async () => {
        const originals = {
            renderItemBlock: Calculator.renderItemBlock,
            renderHardwareRow: Calculator.renderHardwareRow,
            renderPackagingRow: Calculator.renderPackagingRow,
            renderExtraCosts: Calculator.renderExtraCosts,
            _renderPerItemHwPkg: Calculator._renderPerItemHwPkg,
            recalculate: Calculator.recalculate,
            showOrderHistory: Calculator.showOrderHistory,
            _ensureWhPickerData: Calculator._ensureWhPickerData,
        };
        try {
            Calculator.renderItemBlock = () => {};
            Calculator.renderHardwareRow = () => {};
            Calculator.renderPackagingRow = () => {};
            Calculator.renderExtraCosts = () => {};
            Calculator._renderPerItemHwPkg = () => {};
            Calculator.recalculate = () => {};
            Calculator.showOrderHistory = () => {};
            Calculator._ensureWhPickerData = async () => ({});
            await Calculator.loadOrder(${Number(orderId)});
        } finally {
            Object.assign(Calculator, originals);
        }
    })()`, context);
}

// Разметка тиража строки: сохраняется в item_data, переживает загрузку, а счёт и КП
// выставляются только на часть «клиенту».
async function smokeTirageAllocationPersistsAndInvoices(context) {
    const lemonAllocation = { stock: 30, partner: 50, gift: 20, stock_price: 5900, partner_note: 'художница' };
    const collected = clone(await vm.runInContext(`(() => {
        const empty = Calculator.getEmptyItem(1);
        const lemon = Object.assign(Calculator.getEmptyItem(1), {
            product_name: 'Лимон', quantity: 100, sell_price_item: 5900,
            result: { ...getEmptyCostResult(), costTotal: 971.35 },
            tirage_allocation: ${JSON.stringify(lemonAllocation)},
        });
        const plainLine = Object.assign(Calculator.getEmptyItem(2), { product_name: 'Груша', quantity: 50, sell_price_item: 1000 });
        const allClient = Object.assign(Calculator.getEmptyItem(3), {
            product_name: 'Слива', quantity: 10, sell_price_item: 100, tirage_allocation: { client: 10, partner_note: 'никому' },
        });
        const noOwnPrice = Object.assign(Calculator.getEmptyItem(4), {
            product_name: 'Айва', quantity: 20, sell_price_item: 700, tirage_allocation: { stock: 5 },
        });
        Calculator.items = [lemon, plainLine, allClient, noOwnPrice];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        return {
            emptyHasKey: Object.prototype.hasOwnProperty.call(empty, 'tirage_allocation'),
            emptyValue: empty.tirage_allocation,
            saved: Calculator._collectItemsForSave(),
            expected: normalizeTirageAllocation(${JSON.stringify(lemonAllocation)}, 100, 5900).allocation,
        };
    })()`, context));

    assert.equal(collected.emptyHasKey, true, 'loadOrder copies only keys of getEmptyItem, so the allocation must be one of them');
    assert.equal(collected.emptyValue, null);
    const savedProducts = collected.saved.filter(row => row.item_type === 'product');
    assert.deepEqual(savedProducts[0].tirage_allocation, collected.expected, 'the normalized allocation is saved with the row');
    assert.deepEqual(savedProducts[0].tirage_allocation,
        { client: 0, stock: 30, partner: 50, gift: 20, sample: 0, stock_price: 5900, partner_note: 'художница', gift_note: '' });
    assert.equal(savedProducts[1].tirage_allocation, null, 'a line without a split saves null');
    assert.equal(savedProducts[2].tirage_allocation, null, 'everything to the client is no split');
    assert.deepEqual(savedProducts[3].tirage_allocation,
        { client: 15, stock: 5, partner: 0, gift: 0, sample: 0, stock_price: 0, partner_note: '', gift_note: '' },
        'an unset sale price stays 0 = the line price, so it follows later price changes');

    const originalLoadOrder = context.loadOrder;
    context.__tirageLoadData = {
        order: { id: 9201, order_name: 'Лимон', status: 'draft' },
        items: clone(collected.saved),
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__tirageLoadData);
    try {
        await loadCalculatorOrderQuietly(context, 9201);
        const restored = clone(vm.runInContext('Calculator.items.map(item => item.tirage_allocation)', context));
        assert.equal(restored[0].partner_note, 'художница', 'the split survives reopening the order');
        assert.deepEqual(restored[0], collected.expected);
        assert.equal(restored[1], null);
        assert.equal(restored[2], null);
        assert.equal(restored[3].stock_price, 0);

        // Разметка, записанная строкой JSON (старые/чужие записи), тоже читается.
        context.__tirageLoadData.items[0].tirage_allocation = JSON.stringify(lemonAllocation);
        await loadCalculatorOrderQuietly(context, 9201);
        assert.deepEqual(clone(vm.runInContext('Calculator.items[0].tirage_allocation', context)), collected.expected);
        context.__tirageLoadData.items[0].tirage_allocation = '{не json';
        await loadCalculatorOrderQuietly(context, 9201);
        assert.equal(vm.runInContext('Calculator.items[0].tirage_allocation', context), null, 'a broken allocation is no split');
    } finally {
        context.loadOrder = originalLoadOrder;
    }

    // Смета для заказчика: строки изделия, его печати и фурнитуры — только на «клиенту».
    const invoice = clone(await vm.runInContext(`(() => {
        Calculator.resetForm();
        const line = Object.assign(Calculator.getEmptyItem(1), {
            product_name: 'Лимон', quantity: 100, sell_price_item: 5900,
            printings: [{ name: 'УФ', qty: 100, price: 5, sell_price: 20 }],
            result: { ...getEmptyCostResult(), costTotal: 971.35, costPrinting: 5.3, costPrintingDetails: [5.3] },
            tirage_allocation: { stock: 0, partner: 60, partner_note: 'художница' },
        });
        Calculator.items = [line];
        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(0), {
            source: 'custom', name: 'Карабин', qty: 100, price: 5, sell_price: 10, result: { costPerUnit: 5, hoursHardware: 0 },
        })];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [{ name: 'Доставка', amount: 1000 }];
        Calculator.pendants = [];
        const contentEl = document.getElementById('calc-pricing-content');
        Calculator.renderOrderInvoice(App.params, '', contentEl);
        const html40 = contentEl.innerHTML;
        const summary40 = calculateOrderSummary(Calculator.items, Calculator.hardwareItems, [], Calculator.extraCosts, App.params, [], {});
        line.tirage_allocation = { stock: 30, partner: 50, gift: 20, stock_price: 5900 };
        Calculator.renderOrderInvoice(App.params, '', contentEl);
        const html0 = contentEl.innerHTML;
        return { html40, html0, revenue40: summary40.totalRevenue, revenue40Text: formatRub(summary40.totalRevenue) };
    })()`, context));
    assert.equal(invoiceRowQty(invoice.html40, '&#9670;', 'Лимон'), 40, 'the product row bills only the client part');
    assert.equal(invoiceRowQty(invoice.html40, '&#9998;', 'УФ'), 40, 'printing follows the client part');
    assert.equal(invoiceRowQty(invoice.html40, '&#9881;', 'Карабин'), 40, 'line hardware follows the client part');
    assert.equal(invoice.revenue40, 40 * 5900 + 40 * 20 + 40 * 10 + 1000);
    assert.ok(invoice.html40.includes(invoice.revenue40Text), 'the customer total equals the calculator revenue');
    assert.equal(invoiceRowQty(invoice.html0, '&#9670;', 'Лимон'), null, 'client 0: no product row');
    assert.equal(invoiceRowQty(invoice.html0, '&#9998;', 'УФ'), null, 'client 0: no printing row');
    assert.equal(invoiceRowQty(invoice.html0, '&#9881;', 'Карабин'), null, 'client 0: no hardware row of that line');
    assert.equal(invoiceRowQty(invoice.html0, '&#10010;', 'Доставка'), 1, 'other rows stay');

    // КП — тоже только «клиенту».
    const kpCalls = clone(await vm.runInContext(`(async () => {
        const originalGenerate = KPGenerator.generate;
        const calls = [];
        KPGenerator.generate = async (...args) => { calls.push(JSON.parse(JSON.stringify(args[2]))); };
        try {
            document.getElementById('calc-order-name').value = 'КП с разметкой';
            const line = Calculator.items[0];
            line.tirage_allocation = { stock: 0, partner: 60 };
            await Calculator.generateKP();
            line.tirage_allocation = { stock: 30, partner: 50, gift: 20, stock_price: 5900 };
            await Calculator.generateKP();
            return calls;
        } finally {
            KPGenerator.generate = originalGenerate;
            document.getElementById('calc-order-name').value = '';
        }
    })()`, context));
    assert.equal(kpCalls.length, 2);
    assert.deepEqual(kpCalls[0].filter(item => item.type === 'product').map(item => item.qty), [40]);
    assert.deepEqual(kpCalls[0].filter(item => item.type === 'printing').map(item => item.qty), [40]);
    assert.equal(kpCalls[1].some(item => item.type === 'product' || item.type === 'printing'), false, 'client 0: nothing to bill for the line');
    assert.equal(kpCalls[1].some(item => item.type === 'extra'), true);

    // В счёте — целые штуки: 120 открыток на строку из 100 штук, клиенту 33 → 40, а не 39.6.
    const postcards = String(await vm.runInContext(`(() => {
        Calculator.resetForm();
        const line = Object.assign(Calculator.getEmptyItem(1), {
            product_name: 'Лимон', quantity: 100, sell_price_item: 5900,
            result: { ...getEmptyCostResult(), costTotal: 971.35 },
            tirage_allocation: { partner: 67 },
        });
        Calculator.items = [line];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [Object.assign(Calculator.getEmptyPackaging(0), {
            source: 'custom', name: 'Открытка', qty: 120, price: 15, sell_price: 30, result: { costPerUnit: 15, hoursPackaging: 0 },
        })];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        const contentEl = document.getElementById('calc-pricing-content');
        Calculator.renderOrderInvoice(App.params, '', contentEl);
        return contentEl.innerHTML;
    })()`, context));
    assert.equal(invoiceRowQty(postcards, '&#9670;', 'Лимон'), 33);
    assert.equal(invoiceRowQty(postcards, '&#9744;', 'Открытка'), 40, 'the client share of an attachment is billed in whole pieces');

    // Изменение тиража перенормализует разметку от того, что ввёл менеджер, и пишет под строкой, что урезано.
    const qty = clone(await vm.runInContext(`(() => {
        const originals = { recalculate: Calculator.recalculate, scheduleAutosave: Calculator.scheduleAutosave };
        try {
            Calculator.recalculate = () => {};
            Calculator.scheduleAutosave = () => {};
            const line = Object.assign(Calculator.getEmptyItem(1), {
                product_name: 'Лимон', quantity: 100, sell_price_item: 5900,
                tirage_allocation: ${JSON.stringify(lemonAllocation)},
            });
            Calculator.items = [line];
            Calculator.hardwareItems = [];
            Calculator.packagingItems = [];
            const snap = () => JSON.parse(JSON.stringify(line.tirage_allocation));
            const noticeEl = document.getElementById('item-tirage-reduced-0');
            Calculator.onNumChange(0, 'quantity', 60);
            const at60 = snap();
            const notice60 = noticeEl.textContent;
            const block60 = Calculator.renderTirageBlock(0);
            Calculator.onNumChange(0, 'quantity', 100);
            const back100 = snap();
            const notice100 = noticeEl.textContent;
            // «60» набирают поверх «100» по одной цифре: на миг тираж становится 6
            Calculator.onNumChange(0, 'quantity', '6');
            Calculator.onNumChange(0, 'quantity', '60');
            const typed60 = snap();
            Calculator.onNumChange(0, 'quantity', 120);
            const at120 = snap();
            return { at60, notice60, block60, back100, notice100, typed60, at120 };
        } finally {
            Object.assign(Calculator, originals);
        }
    })()`, context));
    const partsSum = allocation => allocation.client + allocation.stock + allocation.partner + allocation.gift + allocation.sample;
    assert.equal(partsSum(qty.at60), 60, 'the parts always add up to the tirage');
    assert.deepEqual([qty.at60.client, qty.at60.stock, qty.at60.partner, qty.at60.gift, qty.at60.sample], [0, 0, 50, 10, 0]);
    assert.equal(qty.at60.partner_note, 'художница');
    assert.equal(qty.notice60, 'Тираж уменьшился: на продажу 30 → 0, в подарок 20 → 10');
    assert.match(qty.block60, /Тираж уменьшился: на продажу 30 → 0, в подарок 20 → 10/);
    assert.deepEqual([qty.back100.client, qty.back100.stock, qty.back100.partner, qty.back100.gift], [0, 30, 50, 20],
        'going back to the old tirage restores what the manager entered');
    assert.equal(qty.notice100, '');
    assert.deepEqual(qty.typed60, qty.at60, 'typing a new tirage digit by digit does not eat the split');
    assert.deepEqual([qty.at120.client, qty.at120.stock, qty.at120.partner, qty.at120.gift], [20, 30, 50, 20], 'extra pieces go to the client');
}

// Блок «Тираж» под строкой изделия: свёрнутый вид, поля, ограничения ввода и когда он скрыт.
async function smokeTirageBlockUi(context) {
    const ui = clone(await vm.runInContext(`(() => {
        const originals = {
            recalculate: Calculator.recalculate,
            scheduleAutosave: Calculator.scheduleAutosave,
            _renderPerItemHwPkg: Calculator._renderPerItemHwPkg,
        };
        try {
            Calculator.recalculate = () => {};
            Calculator.scheduleAutosave = () => {};
            Calculator._renderPerItemHwPkg = () => {};
            Calculator.resetForm();
            const line = Object.assign(Calculator.getEmptyItem(1), { product_name: 'Лимон', quantity: 100, sell_price_item: 5900 });
            Calculator.items = [line];
            Calculator.hardwareItems = [];
            Calculator.packagingItems = [];
            const plainCollapsed = Calculator.renderTirageBlock(0);
            Calculator.toggleTirageBlock(0);
            const plainOpen = Calculator.renderTirageBlock(0);

            Calculator.onTirageChange(0, 'stock', '30');
            Calculator.onTirageChange(0, 'partner', '50');
            Calculator.onTirageChange(0, 'gift', '999');
            const giftInput = document.getElementById('item-tirage-gift-0').value;
            Calculator.onTirageChange(0, 'stock', '45');
            const stockInput = document.getElementById('item-tirage-stock-0').value;
            Calculator.onTirageTextChange(0, 'partner_note', 'художница');
            const afterEdits = JSON.parse(JSON.stringify(line.tirage_allocation));
            const clientShown = document.getElementById('item-tirage-client-0').textContent;
            const summaryShown = document.getElementById('item-tirage-summary-0').textContent;
            Calculator.toggleTirageBlock(0);
            const splitCollapsed = Calculator.renderTirageBlock(0);

            Calculator.onTirageTextChange(0, 'stock_price', '6500');
            const ownPrice = line.tirage_allocation.stock_price;
            const ownPriceSummary = document.getElementById('item-tirage-summary-0').textContent;
            Calculator.onTirageTextChange(0, 'stock_price', '');
            const clearedPrice = line.tirage_allocation.stock_price;

            line.printings = [{ name: 'УФ', qty: 100, price: 5, sell_price: 20 }];
            Calculator.toggleTirageBlock(0);
            const printedOpen = Calculator.renderTirageBlock(0);

            globalThis.__originalRenderItemBlock.call(Calculator, 0);
            const card = document.getElementById('item-block-0').outerHTML;

            const hiddenFor = {};
            [['rework', ''], ['stock_sample', ''], ['leftover_assembly', ''], ['commercial', 'B2C'], ['commercial', ' b2c ']]
                .forEach(([purpose, client]) => {
                    document.getElementById('calc-production-purpose').value = purpose;
                    document.getElementById('calc-client-name').value = client;
                    hiddenFor[purpose + '|' + client] = Calculator.renderTirageBlock(0);
                });
            document.getElementById('calc-production-purpose').value = 'commercial';
            document.getElementById('calc-client-name').value = 'ООО Лимон';
            const shownForClient = Calculator.renderTirageBlock(0);
            return {
                plainCollapsed, plainOpen, giftInput, stockInput, afterEdits, clientShown, summaryShown, splitCollapsed,
                ownPrice, ownPriceSummary, clearedPrice, printedOpen, card, hiddenFor, shownForClient,
            };
        } finally {
            Object.assign(Calculator, originals);
            Calculator.resetForm();
        }
    })()`, context));

    assert.match(ui.plainCollapsed, /Тираж:/);
    assert.match(ui.plainCollapsed, /весь — клиенту/);
    assert.match(ui.plainCollapsed, /▸ разметить/);
    assert.match(ui.plainCollapsed, /id="item-tirage-body-0"[^>]*display:none/, 'collapsed by default');
    assert.doesNotMatch(ui.plainOpen, /id="item-tirage-body-0"[^>]*display:none/, 'opens right under the line');
    ['stock', 'partner', 'gift', 'sample'].forEach(part => {
        assert.match(ui.plainOpen, new RegExp(`<input[^>]*id="item-tirage-${part}-0"`), `${part} has a quantity field`);
    });
    ['stock-price', 'partner-note', 'gift-note'].forEach(field => {
        assert.match(ui.plainOpen, new RegExp(`<input[^>]*id="item-tirage-${field}-0"`), `${field} field`);
    });
    assert.doesNotMatch(ui.plainOpen, /<input[^>]*id="item-tirage-client-0"/, 'the client part is only shown, never typed');
    assert.match(ui.plainOpen, /id="item-tirage-client-0"[^>]*>100 шт</, 'the client gets the rest');
    assert.match(ui.plainOpen, /id="item-tirage-stock-price-0"[^>]*placeholder="5900"/, 'default sale price = the line price');

    assert.equal(ui.giftInput, '20', 'a part cannot take more than what is left');
    assert.equal(ui.stockInput, '30', 'raising a part over the rest stops at the rest');
    // With its first split the line got its stable key (the ready goods stock finds the line's
    // position by it); the rest is the split as typed.
    const { line_key: lineKeyAfterEdits, ...splitAfterEdits } = ui.afterEdits;
    assert.match(String(lineKeyAfterEdits || ''), /^[0-9a-z]+$/, 'the split line has a key');
    assert.deepEqual(splitAfterEdits,
        { client: 0, stock: 30, partner: 50, gift: 20, sample: 0, stock_price: 0, partner_note: 'художница', gift_note: '' });
    assert.equal(ui.clientShown, '0 шт');
    assert.match(ui.summaryShown, /^клиенту 0 · на продажу 30 по 5\s900 ₽ · партнёру 50 · в подарок 20$/);
    assert.match(ui.splitCollapsed, /клиенту 0 · на продажу 30 по 5\s900 ₽ · партнёру 50 · в подарок 20/);
    assert.match(ui.splitCollapsed, /▸ изменить/);
    assert.equal(ui.ownPrice, 6500);
    assert.match(ui.ownPriceSummary, /на продажу 30 по 6\s500 ₽/);
    assert.equal(ui.clearedPrice, 0, 'an empty sale price falls back to the line price');
    assert.match(ui.printedOpen, /id="item-tirage-stock-price-0"[^>]*placeholder="5920"/, 'default sale price includes printing');
    assert.match(ui.printedOpen, /value="художница"/);

    const qtyAt = ui.card.indexOf("Calculator.onNumChange(0, 'quantity'");
    const blockAt = ui.card.indexOf('id="item-tirage-0"');
    assert.ok(qtyAt > 0 && blockAt > qtyAt, 'the block sits under the tirage field');
    assert.ok(blockAt < ui.card.indexOf('item-advanced-details'), 'and above the advanced options');

    Object.entries(ui.hiddenFor).forEach(([key, html]) => {
        assert.match(html, /id="item-tirage-0"[^>]*display:none/, `hidden for ${key}`);
    });
    assert.doesNotMatch(ui.shownForClient, /id="item-tirage-0"[^>]*display:none/);
}

// Сводка калькулятора и «Финдиректор» при разметке: честная выручка, «ожидаем, если продадим»,
// «Отдаём бесплатно» и «план» у маржи.
async function smokeTirageCalculatorSummary(context) {
    const state = clone(await vm.runInContext(`(() => {
        // В заглушке DOM у элементов нет родителя, а пересчёт прячет строку подитога через него.
        const subtotalEl = document.getElementById('c-0-subtotal');
        subtotalEl.parentElement = { style: {} };
        try {
            Calculator.resetForm();
            const line = Object.assign(Calculator.getEmptyItem(1), {
                product_name: 'Лимон', quantity: 100, pieces_per_hour: 100, weight_grams: 10, sell_price_item: 5900,
                is_blank_mold: false, base_mold_in_stock: true,
                tirage_allocation: { stock: 30, partner: 50, gift: 20, stock_price: 5900 },
            });
            Calculator.items = [line];
            Calculator.hardwareItems = [];
            Calculator.packagingItems = [];
            Calculator.extraCosts = [];
            Calculator.pendants = [];
            const read = id => ({ text: document.getElementById(id).textContent, display: document.getElementById(id).style.display });
            Calculator._doRecalculate(App.params);
            const summary = Calculator.getPurposeAwareOrderSummary(App.params);
            const split = {
                totalRevenue: summary.totalRevenue,
                revenueText: formatRub(summary.totalRevenue),
                freeText: 'Отдаём бесплатно: 70 шт. на ' + formatRub(Math.round(summary.freeCost)) + ' себестоимости',
                sumRevenue: read('sum-revenue').text,
                finRevenue: read('fin-revenue').text,
                revenueNote: read('sum-revenue-note'),
                freeNote: read('sum-free-note'),
                marginLabel: read('sum-margin-label').text,
            };
            line.tirage_allocation = null;
            Calculator._doRecalculate(App.params);
            const plain = {
                revenueNote: read('sum-revenue-note'),
                freeNote: read('sum-free-note'),
                marginLabel: read('sum-margin-label').text,
            };
            return { split, plain };
        } finally {
            delete subtotalEl.parentElement;
            Calculator.resetForm();
        }
    })()`, context));

    assert.equal(state.split.totalRevenue, 177000);
    assert.equal(state.split.sumRevenue, state.split.revenueText);
    assert.equal(state.split.finRevenue, state.split.revenueText, 'the fin director block shows the same honest revenue');
    assert.deepEqual(state.split.revenueNote, { text: 'ожидаем, если продадим 30 шт.', display: '' });
    assert.deepEqual(state.split.freeNote, { text: state.split.freeText, display: '' });
    assert.equal(state.split.marginLabel, 'Маржа · план');
    assert.equal(state.plain.revenueNote.display, 'none');
    assert.equal(state.plain.freeNote.display, 'none');
    assert.equal(state.plain.marginLabel, 'Маржа · план');
}

// B2C-заказ (клиент «B2C», как у Orders._shouldSyncOrderToReadyGoods) разметку не использует:
// весь тираж уходит на склад готовой продукции. Сохранённая разметка не меняет деньги, счёт и КП,
// при сохранении стирается, а под строкой вместо блока — короткая пометка.
async function smokeTirageB2CIgnoresSplit(context) {
    const rows = clone(await vm.runInContext(`(() => {
        Calculator.resetForm();
        document.getElementById('calc-client-name').value = 'ООО Лимон';
        const line = Object.assign(Calculator.getEmptyItem(1), {
            product_name: 'Лимон', quantity: 100, pieces_per_hour: 100, weight_grams: 10, sell_price_item: 5900,
            tirage_allocation: { stock: 30, partner: 50, gift: 20, stock_price: 5900 },
        });
        Calculator.items = [line];
        Calculator.hardwareItems = [Object.assign(Calculator.getEmptyHardware(0), {
            source: 'custom', name: 'Карабин', qty: 100, price: 5, sell_price: 10,
        })];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        const saved = Calculator._collectItemsForSave();
        Calculator.resetForm();
        return saved;
    })()`, context));
    assert.ok(rows.find(row => row.item_type === 'product').tirage_allocation, 'fixture: the split is saved for a regular client');

    const originalLoadOrder = context.loadOrder;
    context.loadOrder = async () => ({
        order: { id: 9301, order_name: 'B2C партия', client_name: 'b2c', status: 'draft' },
        items: clone(rows),
        repaired_duplicates: false,
    });
    let state;
    try {
        await loadCalculatorOrderQuietly(context, 9301);
        state = clone(await vm.runInContext(`(async () => {
            const subtotalEl = document.getElementById('c-0-subtotal');
            subtotalEl.parentElement = { style: {} };
            const originals = {
                _renderPerItemHwPkg: Calculator._renderPerItemHwPkg,
                recalculate: Calculator.recalculate,
                scheduleAutosave: Calculator.scheduleAutosave,
            };
            const originalGenerate = KPGenerator.generate;
            try {
                Calculator._renderPerItemHwPkg = () => {};
                Calculator.recalculate = () => {};
                Calculator.scheduleAutosave = () => {};
                const line = Calculator.items[0];
                const keptInForm = JSON.parse(JSON.stringify(line.tirage_allocation));
                Calculator._doRecalculate(App.params);
                const b2cSummary = Calculator.getPurposeAwareOrderSummary(App.params);
                const read = id => ({ text: document.getElementById(id).textContent, display: document.getElementById(id).style.display });
                const screen = {
                    sumRevenue: read('sum-revenue').text,
                    finRevenue: read('fin-revenue').text,
                    revenueNote: read('sum-revenue-note').display,
                    freeNote: read('sum-free-note').display,
                    b2cNote: read('item-tirage-b2c-0').display,
                    block: read('item-tirage-0').display,
                };
                const saved = Calculator._collectItemsForSave();
                const contentEl = document.getElementById('calc-pricing-content');
                Calculator.renderOrderInvoice(App.params, '', contentEl);
                const invoiceHtml = contentEl.innerHTML;
                let kpItems = null;
                KPGenerator.generate = async (...args) => { kpItems = JSON.parse(JSON.stringify(args[2])); };
                document.getElementById('calc-order-name').value = 'B2C партия';
                await Calculator.generateKP();
                globalThis.__originalRenderItemBlock.call(Calculator, 0);
                const card = document.getElementById('item-block-0').outerHTML;

                // То же заказ без разметки — эталон
                line.tirage_allocation = null;
                const plainSummary = Calculator.getPurposeAwareOrderSummary(App.params);
                globalThis.__originalRenderItemBlock.call(Calculator, 0);
                const plainCard = document.getElementById('item-block-0').outerHTML;
                line.tirage_allocation = keptInForm;

                // Клиента исправили — разметка снова работает и снова сохраняется
                document.getElementById('calc-client-name').value = 'ООО Лимон';
                const regularSummary = Calculator.getPurposeAwareOrderSummary(App.params);
                const regularSaved = Calculator._collectItemsForSave();
                Calculator._refreshTirageBlocks();
                const regularScreen = { b2cNote: read('item-tirage-b2c-0').display, block: read('item-tirage-0').display };
                return {
                    keptInForm, b2cSummary, plainSummary, screen, saved, invoiceHtml, kpItems, card, plainCard,
                    regularStockRevenue: regularSummary.stockRevenue, regularSaved, regularScreen,
                    revenueText: formatRub(plainSummary.totalRevenue),
                };
            } finally {
                delete subtotalEl.parentElement;
                KPGenerator.generate = originalGenerate;
                Object.assign(Calculator, originals);
                Calculator.resetForm();
            }
        })()`, context));
    } finally {
        context.loadOrder = originalLoadOrder;
    }

    const b2cNoteText = 'Для B2C разметка не используется — весь тираж уходит на склад готовой продукции';
    assert.equal(state.keptInForm.stock, 30, 'the loaded split stays in the form (the note needs it)');
    assert.deepEqual(state.b2cSummary, state.plainSummary, 'a B2C order with a saved split gives the unsplit summary');
    assert.equal(state.b2cSummary.totalRevenue, 100 * 5900 + 100 * 10);
    assert.equal(state.screen.sumRevenue, state.revenueText);
    assert.equal(state.screen.finRevenue, state.revenueText, 'the fin director block ignores the split too');
    assert.deepEqual([state.screen.revenueNote, state.screen.freeNote], ['none', 'none']);
    assert.deepEqual([state.screen.block, state.screen.b2cNote], ['none', ''], 'the note replaces the block');
    assert.equal(state.saved.find(row => row.item_type === 'product').tirage_allocation, null, 'B2C saves no split');
    assert.equal(invoiceRowQty(state.invoiceHtml, '&#9670;', 'Лимон'), 100, 'B2C bills the whole tirage');
    assert.equal(invoiceRowQty(state.invoiceHtml, '&#9881;', 'Карабин'), 100);
    assert.deepEqual(state.kpItems.filter(item => item.type === 'product').map(item => item.qty), [100]);
    assert.ok(state.card.includes(b2cNoteText), 'the short line is under the product line');
    assert.doesNotMatch(state.card, /id="item-tirage-b2c-0"[^>]*display:none/, 'and it is visible when the card is drawn');
    assert.match(state.card, /id="item-tirage-0"[^>]*display:none/);
    assert.match(state.plainCard, /id="item-tirage-b2c-0"[^>]*display:none/, 'no note when there is nothing to ignore');
    assert.equal(state.regularStockRevenue, 177000, 'with a regular client the split counts again');
    assert.equal(state.regularSaved.find(row => row.item_type === 'product').tirage_allocation.stock, 30);
    assert.deepEqual([state.regularScreen.block, state.regularScreen.b2cNote], ['', 'none']);
}

// Сохранение пропускает пустые строки изделий — индексы родителя у фурнитуры и упаковки должны
// указывать на сохранённые позиции, иначе доля «клиенту» уходит не той строке.
async function smokeSaveRemapsParentIndexesPastEmptyRows(context) {
    const saved = clone(await vm.runInContext(`(() => {
        const pear = Object.assign(Calculator.getEmptyItem(1), { product_name: 'Груша', quantity: 50, sell_price_item: 1000, pieces_per_hour: 100, weight_grams: 10 });
        const empty = Calculator.getEmptyItem(2);
        const lemon = Object.assign(Calculator.getEmptyItem(3), {
            product_name: 'Лимон', quantity: 100, sell_price_item: 5900, pieces_per_hour: 100, weight_grams: 10,
            tirage_allocation: { stock: 0, partner: 60 },
        });
        Calculator.items = [pear, empty, lemon];
        const hw = (parent, name, sell) => Object.assign(Calculator.getEmptyHardware(parent), {
            source: 'custom', name, qty: 100, price: 5, sell_price: sell, result: { costPerUnit: 5, hoursHardware: 0 },
        });
        Calculator.hardwareItems = [hw(2, 'Карабин лимона', 10), hw(0, 'Карабин груши', 10), hw(null, 'Общий карабин', 10), hw(1, 'Карабин пустой строки', 30)];
        Calculator.packagingItems = [Object.assign(Calculator.getEmptyPackaging(2), {
            source: 'custom', name: 'Коробка лимона', qty: 100, price: 3, sell_price: 0, result: { costPerUnit: 3, hoursPackaging: 0 },
        })];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
        return Calculator._collectItemsForSave();
    })()`, context));

    assert.deepEqual(saved.filter(row => row.item_type === 'product').map(row => row.product_name), ['Груша', 'Лимон']);
    const hardwareParents = Object.fromEntries(saved
        .filter(row => row.item_type === 'hardware')
        .map(row => [row.product_name, row.hardware_parent_item_index]));
    assert.deepEqual(hardwareParents, {
        'Карабин лимона': 1,
        'Карабин груши': 0,
        'Общий карабин': null,
        'Карабин пустой строки': null,
    });
    assert.equal(saved.find(row => row.item_type === 'packaging').packaging_parent_item_index, 1);

    // По сохранённым строкам (так считают доска и карточка) фурнитура лимона продаётся на его
    // 40 клиентских штук, а фурнитура несохранённой пустой строки становится общей.
    const snapshot = clone(vm.runInContext(`getOrderLiveCalculatorSnapshot({}, ${JSON.stringify(saved)}, App.params, [])`, context));
    assert.equal(snapshot.revenue, 50 * 1000 + 40 * 5900 + 40 * 10 + 100 * 10 + 100 * 10 + 100 * 30);
}

// ==========================================
// Тираж «на продажу» → склад готовой продукции
// ==========================================

const READY_GOODS_STUB_NAMES = ['getReadyGoodsSourceStatus', 'loadReadyGoods', 'saveReadyGoods', 'loadReadyGoodsHistory', 'saveReadyGoodsHistory', 'loadSalesRecords', 'saveSalesRecords'];

// Склад готовой продукции в памяти. Каждый список пишется так, как его пишет общая база:
// запись — изменения относительно последнего чтения этого списка вкладкой (новые и изменённые
// строки по id, удалённые — только те, что она видела и убрала), поэтому лишняя позиция заказа
// видна как лишняя строка, а запись с чужим id заменяет чужую строку. staleNext[list] — следующее
// чтение отдаёт старую копию (вкладка, прочитавшая склад до чужой записи). server — та же база
// для ещё одной вкладки. Возвращает базу; заглушки — в контексте вкладки.
function useReadyGoodsBase(context, initial = {}, server = null) {
    const base = server || {
        lists: { stock: clone(initial.stock || []), history: clone(initial.history || []), sales: clone(initial.sales || []) },
        staleNext: {},
        loads: { stock: 0, history: 0, sales: 0 },
        saves: { stock: 0, history: 0, sales: 0 },
        // shared = false — общей базы нет совсем; unavailable — нет для этих списков (и чтение
        // это видит); failSaves — читается, но запись в эти списки не проходит.
        shared: true,
        unavailable: new Set(),
        failSaves: new Set(),
    };
    // Что эта вкладка последний раз прочитала или записала.
    const seenByTab = {};
    const isShared = list => base.shared && !base.unavailable.has(list);
    const idOf = row => (row && row.id !== null && row.id !== undefined && row.id !== '' ? String(row.id) : null);
    const snapshot = rows => new Map(rows.filter(row => idOf(row)).map(row => [idOf(row), JSON.stringify(row)]));
    const load = list => async () => {
        base.loads[list] += 1;
        const rows = clone(base.staleNext[list] || base.lists[list]);
        delete base.staleNext[list];
        seenByTab[list] = snapshot(rows);
        return rows;
    };
    const save = list => async (rows) => {
        if (!isShared(list) || base.failSaves.has(list)) throw new Error('READY_GOODS_SHARED_UNAVAILABLE');
        const seen = seenByTab[list] || new Map();
        const present = new Set(rows.map(idOf).filter(Boolean));
        const next = base.lists[list].filter(row => !(idOf(row) && seen.has(idOf(row)) && !present.has(idOf(row))));
        rows.forEach(row => {
            const id = idOf(row);
            if (id && seen.get(id) === JSON.stringify(row)) return;
            const index = id ? next.findIndex(other => idOf(other) === id) : -1;
            if (index >= 0) next[index] = clone(row);
            else next.push(clone(row));
        });
        base.lists[list] = next;
        seenByTab[list] = snapshot(rows);
        base.saves[list] += 1;
    };
    context.getReadyGoodsSourceStatus = () => {
        const source = list => ({ source: isShared(list) ? 'shared-settings' : 'shared-unavailable' });
        return { ready_goods: source('stock'), ready_goods_history: source('history'), sales_records: source('sales') };
    };
    context.loadReadyGoods = load('stock');
    context.saveReadyGoods = save('stock');
    context.loadReadyGoodsHistory = load('history');
    context.saveReadyGoodsHistory = save('history');
    context.loadSalesRecords = load('sales');
    context.saveSalesRecords = save('sales');
    return base;
}

// «Лимон» так, как его возвращает loadOrder: строка изделия с разметкой в item_data.
const LEMON_TIRAGE = { client: 0, stock: 30, partner: 50, gift: 20, sample: 0, stock_price: 5900, partner_note: 'художница', gift_note: '' };
function lemonOrderData(orderId, { order = {}, tirage = {} } = {}) {
    return {
        order: { id: orderId, order_name: 'Лимон', client_name: 'Художница Маша', status: 'completed', production_purpose: 'commercial', ...order },
        items: [{
            id: orderId * 1000 + 1, order_id: orderId, item_number: 1, item_type: 'product', product_name: 'Лимон',
            quantity: 100, cost_total: 971.35, sell_price_item: 5900, sell_price_printing: 0, printings: '[]',
            tirage_allocation: { ...LEMON_TIRAGE, ...tirage },
        }],
    };
}

// Позиция склада без id и даты: остальное — ровно то, что обещает перенос.
function tiragePositionView(position) {
    const { id, added_at, ...rest } = position;
    return rest;
}

// Штуки «на продажу» встают на склад готовой продукции при «Готово» по реальной себестоимости,
// не задваиваются, не уходят с проданным при возврате заказа, а себестоимость непроданных
// пересчитывается без записей продаж.
async function smokeTirageReadyGoodsTransfer(context) {
    const ROLLBACK_BLOCKED = 'Уже продано 5 шт. со склада — заказ нельзя вернуть из «Готово»';
    const TRANSFER_FAILED = 'Статус сохранён, но склад готовой продукции не обновился — нет связи с общей базой. Обновите страницу и проверьте склад готовой продукции.';
    const ROLLBACK_FAILED = 'Статус сохранён, но позиции заказа остались на складе готовой продукции — нет связи с общей базой. Обновите страницу и проверьте склад готовой продукции.';
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder'].map(name => [name, context[name]]));
    const base = useReadyGoodsBase(context);
    const orders = {};
    const addOrder = data => { orders[data.order.id] = data; };
    context.loadOrder = async (orderId) => clone(orders[Number(orderId)] || null);
    context.__realCosts = {};
    context.__realCostCalls = [];
    context.Factual = {
        async computeOrderRealCost(orderId, options) {
            context.__realCostCalls.push({ orderId: Number(orderId), options: clone(options === undefined ? null : options) });
            const value = context.__realCosts[Number(orderId)];
            return value === undefined || value === null ? null : clone(value);
        },
    };
    context.__toasts = [];
    vm.runInContext(`
        globalThis.__tirageOriginals = {
            toast: App.toast,
            renderStats: Warehouse.renderStats,
            renderReadyGoodsView: Warehouse.renderReadyGoodsView,
        };
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.renderStats = () => {};
        Warehouse.renderReadyGoodsView = () => {};
    `, context);
    const move = (orderId, orderName = 'Лимон') => vm.runInContext(`Warehouse.moveOrderToReadyGoods(${orderId}, ${JSON.stringify(orderName)})`, context);
    const positionsOf = orderId => base.lists.stock.filter(row => Number(row.order_id) === orderId);
    const counters = () => clone({ loads: base.loads, saves: base.saves, realCostCalls: context.__realCostCalls.length });

    try {
        // 1. «Готово»: 30 «на продажу» — одна позиция, себестоимость штуки = реальные затраты
        // заказа на его платные штуки (121 000 / 30), цена продажи из разметки.
        context.__realCosts[9301] = { realTotal: 121000 };
        addOrder(lemonOrderData(9301));
        assert.equal(await move(9301), 1);
        assert.equal(positionsOf(9301).length, 1);
        const lemon = positionsOf(9301)[0];
        assert.deepEqual(Object.keys(lemon).sort(), [
            'added_at', 'added_by', 'cost_per_unit', 'id', 'location_type', 'order_id', 'order_item_number',
            'order_line_key', 'order_name', 'product_name', 'qty', 'sale_price', 'source',
        ]);
        assert.deepEqual(tiragePositionView(lemon), {
            product_name: 'Лимон', order_name: 'Лимон', order_id: 9301, order_item_number: 1, order_line_key: null, source: 'tirage',
            location_type: 'our', qty: 30, cost_per_unit: 4033.33, sale_price: 5900, added_by: 'Smoke',
        });
        assert.match(lemon.added_at, /^\d{4}-\d\d-\d\dT/);
        assert.deepEqual(clone(context.__realCostCalls), [{ orderId: 9301, options: { fresh: true } }], 'the frozen cost reads a fresh timesheet');
        const transferEntries = base.lists.history.filter(entry => entry.type === 'from_order');
        assert.equal(transferEntries.length, 1);
        assert.equal(transferEntries[0].qty, 30);
        assert.equal(transferEntries[0].cost_per_unit, 4033.33);
        assert.equal(transferEntries[0].product_name, 'Лимон');

        // 2. Повторный перевод (доска, потом план производства) позицию не задваивает.
        assert.equal(await move(9301), 0);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(9301, { id: 9301, order_name: 'Лимон' }, 'delivery', 'completed')`, context);
        assert.equal(positionsOf(9301).length, 1);
        assert.equal(positionsOf(9301)[0].qty, 30);
        assert.equal(base.lists.history.filter(entry => entry.type === 'from_order').length, 1);

        // 3. Вторая вкладка прочитала склад до первой записи: её перенос пишет ту же позицию.
        context.__realCosts[9302] = { realTotal: 121000 };
        addOrder(lemonOrderData(9302));
        const stockBeforeTransfer = clone(base.lists.stock);
        assert.equal(await move(9302), 1);
        base.staleNext.stock = stockBeforeTransfer;
        await move(9302);
        assert.equal(positionsOf(9302).length, 1, 'two tabs moving one order to «Готово» leave one position');

        // 4. Пока ничего не продано, заказ можно вернуть из «Готово».
        context.__toasts = [];
        const allowed = clone(await vm.runInContext(`Orders._ensureStatusTransitionAllowed(9301, 'production_casting')`, context));
        assert.equal(allowed.ok, true);
        assert.deepEqual(clone(context.__toasts), []);

        // 5. Продажа 5 штук — так же, как «Списать продажу» на складе.
        const forSale = base.lists.stock.filter(row => (parseFloat(row.qty) || 0) > 0);
        context.document.getElementById('rg-wo-product').value = String(forSale.findIndex(row => Number(row.order_id) === 9301));
        context.document.getElementById('rg-wo-qty').value = '5';
        context.document.getElementById('rg-wo-channel').value = 'website';
        context.document.getElementById('rg-wo-revenue').value = '29500';
        context.document.getElementById('rg-wo-payout').value = '29000';
        context.document.getElementById('rg-wo-notes').value = 'сайт';
        await vm.runInContext('Warehouse.doWriteOff()', context);
        assert.equal(positionsOf(9301)[0].qty, 25);
        assert.equal(base.lists.sales.length, 1);
        assert.equal(base.lists.sales[0].ready_goods_id, lemon.id);
        const saleBefore = clone(base.lists.sales[0]);
        assert.equal(await vm.runInContext('Warehouse.getOrderReadyGoodsSoldQty(9301)', context), 5);
        assert.equal(await vm.runInContext('Warehouse.getOrderReadyGoodsSoldQty(9302)', context), 0);

        // 6. С проданного вернуть заказ из «Готово» нельзя; менеджер видит почему.
        context.__toasts = [];
        const blocked = clone(await vm.runInContext(`Orders._ensureStatusTransitionAllowed(9301, 'production_casting')`, context));
        assert.equal(blocked.ok, false);
        assert.equal(blocked.message, ROLLBACK_BLOCKED);
        assert.deepEqual(clone(context.__toasts), [ROLLBACK_BLOCKED]);
        const quietBlocked = clone(await vm.runInContext(`Orders._ensureStatusTransitionAllowed(9301, 'cancelled', { toast: false })`, context));
        assert.equal(quietBlocked.ok, false, 'any status outside «Готово» is a return');
        assert.deepEqual(clone(context.__toasts), [ROLLBACK_BLOCKED]);
        // Смена статуса не из «Готово» склад не читает.
        const beforeOther = counters();
        const other = clone(await vm.runInContext(`Orders._ensureStatusTransitionAllowed(9301, 'production_hardware', { oldStatus: 'production_casting' })`, context));
        assert.equal(other.ok, true);
        assert.deepEqual(counters(), beforeOther);

        // 7. И напрямую позиция с продажами не снимается: проданное остаётся при ней.
        assert.equal(await vm.runInContext(`Warehouse.removeOrderFromReadyGoods(9301, 'Лимон', 'production_casting')`, context), 0);
        assert.equal(positionsOf(9301).length, 1);
        assert.equal(positionsOf(9301)[0].qty, 25);

        // 8. Пересчёт: себестоимость меняется только у непроданных штук, продажи — как были.
        context.__realCosts[9301] = { realTotal: 150000 };
        context.__realCostCalls = [];
        assert.equal(await vm.runInContext('Warehouse.recalcOrderReadyGoodsCost(9301)', context), 1);
        assert.equal(positionsOf(9301)[0].cost_per_unit, 5000);
        assert.equal(positionsOf(9301)[0].qty, 25);
        assert.deepEqual(clone(base.lists.sales), [saleBefore], 'recorded sales keep their cost');
        assert.deepEqual(clone(context.__realCostCalls), [{ orderId: 9301, options: { fresh: true } }]);
        assert.equal(await vm.runInContext('Warehouse.recalcOrderReadyGoodsCost(9301)', context), 0, 'nothing to update the second time');

        // 9. Возврат без продаж снимает позиции только этого заказа.
        context.__toasts = [];
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(9302, { id: 9302, order_name: 'Лимон' }, 'completed', 'production_casting')`, context);
        assert.equal(positionsOf(9302).length, 0);
        assert.equal(positionsOf(9301).length, 1);
        const returned = base.lists.history.filter(entry => entry.type === 'return_to_order');
        assert.equal(returned.length, 1);
        assert.equal(returned[0].qty, -30);
        assert.deepEqual(clone(context.__toasts), ['1 товар(ов) убрано из Готовой продукции']);

        // 10. B2C — как раньше: весь тираж каждой строки по её себестоимости, разметка не действует.
        addOrder({
            order: { id: 9303, order_name: 'B2C партия', client_name: 'B2C', status: 'completed' },
            items: [
                { id: 9303001, order_id: 9303, item_number: 1, item_type: 'product', product_name: 'Брелок', quantity: 10, cost_total: 120, sell_price_item: 300, tirage_allocation: { stock: 3, gift: 2 } },
                { id: 9303100, order_id: 9303, item_number: 100, item_type: 'hardware', product_name: 'Карабин', quantity: 10, cost_total: 5, hardware_parent_item_index: 0 },
            ],
        });
        assert.equal(await move(9303, 'B2C партия'), 1);
        assert.equal(positionsOf(9303).length, 1);
        assert.deepEqual(tiragePositionView(positionsOf(9303)[0]), {
            product_name: 'Брелок', order_name: 'B2C партия', order_id: 9303, marketplace_set: '',
            location_type: 'our', qty: 10, cost_per_unit: 120, added_by: 'Smoke',
        });
        // The production plan moves it to «Готово» as well, and a stale board (old status in hand)
        // does it once more: the tirage is on the stock once, not twice.
        const b2cHistory = () => base.lists.history.filter(entry => entry.type === 'from_order' && entry.order_name === 'B2C партия').length;
        assert.equal(await move(9303, 'B2C партия'), 0);
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(9303, { id: 9303, order_name: 'B2C партия' }, 'delivery', 'completed')`, context);
        assert.deepEqual(positionsOf(9303).map(row => row.qty), [10], 'one position, the tirage once');
        assert.equal(b2cHistory(), 1, 'one transfer in the history');
        // Back from «Готово» the positions leave; the next «Готово» moves the tirage again.
        assert.equal(await vm.runInContext(`Warehouse.removeOrderFromReadyGoods(9303, 'B2C партия', 'delivery')`, context), 1);
        assert.equal(positionsOf(9303).length, 0);
        assert.equal(await move(9303, 'B2C партия'), 1);
        assert.deepEqual(positionsOf(9303).map(row => row.qty), [10]);

        // 11. Без разметки, «Переделка», «Сборка из остатков» — ничего не переносится, и склад
        // даже не читается.
        addOrder({ ...lemonOrderData(9304, { order: { client_name: 'ООО Груша' } }), items: [{ ...lemonOrderData(9304).items[0], tirage_allocation: null }] });
        addOrder(lemonOrderData(9305, { order: { production_purpose: 'rework' } }));
        addOrder(lemonOrderData(9306, { order: { production_purpose: 'leftover_assembly' } }));
        const beforeSkipped = counters();
        assert.equal(await move(9304), 0);
        assert.equal(await move(9305), 0);
        assert.equal(await move(9306), 0);
        assert.deepEqual(counters(), beforeSkipped);
        assert.deepEqual([9304, 9305, 9306].map(id => positionsOf(id).length), [0, 0, 0]);

        // 12. Несколько строк: реальные затраты делятся по плановой себестоимости строк (вместе с
        // фурнитурой строки), затраты строки — на её платные штуки. Груша: (100·50 + 10·50) из
        // 10 000 → 20 000 × 0,55 / 10 = 1 100 ₽. Цена продажи не задана — цена строки с печатью.
        const pearAndPlum = orderId => ({
            order: { id: orderId, order_name: 'Груша и слива', client_name: 'Сад', status: 'completed' },
            items: [
                { item_number: 1, item_type: 'product', product_name: 'Груша', quantity: 50, cost_total: 100, sell_price_item: 1000,
                    printings: JSON.stringify([{ name: 'УФ', qty: 50, price: 5, sell_price: 20 }]),
                    tirage_allocation: JSON.stringify({ stock: 10, gift: 40 }) },
                { item_number: 2, item_type: 'product', product_name: 'Слива', quantity: 100, cost_total: 45, sell_price_item: 90, tirage_allocation: null },
                { item_number: 100, item_type: 'hardware', product_name: 'Карабин груши', quantity: 50, cost_total: 10, hardware_parent_item_index: 0 },
                { item_number: 200, item_type: 'packaging', product_name: 'Общая коробка', quantity: 100, cost_total: 2, packaging_parent_item_index: null },
                { item_number: 300, item_type: 'extra_cost', product_name: 'Доп. доход', quantity: 1, cost_total: 999, sell_price_item: 999 },
            ],
        });
        context.__realCosts[9307] = { realTotal: 20000 };
        addOrder(pearAndPlum(9307));
        addOrder(pearAndPlum(9308));
        // Оба переноса — в одну миллисекунду: запись истории патчем заменила бы строку с тем же
        // id, поэтому у каждой записи свой id.
        const realNow = Date.now;
        Date.now = () => 1761552000000;
        try {
            assert.equal(await move(9307, 'Груша и слива'), 1);
            // Без «Факта» — плановая себестоимость заказа (строки, их фурнитура и общая упаковка),
            // разделённая так же: 10 200 × 0,55 / 10 = 561 ₽.
            assert.equal(await move(9308, 'Груша и слива'), 1);
        } finally {
            Date.now = realNow;
        }
        assert.deepEqual(positionsOf(9307).map(tiragePositionView), [{
            product_name: 'Груша', order_name: 'Груша и слива', order_id: 9307, order_item_number: 1, order_line_key: null, source: 'tirage',
            location_type: 'our', qty: 10, cost_per_unit: 1100, sale_price: 1020, added_by: 'Smoke',
        }]);
        assert.equal(positionsOf(9308)[0].cost_per_unit, 561);
        assert.deepEqual(
            [9307, 9308].map(id => base.lists.history.filter(entry => entry.type === 'from_order' && Number(entry.order_id) === id).length),
            [1, 1],
            'both transfers keep their history entry',
        );

        // 13. Нет связи с общей базой: перенос и возврат не молчат.
        addOrder(lemonOrderData(9309));
        base.shared = false;
        context.__toasts = [];
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(9309, { id: 9309, order_name: 'Лимон' }, 'delivery', 'completed')`, context);
        assert.equal(positionsOf(9309).length, 0);
        assert.deepEqual(clone(context.__toasts), [TRANSFER_FAILED]);
        context.__toasts = [];
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(9308, { id: 9308, order_name: 'Груша и слива' }, 'completed', 'delivery')`, context);
        assert.equal(positionsOf(9308).length, 1);
        assert.deepEqual(clone(context.__toasts), [ROLLBACK_FAILED]);
        base.shared = true;
        // Общей базы нет только для истории: перенос не пишет ничего — и остатки тоже, чтобы
        // позиция не встала на склад без записи о том, откуда она.
        base.unavailable.add('history');
        context.__toasts = [];
        const stockSavesBefore = base.saves.stock;
        await vm.runInContext(`Orders._syncReadyGoodsByStatus(9309, { id: 9309, order_name: 'Лимон' }, 'delivery', 'completed')`, context);
        assert.equal(positionsOf(9309).length, 0);
        assert.equal(base.saves.stock, stockSavesBefore, 'no half-written transfer');
        assert.deepEqual(clone(context.__toasts), [TRANSFER_FAILED]);
        base.unavailable.clear();
    } finally {
        Object.assign(context, originals);
        delete context.Factual;
        vm.runInContext(`
            App.toast = globalThis.__tirageOriginals.toast;
            Warehouse.renderStats = globalThis.__tirageOriginals.renderStats;
            Warehouse.renderReadyGoodsView = globalThis.__tirageOriginals.renderReadyGoodsView;
        `, context);
    }
}

// Заказ уже в «Готово», разметку меняют: позиции на складе подстраиваются под неё, но не ниже
// уже проданного.
async function smokeTirageReadyGoodsSyncToSplit(context) {
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder'].map(name => [name, context[name]]));
    const position = {
        id: 9401001, product_name: 'Лимон', order_name: 'Лимон', order_id: 9401, order_item_number: 1, source: 'tirage',
        location_type: 'our', qty: 25, cost_per_unit: 4033.33, sale_price: 5900, added_at: '2026-10-20T10:00:00.000Z', added_by: 'Smoke',
    };
    const sale = { id: 1, ready_goods_id: 9401001, product_name: 'Лимон', order_name: 'Лимон', channel: 'website', location_type: 'our', qty: 5, cost_per_unit: 4033.33, revenue: 29500, payout: 29000 };
    const base = useReadyGoodsBase(context, { stock: [position], sales: [sale] });
    const saved = lemonOrderData(9401);
    context.loadOrder = async () => clone(saved);
    context.__realCostCalls = [];
    context.Factual = {
        async computeOrderRealCost(orderId, options) {
            context.__realCostCalls.push({ orderId: Number(orderId), options: clone(options === undefined ? null : options) });
            return { realTotal: 140000 };
        },
    };
    const sync = data => vm.runInContext(`Warehouse.syncOrderReadyGoodsToTirage(9401${data ? `, ${JSON.stringify(data)}` : ''})`, context);
    const lemonQty = () => base.lists.stock.filter(row => Number(row.order_id) === 9401).map(row => row.qty);

    try {
        // «На продажу» подняли до 40: на складе 40 − 5 проданных.
        const raised = clone(await sync(lemonOrderData(9401, { tirage: { stock: 40, partner: 40 } })));
        assert.equal(raised.ok, true);
        assert.deepEqual(lemonQty(), [35]);
        assert.equal(base.lists.stock[0].cost_per_unit, 4033.33, 'the frozen cost stays');
        assert.deepEqual(clone(context.__realCostCalls), [], 'an existing position needs no new cost');

        // Меньше проданного — нельзя: ничего не пишется, менеджер видит почему.
        const savesBefore = clone(base.saves);
        const lowered = clone(await sync(lemonOrderData(9401, { tirage: { stock: 3 } })));
        assert.deepEqual(lowered, {
            ok: false,
            blocked: true,
            message: 'Заказ не сохранён: у «Лимон» на продажу 3 шт., а со склада уже продано 5 шт. Меньше проданного поставить нельзя.',
        });
        assert.deepEqual(lemonQty(), [35]);
        assert.deepEqual(clone(base.saves), savesBefore);
        // Та же проверка до записи заказа — только чтение остатков и продаж.
        const historyLoadsBefore = base.loads.history;
        const check = data => vm.runInContext(`Warehouse.checkOrderReadyGoodsSoldFloor(9401, ${JSON.stringify(data)})`, context);
        assert.deepEqual(clone(await check(lemonOrderData(9401, { tirage: { stock: 3 } }))), lowered);
        assert.deepEqual(clone(await check(lemonOrderData(9401, { tirage: { stock: 40, partner: 40 } }))), { ok: true, message: '' });
        assert.deepEqual(clone(await check(lemonOrderData(9401, { order: { status: 'delivery' }, tirage: { stock: 3 } }))), { ok: true, message: '' });
        assert.deepEqual(clone(base.saves), savesBefore, 'the check writes nothing');
        assert.equal(base.loads.history, historyLoadsBefore, 'the check does not read the history');
        // Строку убрали совсем — то же самое.
        const dropped = clone(await sync({ ...lemonOrderData(9401), items: [] }));
        assert.equal(dropped.blocked, true);
        assert.match(dropped.message, /у «Лимон» на продажу 0 шт\., а со склада уже продано 5 шт\./);

        // Ровно проданное: на складе 0, позиция остаётся при своих продажах.
        assert.equal(clone(await sync(lemonOrderData(9401, { tirage: { stock: 5 } }))).ok, true);
        assert.deepEqual(lemonQty(), [0]);

        // Без данных — по сохранённому заказу (30 на продажу).
        assert.equal(clone(await sync()).ok, true);
        assert.deepEqual(lemonQty(), [25]);

        // Цену продажи и название строки поменяли — позиция следует за строкой; себестоимость прежняя.
        const renamed = lemonOrderData(9401, { tirage: { stock_price: 6500 } });
        renamed.items[0].product_name = 'Лимон большой';
        assert.equal(clone(await sync(renamed)).ok, true);
        assert.deepEqual(tiragePositionView(base.lists.stock.find(row => Number(row.order_id) === 9401)), {
            product_name: 'Лимон большой', order_name: 'Лимон', order_id: 9401, order_item_number: 1, source: 'tirage',
            location_type: 'our', qty: 25, cost_per_unit: 4033.33, sale_price: 6500, added_by: 'Smoke',
        });

        // Новая строка «на продажу» встаёт на склад по реальной себестоимости заказа: Груша — 1 000
        // плановых из 98 135, её доля 140 000 × 1 000 / 98 135 на 4 платные штуки.
        const withPear = lemonOrderData(9401);
        withPear.items.push({
            item_number: 2, item_type: 'product', product_name: 'Груша', quantity: 10, cost_total: 100, sell_price_item: 700,
            printings: '[]', tirage_allocation: { stock: 4, gift: 6 },
        });
        assert.equal(clone(await sync(withPear)).ok, true);
        const pear = base.lists.stock.find(row => Number(row.order_id) === 9401 && row.order_item_number === 2);
        assert.deepEqual(tiragePositionView(pear), {
            product_name: 'Груша', order_name: 'Лимон', order_id: 9401, order_item_number: 2, order_line_key: null, source: 'tirage',
            location_type: 'our', qty: 4, cost_per_unit: 356.65, sale_price: 700, added_by: 'Smoke',
        });
        assert.deepEqual(clone(context.__realCostCalls), [{ orderId: 9401, options: { fresh: true } }]);
        // Разметку строки сняли, а с неё ничего не продано — позиция уходит со склада.
        assert.equal(clone(await sync(lemonOrderData(9401))).ok, true);
        assert.equal(base.lists.stock.some(row => Number(row.order_id) === 9401 && row.order_item_number === 2), false);

        // Два сохранения одного заказа в одной вкладке (автосохранение и кнопка): склад — как
        // просило последнее, даже если первое ждёт «Факт» (новой строке нужна себестоимость).
        const lemonWithPear = (stock, partner) => {
            const data = lemonOrderData(9401, { tirage: { stock, partner } });
            data.items.push({ ...withPear.items[1] });
            return data;
        };
        let releaseFirstCost = null;
        let costCalls = 0;
        context.Factual = {
            async computeOrderRealCost() {
                costCalls += 1;
                if (costCalls === 1) await new Promise(resolve => { releaseFirstCost = resolve; });
                return { realTotal: 140000 };
            },
        };
        const earlier = sync(lemonWithPear(40, 40));
        const later = sync(lemonWithPear(45, 35));
        await new Promise(resolve => setTimeout(resolve, 0));
        releaseFirstCost();
        await Promise.all([earlier, later]);
        assert.deepEqual(
            base.lists.stock.filter(row => Number(row.order_id) === 9401 && row.order_item_number === 1).map(row => row.qty),
            [40],
            'the later save wins: 45 on sale − 5 sold',
        );
        assert.equal(base.lists.stock.filter(row => Number(row.order_id) === 9401 && row.order_item_number === 2).length, 1);
        assert.equal(clone(await sync(lemonOrderData(9401))).ok, true);

        // Заказ не в «Готово» — склад не трогается и не читается.
        const loadsBefore = clone(base.loads);
        assert.equal(clone(await sync(lemonOrderData(9401, { order: { status: 'delivery' }, tirage: { stock: 1 } }))).ok, true);
        assert.deepEqual(clone(base.loads), loadsBefore);
    } finally {
        Object.assign(context, originals);
        delete context.Factual;
    }
}

// Калькулятор: заказ в «Готово» с «на продажу» меньше проданного не сохраняется ни вручную, ни
// автосохранением. Остальное — сначала записывается заказ, потом склад подстраивается под его
// разметку; если склад не записался, менеджер узнаёт об этом, а следующее сохранение догоняет.
async function smokeTirageCompletedOrderSaveFollowsReadyGoods(context) {
    const BLOCKED = 'Заказ не сохранён: у «Лимон» на продажу 3 шт., а со склада уже продано 5 шт. Меньше проданного поставить нельзя.';
    const SYNC_FAILED = 'Заказ сохранён, но склад готовой продукции не обновился — сохраните ещё раз';
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder', 'saveOrder'].map(name => [name, context[name]]));
    const position = {
        id: 9402001, product_name: 'Лимон', order_name: 'Лимон', order_id: 9402, order_item_number: 1, source: 'tirage',
        location_type: 'our', qty: 25, cost_per_unit: 4033.33, sale_price: 5900, added_at: '2026-10-20T10:00:00.000Z', added_by: 'Smoke',
    };
    const base = useReadyGoodsBase(context, { stock: [position], sales: [{ id: 2, ready_goods_id: 9402001, product_name: 'Лимон', qty: 5, cost_per_unit: 4033.33 }] });
    context.__orderStatus = 'completed';
    context.loadOrder = async (orderId) => ({ order: { id: Number(orderId), order_name: 'Лимон', client_name: 'Художница Маша', status: context.__orderStatus }, items: [] });
    context.__writes = [];
    context.__orderWriteFails = false;
    context.saveOrder = async (order, items) => {
        if (context.__orderWriteFails) throw new Error('нет связи');
        context.__writes.push({ status: order.status, items: clone(items), stockAtWrite: clone(base.lists.stock) });
        return order.id;
    };
    context.Factual = { async computeOrderRealCost() { return { realTotal: 121000 }; } };
    context.__toasts = [];
    vm.runInContext(`
        globalThis.__tirageSaveOriginals = {
            toast: App.toast,
            syncProjectHardwareOrderState: Warehouse.syncProjectHardwareOrderState,
            prepare: Calculator._prepareColorAttachmentsForSave,
        };
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.syncProjectHardwareOrderState = async () => ({});
        Calculator._prepareColorAttachmentsForSave = async () => {};
    `, context);
    const setForm = (stock, status) => vm.runInContext(`(() => {
        Calculator.resetForm();
        document.getElementById('calc-order-name').value = 'Лимон';
        document.getElementById('calc-client-name').value = 'Художница Маша';
        App.editingOrderId = 9402;
        localStorage.setItem('ro_calc_editing_order_id', '9402');
        Calculator._currentOrderStatus = ${JSON.stringify(status)};
        Calculator.items = [Object.assign(Calculator.getEmptyItem(1), {
            product_name: 'Лимон', quantity: 100, sell_price_item: 5900, pieces_per_hour: 100, weight_grams: 10,
            tirage_allocation: { stock: ${Number(stock)}, partner: ${80 - Number(stock)}, gift: 20, stock_price: 5900, partner_note: 'художница' },
        })];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
    })()`, context);
    const lemonQty = () => base.lists.stock.filter(row => Number(row.order_id) === 9402).map(row => row.qty);
    const autosaveStatus = () => String(context.document.getElementById('calc-autosave-status').textContent || '');

    try {
        // «На продажу» 3 при 5 проданных: ни ручное сохранение, ни автосохранение не проходят.
        setForm(3, 'completed');
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.equal(context.__writes.length, 0, 'the order is not saved');
        assert.ok(context.__toasts.includes(BLOCKED), 'the manager sees why');
        assert.deepEqual(lemonQty(), [25]);
        setForm(3, 'completed');
        await vm.runInContext('Calculator._doAutosave()', context);
        assert.equal(context.__writes.length, 0, 'autosave does not save it either');
        assert.equal(autosaveStatus(), BLOCKED);

        // 40 на продажу: сначала записывается заказ, потом склад подстраивается (40 − 5).
        context.__toasts = [];
        setForm(40, 'completed');
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.equal(context.__writes.length, 1);
        assert.equal(context.__writes[0].status, 'completed');
        assert.deepEqual(context.__writes[0].stockAtWrite.map(row => row.qty), [25], 'the order is written before the stock');
        assert.deepEqual(lemonQty(), [35]);
        assert.ok(context.__toasts.includes('Заказ сохранен'));
        const stockSaves = base.saves.stock;
        setForm(40, 'completed');
        await vm.runInContext('Calculator._doAutosave()', context);
        assert.equal(context.__writes.length, 2);
        assert.equal(base.saves.stock, stockSaves, 'the same split writes nothing to the stock');

        // Заказ записан, а склад — нет: менеджер узнаёт об этом.
        base.failSaves.add('stock');
        context.__toasts = [];
        setForm(42, 'completed');
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.equal(context.__writes.length, 3, 'the order is saved');
        assert.deepEqual(lemonQty(), [35]);
        assert.ok(context.__toasts.includes(SYNC_FAILED), 'the manager hears the stock did not follow');
        assert.equal(context.__toasts.includes('Заказ сохранен'), false);
        setForm(43, 'completed');
        await vm.runInContext('Calculator._doAutosave()', context);
        assert.equal(context.__writes.length, 4, 'autosave saves the order too');
        assert.deepEqual(lemonQty(), [35]);
        assert.equal(autosaveStatus(), SYNC_FAILED);
        // Следующее сохранение догоняет склад.
        base.failSaves.clear();
        context.__toasts = [];
        setForm(43, 'completed');
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.equal(context.__writes.length, 5);
        assert.deepEqual(lemonQty(), [38]);
        assert.ok(context.__toasts.includes('Заказ сохранен'));

        // Заказ не записался — склад не трогается.
        context.__orderWriteFails = true;
        const stockSavesBeforeFailedWrite = base.saves.stock;
        context.__toasts = [];
        setForm(44, 'completed');
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.ok(context.__toasts.some(message => message.startsWith('Ошибка сохранения')));
        setForm(44, 'completed');
        await vm.runInContext('Calculator._doAutosave()', context);
        assert.equal(autosaveStatus(), 'Ошибка автосохранения');
        assert.equal(context.__writes.length, 5);
        assert.deepEqual(lemonQty(), [38], 'the stock follows only a saved order');
        assert.equal(base.saves.stock, stockSavesBeforeFailedWrite);
        context.__orderWriteFails = false;

        // Заказ не в «Готово»: склад не читается.
        context.__orderStatus = 'production_casting';
        const stockLoads = base.loads.stock;
        setForm(3, 'production_casting');
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.equal(context.__writes.length, 6);
        assert.equal(base.loads.stock, stockLoads);
    } finally {
        await vm.runInContext('Calculator.resetForm()', context);
        Object.assign(context, originals);
        delete context.Factual;
        vm.runInContext(`
            App.toast = globalThis.__tirageSaveOriginals.toast;
            Warehouse.syncProjectHardwareOrderState = globalThis.__tirageSaveOriginals.syncProjectHardwareOrderState;
            Calculator._prepareColorAttachmentsForSave = globalThis.__tirageSaveOriginals.prepare;
        `, context);
    }
}

// Позиция «на продажу» принадлежит строке, а не её номеру: удаление и копирование строк меняют
// номера всех строк заказа, а позиция остаётся при своей строке (ключ строки в разметке тиража).
async function smokeTiragePositionsFollowTheirLine(context) {
    const BLOCKED = 'Заказ не сохранён: у «Лимон» на продажу 0 шт., а со склада уже продано 5 шт. Меньше проданного поставить нельзя.';
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder', 'saveOrder'].map(name => [name, context[name]]));
    const lemonPosition = {
        id: 1, product_name: 'Лимон', order_name: 'Сад', order_id: 9801, order_item_number: 1, order_line_key: 'lemonkey',
        source: 'tirage', location_type: 'our', qty: 30, cost_per_unit: 4033.33, sale_price: 5900, added_at: '2026-10-20T10:00:00.000Z', added_by: 'Smoke',
    };
    const pearPosition = {
        id: 2, product_name: 'Груша', order_name: 'Сад', order_id: 9801, order_item_number: 2, order_line_key: 'pearkey',
        source: 'tirage', location_type: 'our', qty: 10, cost_per_unit: 1100, sale_price: 1000, added_at: '2026-10-20T10:00:00.000Z', added_by: 'Smoke',
    };
    let base = null;
    context.loadOrder = async (orderId) => ({ order: { id: Number(orderId), order_name: 'Сад', client_name: 'Сад', status: 'completed' }, items: [] });
    context.__writes = [];
    context.saveOrder = async (order, items) => { context.__writes.push(clone(items)); return order.id; };
    context.__toasts = [];
    vm.runInContext(`
        globalThis.__lineKeyOriginals = {};
        ['renderItemBlock', 'rerenderAllHardware', 'rerenderAllPackaging', 'recalculate', '_updateItemsEmptyState', 'scheduleAutosave', '_prepareColorAttachmentsForSave']
            .forEach(name => { globalThis.__lineKeyOriginals[name] = Calculator[name]; Calculator[name] = name === '_prepareColorAttachmentsForSave' ? async () => {} : () => {}; });
        globalThis.__lineKeyOriginals.toast = App.toast;
        globalThis.__lineKeyOriginals.syncProjectHardwareOrderState = Warehouse.syncProjectHardwareOrderState;
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Warehouse.syncProjectHardwareOrderState = async () => ({});
    `, context);
    const setForm = () => vm.runInContext(`(() => {
        Calculator.resetForm();
        document.getElementById('calc-order-name').value = 'Сад';
        document.getElementById('calc-client-name').value = 'Сад';
        App.editingOrderId = 9801;
        localStorage.setItem('ro_calc_editing_order_id', '9801');
        Calculator._currentOrderStatus = 'completed';
        Calculator.items = [
            Object.assign(Calculator.getEmptyItem(1), { product_name: 'Лимон', quantity: 100, sell_price_item: 5900, pieces_per_hour: 100, weight_grams: 10,
                tirage_allocation: { stock: 30, partner: 50, gift: 20, stock_price: 5900, line_key: 'lemonkey' } }),
            Object.assign(Calculator.getEmptyItem(2), { product_name: 'Груша', quantity: 20, sell_price_item: 1000, pieces_per_hour: 100, weight_grams: 10,
                tirage_allocation: { stock: 10, gift: 10, line_key: 'pearkey' } }),
        ];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.extraCosts = [];
        Calculator.pendants = [];
    })()`, context);
    const orderPositions = () => base.lists.stock.filter(row => Number(row.order_id) === 9801);

    try {
        // Удалили строку №1 «Лимон»: «Груша» стала №1, но её позиция — та же (количество и
        // себестоимость её), а позиция «Лимона» без продаж уходит со склада.
        base = useReadyGoodsBase(context, { stock: [lemonPosition, pearPosition] });
        setForm();
        await vm.runInContext('Calculator.removeItem(0); Calculator._doAutosave()', context);
        assert.equal(context.__writes.length, 1);
        assert.deepEqual(context.__writes[0].filter(row => row.item_type === 'product').map(row => `${row.item_number}:${row.product_name}`), ['1:Груша']);
        assert.deepEqual(orderPositions().map(tiragePositionView), [{
            product_name: 'Груша', order_name: 'Сад', order_id: 9801, order_item_number: 1, order_line_key: 'pearkey', source: 'tirage',
            location_type: 'our', qty: 10, cost_per_unit: 1100, sale_price: 1000, added_by: 'Smoke',
        }]);
        assert.equal(orderPositions()[0].id, 2, 'the pear keeps its own position');
        assert.ok(base.lists.history.some(entry => entry.product_name === 'Лимон' && /больше не на продажу/.test(entry.notes)));

        // С проданными 5 «Лимонами» удалить его строку нельзя — ни автосохранением, ни вручную.
        base = useReadyGoodsBase(context, {
            stock: [{ ...lemonPosition, qty: 25 }, pearPosition],
            sales: [{ id: 5, ready_goods_id: 1, product_name: 'Лимон', qty: 5, cost_per_unit: 4033.33 }],
        });
        context.__writes = [];
        context.__toasts = [];
        setForm();
        await vm.runInContext('Calculator.removeItem(0); Calculator._doAutosave()', context);
        assert.equal(String(context.document.getElementById('calc-autosave-status').textContent || ''), BLOCKED);
        await vm.runInContext('Calculator.saveOrder()', context);
        assert.ok(context.__toasts.includes(BLOCKED));
        assert.equal(context.__writes.length, 0, 'the order is not saved');
        assert.deepEqual(orderPositions().map(row => `${row.product_name}:${row.qty}:${row.order_item_number}`), ['Лимон:25:1', 'Груша:10:2']);

        // Перенос при «Готово» записывает ключ строки в позицию, и id позиции — от ключа. Если такой
        // id уже у другой записи склада, позиция получает свой.
        setForm();
        const savedRows = clone(vm.runInContext('Calculator._collectItemsForSave()', context));
        context.loadOrder = async () => ({ order: { id: 9802, order_name: 'Сад', client_name: 'Сад', status: 'completed' }, items: clone(savedRows) });
        const manualTwin = { id: parseInt('pearkey', 36), product_name: 'Ручная', order_id: null, qty: 3, cost_per_unit: 10, location_type: 'our' };
        base = useReadyGoodsBase(context, { stock: [manualTwin] });
        assert.equal(await vm.runInContext(`Warehouse.moveOrderToReadyGoods(9802, 'Сад')`, context), 2);
        const moved = base.lists.stock.filter(row => Number(row.order_id) === 9802);
        assert.deepEqual(moved.map(row => `${row.product_name}:${row.order_line_key}:${row.qty}`), ['Лимон:lemonkey:30', 'Груша:pearkey:10']);
        assert.equal(moved[0].id, parseInt('lemonkey', 36), 'the position id comes from the line key');
        assert.notEqual(moved[1].id, manualTwin.id, 'an id another record has is never reused');
        assert.deepEqual(base.lists.stock.find(row => row.product_name === 'Ручная'), manualTwin, 'the other record survives');
        context.loadOrder = async (orderId) => ({ order: { id: Number(orderId), order_name: 'Сад', client_name: 'Сад', status: 'completed' }, items: [] });

        // Копия строки с разметкой — новая строка со своим ключом.
        setForm();
        const cloned = clone(await vm.runInContext(`(() => {
            Calculator.cloneItem(0);
            return {
                keys: Calculator.items.map(item => item.tirage_allocation && item.tirage_allocation.line_key),
                baseKey: Calculator.items[1]._tirageBase ? Calculator.items[1]._tirageBase.line_key : Calculator.items[1].tirage_allocation.line_key,
                saved: Calculator._collectItemsForSave().filter(row => row.item_type === 'product').map(row => row.tirage_allocation && row.tirage_allocation.line_key),
            };
        })()`, context));
        assert.equal(cloned.keys[0], 'lemonkey');
        assert.equal(typeof cloned.keys[1], 'string');
        assert.ok(cloned.keys[1] && cloned.keys[1] !== 'lemonkey', 'the copy gets a key of its own');
        assert.equal(cloned.baseKey, cloned.keys[1]);
        assert.equal(new Set(cloned.saved).size, 3, 'no two saved lines share a key');

        // Ключ выдаётся, когда у строки впервые появляется разметка, и дальше не меняется.
        const keys = clone(await vm.runInContext(`(() => {
            Calculator.resetForm();
            Calculator.items = [
                Object.assign(Calculator.getEmptyItem(1), { product_name: 'Слива', quantity: 100, sell_price_item: 300 }),
                Object.assign(Calculator.getEmptyItem(2), { product_name: 'Айва', quantity: 50, sell_price_item: 400 }),
            ];
            const keyOf = idx => (Calculator.items[idx].tirage_allocation || {}).line_key || '';
            const steps = {};
            Calculator.onTirageTextChange(1, 'partner_note', 'кому-то');
            steps.noteOnly = keyOf(1);
            Calculator.onTirageChange(0, 'stock', '30');
            steps.first = keyOf(0);
            Calculator.onTirageChange(0, 'gift', '5');
            steps.edited = keyOf(0);
            Calculator.items[0].quantity = 20;
            Calculator._renormalizeItemTirage(Calculator.items[0]);
            steps.cut = keyOf(0);
            steps.cutStock = Calculator.items[0].tirage_allocation.stock;
            Calculator.onTirageChange(1, 'gift', '3');
            steps.second = keyOf(1);
            steps.saved = Calculator._collectItemsForSave().filter(row => row.item_type === 'product').map(row => row.tirage_allocation.line_key);
            return steps;
        })()`, context));
        assert.equal(keys.noteOnly, '', 'no split, no key');
        assert.ok(keys.first, 'the first split gives the line a key');
        assert.equal(keys.edited, keys.first);
        assert.equal(keys.cut, keys.first, 'a smaller tirage keeps the key');
        assert.equal(keys.cutStock, 15);
        assert.ok(keys.second && keys.second !== keys.first);
        assert.deepEqual(keys.saved, [keys.first, keys.second], 'the keys are saved with the lines');

        // Две строки размечены в одну миллисекунду (и случайная часть совпала): ключи всё равно разные.
        const realNow = Date.now;
        const realRandom = Math.random;
        Date.now = () => 1761552000000;
        Math.random = () => 0.5;
        let sameMsKeys;
        try {
            sameMsKeys = clone(vm.runInContext(`(() => {
                Calculator.items = [
                    Object.assign(Calculator.getEmptyItem(1), { product_name: 'Слива', quantity: 10, sell_price_item: 300 }),
                    Object.assign(Calculator.getEmptyItem(2), { product_name: 'Айва', quantity: 10, sell_price_item: 400 }),
                ];
                Calculator.onTirageChange(0, 'stock', '2');
                Calculator.onTirageChange(1, 'stock', '3');
                return Calculator.items.map(item => item.tirage_allocation.line_key);
            })()`, context));
        } finally {
            Date.now = realNow;
            Math.random = realRandom;
        }
        assert.notEqual(sameMsKeys[0], sameMsKeys[1]);
    } finally {
        await vm.runInContext('Calculator.resetForm()', context);
        Object.assign(context, originals);
        vm.runInContext(`
            Object.entries(globalThis.__lineKeyOriginals).forEach(([name, value]) => {
                if (name === 'toast') App.toast = value;
                else if (name === 'syncProjectHardwareOrderState') Warehouse.syncProjectHardwareOrderState = value;
                else Calculator[name] = value;
            });
        `, context);
    }
}

// Ещё одна вкладка с тем же складом готовой продукции (своё чтение списков).
function createReadyGoodsTab(server) {
    const tab = createContext();
    runScript(tab, 'js/warehouse.js');
    stubRuntime(tab);
    useReadyGoodsBase(tab, null, server);
    vm.runInContext('Warehouse.renderStats = () => {}; Warehouse.renderReadyGoodsView = () => {};', tab);
    return tab;
}

// Новые записи готовой продукции — позиции, продажи, история — пишутся патчами, и запись с тем же
// id заменяет прежнюю. Записи, созданные в одну миллисекунду (в этой вкладке или в соседних),
// получают разные id и все остаются в общей базе.
async function smokeReadyGoodsRecordsCreatedInOneMillisecondKeepTheirIds(context) {
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder'].map(name => [name, context[name]]));
    const base = useReadyGoodsBase(context);
    const b2cOrder = (id, name, quantity) => ({
        order: { id, order_name: name, client_name: 'B2C', status: 'completed' },
        items: [{ id: id * 1000 + 1, order_id: id, item_number: 1, item_type: 'product', product_name: name, quantity, cost_total: 50 }],
    });
    const orders = { 9601: b2cOrder(9601, 'Брелок', 4), 9602: b2cOrder(9602, 'Значок', 6) };
    context.loadOrder = async (orderId) => clone(orders[Number(orderId)] || null);
    vm.runInContext(`
        globalThis.__sameMsOriginals = { toast: App.toast, renderStats: Warehouse.renderStats, renderReadyGoodsView: Warehouse.renderReadyGoodsView };
        App.toast = () => {};
        Warehouse.renderStats = () => {};
        Warehouse.renderReadyGoodsView = () => {};
    `, context);
    const fillAdd = (doc, name) => {
        doc.getElementById('rg-add-name').value = name;
        doc.getElementById('rg-add-qty').value = '2';
        doc.getElementById('rg-add-cost').value = '10';
        doc.getElementById('rg-add-location').value = 'our';
        doc.getElementById('rg-add-set').value = '';
    };
    const fillWriteOff = doc => {
        doc.getElementById('rg-wo-product').value = '0';
        doc.getElementById('rg-wo-qty').value = '1';
        doc.getElementById('rg-wo-channel').value = 'website';
        doc.getElementById('rg-wo-revenue').value = '300';
        doc.getElementById('rg-wo-payout').value = '300';
        doc.getElementById('rg-wo-notes').value = '';
    };
    const realNow = Date.now;
    const realRandom = Math.random;
    Date.now = () => 1761552000000;
    Math.random = () => 0;
    try {
        // B2C-партии, добавление вручную и продажи — всё в одну миллисекунду в этой вкладке.
        await vm.runInContext(`Warehouse.moveOrderToReadyGoods(9601, 'B2C 1')`, context);
        await vm.runInContext(`Warehouse.moveOrderToReadyGoods(9602, 'B2C 2')`, context);
        fillAdd(context.document, 'Ручная 1');
        await vm.runInContext('Warehouse.doAddReadyGoods()', context);
        fillAdd(context.document, 'Ручная 2');
        await vm.runInContext('Warehouse.doAddReadyGoods()', context);
        fillWriteOff(context.document);
        await vm.runInContext('Warehouse.doWriteOff()', context);
        fillWriteOff(context.document);
        await vm.runInContext('Warehouse.doWriteOff()', context);
        assert.deepEqual(base.lists.stock.map(row => `${row.product_name}:${row.qty}`), ['Брелок:2', 'Значок:6', 'Ручная 1:2', 'Ручная 2:2']);
        assert.deepEqual(base.lists.history.map(entry => entry.type), ['from_order', 'from_order', 'manual_add', 'manual_add', 'writeoff', 'writeoff']);
        assert.equal(base.lists.sales.length, 2, 'both sales are recorded');

        // Две другие вкладки добавляют вручную в ту же миллисекунду: у каждой своя позиция.
        const randoms = [0.25, 0.75];
        for (const [index, tab] of [createReadyGoodsTab(base), createReadyGoodsTab(base)].entries()) {
            Math.random = () => randoms[index];
            fillAdd(tab.document, `Вкладка ${index + 1}`);
            await vm.runInContext('Warehouse.doAddReadyGoods()', tab);
        }
        assert.deepEqual(base.lists.stock.slice(4).map(row => row.product_name), ['Вкладка 1', 'Вкладка 2']);
        ['stock', 'history', 'sales'].forEach(list => {
            const ids = base.lists[list].map(row => row.id);
            assert.ok(ids.every(id => Number.isSafeInteger(id)), `${list}: numeric ids below 2^53`);
        });
    } finally {
        Date.now = realNow;
        Math.random = realRandom;
        Object.assign(context, originals);
        vm.runInContext(`
            App.toast = globalThis.__sameMsOriginals.toast;
            Warehouse.renderStats = globalThis.__sameMsOriginals.renderStats;
            Warehouse.renderReadyGoodsView = globalThis.__sameMsOriginals.renderReadyGoodsView;
        `, context);
    }
}

// План производства меняет статус так же, как доска: «Готово» переносит «на продажу» на склад,
// возврат с проданным запрещён, без продаж — снимает позицию.
async function smokeProductionPlanStatusSyncsReadyGoods(context) {
    if (!vm.runInContext(`typeof ProductionPlan !== 'undefined'`, context)) {
        runScript(context, 'js/production_plan.js');
    }
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder', 'updateOrderStatus'].map(name => [name, context[name]]));
    const base = useReadyGoodsBase(context);
    const order = lemonOrderData(9501, { order: { status: 'delivery' } });
    context.loadOrder = async () => clone(order);
    context.__statusWrites = [];
    context.updateOrderStatus = async (orderId, status) => { context.__statusWrites.push({ orderId: Number(orderId), status: String(status) }); };
    context.Factual = { async computeOrderRealCost() { return { realTotal: 121000 }; } };
    context.__toasts = [];
    context.__warehouseSyncs = [];
    context.__changeRecords = [];
    vm.runInContext(`
        globalThis.__planReadyGoodsOriginals = {
            toast: App.toast,
            syncWarehouse: Orders._syncWarehouseByStatus,
            addChangeRecord: Orders.addChangeRecord,
            load: ProductionPlan.load,
            allRows: ProductionPlan.allRows,
        };
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
        Orders._syncWarehouseByStatus = async (...args) => { globalThis.__warehouseSyncs.push(args); };
        Orders.addChangeRecord = async (...args) => { globalThis.__changeRecords.push(args); };
        ProductionPlan.load = async () => {};
        ProductionPlan.allRows = [{ id: 9501, status: 'delivery', orderName: 'Лимон' }];
    `, context);
    const positions = () => base.lists.stock.filter(row => Number(row.order_id) === 9501);

    try {
        await vm.runInContext('ProductionPlan.goNextStage(9501)', context);
        assert.deepEqual(clone(context.__statusWrites), [{ orderId: 9501, status: 'completed' }]);
        assert.deepEqual(positions().map(row => row.qty), [30], '«на продажу» is on the stock after «Готово» from the plan');
        assert.equal(context.__warehouseSyncs.length, 1);
        assert.deepEqual(clone(context.__warehouseSyncs[0]).slice(0, 4), [9501, 'delivery', 'completed', 'Лимон']);
        assert.equal(context.__changeRecords.length, 1);
        assert.ok(context.__toasts.includes('1 товар(ов) → Готовая продукция'));
        assert.equal(vm.runInContext('ProductionPlan.allRows[0].status', context), 'completed');

        // Продали 5: план производства не вернёт заказ из «Готово».
        base.lists.sales = [{ id: 3, ready_goods_id: positions()[0].id, product_name: 'Лимон', qty: 5, cost_per_unit: 4033.33 }];
        base.lists.stock = base.lists.stock.map(row => (Number(row.order_id) === 9501 ? { ...row, qty: 25 } : row));
        context.__toasts = [];
        await vm.runInContext(`ProductionPlan.setOrderStageStatus(9501, 'production_casting')`, context);
        assert.equal(context.__statusWrites.length, 1, 'the status is not written');
        assert.deepEqual(clone(context.__toasts), ['Уже продано 5 шт. со склада — заказ нельзя вернуть из «Готово»']);
        assert.deepEqual(positions().map(row => row.qty), [25]);

        // Без продаж возврат из плана снимает позицию.
        base.lists.sales = [];
        await vm.runInContext(`ProductionPlan.setOrderStageStatus(9501, 'production_casting')`, context);
        assert.deepEqual(clone(context.__statusWrites)[1], { orderId: 9501, status: 'production_casting' });
        assert.deepEqual(positions(), []);
    } finally {
        Object.assign(context, originals);
        delete context.Factual;
        vm.runInContext(`
            App.toast = globalThis.__planReadyGoodsOriginals.toast;
            Orders._syncWarehouseByStatus = globalThis.__planReadyGoodsOriginals.syncWarehouse;
            Orders.addChangeRecord = globalThis.__planReadyGoodsOriginals.addChangeRecord;
            ProductionPlan.load = globalThis.__planReadyGoodsOriginals.load;
            ProductionPlan.allRows = globalThis.__planReadyGoodsOriginals.allRows;
        `, context);
    }
}

// ==========================================
// Карточка заказа: честная шапка и блок «Тираж»
// ==========================================

// Видимый текст разметки: без тегов, неразрывные пробелы обычные, лишние пробелы схлопнуты.
function visibleText(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ').replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Параметры, при которых «Лимон» считается ровно как в плане: себестоимость штуки 971,35 ₽ (форма на
// 97 135 ₽ на 100 штук), 12,1 ч на тираж (2,1 ч запуска + 100 шт. при 10 шт./ч), удержания 7% + 6,5% + 1%.
const LEMON_CARD_PARAMS = {
    wasteFactor: 1, fotPerHour: 0, indirectPerHour: 0, indirectCostMode: 'none',
    plasticCostPerKg: 0, moldBaseCost: 97135, designCost: 0, cuttingSpeed: 0, nfcTagCost: 0, nfcWriteSpeed: 0,
    taxRate: 0.07, commercialRate: 0.065, charityRate: 0.01, vatRate: 0.05,
    setupHoursBlank: 0.5, setupHoursCustom: 1, plasticHours: 100, packagingHours: 100,
    deliveryCostMoscow: 0, printingDeliveryCost: 0,
};

// Реальная себестоимость «Лимона» так, как её отдаёт Factual.computeOrderRealCost: 121 000 ₽ при
// плановых 97 135 ₽, часы 12,1 по плану и 18 по табелю.
function lemonRealCost(overrides = {}) {
    const row = (key, label, plan, fact, isSalary = false) => ({
        key, label, plan, fact, used: fact > 0 ? fact : plan, source: fact > 0 ? 'fact' : 'plan', isSalary,
    });
    return {
        rows: [
            row('salary_production', 'ЗП выливание', 30000, 42000, true),
            row('salary_trim', 'ЗП срезание', 5000, 0, true),
            row('indirect_production', 'Косвенные', 12000, 20000),
            row('hardware_total', 'Фурнитура', 25000, 28865),
            row('plastic', 'Пластик / материалы', 15135, 0),
            row('molds', 'Молды', 10000, 0),
            row('nfc_total', 'NFC', 0, 0),
        ],
        planTotal: 97135, realTotal: 121000, salaryReal: 47000, hoursPlan: 12.1, hoursFact: 18, hasTimesheet: true,
        ...overrides,
    };
}

// По заказу нет табеля: «Факт» берёт плановое значение каждой статьи.
function lemonPlanOnlyCost() {
    const cost = lemonRealCost();
    return {
        ...cost,
        rows: cost.rows.map(row => ({ ...row, fact: 0, used: row.plan, source: 'plan' })),
        realTotal: 97135, salaryReal: 35000, hoursFact: 0, hasTimesheet: false,
    };
}

// Шапка карточки показывает честные деньги («Лимон»: 177 000 ₽ ожидаем, реальная маржа 17,1% против
// плановых 30,6%), блок «Тираж» — разметку строк и склад готовой продукции, доска — плановую маржу
// с подписью «план».
async function smokeOrderCardTirageAndRealMargin(context) {
    const originals = Object.fromEntries([...READY_GOODS_STUB_NAMES, 'loadOrder'].map(name => [name, context[name]]));
    const base = useReadyGoodsBase(context);
    const orders = {};
    const addOrder = data => { orders[data.order.id] = data; return data; };
    context.loadOrder = async (orderId) => clone(orders[Number(orderId)] || null);
    context.__realCosts = {};
    context.__realCostCalls = [];
    context.Factual = {
        async computeOrderRealCost(orderId, options) {
            context.__realCostCalls.push({ orderId: Number(orderId), options: clone(options === undefined ? null : options) });
            const value = context.__realCosts[Number(orderId)];
            if (value instanceof Error) throw value;
            return value === undefined || value === null ? null : clone(value);
        },
    };
    context.__toasts = [];
    const dom = id => context.document.getElementById(id);
    const domBefore = Object.fromEntries(['od-stats', 'od-tab-info', 'od-tirage-slot'].map(id => [id, dom(id).innerHTML]));
    vm.runInContext(`
        globalThis.__cardOriginals = {
            params: App.params,
            canAccess: App.canAccess,
            isAdmin: App.isAdmin,
            toast: App.toast,
            metaByOrderId: Orders.metaByOrderId,
            ensureAllowed: Orders._ensureStatusTransitionAllowed,
            finishTransition: Orders._finishStatusTransition,
            updateOrderStatus: typeof updateOrderStatus === 'undefined' ? undefined : updateOrderStatus,
            prompt: typeof prompt === 'undefined' ? undefined : prompt,
            card: Object.fromEntries(['currentOrder', 'currentItems', 'currentFinancial', 'currentRealCost', 'realCostState',
                'realCostDetailsOpen', 'tirageStock', 'tirageRecalcBusy'].map(key => [key, OrderDetail[key]])),
        };
        App.params = ${JSON.stringify(LEMON_CARD_PARAMS)};
        App.canAccess = () => false;
        App.isAdmin = () => false;
        App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };
    `, context);
    const run = code => vm.runInContext(code, context);
    const open = ({ order, items }) => run(`
        OrderDetail.currentOrder = ${JSON.stringify(order)};
        OrderDetail.currentItems = ${JSON.stringify(items)};
        OrderDetail._beginHonestNumbers();
    `);
    const statsText = () => visibleText(dom('od-stats').innerHTML);
    const render = () => { run('OrderDetail.renderStats()'); return statsText(); };
    // «Лимон» из loadOrder + поля, по которым калькулятор считает штуку.
    const cardData = (orderId, options) => {
        const data = lemonOrderData(orderId, { ...options, order: { payment_status: 'paid_100', ...(options && options.order) } });
        data.items[0] = { ...data.items[0], pieces_per_hour: 10, weight_grams: 0, setup_hours_override: 2.1, is_blank_mold: false, base_mold_in_stock: false };
        return data;
    };
    // Мелкий текст в новых подписях и блоке не допускается (14 px и крупнее).
    const noSmallText = (html, label) => assert.ok(!/font-size:\s*1[0-3]px/.test(html), `${label}: no 10–13px text`);

    try {
        const lemon = addOrder(cardData(9601));
        open(lemon);

        // 1. «Факт» ещё считает: цифры плановые и подписаны «план», на месте себестоимости — «считаем».
        const loading = render();
        assert.ok(loading.includes('Выручка 177 000 ₽ ожидаем, если продадим 30 шт.'), loading);
        assert.ok(loading.includes('Маржа 30,6% план'), loading);
        assert.ok(loading.includes('Себестоимость … считаем по факту'), loading);
        assert.ok(loading.includes('Часы 12.1 ч'), loading);
        assert.ok(loading.includes('Оплата Оплачено 100%'), loading);
        assert.ok(loading.includes('Отдаём бесплатно: 70 шт. на 67 995 ₽ себестоимости'), loading);
        assert.deepEqual(clone(context.__realCostCalls), [], 'the card reads nothing until it asks');
        noSmallText(dom('od-stats').innerHTML, 'header while loading');

        // 2. «Факт» ответил: реальная маржа (54 200 − (121 000 − 97 135)) / 177 000 = 17,14%, рядом плановая;
        // себестоимость 121 000 ₽ против плановых 97 135 ₽; часы по плану и по табелю.
        context.__realCosts[9601] = lemonRealCost();
        await run('OrderDetail.loadRealCost()');
        assert.deepEqual(clone(context.__realCostCalls), [{ orderId: 9601, options: { fresh: true } }], 'one read with a fresh timesheet');
        const expectedRealMargin = Math.round((54200 - (121000 - 97135)) * 100 / 177000 * 100) / 100;
        assert.equal(expectedRealMargin, 17.14);
        assert.equal(run('OrderDetail.computeRealMargin(54200, 177000, 121000, 97135)'), expectedRealMargin);
        assert.equal(run('OrderDetail.computeRealMargin(54200, 0, 121000, 97135)'), null, 'no revenue — no margin');
        assert.equal(run('OrderDetail.computeRealMargin(null, 177000, 121000, 97135)'), null, 'unknown earnings — no margin');
        const ready = statsText();
        assert.ok(ready.includes('Выручка 177 000 ₽ ожидаем, если продадим 30 шт.'), ready);
        assert.ok(ready.includes('Маржа 17,1% план 30,6%'), ready);
        assert.ok(ready.includes('Себестоимость 121 000 ₽ план 97 135 ₽'), ready);
        assert.ok(ready.includes('Часы 12.1 ч план 12.1 · табель 18'), ready);
        assert.ok(ready.includes('Отдаём бесплатно: 70 шт. на 67 995 ₽ себестоимости'), ready);
        noSmallText(dom('od-stats').innerHTML, 'header with the real cost');
        render();
        assert.equal(context.__realCostCalls.length, 1, 'redrawing the header does not read «Факт» again');

        // 3. Разбивка — по клику, прямо под карточками. Зарплатные строки и «Косвенные» — тогда же, когда
        // их показывает страница «Факт» (App.isAdmin()); общая сумма и реальная маржа видны всем.
        assert.ok(!statsText().includes('Фурнитура'), 'closed until clicked');
        run('OrderDetail.toggleRealCostDetails()');
        const opened = statsText();
        assert.ok(opened.includes('Фурнитура 25 000 ₽ 28 865 ₽ по факту'), opened);
        assert.ok(opened.includes('Пластик / материалы 15 135 ₽ 15 135 ₽ по плану'), opened);
        assert.ok(opened.includes('Итого 97 135 ₽ 121 000 ₽'), opened);
        assert.ok(opened.includes('Маржа 17,1% план 30,6%'), 'the real margin stays visible to everyone');
        assert.ok(!opened.includes('NFC'), 'a row with nothing in it is not listed');
        assert.ok(!opened.includes('ЗП'), 'no salary rows for those who cannot see them on «Факт»');
        assert.ok(!opened.includes('Косвенные'), 'nor the indirect row');
        assert.ok(opened.includes('Зарплата и косвенные скрыты'), 'the missing rows are explained');
        assert.ok(!opened.includes('Табеля по заказу нет'), 'there is a timesheet');
        noSmallText(dom('od-stats').innerHTML, 'real cost details');
        // Доступ к странице «Факт» администратором не делает: у строк тот же замок, что у страницы.
        run(`App.canAccess = () => true`);
        run('OrderDetail.renderStats()');
        const factualPageOnly = statsText();
        assert.ok(!factualPageOnly.includes('ЗП') && !factualPageOnly.includes('Косвенные'), factualPageOnly);
        run(`App.canAccess = () => false; App.isAdmin = () => true`);
        run('OrderDetail.renderStats()');
        const openedAsAdmin = statsText();
        assert.ok(openedAsAdmin.includes('ЗП выливание 30 000 ₽ 42 000 ₽ по факту'), openedAsAdmin);
        assert.ok(openedAsAdmin.includes('ЗП срезание 5 000 ₽ 5 000 ₽ по плану'), openedAsAdmin);
        assert.ok(openedAsAdmin.includes('Косвенные 12 000 ₽ 20 000 ₽ по факту'), openedAsAdmin);
        assert.ok(!openedAsAdmin.includes('Зарплата и косвенные скрыты'), 'nothing is hidden from them');
        run('OrderDetail.toggleRealCostDetails()');
        assert.ok(!statsText().includes('Фурнитура'), 'closes on the second click');
        context.__cardCost = lemonRealCost();
        const withoutSalary = visibleText(run('OrderDetail.renderRealCostDetails(__cardCost, false)'));
        const withSalary = visibleText(run('OrderDetail.renderRealCostDetails(__cardCost, true)'));
        assert.ok(!withoutSalary.includes('ЗП'), withoutSalary);
        assert.ok(!withoutSalary.includes('Косвенные'), withoutSalary);
        assert.ok(withoutSalary.includes('Фурнитура'), withoutSalary);
        assert.ok(withSalary.includes('ЗП выливание'), withSalary);
        assert.ok(withSalary.includes('Косвенные'), withSalary);
        run(`App.isAdmin = () => false`);

        // 4. Табеля нет: себестоимость плановая, и шапка так и говорит (по статьям — тоже).
        context.__realCosts[9601] = lemonPlanOnlyCost();
        await run('OrderDetail.loadRealCost()');
        const noSheet = statsText();
        assert.ok(noSheet.includes('Маржа 30,6% по плану'), noSheet);
        assert.ok(noSheet.includes('Себестоимость 97 135 ₽ по плану'), noSheet);
        assert.ok(noSheet.includes('Часы 12.1 ч план 12.1 · табеля нет'), noSheet);
        run('OrderDetail.toggleRealCostDetails()');
        const noSheetRowsHidden = statsText();
        assert.ok(noSheetRowsHidden.includes('Итого 97 135 ₽ 97 135 ₽'), noSheetRowsHidden);
        assert.ok(!noSheetRowsHidden.includes('ЗП') && !noSheetRowsHidden.includes('Косвенные'), noSheetRowsHidden);
        assert.ok(noSheetRowsHidden.includes('Табеля по заказу нет — зарплата и косвенные взяты по плану.'), noSheetRowsHidden);
        run(`App.isAdmin = () => true`);
        run('OrderDetail.renderStats()');
        const noSheetRows = statsText();
        assert.ok(noSheetRows.includes('ЗП выливание 30 000 ₽ 30 000 ₽ по плану'), noSheetRows);
        assert.ok(noSheetRows.includes('Косвенные 12 000 ₽ 12 000 ₽ по плану'), noSheetRows);
        assert.ok(!noSheetRows.includes('по факту'), noSheetRows);
        assert.ok(noSheetRows.includes('Табеля по заказу нет — зарплата и косвенные взяты по плану.'), noSheetRows);
        run('OrderDetail.toggleRealCostDetails()');
        run(`App.isAdmin = () => false`);

        // 5. «Факт» не ответил: шапка остаётся плановой, подписана «план», карточки себестоимости нет.
        context.__realCosts[9601] = new Error('timesheet unavailable');
        open(lemon);
        const warn = console.warn;
        console.warn = () => {};
        try {
            await run('OrderDetail.loadRealCost()');
        } finally {
            console.warn = warn;
        }
        const failed = render();
        assert.ok(failed.includes('Маржа 30,6% план'), failed);
        assert.ok(!failed.includes('Себестоимость'), failed);
        assert.equal(run('OrderDetail.currentRealCost'), null);

        // 6. Доска считает плановую маржу и говорит об этом; у «Переделки» там убыток, а не маржа.
        const lemonFinancial = clone(run(`Orders.buildFinancialMeta(${JSON.stringify(lemon.order)}, ${JSON.stringify(lemon.items)})`));
        assert.equal(lemonFinancial.marginPercent, 30.62);
        run(`Orders.metaByOrderId = { 9601: { financial: ${JSON.stringify(lemonFinancial)} } }`);
        const board = visibleText(run(`Orders.renderBoardCard(${JSON.stringify(lemon.order)})`));
        assert.ok(board.includes('30,6% план'), board);
        assert.ok(board.includes('177 000 ₽'), board);
        const reworkOrder = { ...lemon.order, id: 9610, production_purpose: 'rework' };
        run(`Orders.metaByOrderId = { 9610: { financial: ${JSON.stringify({ revenue: 0, marginPercent: 0, hours: 12.1, purpose: 'rework', loss: 97135 })} } }`);
        const reworkBoard = visibleText(run(`Orders.renderBoardCard(${JSON.stringify(reworkOrder)})`));
        assert.ok(reworkBoard.includes('−97 135 ₽'), reworkBoard);
        assert.ok(!reworkBoard.includes('план'), reworkBoard);

        // 7. Блок «Тираж» на вкладке «Информация»: разметка строки; пока на складе ничего нет — ни строки
        // склада, ни кнопки.
        open(lemon);
        const block = visibleText(run('OrderDetail.renderTirageInfo()'));
        assert.ok(block.includes('Тираж'), block);
        assert.ok(block.includes('Лимон'), block);
        assert.ok(block.includes('клиенту 0 · на продажу 30 по 5 900 ₽ · партнёру 50 (художница) · в подарок 20'), block);
        assert.ok(!block.includes('На складе'), block);
        assert.ok(!block.includes('Пересчитать себестоимость'), block);
        noSmallText(run('OrderDetail.renderTirageInfo()'), 'tirage block');
        run('OrderDetail.renderInfoTab()');
        assert.ok(dom('od-tab-info').innerHTML.includes('id="od-tirage-slot"'));
        assert.ok(visibleText(dom('od-tab-info').innerHTML).includes('клиенту 0 · на продажу 30 по 5 900 ₽ · партнёру 50 (художница) · в подарок 20'));
        // Примечания к «партнёру» и «в подарок» — свободный текст, он экранируется.
        const noted = cardData(9611, { tirage: { partner_note: '<b>Маша</b>', gift_note: 'клиентам', sample: 3, stock: 0, partner: 40, gift: 10 } });
        open(noted);
        const notedHtml = run('OrderDetail.renderTirageInfo()');
        assert.ok(!notedHtml.includes('<b>Маша</b>'), 'a note is never markup');
        assert.ok(visibleText(notedHtml).includes('клиенту 47 · партнёру 40 (&lt;b&gt;Маша&lt;/b&gt;) · в подарок 10 (клиентам) · образцы 3'), visibleText(notedHtml));
        open(lemon);

        // 8. Заказ ушёл в «Готово»: 30 «Лимонов» встали на склад по реальной себестоимости (121 000 / 30).
        context.__realCosts[9601] = lemonRealCost();
        assert.equal(await run(`Warehouse.moveOrderToReadyGoods(9601, 'Лимон')`), 1);
        const savesBefore = clone(base.saves);
        const loadsBefore = clone(base.loads);
        assert.deepEqual(clone(await run('Warehouse.getOrderTirageStockSummary(9601)')),
            { inStock: 30, total: 30, frozen: 120999.9, soldQty: 0, soldRevenue: 0 });
        assert.deepEqual(clone(base.saves), savesBefore, 'the summary writes nothing');
        assert.deepEqual(
            [base.loads.stock - loadsBefore.stock, base.loads.sales - loadsBefore.sales, base.loads.history - loadsBefore.history],
            [1, 1, 0], 'one read of the stock and one of the sales');
        assert.deepEqual(clone(await run('Warehouse.getOrderTirageStockSummary(9999)')),
            { inStock: 0, total: 0, frozen: 0, soldQty: 0, soldRevenue: 0 }, 'an order without positions');
        await run('OrderDetail.loadTirageStock()');
        const onStock = visibleText(run('OrderDetail.renderTirageInfo()'));
        assert.ok(onStock.includes('На складе 30 из 30 · заморожено 121 000 ₽ · продано 0'), onStock);
        assert.ok(onStock.includes('Пересчитать себестоимость'), onStock);
        assert.equal(visibleText(dom('od-tirage-slot').innerHTML), onStock, 'the block is redrawn in place');
        noSmallText(dom('od-tirage-slot').innerHTML, 'tirage block with the stock');

        // 9. Продали 5 штук за 29 500 ₽: на складе 25 из 30, заморожена себестоимость только непроданных.
        const positionId = base.lists.stock.find(row => Number(row.order_id) === 9601).id;
        base.lists.sales = [{ id: 3, ready_goods_id: positionId, product_name: 'Лимон', qty: 5, cost_per_unit: 4033.33, revenue: 29500, payout: 29000 }];
        base.lists.stock = base.lists.stock.map(row => (Number(row.order_id) === 9601 ? { ...row, qty: 25 } : row));
        await run('OrderDetail.loadTirageStock()');
        const afterSale = visibleText(run('OrderDetail.renderTirageInfo()'));
        assert.ok(afterSale.includes('На складе 25 из 30 · заморожено 100 833 ₽ · продано 5 на 29 500 ₽'), afterSale);

        // 9a. Склад не прочитался (общая база не ответила): это не «на складе пусто». Настоящая загрузка
        // тогда помечает список «недоступно» и отдаёт пустой — читатель отвечает ошибкой, а блок остаётся
        // как был, вместе с кнопкой. История склада читателю не нужна: без неё он читает как обычно.
        const shownBefore = visibleText(dom('od-tirage-slot').innerHTML);
        const tirageStockBefore = clone(run('OrderDetail.tirageStock'));
        assert.deepEqual(tirageStockBefore, { inStock: 25, total: 30, frozen: 100833.25, soldQty: 5, soldRevenue: 29500 });
        const stockLoader = context.loadReadyGoods;
        const salesLoader = context.loadSalesRecords;
        context.loadReadyGoods = async () => { const rows = await stockLoader(); return base.unavailable.has('stock') ? [] : rows; };
        context.loadSalesRecords = async () => { const rows = await salesLoader(); return base.unavailable.has('sales') ? [] : rows; };
        const cardWarn = console.warn;
        console.warn = () => {};
        try {
            for (const list of ['stock', 'sales']) {
                base.unavailable.add(list);
                const outcome = await run(`Warehouse.getOrderTirageStockSummary(9601).then(() => 'resolved', error => String(error.message))`);
                assert.equal(outcome, 'READY_GOODS_SHARED_UNAVAILABLE', `${list}: an unreadable store is not an empty stock`);
                await run('OrderDetail.loadTirageStock()');
                assert.equal(visibleText(dom('od-tirage-slot').innerHTML), shownBefore, `${list}: the block stays as it was`);
                assert.deepEqual(clone(run('OrderDetail.tirageStock')), tirageStockBefore, `${list}: and so does what it shows`);
                assert.ok(visibleText(run('OrderDetail.renderTirageInfo()')).includes('Пересчитать себестоимость'), `${list}: the button stays`);
                base.unavailable.delete(list);
            }
            // Нет истории — читателю всё равно: он её не читает.
            base.unavailable.add('history');
            assert.deepEqual(clone(await run('Warehouse.getOrderTirageStockSummary(9601)')), tirageStockBefore, 'history is not read, so it does not matter');
            base.unavailable.delete('history');
            // Первое чтение не удалось: у блока нет строки склада, но он не падает и разметка на месте.
            open(lemon);
            base.unavailable.add('stock');
            await run('OrderDetail.loadTirageStock()');
            const noStockLine = visibleText(run('OrderDetail.renderTirageInfo()'));
            assert.ok(noStockLine.includes('клиенту 0 · на продажу 30 по 5 900 ₽'), noStockLine);
            assert.ok(!noStockLine.includes('На складе'), noStockLine);
            assert.equal(run('OrderDetail.tirageStock'), null);
        } finally {
            console.warn = cardWarn;
            context.loadReadyGoods = stockLoader;
            context.loadSalesRecords = salesLoader;
            base.unavailable.clear();
        }
        // База снова отвечает: тот же вызов видит склад.
        await run('OrderDetail.loadTirageStock()');
        assert.equal(visibleText(dom('od-tirage-slot').innerHTML), shownBefore);

        // 10. «Пересчитать себестоимость»: ФинТабло догнал — у непроданных 25 штук 150 000 / 30 = 5 000 ₽,
        // записи продаж не тронуты, шапка читает «Факт» заново.
        context.__realCosts[9601] = lemonRealCost({ realTotal: 150000 });
        context.__realCostCalls = [];
        context.__toasts = [];
        const salesBefore = clone(base.lists.sales);
        await run('OrderDetail.recalcTirageCost()');
        assert.equal(base.lists.stock.find(row => Number(row.order_id) === 9601).cost_per_unit, 5000);
        assert.deepEqual(clone(base.lists.sales), salesBefore, 'recorded sales keep their cost');
        assert.deepEqual(clone(context.__realCostCalls), [
            { orderId: 9601, options: { fresh: true } },
            { orderId: 9601, options: { fresh: true } },
        ], 'the stock and the header both read a fresh «Факт»');
        assert.deepEqual(clone(context.__toasts), ['Себестоимость непроданных штук пересчитана']);
        assert.ok(visibleText(run('OrderDetail.renderTirageInfo()')).includes('На складе 25 из 30 · заморожено 125 000 ₽ · продано 5 на 29 500 ₽'));
        assert.ok(statsText().includes('Себестоимость 150 000 ₽'), 'the header follows the new real cost');
        assert.equal(run('OrderDetail.tirageRecalcBusy'), false);
        // Нечего менять — так и сказано.
        context.__toasts = [];
        await run('OrderDetail.recalcTirageCost()');
        assert.deepEqual(clone(context.__toasts), ['Себестоимость не изменилась']);
        // Нет связи с общей базой — не молчим, кнопка снова доступна.
        context.__realCosts[9601] = lemonRealCost({ realTotal: 160000 });
        base.failSaves.add('stock');
        context.__toasts = [];
        const errorLog = console.error;
        console.error = () => {};
        try {
            await run('OrderDetail.recalcTirageCost()');
        } finally {
            console.error = errorLog;
            base.failSaves.clear();
        }
        assert.deepEqual(clone(context.__toasts), ['Не удалось пересчитать себестоимость — нет связи с общей базой. Попробуйте ещё раз.']);
        assert.equal(run('OrderDetail.tirageRecalcBusy'), false);
        assert.equal(base.lists.stock.find(row => Number(row.order_id) === 9601).cost_per_unit, 5000, 'nothing half-written');

        // 11. Всё продано — пересчитывать нечего, кнопки нет, а проданное видно.
        base.lists.stock = base.lists.stock.map(row => (Number(row.order_id) === 9601 ? { ...row, qty: 0 } : row));
        base.lists.sales = [{ id: 3, ready_goods_id: positionId, product_name: 'Лимон', qty: 30, revenue: 177000 }];
        await run('OrderDetail.loadTirageStock()');
        const soldOut = visibleText(run('OrderDetail.renderTirageInfo()'));
        assert.ok(soldOut.includes('На складе 0 из 30 · заморожено 0 ₽ · продано 30 на 177 000 ₽'), soldOut);
        assert.ok(!soldOut.includes('Пересчитать себестоимость'), soldOut);

        // 12. Без разметки блока нет и склад не читается; шапка без «Отдаём бесплатно» и «ожидаем».
        const plain = cardData(9602, { order: { client_name: 'ООО Груша' } });
        plain.items[0].tirage_allocation = null;
        addOrder(plain);
        open(plain);
        assert.equal(run('OrderDetail.renderTirageInfo()'), '');
        const loadsBeforePlain = clone(base.loads);
        await run('OrderDetail.loadTirageStock()');
        assert.deepEqual(clone(base.loads), loadsBeforePlain, 'nothing is for sale — the stock is not read');
        const plainStats = render();
        assert.ok(plainStats.includes('Выручка 590 000 ₽'), plainStats);
        assert.ok(!plainStats.includes('ожидаем'), plainStats);
        assert.ok(!plainStats.includes('Отдаём бесплатно'), plainStats);
        run('OrderDetail.renderInfoTab()');
        assert.ok(!dom('od-tab-info').innerHTML.includes('id="od-tirage-card"'), 'no block on an order without a split');

        // B2C разметку не использует: блока нет, деньги не разделены.
        const b2c = addOrder(cardData(9603, { order: { client_name: 'B2C' } }));
        open(b2c);
        assert.equal(run('OrderDetail.renderTirageInfo()'), '');
        const b2cStats = render();
        assert.ok(b2cStats.includes('Выручка 590 000 ₽'), b2cStats);
        assert.ok(!b2cStats.includes('ожидаем'), b2cStats);
        assert.ok(!b2cStats.includes('Отдаём бесплатно'), b2cStats);

        // «Переделка» и «Сборка из остатков» — как раньше: ни блока, ни себестоимости, «Факт» не читается.
        context.__realCostCalls = [];
        const rework = addOrder(cardData(9604, { order: { production_purpose: 'rework' } }));
        open(rework);
        assert.equal(run('OrderDetail.renderTirageInfo()'), '');
        assert.equal(run('OrderDetail.realCostState'), 'none');
        await run('OrderDetail.loadRealCost()');
        await run('OrderDetail.loadTirageStock()');
        const reworkStats = render();
        assert.ok(reworkStats.includes('Некоммерческие расходы −97 135 ₽'), reworkStats);
        assert.ok(reworkStats.includes('Тип работ ↻ Переделка брака'), reworkStats);
        assert.ok(!reworkStats.includes('Себестоимость'), reworkStats);
        assert.ok(!reworkStats.includes('план'), reworkStats);
        assert.ok(!reworkStats.includes('Отдаём бесплатно'), reworkStats);
        const leftover = addOrder({
            order: { id: 9605, order_name: 'Сборка', client_name: 'ООО Груша', status: 'draft', production_purpose: 'leftover_assembly',
                leftover_assembly: { revenue: 5000, quantity: 10, assembly_hours: 2, details: 'остатки' } },
            items: [],
        });
        open(leftover);
        assert.equal(run('OrderDetail.renderTirageInfo()'), '');
        await run('OrderDetail.loadRealCost()');
        const leftoverStats = render();
        assert.ok(leftoverStats.includes('Тип работ ↙ Сборка из остатков'), leftoverStats);
        assert.ok(!leftoverStats.includes('Себестоимость'), leftoverStats);
        assert.ok(!leftoverStats.includes('план'), leftoverStats);
        assert.deepEqual(clone(context.__realCostCalls), [], 'the real cost is read for client orders only');

        // 13. Ответ «Факта» по уже закрытой карточке на чужую не ложится.
        context.__realCosts[9601] = lemonRealCost();
        open(lemon);
        const pending = run('OrderDetail.loadRealCost()');
        open(plain);
        await pending;
        assert.equal(run('OrderDetail.currentRealCost'), null);
        assert.equal(run('OrderDetail.realCostState'), 'loading', 'the other card is still waiting for its own answer');
        // То же со складом: «Лимон» ещё читается, а открыта уже другая карточка.
        open(lemon);
        const pendingStock = run('OrderDetail.loadTirageStock()');
        open(plain);
        await pendingStock;
        assert.equal(run('OrderDetail.tirageStock'), null);

        // 14. «Готово» прямо в карточке: как только переход закончен, блок «Тираж» показывает склад.
        context.__realCosts[9606] = lemonRealCost();
        const delivered = addOrder(cardData(9606, { order: { status: 'delivery' } }));
        open(delivered);
        await run('OrderDetail.loadTirageStock()');
        assert.ok(!visibleText(dom('od-tirage-slot').innerHTML).includes('На складе'), 'nothing on the stock yet');
        const completedChoice = clone(run(`STATUS_OPTIONS.filter(option => option.value !== 'deleted' && option.value !== 'delivery').map(option => option.value)`)).indexOf('completed') + 1;
        assert.ok(completedChoice > 0, '«Готово» is one of the statuses');
        run(`
            globalThis.__promptQueue = [${JSON.stringify(String(completedChoice))}, 'Smoke'];
            globalThis.prompt = () => globalThis.__promptQueue.shift() || '';
            globalThis.updateOrderStatus = async () => {};
            Orders._ensureStatusTransitionAllowed = async () => ({ ok: true });
            Orders._finishStatusTransition = async (orderId, order) => { await Warehouse.moveOrderToReadyGoods(orderId, order.order_name); };
        `);
        await run('OrderDetail.changeStatus()');
        assert.equal(run('OrderDetail.currentOrder.status'), 'completed');
        assert.ok(visibleText(dom('od-tirage-slot').innerHTML).includes('На складе 30 из 30 · заморожено 121 000 ₽ · продано 0'), visibleText(dom('od-tirage-slot').innerHTML));
        delete context.__promptQueue;
    } finally {
        Object.assign(context, originals);
        delete context.Factual;
        ['__realCosts', '__realCostCalls', '__toasts', '__cardCost'].forEach(name => { delete context[name]; });
        vm.runInContext(`
            App.params = globalThis.__cardOriginals.params;
            App.canAccess = globalThis.__cardOriginals.canAccess;
            App.isAdmin = globalThis.__cardOriginals.isAdmin;
            App.toast = globalThis.__cardOriginals.toast;
            Orders.metaByOrderId = globalThis.__cardOriginals.metaByOrderId;
            Orders._ensureStatusTransitionAllowed = globalThis.__cardOriginals.ensureAllowed;
            Orders._finishStatusTransition = globalThis.__cardOriginals.finishTransition;
            globalThis.updateOrderStatus = globalThis.__cardOriginals.updateOrderStatus;
            globalThis.prompt = globalThis.__cardOriginals.prompt;
            Object.assign(OrderDetail, globalThis.__cardOriginals.card);
            delete globalThis.__cardOriginals;
        `, context);
        Object.entries(domBefore).forEach(([id, html]) => { dom(id).innerHTML = html; });
    }
}

async function main() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js', 'js/molds.js'].forEach(file => runScript(context, file));
    stubRuntime(context);
    vm.runInContext('globalThis.__originalRenderItemBlock = Calculator.renderItemBlock;', context);

    await smokeCalculatorPersistence(context);
    await smokeCustomCompositePersistence(context);
    await smokeCustomCompositeEditing(context);
    await smokeCustomCompositeToggleSafety(context);
    await smokeTirageAllocationPersistsAndInvoices(context);
    await smokeTirageBlockUi(context);
    await smokeTirageCalculatorSummary(context);
    await smokeSaveRemapsParentIndexesPastEmptyRows(context);
    await smokeTirageB2CIgnoresSplit(context);
    await smokeEmptyPlaceholderProductIsNotSaved(context);
    await smokeHardwareOnlyAutosave(context);
    await smokeCalculatorLocalDraftSurvivesRefresh(context);
    await smokeLegacyLocalDraftRestoresAsNewOrder(context);
    await smokeNewDraftAutosaveAndManualSaveShareReservedId(context);
    await smokeManualSaveInvalidatesPreparedAutosave(context);
    await smokeLegacyProductionStatusAppearsInOrdersViews(context);
    await smokeZeroCostWarehouseHardwareStillShowsInPricing(context);
    await smokeLoadOrderHydratesZeroWarehousePriceFromCurrentStock(context);
    await smokeLegacyPerItemHardwareClearsBuiltinTemplateHardware(context);
    await smokeOrderListAndDetailUseLiveFinancialSnapshot(context);
    await smokeOrderListUsesStoredFinancialMetaWhenItemsMissing(context);
    await smokeOrderListRejectsPartialTextSummary(context);
    await smokeOrderListSummaryMatchesCardForAllInputs(context);
    await smokeOrderMetaBundleUsesLightItemsForHardware(context);
    await smokeBlankPricingSeparatesCatalogPriceAndNetMargin(context);
    await smokeNfcBlankPricingMatchesCatalogTier(context);
    await smokeBlankTargetFormulaMatchesVatExclusiveMargin(context);
    await smokeWarehouseBackedNfcDoesNotDoubleCountFallback(context);
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
    await smokeOrderItemsLossGuard(context);
    await smokeSavedBlankMoldCostSurvivesOrderReload(context);
    await smokeStandaloneLetterBlankUsesPendantTierPricing(context);
    await smokeNonCommercialPurposeTurnsSalesIntoInternalLoss(context);
    await smokePendantFinDirectorUsesCurrentLetterCost(context);
    await smokeLegacyPendantRestore(context);
    await smokeCurrentPendantPayloadBeatsStaleNested(context);
    await smokeCloneOrderRestoresLegacySnapshotItems(context);
    await smokeCloneOrderPrefersNormalizedItems(context);
    await smokeReadyGoodsRollback(context);
    await smokeReadyGoodsSalesAndManualAdd(context);
    await smokeReadyGoodsWritersReportFailedSave(context);
    // Before the status smokes below: they replace Orders status helpers for good.
    await smokeTirageReadyGoodsTransfer(context);
    await smokeTirageReadyGoodsSyncToSplit(context);
    await smokeTirageCompletedOrderSaveFollowsReadyGoods(context);
    await smokeProductionPlanStatusSyncsReadyGoods(context);
    await smokeReadyGoodsRecordsCreatedInOneMillisecondKeepTheirIds(context);
    await smokeTiragePositionsFollowTheirLine(context);
    await smokeOrderCardTirageAndRealMargin(context);
    await smokeChinaShipmentMetadata(context);
    await smokeChinaReceiptStatusLinkage(context);
    await smokeChinaReceiptBlocksWeakAutoCreatedItems(context);
    await smokeChinaReceiptCreatesMoldAndPromotesOrder(context);
    await smokeBlankMoldAutoFieldsWithoutVisibleTemplate(context);
    await smokeOrderStatusWarehouseSync(context);
    await smokeStatusTransitionConfirmsPrimaryWriteBeforeSideEffects(context);
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
    await smokeWarehouseInlineQtyUsesLatestCloudQty(context);
    await smokeWarehouseReserveLabelsShowSource(context);
    await smokeWarehouseStockTruthShowsAvailableAndCorrections(context);
    await smokeWarehouseProjectReserveCannotBeEditedInline(context);
    await smokeWarehouseLoadRendersBeforeBackgroundSync();
    await smokeWarehouseViewsShowLoadingImmediately();
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
    await smokeCompletedUnreadyProjectHardwareCanBeWrittenOff(context);
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

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
        scrollIntoView() {},
    };
}

function createDocument() {
    const elements = new Map();
    return {
        body: createElement('body'),
        activeElement: null,
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
        alert: () => {},
        App: {
            init() {},
            toast() {},
            navigate() {},
            formatDate(value) { return String(value || ''); },
            getCurrentEmployeeName() { return 'Smoke'; },
            todayLocalYMD() { return '2026-05-05'; },
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
        loadProjectHardwareState: async () => ({ checks: {}, actual_qtys: {} }),
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
        saveChinaPurchase: async () => {},
        loadChinaOrders: async () => [],
        saveShipment: async () => 1,
        deleteShipment: async () => {},
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

function buildWarehouseContext() {
    const context = createContext();
    ['js/calculator.js', 'js/app.js', 'js/orders.js', 'js/warehouse.js', 'js/order-detail.js'].forEach(file => runScript(context, file));
    vm.runInContext(`
        App.toast = (message) => {
            if (!globalThis.__toasts) globalThis.__toasts = [];
            globalThis.__toasts.push(String(message || ''));
        };
        App.getCurrentEmployeeName = () => 'Smoke';
        Warehouse.load = async () => {};
        Warehouse.hideForm = () => {};
        Warehouse._loadMoldOrders = async () => {};
        Warehouse._syncMoldFieldsVisibility = () => {};
        Warehouse._syncWarehouseFormMoldDerivedFields = () => {};
        Warehouse.updatePhotoPreview = () => {};
    `, context);
    return context;
}

function setInputValues(context, values) {
    Object.entries(values).forEach(([id, value]) => {
        context.document.getElementById(id).value = value;
    });
}

async function smokeManualFormQtyUsesLatestSharedStock() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [{
        id: 1001,
        name: 'Latest Shared Qty',
        sku: 'WH-MIG-1001',
        category: 'hardware',
        unit: 'шт',
        qty: 4,
        min_qty: 0,
        price_per_unit: 7,
        notes: 'remote',
        updated_at: '2026-05-05T10:00:00.000Z',
    }];
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

    setInputValues(context, {
        'wh-f-category': 'hardware',
        'wh-f-name': 'Latest Shared Qty',
        'wh-f-sku': 'WH-MIG-1001',
        'wh-f-size': '',
        'wh-f-color': '',
        'wh-f-unit': 'шт',
        'wh-f-photo-url': '',
        'wh-f-qty': '1',
        'wh-f-min-qty': '0',
        'wh-f-price': '7',
        'wh-f-notes': 'edited',
        'wh-f-mold-type': 'blank',
        'wh-f-mold-linked-order-id': '',
        'wh-f-mold-capacity-total': '',
        'wh-f-mold-capacity-used': '',
        'wh-f-mold-arrived-at': '',
        'wh-f-mold-storage-until': '',
    });

    vm.runInContext(`
        Warehouse.editingId = 1001;
        Warehouse.allItems = [{
            id: 1001,
            name: 'Latest Shared Qty',
            sku: 'WH-MIG-1001',
            category: 'hardware',
            unit: 'шт',
            qty: 10,
            min_qty: 0,
            price_per_unit: 7,
            notes: 'stale rendered qty'
        }];
    `, context);

    await vm.runInContext(`Warehouse.saveItem()`, context);

    assert.equal(context.__warehouseItems[0].qty, 1);
    assert.equal(context.__warehouseItems[0].notes, 'edited');
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_before, 4);
    assert.equal(context.__warehouseHistory[0].qty_after, 1);
    assert.equal(context.__warehouseHistory[0].requested_qty_change, -3);
    assert.equal(context.__warehouseHistory[0].qty_change, -3);
    assert.equal(context.__warehouseHistory[0].clamped, false);
}

async function smokeProjectHardwareReadyToggleIsIdempotent() {
    const context = buildWarehouseContext();
    const order = {
        id: 2001,
        order_name: 'Migration Ready Toggle',
        manager_name: 'Smoke',
        status: 'production_hardware',
    };
    context.__warehouseItems = [{
        id: 3001,
        name: 'Toggle Ring',
        sku: 'WH-MIG-3001',
        category: 'hardware',
        unit: 'шт',
        qty: 10,
        price_per_unit: 5,
    }];
    context.__reservations = [{
        id: 1,
        item_id: 3001,
        order_id: 2001,
        order_name: order.order_name,
        qty: 3,
        status: 'active',
        source: 'project_hardware',
        created_at: '2026-05-05T10:00:00.000Z',
    }];
    context.__warehouseHistory = [];
    context.__projectHardwareState = { checks: {}, actual_qtys: {} };
    context.__orderDetails = {
        2001: {
            order,
            items: [{
                item_type: 'hardware',
                product_name: 'Toggle Ring',
                quantity: 3,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 3001,
            }],
        },
    };
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItem = async (item) => {
        context.__warehouseItems = context.__warehouseItems.map(entry => Number(entry.id) === Number(item.id) ? clone(item) : entry);
        return item.id;
    };
    context.saveWarehouseItems = async (items) => { context.__warehouseItems = clone(items); };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => { context.__warehouseHistory = clone(history); };
    context.loadWarehouseReservations = async () => clone(context.__reservations);
    context.saveWarehouseReservations = async (reservations) => { context.__reservations = clone(reservations); };
    context.loadProjectHardwareState = async () => clone(context.__projectHardwareState);
    context.saveProjectHardwareState = async (state) => { context.__projectHardwareState = clone(state); };
    context.loadOrder = async (orderId) => clone(context.__orderDetails[Number(orderId)] || null);

    vm.runInContext(`Warehouse.projectHardwareState = null;`, context);

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(2001, 3001, true)`, context);
    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(2001, 3001, true)`, context);

    assert.equal(context.__warehouseItems[0].qty, 7);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_change, -3);
    assert.equal(context.__reservations.filter(row => row.status === 'active').length, 0);
    assert.equal(Boolean(context.__projectHardwareState.checks['2001:3001']), true);

    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(2001, 3001, false)`, context);
    await vm.runInContext(`Warehouse.toggleProjectHardwareReady(2001, 3001, false)`, context);

    assert.equal(context.__warehouseItems[0].qty, 10);
    assert.equal(context.__warehouseHistory.length, 2);
    assert.equal(context.__warehouseHistory[1].qty_change, 3);
    assert.equal(context.__reservations.filter(row => row.status === 'active').length, 1);
    assert.equal(context.__reservations.find(row => row.status === 'active').qty, 3);
    assert.equal(Boolean(context.__projectHardwareState.checks['2001:3001']), false);
}

async function smokeShipmentRepostAppliesOnlyDelta() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [{
        id: 4001,
        name: 'Receipt Ring',
        sku: 'WH-MIG-4001',
        category: 'hardware',
        unit: 'шт',
        qty: 10,
        price_per_unit: 5,
    }];
    context.__warehouseHistory = [];
    context.__savedShipment = null;
    context.__shipments = [{
        id: 5001,
        shipment_name: 'Existing Receipt',
        status: 'received',
        items: [{
            warehouse_item_id: 4001,
            name: 'Receipt Ring',
            category: 'hardware',
            qty_received: 2,
            total_cost_per_unit: 5,
        }],
    }];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItem = async (item) => {
        context.__warehouseItems = context.__warehouseItems.map(entry => Number(entry.id) === Number(item.id) ? clone(item) : entry);
        return item.id;
    };
    context.saveWarehouseItems = async (items) => { context.__warehouseItems = clone(items); };
    context.loadWarehouseHistory = async () => clone(context.__warehouseHistory);
    context.saveWarehouseHistory = async (history) => { context.__warehouseHistory = clone(history); };
    context.saveShipment = async (shipment) => {
        context.__savedShipment = clone(shipment);
        context.__shipments = context.__shipments.map(entry => Number(entry.id) === Number(shipment.id) ? clone(shipment) : entry);
        return shipment.id;
    };

    setInputValues(context, {
        'wh-sh-name': 'Existing Receipt',
        'wh-sh-date': '2026-05-05',
        'wh-sh-supplier': 'China',
        'wh-sh-currency': 'RUB',
        'wh-sh-rate': '1',
        'wh-sh-delivery': '0',
        'wh-sh-notes': '',
    });

    vm.runInContext(`
        Warehouse.editingShipmentId = 5001;
        Warehouse.allShipments = globalThis.__shipments.map(item => ({ ...item }));
        Warehouse.shipmentItems = [{
            warehouse_item_id: 4001,
            name: 'Receipt Ring',
            category: 'hardware',
            qty_received: 5,
            total_cost_per_unit: 5,
            source: 'existing'
        }];
        Warehouse.hideShipmentForm = () => {};
        Warehouse.setView = () => {};
    `, context);

    await vm.runInContext(`Warehouse.confirmShipment()`, context);

    assert.equal(context.__savedShipment.status, 'received');
    assert.equal(context.__warehouseItems[0].qty, 13);
    assert.equal(context.__warehouseHistory.length, 1);
    assert.equal(context.__warehouseHistory[0].qty_before, 10);
    assert.equal(context.__warehouseHistory[0].qty_after, 13);
    assert.equal(context.__warehouseHistory[0].qty_change, 3);
    assert.match(context.__warehouseHistory[0].notes, /Перепроведение приёмки: было 2, стало 5/);
}

async function smokeChinaShipmentInfersSupplyCategories() {
    const context = createContext();
    runScript(context, 'js/china.js');

    const items = clone(vm.runInContext(`ChinaPurchases._buildShipmentItemsFromPurchases([{
        id: 7101,
        purchase_name: 'Фурнитура на склад',
        delivery_cost_cny: 0,
        items: [
            { name: 'Шнур серый', qty: 15000, price_cny: 0.02 },
            { name: 'Карабин голубой', qty: 3000, price_cny: 0.04 },
            { name: 'Пакет zip', qty: 1000, price_cny: 0.01 }
        ]
    }])`, context));

    assert.equal(items[0].category, 'cords');
    assert.equal(items[1].category, 'carabiners');
    assert.equal(items[2].category, 'packaging');
}

async function smokeShipmentCreatesSpecificSupplyWithoutSku() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [];
    context.__savedWarehouseItem = null;
    context.__savedShipment = null;
    context.__adjustStockCalls = [];
    context.confirm = () => true;
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItem = async (item) => {
        const saved = { ...clone(item), id: item.id || 7001 };
        context.__savedWarehouseItem = clone(saved);
        context.__warehouseItems.push(clone(saved));
        return saved.id;
    };
    context.saveShipment = async (shipment) => {
        context.__savedShipment = clone(shipment);
        return shipment.id || 8001;
    };

    setInputValues(context, {
        'wh-sh-name': 'China Hardware Receipt',
        'wh-sh-date': '2026-05-12',
        'wh-sh-supplier': 'China',
        'wh-sh-cny-rate': '12',
        'wh-sh-fee-cashout': '0',
        'wh-sh-fee-crypto': '0',
        'wh-sh-fee-1688': '0',
        'wh-sh-delivery-china': '0',
        'wh-sh-delivery-moscow': '0',
        'wh-sh-total-delivery': '0',
        'wh-sh-pricing-mode': 'weighted_avg',
        'wh-sh-notes': '',
    });

    vm.runInContext(`
        Warehouse.editingShipmentId = null;
        Warehouse.allShipments = [];
        Warehouse.shipmentItems = [{
            source: 'new',
            category: 'cords',
            name: 'Шнур серый',
            sku: '',
            color: '',
            size: '',
            unit: 'шт',
            qty_received: 15000,
            weight_grams: 1200,
            purchase_price_cny: 300,
            purchase_price_rub: 0,
            delivery_allocated: 0,
            total_cost_per_unit: 0.24,
        }];
        Warehouse.adjustStock = async (itemId, delta, type, refName, note) => {
            globalThis.__adjustStockCalls.push({ itemId, delta, type, refName, note });
        };
        Warehouse.hideShipmentForm = () => {};
        Warehouse.setView = () => {};
    `, context);

    await vm.runInContext(`Warehouse.confirmShipment()`, context);

    assert.equal(context.__savedWarehouseItem.name, 'Шнур серый');
    assert.equal(context.__savedWarehouseItem.category, 'cords');
    assert.equal(context.__savedShipment.status, 'received');
    assert.equal(context.__savedShipment.items[0].warehouse_item_id, 7001);
    assert.equal(context.__adjustStockCalls[0].itemId, 7001);
    assert.equal(context.__adjustStockCalls[0].delta, 15000);
}

async function smokeShipmentMatchesExistingItemByExactSkuAcrossWrongCategory() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [{
        id: 8301,
        name: 'Шнур с силик. наконечником',
        sku: 'SLS-800-OR-NN',
        category: 'cords',
        size: '80 см',
        color: 'оранжевый',
        unit: 'шт',
        qty: 222,
        price_per_unit: 23,
    }];
    context.__savedShipment = null;
    context.__adjustStockCalls = [];
    context.__saveWarehouseItemCalls = 0;
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.saveWarehouseItem = async () => {
        context.__saveWarehouseItemCalls += 1;
        throw new Error('confirmShipment should reuse the existing SKU instead of creating a duplicate warehouse item');
    };
    context.saveWarehouseItems = async (items) => { context.__warehouseItems = clone(items); };
    context.saveShipment = async (shipment) => {
        context.__savedShipment = clone(shipment);
        return shipment.id || 8401;
    };

    setInputValues(context, {
        'wh-sh-name': 'China Duplicate SKU Receipt',
        'wh-sh-date': '2026-05-18',
        'wh-sh-supplier': 'China',
        'wh-sh-cny-rate': '12',
        'wh-sh-fee-cashout': '0',
        'wh-sh-fee-crypto': '0',
        'wh-sh-fee-1688': '0',
        'wh-sh-delivery-china': '0',
        'wh-sh-delivery-moscow': '0',
        'wh-sh-total-delivery': '0',
        'wh-sh-pricing-mode': 'weighted_avg',
        'wh-sh-notes': '',
    });

    vm.runInContext(`
        Warehouse.editingShipmentId = null;
        Warehouse.allShipments = [];
        Warehouse.shipmentItems = [{
            source: 'new',
            category: 'carabiners',
            name: 'Шнуры с силиконовыми наконечниками',
            sku: ' SLS-800-OR-NN ',
            color: '',
            size: '',
            unit: 'шт',
            qty_received: 10,
            weight_grams: 100,
            purchase_price_cny: 0,
            purchase_price_rub: 0,
            delivery_allocated: 0,
            total_cost_per_unit: 55.3,
        }];
        Warehouse.adjustStock = async (itemId, delta, type, refName, note) => {
            globalThis.__adjustStockCalls.push({ itemId, delta, type, refName, note });
        };
        Warehouse.hideShipmentForm = () => {};
        Warehouse.setView = () => {};
    `, context);

    await vm.runInContext(`Warehouse.confirmShipment()`, context);

    assert.equal(context.__saveWarehouseItemCalls, 0);
    assert.equal(context.__savedShipment.status, 'received');
    assert.equal(context.__savedShipment.items.length, 1);
    assert.equal(context.__savedShipment.items[0].warehouse_item_id, 8301);
    assert.equal(context.__savedShipment.items[0].category, 'cords');
    assert.equal(context.__savedShipment.items[0].name, 'Шнур с силик. наконечником');
    assert.equal(context.__savedShipment.items[0].size, '80 см');
    assert.equal(context.__savedShipment.items[0].color, 'оранжевый');
    assert.equal(context.__adjustStockCalls.length, 1);
    assert.equal(context.__adjustStockCalls[0].itemId, 8301);
    assert.equal(context.__adjustStockCalls[0].delta, 10);
}

async function smokeReceiptPickerLoadsSpecificWarehouseSupplies() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [
        { id: 8101, category: 'carabiners', name: 'Карабин круглый', sku: 'CR-RNG-TEST', qty: 12, unit: 'шт', price_per_unit: 5 },
        { id: 8102, category: 'cables', name: 'Трос серебряный', sku: 'TR-TEST', qty: 34, unit: 'шт', price_per_unit: 5 },
        { id: 8103, category: 'packaging', name: 'Коробка тест', sku: 'BOX-TEST', qty: 7, unit: 'шт', price_per_unit: 12 },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);

    const grouped = await vm.runInContext(`Warehouse.getItemsForPicker()`, context);
    assert.equal(grouped.carabiners.items[0].id, 8101);
    assert.equal(grouped.cables.items[0].id, 8102);
    assert.equal(grouped.packaging.items[0].id, 8103);
    assert.ok(vm.runInContext(`Warehouse.allItems.length >= 3`, context));

    const html = vm.runInContext(`Warehouse.buildPickerOptions(${JSON.stringify(grouped)}, null, true)`, context);
    assert.match(html, /Карабин круглый/);
    assert.match(html, /Трос серебряный/);
    assert.match(html, /Коробка тест/);
}

async function smokeShipmentSelectUsesFreshPickerCache() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [
        { id: 8201, category: 'rings', name: 'Соединительное кольцо', sku: 'RNG-TEST', size: '10 мм', color: 'серебро', qty: 100, unit: 'шт', price_per_unit: 1 },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);

    await vm.runInContext(`Warehouse.getItemsForPicker()`, context);
    vm.runInContext(`
        Warehouse.allItems = [];
        Warehouse.shipmentItems = [{ source: 'existing', warehouse_item_id: null }];
        Warehouse.recalcShipmentValues = () => {};
        Warehouse.onShipmentItemSelect(0, '8201');
    `, context);

    assert.equal(vm.runInContext(`Warehouse.shipmentItems[0].warehouse_item_id`, context), 8201);
    assert.equal(vm.runInContext(`Warehouse.shipmentItems[0].category`, context), 'rings');
    assert.equal(vm.runInContext(`Warehouse.shipmentItems[0].sku`, context), 'RNG-TEST');
}

async function smokeShipmentPickerSurvivesReservationLoadFailure() {
    const context = buildWarehouseContext();
    context.__warehouseItems = [
        { id: 8401, category: 'rings', name: 'Кольцо для смоука', sku: 'RNG-LIVE-SMOKE', qty: 15, unit: 'шт', price_per_unit: 2 },
    ];
    context.loadWarehouseItems = async () => clone(context.__warehouseItems);
    context.loadWarehouseReservations = async () => {
        throw new Error('reservation read unavailable');
    };

    await vm.runInContext(`Warehouse.showNewShipmentForm()`, context);

    const html = context.document.getElementById('wh-sh-items-table').innerHTML;
    assert.match(html, /<select/);
    assert.match(html, /Кольцо для смоука/);
    assert.match(html, /RNG-LIVE-SMOKE/);
}

async function smokeShipmentPickerUsesLoadedCacheBeforeNetwork() {
    const context = buildWarehouseContext();
    const cachedItem = {
        id: 8501,
        category: 'rings',
        name: 'Кольцо из уже загруженного склада',
        sku: 'RNG-CACHED-FAST',
        qty: 21,
        reserved_qty: 4,
        unit: 'шт',
        price_per_unit: 2,
    };
    context.__warehouseItems = [cachedItem];
    context.__warehouseLoadCalls = 0;
    context.__reservationLoadCalls = 0;
    context.loadWarehouseItems = async () => {
        context.__warehouseLoadCalls += 1;
        return new Promise(() => {});
    };
    context.loadWarehouseReservations = async () => {
        context.__reservationLoadCalls += 1;
        return new Promise(() => {});
    };
    vm.runInContext(`Warehouse.allItems = ${JSON.stringify(cachedItem ? [cachedItem] : [])};`, context);

    await Promise.race([
        vm.runInContext(`Warehouse.showNewShipmentForm()`, context),
        new Promise((_, reject) => setTimeout(() => reject(new Error('receipt picker waited for the network despite a loaded cache')), 250)),
    ]);

    const html = context.document.getElementById('wh-sh-items-table').innerHTML;
    assert.match(html, /<select/);
    assert.match(html, /Кольцо из уже загруженного склада/);
    assert.match(html, /RNG-CACHED-FAST/);
    assert.match(html, /\(17 шт\)/);
    assert.equal(context.__warehouseLoadCalls, 0, 'receipt picker should not start another warehouse request when the page cache is populated');
    assert.equal(context.__reservationLoadCalls, 0, 'receipt picker should use the loaded reservation snapshot without waiting for the network');
}

async function main() {
    await smokeManualFormQtyUsesLatestSharedStock();
    await smokeProjectHardwareReadyToggleIsIdempotent();
    await smokeShipmentRepostAppliesOnlyDelta();
    await smokeChinaShipmentInfersSupplyCategories();
    await smokeShipmentCreatesSpecificSupplyWithoutSku();
    await smokeShipmentMatchesExistingItemByExactSkuAcrossWrongCategory();
    await smokeReceiptPickerLoadsSpecificWarehouseSupplies();
    await smokeShipmentSelectUsesFreshPickerCache();
    await smokeShipmentPickerSurvivesReservationLoadFailure();
    await smokeShipmentPickerUsesLoadedCacheBeforeNetwork();
    console.log('warehouse migration smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

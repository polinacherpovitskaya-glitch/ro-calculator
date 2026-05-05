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

async function main() {
    await smokeManualFormQtyUsesLatestSharedStock();
    await smokeProjectHardwareReadyToggleIsIdempotent();
    await smokeShipmentRepostAppliesOnlyDelta();
    console.log('warehouse migration smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

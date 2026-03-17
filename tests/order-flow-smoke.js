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
    const packagingRow = items.find(item => item.item_type === 'packaging');
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
        packaging: Calculator.packagingItems[0],
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

    assert.equal(restored.packaging.china_item_id, 601);
    assert.equal(restored.packaging.china_delivery_method, 'avia_fast');
    assert.equal(restored.packaging.price_cny, 1.8);
    assert.equal(restored.packaging.weight_grams, 4.2);

    assert.equal(restored.pendant.name, 'ABC');
    assert.equal(restored.pendant._totalSellPerUnit, 99);
    assert.equal(restored.pendant.cord.name, 'Smoke Cord');
    assert.equal(restored.pendant.carabiner.name, 'Smoke Carabiner');
    assert.equal(restored.pendant.elements.length, 3);
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
    context.__adjustStockCalls = [];
    context.__projectHardwareCalls = [];
    context.__savedReservations = [];
    context.__reservations = [];
    context.__warehouseItems = [{ id: 501, qty: 10, unit: 'шт' }];
    context.__warehouseHistory = [];
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

    context.__originalWarehouseAdjustStock = vm.runInContext('Warehouse.adjustStock', context);
    context.__originalSyncProjectHardwareOrderState = vm.runInContext('Warehouse.syncProjectHardwareOrderState', context);

    try {
        vm.runInContext(`
            Warehouse.adjustStock = async (itemId, delta, type, refName, note, employee, extra) => {
                globalThis.__adjustStockCalls.push({ itemId, delta, type, refName, note, employee, extra });
                const stockRow = (globalThis.__warehouseItems || []).find(item => Number(item.id) === Number(itemId)) || null;
                const qtyBefore = Number(stockRow && stockRow.qty) || 0;
                const qtyAfter = Math.max(0, qtyBefore + (Number(delta) || 0));
                const appliedQtyChange = qtyAfter - qtyBefore;
                if (stockRow) stockRow.qty = qtyAfter;
                globalThis.__warehouseHistory.push({
                    item_id: Number(itemId) || 0,
                    order_id: extra && extra.order_id ? Number(extra.order_id) : null,
                    type: String(type || ''),
                    notes: String(note || ''),
                    qty_change: appliedQtyChange,
                });
                return {
                    ok: true,
                    requestedQtyChange: Number(delta) || 0,
                    appliedQtyChange,
                    qtyBefore,
                    qtyAfter,
                    clamped: Math.abs(appliedQtyChange - (Number(delta) || 0)) > 1e-9,
                };
            };
            Warehouse.syncProjectHardwareOrderState = async (payload) => {
                globalThis.__projectHardwareCalls.push(payload);
            };
        `, context);

        context.__reservations = [{
            id: 1,
            item_id: 501,
            order_id: 42,
            order_name: 'Sync Order',
            qty: 4,
            status: 'active',
            source: 'order_calc',
        }];
        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'sample', 'delivery', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        assert.equal(context.__projectHardwareCalls[0].status, 'delivery');
        assert.equal(context.__projectHardwareCalls[0].orderId, 42);
        assert.equal(context.__savedReservations[0].status, 'released');
        assert.deepEqual(clone(context.__adjustStockCalls), [{
            itemId: 501,
            delta: -4,
            type: 'deduction',
            refName: 'Sync Order',
            note: 'Списание при смене статуса: sample → delivery',
            employee: 'Smoke',
            extra: { order_id: 42 },
        }]);

        context.__adjustStockCalls = [];
        context.__projectHardwareCalls = [];
        context.__reservations = [];
        context.__savedReservations = [];
        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'delivery', 'draft', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        assert.equal(context.__projectHardwareCalls[0].status, 'draft');
        assert.deepEqual(clone(context.__adjustStockCalls), [{
            itemId: 501,
            delta: 4,
            type: 'addition',
            refName: 'Sync Order',
            note: 'Возврат на склад при смене статуса: delivery → draft',
            employee: 'Smoke',
            extra: { order_id: 42 },
        }]);

        context.__adjustStockCalls = [];
        context.__projectHardwareCalls = [];
        context.__reservations = [{
            id: 2,
            item_id: 501,
            order_id: 77,
            order_name: 'Other Order',
            qty: 1,
            status: 'active',
            source: 'order_calc',
        }];
        context.__savedReservations = [];
        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'draft', 'sample', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        assert.equal(context.__projectHardwareCalls[0].status, 'sample');
        assert.deepEqual(clone(context.__adjustStockCalls), []);
        assert.equal(context.__savedReservations.length, 2);
        const newReservation = context.__savedReservations.find(item => item.order_id === 42);
        assert.equal(newReservation.item_id, 501);
        assert.equal(newReservation.qty, 4);
        assert.equal(newReservation.status, 'active');
        assert.equal(newReservation.source, 'order_calc');

        context.__adjustStockCalls = [];
        context.__projectHardwareCalls = [];
        context.__reservations = [];
        context.__savedReservations = [];
        context.__warehouseItems = [{ id: 501, qty: 2, unit: 'шт' }];
        context.__toasts = [];
        vm.runInContext(`App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };`, context);
        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'draft', 'sample', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        assert.equal(context.__projectHardwareCalls[0].status, 'sample');
        const partialReservation = context.__savedReservations.find(item => item.order_id === 42);
        assert.equal(partialReservation.qty, 2);
        assert.ok(context.__toasts.some(message => /полный резерв/i.test(message)));

        context.__adjustStockCalls = [];
        context.__projectHardwareCalls = [];
        context.__savedReservations = [];
        context.__warehouseItems = [{ id: 501, qty: 2, unit: 'шт' }];
        context.__toasts = [];
        vm.runInContext(`App.toast = (message) => { globalThis.__toasts.push(String(message || '')); };`, context);
        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'sample', 'delivery', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        assert.equal(context.__projectHardwareCalls[0].status, 'delivery');
        assert.deepEqual(clone(context.__adjustStockCalls), [{
            itemId: 501,
            delta: -4,
            type: 'deduction',
            refName: 'Sync Order',
            note: 'Списание при смене статуса: sample → delivery',
            employee: 'Smoke',
            extra: { order_id: 42 },
        }]);
        const releasedReservation = context.__savedReservations.find(item => item.order_id === 42);
        assert.equal(releasedReservation.status, 'released');
        assert.ok(context.__toasts.some(message => /не полностью/i.test(message)));

        context.__adjustStockCalls = [];
        context.__projectHardwareCalls = [];
        context.__savedReservations = [];
        await vm.runInContext(`Orders._syncWarehouseByStatus(42, 'delivery', 'draft', 'Sync Order', 'Smoke')`, context);

        assert.equal(context.__projectHardwareCalls.length, 1);
        assert.equal(context.__projectHardwareCalls[0].status, 'draft');
        assert.deepEqual(clone(context.__adjustStockCalls), [{
            itemId: 501,
            delta: 2,
            type: 'addition',
            refName: 'Sync Order',
            note: 'Возврат на склад при смене статуса: delivery → draft',
            employee: 'Smoke',
            extra: { order_id: 42 },
        }]);
    } finally {
        vm.runInContext(`
            Warehouse.adjustStock = globalThis.__originalWarehouseAdjustStock;
            Warehouse.syncProjectHardwareOrderState = globalThis.__originalSyncProjectHardwareOrderState;
        `, context);
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
            items: [{
                item_type: 'hardware',
                product_name: 'Active product',
                quantity: 3,
                hardware_source: 'warehouse',
                hardware_warehouse_item_id: 502,
            }],
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
    assert.match(html, /Фурнитура для проектов \(к сборке\)/);
    assert.match(html, /Собрано/);
    assert.equal((html.match(/Collected Hardware Order/g) || []).length, 0);
    assert.equal((html.match(/Collected Delivery Order/g) || []).length, 1);
    assert.equal((html.match(/Active Hardware Order/g) || []).length, 1);
    assert.equal((html.match(/Sample Hardware Order/g) || []).length, 1);
    assert.match(html, /Завершенные заказы скрыты автоматически: 1/);
    assert.match(html, /Delivery Hardware/);
    assert.match(html, /Active Hardware/);
    assert.match(html, /Собрано 1 из 1/);
    assert.match(html, /Собрано 0 из 1/);
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
    await smokeLegacyPendantRestore(context);
    await smokeReadyGoodsRollback(context);
    await smokeReadyGoodsSalesAndManualAdd(context);
    await smokeChinaShipmentMetadata(context);
    await smokeChinaReceiptStatusLinkage(context);
    await smokeOrderStatusWarehouseSync(context);
    await smokeWarehouseManualAdjustment(context);
    await smokeProjectHardwarePersistenceAndBuckets(context);
    await smokeOrderDetailColorRendering(context);

    console.log('order-flow smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

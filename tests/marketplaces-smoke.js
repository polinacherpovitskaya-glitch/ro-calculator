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
            getCurrentEmployeeName() { return 'Тест'; },
            navigate() {},
            params: {},
            settings: {},
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

    vm.runInContext(`
        Marketplaces.allSets = [{
            id: 2,
            name: 'Legacy Set',
            photo_url: '',
            hw_items: [{
                wh_id: 501,
                warehouse_sku: 'CRB-501',
                qty: 1,
                name: '',
                assembly_speed: 0,
            }],
            pkg_items: [{
                wh_id: 601,
                warehouse_sku: 'ENV-150x90',
                qty: 1,
                name: '',
                assembly_speed: 0,
            }],
            plastic_items: [],
            color_variants: [],
        }];
        Marketplaces.editSet(2);
    `, context);

    const legacyHwState = JSON.parse(vm.runInContext(`JSON.stringify(Marketplaces._hwItems[0])`, context));
    const legacyPkgState = JSON.parse(vm.runInContext(`JSON.stringify(Marketplaces._pkgItems[0])`, context));
    const legacyHwHtml = String(context.document.getElementById('mp-hw-items').innerHTML || '');
    const legacyPkgHtml = String(context.document.getElementById('mp-pkg-items').innerHTML || '');
    assert.equal(legacyHwState.source, 'warehouse');
    assert.equal(legacyHwState.wh_id, 501);
    assert.equal(legacyHwState.warehouse_sku, 'CRB-501');
    assert.equal(legacyPkgState.source, 'warehouse');
    assert.equal(legacyPkgState.wh_id, 601);
    assert.equal(legacyPkgState.warehouse_sku, 'ENV-150x90');
    assert.match(legacyHwHtml, /CRB-501/);
    assert.match(legacyHwHtml, /Карабин черный/);
    assert.match(legacyPkgHtml, /ENV-150x90/);
    assert.match(legacyPkgHtml, /Конверт/);

    vm.runInContext(`
        let savedOrderPayload = null;
        let savedItemsPayload = null;
        let syncedWarehouse = null;
        saveOrder = async (order, items) => {
            savedOrderPayload = JSON.parse(JSON.stringify(order));
            savedItemsPayload = JSON.parse(JSON.stringify(items));
            return 777;
        };
        Orders = {
            async _syncWarehouseByStatus(orderId, oldStatus, newStatus, orderName, managerName) {
                syncedWarehouse = { orderId, oldStatus, newStatus, orderName, managerName };
            },
        };
        getProductionParams = () => ({
            cnyRate: 12.5,
            fotPerHour: 400,
            indirectPerHour: 100,
            wasteFactor: 1.1,
            indirectCostMode: 'all',
        });
        calculateItemCost = () => ({
            costFot: 0,
            costIndirect: 0,
            costPlastic: 0,
            costMoldAmortization: 0,
            costCutting: 0,
            costCuttingIndirect: 0,
            costNfcTag: 0,
            costNfcProgramming: 0,
            costNfcIndirect: 0,
            costTotal: 3,
            hoursPlastic: 0.5,
            hoursCutting: 0,
            hoursNfc: 0,
        });
        calculateHardwareCost = () => ({
            costPerUnit: 12,
            hoursHardware: 0.25,
        });
        calculatePackagingCost = () => ({
            costPerUnit: 8,
            hoursPackaging: 0.1,
        });
        Marketplaces.hideProductionBuilder = () => {};
        Marketplaces.allSets = [{
            id: 1,
            name: 'Набор B2C',
            set_name: 'Набор B2C',
            mp_actual_price: 399,
            plastic_items: [],
            color_variants: [],
            hw_items: [{
                source: 'catalog',
                blank_id: 101,
                wh_id: null,
                warehouse_sku: 'CRB-501',
                qty: 1,
                name: 'Карабин каталог',
                assembly_speed: 120,
            }],
            pkg_items: [{
                source: 'catalog',
                blank_id: 201,
                wh_id: null,
                warehouse_sku: 'ENV-150x90',
                qty: 1,
                name: 'Конверт каталог',
                assembly_speed: 90,
            }],
        }];
    `, context);

    await vm.runInContext(`Marketplaces._createProductionOrderFromSets([{ id: 1, qty: 2 }], 'B2C тест', '2026-03-31')`, context);

    const createdOrder = JSON.parse(vm.runInContext(`JSON.stringify(savedOrderPayload)`, context));
    const createdItems = JSON.parse(vm.runInContext(`JSON.stringify(savedItemsPayload)`, context));
    const warehouseSync = JSON.parse(vm.runInContext(`JSON.stringify(syncedWarehouse)`, context));
    const originalB2CItemsJson = vm.runInContext(`JSON.stringify(savedItemsPayload)`, context);
    const createdHardware = createdItems.find(item => item.item_type === 'hardware');
    const createdPackaging = createdItems.find(item => item.item_type === 'packaging');

    assert.equal(createdOrder.order_name, 'B2C тест');
    assert.equal(createdOrder.status, 'production_casting');
    assert.ok(createdHardware, 'expected hardware line in created B2C order');
    assert.ok(createdPackaging, 'expected packaging line in created B2C order');
    assert.equal(createdHardware.hardware_source, 'warehouse');
    assert.equal(createdHardware.hardware_warehouse_item_id, 501);
    assert.equal(createdHardware.hardware_warehouse_sku, 'CRB-501');
    assert.equal(createdPackaging.packaging_source, 'warehouse');
    assert.equal(createdPackaging.packaging_warehouse_item_id, 601);
    assert.equal(createdPackaging.packaging_warehouse_sku, 'ENV-150x90');
    assert.deepEqual(warehouseSync, {
        orderId: 777,
        oldStatus: 'draft',
        newStatus: 'production_casting',
        orderName: 'B2C тест',
        managerName: 'Тест',
    });

    vm.runInContext(`
        Marketplaces.allSets = [{
            id: 3,
            name: 'Legacy Warehouse Set',
            set_name: 'Legacy Warehouse Set',
            mp_actual_price: 399,
            plastic_items: [],
            color_variants: [],
            hw_items: [{
                wh_id: 501,
                warehouse_sku: 'CRB-501',
                qty: 1,
                name: '',
                assembly_speed: 0,
            }],
            pkg_items: [{
                wh_id: 601,
                warehouse_sku: 'ENV-150x90',
                qty: 1,
                name: '',
                assembly_speed: 0,
            }],
        }];
    `, context);

    await vm.runInContext(`Marketplaces._createProductionOrderFromSets([{ id: 3, qty: 1 }], 'Legacy B2C', '2026-03-31')`, context);
    const legacyCreatedItems = JSON.parse(vm.runInContext(`JSON.stringify(savedItemsPayload)`, context));
    const legacyCreatedHardware = legacyCreatedItems.find(item => item.item_type === 'hardware');
    const legacyCreatedPackaging = legacyCreatedItems.find(item => item.item_type === 'packaging');
    assert.equal(legacyCreatedHardware.hardware_source, 'warehouse');
    assert.equal(legacyCreatedHardware.hardware_warehouse_item_id, 501);
    assert.equal(legacyCreatedPackaging.packaging_source, 'warehouse');
    assert.equal(legacyCreatedPackaging.packaging_warehouse_item_id, 601);

    vm.runInContext(`
        __projectHardwareState = { checks: {} };
        __reservations = [];
        __warehouseHistory = [];
        __warehouseItems = [
            {
                id: 501,
                name: 'Карабин черный',
                sku: 'CRB-501',
                category: 'chains',
                qty: 12,
                price_per_unit: 10,
                unit: 'шт',
            },
            {
                id: 601,
                name: 'Конверт',
                sku: 'ENV-150x90',
                category: 'packaging',
                qty: 30,
                price_per_unit: 5,
                unit: 'шт',
            },
        ];
        __orderDetails = {
            777: {
                order: {
                    id: 777,
                    order_name: 'B2C тест',
                    manager_name: 'Тест',
                    status: 'production_casting',
                },
                items: JSON.parse(${JSON.stringify(originalB2CItemsJson)}),
            },
        };
        loadProjectHardwareState = async () => JSON.parse(JSON.stringify(__projectHardwareState));
        saveProjectHardwareState = async (state) => {
            __projectHardwareState = JSON.parse(JSON.stringify(state));
        };
        loadWarehouseReservations = async () => JSON.parse(JSON.stringify(__reservations));
        saveWarehouseReservations = async (reservations) => {
            __reservations = JSON.parse(JSON.stringify(reservations));
        };
        loadWarehouseItems = async () => JSON.parse(JSON.stringify(__warehouseItems));
        saveWarehouseItems = async (items) => {
            __warehouseItems = JSON.parse(JSON.stringify(items));
        };
        loadWarehouseHistory = async () => JSON.parse(JSON.stringify(__warehouseHistory));
        saveWarehouseHistory = async (history) => {
            __warehouseHistory = JSON.parse(JSON.stringify(history));
        };
        loadOrder = async (orderId) => JSON.parse(JSON.stringify(__orderDetails[Number(orderId)] || null));
        Warehouse.projectHardwareState = null;
        Warehouse.allItems = __warehouseItems;
    `, context);

    await vm.runInContext(`Warehouse.syncProjectHardwareOrderState({
        orderId: 777,
        orderName: 'B2C тест',
        managerName: 'Тест',
        status: 'production_casting',
        currentItems: JSON.parse(${JSON.stringify(originalB2CItemsJson)}),
        previousItems: []
    })`, context);

    const activeReservations = JSON.parse(vm.runInContext(`JSON.stringify(__reservations)`, context));
    assert.equal(activeReservations.length, 2);
    const hwReservation = activeReservations.find(item => Number(item.item_id) === 501);
    const pkgReservation = activeReservations.find(item => Number(item.item_id) === 601);
    assert.equal(hwReservation.qty, 2);
    assert.equal(pkgReservation.qty, 2);
    assert.equal(hwReservation.status, 'active');
    assert.equal(pkgReservation.status, 'active');

    vm.runInContext(`
        __originalWarehouseLoad = Warehouse.load;
        Warehouse.load = async () => {};
    `, context);
    try {
        await vm.runInContext(`Warehouse.toggleProjectHardwareReady(777, 501, true)`, context);
        await vm.runInContext(`Warehouse.toggleProjectHardwareReady(777, 601, true)`, context);
    } finally {
        vm.runInContext(`
            Warehouse.load = __originalWarehouseLoad;
            delete __originalWarehouseLoad;
        `, context);
    }

    const warehouseItemsAfterReady = JSON.parse(vm.runInContext(`JSON.stringify(__warehouseItems)`, context));
    const reservationsAfterReady = JSON.parse(vm.runInContext(`JSON.stringify(__reservations)`, context));
    const historyAfterReady = JSON.parse(vm.runInContext(`JSON.stringify(__warehouseHistory)`, context));
    const projectHardwareState = JSON.parse(vm.runInContext(`JSON.stringify(__projectHardwareState)`, context));
    assert.equal(warehouseItemsAfterReady.find(item => Number(item.id) === 501).qty, 10);
    assert.equal(warehouseItemsAfterReady.find(item => Number(item.id) === 601).qty, 28);
    assert.equal(reservationsAfterReady.filter(item => item.status === 'active').length, 0);
    assert.equal(reservationsAfterReady.filter(item => item.status === 'released').length, 2);
    assert.equal(historyAfterReady.length, 2);
    assert.ok(historyAfterReady.every(entry => /Списание собранной позиции со склада: 2 шт/.test(entry.notes)));
    assert.equal(Boolean(projectHardwareState.checks['777:501']), true);
    assert.equal(Boolean(projectHardwareState.checks['777:601']), true);

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

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

    assert.equal(vm.runInContext(`typeof Marketplaces`, context), 'object');
    assert.equal(vm.runInContext(`typeof Warehouse`, context), 'object');

    context.document.getElementById('mp-plastic-items');
    context.document.getElementById('mp-hw-items');
    context.document.getElementById('mp-pkg-items');

    vm.runInContext(`
        __plasticRecalcCalls = 0;
        Marketplaces._plasticBlanks = [{
            id: 15,
            name: 'Новый кардхолдер',
            collection: 'Аксессуары',
            weight_grams: 20,
            photo_url: 'https://example.com/card-holder.jpg',
            status: 'active',
        }];
        Marketplaces._plasticItems = [{
            blank_id: null,
            qty: 1,
            name: '',
            cost: 0,
            color_notes: '',
            colors: [],
        }];
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
        Marketplaces.recalcSet = () => { __plasticRecalcCalls += 1; };
        Marketplaces.renderFormItems();
    `, context);

    const plasticHtml = String(context.document.getElementById('mp-plastic-items').innerHTML || '');
    const hwHtml = String(context.document.getElementById('mp-hw-items').innerHTML || '');
    const pkgHtml = String(context.document.getElementById('mp-pkg-items').innerHTML || '');

    assert.match(plasticHtml, /card holder/i);
    assert.match(hwHtml, /wh-img-picker/);
    assert.match(hwHtml, /CRB-501/);
    assert.match(hwHtml, /Каталог/);
    assert.match(hwHtml, /Склад/);
    assert.match(hwHtml, /Поиск по названию или артикулу/);
    assert.match(pkgHtml, /ENV-150x90/);
    assert.match(pkgHtml, /каталог/);
    assert.match(pkgHtml, /склад/);

    vm.runInContext(`Marketplaces._selectPlastic(0, 15)`, context);
    const plasticState = JSON.parse(vm.runInContext(`JSON.stringify(Marketplaces._plasticItems[0])`, context));
    const plasticHtmlAfterSelect = String(context.document.getElementById('mp-plastic-items').innerHTML || '');
    const plasticRecalcCalls = vm.runInContext(`__plasticRecalcCalls`, context);
    assert.equal(plasticState.blank_id, 15);
    assert.equal(plasticState.name, 'Новый кардхолдер');
    assert.match(plasticHtmlAfterSelect, /Новый кардхолдер/);
    assert.ok(plasticRecalcCalls > 0);

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
        Marketplaces._hwItems = [{
            source: 'catalog',
            blank_id: null,
            wh_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            qty: 1,
            name: '',
            cost_per_unit: 0,
            assembly_speed: 0,
        }];
        Marketplaces._pkgItems = [{
            source: 'catalog',
            blank_id: null,
            wh_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            qty: 1,
            name: '',
            cost_per_unit: 0,
            assembly_speed: 0,
        }];
        Warehouse.handlePickerSelect({
            dataset: {
                selectFn: 'Marketplaces._selectHw',
                selectIdx: '0',
                pickValue: 'warehouse:501',
            },
        });
        Warehouse.handlePickerSelect({
            dataset: {
                selectFn: 'Marketplaces._selectPkg',
                selectIdx: '0',
                pickValue: 'catalog:201',
            },
        });
        __pickerHwState = JSON.stringify(Marketplaces._hwItems[0]);
        __pickerPkgState = JSON.stringify(Marketplaces._pkgItems[0]);
    `, context);
    const pickerHwState = JSON.parse(vm.runInContext(`__pickerHwState`, context));
    const pickerPkgState = JSON.parse(vm.runInContext(`__pickerPkgState`, context));
    assert.equal(pickerHwState.source, 'warehouse');
    assert.equal(pickerHwState.wh_id, 501);
    assert.equal(pickerHwState.warehouse_sku, 'CRB-501');
    assert.equal(pickerPkgState.source, 'catalog');
    assert.equal(pickerPkgState.blank_id, 201);
    assert.equal(pickerPkgState.warehouse_sku, 'ENV-150x90');

    vm.runInContext(`
        Marketplaces._allWarehouseHw.push({
            id: 777,
            category: 'cords',
            name: 'Миланский шнур',
            sku: 'MSN-GR',
            size: '',
            color: 'зеленый',
            qty: 30900,
            available_qty: 30900,
            unit: 'см',
            price_per_unit: 70,
            photo_thumbnail: 'https://example.com/cord.jpg',
        });
        Marketplaces._hwCatalog.push({
            id: 7777,
            name: 'Миланский шнур зеленый',
            warehouse_item_id: 777,
            assembly_speed: 0,
            sell_price: 0,
            photo_url: '',
        });
        Marketplaces._hwItems = [{
            source: 'catalog',
            blank_id: null,
            wh_id: null,
            warehouse_sku: '',
            photo_thumbnail: '',
            qty: 40,
            unit: 'шт',
            name: '',
            cost_per_unit: 0,
            assembly_speed: 0,
        }];
        Marketplaces._selectHw(0, 'warehouse:777');
        __cordState = JSON.stringify(Marketplaces._hwItems[0]);
        __cordTotal = Marketplaces._calcHwUnitCost(Marketplaces._hwItems[0], {
            cnyRate: 12.5,
            fotPerHour: 400,
            indirectPerHour: 0,
            wasteFactor: 1.1,
            indirectCostMode: 'all',
        }) * Marketplaces._hwItems[0].qty;
    `, context);
    const cordSelectionState = JSON.parse(vm.runInContext(`__cordState`, context));
    const cordTotal = vm.runInContext(`__cordTotal`, context);
    assert.equal(cordSelectionState.source, 'warehouse');
    assert.equal(cordSelectionState.wh_id, 777);
    assert.equal(cordSelectionState.unit, 'см');
    assert.equal(cordSelectionState.cost_per_unit, 0.7);
    assert.equal(cordTotal, 28);

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
    assert.equal(String(context.document.getElementById('mp-set-charity').value), '1');

    vm.runInContext(`
        __savedMarketplaceSet = null;
        saveMarketplaceSet = async (set) => {
            __savedMarketplaceSet = JSON.parse(JSON.stringify(set));
        };
        Marketplaces._lastCalc = {
            totalCost: 100,
            mpActualPrice: 200,
            suggestedMpPrice: 210,
            suggestedShopPrice: 300,
            shopActualPrice: 290,
            mpMargin: 25,
            shopMargin: 30,
            actualMargin: 28,
        };
        document.getElementById('mp-set-name').value = 'Charity set';
        document.getElementById('mp-set-commission').value = '46';
        document.getElementById('mp-set-vat').value = '5';
        document.getElementById('mp-set-osn').value = '6';
        document.getElementById('mp-set-charity').value = '1.5';
        document.getElementById('mp-set-commercial').value = '6.5';
        document.getElementById('mp-set-acquiring').value = '4';
        document.getElementById('mp-set-shop-multiplier').value = '3';
        document.getElementById('mp-set-margin').value = '40';
        __originalMarketplacesLoad = Marketplaces.load;
        Marketplaces.load = async () => {};
    `, context);

    await vm.runInContext(`Marketplaces.saveSet()`, context);
    const savedMarketplaceSet = JSON.parse(vm.runInContext(`JSON.stringify(__savedMarketplaceSet)`, context));
    assert.equal(savedMarketplaceSet.charity, 1.5, 'saved B2C set should persist charity percentage');
    vm.runInContext(`
        Marketplaces.load = __originalMarketplacesLoad;
        delete __originalMarketplacesLoad;
    `, context);

    vm.runInContext(`
        Marketplaces.allSets = [{
            id: 4,
            name: 'Saved charity set',
            photo_url: '',
            charity: 2.25,
            hw_items: [],
            pkg_items: [],
            plastic_items: [],
            color_variants: [],
        }];
        Marketplaces.editSet(4);
    `, context);
    assert.equal(String(context.document.getElementById('mp-set-charity').value), '2.25');

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
        { textContent: 'Карабин черный 5 см CRB-501 склад', style: {}, dataset: { groupKey: 'warehouse' } },
        { textContent: 'Цепочка белая 10 см CHN-100 склад', style: {}, dataset: { groupKey: 'warehouse' } },
    ];
    const filteredHeaders = [
        { style: {}, dataset: { groupKey: 'catalog' } },
        { style: {}, dataset: { groupKey: 'warehouse' } },
    ];
    pickerHost.querySelectorAll = (selector) => {
        if (selector === '.wh-picker-item') return filteredItems;
        if (selector === '.wh-picker-cat-header') return filteredHeaders;
        return [];
    };
    vm.runInContext(`Warehouse.filterPicker('picker-filter-host', 'CRB-501')`, context);
    assert.equal(filteredItems[0].style.display, '');
    assert.equal(filteredItems[1].style.display, 'none');
    assert.equal(filteredHeaders[0].style.display, 'none');
    assert.equal(filteredHeaders[1].style.display, '');

    const plasticSearchInput = context.document.getElementById('mp-plastic-search-test');
    const plasticSearchDropdown = context.document.getElementById('mp-plastic-search-test_dd');
    const plasticSearchRows = [
        { dataset: { name: 'Новый кардхолдер', search: 'новый кардхолдер card holder cardholder аксессуары 20г' }, style: {} },
        { dataset: { name: 'Бланк тэг', search: 'бланк тэг tag blank' }, style: {} },
    ];
    plasticSearchInput.value = 'Card Holder';
    plasticSearchDropdown.querySelectorAll = (selector) => selector === '.mp-dd-item' ? plasticSearchRows : [];
    vm.runInContext(`Marketplaces._filterDropdown('mp-plastic-search-test')`, context);
    assert.equal(plasticSearchRows[0].style.display, '');
    assert.equal(plasticSearchRows[1].style.display, 'none');

    vm.runInContext(`
        __selectedPickerValue = null;
        TestPicker = {
            select(idx, value) {
                __selectedPickerValue = { idx, value };
            }
        };
    `, context);
    context.__pickerButton = {
        dataset: {
            pickerContainer: 'picker-filter-host',
            selectFn: 'TestPicker.select',
            selectIdx: '4',
            pickValue: 'warehouse:900',
        },
    };
    vm.runInContext(`Warehouse.handlePickerSelect(__pickerButton)`, context);
    const selectedPickerValue = JSON.parse(vm.runInContext(`JSON.stringify(__selectedPickerValue)`, context));
    assert.deepEqual(selectedPickerValue, { idx: 4, value: 'warehouse:900' });

    vm.runInContext(`
        Marketplaces._allWarehouseHw = [{
            id: 900,
            category: 'cords',
            name: 'Миланский шнур',
            sku: 'MSN-LV',
            color: 'фиолетовый',
            qty: 3800,
            available_qty: 3800,
            unit: 'см',
            price_per_unit: 70,
            photo_thumbnail: 'https://example.com/cord.jpg',
        }];
        Marketplaces._hwCatalog = [];
        Marketplaces._hwItems = [{
            source: 'warehouse',
            wh_id: 900,
            warehouse_sku: 'MSN-LV',
            qty: 40,
            unit: 'см',
            name: '',
            cost_per_unit: 70,
            assembly_speed: 0,
        }];
        Marketplaces._pkgItems = [];
        Marketplaces.renderColorVariants = () => {};
        Marketplaces.recalcSet = () => {};
        Marketplaces.renderFormItems();
    `, context);

    const cordState = JSON.parse(vm.runInContext(`JSON.stringify(Marketplaces._hwItems[0])`, context));
    const cordHtml = String(context.document.getElementById('mp-hw-items').innerHTML || '');
    assert.equal(cordState.unit, 'см');
    assert.equal(cordState.cost_per_unit, 0.7);
    assert.match(cordHtml, /MSN-LV/);
    assert.match(cordHtml, /0,7 ₽\/см/);
    assert.match(cordHtml, /Кол-во \(см\)/);
    assert.doesNotMatch(cordHtml, /70 ₽\/шт/);

    console.log('marketplaces smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

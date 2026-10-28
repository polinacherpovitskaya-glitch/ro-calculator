// Saving an unchanged order or reopening the warehouse must not grow the
// reservations blob: project hardware reservations are updated in place, not
// released and re-created. Runs the real js/supabase.js save path (diff patch)
// against a fake server that applies the real ops/api merge, with js/warehouse.js
// on top; orders, items, history and the collected-state blob are in memory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

const clone = value => JSON.parse(JSON.stringify(value));

function createStorage() {
    const store = new Map();
    return {
        getItem: key => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: key => store.delete(key),
        clear: () => store.clear(),
    };
}

function createServer(blobMerge) {
    const server = {
        reservationsData: '[]',
        patches: [],
    };
    server.client = {
        async patchBlob(target, patch) {
            assert.equal(target, 'warehouse_reservations');
            server.patches.push(clone(patch));
            const value = blobMerge.applyBlobPatchToValue(target, server.reservationsData, clone(patch), new Date().toISOString());
            server.reservationsData = JSON.stringify(value);
            return { data: { value: clone(value) }, error: null };
        },
        from(table) {
            const query = {
                select() { return query; },
                eq() { return query; },
                async maybeSingle() {
                    assert.equal(table, 'warehouse_reservations');
                    return { data: { id: 1, reservations_data: server.reservationsData }, error: null };
                },
                async upsert() { throw new Error(`unexpected whole-blob write to ${table}`); },
            };
            return query;
        },
    };
    return server;
}

function createTab(server, world) {
    const context = {
        console: { ...console, log() {}, info() {}, warn() {} },
        Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Promise, Map, Set, WeakMap,
        setTimeout, clearTimeout,
        setInterval: () => 0,
        clearInterval: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        localStorage: createStorage(),
        sessionStorage: createStorage(),
        navigator: {},
        document: { addEventListener() {}, getElementById: () => null },
        location: { href: 'https://calc.recycleobject.ru/', origin: 'https://calc.recycleobject.ru', protocol: 'https:', hostname: 'calc.recycleobject.ru' },
        URL, URLSearchParams,
        fetch: async () => ({ ok: false, status: 404, async json() { return {}; } }),
        __RO_REMOTE_LOAD_TIMEOUT_MS: 200,
        __RO_REMOTE_WRITE_TIMEOUT_MS: 200,
        App: {
            toast() {},
            getCurrentEmployeeName: () => 'Smoke',
        },
    };
    context.window = context;
    context.globalThis = context;
    context.createPlatformClient = () => server.client;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/supabase.js'), 'utf8'), context, { filename: 'js/supabase.js' });
    vm.runInContext('initSupabase()', context);

    // Only the reservations blob goes through the real load/save; the rest is in memory.
    Object.assign(context, {
        round2: n => Math.round(n * 100) / 100,
        getLastDataLoadMeta: () => ({ source: 'supabase' }),
        loadOrders: async () => clone(world.orders),
        loadOrderItemsByOrderIds: async orderIds => orderIds.flatMap(orderId =>
            clone(world.itemsByOrder[orderId] || []).map(item => ({ ...item, order_id: Number(orderId) }))),
        loadWarehouseItems: async () => clone(world.warehouseItems),
        saveWarehouseItems: async () => { throw new Error('stock must not change in this smoke'); },
        loadWarehouseHistory: async () => [],
        saveWarehouseHistory: async () => { throw new Error('history must not change in this smoke'); },
        loadProjectHardwareState: async () => ({ checks: {}, actual_qtys: {} }),
        saveProjectHardwareState: async () => {},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/warehouse.js'), 'utf8'), context, { filename: 'js/warehouse.js' });
    context.__world = world;
    vm.runInContext('Warehouse.allItems = __world.warehouseItems; Warehouse.allReservations = [];', context);
    return context;
}

const run = (tab, code) => vm.runInContext(code, tab);
const serverReservations = server => JSON.parse(server.reservationsData);
const activeOf = (server, orderId) => serverReservations(server)
    .filter(r => r.status === 'active' && r.order_id === orderId)
    .sort((a, b) => a.item_id - b.item_id);

function saveOrder(tab, world, orderId, previousItems) {
    const order = world.orders.find(o => o.id === orderId);
    tab.__args = clone({
        orderId,
        orderName: order.order_name,
        managerName: 'Smoke',
        status: order.status,
        currentItems: world.itemsByOrder[orderId],
        previousItems,
    });
    return run(tab, 'Warehouse.syncProjectHardwareOrderState(__args)');
}

async function smokeRepeatedSavesAndReconcilesKeepTheList(blobMerge) {
    const world = {
        warehouseItems: [
            { id: 10, name: 'Карабин', qty: 500, unit: 'шт' },
            { id: 11, name: 'Трос', qty: 50, unit: 'шт' },
            { id: 12, name: 'Конверт', qty: 200, unit: 'шт', category: 'packaging' },
        ],
        orders: [
            { id: 100, order_name: 'Обвесы', manager_name: 'Smoke', status: 'production_hardware', created_at: '2026-10-01T09:00:00.000Z' },
            { id: 200, order_name: 'Образец', manager_name: 'Smoke', status: 'sample', created_at: '2026-10-02T09:00:00.000Z' },
        ],
        itemsByOrder: {
            100: [
                { item_type: 'hardware', product_name: 'Карабин', quantity: 100, hardware_source: 'warehouse', hardware_warehouse_item_id: 10 },
                { item_type: 'hardware', product_name: 'Трос', quantity: 80, hardware_source: 'warehouse', hardware_warehouse_item_id: 11 },
                { item_type: 'packaging', product_name: 'Конверт', quantity: 100, packaging_source: 'warehouse', packaging_warehouse_item_id: 12 },
            ],
            200: [
                { item_type: 'hardware', product_name: 'Карабин', quantity: 30, hardware_source: 'warehouse', hardware_warehouse_item_id: 10 },
            ],
        },
    };
    const server = createServer(blobMerge);
    server.reservationsData = JSON.stringify([
        { id: 1, item_id: 10, order_id: 0, order_name: 'Ручной резерв', qty: 20, status: 'active', source: 'manual', created_at: '2026-09-01T00:00:00.000Z' },
    ]);
    const tab = createTab(server, world);

    // First save of the order reserves its three rows (the cable only up to stock).
    await saveOrder(tab, world, 100, []);
    const firstActive = activeOf(server, 100);
    assert.deepEqual(firstActive.map(r => [r.item_id, r.qty]), [[10, 100], [11, 50], [12, 100]]);
    const countAfterFirstSave = serverReservations(server).length;
    assert.equal(countAfterFirstSave, 4);

    // Saving the same order again changes nothing and writes nothing.
    let patchesBefore = server.patches.length;
    await saveOrder(tab, world, 100, world.itemsByOrder[100]);
    await saveOrder(tab, world, 100, world.itemsByOrder[100]);
    assert.equal(serverReservations(server).length, countAfterFirstSave, 'repeated saves must not append reservations');
    assert.equal(server.patches.length, patchesBefore, 'an unchanged order must not send a patch');
    assert.deepEqual(activeOf(server, 100), firstActive, 'the same reservation records stay in place');
    assert.equal(serverReservations(server).filter(r => r.status === 'released').length, 0);

    // Opening the warehouse: the sample order gets its row, the other order keeps its records.
    await run(tab, 'Warehouse.reconcileProjectHardwareReservations()');
    assert.deepEqual(activeOf(server, 100), firstActive, 'reconcile keeps unchanged reservations in place');
    assert.deepEqual(activeOf(server, 200).map(r => [r.item_id, r.qty]), [[10, 30]]);
    const countAfterReconcile = serverReservations(server).length;
    assert.equal(countAfterReconcile, countAfterFirstSave + 1);

    patchesBefore = server.patches.length;
    await run(tab, 'Warehouse.reconcileProjectHardwareReservations()');
    await run(tab, 'Warehouse.reconcileProjectHardwareReservations()');
    assert.equal(serverReservations(server).length, countAfterReconcile, 'reopening the warehouse must not append reservations');
    assert.equal(server.patches.length, patchesBefore, 'an unchanged warehouse must not send a patch');

    // A changed quantity updates the same record, no released copy is left behind.
    const carabinerId = firstActive.find(r => r.item_id === 10).id;
    world.itemsByOrder[100][0].quantity = 120;
    await saveOrder(tab, world, 100, clone(world.itemsByOrder[100]));
    const carabiner = activeOf(server, 100).find(r => r.item_id === 10);
    assert.equal(carabiner.id, carabinerId);
    assert.equal(carabiner.qty, 120);
    assert.equal(serverReservations(server).length, countAfterReconcile);
    assert.equal(server.patches[server.patches.length - 1].upserts.length, 1, 'only the changed record is sent');

    // Priority still decides who gets scarce stock: a new sample order takes the cable
    // first and the production order's own record shrinks in place.
    world.orders.push({ id: 300, order_name: 'Срочный образец', manager_name: 'Smoke', status: 'sample', created_at: '2026-10-03T09:00:00.000Z' });
    world.itemsByOrder[300] = [
        { item_type: 'hardware', product_name: 'Трос', quantity: 20, hardware_source: 'warehouse', hardware_warehouse_item_id: 11 },
    ];
    const cableId = firstActive.find(r => r.item_id === 11).id;
    await run(tab, 'Warehouse.reconcileProjectHardwareReservations()');
    assert.deepEqual(activeOf(server, 300).map(r => [r.item_id, r.qty]), [[11, 20]]);
    const cable = activeOf(server, 100).find(r => r.item_id === 11);
    assert.equal(cable.id, cableId);
    assert.equal(cable.qty, 30);
    assert.equal(serverReservations(server).length, countAfterReconcile + 1);

    // Dropping a row from the order releases its record instead of adding anything.
    const envelopeId = firstActive.find(r => r.item_id === 12).id;
    const beforeDrop = clone(world.itemsByOrder[100]);
    world.itemsByOrder[100] = world.itemsByOrder[100].filter(item => item.item_type !== 'packaging');
    await saveOrder(tab, world, 100, beforeDrop);
    const envelope = serverReservations(server).find(r => r.id === envelopeId);
    assert.equal(envelope.status, 'released');
    assert.equal(serverReservations(server).length, countAfterReconcile + 1);

    // Leaving the reserve statuses releases the rest, still without new records.
    world.orders.find(o => o.id === 100).status = 'cancelled';
    await saveOrder(tab, world, 100, world.itemsByOrder[100]);
    assert.equal(activeOf(server, 100).length, 0);
    assert.equal(serverReservations(server).length, countAfterReconcile + 1);

    // The manual reservation was never touched and every id is unique.
    assert.deepEqual(serverReservations(server).find(r => r.id === 1).status, 'active');
    const ids = serverReservations(server).map(r => String(r.id));
    assert.equal(new Set(ids).size, ids.length, 'reservation ids must be unique');
}

async function smokeLegacyDuplicatesCollapseToOneRecord(blobMerge) {
    const world = {
        warehouseItems: [{ id: 10, name: 'Карабин', qty: 500, unit: 'шт' }],
        orders: [{ id: 100, order_name: 'Обвесы', manager_name: 'Smoke', status: 'production_hardware', created_at: '2026-10-01T09:00:00.000Z' }],
        itemsByOrder: {
            100: [{ item_type: 'hardware', product_name: 'Карабин', quantity: 100, hardware_source: 'warehouse', hardware_warehouse_item_id: 10 }],
        },
    };
    const server = createServer(blobMerge);
    // Two active rows for the pair left behind by an old double save.
    server.reservationsData = JSON.stringify([
        { id: 5, item_id: 10, order_id: 100, order_name: 'Обвесы', qty: 100, status: 'active', source: 'project_hardware', created_at: '2026-10-20T10:00:00.000Z' },
        { id: 6, item_id: 10, order_id: 100, order_name: 'Обвесы', qty: 100, status: 'active', source: 'order_calc', created_at: '2026-10-20T10:00:00.000Z' },
    ]);
    const tab = createTab(server, world);
    await run(tab, 'Warehouse.reconcileProjectHardwareReservations()');
    const rows = serverReservations(server);
    assert.equal(rows.length, 2, 'no new record is needed to fix a doubled pair');
    assert.deepEqual(rows.filter(r => r.status === 'active').map(r => [r.id, r.qty]), [[5, 100]]);
    assert.equal(rows.find(r => r.id === 6).status, 'released');
}

async function main() {
    const blobMerge = await import(pathToFileURL(path.join(__dirname, '..', 'ops/api/src/compat-blob-patch.js')).href);
    await smokeRepeatedSavesAndReconcilesKeepTheList(blobMerge);
    await smokeLegacyDuplicatesCollapseToOneRecord(blobMerge);
    console.log('warehouse reservations churn smoke ok');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

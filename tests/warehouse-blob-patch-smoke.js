// Shared warehouse blobs (reservations, history, collected checkboxes) and the
// ready goods lists (stock, history, sales records) must never be overwritten
// whole from a stale tab, and ready goods must not be wiped by a slow read.
// Two vm "tabs" share one fake server that applies the real ops/api merge
// (compat-blob-patch.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');

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
        rows: {
            warehouse_reservations: { id: 1, reservations_data: '[]' },
            warehouse_history: { id: 1, history_data: '[]' },
        },
        settings: new Map(),
        failReads: false,
        // When set, patchBlob answers with this error instead of merging
        // (e.g. { status: 404 } for an API that has no blob-patch route yet).
        patchError: null,
        settingsWrites: [],
        patches: [],
    };
    const settingsField = key => ({ read: () => server.settings.get(key), write: v => { server.settings.set(key, v); } });
    const BLOB_FIELDS = {
        warehouse_reservations: { read: () => server.rows.warehouse_reservations.reservations_data, write: v => { server.rows.warehouse_reservations.reservations_data = v; } },
        warehouse_history: { read: () => server.rows.warehouse_history.history_data, write: v => { server.rows.warehouse_history.history_data = v; } },
        project_hardware_state: settingsField('project_hardware_state_json'),
        ready_goods_stock: settingsField('ready_goods_stock_json'),
        ready_goods_history: settingsField('ready_goods_history_json'),
        ready_goods_sales_records: settingsField('ready_goods_sales_records_json'),
    };
    server.client = {
        async patchBlob(target, patch) {
            server.patches.push({ target, patch: JSON.parse(JSON.stringify(patch)) });
            if (server.patchError) return { data: null, error: { code: String(server.patchError.status), message: 'patch refused', ...server.patchError } };
            const field = BLOB_FIELDS[target];
            const value = blobMerge.applyBlobPatchToValue(target, field.read(), JSON.parse(JSON.stringify(patch)), new Date().toISOString());
            field.write(JSON.stringify(value));
            return { data: { value: JSON.parse(JSON.stringify(value)) }, error: null };
        },
        from(table) {
            const filters = [];
            const query = {
                select() { return query; },
                eq(column, value) { filters.push([column, value]); return query; },
                not() { return query; },
                order() { return query; },
                async maybeSingle() {
                    if (server.failReads) return { data: null, error: { code: '503', message: 'slow' } };
                    if (table === 'settings') {
                        const key = filters.find(([column]) => column === 'key')?.[1];
                        return { data: server.settings.has(key) ? { key, value: server.settings.get(key) } : null, error: null };
                    }
                    return { data: { ...server.rows[table] }, error: null };
                },
                async upsert(payload) {
                    const rows = Array.isArray(payload) ? payload : [payload];
                    if (table === 'settings') {
                        rows.forEach(row => { server.settingsWrites.push(row.key); server.settings.set(row.key, row.value); });
                    } else {
                        server.rows[table] = { ...server.rows[table], ...rows[0] };
                    }
                    return { error: null };
                },
            };
            return query;
        },
    };
    return server;
}

function createTab(server) {
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
        document: {},
        location: { href: 'https://calc.recycleobject.ru/', origin: 'https://calc.recycleobject.ru', protocol: 'https:', hostname: 'calc.recycleobject.ru' },
        URL, URLSearchParams,
        fetch: async () => ({ ok: false, status: 404, async json() { return {}; } }),
        __RO_REMOTE_LOAD_TIMEOUT_MS: 200,
        __RO_REMOTE_WRITE_TIMEOUT_MS: 200,
        App: {},
    };
    context.window = context;
    context.globalThis = context;
    context.createPlatformClient = () => server.client;
    vm.createContext(context);
    const code = fs.readFileSync(path.join(__dirname, '..', 'js/supabase.js'), 'utf8');
    vm.runInContext(code, context, { filename: 'js/supabase.js' });
    vm.runInContext('initSupabase()', context);
    return context;
}

const run = (tab, code) => vm.runInContext(code, tab);
const serverReservations = server => JSON.parse(server.rows.warehouse_reservations.reservations_data);

async function smokeTwoTabsKeepEachOthersReservations(blobMerge) {
    const server = createServer(blobMerge);
    server.rows.warehouse_reservations.reservations_data = JSON.stringify([
        { id: 1, item_id: 10, order_id: 100, qty: 5, status: 'active', source: 'manual' },
    ]);
    const tabA = createTab(server);
    const tabB = createTab(server);
    await run(tabA, 'globalThis.__a = loadWarehouseReservations()');
    await run(tabA, 'globalThis.__a.then(r => { globalThis.__aRes = r; })');
    await run(tabB, `(async () => {
        const r = await loadWarehouseReservations();
        r.push({ id: 2, item_id: 11, order_id: 200, qty: 3, status: 'active', source: 'manual' });
        await saveWarehouseReservations(r);
    })()`);
    await run(tabA, `(async () => {
        const r = globalThis.__aRes;
        r[0].status = 'released';
        await saveWarehouseReservations(r);
    })()`);
    const ids = serverReservations(server).map(r => `${r.id}:${r.status}`);
    assert.deepEqual(ids, ['1:released', '2:active'], 'tab A must not erase the reservation tab B added');
    const lastPatch = server.patches[server.patches.length - 1].patch;
    assert.equal(lastPatch.upserts.length, 1, 'only the changed reservation is sent');
    assert.deepEqual(lastPatch.removeIds, []);
}

async function smokeStaleFallbackDoesNotWipeReservations(blobMerge) {
    const server = createServer(blobMerge);
    const tab = createTab(server);
    // The tab cached an old list, then the server got new reservations.
    run(tab, `localStorage.setItem(LOCAL_KEYS.warehouseReservations, JSON.stringify([{ id: 1, status: 'active', source: 'manual' }]))`);
    server.rows.warehouse_reservations.reservations_data = JSON.stringify([
        { id: 1, status: 'active', source: 'manual' },
        { id: 2, status: 'active', source: 'manual' },
        { id: 3, status: 'active', source: 'manual' },
    ]);
    server.failReads = true;
    await run(tab, `(async () => {
        const r = await loadWarehouseReservations();
        if (r.length !== 1) throw new Error('test must load the stale fallback, got ' + r.length);
        r.push({ id: 4, status: 'active', source: 'manual' });
        await saveWarehouseReservations(r);
    })()`);
    assert.deepEqual(serverReservations(server).map(r => r.id), [1, 2, 3, 4], 'stale copy must not delete 2 and 3');
}

async function smokeHistoryRemovesOnlyKnownEntries(blobMerge) {
    const server = createServer(blobMerge);
    server.rows.warehouse_history.history_data = JSON.stringify([{ id: 1, audit: 7 }, { id: 2, audit: 7 }, { id: 3 }]);
    const tab = createTab(server);
    await run(tab, 'globalThis.__h = loadWarehouseHistory().then(h => { globalThis.__hist = h; })');
    await run(tab, 'globalThis.__h');
    // Someone else logs a movement meanwhile.
    const current = JSON.parse(server.rows.warehouse_history.history_data);
    server.rows.warehouse_history.history_data = JSON.stringify([{ id: 9, other: true }, ...current]);
    // Deleting audit 7 filters its entries and adds a new one on top.
    await run(tab, `(async () => {
        const next = globalThis.__hist.filter(entry => entry.audit !== 7);
        next.unshift({ id: 10, type: 'audit_delete' });
        await saveWarehouseHistory(next);
    })()`);
    const ids = JSON.parse(server.rows.warehouse_history.history_data).map(entry => entry.id);
    assert.deepEqual(ids, [10, 9, 3], 'audit entries removed, the other tab movement kept, new entry on top');
}

async function smokeCollectedCheckboxesSurviveStaleTab(blobMerge) {
    const server = createServer(blobMerge);
    server.settings.set('project_hardware_state_json', JSON.stringify({ checks: { '1:1': true }, actual_qtys: {} }));
    const tab = createTab(server);
    await run(tab, 'loadProjectHardwareState().then(s => { globalThis.__state = s; })');
    // Warehouse staff tick another row later in the day.
    server.settings.set('project_hardware_state_json', JSON.stringify({ checks: { '1:1': true, '2:2': true }, actual_qtys: { '2:2': 40 } }));
    // The morning tab saves an order: it touches only its own row.
    await run(tab, `(async () => {
        globalThis.__state.checks['3:3'] = true;
        globalThis.__state.updated_by = 'Менеджер';
        await saveProjectHardwareState(globalThis.__state);
    })()`);
    const state = JSON.parse(server.settings.get('project_hardware_state_json'));
    assert.deepEqual(state.checks, { '1:1': true, '2:2': true, '3:3': true });
    assert.deepEqual(state.actual_qtys, { '2:2': 40 });
    assert.equal(state.updated_by, 'Менеджер');
}

async function smokeSettingsPageNeverWritesHardwareState(blobMerge) {
    const server = createServer(blobMerge);
    const tab = createTab(server);
    await run(tab, `saveAllSettings({ fot_per_hour: 600, project_hardware_state_json: '{"checks":{}}' })`);
    assert.deepEqual(server.settingsWrites, ['fot_per_hour']);
}

async function smokeReadyGoodsSurviveSlowRead(blobMerge) {
    const server = createServer(blobMerge);
    server.settings.set('ready_goods_stock_json', JSON.stringify([{ id: 1, name: 'Брелок', qty: 50 }]));
    const tab = createTab(server);
    server.failReads = true;
    const loaded = await run(tab, 'loadReadyGoods()');
    assert.equal(server.settingsWrites.length, 0, 'a failed read must not seed an empty list');
    assert.equal(JSON.parse(server.settings.get('ready_goods_stock_json')).length, 1);
    assert.equal(Array.isArray(loaded), true);
    await assert.rejects(run(tab, 'saveReadyGoods([])'), /READY_GOODS_SHARED_UNAVAILABLE/);
    assert.equal(JSON.parse(server.settings.get('ready_goods_stock_json')).length, 1, 'save after a failed read must be refused');
    assert.equal(server.patches.length, 0, 'a refused save sends no patch either');
    // A truly missing row is still seeded.
    server.failReads = false;
    server.settings.delete('ready_goods_history_json');
    await run(tab, 'loadReadyGoodsHistory()');
    assert.equal(server.settings.get('ready_goods_history_json'), '[]');
}

// Ready goods stock, its history and the sales records are three settings rows
// holding record lists; they are written as patches like the warehouse blobs.
const READY_GOODS_STORES = [
    { name: 'stock', key: 'ready_goods_stock_json', target: 'ready_goods_stock', load: 'loadReadyGoods', save: 'saveReadyGoods' },
    { name: 'history', key: 'ready_goods_history_json', target: 'ready_goods_history', load: 'loadReadyGoodsHistory', save: 'saveReadyGoodsHistory' },
    { name: 'sales', key: 'ready_goods_sales_records_json', target: 'ready_goods_sales_records', load: 'loadSalesRecords', save: 'saveSalesRecords' },
];
const serverList = (server, store) => JSON.parse(server.settings.get(store.key));
const lastPatchFor = (server, store) => server.patches.filter(entry => entry.target === store.target).pop();

async function smokeReadyGoodsTwoTabsKeepEachOthersRows(blobMerge) {
    for (const store of READY_GOODS_STORES) {
        const server = createServer(blobMerge);
        server.settings.set(store.key, JSON.stringify([{ id: 1, qty: 10 }]));
        const tabA = createTab(server);
        const tabB = createTab(server);
        // A loads the list and keeps it open while B works.
        await run(tabA, `${store.load}().then(rows => { globalThis.__rows = rows; })`);
        await run(tabB, `(async () => {
            const rows = await ${store.load}();
            rows.push({ id: 2, qty: 3 });
            await ${store.save}(rows);
        })()`);
        const patchB = lastPatchFor(server, store).patch;
        assert.deepEqual(patchB.upserts.map(row => row.id), [2], `${store.name}: tab B sends only its new row`);
        assert.deepEqual(patchB.removeIds, [], `${store.name}: tab B removes nothing`);
        // A edits row 1 from its stale copy, which has never seen row 2.
        await run(tabA, `(async () => {
            globalThis.__rows[0].qty = 9;
            await ${store.save}(globalThis.__rows);
        })()`);
        assert.deepEqual(
            serverList(server, store).map(row => `${row.id}:${row.qty}`),
            ['1:9', '2:3'],
            `${store.name}: tab A must not erase the row tab B added`,
        );
        const patchA = lastPatchFor(server, store).patch;
        assert.deepEqual(patchA.upserts.map(row => row.id), [1], `${store.name}: only the changed row is sent`);
        assert.deepEqual(patchA.removeIds, [], `${store.name}: tab A removes nothing it did not drop`);
        assert.deepEqual(server.settingsWrites, [], `${store.name}: no whole-list write`);
    }
}

async function smokeReadyGoodsDeleteRemovesOnlyKnownRows(blobMerge) {
    const server = createServer(blobMerge);
    server.settings.set('ready_goods_stock_json', JSON.stringify([
        { id: 1, qty: 10, order_id: 5 },
        { id: 2, qty: 4, order_id: 6 },
    ]));
    const tab = createTab(server);
    await run(tab, 'loadReadyGoods().then(rows => { globalThis.__rows = rows; })');
    // Another tab moves one more order to ready goods meanwhile.
    server.settings.set('ready_goods_stock_json', JSON.stringify([
        { id: 1, qty: 10, order_id: 5 },
        { id: 2, qty: 4, order_id: 6 },
        { id: 3, qty: 8, order_id: 7 },
    ]));
    // Returning order 5 from "Готово" saves a rebuilt list without its row.
    await run(tab, `(async () => {
        const remaining = globalThis.__rows.map(item => ({ ...item })).filter(item => item.order_id !== 5);
        await saveReadyGoods(remaining);
    })()`);
    assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [2, 3], 'the other tab row survives');
    const patch = lastPatchFor(server, READY_GOODS_STORES[0]).patch;
    assert.deepEqual(patch.upserts, [], 'unchanged rows are not re-sent');
    assert.deepEqual(patch.removeIds, ['1'], 'only the row this tab saw and dropped is removed');
}

async function smokeReadyGoodsConsumerCopiesDoNotLookChanged(blobMerge) {
    const server = createServer(blobMerge);
    server.settings.set('ready_goods_stock_json', JSON.stringify([
        { id: 1, qty: 5, location_type: 'our' },
        { id: 2, qty: 7, location_type: 'partner' },
    ]));
    const tab = createTab(server);
    // The warehouse screens clone every row (_normalizeReadyGoodsItem) before editing.
    await run(tab, `(async () => {
        const rows = (await loadReadyGoods()).map(item => ({ ...item, location_type: item.location_type === 'partner' ? 'partner' : 'our' }));
        rows.push({ id: 3, qty: 1, location_type: 'our' });
        await saveReadyGoods(rows);
    })()`);
    const patch = lastPatchFor(server, READY_GOODS_STORES[0]).patch;
    assert.deepEqual(patch.upserts.map(row => row.id), [3], 'cloned but unchanged rows are not re-sent');
    assert.deepEqual(patch.removeIds, []);
    assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [1, 2, 3]);
    // Saving a list nobody touched sends nothing at all.
    const sent = server.patches.length;
    await run(tab, `(async () => { const rows = await loadReadyGoods(); await saveReadyGoods(rows); })()`);
    await run(tab, `(async () => { const rows = (await loadReadyGoods()).map(item => ({ ...item })); await saveReadyGoods(rows); })()`);
    assert.equal(server.patches.length, sent, 'an unchanged list is not written');
}

// The API cannot take a patch *yet*: it has no blob-patch route (404/405), or it is the
// build from before this blob existed and answers 400 INVALID_BLOB_TARGET. The SPA and the
// API deploy from one merge a few minutes apart, so saves must not fail in that window.
const PATCH_NOT_READY_ERRORS = [
    { status: 404 },
    { status: 405 },
    { status: 400, code: 'INVALID_BLOB_TARGET', message: 'Неизвестный блоб: ready_goods_stock' },
];
// Real refusals keep failing loudly: another 400 code, and server errors.
const PATCH_REFUSED_ERRORS = [
    { status: 400 },
    { status: 400, code: 'INVALID_ACTION' },
    { status: 500 },
];
const errorLabel = patchError => `${patchError.status} ${patchError.code || ''}`.trim();

async function smokeReadyGoodsWholeWriteOnlyWhenPatchRouteIsMissing(blobMerge) {
    for (const patchError of PATCH_NOT_READY_ERRORS) {
        const status = errorLabel(patchError);
        const server = createServer(blobMerge);
        server.settings.set('ready_goods_stock_json', JSON.stringify([{ id: 1, qty: 10 }]));
        server.patchError = patchError;
        const tab = createTab(server);
        await run(tab, `(async () => {
            globalThis.__rows = await loadReadyGoods();
            globalThis.__rows.push({ id: 2, qty: 3 });
            await saveReadyGoods(globalThis.__rows);
        })()`);
        assert.deepEqual(server.settingsWrites, ['ready_goods_stock_json'], `${status}: the old whole-list write is the fallback`);
        assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [1, 2]);
        // The whole write also makes the saved list the new base: once the route
        // appears, only the row edited since then is sent.
        server.patchError = null;
        await run(tab, `(async () => { globalThis.__rows[1].qty = 4; await saveReadyGoods(globalThis.__rows); })()`);
        assert.deepEqual(lastPatchFor(server, READY_GOODS_STORES[0]).patch.upserts, [{ id: 2, qty: 4 }], `${status}: only the new edit is patched`);
        assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => `${row.id}:${row.qty}`), ['1:10', '2:4']);
        assert.deepEqual(server.settingsWrites, ['ready_goods_stock_json'], `${status}: and no second whole-list write`);
    }
    // Any other failure must never turn into a whole-list overwrite.
    for (const patchError of PATCH_REFUSED_ERRORS) {
        const status = errorLabel(patchError);
        const server = createServer(blobMerge);
        server.settings.set('ready_goods_stock_json', JSON.stringify([{ id: 1, qty: 10 }]));
        const tab = createTab(server);
        await run(tab, 'loadReadyGoods().then(rows => { globalThis.__rows = rows; })');
        server.patchError = patchError;
        await assert.rejects(
            run(tab, `(async () => { globalThis.__rows.push({ id: 2, qty: 3 }); await saveReadyGoods(globalThis.__rows); })()`),
            /READY_GOODS_SHARED_UNAVAILABLE/,
            `${status}: a failed patch is reported, not hidden`,
        );
        assert.deepEqual(server.settingsWrites, [], `${status}: no whole-list write after a failed patch`);
        assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [1]);
        // Once the api answers again the same change goes through.
        server.patchError = null;
        await run(tab, 'saveReadyGoods(globalThis.__rows)');
        assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [1, 2], `${status}: retry sends the unsaved change`);
        assert.deepEqual(server.settingsWrites, []);
        // A saved list is the new base: saving it again sends nothing.
        const sent = server.patches.length;
        await run(tab, 'saveReadyGoods(globalThis.__rows)');
        assert.equal(server.patches.length, sent, `${status}: a saved list is not sent twice`);
    }
}

// The new SPA is live before the API that knows the ready goods targets (and an API
// without the route at all): every store keeps saving, by the old whole-list write.
async function smokeUnknownBlobTargetFallsBackToWholeWrite(blobMerge) {
    const unknownTarget = { status: 400, code: 'INVALID_BLOB_TARGET', message: 'Неизвестный блоб' };
    for (const store of READY_GOODS_STORES) {
        const server = createServer(blobMerge);
        server.settings.set(store.key, JSON.stringify([{ id: 1, qty: 10 }]));
        server.patchError = unknownTarget;
        const tab = createTab(server);
        await run(tab, `(async () => {
            const rows = await ${store.load}();
            rows.push({ id: 2, qty: 3 });
            await ${store.save}(rows);
        })()`);
        assert.deepEqual(serverList(server, store).map(row => row.id), [1, 2], `${store.name}: the data is saved by the old whole-list write`);
        assert.deepEqual(server.settingsWrites, [store.key], `${store.name}: one whole-list write`);
        // Once the API knows the target the very next save is a patch again.
        server.patchError = null;
        await run(tab, `(async () => {
            const rows = await ${store.load}();
            rows[0].qty = 9;
            await ${store.save}(rows);
        })()`);
        assert.deepEqual(lastPatchFor(server, store).patch.upserts.map(row => row.id), [1], `${store.name}: back to patches`);
        assert.deepEqual(serverList(server, store).map(row => `${row.id}:${row.qty}`), ['1:9', '2:3']);
        assert.deepEqual(server.settingsWrites, [store.key], `${store.name}: and no second whole-list write`);
    }
    // The warehouse blobs go through the same helper and fall back the same way.
    const server = createServer(blobMerge);
    server.patchError = unknownTarget;
    const tab = createTab(server);
    await run(tab, `(async () => {
        const reservations = await loadWarehouseReservations();
        reservations.push({ id: 5, item_id: 1, order_id: 1, qty: 2, status: 'active', source: 'manual' });
        await saveWarehouseReservations(reservations);
    })()`);
    assert.deepEqual(serverReservations(server).map(r => r.id), [5], 'reservations fall back to the whole write too');
}

async function smokeReadyGoodsRefuseSaveAfterFailedReload(blobMerge) {
    const server = createServer(blobMerge);
    server.settings.set('ready_goods_stock_json', JSON.stringify([{ id: 1, qty: 50 }]));
    const tab = createTab(server);
    await run(tab, 'loadReadyGoods().then(rows => { globalThis.__rows = rows; })');
    // The next read fails: the tab is back on an unverified fallback.
    server.failReads = true;
    await run(tab, 'loadReadyGoods()');
    await assert.rejects(
        run(tab, 'saveReadyGoods(globalThis.__rows.concat([{ id: 2, qty: 1 }]))'),
        /READY_GOODS_SHARED_UNAVAILABLE/,
    );
    assert.equal(server.patches.length, 0, 'no patch is sent from an unverified copy');
    assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [1]);
    // Reading successfully again restores saving.
    server.failReads = false;
    await run(tab, 'loadReadyGoods().then(rows => { globalThis.__rows = rows; })');
    await run(tab, `(async () => { globalThis.__rows.push({ id: 2, qty: 1 }); await saveReadyGoods(globalThis.__rows); })()`);
    assert.deepEqual(serverList(server, READY_GOODS_STORES[0]).map(row => row.id), [1, 2]);
}

async function main() {
    const blobMerge = await import(pathToFileURL(path.join(__dirname, '..', 'ops/api/src/compat-blob-patch.js')).href);
    await smokeTwoTabsKeepEachOthersReservations(blobMerge);
    await smokeStaleFallbackDoesNotWipeReservations(blobMerge);
    await smokeHistoryRemovesOnlyKnownEntries(blobMerge);
    await smokeCollectedCheckboxesSurviveStaleTab(blobMerge);
    await smokeSettingsPageNeverWritesHardwareState(blobMerge);
    await smokeReadyGoodsSurviveSlowRead(blobMerge);
    await smokeReadyGoodsTwoTabsKeepEachOthersRows(blobMerge);
    await smokeReadyGoodsDeleteRemovesOnlyKnownRows(blobMerge);
    await smokeReadyGoodsConsumerCopiesDoNotLookChanged(blobMerge);
    await smokeReadyGoodsWholeWriteOnlyWhenPatchRouteIsMissing(blobMerge);
    await smokeUnknownBlobTargetFallsBackToWholeWrite(blobMerge);
    await smokeReadyGoodsRefuseSaveAfterFailedReload(blobMerge);
    console.log('warehouse blob patch smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

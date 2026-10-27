// Shared warehouse blobs (reservations, history, collected checkboxes) must
// never be overwritten whole from a stale tab, and ready goods must not be
// wiped by a slow read. Two vm "tabs" share one fake server that applies the
// real ops/api merge (compat-blob-patch.js).
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
        settingsWrites: [],
        patches: [],
    };
    const BLOB_FIELDS = {
        warehouse_reservations: { read: () => server.rows.warehouse_reservations.reservations_data, write: v => { server.rows.warehouse_reservations.reservations_data = v; } },
        warehouse_history: { read: () => server.rows.warehouse_history.history_data, write: v => { server.rows.warehouse_history.history_data = v; } },
        project_hardware_state: { read: () => server.settings.get('project_hardware_state_json'), write: v => { server.settings.set('project_hardware_state_json', v); } },
    };
    server.client = {
        async patchBlob(target, patch) {
            server.patches.push({ target, patch: JSON.parse(JSON.stringify(patch)) });
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
    // A truly missing row is still seeded.
    server.failReads = false;
    server.settings.delete('ready_goods_history_json');
    await run(tab, 'loadReadyGoodsHistory()');
    assert.equal(server.settings.get('ready_goods_history_json'), '[]');
}

async function main() {
    const blobMerge = await import(pathToFileURL(path.join(__dirname, '..', 'ops/api/src/compat-blob-patch.js')).href);
    await smokeTwoTabsKeepEachOthersReservations(blobMerge);
    await smokeStaleFallbackDoesNotWipeReservations(blobMerge);
    await smokeHistoryRemovesOnlyKnownEntries(blobMerge);
    await smokeCollectedCheckboxesSurviveStaleTab(blobMerge);
    await smokeSettingsPageNeverWritesHardwareState(blobMerge);
    await smokeReadyGoodsSurviveSlowRead(blobMerge);
    console.log('warehouse blob patch smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, 'output', 'yandex-writeback-smoke');
fs.mkdirSync(outputDir, { recursive: true });

const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');

function extractConst(name) {
  const match = supabaseSource.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`));
  return match ? match[1] : '';
}

const supabaseUrl = (process.env.SUPABASE_URL || extractConst('SUPABASE_URL')).replace(/\/+$/, '');
const proxyUrl = (process.env.RO_YANDEX_PROXY_URL || extractConst('YANDEX_SUPABASE_PROXY_URL')).replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || extractConst('SUPABASE_ANON_KEY');
const smokeKey = process.env.RO_YANDEX_WRITEBACK_KEY || 'ro_yandex_writeback_smoke_json';
const marker = [
  'yandex-writeback',
  process.env.GITHUB_RUN_ID || 'local',
  Date.now(),
  Math.random().toString(36).slice(2),
].join('-');
const now = new Date().toISOString();
const smokeValue = {
  ok: true,
  source: 'yandex-writeback-smoke',
  marker,
  written_at: now,
};
const smokeIdBase = Date.now();
const cleanupTasks = [];

function assertConfigured() {
  assert.ok(supabaseUrl, 'SUPABASE_URL is required');
  assert.ok(proxyUrl, 'RO_YANDEX_PROXY_URL / YANDEX_SUPABASE_PROXY_URL is required');
  assert.ok(anonKey, 'SUPABASE_ANON_KEY is required');
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (error) {
      throw new Error(`Expected JSON from ${url}, got HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
  }
  return { response, json, text };
}

function authHeaders(extra = {}) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    ...extra,
  };
}

function parseStoredValue(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return null;
  }
}

async function restRequest(baseUrl, pathname, options = {}) {
  const url = `${baseUrl}${pathname}`;
  return fetchJson(url, {
    ...options,
    headers: authHeaders({
      accept: 'application/json',
      origin: 'https://calc2.recycleobject.ru',
      ...(options.headers || {}),
    }),
  });
}

async function writeViaYandexProxy() {
  const row = {
    key: smokeKey,
    value: JSON.stringify(smokeValue),
    updated_at: now,
  };
  const { response, json, text } = await fetchJson(`${proxyUrl}/rest/v1/settings?on_conflict=key`, {
    method: 'POST',
    headers: authHeaders({
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates,return=representation',
      origin: 'https://calc2.recycleobject.ru',
    }),
    body: JSON.stringify([row]),
  });
  assert.ok(
    response.ok,
    `Yandex proxy write failed with HTTP ${response.status}: ${text.slice(0, 500)}`,
  );
  assert.ok(Array.isArray(json) && json.length === 1, `Expected one written row from proxy, got ${JSON.stringify(json)}`);
  assert.equal(json[0].key, smokeKey);
  assert.equal(parseStoredValue(json[0].value)?.marker, marker);
  return json[0];
}

async function readDirectFromSupabase() {
  const url = `${supabaseUrl}/rest/v1/settings?select=key,value,updated_at&key=eq.${encodeURIComponent(smokeKey)}&limit=1`;
  const { response, json, text } = await fetchJson(url, {
    headers: authHeaders({
      accept: 'application/json',
    }),
  });
  assert.ok(response.ok, `Direct Supabase read failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert.ok(Array.isArray(json) && json.length === 1, `Expected one direct Supabase row, got ${JSON.stringify(json)}`);
  assert.equal(json[0].key, smokeKey);
  assert.equal(parseStoredValue(json[0].value)?.marker, marker);
  return json[0];
}

async function readBackViaYandexProxy() {
  const url = `${proxyUrl}/rest/v1/settings?select=key,value,updated_at&key=eq.${encodeURIComponent(smokeKey)}&limit=1`;
  const { response, json, text } = await fetchJson(url, {
    headers: authHeaders({
      accept: 'application/json',
      origin: 'https://calc2.recycleobject.ru',
    }),
  });
  assert.ok(response.ok, `Yandex proxy readback failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert.ok(Array.isArray(json) && json.length === 1, `Expected one proxy readback row, got ${JSON.stringify(json)}`);
  assert.equal(parseStoredValue(json[0].value)?.marker, marker);
  return json[0];
}

async function upsertViaProxy(table, rows, conflictColumn = 'id') {
  const { response, json, text } = await restRequest(
    proxyUrl,
    `/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictColumn)}`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
    },
  );
  assert.ok(response.ok, `${table} proxy upsert failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert.ok(Array.isArray(json) && json.length > 0, `${table} proxy upsert returned no rows: ${JSON.stringify(json)}`);
  return json;
}

async function readDirectRow(table, id) {
  const { response, json, text } = await restRequest(
    supabaseUrl,
    `/rest/v1/${table}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
  );
  assert.ok(response.ok, `${table} direct read failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  assert.ok(Array.isArray(json) && json.length === 1, `${table} expected one direct row, got ${JSON.stringify(json)}`);
  return json[0];
}

async function deleteViaProxy(table, id) {
  const { response, text } = await restRequest(
    proxyUrl,
    `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        prefer: 'return=minimal',
      },
    },
  );
  assert.ok(response.ok, `${table} cleanup delete failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
}

function scheduleCleanup(table, id) {
  cleanupTasks.push(async () => {
    await deleteViaProxy(table, id);
  });
}

async function assertTransientTableWrite({ table, row, parseColumn, expectedMarker }) {
  await upsertViaProxy(table, row);
  scheduleCleanup(table, row.id);
  const direct = await readDirectRow(table, row.id);
  const parsed = parseStoredValue(direct[parseColumn]);
  assert.equal(parsed?.marker, expectedMarker, `${table}.${parseColumn} marker mismatch`);
  return direct;
}

async function runTransientTableChecks() {
  const warehouseItemId = smokeIdBase + 101;
  const shipmentId = smokeIdBase + 102;
  const chinaPurchaseId = smokeIdBase + 103;
  const moldId = smokeIdBase + 104;

  const warehouseItem = await assertTransientTableWrite({
    table: 'warehouse_items',
    parseColumn: 'item_data',
    expectedMarker: marker,
    row: {
      id: warehouseItemId,
      name: `RO_SMOKE warehouse ${marker}`,
      sku: `RO-SMOKE-${warehouseItemId}`,
      category: 'hardware',
      item_data: JSON.stringify({
        id: warehouseItemId,
        name: `RO_SMOKE warehouse ${marker}`,
        sku: `RO-SMOKE-${warehouseItemId}`,
        category: 'hardware',
        qty: 1,
        unit: 'шт',
        price_per_unit: 1,
        marker,
      }),
      created_at: now,
      updated_at: now,
    },
  });

  const shipment = await assertTransientTableWrite({
    table: 'shipments',
    parseColumn: 'shipment_data',
    expectedMarker: marker,
    row: {
      id: shipmentId,
      shipment_data: JSON.stringify({
        id: shipmentId,
        status: 'draft',
        name: `RO_SMOKE shipment ${marker}`,
        marker,
        items: [],
      }),
      created_at: now,
      updated_at: now,
    },
  });

  const chinaPurchase = await assertTransientTableWrite({
    table: 'china_purchases',
    parseColumn: 'purchase_data',
    expectedMarker: marker,
    row: {
      id: chinaPurchaseId,
      status: 'draft',
      purchase_data: JSON.stringify({
        id: chinaPurchaseId,
        status: 'draft',
        title: `RO_SMOKE china ${marker}`,
        marker,
        items: [],
      }),
      created_at: now,
      updated_at: now,
    },
  });

  const mold = await assertTransientTableWrite({
    table: 'molds',
    parseColumn: 'mold_data',
    expectedMarker: marker,
    row: {
      id: moldId,
      name: `RO_SMOKE mold ${marker}`,
      mold_data: JSON.stringify({
        id: moldId,
        name: `RO_SMOKE mold ${marker}`,
        category: 'blank',
        status: 'archived',
        marker,
      }),
      created_at: now,
      updated_at: now,
    },
  });

  return {
    warehouseItem: { id: warehouseItem.id, sku: warehouseItem.sku },
    shipment: { id: shipment.id },
    chinaPurchase: { id: chinaPurchase.id, status: chinaPurchase.status },
    mold: { id: mold.id, name: mold.name },
  };
}

async function cleanupTransientRows() {
  const errors = [];
  for (const task of cleanupTasks.reverse()) {
    try {
      await task();
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  assert.deepEqual(errors, [], `Write-back smoke cleanup failed: ${errors.join('; ')}`);
}

async function main() {
  assertConfigured();
  let tableChecks = null;
  let result = null;
  try {
    const writtenViaProxy = await writeViaYandexProxy();
    const readViaSupabase = await readDirectFromSupabase();
    const readViaProxy = await readBackViaYandexProxy();
    tableChecks = await runTransientTableChecks();

    result = {
      ok: true,
      smokeKey,
      marker,
      proxyUrl,
      supabaseUrl,
      writtenViaProxy,
      readViaSupabase,
      readViaProxy,
      tableChecks,
    };
  } finally {
    await cleanupTransientRows();
  }
  fs.writeFileSync(path.join(outputDir, 'state.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    ok: true,
    smokeKey,
    marker,
    proxyHost: new URL(proxyUrl).host,
    supabaseHost: new URL(supabaseUrl).host,
    tableChecks,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

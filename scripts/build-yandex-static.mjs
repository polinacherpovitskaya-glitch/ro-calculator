import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'url';
import { execFileSync } from 'node:child_process';
import {
  platformSelectAll,
  platformSelectOne,
} from './platform-compat-client.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'deploy/static-yandex');
const BUCKET = process.env.RO_YANDEX_BUCKET || 'calc2.recycleobject.ru';
const STORAGE_ORIGIN = process.env.RO_YANDEX_STORAGE_ORIGIN || `https://storage.yandexcloud.net/${BUCKET}`;

const MIRROR_ORDER_STATUSES = new Set([
  'draft',
  'calculated',
  'sample',
  'production_casting',
  'production_printing',
  'production_hardware',
  'production_packaging',
  'in_production',
  'delivery',
  'completed',
  'cancelled',
]);

const COPY_PATHS = [
  'css',
  'js',
  'vendor',
  'assets',
  'img',
  'data',
];

const SKIP_SETTINGS_IN_SNAPSHOT = new Set([
  'warehouse_items_json',
  'auth_accounts_json',
  'project_hardware_state_json',
  'factual_month_snapshots_json',
]);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function rewriteIndexForObjectStorage(source) {
  return source.replace(/\b(src|href)="(?!https?:|\/\/|#|mailto:|tel:|data:)([^"]+)"/g, (match, attr, rawUrl) => {
    const cleanUrl = rawUrl.replace(/^\.\//, '').replace(/^\//, '');
    if (!/^(assets|css|data|img|js|vendor)\//.test(cleanUrl)) return match;
    return `${attr}="${STORAGE_ORIGIN}/${cleanUrl}"`;
  });
}

// Keep deterministic paging for large JSON rows such as order_items.
export async function fetchPlatformAllPages(table, options = {}) {
  return platformSelectAll(table, options);
}

async function fetchSettingJson(key, fallback) {
  const row = await platformSelectOne('settings', {
    columns: 'value',
    filters: [{ op: 'eq', column: 'key', value: key }],
  });
  const raw = row?.value;
  if (!raw) return fallback;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

function stripHeavy(value, depth = 0) {
  if (depth > 12) return undefined;
  if (Array.isArray(value)) return value.map(item => stripHeavy(item, depth + 1)).filter(item => item !== undefined);
  if (!value || typeof value !== 'object') return value;

  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (
      normalizedKey.includes('photo')
      || normalizedKey.includes('image')
      || normalizedKey.includes('thumbnail')
      || normalizedKey.includes('base64')
      || normalizedKey.includes('dataurl')
      || normalizedKey.includes('storage_path')
      || normalizedKey.includes('storage_bucket')
    ) {
      continue;
    }
    const clean = stripHeavy(nested, depth + 1);
    if (clean !== undefined && clean !== null && clean !== '') out[key] = clean;
  }
  return out;
}

function parseJsonColumn(row, columnName) {
  if (!row || !row[columnName]) return {};
  try {
    return typeof row[columnName] === 'string' ? JSON.parse(row[columnName]) : row[columnName];
  } catch (_) {
    return {};
  }
}

function parseOrderRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const parsed = parseJsonColumn(row, 'calculator_data');
      const full = stripHeavy({ ...parsed, ...row });
      delete full.calculator_data;
      return full;
    })
    .filter(order => MIRROR_ORDER_STATUSES.has(String(order.status || '')));
}

function parseOrderItemRows(rows, orderIds) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const parsed = parseJsonColumn(row, 'item_data');
      const full = stripHeavy({ ...parsed, ...row });
      delete full.item_data;
      return full;
    })
    .filter(item => orderIds.has(Number(item.order_id)));
}

function parseWarehouseRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const parsed = parseJsonColumn(row, 'item_data');
    const full = stripHeavy({ ...parsed, ...row, id: row.id });
    delete full.item_data;
    return full;
  });
}

function parseShipmentRows(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => {
    const parsed = parseJsonColumn(row, 'shipment_data');
    const full = stripHeavy({ ...parsed, ...row, id: row.id });
    delete full.shipment_data;
    return full;
  });
}

function parseChinaPurchaseRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map(row => {
      const parsed = parseJsonColumn(row, 'purchase_data');
      const full = stripHeavy({ ...parsed, ...row, id: row.id });
      delete full.purchase_data;
      return full;
    })
    .filter(purchase => String(purchase.status || '') !== 'deleted');
}

function parseSingletonJsonRow(rows, columnName, fallback) {
  const raw = rows?.[0]?.[columnName];
  if (!raw) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }
  return raw;
}

function sanitizeSettingsRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.key && !SKIP_SETTINGS_IN_SNAPSHOT.has(String(row.key)))
    .map(row => {
      const value = String(row.value ?? '');
      return {
        key: row.key,
        value: value.length > 250000 ? '' : row.value,
        omitted_from_snapshot: value.length > 250000 ? true : undefined,
      };
    });
}

async function buildBootstrapSnapshot() {
  const [
    settingsRows,
    employees,
    authAccounts,
    warehouseRows,
    warehouseSnapshot,
    reservationsRows,
    historyRows,
    projectHardwareState,
    ordersRows,
    orderItemsRows,
    timeEntries,
    factualSnapshots,
    shipmentsRows,
    chinaPurchaseRows,
  ] = await Promise.all([
    fetchPlatformAllPages('settings', { columns: 'key,value' }).catch(error => ({ __error: error.message })),
    fetchPlatformAllPages('employees', {
      orders: [{ column: 'name', ascending: true }],
    }).catch(() => []),
    fetchSettingJson('auth_accounts_json', []).catch(() => []),
    fetchPlatformAllPages('warehouse_items', {
      orders: [{ column: 'name', ascending: true }],
    }).catch(() => []),
    fetchSettingJson('warehouse_items_json', null).catch(() => null),
    fetchPlatformAllPages('warehouse_reservations', {
      columns: 'reservations_data',
      filters: [{ op: 'eq', column: 'id', value: 1 }],
      pageSize: 1,
    }).catch(() => []),
    fetchPlatformAllPages('warehouse_history', {
      columns: 'history_data',
      filters: [{ op: 'eq', column: 'id', value: 1 }],
      pageSize: 1,
    }).catch(() => []),
    fetchSettingJson('project_hardware_state_json', { checks: {}, actual_qtys: {} }).catch(() => ({ checks: {}, actual_qtys: {} })),
    fetchPlatformAllPages('orders', {
      filters: [{ op: 'neq', column: 'status', value: 'deleted' }],
      orders: [{ column: 'created_at', ascending: false }],
    }).catch(() => []),
    // item_data can make a 1000-row response larger than 30 MB. On the
    // API that can exceed the default timeout, so use smaller pages.
    fetchPlatformAllPages('order_items', {
      orders: [
        { column: 'order_id', ascending: true },
        { column: 'item_number', ascending: true },
      ],
      pageSize: 100,
      timeoutMs: 60000,
    }).catch(() => []),
    fetchPlatformAllPages('time_entries', {
      orders: [{ column: 'date', ascending: false }],
    }).catch(() => []),
    fetchSettingJson('factual_month_snapshots_json', {}).catch(() => ({})),
    fetchPlatformAllPages('shipments', {
      orders: [{ column: 'created_at', ascending: false }],
    }).catch(() => []),
    fetchPlatformAllPages('china_purchases', {
      orders: [{ column: 'created_at', ascending: false }],
    }).catch(() => []),
  ]);

  const orders = parseOrderRows(ordersRows);
  const orderIds = new Set(orders.map(order => Number(order.id)));
  const orderItems = parseOrderItemRows(orderItemsRows, orderIds);
  const liveWarehouseItems = parseWarehouseRows(warehouseRows);
  const warehouseItems = liveWarehouseItems.length ? liveWarehouseItems : (Array.isArray(warehouseSnapshot) ? stripHeavy(warehouseSnapshot) : []);
  const warehouseReservations = parseSingletonJsonRow(reservationsRows, 'reservations_data', []);
  const warehouseHistory = parseSingletonJsonRow(historyRows, 'history_data', []);
  const cleanSettingsRows = sanitizeSettingsRows(settingsRows);
  const settingsByKey = Object.fromEntries(cleanSettingsRows.map(row => [row.key, row.value]));
  const shipments = parseShipmentRows(shipmentsRows);
  const chinaPurchases = parseChinaPurchaseRows(chinaPurchaseRows);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    source: 'yandex-platform-snapshot',
    data: {
      settingsRows: cleanSettingsRows,
      settingsByKey,
      employees,
      authAccounts,
      warehouseItems,
      warehouseReservations,
      warehouseHistory,
      projectHardwareState,
      orders,
      orderItems,
      timeEntries,
      factualSnapshots,
      shipments,
      chinaPurchases,
    },
    errors: {},
  };
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data));
}

// The browser asks the static mirror for a small, route-specific subset of the
// snapshot (auth accounts on boot, orders only on the orders page, etc.). Keep
// those files independent so a cold session never has to download the whole
// mirror just to render the login selector.
export function buildBootstrapShardPayloads(bootstrap) {
  const data = bootstrap?.data && typeof bootstrap.data === 'object' ? bootstrap.data : {};
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, {
    ok: true,
    generated_at: bootstrap?.generated_at || '',
    source: bootstrap?.source || 'yandex-platform-snapshot',
    data: { [key]: value },
    errors: bootstrap?.errors || {},
  }]));
}

function writeBootstrapShards(bootstrap) {
  const shards = buildBootstrapShardPayloads(bootstrap);
  for (const [key, payload] of Object.entries(shards)) {
    writeJson(path.join(OUT_DIR, 'data', 'bootstrap', `${encodeURIComponent(key)}.json`), payload);
  }
  return Object.keys(shards).length;
}

// Core tables that must always contain rows in a healthy production snapshot.
// Every platform fetch in buildBootstrapSnapshot() degrades independently so
// one API error cannot publish an empty production mirror unnoticed.
const REQUIRED_BOOTSTRAP_TABLES = ['authAccounts', 'employees', 'orders', 'orderItems', 'settingsRows'];

// Refuse to publish a degraded snapshot. Publishing an empty bootstrap.json breaks
// calc2 for everyone offline — no login accounts, no orders, the app can't hydrate
// (the витрина and #gantt read it too). Throwing here fails the build step; the
// upload step has no `if: always()`, so it is skipped and the CDN keeps the
// last-good snapshot until a later run catches the platform API healthy.
export function assertHealthyBootstrap(bootstrap) {
  const data = (bootstrap && bootstrap.data) || {};
  const counts = {};
  const empty = [];
  for (const key of REQUIRED_BOOTSTRAP_TABLES) {
    const rows = Array.isArray(data[key]) ? data[key] : [];
    counts[key] = rows.length;
    if (rows.length === 0) empty.push(key);
  }
  if (empty.length > 0) {
    throw new Error(
      `Refusing to publish a degraded bootstrap snapshot: required table(s) empty [${empty.join(', ')}] `
      + `(counts ${JSON.stringify(counts)}). The Yandex platform API was likely unreachable during the build. `
      + 'Failing the build so the CDN keeps the last-good snapshot instead of emptying calc2.'
    );
  }
  return counts;
}

// Copy the public production-floor витрина into <out>/floor and publish its
// curated read-only snapshot (plan.json + orders/<id>.json) alongside it.
// Non-fatal: if the snapshot build fails, the calc2 mirror must still sync and
// the CDN keeps the previous good floor snapshot.
// Витрина грузит app.js/style.css по НЕверсионированным URL, а CDN отдаёт их с
// immutable-кэшем на год — из-за этого обновления кода не доходили до цеха.
// Приписываем к ссылкам ?v=<хэш содержимого> (index.html отдаётся no-cache),
// поэтому смена кода = новый URL = браузер гарантированно берёт свежую версию.
function versionFloorAssets(dest) {
  const hash = crypto.createHash('sha1');
  for (const f of ['app.js', 'style.css']) {
    const p = path.join(dest, f);
    if (fs.existsSync(p)) hash.update(fs.readFileSync(p));
  }
  const v = hash.digest('hex').slice(0, 10);
  const idxPath = path.join(dest, 'index.html');
  if (fs.existsSync(idxPath)) {
    const html = fs.readFileSync(idxPath, 'utf8')
      .replace(/href="style\.css(?:\?v=[^"]*)?"/g, `href="style.css?v=${v}"`)
      .replace(/src="app\.js(?:\?v=[^"]*)?"/g, `src="app.js?v=${v}"`);
    fs.writeFileSync(idxPath, html);
  }
  return v;
}

function buildFloor() {
  const dest = path.join(OUT_DIR, 'floor');
  copyRecursive(path.join(ROOT, 'production-floor'), dest);
  fs.rmSync(path.join(dest, '.gitignore'), { force: true });
  versionFloorAssets(dest);
  try {
    execFileSync('node', ['scripts/production-floor-publish.mjs'], {
      cwd: ROOT,
      env: { ...process.env, RO_FLOOR_OUT_DIR: dest },
      stdio: 'inherit',
    });
    const ordersDir = path.join(dest, 'orders');
    const orderFiles = fs.existsSync(ordersDir) ? fs.readdirSync(ordersDir).length : 0;
    return { ok: true, orderFiles };
  } catch (error) {
    console.error('production-floor publish failed (keeping last good snapshot on CDN):', error.message);
    return { ok: false, error: error.message };
  }
}

async function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  ensureDir(OUT_DIR);

  for (const relPath of COPY_PATHS) {
    copyRecursive(path.join(ROOT, relPath), path.join(OUT_DIR, relPath));
  }

  const indexSource = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'index.html'), rewriteIndexForObjectStorage(indexSource));

  const bootstrap = await buildBootstrapSnapshot();
  assertHealthyBootstrap(bootstrap);
  writeJson(path.join(OUT_DIR, 'data/bootstrap.json'), bootstrap);
  const bootstrapShards = writeBootstrapShards(bootstrap);

  const floor = buildFloor();

  const summary = {
    outDir: path.relative(ROOT, OUT_DIR),
    bucket: BUCKET,
    floor,
    bytes: fs.statSync(path.join(OUT_DIR, 'data/bootstrap.json')).size,
    bootstrapShards,
    employees: bootstrap.data.employees.length,
    authAccounts: bootstrap.data.authAccounts.length,
    warehouseItems: bootstrap.data.warehouseItems.length,
    warehouseReservations: bootstrap.data.warehouseReservations.length,
    orders: bootstrap.data.orders.length,
    orderItems: bootstrap.data.orderItems.length,
    timeEntries: bootstrap.data.timeEntries.length,
    shipments: bootstrap.data.shipments.length,
    chinaPurchases: bootstrap.data.chinaPurchases.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

const isDirectRun = process.argv[1]
  && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

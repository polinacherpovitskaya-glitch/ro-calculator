import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'deploy/static-yandex');
const BUCKET = process.env.RO_YANDEX_BUCKET || 'calc2.recycleobject.ru';
const STORAGE_ORIGIN = process.env.RO_YANDEX_STORAGE_ORIGIN || `https://storage.yandexcloud.net/${BUCKET}`;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';

const PROJECT_STATUSES = new Set([
  'sample',
  'production_casting',
  'production_printing',
  'production_hardware',
  'production_packaging',
  'in_production',
  'delivery',
  'completed',
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

async function fetchSupabaseJson(pathname, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 3);
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || 15000);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${SUPABASE_URL}${pathname}`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Supabase ${response.status} for ${pathname}: ${body.slice(0, 300)}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, 300 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error(`Supabase unavailable for ${pathname}`);
}

async function fetchSettingJson(key, fallback) {
  const rows = await fetchSupabaseJson(`/rest/v1/settings?select=value&key=eq.${encodeURIComponent(key)}&limit=1`);
  const raw = rows?.[0]?.value;
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
    .filter(order => PROJECT_STATUSES.has(String(order.status || '')));
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
  ] = await Promise.all([
    fetchSupabaseJson('/rest/v1/settings?select=key,value').catch(error => ({ __error: error.message })),
    fetchSupabaseJson('/rest/v1/employees?select=*&order=name.asc').catch(() => []),
    fetchSettingJson('auth_accounts_json', []).catch(() => []),
    fetchSupabaseJson('/rest/v1/warehouse_items?select=*&order=name.asc').catch(() => []),
    fetchSettingJson('warehouse_items_json', null).catch(() => null),
    fetchSupabaseJson('/rest/v1/warehouse_reservations?select=reservations_data&id=eq.1&limit=1').catch(() => []),
    fetchSupabaseJson('/rest/v1/warehouse_history?select=history_data&id=eq.1&limit=1').catch(() => []),
    fetchSettingJson('project_hardware_state_json', { checks: {}, actual_qtys: {} }).catch(() => ({ checks: {}, actual_qtys: {} })),
    fetchSupabaseJson('/rest/v1/orders?select=*&status=neq.deleted&order=created_at.desc').catch(() => []),
    fetchSupabaseJson('/rest/v1/order_items?select=*&order=order_id.asc,item_number.asc').catch(() => []),
    fetchSupabaseJson('/rest/v1/time_entries?select=*&order=date.desc').catch(() => []),
    fetchSettingJson('factual_month_snapshots_json', {}).catch(() => ({})),
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

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    source: 'supabase-snapshot-for-yandex-static',
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
    },
    errors: {},
  };
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data));
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
  writeJson(path.join(OUT_DIR, 'data/bootstrap.json'), bootstrap);

  const summary = {
    outDir: path.relative(ROOT, OUT_DIR),
    bucket: BUCKET,
    bytes: fs.statSync(path.join(OUT_DIR, 'data/bootstrap.json')).size,
    employees: bootstrap.data.employees.length,
    authAccounts: bootstrap.data.authAccounts.length,
    warehouseItems: bootstrap.data.warehouseItems.length,
    warehouseReservations: bootstrap.data.warehouseReservations.length,
    orders: bootstrap.data.orders.length,
    orderItems: bootstrap.data.orderItems.length,
    timeEntries: bootstrap.data.timeEntries.length,
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

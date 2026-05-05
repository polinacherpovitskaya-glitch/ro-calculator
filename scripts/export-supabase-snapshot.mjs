import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const supabaseSource = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');

function extractConst(name) {
  const match = supabaseSource.match(new RegExp(`const\\s+${name}\\s*=\\s*'([^']+)'`));
  return match ? match[1] : '';
}

const supabaseUrl = (process.env.SUPABASE_URL || extractConst('SUPABASE_URL')).replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || extractConst('SUPABASE_ANON_KEY');
const mode = (process.env.RO_SNAPSHOT_MODE || process.argv.find(arg => arg.startsWith('--mode='))?.split('=')[1] || 'inventory').toLowerCase();
const includeSensitive = process.env.RO_SNAPSHOT_INCLUDE_SENSITIVE === '1'
  || process.argv.includes('--include-sensitive');
const outDir = path.resolve(root, process.env.RO_SNAPSHOT_OUT_DIR || 'deploy/supabase-snapshots');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outPath = path.join(outDir, `ro-supabase-${mode}-${timestamp}.json`);
const pageSize = Math.max(1, Math.min(1000, Number(process.env.RO_SNAPSHOT_PAGE_SIZE || 1000)));

const tables = [
  { name: 'settings', sensitiveKeys: ['auth_accounts_json'] },
  { name: 'employees' },
  { name: 'orders' },
  { name: 'order_items' },
  { name: 'order_factuals' },
  { name: 'product_templates' },
  { name: 'time_entries' },
  { name: 'warehouse_items' },
  { name: 'warehouse_reservations' },
  { name: 'warehouse_history' },
  { name: 'shipments' },
  { name: 'china_purchases' },
  { name: 'china_orders' },
  { name: 'app_vacations' },
  { name: 'molds' },
  { name: 'app_colors' },
  { name: 'hw_blanks' },
  { name: 'pkg_blanks' },
  { name: 'marketplace_sets' },
  { name: 'areas' },
  { name: 'projects' },
  { name: 'tasks' },
  { name: 'task_comments' },
  { name: 'work_assets' },
  { name: 'task_checklist_items' },
  { name: 'task_watchers' },
  { name: 'work_activity' },
  { name: 'work_templates' },
  { name: 'task_notification_events' },
  { name: 'bug_reports' },
  { name: 'finance_sources' },
  { name: 'finance_accounts' },
  { name: 'finance_categories' },
  { name: 'finance_directions' },
  { name: 'finance_counterparties' },
  { name: 'finance_transactions' },
  { name: 'finance_transaction_links' },
  { name: 'finance_rules' },
  { name: 'finance_manual_decisions' },
  { name: 'bank_sync_runs' },
  { name: 'bank_accounts' },
  { name: 'bank_transactions' },
  { name: 'legacy_finance_import_runs' },
  { name: 'legacy_finance_transactions' },
  { name: 'fintablo_imports' },
  { name: 'app_tasks' },
  { name: 'ready_goods' },
  { name: 'ready_goods_history' },
  { name: 'sales_records' },
  { name: 'app_config' },
];

function assertConfigured() {
  if (!supabaseUrl) throw new Error('SUPABASE_URL is required');
  if (!anonKey) throw new Error('SUPABASE_ANON_KEY is required');
  if (!['inventory', 'full'].includes(mode)) {
    throw new Error(`Unsupported RO_SNAPSHOT_MODE: ${mode}`);
  }
}

function headers(extra = {}) {
  return {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    accept: 'application/json',
    ...extra,
  };
}

async function request(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, {
    ...options,
    headers: headers(options.headers || {}),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch (_) {
      json = text;
    }
  }
  return { response, text, json };
}

function hashRows(rows) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(rows || []))
    .digest('hex');
}

function redactRow(table, row) {
  if (includeSensitive) return row;
  const next = { ...row };
  if (table.sensitiveColumns) {
    for (const column of table.sensitiveColumns) {
      if (Object.prototype.hasOwnProperty.call(next, column)) next[column] = '[redacted]';
    }
  }
  if (table.name === 'settings' && table.sensitiveKeys?.includes(String(row.key || ''))) {
    next.value = '[redacted]';
  }
  return next;
}

async function countTable(table) {
  const { response, text } = await request(`/rest/v1/${table.name}?select=*`, {
    method: 'HEAD',
    headers: { prefer: 'count=exact' },
  });
  if (!response.ok) {
    return {
      ok: false,
      error: `HTTP ${response.status}: ${text.slice(0, 300)}`,
      count: null,
    };
  }
  const contentRange = response.headers.get('content-range') || '';
  const total = Number(contentRange.split('/')[1]);
  return {
    ok: true,
    count: Number.isFinite(total) ? total : null,
  };
}

async function fetchAllRows(table) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const end = offset + pageSize - 1;
    const { response, text, json } = await request(`/rest/v1/${table.name}?select=*`, {
      headers: {
        range: `${offset}-${end}`,
        'range-unit': 'items',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const chunk = Array.isArray(json) ? json : [];
    rows.push(...chunk.map(row => redactRow(table, row)));
    if (chunk.length < pageSize) break;
  }
  return rows;
}

async function inspectSettingsKeys() {
  const { response, json } = await request('/rest/v1/settings?select=key');
  if (!response.ok || !Array.isArray(json)) return [];
  return json.map(row => row.key).filter(Boolean).sort();
}

async function run() {
  assertConfigured();
  fs.mkdirSync(outDir, { recursive: true });

  const snapshot = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    includeSensitive,
    source: {
      supabaseHost: new URL(supabaseUrl).host,
    },
    notes: [
      'inventory mode stores row counts only',
      'full mode stores table rows; sensitive setting values are redacted unless RO_SNAPSHOT_INCLUDE_SENSITIVE=1',
      'storage buckets are not exported by this script yet',
    ],
    storageBucketsPending: ['product-images', 'mold-photos', 'bug-attachments'],
    tables: {},
  };

  for (const table of tables) {
    process.stdout.write(`snapshot ${table.name}... `);
    const counted = await countTable(table);
    const entry = {
      ok: counted.ok,
      count: counted.count,
      error: counted.error || null,
    };
    if (counted.ok && mode === 'full') {
      try {
        const rows = await fetchAllRows(table);
        entry.count = rows.length;
        entry.sha256 = hashRows(rows);
        entry.rows = rows;
      } catch (error) {
        entry.ok = false;
        entry.error = error.message;
      }
    }
    snapshot.tables[table.name] = entry;
    process.stdout.write(entry.ok ? `ok (${entry.count ?? 'unknown'})\n` : `failed (${entry.error})\n`);
  }

  snapshot.settingsKeys = await inspectSettingsKeys();
  snapshot.summary = {
    okTables: Object.values(snapshot.tables).filter(table => table.ok).length,
    failedTables: Object.values(snapshot.tables).filter(table => !table.ok).length,
    totalKnownTables: Object.keys(snapshot.tables).length,
    totalRows: Object.values(snapshot.tables).reduce((sum, table) => sum + (Number(table.count) || 0), 0),
  };

  fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(JSON.stringify({ output: outPath, summary: snapshot.summary }, null, 2));
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

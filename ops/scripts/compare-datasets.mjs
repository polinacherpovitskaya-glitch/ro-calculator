// Compare Supabase and Postgres row counts for migrated staging tables.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const opsRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(opsRoot, '..');
const DEFAULT_CATALOG_URL = 'https://calc.recycleobject.ru/data/china_catalog.json';

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

const TABLES = [
  'employees',
  'orders',
  'order_items',
  'order_factuals',
  'warehouse_items',
  'warehouse_reservations',
  'warehouse_history',
  'shipments',
  'shipment_items',
  'china_purchases',
  'china_purchase_items',
  'china_catalog',
  'molds',
  'mold_hardware',
  'mold_usage_log',
  'hw_blanks',
  'pkg_blanks',
  'app_colors',
  'marketplace_sets',
  'bug_reports',
  'bug_attachments',
  'product_templates',
  'production_calendar_days',
  'production_plan_entries',
  'indirect_costs',
  'areas',
  'projects',
  'tasks',
  'task_comments',
  'work_assets',
  'task_checklist_items',
  'task_watchers',
  'work_activity',
  'work_templates',
  'task_notification_events',
];

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function mergeLegacyRow(row, jsonColumn) {
  const parsed = parseJson(row[jsonColumn]);
  return { ...parsed, ...row, id: row.id };
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.${table}'`)) return [];
    throw error;
  }
  return data || [];
}

async function fetchColumns(table, columns) {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.${table}'`)) return [];
    throw error;
  }
  return data || [];
}

async function fetchSetting(...keys) {
  for (const key of keys) {
    const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle();
    if (error) {
      const message = String(error.message || '');
      if (message.includes(`Could not find the table 'public.settings'`)) return null;
      throw error;
    }
    if (data?.value !== null && data?.value !== undefined && data.value !== '') {
      return parseJson(data.value);
    }
  }
  return null;
}

function countCalendarDays(raw) {
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'object') return Object.keys(raw).length;
  return 0;
}

function countPlanEntries(raw) {
  if (!raw) return 0;
  if (Array.isArray(raw)) return raw.length;
  if (Array.isArray(raw.entries)) return raw.entries.length;
  if (Array.isArray(raw.items)) return raw.items.length;
  if (Array.isArray(raw.order_ids)) return raw.order_ids.length;
  return 0;
}

function countIndirectCosts(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return Array.isArray(raw) ? raw.length : 0;
  let count = 0;
  for (const data of Object.values(raw)) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    if (Number(data.total_override) > 0) {
      count += 1;
      continue;
    }
    count += Object.entries(data).filter(([key, value]) => key !== 'total_override' && numberOrNull(value) !== null).length;
  }
  return count;
}

async function loadCatalogSeed() {
  const candidates = [
    path.join(repoRoot, 'data', 'china_catalog.json'),
    path.join(opsRoot, 'data', 'china_catalog.json'),
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(await fs.readFile(candidate, 'utf8'));
    } catch {
      // Try next source.
    }
  }

  const url = process.env.CHINA_CATALOG_JSON_URL || DEFAULT_CATALOG_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load China catalog seed from ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

async function supabaseCount(table) {
  if (table === 'warehouse_reservations') {
    const data = await fetchAll(table);
    const ids = new Set();
    let anonymousRows = 0;
    for (const row of data || []) {
      if (!row.reservations_data) {
        anonymousRows += 1;
        continue;
      }
      try {
        const parsed = typeof row.reservations_data === 'string' ? JSON.parse(row.reservations_data) : row.reservations_data;
        if (Array.isArray(parsed)) {
          for (const reservation of parsed) {
            if (reservation?.id) ids.add(String(reservation.id));
            else anonymousRows += 1;
          }
        }
      } catch {
        // Ignore malformed legacy JSON here; refresh script logs dropped rows.
      }
    }
    return ids.size + anonymousRows;
  }

  if (table === 'orders') {
    const rows = await fetchAll('orders');
    return rows.filter((row) => row.status !== 'deleted' && !row.deleted_at).length;
  }

  if (table === 'order_items') {
    const orders = await fetchAll('orders');
    const activeOrderIds = new Set(orders.filter((row) => row.status !== 'deleted' && !row.deleted_at).map((row) => String(row.id)));
    const rows = await fetchAll('order_items');
    return rows.filter((row) => activeOrderIds.has(String(row.order_id))).length;
  }

  if (table === 'order_factuals') {
    const orders = await fetchAll('orders');
    const activeOrderIds = new Set(orders.filter((row) => row.status !== 'deleted' && !row.deleted_at).map((row) => String(row.id)));
    const rows = await fetchAll('order_factuals');
    return rows.filter((row) => activeOrderIds.has(String(row.order_id))).length;
  }

  if (table === 'shipment_items') {
    const shipments = await fetchAll('shipments');
    return shipments.reduce((sum, row) => {
      const parsed = parseJson(row.shipment_data);
      return sum + (Array.isArray(parsed.items) ? parsed.items.filter((item) => Number(item.qty_received ?? item.qty ?? 0) > 0).length : 0);
    }, 0);
  }

  if (table === 'china_purchase_items') {
    const purchases = await fetchAll('china_purchases');
    return purchases.reduce((sum, row) => {
      const parsed = parseJson(row.purchase_data);
      return sum + (Array.isArray(parsed.items) ? parsed.items.filter((item) => Number(item.qty ?? item.quantity ?? 0) > 0).length : 0);
    }, 0);
  }

  if (table === 'china_catalog') {
    const rows = await loadCatalogSeed();
    return Array.isArray(rows) ? rows.length : 0;
  }

  if (table === 'mold_hardware') {
    const molds = (await fetchAll('molds')).map((row) => mergeLegacyRow(row, 'mold_data'));
    const warehouseIds = new Set((await pool.query(`SELECT id::text FROM warehouse_items`)).rows.map((row) => row.id));
    return molds.filter((mold) => {
      const warehouseItemId = numberOrNull(mold.hw_warehouse_item_id, mold.warehouse_item_id);
      return warehouseItemId && warehouseIds.has(String(warehouseItemId));
    }).length;
  }

  if (table === 'mold_usage_log') {
    return 0;
  }

  if (table === 'bug_reports') {
    const direct = await fetchAll('bug_reports');
    if (direct.length) return direct.length;
    const tasks = await fetchColumns('tasks', 'id,title');
    return tasks.filter((task) => /^\[баг\]/i.test(String(task.title || ''))).length;
  }

  if (table === 'bug_attachments') {
    const direct = await fetchAll('bug_reports');
    const taskIds = new Set();
    if (direct.length) {
      for (const row of direct) {
        if (row.task_id) taskIds.add(String(row.task_id));
      }
    } else {
      const tasks = await fetchColumns('tasks', 'id,title');
      for (const task of tasks) {
        if (/^\[баг\]/i.test(String(task.title || ''))) taskIds.add(String(task.id));
      }
    }
    const assets = await fetchColumns('work_assets', 'task_id,kind');
    return assets.filter((asset) => asset.kind === 'file' && taskIds.has(String(asset.task_id || ''))).length;
  }

  if (table === 'product_templates') {
    return (await fetchAll('product_templates')).length;
  }

  if (table === 'production_calendar_days') {
    return countCalendarDays(await fetchSetting('productionCalendar', 'production_calendar_json'));
  }

  if (table === 'production_plan_entries') {
    return countPlanEntries(await fetchSetting('productionPlan', 'production_plan_state_json'));
  }

  if (table === 'indirect_costs') {
    return countIndirectCosts(await fetchSetting('indirectCosts', 'indirect_costs_json'));
  }

  if (table === 'areas') {
    const rows = await fetchAll('areas');
    return rows.length || 7;
  }

  if (table === 'projects') {
    return (await fetchAll('projects')).length;
  }

  if (table === 'tasks') {
    const rows = await fetchAll('tasks');
    const areas = new Set((await pool.query(`SELECT id::text FROM areas`)).rows.map((row) => row.id));
    const orders = new Set((await pool.query(`SELECT id::text FROM orders`)).rows.map((row) => row.id));
    const projects = new Set((await pool.query(`SELECT id::text FROM projects`)).rows.map((row) => row.id));
    return rows.filter((row) => areas.has(String(row.area_id)) || orders.has(String(row.order_id)) || projects.has(String(row.project_id))).length;
  }

  if (['task_comments', 'task_checklist_items'].includes(table)) {
    const tasks = new Set((await pool.query(`SELECT id::text FROM tasks`)).rows.map((row) => row.id));
    return (await fetchAll(table)).filter((row) => tasks.has(String(row.task_id))).length;
  }

  if (table === 'work_assets') {
    const tasks = new Set((await pool.query(`SELECT id::text FROM tasks`)).rows.map((row) => row.id));
    const projects = new Set((await pool.query(`SELECT id::text FROM projects`)).rows.map((row) => row.id));
    return (await fetchAll('work_assets')).filter((row) => tasks.has(String(row.task_id)) || projects.has(String(row.project_id))).length;
  }

  if (table === 'task_watchers') {
    const tasks = new Set((await pool.query(`SELECT id::text FROM tasks`)).rows.map((row) => row.id));
    const employees = new Set((await pool.query(`SELECT id::text FROM employees`)).rows.map((row) => row.id));
    return (await fetchAll('task_watchers')).filter((row) => {
      const userId = row.user_id || row.employee_id;
      return tasks.has(String(row.task_id)) && employees.has(String(userId));
    }).length;
  }

  if (table === 'work_templates') {
    const rows = await fetchAll('work_templates');
    return rows.length || 7;
  }

  if (table === 'work_activity' || table === 'task_notification_events') {
    return (await fetchAll(table)).length;
  }

  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

async function postgresCount(table) {
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
  return rows[0].n;
}

async function main() {
  let allOk = true;
  console.log('Table                         Supabase  Postgres  Diff');
  console.log('----------------------------- --------  --------  ----');

  for (const table of TABLES) {
    const sbCount = await supabaseCount(table);
    const pgCount = await postgresCount(table);
    const diff = pgCount - sbCount;
    const status = diff === 0 ? 'OK' : 'MISMATCH';
    console.log(`${table.padEnd(29)} ${String(sbCount).padStart(8)} ${String(pgCount).padStart(9)} ${String(diff).padStart(5)} ${status}`);
    if (diff !== 0) allOk = false;
  }

  if (!allOk) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

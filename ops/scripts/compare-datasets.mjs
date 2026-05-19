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
  if (error) throw error;
  return data || [];
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

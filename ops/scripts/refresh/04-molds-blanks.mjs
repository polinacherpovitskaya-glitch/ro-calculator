// Copy molds, blanks, colors, and marketplace sets from Supabase legacy JSON
// rows into normalized Postgres tables.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;
const MOLD_MAX_LIFETIME = 4500;

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
  return { ...parsed, ...row, id: row.id, extras: { legacy: { ...row, [jsonColumn]: undefined }, legacy_data: parsed } };
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function integerOrNull(...values) {
  const number = numberOrNull(...values);
  return number === null ? null : Math.trunc(number);
}

function textOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

function mapMoldStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'retired' || normalized === 'archive' || normalized === 'archived') return 'retired';
  if (normalized === 'broken') return 'broken';
  return 'active';
}

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data || [];
}

async function warehouseIdSet() {
  const { rows } = await pool.query(`SELECT id::text FROM warehouse_items`);
  return new Set(rows.map((row) => row.id));
}

function normalizeComposition(set, hwByBlankId, pkgByBlankId, warehouseIds) {
  const byItem = new Map();
  const add = (warehouseItemId, qty) => {
    const id = numberOrNull(warehouseItemId);
    const count = numberOrNull(qty) || 1;
    if (!id || count <= 0 || !warehouseIds.has(String(id))) return;
    byItem.set(id, (byItem.get(id) || 0) + count);
  };

  for (const item of Array.isArray(set.hw_items) ? set.hw_items : []) {
    const blank = hwByBlankId.get(String(item.blank_id || ''));
    add(item.wh_id || item.warehouse_item_id || blank?.warehouse_item_id, item.qty || item.quantity);
  }
  for (const item of Array.isArray(set.pkg_items) ? set.pkg_items : []) {
    const blank = pkgByBlankId.get(String(item.blank_id || ''));
    add(item.wh_id || item.warehouse_item_id || blank?.warehouse_item_id, item.qty || item.quantity);
  }

  return [...byItem.entries()]
    .sort(([a], [b]) => a - b)
    .map(([warehouse_item_id, qty]) => ({ warehouse_item_id, qty }));
}

function blankById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function refreshMolds(warehouseIds) {
  const rows = (await fetchAll('molds')).map((row) => mergeLegacyRow(row, 'mold_data'));
  console.log(`molds: ${rows.length}`);
  let hardware = 0;

  for (const mold of rows) {
    const id = integerOrNull(mold.id);
    if (!id) continue;
    await pool.query(
      `INSERT INTO molds
         (id, name, type, status, capacity, usage_count, usage_limit, photo_url, note, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         status = EXCLUDED.status,
         capacity = EXCLUDED.capacity,
         usage_count = EXCLUDED.usage_count,
         usage_limit = EXCLUDED.usage_limit,
         photo_url = EXCLUDED.photo_url,
         note = EXCLUDED.note,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        textOrNull(mold.name) || `Mold ${id}`,
        textOrNull(mold.type, mold.category),
        mapMoldStatus(mold.status),
        integerOrNull(mold.capacity, mold.mold_count),
        integerOrNull(mold.usage_count, mold.total_units_produced) || 0,
        integerOrNull(mold.usage_limit) || MOLD_MAX_LIFETIME,
        textOrNull(mold.photo_url, mold.image_url),
        textOrNull(mold.notes, mold.note),
        mold.extras,
        mold.created_at || new Date().toISOString(),
        mold.updated_at || new Date().toISOString(),
      ]
    );

    const warehouseItemId = integerOrNull(mold.hw_warehouse_item_id, mold.warehouse_item_id);
    if (warehouseItemId && warehouseIds.has(String(warehouseItemId))) {
      await pool.query(
        `INSERT INTO mold_hardware (mold_id, warehouse_item_id, qty_per_use, note, extras)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (mold_id, warehouse_item_id) DO UPDATE SET
           qty_per_use = EXCLUDED.qty_per_use,
           note = EXCLUDED.note,
           extras = EXCLUDED.extras`,
        [
          id,
          warehouseItemId,
          numberOrNull(mold.hw_qty_per_use, mold.hardware_qty_per_use) || 1,
          textOrNull(mold.hw_name, mold.hw_warehouse_sku),
          { legacy_mold: mold },
        ]
      );
      hardware += 1;
    }
  }

  console.log(`mold_hardware: ${hardware}`);
}

async function refreshHwBlanks() {
  const rows = (await fetchAll('hw_blanks')).map((row) => mergeLegacyRow(row, 'blank_data'));
  console.log(`hw_blanks: ${rows.length}`);

  for (const blank of rows) {
    await pool.query(
      `INSERT INTO hw_blanks
         (id, sku, name, category, weight, last_price, last_currency, photo_url, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         weight = EXCLUDED.weight,
         last_price = EXCLUDED.last_price,
         last_currency = EXCLUDED.last_currency,
         photo_url = EXCLUDED.photo_url,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        blank.id,
        textOrNull(blank.sku, blank.article, blank.warehouse_sku),
        textOrNull(blank.name) || `Hardware blank ${blank.id}`,
        textOrNull(blank.category, blank.type),
        numberOrNull(blank.weight, blank.weight_grams),
        numberOrNull(blank.last_price, blank.price_cny, blank.price_per_unit, blank.price),
        blank.price_cny ? 'CNY' : textOrNull(blank.last_currency, blank.currency) || null,
        textOrNull(blank.photo_url, blank.image_url),
        blank.extras,
        blank.created_at || new Date().toISOString(),
        blank.updated_at || new Date().toISOString(),
      ]
    );
  }

  return rows;
}

async function refreshPkgBlanks() {
  const rows = (await fetchAll('pkg_blanks')).map((row) => mergeLegacyRow(row, 'blank_data'));
  console.log(`pkg_blanks: ${rows.length}`);

  for (const blank of rows) {
    await pool.query(
      `INSERT INTO pkg_blanks
         (id, sku, name, category, last_price, last_currency, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         last_price = EXCLUDED.last_price,
         last_currency = EXCLUDED.last_currency,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        blank.id,
        textOrNull(blank.sku, blank.article, blank.warehouse_sku),
        textOrNull(blank.name) || `Packaging blank ${blank.id}`,
        textOrNull(blank.category, blank.type),
        numberOrNull(blank.last_price, blank.price_per_unit, blank.price),
        textOrNull(blank.last_currency, blank.currency) || 'RUB',
        blank.extras,
        blank.created_at || new Date().toISOString(),
        blank.updated_at || new Date().toISOString(),
      ]
    );
  }

  return rows;
}

async function refreshColors() {
  const rows = (await fetchAll('app_colors')).map((row) => mergeLegacyRow(row, 'color_data'));
  console.log(`app_colors: ${rows.length}`);

  for (const color of rows) {
    await pool.query(
      `INSERT INTO app_colors
         (id, name, hex, category, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         hex = EXCLUDED.hex,
         category = EXCLUDED.category,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        color.id,
        textOrNull(color.name, color.number) || `Color ${color.id}`,
        textOrNull(color.hex),
        textOrNull(color.category, color.group),
        color.extras,
        color.created_at || new Date().toISOString(),
        color.updated_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshMarketplaceSets(hwBlanks, pkgBlanks, warehouseIds) {
  const rows = (await fetchAll('marketplace_sets')).map((row) => mergeLegacyRow(row, 'set_data'));
  console.log(`marketplace_sets: ${rows.length}`);
  const hwByBlankId = blankById(hwBlanks);
  const pkgByBlankId = blankById(pkgBlanks);

  for (const set of rows) {
    const composition = normalizeComposition(set, hwByBlankId, pkgByBlankId, warehouseIds);
    await pool.query(
      `INSERT INTO marketplace_sets
         (id, name, marketplace, sku, price, currency, composition, is_active, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         marketplace = EXCLUDED.marketplace,
         sku = EXCLUDED.sku,
         price = EXCLUDED.price,
         currency = EXCLUDED.currency,
         composition = EXCLUDED.composition,
         is_active = EXCLUDED.is_active,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        set.id,
        textOrNull(set.name, set.set_name) || `Marketplace set ${set.id}`,
        textOrNull(set.marketplace, set.channel),
        textOrNull(set.sku, set.article),
        numberOrNull(set.price, set.marketplace_price, set.actual_marketplace_price),
        textOrNull(set.currency) || 'RUB',
        JSON.stringify(composition),
        boolValue(set.is_active, set.active !== false),
        set.extras,
        set.created_at || new Date().toISOString(),
        set.updated_at || new Date().toISOString(),
      ]
    );
  }
}

async function bumpSequences() {
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('mold_hardware', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM mold_hardware), 1))`
  );
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('mold_usage_log', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM mold_usage_log), 1))`
  );
}

async function main() {
  const warehouseIds = await warehouseIdSet();
  const hwBlanks = await refreshHwBlanks();
  const pkgBlanks = await refreshPkgBlanks();
  await refreshMolds(warehouseIds);
  await refreshColors();
  await refreshMarketplaceSets(hwBlanks, pkgBlanks, warehouseIds);
  console.log('mold_usage_log: 0 legacy rows');
  await bumpSequences();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

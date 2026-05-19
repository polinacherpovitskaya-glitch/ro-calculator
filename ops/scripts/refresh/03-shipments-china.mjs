// Copy shipments and China purchases from Supabase legacy JSON rows into
// normalized Postgres tables. China catalog is seeded from the static catalog
// JSON because the old app does not persist it as a Supabase table.
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
const opsRoot = path.resolve(__dirname, '..', '..');
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

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function numberOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function textOrNull(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return null;
}

function dateOrNull(...values) {
  for (const value of values) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return null;
}

function mapShipmentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'received') return 'received';
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'in_transit' || normalized === 'delivered' || normalized === 'in_china_warehouse') return 'in_transit';
  return 'planned';
}

function mapChinaStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'received') return 'received';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'deleted') return 'cancelled';
  if (normalized === 'delivered' || normalized === 'arrived') return 'arrived';
  if (normalized === 'in_transit') return 'in_transit';
  if (normalized === 'ordered' || normalized === 'paid' || normalized === 'in_china_warehouse') return 'paid';
  return 'draft';
}

function mergeLegacyRow(row, jsonColumn) {
  const parsed = parseJson(row[jsonColumn]);
  return { ...parsed, ...row, id: row.id, extras: { legacy: { ...row, [jsonColumn]: undefined }, legacy_data: parsed } };
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

async function refreshShipments() {
  const rows = (await fetchAll('shipments')).map((row) => mergeLegacyRow(row, 'shipment_data'));
  console.log(`shipments: ${rows.length}`);
  let items = 0;
  const warehouseIds = new Set((await pool.query(`SELECT id::text FROM warehouse_items`)).rows.map((row) => row.id));

  for (const shipment of rows) {
    const status = mapShipmentStatus(shipment.status || shipment.china_box_status);
    await pool.query(
      `INSERT INTO shipments
         (id, name, source, status, expected_date, received_at, total_cost, currency, note, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         source = EXCLUDED.source,
         status = EXCLUDED.status,
         expected_date = EXCLUDED.expected_date,
         received_at = EXCLUDED.received_at,
         total_cost = EXCLUDED.total_cost,
         currency = EXCLUDED.currency,
         note = EXCLUDED.note,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        shipment.id,
        textOrNull(shipment.shipment_name, shipment.name) || `Shipment ${shipment.id}`,
        textOrNull(shipment.source) || 'china',
        status,
        shipment.date || shipment.expected_date || null,
        status === 'received' ? dateOrNull(shipment.received_at, shipment.updated_at, shipment.created_at) : null,
        numberOrNull(shipment.total_purchase_rub, shipment.total_cost),
        shipment.total_purchase_rub ? 'RUB' : textOrNull(shipment.currency),
        textOrNull(shipment.notes, shipment.note),
        shipment.extras,
        shipment.created_at || new Date().toISOString(),
        shipment.updated_at || new Date().toISOString(),
      ]
    );

    for (const item of Array.isArray(shipment.items) ? shipment.items : []) {
      const qty = numberOrNull(item.qty_received, item.received_qty, item.qty, item.quantity);
      if (!qty || qty <= 0) continue;
      const legacyWarehouseItemId = numberOrNull(item.warehouse_item_id);
      const warehouseItemId = legacyWarehouseItemId && warehouseIds.has(String(legacyWarehouseItemId)) ? legacyWarehouseItemId : null;
      const createNew = !warehouseItemId && (item.source === 'new' || textOrNull(item.sku));
      await pool.query(
        `INSERT INTO shipment_items (shipment_id, warehouse_item_id, name, qty, unit_price, currency, received_qty, extras)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          shipment.id,
          warehouseItemId,
          textOrNull(item.name) || `Shipment item ${items + 1}`,
          qty,
          numberOrNull(item.total_cost_per_unit, item.purchase_price_rub),
          item.total_cost_per_unit || item.purchase_price_rub ? 'RUB' : textOrNull(item.currency),
          status === 'received' ? qty : null,
          {
            ...item,
            legacy_warehouse_item_id: legacyWarehouseItemId && !warehouseItemId ? legacyWarehouseItemId : undefined,
            create_new: createNew,
            sku: textOrNull(item.sku) || undefined,
          },
        ]
      );
      items += 1;
    }
  }

  console.log(`shipment_items: ${items}`);
}

async function refreshChinaPurchases() {
  const rows = (await fetchAll('china_purchases')).map((row) => mergeLegacyRow(row, 'purchase_data'));
  console.log(`china_purchases: ${rows.length}`);
  let items = 0;
  const shipmentIds = new Set((await pool.query(`SELECT id::text FROM shipments`)).rows.map((row) => row.id));
  const warehouseIds = new Set((await pool.query(`SELECT id::text FROM warehouse_items`)).rows.map((row) => row.id));

  for (const purchase of rows) {
    const status = mapChinaStatus(purchase.status);
    const shipmentId = numberOrNull(purchase.shipment_id);
    await pool.query(
      `INSERT INTO china_purchases
         (id, title, supplier, order_url, status, paid_amount, paid_currency, paid_at, arrived_at, shipment_id, note, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         supplier = EXCLUDED.supplier,
         order_url = EXCLUDED.order_url,
         status = EXCLUDED.status,
         paid_amount = EXCLUDED.paid_amount,
         paid_currency = EXCLUDED.paid_currency,
         paid_at = EXCLUDED.paid_at,
         arrived_at = EXCLUDED.arrived_at,
         shipment_id = EXCLUDED.shipment_id,
         note = EXCLUDED.note,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        purchase.id,
        textOrNull(purchase.purchase_name, purchase.title) || `China purchase ${purchase.id}`,
        textOrNull(purchase.supplier_name, purchase.supplier),
        textOrNull(purchase.supplier_url, purchase.order_url),
        status,
        numberOrNull(purchase.total_cny, purchase.paid_amount),
        purchase.total_cny || purchase.paid_amount ? 'CNY' : textOrNull(purchase.paid_currency),
        status === 'paid' || status === 'in_transit' || status === 'arrived' || status === 'received'
          ? dateOrNull(purchase.date, purchase.paid_at, purchase.created_at)
          : null,
        status === 'arrived' || status === 'received' ? dateOrNull(purchase.arrived_at, purchase.updated_at) : null,
        shipmentId && shipmentIds.has(String(shipmentId)) ? shipmentId : null,
        textOrNull(purchase.notes, purchase.note),
        purchase.extras,
        purchase.created_at || new Date().toISOString(),
        purchase.updated_at || new Date().toISOString(),
      ]
    );

    for (const item of Array.isArray(purchase.items) ? purchase.items : []) {
      const qty = numberOrNull(item.qty, item.quantity);
      if (!qty || qty <= 0) continue;
      const legacyWarehouseItemId = numberOrNull(item.warehouse_item_id);
      const warehouseItemId = legacyWarehouseItemId && warehouseIds.has(String(legacyWarehouseItemId)) ? legacyWarehouseItemId : null;
      await pool.query(
        `INSERT INTO china_purchase_items (purchase_id, warehouse_item_id, name, qty, unit_price, currency, extras)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          purchase.id,
          warehouseItemId,
          textOrNull(item.name) || `China item ${items + 1}`,
          qty,
          numberOrNull(item.price_cny, item.unit_price),
          item.price_cny || item.unit_price ? 'CNY' : textOrNull(item.currency),
          { ...item, legacy_warehouse_item_id: legacyWarehouseItemId && !warehouseItemId ? legacyWarehouseItemId : undefined },
        ]
      );
      items += 1;
    }
  }

  console.log(`china_purchase_items: ${items}`);
}

async function refreshChinaCatalog() {
  const rows = await loadCatalogSeed();
  const items = Array.isArray(rows) ? rows : [];
  console.log(`china_catalog: ${items.length}`);

  for (const item of items) {
    await pool.query(
      `INSERT INTO china_catalog
         (id, name, sku, description, photo_url, last_price, last_currency, supplier, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         sku = EXCLUDED.sku,
         description = EXCLUDED.description,
         photo_url = EXCLUDED.photo_url,
         last_price = EXCLUDED.last_price,
         last_currency = EXCLUDED.last_currency,
         supplier = EXCLUDED.supplier,
         extras = EXCLUDED.extras,
         updated_at = NOW()`,
      [
        item.id,
        textOrNull(item.name) || `China catalog ${item.id}`,
        textOrNull(item.sku),
        textOrNull(item.description, item.notes),
        textOrNull(item.photo_url),
        numberOrNull(item.price_cny, item.last_price),
        item.price_cny || item.last_price ? 'CNY' : textOrNull(item.last_currency),
        textOrNull(item.supplier, item.vendor),
        item,
      ]
    );
  }
}

async function bumpSequences() {
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('shipment_items', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM shipment_items), 1))`
  );
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('china_purchase_items', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM china_purchase_items), 1))`
  );
}

async function main() {
  await refreshShipments();
  await refreshChinaPurchases();
  await refreshChinaCatalog();
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

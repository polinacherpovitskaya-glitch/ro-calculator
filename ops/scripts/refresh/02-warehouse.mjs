// Copy warehouse items, reservations, and history from Supabase into Postgres.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;

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

function parseItem(row) {
  const data = parseJson(row.item_data);
  return { ...row, ...data, id: row.id, extras: { legacy: row } };
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
    return String(value);
  }
  return null;
}

function mapReservationSource(oldSource, hasOrderId) {
  const source = String(oldSource || '').toLowerCase();
  if (['order_calc', 'project_hardware', 'order'].includes(source)) return 'order';
  if (hasOrderId) return 'order';
  return 'manual';
}

function mapReservationStatus(oldStatus) {
  const status = String(oldStatus || '').toLowerCase();
  if (status === 'consumed') return 'consumed';
  if (status === 'released' || status === 'cancelled' || status === 'canceled') return 'released';
  return 'active';
}

function mapHistoryType(oldType, qtyChange, ctx) {
  const type = String(oldType || '').toLowerCase();
  if (['receipt', 'shipment_receive'].includes(type)) return 'receipt';
  if (['inventory_audit', 'inventory_adjustment', 'inventory_apply'].includes(type)) return 'inventory_audit';
  if (['return_to_warehouse', 'return_from_order', 'return_to_order'].includes(type)) return 'return';
  if (['from_order', 'mold_usage', 'packaging', 'pendant', 'hardware', 'consume'].includes(type)) return 'consume';
  if (['manual_add', 'manual_edit', 'manual', 'addition', 'deduction', 'adjustment', 'writeoff', 'extra_cost', 'import'].includes(type)) {
    return 'manual_edit';
  }
  if (Number(qtyChange) > 0 && ctx.shipment_id) return 'receipt';
  if (Number(qtyChange) < 0 && ctx.order_id) return 'consume';
  return 'manual_edit';
}

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data || [];
}

async function refreshItems() {
  const items = (await fetchAll('warehouse_items')).map(parseItem);
  console.log(`warehouse_items: ${items.length}`);

  for (const item of items) {
    await pool.query(
      `INSERT INTO warehouse_items
         (id, sku, name, category, qty, unit, min_qty, last_price, last_currency, notes, linked_order_id, photo_url, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku,
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         qty = EXCLUDED.qty,
         unit = EXCLUDED.unit,
         min_qty = EXCLUDED.min_qty,
         last_price = EXCLUDED.last_price,
         last_currency = EXCLUDED.last_currency,
         notes = EXCLUDED.notes,
         linked_order_id = EXCLUDED.linked_order_id,
         photo_url = EXCLUDED.photo_url,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        textOrNull(item.sku, item.code, item.article),
        textOrNull(item.name, item.title) || `Warehouse item ${item.id}`,
        textOrNull(item.category, item.type),
        numberOrNull(item.qty, item.quantity, item.stock, item.amount) ?? 0,
        textOrNull(item.unit, item.measure),
        numberOrNull(item.min_qty, item.minQuantity, item.min),
        numberOrNull(item.last_price, item.price, item.cost),
        textOrNull(item.last_currency, item.currency),
        textOrNull(item.notes, item.note, item.description),
        numberOrNull(item.linked_order_id, item.order_id),
        textOrNull(item.photo_url, item.image_url, item.image),
        item.extras || { legacy: item },
        item.created_at || new Date().toISOString(),
        item.updated_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshReservations() {
  const reservationRows = await fetchAll('warehouse_reservations');
  const orderIds = new Set((await pool.query(`SELECT id::text FROM orders`)).rows.map((row) => row.id));
  const reservations = reservationRows.flatMap((row) => {
    if (!row.reservations_data) return [row];
    const parsed = parseJson(row.reservations_data);
    return Array.isArray(parsed) ? parsed : [];
  });
  const uniqueReservationIds = new Set(reservations.map((reservation) => reservation.id).filter(Boolean));
  console.log(`warehouse_reservations: ${reservations.length} legacy entries, ${uniqueReservationIds.size} unique ids`);
  let dropped = 0;

  for (const reservation of reservations) {
    const itemId = numberOrNull(reservation.item_id, reservation.warehouse_item_id);
    if (!itemId) {
      dropped += 1;
      continue;
    }
    const orderId = numberOrNull(reservation.order_id, reservation.orderId);
    const source = mapReservationSource(reservation.source, !!orderId);
    if (source === 'order' && !orderId) {
      dropped += 1;
      continue;
    }
    if (source === 'order' && !orderIds.has(String(orderId))) {
      dropped += 1;
      continue;
    }
    const status = mapReservationStatus(reservation.status);
    const consumedAt = status === 'consumed' ? reservation.consumed_at || reservation.updated_at || reservation.created_at || new Date().toISOString() : null;
    const releasedAt = status === 'released' ? reservation.released_at || reservation.updated_at || reservation.created_at || new Date().toISOString() : null;

    await pool.query(
      `INSERT INTO warehouse_reservations
         (id, item_id, order_id, qty, source, status, note, created_at, consumed_at, released_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         item_id = EXCLUDED.item_id,
         order_id = EXCLUDED.order_id,
         qty = EXCLUDED.qty,
         source = EXCLUDED.source,
         status = EXCLUDED.status,
         note = EXCLUDED.note,
         consumed_at = EXCLUDED.consumed_at,
         released_at = EXCLUDED.released_at`,
      [
        reservation.id,
        itemId,
        orderId,
        numberOrNull(reservation.qty, reservation.quantity) ?? 0,
        source,
        status,
        textOrNull(reservation.note, reservation.comment),
        reservation.created_at || new Date().toISOString(),
        consumedAt,
        releasedAt,
      ]
    );
  }

  if (dropped) console.warn(`Dropped ${dropped} order reservations without order_id`);
}

async function refreshHistory() {
  await pool.query(`DELETE FROM warehouse_history WHERE details->>'refresh_baseline' = 'true'`);
  await pool.query(`DELETE FROM warehouse_history WHERE item_id IS NULL AND details ? 'legacy'`);

  const history = await fetchAll('warehouse_history');
  const orderIds = new Set((await pool.query(`SELECT id::text FROM orders`)).rows.map((row) => row.id));
  console.log(`warehouse_history: ${history.length}`);
  let dropped = 0;

  for (const row of history) {
    const itemId = numberOrNull(row.item_id, row.warehouse_item_id);
    if (!itemId) {
      dropped += 1;
      continue;
    }

    const qtyChange = numberOrNull(row.qty_change, row.delta, row.change) ?? 0;
    const type = mapHistoryType(row.type, qtyChange, {
      shipment_id: row.shipment_id,
      order_id: row.order_id,
    });
    if (type === 'receipt' && qtyChange <= 0) {
      dropped += 1;
      continue;
    }
    if (type === 'consume' && qtyChange >= 0) {
      dropped += 1;
      continue;
    }
    if (type === 'return' && qtyChange <= 0) {
      dropped += 1;
      continue;
    }

    const orderId = numberOrNull(row.order_id);
    await pool.query(
      `INSERT INTO warehouse_history
         (id, item_id, type, qty_before, qty_after, qty_change, order_id, shipment_id, mold_id, marketplace_set_id, audit_id, actor_name, note, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO NOTHING`,
      [
        row.id,
        itemId,
        type,
        numberOrNull(row.qty_before, row.before),
        numberOrNull(row.qty_after, row.after),
        qtyChange,
        orderId && orderIds.has(String(orderId)) ? orderId : null,
        numberOrNull(row.shipment_id),
        numberOrNull(row.mold_id),
        numberOrNull(row.marketplace_set_id),
        numberOrNull(row.audit_id),
        textOrNull(row.actor_name, row.manager_name, row.user_name),
        textOrNull(row.note, row.comment),
        row.details || { legacy: row },
        row.created_at || new Date().toISOString(),
      ]
    );
  }

  if (dropped) console.warn(`Dropped ${dropped} history rows with invalid canonical type/sign`);
}

async function seedBaselineHistory() {
  const { rowCount } = await pool.query(
    `INSERT INTO warehouse_history
       (item_id, type, qty_before, qty_after, qty_change, note, details, created_at)
     SELECT
       i.id,
       'inventory_audit',
       i.qty - COALESCE(SUM(h.qty_change), 0),
       i.qty,
       i.qty - COALESCE(SUM(h.qty_change), 0),
       'Baseline after Supabase staging refresh',
       jsonb_build_object('refresh_baseline', true),
       COALESCE(i.created_at, NOW())
     FROM warehouse_items i
     LEFT JOIN warehouse_history h ON h.item_id = i.id
     GROUP BY i.id, i.qty, i.created_at
     HAVING i.qty != COALESCE(SUM(h.qty_change), 0)`
  );

  console.log(`warehouse_history_baseline: ${rowCount}`);
}

async function bumpSequences() {
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('warehouse_reservations', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM warehouse_reservations), 1))`
  );
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('warehouse_history', 'id'), GREATEST((SELECT COALESCE(MAX(id), 0) FROM warehouse_history), 1))`
  );
}

async function main() {
  await refreshItems();
  await refreshReservations();
  await refreshHistory();
  await seedBaselineHistory();
  await bumpSequences();
  console.log('Warehouse refresh complete.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

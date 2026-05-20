// Copy legacy Supabase orders, order_items, and order_factuals into Postgres.
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
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
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

function dateOrNull(...values) {
  for (const value of values) {
    const text = String(value || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  }
  return null;
}

function mapStatus(status) {
  const normalized = String(status || 'draft').trim();
  if (['draft', 'quoted', 'approved', 'in_production', 'ready', 'shipped', 'closed', 'cancelled'].includes(normalized)) {
    return normalized;
  }
  if (['completed', 'complete', 'done'].includes(normalized)) return 'closed';
  if (['cancelled', 'canceled', 'deleted'].includes(normalized)) return 'cancelled';
  if (['delivery', 'shipping'].includes(normalized)) return 'shipped';
  if (normalized.startsWith('production_')) return 'in_production';
  if (['calculated', 'sample'].includes(normalized)) return 'draft';
  return 'draft';
}

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data || [];
}

function mergeOrder(row) {
  const calc = parseJson(row.calculator_data);
  return { ...calc, ...row, calculator_data: calc };
}

function mergeItem(row) {
  const item = parseJson(row.item_data);
  return { ...item, ...row, item_data: item };
}

async function refreshOrders() {
  const rows = (await fetchAll('orders')).filter((row) => row.status !== 'deleted' && !row.deleted_at);
  console.log(`orders: ${rows.length}`);

  for (const raw of rows) {
    const order = mergeOrder(raw);
    const status = mapStatus(order.status);
    await pool.query(
      `INSERT INTO orders
         (id, order_name, client_name, client_email, client_phone, status, deadline, deadline_start,
          manager_id, quantity, total_revenue, total_cost, total_margin, margin_percent,
          total_hours_plan, production_hours_plastic, production_hours_packaging, production_hours_hardware,
          calculator_data, extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (id) DO UPDATE SET
         order_name = EXCLUDED.order_name,
         client_name = EXCLUDED.client_name,
         client_email = EXCLUDED.client_email,
         client_phone = EXCLUDED.client_phone,
         status = EXCLUDED.status,
         deadline = EXCLUDED.deadline,
         deadline_start = EXCLUDED.deadline_start,
         manager_id = EXCLUDED.manager_id,
         quantity = EXCLUDED.quantity,
         total_revenue = EXCLUDED.total_revenue,
         total_cost = EXCLUDED.total_cost,
         total_margin = EXCLUDED.total_margin,
         margin_percent = EXCLUDED.margin_percent,
         total_hours_plan = EXCLUDED.total_hours_plan,
         production_hours_plastic = EXCLUDED.production_hours_plastic,
         production_hours_packaging = EXCLUDED.production_hours_packaging,
         production_hours_hardware = EXCLUDED.production_hours_hardware,
         calculator_data = EXCLUDED.calculator_data,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        order.id,
        textOrNull(order.order_name, order.name),
        textOrNull(order.client_name, order.client),
        textOrNull(order.client_email, order.email),
        textOrNull(order.client_phone, order.phone, order.telegram),
        status,
        dateOrNull(order.deadline, order.deadline_end),
        dateOrNull(order.deadline_start),
        integerOrNull(order.manager_id),
        integerOrNull(order.quantity, order.qty),
        numberOrNull(order.total_revenue, order.total_revenue_plan),
        numberOrNull(order.total_cost, order.total_cost_plan),
        numberOrNull(order.total_margin, order.total_margin_plan),
        numberOrNull(order.margin_percent, order.margin_percent_plan),
        numberOrNull(order.total_hours_plan),
        numberOrNull(order.production_hours_plastic),
        numberOrNull(order.production_hours_packaging),
        numberOrNull(order.production_hours_hardware),
        order.calculator_data,
        { legacy: raw, legacy_status: raw.status || null },
        order.created_at || new Date().toISOString(),
        order.updated_at || order.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshOrderItems() {
  const rows = await fetchAll('order_items');
  const existingOrders = new Set((await pool.query(`SELECT id::text FROM orders`)).rows.map((row) => row.id));
  const filtered = rows.filter((row) => existingOrders.has(String(row.order_id)));
  console.log(`order_items: ${filtered.length}`);

  for (const raw of filtered) {
    const item = mergeItem(raw);
    await pool.query(
      `INSERT INTO order_items
         (id, order_id, type, name, qty, unit_price, line_total, item_data, position, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         order_id = EXCLUDED.order_id,
         type = EXCLUDED.type,
         name = EXCLUDED.name,
         qty = EXCLUDED.qty,
         unit_price = EXCLUDED.unit_price,
         line_total = EXCLUDED.line_total,
         item_data = EXCLUDED.item_data,
         position = EXCLUDED.position,
         updated_at = EXCLUDED.updated_at`,
      [
        item.id,
        item.order_id,
        textOrNull(item.item_type, item.type),
        textOrNull(item.product_name, item.name),
        numberOrNull(item.quantity, item.qty),
        numberOrNull(item.unit_price, item.sell_price_item, item.sell_price),
        numberOrNull(item.total_price, item.line_total),
        { ...item.item_data, legacy: raw },
        integerOrNull(item.item_number, item.position),
        item.created_at || new Date().toISOString(),
        item.updated_at || item.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshOrderFactuals() {
  const rows = await fetchAll('order_factuals');
  const existingOrders = new Set((await pool.query(`SELECT id::text FROM orders`)).rows.map((row) => row.id));
  const filtered = rows.filter((row) => existingOrders.has(String(row.order_id)));
  console.log(`order_factuals: ${filtered.length}`);

  for (const raw of filtered) {
    const data = parseJson(raw.factual_data, raw);
    const revenue = numberOrNull(raw.actual_revenue, data.actual_revenue, data.fact_revenue);
    const cost = numberOrNull(raw.actual_cost, data.actual_cost, data.fact_total);
    const margin = numberOrNull(raw.actual_margin, data.actual_margin, revenue !== null && cost !== null ? revenue - cost : null);
    await pool.query(
      `INSERT INTO order_factuals
         (id, order_id, factual_data, actual_revenue, actual_cost, actual_margin, actual_margin_percent, closed_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (order_id) DO UPDATE SET
         factual_data = EXCLUDED.factual_data,
         actual_revenue = EXCLUDED.actual_revenue,
         actual_cost = EXCLUDED.actual_cost,
         actual_margin = EXCLUDED.actual_margin,
         actual_margin_percent = EXCLUDED.actual_margin_percent,
         closed_at = EXCLUDED.closed_at,
         updated_at = EXCLUDED.updated_at`,
      [
        raw.id,
        raw.order_id,
        { ...data, legacy: raw },
        revenue,
        cost,
        margin,
        numberOrNull(raw.actual_margin_percent, data.actual_margin_percent, revenue > 0 && margin !== null ? (margin * 100) / revenue : null),
        raw.closed_at || data.closed_at || null,
        raw.created_at || new Date().toISOString(),
        raw.updated_at || raw.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function main() {
  await refreshOrders();
  await refreshOrderItems();
  await refreshOrderFactuals();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

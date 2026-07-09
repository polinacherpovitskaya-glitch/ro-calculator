// Copy product templates and production settings JSON into normalized tables.
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
    return JSON.parse(value);
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

function safeDate(value) {
  const text = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function fetchAll(table, columns = '*') {
  const { data, error } = await supabase.from(table).select(columns);
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.${table}'`)) {
      console.log(`${table}: missing in Supabase, skipping`);
      return [];
    }
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

async function refreshProductTemplates() {
  const rows = await fetchAll('product_templates');
  console.log(`product_templates: ${rows.length}`);

  for (const row of rows) {
    const data = parseJson(row.data || row.template_data || row.settings || {}, {});
    const id = numberOrNull(row.id);
    if (!id) continue;
    await pool.query(
      `INSERT INTO product_templates (id, name, category, data, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         category = EXCLUDED.category,
         data = EXCLUDED.data,
         is_active = EXCLUDED.is_active,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        textOrNull(row.name, data.name) || `Template ${id}`,
        textOrNull(row.category, row.type, data.category, data.type),
        { ...data, legacy: row },
        boolValue(row.is_active, row.is_deleted === true ? false : true),
        row.created_at || new Date().toISOString(),
        row.updated_at || new Date().toISOString(),
      ]
    );
  }
}

function calendarEntries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    return Object.entries(raw).map(([date, value]) => {
      if (value && typeof value === 'object') return { date, ...value };
      return { date, is_working: Boolean(value) };
    });
  }
  return [];
}

async function refreshCalendar() {
  const raw = await fetchSetting('productionCalendar', 'production_calendar_json');
  const days = calendarEntries(raw);
  console.log(`production_calendar_days: ${days.length}`);

  for (const day of days) {
    const date = safeDate(day.date || day.day);
    if (!date) continue;
    await pool.query(
      `INSERT INTO production_calendar_days (date, is_working, hours, note, extras)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (date) DO UPDATE SET
         is_working = EXCLUDED.is_working,
         hours = EXCLUDED.hours,
         note = EXCLUDED.note,
         extras = EXCLUDED.extras,
         updated_at = NOW()`,
      [
        date,
        boolValue(day.is_working ?? day.working ?? day.isWorking, true),
        numberOrNull(day.hours, day.work_hours, day.workHours) || 8,
        textOrNull(day.note, day.comment),
        { legacy: day },
      ]
    );
  }
}

async function loadOrderDates(orderIds) {
  if (!orderIds.length) return new Map();
  const { data, error } = await supabase.from('orders').select('id,created_at,order_data,calculator_data').in('id', orderIds);
  if (error) return new Map();
  return new Map(
    (data || []).map((row) => {
      const parsed = { ...parseJson(row.order_data), ...parseJson(row.calculator_data) };
      return [
        String(row.id),
        safeDate(parsed.production_start_date || parsed.start_date || parsed.deadline || row.created_at) ||
          new Date().toISOString().slice(0, 10),
      ];
    })
  );
}

function planEntries(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.entries)) return raw.entries;
  if (Array.isArray(raw.items)) return raw.items;
  if (Array.isArray(raw.order_ids)) {
    return raw.order_ids.map((orderId, index) => ({ order_id: orderId, position: (index + 1) * 100, extras: { source: 'order_ids' } }));
  }
  return [];
}

async function refreshProductionPlan() {
  const raw = await fetchSetting('productionPlan', 'production_plan_state_json');
  const entries = planEntries(raw);
  console.log(`production_plan_entries: ${entries.length}`);
  if (!entries.length) return;

  const orderDates = await loadOrderDates(entries.map((entry) => numberOrNull(entry.order_id)).filter(Boolean));
  await pool.query(`TRUNCATE production_plan_entries RESTART IDENTITY`);

  for (const [index, entry] of entries.entries()) {
    const orderId = numberOrNull(entry.order_id, entry.orderId, entry.id);
    const date =
      safeDate(entry.date || entry.production_date || entry.start_date) ||
      (orderId ? orderDates.get(String(orderId)) : null) ||
      new Date().toISOString().slice(0, 10);
    await pool.query(
      `INSERT INTO production_plan_entries
         (date, order_id, item_name, qty, hours_planned, operator_id, status, position, note, extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        date,
        orderId,
        textOrNull(entry.item_name, entry.itemName, entry.name),
        numberOrNull(entry.qty, entry.quantity),
        numberOrNull(entry.hours_planned, entry.hoursPlanned, entry.hours),
        numberOrNull(entry.operator_id, entry.operatorId),
        ['planned', 'in_progress', 'done', 'cancelled'].includes(entry.status) ? entry.status : 'planned',
        numberOrNull(entry.position) || (index + 1) * 100,
        textOrNull(entry.note, entry.comment),
        { legacy: entry },
        entry.created_at || new Date().toISOString(),
        entry.updated_at || new Date().toISOString(),
      ]
    );
  }
}

function indirectRows(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw)) return raw;
  const rows = [];
  for (const [period, data] of Object.entries(raw)) {
    const match = period.match(/^(\d{4})-(\d{2})$/);
    if (!match || !data || typeof data !== 'object') continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number(data.total_override) > 0) {
      rows.push({ period_year: year, period_month: month, category: 'total_override', amount: Number(data.total_override), extras: { legacy: data } });
      continue;
    }
    for (const [category, amount] of Object.entries(data)) {
      if (category === 'total_override') continue;
      const numericAmount = numberOrNull(amount);
      if (numericAmount === null) continue;
      rows.push({ period_year: year, period_month: month, category, amount: numericAmount, extras: { legacy_month: data } });
    }
  }
  return rows;
}

async function refreshIndirectCosts() {
  const raw = await fetchSetting('indirectCosts', 'indirect_costs_json');
  const rows = indirectRows(raw);
  console.log(`indirect_costs: ${rows.length}`);

  for (const row of rows) {
    await pool.query(
      `INSERT INTO indirect_costs (period_year, period_month, category, amount, currency, note, extras)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (period_year, period_month, category) DO UPDATE SET
         amount = EXCLUDED.amount,
         currency = EXCLUDED.currency,
         note = EXCLUDED.note,
         extras = EXCLUDED.extras,
         updated_at = NOW()`,
      [row.period_year, row.period_month, row.category, row.amount, row.currency || 'RUB', row.note || null, row.extras || {}]
    );
  }
}

async function main() {
  await refreshProductTemplates();
  await refreshCalendar();
  await refreshProductionPlan();
  await refreshIndirectCosts();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

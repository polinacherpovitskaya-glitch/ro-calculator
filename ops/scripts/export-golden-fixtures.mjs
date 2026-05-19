// Export real Supabase orders as calculator golden-master fixtures.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//
// The source order list is ops/scripts/fixtures-order-ids.txt, one id per line.
// Blank lines and # comments are ignored.
//
// Run from the repository root:
//   node ops/scripts/export-golden-fixtures.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const idsPath = path.join(__dirname, 'fixtures-order-ids.txt');
const fixturesDir = path.join(repoRoot, 'ops', 'api', 'test', 'fixtures', 'orders');

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

function parseIds(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function expectedFromOrder(order) {
  const calculatorData = parseJson(order.calculator_data) || {};
  return {
    total_revenue: numberOrNull(order.total_revenue, calculatorData.total_revenue_plan, calculatorData.total_revenue),
    total_cost: numberOrNull(order.total_cost, calculatorData.total_cost_plan, calculatorData.total_cost),
    total_margin: numberOrNull(order.total_margin, calculatorData.total_margin_plan, calculatorData.total_margin),
    margin_percent: numberOrNull(order.margin_percent, calculatorData.margin_percent_plan, calculatorData.margin_percent),
    total_hours_plan: numberOrNull(order.total_hours_plan, calculatorData.total_hours_plan),
    production_hours_plastic: numberOrNull(order.production_hours_plastic, calculatorData.production_hours_plastic),
    production_hours_packaging: numberOrNull(order.production_hours_packaging, calculatorData.production_hours_packaging),
    production_hours_hardware: numberOrNull(order.production_hours_hardware, calculatorData.production_hours_hardware),
  };
}

function summarize(order, items, factuals) {
  const parsedItems = items.map((item) => parseJson(item.item_data) || {});
  const text = JSON.stringify({ order, items: parsedItems }).toLowerCase();
  return {
    order_id: String(order.id),
    order_name: order.order_name || '',
    status: order.status || '',
    item_count: items.length,
    factual_count: factuals.length,
    has_pendant: /подвес|pendant/.test(text),
    has_mold: /молд|mold/.test(text) || parsedItems.some((item) =>
      Number(item.cost_mold_amortization || 0) > 0 || Number(item.extra_molds || 0) > 0 || item.is_blank_mold === true
    ),
    has_hardware: /фурнит|hardware|карабин|кольцо|цепоч/.test(text),
    has_nfc: parsedItems.some((item) =>
      item.is_nfc === true || Number(item.cost_nfc_tag || 0) > 0 || Number(item.cost_nfc_programming || 0) > 0
    ),
    is_complex: items.length > 10 || parsedItems.some((item) => Number(item.quantity || 0) >= 1000),
  };
}

async function singleOrThrow(table, id) {
  const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
  if (error) throw new Error(`${table}:${id}: ${error.message}`);
  return data;
}

async function fetchRows(table, column, value) {
  const { data, error } = await supabase.from(table).select('*').eq(column, value);
  if (error) throw new Error(`${table}.${column}=${value}: ${error.message}`);
  return data || [];
}

async function main() {
  await fs.mkdir(fixturesDir, { recursive: true });
  const ids = parseIds(await fs.readFile(idsPath, 'utf8'));
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) {
    throw new Error(`Duplicate fixture order id: ${duplicate}`);
  }

  console.log(`Exporting ${ids.length} orders`);
  for (const id of ids) {
    const order = await singleOrThrow('orders', id);
    const [items, factuals] = await Promise.all([
      fetchRows('order_items', 'order_id', id),
      fetchRows('order_factuals', 'order_id', id),
    ]);
    items.sort((left, right) => Number(left.item_number || 0) - Number(right.item_number || 0) || String(left.id).localeCompare(String(right.id)));

    const fixture = {
      id: String(id),
      exportedAt: new Date().toISOString(),
      source: 'supabase',
      summary: summarize(order, items, factuals),
      expected: expectedFromOrder(order),
      order,
      items,
      factuals,
    };
    await fs.writeFile(path.join(fixturesDir, `${id}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`OK ${id}: ${items.length} items, ${factuals.length} factuals`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

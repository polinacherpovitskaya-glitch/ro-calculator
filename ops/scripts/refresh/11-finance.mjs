// Copy relational finance, bank, legacy-import, and FinTablo data from
// self-hosted Supabase into the independent PostgreSQL database.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;
const PAGE_SIZE = 1000;
const INSERT_BATCH_SIZE = 100;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

const TABLES = [
  'finance_sources',
  'finance_categories',
  'finance_directions',
  'finance_accounts',
  'finance_counterparties',
  'finance_transactions',
  'finance_transaction_links',
  'finance_rules',
  'finance_manual_decisions',
  'bank_sync_runs',
  'bank_accounts',
  'bank_transactions',
  'legacy_finance_import_runs',
  'legacy_finance_transactions',
  'fintablo_imports',
];

async function fetchAll(table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

async function targetColumns(table) {
  const { rows } = await pool.query(
    `SELECT column_name, is_identity
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  if (!rows.length) throw new Error(`Target table ${table} is missing`);
  return rows;
}

async function existingIds(table) {
  const { rows } = await pool.query(`SELECT id::text FROM ${quoteIdentifier(table)}`);
  return new Set(rows.map((row) => row.id));
}

async function normalizeRows(table, rows, references) {
  if (table === 'finance_transactions') {
    return rows.map((row) => ({
      ...row,
      order_id: row.order_id && references.orders.has(String(row.order_id)) ? row.order_id : null,
      employee_id: row.employee_id && references.employees.has(String(row.employee_id)) ? row.employee_id : null,
    }));
  }
  if (table === 'fintablo_imports') {
    return rows.map((row) => ({
      ...row,
      order_id: row.order_id && references.orders.has(String(row.order_id)) ? row.order_id : null,
    }));
  }
  return rows;
}

async function upsertBatch(table, rows, columnMeta) {
  if (!rows.length) return;
  const targetNames = columnMeta.map((column) => column.column_name);
  const sourceNames = new Set(rows.flatMap((row) => Object.keys(row)));
  const columns = targetNames.filter((column) => sourceNames.has(column));
  if (!columns.includes('id')) throw new Error(`${table} rows do not contain id`);

  const values = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(',')})`;
  });
  const updates = columns
    .filter((column) => column !== 'id')
    .map((column) => `${quoteIdentifier(column)} = EXCLUDED.${quoteIdentifier(column)}`)
    .join(', ');
  const overriding = columnMeta.some((column) => column.is_identity === 'YES')
    ? ' OVERRIDING SYSTEM VALUE'
    : '';

  await pool.query(
    `INSERT INTO ${quoteIdentifier(table)} (${columns.map(quoteIdentifier).join(',')})${overriding}
     VALUES ${tuples.join(',')}
     ON CONFLICT (id) DO UPDATE SET ${updates}`,
    values
  );
}

async function resetIdentity(table, columnMeta) {
  if (!columnMeta.some((column) => column.column_name === 'id' && column.is_identity === 'YES')) return;
  await pool.query(
    `SELECT setval(
       pg_get_serial_sequence($1, 'id'),
       COALESCE((SELECT MAX(id) FROM ${quoteIdentifier(table)}), 1),
       EXISTS (SELECT 1 FROM ${quoteIdentifier(table)})
     )`,
    [table]
  );
}

async function refreshTable(table, references) {
  const sourceRows = await fetchAll(table);
  const rows = await normalizeRows(table, sourceRows, references);
  const columns = await targetColumns(table);
  for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
    await upsertBatch(table, rows.slice(offset, offset + INSERT_BATCH_SIZE), columns);
  }
  await resetIdentity(table, columns);
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)}`
  );
  console.log(`${table}: source=${sourceRows.length} target=${countRows[0].count}`);
}

async function main() {
  const references = {
    orders: await existingIds('orders'),
    employees: await existingIds('employees'),
  };
  for (const table of TABLES) {
    await refreshTable(table, references);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

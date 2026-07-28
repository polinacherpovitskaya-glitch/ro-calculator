// Preserve Supabase-only website and legacy application rows in the
// independent PostgreSQL database without exposing them through the calculator
// API. Every source row is stored losslessly as JSONB.
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

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

const LEGACY_SITE_TABLES = [
  ['admin_users', 'id'],
  ['app_tasks', 'id'],
  ['blank_color_tuning', 'color_id'],
  ['cases', 'id'],
  ['certificate_redemptions', 'id'],
  ['certificates', 'id'],
  ['china_orders', 'id'],
  ['consent_logs', 'id'],
  ['email_subscribers', 'id'],
  ['faq', 'id'],
  ['form_submissions', 'id'],
  ['message_templates', 'id'],
  ['notification_log', 'id'],
  ['order_shipments', 'id'],
  ['order_timeline', 'id'],
  ['page_content', 'id'],
  ['products', 'id'],
  ['promo_codes', 'id'],
  ['promo_redemptions', 'id'],
  ['return_requests', 'id'],
  ['shop_orders', 'id'],
  ['site_settings', 'key'],
];

async function fetchAll(table, idColumn) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(idColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

async function replaceTable(table, idColumn) {
  const rows = await fetchAll(table, idColumn);
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM legacy_supabase_rows WHERE table_name = $1', [table]);
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
      if (!batch.length) continue;
      const values = [];
      const tuples = batch.map((row) => {
        const sourceId = row[idColumn];
        if (sourceId === null || sourceId === undefined || sourceId === '') {
          throw new Error(`${table} row is missing ${idColumn}`);
        }
        values.push(table, String(sourceId), row);
        const base = values.length - 2;
        return `($${base}, $${base + 1}, $${base + 2})`;
      });
      await pool.query(
        `INSERT INTO legacy_supabase_rows (table_name, source_id, data)
         VALUES ${tuples.join(',')}
         ON CONFLICT (table_name, source_id) DO UPDATE
         SET data = EXCLUDED.data, copied_at = now()`,
        values,
      );
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM legacy_supabase_rows
      WHERE table_name = $1`,
    [table],
  );
  console.log(`${table}: source=${rows.length} target=${countRows[0].count}`);
}

async function main() {
  for (const [table, idColumn] of LEGACY_SITE_TABLES) {
    await replaceTable(table, idColumn);
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

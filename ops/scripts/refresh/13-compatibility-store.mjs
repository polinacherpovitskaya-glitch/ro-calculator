// Copy every public Supabase row into an exact JSONB compatibility store.
// The old calculator can keep its existing function contracts while transport
// moves to the independent Express API.
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

export const COMPAT_TABLES = [
  ['admin_users', ['id']],
  ['app_colors', ['id']],
  ['app_tasks', ['id']],
  ['app_vacations', ['id']],
  ['areas', ['id']],
  ['bank_accounts', ['id']],
  ['bank_sync_runs', ['id']],
  ['bank_transactions', ['id']],
  ['blank_color_tuning', ['color_id']],
  ['cases', ['id']],
  ['certificate_redemptions', ['id']],
  ['certificates', ['id']],
  ['china_orders', ['id']],
  ['china_purchases', ['id']],
  ['consent_logs', ['id']],
  ['email_subscribers', ['id']],
  ['employees', ['id']],
  ['faq', ['id']],
  ['finance_accounts', ['id']],
  ['finance_categories', ['id']],
  ['finance_counterparties', ['id']],
  ['finance_directions', ['id']],
  ['finance_manual_decisions', ['id']],
  ['finance_rules', ['id']],
  ['finance_sources', ['id']],
  ['finance_transaction_links', ['id']],
  ['finance_transactions', ['id']],
  ['fintablo_imports', ['id']],
  ['form_submissions', ['id']],
  ['hw_blanks', ['id']],
  ['legacy_finance_import_runs', ['id']],
  ['legacy_finance_transactions', ['id']],
  ['marketplace_sets', ['id']],
  ['message_templates', ['id']],
  ['molds', ['id']],
  ['notification_log', ['id']],
  ['order_factuals', ['id']],
  ['order_items', ['id']],
  ['order_shipments', ['id']],
  ['order_timeline', ['id']],
  ['orders', ['id']],
  ['page_content', ['id']],
  ['pkg_blanks', ['id']],
  ['product_templates', ['id']],
  ['products', ['id']],
  ['projects', ['id']],
  ['promo_codes', ['id']],
  ['promo_redemptions', ['id']],
  ['return_requests', ['id']],
  ['settings', ['key']],
  ['shipments', ['id']],
  ['shop_orders', ['id']],
  ['site_settings', ['key']],
  ['task_checklist_items', ['id']],
  ['task_comments', ['id']],
  ['task_notification_events', ['id']],
  ['task_watchers', ['task_id', 'user_id']],
  ['tasks', ['id']],
  ['time_entries', ['id']],
  ['warehouse_history', ['id']],
  ['warehouse_items', ['id']],
  ['warehouse_reservations', ['id']],
  ['work_activity', ['id']],
  ['work_assets', ['id']],
  ['work_templates', ['id']],
];

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

function sourceId(row, primaryKey) {
  const parts = primaryKey.map((column) => {
    const value = row[column];
    if (value === null || value === undefined || value === '') {
      throw new Error(`Compatibility row is missing primary key ${column}`);
    }
    return String(value);
  });
  return parts.join('\u001f');
}

async function fetchAll(table, primaryKey) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let query = supabase.from(table).select('*');
    for (const column of primaryKey) {
      query = query.order(column, { ascending: true });
    }
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    const chunk = data || [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
  }
  return rows;
}

async function replaceTable(table, primaryKey) {
  const rows = await fetchAll(table, primaryKey);
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM compat_rows WHERE table_name = $1', [table]);
    for (let offset = 0; offset < rows.length; offset += INSERT_BATCH_SIZE) {
      const batch = rows.slice(offset, offset + INSERT_BATCH_SIZE);
      if (!batch.length) continue;
      const values = [];
      const tuples = batch.map((row) => {
        values.push(table, sourceId(row, primaryKey), row);
        const base = values.length - 2;
        return `($${base}, $${base + 1}, $${base + 2})`;
      });
      await pool.query(
        `INSERT INTO compat_rows (table_name, source_id, data)
         VALUES ${tuples.join(',')}`,
        values,
      );
    }
    await pool.query('COMMIT');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
  console.log(`${table}: compatibility source=${rows.length}`);
}

async function main() {
  for (const [table, primaryKey] of COMPAT_TABLES) {
    await replaceTable(table, primaryKey);
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

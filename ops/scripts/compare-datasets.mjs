// Compare Supabase and Postgres row counts for migrated staging tables.
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

const TABLES = ['employees', 'warehouse_items', 'warehouse_reservations', 'warehouse_history'];

async function supabaseCount(table) {
  if (table === 'warehouse_reservations') {
    const { data, error } = await supabase.from(table).select('reservations_data');
    if (error) throw error;
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

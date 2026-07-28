// Copy employees from Supabase into Postgres.
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

async function main() {
  console.log('Fetching employees from Supabase...');
  const { data, error } = await supabase.from('employees').select('*');
  if (error) throw error;
  console.log(`Found ${data.length} employees`);

  for (const employee of data) {
    await pool.query(
      `INSERT INTO employees
         (id, name, email, role, hourly_rate, is_active, extras, created_at, updated_at,
          daily_hours, telegram_id, telegram_username, reminder_hour, reminder_minute,
          timezone_offset, tasks_required)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         hourly_rate = EXCLUDED.hourly_rate,
         is_active = EXCLUDED.is_active,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at,
         daily_hours = EXCLUDED.daily_hours,
         telegram_id = EXCLUDED.telegram_id,
         telegram_username = EXCLUDED.telegram_username,
         reminder_hour = EXCLUDED.reminder_hour,
         reminder_minute = EXCLUDED.reminder_minute,
         timezone_offset = EXCLUDED.timezone_offset,
         tasks_required = EXCLUDED.tasks_required`,
      [
        employee.id,
        employee.name || '',
        employee.email || null,
        employee.role || null,
        employee.hourly_rate ?? null,
        employee.is_active !== false,
        { ...(employee.extras || {}), legacy: employee },
        employee.created_at || new Date().toISOString(),
        employee.updated_at || new Date().toISOString(),
        employee.daily_hours ?? 8,
        employee.telegram_id ?? null,
        employee.telegram_username || '',
        employee.reminder_hour ?? 17,
        employee.reminder_minute ?? 30,
        employee.timezone_offset ?? 3,
        employee.tasks_required === true,
      ]
    );
  }

  const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM employees`);
  console.log(`Postgres now has ${rows[0].n} employees`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

// Copy remaining operational settings from Supabase into Postgres.
//
// Required environment:
//   SUPABASE_URL
//   SUPABASE_SERVICE_KEY
//   DATABASE_URL

import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import WebSocket from 'ws';

const { Pool } = pg;

export const EXACT_DENYLIST = new Set([
  'productionCalendar',
  'production_calendar_json',
  'productionPlan',
  'production_plan_state_json',
  'indirectCosts',
  'indirect_costs_json',
  'warehouseItems',
  'warehouse_items_json',
  'projectHardwareState',
  'project_hardware_state_json',
  'auth_accounts_json',
  'auth_activity_json',
  'auth_sessions_json',
  'employee_extra_json',
  'fintablo_snapshot_json',
  'tochka_snapshot_json',
  'bug_reports_json',
  'work_projects_json',
  'work_areas_json',
  'work_templates_json',
  'work_task_notification_events_json',
  'work_task_comments_json',
  'work_activity_json',
  'work_assets_json',
  'work_task_checklist_items_json',
  'work_tasks_json',
  'work_task_watchers_json',
]);

export const PREFIX_DENYLIST = [
  'finance_',
  'wiki_',
  'knowledge_',
  '_legacy_',
  'codex_',
  'ro_yandex_',
];

export function shouldCopySettingKey(key) {
  const normalized = String(key || '').trim();
  if (!normalized) return false;
  if (EXACT_DENYLIST.has(normalized)) return false;
  if (PREFIX_DENYLIST.some((prefix) => normalized.startsWith(prefix))) return false;
  return true;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseJsonValue(value) {
  if (value === undefined) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_KEY'), {
  realtime: { transport: WebSocket },
});
const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

async function main() {
  const { data, error } = await supabase.from('settings').select('*');
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.settings'`)) {
      console.log('settings: source table missing');
      return;
    }
    throw error;
  }

  let copied = 0;
  let skipped = 0;
  for (const row of data || []) {
    const key = String(row.key || '').trim();
    if (!shouldCopySettingKey(key)) {
      console.log(`SKIP ${key}`);
      skipped += 1;
      continue;
    }
    await pool.query(
      `INSERT INTO settings (key, value, updated_at)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE SET
         value = EXCLUDED.value,
         updated_at = EXCLUDED.updated_at`,
      [key, JSON.stringify(parseJsonValue(row.value)), row.updated_at || row.created_at || new Date().toISOString()]
    );
    console.log(`COPY ${key}`);
    copied += 1;
  }
  console.log(`settings: copied=${copied} skipped=${skipped}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

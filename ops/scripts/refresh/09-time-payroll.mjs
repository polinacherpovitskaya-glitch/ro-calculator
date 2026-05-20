// Copy legacy time tracking, vacations, and payroll settings into Postgres.
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

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) {
    const message = String(error.message || '');
    if (message.includes(`Could not find the table 'public.${table}'`)) return [];
    throw error;
  }
  return data || [];
}

function text(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return '';
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

function dateOrNull(...values) {
  for (const value of values) {
    const normalized = String(value || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
  }
  return null;
}

function boolValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

function jsonObject(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

async function employeeMap() {
  const { rows } = await pool.query(`SELECT id, name, hourly_rate, extras FROM employees`);
  return new Map(rows.map((row) => [String(row.id), row]));
}

async function refreshTimeEntries() {
  const rows = await fetchAll('time_entries');
  const employees = await employeeMap();
  console.log(`time_entries: ${rows.length}`);
  for (const row of rows) {
    const employeeId = integerOrNull(row.employee_id);
    if (!employeeId || !employees.has(String(employeeId))) continue;
    const date = dateOrNull(row.date, row.work_date, row.created_at);
    const hours = numberOrNull(row.hours, row.duration_hours);
    if (!date || hours === null) continue;
    const employee = employees.get(String(employeeId));
    await pool.query(
      `INSERT INTO time_entries
         (id, employee_id, employee_name, date, hours, task_id, project_id, project_name, order_id, stage, note, is_overtime, source, extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO UPDATE SET
         employee_id = EXCLUDED.employee_id,
         employee_name = EXCLUDED.employee_name,
         date = EXCLUDED.date,
         hours = EXCLUDED.hours,
         task_id = EXCLUDED.task_id,
         project_id = EXCLUDED.project_id,
         project_name = EXCLUDED.project_name,
         order_id = EXCLUDED.order_id,
         stage = EXCLUDED.stage,
         note = EXCLUDED.note,
         is_overtime = EXCLUDED.is_overtime,
         source = EXCLUDED.source,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        employeeId,
        text(row.employee_name, row.worker_name, employee.name),
        date,
        hours,
        integerOrNull(row.task_id),
        integerOrNull(row.project_id),
        text(row.project_name),
        integerOrNull(row.order_id),
        text(row.stage),
        text(row.note, row.notes, row.description),
        boolValue(row.is_overtime, false),
        text(row.source) || 'legacy',
        jsonObject(row.extras, { legacy: row }),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function refreshVacations() {
  const rows = await fetchAll('app_vacations');
  const employees = await employeeMap();
  console.log(`app_vacations: ${rows.length}`);
  for (const row of rows) {
    const employeeId = integerOrNull(row.employee_id);
    if (!employeeId || !employees.has(String(employeeId))) continue;
    const start = dateOrNull(row.start_date, row.date_from, row.date);
    const end = dateOrNull(row.end_date, row.date_to, row.date) || start;
    if (!start || !end) continue;
    const employee = employees.get(String(employeeId));
    await pool.query(
      `INSERT INTO app_vacations (id, employee_id, employee_name, start_date, end_date, type, is_paid, note, extras, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET
         employee_id = EXCLUDED.employee_id,
         employee_name = EXCLUDED.employee_name,
         start_date = EXCLUDED.start_date,
         end_date = EXCLUDED.end_date,
         type = EXCLUDED.type,
         is_paid = EXCLUDED.is_paid,
         note = EXCLUDED.note,
         extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        row.id,
        employeeId,
        text(row.employee_name, employee.name),
        start,
        end,
        ['vacation', 'sick', 'unpaid', 'holiday'].includes(row.type) ? row.type : 'vacation',
        boolValue(row.is_paid, true),
        text(row.note, row.notes),
        jsonObject(row.extras, { legacy: row }),
        row.created_at || new Date().toISOString(),
        row.updated_at || row.created_at || new Date().toISOString(),
      ]
    );
  }
}

async function seedRatesFromEmployees() {
  const employees = await employeeMap();
  let count = 0;
  for (const employee of employees.values()) {
    const extras = employee.extras || {};
    const hourly = numberOrNull(employee.hourly_rate, extras.pay_hour_rate, extras.hourly_rate, 0) || 0;
    const baseSalary = numberOrNull(extras.pay_base_salary_month);
    await pool.query(
      `INSERT INTO payroll_rates
         (employee_id, valid_from, hourly_rate, overtime_rate, weekend_rate, holiday_rate, base_salary, base_hours_month, base_hours_semimonth, tier, extras)
       VALUES ($1, '2026-01-01', $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (employee_id, valid_from) DO UPDATE SET
         hourly_rate = EXCLUDED.hourly_rate,
         overtime_rate = EXCLUDED.overtime_rate,
         weekend_rate = EXCLUDED.weekend_rate,
         holiday_rate = EXCLUDED.holiday_rate,
         base_salary = EXCLUDED.base_salary,
         base_hours_month = EXCLUDED.base_hours_month,
         base_hours_semimonth = EXCLUDED.base_hours_semimonth,
         tier = EXCLUDED.tier,
         extras = EXCLUDED.extras,
         updated_at = NOW()`,
      [
        employee.id,
        hourly,
        numberOrNull(extras.pay_overtime_hour_rate),
        numberOrNull(extras.pay_weekend_hour_rate),
        numberOrNull(extras.pay_holiday_hour_rate),
        baseSalary,
        numberOrNull(extras.pay_base_hours_month),
        numberOrNull(extras.pay_base_hours_semimonth),
        extras.payroll_profile === 'tiered' ? 'tiered' : null,
        extras,
      ]
    );
    count += 1;
  }
  console.log(`payroll_rates seeded from employees: ${count}`);
}

async function main() {
  await refreshTimeEntries();
  await refreshVacations();
  await seedRatesFromEmployees();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';
import { calcPayroll } from '../src/payroll/calc.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createUser() {
  const email = `time-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, 'admin', FALSE)
     RETURNING id, email`,
    [email, passwordHash]
  );
  return rows[0];
}

async function login(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

async function setup(t) {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  const employeeId = Number(`8${String(Date.now()).slice(-10)}${Math.floor(Math.random() * 10)}`);
  await getPool().query(
    `INSERT INTO employees (id, name, role, hourly_rate, extras)
     VALUES ($1, $2, 'production', 500, $3)`,
    [employeeId, `Time employee ${employeeId}`, { pay_overtime_hour_rate: 900 }]
  );
  return { port, cookie, employeeId };
}

async function json(port, method, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { res, body: await res.json() };
}

test('calcPayroll pays hourly regular hours', () => {
  const out = calcPayroll({ employeeId: 1, year: 2026, month: 5, half: 'first', hoursRegular: 10, hoursOvertime: 0, rate: { hourly_rate: 500 } });
  assert.equal(out.baseAmount, 5000);
  assert.equal(out.total, 5000);
});

test('calcPayroll salary pays half salary plus threshold overtime', () => {
  const out = calcPayroll({
    employeeId: 1,
    year: 2026,
    month: 5,
    half: 'first',
    hoursRegular: 90,
    hoursOvertime: 2,
    rate: { base_salary: 176000, base_hours_month: 176, base_hours_semimonth: 88, overtime_rate: 1200 },
  });
  assert.equal(out.baseAmount, 88000);
  assert.equal(out.overtimeHours, 4);
  assert.equal(out.overtimeAmount, 4800);
  assert.equal(out.total, 92800);
});

test('calcPayroll supports tiered hourly rates', () => {
  const out = calcPayroll({
    employeeId: 1,
    year: 2026,
    month: 5,
    half: 'full',
    hoursRegular: 121,
    hoursOvertime: 0,
    rate: { hourly_rate: 400, tier: 'tiered', extras: { tiers: [{ from_hours: 0, to_hours: 80, rate: 400 }, { from_hours: 81, to_hours: 120, rate: 500 }, { from_hours: 121, rate: 650 }] } },
  });
  assert.equal(out.baseAmount, 78650);
});

test('POST /api/time-entries without Idempotency-Key returns 400', async (t) => {
  const { port, cookie, employeeId } = await setup(t);
  const { res, body } = await json(port, 'POST', '/api/time-entries', { employee_id: employeeId, date: '2026-05-01', hours: 2 }, cookie, '');
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('time entries can be created, listed, patched, and deleted', async (t) => {
  const { port, cookie, employeeId } = await setup(t);
  const created = await json(port, 'POST', '/api/time-entries', { employee_id: employeeId, date: '2026-05-01', hours: 3, project_name: 'Ops', stage: 'assembly' }, cookie);
  assert.equal(created.res.status, 201);
  assert.equal(created.body.entry.hours, 3);
  const listed = await fetch(`http://127.0.0.1:${port}/api/time-entries?employee_id=${employeeId}&date_from=2026-05-01&date_to=2026-05-31`, { headers: { cookie } });
  const listBody = await listed.json();
  assert.equal(listed.status, 200);
  assert.equal(listBody.entries.length, 1);
  const patched = await json(port, 'PATCH', `/api/time-entries/${created.body.entry.id}`, { hours: 4, is_overtime: true }, cookie);
  assert.equal(patched.body.entry.hours, 4);
  assert.equal(patched.body.entry.is_overtime, true);
  const deleted = await json(port, 'DELETE', `/api/time-entries/${created.body.entry.id}`, undefined, cookie);
  assert.equal(deleted.res.status, 200);
});

test('vacations can be created, listed, patched, and deleted', async (t) => {
  const { port, cookie, employeeId } = await setup(t);
  const created = await json(port, 'POST', '/api/vacations', { employee_id: employeeId, start_date: '2026-05-10', end_date: '2026-05-12', type: 'vacation' }, cookie);
  assert.equal(created.res.status, 201);
  const listed = await fetch(`http://127.0.0.1:${port}/api/vacations?employee_id=${employeeId}`, { headers: { cookie } });
  const listBody = await listed.json();
  assert.equal(listBody.vacations.length, 1);
  const patched = await json(port, 'PATCH', `/api/vacations/${created.body.vacation.id}`, { type: 'sick', is_paid: false }, cookie);
  assert.equal(patched.body.vacation.type, 'sick');
  assert.equal(patched.body.vacation.is_paid, false);
  const deleted = await json(port, 'DELETE', `/api/vacations/${created.body.vacation.id}`, undefined, cookie);
  assert.equal(deleted.res.status, 200);
});

test('payroll rates can be created and patched', async (t) => {
  const { port, cookie, employeeId } = await setup(t);
  const created = await json(port, 'POST', '/api/payroll/rates', { employee_id: employeeId, valid_from: '2026-05-01', hourly_rate: 500 }, cookie);
  assert.equal(created.res.status, 201);
  const patched = await json(port, 'PATCH', `/api/payroll/rates/${created.body.rate.id}`, { overtime_rate: 900 }, cookie);
  assert.equal(patched.body.rate.overtime_rate, 900);
  const listed = await fetch(`http://127.0.0.1:${port}/api/payroll/rates?employee_id=${employeeId}`, { headers: { cookie } });
  const listBody = await listed.json();
  assert.equal(listBody.rates.length, 1);
});

test('payroll calculate writes periods and mark-paid toggles paid_at', async (t) => {
  const { port, cookie, employeeId } = await setup(t);
  await json(port, 'POST', '/api/payroll/rates', { employee_id: employeeId, valid_from: '2026-05-01', hourly_rate: 500, overtime_rate: 900 }, cookie);
  await json(port, 'POST', '/api/time-entries', { employee_id: employeeId, date: '2026-05-02', hours: 8 }, cookie);
  await json(port, 'POST', '/api/time-entries', { employee_id: employeeId, date: '2026-05-03', hours: 2, is_overtime: true }, cookie);
  const calculated = await json(port, 'POST', '/api/payroll/calculate', { year: 2026, month: 5, half: 'first', employee_id: employeeId }, cookie);
  assert.equal(calculated.res.status, 200);
  assert.equal(calculated.body.periods.length, 1);
  assert.equal(calculated.body.periods[0].total, 5800);
  const paid = await json(port, 'POST', `/api/payroll/periods/${calculated.body.periods[0].id}/mark-paid`, { paid: true }, cookie);
  assert.ok(paid.body.period.paid_at);
});

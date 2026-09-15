import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';
import { readCompatRows } from '../src/compat-rows.js';
import { stampCompletedAt } from '../src/routes/compat.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createUser(role = 'admin') {
  const email = `bonuses-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, FALSE) RETURNING id, email`,
    [email, passwordHash, role],
  );
  return rows[0];
}

async function login(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  return res.headers.get('set-cookie').split(';')[0];
}

async function setup(t, role = 'admin') {
  const user = await createUser(role);
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { port, cookie, user };
}

async function requestJson(port, method, path, body, cookie) {
  const headers = { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

// Кладёт legacy-строку в compat_rows. source_id = String(row.id), для settings row.key.
async function putCompatRow(table, row) {
  const sourceId = table === 'settings' ? String(row.key) : String(row.id);
  await getPool().query(
    `INSERT INTO compat_rows (table_name, source_id, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (table_name, source_id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
    [table, sourceId, JSON.stringify(row)],
  );
}

const QUARTER_TARGETS = {
  output_hours: { min: 1330, target: 1512, max: 1693 }, productivity: { min: 0.9, target: 1, max: 1.15 },
  on_time_share: { min: 0.7, target: 0.85, max: 0.95 }, rework_share: { min: 0.08, target: 0.05, max: 0.02 },
};

test('readCompatRows возвращает data строк таблицы', async () => {
  const id = Date.now();
  await putCompatRow('orders', { id, order_name: 'compat-reader', status: 'draft' });
  const rows = await readCompatRows(getPool(), 'orders');
  assert.ok(rows.some((row) => row.id === id && row.order_name === 'compat-reader'));
});

test('stampCompletedAt ставит дату при первом переходе и не перезаписывает', () => {
  const row = { id: 1, status: 'completed' };
  stampCompletedAt(row, { status: 'in_production' }, '2026-09-15T10:00:00.000Z');
  assert.equal(row.completed_at, '2026-09-15T10:00:00.000Z');

  const again = { id: 1, status: 'completed', completed_at: '2026-09-01T00:00:00.000Z' };
  stampCompletedAt(again, row, '2026-09-15T10:00:00.000Z');
  assert.equal(again.completed_at, '2026-09-01T00:00:00.000Z');

  const kept = { id: 1, status: 'completed' };
  stampCompletedAt(kept, { completed_at: '2026-08-20T00:00:00.000Z' }, '2026-09-15T10:00:00.000Z');
  assert.equal(kept.completed_at, '2026-08-20T00:00:00.000Z');

  const draft = { id: 2, status: 'draft' };
  stampCompletedAt(draft, null, '2026-09-15T10:00:00.000Z');
  assert.equal(draft.completed_at, undefined);
});

test('POST /api/compat/order-save проставляет completed_at', async (t) => {
  const { port, cookie } = await setup(t);
  const id = Date.now();
  await requestJson(port, 'POST', '/api/compat/order-save', { order: { id, order_name: 'x', status: 'in_production' }, items: [] }, cookie);
  const res = await requestJson(port, 'POST', '/api/compat/order-save', { order: { id, order_name: 'x', status: 'completed' }, items: [] }, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.match(String(body.data.order.completed_at), /^\d{4}-\d{2}-\d{2}T/);
});

test('роль user получает 403 на /api/bonuses', async (t) => {
  const { port, cookie } = await setup(t, 'user');
  const res = await requestJson(port, 'GET', '/api/bonuses/schemes', undefined, cookie);
  assert.equal(res.status, 403);
});

test('без сессии 401', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/bonuses/schemes`);
  assert.equal(res.status, 401);
});

test('PUT схема, GET схемы, подсказка и сохранение целей', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('settings', { key: 'seasonal_load_plan_json', value: JSON.stringify({ Q1: 864, Q2: 1296, Q3: 1512, Q4: 1728 }) });

  const put = await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 75 }, cookie);
  assert.equal(put.status, 200);
  const scheme = (await put.json()).data;
  assert.equal(scheme.kind, 'production');
  assert.equal(scheme.rates_json.rate, 75);

  const list = await requestJson(port, 'GET', '/api/bonuses/schemes', undefined, cookie);
  const schemes = (await list.json()).data;
  assert.ok(schemes.some((s) => s.id === scheme.id && s.employee_name === 'Лёша'));

  const suggest = await requestJson(port, 'GET', `/api/bonuses/periods/2026-Q3/suggest/${scheme.id}`, undefined, cookie);
  const suggestion = (await suggest.json()).data;
  assert.equal(suggestion.source, 'plan');
  assert.deepEqual(suggestion.targets.output_hours, { min: 1331, target: 1512, max: 1693 });

  const save = await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: suggestion.targets }, cookie);
  assert.equal(save.status, 200);
  assert.equal((await save.json()).data.output_hours.target, 1512);

  const bad = await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q9/targets/${scheme.id}`, { targets: suggestion.targets }, cookie);
  assert.equal(bad.status, 400);
});

test('расчёт периода, склад, закрытие, корректировка, выплата, год', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  const base = employeeId * 10;
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('orders', { id: base + 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1500, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' });
  await putCompatRow('orders', { id: base + 2, order_name: 'Склад', status: 'completed', production_purpose: 'stock_sample', total_hours_plan: 100, completed_at: '2026-09-11T10:00:00.000Z' });
  await putCompatRow('time_entries', { id: base + 1, employee_id: employeeId, date: '2026-09-01', hours: 1500, order_id: base + 1 });

  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 75 }, cookie)).json()).data;
  await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: QUARTER_TARGETS }, cookie);

  let res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  assert.equal(res.status, 200);
  let body = (await res.json()).data;
  let entry = body.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.employeeName, 'Лёша');
  assert.equal(entry.output.fact, 1500);
  assert.equal(entry.orders.find((o) => o.id === base + 2).included, false);
  assert.ok(Array.isArray(body.people.people));

  await requestJson(port, 'POST', '/api/bonuses/periods/2026-Q3/stock-approvals', { order_id: base + 2, approved: true }, cookie);
  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.output.fact, 1600);

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/close/${scheme.id}`, {}, cookie);
  assert.equal(res.status, 200);
  const closed = (await res.json()).data;
  assert.equal(closed.status, 'closed');
  assert.ok(Number(closed.amount_computed) > 0);

  await putCompatRow('orders', { id: base + 3, order_name: 'Поздний', status: 'completed', production_purpose: 'commercial', total_hours_plan: 500, deadline: '2026-09-20', completed_at: '2026-09-12T10:00:00.000Z' });
  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.output.fact, 1600);
  assert.equal(entry.resultStatus, 'closed');

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/adjust/${scheme.id}`, { amount: 90000 }, cookie);
  assert.equal(res.status, 400);
  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/adjust/${scheme.id}`, { amount: 90000, comment: 'Согласовано лично' }, cookie);
  const adjusted = (await res.json()).data;
  assert.equal(Number(adjusted.amount_final), 90000);
  assert.equal(adjusted.adjustments_json[0].comment, 'Согласовано лично');

  res = await requestJson(port, 'POST', `/api/bonuses/periods/2026-Q3/paid/${scheme.id}`, {}, cookie);
  assert.equal((await res.json()).data.status, 'paid');

  res = await requestJson(port, 'GET', '/api/bonuses/years/2026', undefined, cookie);
  const yearEntry = (await res.json()).data.find((e) => e.schemeId === scheme.id);
  assert.equal(yearEntry.year.quartersCounted, 1);
  assert.equal(yearEntry.year.quarters.find((q) => q.period === '2026-Q3').fact, 1600);

  res = await requestJson(port, 'POST', `/api/bonuses/years/2026/close/${scheme.id}`, {}, cookie);
  assert.equal((await res.json()).data.period, '2026-Y');
});

test('закрытие без целей периода → 400', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  await putCompatRow('employees', { id: employeeId, name: 'Тест', role: 'production', is_active: true });
  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 1 }, cookie)).json()).data;
  const res = await requestJson(port, 'POST', `/api/bonuses/periods/2027-Q1/close/${scheme.id}`, {}, cookie);
  assert.equal(res.status, 400);
});

test('план и факт по деньгам отдела влияют на уровень производства', async (t) => {
  const { port, cookie } = await setup(t);
  const employeeId = Date.now();
  const base = employeeId * 10;
  await putCompatRow('employees', { id: employeeId, name: 'Лёша', role: 'production', is_active: true });
  await putCompatRow('orders', { id: base + 1, order_name: 'А', status: 'completed', production_purpose: 'commercial', total_hours_plan: 1550, deadline: '2026-09-20', completed_at: '2026-09-10T10:00:00.000Z' });
  await putCompatRow('time_entries', { id: base + 1, employee_id: employeeId, date: '2026-09-01', hours: 1550, order_id: base + 1 });
  const scheme = (await (await requestJson(port, 'PUT', `/api/bonuses/schemes/${employeeId}`, { kind: 'production', rate: 75 }, cookie)).json()).data;
  await requestJson(port, 'PUT', `/api/bonuses/periods/2026-Q3/targets/${scheme.id}`, { targets: QUARTER_TARGETS }, cookie);

  let res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  let entry = (await res.json()).data.entries.find((e) => e.schemeId === scheme.id);
  assert.ok(entry.warnings.some((w) => w.code === 'no_money_plan'));

  res = await requestJson(port, 'PUT', '/api/bonuses/periods/2026-Q3/team/commercial', {
    targets: { cash_in: { min: 14000000, target: 15500000, max: 17000000 } },
    facts: { cash_in: { value: 17000000, note: 'Финтабло, Recycle Object, 15.09' } },
  }, cookie);
  assert.equal(res.status, 200);
  const team = (await res.json()).data;
  assert.equal(team.facts.cash_in.value, 17000000);
  assert.equal(team.facts.cash_in.source, 'manual');

  res = await requestJson(port, 'GET', '/api/bonuses/periods/2026-Q3', undefined, cookie);
  const body = (await res.json()).data;
  entry = body.entries.find((e) => e.schemeId === scheme.id);
  assert.equal(entry.money.achievement, 1.5);
  assert.ok(entry.level > entry.output.achievement);
  assert.equal(body.team.commercial.cashAchievement, 1.5);

  res = await requestJson(port, 'PUT', '/api/bonuses/periods/2026-Q3/team/commercial', { facts: { cash_in: { value: -5 } } }, cookie);
  assert.equal(res.status, 400);
});

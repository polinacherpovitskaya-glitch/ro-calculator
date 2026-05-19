import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createUser() {
  const email = `production-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, 'admin', FALSE)
     RETURNING id, email`,
    [email, passwordHash]
  );
  return rows[0];
}

async function createEmployee() {
  const id = Number(`17${Math.floor(Math.random() * 10000000000)}`);
  await getPool().query(`INSERT INTO employees (id, name, role, is_active) VALUES ($1, $2, 'production', TRUE)`, [
    id,
    `Operator ${id}`,
  ]);
  return id;
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
  return { port, cookie };
}

async function requestJson(port, method, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

test('PUT and GET /api/production/calendar upserts days', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(
    port,
    'PUT',
    '/api/production/calendar',
    { days: [{ date: '2026-05-20', is_working: true, hours: 6, note: 'short shift' }] },
    cookie
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(Number(body.days[0].hours), 6);

  const list = await fetch(`http://127.0.0.1:${port}/api/production/calendar?year=2026`, { headers: { cookie } });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.ok(listBody.days.some((day) => day.date.startsWith('2026-05-20')));
});

test('PUT /api/production/calendar validates date', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(port, 'PUT', '/api/production/calendar', { days: [{ date: '20.05.2026' }] }, cookie);
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_INPUT');
});

test('POST and GET /api/production/plan creates entries with operator', async (t) => {
  const { port, cookie } = await setup(t);
  const operatorId = await createEmployee();
  const res = await requestJson(
    port,
    'POST',
    '/api/production/plan',
    { date: '2026-05-21', item_name: 'Batch A', qty: 30, hours_planned: 4, operator_id: operatorId },
    cookie
  );
  const body = await res.json();
  assert.equal(res.status, 201);
  assert.equal(Number(body.entry.operator_id), operatorId);

  const list = await fetch(`http://127.0.0.1:${port}/api/production/plan?date=2026-05-21`, { headers: { cookie } });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.ok(listBody.entries.some((entry) => Number(entry.id) === Number(body.entry.id)));
});

test('POST /api/production/plan rejects missing operator', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(
    port,
    'POST',
    '/api/production/plan',
    { date: '2026-05-22', item_name: 'Bad operator', operator_id: 999999999 },
    cookie
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_OPERATOR');
});

test('PATCH /api/production/plan/:id updates status and quantities', async (t) => {
  const { port, cookie } = await setup(t);
  const created = await requestJson(port, 'POST', '/api/production/plan', { date: '2026-05-23', item_name: 'Patch me' }, cookie);
  const entry = (await created.json()).entry;

  const res = await requestJson(port, 'PATCH', `/api/production/plan/${entry.id}`, { status: 'done', qty: 12 }, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.entry.status, 'done');
  assert.equal(Number(body.entry.qty), 12);
});

test('POST /api/production/plan/reorder atomically updates position', async (t) => {
  const { port, cookie } = await setup(t);
  const first = await requestJson(port, 'POST', '/api/production/plan', { date: '2026-05-24', item_name: 'First' }, cookie);
  const second = await requestJson(port, 'POST', '/api/production/plan', { date: '2026-05-24', item_name: 'Second' }, cookie);
  await first.json();
  const secondEntry = (await second.json()).entry;

  const res = await requestJson(
    port,
    'POST',
    '/api/production/plan/reorder',
    { entry_id: secondEntry.id, new_position: 50 },
    cookie
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.entry.position, 50);
});

test('DELETE /api/production/plan/:id removes an entry', async (t) => {
  const { port, cookie } = await setup(t);
  const created = await requestJson(port, 'POST', '/api/production/plan', { date: '2026-05-25', item_name: 'Delete me' }, cookie);
  const entry = (await created.json()).entry;

  const res = await requestJson(port, 'DELETE', `/api/production/plan/${entry.id}`, undefined, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

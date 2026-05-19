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
  const email = `indirect-${crypto.randomUUID()}@x.test`;
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
  return { port, cookie };
}

async function requestJson(port, method, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

test('GET /api/indirect-costs requires auth', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/indirect-costs`);
  assert.equal(res.status, 401);
});

test('POST and GET /api/indirect-costs creates period costs', async (t) => {
  const { port, cookie } = await setup(t);
  const category = `rent-${crypto.randomUUID()}`;
  const create = await requestJson(
    port,
    'POST',
    '/api/indirect-costs',
    { period_year: 2026, period_month: 5, category, amount: 120000, note: 'May rent' },
    cookie
  );
  assert.equal(create.status, 201);

  const list = await fetch(`http://127.0.0.1:${port}/api/indirect-costs?year=2026&month=5`, { headers: { cookie } });
  const body = await list.json();
  assert.equal(list.status, 200);
  assert.ok(body.indirect_costs.some((cost) => cost.category === category));
});

test('POST /api/indirect-costs rejects invalid period', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(
    port,
    'POST',
    '/api/indirect-costs',
    { period_year: 2026, period_month: 13, category: 'bad', amount: 1 },
    cookie
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_PERIOD');
});

test('PATCH /api/indirect-costs/:id updates amount', async (t) => {
  const { port, cookie } = await setup(t);
  const category = `marketing-${crypto.randomUUID()}`;
  const created = await requestJson(
    port,
    'POST',
    '/api/indirect-costs',
    { period_year: 2026, period_month: 6, category, amount: 1000 },
    cookie
  );
  const cost = (await created.json()).indirect_cost;

  const res = await requestJson(port, 'PATCH', `/api/indirect-costs/${cost.id}`, { amount: 2500 }, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(Number(body.indirect_cost.amount), 2500);
});

test('DELETE /api/indirect-costs/:id removes a cost row', async (t) => {
  const { port, cookie } = await setup(t);
  const category = `delete-${crypto.randomUUID()}`;
  const created = await requestJson(
    port,
    'POST',
    '/api/indirect-costs',
    { period_year: 2026, period_month: 7, category, amount: 1 },
    cookie
  );
  const cost = (await created.json()).indirect_cost;

  const res = await requestJson(port, 'DELETE', `/api/indirect-costs/${cost.id}`, undefined, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

test('POST /api/indirect-costs without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(
    port,
    'POST',
    '/api/indirect-costs',
    { period_year: 2026, period_month: 8, category: 'no-key', amount: 1 },
    cookie,
    ''
  );
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

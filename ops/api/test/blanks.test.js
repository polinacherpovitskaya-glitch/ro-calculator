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
  const email = `blanks-${crypto.randomUUID()}@x.test`;
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

function id(prefix = 7) {
  return Number(`${prefix}${Math.floor(Math.random() * 100000000000)}`);
}

async function setup(t) {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { user, port, cookie };
}

async function requestJson(port, method, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

test('POST /api/blanks/hardware without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/blanks/hardware', { id: id(), name: 'No key' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/blanks/hardware creates and lists hardware blanks', async (t) => {
  const { port, cookie } = await setup(t);
  const blankId = id();

  const create = await requestJson(
    port,
    'POST',
    '/api/blanks/hardware',
    { id: blankId, sku: `HW-${blankId}`, name: 'Ring blank', category: 'rings', weight: 2.4, last_price: 8.5, last_currency: 'CNY' },
    cookie
  );
  const created = await create.json();
  const list = await fetch(`http://127.0.0.1:${port}/api/blanks/hardware?search=ring`, { headers: { cookie } });
  const listed = await list.json();

  assert.equal(create.status, 201);
  assert.equal(created.blank.name, 'Ring blank');
  assert.equal(created.blank.weight, 2.4);
  assert.equal(created.blank.last_price, 8.5);
  assert.equal(list.status, 200);
  assert.ok(listed.blanks.some((entry) => Number(entry.id) === blankId));
});

test('PATCH /api/blanks/hardware/:id updates price fields', async (t) => {
  const { port, cookie } = await setup(t);
  const blankId = id();
  await requestJson(port, 'POST', '/api/blanks/hardware', { id: blankId, name: 'Latch blank', last_price: 3 }, cookie);

  const res = await requestJson(
    port,
    'PATCH',
    `/api/blanks/hardware/${blankId}`,
    { last_price: 4.25, last_currency: 'USD' },
    cookie
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.blank.last_price, 4.25);
  assert.equal(body.blank.last_currency, 'USD');
});

test('DELETE /api/blanks/hardware/:id removes hardware blank', async (t) => {
  const { port, cookie } = await setup(t);
  const blankId = id();
  await requestJson(port, 'POST', '/api/blanks/hardware', { id: blankId, name: 'Delete me' }, cookie);

  const del = await requestJson(port, 'DELETE', `/api/blanks/hardware/${blankId}`, undefined, cookie);
  const list = await fetch(`http://127.0.0.1:${port}/api/blanks/hardware`, { headers: { cookie } });
  const body = await list.json();

  assert.equal(del.status, 200);
  assert.ok(!body.blanks.some((entry) => Number(entry.id) === blankId));
});

test('POST and GET /api/blanks/packaging creates and lists packaging blanks', async (t) => {
  const { port, cookie } = await setup(t);
  const blankId = id(8);

  const create = await requestJson(
    port,
    'POST',
    '/api/blanks/packaging',
    { id: blankId, sku: `PKG-${blankId}`, name: 'Gift box', category: 'boxes', last_price: 1.2, last_currency: 'USD' },
    cookie
  );
  const created = await create.json();
  const list = await fetch(`http://127.0.0.1:${port}/api/blanks/packaging?category=boxes`, { headers: { cookie } });
  const listed = await list.json();

  assert.equal(create.status, 201);
  assert.equal(created.blank.name, 'Gift box');
  assert.equal(created.blank.last_price, 1.2);
  assert.ok(listed.blanks.some((entry) => Number(entry.id) === blankId));
});

test('GET /api/blanks/:kind rejects unknown blank kind', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await fetch(`http://127.0.0.1:${port}/api/blanks/unknown`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 404);
  assert.equal(body.error.code, 'UNKNOWN_BLANK_KIND');
});

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
  const email = `colors-${crypto.randomUUID()}@x.test`;
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

function id(prefix = 9) {
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

test('POST /api/colors without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/colors', { id: id(), name: 'No key' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/colors creates and lists colors', async (t) => {
  const { port, cookie } = await setup(t);
  const colorId = id();

  const create = await requestJson(
    port,
    'POST',
    '/api/colors',
    { id: colorId, name: 'Forest green', hex: '#228B22', category: 'green' },
    cookie
  );
  const created = await create.json();
  const list = await fetch(`http://127.0.0.1:${port}/api/colors?search=forest`, { headers: { cookie } });
  const listed = await list.json();

  assert.equal(create.status, 201);
  assert.equal(created.color.name, 'Forest green');
  assert.equal(created.color.hex, '#228B22');
  assert.ok(listed.colors.some((entry) => Number(entry.id) === colorId));
});

test('GET /api/colors filters by category', async (t) => {
  const { port, cookie } = await setup(t);
  const colorId = id();
  await requestJson(port, 'POST', '/api/colors', { id: colorId, name: 'Ruby', hex: '#E0115F', category: 'red' }, cookie);

  const res = await fetch(`http://127.0.0.1:${port}/api/colors?category=red`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.colors.some((entry) => Number(entry.id) === colorId));
});

test('PATCH /api/colors/:id updates color fields', async (t) => {
  const { port, cookie } = await setup(t);
  const colorId = id();
  await requestJson(port, 'POST', '/api/colors', { id: colorId, name: 'Blue', hex: '#0000FF' }, cookie);

  const res = await requestJson(port, 'PATCH', `/api/colors/${colorId}`, { name: 'Cobalt', category: 'blue' }, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.color.name, 'Cobalt');
  assert.equal(body.color.category, 'blue');
});

test('POST /api/colors rejects invalid hex values', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/colors', { id: id(), name: 'Bad color', hex: 'green-ish' }, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_HEX');
});

test('DELETE /api/colors/:id removes color', async (t) => {
  const { port, cookie } = await setup(t);
  const colorId = id();
  await requestJson(port, 'POST', '/api/colors', { id: colorId, name: 'Delete me', hex: '#111111' }, cookie);

  const del = await requestJson(port, 'DELETE', `/api/colors/${colorId}`, undefined, cookie);
  const list = await fetch(`http://127.0.0.1:${port}/api/colors`, { headers: { cookie } });
  const body = await list.json();

  assert.equal(del.status, 200);
  assert.ok(!body.colors.some((entry) => Number(entry.id) === colorId));
});

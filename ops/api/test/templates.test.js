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
  const email = `templates-${crypto.randomUUID()}@x.test`;
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

function id() {
  return Number(`8${Math.floor(Math.random() * 100000000000)}`);
}

async function requestJson(port, method, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

test('GET /api/templates requires auth', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/templates`);
  assert.equal(res.status, 401);
});

test('POST /api/templates without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(port, 'POST', '/api/templates', { id: id(), name: 'No key' }, cookie, '');
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/templates creates and filters templates', async (t) => {
  const { port, cookie } = await setup(t);
  const templateId = id();
  const create = await requestJson(
    port,
    'POST',
    '/api/templates',
    { id: templateId, name: 'Triangle blank', category: 'blank', data: { weight_grams: 12 } },
    cookie
  );
  assert.equal(create.status, 201);

  const res = await fetch(`http://127.0.0.1:${port}/api/templates?category=blank&search=triangle`, { headers: { cookie } });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(body.templates.some((template) => Number(template.id) === templateId));
});

test('POST /api/templates rejects non-object data', async (t) => {
  const { port, cookie } = await setup(t);
  const res = await requestJson(port, 'POST', '/api/templates', { id: id(), name: 'Bad', data: [] }, cookie);
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_DATA');
});

test('PATCH /api/templates/:id updates active flag and data', async (t) => {
  const { port, cookie } = await setup(t);
  const templateId = id();
  await requestJson(port, 'POST', '/api/templates', { id: templateId, name: 'Editable', data: { a: 1 } }, cookie);

  const res = await requestJson(port, 'PATCH', `/api/templates/${templateId}`, { is_active: false, data: { a: 2 } }, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.template.is_active, false);
  assert.equal(body.template.data.a, 2);
});

test('DELETE /api/templates/:id removes a template', async (t) => {
  const { port, cookie } = await setup(t);
  const templateId = id();
  await requestJson(port, 'POST', '/api/templates', { id: templateId, name: 'Delete me' }, cookie);

  const res = await requestJson(port, 'DELETE', `/api/templates/${templateId}`, undefined, cookie);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

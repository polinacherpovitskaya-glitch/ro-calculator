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

async function createUser(role = 'admin') {
  const email = `settings-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, FALSE)
     RETURNING id, email`,
    [email, passwordHash, role]
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

async function setup(t, role = 'admin') {
  const user = await createUser(role);
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { port, cookie, user };
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

test('settings routes require auth', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/settings/companyInfo`);
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error.code, 'NO_SESSION');
});

test('admin can upsert, read, and list settings', async (t) => {
  const { port, cookie, user } = await setup(t, 'admin');
  const key = `app_config.${crypto.randomUUID()}`;
  const saved = await json(port, 'PUT', `/api/settings/${key}`, { value: { theme: 'ops', nested: { ok: true } } }, cookie);
  assert.equal(saved.res.status, 200);
  assert.deepEqual(saved.body.setting.value, { theme: 'ops', nested: { ok: true } });
  assert.equal(saved.body.setting.updated_by, user.id);

  const read = await fetch(`http://127.0.0.1:${port}/api/settings/${key}`, { headers: { cookie } });
  const readBody = await read.json();
  assert.equal(read.status, 200);
  assert.equal(readBody.setting.key, key);

  const list = await fetch(`http://127.0.0.1:${port}/api/settings`, { headers: { cookie } });
  const listBody = await list.json();
  assert.equal(list.status, 200);
  assert.ok(listBody.settings.some((row) => row.key === key));
});

test('PUT /api/settings/:key requires admin and idempotency key', async (t) => {
  const admin = await setup(t, 'admin');
  const missingKey = await json(admin.port, 'PUT', '/api/settings/app_config.test', { value: true }, admin.cookie, '');
  assert.equal(missingKey.res.status, 400);
  assert.equal(missingKey.body.error.code, 'NO_IDEMPOTENCY_KEY');

  const user = await setup(t, 'user');
  const forbidden = await json(user.port, 'PUT', '/api/settings/app_config.test', { value: true }, user.cookie);
  assert.equal(forbidden.res.status, 403);
});

test('settings validate key and body value', async (t) => {
  const { port, cookie } = await setup(t, 'admin');
  const invalidKey = await json(port, 'PUT', '/api/settings/bad key', { value: true }, cookie);
  assert.equal(invalidKey.res.status, 400);
  assert.equal(invalidKey.body.error.code, 'INVALID_KEY');

  const missingValue = await json(port, 'PUT', '/api/settings/app_config.missing', {}, cookie);
  assert.equal(missingValue.res.status, 400);
  assert.equal(missingValue.body.error.code, 'INVALID_INPUT');
});

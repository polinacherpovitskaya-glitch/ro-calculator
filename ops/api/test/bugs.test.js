import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;
process.env.S3_MOCK_DIR = process.env.S3_MOCK_DIR || path.join(os.tmpdir(), 'ro-ops-s3-test');

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createUser(role = 'admin') {
  const email = `bugs-${crypto.randomUUID()}@x.test`;
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

function id(prefix = 3) {
  return Number(`${prefix}${Math.floor(Math.random() * 100000000000)}`);
}

async function setup(t, role = 'admin') {
  const user = await createUser(role);
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { user, port, cookie };
}

async function requestJson(port, method, route, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${route}`, options);
}

async function createBug(port, cookie, overrides = {}) {
  const bugId = overrides.id || id();
  const res = await requestJson(
    port,
    'POST',
    '/api/bugs',
    { id: bugId, title: `Bug ${bugId}`, description: 'Details', severity: 'high', page: 'warehouse', ...overrides },
    cookie
  );
  assert.equal(res.status, 201);
  return (await res.json()).bug;
}

test('GET /api/bugs without cookie returns 401', async (t) => {
  const port = await startServer(t);

  const res = await fetch(`http://127.0.0.1:${port}/api/bugs`);
  const body = await res.json();

  assert.equal(res.status, 401);
  assert.equal(body.error.code, 'NO_SESSION');
});

test('POST /api/bugs without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/bugs', { id: id(), title: 'No key' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/bugs creates and lists bug reports', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);

  const res = await fetch(`http://127.0.0.1:${port}/api/bugs?status=open&severity=high&page=warehouse`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.bugs.some((entry) => Number(entry.id) === Number(bug.id)));
});

test('GET /api/bugs/:id returns bug with attachments array', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);

  const res = await fetch(`http://127.0.0.1:${port}/api/bugs/${bug.id}`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(Number(body.bug.id), Number(bug.id));
  assert.deepEqual(body.bug.attachments, []);
});

test('PATCH /api/bugs/:id updates status and fixed_at', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);

  const res = await requestJson(port, 'PATCH', `/api/bugs/${bug.id}`, { status: 'fixed', severity: 'medium' }, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.bug.status, 'fixed');
  assert.equal(body.bug.severity, 'medium');
  assert.ok(body.bug.fixed_at);
});

test('PATCH /api/bugs/:id rejects invalid status', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);

  const res = await requestJson(port, 'PATCH', `/api/bugs/${bug.id}`, { status: 'wat' }, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_STATUS');
});

test('POST /api/bugs/:id/attachments uploads file and returns presigned URL on get', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);
  const form = new FormData();
  form.set('file', new Blob(['hello bug'], { type: 'text/plain' }), 'hello.txt');

  const upload = await fetch(`http://127.0.0.1:${port}/api/bugs/${bug.id}/attachments`, {
    method: 'POST',
    headers: { cookie, 'Idempotency-Key': crypto.randomUUID() },
    body: form,
  });
  const uploaded = await upload.json();
  const get = await fetch(`http://127.0.0.1:${port}/api/bugs/${bug.id}`, { headers: { cookie } });
  const body = await get.json();

  assert.equal(upload.status, 201);
  assert.equal(uploaded.attachment.filename, 'hello.txt');
  assert.ok(body.bug.attachments[0].url.startsWith('mock-s3://bug-attachments/'));
});

test('DELETE /api/bugs/:id/attachments/:attId removes attachment metadata', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);
  const form = new FormData();
  form.set('file', new Blob(['bye'], { type: 'text/plain' }), 'bye.txt');
  const upload = await fetch(`http://127.0.0.1:${port}/api/bugs/${bug.id}/attachments`, {
    method: 'POST',
    headers: { cookie, 'Idempotency-Key': crypto.randomUUID() },
    body: form,
  });
  const uploaded = await upload.json();

  const res = await requestJson(port, 'DELETE', `/api/bugs/${bug.id}/attachments/${uploaded.attachment.id}`, undefined, cookie);
  const { rows } = await getPool().query(`SELECT COUNT(*)::int AS n FROM bug_attachments WHERE id = $1`, [uploaded.attachment.id]);

  assert.equal(res.status, 200);
  assert.equal(rows[0].n, 0);
});

test('DELETE /api/bugs/:id requires admin role', async (t) => {
  const admin = await setup(t, 'admin');
  const bug = await createBug(admin.port, admin.cookie);
  const regular = await createUser('user');
  const regularCookie = await login(admin.port, regular.email);

  const res = await requestJson(admin.port, 'DELETE', `/api/bugs/${bug.id}`, undefined, regularCookie);
  const body = await res.json();

  assert.equal(res.status, 403);
  assert.equal(body.error.code, 'FORBIDDEN');
});

test('DELETE /api/bugs/:id removes bug and attachments for admin', async (t) => {
  const { port, cookie } = await setup(t);
  const bug = await createBug(port, cookie);

  const res = await requestJson(port, 'DELETE', `/api/bugs/${bug.id}`, undefined, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

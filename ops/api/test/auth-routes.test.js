import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword, verifyPassword } from '../src/auth/argon.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

function getSessionCookie(res) {
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createUser({ email, password = 'testpass1234', role = 'user', mustChangePassword = true }) {
  const pool = getPool();
  const passwordHash = await hashPassword(password);
  const res = await pool.query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [email, passwordHash, role, mustChangePassword]
  );
  return res.rows[0].id;
}

test('POST /api/auth/login with valid credentials sets session cookie and returns user', async (t) => {
  const email = `login-${crypto.randomUUID()}@x.test`;
  await createUser({ email, role: 'admin', mustChangePassword: false });
  const port = await startServer(t);

  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });

  assert.equal(res.status, 200);
  assert.match(res.headers.get('set-cookie'), /session_id=/);
  const body = await res.json();
  assert.equal(body.user.email, email);
  assert.equal(body.user.role, 'admin');
  assert.equal(body.user.mustChangePassword, false);
});

test('POST /api/auth/login with wrong password returns 401', async (t) => {
  const email = `wrong-${crypto.randomUUID()}@x.test`;
  await createUser({ email });
  const port = await startServer(t);

  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'wrong-password' }),
  });

  assert.equal(res.status, 401);
});

test('GET /api/auth/me without cookie returns 401', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`);
  assert.equal(res.status, 401);
});

test('GET /api/auth/me with cookie returns user', async (t) => {
  const email = `me-${crypto.randomUUID()}@x.test`;
  await createUser({ email });
  const port = await startServer(t);

  const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = getSessionCookie(loginRes);
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { cookie },
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.user.email, email);
});

test('POST /api/auth/logout revokes the current session', async (t) => {
  const email = `logout-${crypto.randomUUID()}@x.test`;
  await createUser({ email });
  const port = await startServer(t);

  const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = getSessionCookie(loginRes);

  const logoutRes = await fetch(`http://127.0.0.1:${port}/api/auth/logout`, {
    method: 'POST',
    headers: { cookie },
  });
  assert.equal(logoutRes.status, 204);

  const meRes = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: { cookie },
  });
  assert.equal(meRes.status, 401);
});

test('POST /api/auth/change-password updates hash and clears must_change_password', async (t) => {
  const email = `change-${crypto.randomUUID()}@x.test`;
  const userId = await createUser({ email, mustChangePassword: true });
  const port = await startServer(t);

  const loginRes = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = getSessionCookie(loginRes);

  const changeRes = await fetch(`http://127.0.0.1:${port}/api/auth/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ old_password: 'testpass1234', new_password: 'newpass12345' }),
  });
  assert.equal(changeRes.status, 200);

  const pool = getPool();
  const userRes = await pool.query(
    `SELECT password_hash, must_change_password FROM auth_users WHERE id = $1`,
    [userId]
  );
  assert.equal(userRes.rows[0].must_change_password, false);
  assert.equal(await verifyPassword('newpass12345', userRes.rows[0].password_hash), true);
});

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

function id() {
  return Number(`12${Math.floor(Math.random() * 1000000000)}`);
}

async function createEmployee(overrides = {}) {
  const employeeId = overrides.id || id();
  const { rows } = await getPool().query(
    `INSERT INTO employees (id, name, email, role, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      employeeId,
      overrides.name || `Bot Employee ${employeeId}`,
      overrides.email || `bot-employee-${crypto.randomUUID()}@x.test`,
      overrides.role || 'ops',
      overrides.is_active ?? true,
    ]
  );
  return rows[0];
}

async function createUser(role = 'admin') {
  const employee = await createEmployee();
  const email = `bot-admin-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  await getPool().query(
    `INSERT INTO auth_users (email, password_hash, employee_id, role, must_change_password)
     VALUES ($1, $2, $3, $4, FALSE)`,
    [email, passwordHash, employee.id, role]
  );
  return { email, employee };
}

async function login(port, email) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  assert.equal(res.status, 200);
  return res.headers.get('set-cookie').split(';')[0];
}

async function postBinding(port, cookie, body, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  return fetch(`http://127.0.0.1:${port}/api/bot/bindings`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('bot binding routes require admin auth', async (t) => {
  const port = await startServer(t);
  const noAuth = await fetch(`http://127.0.0.1:${port}/api/bot/bindings`);
  assert.equal(noAuth.status, 401);

  const user = await createUser('user');
  const cookie = await login(port, user.email);
  const forbidden = await fetch(`http://127.0.0.1:${port}/api/bot/bindings`, { headers: { cookie } });
  assert.equal(forbidden.status, 403);
});

test('admin can create, list, update, and deactivate telegram bindings', async (t) => {
  const port = await startServer(t);
  const user = await createUser('admin');
  const employee = await createEmployee();
  const cookie = await login(port, user.email);

  const created = await postBinding(port, cookie, {
    telegram_chat_id: '700000001',
    telegram_username: 'first_user',
    employee_id: employee.id,
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.binding.telegram_chat_id, '700000001');
  assert.equal(Number(createdBody.binding.employee_id), Number(employee.id));

  const list = await fetch(`http://127.0.0.1:${port}/api/bot/bindings`, { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.ok((await list.json()).bindings.some((binding) => binding.telegram_chat_id === '700000001'));

  const updated = await postBinding(port, cookie, {
    telegram_chat_id: '700000001',
    telegram_username: 'renamed_user',
    employee_id: employee.id,
  });
  assert.equal(updated.status, 201);
  assert.equal((await updated.json()).binding.telegram_username, 'renamed_user');

  const deleted = await fetch(`http://127.0.0.1:${port}/api/bot/bindings/700000001`, {
    method: 'DELETE',
    headers: { cookie, 'Idempotency-Key': crypto.randomUUID() },
  });
  assert.equal(deleted.status, 200);
  assert.equal((await deleted.json()).binding.is_active, false);
});

test('bot binding mutations require idempotency keys', async (t) => {
  const port = await startServer(t);
  const user = await createUser('admin');
  const employee = await createEmployee();
  const cookie = await login(port, user.email);

  const noKeyPost = await postBinding(port, cookie, { telegram_chat_id: '700000030', employee_id: employee.id }, '');
  assert.equal(noKeyPost.status, 400);
  assert.equal((await noKeyPost.json()).error.code, 'NO_IDEMPOTENCY_KEY');

  const created = await postBinding(port, cookie, { telegram_chat_id: '700000030', employee_id: employee.id });
  assert.equal(created.status, 201);

  const noKeyDelete = await fetch(`http://127.0.0.1:${port}/api/bot/bindings/700000030`, {
    method: 'DELETE',
    headers: { cookie },
  });
  assert.equal(noKeyDelete.status, 400);
  assert.equal((await noKeyDelete.json()).error.code, 'NO_IDEMPOTENCY_KEY');
});

test('notification event processing requires idempotency and caches repeated calls', async (t) => {
  const port = await startServer(t);
  const user = await createUser('admin');
  const cookie = await login(port, user.email);
  const eventId = id();
  await getPool().query(
    `INSERT INTO task_notification_events (id, event_type, task_id, payload)
     VALUES ($1, 'task_assigned', NULL, '{}'::jsonb)`,
    [eventId]
  );

  const noKey = await fetch(`http://127.0.0.1:${port}/api/bot/notification-events/${eventId}/processed`, {
    method: 'PATCH',
    headers: { cookie },
  });
  assert.equal(noKey.status, 400);

  const key = crypto.randomUUID();
  const first = await fetch(`http://127.0.0.1:${port}/api/bot/notification-events/${eventId}/processed`, {
    method: 'PATCH',
    headers: { cookie, 'Idempotency-Key': key },
  });
  const second = await fetch(`http://127.0.0.1:${port}/api/bot/notification-events/${eventId}/processed`, {
    method: 'PATCH',
    headers: { cookie, 'Idempotency-Key': key },
  });

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(await second.json(), await first.json());
});

test('creating a new active binding for employee deactivates the old chat', async (t) => {
  const port = await startServer(t);
  const user = await createUser('admin');
  const employee = await createEmployee();
  const cookie = await login(port, user.email);

  assert.equal((await postBinding(port, cookie, { telegram_chat_id: '700000010', employee_id: employee.id })).status, 201);
  assert.equal((await postBinding(port, cookie, { telegram_chat_id: '700000011', employee_id: employee.id })).status, 201);

  const { rows } = await getPool().query(
    `SELECT telegram_chat_id, is_active FROM bot_telegram_bindings WHERE employee_id = $1 ORDER BY telegram_chat_id`,
    [employee.id]
  );
  assert.deepEqual(
    rows.map((row) => [row.telegram_chat_id, row.is_active]),
    [
      ['700000010', false],
      ['700000011', true],
    ]
  );
});

test('bot bindings validate chat id and employee state', async (t) => {
  const port = await startServer(t);
  const user = await createUser('admin');
  const inactive = await createEmployee({ is_active: false });
  const cookie = await login(port, user.email);

  const badChat = await postBinding(port, cookie, { telegram_chat_id: 'abc', employee_id: user.employee.id });
  assert.equal(badChat.status, 400);

  const inactiveEmployee = await postBinding(port, cookie, { telegram_chat_id: '700000020', employee_id: inactive.id });
  assert.equal(inactiveEmployee.status, 404);
});

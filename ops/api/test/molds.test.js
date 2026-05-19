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
  const email = `molds-${crypto.randomUUID()}@x.test`;
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

function id(prefix = 5) {
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

async function createMold(port, cookie, overrides = {}) {
  const moldId = overrides.id || id(5);
  const res = await requestJson(
    port,
    'POST',
    '/api/molds',
    { id: moldId, name: `Mold ${moldId}`, type: 'silicone', capacity: 4, usage_limit: 100, ...overrides },
    cookie
  );
  assert.equal(res.status, 201);
  return (await res.json()).mold;
}

async function createWarehouseItem(qty = 10) {
  const itemId = id(6);
  await getPool().query(`INSERT INTO warehouse_items (id, name, qty) VALUES ($1, $2, $3)`, [
    itemId,
    `Mold hardware ${itemId}`,
    qty,
  ]);
  return itemId;
}

test('POST /api/molds without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/molds', { id: id(5), name: 'No key' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/molds creates and lists molds', async (t) => {
  const { port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);

  const res = await fetch(`http://127.0.0.1:${port}/api/molds`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.molds.some((entry) => Number(entry.id) === Number(mold.id)));
});

test('PATCH /api/molds/:id updates mold fields', async (t) => {
  const { port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);

  const res = await requestJson(port, 'PATCH', `/api/molds/${mold.id}`, { status: 'retired', usage_limit: 120 }, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.mold.status, 'retired');
  assert.equal(body.mold.usage_limit, 120);
});

test('PUT /api/molds/:id/hardware validates warehouse items exist', async (t) => {
  const { port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);

  const res = await requestJson(port, 'PUT', `/api/molds/${mold.id}/hardware`, { items: [{ warehouse_item_id: id(6), qty_per_use: 1 }] }, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_WAREHOUSE_ITEM');
});

test('PUT and GET /api/molds/:id/hardware replaces hardware links', async (t) => {
  const { port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);
  const itemId = await createWarehouseItem();

  const put = await requestJson(port, 'PUT', `/api/molds/${mold.id}/hardware`, { items: [{ warehouse_item_id: itemId, qty_per_use: 2 }] }, cookie);
  const res = await fetch(`http://127.0.0.1:${port}/api/molds/${mold.id}/hardware`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(put.status, 200);
  assert.equal(res.status, 200);
  assert.equal(body.hardware.length, 1);
  assert.equal(Number(body.hardware[0].warehouse_item_id), itemId);
  assert.equal(Number(body.hardware[0].qty_per_use), 2);
});

test('POST /api/molds/:id/use consumes hardware, writes history, and logs usage', async (t) => {
  const { user, port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);
  const itemId = await createWarehouseItem(10);
  await requestJson(port, 'PUT', `/api/molds/${mold.id}/hardware`, { items: [{ warehouse_item_id: itemId, qty_per_use: 2 }] }, cookie);

  const res = await requestJson(port, 'POST', `/api/molds/${mold.id}/use`, { units: 3, operator_name: 'Katya', note: 'batch' }, cookie);
  const body = await res.json();
  const { rows } = await getPool().query(
    `SELECT i.qty, m.usage_count, h.type, h.qty_change, h.mold_id, h.actor_user_id, l.units
       FROM warehouse_items i
       JOIN molds m ON m.id = $1
       JOIN warehouse_history h ON h.item_id = i.id AND h.mold_id = m.id
       JOIN mold_usage_log l ON l.mold_id = m.id
      WHERE i.id = $2`,
    [mold.id, itemId]
  );

  assert.equal(res.status, 200);
  assert.equal(body.mold.usage_count, 3);
  assert.equal(Number(rows[0].qty), 4);
  assert.equal(Number(rows[0].usage_count), 3);
  assert.equal(rows[0].type, 'consume');
  assert.equal(Number(rows[0].qty_change), -6);
  assert.equal(Number(rows[0].mold_id), Number(mold.id));
  assert.equal(rows[0].actor_user_id, user.id);
  assert.equal(rows[0].units, 3);
});

test('POST /api/molds/:id/use with same Idempotency-Key does not consume twice', async (t) => {
  const { port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);
  const itemId = await createWarehouseItem(10);
  await requestJson(port, 'PUT', `/api/molds/${mold.id}/hardware`, { items: [{ warehouse_item_id: itemId, qty_per_use: 2 }] }, cookie);
  const key = crypto.randomUUID();

  const first = await requestJson(port, 'POST', `/api/molds/${mold.id}/use`, { units: 2 }, cookie, key);
  const second = await requestJson(port, 'POST', `/api/molds/${mold.id}/use`, { units: 2 }, cookie, key);
  const { rows } = await getPool().query(
    `SELECT i.qty, m.usage_count, COUNT(h.id)::int AS consume_count
       FROM warehouse_items i
       JOIN molds m ON m.id = $1
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'consume'
      WHERE i.id = $2
      GROUP BY i.qty, m.usage_count`,
    [mold.id, itemId]
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(Number(rows[0].qty), 6);
  assert.equal(Number(rows[0].usage_count), 2);
  assert.equal(rows[0].consume_count, 1);
});

test('POST /api/molds/:id/use returns INSUFFICIENT_STOCK atomically', async (t) => {
  const { port, cookie } = await setup(t);
  const mold = await createMold(port, cookie);
  const itemId = await createWarehouseItem(3);
  await requestJson(port, 'PUT', `/api/molds/${mold.id}/hardware`, { items: [{ warehouse_item_id: itemId, qty_per_use: 2 }] }, cookie);

  const res = await requestJson(port, 'POST', `/api/molds/${mold.id}/use`, { units: 2 }, cookie);
  const body = await res.json();
  const { rows } = await getPool().query(
    `SELECT i.qty, m.usage_count, COUNT(h.id)::int AS history_count
       FROM warehouse_items i
       JOIN molds m ON m.id = $1
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'consume'
      WHERE i.id = $2
      GROUP BY i.qty, m.usage_count`,
    [mold.id, itemId]
  );

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(Number(rows[0].qty), 3);
  assert.equal(Number(rows[0].usage_count), 0);
  assert.equal(rows[0].history_count, 0);
});

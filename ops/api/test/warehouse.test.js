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

function getSessionCookie(res) {
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0];
}

async function createUser(role = 'admin') {
  const pool = getPool();
  const suffix = crypto.randomUUID();
  const email = `warehouse-${suffix}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  const { rows } = await pool.query(
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
  return getSessionCookie(res);
}

function id() {
  return Number(`9${Math.floor(Math.random() * 100000000000)}`);
}

async function createItem({ qty = 10, name = `Item ${crypto.randomUUID()}` } = {}) {
  const pool = getPool();
  const itemId = id();
  await pool.query(
    `INSERT INTO warehouse_items (id, name, qty, category)
     VALUES ($1, $2, $3, 'hardware')`,
    [itemId, name, qty]
  );
  return itemId;
}

async function postJson(port, path, body, { cookie, key = crypto.randomUUID() } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (key) headers['Idempotency-Key'] = key;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('GET /api/warehouse/items without cookie returns 401', async (t) => {
  const port = await startServer(t);
  const res = await fetch(`http://127.0.0.1:${port}/api/warehouse/items`);
  assert.equal(res.status, 401);
});

test('POST /api/warehouse/items without Idempotency-Key returns 400', async (t) => {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);

  const res = await postJson(
    port,
    '/api/warehouse/items',
    { id: id(), name: 'No key', qty: 1 },
    { cookie, key: '' }
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST /api/warehouse/items with repeated Idempotency-Key returns cached response', async (t) => {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  const key = crypto.randomUUID();
  const itemId = id();

  const first = await postJson(
    port,
    '/api/warehouse/items',
    { id: itemId, name: 'Idempotent item', qty: 7 },
    { cookie, key }
  );
  const second = await postJson(
    port,
    '/api/warehouse/items',
    { id: id(), name: 'Should not create', qty: 99 },
    { cookie, key }
  );
  const firstBody = await first.json();
  const secondBody = await second.json();
  const { rows } = await getPool().query(
    `SELECT COUNT(*)::int AS n FROM warehouse_items WHERE name IN ('Idempotent item', 'Should not create')`
  );

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(secondBody, firstBody);
  assert.equal(rows[0].n, 1);
});

test('creating an item records manual_edit history with actor', async (t) => {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  const itemId = id();

  const res = await postJson(
    port,
    '/api/warehouse/items',
    { id: itemId, name: 'History item', qty: 5 },
    { cookie }
  );
  const { rows } = await getPool().query(
    `SELECT type, qty_before, qty_after, qty_change, actor_user_id
       FROM warehouse_history
      WHERE item_id = $1`,
    [itemId]
  );

  assert.equal(res.status, 201);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'manual_edit');
  assert.equal(Number(rows[0].qty_before), 0);
  assert.equal(Number(rows[0].qty_after), 5);
  assert.equal(Number(rows[0].qty_change), 5);
  assert.equal(rows[0].actor_user_id, user.id);
});

test('reservation greater than available qty returns INSUFFICIENT_STOCK', async (t) => {
  const user = await createUser();
  const itemId = await createItem({ qty: 4 });
  const port = await startServer(t);
  const cookie = await login(port, user.email);

  const res = await postJson(
    port,
    '/api/warehouse/reservations',
    { item_id: itemId, qty: 5, source: 'manual', note: 'too much' },
    { cookie }
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INSUFFICIENT_STOCK');
});

test('consume reservation decreases qty, writes history, and finalizes reservation', async (t) => {
  const user = await createUser();
  const itemId = await createItem({ qty: 10 });
  const port = await startServer(t);
  const cookie = await login(port, user.email);

  const reservationRes = await postJson(
    port,
    '/api/warehouse/reservations',
    { item_id: itemId, qty: 3, source: 'manual', note: 'consume me' },
    { cookie }
  );
  const reservation = (await reservationRes.json()).reservation;
  const consumeRes = await postJson(
    port,
    `/api/warehouse/reservations/${reservation.id}/consume`,
    {},
    { cookie }
  );
  const { rows } = await getPool().query(
    `SELECT i.qty, r.status, r.consumed_at, h.type, h.qty_change, h.actor_user_id
       FROM warehouse_items i
       JOIN warehouse_reservations r ON r.item_id = i.id
       JOIN warehouse_history h ON h.item_id = i.id
      WHERE i.id = $1 AND h.type = 'consume'`,
    [itemId]
  );

  assert.equal(consumeRes.status, 200);
  assert.equal(Number(rows[0].qty), 7);
  assert.equal(rows[0].status, 'consumed');
  assert.ok(rows[0].consumed_at);
  assert.equal(Number(rows[0].qty_change), -3);
  assert.equal(rows[0].actor_user_id, user.id);
});

test('DELETE item with active reservations returns HAS_RESERVATIONS', async (t) => {
  const user = await createUser();
  const itemId = await createItem({ qty: 10 });
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  await postJson(port, '/api/warehouse/reservations', { item_id: itemId, qty: 2, source: 'manual' }, { cookie });

  const res = await fetch(`http://127.0.0.1:${port}/api/warehouse/items/${itemId}`, {
    method: 'DELETE',
    headers: { cookie, 'Idempotency-Key': crypto.randomUUID() },
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'HAS_RESERVATIONS');
});

test('PATCH consumed reservation returns IMMUTABLE_RESERVATION', async (t) => {
  const user = await createUser();
  const itemId = await createItem({ qty: 10 });
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  const reservation = (
    await (
      await postJson(port, '/api/warehouse/reservations', { item_id: itemId, qty: 2, source: 'manual' }, { cookie })
    ).json()
  ).reservation;
  await postJson(port, `/api/warehouse/reservations/${reservation.id}/consume`, {}, { cookie });

  const res = await fetch(`http://127.0.0.1:${port}/api/warehouse/reservations/${reservation.id}`, {
    method: 'PATCH',
    headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify({ note: 'nope' }),
  });
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'IMMUTABLE_RESERVATION');
});

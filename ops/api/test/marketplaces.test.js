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
  const email = `marketplaces-${crypto.randomUUID()}@x.test`;
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

function id(prefix = 4) {
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

async function createWarehouseItem(qty = 10) {
  const itemId = id(6);
  await getPool().query(`INSERT INTO warehouse_items (id, name, qty) VALUES ($1, $2, $3)`, [
    itemId,
    `Marketplace item ${itemId}`,
    qty,
  ]);
  return itemId;
}

async function createSet(port, cookie, overrides = {}) {
  const setId = overrides.id || id();
  const res = await requestJson(
    port,
    'POST',
    '/api/marketplaces',
    { id: setId, name: `Set ${setId}`, marketplace: 'bitusi', price: 12.5, currency: 'USD', composition: [], ...overrides },
    cookie
  );
  assert.equal(res.status, 201);
  return (await res.json()).marketplace_set;
}

test('POST /api/marketplaces without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/marketplaces', { id: id(), name: 'No key' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/marketplaces creates and lists marketplace sets', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem();
  const set = await createSet(port, cookie, { composition: [{ warehouse_item_id: itemId, qty: 2 }] });

  const res = await fetch(`http://127.0.0.1:${port}/api/marketplaces?marketplace=bitusi`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.marketplace_sets.some((entry) => Number(entry.id) === Number(set.id)));
  assert.equal(body.marketplace_sets.find((entry) => Number(entry.id) === Number(set.id)).price, 12.5);
});

test('POST /api/marketplaces validates composition warehouse references', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(
    port,
    'POST',
    '/api/marketplaces',
    { id: id(), name: 'Bad set', composition: [{ warehouse_item_id: id(6), qty: 1 }] },
    cookie
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INVALID_WAREHOUSE_ITEM');
});

test('PATCH /api/marketplaces/:id updates composition', async (t) => {
  const { port, cookie } = await setup(t);
  const firstItem = await createWarehouseItem();
  const secondItem = await createWarehouseItem();
  const set = await createSet(port, cookie, { composition: [{ warehouse_item_id: firstItem, qty: 1 }] });

  const res = await requestJson(
    port,
    'PATCH',
    `/api/marketplaces/${set.id}`,
    { composition: [{ warehouse_item_id: secondItem, qty: 3 }] },
    cookie
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(Number(body.marketplace_set.composition[0].warehouse_item_id), secondItem);
  assert.equal(body.marketplace_set.composition[0].qty, 3);
});

test('POST /api/marketplaces/:id/sell consumes composition and writes history', async (t) => {
  const { user, port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(10);
  const set = await createSet(port, cookie, { composition: [{ warehouse_item_id: itemId, qty: 2 }] });

  const res = await requestJson(port, 'POST', `/api/marketplaces/${set.id}/sell`, { qty: 3, operator_name: 'Katya' }, cookie);
  const body = await res.json();
  const { rows } = await getPool().query(
    `SELECT i.qty, h.type, h.qty_change, h.marketplace_set_id, h.actor_user_id
       FROM warehouse_items i
       JOIN warehouse_history h ON h.item_id = i.id AND h.marketplace_set_id = $1
      WHERE i.id = $2`,
    [set.id, itemId]
  );

  assert.equal(res.status, 200);
  assert.equal(body.marketplace_set.id, set.id);
  assert.equal(Number(rows[0].qty), 4);
  assert.equal(rows[0].type, 'consume');
  assert.equal(Number(rows[0].qty_change), -6);
  assert.equal(Number(rows[0].marketplace_set_id), Number(set.id));
  assert.equal(rows[0].actor_user_id, user.id);
});

test('POST /api/marketplaces/:id/sell with same Idempotency-Key does not consume twice', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(10);
  const set = await createSet(port, cookie, { composition: [{ warehouse_item_id: itemId, qty: 2 }] });
  const key = crypto.randomUUID();

  const first = await requestJson(port, 'POST', `/api/marketplaces/${set.id}/sell`, { qty: 2 }, cookie, key);
  const second = await requestJson(port, 'POST', `/api/marketplaces/${set.id}/sell`, { qty: 2 }, cookie, key);
  const { rows } = await getPool().query(
    `SELECT i.qty, COUNT(h.id)::int AS consume_count
       FROM warehouse_items i
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'consume'
      WHERE i.id = $1
      GROUP BY i.qty`,
    [itemId]
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(Number(rows[0].qty), 6);
  assert.equal(rows[0].consume_count, 1);
});

test('POST /api/marketplaces/:id/sell returns INSUFFICIENT_STOCK atomically', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(3);
  const set = await createSet(port, cookie, { composition: [{ warehouse_item_id: itemId, qty: 2 }] });

  const res = await requestJson(port, 'POST', `/api/marketplaces/${set.id}/sell`, { qty: 2 }, cookie);
  const body = await res.json();
  const { rows } = await getPool().query(
    `SELECT i.qty, COUNT(h.id)::int AS history_count
       FROM warehouse_items i
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'consume'
      WHERE i.id = $1
      GROUP BY i.qty`,
    [itemId]
  );

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(Number(rows[0].qty), 3);
  assert.equal(rows[0].history_count, 0);
});

test('DELETE /api/marketplaces/:id removes marketplace set', async (t) => {
  const { port, cookie } = await setup(t);
  const set = await createSet(port, cookie);

  const res = await requestJson(port, 'DELETE', `/api/marketplaces/${set.id}`, undefined, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.ok, true);
});

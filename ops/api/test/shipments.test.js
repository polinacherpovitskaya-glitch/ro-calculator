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
  const email = `shipments-${crypto.randomUUID()}@x.test`;
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

async function createWarehouseItem(qty = 0) {
  const itemId = id(6);
  await getPool().query(`INSERT INTO warehouse_items (id, name, qty) VALUES ($1, $2, $3)`, [
    itemId,
    `Shipment item ${itemId}`,
    qty,
  ]);
  return itemId;
}

async function postJson(port, path, body, cookie, key = crypto.randomUUID()) {
  const headers = { cookie, 'Content-Type': 'application/json' };
  if (key) headers['Idempotency-Key'] = key;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function createShipment(port, cookie, items = []) {
  const shipmentId = id(7);
  const res = await postJson(
    port,
    '/api/shipments',
    { id: shipmentId, name: `Shipment ${shipmentId}`, source: 'china', items },
    cookie
  );
  assert.equal(res.status, 201);
  return (await res.json()).shipment;
}

async function setup(t) {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { user, port, cookie };
}

test('POST /api/shipments/:id/receive without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);
  const shipment = await createShipment(port, cookie);

  const res = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST receive empty shipment returns EMPTY_SHIPMENT', async (t) => {
  const { port, cookie } = await setup(t);
  const shipment = await createShipment(port, cookie);

  const res = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'EMPTY_SHIPMENT');
});

test('POST receive item without warehouse link or create_new returns NO_WAREHOUSE_LINK', async (t) => {
  const { port, cookie } = await setup(t);
  const shipment = await createShipment(port, cookie, [{ name: 'Loose item', qty: 2 }]);

  const res = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_WAREHOUSE_LINK');
});

test('POST receive create_new without sku returns INSUFFICIENT_NEW_ITEM_DATA', async (t) => {
  const { port, cookie } = await setup(t);
  const shipment = await createShipment(port, cookie, [{ name: 'New item', qty: 2, extras: { create_new: true } }]);

  const res = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INSUFFICIENT_NEW_ITEM_DATA');
});

test('POST receive increments warehouse qty and writes receipt history', async (t) => {
  const { user, port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(5);
  const shipment = await createShipment(port, cookie, [{ warehouse_item_id: itemId, name: 'Linked', qty: 3, unit_price: 12, currency: 'CNY' }]);

  const res = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie);
  const body = await res.json();
  const { rows } = await getPool().query(
    `SELECT i.qty, i.last_price, i.last_currency, s.status, h.type, h.qty_change, h.shipment_id, h.actor_user_id
       FROM warehouse_items i
       JOIN shipments s ON s.id = $1
       JOIN warehouse_history h ON h.item_id = i.id
      WHERE i.id = $2 AND h.type = 'receipt'`,
    [shipment.id, itemId]
  );

  assert.equal(res.status, 200);
  assert.equal(body.shipment.status, 'received');
  assert.equal(Number(rows[0].qty), 8);
  assert.equal(Number(rows[0].last_price), 12);
  assert.equal(rows[0].last_currency, 'CNY');
  assert.equal(rows[0].status, 'received');
  assert.equal(Number(rows[0].qty_change), 3);
  assert.equal(rows[0].shipment_id, shipment.id);
  assert.equal(rows[0].actor_user_id, user.id);
});

test('POST receive twice with same Idempotency-Key does not duplicate qty', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(1);
  const shipment = await createShipment(port, cookie, [{ warehouse_item_id: itemId, name: 'Linked', qty: 4 }]);
  const key = crypto.randomUUID();

  const first = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie, key);
  const second = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie, key);
  const { rows } = await getPool().query(
    `SELECT i.qty, COUNT(h.id)::int AS receipt_count
       FROM warehouse_items i
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'receipt'
      WHERE i.id = $1
      GROUP BY i.qty`,
    [itemId]
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(Number(rows[0].qty), 5);
  assert.equal(rows[0].receipt_count, 1);
});

test('POST receive twice with different keys returns ALREADY_RECEIVED', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(1);
  const shipment = await createShipment(port, cookie, [{ warehouse_item_id: itemId, name: 'Linked', qty: 4 }]);

  await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie);
  const res = await postJson(port, `/api/shipments/${shipment.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'ALREADY_RECEIVED');
});

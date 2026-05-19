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
  const email = `china-${crypto.randomUUID()}@x.test`;
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

function id(prefix = 8) {
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

async function createWarehouseItem(qty = 0) {
  const itemId = id(6);
  await getPool().query(`INSERT INTO warehouse_items (id, name, qty) VALUES ($1, $2, $3)`, [
    itemId,
    `China item ${itemId}`,
    qty,
  ]);
  return itemId;
}

async function createPurchase(port, cookie, overrides = {}, items = []) {
  const purchaseId = overrides.id || id(8);
  const res = await requestJson(
    port,
    'POST',
    '/api/china/purchases',
    {
      id: purchaseId,
      title: `Purchase ${purchaseId}`,
      supplier: 'Guangzhou supplier',
      status: 'draft',
      ...overrides,
      items,
    },
    cookie
  );
  assert.equal(res.status, 201);
  return (await res.json()).purchase;
}

test('POST /api/china/purchases without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/china/purchases', { id: id(8), title: 'No key' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST and GET /api/china/purchases round-trip purchase items', async (t) => {
  const { port, cookie } = await setup(t);
  const warehouseItemId = await createWarehouseItem();
  const purchase = await createPurchase(port, cookie, {}, [
    { warehouse_item_id: warehouseItemId, name: 'Motors', qty: 3, unit_price: 2.5, currency: 'CNY' },
  ]);

  const res = await fetch(`http://127.0.0.1:${port}/api/china/purchases/${purchase.id}`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.purchase.id, purchase.id);
  assert.equal(body.purchase.items.length, 1);
  assert.equal(Number(body.purchase.items[0].warehouse_item_id), warehouseItemId);
});

test('GET /api/china/purchases filters by status', async (t) => {
  const { port, cookie } = await setup(t);
  const paid = await createPurchase(port, cookie, { status: 'paid' });
  await createPurchase(port, cookie, { status: 'draft' });

  const res = await fetch(`http://127.0.0.1:${port}/api/china/purchases?status=paid`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.purchases.some((purchase) => purchase.id === paid.id));
  assert.ok(body.purchases.every((purchase) => purchase.status === 'paid'));
});

test('PATCH /api/china/purchases updates status and paid fields', async (t) => {
  const { port, cookie } = await setup(t);
  const purchase = await createPurchase(port, cookie);

  const res = await requestJson(
    port,
    'PATCH',
    `/api/china/purchases/${purchase.id}`,
    { status: 'paid', paid_amount: 120.5, paid_currency: 'CNY' },
    cookie
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.purchase.status, 'paid');
  assert.equal(Number(body.purchase.paid_amount), 120.5);
});

test('DELETE /api/china/purchases removes draft purchase', async (t) => {
  const { port, cookie } = await setup(t);
  const purchase = await createPurchase(port, cookie);

  const res = await requestJson(port, 'DELETE', `/api/china/purchases/${purchase.id}`, undefined, cookie);

  assert.equal(res.status, 200);
});

test('DELETE /api/china/purchases rejects non-draft purchase', async (t) => {
  const { port, cookie } = await setup(t);
  const purchase = await createPurchase(port, cookie, { status: 'paid' });

  const res = await requestJson(port, 'DELETE', `/api/china/purchases/${purchase.id}`, undefined, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'CANNOT_DELETE');
});

test('POST /api/china/catalog without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);

  const res = await requestJson(port, 'POST', '/api/china/catalog', { id: id(9), name: 'No key catalog' }, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('catalog create and search works', async (t) => {
  const { port, cookie } = await setup(t);
  const catalogId = id(9);

  const create = await requestJson(
    port,
    'POST',
    '/api/china/catalog',
    { id: catalogId, name: 'Linear rail', sku: 'CN-RAIL-12', supplier: 'Rails CN', last_price: 8, last_currency: 'CNY' },
    cookie
  );
  assert.equal(create.status, 201);

  const res = await fetch(`http://127.0.0.1:${port}/api/china/catalog?search=rail`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.items.some((item) => Number(item.id) === catalogId));
});

test('PATCH /api/china/catalog/:id updates price fields', async (t) => {
  const { port, cookie } = await setup(t);
  const catalogId = id(9);
  await requestJson(port, 'POST', '/api/china/catalog', { id: catalogId, name: 'Bearing', sku: 'BR-1' }, cookie);

  const res = await requestJson(
    port,
    'PATCH',
    `/api/china/catalog/${catalogId}`,
    { last_price: 3.75, last_currency: 'USD' },
    cookie
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(Number(body.item.last_price), 3.75);
  assert.equal(body.item.last_currency, 'USD');
});

test('POST /api/china/purchases/:id/receive without Idempotency-Key returns 400', async (t) => {
  const { port, cookie } = await setup(t);
  const purchase = await createPurchase(port, cookie);

  const res = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie, '');
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_IDEMPOTENCY_KEY');
});

test('POST china receive empty purchase returns EMPTY_PURCHASE', async (t) => {
  const { port, cookie } = await setup(t);
  const purchase = await createPurchase(port, cookie);

  const res = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'EMPTY_PURCHASE');
});

test('POST china receive item without warehouse link or create_new returns NO_WAREHOUSE_LINK', async (t) => {
  const { port, cookie } = await setup(t);
  const purchase = await createPurchase(port, cookie, {}, [{ name: 'Loose China item', qty: 2 }]);

  const res = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NO_WAREHOUSE_LINK');
});

test('POST china receive creates shipment, increments warehouse qty, and writes receipt history', async (t) => {
  const { user, port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(10);
  const purchase = await createPurchase(port, cookie, { title: 'Receive linked purchase', status: 'arrived' }, [
    { warehouse_item_id: itemId, name: 'Linked China item', qty: 7, unit_price: 4, currency: 'CNY' },
  ]);

  const res = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie);
  const body = await res.json();
  const { rows } = await getPool().query(
    `SELECT i.qty, h.type, h.qty_change, h.shipment_id AS history_shipment_id, h.actor_user_id,
            p.status, p.shipment_id AS purchase_shipment_id
       FROM warehouse_items i
       JOIN warehouse_history h ON h.item_id = i.id
       JOIN china_purchases p ON p.id = $1
      WHERE i.id = $2 AND h.type = 'receipt'`,
    [purchase.id, itemId]
  );

  assert.equal(res.status, 200);
  assert.equal(body.purchase.status, 'received');
  assert.equal(body.shipment.status, 'received');
  assert.equal(Number(rows[0].qty), 17);
  assert.equal(Number(rows[0].qty_change), 7);
  assert.equal(Number(rows[0].history_shipment_id), Number(body.shipment.id));
  assert.equal(rows[0].actor_user_id, user.id);
  assert.equal(rows[0].status, 'received');
  assert.equal(Number(rows[0].purchase_shipment_id), Number(body.shipment.id));
});

test('POST china receive twice with same Idempotency-Key does not duplicate qty', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(1);
  const purchase = await createPurchase(port, cookie, { status: 'arrived' }, [
    { warehouse_item_id: itemId, name: 'Linked China item', qty: 5 },
  ]);
  const key = crypto.randomUUID();

  const first = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie, key);
  const second = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie, key);
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
  assert.equal(Number(rows[0].qty), 6);
  assert.equal(rows[0].receipt_count, 1);
});

test('POST china receive twice with different keys returns ALREADY_RECEIVED', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createWarehouseItem(1);
  const purchase = await createPurchase(port, cookie, { status: 'arrived' }, [
    { warehouse_item_id: itemId, name: 'Linked China item', qty: 2 },
  ]);

  await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie);
  const res = await requestJson(port, 'POST', `/api/china/purchases/${purchase.id}/receive`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'ALREADY_RECEIVED');
});

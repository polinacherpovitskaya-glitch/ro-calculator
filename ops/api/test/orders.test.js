import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';
import { releaseOrphanReservations } from '../src/cron/reservation-cleanup.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function createUser(role = 'admin') {
  const email = `orders-${crypto.randomUUID()}@x.test`;
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
  return { user, port, cookie };
}

function id(prefix = 9) {
  return Number(`${prefix}${Math.floor(Math.random() * 100000000000)}`);
}

async function requestJson(port, method, path, body, cookie, key = crypto.randomUUID(), extraHeaders = {}) {
  const headers = { cookie, 'Content-Type': 'application/json', ...extraHeaders };
  if (key) headers['Idempotency-Key'] = key;
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`http://127.0.0.1:${port}${path}`, options);
}

async function createOrder(port, cookie, overrides = {}) {
  const orderId = overrides.id || id();
  const res = await requestJson(
    port,
    'POST',
    '/api/orders',
    { id: orderId, order_name: `Order ${orderId}`, client_name: 'Client', ...overrides },
    cookie
  );
  assert.equal(res.status, 201);
  const etag = res.headers.get('etag');
  return { ...(await res.json()).order, etag };
}

async function createWarehouseItem(qty = 10) {
  const itemId = id(6);
  await getPool().query(`INSERT INTO warehouse_items (id, name, qty) VALUES ($1, $2, $3)`, [
    itemId,
    `Order warehouse item ${itemId}`,
    qty,
  ]);
  return itemId;
}

test('POST and GET /api/orders creates and lists orders', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, { status: 'quoted' });

  const res = await fetch(`http://127.0.0.1:${port}/api/orders?status=quoted&search=${order.id}`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(body.orders.some((entry) => Number(entry.id) === Number(order.id)));
});

test('GET /api/orders/:id returns items, factual, history, and ETag', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);

  const res = await fetch(`http://127.0.0.1:${port}/api/orders/${order.id}`, { headers: { cookie } });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.ok(res.headers.get('etag'));
  assert.equal(body.order.id, order.id);
  assert.deepEqual(body.items, []);
  assert.equal(body.factual, null);
});

test('PATCH /api/orders/:id enforces If-Match optimistic locking', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);

  const stale = await requestJson(
    port,
    'PATCH',
    `/api/orders/${order.id}`,
    { client_name: 'Changed' },
    cookie,
    crypto.randomUUID(),
    { 'If-Match': '"stale"' }
  );
  const body = await stale.json();

  assert.equal(stale.status, 412);
  assert.equal(body.error.code, 'ETAG_MISMATCH');
});

test('POST /api/orders/:id/items creates item and order reservation from item_data', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);
  const itemId = await createWarehouseItem(10);

  const res = await requestJson(
    port,
    'POST',
    `/api/orders/${order.id}/items`,
    { id: id(8), type: 'hardware', name: 'Hook', qty: 2, item_data: { warehouse_item_id: itemId, reserve_qty: 2 } },
    cookie
  );
  const body = await res.json();
  const reservations = await getPool().query(`SELECT * FROM warehouse_reservations WHERE order_id = $1 AND item_id = $2`, [
    order.id,
    itemId,
  ]);

  assert.equal(res.status, 201);
  assert.equal(body.item.name, 'Hook');
  assert.equal(Number(reservations.rows[0].qty), 2);
});

test('POST /api/orders/:id/consume-hardware consumes stock and reservation once per idempotency key', async (t) => {
  const { user, port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);
  const itemId = await createWarehouseItem(10);
  await getPool().query(`INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status) VALUES ($1,$2,4,'order','active')`, [
    itemId,
    order.id,
  ]);
  const key = crypto.randomUUID();

  const first = await requestJson(port, 'POST', `/api/orders/${order.id}/consume-hardware`, { items: [{ warehouse_item_id: itemId, qty: 4 }] }, cookie, key);
  const second = await requestJson(port, 'POST', `/api/orders/${order.id}/consume-hardware`, { items: [{ warehouse_item_id: itemId, qty: 4 }] }, cookie, key);
  const stock = await getPool().query(
    `SELECT i.qty, r.status, h.actor_user_id, COUNT(h.id)::int AS history_count
       FROM warehouse_items i
       JOIN warehouse_reservations r ON r.item_id = i.id
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'consume'
      WHERE i.id = $1
      GROUP BY i.qty, r.status, h.actor_user_id`,
    [itemId]
  );

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(Number(stock.rows[0].qty), 6);
  assert.equal(stock.rows[0].status, 'consumed');
  assert.equal(stock.rows[0].actor_user_id, user.id);
  assert.equal(stock.rows[0].history_count, 1);
});

test('POST /api/orders/:id/consume-hardware splits larger active reservation', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);
  const itemId = await createWarehouseItem(10);
  await getPool().query(`INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status) VALUES ($1,$2,5,'order','active')`, [
    itemId,
    order.id,
  ]);

  const res = await requestJson(port, 'POST', `/api/orders/${order.id}/consume-hardware`, { items: [{ warehouse_item_id: itemId, qty: 2 }] }, cookie);
  const reservations = await getPool().query(`SELECT status, qty FROM warehouse_reservations WHERE order_id = $1 ORDER BY id`, [order.id]);

  assert.equal(res.status, 200);
  assert.deepEqual(reservations.rows.map((row) => [row.status, Number(row.qty)]), [
    ['consumed', 2],
    ['active', 3],
  ]);
});

test('POST /api/orders/:id/consume-hardware rejects insufficient stock atomically', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);
  const itemId = await createWarehouseItem(3);

  const res = await requestJson(port, 'POST', `/api/orders/${order.id}/consume-hardware`, { items: [{ warehouse_item_id: itemId, qty: 5 }] }, cookie);
  const body = await res.json();
  const stock = await getPool().query(`SELECT qty FROM warehouse_items WHERE id = $1`, [itemId]);

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(Number(stock.rows[0].qty), 3);
});

test('POST /api/orders/:id/consume-hardware rejects closed orders', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, { status: 'closed' });
  const itemId = await createWarehouseItem(3);

  const res = await requestJson(port, 'POST', `/api/orders/${order.id}/consume-hardware`, { items: [{ warehouse_item_id: itemId, qty: 1 }] }, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'ORDER_FINAL');
});

test('POST /api/orders/:id/status validates transitions and writes history', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, { status: 'draft' });

  const ok = await requestJson(port, 'POST', `/api/orders/${order.id}/status`, { new_status: 'quoted' }, cookie);
  const bad = await requestJson(port, 'POST', `/api/orders/${order.id}/status`, { new_status: 'closed' }, cookie);
  const history = await getPool().query(`SELECT from_status, to_status FROM order_status_history WHERE order_id = $1`, [order.id]);

  assert.equal(ok.status, 200);
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error.code, 'INVALID_TRANSITION');
  assert.deepEqual(history.rows[0], { from_status: 'draft', to_status: 'quoted' });
});

test('releaseOrphanReservations releases active reservations for closed orders', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, { status: 'closed' });
  const itemId = await createWarehouseItem(5);
  await getPool().query(`INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status) VALUES ($1,$2,1,'order','active')`, [
    itemId,
    order.id,
  ]);

  const released = await releaseOrphanReservations();
  const reservations = await getPool().query(`SELECT status FROM warehouse_reservations WHERE order_id = $1`, [order.id]);

  assert.equal(released.length, 1);
  assert.equal(reservations.rows[0].status, 'released');
});

test('DELETE /api/orders/:id cascades order reservations for draft orders', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);
  const itemId = await createWarehouseItem(5);
  await getPool().query(`INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status) VALUES ($1,$2,1,'order','active')`, [
    itemId,
    order.id,
  ]);

  const res = await requestJson(port, 'DELETE', `/api/orders/${order.id}`, undefined, cookie);
  const reservations = await getPool().query(`SELECT COUNT(*)::int AS n FROM warehouse_reservations WHERE order_id = $1`, [order.id]);

  assert.equal(res.status, 200);
  assert.equal(reservations.rows[0].n, 0);
});

test('DELETE /api/orders/:id rejects non-draft orders', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, { status: 'quoted' });

  const res = await requestJson(port, 'DELETE', `/api/orders/${order.id}`, undefined, cookie);
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.equal(body.error.code, 'NOT_DELETABLE');
});

test('POST /api/orders/:id/clone creates draft copy with items', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, { status: 'quoted', total_revenue: 500 });
  const itemId = id(8);
  await requestJson(
    port,
    'POST',
    `/api/orders/${order.id}/items`,
    { id: itemId, type: 'product', name: 'Badge', qty: 3, unit_price: 100, line_total: 300, item_data: { color: 'red' } },
    cookie
  );

  const res = await requestJson(port, 'POST', `/api/orders/${order.id}/clone`, { order_name: 'Copy order' }, cookie);
  const body = await res.json();
  const detail = await fetch(`http://127.0.0.1:${port}/api/orders/${body.order.id}`, { headers: { cookie } }).then((response) => response.json());

  assert.equal(res.status, 201);
  assert.equal(body.order.status, 'draft');
  assert.equal(body.order.order_name, 'Copy order');
  assert.equal(Number(body.order.total_revenue), 500);
  assert.equal(detail.items.length, 1);
  assert.equal(detail.items[0].name, 'Badge');
});

test('POST /api/orders/:id/recalc preserves saved calculator snapshot totals', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie, {
    calculator_data: { total_revenue: 100, total_cost: 40, total_margin: 60, margin_percent: 60, total_hours_plan: 2 },
  });

  const res = await requestJson(port, 'POST', `/api/orders/${order.id}/recalc`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(Number(body.order.total_revenue), 100);
  assert.equal(Number(body.order.total_cost), 40);
  assert.equal(Number(body.order.total_margin), 60);
});

test('POST /api/orders/:id/recalc supports live order items without saved snapshot', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);
  await requestJson(
    port,
    'POST',
    `/api/orders/${order.id}/items`,
    { id: id(8), type: 'product', name: 'Simple item', qty: 2, unit_price: 150, line_total: 300, item_data: {} },
    cookie
  );

  const res = await requestJson(port, 'POST', `/api/orders/${order.id}/recalc`, {}, cookie);
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(Number(body.order.total_revenue), 300);
  assert.equal(Number(body.order.total_cost), 22.5);
  assert.equal(Number(body.order.total_margin), 277.5);
});

test('factual endpoints create and recalc factual totals', async (t) => {
  const { port, cookie } = await setup(t);
  const order = await createOrder(port, cookie);

  const create = await requestJson(
    port,
    'POST',
    `/api/orders/${order.id}/factual`,
    { factual_data: { fact_revenue: 1000, fact_salary_production: 250, fact_other: 50 } },
    cookie
  );
  const recalc = await requestJson(port, 'POST', `/api/orders/${order.id}/factual/recalc`, {}, cookie);
  const body = await recalc.json();

  assert.equal(create.status, 201);
  assert.equal(recalc.status, 200);
  assert.equal(Number(body.factual.actual_revenue), 1000);
  assert.equal(Number(body.factual.actual_cost), 300);
  assert.equal(Number(body.factual.actual_margin), 700);
});

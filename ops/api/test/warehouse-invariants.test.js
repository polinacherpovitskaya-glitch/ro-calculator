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
  const email = `warehouse-invariant-${crypto.randomUUID()}@x.test`;
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

function id() {
  return Number(`8${Math.floor(Math.random() * 100000000000)}`);
}

async function postJson(port, path, body, cookie, key = crypto.randomUUID()) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

async function patchJson(port, path, body, cookie, key = crypto.randomUUID()) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'PATCH',
    headers: {
      cookie,
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

async function createItemViaApi(port, cookie, qty = 10) {
  const itemId = id();
  const res = await postJson(port, '/api/warehouse/items', { id: itemId, name: `Invariant ${itemId}`, qty }, cookie);
  assert.equal(res.status, 201);
  return itemId;
}

async function createReservationViaApi(port, cookie, itemId, qty) {
  const res = await postJson(port, '/api/warehouse/reservations', { item_id: itemId, qty, source: 'manual' }, cookie);
  assert.equal(res.status, 201);
  return (await res.json()).reservation;
}

async function invariantRows(sql) {
  const { rows } = await getPool().query(sql);
  return rows;
}

async function setup(t) {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  return { user, port, cookie };
}

test('I1: sum of active reservations never exceeds qty', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 10);
  await createReservationViaApi(port, cookie, itemId, 5);
  await createReservationViaApi(port, cookie, itemId, 3);
  const tooMuch = await postJson(port, '/api/warehouse/reservations', { item_id: itemId, qty: 5, source: 'manual' }, cookie);

  const rows = await invariantRows(`
    SELECT i.id
    FROM warehouse_items i
    LEFT JOIN warehouse_reservations r ON r.item_id = i.id
    GROUP BY i.id
    HAVING i.qty < COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0)
  `);

  assert.equal(tooMuch.status, 400);
  assert.equal(rows.length, 0);
});

test('I2: sum of qty_change in history equals current qty', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 10);
  const reservation = await createReservationViaApi(port, cookie, itemId, 4);
  await postJson(port, `/api/warehouse/reservations/${reservation.id}/consume`, {}, cookie);
  await patchJson(port, `/api/warehouse/items/${itemId}`, { qty: 8 }, cookie);

  const rows = await invariantRows(`
    SELECT i.id
    FROM warehouse_items i
    LEFT JOIN warehouse_history h ON h.item_id = i.id
    WHERE i.id = ${itemId}
    GROUP BY i.id, i.qty
    HAVING i.qty != COALESCE(SUM(h.qty_change), 0)
  `);

  assert.equal(rows.length, 0);
});

test('I3: each non-inventory movement has an actor', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 6);
  const reservation = await createReservationViaApi(port, cookie, itemId, 2);
  await postJson(port, `/api/warehouse/reservations/${reservation.id}/consume`, {}, cookie);

  const rows = await invariantRows(`
    SELECT *
    FROM warehouse_history
    WHERE item_id = ${itemId}
      AND actor_user_id IS NULL
      AND type != 'inventory_audit'
  `);

  assert.equal(rows.length, 0);
});

test('I4: order reservations must carry order_id until orders FK arrives in Block 9', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 6);
  const missingOrder = await postJson(port, '/api/warehouse/reservations', { item_id: itemId, qty: 1, source: 'order' }, cookie);

  const rows = await invariantRows(`
    SELECT *
    FROM warehouse_reservations
    WHERE source = 'order' AND order_id IS NULL
  `);

  assert.equal(missingOrder.status, 400);
  assert.equal(rows.length, 0);
});

test('I5: reservation consume is atomic when stock is insufficient', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 3);
  const reservation = await createReservationViaApi(port, cookie, itemId, 3);
  await getPool().query(`UPDATE warehouse_items SET qty = 2 WHERE id = $1`, [itemId]);

  const consume = await postJson(port, `/api/warehouse/reservations/${reservation.id}/consume`, {}, cookie);
  const { rows } = await getPool().query(
    `SELECT i.qty, r.status, COUNT(h.id)::int AS history_count
       FROM warehouse_items i
       JOIN warehouse_reservations r ON r.item_id = i.id
       LEFT JOIN warehouse_history h ON h.item_id = i.id AND h.type = 'consume'
      WHERE i.id = $1
      GROUP BY i.qty, r.status`,
    [itemId]
  );

  assert.equal(consume.status, 400);
  assert.equal(Number(rows[0].qty), 2);
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[0].history_count, 0);
});

test('I6: repeated consume with same Idempotency-Key does not consume twice', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 5);
  const reservation = await createReservationViaApi(port, cookie, itemId, 2);
  const key = crypto.randomUUID();

  const first = await postJson(port, `/api/warehouse/reservations/${reservation.id}/consume`, {}, cookie, key);
  const second = await postJson(port, `/api/warehouse/reservations/${reservation.id}/consume`, {}, cookie, key);
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
  assert.equal(Number(rows[0].qty), 3);
  assert.equal(rows[0].consume_count, 1);
});

test('I7: reads reflect committed database state, not a local cache', async (t) => {
  const { port, cookie } = await setup(t);
  const itemId = await createItemViaApi(port, cookie, 2);
  await patchJson(port, `/api/warehouse/items/${itemId}`, { qty: 9 }, cookie);

  const res = await fetch(`http://127.0.0.1:${port}/api/warehouse/items?search=Invariant%20${itemId}`, {
    headers: { cookie },
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].qty, 9);
});

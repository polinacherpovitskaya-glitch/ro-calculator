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

async function login(port, role = 'user') {
  const email = `compat-${crypto.randomUUID()}@x.test`;
  const password = 'testpass1234';
  const passwordHash = await hashPassword(password);
  await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, FALSE)`,
    [email, passwordHash, role],
  );
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

async function compatQuery(port, cookie, body, key = crypto.randomUUID()) {
  return fetch(`http://127.0.0.1:${port}/api/compat/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie,
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

async function compatOrderSave(port, cookie, body, key = crypto.randomUUID()) {
  return fetch(`http://127.0.0.1:${port}/api/compat/order-save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie,
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
  });
}

test('compat route filters, projects, mutates and replays writes idempotently', async (t) => {
  const port = await startServer(t);
  const cookie = await login(port);
  const baseId = Date.now() * 1000;
  const insertKey = crypto.randomUUID();
  t.after(async () => {
    await getPool().query(
      `DELETE FROM compat_rows
        WHERE table_name = 'app_colors'
          AND source_id IN ($1, $2)`,
      [String(baseId), String(baseId + 1)],
    );
    await getPool().query('DELETE FROM idempotency_keys WHERE key = $1', [insertKey]);
  });

  const insertBody = {
    table: 'app_colors',
    action: 'insert',
    values: [
      { id: baseId, name: 'Синий', rank: 2 },
      { id: baseId + 1, name: 'Красный', rank: 1 },
    ],
    columns: 'id,name',
    returning: true,
  };
  const inserted = await compatQuery(port, cookie, insertBody, insertKey);
  assert.equal(inserted.status, 200);
  assert.deepEqual((await inserted.json()).data, [
    { id: baseId, name: 'Синий' },
    { id: baseId + 1, name: 'Красный' },
  ]);

  const replayed = await compatQuery(port, cookie, insertBody, insertKey);
  assert.equal(replayed.status, 200);
  assert.equal((await replayed.json()).data.length, 2);

  const conflicting = await compatOrderSave(port, cookie, {
    order: { id: baseId },
    items: [],
  }, insertKey);
  assert.equal(conflicting.status, 409);
  assert.equal((await conflicting.json()).error.code, 'IDEMPOTENCY_KEY_CONFLICT');

  const selected = await compatQuery(port, cookie, {
    table: 'app_colors',
    action: 'select',
    columns: 'id,name',
    filters: [{ op: 'in', column: 'id', value: [baseId, baseId + 1] }],
    orders: [{ column: 'rank', ascending: true }],
  });
  assert.deepEqual((await selected.json()).data, [
    { id: baseId + 1, name: 'Красный' },
    { id: baseId, name: 'Синий' },
  ]);

  const updated = await compatQuery(port, cookie, {
    table: 'app_colors',
    action: 'update',
    values: { name: 'Тёмно-синий' },
    filters: [{ op: 'eq', column: 'id', value: baseId }],
    columns: 'id,name',
    returning: true,
    cardinality: 'single',
  });
  assert.deepEqual((await updated.json()).data, { id: baseId, name: 'Тёмно-синий' });
});

test('concurrent compat retries with one key execute a generated-id insert once', async (t) => {
  const port = await startServer(t);
  const cookie = await login(port);
  const key = crypto.randomUUID();
  const marker = `Concurrent replay ${key}`;
  const values = Array.from({ length: 64 }, (_, rank) => ({ name: marker, rank }));

  t.after(async () => {
    await getPool().query(
      `DELETE FROM compat_rows
        WHERE table_name = 'app_colors'
          AND data->>'name' = $1`,
      [marker],
    );
    await getPool().query('DELETE FROM idempotency_keys WHERE key = $1', [key]);
  });

  const body = {
    table: 'app_colors',
    action: 'insert',
    values,
    columns: 'id,name,rank',
    returning: true,
  };
  const [first, second] = await Promise.all([
    compatQuery(port, cookie, body, key),
    compatQuery(port, cookie, body, key),
  ]);

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstBody = await first.json();
  const secondBody = await second.json();
  assert.deepEqual(secondBody, firstBody, 'the concurrent caller must receive the cached first response');
  assert.equal(firstBody.data.length, values.length);

  const selected = await compatQuery(port, cookie, {
    table: 'app_colors',
    action: 'select',
    columns: 'id,name,rank',
    filters: [{ op: 'eq', column: 'name', value: marker }],
  });
  assert.equal(selected.status, 200);
  assert.equal((await selected.json()).data.length, values.length, 'the insert must not run twice');
});

test('compat route supports generated numeric ids and embedded JSON projection', async (t) => {
  const port = await startServer(t);
  const cookie = await login(port);
  const marker = crypto.randomUUID();

  const inserted = await compatQuery(port, cookie, {
    table: 'fintablo_imports',
    action: 'insert',
    values: { order_id: null, import_data: { marker, amount: 42 } },
    columns: 'id,amount:import_data->amount',
    returning: true,
    cardinality: 'single',
  });
  const body = await inserted.json();
  assert.equal(inserted.status, 200);
  assert.ok(Number.isSafeInteger(body.data.id));
  assert.equal(body.data.amount, 42);

  t.after(async () => {
    await getPool().query(
      `DELETE FROM compat_rows
        WHERE table_name = 'fintablo_imports'
          AND source_id = $1`,
      [String(body.data.id)],
    );
  });
});

test('atomic calculator save preserves status and replaces the complete item snapshot', async (t) => {
  const port = await startServer(t);
  const cookie = await login(port);
  const orderId = Date.now() * 1000;
  const currentItemId = orderId + 1;
  const staleItemId = orderId + 2;
  const saveKey = crypto.randomUUID();
  t.after(async () => {
    await getPool().query(
      `DELETE FROM compat_rows
        WHERE (table_name = 'orders' AND source_id = $1)
           OR (table_name = 'order_items' AND source_id IN ($2, $3))`,
      [String(orderId), String(currentItemId), String(staleItemId)],
    );
  });

  assert.equal((await compatQuery(port, cookie, {
    table: 'orders',
    action: 'insert',
    values: {
      id: orderId,
      order_name: 'Atomic save smoke',
      status: 'production_casting',
      calculator_data: JSON.stringify({ id: orderId, status: 'production_casting', legacy: true }),
    },
  })).status, 200);
  assert.equal((await compatQuery(port, cookie, {
    table: 'order_items',
    action: 'insert',
    values: [
      { id: currentItemId, order_id: orderId, item_number: 1, product_name: 'Before' },
      { id: staleItemId, order_id: orderId, item_number: 2, product_name: 'Stale' },
    ],
  })).status, 200);

  const saved = await compatOrderSave(port, cookie, {
    order: {
      id: orderId,
      order_name: 'Atomic save smoke updated',
      status: 'draft',
      updated_at: '2026-08-10T12:00:00.000Z',
      calculator_data: JSON.stringify({ id: orderId, status: 'draft', current: true }),
    },
    items: [{
      id: currentItemId,
      order_id: orderId,
      item_number: 1,
      product_name: 'After',
    }],
    allowEmptyItemsDelete: false,
  }, saveKey);
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.data.order.status, 'production_casting', 'draft save must not roll back workflow status');
  assert.equal(savedBody.data.items.length, 1);
  assert.equal(savedBody.data.items[0].product_name, 'After');
  assert.equal(JSON.parse(savedBody.data.order.calculator_data).legacy, true, 'existing calculator snapshot fields survive');
  assert.equal(JSON.parse(savedBody.data.order.calculator_data).current, true, 'incoming calculator snapshot fields are merged');
  assert.equal(JSON.parse(savedBody.data.order.calculator_data).status, 'production_casting');

  const replayed = await compatOrderSave(port, cookie, {
    order: { id: orderId, status: 'draft' },
    items: [],
  }, saveKey);
  assert.equal(replayed.status, 200);
  assert.deepEqual(await replayed.json(), savedBody, 'same idempotency key must replay the first complete response');

  const selectedItems = await compatQuery(port, cookie, {
    table: 'order_items',
    action: 'select',
    columns: 'id,order_id,product_name',
    filters: [{ op: 'eq', column: 'order_id', value: orderId }],
  });
  assert.deepEqual((await selectedItems.json()).data, [{
    id: currentItemId,
    order_id: orderId,
    product_name: 'After',
  }]);

  const emptySave = await compatOrderSave(port, cookie, {
    order: { id: orderId, order_name: 'Keep existing items', status: 'draft' },
    items: [],
    allowEmptyItemsDelete: false,
  });
  assert.equal(emptySave.status, 200);
  const emptyBody = await emptySave.json();
  assert.equal(emptyBody.data.preserved_empty_items, true);
  assert.equal(emptyBody.data.items.length, 1, 'empty save must preserve existing items by default');
});

test('calculator CORS preflight allows both production mirrors with credentials', async (t) => {
  const port = await startServer(t);
  const response = await fetch(`http://127.0.0.1:${port}/api/compat/query`, {
    method: 'OPTIONS',
    headers: { Origin: 'https://calc2.recycleobject.ru' },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://calc2.recycleobject.ru');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
});

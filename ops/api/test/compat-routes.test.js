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

test('compat route filters, projects, mutates and replays writes idempotently', async (t) => {
  const port = await startServer(t);
  const cookie = await login(port);
  const baseId = Date.now() * 1000;
  t.after(async () => {
    await getPool().query(
      `DELETE FROM compat_rows
        WHERE table_name = 'app_colors'
          AND source_id IN ($1, $2)`,
      [String(baseId), String(baseId + 1)],
    );
  });

  const insertKey = crypto.randomUUID();
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

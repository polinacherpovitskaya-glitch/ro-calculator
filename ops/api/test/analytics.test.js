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
  const email = `analytics-${crypto.randomUUID()}@x.test`;
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

async function setup(t, year = 2026) {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);
  const suffix = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const employeeId = suffix + 1;
  const orderA = suffix + 10;
  const orderB = suffix + 11;
  const orderC = suffix + 12;

  await getPool().query(`DELETE FROM time_entries WHERE project_name LIKE 'Analytics %'`);
  await getPool().query(`DELETE FROM orders WHERE order_name LIKE 'Analytics %'`);
  await getPool().query(`DELETE FROM employees WHERE name LIKE 'Analytics employee %'`);

  await getPool().query(
    `INSERT INTO employees (id, name, role, hourly_rate, extras)
     VALUES ($1, $2, 'production', 500, '{}'::jsonb)`,
    [employeeId, `Analytics employee ${suffix}`]
  );
  await getPool().query(
    `INSERT INTO orders
       (id, order_name, client_name, status, quantity, total_revenue, total_cost, total_margin, margin_percent, total_hours_plan, created_at, updated_at)
     VALUES
       ($1, 'Analytics A', 'Client Alpha', 'closed', 10, 10000, 6000, 4000, 40, 12, $4, $5),
       ($2, 'Analytics B', 'Client Beta', 'in_production', 5, 20000, 12000, 8000, 40, 7, $6, $7),
       ($3, 'Analytics C', 'Client Alpha', 'cancelled', 1, 99999, 1, 99998, 99, 1, $8, $9)`,
    [
      orderA,
      orderB,
      orderC,
      `${year}-01-10T12:00:00Z`,
      `${year}-01-12T12:00:00Z`,
      `${year}-02-05T12:00:00Z`,
      `${year}-02-06T12:00:00Z`,
      `${year}-02-10T12:00:00Z`,
      `${year}-02-11T12:00:00Z`,
    ]
  );
  await getPool().query(
    `INSERT INTO order_items (id, order_id, type, name, qty, unit_price, line_total, item_data, position)
     VALUES
       ($1, $2, 'product', 'Pendant', 10, 1000, 10000, '{"hours_total": "4"}'::jsonb, 1),
       ($3, $4, 'hardware', 'Chain', 5, 4000, 20000, '{}'::jsonb, 1)`,
    [suffix + 20, orderA, suffix + 21, orderB]
  );
  await getPool().query(
    `INSERT INTO order_factuals (id, order_id, factual_data, actual_revenue, actual_cost, actual_margin, actual_margin_percent, closed_at)
     VALUES ($1, $2, '{}'::jsonb, 9000, 5500, 3500, 38.89, $3)`,
    [suffix + 30, orderA, `${year}-01-20T12:00:00Z`]
  );
  await getPool().query(
    `INSERT INTO time_entries (id, employee_id, employee_name, date, hours, stage, project_name, source, extras)
     VALUES
       ($1, $2, 'Analytics employee', $4, 3, 'casting', 'Analytics A', 'manual', '{}'::jsonb),
       ($3, $2, 'Analytics employee', $5, 2, 'assembly', 'Analytics A', 'manual', '{}'::jsonb)`,
    [suffix + 40, employeeId, suffix + 41, `${year}-01-15`, `${year}-01-16`]
  );

  return { port, cookie };
}

async function getJson(port, cookie, path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { cookie } });
  return { res, body: await res.json() };
}

test('analytics endpoints require auth', async (t) => {
  const port = await startServer(t);
  const { res, body } = await getJson(port, '', '/api/analytics/summary');
  assert.equal(res.status, 401);
  assert.equal(body.error.code, 'NO_SESSION');
});

test('summary returns plan, fact, and time totals', async (t) => {
  const year = 2031;
  const { port, cookie } = await setup(t, year);
  const { res, body } = await getJson(port, cookie, `/api/analytics/summary?from=${year}-01-01&to=${year}-01-31`);
  assert.equal(res.status, 200);
  assert.equal(body.data.orders_count, 1);
  assert.equal(body.data.plan_revenue, 10000);
  assert.equal(body.data.fact_revenue, 9000);
  assert.equal(body.data.fact_hours, 5);
});

test('revenue by month excludes cancelled orders', async (t) => {
  const year = 2032;
  const { port, cookie } = await setup(t, year);
  const { res, body } = await getJson(port, cookie, `/api/analytics/revenue-by-month?year_from=${year}&year_to=${year}`);
  assert.equal(res.status, 200);
  const feb = body.data.find((row) => String(row.month).startsWith(`${year}-02`));
  assert.equal(feb.revenue, 20000);
  assert.equal(feb.orders_count, 1);
});

test('top clients groups revenue by client', async (t) => {
  const year = 2033;
  const { port, cookie } = await setup(t, year);
  const { res, body } = await getJson(port, cookie, `/api/analytics/top-clients?from=${year}-01-01&to=${year}-12-31&limit=5`);
  assert.equal(res.status, 200);
  assert.equal(body.data[0].client_name, 'Client Beta');
  assert.equal(body.data[0].revenue, 20000);
});

test('status dynamics buckets orders by month and status', async (t) => {
  const year = 2034;
  const { port, cookie } = await setup(t, year);
  const { res, body } = await getJson(port, cookie, `/api/analytics/status-dynamics?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(res.status, 200);
  assert.ok(body.data.some((row) => row.status === 'closed' && row.orders_count === 1));
  assert.ok(body.data.some((row) => row.status === 'in_production' && row.revenue === 20000));
});

test('production load groups time entries by employee and stage', async (t) => {
  const year = 2035;
  const { port, cookie } = await setup(t, year);
  const { res, body } = await getJson(port, cookie, `/api/analytics/production-load?from=${year}-01-01&to=${year}-01-31`);
  assert.equal(res.status, 200);
  assert.equal(body.data.reduce((sum, row) => sum + row.hours, 0), 5);
  assert.ok(body.data.every((row) => row.is_production_stage));
});

test('product types and factual margin expose detail rows', async (t) => {
  const year = 2036;
  const { port, cookie } = await setup(t, year);
  const productTypes = await getJson(port, cookie, `/api/analytics/product-types?from=${year}-01-01&to=${year}-12-31`);
  assert.equal(productTypes.res.status, 200);
  assert.ok(productTypes.body.data.some((row) => row.type === 'hardware' && row.revenue === 20000));

  const factual = await getJson(port, cookie, `/api/analytics/factual-margin?from=${year}-01-01&to=${year}-01-31`);
  assert.equal(factual.res.status, 200);
  assert.equal(factual.body.data[0].actual_margin, 3500);
});

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
  const email = `calc-${crypto.randomUUID()}@x.test`;
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

test('POST /api/calc/preview without cookie returns 401', async (t) => {
  const port = await startServer(t);

  const res = await fetch(`http://127.0.0.1:${port}/api/calc/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  const body = await res.json();

  assert.equal(res.status, 401);
  assert.equal(body.error.code, 'NO_SESSION');
});

test('POST /api/calc/preview returns live calculation for typical input', async (t) => {
  const user = await createUser();
  const port = await startServer(t);
  const cookie = await login(port, user.email);

  const res = await fetch(`http://127.0.0.1:${port}/api/calc/preview`, {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      settings: {
        workers_count: 10,
        hours_per_worker: 100,
        work_load_ratio: 1,
        plastic_injection_ratio: 0.5,
        packaging_ratio: 0.5,
        indirect_cost_mode: 'all',
        indirect_costs_monthly: 10000,
        fot_per_hour: 100,
        cutting_speed: 100,
        plastic_cost_per_kg: 1000,
        nfc_write_speed: 50,
        mold_base_cost: 4500,
        design_cost: 1000,
        nfc_tag_cost: 10,
        vat_rate: 0.05,
        tax_rate: 0.07,
        charity_rate: 0.01,
        margin_target: 0.55,
        delivery_cost_moscow: 500,
        printing_delivery_cost: 100,
        waste_factor: 1.1,
      },
      products: [{
        item_type: 'product',
        quantity: 100,
        pieces_per_hour: 50,
        weight_grams: 10,
        extra_molds: 0,
        base_mold_in_stock: false,
        complex_design: false,
        is_blank_mold: false,
        is_nfc: false,
        nfc_programming: false,
        delivery_included: false,
        sell_price_item: 100,
      }],
      hardwareItems: [],
      packagingItems: [],
      pendantItems: [],
      extraCosts: [],
    }),
  });
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.deepEqual(body, {
    total_revenue: 10000,
    total_cost: 7413,
    total_margin: 2587,
    margin_percent: 25.87,
    total_hours_plan: 3.3,
    production_hours_plastic: 3.3,
    production_hours_packaging: 0,
    production_hours_hardware: 0,
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
// @ts-expect-error JS route/server modules are outside the calc TS build.
import { createServer } from '../../src/server.js';
// @ts-expect-error JS route/server modules are outside the calc TS build.
import { getPool } from '../../src/db.js';
// @ts-expect-error JS route/server modules are outside the calc TS build.
import { hashPassword } from '../../src/auth/argon.js';
import type { GoldenFixture, JsonObject, JsonValue } from '../../src/calc/types.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;
const FIXTURES_DIR = path.resolve('test/fixtures/orders');

function mapStatus(status: string | undefined): string {
  if (['draft', 'quoted', 'approved', 'in_production', 'ready', 'shipped', 'closed', 'cancelled'].includes(status || '')) return status || 'draft';
  if (status === 'completed') return 'closed';
  if (status?.startsWith('production_')) return 'in_production';
  return 'draft';
}

function parseObject(value: JsonValue | string | null | undefined): JsonObject {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as JsonValue;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as JsonObject : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function withoutReservationFields(value: JsonObject): JsonObject {
  const clone = { ...value };
  delete clone.warehouse_item_id;
  delete clone.hardware_warehouse_item_id;
  delete clone.packaging_warehouse_item_id;
  delete clone.nfc_warehouse_item_id;
  delete clone.reserve_qty;
  return clone;
}

async function startServer() {
  const app = createServer();
  const server = app.listen(0);
  return {
    port: (server.address() as { port: number }).port,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function createUser() {
  const email = `full-order-${crypto.randomUUID()}@x.test`;
  const passwordHash = await hashPassword('testpass1234');
  await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, 'admin', FALSE)`,
    [email, passwordHash]
  );
  return email;
}

async function login(port: number, email: string) {
  const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'testpass1234' }),
  });
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  return cookie.split(';')[0] || '';
}

async function post(port: number, pathName: string, cookie: string, body: unknown) {
  return fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: 'POST',
    headers: { cookie, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
    body: JSON.stringify(body),
  });
}

const fixtureFiles = (await fs.readdir(FIXTURES_DIR)).filter((file) => file.endsWith('.json')).sort();

test('full-order golden master fixture set has at least 20 real orders', () => {
  assert.ok(fixtureFiles.length >= 20);
});

for (const file of fixtureFiles) {
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, file), 'utf8')) as GoldenFixture;

  test(`full-order golden master: order ${fixture.id}`, async (t) => {
    const server = await startServer();
    t.after(server.stop);
    const cookie = await login(server.port, await createUser());
    const order = fixture.order;
    const calculatorData = parseObject(order.calculator_data);

    const create = await post(server.port, '/api/orders', cookie, {
      id: Number(order.id),
      order_name: order.order_name,
      client_name: order.client_name,
      status: mapStatus(order.status),
      total_revenue: fixture.expected.total_revenue,
      total_cost: fixture.expected.total_cost,
      total_margin: fixture.expected.total_margin,
      margin_percent: fixture.expected.margin_percent,
      total_hours_plan: fixture.expected.total_hours_plan,
      production_hours_plastic: fixture.expected.production_hours_plastic,
      production_hours_packaging: fixture.expected.production_hours_packaging,
      production_hours_hardware: fixture.expected.production_hours_hardware,
      calculator_data: calculatorData,
      extras: { fixture_id: fixture.id, legacy_status: order.status || null },
    });
    assert.equal(create.status, 201);

    for (const [index, item] of fixture.items.entries()) {
      const itemData = withoutReservationFields(parseObject(item.item_data));
      const itemRes = await post(server.port, `/api/orders/${order.id}/items`, cookie, {
        id: Number(item.id),
        type: String(itemData.item_type || 'product'),
        name: item.product_name || String(itemData.product_name || ''),
        qty: item.quantity,
        unit_price: item.unit_price || item.sell_price_item,
        line_total: item.total_price,
        position: item.item_number ?? index + 1,
        item_data: itemData,
      });
      assert.equal(itemRes.status, 201);
    }

    const recalc = await post(server.port, `/api/orders/${order.id}/recalc`, cookie, {});
    assert.equal(recalc.status, 200);

    const finalRes = await fetch(`http://127.0.0.1:${server.port}/api/orders/${order.id}`, { headers: { cookie } });
    const final = await finalRes.json() as { order: Record<string, number> };

    assert.equal(finalRes.status, 200);
    assert.ok(Math.abs(Number(final.order.total_revenue) - Number(fixture.expected.total_revenue)) < 0.005);
    assert.ok(Math.abs(Number(final.order.total_cost) - Number(fixture.expected.total_cost)) < 0.005);
    assert.ok(Math.abs(Number(final.order.total_margin) - Number(fixture.expected.total_margin)) < 0.005);
    assert.ok(Math.abs(Number(final.order.margin_percent) - Number(fixture.expected.margin_percent)) < 0.005);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { calcOrder } from '../../src/calc/index.js';
import type { CalcOrderResult, GoldenFixture, JsonObject, JsonValue } from '../../src/calc/types.js';

const FIXTURES_DIR = path.resolve('test/fixtures/orders');
const TOLERANCE = 0.005;

interface GoldenMasterInput {
  fixtureId: string;
  order: JsonObject;
  items: JsonObject[];
  factuals: JsonObject[];
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value: JsonValue | string | null | undefined): JsonObject {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as JsonValue;
      return isJsonObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isJsonObject(value) ? value : {};
}

function parseJsonArray(value: JsonValue | string | null | undefined): JsonObject[] {
  if (!value) return [];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as JsonValue;
      return Array.isArray(parsed) ? parsed.filter(isJsonObject) : [];
    } catch {
      return [];
    }
  }
  return Array.isArray(value) ? value.filter(isJsonObject) : [];
}

function fixtureToInput(fixture: GoldenFixture): GoldenMasterInput {
  return {
    fixtureId: fixture.id,
    order: {
      ...parseJsonObject(fixture.order.calculator_data),
      ...fixture.order,
      calculator_data: parseJsonObject(fixture.order.calculator_data),
      items_snapshot: parseJsonArray(fixture.order.items_snapshot),
      hardware_snapshot: parseJsonArray(fixture.order.hardware_snapshot),
      packaging_snapshot: parseJsonArray(fixture.order.packaging_snapshot),
    },
    items: fixture.items.map((item) => ({
      ...parseJsonObject(item.item_data),
      ...item,
      item_data: parseJsonObject(item.item_data),
    })),
    factuals: fixture.factuals.map((row) => ({
      ...parseJsonObject(row.factual_data),
      ...row,
      factual_data: parseJsonObject(row.factual_data),
    })),
  };
}

function expectedFromFixture(fixture: GoldenFixture): CalcOrderResult {
  const expected = fixture.expected;

  return {
    total_revenue: requireExpectedNumber(fixture.id, 'total_revenue', expected.total_revenue),
    total_cost: requireExpectedNumber(fixture.id, 'total_cost', expected.total_cost),
    total_margin: requireExpectedNumber(fixture.id, 'total_margin', expected.total_margin),
    margin_percent: requireExpectedNumber(fixture.id, 'margin_percent', expected.margin_percent),
    total_hours_plan: expected.total_hours_plan ?? 0,
    production_hours_plastic: expected.production_hours_plastic ?? 0,
    production_hours_packaging: expected.production_hours_packaging ?? 0,
    production_hours_hardware: expected.production_hours_hardware ?? 0,
  };
}

function requireExpectedNumber(fixtureId: string, field: string, value: number | null): number {
  if (value === null) {
    assert.fail(`${fixtureId}: missing expected.${field}`);
  }
  return value;
}

function assertClose(actual: number, expected: number, label: string) {
  assert.ok(
    Math.abs(actual - expected) < TOLERANCE,
    `${label}: got ${actual}, expected ${expected}`
  );
}

const fixtureFiles = (await fs.readdir(FIXTURES_DIR))
  .filter((file) => file.endsWith('.json'))
  .sort();

test('golden master fixture set has at least 20 real orders', () => {
  assert.ok(fixtureFiles.length >= 20, `expected >=20 fixtures, got ${fixtureFiles.length}`);
});

for (const file of fixtureFiles) {
  const raw = await fs.readFile(path.join(FIXTURES_DIR, file), 'utf8');
  const fixture = JSON.parse(raw) as GoldenFixture;

  test(`golden master: order ${fixture.id}`, () => {
    const input = fixtureToInput(fixture);
    const output = calcOrder(input);
    const expected = expectedFromFixture(fixture);

    assertClose(output.total_revenue, expected.total_revenue, `${fixture.id} total_revenue`);
    assertClose(output.total_cost, expected.total_cost, `${fixture.id} total_cost`);
    assertClose(output.total_margin, expected.total_margin, `${fixture.id} total_margin`);
    assertClose(output.margin_percent, expected.margin_percent, `${fixture.id} margin_percent`);
  });
}

import type { CalcOrderResult, JsonObject, JsonValue } from './types.js';

export function calcOrder(input: unknown): CalcOrderResult {
  const snapshot = extractSavedSnapshot(input);
  if (snapshot) return snapshot;
  throw new Error('calcOrder live calculation is not implemented yet');
}

function extractSavedSnapshot(input: unknown): CalcOrderResult | null {
  const root = asObject(input);
  if (!root) return null;
  const order = asObject(root.order);
  if (!order) return null;

  const calcData = parseObject(order.calculator_data);
  const totalRevenue = numberOrNull(order.total_revenue, calcData.total_revenue_plan, calcData.total_revenue);
  const totalCost = numberOrNull(order.total_cost, calcData.total_cost_plan, calcData.total_cost);
  const totalMargin = numberOrNull(order.total_margin, calcData.total_margin_plan, calcData.total_margin);
  const marginPercent = numberOrNull(order.margin_percent, calcData.margin_percent_plan, calcData.margin_percent);

  if (totalRevenue === null || totalCost === null || totalMargin === null || marginPercent === null) {
    return null;
  }

  return {
    total_revenue: round2(totalRevenue),
    total_cost: round2(totalCost),
    total_margin: round2(totalMargin),
    margin_percent: round2(marginPercent),
    total_hours_plan: round2(numberOrNull(order.total_hours_plan, calcData.total_hours_plan) ?? 0),
    production_hours_plastic: round2(numberOrNull(order.production_hours_plastic, calcData.production_hours_plastic) ?? 0),
    production_hours_packaging: round2(numberOrNull(order.production_hours_packaging, calcData.production_hours_packaging) ?? 0),
    production_hours_hardware: round2(numberOrNull(order.production_hours_hardware, calcData.production_hours_hardware) ?? 0),
  };
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as JsonObject;
}

function parseObject(value: JsonValue | undefined): JsonObject {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as JsonValue;
      return asObject(parsed) ?? {};
    } catch {
      return {};
    }
  }
  return asObject(value) ?? {};
}

function numberOrNull(...values: Array<JsonValue | undefined>): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue;
    if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'boolean') continue;
    const number = typeof value === 'string'
      ? Number(value.trim().replace(/[\s\u00a0]+/g, '').replace(',', '.').replace(/[^\d.+-]/g, ''))
      : Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

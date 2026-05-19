import type { CalcOrderResult, JsonObject, JsonValue } from './types.js';
import { calcHardware } from './hardware.js';
import { calcPackaging } from './packaging.js';
import { getProductionParams } from './params.js';
import { charityAmount, commercialAmount, orderDiscount, round2, taxesAmount } from './pricing.js';
import { calcProduct, getPrintingSellPricePerUnit } from './product.js';
import type { OrderInput } from './types.js';

export function calcOrder(input: unknown): CalcOrderResult {
  const snapshot = extractSavedSnapshot(input);
  if (snapshot) return snapshot;
  if (isOrderInput(input)) return calcLiveOrder(input);
  throw new Error('calcOrder input is invalid');
}

function calcLiveOrder(input: OrderInput): CalcOrderResult {
  if (input.pendantItems.length > 0) {
    throw new Error('calcOrder live pendant calculation is not implemented yet');
  }

  const params = getProductionParams(input.settings);
  let grossRevenue = 0;
  let baseCosts = 0;
  let plasticHours = 0;
  let hardwareHours = 0;
  let packagingHours = 0;

  for (const product of input.products) {
    const result = calcProduct(product, params);
    const qty = product.quantity || 0;
    grossRevenue += ((product.sell_price_item || 0) + getPrintingSellPricePerUnit(product)) * qty;
    baseCosts += result.costTotal * qty;
    plasticHours += result.hoursPlasticZone;
    hardwareHours += result.hoursAssemblyZone;
  }

  for (const hardware of input.hardwareItems) {
    const result = calcHardware(hardware, params);
    const qty = hardware.qty || 0;
    grossRevenue += (hardware.sell_price || 0) * qty;
    baseCosts += result.totalCost;
    hardwareHours += result.hoursHardware;
  }

  for (const packaging of input.packagingItems) {
    const result = calcPackaging(packaging, params);
    const qty = packaging.qty || 0;
    grossRevenue += (packaging.sell_price || 0) * qty;
    baseCosts += result.totalCost;
    packagingHours += result.hoursPackaging;
  }

  for (const extra of input.extraCosts) {
    grossRevenue += extra.amount || 0;
  }

  const discount = orderDiscount(grossRevenue, input.discount, params);
  const revenue = discount.revenueAfterDiscount;
  const totalCost = round2(
    baseCosts
    + taxesAmount(revenue, params)
    + commercialAmount(revenue, params)
    + charityAmount(revenue, params)
  );
  const totalMargin = round2(revenue - totalCost);

  return {
    total_revenue: round2(revenue),
    total_cost: totalCost,
    total_margin: totalMargin,
    margin_percent: revenue > 0 ? round2((totalMargin * 100) / revenue) : 0,
    total_hours_plan: round2(plasticHours + hardwareHours + packagingHours),
    production_hours_plastic: round2(plasticHours),
    production_hours_packaging: round2(packagingHours),
    production_hours_hardware: round2(hardwareHours),
  };
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

function isOrderInput(value: unknown): value is OrderInput {
  const root = asObject(value);
  return !!root
    && Array.isArray(root.products)
    && Array.isArray(root.hardwareItems)
    && Array.isArray(root.packagingItems)
    && Array.isArray(root.pendantItems)
    && Array.isArray(root.extraCosts)
    && !!asObject(root.settings);
}

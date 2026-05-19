import type { OrderDiscountInput, ProductionParams } from './types.js';

const DEFAULT_COMMERCIAL_RATE = 0.065;

const TIER_MARGINS = [
  { max: 10, margin: 0.65 },
  { max: 50, margin: 0.60 },
  { max: 100, margin: 0.55 },
  { max: 300, margin: 0.50 },
  { max: 500, margin: 0.45 },
  { max: 1000, margin: 0.40 },
  { max: Number.POSITIVE_INFINITY, margin: 0.35 },
] as const;

export interface PriceInput {
  cost: number;
  params: Partial<ProductionParams>;
  quantity?: number;
  targetMargin?: number;
}

export interface ActualMarginResult {
  earned: number;
  percent: number | null;
}

export interface OrderDiscountResult {
  mode: string;
  inputValue: number;
  amount: number;
  percent: number;
  revenueAfterDiscount: number;
  earnedImpact: number;
}

export function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

export function roundTo5(value: number): number {
  return Math.round((Number(value) || 0) / 5) * 5;
}

export function rateValue(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function vatRate(params: Partial<ProductionParams>): number {
  return rateValue(params.vatRate, 0.05);
}

export function taxRate(params: Partial<ProductionParams>): number {
  return rateValue(params.taxRate, 0.07);
}

export function charityRate(params: Partial<ProductionParams>): number {
  return rateValue(params.charityRate, 0.01);
}

export function commercialRate(params: Partial<ProductionParams>): number {
  return rateValue(params.commercialRate, DEFAULT_COMMERCIAL_RATE);
}

export function netRevenueRetentionRate(params: Partial<ProductionParams>): number {
  return 1 - taxRate(params) - commercialRate(params) - charityRate(params);
}

export function keepRateForTargetMargin(params: Partial<ProductionParams>, margin = 0): number {
  return netRevenueRetentionRate(params) - (Number(margin) || 0);
}

export function taxesAmount(netRevenue: number, params: Partial<ProductionParams>): number {
  return round2((Number(netRevenue) || 0) * taxRate(params));
}

export function commercialAmount(netRevenue: number, params: Partial<ProductionParams>): number {
  return round2((Number(netRevenue) || 0) * commercialRate(params));
}

export function charityAmount(netRevenue: number, params: Partial<ProductionParams>): number {
  return round2((Number(netRevenue) || 0) * charityRate(params));
}

export function marginForQty(quantity: number | undefined, fallbackMargin = 0.55): number {
  const normalizedQty = Number(quantity) || 0;
  if (!(normalizedQty > 0)) return fallbackMargin;
  return TIER_MARGINS.find((tier) => normalizedQty <= tier.max)?.margin ?? 0.35;
}

export function costPrice(cost: number): number {
  return round2(Math.max(0, Number(cost) || 0));
}

export function retailPrice(input: PriceInput): number {
  const cost = costPrice(input.cost);
  if (cost === 0) return 0;
  const targetMargin = Number.isFinite(input.targetMargin)
    ? Number(input.targetMargin)
    : marginForQty(input.quantity, input.params.marginTarget ?? 0.55);
  const keepRate = keepRateForTargetMargin(input.params, targetMargin);
  if (keepRate <= 0 || targetMargin >= 1) return 0;
  return round2(cost / keepRate);
}

export function b2bPrice(input: PriceInput): number {
  return retailPrice(input);
}

export function actualMargin(sellPrice: number, costPerUnit: number, params: Partial<ProductionParams>): ActualMarginResult {
  if (sellPrice <= 0) {
    return {
      earned: round2(-(costPerUnit || 0)),
      percent: null,
    };
  }
  const earned = (sellPrice * netRevenueRetentionRate(params)) - (costPerUnit || 0);
  return {
    earned: round2(earned),
    percent: round2((earned * 100) / sellPrice),
  };
}

export function normalizeOrderDiscount(discount: OrderDiscountInput = {}): Required<OrderDiscountInput> {
  const mode = ['amount', 'percent'].includes(String(discount.mode || '').trim())
    ? String(discount.mode).trim()
    : 'none';
  const value = Number.isFinite(Number(discount.value)) ? Number(discount.value) : 0;
  return {
    mode,
    value: value > 0 ? round2(value) : 0,
  };
}

export function orderDiscount(
  baseRevenue: number,
  discount: OrderDiscountInput = {},
  params: Partial<ProductionParams> = {}
): OrderDiscountResult {
  const safeBase = Math.max(0, Number(baseRevenue) || 0);
  const normalized = normalizeOrderDiscount(discount);
  let amount = 0;
  let percent = 0;

  if (normalized.mode === 'amount') {
    amount = Math.min(safeBase, normalized.value);
    percent = safeBase > 0 ? round2((amount * 100) / safeBase) : 0;
  } else if (normalized.mode === 'percent') {
    percent = Math.min(100, normalized.value);
    amount = round2((safeBase * percent) / 100);
  }

  const keepRate = Math.max(0, netRevenueRetentionRate(params));
  return {
    mode: normalized.mode,
    inputValue: normalized.value,
    amount: round2(amount),
    percent: round2(percent),
    revenueAfterDiscount: round2(Math.max(0, safeBase - amount)),
    earnedImpact: round2(amount * keepRate),
  };
}

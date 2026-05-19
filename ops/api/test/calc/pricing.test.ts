import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  actualMargin,
  b2bPrice,
  charityAmount,
  charityRate,
  commercialAmount,
  commercialRate,
  costPrice,
  keepRateForTargetMargin,
  marginForQty,
  netRevenueRetentionRate,
  normalizeOrderDiscount,
  orderDiscount,
  rateValue,
  retailPrice,
  round2,
  roundTo5,
  taxRate,
  taxesAmount,
  vatRate,
} from '../../src/calc/pricing.js';
import type { ProductionParams } from '../../src/calc/types.js';

const params: Partial<ProductionParams> = {
  taxRate: 0.07,
  charityRate: 0.01,
  commercialRate: 0.065,
  vatRate: 0.05,
  marginTarget: 0.55,
};

test('round2 rounds standard money values', () => {
  assert.equal(round2(10.235), 10.24);
});

test('round2 handles non-numeric input as zero', () => {
  assert.equal(round2(Number.NaN), 0);
});

test('roundTo5 rounds to the nearest five', () => {
  assert.equal(roundTo5(102.49), 100);
  assert.equal(roundTo5(102.5), 105);
});

test('rateValue uses finite value', () => {
  assert.equal(rateValue('0.12', 0.07), 0.12);
});

test('rateValue falls back on invalid value', () => {
  assert.equal(rateValue('nope', 0.07), 0.07);
});

test('vatRate defaults to 5%', () => {
  assert.equal(vatRate({}), 0.05);
});

test('taxRate defaults to 7%', () => {
  assert.equal(taxRate({}), 0.07);
});

test('charityRate defaults to 1%', () => {
  assert.equal(charityRate({}), 0.01);
});

test('commercialRate defaults to 6.5%', () => {
  assert.equal(commercialRate({}), 0.065);
});

test('netRevenueRetentionRate subtracts tax, commercial, and charity', () => {
  assert.equal(netRevenueRetentionRate(params), 0.855);
});

test('keepRateForTargetMargin subtracts target margin from retention', () => {
  assert.equal(keepRateForTargetMargin(params, 0.35), 0.505);
});

test('taxesAmount calculates taxes from net revenue', () => {
  assert.equal(taxesAmount(1000, params), 70);
});

test('commercialAmount calculates commercial expense from net revenue', () => {
  assert.equal(commercialAmount(1000, params), 65);
});

test('charityAmount calculates charity expense from net revenue', () => {
  assert.equal(charityAmount(1000, params), 10);
});

test('marginForQty uses fallback for zero quantity', () => {
  assert.equal(marginForQty(0, 0.42), 0.42);
});

test('marginForQty uses 65% tier up to 10', () => {
  assert.equal(marginForQty(10), 0.65);
});

test('marginForQty uses 60% tier up to 50', () => {
  assert.equal(marginForQty(50), 0.60);
});

test('marginForQty uses 55% tier up to 100', () => {
  assert.equal(marginForQty(100), 0.55);
});

test('marginForQty uses 50% tier up to 300', () => {
  assert.equal(marginForQty(300), 0.50);
});

test('marginForQty uses 45% tier up to 500', () => {
  assert.equal(marginForQty(500), 0.45);
});

test('marginForQty uses 40% tier up to 1000', () => {
  assert.equal(marginForQty(1000), 0.40);
});

test('marginForQty uses 35% tier above 1000', () => {
  assert.equal(marginForQty(1001), 0.35);
});

test('costPrice clamps negative cost to zero', () => {
  assert.equal(costPrice(-50), 0);
});

test('costPrice rounds positive cost', () => {
  assert.equal(costPrice(10.239), 10.24);
});

test('retailPrice returns zero for zero cost', () => {
  assert.equal(retailPrice({ cost: 0, params, quantity: 100 }), 0);
});

test('retailPrice uses quantity tier margin', () => {
  assert.equal(retailPrice({ cost: 100, params, quantity: 1000 }), 219.78);
});

test('retailPrice uses explicit target margin', () => {
  assert.equal(retailPrice({ cost: 100, params, targetMargin: 0.35 }), 198.02);
});

test('retailPrice returns zero when keep rate is non-positive', () => {
  assert.equal(retailPrice({ cost: 100, params, targetMargin: 0.99 }), 0);
});

test('b2bPrice currently follows retail formula until B2B source fields are identified', () => {
  assert.equal(b2bPrice({ cost: 100, params, targetMargin: 0.35 }), 198.02);
});

test('actualMargin returns loss for free sale', () => {
  assert.deepEqual(actualMargin(0, 100, params), { earned: -100, percent: null });
});

test('actualMargin subtracts cost after retained revenue', () => {
  assert.deepEqual(actualMargin(200, 100, params), { earned: 71, percent: 35.5 });
});

test('normalizeOrderDiscount accepts amount mode', () => {
  assert.deepEqual(normalizeOrderDiscount({ mode: 'amount', value: 100.129 }), { mode: 'amount', value: 100.13 });
});

test('normalizeOrderDiscount rejects invalid mode', () => {
  assert.deepEqual(normalizeOrderDiscount({ mode: 'coupon', value: 100 }), { mode: 'none', value: 100 });
});

test('normalizeOrderDiscount clamps negative value to zero', () => {
  assert.deepEqual(normalizeOrderDiscount({ mode: 'amount', value: -10 }), { mode: 'amount', value: 0 });
});

test('orderDiscount amount caps at base revenue', () => {
  assert.deepEqual(orderDiscount(100, { mode: 'amount', value: 150 }, params), {
    mode: 'amount',
    inputValue: 150,
    amount: 100,
    percent: 100,
    revenueAfterDiscount: 0,
    earnedImpact: 85.5,
  });
});

test('orderDiscount percent caps at 100%', () => {
  assert.deepEqual(orderDiscount(200, { mode: 'percent', value: 120 }, params), {
    mode: 'percent',
    inputValue: 120,
    amount: 200,
    percent: 100,
    revenueAfterDiscount: 0,
    earnedImpact: 171,
  });
});

test('orderDiscount none leaves revenue untouched', () => {
  assert.deepEqual(orderDiscount(200, { mode: 'none', value: 50 }, params), {
    mode: 'none',
    inputValue: 50,
    amount: 0,
    percent: 0,
    revenueAfterDiscount: 200,
    earnedImpact: 0,
  });
});

test('orderDiscount handles negative base revenue as zero', () => {
  assert.deepEqual(orderDiscount(-200, { mode: 'percent', value: 10 }, params), {
    mode: 'percent',
    inputValue: 10,
    amount: 0,
    percent: 10,
    revenueAfterDiscount: 0,
    earnedImpact: 0,
  });
});

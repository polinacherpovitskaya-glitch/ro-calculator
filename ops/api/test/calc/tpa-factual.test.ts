import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcFactual } from '../../src/calc/factual.js';
import { calcTpaLive } from '../../src/calc/tpa.js';

test('calcTpaLive ports XPM-17 runtime and price formula', () => {
  assert.deepEqual(calcTpaLive({
    quantity: 1000,
    cavities: 2,
    openingsPerHour: 100,
    weight: 5,
    wasteFactor: 1.1,
    materialCostPerKg: 1000,
    operatorRatePerHour: 100,
    indirectRatePerHour: 10,
    moldCost: 50000,
    setupCost: 1000,
    targetMarginPct: 35,
  }, {
    taxRate: 0.07,
    charityRate: 0.01,
    commercialRate: 0.065,
    vatRate: 0.05,
  }), {
    quantity: 1000,
    cavities: 2,
    openingsPerHour: 100,
    weight: 5,
    piecesPerHour: 200,
    hoursTotal: 5.5,
    plasticPerUnit: 5.5,
    fotPerUnit: 0.55,
    indirectPerUnit: 0.06,
    setupPerUnit: 1,
    runtimePerUnit: 7.11,
    moldPerUnit: 50,
    totalPerUnit: 57.11,
    runtimeTotal: 7110,
    totalCost: 57110,
    sellNoVat: 115,
    sellWithVat: 120.75,
    oneShiftMonthly: 33600,
  });
});

test('calcFactual sums factual expense fields and computes margin', () => {
  assert.deepEqual(calcFactual({
    order_id: 1,
    fact_revenue: 1000,
    fact_salary_production: 100,
    fact_salary_trim: 50,
    fact_indirect_production: 75,
    fact_hardware_total: 25,
    fact_taxes: 70,
    fact_commercial: 65,
    fact_charity: 10,
  }), {
    revenue: 1000,
    cost: 395,
    profit: 605,
    margin: 60.5,
    hasRevenue: true,
    hasCosts: true,
  });
});

test('calcFactual returns null margin without revenue', () => {
  assert.deepEqual(calcFactual({
    order_id: 1,
    fact_revenue: 0,
    fact_other: 100,
  }), {
    revenue: 0,
    cost: 100,
    profit: -100,
    margin: null,
    hasRevenue: false,
    hasCosts: true,
  });
});

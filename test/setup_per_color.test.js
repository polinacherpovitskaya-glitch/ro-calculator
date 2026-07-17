const assert = require('node:assert');
const { test } = require('node:test');
const { getProductionParams, calculateItemCost, getItemColorCount } = require('../js/calculator.js');

const SETTINGS = {
    workers_count: 4, hours_per_worker: 180, work_load_ratio: 0.70,
    indirect_costs_monthly: 1996000, fot_per_hour: 550, indirect_cost_mode: 'all',
    waste_factor: 1.1, plastic_cost_per_kg: 250, cutting_speed: 300,
    plastic_injection_ratio: 0.7, packaging_ratio: 0.3, mold_base_cost: 0,
    tax_rate: 0.07, vat_rate: 0.05, charity_rate: 0.01, margin_target: 0.4,
};

test('getItemColorCount: считает РАЗНЫЕ цвета, дубли — один раз', () => {
    assert.equal(getItemColorCount({}), 1);
    assert.equal(getItemColorCount({ colors: [] }), 1);
    assert.equal(getItemColorCount({ colors: [{ id: 1 }, { id: 2 }] }), 2);
    assert.equal(getItemColorCount({ colors: [{ name: 'красный' }, { name: 'КРАСНЫЙ ' }] }), 1);
    assert.equal(getItemColorCount({ colors: '[{"id":1},{"id":2},{"id":3}]' }), 3);
    assert.equal(getItemColorCount({ color_count: 4 }), 4);
    assert.equal(getItemColorCount({ colors: 'битый json' }), 1);
});

test('запуск умножается на число цветов (3 цвета = +2 запуска)', () => {
    const params = getProductionParams(SETTINGS);
    const base = {
        quantity: 100, pieces_per_hour: 60, weight_grams: 5, setup_hours_override: 0.5,
        extra_molds: 0, complex_design: false, is_nfc: false, nfc_programming: false,
        hardware_qty: 0, packaging_qty: 0, printing_qty: 0, delivery_included: false,
    };
    const one = calculateItemCost({ ...base, colors: [{ id: 1 }] }, params);
    const three = calculateItemCost({ ...base, colors: [{ id: 1 }, { id: 2 }, { id: 3 }] }, params);
    assert.ok(three.costTotal > one.costTotal, '3 цвета должны быть дороже 1');
    // +2 запуска × 0.5ч × (ФОТ+косвенные)/тираж
    const expectedExtra = 2 * 0.5 * (params.fotPerHour + params.indirectPerHour) / 100;
    const delta = three.costTotal - one.costTotal;
    assert.ok(Math.abs(delta - expectedExtra) < 1, `дельта ${delta.toFixed(2)} ≈ ${expectedExtra.toFixed(2)}`);
});

test('одинаковый цвет ×5 = 1 запуск (не дороже одноцветного)', () => {
    const params = getProductionParams(SETTINGS);
    const base = { quantity: 100, pieces_per_hour: 60, weight_grams: 5, setup_hours_override: 0.5 };
    const oneColor = calculateItemCost({ ...base, colors: [{ id: 7 }] }, params);
    const sameFive = calculateItemCost({ ...base, colors: Array(5).fill({ id: 7 }) }, params);
    assert.equal(sameFive.costTotal, oneColor.costTotal);
});

test('каталог/старый заказ без colors — запуск НЕ меняется (colorCount=1)', () => {
    const params = getProductionParams(SETTINGS);
    const catItem = { quantity: 100, pieces_per_hour: 60, weight_grams: 5, setup_hours_override: 0.5 };
    assert.equal(getItemColorCount(catItem), 1);
    const withOneColor = calculateItemCost({ ...catItem, colors: [{ id: 1 }] }, params);
    const noColors = calculateItemCost(catItem, params);
    assert.equal(noColors.costTotal, withOneColor.costTotal);
});

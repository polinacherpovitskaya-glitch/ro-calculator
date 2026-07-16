const assert = require('node:assert');
const { test } = require('node:test');
const {
    getQuarterBounds, quarterTargetHours, computeQuarterLoad, _isSoldOrder,
} = require('../js/production_load.js');

test('getQuarterBounds: середина июля → Q3, 01.07–30.09', () => {
    const b = getQuarterBounds(new Date(2026, 6, 16, 12));
    assert.equal(b.q, 3);
    assert.equal(b.from.getFullYear(), 2026);
    assert.equal(b.from.getMonth(), 6);
    assert.equal(b.from.getDate(), 1);
    assert.equal(b.to.getMonth(), 8);
    assert.equal(b.to.getDate(), 30);
    assert.equal(b.label, 'III квартал');
});

test('quarterTargetHours: сезонный план для квартала', () => {
    const s = { seasonal_load_plan_json: JSON.stringify({ Q1: 768, Q2: 1152, Q3: 1632, Q4: 1824 }) };
    assert.equal(quarterTargetHours(s, new Date(2026, 6, 16)), 1632);
    assert.equal(quarterTargetHours(s, new Date(2026, 0, 10)), 768);
});

test('quarterTargetHours: фолбэк на среднегод, если плана нет', () => {
    const s = { workers_count: 4, hours_per_worker: 180, work_load_ratio: 0.7 };
    assert.equal(quarterTargetHours(s, new Date(2026, 6, 16)), Math.round(4 * 180 * 0.7 * 3));
});

test('computeQuarterLoad: обычный случай — сделано<продано<план', () => {
    const r = computeQuarterLoad({
        planHours: 1632, soldHours: 780, doneHours: 560,
        from: new Date(2026, 6, 1), to: new Date(2026, 8, 30), now: new Date(2026, 7, 19),
    });
    assert.equal(r.gap, 852);
    assert.equal(r.donePct, Math.round(560 / 1632 * 100));
    assert.equal(r.soldPct, Math.round(780 / 1632 * 100));
    assert.equal(r.status, 'behind');
});

test('computeQuarterLoad: перевыполнение — продано>план', () => {
    const r = computeQuarterLoad({
        planHours: 1000, soldHours: 1200, doneHours: 900,
        from: new Date(2026, 6, 1), to: new Date(2026, 8, 30), now: new Date(2026, 8, 15),
    });
    assert.equal(r.gap, 0);
    assert.equal(r.over, 200);
    assert.equal(r.soldPct, 100);
});

test('computeQuarterLoad: производство в сток — сделано>продано', () => {
    const r = computeQuarterLoad({
        planHours: 1000, soldHours: 400, doneHours: 520,
        from: new Date(2026, 6, 1), to: new Date(2026, 8, 30), now: new Date(2026, 7, 1),
    });
    assert.equal(r.stock, 120);
    assert.equal(r.done, 520);
});

test('computeQuarterLoad: пустой квартал', () => {
    const r = computeQuarterLoad({
        planHours: 1000, soldHours: 0, doneHours: 0,
        from: new Date(2026, 6, 1), to: new Date(2026, 8, 30), now: new Date(2026, 6, 2),
    });
    assert.equal(r.gap, 1000);
    assert.equal(r.soldPct, 0);
});

test('_isSoldOrder: отменённые и неоплаченные черновики не в счёт', () => {
    assert.equal(_isSoldOrder({ status: 'completed' }), true);
    assert.equal(_isSoldOrder({ status: 'production_casting' }), true);
    assert.equal(_isSoldOrder({ status: 'cancelled' }), false);
    assert.equal(_isSoldOrder({ status: 'draft', payment_status: 'not_sent' }), false);
    assert.equal(_isSoldOrder({ status: 'draft', payment_status: 'paid_100' }), true);
    assert.equal(_isSoldOrder({ status: 'completed', deleted_at: '2026-01-01' }), false);
});

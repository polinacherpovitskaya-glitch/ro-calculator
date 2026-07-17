const assert = require('node:assert');
const { test } = require('node:test');
const {
    getQuarterBounds, quarterTargetHours, computeQuarterLoad, _isSoldOrder,
    doneHoursForRange, collectQuarterLoad,
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

test('doneHoursForRange: суммирует часы записей в диапазоне (Factual нет → все производственные)', () => {
    const from = new Date(2026, 6, 1), to = new Date(2026, 8, 30, 23, 59);
    const entries = [
        { date: '2026-07-10', hours: 8 },
        { date: '2026-08-02', hours: 5 },
        { date: '2026-06-30', hours: 9 },   // вне квартала
        { date: '2026-10-01', hours: 4 },   // вне квартала
    ];
    assert.equal(doneHoursForRange(entries, from, to), 13);
});

test('collectQuarterLoad: считает продано из заказов и сделано из записей', () => {
    const now = new Date(2026, 7, 19);
    const orders = [
        { status: 'completed', deadline_start: '2026-08-05', total_hours_plan: 40 },
        { status: 'draft', payment_status: 'not_sent', deadline: '2026-08-06', total_hours_plan: 100 }, // не в счёт
        { status: 'cancelled', deadline: '2026-08-07', total_hours_plan: 50 },                          // не в счёт
        { status: 'production_casting', deadline: '2026-08-08', total_hours_plan: 20 },
        { status: 'completed', deadline: '2026-04-01', total_hours_plan: 999 },                          // др. квартал
    ];
    const entries = [{ date: '2026-08-10', hours: 12 }];
    const settings = { seasonal_load_plan_json: JSON.stringify({ Q3: 1632 }) };
    const { load, label, breakdown } = collectQuarterLoad(orders, entries, settings, now);
    assert.equal(load.plan, 1632);
    assert.equal(load.sold, 60);   // 40 + 20
    assert.equal(load.done, 12);
    assert.equal(label, 'III квартал');
    // breakdown для ховера: сделанные часы без order_id -> «вне заказов»
    assert.equal(breakdown.doneRows.length, 1);
    assert.ok(breakdown.doneRows[0].name.includes('вне заказов'));
    assert.equal(breakdown.doneRows[0].hours, 12);
    // remain по проданным заказам квартала: 40 и 20 (ничего не сделано по ним)
    assert.deepEqual(breakdown.remainRows.map(r => r.hours), [40, 20]);
});

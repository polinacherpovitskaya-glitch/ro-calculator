const assert = require('node:assert/strict');
const path = require('node:path');

const {
    buildProductionAvailabilityCalendar,
    quarterTargetHours,
    computeQuarterLoad,
    collectQuarterLoad,
} = require(path.join(__dirname, '..', 'js', 'production_load.js'));

const settings = {
    planning_workers_count: 2,
    planning_hours_per_day: 8,
    work_load_ratio: 0.6,
    seasonal_load_percent_json: JSON.stringify({ Q1: 40, Q2: 60, Q3: 50, Q4: 90 }),
    // This Monday is deliberately a production holiday.
    production_holidays: '2026-07-06',
    // A stale pricing-derived plan must not be used as physical availability.
    seasonal_load_plan_json: JSON.stringify({ Q3: 9999 }),
};

const vacations = [
    { employee_id: 'anna', start_date: '2026-07-07', end_date: '2026-07-08' },
    // The duplicate record must not deduct Anna twice.
    { employee_id: 'anna', start_date: '2026-07-08', end_date: '2026-07-08' },
];

const availability = buildProductionAvailabilityCalendar({
    settings,
    planState: { active_workers_count: 2 },
    vacations,
    from: '2026-07-06',
    to: '2026-07-10',
    now: '2026-07-08',
});

assert.equal(availability.totalHours, 48, 'holiday and one-person vacations must reduce daily capacity');
assert.equal(availability.elapsedHours, 16, 'red marker uses availability through the current workday');
assert.equal(availability.remainingHours, 32, 'future availability excludes the current day');
assert.equal(availability.vacationHours, 16, 'one worker absent for two days costs 16 hours, not 24');
assert.equal(availability.days.find(day => day.date === '2026-07-08').hours, 8, 'duplicate vacation must not remove a second worker');

const overriddenAvailability = buildProductionAvailabilityCalendar({
    settings,
    planState: { active_workers_count: 3 },
    vacations,
    from: '2026-07-06',
    to: '2026-07-10',
    now: '2026-07-08',
});
assert.equal(overriddenAvailability.totalHours, 80, 'the same active-worker override as the production plan is the single staffing source');

const target = quarterTargetHours(settings, '2026-07-08', availability);
assert.equal(target, 24, 'seasonal percent is applied to one physical availability calendar, never stored pricing hours');

const pace = computeQuarterLoad({
    planHours: target,
    doneHours: 16,
    now: '2026-07-08',
    from: '2026-07-06',
    to: '2026-07-10',
    availability,
});
assert.equal(pace.expected, 8, 'expected output follows available work hours, not calendar-day fraction');
assert.equal(pace.variance, 8, 'fact minus expected output is the visible reserve');
assert.equal(pace.varianceDays, 0.5, 'reserve is translated through the remaining team-day capacity');

const orders = [
    { id: 1, order_name: 'Коммерческий заказ', status: 'production', deadline: '2026-07-10', total_hours_plan: 20 },
    { id: 2, order_name: 'Переделка', status: 'production', production_purpose: 'rework', deadline: '2026-07-10', total_hours_plan: 10, total_cost_plan: 5000 },
    { id: 3, order_name: 'Закрыт быстрее плана', status: 'completed', deadline: '2026-07-10', total_hours_plan: 30 },
    { id: 4, order_name: 'Факт без дедлайна в квартале', status: 'completed', deadline: '2026-10-01', total_hours_plan: 0 },
];
const entries = [
    { date: '2026-07-07', order_id: 1, hours: 8 },
    { date: '2026-07-08', order_id: 2, hours: 4 },
    { date: '2026-07-08', order_id: 3, hours: 2 },
    { date: '2026-07-08', order_id: 4, hours: 2 },
    { date: '2026-07-08', project_name: 'Без заказа', hours: 3 },
];
const model = collectQuarterLoad(orders, entries, settings, '2026-07-08', { planState: { active_workers_count: 2 }, vacations });
assert.equal(model.breakdown.scopes.commercial.doneHours, 12, 'commercial fact remains separate, including closed orders');
assert.equal(model.breakdown.scopes.noncommercial.doneHours, 4, 'rework fact remains separate');
assert.equal(model.breakdown.unassignedRows.reduce((sum, row) => sum + row.hours, 0), 3, 'unknown fact is not guessed into a mode');
assert.ok(model.breakdown.scopes.commercial.doneRows.some(row => row.orderId === 4), 'green fact details retain an order even when its deadline lies outside the quarter');
assert.equal(model.breakdown.months[0].scopes.commercial.remainingHours, 12, 'month shows only remaining commercial hours by deadline');
assert.equal(model.breakdown.months[0].scopes.noncommercial.remainingHours, 6, 'month shows only remaining rework hours by deadline');
assert.equal(model.load.sold, 20, 'a completed order must not keep its stale plan in the blue commercial load');
assert.ok(!model.breakdown.scopes.commercial.remainingRows.some(row => row.orderId === 3), 'completed order must not stay in the remaining-hours tooltip');

console.log('calendar-availability-load-smoke: OK');

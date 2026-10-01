const assert = require('node:assert/strict');
const { evaluateDayTotal } = require('../ops/bot/timebot-day-limit');

const taya = { name: 'Тая', daily_hours: 6 };
const standard = { name: 'Илья Теряев', daily_hours: 8 };

assert.equal(evaluateDayTotal(taya, 6).level, 'ok', 'a full normal day is fine');
assert.equal(evaluateDayTotal(taya, 10).level, 'ok', 'honest overtime is fine');
assert.equal(evaluateDayTotal(standard, 16).level, 'ok', 'a long day at twice the norm is still allowed');

assert.equal(
    evaluateDayTotal(taya, 13).level,
    'warn',
    'more than double the norm should be flagged back to the employee'
);
assert.ok(
    evaluateDayTotal(taya, 13).message.includes('13'),
    'the warning should name the running day total'
);

// 2026-09-11: five repeats of a 10h report put Тая at 50h of a 6h day.
const blocked = evaluateDayTotal(taya, 50);
assert.equal(blocked.level, 'block', 'a day that cannot physically exist must be refused');
assert.ok(blocked.message.includes('50'), 'the refusal should name the total it refused');

assert.equal(evaluateDayTotal(standard, 24).level, 'warn', '24h is the last plausible total');
assert.equal(evaluateDayTotal(standard, 24.5).level, 'block', 'past 24h in one day nothing is plausible');

// Employees without a configured norm must not be blocked by accident.
assert.equal(evaluateDayTotal({ name: 'Без нормы' }, 8).level, 'ok', 'a missing norm falls back to a sane day');
assert.equal(evaluateDayTotal(null, 8).level, 'ok', 'a missing employee must not throw');
assert.equal(evaluateDayTotal(null, 30).level, 'block', 'the 24h ceiling applies with or without a norm');

console.log('timebot day limit smoke OK');

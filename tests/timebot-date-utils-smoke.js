const assert = require('node:assert/strict');
const {
    getLocalDate,
    shiftYmd,
    isWeekendYmd,
    normalizeWorkDate,
} = require('../bot/timebot-date-utils');

assert.equal(getLocalDate(3, new Date('2026-03-20T22:30:00Z')), '2026-03-21');
assert.equal(shiftYmd('2026-03-23', -1), '2026-03-22');
assert.equal(isWeekendYmd('2026-03-21'), true);
assert.equal(normalizeWorkDate('2026-03-21', new Set()), '2026-03-20');
assert.equal(normalizeWorkDate('2026-03-22', new Set()), '2026-03-20');
assert.equal(normalizeWorkDate('2026-03-23', new Set(['2026-03-23'])), '2026-03-20');

console.log('timebot date utils smoke checks passed');

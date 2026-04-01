const assert = require('node:assert/strict');
const {
    looksLikeFreeformBatchReport,
    parseFreeformBatchReport,
} = require('../bot/timebot-freeform-parser');

const report = [
    '25.03 - Сплат картхолдеры / Выливание пластика — 9ч',
    '26.03 - Сплат картхолдеры / Выливание пластика — 9ч',
    '27.03 - Сплат картхолдеры / Выливание пластика — 9ч',
    '30.03 - Сплат картхолдеры / Выливание пластика — 9ч',
    '31.03 - Сплат картхолдеры / Выливание пластика — 9ч',
].join('\n');

assert.equal(looksLikeFreeformBatchReport(report), true);

const parsed = parseFreeformBatchReport(report, {
    now: new Date('2026-04-01T12:00:00Z'),
});

assert.equal(parsed.errors.length, 0);
assert.equal(parsed.entries.length, 5);
assert.deepEqual(parsed.entries.map(item => item.date), [
    '2026-03-25',
    '2026-03-26',
    '2026-03-27',
    '2026-03-30',
    '2026-03-31',
]);
assert.equal(parsed.entries[0].project_name, 'Сплат картхолдеры');
assert.equal(parsed.entries[0].stage, 'casting');
assert.equal(parsed.entries[0].stage_label, 'Выливание пластика');
assert.equal(parsed.entries[0].hours, 9);

console.log('timebot freeform parser smoke checks passed');

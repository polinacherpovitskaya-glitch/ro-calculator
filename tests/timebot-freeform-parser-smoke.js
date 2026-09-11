const assert = require('node:assert/strict');
const {
    looksLikeFreeformBatchReport,
    parseFreeformBatchReport,
} = require('../ops/bot/timebot-freeform-parser');

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

const groupedReport = [
    '24.07:',
    'Т-банк Амбассадоры / Выливание пластика — 1ч',
    'Расчески chi / Проверка расчесок — 2,5ч',
    '',
    '27.07.2026:',
    'Т-банк Амбассадоры / Сборка — 1.5ч',
].join('\n');

assert.equal(looksLikeFreeformBatchReport(groupedReport), true);

const grouped = parseFreeformBatchReport(groupedReport, {
    now: new Date('2026-07-27T12:00:00Z'),
});

assert.equal(grouped.errors.length, 0);
assert.deepEqual(grouped.entries.map(item => item.date), [
    '2026-07-24',
    '2026-07-24',
    '2026-07-27',
]);
assert.deepEqual(grouped.entries.map(item => item.hours), [1, 2.5, 1.5]);
assert.equal(grouped.entries[1].project_name, 'Расчески chi');
assert.equal(grouped.entries[1].stage, 'other');
assert.equal(grouped.entries[1].stage_label, 'Проверка расчесок');

const incompleteGrouped = parseFreeformBatchReport([
    '24.07:',
    'Обычный комментарий без часов',
].join('\n'), {
    now: new Date('2026-07-27T12:00:00Z'),
});

assert.equal(incompleteGrouped.entries.length, 0);
assert.equal(incompleteGrouped.errors.length, 1);
assert.equal(looksLikeFreeformBatchReport('24.07:\nОбычный комментарий без часов'), false);

// A date heading written without a trailing colon must still switch the day.
// Женя's 2026-09-09 report opened with a bare "8.09", the batch was rejected,
// and all six entries — four of them the 8th's work — were stored as the 9th.
const bareHeading = parseFreeformBatchReport([
    '8.09',
    'Буквы Яндекс / Выливание пластика — 2ч',
    'Бусины / Срезание литника — 0.5ч',
    '',
    '9.09:',
    'Бусины / Срезание литника — 0.5ч',
    'RO сток / Выливание пластика — 8.5ч',
].join('\n'), {
    now: new Date('2026-09-09T12:00:00Z'),
});

assert.equal(bareHeading.errors.length, 0, 'a heading without a colon should not break the batch');
assert.deepEqual(bareHeading.entries.map(item => item.date), [
    '2026-09-08',
    '2026-09-08',
    '2026-09-09',
    '2026-09-09',
]);
assert.deepEqual(bareHeading.entries.map(item => item.hours), [2, 0.5, 0.5, 8.5]);
assert.equal(
    looksLikeFreeformBatchReport('8.09\nБусины / Срезание литника — 0.5ч'),
    true,
    'a bare date heading should still be recognised as a batch report'
);

// A bare number pair is only a heading — never an entry that lost its hours.
assert.equal(
    looksLikeFreeformBatchReport('8.09\nОбычный комментарий без часов'),
    false,
    'lines without hours still make the batch unparseable'
);

console.log('timebot freeform parser smoke checks passed');

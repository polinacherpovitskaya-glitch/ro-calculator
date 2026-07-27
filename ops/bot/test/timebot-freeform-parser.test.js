const test = require('node:test');
const assert = require('node:assert/strict');
const {
    looksLikeFreeformBatchReport,
    parseFreeformBatchReport,
} = require('../timebot-freeform-parser');

test('parses task lines grouped under date headings', () => {
    const report = [
        '24.07:',
        'Т-банк Амбассадоры / Выливание пластика — 1ч',
        'Расчески chi / Проверка расчесок — 2,5ч',
        '',
        '27.07.2026:',
        'Т-банк Амбассадоры / Сборка — 1.5ч',
    ].join('\n');

    assert.equal(looksLikeFreeformBatchReport(report), true);

    const parsed = parseFreeformBatchReport(report, {
        now: new Date('2026-07-27T12:00:00Z'),
    });

    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.entries.map(entry => ({
        date: entry.date,
        project: entry.project_name,
        stage: entry.stage,
        stageLabel: entry.stage_label,
        hours: entry.hours,
    })), [
        {
            date: '2026-07-24',
            project: 'Т-банк Амбассадоры',
            stage: 'casting',
            stageLabel: 'Выливание пластика',
            hours: 1,
        },
        {
            date: '2026-07-24',
            project: 'Расчески chi',
            stage: 'other',
            stageLabel: 'Проверка расчесок',
            hours: 2.5,
        },
        {
            date: '2026-07-27',
            project: 'Т-банк Амбассадоры',
            stage: 'assembly',
            stageLabel: 'Сборка',
            hours: 1.5,
        },
    ]);
});

test('keeps supporting a date on every task line', () => {
    const parsed = parseFreeformBatchReport([
        '24.07 - Проект А / Сборка — 3ч',
        '27.07 - Проект Б / Упаковка — 4ч',
    ].join('\n'), {
        now: new Date('2026-07-27T12:00:00Z'),
    });

    assert.deepEqual(parsed.errors, []);
    assert.deepEqual(parsed.entries.map(entry => entry.date), [
        '2026-07-24',
        '2026-07-27',
    ]);
});

test('does not classify an ordinary dated comment as a batch report', () => {
    const text = '24.07:\nСобрали заказ и проверили качество';
    const parsed = parseFreeformBatchReport(text, {
        now: new Date('2026-07-27T12:00:00Z'),
    });

    assert.equal(parsed.entries.length, 0);
    assert.equal(parsed.errors.length, 1);
    assert.equal(looksLikeFreeformBatchReport(text), false);
});

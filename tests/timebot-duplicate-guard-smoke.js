const assert = require('node:assert/strict');
const {
    isSameTimeEntry,
    splitDuplicateEntries,
} = require('../ops/bot/timebot-duplicate-guard');

const meta = (stageLabel, project) =>
    `[meta]${JSON.stringify({ stage: 'casting', stage_label: stageLabel, project })}[/meta] `;

// --- isSameTimeEntry: matching by order id ---------------------------------

assert.equal(
    isSameTimeEntry(
        { date: '2026-09-11', hours: 10, order_id: 42, task_description: meta('Выливание пластика', 'Сток для RO') },
        { date: '2026-09-11', hours: 10, order_id: 42, stage_label: 'Выливание пластика', project_name: 'Сток для RO' }
    ),
    true,
    'same day, hours, stage and order should be treated as the same entry'
);

assert.equal(
    isSameTimeEntry(
        { date: '2026-09-11', hours: 10, order_id: 42, task_description: meta('Выливание пластика', 'Сток для RO') },
        { date: '2026-09-11', hours: 10, order_id: 43, stage_label: 'Выливание пластика', project_name: 'Сток для RO' }
    ),
    false,
    'different orders are different entries even when everything else matches'
);

// --- isSameTimeEntry: free-text projects without an order ------------------

assert.equal(
    isSameTimeEntry(
        { date: '2026-09-11', hours: 10, order_id: null, task_description: meta('Выливание пластика', 'Сток для RO') },
        { date: '2026-09-11', hours: 10, order_id: null, stage_label: 'выливание  пластика', project_name: '  сток для RO ' }
    ),
    true,
    'free-text projects should match ignoring case and extra spaces'
);

assert.equal(
    isSameTimeEntry(
        { date: '2026-09-11', hours: 10, order_id: null, task_description: meta('Выливание пластика', 'Сток для RO') },
        { date: '2026-09-11', hours: 10, order_id: null, stage_label: 'Сборка', project_name: 'Сток для RO' }
    ),
    false,
    'a different stage on the same project is a separate entry'
);

assert.equal(
    isSameTimeEntry(
        { date: '2026-09-11', hours: 10, order_id: null, task_description: meta('Выливание пластика', 'Сток для RO') },
        { date: '2026-09-11', hours: 4, order_id: null, stage_label: 'Выливание пластика', project_name: 'Сток для RO' }
    ),
    false,
    'a different number of hours is a separate entry'
);

assert.equal(
    isSameTimeEntry(
        { date: '2026-09-11', hours: 10, order_id: null, task_description: meta('Выливание пластика', 'Сток для RO') },
        { date: '2026-09-10', hours: 10, order_id: null, stage_label: 'Выливание пластика', project_name: 'Сток для RO' }
    ),
    false,
    'the same work on another day is a separate entry'
);

// --- splitDuplicateEntries: only ever compares against stored rows ---------
// 2026-09-11: Тая sent the same 10h casting report several times and the bot
// stored every one of them, reporting 833% of a 6h day.

const repeated = Array.from({ length: 5 }, () => ({
    date: '2026-09-11',
    hours: 10,
    order_id: null,
    stage_label: 'Выливание пластика',
    project_name: 'Сток для RO',
}));

const alreadySaved = splitDuplicateEntries(
    [{ date: '2026-09-11', hours: 10, order_id: null, task_description: meta('Выливание пластика', 'Сток для RO') }],
    repeated
);
assert.equal(alreadySaved.toInsert.length, 0, 'a report the day already has must not be stored again');
assert.equal(alreadySaved.duplicates.length, 5, 'every repeat of a stored entry should be reported back');

// Repeats inside ONE submission are NOT dropped. The interactive flow stamps
// every entry of a session with the same date, so a multi-day report arrives
// as several identical-looking entries — Женя's 2026-07-21 report held 9h of
// Т-банк casting for the 17th, the 20th and the 21st. Collapsing those would
// silently destroy two days of work; they are stored and repaired by date
// instead.
const sameSubmission = splitDuplicateEntries([], repeated);
assert.equal(sameSubmission.toInsert.length, 5, 'entries from one submission must all be stored');
assert.equal(sameSubmission.duplicates.length, 0, 'entries from one submission are never duplicates');

// Distinct work must survive regardless.
const mixed = splitDuplicateEntries([], [
    { date: '2026-09-11', hours: 4, order_id: 42, stage_label: 'Выливание пластика', project_name: 'Сток для RO' },
    { date: '2026-09-11', hours: 4, order_id: 42, stage_label: 'Сборка', project_name: 'Сток для RO' },
    { date: '2026-09-11', hours: 2, order_id: 43, stage_label: 'Сборка', project_name: 'Котовозы' },
]);
assert.equal(mixed.toInsert.length, 3, 'genuinely different entries must all be stored');
assert.equal(mixed.duplicates.length, 0, 'genuinely different entries are not duplicates');

console.log('timebot duplicate guard smoke OK');

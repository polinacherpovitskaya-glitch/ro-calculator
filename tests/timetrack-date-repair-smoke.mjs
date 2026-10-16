import assert from 'node:assert/strict';
import { planDateRepair } from '../scripts/timetrack-date-repair-core.mjs';

const meta = (stageLabel, project) =>
    `[meta]${JSON.stringify({ stage: 'casting', stage_label: stageLabel, project })}[/meta]`;

// Женя's 2026-07-21 submission: three 9h Т-банк casting days stamped with one
// date, and the report text itself says which days they were.
const notes = [
    '17.07:',
    'Т-банк Амбассадоры / Выливание пластика — 9ч',
    '',
    '20.07:',
    'Т-банк Амбассадоры / Выливание пластика — 9ч',
    '',
    '21.07:',
    'Т-банк Амбассадоры / Выливание пластика — 9ч',
].join('\n');

const row = id => ({
    id,
    date: '2026-07-21',
    hours: 9,
    order_id: null,
    employee_name: 'Женя Г',
    task_description: meta('Выливание пластика', 'Т-банк Амбассадоры'),
    notes,
});

const plan = planDateRepair([row(1), row(2), row(3)]);

assert.equal(plan.moves.length, 2, 'two of the three days must be moved off the report date');
assert.deepEqual(
    plan.moves.map(move => move.to).sort(),
    ['2026-07-17', '2026-07-20'],
    'each entry should land on the day its own report names'
);
assert.equal(plan.unmatched.length, 0, 'every entry is accounted for by the report text');

// An entry the text does not describe is reported, never guessed at.
const stray = planDateRepair([
    row(1), row(2), row(3),
    { ...row(4), hours: 3, task_description: meta('Сборка', 'Другой проект') },
]);
assert.equal(stray.moves.length, 2, 'the stray entry must not disturb the matched ones');
assert.equal(stray.unmatched.length, 1, 'the stray entry is reported as unmatched');
assert.equal(stray.unmatched[0].id, 4);

// Entries without a multi-day report are left alone entirely.
const plain = planDateRepair([{ ...row(9), notes: 'просто комментарий' }]);
assert.equal(plain.moves.length, 0, 'a plain comment is not a multi-day report');
assert.equal(plain.unmatched.length, 0, 'a plain comment produces no findings');

// Already-correct dates produce no move.
const correct = planDateRepair([{ ...row(5), date: '2026-07-17' }]);
assert.equal(correct.moves.length, 0, 'an entry already on its reported day is left as it is');

console.log('timetrack date repair smoke OK');

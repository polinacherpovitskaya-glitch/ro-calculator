#!/usr/bin/env node
// Puts time entries back on the day their own report names.
//
// Multi-day reports used to fall through to the interactive flow, which stamps
// every entry of a session with one date. The report text stayed in the entry
// notes, so the correct day is recoverable. Dry run by default.
//
//   node scripts/repair-timetrack-collapsed-dates.mjs
//   node scripts/repair-timetrack-collapsed-dates.mjs --apply-dates
//   node scripts/repair-timetrack-collapsed-dates.mjs --delete-ids=1,2,3
//
// Needs OPS_API_URL and OPS_BOT_TOKEN in the environment.

import { platformQuery, platformSelectAll, platformDelete } from './platform-compat-client.mjs';
import { planDateRepair } from './timetrack-date-repair-core.mjs';

const args = process.argv.slice(2);
const applyDates = args.includes('--apply-dates');
const deleteArg = args.find(arg => arg.startsWith('--delete-ids='));
const deleteIds = deleteArg
    ? deleteArg.slice('--delete-ids='.length).split(',').map(id => id.trim()).filter(Boolean)
    : [];

function hours(list) {
    return list.reduce((sum, item) => sum + (Number(item.hours) || 0), 0);
}

async function main() {
    const rows = await platformSelectAll('time_entries', { orders: [{ column: 'date', ascending: true }] });
    console.log(`Прочитано записей: ${rows.length}`);

    const { moves, unmatched } = planDateRepair(rows);

    if (!moves.length) {
        console.log('Записей с неверной датой не найдено.');
    } else {
        const byDay = new Map();
        moves.forEach(move => {
            const key = `${move.employee_name}  ${move.from} → ${move.to}`;
            byDay.set(key, (byDay.get(key) || 0) + move.hours);
        });
        console.log(`\nПереставить дату: ${moves.length} записей, ${hours(moves)}ч`);
        [...byDay.entries()].sort().forEach(([key, total]) => console.log(`  ${key}   ${total}ч`));
    }

    if (unmatched.length) {
        console.log(`\nНе сопоставлено с текстом отчёта (не трогаю): ${unmatched.length}`);
        unmatched.forEach(row => {
            console.log(`  ${row.employee_name} ${row.date} ${row.project} / ${row.stage_label} — ${row.hours}ч  (id ${row.id})`);
        });
    }

    if (deleteIds.length) {
        const targets = rows.filter(row => deleteIds.includes(String(row.id)));
        console.log(`\nУдалить: ${targets.length} из ${deleteIds.length} запрошенных, ${hours(targets)}ч`);
        targets.forEach(row => console.log(`  ${row.employee_name} ${row.date} — ${row.hours}ч  (id ${row.id})`));
        if (targets.length !== deleteIds.length) {
            throw new Error('Не все запрошенные id найдены — ничего не удаляю.');
        }
    }

    if (!applyDates && !deleteIds.length) {
        console.log('\nСухой прогон. Ничего не изменено.');
        console.log('Применить даты: --apply-dates   Удалить: --delete-ids=...');
        return;
    }

    if (applyDates) {
        let done = 0;
        for (const move of moves) {
            await platformQuery('time_entries', {
                action: 'update',
                values: { date: move.to },
                filters: [{ op: 'eq', column: 'id', value: move.id }],
                returning: false,
            });
            done += 1;
        }
        console.log(`\nДаты обновлены: ${done}`);
    }

    for (const id of deleteIds) {
        await platformDelete('time_entries', [{ op: 'eq', column: 'id', value: Number(id) }]);
    }
    if (deleteIds.length) console.log(`Удалено записей: ${deleteIds.length}`);
}

main().catch(error => {
    console.error(error.message || error);
    process.exit(1);
});

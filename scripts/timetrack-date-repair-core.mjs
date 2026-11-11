// Works out which stored time entries carry the wrong date.
//
// Until the parser learned to read every day heading, a multi-day report sent
// to the bot fell through to the interactive flow, which stamps every entry of
// a session with a single date. The report text survived in the entry's notes,
// so each entry can be put back on the day its own text names.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseFreeformBatchReport } = require('../ops/bot/timebot-freeform-parser.js');
const { readEntryMeta, normalizeLookupText } = require('../ops/bot/timebot-duplicate-guard.js');

function sessionKey(row) {
    return `${row?.employee_name || ''}|${row?.date || ''}`;
}

// The report was written on the day it was submitted, so that date is what
// resolves a bare "17.07" to a year.
function reportedDays(notes, submittedOn) {
    const text = String(notes || '');
    if (!text.includes('\n')) return [];
    const parsed = parseFreeformBatchReport(text, { now: new Date(`${submittedOn}T12:00:00Z`) });
    if (!parsed.entries.length) return [];
    return parsed.entries;
}

function sameWork(line, row) {
    const meta = readEntryMeta(row.task_description);
    return normalizeLookupText(line.project_name) === normalizeLookupText(meta.project)
        && normalizeLookupText(line.stage_label) === normalizeLookupText(meta.stage_label)
        && Math.abs(Number(line.hours) - Number(row.hours)) < 0.001;
}

/**
 * Returns the date changes the stored rows need, plus the rows whose own
 * report text does not describe them — those are listed, never guessed at.
 */
export function planDateRepair(rows) {
    const sessions = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
        const key = sessionKey(row);
        if (!sessions.has(key)) sessions.set(key, []);
        sessions.get(key).push(row);
    });

    const moves = [];
    const unmatched = [];

    sessions.forEach(sessionRows => {
        const pool = reportedDays(sessionRows[0]?.notes, sessionRows[0]?.date);
        if (!pool.length) return;

        const available = pool.slice();
        sessionRows.forEach(row => {
            const index = available.findIndex(line => sameWork(line, row));
            if (index === -1) {
                unmatched.push({
                    id: row.id,
                    date: row.date,
                    hours: row.hours,
                    employee_name: row.employee_name,
                    project: readEntryMeta(row.task_description).project,
                    stage_label: readEntryMeta(row.task_description).stage_label,
                });
                return;
            }
            const line = available.splice(index, 1)[0];
            if (line.date !== row.date) {
                moves.push({
                    id: row.id,
                    employee_name: row.employee_name,
                    from: row.date,
                    to: line.date,
                    hours: Number(row.hours),
                    project: line.project_name,
                    stage_label: line.stage_label,
                });
            }
        });
    });

    return { moves, unmatched };
}

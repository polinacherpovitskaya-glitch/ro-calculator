// Shared duplicate detection for time entries.
//
// Both report paths write into the same table, so they have to agree on what
// "the same entry" means: the freeform batch parser (a text list of days) and
// the interactive /report flow (project → stage → hours buttons). The
// interactive flow used to skip this check entirely, which let a repeated
// report land in the table several times — on 2026-09-11 one 10h casting
// report was stored five times and showed up as 833% of a 6h day.

const { normalizeText } = require('./timebot-freeform-parser');

function normalizeLookupText(value) {
    return normalizeText(value).replace(/[«»"'()]/g, '').trim();
}

function round2(n) {
    return Math.round((parseFloat(n) || 0) * 100) / 100;
}

function readEntryMeta(taskDescription) {
    const markerMatch = String(taskDescription || '').match(/^\[meta\](\{.*?\})\[\/meta\]/);
    if (!markerMatch) return { stage_label: '', project: '' };
    try {
        const parsed = JSON.parse(markerMatch[1]);
        return {
            stage_label: parsed?.stage_label || '',
            project: parsed?.project || '',
        };
    } catch (e) {
        return { stage_label: '', project: '' };
    }
}

/**
 * `existing` is a stored time_entries row, `candidate` a parsed report entry.
 */
function isSameTimeEntry(existing, candidate) {
    if (!existing || !candidate) return false;
    if (String(existing.date || '') !== String(candidate.date || '')) return false;
    if (round2(existing.hours) !== round2(candidate.hours)) return false;

    const existingMeta = readEntryMeta(existing.task_description);
    if (normalizeLookupText(existingMeta.stage_label) !== normalizeLookupText(candidate.stage_label)) {
        return false;
    }

    const existingOrderId = Number(existing.order_id || 0);
    const candidateOrderId = Number(candidate.order_id || 0);
    if (existingOrderId && candidateOrderId) {
        return existingOrderId === candidateOrderId;
    }

    return normalizeLookupText(existingMeta.project) === normalizeLookupText(candidate.project_name);
}

/**
 * Splits candidates into the ones worth storing and the ones the day already
 * has, so that re-sending a report does not multiply the hours.
 *
 * Only stored rows are compared against. Repeats *within one submission* are
 * kept on purpose: the interactive flow stamps every entry of a session with
 * the same report date, so a multi-day report reaches this point as several
 * identical-looking entries. Женя's 2026-07-21 report carried 9h of Т-банк
 * casting for the 17th, the 20th and the 21st that way. Dropping them would
 * destroy two days of work that can otherwise be repaired by date.
 */
function splitDuplicateEntries(existingRows, candidates) {
    const stored = Array.isArray(existingRows) ? existingRows : [];
    const toInsert = [];
    const duplicates = [];

    (Array.isArray(candidates) ? candidates : []).forEach(candidate => {
        if (stored.some(row => isSameTimeEntry(row, candidate))) {
            duplicates.push(candidate);
            return;
        }
        toInsert.push(candidate);
    });

    return { toInsert, duplicates };
}

module.exports = {
    normalizeLookupText,
    readEntryMeta,
    isSameTimeEntry,
    splitDuplicateEntries,
};

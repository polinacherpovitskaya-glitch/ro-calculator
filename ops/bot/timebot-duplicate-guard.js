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
 * Splits candidates into the ones worth storing and the ones already covered —
 * either by a row already in the table or by an earlier candidate in the same
 * batch, so that repeating a report never multiplies the hours.
 */
function splitDuplicateEntries(existingRows, candidates) {
    const seen = (Array.isArray(existingRows) ? existingRows : []).slice();
    const toInsert = [];
    const duplicates = [];

    (Array.isArray(candidates) ? candidates : []).forEach(candidate => {
        if (seen.some(row => isSameTimeEntry(row, candidate))) {
            duplicates.push(candidate);
            return;
        }
        toInsert.push(candidate);
        seen.push({
            date: candidate.date,
            hours: candidate.hours,
            order_id: candidate.order_id || null,
            task_description: `[meta]${JSON.stringify({
                stage_label: candidate.stage_label || '',
                project: candidate.project_name || '',
            })}[/meta]`,
        });
    });

    return { toInsert, duplicates };
}

module.exports = {
    normalizeLookupText,
    readEntryMeta,
    isSameTimeEntry,
    splitDuplicateEntries,
};

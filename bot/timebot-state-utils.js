const STATE_TTL = 30 * 60 * 1000;
const DESCRIPTION_STATE_TTL = 24 * 60 * 60 * 1000;

function requiresCommentToSave(employee) {
    return Boolean(employee && employee.tasks_required);
}

function getStateTtlMs(state) {
    if (state && state.step === 'enter_description' && Array.isArray(state.entries) && state.entries.length) {
        return DESCRIPTION_STATE_TTL;
    }
    return STATE_TTL;
}

module.exports = {
    STATE_TTL,
    DESCRIPTION_STATE_TTL,
    requiresCommentToSave,
    getStateTtlMs,
};

const path = require('node:path');

const STATE_TTL = 24 * 60 * 60 * 1000;
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

function getTimebotRuntimePaths(baseDir, env = process.env) {
    const configuredDir = String(env.TIMEBOT_STATE_DIR || '').trim();
    const stateDir = configuredDir ? path.resolve(configuredDir) : path.resolve(baseDir);
    return {
        stateDir,
        stateFile: path.join(stateDir, 'timebot.state.json'),
        pendingFile: path.join(stateDir, 'timebot.pending.json'),
        inboxFile: path.join(stateDir, 'timebot.inbox.jsonl'),
        healthFile: path.join(stateDir, 'timebot.health.json'),
    };
}

module.exports = {
    STATE_TTL,
    DESCRIPTION_STATE_TTL,
    requiresCommentToSave,
    getStateTtlMs,
    getTimebotRuntimePaths,
};

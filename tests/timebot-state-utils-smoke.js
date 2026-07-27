const assert = require('node:assert/strict');
const {
    STATE_TTL,
    DESCRIPTION_STATE_TTL,
    requiresCommentToSave,
    getStateTtlMs,
    getTimebotRuntimePaths,
} = require('../ops/bot/timebot-state-utils');

assert.equal(getStateTtlMs(null), STATE_TTL, 'empty state should use default ttl');
assert.equal(
    getStateTtlMs({ step: 'choose_project', entries: [{ hours: 1 }] }),
    STATE_TTL,
    'non-description state should stay alive for the full report ttl'
);
assert.equal(
    getStateTtlMs({ step: 'enter_description', entries: [{ hours: 1 }] }),
    DESCRIPTION_STATE_TTL,
    'description state with pending entries should stay alive longer'
);
assert.equal(STATE_TTL, 24 * 60 * 60 * 1000, 'unfinished reports should survive a full day');
assert.equal(DESCRIPTION_STATE_TTL, STATE_TTL, 'all active report steps should share the durable ttl');
assert.deepEqual(
    getTimebotRuntimePaths('/app', { TIMEBOT_STATE_DIR: '/app/state' }),
    {
        stateDir: '/app/state',
        stateFile: '/app/state/timebot.state.json',
        pendingFile: '/app/state/timebot.pending.json',
        inboxFile: '/app/state/timebot.inbox.jsonl',
        healthFile: '/app/state/timebot.health.json',
    },
    'server runtime files should live in the persistent state directory'
);
assert.equal(
    requiresCommentToSave({ tasks_required: true }),
    true,
    'employees with required tasks should still go through comment step before save'
);
assert.equal(
    requiresCommentToSave({ tasks_required: false }),
    false,
    'employees without required comment should save immediately on finish'
);
assert.equal(
    requiresCommentToSave(null),
    false,
    'missing employee config should default to safe immediate save for optional comments'
);

console.log('timebot state utils smoke checks passed');

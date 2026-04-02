const assert = require('node:assert/strict');
const {
    STATE_TTL,
    DESCRIPTION_STATE_TTL,
    getStateTtlMs,
} = require('../bot/timebot-state-utils');

assert.equal(getStateTtlMs(null), STATE_TTL, 'empty state should use default ttl');
assert.equal(
    getStateTtlMs({ step: 'choose_project', entries: [{ hours: 1 }] }),
    STATE_TTL,
    'non-description state should use default ttl'
);
assert.equal(
    getStateTtlMs({ step: 'enter_description', entries: [{ hours: 1 }] }),
    DESCRIPTION_STATE_TTL,
    'description state with pending entries should stay alive longer'
);

console.log('timebot state utils smoke checks passed');

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const {
    DESCRIPTION_STATE_TTL,
    STATE_TTL,
    getStateTtlMs,
    getTimebotRuntimePaths,
} = require('../timebot-state-utils');

test('all active report states stay alive for a full day', () => {
    assert.equal(STATE_TTL, 24 * 60 * 60 * 1000);
    assert.equal(DESCRIPTION_STATE_TTL, STATE_TTL);
    assert.equal(getStateTtlMs({ step: 'choose_project', entries: [] }), STATE_TTL);
    assert.equal(getStateTtlMs({ step: 'enter_description', entries: [{ hours: 8 }] }), STATE_TTL);
});

test('getTimebotRuntimePaths uses the configured persistent state directory', () => {
    const paths = getTimebotRuntimePaths('/app', { TIMEBOT_STATE_DIR: '/app/state' });
    assert.deepEqual(paths, {
        stateDir: path.resolve('/app/state'),
        stateFile: path.resolve('/app/state/timebot.state.json'),
        pendingFile: path.resolve('/app/state/timebot.pending.json'),
        inboxFile: path.resolve('/app/state/timebot.inbox.jsonl'),
    });
});

test('getTimebotRuntimePaths falls back to the bot directory', () => {
    const paths = getTimebotRuntimePaths('/srv/bot', {});
    assert.equal(paths.stateDir, path.resolve('/srv/bot'));
    assert.equal(paths.stateFile, path.resolve('/srv/bot/timebot.state.json'));
});

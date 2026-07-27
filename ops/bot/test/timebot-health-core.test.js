const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    DEFAULT_HEALTH_MAX_AGE_MS,
    normalizeHealthErrorCode,
    validateTimebotHealthSnapshot,
} = require('../timebot-health-core');

const NOW = Date.parse('2026-07-27T20:00:00.000Z');

function healthySnapshot(overrides = {}) {
    return {
        ok: true,
        polling: true,
        telegram_ok: true,
        database_ok: true,
        checked_at: '2026-07-27T19:59:00.000Z',
        ...overrides,
    };
}

test('accepts a fresh healthy timebot snapshot', () => {
    const result = validateTimebotHealthSnapshot(healthySnapshot(), { nowMs: NOW });
    assert.deepEqual(result, {
        ok: true,
        age_ms: 60_000,
        issues: [],
    });
});

test('rejects a stale heartbeat', () => {
    const result = validateTimebotHealthSnapshot(healthySnapshot({
        checked_at: new Date(NOW - DEFAULT_HEALTH_MAX_AGE_MS - 1).toISOString(),
    }), { nowMs: NOW });

    assert.equal(result.ok, false);
    assert.match(result.issues[0], /^heartbeat_stale_/);
});

test('reports every failed self-check', () => {
    const result = validateTimebotHealthSnapshot(healthySnapshot({
        ok: false,
        polling: false,
        telegram_ok: false,
        database_ok: false,
    }), { nowMs: NOW });

    assert.deepEqual(result.issues, [
        'self_check_unhealthy',
        'telegram_polling_inactive',
        'telegram_probe_failed',
        'database_probe_failed',
    ]);
});

test('rejects missing and malformed snapshots', () => {
    assert.equal(validateTimebotHealthSnapshot(null, { nowMs: NOW }).ok, false);
    assert.deepEqual(
        validateTimebotHealthSnapshot(healthySnapshot({ checked_at: 'not-a-date' }), { nowMs: NOW }).issues,
        ['checked_at_missing_or_invalid']
    );
});

test('normalizes health errors without leaking full messages or URLs', () => {
    assert.equal(normalizeHealthErrorCode({ code: 'ETIMEDOUT' }), 'ETIMEDOUT');
    assert.equal(normalizeHealthErrorCode({ response: { statusCode: 502 } }), '502');
    assert.equal(normalizeHealthErrorCode(new Error('secret URL')), 'Error');
});

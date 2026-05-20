const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    DEFAULT_REQUEST_FAMILY,
    DEFAULT_REQUEST_TIMEOUT_MS,
    buildTelegramRequestOptions,
    formatTelegramTransportError,
} = require('../telegram-runtime');

test('buildTelegramRequestOptions defaults to IPv4 and default timeout', () => {
    assert.deepEqual(buildTelegramRequestOptions({}), {
        family: DEFAULT_REQUEST_FAMILY,
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
    });
});

test('buildTelegramRequestOptions accepts valid family and timeout overrides', () => {
    assert.deepEqual(buildTelegramRequestOptions({
        TELEGRAM_REQUEST_FAMILY: '6',
        TELEGRAM_REQUEST_TIMEOUT_MS: '12000',
    }), {
        family: 6,
        timeout: 12000,
    });
});

test('buildTelegramRequestOptions falls back on invalid numeric overrides', () => {
    assert.deepEqual(buildTelegramRequestOptions({
        TELEGRAM_REQUEST_FAMILY: '5',
        TELEGRAM_REQUEST_TIMEOUT_MS: '-1',
    }), {
        family: DEFAULT_REQUEST_FAMILY,
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
    });
});

test('buildTelegramRequestOptions passes an explicit HTTP proxy to request', () => {
    assert.deepEqual(buildTelegramRequestOptions({
        TELEGRAM_PROXY_URL: 'http://proxy.example.test:8080',
    }), {
        family: DEFAULT_REQUEST_FAMILY,
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
        proxy: 'http://proxy.example.test:8080',
    });
});

test('formatTelegramTransportError includes code and message', () => {
    assert.equal(formatTelegramTransportError({ code: 'ETIMEDOUT', message: 'connect timeout' }), 'code=ETIMEDOUT | connect timeout');
});

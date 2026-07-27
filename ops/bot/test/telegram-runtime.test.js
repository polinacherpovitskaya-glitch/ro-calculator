const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    DEFAULT_POLL_TIMEOUT_SECONDS,
    DEFAULT_REQUEST_FAMILY,
    DEFAULT_REQUEST_TIMEOUT_MS,
    MAX_POLL_TIMEOUT_SECONDS,
    buildTelegramBotOptions,
    buildTelegramRequestOptions,
    formatTelegramTransportError,
    getTelegramBaseApiUrl,
    getTelegramPollTimeoutSeconds,
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

test('getTelegramBaseApiUrl trims whitespace and trailing slashes', () => {
    assert.equal(
        getTelegramBaseApiUrl({ TELEGRAM_BASE_API_URL: ' https://relay.example.test/secret/// ' }),
        'https://relay.example.test/secret'
    );
    assert.equal(getTelegramBaseApiUrl({}), '');
});

test('getTelegramPollTimeoutSeconds defaults and caps relay long polling', () => {
    assert.equal(getTelegramPollTimeoutSeconds({}), DEFAULT_POLL_TIMEOUT_SECONDS);
    assert.equal(getTelegramPollTimeoutSeconds({ TELEGRAM_POLL_TIMEOUT_SECONDS: '15' }), 15);
    assert.equal(getTelegramPollTimeoutSeconds({ TELEGRAM_POLL_TIMEOUT_SECONDS: '90' }), MAX_POLL_TIMEOUT_SECONDS);
});

test('buildTelegramBotOptions includes relay base URL and polling config', () => {
    assert.deepEqual(buildTelegramBotOptions({
        TELEGRAM_BASE_API_URL: 'https://relay.example.test/secret/',
        TELEGRAM_POLL_TIMEOUT_SECONDS: '18',
    }), {
        baseApiUrl: 'https://relay.example.test/secret',
        polling: {
            interval: 1000,
            autoStart: true,
            params: { timeout: 18 },
        },
        request: {
            family: DEFAULT_REQUEST_FAMILY,
            timeout: DEFAULT_REQUEST_TIMEOUT_MS,
        },
    });
});

test('formatTelegramTransportError includes code and message', () => {
    assert.equal(formatTelegramTransportError({ code: 'ETIMEDOUT', message: 'connect timeout' }), 'code=ETIMEDOUT | connect timeout');
});

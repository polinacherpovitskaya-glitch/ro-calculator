const assert = require('node:assert/strict');
const {
    buildTelegramRequestOptions,
    DEFAULT_REQUEST_FAMILY,
    DEFAULT_REQUEST_TIMEOUT_MS,
} = require('../bot/telegram-runtime');

assert.deepEqual(
    buildTelegramRequestOptions({}),
    {
        family: DEFAULT_REQUEST_FAMILY,
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
    },
    'default telegram runtime config should force ipv4 and default timeout'
);

assert.deepEqual(
    buildTelegramRequestOptions({
        TELEGRAM_REQUEST_FAMILY: '6',
        TELEGRAM_REQUEST_TIMEOUT_MS: '15000',
    }),
    {
        family: 6,
        timeout: 15000,
    },
    'explicit env overrides should be honored when valid'
);

assert.deepEqual(
    buildTelegramRequestOptions({
        TELEGRAM_REQUEST_FAMILY: '999',
        TELEGRAM_REQUEST_TIMEOUT_MS: '-5',
    }),
    {
        family: DEFAULT_REQUEST_FAMILY,
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
    },
    'invalid env overrides should fall back to safe defaults'
);

console.log('telegram runtime smoke checks passed');

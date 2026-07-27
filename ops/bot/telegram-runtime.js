const DEFAULT_REQUEST_FAMILY = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 45000;
const DEFAULT_POLL_TIMEOUT_SECONDS = 20;
const MAX_POLL_TIMEOUT_SECONDS = 25;
const ALLOWED_IP_FAMILIES = new Set([4, 6]);

function parsePositiveInt(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildTelegramRequestOptions(env = process.env) {
    const configuredFamily = parsePositiveInt(env.TELEGRAM_REQUEST_FAMILY, DEFAULT_REQUEST_FAMILY);
    const family = ALLOWED_IP_FAMILIES.has(configuredFamily)
        ? configuredFamily
        : DEFAULT_REQUEST_FAMILY;

    const options = {
        family,
        timeout: parsePositiveInt(env.TELEGRAM_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    };
    const proxy = String(env.TELEGRAM_PROXY_URL || '').trim();
    if (proxy) options.proxy = proxy;
    return options;
}

function getTelegramBaseApiUrl(env = process.env) {
    const value = String(env.TELEGRAM_BASE_API_URL || '').trim();
    return value ? value.replace(/\/+$/, '') : '';
}

function getTelegramPollTimeoutSeconds(env = process.env) {
    const configured = parsePositiveInt(env.TELEGRAM_POLL_TIMEOUT_SECONDS, DEFAULT_POLL_TIMEOUT_SECONDS);
    return Math.min(configured, MAX_POLL_TIMEOUT_SECONDS);
}

function buildTelegramBotOptions(env = process.env) {
    const options = {
        polling: {
            interval: 1000,
            autoStart: true,
            params: { timeout: getTelegramPollTimeoutSeconds(env) },
        },
        request: buildTelegramRequestOptions(env),
    };
    const baseApiUrl = getTelegramBaseApiUrl(env);
    if (baseApiUrl) options.baseApiUrl = baseApiUrl;
    return options;
}

function formatTelegramTransportError(err) {
    if (!err) return 'Unknown Telegram transport error';

    const code = err?.response?.statusCode || err?.code || '';
    const pieces = [];
    if (code) pieces.push(`code=${code}`);
    if (err?.message) pieces.push(err.message);

    return pieces.join(' | ') || String(err);
}

module.exports = {
    buildTelegramBotOptions,
    buildTelegramRequestOptions,
    formatTelegramTransportError,
    getTelegramBaseApiUrl,
    getTelegramPollTimeoutSeconds,
    DEFAULT_REQUEST_FAMILY,
    DEFAULT_REQUEST_TIMEOUT_MS,
    DEFAULT_POLL_TIMEOUT_SECONDS,
    MAX_POLL_TIMEOUT_SECONDS,
};

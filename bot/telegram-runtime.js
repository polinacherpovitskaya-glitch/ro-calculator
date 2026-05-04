const DEFAULT_REQUEST_FAMILY = 4;
const DEFAULT_REQUEST_TIMEOUT_MS = 45000;
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

    return {
        family,
        timeout: parsePositiveInt(env.TELEGRAM_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
    };
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
    buildTelegramRequestOptions,
    formatTelegramTransportError,
    DEFAULT_REQUEST_FAMILY,
    DEFAULT_REQUEST_TIMEOUT_MS,
};

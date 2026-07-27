const { createHandler: createRelayHandler } = require('../yandex/telegram-relay');

function relayPathFromRequest(req) {
    const rawValue = req?.query?.relay_path;
    const value = Array.isArray(rawValue)
        ? rawValue.join('/')
        : String(rawValue || '');
    // Vercel may preserve the wildcard marker when a splat is forwarded into
    // a query parameter. It is routing syntax, not part of the Telegram path.
    return `/${value.replace(/^\/+/, '').replace(/\*+$/, '')}`;
}

function upstreamQuery(req) {
    return Object.fromEntries(
        Object.entries(req?.query || {}).filter(([key]) => key !== 'relay_path')
    );
}

function appendFormValue(params, key, value) {
    if (Array.isArray(value)) {
        value.forEach(item => appendFormValue(params, key, item));
        return;
    }
    if (value === undefined || value === null) return;
    params.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function requestBody(req) {
    const method = String(req?.method || 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD') return undefined;

    const body = req?.body;
    if (body === undefined || body === null) return undefined;
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === 'string') return Buffer.from(body);

    const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
    if (contentType.startsWith('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams();
        Object.entries(body).forEach(([key, value]) => appendFormValue(params, key, value));
        return Buffer.from(params.toString());
    }
    if (contentType.startsWith('application/json')) {
        return Buffer.from(JSON.stringify(body));
    }

    const error = new Error('Unsupported request body');
    error.statusCode = 415;
    throw error;
}

function sendResult(res, result) {
    res.statusCode = result.statusCode || 500;
    Object.entries(result.headers || {}).forEach(([key, value]) => res.setHeader(key, value));
    res.setHeader('Cache-Control', 'no-store');
    const body = result.isBase64Encoded
        ? Buffer.from(result.body || '', 'base64')
        : (result.body || '');
    res.end(body);
}

function createVercelHandler(options = {}) {
    const relayHandler = createRelayHandler(options);

    return async function vercelTelegramRelay(req, res) {
        let body;
        try {
            body = requestBody(req);
        } catch (error) {
            sendResult(res, {
                statusCode: error?.statusCode || 400,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify({ ok: false, error: 'Unsupported request body' }),
            });
            return;
        }

        const event = {
            rawPath: relayPathFromRequest(req),
            httpMethod: req?.method,
            headers: req?.headers,
            queryStringParameters: upstreamQuery(req),
            body: body?.toString('base64'),
            isBase64Encoded: Boolean(body),
        };
        sendResult(res, await relayHandler(event));
    };
}

const handler = createVercelHandler();

module.exports = handler;
module.exports.appendFormValue = appendFormValue;
module.exports.createVercelHandler = createVercelHandler;
module.exports.relayPathFromRequest = relayPathFromRequest;
module.exports.requestBody = requestBody;
module.exports.upstreamQuery = upstreamQuery;

const crypto = require('node:crypto');

const TELEGRAM_ORIGIN = 'https://api.telegram.org';
const DEFAULT_UPSTREAM_TIMEOUT_MS = 38000;
const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST']);
const FORWARDED_REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
  'user-agent',
]);
const FORWARDED_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-disposition',
  'content-length',
  'content-type',
  'etag',
  'last-modified',
]);

function timingSafeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function rawPath(event) {
  return event?.rawPath || event?.path || '/';
}

function telegramPath(event, secret) {
  const path = rawPath(event);
  const parts = path.split('/');
  const candidateSecret = parts[1] || '';
  if (!secret || !timingSafeEqual(candidateSecret, secret)) return null;

  const upstreamPath = `/${parts.slice(2).join('/')}`;
  const botMethod = /^\/bot\d+:[A-Za-z0-9_-]+\/[A-Za-z][A-Za-z0-9_]*$/;
  const botFile = /^\/file\/bot\d+:[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]+$/;
  return botMethod.test(upstreamPath) || botFile.test(upstreamPath)
    ? upstreamPath
    : null;
}

function telegramOperation(path) {
  if (!path) return 'unknown';
  if (path.startsWith('/file/')) return 'downloadFile';
  return path.slice(path.lastIndexOf('/') + 1) || 'unknown';
}

function queryString(event) {
  if (event?.rawQueryString) return event.rawQueryString;
  const params = event?.queryStringParameters || {};
  return Object.entries(params)
    .flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map(item => `${encodeURIComponent(key)}=${encodeURIComponent(item)}`);
      }
      if (value === undefined || value === null) return [encodeURIComponent(key)];
      return [`${encodeURIComponent(key)}=${encodeURIComponent(value)}`];
    })
    .join('&');
}

function requestHeaders(event) {
  const headers = new Headers();
  Object.entries(event?.headers || {}).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (!FORWARDED_REQUEST_HEADERS.has(normalized)) return;
    if (value === undefined || value === null) return;
    headers.set(normalized, String(value));
  });
  return headers;
}

function responseHeaders(headers) {
  const result = {};
  headers.forEach((value, key) => {
    if (FORWARDED_RESPONSE_HEADERS.has(key.toLowerCase())) result[key] = value;
  });
  return result;
}

function textResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function createHandler(options = {}) {
  const fetchImpl = options.fetch || global.fetch;
  const env = options.env || process.env;

  return async function handler(event) {
    const secret = String(env.TELEGRAM_RELAY_SECRET || '');
    if (!secret) {
      console.error('Telegram relay is missing TELEGRAM_RELAY_SECRET');
      return textResponse(503, { ok: false, error: 'Relay is not configured' });
    }

    const method = String(event?.httpMethod || event?.requestContext?.http?.method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) {
      return textResponse(405, { ok: false, error: 'Method not allowed' });
    }

    const path = telegramPath(event, secret);
    if (!path) {
      return textResponse(404, { ok: false, error: 'Not found' });
    }

    const query = queryString(event);
    const targetUrl = `${TELEGRAM_ORIGIN}${path}${query ? `?${query}` : ''}`;
    const body = event?.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64')
      : (event?.body || undefined);
    const operation = telegramOperation(path);

    try {
      const upstream = await fetchImpl(targetUrl, {
        method,
        headers: requestHeaders(event),
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        signal: AbortSignal.timeout(positiveInt(env.TELEGRAM_RELAY_UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS)),
      });
      const buffer = Buffer.from(await upstream.arrayBuffer());
      console.log('Telegram relay request completed', {
        method,
        operation,
        status: upstream.status,
      });
      return {
        statusCode: upstream.status,
        headers: responseHeaders(upstream.headers),
        body: buffer.toString('base64'),
        isBase64Encoded: true,
      };
    } catch (error) {
      console.error('Telegram relay request failed', {
        method,
        operation,
        message: error?.message || String(error),
      });
      return textResponse(502, { ok: false, error: 'Telegram upstream unavailable' });
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
exports.queryString = queryString;
exports.telegramOperation = telegramOperation;
exports.telegramPath = telegramPath;

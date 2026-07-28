const crypto = require('node:crypto');
const https = require('node:https');
const net = require('node:net');

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

function headerObject(headers) {
  const result = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function createHttpsRequester(options = {}) {
  const requestImpl = options.request || https.request;

  return function requestTelegram(targetUrl, init = {}) {
    return new Promise((resolve, reject) => {
      const request = requestImpl(targetUrl, {
        method: init.method,
        headers: headerObject(init.headers || new Headers()),
        family: 4,
        timeout: positiveInt(init.timeoutMs, DEFAULT_UPSTREAM_TIMEOUT_MS),
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          resolve({
            status: response.statusCode || 502,
            headers: new Headers(response.headers || {}),
            arrayBuffer: async () => Buffer.concat(chunks),
          });
        });
        response.on('error', reject);
      });

      request.on('timeout', () => {
        const error = new Error('Telegram upstream request timed out');
        error.code = 'ETIMEDOUT';
        request.destroy(error);
      });
      request.on('error', reject);
      if (init.body !== undefined) request.write(init.body);
      request.end();
    });
  };
}

function createFetchRequester(fetchImpl) {
  return (targetUrl, init = {}) => fetchImpl(targetUrl, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: AbortSignal.timeout(positiveInt(init.timeoutMs, DEFAULT_UPSTREAM_TIMEOUT_MS)),
  });
}

function safeNetworkError(error) {
  const cause = error?.cause || {};
  const address = error?.address || cause.address || '';
  return {
    code: String(error?.code || cause.code || 'UNKNOWN'),
    syscall: String(error?.syscall || cause.syscall || 'unknown'),
    addressFamily: net.isIP(address) || 4,
  };
}

function createHandler(options = {}) {
  const env = options.env || process.env;
  const upstreamRequest = options.upstreamRequest
    || (options.fetch ? createFetchRequester(options.fetch) : createHttpsRequester());

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
      const upstream = await upstreamRequest(targetUrl, {
        method,
        headers: requestHeaders(event),
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        timeoutMs: positiveInt(env.TELEGRAM_RELAY_UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS),
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
        ...safeNetworkError(error),
      });
      return textResponse(502, { ok: false, error: 'Telegram upstream unavailable' });
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
exports.createHttpsRequester = createHttpsRequester;
exports.queryString = queryString;
exports.safeNetworkError = safeNetworkError;
exports.telegramOperation = telegramOperation;
exports.telegramPath = telegramPath;

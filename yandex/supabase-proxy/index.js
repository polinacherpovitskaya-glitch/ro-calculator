const DEFAULT_SUPABASE_URL = 'https://jbpmorruwjrxcieqlbmd.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpicG1vcnJ1d2pyeGNpZXFsYm1kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTY1NzUsImV4cCI6MjA4NzU5MjU3NX0.Z26DuC4f5UM1I04N7ozr3FOUpF4tVIlUEh0cu1c0Jec';

const SUPABASE_URL = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
const ALLOWED_ORIGINS = new Set([
  'https://calc2.recycleobject.ru',
  'https://calc.recycleobject.ru',
  'http://localhost:3000',
  'http://localhost:5173',
]);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function corsHeaders(event) {
  const origin = event.headers?.Origin || event.headers?.origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://calc2.recycleobject.ru';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,range,x-client-info,x-supabase-api-version',
    'Access-Control-Expose-Headers': 'content-range,range-unit',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function response(event, statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      ...corsHeaders(event),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

function normalizePath(event) {
  const rawPath = event.rawPath || event.path || '/';
  const withoutPrefix = rawPath.replace(/^\/(?:supabase|api\/supabase)(?=\/|$)/, '') || '/';
  if (
    withoutPrefix === '/'
    || withoutPrefix.startsWith('/rest/v1/')
    || withoutPrefix.startsWith('/storage/v1/')
    || withoutPrefix.startsWith('/auth/v1/')
  ) {
    return withoutPrefix;
  }
  return null;
}

function buildQuery(event) {
  if (event.rawQueryString) return event.rawQueryString;
  const params = event.queryStringParameters || {};
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

function forwardHeaders(event) {
  const result = new Headers();
  Object.entries(event.headers || {}).forEach(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey)) return;
    if (normalizedKey === 'origin' || normalizedKey === 'referer') return;
    if (value === undefined || value === null) return;
    result.set(key, String(value));
  });
  result.set('apikey', result.get('apikey') || SUPABASE_ANON_KEY);
  result.set('authorization', result.get('authorization') || `Bearer ${SUPABASE_ANON_KEY}`);
  return result;
}

function responseHeaders(headers) {
  const result = {};
  headers.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    result[key] = value;
  });
  return result;
}

exports.handler = async function handler(event) {
  const method = event.httpMethod || event.requestContext?.http?.method || 'GET';
  if (method === 'OPTIONS') {
    return response(event, 204, '', { 'Content-Type': 'text/plain; charset=utf-8' });
  }

  const path = normalizePath(event);
  if (!path) {
    return response(event, 404, { error: 'Unsupported Supabase proxy path' }, { 'Content-Type': 'application/json; charset=utf-8' });
  }

  const query = buildQuery(event);
  const targetUrl = `${SUPABASE_URL}${path}${query ? `?${query}` : ''}`;
  const body = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : (event.body || undefined);

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers: forwardHeaders(event),
      body: method === 'GET' || method === 'HEAD' ? undefined : body,
    });
    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return {
      statusCode: upstream.status,
      headers: {
        ...corsHeaders(event),
        ...responseHeaders(upstream.headers),
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Supabase proxy failed', {
      method,
      path,
      message: error?.message || String(error),
    });
    return response(event, 502, {
      error: 'Supabase proxy failed',
      message: error?.message || String(error),
    }, { 'Content-Type': 'application/json; charset=utf-8' });
  }
};

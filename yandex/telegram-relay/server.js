// Standalone HTTP server for the Telegram relay, for a small VPS outside Russia
// (servers in Russia cannot reach api.telegram.org). Keeps the URL shape of the
// former Vercel relay, so clients only change the host in TELEGRAM_API_BASE_URL:
//   /api/telegram-relay/<secret>/bot<TOKEN>/<method>
// Env: TELEGRAM_RELAY_SECRET (required), PORT (default 8080).
const http = require('node:http');
const { createHandler } = require('./index');

const PREFIX = '/api/telegram-relay';
const MAX_BODY_BYTES = 50 * 1024 * 1024;

function relayEvent(req, body) {
  const url = new URL(req.url, 'http://relay.local');
  const path = url.pathname.startsWith(`${PREFIX}/`) ? url.pathname.slice(PREFIX.length) : null;
  return {
    rawPath: path,
    rawQueryString: url.search.slice(1),
    httpMethod: req.method,
    headers: req.headers,
    body: body.length ? body.toString('base64') : undefined,
    isBase64Encoded: body.length > 0,
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function createServer(options = {}) {
  const handler = createHandler(options);
  return http.createServer(async (req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    let result;
    try {
      const event = relayEvent(req, await readBody(req));
      result = event.rawPath
        ? await handler(event)
        : { statusCode: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: '{"ok":false,"error":"Not found"}' };
    } catch (error) {
      result = {
        statusCode: error?.statusCode || 400,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ ok: false, error: 'Bad request' }),
      };
    }
    const body = result.isBase64Encoded ? Buffer.from(result.body || '', 'base64') : (result.body || '');
    res.writeHead(result.statusCode || 500, { ...result.headers, 'Cache-Control': 'no-store' });
    res.end(body);
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  createServer().listen(port, () => console.log(`telegram relay listening on ${port}`));
}

module.exports = { createServer, relayEvent };

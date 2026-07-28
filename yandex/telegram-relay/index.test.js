const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const {
  createHandler,
  createHttpsRequester,
  queryString,
  safeNetworkError,
  telegramOperation,
  telegramPath,
} = require('./index');

const SECRET = 'relay-secret';
const BOT_PATH = `/${SECRET}/bot123456:ABC_def/getMe`;

function jsonUpstream(body = { ok: true }) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

test('telegramPath accepts only the configured secret and Telegram bot paths', () => {
  assert.equal(
    telegramPath({ rawPath: BOT_PATH }, SECRET),
    '/bot123456:ABC_def/getMe'
  );
  assert.equal(
    telegramPath({ rawPath: `/${SECRET}/file/bot123456:ABC_def/documents/report.pdf` }, SECRET),
    '/file/bot123456:ABC_def/documents/report.pdf'
  );
  assert.equal(telegramPath({ rawPath: '/wrong/bot123456:ABC_def/getMe' }, SECRET), null);
  assert.equal(telegramPath({ rawPath: `/${SECRET}/https://example.com` }, SECRET), null);
  assert.equal(telegramPath({ rawPath: `/${SECRET}/bot123456:ABC_def/getMe/extra` }, SECRET), null);
});

test('queryString preserves raw gateway query and encodes structured params', () => {
  assert.equal(queryString({ rawQueryString: 'offset=12&timeout=20' }), 'offset=12&timeout=20');
  assert.equal(
    queryString({ queryStringParameters: { chat_id: 42, text: 'Привет' } }),
    'chat_id=42&text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82'
  );
});

test('telegramOperation never exposes the bot token', () => {
  assert.equal(telegramOperation('/bot123456:ABC_def/sendMessage'), 'sendMessage');
  assert.equal(telegramOperation('/file/bot123456:ABC_def/documents/report.pdf'), 'downloadFile');
});

test('handler forwards query, headers, and decoded request body to Telegram', async () => {
  let request;
  const handler = createHandler({
    env: { TELEGRAM_RELAY_SECRET: SECRET },
    fetch: async (url, init) => {
      request = { url, init };
      return jsonUpstream();
    },
  });
  const body = Buffer.from('chat_id=42&text=hello').toString('base64');
  const result = await handler({
    rawPath: `/${SECRET}/bot123456:ABC_def/sendMessage`,
    rawQueryString: 'disable_notification=true',
    requestContext: { http: { method: 'POST' } },
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'relay.example.test',
      authorization: 'must-not-forward',
    },
    body,
    isBase64Encoded: true,
  });

  assert.equal(request.url, 'https://api.telegram.org/bot123456:ABC_def/sendMessage?disable_notification=true');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(request.init.headers.has('authorization'), false);
  assert.equal(Buffer.from(request.init.body).toString(), 'chat_id=42&text=hello');
  assert.equal(result.statusCode, 200);
  assert.equal(result.isBase64Encoded, true);
  assert.deepEqual(JSON.parse(Buffer.from(result.body, 'base64').toString()), { ok: true });
});

test('handler rejects bad secrets and unsupported methods without calling upstream', async () => {
  let calls = 0;
  const handler = createHandler({
    env: { TELEGRAM_RELAY_SECRET: SECRET },
    fetch: async () => {
      calls += 1;
      return jsonUpstream();
    },
  });

  assert.equal((await handler({ rawPath: '/bad/bot123456:ABC_def/getMe' })).statusCode, 404);
  assert.equal((await handler({ rawPath: BOT_PATH, httpMethod: 'DELETE' })).statusCode, 405);
  assert.equal(calls, 0);
});

test('handler returns a safe 502 response for upstream errors', async () => {
  const handler = createHandler({
    env: { TELEGRAM_RELAY_SECRET: SECRET },
    fetch: async () => {
      throw new Error('private upstream details');
    },
  });
  const result = await handler({ rawPath: BOT_PATH, httpMethod: 'GET' });
  assert.equal(result.statusCode, 502);
  assert.deepEqual(JSON.parse(result.body), {
    ok: false,
    error: 'Telegram upstream unavailable',
  });
});

test('HTTPS requester forces IPv4 and preserves headers, body, and response', async () => {
  let captured;
  const request = (url, init, onResponse) => {
    const client = new EventEmitter();
    client.write = body => {
      captured.body = Buffer.from(body).toString();
    };
    client.destroy = error => client.emit('error', error);
    client.end = () => {
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.headers = { 'content-type': 'application/json' };
        onResponse(response);
        response.emit('data', Buffer.from('{"ok":true}'));
        response.emit('end');
      });
    };
    captured = { url: String(url), init, body: null };
    return client;
  };
  const requester = createHttpsRequester({ request });
  const response = await requester('https://api.telegram.org/bot123:ABC/sendMessage', {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }),
    body: 'chat_id=42&text=hello',
    timeoutMs: 1234,
  });

  assert.equal(captured.url, 'https://api.telegram.org/bot123:ABC/sendMessage');
  assert.equal(captured.init.family, 4);
  assert.equal(captured.init.timeout, 1234);
  assert.equal(captured.init.headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(captured.body, 'chat_id=42&text=hello');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(Buffer.from(await response.arrayBuffer()).toString()), { ok: true });
});

test('HTTPS requester destroys timed out requests with a stable error code', async () => {
  const request = () => {
    const client = new EventEmitter();
    client.write = () => {};
    client.destroy = error => client.emit('error', error);
    client.end = () => queueMicrotask(() => client.emit('timeout'));
    return client;
  };
  const requester = createHttpsRequester({ request });

  await assert.rejects(
    requester('https://api.telegram.org/bot123:ABC/getMe', {
      method: 'GET',
      headers: new Headers(),
      timeoutMs: 10,
    }),
    error => error.code === 'ETIMEDOUT'
  );
});

test('network diagnostics never include request URLs or tokens', () => {
  const error = new Error('fetch failed for https://api.telegram.org/bot123:SECRET/getMe');
  error.code = 'ETIMEDOUT';
  error.syscall = 'connect';
  error.address = '149.154.167.220';

  assert.deepEqual(safeNetworkError(error), {
    code: 'ETIMEDOUT',
    syscall: 'connect',
    addressFamily: 4,
  });
  assert.doesNotMatch(JSON.stringify(safeNetworkError(error)), /SECRET|telegram\\.org/);
});

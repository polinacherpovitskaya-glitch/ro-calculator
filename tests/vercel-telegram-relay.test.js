const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    createVercelHandler,
    relayPathFromRequest,
    requestBody,
    upstreamQuery,
} = require('../api/telegram-relay');

const SECRET = 'relay-secret';
const RELAY_PATH = `${SECRET}/bot123456:ABC_def/sendMessage`;

function createResponse() {
    return {
        headers: {},
        statusCode: null,
        body: null,
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
        },
        end(body) {
            this.body = body;
        },
    };
}

test('Vercel request helpers isolate the relay path and preserve form fields', () => {
    const req = {
        method: 'POST',
        query: {
            relay_path: RELAY_PATH,
            disable_notification: 'true',
        },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: {
            chat_id: '42',
            text: 'Привет',
            reply_markup: { inline_keyboard: [] },
        },
    };

    assert.equal(relayPathFromRequest(req), `/${RELAY_PATH}`);
    assert.deepEqual(upstreamQuery(req), { disable_notification: 'true' });
    assert.equal(
        requestBody(req).toString(),
        'chat_id=42&text=%D0%9F%D1%80%D0%B8%D0%B2%D0%B5%D1%82&reply_markup=%7B%22inline_keyboard%22%3A%5B%5D%7D'
    );
});

test('Vercel wildcard arrays preserve the full protected relay path', () => {
    const req = {
        query: {
            relay_path: RELAY_PATH.split('/'),
        },
    };
    assert.equal(relayPathFromRequest(req), `/${RELAY_PATH}`);
});

test('Vercel wildcard routing markers are not forwarded to Telegram', () => {
    const req = {
        query: {
            relay_path: `${RELAY_PATH}*`,
        },
    };
    assert.equal(relayPathFromRequest(req), `/${RELAY_PATH}`);
});

test('Vercel adapter forwards Telegram requests and returns binary-safe responses', async () => {
    let upstreamRequest;
    const handler = createVercelHandler({
        env: { TELEGRAM_RELAY_SECRET: SECRET },
        fetch: async (url, init) => {
            upstreamRequest = { url, init };
            return new Response(Buffer.from('{"ok":true}'), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        },
    });
    const req = {
        method: 'POST',
        query: {
            relay_path: RELAY_PATH,
            disable_notification: 'true',
        },
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: { chat_id: '42', text: 'hello' },
    };
    const res = createResponse();

    await handler(req, res);

    assert.equal(
        upstreamRequest.url,
        'https://api.telegram.org/bot123456:ABC_def/sendMessage?disable_notification=true'
    );
    assert.equal(upstreamRequest.init.method, 'POST');
    assert.equal(upstreamRequest.init.body.toString(), 'chat_id=42&text=hello');
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(Buffer.from(res.body).toString(), '{"ok":true}');
});

test('Vercel adapter rejects unsupported bodies before contacting Telegram', async () => {
    let upstreamCalls = 0;
    const handler = createVercelHandler({
        env: { TELEGRAM_RELAY_SECRET: SECRET },
        fetch: async () => {
            upstreamCalls += 1;
            return new Response('{}');
        },
    });
    const res = createResponse();

    await handler({
        method: 'POST',
        query: { relay_path: RELAY_PATH },
        headers: { 'content-type': 'multipart/form-data; boundary=test' },
        body: { parsed: true },
    }, res);

    assert.equal(res.statusCode, 415);
    assert.equal(upstreamCalls, 0);
    assert.deepEqual(JSON.parse(String(res.body)), {
        ok: false,
        error: 'Unsupported request body',
    });
});

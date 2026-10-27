const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('./server');

async function withServer(fetchImpl, run) {
  const server = createServer({ env: { TELEGRAM_RELAY_SECRET: 'secret' }, fetch: fetchImpl });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('forwards a bot method with query and body to api.telegram.org', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url: String(url), method: init.method, body: init.body && Buffer.from(init.body).toString() });
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  await withServer(fakeFetch, async base => {
    const res = await fetch(`${base}/api/telegram-relay/secret/bot123:abc/sendMessage?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"chat_id":1,"text":"hi"}',
    });
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '{"ok":true}');
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.telegram.org/bot123:abc/sendMessage?x=1');
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].body, '{"chat_id":1,"text":"hi"}');
});

test('rejects a wrong secret and paths outside the relay prefix', async () => {
  let called = false;
  const fakeFetch = async () => { called = true; return new Response('{}'); };
  await withServer(fakeFetch, async base => {
    assert.equal((await fetch(`${base}/api/telegram-relay/wrong/bot123:abc/getMe`)).status, 404);
    assert.equal((await fetch(`${base}/secret/bot123:abc/getMe`)).status, 404);
    assert.equal((await fetch(`${base}/healthz`)).status, 200);
  });
  assert.equal(called, false);
});

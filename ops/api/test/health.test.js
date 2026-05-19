import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

test('GET /api/health returns 200 with status "ok"', async (t) => {
  const app = createServer();
  const server = app.listen(0); // 0 = random free port
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/health includes a version field', async (t) => {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());

  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  const body = await res.json();

  assert.ok(typeof body.version === 'string');
  assert.ok(body.version.length > 0);
});

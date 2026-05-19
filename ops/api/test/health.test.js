import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';

async function startServer(envOverrides = {}) {
  const oldEnv = { ...process.env };
  Object.assign(process.env, envOverrides);
  const app = createServer();
  const server = app.listen(0);

  return {
    port: server.address().port,
    close: () => {
      server.close();
      process.env = oldEnv;
    },
  };
}

test('GET /api/health returns 200 with status "ok"', async (t) => {
  const s = await startServer({ DATABASE_URL: DB_URL });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);

  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'ok');
});

test('GET /api/health includes version', async (t) => {
  const s = await startServer({ DATABASE_URL: DB_URL });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  const body = await res.json();

  assert.ok(typeof body.version === 'string');
  assert.ok(body.version.length > 0);
});

test('GET /api/health reports database ok=true when DB is reachable', async (t) => {
  const s = await startServer({ DATABASE_URL: DB_URL });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  const body = await res.json();

  assert.equal(body.db.ok, true);
  assert.ok(typeof body.db.latency_ms === 'number');
});

test('GET /api/health reports database ok=false when DB is unreachable', async (t) => {
  const s = await startServer({ DATABASE_URL: 'postgres://ops:wrong@127.0.0.1:5433/ops' });
  t.after(() => s.close());

  const res = await fetch(`http://127.0.0.1:${s.port}/api/health`);
  const body = await res.json();

  assert.equal(body.db.ok, false);
  assert.ok(typeof body.db.error === 'string');
});

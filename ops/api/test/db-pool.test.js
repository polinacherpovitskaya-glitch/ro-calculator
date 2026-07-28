import assert from 'node:assert/strict';
import test from 'node:test';

import { getPool } from '../src/db.js';

test('PostgreSQL pool tolerates transient idle-client errors', async () => {
  process.env.DATABASE_URL = 'postgres://ops:ops@127.0.0.1:1/ops';
  const pool = getPool();

  assert.equal(pool.options.connectionTimeoutMillis, 5000);
  assert.equal(pool.options.allowExitOnIdle, false);
  assert.ok(pool.listenerCount('error') > 0);

  const originalConsoleError = console.error;
  const messages = [];
  console.error = (...args) => messages.push(args.join(' '));
  try {
    assert.doesNotThrow(() => pool.emit('error', new Error('synthetic timeout')));
  } finally {
    console.error = originalConsoleError;
    await pool.end();
  }
  assert.match(messages.join('\n'), /PostgreSQL idle client error: synthetic timeout/);
});


import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getPool } from '../src/db.js';
import { createSession, loadSession, revokeSession } from '../src/auth/sessions.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;

async function ensureUser(email) {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO auth_users (email, password_hash, role)
     VALUES ($1, 'hash', 'user')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email]
  );
  return res.rows[0].id;
}

test('createSession returns id, persists session', async () => {
  const userId = await ensureUser(`session-test-${crypto.randomUUID()}@x.test`);
  const { id, expiresAt } = await createSession(userId, { ip: '1.2.3.4', userAgent: 'test' });

  assert.ok(id.length >= 32);
  assert.ok(expiresAt instanceof Date);

  const loaded = await loadSession(id);
  assert.equal(loaded.user_id, userId);
});

test('loadSession returns null for unknown id', async () => {
  const loaded = await loadSession('nonexistent-id');
  assert.equal(loaded, null);
});

test('revokeSession marks session as revoked', async () => {
  const userId = await ensureUser(`revoke-test-${crypto.randomUUID()}@x.test`);
  const { id } = await createSession(userId);
  await revokeSession(id);

  const loaded = await loadSession(id);
  assert.equal(loaded, null);
});

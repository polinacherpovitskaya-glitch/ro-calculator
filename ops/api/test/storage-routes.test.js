import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.js';
import { getPool } from '../src/db.js';
import { hashPassword } from '../src/auth/argon.js';

const DB_URL = process.env.TEST_DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';
process.env.DATABASE_URL = DB_URL;
process.env.S3_MOCK_DIR = process.env.S3_MOCK_DIR || path.join(os.tmpdir(), 'ro-platform-storage-route-test');

async function startServer(t) {
  const app = createServer();
  const server = app.listen(0);
  t.after(() => server.close());
  return server.address().port;
}

async function login(port) {
  const email = `storage-${crypto.randomUUID()}@x.test`;
  const password = 'testpass1234';
  await getPool().query(
    `INSERT INTO auth_users (email, password_hash, role, must_change_password)
     VALUES ($1, $2, 'user', FALSE)`,
    [email, await hashPassword(password)],
  );
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.headers.get('set-cookie').split(';')[0];
}

test('storage route uploads to a logical bucket and serves the object without Supabase', async (t) => {
  const port = await startServer(t);
  const cookie = await login(port);
  const objectName = `tests/${crypto.randomUUID()}.txt`;
  const form = new FormData();
  form.append('path', objectName);
  form.append('contentType', 'text/plain');
  form.append('file', new Blob(['yandex-storage-ok'], { type: 'text/plain' }), 'proof.txt');

  const uploadResponse = await fetch(`http://127.0.0.1:${port}/api/storage/product-images/upload`, {
    method: 'POST',
    headers: { cookie },
    body: form,
  });
  assert.equal(uploadResponse.status, 200);
  assert.equal((await uploadResponse.json()).data.path, objectName);

  const publicResponse = await fetch(
    `http://127.0.0.1:${port}/api/storage/public/product-images/${objectName}`,
  );
  assert.equal(publicResponse.status, 200);
  assert.equal(await publicResponse.text(), 'yandex-storage-ok');

  const removeResponse = await fetch(`http://127.0.0.1:${port}/api/storage/product-images/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ paths: [objectName] }),
  });
  assert.equal(removeResponse.status, 200);
});

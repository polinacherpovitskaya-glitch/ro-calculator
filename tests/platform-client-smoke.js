const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'platform-client.js'), 'utf8');
const requests = [];
const mutationAttempts = new Map();
let orderSaveAttempts = 0;
let uploadAttempts = 0;
let removeAttempts = 0;
let uuidSequence = 0;

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  Blob,
  FormData,
  crypto: { randomUUID: () => `request-${++uuidSequence}` },
  fetch: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/api/compat/order-save')) {
      orderSaveAttempts += 1;
      if (orderSaveAttempts === 1) {
        return jsonResponse(503, { error: { code: 'TEMPORARY', message: 'try again' } });
      }
      return jsonResponse(200, {
        data: {
          order: { id: 7, status: 'production_casting' },
          items: [{ id: 7001, order_id: 7 }],
        },
        error: null,
      });
    }
    if (url.endsWith('/api/storage/mold-photos/upload')) {
      uploadAttempts += 1;
      if (uploadAttempts === 1) {
        return jsonResponse(504, { error: { code: 'TEMPORARY', message: 'upload timeout' } });
      }
      return jsonResponse(200, { data: { path: 'molds/retry.txt' } });
    }
    if (url.endsWith('/api/storage/mold-photos/remove')) {
      removeAttempts += 1;
      if (removeAttempts === 1) {
        return jsonResponse(502, { error: { code: 'TEMPORARY', message: 'remove gateway' } });
      }
      return jsonResponse(200, { data: [{ name: 'molds/retry.txt' }] });
    }
    if (url.endsWith('/api/compat/query')) {
      const body = JSON.parse(options.body);
      if (body.action === 'select') {
        return jsonResponse(200, { data: { id: 7 }, error: null });
      }
      if (body.table === 'validation_test') {
        return jsonResponse(400, { error: { code: 'INVALID_PAYLOAD', message: 'do not retry' } });
      }
      const key = `${body.action}:${body.table}`;
      const attempt = (mutationAttempts.get(key) || 0) + 1;
      mutationAttempts.set(key, attempt);
      if (attempt === 1) {
        if (key === 'update:orders') {
          throw new TypeError('simulated connection reset');
        }
        return jsonResponse(503, { error: { code: 'TEMPORARY', message: `${key} retry` } });
      }
      return jsonResponse(200, { data: null, error: null });
    }
    return jsonResponse(404, { error: { code: 'NOT_FOUND', message: url } });
  },
});

vm.runInContext(source, context);

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

async function expectCompatMutationRetry(client, action, buildQuery) {
  const before = requests.length;
  const result = await buildQuery(client);
  assert.deepEqual(plain(result), { data: null, error: null }, `${action} should recover`);
  const calls = requests.slice(before);
  assert.equal(calls.length, 2, `${action} should retry once`);
  assert.ok(calls.every(call => call.url.endsWith('/api/compat/query')));
  assert.equal(
    calls[0].options.headers['Idempotency-Key'],
    calls[1].options.headers['Idempotency-Key'],
    `${action} retry must reuse one idempotency key`,
  );
  assert.equal(JSON.parse(calls[0].options.body).action, action);
  assert.equal(JSON.parse(calls[1].options.body).action, action);
}

async function main() {
  const client = context.createPlatformClient('https://api.example.test/');
  const selected = await client
    .from('orders')
    .select('id')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .maybeSingle();

  assert.deepEqual(plain(selected), { data: { id: 7 }, error: null });
  const selectBody = JSON.parse(requests[0].options.body);
  assert.equal(requests[0].url, 'https://api.example.test/api/compat/query');
  assert.equal(requests[0].options.credentials, 'include');
  assert.equal(selectBody.table, 'orders');
  assert.equal(selectBody.action, 'select');
  assert.deepEqual(selectBody.filters, [{ op: 'eq', column: 'status', value: 'draft' }]);
  assert.deepEqual(selectBody.orders, [{ column: 'created_at', ascending: false }]);
  assert.equal(requests[0].options.headers['Idempotency-Key'], undefined, 'reads must not carry mutation keys');

  await expectCompatMutationRetry(client, 'update', value => value
    .from('orders')
    .update({ status: 'approved' })
    .eq('id', 7));
  await expectCompatMutationRetry(client, 'insert', value => value
    .from('time_entries')
    .insert({ id: 71, hours: 1 }));
  await expectCompatMutationRetry(client, 'upsert', value => value
    .from('settings')
    .upsert({ key: 'retry', value: 'ok' }, { onConflict: 'key' }));
  await expectCompatMutationRetry(client, 'delete', value => value
    .from('app_colors')
    .delete()
    .eq('id', 71));

  const validationBefore = requests.length;
  const validation = await client.from('validation_test').insert({ value: 'bad' });
  assert.equal(validation.error.status, 400);
  assert.equal(requests.length - validationBefore, 1, 'validation errors must not retry');

  const atomicBefore = requests.length;
  const atomicSave = await client.saveOrderSnapshot({
    order: { id: 7, status: 'draft' },
    items: [{ id: 7001, order_id: 7 }],
  });
  assert.equal(atomicSave.error, null);
  assert.equal(atomicSave.data.order.status, 'production_casting');
  assert.equal(orderSaveAttempts, 2, 'temporary platform failure should retry the complete order snapshot');
  const atomicCalls = requests.slice(atomicBefore);
  assert.equal(atomicCalls.length, 2);
  assert.equal(
    atomicCalls[0].options.headers['Idempotency-Key'],
    atomicCalls[1].options.headers['Idempotency-Key'],
    'ambiguous order retry must reuse one idempotency key',
  );
  assert.deepEqual(JSON.parse(atomicCalls[1].options.body), {
    order: { id: 7, status: 'draft' },
    items: [{ id: 7001, order_id: 7 }],
    allowEmptyItemsDelete: false,
  });

  const retryFile = new Blob(['retry'], { type: 'text/plain' });
  Object.defineProperty(retryFile, 'name', { value: 'retry.txt' });
  const uploadBefore = requests.length;
  const uploaded = await client.storage.from('mold-photos').upload('molds/retry.txt', retryFile, {
    contentType: 'text/plain',
    upsert: true,
  });
  assert.equal(uploaded.error, null);
  const uploadCalls = requests.slice(uploadBefore);
  assert.equal(uploadCalls.length, 2, 'storage upload should retry once');
  assert.equal(
    uploadCalls[0].options.headers['Idempotency-Key'],
    uploadCalls[1].options.headers['Idempotency-Key'],
    'upload retry must reuse one idempotency key',
  );

  const removeBefore = requests.length;
  const removed = await client.storage.from('mold-photos').remove(['molds/retry.txt']);
  assert.equal(removed.error, null);
  const removeCalls = requests.slice(removeBefore);
  assert.equal(removeCalls.length, 2, 'storage remove should retry once');
  assert.equal(
    removeCalls[0].options.headers['Idempotency-Key'],
    removeCalls[1].options.headers['Idempotency-Key'],
    'remove retry must reuse one idempotency key',
  );

  const publicUrl = client.storage
    .from('mold-photos')
    .getPublicUrl('molds/пример 1.jpg')
    .data.publicUrl;
  assert.equal(
    publicUrl,
    'https://api.example.test/api/storage/public/mold-photos/molds/%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80%201.jpg',
  );

  console.log('Yandex platform browser client save reliability smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

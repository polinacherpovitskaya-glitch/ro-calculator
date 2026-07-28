const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'platform-client.js'), 'utf8');
const requests = [];
const context = vm.createContext({
  console,
  setTimeout,
  clearTimeout,
  crypto: { randomUUID: () => 'fixed-request-id' },
  fetch: async (url, options) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ data: options.body.includes('"action":"update"') ? null : { id: 7 }, error: null }),
    };
  },
});

vm.runInContext(source, context);

async function main() {
  const client = context.createPlatformClient('https://api.example.test/');
  const selected = await client
    .from('orders')
    .select('id')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .maybeSingle();

  assert.deepEqual(JSON.parse(JSON.stringify(selected)), { data: { id: 7 }, error: null });
  const selectBody = JSON.parse(requests[0].options.body);
  assert.equal(requests[0].url, 'https://api.example.test/api/compat/query');
  assert.equal(requests[0].options.credentials, 'include');
  assert.equal(selectBody.table, 'orders');
  assert.equal(selectBody.action, 'select');
  assert.deepEqual(selectBody.filters, [{ op: 'eq', column: 'status', value: 'draft' }]);
  assert.deepEqual(selectBody.orders, [{ column: 'created_at', ascending: false }]);

  const updated = await client
    .from('orders')
    .update({ status: 'approved' })
    .eq('id', 7);
  assert.deepEqual(JSON.parse(JSON.stringify(updated)), { data: null, error: null });
  assert.equal(requests[1].options.headers['Idempotency-Key'], 'fixed-request-id');

  const publicUrl = client.storage
    .from('mold-photos')
    .getPublicUrl('molds/пример 1.jpg')
    .data.publicUrl;
  assert.equal(
    publicUrl,
    'https://api.example.test/api/storage/public/mold-photos/molds/%D0%BF%D1%80%D0%B8%D0%BC%D0%B5%D1%80%201.jpg',
  );

  console.log('Yandex platform browser client smoke passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

import assert from 'node:assert/strict';
import {
  assertHealthyBootstrap,
  fetchPlatformAllPages,
} from '../scripts/build-yandex-static.mjs';

// The bootstrap build pages through large tables (order_items is already >1000).
// This stubs the platform query endpoint and asserts every
// row is retrieved across pages.

const originalFetch = global.fetch;

function installFakeEndpoint(totalRows) {
  const rows = Array.from({ length: totalRows }, (_, i) => ({ id: i + 1 }));
  const calls = [];
  global.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const offset = Number(body.range?.from) || 0;
    const limit = Number(body.range?.to) - offset + 1;
    calls.push({ limit, offset });
    const slice = rows.slice(offset, offset + limit);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: slice, error: null }),
    };
  };
  return { rows, calls };
}

try {
  // 2500 rows @1000/page -> 3 requests (1000,1000,500); every row returned.
  let { calls } = installFakeEndpoint(2500);
  let out = await fetchPlatformAllPages('order_items', {
    pageSize: 1000,
    attempts: 1,
    token: 'test-token',
    orders: [{ column: 'order_id', ascending: true }],
  });
  assert.equal(out.length, 2500, 'must return every row across pages');
  assert.equal(calls.length, 3, 'must page 3 times for 2500 rows');
  assert.deepEqual(calls.map(c => c.offset), [0, 1000, 2000], 'offsets must advance by pageSize');

  // Exactly on a page boundary: 2000 rows needs one extra empty page to detect the end.
  ({ calls } = installFakeEndpoint(2000));
  out = await fetchPlatformAllPages('time_entries', { pageSize: 1000, attempts: 1, token: 'test-token' });
  assert.equal(out.length, 2000, 'exact multiple must not drop or duplicate rows');
  assert.equal(calls.length, 3, 'exact multiple needs a trailing empty page');

  // Small table -> a single request, no extra paging.
  ({ calls } = installFakeEndpoint(42));
  out = await fetchPlatformAllPages('employees', { pageSize: 1000, attempts: 1, token: 'test-token' });
  assert.equal(out.length, 42, 'small table returned whole');
  assert.equal(calls.length, 1, 'small table must not over-fetch');

  // Empty table -> one request, zero rows.
  ({ calls } = installFakeEndpoint(0));
  out = await fetchPlatformAllPages('shipments', { pageSize: 1000, attempts: 1, token: 'test-token' });
  assert.equal(out.length, 0);
  assert.equal(calls.length, 1);

  // Filters and ordering are carried in the JSON query body.
  ({ calls } = installFakeEndpoint(5));
  await fetchPlatformAllPages('orders', {
    pageSize: 1000,
    attempts: 1,
    token: 'test-token',
    filters: [{ op: 'neq', column: 'status', value: 'deleted' }],
  });
  assert.equal(calls.length, 1, 'filtered queries still page correctly');

  assert.throws(
    () => assertHealthyBootstrap({
      data: {
        authAccounts: [{}],
        employees: [{}],
        orders: [{}],
        orderItems: [],
        settingsRows: [{}],
      },
    }),
    /orderItems/,
    'a failed heavy order_items export must stop publication instead of shipping an empty shard'
  );

  console.log('bootstrap-pagination-smoke: OK');
} finally {
  global.fetch = originalFetch;
}

import assert from 'node:assert/strict';
import { fetchSupabaseAllPages } from '../scripts/build-yandex-static.mjs';

// PostgREST caps a single response at ~1000 rows, so the bootstrap build must
// page through large tables (order_items is already >1000). This stubs global
// fetch with a fake list endpoint that honours limit/offset and asserts every
// row is retrieved across pages.

const originalFetch = global.fetch;

function installFakeEndpoint(totalRows) {
  const rows = Array.from({ length: totalRows }, (_, i) => ({ id: i + 1 }));
  const calls = [];
  global.fetch = async (url) => {
    const u = new URL(url);
    const limit = Number(u.searchParams.get('limit')) || 1000;
    const offset = Number(u.searchParams.get('offset')) || 0;
    calls.push({ limit, offset });
    const slice = rows.slice(offset, offset + limit);
    return { ok: true, status: 200, json: async () => slice, text: async () => '' };
  };
  return { rows, calls };
}

try {
  // 2500 rows @1000/page -> 3 requests (1000,1000,500); every row returned.
  let { calls } = installFakeEndpoint(2500);
  let out = await fetchSupabaseAllPages('/rest/v1/order_items?select=*&order=order_id.asc', { pageSize: 1000, attempts: 1 });
  assert.equal(out.length, 2500, 'must return every row across pages');
  assert.equal(calls.length, 3, 'must page 3 times for 2500 rows');
  assert.deepEqual(calls.map(c => c.offset), [0, 1000, 2000], 'offsets must advance by pageSize');

  // Exactly on a page boundary: 2000 rows needs one extra empty page to detect the end.
  ({ calls } = installFakeEndpoint(2000));
  out = await fetchSupabaseAllPages('/rest/v1/time_entries?select=*&order=date.desc', { pageSize: 1000, attempts: 1 });
  assert.equal(out.length, 2000, 'exact multiple must not drop or duplicate rows');
  assert.equal(calls.length, 3, 'exact multiple needs a trailing empty page');

  // Small table -> a single request, no extra paging.
  ({ calls } = installFakeEndpoint(42));
  out = await fetchSupabaseAllPages('/rest/v1/employees?select=*&order=name.asc', { pageSize: 1000, attempts: 1 });
  assert.equal(out.length, 42, 'small table returned whole');
  assert.equal(calls.length, 1, 'small table must not over-fetch');

  // Empty table -> one request, zero rows.
  ({ calls } = installFakeEndpoint(0));
  out = await fetchSupabaseAllPages('/rest/v1/shipments?select=*&order=created_at.desc', { pageSize: 1000, attempts: 1 });
  assert.equal(out.length, 0);
  assert.equal(calls.length, 1);

  // A pathname that already has a query string appends limit/offset with '&'.
  ({ calls } = installFakeEndpoint(5));
  await fetchSupabaseAllPages('/rest/v1/orders?select=*&status=neq.deleted&order=created_at.desc', { pageSize: 1000, attempts: 1 });
  assert.equal(calls.length, 1, 'query with existing params still pages correctly');

  console.log('bootstrap-pagination-smoke: OK');
} finally {
  global.fetch = originalFetch;
}

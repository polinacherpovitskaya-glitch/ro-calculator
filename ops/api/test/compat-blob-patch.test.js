import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeRecords,
  mergeMaps,
  releaseSupersededProjectHardwareReservations,
  parseBlobValue,
} from '../src/compat-blob-patch.js';
import { executeBlobPatch } from '../src/routes/compat.js';

test('mergeRecords keeps records the client never saw', () => {
  const server = [{ id: 1, qty: 5 }, { id: 2, qty: 7 }, { id: 3, qty: 1 }];
  // A stale tab knew only ids 1 and 2, changed 1 and removed 2.
  const merged = mergeRecords(server, { upserts: [{ id: 1, qty: 9 }], removeIds: [2] });
  assert.deepEqual(merged, [{ id: 1, qty: 9 }, { id: 3, qty: 1 }]);
});

test('mergeRecords places new records at the start or end and ignores duplicates', () => {
  const merged = mergeRecords([{ id: 1 }], {
    upserts: [{ id: 10 }, { id: 11 }, { id: 10, dup: true }, { id: 12 }],
    prependIds: [10, 11],
  });
  assert.deepEqual(merged, [{ id: 10 }, { id: 11 }, { id: 1 }, { id: 12 }]);
});

test('mergeRecords does not resurrect a record removed in the same patch', () => {
  assert.deepEqual(mergeRecords([{ id: 1 }], { upserts: [{ id: 2 }], removeIds: [2] }), [{ id: 1 }]);
});

test('mergeMaps sets and removes single keys and keeps everyone else', () => {
  const server = { checks: { 'a:1': true, 'b:2': true }, actual_qtys: { 'b:2': 5 }, updated_by: 'Склад' };
  const merged = mergeMaps(server, {
    set: { checks: { 'c:3': true } },
    remove: { checks: ['a:1'], actual_qtys: ['missing'] },
    top: { updated_by: 'Менеджер' },
  });
  assert.deepEqual(merged, {
    checks: { 'b:2': true, 'c:3': true },
    actual_qtys: { 'b:2': 5 },
    updated_by: 'Менеджер',
  });
});

test('two concurrent project hardware batches leave one active set', () => {
  const records = [
    { id: 1, order_id: 7, item_id: 9, qty: 10, status: 'active', source: 'project_hardware', created_at: '2026-10-27T10:00:00.000Z' },
    { id: 2, order_id: 7, item_id: 9, qty: 10, status: 'active', source: 'project_hardware', created_at: '2026-10-27T10:00:05.000Z' },
    { id: 3, order_id: 7, item_id: 9, qty: 4, status: 'active', source: 'manual', created_at: '2026-10-27T09:00:00.000Z' },
    { id: 4, order_id: 8, item_id: 9, qty: 1, status: 'active', source: 'project_hardware', created_at: '2026-10-27T08:00:00.000Z' },
  ];
  const { records: next, released } = releaseSupersededProjectHardwareReservations(records, 'now');
  assert.equal(released, 1);
  assert.equal(next[0].status, 'released');
  assert.equal(next[0].released_reason, 'superseded');
  assert.equal(next[1].status, 'active');
  assert.equal(next[2].status, 'active', 'manual reservations are never touched');
  assert.equal(next[3].status, 'active', 'other orders are untouched');
});

test('parseBlobValue tolerates strings, objects and garbage', () => {
  assert.deepEqual(parseBlobValue('[{"id":1}]', 'records'), [{ id: 1 }]);
  assert.deepEqual(parseBlobValue('', 'records'), []);
  assert.deepEqual(parseBlobValue('{oops', 'maps'), {});
  assert.deepEqual(parseBlobValue({ checks: {} }, 'maps'), { checks: {} });
});

function fakeClient(rows) {
  const writes = [];
  return {
    writes,
    async query(sql, params = []) {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT data')) {
        return { rows: (rows[params[0]] || []).map((data) => ({ data: structuredClone(data) })) };
      }
      if (sql.includes('INSERT INTO compat_rows')) {
        writes.push({ table: params[0], sourceId: params[1], data: params[2] });
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
}

test('executeBlobPatch merges into the stored string blob and keeps it a string', async () => {
  const client = fakeClient({
    warehouse_reservations: [{ id: 1, reservations_data: JSON.stringify([{ id: 5, status: 'active' }]) }],
  });
  const result = await executeBlobPatch(client, {
    target: 'warehouse_reservations',
    patch: { upserts: [{ id: 6, status: 'active' }] },
  });
  assert.deepEqual(result.data.value.map((record) => record.id), [5, 6]);
  assert.equal(client.writes.length, 1);
  assert.equal(client.writes[0].sourceId, '1');
  assert.equal(typeof client.writes[0].data.reservations_data, 'string');
  assert.deepEqual(JSON.parse(client.writes[0].data.reservations_data).map((record) => record.id), [5, 6]);
});

test('executeBlobPatch creates the settings row for project hardware state', async () => {
  const client = fakeClient({ settings: [] });
  const result = await executeBlobPatch(client, {
    target: 'project_hardware_state',
    patch: { set: { checks: { '1:2': true } } },
  });
  assert.deepEqual(result.data.value, { checks: { '1:2': true } });
  assert.equal(client.writes[0].sourceId, 'project_hardware_state_json');
  assert.equal(client.writes[0].data.key, 'project_hardware_state_json');
});

test('executeBlobPatch rejects unknown targets', async () => {
  await assert.rejects(
    executeBlobPatch(fakeClient({}), { target: 'settings', patch: {} }),
    (error) => error?.code === 'INVALID_BLOB_TARGET',
  );
});

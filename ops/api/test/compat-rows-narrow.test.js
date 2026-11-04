import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCompatRows, equalityNarrow, narrowForFilters } from '../src/compat-rows.js';

function recordingClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
}

test('equalityNarrow asks for both the number and the string spelling', () => {
  assert.deepEqual(equalityNarrow('order_id', 1786340000000), [
    { contains: { order_id: 1786340000000 } },
    { contains: { order_id: '1786340000000' } },
  ]);
  assert.deepEqual(equalityNarrow('order_id', '42'), [
    { contains: { order_id: 42 } },
    { contains: { order_id: '42' } },
  ]);
  assert.equal(equalityNarrow('order_id', 'abc'), null);
  assert.equal(equalityNarrow('order_id', 1.5), null);
  assert.equal(equalityNarrow('order_id', null), null);
});

test('narrowForFilters pushes down primary key and integer equality only', () => {
  assert.deepEqual(narrowForFilters([{ op: 'eq', column: 'id', value: 7 }], ['id']), [{ sourceIds: ['7'] }]);
  assert.deepEqual(narrowForFilters([{ op: 'in', column: 'id', value: [1, '2'] }], ['id']), [{ sourceIds: ['1', '2'] }]);
  assert.deepEqual(
    narrowForFilters([{ op: 'eq', column: 'status', value: 'draft' }, { op: 'eq', column: 'order_id', value: 9 }], ['id']),
    equalityNarrow('order_id', 9),
  );
  assert.equal(narrowForFilters([{ op: 'neq', column: 'order_id', value: 9 }], ['id']), null);
  assert.equal(narrowForFilters([{ op: 'eq', column: 'key', value: 'x' }], ['id']), null);
  assert.equal(narrowForFilters(undefined, ['id']), null);
});

test('readCompatRows adds the narrow as OR-ed SQL conditions', async () => {
  const client = recordingClient();
  await readCompatRows(client, 'order_items', true, [
    ...equalityNarrow('order_id', 5),
    { sourceIds: ['5001'] },
  ]);
  const [{ sql, params }] = client.calls;
  assert.match(sql, /table_name = \$1 AND \(data @> \$2::jsonb OR data @> \$3::jsonb OR source_id = ANY\(\$4::text\[\]\)\)/);
  assert.match(sql, /FOR UPDATE/);
  assert.deepEqual(params, ['order_items', '{"order_id":5}', '{"order_id":"5"}', ['5001']]);

  const plain = recordingClient();
  await readCompatRows(plain, 'orders');
  assert.doesNotMatch(plain.calls[0].sql, /AND \(/);
  assert.deepEqual(plain.calls[0].params, ['orders']);
});

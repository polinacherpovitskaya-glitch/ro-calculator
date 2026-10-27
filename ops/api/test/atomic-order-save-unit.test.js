import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeAtomicOrderSave } from '../src/routes/compat.js';

function fakeCompatClient(seed = {}) {
  const state = new Map();
  for (const [table, rows] of Object.entries(seed)) {
    state.set(table, new Map(rows.map((row) => [String(row.id), structuredClone(row)])));
  }
  const tableState = (table) => {
    if (!state.has(table)) state.set(table, new Map());
    return state.get(table);
  };
  return {
    state,
    async query(sql, params = []) {
      if (sql.includes('pg_advisory_xact_lock')) return { rows: [] };
      if (sql.includes('SELECT data') && sql.includes('FROM compat_rows')) {
        return {
          rows: [...tableState(params[0]).entries()]
            .sort(([left], [right]) => left.localeCompare(right, 'ru', { numeric: true }))
            .map(([, data]) => ({ data: structuredClone(data) })),
        };
      }
      if (sql.includes('INSERT INTO compat_rows')) {
        tableState(params[0]).set(String(params[1]), structuredClone(params[2]));
        return { rows: [] };
      }
      if (sql.includes("DELETE FROM compat_rows WHERE table_name = 'order_items'")) {
        tableState('order_items').delete(String(params[0]));
        return { rows: [] };
      }
      throw new Error(`Unexpected SQL in fake compat client: ${sql}`);
    },
  };
}

test('executeAtomicOrderSave preserves workflow state and replaces stale items', async () => {
  const orderId = 1786340000000;
  const currentItemId = orderId * 1000 + 1;
  const staleItemId = orderId * 1000 + 2;
  const client = fakeCompatClient({
    orders: [{
      id: orderId,
      order_name: 'Before',
      status: 'production_casting',
      calculator_data: JSON.stringify({ id: orderId, legacy: true, status: 'production_casting' }),
    }],
    order_items: [
      { id: currentItemId, order_id: orderId, item_number: 1, product_name: 'Before' },
      { id: staleItemId, order_id: orderId, item_number: 2, product_name: 'Stale' },
    ],
  });

  const result = await executeAtomicOrderSave(client, {
    order: {
      id: orderId,
      order_name: 'After',
      status: 'draft',
      updated_at: '2026-08-10T12:00:00.000Z',
      calculator_data: JSON.stringify({ id: orderId, current: true, status: 'draft' }),
    },
    items: [{ id: currentItemId, order_id: orderId, item_number: 1, product_name: 'After' }],
    knownItemIds: [currentItemId, staleItemId],
  });

  assert.equal(result.error, null);
  assert.equal(result.data.order.status, 'production_casting');
  assert.equal(result.data.items.length, 1);
  assert.equal(result.data.items[0].product_name, 'After');
  assert.equal(client.state.get('order_items').has(String(staleItemId)), false);
  const snapshot = JSON.parse(result.data.order.calculator_data);
  assert.equal(snapshot.legacy, true);
  assert.equal(snapshot.current, true);
  assert.equal(snapshot.status, 'production_casting');
});

test('executeAtomicOrderSave validates the whole item payload before writing', async () => {
  const orderId = 1786340000001;
  const itemId = orderId * 1000 + 1;
  const client = fakeCompatClient({
    orders: [{ id: orderId, order_name: 'Unchanged', status: 'draft' }],
    order_items: [],
  });
  const before = structuredClone([...client.state.get('orders').values()]);

  await assert.rejects(
    executeAtomicOrderSave(client, {
      order: { id: orderId, order_name: 'Must not write', status: 'draft' },
      items: [
        { id: itemId, order_id: orderId, item_number: 1 },
        { id: itemId, order_id: orderId, item_number: 2 },
      ],
    }),
    (error) => error?.code === 'DUPLICATE_ORDER_ITEM',
  );
  assert.deepEqual([...client.state.get('orders').values()], before);
});

test('executeAtomicOrderSave keeps existing items on an accidental empty payload', async () => {
  const orderId = 1786340000002;
  const itemId = orderId * 1000 + 1;
  const client = fakeCompatClient({
    orders: [{ id: orderId, order_name: 'Keep items', status: 'draft' }],
    order_items: [{ id: itemId, order_id: orderId, item_number: 1 }],
  });

  const result = await executeAtomicOrderSave(client, {
    order: { id: orderId, order_name: 'Keep items', status: 'draft' },
    items: [],
    allowEmptyItemsDelete: false,
  });
  assert.equal(result.data.preserved_empty_items, true);
  assert.equal(result.data.items.length, 1);
  assert.equal(client.state.get('order_items').has(String(itemId)), true);
});

test('executeAtomicOrderSave never deletes items the client did not load', async () => {
  const orderId = 1786340000003;
  const plasticId = orderId * 1000 + 1;
  const hardwareId = orderId * 1000 + 100;
  const seed = () => fakeCompatClient({
    orders: [{ id: orderId, order_name: 'Лимон', status: 'draft' }],
    order_items: [
      { id: plasticId, order_id: orderId, item_number: 1, product_name: 'Лимон' },
      { id: hardwareId, order_id: orderId, item_number: 100, product_name: 'Цепочка' },
    ],
  });

  // Partial form (hardware not loaded yet): only the plastic id is known.
  const partial = seed();
  const partialResult = await executeAtomicOrderSave(partial, {
    order: { id: orderId, order_name: 'Лимон', status: 'draft' },
    items: [{ id: plasticId, order_id: orderId, item_number: 1, product_name: 'Лимон', pph: 40 }],
    knownItemIds: [plasticId],
  });
  assert.equal(partial.state.get('order_items').has(String(hardwareId)), true);
  assert.deepEqual(partialResult.data.items.map((item) => item.id).sort(), [plasticId, hardwareId].sort());

  // Old bundle / other module without knownItemIds: nothing is deleted.
  const legacy = seed();
  await executeAtomicOrderSave(legacy, {
    order: { id: orderId, order_name: 'Лимон', status: 'draft' },
    items: [{ id: hardwareId, order_id: orderId, item_number: 100, product_name: 'Цепочка' }],
  });
  assert.equal(legacy.state.get('order_items').has(String(plasticId)), true);

  // A row the user really removed from a fully loaded form is deleted.
  const full = seed();
  await executeAtomicOrderSave(full, {
    order: { id: orderId, order_name: 'Лимон', status: 'draft' },
    items: [{ id: plasticId, order_id: orderId, item_number: 1, product_name: 'Лимон' }],
    knownItemIds: [plasticId, hardwareId],
  });
  assert.equal(full.state.get('order_items').has(String(hardwareId)), false);
});

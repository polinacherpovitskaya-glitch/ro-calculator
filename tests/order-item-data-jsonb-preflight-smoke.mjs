import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildItemDataReport, classifyItemData } from '../scripts/audit-order-item-data-jsonb.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

assert.equal(classifyItemData({ item_type: 'product' }), 'object');
assert.equal(classifyItemData('{"item_type":"product"}'), 'objectText');
assert.equal(classifyItemData('"{\\"item_type\\":\\"product\\"}"'), 'doubleEncodedObject');
assert.equal(classifyItemData('[1,2]'), 'arrayOrScalar');
assert.equal(classifyItemData('{broken'), 'invalid');
assert.equal(classifyItemData(null), 'missing');

const clean = buildItemDataReport([
  { id: 1, order_id: 10, item_data: '{"item_type":"product"}' },
  { id: 2, order_id: 10, item_data: { item_type: 'hardware' } },
]);
assert.equal(clean.safe, true);
assert.equal(clean.unsafeRows, 0);

const unsafe = buildItemDataReport([
  { id: 3, order_id: 11, item_data: '"{\\"item_type\\":\\"product\\"}"' },
  { id: 4, order_id: 11, item_data: null },
]);
assert.equal(unsafe.safe, false);
assert.equal(unsafe.unsafeRows, 2);
assert.deepEqual(unsafe.unsafeSamples, [
  { id: 3, order_id: 11, kind: 'doubleEncodedObject' },
  { id: 4, order_id: 11, kind: 'missing' },
]);

const migration = fs.readFileSync(path.join(root, 'scripts/migrations/2026-07-17-order-items-item-data-jsonb.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'scripts/migrations/2026-07-17-order-items-item-data-jsonb-rollback.sql'), 'utf8');
assert.match(migration, /BEGIN;/);
assert.match(migration, /COMMIT;/);
assert.match(migration, /ALTER COLUMN item_data TYPE jsonb/i);
assert.match(migration, /order_items_item_data_pre_jsonb_20260717/);
assert.match(migration, /jsonb_typeof/i);
assert.match(migration, /AS \$fn\$/);
assert.match(rollback, /ALTER COLUMN item_data TYPE text/i);
assert.match(rollback, /UPDATE public\.order_items AS live/i);
assert.match(rollback, /COMMIT;/);

console.log('order item JSONB preflight smoke checks passed');

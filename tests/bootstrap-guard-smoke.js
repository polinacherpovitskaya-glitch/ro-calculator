import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertHealthyBootstrap, buildBootstrapShardPayloads } from '../scripts/build-yandex-static.mjs';

// Guards the production calculator against publishing an empty bootstrap.json when
// the Yandex platform API is unreachable during the CI build (each fetch swallows errors into an
// empty array). A degraded snapshot empties calc for everyone offline — no login
// accounts, no orders — so the build must fail instead of deploying it.

function makeBootstrap(overrides = {}) {
  return {
    ok: true,
    data: {
      authAccounts: [{ id: 1 }],
      employees: [{ id: 1 }],
      orders: [{ id: 1 }],
      orderItems: [{ id: 1, order_id: 1 }],
      settingsRows: [{ key: 'x', value: '1' }],
      ...overrides,
    },
  };
}

// A healthy snapshot passes and reports its row counts.
const counts = assertHealthyBootstrap(makeBootstrap());
assert.deepEqual(counts, { authAccounts: 1, employees: 1, orders: 1, orderItems: 1, settingsRows: 1 });

const shards = buildBootstrapShardPayloads(makeBootstrap());
assert.deepEqual(Object.keys(shards).sort(), ['authAccounts', 'employees', 'orderItems', 'orders', 'settingsRows']);
for (const [key, payload] of Object.entries(shards)) {
  assert.deepEqual(Object.keys(payload.data), [key], `shard ${key} must contain only its requested key`);
  assert.equal(payload.ok, true);
}

const yandexSync = fs.readFileSync(path.join(process.cwd(), '.github/workflows/yandex-static-sync.yml'), 'utf8');
assert.match(yandexSync, /data\/bootstrap\/\*/, 'bootstrap shards must be deployed without immutable one-year cache');
assert.match(
  yandexSync,
  /RO_YANDEX_BUCKET:\s*calc\.recycleobject\.ru/,
  'the guarded snapshot must build once for the canonical calculator bucket',
);
assert.doesNotMatch(yandexSync, /matrix:/, 'the production snapshot must not be built once per mirror');
assert.match(
  yandexSync,
  /concurrency:[\s\S]*cancel-in-progress:\s*false/,
  'a newer sync must queue instead of cancelling an in-progress non-atomic bucket upload',
);
assert.match(
  yandexSync,
  /for attempt in 1 2 3; do[\s\S]*node scripts\/build-yandex-static\.mjs[\s\S]*retrying in/,
  'transient platform API failures must retry the complete guarded build',
);

// A fully empty snapshot (platform API fully unreachable) must fail the build.
assert.throws(
  () => assertHealthyBootstrap(makeBootstrap({ authAccounts: [], employees: [], orders: [], orderItems: [], settingsRows: [] })),
  /required table\(s\) empty/,
  'fully empty snapshot must throw',
);

// Any single empty core table (partial outage) must also fail the build.
for (const key of ['authAccounts', 'employees', 'orders', 'orderItems', 'settingsRows']) {
  assert.throws(
    () => assertHealthyBootstrap(makeBootstrap({ [key]: [] })),
    new RegExp(key),
    `empty ${key} must fail the build`,
  );
}

// Missing / malformed data is treated as empty (defensive — never publish it).
assert.throws(() => assertHealthyBootstrap({}), /required table/, 'missing data must throw');
assert.throws(() => assertHealthyBootstrap({ data: null }), /required table/, 'null data must throw');
assert.throws(() => assertHealthyBootstrap(null), /required table/, 'null bootstrap must throw');

console.log('bootstrap-guard-smoke: OK');

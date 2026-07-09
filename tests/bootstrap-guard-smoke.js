import assert from 'node:assert/strict';
import { assertHealthyBootstrap } from '../scripts/build-yandex-static.mjs';

// Guards the calc2 static mirror against publishing an empty bootstrap.json when
// Supabase is unreachable during the CI build (each fetch swallows errors into an
// empty array). A degraded snapshot empties calc2 for everyone offline — no login
// accounts, no orders — so the build must fail instead of deploying it.

function makeBootstrap(overrides = {}) {
  return {
    ok: true,
    data: {
      authAccounts: [{ id: 1 }],
      employees: [{ id: 1 }],
      orders: [{ id: 1 }],
      settingsRows: [{ key: 'x', value: '1' }],
      ...overrides,
    },
  };
}

// A healthy snapshot passes and reports its row counts.
const counts = assertHealthyBootstrap(makeBootstrap());
assert.deepEqual(counts, { authAccounts: 1, employees: 1, orders: 1, settingsRows: 1 });

// A fully empty snapshot (Supabase fully unreachable) must fail the build.
assert.throws(
  () => assertHealthyBootstrap(makeBootstrap({ authAccounts: [], employees: [], orders: [], settingsRows: [] })),
  /required table\(s\) empty/,
  'fully empty snapshot must throw',
);

// Any single empty core table (partial outage) must also fail the build.
for (const key of ['authAccounts', 'employees', 'orders', 'settingsRows']) {
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

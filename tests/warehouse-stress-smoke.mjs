import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

function parseIterations() {
  const cliArg = process.argv.find((arg) => arg.startsWith('--iterations='));
  const raw = cliArg ? cliArg.split('=')[1] : process.env.RO_STRESS_ITERATIONS;
  const parsed = Number(raw || 5);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 5;
}

function shouldIncludeLive() {
  return String(process.env.RO_STRESS_INCLUDE_LIVE || '').toLowerCase() === 'true';
}

function runSuite(label, args, extraEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  if (result.error) {
    throw result.error;
  }
  assert.equal(result.status, 0, `${label} failed with exit code ${result.status}`);
}

const iterations = parseIterations();
const includeLive = shouldIncludeLive();
const startedAt = Date.now();

console.log(`warehouse stress smoke: starting ${iterations} iteration(s)`);
console.log('critical coverage: current-order reservation quota, pendant warehouse picker, clone order, legacy warehouse deductions, local fallback ids, migration write idempotency');
if (includeLive) {
  console.log('live coverage enabled: bugs done fallback + warehouse page');
}

for (let index = 1; index <= iterations; index += 1) {
  console.log(`\n[warehouse-stress] iteration ${index}/${iterations}: order-flow smoke`);
  runSuite('order-flow smoke', ['tests/order-flow-smoke.js']);

  console.log(`\n[warehouse-stress] iteration ${index}/${iterations}: warehouse migration smoke`);
  runSuite('warehouse migration smoke', ['tests/warehouse-migration-smoke.js']);

  console.log(`\n[warehouse-stress] iteration ${index}/${iterations}: supabase fallback smoke`);
  runSuite('supabase fallback smoke', ['tests/supabase-fallback-smoke.js']);

  if (includeLive) {
    console.log(`\n[warehouse-stress] iteration ${index}/${iterations}: live site smoke`);
    runSuite('live site smoke', ['tests/live-site-smoke.mjs']);
  }
}

const elapsedMs = Date.now() - startedAt;
console.log(`warehouse stress smoke passed (${iterations} iteration(s), ${elapsedMs}ms)`);

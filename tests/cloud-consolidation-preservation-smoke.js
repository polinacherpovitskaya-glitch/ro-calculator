const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'ops', 'migration', 'cloud-consolidation-preservation.json');
const validatorPath = path.join(root, 'scripts', 'cloud-consolidation', 'verify-preservation-manifest.mjs');

function verifiedEvidence(check, sourceId) {
  const evidence = {
    verifiedAt: '2026-08-04T17:00:00Z',
    method: `test-${check}`,
    reportRef: `test://${sourceId}/${check}`,
  };
  if (check === 'backup') {
    evidence.artifact = {
      location: `test://${sourceId}/backup.dump`,
      sha256: 'a'.repeat(64),
      bytes: 1024,
      createdAt: '2026-08-04T16:55:00Z',
      encrypted: true,
    };
  }
  return evidence;
}

(async () => {
  const { validateManifest } = await import(pathToFileURL(validatorPath).href);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.deepEqual(validateManifest(manifest, { mode: 'inventory' }), []);

  const pending = structuredClone(manifest);
  const pendingSource = pending.systems[0].sources[0];
  const pendingCheck = pendingSource.requiredChecks[0];
  pendingSource.checks[pendingCheck] = 'pending';
  delete pendingSource.evidence[pendingCheck];

  const backupErrors = validateManifest(pending, { mode: 'backups' });
  assert.ok(backupErrors.length > 0, 'pending preservation checks must block backups mode');
  assert.ok(
    backupErrors.some((error) => error.includes('must be verified in backups mode')),
    'backups mode must explain the fail-closed status',
  );

  const ready = structuredClone(manifest);
  for (const system of ready.systems) {
    for (const source of system.sources) {
      for (const check of source.requiredChecks) {
        source.checks[check] = 'verified';
        source.evidence[check] = verifiedEvidence(check, source.id);
      }
    }
  }
  assert.deepEqual(validateManifest(ready, { mode: 'backups' }), []);

  const preApprovalErrors = validateManifest(ready, { mode: 'decommission' });
  assert.ok(
    preApprovalErrors.some((error) => error.includes('approvalStatus must be approved')),
    'verified backups alone must not authorize decommission',
  );

  for (const system of ready.systems) {
    system.decommission = {
      observationStatus: 'verified',
      writesStoppedStatus: 'verified',
      writesStoppedAt: '2026-08-20T12:00:00Z',
      approvalStatus: 'approved',
      approvedBy: 'owner-test-fixture',
      approvedAt: '2026-08-20T13:00:00Z',
    };
  }
  assert.deepEqual(validateManifest(ready, { mode: 'decommission' }), []);

  const brokenChecksum = structuredClone(ready);
  brokenChecksum.systems[0].sources[0].evidence.backup.artifact.sha256 = 'not-a-checksum';
  assert.ok(
    validateManifest(brokenChecksum, { mode: 'decommission' })
      .some((error) => error.includes('64 lowercase hex characters')),
    'invalid checksums must block decommission',
  );

  const missingSystem = structuredClone(manifest);
  missingSystem.systems = missingSystem.systems.filter((system) => system.id !== 'repanel-site');
  assert.ok(
    validateManifest(missingSystem, { mode: 'inventory' })
      .some((error) => error.includes('missing required system repanel-site')),
    'all four products must remain in the inventory',
  );

  const leakedSecret = structuredClone(manifest);
  leakedSecret.policy.accidentalValue = `eyJ${'a'.repeat(24)}.${'b'.repeat(16)}.${'c'.repeat(16)}`;
  assert.ok(
    validateManifest(leakedSecret, { mode: 'inventory' })
      .some((error) => error.includes('secret-like value is forbidden')),
    'secret-like values must never be accepted in preservation metadata',
  );

  console.log('cloud consolidation preservation smoke checks passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

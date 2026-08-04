import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALID_MODES = new Set(['inventory', 'backups', 'decommission']);
const VALID_CHECKS = new Set(['backup', 'cloudCopy', 'offlineCopy', 'restore', 'parity']);
const VALID_STATUSES = new Set(['pending', 'captured', 'verified']);
const REQUIRED_SYSTEM_IDS = new Set([
  'ro-calculator',
  'repanel-calculator',
  'repanel-site',
  'recycle-object-site',
]);
const SECRET_VALUE_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bya29\.[A-Za-z0-9_-]{20,}\b/,
  /\bsk-[A-Za-z0-9_-]{20,}\b/,
];

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertCondition(condition, message, errors) {
  if (!condition) errors.push(message);
}

function isIsoDate(value) {
  return typeof value === 'string'
    && value.trim() !== ''
    && Number.isFinite(Date.parse(value));
}

function rejectSecretLikeValues(value, valuePath, errors) {
  if (typeof value === 'string') {
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value))) {
      errors.push(`${valuePath}: secret-like value is forbidden in the manifest`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectSecretLikeValues(entry, `${valuePath}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    rejectSecretLikeValues(entry, `${valuePath}.${key}`, errors);
  }
}

function validateVerifiedEvidence(source, check, errors) {
  const label = `${source.id}.${check}`;
  const evidence = source.evidence?.[check];
  assertCondition(isObject(evidence), `${label}: verified check requires evidence`, errors);
  if (!isObject(evidence)) return;

  assertCondition(isIsoDate(evidence.verifiedAt), `${label}: verifiedAt must be an ISO date`, errors);
  assertCondition(
    typeof evidence.method === 'string' && evidence.method.trim() !== '',
    `${label}: method is required`,
    errors,
  );
  assertCondition(
    typeof evidence.reportRef === 'string' && evidence.reportRef.trim() !== '',
    `${label}: reportRef is required`,
    errors,
  );

  if (check !== 'backup') return;
  const artifact = evidence.artifact;
  assertCondition(isObject(artifact), `${label}: backup artifact is required`, errors);
  if (!isObject(artifact)) return;
  assertCondition(
    typeof artifact.location === 'string' && artifact.location.trim() !== '',
    `${label}: artifact.location is required`,
    errors,
  );
  assertCondition(
    typeof artifact.sha256 === 'string' && /^[a-f0-9]{64}$/.test(artifact.sha256),
    `${label}: artifact.sha256 must be 64 lowercase hex characters`,
    errors,
  );
  assertCondition(
    Number.isInteger(artifact.bytes) && artifact.bytes > 0,
    `${label}: artifact.bytes must be a positive integer`,
    errors,
  );
  assertCondition(isIsoDate(artifact.createdAt), `${label}: artifact.createdAt must be an ISO date`, errors);
  assertCondition(
    typeof artifact.encrypted === 'boolean',
    `${label}: artifact.encrypted must be boolean`,
    errors,
  );
}

function validateSource(source, systemId, mode, errors) {
  const label = `${systemId}.source`;
  assertCondition(isObject(source), `${label}: entry must be an object`, errors);
  if (!isObject(source)) return;

  assertCondition(typeof source.id === 'string' && source.id.trim() !== '', `${label}: id is required`, errors);
  assertCondition(typeof source.kind === 'string' && source.kind.trim() !== '', `${source.id}: kind is required`, errors);
  assertCondition(typeof source.provider === 'string' && source.provider.trim() !== '', `${source.id}: provider is required`, errors);
  assertCondition(typeof source.location === 'string' && source.location.trim() !== '', `${source.id}: location is required`, errors);
  assertCondition(typeof source.containsPersonalData === 'boolean', `${source.id}: containsPersonalData must be boolean`, errors);
  assertCondition(source.retirementBlocker === true, `${source.id}: retirementBlocker must be true`, errors);
  assertCondition(
    Array.isArray(source.requiredChecks) && source.requiredChecks.length > 0,
    `${source.id}: requiredChecks must be non-empty`,
    errors,
  );
  assertCondition(isObject(source.checks), `${source.id}: checks must be an object`, errors);
  assertCondition(isObject(source.evidence), `${source.id}: evidence must be an object`, errors);

  const requiredChecks = Array.isArray(source.requiredChecks) ? source.requiredChecks : [];
  const duplicateChecks = requiredChecks.filter((check, index) => requiredChecks.indexOf(check) !== index);
  assertCondition(duplicateChecks.length === 0, `${source.id}: requiredChecks must be unique`, errors);

  for (const check of requiredChecks) {
    assertCondition(VALID_CHECKS.has(check), `${source.id}: unknown required check ${check}`, errors);
    const status = source.checks?.[check];
    assertCondition(VALID_STATUSES.has(status), `${source.id}.${check}: invalid status ${status}`, errors);
    if (status === 'verified') validateVerifiedEvidence(source, check, errors);
    if (mode !== 'inventory') {
      assertCondition(status === 'verified', `${source.id}.${check}: must be verified in ${mode} mode`, errors);
    }
  }
}

function validateSystem(system, mode, errors) {
  assertCondition(isObject(system), 'system entry must be an object', errors);
  if (!isObject(system)) return;
  assertCondition(typeof system.id === 'string' && system.id.trim() !== '', 'system.id is required', errors);
  assertCondition(
    typeof system.repository === 'string' && /^[^/]+\/[^/]+$/.test(system.repository),
    `${system.id}: repository must use owner/name`,
    errors,
  );
  assertCondition(
    Array.isArray(system.productionUrls) && system.productionUrls.length > 0,
    `${system.id}: productionUrls must be non-empty`,
    errors,
  );
  for (const url of system.productionUrls || []) {
    assertCondition(typeof url === 'string' && /^https:\/\//.test(url), `${system.id}: production URL must use HTTPS`, errors);
  }
  assertCondition(system.targetProvider === 'yandex-cloud-ru', `${system.id}: targetProvider must be yandex-cloud-ru`, errors);
  assertCondition(Array.isArray(system.configurationKeyNames), `${system.id}: configurationKeyNames must be an array`, errors);
  assertCondition(Array.isArray(system.sources) && system.sources.length > 0, `${system.id}: sources must be non-empty`, errors);
  assertCondition(isObject(system.decommission), `${system.id}: decommission state is required`, errors);

  const sourceIds = new Set();
  for (const source of system.sources || []) {
    validateSource(source, system.id, mode, errors);
    if (isObject(source) && typeof source.id === 'string') {
      assertCondition(!sourceIds.has(source.id), `${system.id}: duplicate source id ${source.id}`, errors);
      sourceIds.add(source.id);
    }
  }

  if (mode !== 'decommission') return;
  assertCondition(
    system.decommission?.observationStatus === 'verified',
    `${system.id}: observationStatus must be verified`,
    errors,
  );
  assertCondition(
    system.decommission?.writesStoppedStatus === 'verified',
    `${system.id}: writesStoppedStatus must be verified`,
    errors,
  );
  assertCondition(
    isIsoDate(system.decommission?.writesStoppedAt),
    `${system.id}: writesStoppedAt must be an ISO date`,
    errors,
  );
  assertCondition(
    system.decommission?.approvalStatus === 'approved',
    `${system.id}: approvalStatus must be approved`,
    errors,
  );
  assertCondition(
    typeof system.decommission?.approvedBy === 'string' && system.decommission.approvedBy.trim() !== '',
    `${system.id}: approvedBy is required`,
    errors,
  );
  assertCondition(
    isIsoDate(system.decommission?.approvedAt),
    `${system.id}: approvedAt must be an ISO date`,
    errors,
  );
}

export function validateManifest(manifest, { mode = 'inventory' } = {}) {
  if (!VALID_MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);
  const errors = [];
  assertCondition(isObject(manifest), 'manifest must be an object', errors);
  if (!isObject(manifest)) return errors;
  rejectSecretLikeValues(manifest, 'manifest', errors);

  assertCondition(manifest.schemaVersion === 1, 'schemaVersion must equal 1', errors);
  assertCondition(isIsoDate(manifest.updatedAt), 'updatedAt must be an ISO date', errors);
  assertCondition(
    manifest.policy?.primaryProvider === 'yandex-cloud-ru',
    'policy.primaryProvider must be yandex-cloud-ru',
    errors,
  );
  assertCondition(
    Array.isArray(manifest.policy?.allowedSecondaryProviders)
      && manifest.policy.allowedSecondaryProviders.length === 1
      && manifest.policy.allowedSecondaryProviders[0] === 'vercel-telegram-relay',
    'policy.allowedSecondaryProviders must contain only vercel-telegram-relay',
    errors,
  );
  assertCondition(
    manifest.policy?.physicalDeletionRequiresOwnerApproval === true,
    'physical deletion must require owner approval',
    errors,
  );
  assertCondition(Array.isArray(manifest.systems), 'systems must be an array', errors);

  const systemIds = new Set();
  for (const system of manifest.systems || []) {
    validateSystem(system, mode, errors);
    if (isObject(system) && typeof system.id === 'string') {
      assertCondition(!systemIds.has(system.id), `duplicate system id ${system.id}`, errors);
      systemIds.add(system.id);
    }
  }
  for (const requiredSystemId of REQUIRED_SYSTEM_IDS) {
    assertCondition(systemIds.has(requiredSystemId), `missing required system ${requiredSystemId}`, errors);
  }
  assertCondition(systemIds.size === REQUIRED_SYSTEM_IDS.size, 'manifest must contain exactly four required systems', errors);

  return errors;
}

function parseCliArgs(argv) {
  const manifestPath = argv.find((arg) => !arg.startsWith('--'));
  const modeArg = argv.find((arg) => arg.startsWith('--mode='));
  return {
    manifestPath,
    mode: modeArg ? modeArg.slice('--mode='.length) : 'inventory',
  };
}

function runCli() {
  const { manifestPath, mode } = parseCliArgs(process.argv.slice(2));
  if (!manifestPath) throw new Error('Usage: verify-preservation-manifest.mjs <manifest.json> --mode=inventory|backups|decommission');
  const resolvedPath = path.resolve(process.cwd(), manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
  const errors = validateManifest(manifest, { mode });
  if (errors.length > 0) {
    throw new Error(`Preservation manifest failed (${mode}):\n- ${errors.join('\n- ')}`);
  }
  console.log(`preservation manifest checks passed (${mode}, ${manifest.systems.length} systems)`);
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

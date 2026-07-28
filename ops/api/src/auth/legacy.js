const PASSWORD_HASH_VERSION = 2;
const PASSWORD_HASH_ROUNDS = 2048;
const SECRET_FIELDS = [
  'password',
  'password_hash',
  'password_hash_version',
  'password_plain',
  'password_rotated_at',
  'salt',
];

function simpleHash(value) {
  const text = String(value ?? '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return String(hash);
}

export function legacyPasswordHashVersion(account) {
  const explicit = Number.parseInt(account?.password_hash_version, 10);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const match = String(account?.password_hash || '').match(/^v(\d+):/);
  return match ? Number.parseInt(match[1], 10) || 1 : 1;
}

export function hashLegacyPassword(username, password, version = PASSWORD_HASH_VERSION) {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const normalizedPassword = String(password || '');
  const targetVersion = Number(version) || PASSWORD_HASH_VERSION;
  if (targetVersion <= 1) {
    return simpleHash(`ro:${normalizedUsername}::${normalizedPassword}`);
  }

  let digest = `ro:v${targetVersion}:${normalizedUsername}::${normalizedPassword}`;
  for (let index = 0; index < PASSWORD_HASH_ROUNDS; index += 1) {
    digest = simpleHash(`${targetVersion}|${index}|${digest}|recycle-object`);
  }
  return `v${targetVersion}:${digest}`;
}

export function verifyLegacyPassword(account, password) {
  if (!account?.password_hash) return false;
  const version = legacyPasswordHashVersion(account);
  return hashLegacyPassword(account.username, password, version) === account.password_hash;
}

export function parseLegacyAccountsRow(row) {
  if (!row || row.key !== 'auth_accounts_json') return [];
  try {
    const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    return Array.isArray(parsed) ? parsed.filter((account) => account && typeof account === 'object') : [];
  } catch {
    return [];
  }
}

export function sanitizeLegacyAccount(account, { loginList = false } = {}) {
  if (!account || typeof account !== 'object') return null;
  const sanitized = { ...account };
  for (const field of SECRET_FIELDS) delete sanitized[field];
  if (!loginList) return sanitized;
  return {
    id: sanitized.id,
    username: sanitized.username || '',
    employee_name: sanitized.employee_name || sanitized.username || 'Сотрудник',
    is_active: sanitized.is_active !== false,
  };
}

export function mergeLegacyAccountSecrets(incomingAccounts, currentAccounts) {
  const currentById = new Map(
    (Array.isArray(currentAccounts) ? currentAccounts : [])
      .map((account) => [String(account?.id ?? ''), account])
  );
  return (Array.isArray(incomingAccounts) ? incomingAccounts : []).map((incoming) => {
    const current = currentById.get(String(incoming?.id ?? '')) || {};
    const merged = { ...incoming };
    for (const field of SECRET_FIELDS) {
      if ((merged[field] === undefined || merged[field] === null || merged[field] === '') && current[field] != null) {
        merged[field] = current[field];
      }
    }
    return merged;
  });
}

export function legacyApiRole(account) {
  const role = String(account?.role || '').toLowerCase();
  const pages = Array.isArray(account?.pages) ? account.pages : [];
  return role === 'admin' || role === 'owner' || pages.includes('settings') ? 'admin' : 'user';
}

export const LEGACY_PASSWORD_HASH_VERSION = PASSWORD_HASH_VERSION;

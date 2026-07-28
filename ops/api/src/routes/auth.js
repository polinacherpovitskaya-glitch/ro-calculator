import { Router } from 'express';
import { getPool } from '../db.js';
import { hashPassword, verifyPassword } from '../auth/argon.js';
import { createSession, loadSession, revokeSession } from '../auth/sessions.js';
import { requireAuth } from '../middleware/auth.js';
import {
  hashLegacyPassword,
  legacyApiRole,
  legacyPasswordHashVersion,
  LEGACY_PASSWORD_HASH_VERSION,
  parseLegacyAccountsRow,
  sanitizeLegacyAccount,
  verifyLegacyPassword,
} from '../auth/legacy.js';

const router = Router();

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 60 * 24 * 60 * 60 * 1000,
  path: '/',
};

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee_id ?? null,
    legacyAccountId: user.legacy_account_id ?? null,
    mustChangePassword: user.must_change_password,
  };
}

async function loadLegacyAccounts(client = getPool(), { lock = false } = {}) {
  const { rows } = await client.query(
    `SELECT data
       FROM compat_rows
      WHERE table_name = 'settings'
        AND source_id = 'auth_accounts_json'${lock ? ' FOR UPDATE' : ''}`,
  );
  return {
    row: rows[0]?.data || null,
    accounts: parseLegacyAccountsRow(rows[0]?.data),
  };
}

function findLegacyAccount(accounts, accountId) {
  return accounts.find(
    (account) => String(account?.id ?? '') === String(accountId ?? '') && account?.is_active !== false,
  );
}

router.get('/legacy-accounts', async (req, res) => {
  const { accounts } = await loadLegacyAccounts();
  const session = req.cookies?.session_id ? await loadSession(req.cookies.session_id) : null;
  res.json({
    accounts: accounts
      .filter((account) => account?.is_active !== false)
      .map((account) => sanitizeLegacyAccount(account, { loginList: !session }))
      .filter(Boolean),
  });
});

router.post('/legacy-login', async (req, res) => {
  const accountId = String(req.body?.account_id || '').trim();
  const password = String(req.body?.password || '');
  if (!accountId || !password) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Пользователь и пароль обязательны' },
    });
  }

  const pool = getPool();
  const result = await pool.connect();
  try {
    await result.query('BEGIN');
    await result.query(`SELECT pg_advisory_xact_lock(hashtext('compat:settings'))`);
    const { row, accounts } = await loadLegacyAccounts(result, { lock: true });
    const account = findLegacyAccount(accounts, accountId);
    if (!account || !verifyLegacyPassword(account, password)) {
      await result.query('ROLLBACK');
      return res.status(401).json({
        error: { code: 'INVALID_CREDENTIALS', message: 'Неверный пользователь или пароль' },
      });
    }

    const now = new Date().toISOString();
    account.last_login_at = now;
    if (legacyPasswordHashVersion(account) < LEGACY_PASSWORD_HASH_VERSION) {
      account.password_hash = hashLegacyPassword(account.username, password);
      account.password_hash_version = LEGACY_PASSWORD_HASH_VERSION;
      account.password_rotated_at = now;
      delete account.password_plain;
    }
    await result.query(
      `UPDATE compat_rows
          SET data = $1,
              updated_at = NOW()
        WHERE table_name = 'settings'
          AND source_id = 'auth_accounts_json'`,
      [{ ...row, value: JSON.stringify(accounts), updated_at: now }],
    );

    const apiRole = legacyApiRole(account);
    const employeeId = account.employee_id == null ? null : Number(account.employee_id);
    const pseudoEmail = `legacy-${accountId}@auth.recycleobject.local`;
    const userResult = await result.query(
      `INSERT INTO auth_users (
         email, password_hash, employee_id, role, must_change_password, legacy_account_id, last_login_at
       )
       VALUES (
         $1,
         'legacy-session-only',
         (SELECT id FROM employees WHERE id = $2),
         $3,
         FALSE,
         $4,
         NOW()
       )
       ON CONFLICT (legacy_account_id) WHERE legacy_account_id IS NOT NULL DO UPDATE
         SET employee_id = EXCLUDED.employee_id,
             role = EXCLUDED.role,
             last_login_at = NOW()
       RETURNING id, email, role, employee_id, must_change_password, legacy_account_id`,
      [pseudoEmail, Number.isFinite(employeeId) ? employeeId : null, apiRole, accountId],
    );
    await result.query('COMMIT');

    const user = userResult.rows[0];
    const { id: sessionId } = await createSession(user.id, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.cookie('session_id', sessionId, COOKIE_OPTS);
    return res.json({
      user: publicUser(user),
      account: sanitizeLegacyAccount(account),
    });
  } catch (error) {
    await result.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    result.release();
  }
});

router.get('/legacy-me', requireAuth, async (req, res) => {
  if (!req.user.legacyAccountId) {
    return res.status(404).json({
      error: { code: 'NO_LEGACY_ACCOUNT', message: 'Сессия не связана с учётной записью калькулятора' },
    });
  }
  const { accounts } = await loadLegacyAccounts();
  const account = findLegacyAccount(accounts, req.user.legacyAccountId);
  if (!account) {
    return res.status(401).json({
      error: { code: 'ACCOUNT_DISABLED', message: 'Учётная запись отключена' },
    });
  }
  return res.json({
    user: req.user,
    account: sanitizeLegacyAccount(account),
  });
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) {
    return res.status(400).json({
      error: { code: 'INVALID_INPUT', message: 'Email и пароль обязательны' },
    });
  }

  const pool = getPool();
  const userRes = await pool.query(
    `SELECT id, email, password_hash, role, must_change_password, employee_id, legacy_account_id
       FROM auth_users WHERE LOWER(email) = $1`,
    [email]
  );
  const user = userRes.rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return res.status(401).json({
      error: { code: 'INVALID_CREDENTIALS', message: 'Неверный email или пароль' },
    });
  }

  const { id: sessionId } = await createSession(user.id, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  await pool.query(`UPDATE auth_users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

  res.cookie('session_id', sessionId, COOKIE_OPTS);
  res.json({ user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
  const sessionId = req.cookies?.session_id;
  if (sessionId) {
    await revokeSession(sessionId);
  }
  res.clearCookie('session_id', { path: '/' });
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post('/change-password', requireAuth, async (req, res) => {
  const oldPassword = String(req.body?.old_password || '');
  const newPassword = String(req.body?.new_password || '');
  if (newPassword.length < 10) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'Минимум 10 символов' },
    });
  }

  const pool = getPool();
  const userRes = await pool.query(`SELECT password_hash FROM auth_users WHERE id = $1`, [req.user.id]);
  if (!userRes.rows[0] || !(await verifyPassword(oldPassword, userRes.rows[0].password_hash))) {
    return res.status(400).json({
      error: { code: 'WRONG_OLD_PASSWORD', message: 'Старый пароль неверный' },
    });
  }

  const newHash = await hashPassword(newPassword);
  await pool.query(
    `UPDATE auth_users
        SET password_hash = $1, must_change_password = FALSE
      WHERE id = $2`,
    [newHash, req.user.id]
  );

  res.json({ ok: true });
});

export default router;

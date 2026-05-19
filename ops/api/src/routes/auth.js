import { Router } from 'express';
import { getPool } from '../db.js';
import { hashPassword, verifyPassword } from '../auth/argon.js';
import { createSession, revokeSession } from '../auth/sessions.js';
import { requireAuth } from '../middleware/auth.js';

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
    mustChangePassword: user.must_change_password,
  };
}

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
    `SELECT id, email, password_hash, role, must_change_password, employee_id
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

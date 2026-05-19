import crypto from 'node:crypto';
import { getPool } from '../db.js';

const SESSION_TTL_DAYS = 60;

export async function createSession(userId, meta = {}) {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  const pool = getPool();

  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, expiresAt, meta.ip || null, meta.userAgent || null]
  );

  return { id, expiresAt };
}

export async function loadSession(id) {
  const pool = getPool();
  const res = await pool.query(
    `SELECT s.*, u.email, u.role, u.must_change_password, u.employee_id
       FROM auth_sessions s
       JOIN auth_users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
    [id]
  );

  return res.rows[0] || null;
}

export async function revokeSession(id) {
  const pool = getPool();
  await pool.query(`UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1`, [id]);
}

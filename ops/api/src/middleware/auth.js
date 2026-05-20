import { loadSession } from '../auth/sessions.js';
import { getPool } from '../db.js';

export async function requireAuth(req, res, next) {
  const authHeader = req.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const { rows } = await getPool().query(`SELECT name, role FROM bot_tokens WHERE token = $1`, [token]);
      if (rows[0]) {
        await getPool().query(`UPDATE bot_tokens SET last_used_at = NOW() WHERE token = $1`, [token]);
        req.user = {
          id: 0,
          email: `bot:${rows[0].name}`,
          role: rows[0].role,
          employeeId: null,
          mustChangePassword: false,
        };
        return next();
      }
    }
  }

  const sessionId = req.cookies?.session_id;
  if (!sessionId) {
    return res.status(401).json({
      error: { code: 'NO_SESSION', message: 'Не авторизован' },
    });
  }

  const session = await loadSession(sessionId);
  if (!session) {
    return res.status(401).json({
      error: { code: 'INVALID_SESSION', message: 'Сессия истекла или отозвана' },
    });
  }

  req.user = {
    id: session.user_id,
    email: session.email,
    role: session.role,
    employeeId: session.employee_id,
    mustChangePassword: session.must_change_password,
  };
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Недостаточно прав' },
      });
    }
    next();
  };
}

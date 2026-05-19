import { loadSession } from '../auth/sessions.js';

export async function requireAuth(req, res, next) {
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

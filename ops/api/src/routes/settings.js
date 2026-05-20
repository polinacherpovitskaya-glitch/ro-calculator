import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, error } from './work-utils.js';

const router = Router();
const KEY_RE = /^[A-Za-z0-9_.:-]{1,120}$/;

function normalizeKey(value) {
  const key = String(value || '').trim();
  return KEY_RE.test(key) ? key : null;
}

function payload(row) {
  return row ? { ...row } : null;
}

router.get(
  '/',
  requireAuth,
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const { rows } = await getPool().query(`SELECT key, value, updated_at, updated_by FROM settings ORDER BY key`);
    res.json({ settings: rows.map(payload) });
  })
);

router.get(
  '/:key',
  requireAuth,
  asyncHandler(async (req, res) => {
    const key = normalizeKey(req.params.key);
    if (!key) return error(res, 400, 'INVALID_KEY', 'Некорректный ключ настройки');
    const { rows } = await getPool().query(`SELECT key, value, updated_at, updated_by FROM settings WHERE key = $1`, [key]);
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Настройка не найдена');
    res.json({ setting: payload(rows[0]) });
  })
);

router.put(
  '/:key',
  requireAuth,
  requireRole('admin'),
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const key = normalizeKey(req.params.key);
      if (!key) return error(res, 400, 'INVALID_KEY', 'Некорректный ключ настройки');
      if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, 'value') || req.body.value === undefined) {
        return error(res, 400, 'INVALID_INPUT', 'value обязателен');
      }
      const { rows } = await getPool().query(
        `INSERT INTO settings (key, value, updated_by)
         VALUES ($1, $2::jsonb, $3)
         ON CONFLICT (key) DO UPDATE SET
           value = EXCLUDED.value,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
         RETURNING key, value, updated_at, updated_by`,
        [key, JSON.stringify(req.body.value), req.user?.id || null]
      );
      res.json({ setting: payload(rows[0]) });
    })
  )
);

export default router;

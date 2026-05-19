import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function error(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, details } });
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error(err);
      return error(res, 500, err.code || 'INTERNAL_ERROR', 'Внутренняя ошибка');
    }
  };
}

function colorId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function normalizeHex(value) {
  if (value === null || value === undefined || value === '') return null;
  const hex = String(value).trim();
  return HEX_RE.test(hex) ? hex : undefined;
}

function normalizeValue(field, value) {
  if (field === 'extras') return value || {};
  if (field === 'hex') return normalizeHex(value);
  return value || null;
}

function validateHex(res, hex) {
  if (hex === undefined) {
    error(res, 400, 'INVALID_HEX', 'hex должен быть в формате #RRGGBB');
    return false;
  }
  return true;
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.category) {
      params.push(req.query.category);
      where.push(`category = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(hex, '')) LIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
      `SELECT * FROM app_colors
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, id DESC`,
      params
    );
    res.json({ colors: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = colorId(req.body?.id || Date.now());
      const name = String(req.body?.name || '').trim();
      const hex = normalizeHex(req.body?.hex);
      if (!id || !name) return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');
      if (!validateHex(res, hex)) return;

      const { rows } = await getPool().query(
        `INSERT INTO app_colors (id, name, hex, category, extras)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, name, hex, req.body?.category || null, req.body?.extras || {}]
      );
      res.status(201).json({ color: rows[0] });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['name', 'hex', 'category', 'extras'];
      const updates = [];
      const values = [];

      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        const value = normalizeValue(field, req.body[field]);
        if (field === 'hex' && !validateHex(res, value)) return;
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }

      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE app_colors
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Цвет не найден');
      res.json({ color: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM app_colors WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Цвет не найден');
      res.json({ ok: true });
    })
  )
);

export default router;

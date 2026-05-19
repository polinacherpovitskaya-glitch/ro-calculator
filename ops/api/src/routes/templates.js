import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

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

function templateId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

function normalizeData(value) {
  if (value === undefined || value === null || value === '') return {};
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value;
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.category) {
      params.push(String(req.query.category));
      where.push(`category = $${params.length}`);
    }
    if (req.query.active !== undefined) {
      params.push(String(req.query.active) !== 'false');
      where.push(`is_active = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(category, '')) LIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
      `SELECT *
         FROM product_templates
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY is_active DESC, updated_at DESC, id DESC`,
      params
    );
    res.json({ templates: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = templateId(req.body?.id || Date.now());
      const name = String(req.body?.name || '').trim();
      const data = normalizeData(req.body?.data);
      if (!id || !name) return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');
      if (data === undefined) return error(res, 400, 'INVALID_DATA', 'data должен быть JSON-объектом');

      const { rows } = await getPool().query(
        `INSERT INTO product_templates (id, name, category, data, is_active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [id, name, req.body?.category || null, data, boolValue(req.body?.is_active, true)]
      );
      res.status(201).json({ template: rows[0] });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['name', 'category', 'data', 'is_active'];
      const updates = [];
      const values = [];

      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (field === 'name') {
          value = String(value || '').trim();
          if (!value) return error(res, 400, 'INVALID_INPUT', 'name обязателен');
        } else if (field === 'data') {
          value = normalizeData(value);
          if (value === undefined) return error(res, 400, 'INVALID_DATA', 'data должен быть JSON-объектом');
        } else if (field === 'is_active') {
          value = boolValue(value);
        } else {
          value = value || null;
        }
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }

      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE product_templates
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Шаблон не найден');
      res.json({ template: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM product_templates WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Шаблон не найден');
      res.json({ ok: true });
    })
  )
);

export default router;

import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, boolValue, error, integer, jsonObject, nextId, nullableText, text } from './work-utils.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.active !== undefined) {
      params.push(String(req.query.active) !== 'false');
      where.push(`is_active = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(slug) LIKE $${params.length})`);
    }
    const { rows } = await getPool().query(
      `SELECT *
         FROM areas
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY is_active DESC, name, id`,
      params
    );
    res.json({ areas: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = integer(req.body?.id) || nextId();
      const name = text(req.body?.name);
      const slug = text(req.body?.slug || name.toLowerCase().replace(/\s+/g, '-'));
      const extras = jsonObject(req.body?.extras);
      if (!name || !slug) return error(res, 400, 'INVALID_INPUT', 'name и slug обязательны');
      if (extras === undefined) return error(res, 400, 'INVALID_INPUT', 'extras должен быть JSON-объектом');
      const { rows } = await getPool().query(
        `INSERT INTO areas (id, slug, name, color, is_active, extras)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [id, slug, name, nullableText(req.body?.color) || '#6b7280', boolValue(req.body?.is_active, true), extras]
      );
      res.status(201).json({ area: rows[0] });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['slug', 'name', 'color', 'is_active', 'extras'];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (field === 'name' || field === 'slug') {
          value = text(value);
          if (!value) return error(res, 400, 'INVALID_INPUT', `${field} обязателен`);
        } else if (field === 'is_active') {
          value = boolValue(value);
        } else if (field === 'extras') {
          value = jsonObject(value);
          if (value === undefined) return error(res, 400, 'INVALID_INPUT', 'extras должен быть JSON-объектом');
        } else {
          value = nullableText(value);
        }
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE areas SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Область не найдена');
      res.json({ area: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(`UPDATE areas SET is_active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING *`, [
        req.params.id,
      ]);
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Область не найдена');
      res.json({ area: rows[0] });
    })
  )
);

export default router;

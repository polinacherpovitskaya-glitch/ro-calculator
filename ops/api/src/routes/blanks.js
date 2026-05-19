import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const KINDS = {
  hardware: {
    table: 'hw_blanks',
    fields: ['sku', 'name', 'category', 'weight', 'last_price', 'last_currency', 'photo_url', 'extras'],
    numericFields: new Set(['weight', 'last_price']),
  },
  packaging: {
    table: 'pkg_blanks',
    fields: ['sku', 'name', 'category', 'last_price', 'last_currency', 'extras'],
    numericFields: new Set(['last_price']),
  },
};

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

function configFor(req, res) {
  const config = KINDS[req.params.kind];
  if (!config) {
    error(res, 404, 'UNKNOWN_BLANK_KIND', 'Неизвестный тип заготовки');
    return null;
  }
  return config;
}

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function blankId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function normalizeValue(config, field, value) {
  if (field === 'extras') return value || {};
  if (config.numericFields.has(field)) return numeric(value);
  return value || null;
}

function blankPayload(row) {
  const result = { ...row };
  for (const field of ['weight', 'last_price']) {
    if (field in result) result[field] = result[field] === null ? null : Number(result[field]);
  }
  return result;
}

router.get(
  '/:kind',
  requireAuth,
  asyncHandler(async (req, res) => {
    const config = configFor(req, res);
    if (!config) return;

    const params = [];
    const where = [];
    if (req.query.category) {
      params.push(req.query.category);
      where.push(`category = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(sku, '')) LIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
      `SELECT * FROM ${config.table}
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, id DESC`,
      params
    );
    res.json({ blanks: rows.map(blankPayload) });
  })
);

router.post(
  '/:kind',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const config = configFor(req, res);
      if (!config) return;

      const id = blankId(req.body?.id || Date.now());
      const name = String(req.body?.name || '').trim();
      if (!id || !name) return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');

      const insertFields = ['id', ...config.fields];
      const values = [id, ...config.fields.map((field) => normalizeValue(config, field, req.body?.[field]))];
      const placeholders = values.map((_, index) => `$${index + 1}`);
      const { rows } = await getPool().query(
        `INSERT INTO ${config.table} (${insertFields.join(', ')})
         VALUES (${placeholders.join(', ')})
         RETURNING *`,
        values
      );
      res.status(201).json({ blank: blankPayload(rows[0]) });
    })
  )
);

router.patch(
  '/:kind/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const config = configFor(req, res);
      if (!config) return;

      const updates = [];
      const values = [];
      for (const field of config.fields) {
        if (req.body?.[field] === undefined) continue;
        values.push(normalizeValue(config, field, req.body[field]));
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');

      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE ${config.table}
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Заготовка не найдена');
      res.json({ blank: blankPayload(rows[0]) });
    })
  )
);

router.delete(
  '/:kind/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const config = configFor(req, res);
      if (!config) return;

      const { rowCount } = await getPool().query(`DELETE FROM ${config.table} WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Заготовка не найдена');
      res.json({ ok: true });
    })
  )
);

export default router;

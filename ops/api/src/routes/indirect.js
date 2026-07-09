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

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = null) {
  const number = numeric(value, fallback);
  return number === null ? null : Math.trunc(number);
}

function validatePeriod(res, year, month = 1) {
  if (!year || year < 2000 || year > 2100 || !month || month < 1 || month > 12) {
    error(res, 400, 'INVALID_PERIOD', 'year должен быть 2000-2100, month 1-12');
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
    if (req.query.year) {
      const year = integer(req.query.year);
      if (!validatePeriod(res, year, 1)) return;
      params.push(year);
      where.push(`period_year = $${params.length}`);
    }
    if (req.query.month) {
      const month = integer(req.query.month);
      if (!month || month < 1 || month > 12) return error(res, 400, 'INVALID_PERIOD', 'month должен быть 1-12');
      params.push(month);
      where.push(`period_month = $${params.length}`);
    }

    const { rows } = await getPool().query(
      `SELECT *
         FROM indirect_costs
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY period_year DESC, period_month DESC, category`,
      params
    );
    res.json({ indirect_costs: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const year = integer(req.body?.period_year);
      const month = integer(req.body?.period_month);
      const category = String(req.body?.category || '').trim();
      const amount = numeric(req.body?.amount);
      if (!validatePeriod(res, year, month)) return;
      if (!category || amount === null || amount < 0) {
        return error(res, 400, 'INVALID_INPUT', 'category и amount >= 0 обязательны');
      }

      const { rows } = await getPool().query(
        `INSERT INTO indirect_costs (period_year, period_month, category, amount, currency, note, extras)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [year, month, category, amount, req.body?.currency || 'RUB', req.body?.note || null, req.body?.extras || {}]
      );
      res.status(201).json({ indirect_cost: rows[0] });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['period_year', 'period_month', 'category', 'amount', 'currency', 'note', 'extras'];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (field === 'period_year' || field === 'period_month') {
          value = integer(value);
          if (field === 'period_year' && (value < 2000 || value > 2100)) {
            return error(res, 400, 'INVALID_PERIOD', 'year должен быть 2000-2100');
          }
          if (field === 'period_month' && (value < 1 || value > 12)) {
            return error(res, 400, 'INVALID_PERIOD', 'month должен быть 1-12');
          }
        } else if (field === 'amount') {
          value = numeric(value);
          if (value === null || value < 0) return error(res, 400, 'INVALID_INPUT', 'amount должен быть >= 0');
        } else if (field === 'extras') {
          value = value || {};
        } else if (field === 'category') {
          value = String(value || '').trim();
          if (!value) return error(res, 400, 'INVALID_INPUT', 'category обязателен');
        } else {
          value = value || null;
        }
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');

      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE indirect_costs
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Косвенный расход не найден');
      res.json({ indirect_cost: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM indirect_costs WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Косвенный расход не найден');
      res.json({ ok: true });
    })
  )
);

export default router;

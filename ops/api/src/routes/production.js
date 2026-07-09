import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const STATUSES = new Set(['planned', 'in_progress', 'done', 'cancelled']);

function error(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, details } });
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.code === 'INVALID_INPUT' || err.code === 'INVALID_OPERATOR') {
        return error(res, 400, err.code, err.message, err.details);
      }
      console.error(err);
      return error(res, 500, err.code || 'INTERNAL_ERROR', 'Внутренняя ошибка');
    }
  };
}

function codedError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
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

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

function dateValue(value) {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function yearValue(value) {
  const year = integer(value);
  return year && year >= 2000 && year <= 2100 ? year : null;
}

async function validateOperator(client, operatorId) {
  if (operatorId === null || operatorId === undefined) return null;
  const id = integer(operatorId);
  if (!id) throw codedError('INVALID_OPERATOR', 'operator_id должен ссылаться на сотрудника');
  const { rows } = await client.query(`SELECT id FROM employees WHERE id = $1`, [id]);
  if (!rows[0]) throw codedError('INVALID_OPERATOR', 'operator_id должен ссылаться на сотрудника');
  return id;
}

router.get(
  '/calendar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const year = yearValue(req.query.year || new Date().getFullYear());
    if (!year) return error(res, 400, 'INVALID_INPUT', 'year должен быть в диапазоне 2000-2100');
    const { rows } = await getPool().query(
      `SELECT *
         FROM production_calendar_days
        WHERE date >= $1::date AND date < ($1::date + INTERVAL '1 year')
        ORDER BY date`,
      [`${year}-01-01`]
    );
    res.json({ days: rows });
  })
);

router.put(
  '/calendar',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const days = Array.isArray(req.body?.days) ? req.body.days : null;
      if (!days) return error(res, 400, 'INVALID_INPUT', 'days должен быть массивом');

      const saved = await withTransaction(async (client) => {
        const rows = [];
        for (const day of days) {
          const date = dateValue(day?.date);
          const hours = numeric(day?.hours, 8);
          if (!date || hours < 0) throw codedError('INVALID_INPUT', 'date должен быть YYYY-MM-DD, hours >= 0');
          const result = await client.query(
            `INSERT INTO production_calendar_days (date, is_working, hours, note, extras)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (date) DO UPDATE
               SET is_working = EXCLUDED.is_working,
                   hours = EXCLUDED.hours,
                   note = EXCLUDED.note,
                   extras = EXCLUDED.extras,
                   updated_at = NOW()
             RETURNING *`,
            [date, boolValue(day?.is_working, true), hours, day?.note || null, day?.extras || {}]
          );
          rows.push(result.rows[0]);
        }
        return rows;
      });

      res.json({ days: saved });
    })
  )
);

router.get(
  '/plan',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.date) {
      const date = dateValue(req.query.date);
      if (!date) return error(res, 400, 'INVALID_INPUT', 'date должен быть YYYY-MM-DD');
      params.push(date);
      where.push(`date = $${params.length}`);
    }
    if (req.query.order_id) {
      const orderId = integer(req.query.order_id);
      if (!orderId) return error(res, 400, 'INVALID_INPUT', 'order_id должен быть числом');
      params.push(orderId);
      where.push(`order_id = $${params.length}`);
    }

    const { rows } = await getPool().query(
      `SELECT p.*, e.name AS operator_name
         FROM production_plan_entries p
         LEFT JOIN employees e ON e.id = p.operator_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.date, p.position, p.id`,
      params
    );
    res.json({ entries: rows });
  })
);

router.post(
  '/plan',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const entry = await withTransaction(async (client) => {
        const date = dateValue(req.body?.date);
        if (!date) throw codedError('INVALID_INPUT', 'date обязателен в формате YYYY-MM-DD');
        const operatorId = await validateOperator(client, req.body?.operator_id);
        const status = req.body?.status || 'planned';
        if (!STATUSES.has(status)) throw codedError('INVALID_INPUT', 'Некорректный status');
        const position = integer(req.body?.position);
        const finalPosition =
          position ||
          Number(
            (
              await client.query(`SELECT COALESCE(MAX(position), 0) + 100 AS next_position FROM production_plan_entries WHERE date = $1`, [
                date,
              ])
            ).rows[0].next_position
          );
        const { rows } = await client.query(
          `INSERT INTO production_plan_entries
             (date, order_id, item_name, qty, hours_planned, operator_id, status, position, note, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING *`,
          [
            date,
            integer(req.body?.order_id),
            req.body?.item_name || null,
            numeric(req.body?.qty),
            numeric(req.body?.hours_planned),
            operatorId,
            status,
            finalPosition,
            req.body?.note || null,
            req.body?.extras || {},
          ]
        );
        return rows[0];
      });
      res.status(201).json({ entry });
    })
  )
);

router.patch(
  '/plan/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const entry = await withTransaction(async (client) => {
        const fields = ['date', 'order_id', 'item_name', 'qty', 'hours_planned', 'operator_id', 'status', 'position', 'note', 'extras'];
        const updates = [];
        const values = [];
        for (const field of fields) {
          if (req.body?.[field] === undefined) continue;
          let value = req.body[field];
          if (field === 'date') {
            value = dateValue(value);
            if (!value) throw codedError('INVALID_INPUT', 'date должен быть YYYY-MM-DD');
          } else if (field === 'operator_id') {
            value = await validateOperator(client, value);
          } else if (field === 'status') {
            if (!STATUSES.has(value)) throw codedError('INVALID_INPUT', 'Некорректный status');
          } else if (field === 'qty' || field === 'hours_planned') {
            value = numeric(value);
            if (value !== null && value < 0) throw codedError('INVALID_INPUT', `${field} должен быть >= 0`);
          } else if (field === 'order_id' || field === 'position') {
            value = integer(value);
          } else if (field === 'extras') {
            value = value || {};
          } else {
            value = value || null;
          }
          values.push(value);
          updates.push(`${field} = $${values.length}`);
        }
        if (!updates.length) throw codedError('INVALID_INPUT', 'Нет изменений');
        values.push(req.params.id);
        const { rows } = await client.query(
          `UPDATE production_plan_entries
              SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *`,
          values
        );
        return rows[0] || null;
      });
      if (!entry) return error(res, 404, 'NOT_FOUND', 'Запись плана не найдена');
      res.json({ entry });
    })
  )
);

router.post(
  '/plan/reorder',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const entryId = integer(req.body?.entry_id);
      const newPosition = integer(req.body?.new_position);
      if (!entryId || !newPosition) return error(res, 400, 'INVALID_INPUT', 'entry_id и new_position обязательны');

      const entry = await withTransaction(async (client) => {
        const current = await client.query(`SELECT * FROM production_plan_entries WHERE id = $1 FOR UPDATE`, [entryId]);
        if (!current.rows[0]) return null;
        await client.query(`SELECT id FROM production_plan_entries WHERE date = $1 ORDER BY position, id FOR UPDATE`, [current.rows[0].date]);
        const { rows } = await client.query(
          `UPDATE production_plan_entries
              SET position = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *`,
          [newPosition, entryId]
        );
        return rows[0];
      });
      if (!entry) return error(res, 404, 'NOT_FOUND', 'Запись плана не найдена');
      res.json({ entry });
    })
  )
);

router.delete(
  '/plan/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM production_plan_entries WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Запись плана не найдена');
      res.json({ ok: true });
    })
  )
);

export default router;

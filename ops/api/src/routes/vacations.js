import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, boolValue, dateValue, error, integer, jsonObject, nextId, nullableText, text } from './work-utils.js';

const router = Router();
const TYPES = new Set(['vacation', 'sick', 'unpaid', 'holiday']);

async function employeeName(employeeId) {
  const { rows } = await getPool().query(`SELECT name FROM employees WHERE id = $1`, [employeeId]);
  return rows[0]?.name || '';
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.employee_id) {
      params.push(integer(req.query.employee_id));
      where.push(`employee_id = $${params.length}`);
    }
    if (req.query.date_from) {
      params.push(dateValue(req.query.date_from));
      where.push(`end_date >= $${params.length}`);
    }
    if (req.query.date_to) {
      params.push(dateValue(req.query.date_to));
      where.push(`start_date <= $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM app_vacations
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY start_date DESC, id DESC
        LIMIT 500`,
      params
    );
    res.json({ vacations: rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = integer(req.body?.id) || nextId();
      const employeeId = integer(req.body?.employee_id);
      const start = dateValue(req.body?.start_date);
      const end = dateValue(req.body?.end_date) || start;
      const type = TYPES.has(req.body?.type) ? req.body.type : 'vacation';
      const extras = jsonObject(req.body?.extras);
      if (!employeeId || !start || !end || end < start) return error(res, 400, 'INVALID_INPUT', 'employee_id и диапазон дат обязательны');
      if (extras === undefined) return error(res, 400, 'INVALID_INPUT', 'extras должен быть JSON-объектом');
      const employee_name = text(req.body?.employee_name) || (await employeeName(employeeId));
      const { rows } = await getPool().query(
        `INSERT INTO app_vacations (id, employee_id, employee_name, start_date, end_date, type, is_paid, note, extras)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [id, employeeId, employee_name, start, end, type, boolValue(req.body?.is_paid, true), nullableText(req.body?.note), extras]
      );
      res.status(201).json({ vacation: rows[0] });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['employee_id', 'employee_name', 'start_date', 'end_date', 'type', 'is_paid', 'note', 'extras'];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (field === 'employee_id') value = integer(value);
        else if (field === 'start_date' || field === 'end_date') value = dateValue(value);
        else if (field === 'type') value = TYPES.has(value) ? value : undefined;
        else if (field === 'is_paid') value = boolValue(value, true);
        else if (field === 'extras') value = jsonObject(value);
        else value = nullableText(value);
        if (value === undefined) return error(res, 400, 'INVALID_INPUT', `${field} некорректен`);
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(`UPDATE app_vacations SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Отпуск не найден');
      res.json({ vacation: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM app_vacations WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Отпуск не найден');
      res.json({ ok: true });
    })
  )
);

export default router;

import { Router } from 'express';
import { getPool } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, boolValue, dateValue, error, integer, jsonObject, nextId, nullableText, numeric, text } from './work-utils.js';

const router = Router();

function timePayload(row) {
  return {
    ...row,
    hours: Number(row.hours),
  };
}

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
      where.push(`date >= $${params.length}`);
    }
    if (req.query.date_to) {
      params.push(dateValue(req.query.date_to));
      where.push(`date <= $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM time_entries
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY date DESC, created_at DESC, id DESC
        LIMIT 500`,
      params
    );
    res.json({ entries: rows.map(timePayload) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = integer(req.body?.id) || nextId();
      const employeeId = integer(req.body?.employee_id);
      const date = dateValue(req.body?.date);
      const hours = numeric(req.body?.hours);
      const extras = jsonObject(req.body?.extras);
      if (!employeeId || !date || !hours || hours <= 0) return error(res, 400, 'INVALID_INPUT', 'employee_id, date и hours обязательны');
      if (extras === undefined) return error(res, 400, 'INVALID_INPUT', 'extras должен быть JSON-объектом');
      const employee_name = text(req.body?.employee_name) || (await employeeName(employeeId));
      const { rows } = await getPool().query(
        `INSERT INTO time_entries
           (id, employee_id, employee_name, date, hours, task_id, project_id, project_name, order_id, stage, note, is_overtime, source, extras)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          id,
          employeeId,
          employee_name,
          date,
          hours,
          integer(req.body?.task_id),
          integer(req.body?.project_id),
          nullableText(req.body?.project_name) || '',
          integer(req.body?.order_id),
          nullableText(req.body?.stage) || '',
          nullableText(req.body?.note),
          boolValue(req.body?.is_overtime, false),
          nullableText(req.body?.source) || 'manual',
          extras,
        ]
      );
      res.status(201).json({ entry: timePayload(rows[0]) });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['employee_id', 'employee_name', 'date', 'hours', 'task_id', 'project_id', 'project_name', 'order_id', 'stage', 'note', 'is_overtime', 'source', 'extras'];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (['employee_id', 'task_id', 'project_id', 'order_id'].includes(field)) value = integer(value);
        else if (field === 'hours') value = numeric(value);
        else if (field === 'date') value = dateValue(value);
        else if (field === 'is_overtime') value = boolValue(value, false);
        else if (field === 'extras') value = jsonObject(value);
        else value = nullableText(value);
        if (value === undefined) return error(res, 400, 'INVALID_INPUT', `${field} некорректен`);
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(`UPDATE time_entries SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Запись времени не найдена');
      res.json({ entry: timePayload(rows[0]) });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM time_entries WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Запись времени не найдена');
      res.json({ ok: true });
    })
  )
);

export default router;

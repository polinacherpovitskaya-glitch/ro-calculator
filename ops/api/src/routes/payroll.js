import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { calcPayroll } from '../payroll/calc.js';
import { asyncHandler, boolValue, dateValue, error, integer, jsonObject, numeric, nullableText } from './work-utils.js';

const router = Router();
const HALVES = new Set(['first', 'second', 'full']);

function ratePayload(row) {
  return {
    ...row,
    hourly_rate: Number(row.hourly_rate),
    overtime_rate: row.overtime_rate === null ? null : Number(row.overtime_rate),
    weekend_rate: row.weekend_rate === null ? null : Number(row.weekend_rate),
    holiday_rate: row.holiday_rate === null ? null : Number(row.holiday_rate),
    base_salary: row.base_salary === null ? null : Number(row.base_salary),
    base_hours_month: row.base_hours_month === null ? null : Number(row.base_hours_month),
    base_hours_semimonth: row.base_hours_semimonth === null ? null : Number(row.base_hours_semimonth),
  };
}

function periodPayload(row) {
  return {
    ...row,
    hours_regular: Number(row.hours_regular),
    hours_overtime: Number(row.hours_overtime),
    hours_weekend: Number(row.hours_weekend),
    hours_holiday: Number(row.hours_holiday),
    base_amount: Number(row.base_amount),
    overtime_amount: Number(row.overtime_amount),
    weekend_amount: Number(row.weekend_amount),
    holiday_amount: Number(row.holiday_amount),
    bonuses: Number(row.bonuses),
    deductions: Number(row.deductions),
    total: Number(row.total),
  };
}

function monthBounds(year, month, half) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const next = new Date(Date.UTC(year, month, 1));
  const end = next.toISOString().slice(0, 10);
  if (half === 'first') return { from: start, to: `${year}-${String(month).padStart(2, '0')}-16` };
  if (half === 'second') return { from: `${year}-${String(month).padStart(2, '0')}-16`, to: end };
  return { from: start, to: end };
}

function halfForDate(value) {
  const day = Number(String(value || '').slice(8, 10));
  return day >= 16 ? 'second' : 'first';
}

async function activeRate(client, employeeId, untilDate) {
  const { rows } = await client.query(
    `SELECT *
       FROM payroll_rates
      WHERE employee_id = $1
        AND valid_from <= $2
        AND (valid_to IS NULL OR valid_to >= $2)
      ORDER BY valid_from DESC, id DESC
      LIMIT 1`,
    [employeeId, untilDate]
  );
  if (rows[0]) return ratePayload(rows[0]);
  const employee = await client.query(`SELECT hourly_rate, extras FROM employees WHERE id = $1`, [employeeId]);
  const extras = employee.rows[0]?.extras || {};
  return {
    employee_id: employeeId,
    valid_from: untilDate,
    hourly_rate: Number(employee.rows[0]?.hourly_rate || extras.pay_hour_rate || extras.hourly_rate || 0),
    overtime_rate: Number(extras.pay_overtime_hour_rate || 0) || null,
    weekend_rate: Number(extras.pay_weekend_hour_rate || 0) || null,
    holiday_rate: Number(extras.pay_holiday_hour_rate || 0) || null,
    base_salary: Number(extras.pay_base_salary_month || 0) || null,
    base_hours_month: Number(extras.pay_base_hours_month || 0) || null,
    base_hours_semimonth: Number(extras.pay_base_hours_semimonth || 0) || null,
    tier: extras.payroll_profile === 'tiered' ? 'tiered' : null,
    currency: 'RUB',
    extras,
  };
}

router.get('/rates', requireAuth, asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.employee_id) {
    params.push(integer(req.query.employee_id));
    where.push(`employee_id = $${params.length}`);
  }
  const { rows } = await getPool().query(
    `SELECT * FROM payroll_rates ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY employee_id, valid_from DESC, id DESC`,
    params
  );
  res.json({ rates: rows.map(ratePayload) });
}));

router.post('/rates', requireAuth, asyncHandler((req, res) =>
  withIdempotency(req, res, async () => {
    const employeeId = integer(req.body?.employee_id);
    const validFrom = dateValue(req.body?.valid_from);
    const extras = jsonObject(req.body?.extras);
    if (!employeeId || !validFrom) return error(res, 400, 'INVALID_INPUT', 'employee_id и valid_from обязательны');
    if (extras === undefined) return error(res, 400, 'INVALID_INPUT', 'extras должен быть JSON-объектом');
    const { rows } = await getPool().query(
      `INSERT INTO payroll_rates
         (employee_id, valid_from, valid_to, hourly_rate, overtime_rate, weekend_rate, holiday_rate, currency, base_salary, base_hours_month, base_hours_semimonth, tier, extras)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        employeeId,
        validFrom,
        dateValue(req.body?.valid_to),
        numeric(req.body?.hourly_rate, 0),
        numeric(req.body?.overtime_rate),
        numeric(req.body?.weekend_rate),
        numeric(req.body?.holiday_rate),
        nullableText(req.body?.currency) || 'RUB',
        numeric(req.body?.base_salary),
        numeric(req.body?.base_hours_month),
        numeric(req.body?.base_hours_semimonth),
        nullableText(req.body?.tier),
        extras,
      ]
    );
    res.status(201).json({ rate: ratePayload(rows[0]) });
  })
));

router.patch('/rates/:id', requireAuth, asyncHandler((req, res) =>
  withIdempotency(req, res, async () => {
    const fields = ['valid_from', 'valid_to', 'hourly_rate', 'overtime_rate', 'weekend_rate', 'holiday_rate', 'currency', 'base_salary', 'base_hours_month', 'base_hours_semimonth', 'tier', 'extras'];
    const updates = [];
    const values = [];
    for (const field of fields) {
      if (req.body?.[field] === undefined) continue;
      let value = req.body[field];
      if (field === 'valid_from' || field === 'valid_to') value = dateValue(value);
      else if (['hourly_rate', 'overtime_rate', 'weekend_rate', 'holiday_rate', 'base_salary', 'base_hours_month', 'base_hours_semimonth'].includes(field)) value = numeric(value);
      else if (field === 'extras') value = jsonObject(value);
      else value = nullableText(value);
      if (value === undefined) return error(res, 400, 'INVALID_INPUT', `${field} некорректен`);
      values.push(value);
      updates.push(`${field} = $${values.length}`);
    }
    if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
    values.push(req.params.id);
    const { rows } = await getPool().query(`UPDATE payroll_rates SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`, values);
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Ставка не найдена');
    res.json({ rate: ratePayload(rows[0]) });
  })
));

router.get('/periods', requireAuth, asyncHandler(async (req, res) => {
  const params = [];
  const where = [];
  for (const [field, query] of [['period_year', 'year'], ['period_month', 'month'], ['period_half', 'half'], ['employee_id', 'employee_id']]) {
    if (req.query[query] === undefined || req.query[query] === '') continue;
    params.push(field === 'period_half' ? String(req.query[query]) : integer(req.query[query]));
    where.push(`${field} = $${params.length}`);
  }
  const { rows } = await getPool().query(
    `SELECT * FROM payroll_periods ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY employee_name, employee_id, period_half`,
    params
  );
  res.json({ periods: rows.map(periodPayload) });
}));

router.post('/calculate', requireAuth, asyncHandler((req, res) =>
  withIdempotency(req, res, async () => {
    const year = integer(req.body?.year);
    const month = integer(req.body?.month);
    const half = HALVES.has(req.body?.half) ? req.body.half : 'full';
    const employeeFilter = integer(req.body?.employee_id);
    if (!year || !month || month < 1 || month > 12) return error(res, 400, 'INVALID_INPUT', 'year и month обязательны');
    const bounds = monthBounds(year, month, half);
    const rows = await withTransaction(async (client) => {
      const employeeRes = await client.query(
        `SELECT id, name FROM employees WHERE is_active = TRUE ${employeeFilter ? 'AND id = $1' : ''} ORDER BY name`,
        employeeFilter ? [employeeFilter] : []
      );
      const output = [];
      for (const employee of employeeRes.rows) {
        const entries = await client.query(`SELECT date, hours, is_overtime FROM time_entries WHERE employee_id = $1 AND date >= $2 AND date < $3`, [
          employee.id,
          bounds.from,
          bounds.to,
        ]);
        let regular = 0;
        let explicitOvertime = 0;
        for (const entry of entries.rows) {
          const hours = Number(entry.hours || 0);
          if (entry.is_overtime) explicitOvertime += hours;
          else regular += hours;
        }
        const rate = await activeRate(client, employee.id, bounds.to);
        const calculated = calcPayroll({
          employeeId: Number(employee.id),
          year,
          month,
          half,
          hoursRegular: regular,
          hoursOvertime: explicitOvertime,
          rate,
          bonuses: numeric(req.body?.bonuses, 0),
          deductions: numeric(req.body?.deductions, 0),
        });
        const saved = await client.query(
          `INSERT INTO payroll_periods
             (period_year, period_month, period_half, employee_id, employee_name, hours_regular, hours_overtime,
              base_amount, overtime_amount, weekend_amount, holiday_amount, bonuses, deductions, total, currency, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (period_year, period_month, period_half, employee_id) DO UPDATE SET
             employee_name = EXCLUDED.employee_name,
             hours_regular = EXCLUDED.hours_regular,
             hours_overtime = EXCLUDED.hours_overtime,
             base_amount = EXCLUDED.base_amount,
             overtime_amount = EXCLUDED.overtime_amount,
             weekend_amount = EXCLUDED.weekend_amount,
             holiday_amount = EXCLUDED.holiday_amount,
             bonuses = EXCLUDED.bonuses,
             deductions = EXCLUDED.deductions,
             total = EXCLUDED.total,
             currency = EXCLUDED.currency,
             extras = EXCLUDED.extras,
             updated_at = NOW()
           RETURNING *`,
          [
            year, month, half, employee.id, employee.name, regular, calculated.overtimeHours,
            calculated.baseAmount, calculated.overtimeAmount, calculated.weekendAmount, calculated.holidayAmount,
            numeric(req.body?.bonuses, 0), numeric(req.body?.deductions, 0), calculated.total, rate.currency || 'RUB',
            { in_base_hours: calculated.inBaseHours, rate },
          ]
        );
        output.push(periodPayload(saved.rows[0]));
      }
      return output;
    });
    res.json({ periods: rows });
  })
));

router.post('/periods/:id/mark-paid', requireAuth, asyncHandler((req, res) =>
  withIdempotency(req, res, async () => {
    const paid = boolValue(req.body?.paid, true);
    const { rows } = await getPool().query(
      `UPDATE payroll_periods SET paid_at = $1, note = COALESCE($2, note), updated_at = NOW() WHERE id = $3 RETURNING *`,
      [paid ? new Date().toISOString() : null, nullableText(req.body?.note), req.params.id]
    );
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Расчёт не найден');
    res.json({ period: periodPayload(rows[0]) });
  })
));

export default router;

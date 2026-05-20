import { getPool } from '../db.js';

const ORDER_EXCLUDE_STATUSES = ['draft', 'cancelled'];
const PRODUCTION_STAGES = ['casting', 'trim', 'assembly', 'packaging', 'production', 'hardware'];

function periodWhere(params, column = 'created_at') {
  const where = [];
  if (params.from) {
    where.push(`${column} >= $${params.values.length + 1}`);
    params.values.push(params.from);
  }
  if (params.to) {
    where.push(`${column} < ($${params.values.length + 1}::date + INTERVAL '1 day')`);
    params.values.push(params.to);
  }
  return where;
}

export function normalizePeriod({ from, to } = {}) {
  return {
    from: from || null,
    to: to || null,
  };
}

export async function summary(period = {}) {
  const normalized = normalizePeriod(period);
  const orderParams = { values: [], ...normalized };
  const orderWhere = periodWhere(orderParams, 'created_at');
  orderWhere.push(`status <> ALL($${orderParams.values.length + 1})`);
  orderParams.values.push(ORDER_EXCLUDE_STATUSES);

  const timeParams = { values: [], ...normalized };
  const timeWhere = periodWhere(timeParams, 'date');

  const [orders, factuals, time] = await Promise.all([
    getPool().query(
      `SELECT
         COUNT(*)::int AS orders_count,
         COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
         COALESCE(SUM(total_revenue), 0)::float AS plan_revenue,
         COALESCE(SUM(total_cost), 0)::float AS plan_cost,
         COALESCE(SUM(total_margin), 0)::float AS plan_margin,
         COALESCE(SUM(total_hours_plan), 0)::float AS plan_hours
       FROM orders
       WHERE ${orderWhere.join(' AND ')}`,
      orderParams.values
    ),
    getPool().query(
      `SELECT
         COUNT(*)::int AS factual_count,
         COALESCE(SUM(f.actual_revenue), 0)::float AS fact_revenue,
         COALESCE(SUM(f.actual_cost), 0)::float AS fact_cost,
         COALESCE(SUM(f.actual_margin), 0)::float AS fact_margin
       FROM order_factuals f
       JOIN orders o ON o.id = f.order_id
       WHERE o.status <> ALL($1)
         AND ($2::date IS NULL OR COALESCE(f.closed_at, o.updated_at) >= $2::date)
         AND ($3::date IS NULL OR COALESCE(f.closed_at, o.updated_at) < ($3::date + INTERVAL '1 day'))`,
      [ORDER_EXCLUDE_STATUSES, normalized.from, normalized.to]
    ),
    getPool().query(
      `SELECT COALESCE(SUM(hours), 0)::float AS fact_hours
       FROM time_entries
       ${timeWhere.length ? `WHERE ${timeWhere.join(' AND ')}` : ''}`,
      timeParams.values
    ),
  ]);

  const row = { ...orders.rows[0], ...factuals.rows[0], ...time.rows[0] };
  row.plan_margin_percent = row.plan_revenue > 0 ? Number(((row.plan_margin * 100) / row.plan_revenue).toFixed(2)) : null;
  row.fact_margin_percent = row.fact_revenue > 0 ? Number(((row.fact_margin * 100) / row.fact_revenue).toFixed(2)) : null;
  return row;
}

export async function revenueByMonth(yearFrom, yearTo) {
  const { rows } = await getPool().query(
    `SELECT
       DATE_TRUNC('month', created_at)::date AS month,
       COALESCE(SUM(total_revenue), 0)::float AS revenue,
       COALESCE(SUM(total_cost), 0)::float AS cost,
       COALESCE(SUM(total_margin), 0)::float AS margin,
       COUNT(*)::int AS orders_count
     FROM orders
     WHERE created_at >= make_date($1, 1, 1)
       AND created_at < make_date($2 + 1, 1, 1)
       AND status <> ALL($3)
     GROUP BY 1
     ORDER BY 1`,
    [yearFrom, yearTo, ORDER_EXCLUDE_STATUSES]
  );
  return rows;
}

export async function topClients(period = {}, limit = 20) {
  const params = { values: [], ...normalizePeriod(period) };
  const where = periodWhere(params, 'created_at');
  where.push(`status <> ALL($${params.values.length + 1})`);
  params.values.push(ORDER_EXCLUDE_STATUSES);
  params.values.push(limit);
  const { rows } = await getPool().query(
    `SELECT
       COALESCE(NULLIF(TRIM(client_name), ''), 'Без клиента') AS client_name,
       COALESCE(SUM(total_revenue), 0)::float AS revenue,
       COALESCE(SUM(total_margin), 0)::float AS margin,
       COUNT(*)::int AS orders_count
     FROM orders
     WHERE ${where.join(' AND ')}
     GROUP BY 1
     ORDER BY revenue DESC, orders_count DESC, client_name
     LIMIT $${params.values.length}`,
    params.values
  );
  return rows;
}

export async function statusDynamics(period = {}) {
  const params = { values: [], ...normalizePeriod(period) };
  const where = periodWhere(params, 'created_at');
  where.push(`status <> ALL($${params.values.length + 1})`);
  params.values.push(ORDER_EXCLUDE_STATUSES);
  const { rows } = await getPool().query(
    `SELECT
       DATE_TRUNC('month', created_at)::date AS month,
       status,
       COUNT(*)::int AS orders_count,
       COALESCE(SUM(total_revenue), 0)::float AS revenue
     FROM orders
     WHERE ${where.join(' AND ')}
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    params.values
  );
  return rows;
}

export async function productionLoad(period = {}) {
  const params = { values: [], ...normalizePeriod(period) };
  const where = periodWhere(params, 't.date');
  const { rows } = await getPool().query(
    `SELECT
       t.employee_id,
       COALESCE(NULLIF(t.employee_name, ''), e.name, 'Без сотрудника') AS employee_name,
       COALESCE(NULLIF(t.stage, ''), 'production') AS stage,
       COALESCE(SUM(t.hours), 0)::float AS hours,
       COUNT(*)::int AS entries_count
     FROM time_entries t
     LEFT JOIN employees e ON e.id = t.employee_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY 1, 2, 3
     ORDER BY employee_name, stage`,
    params.values
  );
  return rows.map((row) => ({
    ...row,
    is_production_stage: PRODUCTION_STAGES.includes(String(row.stage || '').toLowerCase()),
  }));
}

export async function productTypes(period = {}) {
  const params = { values: [], ...normalizePeriod(period) };
  const where = periodWhere(params, 'o.created_at');
  where.push(`o.status <> ALL($${params.values.length + 1})`);
  params.values.push(ORDER_EXCLUDE_STATUSES);
  const { rows } = await getPool().query(
    `SELECT
       COALESCE(NULLIF(i.type, ''), i.item_data->>'item_type', 'other') AS type,
       COUNT(*)::int AS lines_count,
       COALESCE(SUM(i.qty), 0)::float AS qty,
       COALESCE(SUM(i.line_total), 0)::float AS revenue,
       COALESCE(SUM(CASE
         WHEN (i.item_data->>'hours_total') ~ '^-?[0-9]+(\\.[0-9]+)?$' THEN (i.item_data->>'hours_total')::numeric
         ELSE 0
       END), 0)::float AS hours
     FROM order_items i
     JOIN orders o ON o.id = i.order_id
     WHERE ${where.join(' AND ')}
     GROUP BY 1
     ORDER BY revenue DESC, lines_count DESC, type`,
    params.values
  );
  return rows;
}

export async function factualMargin(period = {}) {
  const normalized = normalizePeriod(period);
  const { rows } = await getPool().query(
    `SELECT
       o.id AS order_id,
       o.order_name,
       o.client_name,
       o.status,
       COALESCE(f.closed_at, o.updated_at) AS report_date,
       COALESCE(f.actual_revenue, 0)::float AS actual_revenue,
       COALESCE(f.actual_cost, 0)::float AS actual_cost,
       COALESCE(f.actual_margin, 0)::float AS actual_margin,
       f.actual_margin_percent::float AS actual_margin_percent
     FROM order_factuals f
     JOIN orders o ON o.id = f.order_id
     WHERE o.status <> ALL($1)
       AND ($2::date IS NULL OR COALESCE(f.closed_at, o.updated_at) >= $2::date)
       AND ($3::date IS NULL OR COALESCE(f.closed_at, o.updated_at) < ($3::date + INTERVAL '1 day'))
     ORDER BY report_date DESC, o.id DESC
     LIMIT 500`,
    [ORDER_EXCLUDE_STATUSES, normalized.from, normalized.to]
  );
  return rows;
}

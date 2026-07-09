import { getPool } from '../db.js';

export interface AnalyticsPeriod {
  from?: string | null;
  to?: string | null;
}

export const ORDER_EXCLUDE_STATUSES = ['draft', 'cancelled'];

interface PeriodParams {
  values: unknown[];
  from?: string | null;
  to?: string | null;
}

function periodWhere(params: PeriodParams, column = 'created_at') {
  const where: string[] = [];
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

export function normalizePeriod(period: AnalyticsPeriod = {}) {
  return {
    from: period.from || null,
    to: period.to || null,
  };
}

export async function revenueByMonth(yearFrom: number, yearTo: number) {
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

export async function topClients(period: AnalyticsPeriod = {}, limit = 20) {
  const params: PeriodParams = { values: [], ...normalizePeriod(period) };
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

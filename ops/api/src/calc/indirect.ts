import { round2 } from './pricing.js';

export interface QueryClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface IndirectAllocation {
  total: number;
  hours: number;
  perHour: number;
}

function numberValue(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function getIndirectAllocation(
  client: QueryClient,
  year: number,
  month: number,
  hoursTotal?: number
): Promise<IndirectAllocation> {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('year must be an integer between 2000 and 2100');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('month must be an integer between 1 and 12');
  }

  const costs = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
       FROM indirect_costs
      WHERE period_year = $1 AND period_month = $2`,
    [year, month]
  );
  const total = numberValue(costs.rows[0]?.total);

  let hours = numberValue(hoursTotal);
  if (!(hours > 0)) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const calendar = await client.query(
      `SELECT COALESCE(SUM(hours), 0) AS hours
         FROM production_calendar_days
        WHERE date >= $1::date
          AND date < ($1::date + INTERVAL '1 month')
          AND is_working = TRUE`,
      [start]
    );
    hours = numberValue(calendar.rows[0]?.hours);
  }

  return {
    total: round2(total),
    hours: round2(hours),
    perHour: hours > 0 ? round2(total / hours) : 0,
  };
}

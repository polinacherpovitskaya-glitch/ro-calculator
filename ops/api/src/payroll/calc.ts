export type PayrollHalf = 'first' | 'second' | 'full';

export interface PayrollRate {
  hourly_rate?: number | string | null;
  overtime_rate?: number | string | null;
  weekend_rate?: number | string | null;
  holiday_rate?: number | string | null;
  base_salary?: number | string | null;
  base_hours_month?: number | string | null;
  base_hours_semimonth?: number | string | null;
  tier?: string | null;
  currency?: string | null;
  extras?: Record<string, unknown> | null;
}

export interface PayrollInput {
  employeeId: number;
  year: number;
  month: number;
  half: PayrollHalf;
  hoursRegular: number;
  hoursOvertime: number;
  hoursWeekend?: number;
  hoursHoliday?: number;
  rate: PayrollRate;
  bonuses?: number;
  deductions?: number;
}

export interface PayrollOutput {
  baseAmount: number;
  overtimeAmount: number;
  weekendAmount: number;
  holidayAmount: number;
  total: number;
  inBaseHours: number;
  overtimeHours: number;
}

function n(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function tierRate(rate: PayrollRate, hours: number): number {
  if (rate.tier !== 'tiered') return n(rate.hourly_rate);
  const tiers = Array.isArray(rate.extras?.tiers) ? rate.extras.tiers : [];
  const matched = tiers
    .map((tier) => (tier && typeof tier === 'object' ? tier as Record<string, unknown> : null))
    .filter(Boolean)
    .sort((a, b) => n(a?.from_hours) - n(b?.from_hours))
    .filter((tier) => hours >= n(tier?.from_hours) && (tier?.to_hours === undefined || tier?.to_hours === null || hours <= n(tier.to_hours, Infinity)))
    .at(-1);
  return n(matched?.rate, n(rate.hourly_rate));
}

export function calcPayroll(input: PayrollInput): PayrollOutput {
  const regularHours = Math.max(0, n(input.hoursRegular));
  const explicitOvertime = Math.max(0, n(input.hoursOvertime));
  const weekendHours = Math.max(0, n(input.hoursWeekend));
  const holidayHours = Math.max(0, n(input.hoursHoliday));
  const baseSalary = Math.max(0, n(input.rate.base_salary));
  const baseHoursMonth = Math.max(0, n(input.rate.base_hours_month, 176));
  const baseHoursHalf = Math.max(1, n(input.rate.base_hours_semimonth, Math.round(baseHoursMonth / 2)));
  const threshold = input.half === 'full' ? baseHoursMonth : baseHoursHalf;
  const hasSalary = baseSalary > 0;
  const effectiveHourly = tierRate(input.rate, regularHours + explicitOvertime + weekendHours + holidayHours);
  const salaryHourly = hasSalary && baseHoursMonth > 0 ? baseSalary / baseHoursMonth : 0;
  const overtimeRate = n(input.rate.overtime_rate, salaryHourly || effectiveHourly);
  const weekendRate = n(input.rate.weekend_rate, overtimeRate);
  const holidayRate = n(input.rate.holiday_rate, weekendRate);
  const inBaseHours = hasSalary ? Math.min(regularHours, threshold) : 0;
  const thresholdOvertime = hasSalary ? Math.max(0, regularHours - threshold) : 0;
  const overtimeHours = explicitOvertime + thresholdOvertime;
  const baseAmount = hasSalary
    ? (input.half === 'full' ? baseSalary : baseSalary / 2)
    : regularHours * effectiveHourly;
  const overtimeAmount = overtimeHours * (overtimeRate || effectiveHourly);
  const weekendAmount = weekendHours * (weekendRate || effectiveHourly);
  const holidayAmount = holidayHours * (holidayRate || weekendRate || effectiveHourly);
  const total = baseAmount + overtimeAmount + weekendAmount + holidayAmount + n(input.bonuses) - n(input.deductions);

  return {
    baseAmount: round2(baseAmount),
    overtimeAmount: round2(overtimeAmount),
    weekendAmount: round2(weekendAmount),
    holidayAmount: round2(holidayAmount),
    total: round2(total),
    inBaseHours: round2(inBaseHours),
    overtimeHours: round2(overtimeHours),
  };
}

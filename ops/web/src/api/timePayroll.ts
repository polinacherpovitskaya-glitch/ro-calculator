import { apiFetch } from './index';

export interface TimeEntry {
  id: number;
  employee_id: number;
  employee_name: string;
  date: string;
  hours: number;
  project_name: string;
  order_id: number | null;
  stage: string;
  note: string | null;
  is_overtime: boolean;
}

export interface Vacation {
  id: number;
  employee_id: number;
  employee_name: string;
  start_date: string;
  end_date: string;
  type: string;
  is_paid: boolean;
  note: string | null;
}

export interface PayrollPeriod {
  id: number;
  period_year: number;
  period_month: number;
  period_half: 'first' | 'second' | 'full';
  employee_id: number;
  employee_name: string;
  hours_regular: number;
  hours_overtime: number;
  base_amount: number;
  overtime_amount: number;
  total: number;
  currency: string;
  paid_at: string | null;
}

export async function listTimeEntries(params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  const { entries } = await apiFetch<{ entries: TimeEntry[] }>(`/api/time-entries${qs.toString() ? `?${qs}` : ''}`);
  return entries;
}

export async function createTimeEntry(input: Partial<TimeEntry>) {
  const { entry } = await apiFetch<{ entry: TimeEntry }>('/api/time-entries', { method: 'POST', body: JSON.stringify(input) });
  return entry;
}

export async function deleteTimeEntry(id: number) {
  await apiFetch(`/api/time-entries/${id}`, { method: 'DELETE' });
}

export async function listVacations(params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  const { vacations } = await apiFetch<{ vacations: Vacation[] }>(`/api/vacations${qs.toString() ? `?${qs}` : ''}`);
  return vacations;
}

export async function createVacation(input: Partial<Vacation>) {
  const { vacation } = await apiFetch<{ vacation: Vacation }>('/api/vacations', { method: 'POST', body: JSON.stringify(input) });
  return vacation;
}

export async function listPayrollPeriods(params: { year: number; month: number; half: string }) {
  const qs = new URLSearchParams({ year: String(params.year), month: String(params.month), half: params.half });
  const { periods } = await apiFetch<{ periods: PayrollPeriod[] }>(`/api/payroll/periods?${qs}`);
  return periods;
}

export async function calculatePayroll(input: { year: number; month: number; half: string }) {
  const { periods } = await apiFetch<{ periods: PayrollPeriod[] }>('/api/payroll/calculate', { method: 'POST', body: JSON.stringify(input) });
  return periods;
}

export async function markPayrollPaid(id: number, paid = true) {
  const { period } = await apiFetch<{ period: PayrollPeriod }>(`/api/payroll/periods/${id}/mark-paid`, { method: 'POST', body: JSON.stringify({ paid }) });
  return period;
}

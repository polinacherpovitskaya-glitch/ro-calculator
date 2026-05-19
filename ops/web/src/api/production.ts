import { apiFetch } from './index';

export interface ProductionCalendarDay {
  date: string;
  is_working: boolean;
  hours: number;
  note: string | null;
  extras?: Record<string, unknown>;
}

export interface ProductionPlanEntry {
  id: number;
  date: string;
  order_id: number | null;
  item_name: string | null;
  qty: number | null;
  hours_planned: number | null;
  operator_id: number | null;
  operator_name?: string | null;
  status: 'planned' | 'in_progress' | 'done' | 'cancelled';
  position: number;
  note: string | null;
  extras?: Record<string, unknown>;
}

export type ProductionPlanInput = Partial<Omit<ProductionPlanEntry, 'id' | 'operator_name'>> & { date: string };

export async function listCalendarDays(year: number): Promise<ProductionCalendarDay[]> {
  const { days } = await apiFetch<{ days: ProductionCalendarDay[] }>(`/api/production/calendar?year=${year}`);
  return days;
}

export async function saveCalendarDays(days: ProductionCalendarDay[]): Promise<ProductionCalendarDay[]> {
  const response = await apiFetch<{ days: ProductionCalendarDay[] }>('/api/production/calendar', {
    method: 'PUT',
    body: JSON.stringify({ days }),
  });
  return response.days;
}

export async function listPlanEntries(params: { date?: string; order_id?: number } = {}): Promise<ProductionPlanEntry[]> {
  const searchParams = new URLSearchParams();
  if (params.date) searchParams.set('date', params.date);
  if (params.order_id) searchParams.set('order_id', String(params.order_id));
  const query = searchParams.toString();
  const { entries } = await apiFetch<{ entries: ProductionPlanEntry[] }>(`/api/production/plan${query ? `?${query}` : ''}`);
  return entries;
}

export async function createPlanEntry(input: ProductionPlanInput): Promise<ProductionPlanEntry> {
  const { entry } = await apiFetch<{ entry: ProductionPlanEntry }>('/api/production/plan', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return entry;
}

export async function updatePlanEntry(id: number, patch: Partial<ProductionPlanInput>): Promise<ProductionPlanEntry> {
  const { entry } = await apiFetch<{ entry: ProductionPlanEntry }>(`/api/production/plan/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return entry;
}

export async function reorderPlanEntry(entry_id: number, new_position: number): Promise<ProductionPlanEntry> {
  const { entry } = await apiFetch<{ entry: ProductionPlanEntry }>('/api/production/plan/reorder', {
    method: 'POST',
    body: JSON.stringify({ entry_id, new_position }),
  });
  return entry;
}

export async function deletePlanEntry(id: number): Promise<void> {
  await apiFetch<void>(`/api/production/plan/${id}`, { method: 'DELETE' });
}

import { apiFetch } from './index';

export interface IndirectCost {
  id: number;
  period_year: number;
  period_month: number;
  category: string;
  amount: number;
  currency: string;
  note: string | null;
  extras?: Record<string, unknown>;
}

export interface IndirectCostInput {
  period_year: number;
  period_month: number;
  category: string;
  amount: number;
  currency?: string;
  note?: string | null;
}

export async function listIndirectCosts(params: { year?: number; month?: number } = {}): Promise<IndirectCost[]> {
  const searchParams = new URLSearchParams();
  if (params.year) searchParams.set('year', String(params.year));
  if (params.month) searchParams.set('month', String(params.month));
  const query = searchParams.toString();
  const { indirect_costs } = await apiFetch<{ indirect_costs: IndirectCost[] }>(`/api/indirect-costs${query ? `?${query}` : ''}`);
  return indirect_costs;
}

export async function createIndirectCost(input: IndirectCostInput): Promise<IndirectCost> {
  const { indirect_cost } = await apiFetch<{ indirect_cost: IndirectCost }>('/api/indirect-costs', {
    method: 'POST',
    body: JSON.stringify({ ...input, currency: input.currency || 'RUB' }),
  });
  return indirect_cost;
}

export async function updateIndirectCost(id: number, patch: Partial<IndirectCostInput>): Promise<IndirectCost> {
  const { indirect_cost } = await apiFetch<{ indirect_cost: IndirectCost }>(`/api/indirect-costs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return indirect_cost;
}

export async function deleteIndirectCost(id: number): Promise<void> {
  await apiFetch<void>(`/api/indirect-costs/${id}`, { method: 'DELETE' });
}

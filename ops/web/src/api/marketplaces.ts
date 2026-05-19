import { apiFetch } from './index';

export interface MarketplaceCompositionItem {
  warehouse_item_id: number;
  qty: number;
}

export interface MarketplaceSet {
  id: number;
  name: string;
  marketplace: string | null;
  sku: string | null;
  price: number | null;
  currency: string | null;
  composition: MarketplaceCompositionItem[];
  is_active: boolean;
}

export interface MarketplaceInput {
  id?: number;
  name: string;
  marketplace?: string | null;
  sku?: string | null;
  price?: number | null;
  currency?: string | null;
  composition?: MarketplaceCompositionItem[];
  is_active?: boolean;
}

export type MarketplacePatch = Partial<MarketplaceInput>;

export async function listMarketplaceSets(params: { search?: string; marketplace?: string; active?: boolean } = {}): Promise<MarketplaceSet[]> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.marketplace) searchParams.set('marketplace', params.marketplace);
  if (params.active !== undefined) searchParams.set('active', String(params.active));
  const query = searchParams.toString();
  const { marketplace_sets } = await apiFetch<{ marketplace_sets: MarketplaceSet[] }>(`/api/marketplaces${query ? `?${query}` : ''}`);
  return marketplace_sets;
}

export async function getMarketplaceSet(id: number): Promise<MarketplaceSet> {
  const { marketplace_set } = await apiFetch<{ marketplace_set: MarketplaceSet }>(`/api/marketplaces/${id}`);
  return marketplace_set;
}

export async function createMarketplaceSet(input: MarketplaceInput): Promise<MarketplaceSet> {
  const { marketplace_set } = await apiFetch<{ marketplace_set: MarketplaceSet }>('/api/marketplaces', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return marketplace_set;
}

export async function updateMarketplaceSet(id: number, patch: MarketplacePatch): Promise<MarketplaceSet> {
  const { marketplace_set } = await apiFetch<{ marketplace_set: MarketplaceSet }>(`/api/marketplaces/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return marketplace_set;
}

export async function deleteMarketplaceSet(id: number): Promise<void> {
  await apiFetch<void>(`/api/marketplaces/${id}`, { method: 'DELETE' });
}

export async function sellMarketplaceSet(id: number, input: { qty: number; operator_name?: string | null; note?: string | null }): Promise<MarketplaceSet> {
  const { marketplace_set } = await apiFetch<{ marketplace_set: MarketplaceSet }>(`/api/marketplaces/${id}/sell`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return marketplace_set;
}

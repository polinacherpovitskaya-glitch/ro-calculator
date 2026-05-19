import { apiFetch } from './index';

export interface ChinaPurchaseItem {
  id?: number;
  purchase_id?: number;
  warehouse_item_id: number | null;
  name: string;
  qty: number;
  unit_price?: number | null;
  currency?: string | null;
  extras?: Record<string, unknown>;
}

export interface ChinaPurchase {
  id: number;
  title: string | null;
  supplier: string | null;
  order_url: string | null;
  status: 'draft' | 'paid' | 'in_transit' | 'arrived' | 'received' | 'cancelled';
  paid_amount: number | null;
  paid_currency: string | null;
  paid_at: string | null;
  arrived_at: string | null;
  shipment_id: number | null;
  note: string | null;
  items?: ChinaPurchaseItem[];
  created_at: string;
  updated_at: string;
}

export interface ChinaPurchaseInput {
  id?: number;
  title?: string | null;
  supplier?: string | null;
  order_url?: string | null;
  status?: string | null;
  paid_amount?: number | null;
  paid_currency?: string | null;
  note?: string | null;
  items?: ChinaPurchaseItem[];
}

export interface ChinaCatalogItem {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  photo_url: string | null;
  last_price: number | null;
  last_currency: string | null;
  supplier: string | null;
}

export async function listPurchases(params: { status?: string } = {}): Promise<ChinaPurchase[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  const query = search.toString();
  const { purchases } = await apiFetch<{ purchases: ChinaPurchase[] }>(`/api/china/purchases${query ? `?${query}` : ''}`);
  return purchases;
}

export async function getPurchase(id: number): Promise<ChinaPurchase> {
  const { purchase } = await apiFetch<{ purchase: ChinaPurchase }>(`/api/china/purchases/${id}`);
  return purchase;
}

export async function createPurchase(input: ChinaPurchaseInput): Promise<ChinaPurchase> {
  const { purchase } = await apiFetch<{ purchase: ChinaPurchase }>('/api/china/purchases', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return purchase;
}

export async function updatePurchase(id: number, patch: Partial<ChinaPurchaseInput>): Promise<ChinaPurchase> {
  const { purchase } = await apiFetch<{ purchase: ChinaPurchase }>(`/api/china/purchases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return purchase;
}

export async function deletePurchase(id: number): Promise<void> {
  await apiFetch<void>(`/api/china/purchases/${id}`, { method: 'DELETE' });
}

export async function receivePurchase(id: number): Promise<{ purchase: ChinaPurchase; shipment: unknown }> {
  return apiFetch<{ purchase: ChinaPurchase; shipment: unknown }>(`/api/china/purchases/${id}/receive`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function listCatalog(params: { search?: string } = {}): Promise<ChinaCatalogItem[]> {
  const search = new URLSearchParams();
  if (params.search) search.set('search', params.search);
  const query = search.toString();
  const { items } = await apiFetch<{ items: ChinaCatalogItem[] }>(`/api/china/catalog${query ? `?${query}` : ''}`);
  return items;
}

export async function createCatalogItem(input: Partial<ChinaCatalogItem> & { name: string }): Promise<ChinaCatalogItem> {
  const { item } = await apiFetch<{ item: ChinaCatalogItem }>('/api/china/catalog', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return item;
}

export async function updateCatalogItem(id: number, patch: Partial<ChinaCatalogItem>): Promise<ChinaCatalogItem> {
  const { item } = await apiFetch<{ item: ChinaCatalogItem }>(`/api/china/catalog/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return item;
}

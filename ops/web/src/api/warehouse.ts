import { apiFetch } from './index';

export interface WarehouseItem {
  id: number;
  sku: string | null;
  name: string;
  category: string | null;
  qty: number;
  unit: string | null;
  min_qty: number | null;
  last_price: number | null;
  last_currency: string | null;
  notes: string | null;
  linked_order_id: number | null;
  photo_url: string | null;
  reserved_qty: number;
  available_qty: number;
}

export interface WarehouseItemInput {
  id?: number;
  sku?: string | null;
  name: string;
  category?: string | null;
  qty: number;
  unit?: string | null;
  min_qty?: number | null;
  last_price?: number | null;
  last_currency?: string | null;
  notes?: string | null;
}

export interface WarehouseItemPatch {
  sku?: string | null;
  name?: string;
  category?: string | null;
  qty?: number;
  unit?: string | null;
  min_qty?: number | null;
  last_price?: number | null;
  last_currency?: string | null;
  notes?: string | null;
}

export async function listItems(params: { search?: string; category?: string } = {}): Promise<WarehouseItem[]> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.category) searchParams.set('category', params.category);
  const query = searchParams.toString();
  const { items } = await apiFetch<{ items: WarehouseItem[] }>(`/api/warehouse/items${query ? `?${query}` : ''}`);
  return items;
}

export async function createItem(input: WarehouseItemInput): Promise<WarehouseItem> {
  const { item } = await apiFetch<{ item: WarehouseItem }>('/api/warehouse/items', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return item;
}

export async function updateItem(id: number, patch: WarehouseItemPatch): Promise<WarehouseItem> {
  const { item } = await apiFetch<{ item: WarehouseItem }>(`/api/warehouse/items/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return item;
}

export async function deleteItem(id: number): Promise<void> {
  await apiFetch<void>(`/api/warehouse/items/${id}`, {
    method: 'DELETE',
  });
}

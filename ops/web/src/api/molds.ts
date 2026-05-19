import { apiFetch } from './index';

export interface Mold {
  id: number;
  name: string;
  type: string | null;
  status: 'active' | 'retired' | 'broken';
  capacity: number | null;
  usage_count: number;
  usage_limit: number | null;
  photo_url: string | null;
  note: string | null;
}

export interface MoldHardware {
  id: number;
  mold_id: number;
  warehouse_item_id: number | null;
  warehouse_item_name?: string | null;
  warehouse_qty?: number | null;
  qty_per_use: number;
  note: string | null;
}

export interface MoldInput {
  id?: number;
  name: string;
  type?: string | null;
  status?: string;
  capacity?: number | null;
  usage_limit?: number | null;
  photo_url?: string | null;
  note?: string | null;
}

export type MoldPatch = Partial<MoldInput> & { usage_count?: number };

export async function listMolds(params: { search?: string; status?: string } = {}): Promise<Mold[]> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set('search', params.search);
  if (params.status) searchParams.set('status', params.status);
  const query = searchParams.toString();
  const { molds } = await apiFetch<{ molds: Mold[] }>(`/api/molds${query ? `?${query}` : ''}`);
  return molds;
}

export async function getMold(id: number): Promise<Mold> {
  const { mold } = await apiFetch<{ mold: Mold }>(`/api/molds/${id}`);
  return mold;
}

export async function createMold(input: MoldInput): Promise<Mold> {
  const { mold } = await apiFetch<{ mold: Mold }>('/api/molds', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return mold;
}

export async function updateMold(id: number, patch: MoldPatch): Promise<Mold> {
  const { mold } = await apiFetch<{ mold: Mold }>(`/api/molds/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return mold;
}

export async function deleteMold(id: number): Promise<void> {
  await apiFetch<void>(`/api/molds/${id}`, { method: 'DELETE' });
}

export async function listHardware(id: number): Promise<MoldHardware[]> {
  const { hardware } = await apiFetch<{ hardware: MoldHardware[] }>(`/api/molds/${id}/hardware`);
  return hardware.map((item) => ({ ...item, qty_per_use: Number(item.qty_per_use), warehouse_qty: Number(item.warehouse_qty ?? 0) }));
}

export async function replaceHardware(id: number, items: Array<{ warehouse_item_id: number; qty_per_use: number; note?: string | null }>) {
  const { hardware } = await apiFetch<{ hardware: MoldHardware[] }>(`/api/molds/${id}/hardware`, {
    method: 'PUT',
    body: JSON.stringify({ items }),
  });
  return hardware;
}

export async function useMold(id: number, input: { units: number; order_id?: number | null; operator_name?: string | null; note?: string | null }) {
  const { mold } = await apiFetch<{ mold: Mold }>(`/api/molds/${id}/use`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return mold;
}

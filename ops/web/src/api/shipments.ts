import { apiFetch } from './index';

export interface ShipmentItem {
  id?: number;
  shipment_id?: number;
  warehouse_item_id: number | null;
  name: string;
  qty: number;
  unit_price?: number | null;
  currency?: string | null;
  received_qty?: number | null;
  extras?: Record<string, unknown>;
}

export interface Shipment {
  id: number;
  name: string;
  source: string | null;
  status: 'planned' | 'in_transit' | 'received' | 'cancelled';
  expected_date: string | null;
  received_at: string | null;
  total_cost: number | null;
  currency: string | null;
  note: string | null;
  items?: ShipmentItem[];
  created_at: string;
  updated_at: string;
}

export interface ShipmentInput {
  id?: number;
  name: string;
  source?: string | null;
  status?: string | null;
  expected_date?: string | null;
  total_cost?: number | null;
  currency?: string | null;
  note?: string | null;
  items?: ShipmentItem[];
}

export async function listShipments(params: { status?: string; from?: string; to?: string } = {}): Promise<Shipment[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  const query = search.toString();
  const { shipments } = await apiFetch<{ shipments: Shipment[] }>(`/api/shipments${query ? `?${query}` : ''}`);
  return shipments;
}

export async function getShipment(id: number): Promise<Shipment> {
  const { shipment } = await apiFetch<{ shipment: Shipment }>(`/api/shipments/${id}`);
  return shipment;
}

export async function createShipment(input: ShipmentInput): Promise<Shipment> {
  const { shipment } = await apiFetch<{ shipment: Shipment }>('/api/shipments', {
    method: 'POST',
    body: JSON.stringify({ ...input, id: input.id ?? Date.now() }),
  });
  return shipment;
}

export async function updateShipment(id: number, patch: Partial<ShipmentInput>): Promise<Shipment> {
  const { shipment } = await apiFetch<{ shipment: Shipment }>(`/api/shipments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return shipment;
}

export async function deleteShipment(id: number): Promise<void> {
  await apiFetch<void>(`/api/shipments/${id}`, { method: 'DELETE' });
}

export async function receiveShipment(id: number): Promise<Shipment> {
  const { shipment } = await apiFetch<{ shipment: Shipment }>(`/api/shipments/${id}/receive`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
  return shipment;
}

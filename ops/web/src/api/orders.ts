import { apiFetch } from './index';

export type OrderStatus = 'draft' | 'quoted' | 'approved' | 'in_production' | 'ready' | 'shipped' | 'closed' | 'cancelled';

export interface Order {
  id: number;
  order_name: string | null;
  client_name: string | null;
  client_phone: string | null;
  client_email: string | null;
  manager_id: number | null;
  status: OrderStatus;
  deadline: string | null;
  total_revenue: number | null;
  total_cost: number | null;
  total_margin: number | null;
  margin_percent: number | null;
  total_hours_plan: number | null;
  production_hours_plastic: number | null;
  production_hours_packaging: number | null;
  production_hours_hardware: number | null;
  calculator_data: Record<string, unknown>;
  extras?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  type: string;
  name: string | null;
  qty: number | null;
  unit_price: number | null;
  line_total: number | null;
  position: number | null;
  item_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrderFactual {
  id: number;
  order_id: number;
  factual_data: Record<string, unknown>;
  actual_revenue: number | null;
  actual_cost: number | null;
  actual_margin: number | null;
  actual_margin_percent: number | null;
  closed_at: string | null;
  updated_at: string;
}

export interface OrderStatusHistory {
  id: number;
  order_id: number;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_name: string | null;
  note: string | null;
  created_at: string;
}

export interface OrderDetail {
  order: Order;
  items: OrderItem[];
  factual: OrderFactual | null;
  status_history: OrderStatusHistory[];
}

export interface OrderInput {
  id?: number;
  order_name?: string | null;
  client_name?: string | null;
  client_phone?: string | null;
  client_email?: string | null;
  manager_id?: number | null;
  status?: OrderStatus;
  deadline?: string | null;
  total_revenue?: number | null;
  total_cost?: number | null;
  total_margin?: number | null;
  margin_percent?: number | null;
  total_hours_plan?: number | null;
  production_hours_plastic?: number | null;
  production_hours_packaging?: number | null;
  production_hours_hardware?: number | null;
  calculator_data?: Record<string, unknown>;
  extras?: Record<string, unknown>;
}

export interface OrderItemInput {
  id?: number;
  type?: string;
  name?: string | null;
  qty?: number | null;
  unit_price?: number | null;
  line_total?: number | null;
  position?: number | null;
  item_data?: Record<string, unknown>;
}

export function statusLabel(status: string): string {
  return ({
    draft: 'Черновик',
    quoted: 'КП',
    approved: 'Подтвержден',
    in_production: 'В производстве',
    ready: 'Готов',
    shipped: 'Отгружен',
    closed: 'Закрыт',
    cancelled: 'Отменен',
  } as Record<string, string>)[status] || status;
}

export async function listOrders(params: { status?: string[]; from?: string; to?: string; manager_id?: number; search?: string } = {}): Promise<Order[]> {
  const searchParams = new URLSearchParams();
  if (params.status?.length) searchParams.set('status', params.status.join(','));
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);
  if (params.manager_id) searchParams.set('manager_id', String(params.manager_id));
  if (params.search) searchParams.set('search', params.search);
  const query = searchParams.toString();
  const { orders } = await apiFetch<{ orders: Order[] }>(`/api/orders${query ? `?${query}` : ''}`);
  return orders;
}

export async function getOrder(id: number): Promise<OrderDetail> {
  return apiFetch<OrderDetail>(`/api/orders/${id}`);
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>('/api/orders', {
    method: 'POST',
    body: JSON.stringify({ id: input.id ?? Date.now(), status: 'draft', calculator_data: {}, ...input }),
  });
  return order;
}

export async function updateOrder(id: number, patch: Partial<OrderInput>): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>(`/api/orders/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return order;
}

export async function deleteOrder(id: number): Promise<void> {
  await apiFetch<void>(`/api/orders/${id}`, { method: 'DELETE' });
}

export async function cloneOrder(id: number, order_name?: string): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>(`/api/orders/${id}/clone`, {
    method: 'POST',
    body: JSON.stringify({ order_name }),
  });
  return order;
}

export async function createOrderItem(orderId: number, input: OrderItemInput): Promise<OrderItem> {
  const { item } = await apiFetch<{ item: OrderItem }>(`/api/orders/${orderId}/items`, {
    method: 'POST',
    body: JSON.stringify({ id: input.id ?? Date.now(), type: 'product', item_data: {}, ...input }),
  });
  return item;
}

export async function updateOrderItem(orderId: number, itemId: number, patch: Partial<OrderItemInput>): Promise<OrderItem> {
  const { item } = await apiFetch<{ item: OrderItem }>(`/api/orders/${orderId}/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return item;
}

export async function deleteOrderItem(orderId: number, itemId: number): Promise<void> {
  await apiFetch<void>(`/api/orders/${orderId}/items/${itemId}`, { method: 'DELETE' });
}

export async function changeOrderStatus(id: number, new_status: OrderStatus, note?: string): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>(`/api/orders/${id}/status`, {
    method: 'POST',
    body: JSON.stringify({ new_status, note }),
  });
  return order;
}

export async function recalcOrder(id: number): Promise<Order> {
  const { order } = await apiFetch<{ order: Order }>(`/api/orders/${id}/recalc`, { method: 'POST', body: '{}' });
  return order;
}

export async function consumeHardware(orderId: number, items: { warehouse_item_id: number; qty: number; note?: string | null }[], note?: string): Promise<void> {
  await apiFetch<void>(`/api/orders/${orderId}/consume-hardware`, {
    method: 'POST',
    body: JSON.stringify({ items, note }),
  });
}

export async function saveFactual(orderId: number, input: Partial<OrderFactual> & { factual_data?: Record<string, unknown> }): Promise<OrderFactual> {
  const { factual } = await apiFetch<{ factual: OrderFactual }>(`/api/orders/${orderId}/factual`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return factual;
}

export async function recalcFactual(orderId: number): Promise<OrderFactual> {
  const { factual } = await apiFetch<{ factual: OrderFactual }>(`/api/orders/${orderId}/factual/recalc`, { method: 'POST', body: '{}' });
  return factual;
}

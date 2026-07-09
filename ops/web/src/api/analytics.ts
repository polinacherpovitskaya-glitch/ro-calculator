import { apiFetch } from './index';

export interface SummaryReport {
  orders_count: number;
  closed_count: number;
  plan_revenue: number;
  plan_cost: number;
  plan_margin: number;
  plan_hours: number;
  factual_count: number;
  fact_revenue: number;
  fact_cost: number;
  fact_margin: number;
  fact_hours: number;
  plan_margin_percent: number | null;
  fact_margin_percent: number | null;
}

export interface RevenueByMonthRow {
  month: string;
  revenue: number;
  cost: number;
  margin: number;
  orders_count: number;
}

export interface TopClientRow {
  client_name: string;
  revenue: number;
  margin: number;
  orders_count: number;
}

export interface StatusDynamicsRow {
  month: string;
  status: string;
  orders_count: number;
  revenue: number;
}

export interface ProductionLoadRow {
  employee_id: number;
  employee_name: string;
  stage: string;
  hours: number;
  entries_count: number;
  is_production_stage: boolean;
}

export interface ProductTypeRow {
  type: string;
  lines_count: number;
  qty: number;
  revenue: number;
  hours: number;
}

export interface FactualMarginRow {
  order_id: number;
  order_name: string;
  client_name: string;
  status: string;
  report_date: string;
  actual_revenue: number;
  actual_cost: number;
  actual_margin: number;
  actual_margin_percent: number | null;
}

function query(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') qs.set(key, String(value));
  });
  return qs.toString() ? `?${qs}` : '';
}

async function report<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const { data } = await apiFetch<{ data: T }>(`/api/analytics/${path}${query(params)}`);
  return data;
}

export const analyticsApi = {
  summary: (params: { from?: string; to?: string } = {}) => report<SummaryReport>('summary', params),
  revenueByMonth: (params: { year_from: number; year_to: number }) => report<RevenueByMonthRow[]>('revenue-by-month', params),
  topClients: (params: { from?: string; to?: string; limit?: number } = {}) => report<TopClientRow[]>('top-clients', params),
  statusDynamics: (params: { from?: string; to?: string } = {}) => report<StatusDynamicsRow[]>('status-dynamics', params),
  productionLoad: (params: { from?: string; to?: string } = {}) => report<ProductionLoadRow[]>('production-load', params),
  productTypes: (params: { from?: string; to?: string } = {}) => report<ProductTypeRow[]>('product-types', params),
  factualMargin: (params: { from?: string; to?: string } = {}) => report<FactualMarginRow[]>('factual-margin', params),
};

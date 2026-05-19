import { round2 } from './pricing.js';
import type { FactualInput, FactualOutput } from './types.js';

export function calcFactual(factual: FactualInput): FactualOutput {
  const revenue = n(factual.fact_revenue);
  const cost = round2(
    n(factual.fact_salary_production)
    + n(factual.fact_salary_trim)
    + n(factual.fact_salary_assembly)
    + n(factual.fact_salary_packaging)
    + n(factual.fact_indirect_production)
    + n(factual.fact_hardware_total)
    + n(factual.fact_nfc_total)
    + n(factual.fact_packaging_total)
    + n(factual.fact_design_printing)
    + n(factual.fact_plastic)
    + n(factual.fact_molds)
    + n(factual.fact_delivery_client)
    + n(factual.fact_taxes)
    + n(factual.fact_commercial)
    + n(factual.fact_charity)
    + n(factual.fact_other)
  );
  const profit = round2(revenue - cost);
  return {
    revenue: round2(revenue),
    cost,
    profit,
    margin: revenue > 0 ? round2((profit * 100) / revenue) : null,
    hasRevenue: revenue > 0,
    hasCosts: cost > 0,
  };
}

function n(value: number | undefined): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

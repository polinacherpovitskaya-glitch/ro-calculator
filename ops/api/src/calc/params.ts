import { calcNumber } from './number.js';
import type { ProductionParams, ProductionSettings } from './types.js';

export function getProductionParams(settings: Partial<ProductionSettings>): ProductionParams {
  const s = (key: keyof ProductionSettings): number => calcNumber(settings[key], 0);
  const totalHoursPerWorker = s('hours_per_worker');
  const totalHoursAll = s('workers_count') * totalHoursPerWorker;
  const workLoadHours = totalHoursAll * s('work_load_ratio');
  const plasticHours = workLoadHours * s('plastic_injection_ratio');
  const packagingHours = workLoadHours * s('packaging_ratio');
  const indirectCostMode = settings.indirect_cost_mode || 'all';
  const indirectDenom = indirectCostMode === 'all' ? workLoadHours : plasticHours;
  const indirectPerHour = indirectDenom > 0 ? s('indirect_costs_monthly') / indirectDenom : 0;

  return {
    totalHoursAll,
    workLoadHours,
    plasticHours,
    packagingHours,
    indirectPerHour,
    indirectCostMode,
    fotPerHour: s('fot_per_hour'),
    cuttingSpeed: s('cutting_speed'),
    plasticCostPerKg: s('plastic_cost_per_kg'),
    nfcWriteSpeed: s('nfc_write_speed'),
    moldBaseCost: s('mold_base_cost'),
    designCost: s('design_cost'),
    nfcTagCost: s('nfc_tag_cost'),
    vatRate: s('vat_rate'),
    taxRate: s('tax_rate'),
    charityRate: calcNumber(settings.charity_rate, 0.01),
    marginTarget: s('margin_target'),
    deliveryCostMoscow: s('delivery_cost_moscow'),
    printingDeliveryCost: s('printing_delivery_cost'),
    wasteFactor: s('waste_factor') || 1.1,
  };
}

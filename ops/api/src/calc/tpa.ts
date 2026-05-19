import { keepRateForTargetMargin, round2, roundTo5 } from './pricing.js';
import type { ProductionParams, TpaInput, TpaOutput } from './types.js';

export function calcTpaLive(input: TpaInput, params: Partial<ProductionParams> = {}): TpaOutput {
  const quantity = Math.max(1, Number(input.quantity || 0) || 1);
  const cavities = Math.max(1, Number(input.cavities || 0) || 1);
  const openingsPerHour = Math.max(1, Number(input.openingsPerHour || 0) || 1);
  const weight = Math.max(0, Number(input.weight || 0) || 0);
  const wasteFactor = Math.max(1, Number(input.wasteFactor || 1.1) || 1.1);
  const materialCostPerKg = Math.max(0, Number(input.materialCostPerKg || 0) || 0);
  const operatorRatePerHour = Math.max(0, Number(input.operatorRatePerHour || 0) || 0);
  const indirectRatePerHour = Math.max(0, Number(input.indirectRatePerHour || 0) || 0);
  const moldCost = Math.max(0, Number(input.moldCost || 0) || 0);
  const setupCost = Math.max(0, Number(input.setupCost || 0) || 0);
  const marginPct = Math.max(0, Number(input.targetMarginPct || 0) || 0);

  const piecesPerHour = cavities * openingsPerHour;
  const hoursTotal = (quantity / piecesPerHour) * wasteFactor;
  const plasticPerUnit = round2((materialCostPerKg / 1000) * weight * wasteFactor);
  const fotPerUnit = round2((hoursTotal * operatorRatePerHour) / quantity);
  const indirectPerUnit = round2((hoursTotal * indirectRatePerHour) / quantity);
  const setupPerUnit = round2(setupCost / quantity);
  const runtimePerUnit = round2(plasticPerUnit + fotPerUnit + indirectPerUnit + setupPerUnit);
  const moldPerUnit = round2(moldCost / quantity);
  const totalPerUnit = round2(runtimePerUnit + moldPerUnit);
  const keepRate = keepRateForTargetMargin(params, marginPct / 100);
  const sellNoVat = keepRate > 0 ? roundTo5(totalPerUnit / keepRate) : 0;
  const vatRate = Number.isFinite(params.vatRate) ? Number(params.vatRate) : 0.05;

  return {
    quantity,
    cavities,
    openingsPerHour,
    weight,
    piecesPerHour,
    hoursTotal: round2(hoursTotal),
    plasticPerUnit,
    fotPerUnit,
    indirectPerUnit,
    setupPerUnit,
    runtimePerUnit,
    moldPerUnit,
    totalPerUnit,
    runtimeTotal: round2(runtimePerUnit * quantity),
    totalCost: round2(totalPerUnit * quantity),
    sellNoVat,
    sellWithVat: sellNoVat > 0 ? round2(sellNoVat * (1 + vatRate)) : 0,
    oneShiftMonthly: Math.round(piecesPerHour * 8 * 21),
  };
}

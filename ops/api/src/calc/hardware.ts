import { calcNumber } from './number.js';
import { round2 } from './pricing.js';
import type { HardwareCostOutput, HardwareInput, ProductionParams } from './types.js';

export function calcHardware(input: HardwareInput, params: ProductionParams): HardwareCostOutput {
  const qty = calcNumber(input.qty, 0);
  const speed = calcNumber(input.assembly_speed, 0);
  let hoursHardware = 0;
  let fotPerUnit = 0;
  let indirectPerUnit = 0;

  if (qty > 0 && speed > 0) {
    hoursHardware = (qty / speed) * params.wasteFactor;
    fotPerUnit = (hoursHardware * params.fotPerHour) / qty;
    if (params.indirectCostMode === 'all') {
      indirectPerUnit = (params.indirectPerHour * hoursHardware) / qty;
    }
  }

  const costPerUnit = fotPerUnit + indirectPerUnit + calcNumber(input.price, 0) + calcNumber(input.delivery_price, 0);
  return {
    costPerUnit: round2(costPerUnit),
    fotPerUnit: round2(fotPerUnit),
    indirectPerUnit: round2(indirectPerUnit),
    hoursHardware: round2(hoursHardware),
    totalCost: round2(costPerUnit * qty),
  };
}

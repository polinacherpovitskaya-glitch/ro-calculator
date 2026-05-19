import { calcNumber } from './number.js';
import { round2 } from './pricing.js';
import type { PackagingCostOutput, PackagingInput, ProductionParams } from './types.js';

export function calcPackaging(input: PackagingInput, params: ProductionParams): PackagingCostOutput {
  const qty = calcNumber(input.qty, 0);
  const speed = calcNumber(input.assembly_speed, 0);
  let hoursPackaging = 0;
  let fotPerUnit = 0;
  let indirectPerUnit = 0;

  if (qty > 0 && speed > 0) {
    hoursPackaging = (qty / speed) * params.wasteFactor;
    fotPerUnit = (hoursPackaging * params.fotPerHour) / qty;
    if (params.indirectCostMode === 'all') {
      indirectPerUnit = (params.indirectPerHour * hoursPackaging) / qty;
    }
  }

  const costPerUnit = fotPerUnit + indirectPerUnit + calcNumber(input.price, 0) + calcNumber(input.delivery_price, 0);
  return {
    costPerUnit: round2(costPerUnit),
    fotPerUnit: round2(fotPerUnit),
    indirectPerUnit: round2(indirectPerUnit),
    hoursPackaging: round2(hoursPackaging),
    totalCost: round2(costPerUnit * qty),
  };
}

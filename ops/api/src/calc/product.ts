import { calcNumber } from './number.js';
import { round2 } from './pricing.js';
import type { PrintingInput, ProductCostOutput, ProductInput, ProductionParams } from './types.js';

const MOLD_LIFETIME = 4500;

export function getActivePrintings(item: Partial<ProductInput>): PrintingInput[] {
  return (item.printings || []).filter((printing) => {
    const name = String(printing.name || '').trim();
    const qty = calcNumber(printing.qty, 0);
    const price = calcNumber(printing.price, 0);
    const sellPrice = calcNumber(printing.sell_price, 0);
    const deliveryTotal = calcNumber(printing.delivery_total, 0);
    return !!name && (qty > 0 || price > 0 || sellPrice > 0 || deliveryTotal > 0);
  });
}

export function hasLegacyPrintingFallback(item: Partial<ProductInput>): boolean {
  if ((item.printings || []).length > 0) return false;
  const qty = calcNumber(item.printing_qty, 0);
  const purchasePrice = calcNumber(item.printing_price_per_unit, 0);
  const sellPrice = calcNumber(item.sell_price_printing, 0);
  return qty > 0 && (purchasePrice > 0 || sellPrice > 0);
}

export function getPrintingSellPricePerUnit(item: Partial<ProductInput>): number {
  const printings = getActivePrintings(item);
  if (printings.length > 0) {
    return printings.reduce((sum, printing) => sum + calcNumber(printing.sell_price, 0), 0);
  }
  return hasLegacyPrintingFallback(item) ? calcNumber(item.sell_price_printing, 0) : 0;
}

export function calcProduct(input: ProductInput, params: ProductionParams): ProductCostOutput {
  const qty = calcNumber(input.quantity, 0);
  const pph = calcNumber(input.pieces_per_hour, 0);
  const weight = calcNumber(input.weight_grams, 0);
  if (qty === 0 || pph === 0) return emptyProductCost();

  const hoursPlastic = (1 / pph) * qty * params.wasteFactor;
  const costFot = (hoursPlastic * params.fotPerHour) / qty;
  const costIndirect = (params.indirectPerHour * hoursPlastic) / qty;
  const costPlastic = (params.plasticCostPerKg / 1000) * weight * params.wasteFactor;

  const extraMolds = calcNumber(input.extra_molds, 0);
  const paidBaseMolds = !input.is_blank_mold && input.base_mold_in_stock ? 0 : 1;
  const totalPaidMolds = Math.max(0, paidBaseMolds + extraMolds);
  const blankMoldTotalCost = calcNumber(input.blank_mold_total_cost, 0);
  const costMoldAmortization = input.is_blank_mold
    ? ((blankMoldTotalCost > 0 ? blankMoldTotalCost : (params.moldBaseCost * totalPaidMolds)) / MOLD_LIFETIME)
    : ((params.moldBaseCost * totalPaidMolds) / qty);

  const costDesign = input.complex_design ? params.designCost / qty : 0;

  const hoursCutting = params.cuttingSpeed > 0 ? (qty / params.cuttingSpeed) * params.wasteFactor : 0;
  const costCutting = (hoursCutting * params.fotPerHour) / qty;
  const costCuttingIndirect = hoursCutting > 0 ? (params.indirectPerHour * hoursCutting) / qty : 0;

  const hasExplicitNfcHardware = !!input.is_nfc
    && isNfcLikeEntry(input.builtin_hw_name)
    && (calcNumber(input.builtin_hw_price, 0) > 0 || calcNumber(input.builtin_hw_delivery_total, 0) > 0);
  const costNfcTag = input.is_nfc ? (hasExplicitNfcHardware ? 0 : params.nfcTagCost) : 0;

  let hoursNfc = 0;
  let costNfcProgramming = 0;
  let costNfcIndirect = 0;
  if (input.nfc_programming && params.nfcWriteSpeed > 0) {
    hoursNfc = (qty / params.nfcWriteSpeed) * params.wasteFactor;
    costNfcProgramming = params.fotPerHour / params.nfcWriteSpeed;
    costNfcIndirect = (params.indirectPerHour * hoursNfc) / qty;
  }

  const { costPrinting, costPrintingDetails } = calcPrintingCost(input, params);
  const builtin = calcBuiltinHardware(input, params, qty);
  const assembly = calcBuiltinAssembly(input, params, qty);
  const costDelivery = input.delivery_included ? params.deliveryCostMoscow / qty : 0;

  const costTotal = costFot + costIndirect + costPlastic + costMoldAmortization
    + costDesign + costCutting + costCuttingIndirect
    + costNfcTag + costNfcProgramming + costNfcIndirect
    + costPrinting + costDelivery
    + builtin.costBuiltinHw + builtin.costBuiltinHwIndirect
    + assembly.costBuiltinAssembly + assembly.costBuiltinAssemblyIndirect;

  return {
    costFot: round2(costFot),
    costIndirect: round2(costIndirect),
    costPlastic: round2(costPlastic),
    costMoldAmortization: round2(costMoldAmortization),
    costDesign: round2(costDesign),
    costCutting: round2(costCutting),
    costCuttingIndirect: round2(costCuttingIndirect),
    costNfcTag: round2(costNfcTag),
    costNfcProgramming: round2(costNfcProgramming),
    costNfcIndirect: round2(costNfcIndirect),
    costPrinting: round2(costPrinting),
    costPrintingDetails,
    costDelivery: round2(costDelivery),
    costBuiltinHw: round2(builtin.costBuiltinHw),
    costBuiltinHwIndirect: round2(builtin.costBuiltinHwIndirect),
    costBuiltinAssembly: round2(assembly.costBuiltinAssembly),
    costBuiltinAssemblyIndirect: round2(assembly.costBuiltinAssemblyIndirect),
    costTotal: Number.isFinite(costTotal) ? round2(costTotal) : 0,
    hoursPlastic: round2(hoursPlastic),
    hoursCutting: round2(hoursCutting),
    hoursNfc: round2(hoursNfc),
    hoursBuiltinHw: round2(builtin.hoursBuiltinHw),
    hoursBuiltinAssembly: round2(assembly.hoursBuiltinAssembly),
    hoursPlasticZone: round2(hoursPlastic + hoursCutting + hoursNfc),
    hoursAssemblyZone: round2(builtin.hoursBuiltinHw + assembly.hoursBuiltinAssembly),
    hoursCuttingZone: 0,
    hoursTotalPlasticNfc: round2(hoursPlastic + hoursCutting + hoursNfc),
  };
}

function calcPrintingCost(input: ProductInput, params: ProductionParams): { costPrinting: number; costPrintingDetails: number[] } {
  const details: number[] = [];
  let total = 0;
  const printings = getActivePrintings(input);
  if (printings.length > 0) {
    for (const printing of printings) {
      const qty = calcNumber(printing.qty, 0);
      const price = calcNumber(printing.price, 0);
      if (qty > 0 && price > 0) {
        const deliveryTotal = calcNumber(printing.delivery_total, 0);
        const deliveryCost = deliveryTotal > 0 ? deliveryTotal / qty : params.printingDeliveryCost / qty;
        const cost = (price * 1.06) + deliveryCost;
        total += cost;
        details.push(round2(cost));
      } else {
        details.push(0);
      }
    }
  } else {
    const printQty = calcNumber(input.printing_qty, 0);
    const printPrice = calcNumber(input.printing_price_per_unit, 0);
    if (printQty > 0 && printPrice > 0) {
      total = (printPrice * 1.06) + (params.printingDeliveryCost / printQty);
    }
  }
  return { costPrinting: total, costPrintingDetails: details };
}

function calcBuiltinHardware(input: ProductInput, params: ProductionParams, qty: number) {
  const name = String(input.builtin_hw_name || '').trim();
  const price = calcNumber(input.builtin_hw_price, 0);
  const deliveryTotal = calcNumber(input.builtin_hw_delivery_total, 0);
  const speed = calcNumber(input.builtin_hw_speed, 0);
  let costBuiltinHw = 0;
  let costBuiltinHwIndirect = 0;
  let hoursBuiltinHw = 0;

  if (name && (price > 0 || speed > 0)) {
    costBuiltinHw = price + (deliveryTotal > 0 && qty > 0 ? deliveryTotal / qty : 0);
    if (speed > 0 && qty > 0) {
      hoursBuiltinHw = (qty / speed) * params.wasteFactor;
      costBuiltinHw += (hoursBuiltinHw * params.fotPerHour) / qty;
      if (params.indirectCostMode === 'all') {
        costBuiltinHwIndirect = (params.indirectPerHour * hoursBuiltinHw) / qty;
      }
    }
  }

  return { costBuiltinHw, costBuiltinHwIndirect, hoursBuiltinHw };
}

function calcBuiltinAssembly(input: ProductInput, params: ProductionParams, qty: number) {
  const speed = calcNumber(input.builtin_assembly_speed, 0);
  let costBuiltinAssembly = 0;
  let costBuiltinAssemblyIndirect = 0;
  let hoursBuiltinAssembly = 0;

  if (speed > 0 && qty > 0) {
    hoursBuiltinAssembly = (qty / speed) * params.wasteFactor;
    costBuiltinAssembly = (hoursBuiltinAssembly * params.fotPerHour) / qty;
    if (params.indirectCostMode === 'all') {
      costBuiltinAssemblyIndirect = (params.indirectPerHour * hoursBuiltinAssembly) / qty;
    }
  }

  return { costBuiltinAssembly, costBuiltinAssemblyIndirect, hoursBuiltinAssembly };
}

function isNfcLikeEntry(...values: Array<string | undefined>): boolean {
  return values.some((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'nfc') return true;
    return /(^|[^a-zа-яё])nfc([^a-zа-яё]|$)/i.test(normalized)
      || normalized.includes('нфс')
      || normalized.includes('чип');
  });
}

function emptyProductCost(): ProductCostOutput {
  return {
    costFot: 0,
    costIndirect: 0,
    costPlastic: 0,
    costMoldAmortization: 0,
    costDesign: 0,
    costCutting: 0,
    costCuttingIndirect: 0,
    costNfcTag: 0,
    costNfcProgramming: 0,
    costNfcIndirect: 0,
    costPrinting: 0,
    costPrintingDetails: [],
    costDelivery: 0,
    costBuiltinHw: 0,
    costBuiltinHwIndirect: 0,
    costBuiltinAssembly: 0,
    costBuiltinAssemblyIndirect: 0,
    costTotal: 0,
    hoursPlastic: 0,
    hoursCutting: 0,
    hoursNfc: 0,
    hoursBuiltinHw: 0,
    hoursBuiltinAssembly: 0,
    hoursPlasticZone: 0,
    hoursAssemblyZone: 0,
    hoursCuttingZone: 0,
    hoursTotalPlasticNfc: 0,
  };
}

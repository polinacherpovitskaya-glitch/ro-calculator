import { calcNumber } from './number.js';
import { actualMargin, retailPrice, round2 } from './pricing.js';
import type { PendantAttachmentInput, PendantCostOutput, PendantInput, ProductionParams } from './types.js';

export function calcPendant(input: PendantInput, params: ProductionParams): PendantCostOutput {
  const qty = calcNumber(input.quantity, 0);
  if (qty === 0) return emptyPendantCost();

  const elements = countableElements(input);
  const elementCostPerUnit = calcNumber(input.element_price_per_unit, 0);
  const elementCostTotal = qty * elements.length * elementCostPerUnit;
  const attachments = [
    ...attachmentEntries(input, 'cord').map((entry) => ({ type: 'cord' as const, entry })),
    ...attachmentEntries(input, 'carabiner').map((entry) => ({ type: 'carabiner' as const, entry })),
  ];

  let attachmentPurchaseTotal = 0;
  let attachmentDeliveryTotal = 0;
  let attachmentAssemblyTotal = 0;
  let attachmentIndirectTotal = 0;
  let attachmentAssemblyHours = 0;

  for (const { type, entry } of attachments) {
    const allocatedQty = attachmentAllocatedQty(input, entry);
    if (!(allocatedQty > 0)) continue;
    const purchasePer = attachmentPurchasePerPendant(type, entry);
    const deliveryPer = attachmentDeliveryPerPendant(type, entry);
    const assemblyPer = attachmentAssemblyCostPerPendant(type, entry, params);
    const indirectPer = attachmentIndirectPerPendant(type, entry, params);
    attachmentPurchaseTotal += allocatedQty * purchasePer;
    attachmentDeliveryTotal += allocatedQty * deliveryPer;
    attachmentAssemblyTotal += allocatedQty * assemblyPer;
    attachmentIndirectTotal += allocatedQty * indirectPer;
    attachmentAssemblyHours += attachmentAssemblyHoursForEntry(type, entry, allocatedQty, params);
  }

  const printCostTotal = elements.reduce((sum, element) => {
    return sum + (element.has_print ? qty * calcNumber(element.print_price, 0) : 0);
  }, 0);

  const totalCost = round2(elementCostTotal + attachmentPurchaseTotal + attachmentDeliveryTotal + attachmentAssemblyTotal + attachmentIndirectTotal + printCostTotal);
  const costPerUnit = qty > 0 ? round2(totalCost / qty) : 0;
  const sellPerUnit = calcNumber(input._totalSellPerUnit, 0) > 0
    ? calcNumber(input._totalSellPerUnit, 0)
    : retailPrice({ cost: costPerUnit, params, quantity: qty });

  return {
    costPerUnit,
    sellPerUnit: round2(sellPerUnit),
    totalCost,
    totalRevenue: round2(sellPerUnit * qty),
    assemblyHours: round2(attachmentAssemblyHours),
    packagingHours: 0,
    hoursPlastic: 0,
    hoursCutting: 0,
    hoursBuiltinHw: 0,
    hoursBuiltinAssembly: 0,
    hoursPlasticZone: 0,
    hoursAssemblyZone: 0,
    attachmentAssemblyHours: round2(attachmentAssemblyHours),
    letterAssemblyHours: 0,
    attachmentPurchaseTotal: round2(attachmentPurchaseTotal),
    attachmentDeliveryTotal: round2(attachmentDeliveryTotal),
    attachmentAssemblyTotal: round2(attachmentAssemblyTotal),
    attachmentIndirectTotal: round2(attachmentIndirectTotal),
    margin: actualMargin(sellPerUnit, costPerUnit, params),
  };
}

function countableElements(input: PendantInput) {
  return input.elements.filter((element) => {
    const char = String(element.char || '');
    return /\S/u.test(char) && stripTechnicalCharParts(char).length > 0;
  });
}

function stripTechnicalCharParts(char: string): string {
  return char.replace(/[\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}\p{Mark}\u{1F3FB}-\u{1F3FF}]/gu, '');
}

function attachmentEntries(input: PendantInput, type: 'cord' | 'carabiner'): PendantAttachmentInput[] {
  const collection = type === 'cord' ? input.cords : input.carabiners;
  const legacy = type === 'cord' ? input.cord : input.carabiner;
  const entries = collection && collection.length > 0 ? collection : (legacy ? [legacy] : []);
  return entries
    .map((entry, index) => normalizeAttachment(input, type, entry, index))
    .filter(hasAttachmentData);
}

function normalizeAttachment(input: PendantInput, type: 'cord' | 'carabiner', entry: PendantAttachmentInput, index: number): PendantAttachmentInput {
  const qtyPerPendant = calcNumber(entry.qty_per_pendant, 0);
  const lengthCm = calcNumber(entry.length_cm, type === 'cord' && index === 0 ? input.cord_length_cm || 0 : 0);
  const allocatedQty = calcNumber(entry.allocated_qty, Number.NaN);
  const hasExplicitAllocatedQty = Number.isFinite(allocatedQty) && allocatedQty >= 0;
  const hasData = hasAttachmentData(entry);
  return {
    ...entry,
    qty_per_pendant: qtyPerPendant > 0 ? qtyPerPendant : 1,
    length_cm: Number.isFinite(lengthCm) ? lengthCm : 0,
    unit: entry.unit || 'шт',
    allocated_qty: hasExplicitAllocatedQty ? allocatedQty : (hasData && input.quantity > 0 ? input.quantity : 0),
  };
}

function hasAttachmentData(entry: PendantAttachmentInput): boolean {
  return !!(
    entry.name
    || entry.warehouse_item_id
    || entry.warehouse_sku
    || calcNumber(entry.price_per_unit, 0) > 0
    || calcNumber(entry.delivery_price, 0) > 0
    || calcNumber(entry.sell_price, 0) > 0
    || entry.source === 'custom'
  );
}

function isMetricAttachment(type: 'cord' | 'carabiner', entry: PendantAttachmentInput): boolean {
  return type === 'cord' && (entry.unit === 'м' || entry.unit === 'см');
}

function metricRateFactor(entry: PendantAttachmentInput): number {
  const lengthCm = calcNumber(entry.length_cm, 0);
  if (!(lengthCm > 0)) return 0;
  return entry.unit === 'см' ? lengthCm : lengthCm / 100;
}

function attachmentAllocatedQty(input: PendantInput, entry: PendantAttachmentInput): number {
  const allocated = calcNumber(entry.allocated_qty, Number.NaN);
  if (Number.isFinite(allocated) && allocated >= 0) return allocated;
  return input.quantity > 0 ? input.quantity : 0;
}

function attachmentPurchasePerPendant(type: 'cord' | 'carabiner', entry: PendantAttachmentInput): number {
  if (isMetricAttachment(type, entry)) {
    return round2(calcNumber(entry.price_per_unit, 0) * metricRateFactor(entry));
  }
  return round2(calcNumber(entry.price_per_unit, 0) * (calcNumber(entry.qty_per_pendant, 0) || 1));
}

function attachmentDeliveryPerPendant(type: 'cord' | 'carabiner', entry: PendantAttachmentInput): number {
  if (isMetricAttachment(type, entry)) {
    return round2(calcNumber(entry.delivery_price, 0));
  }
  return round2(calcNumber(entry.delivery_price, 0) * (calcNumber(entry.qty_per_pendant, 0) || 1));
}

function attachmentOpsPerPendant(type: 'cord' | 'carabiner', entry: PendantAttachmentInput): number {
  return isMetricAttachment(type, entry) ? 1 : (calcNumber(entry.qty_per_pendant, 0) || 1);
}

function attachmentAssemblyCostPerPendant(type: 'cord' | 'carabiner', entry: PendantAttachmentInput, params: ProductionParams): number {
  const speed = calcNumber(entry.assembly_speed, 0);
  if (!(speed > 0) || !(params.fotPerHour > 0)) return 0;
  return round2((attachmentOpsPerPendant(type, entry) / speed) * params.wasteFactor * params.fotPerHour);
}

function attachmentIndirectPerPendant(type: 'cord' | 'carabiner', entry: PendantAttachmentInput, params: ProductionParams): number {
  const speed = calcNumber(entry.assembly_speed, 0);
  if (!(speed > 0) || params.indirectCostMode !== 'all' || !(params.indirectPerHour > 0)) return 0;
  return round2((attachmentOpsPerPendant(type, entry) / speed) * params.wasteFactor * params.indirectPerHour);
}

function attachmentAssemblyHoursForEntry(type: 'cord' | 'carabiner', entry: PendantAttachmentInput, allocatedQty: number, params: ProductionParams): number {
  const speed = calcNumber(entry.assembly_speed, 0);
  if (!(speed > 0) || !(allocatedQty > 0)) return 0;
  return (allocatedQty * attachmentOpsPerPendant(type, entry) / speed) * params.wasteFactor;
}

function emptyPendantCost(): PendantCostOutput {
  return {
    costPerUnit: 0,
    sellPerUnit: 0,
    totalCost: 0,
    totalRevenue: 0,
    assemblyHours: 0,
    packagingHours: 0,
    hoursPlastic: 0,
    hoursCutting: 0,
    hoursBuiltinHw: 0,
    hoursBuiltinAssembly: 0,
    hoursPlasticZone: 0,
    hoursAssemblyZone: 0,
    attachmentAssemblyHours: 0,
    letterAssemblyHours: 0,
  };
}

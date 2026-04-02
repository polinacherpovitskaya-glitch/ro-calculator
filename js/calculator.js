// =============================================
// Recycle Object — Calculator Engine
// Перенос всех формул из Google Sheets
// =============================================

/**
 * Рассчитать вспомогательные параметры производства
 * (аналог листа "Вспомогательная таблица")
 */
function getProductionParams(settings) {
    const s = key => settings[key] || 0;
    const totalHoursPerWorker = s('hours_per_worker'); // 8*21 = 168
    const totalHoursAll = s('workers_count') * totalHoursPerWorker;
    const workLoadHours = totalHoursAll * s('work_load_ratio');
    const plasticHours = workLoadHours * s('plastic_injection_ratio');
    const packagingHours = workLoadHours * s('packaging_ratio');
    // Режим распределения косвенных: 'production' (только литьё) или 'all' (все часы)
    const indirectCostMode = settings['indirect_cost_mode'] || 'production';
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
        charityRate: Number.isFinite(settings?.charity_rate) ? settings.charity_rate : 0.01,
        marginTarget: s('margin_target'),
        deliveryCostMoscow: s('delivery_cost_moscow'),
        printingDeliveryCost: s('printing_delivery_cost'),
        wasteFactor: s('waste_factor') || 1.1,
    };
}

/**
 * Рассчитать себестоимость одной позиции заказа
 * Теперь поддерживает:
 * - Множественные нанесения (item.printings[] — массив)
 * - Фурнитура и упаковка рассчитываются отдельно (через calculateHardwareCost / calculatePackagingCost)
 *
 * @param {Object} item - входные данные позиции
 * @param {Object} params - производственные параметры (из getProductionParams)
 * @returns {Object} - все компоненты себестоимости
 */
function calculateItemCost(item, params) {
    const p = params;
    const qty = item.quantity || 0;
    const pph = item.pieces_per_hour || 0;
    const weight = item.weight_grams || 0;

    if (qty === 0 || pph === 0) {
        return getEmptyCostResult();
    }

    // === Производство изделия ===

    // Время на производство всей партии (часы) — с запасом на брак
    const hoursPlastic = (1 / pph) * qty * p.wasteFactor;

    // ФОТ за единицу
    const costFot = hoursPlastic * p.fotPerHour / qty;

    // Косвенные расходы за единицу
    const costIndirect = p.indirectPerHour * hoursPlastic / qty;

    // Пластик за единицу (с запасом на брак)
    const costPlastic = p.plasticCostPerKg / 1000 * weight * p.wasteFactor;

    // Амортизация молда
    // Бланковая форма → делим на 4500 (макс. ресурс молда)
    // Кастомная форма → делим на тираж заказа
    const extraMolds = item.extra_molds || 0;
    const paidBaseMolds = (!item.is_blank_mold && item.base_mold_in_stock) ? 0 : 1;
    const totalPaidMolds = Math.max(0, paidBaseMolds + extraMolds);
    const MOLD_LIFETIME = 4500;
    const moldDivisor = item.is_blank_mold ? MOLD_LIFETIME : qty;
    const costMoldAmortization = p.moldBaseCost * totalPaidMolds / moldDivisor;

    // Проектирование формы (если сложная)
    const costDesign = item.complex_design ? p.designCost / qty : 0;

    // === Срезание лейника ===
    // Косвенные расходы закладываем: срезание занимает производственные часы
    const hoursCutting = p.cuttingSpeed > 0 ? qty / p.cuttingSpeed * p.wasteFactor : 0;
    const costCutting = hoursCutting * p.fotPerHour / qty;
    const costCuttingIndirect = hoursCutting > 0 ? p.indirectPerHour * hoursCutting / qty : 0;

    // === NFC ===
    const costNfcTag = item.is_nfc ? p.nfcTagCost : 0;

    let hoursNfc = 0;
    let costNfcProgramming = 0;
    let costNfcIndirect = 0;

    if (item.nfc_programming && p.nfcWriteSpeed > 0) {
        hoursNfc = qty / p.nfcWriteSpeed * p.wasteFactor;
        costNfcProgramming = p.fotPerHour / p.nfcWriteSpeed;
        costNfcIndirect = p.indirectPerHour * hoursNfc / qty;
    }

    // === Нанесение (теперь массив printings[]) ===
    let costPrinting = 0;
    const costPrintingDetails = []; // per-printing cost breakdown
    const printings = item.printings || [];
    if (printings.length > 0) {
        printings.forEach(pr => {
            const prQty = pr.qty || 0;
            const prPrice = pr.price || 0;
            if (prQty > 0 && prPrice > 0) {
                const prDelivery = pr.delivery_total || 0;
                const deliveryCost = prDelivery > 0 ? prDelivery / prQty : (p.printingDeliveryCost / prQty);
                const c = (prPrice * 1.06) + deliveryCost;
                costPrinting += c;
                costPrintingDetails.push(round2(c));
            } else {
                costPrintingDetails.push(0);
            }
        });
    } else {
        // Обратная совместимость со старыми данными
        const printQty = item.printing_qty || 0;
        const printPrice = item.printing_price_per_unit || 0;
        if (printQty > 0 && printPrice > 0) {
            costPrinting = (printPrice * 1.06) + (p.printingDeliveryCost / printQty);
        }
    }

    // === Встроенная фурнитура бланка (зеркало, магнит, кольцо и т.д.) ===
    let costBuiltinHw = 0;
    let costBuiltinHwIndirect = 0;
    let hoursBuiltinHw = 0;
    const hwName = item.builtin_hw_name || '';
    const hwPricePerUnit = item.builtin_hw_price || 0;
    const hwDeliveryTotal = item.builtin_hw_delivery_total || 0;
    const hwSpeed = item.builtin_hw_speed || 0;

    if (hwName && (hwPricePerUnit > 0 || hwSpeed > 0)) {
        // Закупка + доставка за шт
        costBuiltinHw = hwPricePerUnit + (hwDeliveryTotal > 0 && qty > 0 ? hwDeliveryTotal / qty : 0);
        // ФОТ сборки
        if (hwSpeed > 0 && qty > 0) {
            hoursBuiltinHw = qty / hwSpeed * p.wasteFactor;
            costBuiltinHw += hoursBuiltinHw * p.fotPerHour / qty;
            // На сборку встроенной фурнитуры также намазываем косвенные.
            if (p.indirectCostMode === 'all') {
                costBuiltinHwIndirect = p.indirectPerHour * hoursBuiltinHw / qty;
            }
        }
    }

    // === Доставка за наш счет ===
    const costDelivery = item.delivery_included ? p.deliveryCostMoscow / qty : 0;

    // === ИТОГО себестоимость изделия (за штуку) ===
    let costTotal = costFot + costIndirect + costPlastic + costMoldAmortization
        + costDesign + costCutting + costCuttingIndirect
        + costNfcTag + costNfcProgramming + costNfcIndirect
        + costPrinting + costDelivery + costBuiltinHw + costBuiltinHwIndirect;
    // Protect against NaN/Infinity from division by zero in params
    if (!isFinite(costTotal)) {
        console.warn('costTotal is NaN/Infinity, components:', {costFot, costIndirect, costPlastic, costMoldAmortization, costDesign, costCutting, costCuttingIndirect, costNfcTag, costPrinting, costDelivery});
        costTotal = 0;
    }

    return {
        // Себестоимость изделия (за шт)
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
        costPrintingDetails: costPrintingDetails,
        costDelivery: round2(costDelivery),
        costBuiltinHw: round2(costBuiltinHw),
        costBuiltinHwIndirect: round2(costBuiltinHwIndirect),
        costTotal: round2(costTotal),

        // Часы производства (на всю партию)
        hoursPlastic: round2(hoursPlastic),
        hoursCutting: round2(hoursCutting),
        hoursNfc: round2(hoursNfc),
        hoursBuiltinHw: round2(hoursBuiltinHw),

        // Часы по зонам загрузки:
        // 70% зона (литьё) — литьё + срезка + NFC + встроенная фурнитура
        hoursPlasticZone: round2(hoursPlastic + hoursCutting + hoursNfc + hoursBuiltinHw),
        // 30% зона (упаковка/обработка) — только внешняя фурнитура/упаковка
        hoursCuttingZone: 0,

        // Обратная совместимость — общие часы
        hoursTotalPlasticNfc: round2(hoursPlastic + hoursCutting + hoursNfc),
    };
}

/**
 * Рассчитать себестоимость одной позиции фурнитуры
 */
function calculateHardwareCost(hw, params) {
    const qty = hw.qty || 0;
    const speed = hw.assembly_speed || 0;
    let hoursHardware = 0;
    let fotPerUnit = 0;
    let indirectPerUnit = 0;

    if (qty > 0 && speed > 0) {
        hoursHardware = qty / speed * params.wasteFactor;
        fotPerUnit = hoursHardware * params.fotPerHour / qty;
        if (params.indirectCostMode === 'all') {
            indirectPerUnit = params.indirectPerHour * hoursHardware / qty;
        }
    }

    const costPerUnit = fotPerUnit + indirectPerUnit + (hw.price || 0) + (hw.delivery_price || 0);

    return {
        costPerUnit: round2(costPerUnit),
        fotPerUnit: round2(fotPerUnit),
        indirectPerUnit: round2(indirectPerUnit),
        hoursHardware: round2(hoursHardware),
        totalCost: round2(costPerUnit * qty),
    };
}

/**
 * Рассчитать себестоимость одной позиции упаковки
 */
function calculatePackagingCost(pkg, params) {
    const qty = pkg.qty || 0;
    const speed = pkg.assembly_speed || 0;
    let hoursPackaging = 0;
    let fotPerUnit = 0;
    let indirectPerUnit = 0;

    if (qty > 0 && speed > 0) {
        hoursPackaging = qty / speed * params.wasteFactor;
        fotPerUnit = hoursPackaging * params.fotPerHour / qty;
        if (params.indirectCostMode === 'all') {
            indirectPerUnit = params.indirectPerHour * hoursPackaging / qty;
        }
    }

    const costPerUnit = fotPerUnit + indirectPerUnit + (pkg.price || 0) + (pkg.delivery_price || 0);

    return {
        costPerUnit: round2(costPerUnit),
        fotPerUnit: round2(fotPerUnit),
        indirectPerUnit: round2(indirectPerUnit),
        hoursPackaging: round2(hoursPackaging),
        totalCost: round2(costPerUnit * qty),
    };
}

/**
 * Calculate cost for a letter pendant
 * @param {Object} pendant - pendant data (see spec)
 * @param {Object} params - production params from getProductionParams
 * @returns {Object} cost breakdown
 */
function stripPendantTechnicalCharParts(char) {
    return String(char || '').replace(/[\u200D\uFE00-\uFE0F\u{E0100}-\u{E01EF}\p{Mark}\u{1F3FB}-\u{1F3FF}]/gu, '');
}

function isCountablePendantChar(char) {
    const raw = String(char || '');
    if (!raw || !/\S/u.test(raw)) return false;
    return stripPendantTechnicalCharParts(raw).length > 0;
}

function getCountablePendantElements(pendant) {
    return (pendant?.elements || []).filter(el => isCountablePendantChar(el?.char));
}

function getPendantAttachmentEntries(pendant, type) {
    const collectionKey = type === 'cord' ? 'cords' : 'carabiners';
    const legacyKey = type === 'cord' ? 'cord' : 'carabiner';
    const fallbackLengthCm = type === 'cord' ? (parseFloat(pendant?.cord_length_cm) || 0) : 0;
    const totalQty = parseFloat(pendant?.quantity) || 0;

    let entries = Array.isArray(pendant?.[collectionKey]) ? pendant[collectionKey] : [];
    if ((!entries || entries.length === 0) && pendant?.[legacyKey]) {
        entries = [pendant[legacyKey]];
    }

    return (entries || [])
        .map((entry, index) => {
            const normalized = { ...(entry || {}) };
            const qtyPerPendant = parseFloat(normalized.qty_per_pendant);
            const lengthCm = parseFloat(normalized.length_cm);
            const allocatedQty = parseFloat(normalized.allocated_qty);
            const hasExplicitAllocatedQty = normalized.allocated_qty !== undefined && normalized.allocated_qty !== null && normalized.allocated_qty !== '';
            normalized.qty_per_pendant = qtyPerPendant > 0 ? qtyPerPendant : 1;
            normalized.length_cm = Number.isFinite(lengthCm) ? lengthCm : (type === 'cord' && index === 0 ? fallbackLengthCm : 0);
            normalized.unit = normalized.unit || 'шт';
            normalized.allocated_qty = Number.isFinite(allocatedQty) && allocatedQty >= 0
                ? allocatedQty
                : ((
                    normalized.name
                    || normalized.warehouse_item_id
                    || normalized.warehouse_sku
                    || (parseFloat(normalized.price_per_unit) || 0) > 0
                    || (parseFloat(normalized.delivery_price) || 0) > 0
                    || (parseFloat(normalized.sell_price) || 0) > 0
                    || normalized.source === 'custom'
                ) && !hasExplicitAllocatedQty && totalQty > 0 ? totalQty : 0);
            return normalized;
        })
        .filter(entry => entry && (
            entry.name
            || entry.warehouse_item_id
            || entry.warehouse_sku
            || (parseFloat(entry.price_per_unit) || 0) > 0
            || (parseFloat(entry.delivery_price) || 0) > 0
            || (parseFloat(entry.sell_price) || 0) > 0
            || entry.source === 'custom'
        ));
}

function isPendantMetricAttachment(type, entry) {
    return type === 'cord' && (entry?.unit === 'м' || entry?.unit === 'см');
}

function getPendantMetricRateFactor(entry) {
    const lengthCm = parseFloat(entry?.length_cm) || 0;
    if (!(lengthCm > 0)) return 0;
    return entry?.unit === 'см' ? lengthCm : (lengthCm / 100);
}

function getPendantAttachmentAllocatedQty(pendant, entry) {
    const totalQty = parseFloat(pendant?.quantity) || 0;
    if (!entry) return 0;
    const allocatedQty = parseFloat(entry.allocated_qty);
    if (Number.isFinite(allocatedQty) && allocatedQty >= 0) return allocatedQty;
    return totalQty > 0 ? totalQty : 0;
}

function getPendantAttachmentRequiredQty(pendant, type, entry) {
    const allocatedQty = getPendantAttachmentAllocatedQty(pendant, entry);
    if (!(allocatedQty > 0) || !entry) return 0;
    if (isPendantMetricAttachment(type, entry)) {
        return round2(allocatedQty * getPendantMetricRateFactor(entry));
    }
    const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
    return round2(allocatedQty * qtyPerPendant);
}

function getPendantAttachmentTotalCost(pendant, type, entry) {
    const allocatedQty = getPendantAttachmentAllocatedQty(pendant, entry);
    if (!(allocatedQty > 0)) return 0;
    return round2(allocatedQty * getPendantAttachmentCostPerUnit(type, entry));
}

function getPendantAttachmentTotalSell(pendant, type, entry) {
    const allocatedQty = getPendantAttachmentAllocatedQty(pendant, entry);
    if (!(allocatedQty > 0)) return 0;
    return round2(allocatedQty * (
        type === 'cord' || type === 'carabiner'
            ? (
                isPendantMetricAttachment(type, entry)
                    ? round2((entry?.sell_price || 0) * getPendantMetricRateFactor(entry))
                    : round2((entry?.sell_price || 0) * (parseFloat(entry?.qty_per_pendant) || 1))
            )
            : 0
    ));
}

function findNfcWarehouseItem(warehouseItems) {
    const items = Array.isArray(warehouseItems) ? warehouseItems : [];
    return items.find(item => {
        const sku = String(item?.sku || '').trim().toUpperCase();
        const name = String(item?.name || '').trim().toLowerCase();
        return sku === 'NFC' || name === 'nfc';
    }) || null;
}

function getProductWarehouseDemandRows(item, warehouseItems) {
    const itemType = String(item?.item_type || 'product').toLowerCase();
    const qty = parseFloat(item?.quantity) || 0;
    if (itemType !== 'product' || !item?.is_nfc || !(qty > 0)) return [];

    const resolvedItem = Number(item?.nfc_warehouse_item_id || 0)
        ? { id: Number(item?.nfc_warehouse_item_id || 0), name: 'NFC', sku: 'NFC', unit: 'шт' }
        : findNfcWarehouseItem(warehouseItems);
    const warehouseItemId = Number(resolvedItem?.id || 0);
    if (!warehouseItemId) return [];

    const productName = String(item?.product_name || '').trim();
    return [{
        warehouse_item_id: warehouseItemId,
        qty,
        material_type: 'hardware',
        attachment_type: 'nfc',
        name: productName ? `${productName} · NFC` : 'NFC',
        warehouse_sku: String(resolvedItem?.sku || 'NFC').trim(),
        unit: String(resolvedItem?.unit || 'шт').trim() || 'шт',
    }];
}

function getPendantWarehouseDemandRows(pendant) {
    const qty = parseFloat(pendant?.quantity) || 0;
    if (!(qty > 0)) return [];

    const parentName = String(pendant?.name || '').trim();
    const parentLabel = parentName ? `Подвес "${parentName}"` : 'Подвес';
    const rows = [];

    ['cord', 'carabiner'].forEach(type => {
        getPendantAttachmentEntries(pendant, type).forEach((entry, index) => {
            const source = String(entry?.source || 'warehouse').trim().toLowerCase();
            const warehouseItemId = Number(entry?.warehouse_item_id || 0);
            const demandQty = getPendantAttachmentRequiredQty(pendant, type, entry);
            if (source !== 'warehouse' || !warehouseItemId || !(demandQty > 0)) return;

            const attachmentName = String(entry?.name || (type === 'cord' ? 'Шнур' : 'Фурнитура')).trim();
            rows.push({
                warehouse_item_id: warehouseItemId,
                qty: demandQty,
                material_type: 'hardware',
                attachment_type: type,
                attachment_index: index,
                name: `${parentLabel} · ${attachmentName}`,
                warehouse_sku: entry?.warehouse_sku || '',
                unit: entry?.unit || 'шт',
            });
        });
    });

    return rows;
}

function getPendantAttachmentPurchasePerUnit(type, entry) {
    if (!entry) return 0;
    if (isPendantMetricAttachment(type, entry)) {
        return round2((entry.price_per_unit || 0) * getPendantMetricRateFactor(entry));
    }
    const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
    return round2((entry.price_per_unit || 0) * qtyPerPendant);
}

function getPendantAttachmentDeliveryPerUnit(type, entry) {
    if (!entry) return 0;
    if (isPendantMetricAttachment(type, entry)) {
        return round2(entry.delivery_price || 0);
    }
    const qtyPerPendant = parseFloat(entry.qty_per_pendant) || 1;
    return round2((entry.delivery_price || 0) * qtyPerPendant);
}

function getPendantAttachmentCostPerUnit(type, entry) {
    return round2(
        getPendantAttachmentPurchasePerUnit(type, entry)
        + getPendantAttachmentDeliveryPerUnit(type, entry)
    );
}

function calculatePendantCost(pendant, params) {
    const qty = pendant.quantity || 0;
    if (qty === 0) return { costPerUnit: 0, sellPerUnit: 0, totalCost: 0, totalRevenue: 0, assemblyHours: 0, packagingHours: 0 };

    const elements = getCountablePendantElements(pendant);

    // Element cost (production/purchase cost per element)
    const elemCostPerUnit = pendant.element_price_per_unit || 0;
    const elemCostTotal = qty * elements.length * elemCostPerUnit;

    const cords = getPendantAttachmentEntries(pendant, 'cord');
    const carabiners = getPendantAttachmentEntries(pendant, 'carabiner');
    const cordCostTotal = cords.reduce((sum, entry) => sum + getPendantAttachmentTotalCost(pendant, 'cord', entry), 0);
    const carabinerCostTotal = carabiners.reduce((sum, entry) => sum + getPendantAttachmentTotalCost(pendant, 'carabiner', entry), 0);

    let printCostTotal = 0;
    elements.forEach(el => {
        if (el.has_print && el.print_price) printCostTotal += qty * el.print_price;
    });

    const totalCost = round2(elemCostTotal + cordCostTotal + carabinerCostTotal + printCostTotal);
    const costPerUnit = qty > 0 ? round2(totalCost / qty) : 0;

    // Sell price: use pre-calculated total from Step 5 UI
    let sellPerUnit;
    if (pendant._totalSellPerUnit > 0) {
        sellPerUnit = pendant._totalSellPerUnit;
    } else {
        // Fallback: margin-based pricing on cost
        sellPerUnit = calculateTargetPrice(costPerUnit, params, qty);
    }

    // Assembly hours
    const attachmentAssemblyHours = [...cords.map(entry => ({ entry, type: 'cord' })), ...carabiners.map(entry => ({ entry, type: 'carabiner' }))]
        .reduce((sum, item) => {
            const speed = parseFloat(item.entry?.assembly_speed) || 0;
            if (!(speed > 0)) return sum;
            const allocatedQty = getPendantAttachmentAllocatedQty(pendant, item.entry);
            if (!(allocatedQty > 0)) return sum;
            const opsPerPendant = isPendantMetricAttachment(item.type, item.entry)
                ? 1
                : (parseFloat(item.entry?.qty_per_pendant) || 1);
            return sum + ((allocatedQty * opsPerPendant / speed) * (params.wasteFactor || 1.1));
        }, 0);
    const assemblyHours = round2(attachmentAssemblyHours);
    const packagingHours = 0;

    return {
        costPerUnit,
        sellPerUnit: round2(sellPerUnit),
        totalCost: totalCost,
        totalRevenue: round2(sellPerUnit * qty),
        assemblyHours,
        packagingHours,
        margin: calculateActualMargin(sellPerUnit, costPerUnit),
    };
}

/**
 * Маржа по тиражу (совпадает с BLANKS_TIER_MARGINS в molds.js)
 * Множитель = 1.00 (маржа уже включает всё), округление до 5₽
 */
const CALC_TIER_MARGINS = [
    { min: 0, max: 75, margin: 0.75, mult: 1.00 },       // 50 шт  → 75%
    { min: 75, max: 200, margin: 0.70, mult: 1.00 },      // 100 шт → 70%
    { min: 200, max: 400, margin: 0.60, mult: 1.00 },     // 300 шт → 60%
    { min: 400, max: 750, margin: 0.50, mult: 1.00 },     // 500 шт → 50%
    { min: 750, max: 2500, margin: 0.45, mult: 1.00 },    // 1K шт  → 45%
    { min: 2500, max: Infinity, margin: 0.40, mult: 1.00 },// 3K шт  → 40%
];

function getMarginForQty(qty) {
    const tier = CALC_TIER_MARGINS.find(t => qty >= t.min && qty < t.max);
    return tier ? tier.margin : 0.40;
}

function getMultiplierForQty(qty) {
    const tier = CALC_TIER_MARGINS.find(t => qty >= t.min && qty < t.max);
    return tier ? tier.mult : 1.00;
}

/**
 * Рассчитать таргет-цену для фурнитуры/упаковки/кастома
 * Формула:
 * цена без НДС = себестоимость / (1 - ОСН - благотворительность - коммерч. - целевая чистая маржа)
 * НДС добавляется отдельно сверху в КП/счёте и в эту цену не входит.
 */
function calculateTargetPrice(cost, params, qty) {
    if (cost === 0) return 0;
    const margin = qty ? getMarginForQty(qty) : (params.marginTarget || 0.55);
    const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.06;
    const charityRate = Number.isFinite(params?.charityRate) ? params.charityRate : 0.01;
    const commercialRate = 0.065;
    const keepRate = 1 - taxRate - charityRate - commercialRate - margin;
    if (keepRate <= 0) return 0;
    return round2(cost / keepRate);
}

/**
 * Рассчитать таргет-цену для маркетплейса
 */
function calculateMpTargetPrice(cost, params) {
    if (cost === 0) return 0;
    return round2((cost * (1 + params.marginTarget))
        / (1 - (params.mp_commission || 0.05) - (params.mp_logistics || 0.06)
            - (params.mp_storage_ratio || 0.32) - (0.68 * (params.mp_acquiring || 0.065))));
}

/**
 * Рассчитать фактическую маржу
 */
function calculateActualMargin(sellPrice, costPerUnit) {
    // Explicit free sale: revenue is zero, full unit cost goes to loss.
    if (sellPrice <= 0) {
        return {
            earned: round2(-(costPerUnit || 0)),
            percent: null,
        };
    }
    const taxRate = Number.isFinite(App?.params?.taxRate) ? App.params.taxRate : 0.06;
    const charityRate = Number.isFinite(App?.params?.charityRate) ? App.params.charityRate : 0.01;
    const commercialRate = 0.065;
    const netBeforeCost = sellPrice * (1 - taxRate - charityRate - commercialRate);
    const earned = netBeforeCost - (costPerUnit || 0);
    return {
        earned: round2(earned),
        percent: round2(earned * 100 / sellPrice),
    };
}

function normalizeOrderDiscount(mode, value) {
    const normalizedMode = ['amount', 'percent'].includes(String(mode || '').trim()) ? String(mode).trim() : 'none';
    const numericValue = Number.isFinite(Number(value)) ? Number(value) : 0;
    return {
        mode: normalizedMode,
        value: numericValue > 0 ? round2(numericValue) : 0,
    };
}

function calculateOrderDiscount(baseRevenue, discount = {}, params = {}) {
    const safeBase = Math.max(0, Number(baseRevenue) || 0);
    const normalized = normalizeOrderDiscount(discount?.mode, discount?.value);
    let discountAmount = 0;
    let discountPercent = 0;

    if (normalized.mode === 'amount') {
        discountAmount = Math.min(safeBase, normalized.value);
        discountPercent = safeBase > 0 ? round2((discountAmount * 100) / safeBase) : 0;
    } else if (normalized.mode === 'percent') {
        discountPercent = Math.min(100, normalized.value);
        discountAmount = round2((safeBase * discountPercent) / 100);
    }

    const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.06;
    const charityRate = Number.isFinite(params?.charityRate) ? params.charityRate : 0.01;
    const commercialRate = 0.065;
    const keepRate = Math.max(0, 1 - taxRate - charityRate - commercialRate);

    return {
        mode: normalized.mode,
        inputValue: normalized.value,
        amount: round2(discountAmount),
        percent: round2(discountPercent),
        revenueAfterDiscount: round2(Math.max(0, safeBase - discountAmount)),
        earnedImpact: round2(discountAmount * keepRate),
    };
}

/**
 * Рассчитать загрузку производства
 * Обновлено: фурнитура и упаковка теперь отдельные массивы
 */
function calculateProductionLoad(items, hardwareItems, packagingItems, params, pendantItems = []) {
    let hoursPlasticTotal = 0;
    let hoursPackagingTotal = 0;
    let hoursHardwareTotal = 0;

    items.forEach(item => {
        if (item.result) {
            // 70% зона — литьё + срезка лейника + NFC + встроенная фурнитура
            hoursPlasticTotal += item.result.hoursPlasticZone || 0;
            // (hoursCuttingZone теперь всегда 0 — срезка в зоне литья)
        }
    });

    (hardwareItems || []).forEach(hw => {
        if (hw.result) {
            hoursHardwareTotal += hw.result.hoursHardware || 0;
        }
    });

    (packagingItems || []).forEach(pkg => {
        if (pkg.result) {
            hoursPackagingTotal += pkg.result.hoursPackaging || 0;
        }
    });

    (pendantItems || []).forEach(pnd => {
        if (pnd.result) {
            hoursHardwareTotal += pnd.result.assemblyHours || 0;
            hoursPackagingTotal += pnd.result.packagingHours || 0;
        }
    });

    const totalHours = hoursPlasticTotal + hoursPackagingTotal + hoursHardwareTotal;

    const plasticLoadPercent = params.plasticHours > 0
        ? round2(hoursPlasticTotal * 100 / params.plasticHours) : 0;
    const packagingLoadPercent = params.packagingHours > 0
        ? round2((hoursPackagingTotal + hoursHardwareTotal) * 100 / params.packagingHours) : 0;

    const days1worker = round2(totalHours / 8);
    const days2workers = round2(days1worker / 2);
    const days3workers = round2(days1worker / 3);

    return {
        hoursPlasticTotal: round2(hoursPlasticTotal),
        hoursPackagingTotal: round2(hoursPackagingTotal),
        hoursHardwareTotal: round2(hoursHardwareTotal),
        totalHours: round2(totalHours),
        plasticLoadPercent,
        packagingLoadPercent,
        days1worker,
        days2workers,
        days3workers,
    };
}

/**
 * Рассчитать данные для финансового директора
 * Обновлено: фурнитура и упаковка — отдельные массивы
 */
function calculateFinDirectorData(items, hardwareItems, packagingItems, params, pendantItems = [], orderAdjustments = {}) {
    let totalSalary = 0;
    let totalHardwarePurchase = 0;
    let totalHardwareDelivery = 0;
    let totalPackagingPurchase = 0;
    let totalPackagingDelivery = 0;
    let totalDesign = 0;
    let totalPrinting = 0;
    let totalPlastic = 0;
    let totalMolds = 0;
    let totalDelivery = 0;
    let totalRevenue = 0;

    items.forEach(item => {
        if (!item.result || !item.quantity) return;
        const r = item.result;
        const qty = item.quantity;

        // Зарплата = все часы * ФОТ/час
        totalSalary += r.hoursTotalPlasticNfc * params.fotPerHour;

        // NFC метки
        if (item.is_nfc) totalHardwarePurchase += qty * params.nfcTagCost;

        // Проектирование
        if (item.complex_design) totalDesign += params.designCost;

        // Печать (из массива printings)
        const printings = item.printings || [];
        printings.forEach(pr => {
            totalPrinting += (pr.qty || 0) * (pr.price || 0);
        });
        // Обратная совместимость
        if (printings.length === 0) {
            totalPrinting += (item.printing_qty || 0) * (item.printing_price_per_unit || 0);
        }

        // Пластик
        totalPlastic += r.costPlastic * qty;

        // Молды
        const paidBaseMolds = (!item.is_blank_mold && item.base_mold_in_stock) ? 0 : 1;
        const totalPaidMolds = Math.max(0, paidBaseMolds + (item.extra_molds || 0));
        totalMolds += params.moldBaseCost * totalPaidMolds;

        // Доставка
        if (item.delivery_included) totalDelivery += params.deliveryCostMoscow;

        // Выручка изделий (item + printing)
        totalRevenue += ((item.sell_price_item || 0) + (item.sell_price_printing || 0)) * qty;
    });

    // Фурнитура
    (hardwareItems || []).forEach(hw => {
        const qty = hw.qty || 0;
        totalHardwarePurchase += qty * (hw.price || 0);
        totalHardwareDelivery += qty * (hw.delivery_price || 0);
        totalRevenue += (hw.sell_price || 0) * qty;
        if (hw.result) {
            totalSalary += hw.result.hoursHardware * params.fotPerHour;
        }
    });

    // Упаковка
    (packagingItems || []).forEach(pkg => {
        const qty = pkg.qty || 0;
        totalPackagingPurchase += qty * (pkg.price || 0);
        totalPackagingDelivery += qty * (pkg.delivery_price || 0);
        totalRevenue += (pkg.sell_price || 0) * qty;
        if (pkg.result) {
            totalSalary += pkg.result.hoursPackaging * params.fotPerHour;
        }
    });

    // Pendants
    (pendantItems || []).forEach(pnd => {
        if (!pnd.result) return;
        const qty = pnd.quantity || 0;
        const r = pnd.result;
        const cords = getPendantAttachmentEntries(pnd, 'cord');
        const carabiners = getPendantAttachmentEntries(pnd, 'carabiner');
        // Assembly salary
        totalSalary += (r.assemblyHours + r.packagingHours) * params.fotPerHour;
        // Cord + carabiner → hardware purchases
        const elements = getCountablePendantElements(pnd);
        totalHardwarePurchase += cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentPurchasePerUnit('cord', entry)), 0);
        totalHardwarePurchase += carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentPurchasePerUnit('carabiner', entry)), 0);
        totalHardwareDelivery += cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentDeliveryPerUnit('cord', entry)), 0);
        totalHardwareDelivery += carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentDeliveryPerUnit('carabiner', entry)), 0);
        // Elements → hardware purchase
        totalHardwarePurchase += qty * elements.length * (pnd.element_price_per_unit || 0);
        // Printing
        elements.forEach(el => {
            if (el.has_print && el.print_price) totalPrinting += qty * el.print_price;
        });
        // Packaging
        if (pnd.packaging) {
            totalPackagingPurchase += qty * (pnd.packaging.price_per_unit || 0);
            totalPackagingDelivery += qty * (pnd.packaging.delivery_price || 0);
        }
        // Revenue
        totalRevenue += r.totalRevenue;
    });

    const discount = calculateOrderDiscount(totalRevenue, orderAdjustments, params);
    const discountedRevenue = discount.revenueAfterDiscount;
    const charityRate = Number.isFinite(params?.charityRate) ? params.charityRate : 0.01;
    const totalTaxes = discountedRevenue * (params.taxRate + params.vatRate + charityRate);

    return {
        salary: round2(totalSalary),
        hardwarePurchase: round2(totalHardwarePurchase),
        hardwareDelivery: round2(totalHardwareDelivery),
        packagingPurchase: round2(totalPackagingPurchase),
        packagingDelivery: round2(totalPackagingDelivery),
        design: round2(totalDesign),
        printing: round2(totalPrinting),
        plastic: round2(totalPlastic),
        molds: round2(totalMolds),
        delivery: round2(totalDelivery),
        taxes: round2(totalTaxes),
        grossRevenue: round2(totalRevenue),
        discountAmount: discount.amount,
        discountPercent: discount.percent,
        revenue: round2(discountedRevenue),
        totalCosts: round2(totalSalary + totalHardwarePurchase + totalHardwareDelivery
            + totalPackagingPurchase + totalPackagingDelivery
            + totalDesign + totalPrinting + totalPlastic + totalMolds + totalDelivery + totalTaxes),
    };
}

/**
 * Рассчитать итоговую смету заказа
 * Обновлено: фурнитура и упаковка — отдельные массивы
 */
function calculateOrderSummary(items, hardwareItems, packagingItems, extraCosts, params = {}, pendantItems = [], orderAdjustments = {}) {
    let totalRevenue = 0;
    let totalEarned = 0;

    items.forEach(item => {
        if (!item.result) return;
        const qty = item.quantity || 0;

        // Item revenue (without printing)
        totalRevenue += (item.sell_price_item || 0) * qty;
        // Printing revenue (separate)
        totalRevenue += (item.sell_price_printing || 0) * qty;

        // Total sell = item + printing, total cost = costTotal (includes printing cost)
        const totalSellPerUnit = (item.sell_price_item || 0) + (item.sell_price_printing || 0);
        const marginItem = calculateActualMargin(totalSellPerUnit, item.result.costTotal);
        totalEarned += marginItem.earned * qty;
    });

    (hardwareItems || []).forEach(hw => {
        const qty = hw.qty || 0;
        if (!hw.result) return;
        totalRevenue += (hw.sell_price || 0) * qty;
        const m = calculateActualMargin(hw.sell_price || 0, hw.result.costPerUnit);
        totalEarned += m.earned * qty;
    });

    (packagingItems || []).forEach(pkg => {
        const qty = pkg.qty || 0;
        if (!pkg.result) return;
        totalRevenue += (pkg.sell_price || 0) * qty;
        const m = calculateActualMargin(pkg.sell_price || 0, pkg.result.costPerUnit);
        totalEarned += m.earned * qty;
    });

    // Pendants
    (pendantItems || []).forEach(pnd => {
        if (!pnd.result) return;
        const qty = pnd.quantity || 0;
        totalRevenue += pnd.result.totalRevenue;
        const m = calculateActualMargin(pnd.result.sellPerUnit, pnd.result.costPerUnit);
        totalEarned += m.earned * qty;
    });

    // Extra income — full amount goes to revenue, and net (after taxes/commission) goes to earned.
    const taxRate = Number.isFinite(params.taxRate) ? params.taxRate : 0.06;
    const charityRate = Number.isFinite(params.charityRate) ? params.charityRate : 0.01;
    const commercialRate = 0.065;
    (extraCosts || []).forEach(ec => {
        const amt = ec.amount || 0;
        if (amt > 0) {
            totalRevenue += amt;
            totalEarned += amt * (1 - taxRate - charityRate - commercialRate);
        }
    });

    const discount = calculateOrderDiscount(totalRevenue, orderAdjustments, params);
    const finalRevenue = discount.revenueAfterDiscount;
    const finalEarned = round2(totalEarned - discount.earnedImpact);
    const vatRate = Number.isFinite(params.vatRate) ? params.vatRate : 0.05;
    const vatOnRevenue = finalRevenue * vatRate;
    const totalWithVat = finalRevenue + vatOnRevenue;
    const marginPercent = finalRevenue > 0 ? round2(finalEarned * 100 / finalRevenue) : 0;

    return {
        grossRevenue: round2(totalRevenue),
        discountAmount: discount.amount,
        discountPercent: discount.percent,
        totalRevenue: round2(finalRevenue),
        vatOnRevenue: round2(vatOnRevenue),
        totalWithVat: round2(totalWithVat),
        totalEarned: round2(finalEarned),
        marginPercent,
    };
}

// === Утилиты ===

function round2(n) {
    return Math.round(n * 100) / 100;
}

function getEmptyCostResult() {
    return {
        costFot: 0, costIndirect: 0, costPlastic: 0, costMoldAmortization: 0,
        costDesign: 0, costCutting: 0, costCuttingIndirect: 0,
        costNfcTag: 0, costNfcProgramming: 0, costNfcIndirect: 0,
        costBuiltinHw: 0, costBuiltinHwIndirect: 0,
        costPrinting: 0, costDelivery: 0, costTotal: 0,
        hoursPlastic: 0, hoursCutting: 0, hoursNfc: 0, hoursBuiltinHw: 0,
        hoursPlasticZone: 0, hoursCuttingZone: 0,
        hoursTotalPlasticNfc: 0,
    };
}

function formatRub(n) {
    if (n === 0 || n === null || n === undefined) return '0 ₽';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' ₽';
}

function formatPercent(n) {
    if (n === 0 || n === null || n === undefined) return '0%';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n) + '%';
}

function formatHours(n) {
    if (n === 0 || n === null || n === undefined) return '0 ч';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n) + ' ч';
}

function padIsoDatePart(value) {
    return String(value).padStart(2, '0');
}

function formatIsoDateLocal(date) {
    if (!(date instanceof Date)) date = new Date(date);
    return `${date.getFullYear()}-${padIsoDatePart(date.getMonth() + 1)}-${padIsoDatePart(date.getDate())}`;
}

function parseProductionHolidaySet(settings) {
    const raw = String((settings && settings.production_holidays) || '').trim();
    if (!raw) return new Set();
    return new Set(
        raw
            .split(/[\s,;]+/)
            .map(value => value.trim())
            .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    );
}

function isProductionNonWorkingDate(date, holidaySet) {
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) return true;
    return holidaySet.has(formatIsoDateLocal(date));
}

function getProductionPlanningCapacity(settings) {
    const pricingWorkers = Number(settings && settings.workers_count);
    const explicitPlanningWorkers = Number(settings && settings.planning_workers_count);
    const explicitPlanningHoursPerDay = Number(settings && settings.planning_hours_per_day);
    const workersCount = explicitPlanningWorkers > 0
        ? explicitPlanningWorkers
        : (pricingWorkers > 0 ? Math.min(pricingWorkers, 2) : 2);
    const hoursPerDay = explicitPlanningHoursPerDay > 0 ? explicitPlanningHoursPerDay : 8;
    return {
        workersCount: round2(workersCount),
        hoursPerDay: round2(hoursPerDay),
        dailyCapacity: round2(workersCount * hoursPerDay),
    };
}

function buildProductionWorkerSlots(settings) {
    const { workersCount, hoursPerDay, dailyCapacity } = getProductionPlanningCapacity(settings);
    const slots = [];
    let remainingCapacity = round2(dailyCapacity);
    while (remainingCapacity > 0.001) {
        const slotHours = round2(Math.min(hoursPerDay, remainingCapacity));
        if (slotHours <= 0) break;
        slots.push(slotHours);
        remainingCapacity = round2(remainingCapacity - slotHours);
    }
    return {
        workersCount,
        hoursPerDay,
        dailyCapacity,
        slotHours: slots,
    };
}

/**
 * Build production schedule — day-by-day resource allocation
 * Each order has 3 sequential phases: литьё → упаковка → сборка (hardware)
 * Workers share a daily capacity pool
 *
 * @param {Array} orders — orders with production_hours_plastic, production_hours_packaging, production_hours_hardware
 * @param {Object} settings — app settings (workers_count, hours_per_worker etc.)
 * @returns {{ queue: Array, dailyCapacity: number, days: Array }}
 */
function buildProductionSchedule(orders, settings) {
    const { workersCount, hoursPerDay, dailyCapacity, slotHours } = buildProductionWorkerSlots(settings);
    const holidaySet = parseProductionHolidaySet(settings);

    // Filter schedulable orders: only past-draft statuses (sample, production, delivery)
    const SCHEDULE_STATUSES = ['sample','production_casting','production_printing','production_hardware','production_packaging','delivery','in_production'];
    const schedulable = orders.filter(o => SCHEDULE_STATUSES.includes(o.status));

    // Priority: explicit queue order > production status > deadline_end ASC
    const statusPriority = { production_casting: 0, production_printing: 0, production_hardware: 0, production_packaging: 0, in_production: 0, delivery: 1, sample: 2 };
    schedulable.sort((a, b) => {
        const qa = Number.isFinite(Number(a.production_priority)) ? Number(a.production_priority) : 999999;
        const qb = Number.isFinite(Number(b.production_priority)) ? Number(b.production_priority) : 999999;
        if (qa !== qb) return qa - qb;
        const pa = statusPriority[a.status] ?? 3;
        const pb = statusPriority[b.status] ?? 3;
        if (pa !== pb) return pa - pb;
        const da = a.deadline_end || '9999-12-31';
        const db = b.deadline_end || '9999-12-31';
        return da.localeCompare(db);
    });

    // Build order queues with remaining hours per phase
    const queue = schedulable.map(o => {
        const plannedMolding = round2(o.production_hours_plastic || 0);
        const plannedAssembly = round2(o.production_hours_hardware || 0);
        const plannedPackaging = round2(o.production_hours_packaging || 0);
        const actualMolding = round2(o.actual_hours_molding || 0);
        const actualAssembly = round2(o.actual_hours_assembly || 0);
        const actualPackaging = round2(o.actual_hours_packaging || 0);
        const remainingMolding = round2(Math.max(plannedMolding - actualMolding, 0));
        const remainingAssembly = round2(Math.max(plannedAssembly - actualAssembly, 0));
        const remainingPackaging = round2(Math.max(plannedPackaging - actualPackaging, 0));
        const plannedTotalHours = round2(plannedMolding + plannedAssembly + plannedPackaging);
        const actualTotalHours = round2(actualMolding + actualAssembly + actualPackaging);
        const actualOtherHours = round2(o.actual_hours_other || 0);
        const remainingTotalHours = round2(remainingMolding + remainingAssembly + remainingPackaging);

        return {
        orderId: o.id,
        orderName: o.order_name || 'Без названия',
        clientName: o.client_name || '',
        status: o.status,
        deadlineEnd: o.deadline_end || null,
        notBeforeDate: o.production_not_before || '',
        parallelWorkersTarget: Math.max(1, Math.round(Number(o.production_parallel_workers) || 1)),
        phases: [
            { name: 'molding', label: 'Литьё', remaining: remainingMolding, total: plannedMolding, actual: actualMolding, color: '#f59e0b' },
            { name: 'assembly', label: 'Сборка', remaining: remainingAssembly, total: plannedAssembly, actual: actualAssembly, color: '#06b6d4' },
            { name: 'packaging', label: 'Упаковка', remaining: remainingPackaging, total: plannedPackaging, actual: actualPackaging, color: '#8b5cf6' },
        ],
        currentPhaseIdx: 0,
        schedule: [], // [{ date, phase, hours }]
        totalHours: remainingTotalHours,
        plannedTotalHours,
        actualTotalHours,
        actualOtherHours,
        remainingTotalHours,
        done: false,
        };
    });

    // Skip phases with 0 hours at the start
    queue.forEach(q => {
        while (q.currentPhaseIdx < q.phases.length && q.phases[q.currentPhaseIdx].remaining <= 0) {
            q.currentPhaseIdx++;
        }
        if (q.currentPhaseIdx >= q.phases.length) q.done = true;
    });

    // Day-by-day allocation
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDays = 120; // 6 months max lookahead
    const days = []; // [{ date, allocations: [{ orderId, phase, hours }], totalUsed }]

    for (let d = 0; d < maxDays; d++) {
        const date = new Date(today);
        date.setDate(date.getDate() + d);

        if (isProductionNonWorkingDate(date, holidaySet)) continue;

        const dateStr = formatIsoDateLocal(date);
        const dayAllocations = [];
        const orderSlotsUsed = new Map();

        slotHours.forEach((slotCapacityOriginal, slotIndex) => {
            let slotCapacity = round2(slotCapacityOriginal);
            while (slotCapacity > 0.001) {
                const nextOrder = queue.find(q => {
                    if (q.done) return false;
                    if (q.notBeforeDate && dateStr < q.notBeforeDate) return false;
                    const phase = q.phases[q.currentPhaseIdx];
                    if (!phase || phase.remaining <= 0) return false;
                    const usedSlots = orderSlotsUsed.get(q.orderId) || new Set();
                    if (usedSlots.has(slotIndex)) return true;
                    const maxWorkersForOrder = Math.max(
                        1,
                        Math.min(
                            q.parallelWorkersTarget || 1,
                            slotHours.length || 1,
                            Math.max(1, Math.ceil(workersCount || 1))
                        )
                    );
                    return usedSlots.size < maxWorkersForOrder;
                });

                if (!nextOrder) break;

                const phase = nextOrder.phases[nextOrder.currentPhaseIdx];
                if (!phase || phase.remaining <= 0) {
                    nextOrder.currentPhaseIdx += 1;
                    continue;
                }

                if (!orderSlotsUsed.has(nextOrder.orderId)) {
                    orderSlotsUsed.set(nextOrder.orderId, new Set());
                }
                orderSlotsUsed.get(nextOrder.orderId).add(slotIndex);

                const give = round2(Math.min(slotCapacity, phase.remaining));
                if (give <= 0) break;

                phase.remaining = round2(phase.remaining - give);
                slotCapacity = round2(slotCapacity - give);

                nextOrder.schedule.push({
                    date: dateStr,
                    phase: phase.name,
                    hours: give,
                    workerSlot: slotIndex + 1,
                });
                dayAllocations.push({
                    orderId: nextOrder.orderId,
                    phase: phase.name,
                    hours: give,
                    workerSlot: slotIndex + 1,
                });

                if (phase.remaining <= 0.001) {
                    nextOrder.currentPhaseIdx++;
                    while (
                        nextOrder.currentPhaseIdx < nextOrder.phases.length
                        && nextOrder.phases[nextOrder.currentPhaseIdx].remaining <= 0
                    ) {
                        nextOrder.currentPhaseIdx++;
                    }
                    if (nextOrder.currentPhaseIdx >= nextOrder.phases.length) {
                        nextOrder.done = true;
                    }
                }
            }
        });

        days.push({
            date: dateStr,
            allocations: dayAllocations,
            totalUsed: round2(dayAllocations.reduce((sum, allocation) => sum + (allocation.hours || 0), 0)),
        });

        // Stop if all orders are done
        if (queue.every(q => q.done)) break;
    }

    return { queue, dailyCapacity, days };
}

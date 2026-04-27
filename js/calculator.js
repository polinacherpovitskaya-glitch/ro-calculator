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
    // Режим распределения косвенных: 'production' (только литьё) или 'all' (все производственные часы)
    const indirectCostMode = settings['indirect_cost_mode'] || 'all';
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

const DEFAULT_COMMERCIAL_RATE = 0.065;

function getRateValue(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function getVatRate(params) {
    return getRateValue(params?.vatRate, 0.05);
}

function getTaxRate(params) {
    return getRateValue(params?.taxRate, 0.07);
}

function getCharityRate(params) {
    return getRateValue(params?.charityRate, 0.01);
}

function getCommercialRate(params) {
    return getRateValue(params?.commercialRate, DEFAULT_COMMERCIAL_RATE);
}

function getRevenueGrossMultiplier(params) {
    return 1 + getVatRate(params);
}

function getCommercialGrossShare(params) {
    return getCommercialRate(params) * getRevenueGrossMultiplier(params);
}

function getCharityGrossShare(params) {
    return getCharityRate(params) * getRevenueGrossMultiplier(params);
}

function getNetRevenueRetentionRate(params) {
    return 1 - getTaxRate(params) - getCommercialGrossShare(params) - getCharityGrossShare(params);
}

function getKeepRateForTargetMargin(params, margin = 0) {
    return getNetRevenueRetentionRate(params) - (Number(margin) || 0);
}

function calcTaxesAmount(netRevenue, params) {
    return round2((Number(netRevenue) || 0) * getTaxRate(params));
}

function calcCommercialAmount(netRevenue, params) {
    return round2((Number(netRevenue) || 0) * getCommercialGrossShare(params));
}

function calcCharityAmount(netRevenue, params) {
    return round2((Number(netRevenue) || 0) * getCharityGrossShare(params));
}

function getActivePrintings(item) {
    const rawPrintings = Array.isArray(item?.printings) ? item.printings : [];
    return rawPrintings.filter(pr => {
        if (!pr || typeof pr !== 'object') return false;
        const name = String(pr.name || '').trim();
        const qty = Number(pr.qty) || 0;
        const price = Number(pr.price) || 0;
        const sellPrice = Number(pr.sell_price) || 0;
        const deliveryTotal = Number(pr.delivery_total) || 0;
        return !!name && (qty > 0 || price > 0 || sellPrice > 0 || deliveryTotal > 0);
    });
}

function hasLegacyPrintingFallback(item) {
    const rawPrintings = Array.isArray(item?.printings) ? item.printings : [];
    if (rawPrintings.length > 0) return false;
    const qty = Number(item?.printing_qty) || 0;
    const purchasePrice = Number(item?.printing_price_per_unit) || 0;
    const sellPrice = Number(item?.sell_price_printing) || 0;
    return qty > 0 && (purchasePrice > 0 || sellPrice > 0);
}

function getPrintingSellPricePerUnit(item) {
    const activePrintings = getActivePrintings(item);
    if (activePrintings.length > 0) {
        return activePrintings.reduce((sum, pr) => sum + (Number(pr.sell_price) || 0), 0);
    }
    return hasLegacyPrintingFallback(item) ? (Number(item?.sell_price_printing) || 0) : 0;
}

function normalizeColorAttachments(source) {
    let attachments = source;
    if (attachments && typeof attachments === 'object' && !Array.isArray(attachments) && Object.prototype.hasOwnProperty.call(attachments, 'color_solution_attachment')) {
        attachments = attachments.color_solution_attachment;
    }
    if (typeof attachments === 'string') {
        try {
            attachments = JSON.parse(attachments);
        } catch (e) {
            attachments = null;
        }
    }
    if (!attachments) return [];
    if (!Array.isArray(attachments)) attachments = [attachments];
    return attachments
        .filter(att => att && typeof att === 'object' && (att.data_url || att.name))
        .map(att => ({
            name: String(att.name || 'Файл'),
            type: String(att.type || ''),
            size: Number(att.size) || 0,
            data_url: String(att.data_url || ''),
        }));
}

function serializeColorAttachments(source) {
    const attachments = normalizeColorAttachments(source);
    if (!attachments.length) return null;
    return JSON.stringify(attachments.length === 1 ? attachments[0] : attachments);
}

function getBlankTemplateTotalMoldCost(source) {
    if (!source || typeof source !== 'object') return 0;
    const singleMoldCost = (Number(source?.cost_cny || 800) * Number(source?.cny_rate || 12.5)) + Number(source?.delivery_cost || 8000);
    const moldCount = Math.max(1, Number(source?.mold_count || 1) || 1);
    return round2(singleMoldCost * moldCount);
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
    const MOLD_LIFETIME = 4500;
    const extraMolds = item.extra_molds || 0;
    const paidBaseMolds = (!item.is_blank_mold && item.base_mold_in_stock) ? 0 : 1;
    const totalPaidMolds = Math.max(0, paidBaseMolds + extraMolds);
    const blankMoldTotalCost = Number(item.blank_mold_total_cost || 0);
    const costMoldAmortization = item.is_blank_mold
        ? ((blankMoldTotalCost > 0 ? blankMoldTotalCost : (p.moldBaseCost * totalPaidMolds)) / MOLD_LIFETIME)
        : (p.moldBaseCost * totalPaidMolds / qty);

    // Проектирование формы (если сложная)
    const costDesign = item.complex_design ? p.designCost / qty : 0;

    // === Срезание лейника ===
    // Косвенные расходы закладываем: срезание занимает производственные часы
    const hoursCutting = p.cuttingSpeed > 0 ? qty / p.cuttingSpeed * p.wasteFactor : 0;
    const costCutting = hoursCutting * p.fotPerHour / qty;
    const costCuttingIndirect = hoursCutting > 0 ? p.indirectPerHour * hoursCutting / qty : 0;

    // === NFC ===
    const hasExplicitNfcHardware = !!item.is_nfc
        && isNfcLikeEntry(item.builtin_hw_name)
        && (
            (Number(item.builtin_hw_price) || 0) > 0
            || (Number(item.builtin_hw_delivery_total) || 0) > 0
        );
    const costNfcTag = item.is_nfc ? (hasExplicitNfcHardware ? 0 : p.nfcTagCost) : 0;

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
    const printings = getActivePrintings(item);
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

    // === Встроенная сборка бланка (например, буквы нанизываются на шнур) ===
    let costBuiltinAssembly = 0;
    let costBuiltinAssemblyIndirect = 0;
    let hoursBuiltinAssembly = 0;
    const builtinAssemblyName = String(item.builtin_assembly_name || '').trim();
    const builtinAssemblySpeed = Number(item.builtin_assembly_speed || 0);

    if (builtinAssemblySpeed > 0 && qty > 0) {
        hoursBuiltinAssembly = qty / builtinAssemblySpeed * p.wasteFactor;
        costBuiltinAssembly = hoursBuiltinAssembly * p.fotPerHour / qty;
        if (p.indirectCostMode === 'all') {
            costBuiltinAssemblyIndirect = p.indirectPerHour * hoursBuiltinAssembly / qty;
        }
    }

    // === Доставка за наш счет ===
    const costDelivery = item.delivery_included ? p.deliveryCostMoscow / qty : 0;

    // === ИТОГО себестоимость изделия (за штуку) ===
    let costTotal = costFot + costIndirect + costPlastic + costMoldAmortization
        + costDesign + costCutting + costCuttingIndirect
        + costNfcTag + costNfcProgramming + costNfcIndirect
        + costPrinting + costDelivery
        + costBuiltinHw + costBuiltinHwIndirect
        + costBuiltinAssembly + costBuiltinAssemblyIndirect;
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
        costBuiltinAssembly: round2(costBuiltinAssembly),
        costBuiltinAssemblyIndirect: round2(costBuiltinAssemblyIndirect),
        costTotal: round2(costTotal),

        // Часы производства (на всю партию)
        hoursPlastic: round2(hoursPlastic),
        hoursCutting: round2(hoursCutting),
        hoursNfc: round2(hoursNfc),
        hoursBuiltinHw: round2(hoursBuiltinHw),
        hoursBuiltinAssembly: round2(hoursBuiltinAssembly),

        // Часы по зонам загрузки:
        // 70% зона (литьё) — только литьё + срезка + NFC
        hoursPlasticZone: round2(hoursPlastic + hoursCutting + hoursNfc),
        // 30% зона (сборка/упаковка) — встроенная сборка/фурнитура и внешняя фурнитура/упаковка
        hoursAssemblyZone: round2(hoursBuiltinHw + hoursBuiltinAssembly),
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

function isNfcLikeEntry(...values) {
    return values.some(value => {
        const normalized = String(value || '').trim().toLowerCase();
        if (!normalized) return false;
        if (normalized === 'nfc') return true;
        return /(^|[^a-zа-яё])nfc([^a-zа-яё]|$)/i.test(normalized)
            || normalized.includes('нфс')
            || normalized.includes('чип');
    });
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

function getPendantAttachmentAssemblyOpsPerPendant(type, entry) {
    return isPendantMetricAttachment(type, entry)
        ? 1
        : (parseFloat(entry?.qty_per_pendant) || 1);
}

function getPendantAttachmentAssemblyCostPerUnit(type, entry, params) {
    if (!entry || !(params?.fotPerHour > 0)) return 0;
    const speed = parseFloat(entry?.assembly_speed) || 0;
    if (!(speed > 0)) return 0;
    return round2((getPendantAttachmentAssemblyOpsPerPendant(type, entry) / speed) * (params?.wasteFactor || 1.1) * params.fotPerHour);
}

function getPendantAttachmentIndirectPerUnit(type, entry, params) {
    if (!entry || params?.indirectCostMode !== 'all' || !(params?.indirectPerHour > 0)) return 0;
    const speed = parseFloat(entry?.assembly_speed) || 0;
    if (!(speed > 0)) return 0;
    return round2((getPendantAttachmentAssemblyOpsPerPendant(type, entry) / speed) * (params?.wasteFactor || 1.1) * params.indirectPerHour);
}

function getPendantAttachmentCostPerUnit(type, entry, params) {
    return round2(
        getPendantAttachmentPurchasePerUnit(type, entry)
        + getPendantAttachmentDeliveryPerUnit(type, entry)
        + getPendantAttachmentAssemblyCostPerUnit(type, entry, params)
        + getPendantAttachmentIndirectPerUnit(type, entry, params)
    );
}

const PENDANT_LETTER_BLANK_IDS = [30, 31];
const PENDANT_LETTER_TIERS = [50, 100, 300, 500, 1000, 3000];

function getPendantPreferredLetterBlankIds(pendant) {
    const elements = getCountablePendantElements(pendant);
    const sample = elements
        .map(el => String(el?.char || ''))
        .join('');
    const hasCyrillic = /[А-Яа-яЁё]/.test(sample);
    return hasCyrillic ? [31, 30] : [30, 31];
}

function getPendantLetterBlankTierQty(totalElements) {
    if (!(totalElements > 0)) return null;
    let tierQty = PENDANT_LETTER_TIERS[PENDANT_LETTER_TIERS.length - 1];
    for (const tier of PENDANT_LETTER_TIERS) {
        if (totalElements <= tier) {
            tierQty = tier;
            break;
        }
    }
    return tierQty;
}

function getPendantLetterBlankSource(pendant) {
    const preferredIds = getPendantPreferredLetterBlankIds(pendant);
    if (typeof Molds !== 'undefined' && Array.isArray(Molds?.allMolds) && Molds.allMolds.length) {
        const mold = preferredIds
            .map(id => Molds.allMolds.find(item => Number(item?.id) === id))
            .find(Boolean)
            || Molds.allMolds.find(item => PENDANT_LETTER_BLANK_IDS.includes(Number(item?.id)));
        if (mold) return mold;
    }
    if (typeof App !== 'undefined' && Array.isArray(App?.templates) && App.templates.length) {
        const tpl = preferredIds
            .map(id => App.templates.find(item => Number(item?.id) === id))
            .find(Boolean)
            || App.templates.find(item => PENDANT_LETTER_BLANK_IDS.includes(Number(item?.id)));
        if (tpl) return tpl;
    }
    return null;
}

function getPendantLetterBlankMetrics(totalElements, params, pendant) {
    if (!(totalElements > 0)) return null;
    const tierQty = getPendantLetterBlankTierQty(totalElements);
    if (!(tierQty > 0)) return null;

    const source = getPendantLetterBlankSource(pendant);
    if (!source) return null;

    const pphMin = Number(source?.pph_min || source?.pieces_per_hour_min || 0);
    const pphMax = Number(source?.pph_max || source?.pieces_per_hour_max || 0);
    const pphAvg = (pphMin > 0 && pphMax > 0)
        ? Math.round((pphMin + pphMax) / 2)
        : 0;
    const pph = Number(
        source?.pph_actual
        || source?.pieces_per_hour_actual
        || source?.pieces_per_hour_avg
        || pphAvg
        || pphMin
        || source?.pieces_per_hour
        || 0
    );
    const weight = Number(source?.weight_grams || 0);
    if (!(pph > 0) || !(weight > 0) || !params) return null;

    const wasteFactor = Number.isFinite(params?.wasteFactor) ? params.wasteFactor : 1.1;
    const moldTotalCost = getBlankTemplateTotalMoldCost(source);
    const moldAmortPerUnit = moldTotalCost / 4500;

    const result = calculateItemCost({
        quantity: tierQty,
        pieces_per_hour: pph,
        weight_grams: weight,
        extra_molds: 0,
        complex_design: false,
        is_nfc: false,
        nfc_programming: false,
        delivery_included: false,
        is_blank_mold: true,
        base_mold_in_stock: false,
        blank_mold_total_cost: moldTotalCost,
        builtin_hw_name: source?.hw_name || '',
        builtin_hw_price: Number(source?.hw_price_per_unit || source?.hw_price || 0),
        builtin_hw_delivery_total: Number(source?.hw_delivery_total || 0),
        builtin_hw_speed: Number(source?.hw_speed || 0),
        builtin_assembly_name: source?.builtin_assembly_name || '',
        builtin_assembly_speed: Number(source?.builtin_assembly_speed || 0),
    }, params);

    const cost = round2((result?.costTotal || 0) - (result?.costMoldAmortization || 0) + moldAmortPerUnit);
    const builtinHwDeliveryPerUnit = tierQty > 0 ? round2(Number(source?.hw_delivery_total || 0) / tierQty) : 0;
    const builtinHwPurchasePerUnit = round2(Number(source?.hw_price_per_unit || source?.hw_price || 0));
    const builtinHwLaborPerUnit = tierQty > 0 ? round2(((result?.hoursBuiltinHw || 0) * (params?.fotPerHour || 0)) / tierQty) : 0;
    const builtinHwIndirectPerUnit = round2(Math.max(0, (result?.costBuiltinHw || 0) - builtinHwPurchasePerUnit - builtinHwDeliveryPerUnit - builtinHwLaborPerUnit));
    const builtinAssemblyLaborPerUnit = tierQty > 0 ? round2(((result?.hoursBuiltinAssembly || 0) * (params?.fotPerHour || 0)) / tierQty) : 0;
    const builtinAssemblyIndirectPerUnit = round2(result?.costBuiltinAssemblyIndirect || 0);
    const scaled = (value) => round2((Number(value) || 0) * totalElements);
    const hoursScale = tierQty > 0 ? (totalElements / tierQty) : 0;

    const breakdown = {
        salaryPerUnit: round2((result?.costFot || 0) + (result?.costCutting || 0) + (result?.costNfcProgramming || 0) + builtinHwLaborPerUnit + builtinAssemblyLaborPerUnit),
        hardwarePurchasePerUnit: 0,
        hardwareDeliveryPerUnit: 0,
        nfcTotalPerUnit: 0,
        plasticPerUnit: round2(result?.costPlastic || 0),
        moldsPerUnit: round2(moldAmortPerUnit),
        printingPerUnit: round2(result?.costPrinting || 0),
        omittedIndirectPerUnit: round2((result?.costIndirect || 0) + (result?.costCuttingIndirect || 0) + (result?.costNfcIndirect || 0) + builtinHwIndirectPerUnit + builtinAssemblyIndirectPerUnit),
    };
    if (isNfcLikeEntry(source?.hw_name)) {
        breakdown.nfcTotalPerUnit = round2(builtinHwPurchasePerUnit + builtinHwDeliveryPerUnit);
    } else {
        breakdown.hardwarePurchasePerUnit = builtinHwPurchasePerUnit;
        breakdown.hardwareDeliveryPerUnit = builtinHwDeliveryPerUnit;
    }
    breakdown.salaryTotal = scaled(breakdown.salaryPerUnit);
    breakdown.hardwarePurchaseTotal = scaled(breakdown.hardwarePurchasePerUnit);
    breakdown.hardwareDeliveryTotal = scaled(breakdown.hardwareDeliveryPerUnit);
    breakdown.nfcTotal = scaled(breakdown.nfcTotalPerUnit);
    breakdown.plasticTotal = scaled(breakdown.plasticPerUnit);
    breakdown.moldsTotal = scaled(breakdown.moldsPerUnit);
    breakdown.printingTotal = scaled(breakdown.printingPerUnit);
    breakdown.omittedIndirectTotal = scaled(breakdown.omittedIndirectPerUnit);

    const allowManualPrices = !!source?.use_manual_prices;
    const customPrice = allowManualPrices ? Number(source?.custom_prices?.[tierQty]) : NaN;
    let sellPrice = Number.isFinite(customPrice) && customPrice > 0 ? customPrice : 0;
    let targetMargin = 0;
    if (!(sellPrice > 0) && cost > 0) {
        const customMargin = allowManualPrices ? Number(source?.custom_margins?.[tierQty]) : NaN;
        if (Number.isFinite(customMargin)) {
            targetMargin = customMargin;
        } else if (typeof getBlankMargin === 'function') {
            targetMargin = getBlankMargin(tierQty);
        } else if (tierQty <= 10) {
            targetMargin = 0.65;
        } else if (tierQty <= 50) {
            targetMargin = 0.60;
        } else if (tierQty <= 100) {
            targetMargin = 0.55;
        } else if (tierQty <= 300) {
            targetMargin = 0.50;
        } else if (tierQty <= 500) {
            targetMargin = 0.45;
        } else if (tierQty <= 1000) {
            targetMargin = 0.40;
        } else {
            targetMargin = 0.35;
        }
        const keepRateForTarget = getKeepRateForTargetMargin(params, targetMargin);
        if (keepRateForTarget > 0 && targetMargin < 1) {
            const rawSellPrice = round2(cost / keepRateForTarget);
            sellPrice = typeof roundTo5 === 'function'
                ? roundTo5(rawSellPrice)
                : Math.round(rawSellPrice / 5) * 5;
        }
    }

    const keepNetRate = getNetRevenueRetentionRate(params);
    const margin = sellPrice > 0
        ? round2(((sellPrice * keepNetRate) - cost) / sellPrice)
        : targetMargin;

    return {
        tierQty,
        cost,
        sellPrice,
        margin,
        breakdown,
        hoursPlastic: round2((result?.hoursPlastic || 0) * hoursScale),
        hoursCutting: round2((result?.hoursCutting || 0) * hoursScale),
        hoursBuiltinHw: round2((result?.hoursBuiltinHw || 0) * hoursScale),
        hoursBuiltinAssembly: round2((result?.hoursBuiltinAssembly || 0) * hoursScale),
        hoursPlasticZone: round2((result?.hoursPlasticZone || 0) * hoursScale),
        hoursAssemblyZone: round2((result?.hoursAssemblyZone || 0) * hoursScale),
    };
}

function calculatePendantCost(pendant, params) {
    const qty = pendant.quantity || 0;
    if (qty === 0) {
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

    const elements = getCountablePendantElements(pendant);
    const totalElements = qty * elements.length;
    const letterMetrics = getPendantLetterBlankMetrics(totalElements, params, pendant);

    const elemCostPerUnit = getPendantElementCostPerUnit(pendant, params, letterMetrics);
    const elemCostTotal = qty * elements.length * elemCostPerUnit;

    const cords = getPendantAttachmentEntries(pendant, 'cord');
    const carabiners = getPendantAttachmentEntries(pendant, 'carabiner');
    const cordPurchaseTotal = cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentPurchasePerUnit('cord', entry)), 0);
    const cordDeliveryTotal = cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentDeliveryPerUnit('cord', entry)), 0);
    const cordAssemblyCostTotal = cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentAssemblyCostPerUnit('cord', entry, params)), 0);
    const cordIndirectTotal = cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentIndirectPerUnit('cord', entry, params)), 0);
    const carabinerPurchaseTotal = carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentPurchasePerUnit('carabiner', entry)), 0);
    const carabinerDeliveryTotal = carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentDeliveryPerUnit('carabiner', entry)), 0);
    const carabinerAssemblyCostTotal = carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentAssemblyCostPerUnit('carabiner', entry, params)), 0);
    const carabinerIndirectTotal = carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pendant, entry) * getPendantAttachmentIndirectPerUnit('carabiner', entry, params)), 0);
    const cordCostTotal = round2(cordPurchaseTotal + cordDeliveryTotal + cordAssemblyCostTotal + cordIndirectTotal);
    const carabinerCostTotal = round2(carabinerPurchaseTotal + carabinerDeliveryTotal + carabinerAssemblyCostTotal + carabinerIndirectTotal);

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
            const opsPerPendant = getPendantAttachmentAssemblyOpsPerPendant(item.type, item.entry);
            return sum + ((allocatedQty * opsPerPendant / speed) * (params.wasteFactor || 1.1));
        }, 0);
    const letterAssemblyHours = round2(letterMetrics?.hoursAssemblyZone || 0);
    const assemblyHours = round2(attachmentAssemblyHours + letterAssemblyHours);
    const packagingHours = 0;

    return {
        costPerUnit,
        sellPerUnit: round2(sellPerUnit),
        totalCost: totalCost,
        totalRevenue: round2(sellPerUnit * qty),
        assemblyHours,
        attachmentAssemblyHours: round2(attachmentAssemblyHours),
        letterAssemblyHours,
        packagingHours,
        attachmentPurchaseTotal: round2(cordPurchaseTotal + carabinerPurchaseTotal),
        attachmentDeliveryTotal: round2(cordDeliveryTotal + carabinerDeliveryTotal),
        attachmentAssemblyTotal: round2(cordAssemblyCostTotal + carabinerAssemblyCostTotal),
        attachmentIndirectTotal: round2(cordIndirectTotal + carabinerIndirectTotal),
        hoursPlastic: round2(letterMetrics?.hoursPlastic || 0),
        hoursCutting: round2(letterMetrics?.hoursCutting || 0),
        hoursBuiltinHw: round2(letterMetrics?.hoursBuiltinHw || 0),
        hoursBuiltinAssembly: round2(letterMetrics?.hoursBuiltinAssembly || 0),
        hoursPlasticZone: round2(letterMetrics?.hoursPlasticZone || 0),
        hoursAssemblyZone: round2(letterMetrics?.hoursAssemblyZone || 0),
        margin: calculateActualMargin(sellPerUnit, costPerUnit),
    };
}

function getPendantElementCostPerUnit(pendant, params, letterMetricsOverride) {
    const totalElements = (pendant?.quantity || 0) * getCountablePendantElements(pendant).length;
    const letterMetrics = letterMetricsOverride || getPendantLetterBlankMetrics(totalElements, params, pendant);
    const derivedElemCostPerUnit = Number.isFinite(letterMetrics?.cost) && letterMetrics.cost > 0
        ? round2(letterMetrics.cost)
        : 0;
    return derivedElemCostPerUnit > 0
        ? derivedElemCostPerUnit
        : (pendant?.element_price_per_unit || 0);
}

/**
 * Маржа по тиражу (совпадает с BLANKS_TIER_MARGINS в molds.js)
 * Множитель = 1.00 (маржа уже включает всё), округление до 5₽
 */
const CALC_TIER_MARGINS = [
    { max: 10, margin: 0.65, mult: 1.00 },
    { max: 50, margin: 0.60, mult: 1.00 },
    { max: 100, margin: 0.55, mult: 1.00 },
    { max: 300, margin: 0.50, mult: 1.00 },
    { max: 500, margin: 0.45, mult: 1.00 },
    { max: 1000, margin: 0.40, mult: 1.00 },
    { max: Infinity, margin: 0.35, mult: 1.00 },
];

function getMarginForQty(qty) {
    const normalizedQty = Number(qty) || 0;
    const tier = CALC_TIER_MARGINS.find(t => normalizedQty <= t.max);
    return tier ? tier.margin : 0.35;
}

function getMultiplierForQty(qty) {
    const normalizedQty = Number(qty) || 0;
    const tier = CALC_TIER_MARGINS.find(t => normalizedQty <= t.max);
    return tier ? tier.mult : 1.00;
}

/**
 * Рассчитать таргет-цену для фурнитуры/упаковки/кастома
 * Формула:
 * цена без НДС = себестоимость / (1 - налоги без НДС - коммерч. с НДС - благотворительность с НДС - целевая чистая маржа)
 * НДС добавляется отдельно сверху в КП/счёте и в эту цену не входит.
 */
function calculateTargetPrice(cost, params, qty) {
    if (cost === 0) return 0;
    const margin = qty ? getMarginForQty(qty) : (params.marginTarget || 0.55);
    const keepRate = getKeepRateForTargetMargin(params, margin);
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
    const netBeforeCost = sellPrice * getNetRevenueRetentionRate(App?.params || {});
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

    const keepRate = Math.max(0, getNetRevenueRetentionRate(params));

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
            // 70% зона — литьё + срезка лейника + NFC
            hoursPlasticTotal += item.result.hoursPlasticZone || 0;
            // 30% зона — встроенная сборка/фурнитура
            hoursHardwareTotal += item.result.hoursAssemblyZone || 0;
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
            hoursPlasticTotal += pnd.result.hoursPlasticZone || 0;
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
    const safeFotPerHour = Number.isFinite(params?.fotPerHour) ? params.fotPerHour : 0;
    const safeTaxRate = getTaxRate(params);
    const safeVatRate = getVatRate(params);
    const safeCharityRate = getCharityRate(params);
    const safeDesignCost = Number.isFinite(params?.designCost) ? params.designCost : 0;
    const safeMoldBaseCost = Number.isFinite(params?.moldBaseCost) ? params.moldBaseCost : 0;
    const safeDeliveryCostMoscow = Number.isFinite(params?.deliveryCostMoscow) ? params.deliveryCostMoscow : 0;
    let totalSalary = 0;
    let totalIndirect = 0;
    let totalHardwarePurchase = 0;
    let totalNfc = 0;
    let totalHardwareDelivery = 0;
    let totalPackagingPurchase = 0;
    let totalPackagingDelivery = 0;
    let totalDesign = 0;
    let totalPrinting = 0;
    let totalPlastic = 0;
    let totalMolds = 0;
    let totalDelivery = 0;
    let totalRevenue = 0;
    let totalCommercial = 0;

    items.forEach(item => {
        if (!item.result || !item.quantity) return;
        const r = item.result;
        const qty = item.quantity;

        const builtinHwPurchasePerUnitRaw = Number(item?.builtin_hw_price || 0);
        const builtinHwDeliveryPerUnitRaw = qty > 0 ? round2(Number(item?.builtin_hw_delivery_total || 0) / qty) : 0;
        const builtinHwLaborTotal = round2((Number(r?.hoursBuiltinHw) || 0) * safeFotPerHour);
        const builtinHwLaborResolvedPerUnit = qty > 0
            ? round2(builtinHwLaborTotal / qty)
            : 0;
        const builtinHwPurchaseDeliveryFallbackPerUnit = Math.max(0, round2((Number(r?.costBuiltinHw) || 0) - builtinHwLaborResolvedPerUnit));
        const builtinHwPurchasePerUnit = builtinHwPurchasePerUnitRaw > 0 || builtinHwDeliveryPerUnitRaw > 0
            ? builtinHwPurchasePerUnitRaw
            : builtinHwPurchaseDeliveryFallbackPerUnit;
        const builtinHwDeliveryPerUnit = builtinHwPurchasePerUnitRaw > 0 || builtinHwDeliveryPerUnitRaw > 0
            ? builtinHwDeliveryPerUnitRaw
            : 0;

        // Зарплата и косвенные: сначала берём точную раскладку новых полей,
        // а если заказ старый/неполный — падаем обратно на legacy-часы.
        const productSalaryByCosts = qty * (
            (Number(r?.costFot) || 0)
            + (Number(r?.costCutting) || 0)
            + (Number(r?.costNfcProgramming) || 0)
        );
        const productSalaryByHours = (Number(r?.hoursTotalPlasticNfc) || 0) * safeFotPerHour;
        totalSalary += productSalaryByCosts > 0 ? productSalaryByCosts : productSalaryByHours;
        totalSalary += builtinHwLaborTotal;

        const builtinAssemblySalaryByCosts = qty * (Number(r?.costBuiltinAssembly) || 0);
        const builtinAssemblySalaryByHours = (Number(r?.hoursBuiltinAssembly) || 0) * safeFotPerHour;
        totalSalary += builtinAssemblySalaryByCosts > 0 ? builtinAssemblySalaryByCosts : builtinAssemblySalaryByHours;

        const productIndirectByCosts = qty * (
            (Number(r?.costIndirect) || 0)
            + (Number(r?.costCuttingIndirect) || 0)
            + (Number(r?.costNfcIndirect) || 0)
        );
        const productIndirectByHours = (Number(r?.hoursTotalPlasticNfc) || 0) * (Number(params?.indirectPerHour) || 0);
        totalIndirect += productIndirectByCosts > 0 ? productIndirectByCosts : productIndirectByHours;

        const builtinHwIndirectByCosts = qty * (Number(r?.costBuiltinHwIndirect) || 0);
        const builtinHwIndirectByHours = (Number(r?.hoursBuiltinHw) || 0) * (Number(params?.indirectPerHour) || 0);
        totalIndirect += builtinHwIndirectByCosts > 0 ? builtinHwIndirectByCosts : builtinHwIndirectByHours;

        const builtinAssemblyIndirectByCosts = qty * (Number(r?.costBuiltinAssemblyIndirect) || 0);
        const builtinAssemblyIndirectByHours = (Number(r?.hoursBuiltinAssembly) || 0) * (Number(params?.indirectPerHour) || 0);
        totalIndirect += builtinAssemblyIndirectByCosts > 0 ? builtinAssemblyIndirectByCosts : builtinAssemblyIndirectByHours;

        // NFC метки
        const directNfcPerUnit = Number(r?.costNfcTag) || (item.is_nfc ? Number(params?.nfcTagCost || 0) : 0);
        totalNfc += qty * directNfcPerUnit;
        if (isNfcLikeEntry(item?.builtin_hw_name)) {
            totalNfc += qty * (builtinHwPurchasePerUnit + builtinHwDeliveryPerUnit);
        } else {
            totalHardwarePurchase += qty * builtinHwPurchasePerUnit;
            totalHardwareDelivery += qty * builtinHwDeliveryPerUnit;
        }

        // Проектирование
        const designTotal = qty * (Number(r?.costDesign) || 0);
        totalDesign += designTotal > 0 ? designTotal : (item.complex_design ? safeDesignCost : 0);

        // Печать: используем уже посчитанную себестоимость строки,
        // чтобы не терять доставку/налоги поставщика и не расходиться с costTotal.
        const resolvedPrintingTotal = qty * (Number(r?.costPrinting) || 0);
        if (resolvedPrintingTotal > 0) {
            totalPrinting += resolvedPrintingTotal;
        } else {
            const printings = getActivePrintings(item);
            if (printings.length > 0) {
                printings.forEach(pr => {
                    const prQty = pr.qty || 0;
                    const prPrice = pr.price || 0;
                    if (prQty > 0 && prPrice > 0) {
                        const prDelivery = pr.delivery_total || 0;
                        const deliveryCost = prDelivery > 0 ? prDelivery / prQty : (params?.printingDeliveryCost || 0) / prQty;
                        totalPrinting += qty * ((prPrice * 1.06) + deliveryCost);
                    }
                });
            } else if (hasLegacyPrintingFallback(item)) {
                const printQty = item.printing_qty || 0;
                const printPrice = item.printing_price_per_unit || 0;
                if (printQty > 0 && printPrice > 0) {
                    totalPrinting += qty * ((printPrice * 1.06) + ((params?.printingDeliveryCost || 0) / printQty));
                }
            }
        }

        // Пластик
        totalPlastic += (r.costPlastic || 0) * qty;

        // Молды
        const savedMoldTotal = qty * (Number(r?.costMoldAmortization) || 0);
        if (savedMoldTotal > 0) totalMolds += savedMoldTotal;
        else {
            const paidBaseMolds = item.base_mold_in_stock ? 0 : 1;
            const totalPaidMolds = Math.max(0, paidBaseMolds + (item.extra_molds || 0));
            totalMolds += safeMoldBaseCost * totalPaidMolds;
        }

        // Доставка
        const deliveryTotal = qty * (Number(r?.costDelivery) || 0);
        totalDelivery += deliveryTotal > 0 ? deliveryTotal : (item.delivery_included ? safeDeliveryCostMoscow : 0);

        // Выручка изделий (item + printing)
        totalRevenue += ((item.sell_price_item || 0) + getPrintingSellPricePerUnit(item)) * qty;
    });

    // Фурнитура
    (hardwareItems || []).forEach(hw => {
        const qty = hw.qty || 0;
        totalHardwarePurchase += qty * (hw.price || 0);
        totalHardwareDelivery += qty * (hw.delivery_price || 0);
        totalRevenue += (hw.sell_price || 0) * qty;
        if (hw.result) {
            totalSalary += hw.result.hoursHardware * safeFotPerHour;
            totalIndirect += qty * (hw.result.indirectPerUnit || 0);
        }
    });

    // Упаковка
    (packagingItems || []).forEach(pkg => {
        const qty = pkg.qty || 0;
        totalPackagingPurchase += qty * (pkg.price || 0);
        totalPackagingDelivery += qty * (pkg.delivery_price || 0);
        totalRevenue += (pkg.sell_price || 0) * qty;
        if (pkg.result) {
            totalSalary += pkg.result.hoursPackaging * safeFotPerHour;
            totalIndirect += qty * (pkg.result.indirectPerUnit || 0);
        }
    });

    // Pendants
    (pendantItems || []).forEach(pnd => {
        if (!pnd.result) return;
        const qty = pnd.quantity || 0;
        const r = pnd.result;
        const cords = getPendantAttachmentEntries(pnd, 'cord');
        const carabiners = getPendantAttachmentEntries(pnd, 'carabiner');
        const elements = getCountablePendantElements(pnd);
        const totalElements = qty * elements.length;
        const letterMetrics = getPendantLetterBlankMetrics(totalElements, params, pnd);
        const letterBreakdown = letterMetrics?.breakdown || null;
        // Assembly salary
        totalSalary += ((r.attachmentAssemblyHours ?? r.assemblyHours) + r.packagingHours) * safeFotPerHour;
        totalIndirect += r.attachmentIndirectTotal || 0;
        if (letterBreakdown) {
            totalSalary += letterBreakdown.salaryTotal;
            totalIndirect += letterBreakdown.omittedIndirectTotal;
            totalHardwarePurchase += letterBreakdown.hardwarePurchaseTotal;
            totalHardwareDelivery += letterBreakdown.hardwareDeliveryTotal;
            totalNfc += letterBreakdown.nfcTotal || 0;
            totalPlastic += letterBreakdown.plasticTotal;
            totalMolds += letterBreakdown.moldsTotal;
            totalPrinting += letterBreakdown.printingTotal;
        } else {
            const elementCostPerUnit = getPendantElementCostPerUnit(pnd, params, letterMetrics);
            totalHardwarePurchase += qty * elements.length * elementCostPerUnit;
        }
        // Cord + carabiner → hardware purchases
        totalHardwarePurchase += cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentPurchasePerUnit('cord', entry)), 0);
        totalHardwarePurchase += carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentPurchasePerUnit('carabiner', entry)), 0);
        totalHardwareDelivery += cords.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentDeliveryPerUnit('cord', entry)), 0);
        totalHardwareDelivery += carabiners.reduce((sum, entry) => sum + (getPendantAttachmentAllocatedQty(pnd, entry) * getPendantAttachmentDeliveryPerUnit('carabiner', entry)), 0);
        // Printing
        if (!letterBreakdown) {
            elements.forEach(el => {
                if (el.has_print && el.print_price) totalPrinting += qty * el.print_price;
            });
        }
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
    const totalTaxes = calcTaxesAmount(discountedRevenue, { taxRate: safeTaxRate });
    const totalCharity = calcCharityAmount(discountedRevenue, { vatRate: safeVatRate, charityRate: safeCharityRate });
    totalCommercial = calcCommercialAmount(discountedRevenue, { vatRate: safeVatRate });

    return {
        salary: round2(totalSalary),
        indirect: round2(totalIndirect),
        hardwarePurchase: round2(totalHardwarePurchase),
        nfcTotal: round2(totalNfc),
        hardwareDelivery: round2(totalHardwareDelivery),
        packagingPurchase: round2(totalPackagingPurchase),
        packagingDelivery: round2(totalPackagingDelivery),
        design: round2(totalDesign),
        printing: round2(totalPrinting),
        plastic: round2(totalPlastic),
        molds: round2(totalMolds),
        delivery: round2(totalDelivery),
        taxes: round2(totalTaxes),
        commercial: round2(totalCommercial),
        charity: round2(totalCharity),
        grossRevenue: round2(totalRevenue),
        discountAmount: discount.amount,
        discountPercent: discount.percent,
        revenueNet: round2(discountedRevenue),
        revenueWithVat: round2(discountedRevenue * (1 + safeVatRate)),
        revenue: round2(discountedRevenue),
        totalCosts: round2(totalSalary + totalIndirect + totalHardwarePurchase + totalNfc + totalHardwareDelivery
            + totalPackagingPurchase + totalPackagingDelivery
            + totalDesign + totalPrinting + totalPlastic + totalMolds + totalDelivery + totalTaxes + totalCommercial + totalCharity),
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
        totalRevenue += getPrintingSellPricePerUnit(item) * qty;

        // Total sell = item + printing, total cost = costTotal (includes printing cost)
        const totalSellPerUnit = (item.sell_price_item || 0) + getPrintingSellPricePerUnit(item);
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
    (extraCosts || []).forEach(ec => {
        const amt = ec.amount || 0;
        if (amt > 0) {
            totalRevenue += amt;
            totalEarned += amt * getNetRevenueRetentionRate(params);
        }
    });

    const discount = calculateOrderDiscount(totalRevenue, orderAdjustments, params);
    const finalRevenue = discount.revenueAfterDiscount;
    const finalEarned = round2(totalEarned - discount.earnedImpact);
    const vatRate = getVatRate(params);
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

function parseOrderCalcJson(value, fallback) {
    if (value === null || value === undefined || value === '') return fallback;
    if (Array.isArray(fallback)) {
        if (Array.isArray(value)) return value;
    } else if (typeof fallback === 'object' && fallback !== null) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) return value;
    }
    if (typeof value !== 'string') return fallback;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed : fallback;
        if (typeof fallback === 'object' && fallback !== null) {
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
        }
        return parsed;
    } catch (e) {
        return fallback;
    }
}

function getOrderLiveCalculatorSnapshot(order = {}, orderItems = [], params = null, templates = null) {
    const runtimeParams = params || (typeof App !== 'undefined' ? (App.params || {}) : {});
    const runtimeTemplates = Array.isArray(templates)
        ? templates
        : (typeof App !== 'undefined' && Array.isArray(App.templates) ? App.templates : []);

    const products = [];
    const hardwareItems = [];
    const packagingItems = [];
    const extraCosts = [];
    const pendantItems = [];
    let rawProductIndex = -1;
    const templateHardwareParentIndices = new Set(
        (orderItems || [])
            .filter(item => String(item?.item_type || '').trim().toLowerCase() === 'hardware' && !!item?.hardware_from_template)
            .map(item => Number(item?.hardware_parent_item_index))
            .filter(index => Number.isFinite(index) && index >= 0)
    );

    (orderItems || []).forEach(rawItem => {
        if (!rawItem) return;
        const itemType = String(rawItem.item_type || 'product').trim().toLowerCase();

        if (itemType === 'product') {
            rawProductIndex += 1;
            const item = { ...rawItem };
            item.quantity = Number(item.quantity || 0);
            item.pieces_per_hour = Number(item.pieces_per_hour || 0);
            item.weight_grams = Number(item.weight_grams || 0);
            item.extra_molds = Number(item.extra_molds || 0);
            item.sell_price_item = Number(item.sell_price_item || 0);
            item.sell_price_printing = Number(item.sell_price_printing || 0);
            item.printings = parseOrderCalcJson(item.printings, []);

            const tpl = item.template_id
                ? runtimeTemplates.find(template => String(template.id) === String(item.template_id))
                : null;
            if (tpl) {
                item.product_name = item.product_name || tpl.name || '';
                item.pieces_per_hour = Number(
                    tpl.pieces_per_hour_avg
                    || tpl.pieces_per_hour_min
                    || item.pieces_per_hour
                    || 0
                );
                item.weight_grams = Number(tpl.weight_grams || item.weight_grams || 0);
                item.is_blank_mold = true;
                if (!(Number(item.blank_mold_total_cost || 0) > 0)) {
                    item.blank_mold_total_cost = getBlankTemplateTotalMoldCost(tpl);
                }
                item.builtin_assembly_name = tpl.builtin_assembly_name || '';
                item.builtin_assembly_speed = Number(tpl.builtin_assembly_speed || 0);
                if (!templateHardwareParentIndices.has(rawProductIndex)) {
                    item.builtin_hw_name = tpl.hw_name || '';
                    item.builtin_hw_price = Number(tpl.hw_price_per_unit || 0);
                    item.builtin_hw_delivery_total = Number(tpl.hw_delivery_total || 0);
                    item.builtin_hw_speed = Number(tpl.hw_speed || 0);
                }
            }

            item.result = calculateItemCost(item, runtimeParams);
            products.push(item);
            return;
        }

        if (itemType === 'hardware') {
            const hw = {
                ...rawItem,
                source: rawItem.hardware_source || 'custom',
                name: rawItem.product_name || '',
                qty: Number(rawItem.quantity || 0),
                assembly_speed: Number(rawItem.hardware_assembly_speed || 0),
                price: Number(rawItem.hardware_price_per_unit || 0),
                delivery_price: Number(rawItem.hardware_delivery_per_unit || 0),
                delivery_total: Number(rawItem.hardware_delivery_total || 0),
                sell_price: Number(rawItem.sell_price_hardware || 0),
                warehouse_item_id: rawItem.hardware_warehouse_item_id || null,
                warehouse_sku: rawItem.hardware_warehouse_sku || '',
            };
            if (!(hw.delivery_total > 0) && hw.qty > 0 && hw.delivery_price > 0) {
                hw.delivery_total = round2(hw.delivery_price * hw.qty);
            }
            if (typeof Calculator !== 'undefined' && Calculator && typeof Calculator._hydrateWarehouseBackedLineFromCurrentWarehouse === 'function') {
                Calculator._hydrateWarehouseBackedLineFromCurrentWarehouse(hw);
            }
            hw.result = calculateHardwareCost(hw, runtimeParams);
            hardwareItems.push(hw);
            return;
        }

        if (itemType === 'packaging') {
            const pkg = {
                ...rawItem,
                source: rawItem.packaging_source || 'custom',
                name: rawItem.product_name || '',
                qty: Number(rawItem.quantity || 0),
                assembly_speed: Number(rawItem.packaging_assembly_speed || 0),
                price: Number(rawItem.packaging_price_per_unit || 0),
                delivery_price: Number(rawItem.packaging_delivery_per_unit || 0),
                delivery_total: Number(rawItem.packaging_delivery_total || 0),
                sell_price: Number(rawItem.sell_price_packaging || 0),
                warehouse_item_id: rawItem.packaging_warehouse_item_id || null,
                warehouse_sku: rawItem.packaging_warehouse_sku || '',
            };
            if (!(pkg.delivery_total > 0) && pkg.qty > 0 && pkg.delivery_price > 0) {
                pkg.delivery_total = round2(pkg.delivery_price * pkg.qty);
            }
            if (typeof Calculator !== 'undefined' && Calculator && typeof Calculator._hydrateWarehouseBackedLineFromCurrentWarehouse === 'function') {
                Calculator._hydrateWarehouseBackedLineFromCurrentWarehouse(pkg);
            }
            pkg.result = calculatePackagingCost(pkg, runtimeParams);
            packagingItems.push(pkg);
            return;
        }

        if (itemType === 'extra_cost') {
            extraCosts.push({
                name: rawItem.product_name || rawItem.name || '',
                amount: Number(rawItem.cost_total || rawItem.sell_price_item || 0),
            });
            return;
        }

        if (itemType === 'pendant') {
            const nestedPayload = parseOrderCalcJson(rawItem.item_data, {});
            const pendant = { ...nestedPayload, ...rawItem };
            pendant.quantity = Number(pendant.quantity || 0);
            pendant.elements = parseOrderCalcJson(pendant.elements, []);
            pendant.cords = parseOrderCalcJson(pendant.cords, []);
            pendant.carabiners = parseOrderCalcJson(pendant.carabiners, []);
            pendant.packaging = parseOrderCalcJson(pendant.packaging, pendant.packaging || null);
            if (!pendant.cord && pendant.cords[0]) pendant.cord = pendant.cords[0];
            if (!pendant.carabiner && pendant.carabiners[0]) pendant.carabiner = pendant.carabiners[0];
            pendant.result = calculatePendantCost(pendant, runtimeParams);
            pendantItems.push(pendant);
        }
    });

    const orderAdjustments = {
        mode: order?.discount_mode,
        value: order?.discount_value,
    };
    const load = calculateProductionLoad(products, hardwareItems, packagingItems, runtimeParams, pendantItems);
    const summary = calculateOrderSummary(products, hardwareItems, packagingItems, extraCosts, runtimeParams, pendantItems, orderAdjustments);

    return {
        products,
        hardwareItems,
        packagingItems,
        extraCosts,
        pendantItems,
        load,
        summary,
        revenue: round2(summary.totalRevenue || 0),
        marginPercent: round2(summary.marginPercent || 0),
        hours: round2(load.totalHours || 0),
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
        costBuiltinAssembly: 0, costBuiltinAssemblyIndirect: 0,
        costPrinting: 0, costDelivery: 0, costTotal: 0,
        hoursPlastic: 0, hoursCutting: 0, hoursNfc: 0, hoursBuiltinHw: 0, hoursBuiltinAssembly: 0,
        hoursPlasticZone: 0, hoursAssemblyZone: 0, hoursCuttingZone: 0,
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

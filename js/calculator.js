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
function calculatePendantCost(pendant, params) {
    const qty = pendant.quantity || 0;
    if (qty === 0) return { costPerUnit: 0, sellPerUnit: 0, totalCost: 0, totalRevenue: 0, assemblyHours: 0, packagingHours: 0 };

    const elements = pendant.elements || [];

    // Element cost (production/purchase cost per element)
    const elemCostPerUnit = pendant.element_price_per_unit || 0;
    const elemCostTotal = elements.length * elemCostPerUnit;

    // Hardware costs (purchase prices)
    // Cord: depends on unit — metric (м/см) uses cord_length_cm, pieces (шт) = price_per_unit directly
    const cordUnit = pendant.cord?.unit || 'шт';
    const cordIsMetric = (cordUnit === 'м' || cordUnit === 'см');
    const cordLenCm = pendant.cord_length_cm || 0;
    const cordCost = cordIsMetric
        ? round2((pendant.cord?.price_per_unit || 0) * cordLenCm / 100) + (pendant.cord?.delivery_price || 0)
        : (pendant.cord?.price_per_unit || 0) + (pendant.cord?.delivery_price || 0);
    const carabinerCost = (pendant.carabiner?.price_per_unit || 0) + (pendant.carabiner?.delivery_price || 0);

    let printCost = 0;
    elements.forEach(el => {
        if (el.has_print && el.print_price) printCost += el.print_price;
    });

    // Total cost per pendant = elements + cord + carabiner + print
    const costPerUnit = round2(elemCostTotal + cordCost + carabinerCost + printCost);

    // Sell price: use pre-calculated total from Step 5 UI
    let sellPerUnit;
    if (pendant._totalSellPerUnit > 0) {
        sellPerUnit = pendant._totalSellPerUnit;
    } else {
        // Fallback: margin-based pricing on cost
        sellPerUnit = calculateTargetPrice(costPerUnit, params, qty);
    }

    // Assembly hours
    const cordSpeed = pendant.cord?.assembly_speed || 0;
    const assemblyHours = cordSpeed > 0 ? round2(qty / cordSpeed * (params.wasteFactor || 1.1)) : 0;
    const packagingHours = 0;

    return {
        costPerUnit,
        sellPerUnit: round2(sellPerUnit),
        totalCost: round2(costPerUnit * qty),
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
 * цена без НДС = себестоимость / (1 - ОСН - коммерч. - целевая чистая маржа)
 * НДС добавляется отдельно сверху в КП/счёте и в эту цену не входит.
 */
function calculateTargetPrice(cost, params, qty) {
    if (cost === 0) return 0;
    const margin = qty ? getMarginForQty(qty) : (params.marginTarget || 0.55);
    const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.06;
    const commercialRate = 0.065;
    const keepRate = 1 - taxRate - commercialRate - margin;
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
    const commercialRate = 0.065;
    const netBeforeCost = sellPrice * (1 - taxRate - commercialRate);
    const earned = netBeforeCost - (costPerUnit || 0);
    return {
        earned: round2(earned),
        percent: round2(earned * 100 / sellPrice),
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
function calculateFinDirectorData(items, hardwareItems, packagingItems, params, pendantItems = []) {
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
        // Assembly salary
        totalSalary += (r.assemblyHours + r.packagingHours) * params.fotPerHour;
        // Cord + carabiner → hardware purchases
        const elements = pnd.elements || [];
        totalHardwarePurchase += qty * ((pnd.cord?.price_per_unit || 0) + (pnd.carabiner?.price_per_unit || 0));
        totalHardwareDelivery += qty * ((pnd.cord?.delivery_price || 0) + (pnd.carabiner?.delivery_price || 0));
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

    const totalTaxes = totalRevenue * (params.taxRate + params.vatRate);

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
        revenue: round2(totalRevenue),
        totalCosts: round2(totalSalary + totalHardwarePurchase + totalHardwareDelivery
            + totalPackagingPurchase + totalPackagingDelivery
            + totalDesign + totalPrinting + totalPlastic + totalMolds + totalDelivery + totalTaxes),
    };
}

/**
 * Рассчитать итоговую смету заказа
 * Обновлено: фурнитура и упаковка — отдельные массивы
 */
function calculateOrderSummary(items, hardwareItems, packagingItems, extraCosts, params = {}, pendantItems = []) {
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
    const commercialRate = 0.065;
    (extraCosts || []).forEach(ec => {
        const amt = ec.amount || 0;
        if (amt > 0) {
            totalRevenue += amt;
            totalEarned += amt * (1 - taxRate - commercialRate);
        }
    });

    const vatRate = Number.isFinite(params.vatRate) ? params.vatRate : 0.05;
    const vatOnRevenue = totalRevenue * vatRate;
    const totalWithVat = totalRevenue + vatOnRevenue;
    const marginPercent = totalRevenue > 0 ? round2(totalEarned * 100 / totalRevenue) : 0;

    return {
        totalRevenue: round2(totalRevenue),
        vatOnRevenue: round2(vatOnRevenue),
        totalWithVat: round2(totalWithVat),
        totalEarned: round2(totalEarned),
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
    const workersCount = (settings && settings.workers_count) || 3.5;
    const hoursPerDay = 8;
    const dailyCapacity = round2(workersCount * hoursPerDay);

    // Filter schedulable orders: only past-draft statuses (sample, production, delivery)
    const SCHEDULE_STATUSES = ['sample','production_casting','production_printing','production_hardware','production_packaging','delivery','in_production'];
    const schedulable = orders.filter(o => SCHEDULE_STATUSES.includes(o.status));

    // Priority: production > delivery > sample, then by deadline_end ASC
    const statusPriority = { production_casting: 0, production_printing: 0, production_hardware: 0, production_packaging: 0, in_production: 0, delivery: 1, sample: 2 };
    schedulable.sort((a, b) => {
        const pa = statusPriority[a.status] ?? 3;
        const pb = statusPriority[b.status] ?? 3;
        if (pa !== pb) return pa - pb;
        const da = a.deadline_end || '9999-12-31';
        const db = b.deadline_end || '9999-12-31';
        return da.localeCompare(db);
    });

    // Build order queues with remaining hours per phase
    const queue = schedulable.map(o => ({
        orderId: o.id,
        orderName: o.order_name || 'Без названия',
        clientName: o.client_name || '',
        status: o.status,
        deadlineEnd: o.deadline_end || null,
        phases: [
            { name: 'molding', label: 'Литьё', remaining: o.production_hours_plastic || 0, total: o.production_hours_plastic || 0, color: '#f59e0b' },
            { name: 'assembly', label: 'Сборка', remaining: o.production_hours_hardware || 0, total: o.production_hours_hardware || 0, color: '#06b6d4' },
            { name: 'packaging', label: 'Упаковка', remaining: o.production_hours_packaging || 0, total: o.production_hours_packaging || 0, color: '#8b5cf6' },
        ],
        currentPhaseIdx: 0,
        schedule: [], // [{ date, phase, hours }]
        totalHours: round2((o.production_hours_plastic || 0) + (o.production_hours_packaging || 0) + (o.production_hours_hardware || 0)),
        done: false,
    }));

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

        // Skip weekends (Sat=6, Sun=0)
        const dow = date.getDay();
        if (dow === 0 || dow === 6) continue;

        const dateStr = date.toISOString().slice(0, 10);
        let remainingCapacity = dailyCapacity;
        const dayAllocations = [];

        // Allocate hours to orders in priority order
        for (const q of queue) {
            if (q.done || remainingCapacity <= 0) continue;

            const phase = q.phases[q.currentPhaseIdx];
            if (!phase || phase.remaining <= 0) continue;

            // Give this order up to remainingCapacity hours (or whatever's left in phase)
            const give = Math.min(remainingCapacity, phase.remaining);
            phase.remaining = round2(phase.remaining - give);
            remainingCapacity = round2(remainingCapacity - give);

            q.schedule.push({ date: dateStr, phase: phase.name, hours: round2(give) });
            dayAllocations.push({ orderId: q.orderId, phase: phase.name, hours: round2(give) });

            // If phase done, advance to next
            if (phase.remaining <= 0) {
                q.currentPhaseIdx++;
                // Skip empty phases
                while (q.currentPhaseIdx < q.phases.length && q.phases[q.currentPhaseIdx].remaining <= 0) {
                    q.currentPhaseIdx++;
                }
                if (q.currentPhaseIdx >= q.phases.length) {
                    q.done = true;
                }
            }
        }

        days.push({
            date: dateStr,
            allocations: dayAllocations,
            totalUsed: round2(dailyCapacity - remainingCapacity),
        });

        // Stop if all orders are done
        if (queue.every(q => q.done)) break;
    }

    return { queue, dailyCapacity, days };
}

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
    const totalHoursPerWorker = s('hours_per_worker'); // 9*21 = 189
    const totalHoursAll = s('workers_count') * totalHoursPerWorker;
    const workLoadHours = totalHoursAll * s('work_load_ratio');
    const plasticHours = workLoadHours * s('plastic_injection_ratio');
    const packagingHours = workLoadHours * s('packaging_ratio');
    const indirectPerHour = s('indirect_costs_monthly') / plasticHours;

    return {
        totalHoursAll,
        workLoadHours,
        plasticHours,
        packagingHours,
        indirectPerHour,
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
    const MOLD_LIFETIME = 4500;
    const moldDivisor = item.is_blank_mold ? MOLD_LIFETIME : qty;
    const costMoldAmortization = p.moldBaseCost * (1 + extraMolds) / moldDivisor;

    // Проектирование формы (если сложная)
    const costDesign = item.complex_design ? p.designCost / qty : 0;

    // === Срезание лейника ===
    const hoursCutting = qty / p.cuttingSpeed * p.wasteFactor;
    const costCutting = hoursCutting * p.fotPerHour / qty;
    const costCuttingIndirect = p.indirectPerHour * hoursCutting / qty;

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
    const printings = item.printings || [];
    if (printings.length > 0) {
        printings.forEach(pr => {
            const prQty = pr.qty || 0;
            const prPrice = pr.price || 0;
            if (prQty > 0 && prPrice > 0) {
                costPrinting += (prPrice * 1.06) + (p.printingDeliveryCost / prQty);
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

    // === Доставка за наш счет ===
    const costDelivery = item.delivery_included ? p.deliveryCostMoscow / qty : 0;

    // === ИТОГО себестоимость изделия (за штуку) ===
    const costTotal = costFot + costIndirect + costPlastic + costMoldAmortization
        + costDesign + costCutting + costCuttingIndirect
        + costNfcTag + costNfcProgramming + costNfcIndirect
        + costPrinting + costDelivery;

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
        costDelivery: round2(costDelivery),
        costTotal: round2(costTotal),

        // Часы производства (на всю партию)
        hoursPlastic: round2(hoursPlastic),
        hoursCutting: round2(hoursCutting),
        hoursNfc: round2(hoursNfc),

        // Всего часов пластик+обработка
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

    if (qty > 0 && speed > 0) {
        hoursHardware = qty / speed * params.wasteFactor;
        fotPerUnit = hoursHardware * params.fotPerHour / qty;
    }

    const costPerUnit = fotPerUnit + (hw.price || 0) + (hw.delivery_price || 0);

    return {
        costPerUnit: round2(costPerUnit),
        fotPerUnit: round2(fotPerUnit),
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

    if (qty > 0 && speed > 0) {
        hoursPackaging = qty / speed * params.wasteFactor;
        fotPerUnit = hoursPackaging * params.fotPerHour / qty;
    }

    const costPerUnit = fotPerUnit + (pkg.price || 0) + (pkg.delivery_price || 0);

    return {
        costPerUnit: round2(costPerUnit),
        fotPerUnit: round2(fotPerUnit),
        hoursPackaging: round2(hoursPackaging),
        totalCost: round2(costPerUnit * qty),
    };
}

/**
 * Маржа по тиражу (совпадает с TIER_MARGINS в molds.js)
 * 1000 шт = 40% (базовая), мелкие дороже, крупные со скидкой
 */
const CALC_TIER_MARGINS = [
    { min: 0, max: 75, margin: 0.65 },
    { min: 75, max: 200, margin: 0.55 },
    { min: 200, max: 400, margin: 0.48 },
    { min: 400, max: 750, margin: 0.43 },
    { min: 750, max: 2500, margin: 0.40 },
    { min: 2500, max: Infinity, margin: 0.35 },
];

function getMarginForQty(qty) {
    const tier = CALC_TIER_MARGINS.find(t => qty >= t.min && qty < t.max);
    return tier ? tier.margin : 0.40;
}

/**
 * Рассчитать таргет-цену (модель 70/30)
 * Формула: (себестоимость + НДС) * (1 + маржа) / (1 - налог - НДС_выход)
 * Маржа зависит от тиража: 65% при 50шт → 35% при 5000шт
 */
function calculateTargetPrice(cost, params, qty) {
    if (cost === 0) return 0;
    const margin = qty ? getMarginForQty(qty) : params.marginTarget;
    const vatOnCost = cost * params.vatRate;
    return round2((cost + vatOnCost) * (1 + margin) / (1 - params.taxRate - 0.065));
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
    if (sellPrice === 0) return { earned: 0, percent: 0 };
    const earned = sellPrice - costPerUnit;
    return {
        earned: round2(earned),
        percent: round2(earned * 100 / sellPrice),
    };
}

/**
 * Рассчитать загрузку производства
 * Обновлено: фурнитура и упаковка теперь отдельные массивы
 */
function calculateProductionLoad(items, hardwareItems, packagingItems, params) {
    let hoursPlasticTotal = 0;
    let hoursPackagingTotal = 0;
    let hoursHardwareTotal = 0;

    items.forEach(item => {
        if (item.result) {
            hoursPlasticTotal += item.result.hoursTotalPlasticNfc || 0;
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
function calculateFinDirectorData(items, hardwareItems, packagingItems, params) {
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
        totalMolds += params.moldBaseCost * (1 + (item.extra_molds || 0));

        // Доставка
        if (item.delivery_included) totalDelivery += params.deliveryCostMoscow;

        // Выручка изделий
        totalRevenue += (item.sell_price_item || 0) * qty;
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
function calculateOrderSummary(items, hardwareItems, packagingItems) {
    let totalRevenue = 0;
    let totalEarned = 0;

    items.forEach(item => {
        if (!item.result) return;
        const qty = item.quantity || 0;

        totalRevenue += (item.sell_price_item || 0) * qty;

        const marginItem = calculateActualMargin(item.sell_price_item || 0, item.result.costTotal);
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

    const vatOnRevenue = totalRevenue * 0.05;
    const totalWithVat = totalRevenue + vatOnRevenue;
    const marginPercent = totalWithVat > 0 ? round2(totalEarned * 100 / totalWithVat) : 0;

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
        costPrinting: 0, costDelivery: 0, costTotal: 0,
        hoursPlastic: 0, hoursCutting: 0, hoursNfc: 0,
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

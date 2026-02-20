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
 * (аналог листа "Расчет себестоимости", один блок из 26 строк)
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
    const extraMolds = item.extra_molds || 0;
    const costMoldAmortization = p.moldBaseCost * (1 + extraMolds) / qty;

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

    // === Нанесение ===
    const printQty = item.printing_qty || 0;
    const printPrice = item.printing_price_per_unit || 0;
    let costPrinting = 0;
    if (printQty > 0 && printPrice > 0) {
        costPrinting = (printPrice * 1.06) + (p.printingDeliveryCost / printQty);
    }

    // === Доставка за наш счет ===
    const costDelivery = item.delivery_included ? p.deliveryCostMoscow / qty : 0;

    // === ИТОГО себестоимость изделия (за штуку) ===
    const costTotal = costFot + costIndirect + costPlastic + costMoldAmortization
        + costDesign + costCutting + costCuttingIndirect
        + costNfcTag + costNfcProgramming + costNfcIndirect
        + costPrinting + costDelivery;

    // === Фурнитура ===
    const hwQty = item.hardware_qty || 0;
    const hwSpeed = item.hardware_assembly_speed || 0;
    let hoursHardware = 0;
    let costHardware = 0;

    if (hwQty > 0) {
        const hwFotPerUnit = hwSpeed > 0 ? (() => {
            hoursHardware = hwQty / hwSpeed * p.wasteFactor;
            return hoursHardware * p.fotPerHour / hwQty;
        })() : 0;
        costHardware = hwFotPerUnit + (item.hardware_price_per_unit || 0) + (item.hardware_delivery_per_unit || 0);
    }

    // === Упаковка ===
    const pkgQty = item.packaging_qty || 0;
    const pkgSpeed = item.packaging_assembly_speed || 0;
    let hoursPackaging = 0;
    let costPackaging = 0;

    if (pkgQty > 0) {
        const pkgFotPerUnit = pkgSpeed > 0 ? (() => {
            hoursPackaging = pkgQty / pkgSpeed * p.wasteFactor;
            return hoursPackaging * p.fotPerHour / pkgQty;
        })() : 0;
        costPackaging = pkgFotPerUnit + (item.packaging_price_per_unit || 0) + (item.packaging_delivery_per_unit || 0);
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
        costDelivery: round2(costDelivery),
        costTotal: round2(costTotal),

        // Фурнитура и упаковка (за шт)
        costHardware: round2(costHardware),
        costPackaging: round2(costPackaging),

        // Часы производства (на всю партию)
        hoursPlastic: round2(hoursPlastic),
        hoursCutting: round2(hoursCutting),
        hoursNfc: round2(hoursNfc),
        hoursHardware: round2(hoursHardware),
        hoursPackaging: round2(hoursPackaging),

        // Всего часов
        hoursTotalPlasticNfc: round2(hoursPlastic + hoursCutting + hoursNfc),
        hoursTotalPackagingHardware: round2(hoursHardware + hoursPackaging),
    };
}

/**
 * Рассчитать таргет-цену (модель 70/30)
 * Формула: (себестоимость + НДС) * (1 + маржа) / (1 - налог - НДС_выход)
 *
 * Из листа "Таргет цены":
 * = (cost + cost*0.05) * (1 + 40/100) / (1 - 0.06 - 0.065)
 */
function calculateTargetPrice(cost, params) {
    if (cost === 0) return 0;
    const vatOnCost = cost * params.vatRate;
    return round2((cost + vatOnCost) * (1 + params.marginTarget) / (1 - params.taxRate - 0.065));
}

/**
 * Рассчитать таргет-цену для маркетплейса
 * Из листа "Таргет цены" колонка E:
 * = (cost * 1.4) / (1 - 0.05 - 0.06 - 0.32 - (0.68 * 0.065))
 */
function calculateMpTargetPrice(cost, params) {
    if (cost === 0) return 0;
    return round2((cost * (1 + params.marginTarget))
        / (1 - (params.mp_commission || 0.05) - (params.mp_logistics || 0.06)
            - (params.mp_storage_ratio || 0.32) - (0.68 * (params.mp_acquiring || 0.065))));
}

/**
 * Рассчитать фактическую маржу
 * Из листа "Таргет цены", секция "Фактическая цена"
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
 * Из листа "Расчет себестоимости", блок F1:J10
 */
function calculateProductionLoad(items, params) {
    let hoursPlasticTotal = 0;
    let hoursPackagingTotal = 0;
    let hoursHardwareTotal = 0;

    items.forEach(item => {
        if (item.result) {
            hoursPlasticTotal += item.result.hoursTotalPlasticNfc || 0;
            hoursPackagingTotal += item.result.hoursPackaging || 0;
            hoursHardwareTotal += item.result.hoursHardware || 0;
        }
    });

    const totalHours = hoursPlasticTotal + hoursPackagingTotal + hoursHardwareTotal;

    // Процент загрузки (от пластиковых часов и упаковочных)
    const plasticLoadPercent = params.plasticHours > 0
        ? round2(hoursPlasticTotal * 100 / params.plasticHours) : 0;
    const packagingLoadPercent = params.packagingHours > 0
        ? round2((hoursPackagingTotal + hoursHardwareTotal) * 100 / params.packagingHours) : 0;

    // Дни для разного кол-ва сотрудников
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
 * (аналог листа "Финдир")
 */
function calculateFinDirectorData(items, params) {
    let totalSalary = 0;
    let totalHardwarePurchase = 0;
    let totalHardwareDelivery = 0;
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

        // Закупка фурнитуры
        const hwQty = item.hardware_qty || 0;
        totalHardwarePurchase += hwQty * (item.hardware_price_per_unit || 0);
        totalHardwareDelivery += hwQty * (item.hardware_delivery_per_unit || 0);

        // NFC метки
        if (item.is_nfc) totalHardwarePurchase += qty * params.nfcTagCost;

        // Проектирование
        if (item.complex_design) totalDesign += params.designCost;

        // Печать
        const printQty = item.printing_qty || 0;
        const printPrice = item.printing_price_per_unit || 0;
        totalPrinting += printQty * printPrice;

        // Пластик
        totalPlastic += r.costPlastic * qty;

        // Молды
        totalMolds += params.moldBaseCost * (1 + (item.extra_molds || 0));

        // Доставка
        if (item.delivery_included) totalDelivery += params.deliveryCostMoscow;

        // Выручка
        totalRevenue += (item.sell_price_item || 0) * qty
            + (item.sell_price_hardware || 0) * (item.hardware_qty || 0)
            + (item.sell_price_packaging || 0) * (item.packaging_qty || 0);
    });

    const totalTaxes = totalRevenue * (params.taxRate + params.vatRate);

    return {
        salary: round2(totalSalary),
        hardwarePurchase: round2(totalHardwarePurchase),
        hardwareDelivery: round2(totalHardwareDelivery),
        design: round2(totalDesign),
        printing: round2(totalPrinting),
        plastic: round2(totalPlastic),
        molds: round2(totalMolds),
        delivery: round2(totalDelivery),
        taxes: round2(totalTaxes),
        revenue: round2(totalRevenue),
        totalCosts: round2(totalSalary + totalHardwarePurchase + totalHardwareDelivery
            + totalDesign + totalPrinting + totalPlastic + totalMolds + totalDelivery + totalTaxes),
    };
}

/**
 * Рассчитать итоговую смету заказа
 * (аналог "Фактическая смета" в листе "Таргет цены")
 */
function calculateOrderSummary(items) {
    let totalRevenue = 0;
    let totalEarned = 0;

    items.forEach(item => {
        if (!item.result) return;
        const qty = item.quantity || 0;
        const hwQty = item.hardware_qty || 0;
        const pkgQty = item.packaging_qty || 0;

        totalRevenue += (item.sell_price_item || 0) * qty
            + (item.sell_price_hardware || 0) * hwQty
            + (item.sell_price_packaging || 0) * pkgQty;

        const marginItem = calculateActualMargin(item.sell_price_item || 0, item.result.costTotal);
        const marginHw = calculateActualMargin(item.sell_price_hardware || 0, item.result.costHardware);
        const marginPkg = calculateActualMargin(item.sell_price_packaging || 0, item.result.costPackaging);

        totalEarned += marginItem.earned * qty + marginHw.earned * hwQty + marginPkg.earned * pkgQty;
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
        costHardware: 0, costPackaging: 0,
        hoursPlastic: 0, hoursCutting: 0, hoursNfc: 0,
        hoursHardware: 0, hoursPackaging: 0,
        hoursTotalPlasticNfc: 0, hoursTotalPackagingHardware: 0,
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

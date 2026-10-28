// Разметка тиража строки изделия (js/calculator.js): математика разметки и «честная» выручка.
// Тираж строки делится на: клиенту / на продажу со склада / партнёру / в подарок / образцы.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');
const context = vm.createContext({ console, Math, Date, JSON, Number, String, Array, Object, Set, App: { params: {} } });
vm.runInContext(`${source}\nglobalThis.__tirage = {
    normalizeTirageAllocation,
    hasTirageSplit,
    getTirageFreeQty,
    TIRAGE_PARTS,
    calculateOrderSummary,
    calculateFinDirectorData,
    applyProductionPurposeToOrderSummary,
    getOrderLiveCalculatorSnapshot,
    isB2CClientName,
    allocateRealCostToRows,
    computeRealMargin,
};`, context, { filename: 'js/calculator.js' });

const {
    normalizeTirageAllocation: normalizeInContext,
    hasTirageSplit,
    getTirageFreeQty,
    TIRAGE_PARTS,
    calculateOrderSummary,
    calculateFinDirectorData,
    applyProductionPurposeToOrderSummary,
    getOrderLiveCalculatorSnapshot,
    isB2CClientName,
    allocateRealCostToRows: allocateRealCostInContext,
    computeRealMargin,
} = context.__tirage;

// Объекты из vm-контекста имеют чужие прототипы: для deepEqual приводим к обычным.
const plain = value => JSON.parse(JSON.stringify(value));
const normalizeTirageAllocation = (...args) => plain(normalizeInContext(...args));
const allocateRealCostToRows = (...args) => plain(allocateRealCostInContext(...args));
// Округление до копеек — как round2 в js/calculator.js.
const round2Test = n => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// normalizeTirageAllocation
// ---------------------------------------------------------------------------
assert.deepEqual(plain(TIRAGE_PARTS), ['client', 'stock', 'partner', 'gift', 'sample']);

// всё клиенту по умолчанию
assert.deepEqual(normalizeTirageAllocation(null, 100, 5900).allocation,
    { client: 100, stock: 0, partner: 0, gift: 0, sample: 0, stock_price: 5900, partner_note: '', gift_note: '' });
assert.deepEqual(normalizeTirageAllocation(undefined, 100, 5900).reduced, []);
assert.equal(normalizeTirageAllocation('мусор', 7, 0).allocation.client, 7, 'строка вместо объекта = нет разметки');

// Лимон
const lemon = normalizeTirageAllocation({ stock: 30, partner: 50, gift: 20, stock_price: 5900, partner_note: 'художница' }, 100, 5900);
assert.equal(lemon.allocation.client, 0);
assert.deepEqual(lemon.reduced, []);
assert.deepEqual(lemon.allocation,
    { client: 0, stock: 30, partner: 50, gift: 20, sample: 0, stock_price: 5900, partner_note: 'художница', gift_note: '' });

// тираж уменьшили до 60: режем «на продажу», потом «в подарок»
const cut = normalizeTirageAllocation({ stock: 30, partner: 50, gift: 20 }, 60, 5900);
assert.deepEqual([cut.allocation.client, cut.allocation.stock, cut.allocation.gift, cut.allocation.partner], [0, 0, 10, 50]);
assert.deepEqual(cut.reduced, [{ part: 'stock', from: 30, to: 0 }, { part: 'gift', from: 20, to: 10 }]);

// порядок урезания: на продажу -> в подарок -> образцы -> партнёру
const deepCut = normalizeTirageAllocation({ stock: 5, gift: 5, sample: 10, partner: 50 }, 40, 100);
assert.deepEqual(deepCut.reduced, [
    { part: 'stock', from: 5, to: 0 },
    { part: 'gift', from: 5, to: 0 },
    { part: 'sample', from: 10, to: 0 },
    { part: 'partner', from: 50, to: 40 },
]);
assert.deepEqual([deepCut.allocation.client, deepCut.allocation.partner], [0, 40]);

// мусор во вводе
assert.deepEqual(normalizeTirageAllocation({ stock: -5, partner: 2.7 }, 10, 0).allocation.client, 8);
assert.equal(normalizeTirageAllocation({ stock: 3 }, 0, 100).allocation.stock, 0);
assert.equal(normalizeTirageAllocation({ stock: '12', gift: 'abc', sample: null, partner: NaN }, 20, 0).allocation.client, 8,
    'числа из строк читаются, остальное = 0');
assert.deepEqual(normalizeTirageAllocation({ stock: 4.9 }, 10.9, 0).reduced, [], 'дробные округляются вниз, это не «урезание»');
assert.equal(normalizeTirageAllocation({ stock: 4.9 }, 10.9, 0).allocation.client, 6);

// «клиенту» — всегда остаток: пришедшее значение игнорируется
assert.equal(normalizeTirageAllocation({ client: 5, stock: 10 }, 100, 0).allocation.client, 90);
assert.equal(normalizeTirageAllocation({ client: 500 }, 100, 0).allocation.client, 100);

// цена продажи со склада: своя, иначе по умолчанию (цена строки)
assert.equal(normalizeTirageAllocation({ stock: 1, stock_price: 4500 }, 10, 5900).allocation.stock_price, 4500);
assert.equal(normalizeTirageAllocation({ stock: 1 }, 10, 5900).allocation.stock_price, 5900);
assert.equal(normalizeTirageAllocation({ stock: 1, stock_price: 0 }, 10, 5900).allocation.stock_price, 5900,
    'пустая или нулевая цена = цена строки');
assert.equal(normalizeTirageAllocation({ stock: 1, stock_price: '1 500,456' }, 10, 5900).allocation.stock_price, 1500.46);
assert.equal(normalizeTirageAllocation({ stock: 1, stock_price: -3 }, 10, -7).allocation.stock_price, 0);

// ключ строки (по нему склад находит позицию строки) проходит через нормализацию как есть,
// и когда тираж урезан; без ключа — поля нет вовсе
assert.equal(normalizeTirageAllocation({ stock: 30, line_key: 'k7x2' }, 100, 5900).allocation.line_key, 'k7x2');
assert.equal(normalizeTirageAllocation({ stock: 30, gift: 20, line_key: 'k7x2' }, 10, 5900).allocation.line_key, 'k7x2');
assert.equal('line_key' in normalizeTirageAllocation({ stock: 30 }, 100, 5900).allocation, false);
assert.equal('line_key' in normalizeTirageAllocation({ stock: 30, line_key: '' }, 100, 5900).allocation, false);
assert.equal('line_key' in normalizeTirageAllocation({ stock: 30, line_key: 7 }, 100, 5900).allocation, false, 'только строка');

// пометки «кому» — свободный текст
const notes = normalizeTirageAllocation({ partner: 1, partner_note: 'художница Маша', gift: 1, gift_note: 7 }, 10, 0).allocation;
assert.equal(notes.partner_note, 'художница Маша');
assert.equal(notes.gift_note, '7');

// hasTirageSplit: есть что-то кроме «клиенту»
assert.equal(hasTirageSplit(null), false);
assert.equal(hasTirageSplit(undefined), false);
assert.equal(hasTirageSplit({}), false);
assert.equal(hasTirageSplit({ client: 100 }), false);
assert.equal(hasTirageSplit({ client: 100, stock: 0, partner: 0, gift: 0, sample: 0 }), false);
assert.equal(hasTirageSplit({ client: 99, sample: 1 }), true);
assert.equal(hasTirageSplit({ stock: 30 }), true);
assert.equal(hasTirageSplit({ gift: 0.5 }), false, 'дробное вниз до нуля');

// getTirageFreeQty: партнёр + подарки + образцы (без «на продажу»)
assert.equal(getTirageFreeQty(null), 0);
assert.equal(getTirageFreeQty({ client: 10 }), 0);
assert.equal(getTirageFreeQty({ stock: 30, partner: 50, gift: 20, sample: 3 }), 73);

// ---------------------------------------------------------------------------
// calculateOrderSummary: честная выручка (удержание 1 - 0.07 - 0.065 - 0.01 = 0.855)
// ---------------------------------------------------------------------------
const P = { taxRate: 0.07, commercialRate: 0.065, charityRate: 0.01, vatRate: 0.05 };

const lemonItem = { quantity: 100, sell_price_item: 5900, result: { costTotal: 971.35 },
    tirage_allocation: { stock: 30, partner: 50, gift: 20, stock_price: 5900 } };
const s = calculateOrderSummary([lemonItem], [], [], [], P, [], {});
assert.equal(s.totalRevenue, 177000);
assert.equal(s.stockRevenue, 177000);
assert.equal(s.clientRevenue, 0);
assert.equal(s.freeQty, 70);
assert.equal(s.freeCost, 67994.5);
assert.equal(s.totalEarned, 54200);
assert.equal(s.marginPercent, 30.62);
assert.equal(s.stockQty, 30);
assert.equal(s.grossRevenue, 177000);
assert.equal(s.discountAmount, 0);

// без разметки — как раньше
const plain0 = calculateOrderSummary([{ ...lemonItem, tirage_allocation: null }], [], [], [], P, [], {});
assert.equal(plain0.totalRevenue, 590000);
assert.equal(plain0.totalEarned, 407315);
// ... и новые поля нейтральны: вся выручка клиентская, бесплатного нет
assert.equal(plain0.clientRevenue, 590000);
assert.deepEqual([plain0.stockRevenue, plain0.stockQty, plain0.freeQty, plain0.freeCost], [0, 0, 0, 0]);
// разметка «всё клиенту» / пустая / на нулевой тираж — тоже как раньше
[{ client: 100 }, {}, { stock: 0, partner: 0 }].forEach(allocation => {
    const same = calculateOrderSummary([{ ...lemonItem, tirage_allocation: allocation }], [], [], [], P, [], {});
    assert.deepEqual(plain(same), plain(plain0), `разметка ${JSON.stringify(allocation)} не должна менять цифры`);
});
const zeroQty = calculateOrderSummary([{ ...lemonItem, quantity: 0 }], [], [], [], P, [], {});
assert.deepEqual([zeroQty.totalRevenue, zeroQty.totalEarned, zeroQty.stockQty, zeroQty.freeQty], [0, 0, 0, 0]);

// Заказ без разметки целиком (фурнитура со строкой и на весь заказ, упаковка, подвес, доп. доход, скидка):
// цифры сняты с расчёта до разметки тиража и не должны сдвинуться ни на копейку.
const legacyItems = [
    { quantity: 120, sell_price_item: 450, printings: [{ name: 'Логотип', qty: 120, price: 12, sell_price: 35 }], result: { costTotal: 188.4 } },
    { quantity: 30, sell_price_item: 1290, result: { costTotal: 640.15 } },
];
const legacyHardware = [
    { qty: 120, sell_price: 18, parent_item_index: 0, result: { costPerUnit: 9.5 } },
    { qty: 30, sell_price: 0, parent_item_index: null, result: { costPerUnit: 4 } },
];
const legacyPackaging = [{ qty: 150, sell_price: 25, parent_item_index: null, result: { costPerUnit: 11.2 } }];
const legacyPendants = [{ quantity: 10, result: { totalRevenue: 4500, sellPerUnit: 450, costPerUnit: 190 } }];
const pickMoney = r => [r.grossRevenue, r.discountAmount, r.totalRevenue, r.vatOnRevenue, r.totalWithVat, r.totalEarned, r.marginPercent];
assert.deepEqual(
    pickMoney(calculateOrderSummary(legacyItems, legacyHardware, legacyPackaging, [{ amount: 3000 }], P, legacyPendants, { mode: 'percent', value: 7.5 })),
    [110310, 8273.25, 102036.75, 5101.84, 107138.59, 40590.27, 39.78]);
assert.deepEqual(
    pickMoney(calculateOrderSummary(legacyItems, legacyHardware, legacyPackaging, [{ amount: 3000 }], P, legacyPendants, { mode: 'amount', value: 4000 })),
    [110310, 4000, 106310, 5315.5, 111625.5, 44243.9, 41.62]);

// скидка только на «клиенту»
const a = { quantity: 50, sell_price_item: 1000, result: { costTotal: 100 } };
const b = { quantity: 50, sell_price_item: 2000, result: { costTotal: 200 }, tirage_allocation: { stock: 50, stock_price: 2000 } };
const d = calculateOrderSummary([a, b], [], [], [], P, [], { mode: 'percent', value: 10 });
assert.equal(d.discountAmount, 5000);
assert.equal(d.totalRevenue, 145000);
assert.equal(d.totalEarned, 108975);
assert.equal(d.grossRevenue, 150000);
assert.equal(d.clientRevenue, 45000, 'выручка «клиенту» показана после скидки');
assert.equal(d.stockRevenue, 100000, 'выручка «на продажу» скидкой не трогается');
assert.equal(d.clientRevenue + d.stockRevenue, d.totalRevenue);
const big = calculateOrderSummary([a, b], [], [], [], P, [], { mode: 'amount', value: 80000 });
assert.equal(big.discountAmount, 50000);
assert.equal(big.totalRevenue, 100000);
assert.equal(big.clientRevenue, 0);
// у «Лимона» клиентской выручки нет — скидке не от чего считаться
const lemonDiscount = calculateOrderSummary([lemonItem], [], [], [], P, [], { mode: 'amount', value: 5000 });
assert.equal(lemonDiscount.discountAmount, 0);
assert.equal(lemonDiscount.totalRevenue, 177000);
assert.equal(lemonDiscount.totalEarned, 54200);

// фурнитура строки с ценой: выручка только с доли «клиенту»
const hw = { qty: 100, sell_price: 10, parent_item_index: 0, result: { costPerUnit: 5 } };
const withHw = calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }], [hw], [], [], P, [], {});
assert.equal(withHw.totalRevenue, 40 * 5900 + 40 * 10);
// заработок: изделие 40 * 4073.15 - 60 * 971.35 = 104645, фурнитура 0.4 * 100 * 3.55 - 0.6 * 100 * 5 = -158
assert.equal(withHw.totalEarned, 104487);
// строка из снимка заказа называет родителя по-другому — результат тот же
const snapshotShapedHw = { qty: 100, sell_price: 10, hardware_parent_item_index: 0, result: { costPerUnit: 5 } };
assert.deepEqual(
    plain(calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }], [snapshotShapedHw], [], [], P, [], {})),
    plain(withHw));
// упаковка работает так же
const pkg = { qty: 100, sell_price: 10, packaging_parent_item_index: 0, result: { costPerUnit: 5 } };
const withPkg = calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }], [], [pkg], [], P, [], {});
assert.equal(withPkg.totalRevenue, 40 * 5900 + 40 * 10);
assert.equal(withPkg.totalEarned, 104487);
// фурнитура на весь заказ (без родителя) и фурнитура неразмеченной строки — как раньше
const orderLevelHw = { qty: 100, sell_price: 10, parent_item_index: null, result: { costPerUnit: 5 } };
const withOrderHw = calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }], [orderLevelHw], [], [], P, [], {});
assert.equal(withOrderHw.totalRevenue, 40 * 5900 + 100 * 10);
const otherLineHw = { qty: 100, sell_price: 10, parent_item_index: 1, result: { costPerUnit: 5 } };
const withOtherLineHw = calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }, a], [otherLineHw], [], [], P, [], {});
assert.equal(withOtherLineHw.totalRevenue, 40 * 5900 + 50 * 1000 + 100 * 10);
// родитель — вторая строка (индекс = место в списке изделий, даже если перед ней есть строка без расчёта)
const hwOfSecondLine = { qty: 100, sell_price: 10, parent_item_index: 1, result: { costPerUnit: 5 } };
const splitSecond = { ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } };
assert.equal(calculateOrderSummary([a, splitSecond], [hwOfSecondLine], [], [], P, [], {}).totalRevenue, 50 * 1000 + 40 * 5900 + 40 * 10);
assert.equal(calculateOrderSummary([{ ...a, result: null }, splitSecond], [hwOfSecondLine], [], [], P, [], {}).totalRevenue, 40 * 5900 + 40 * 10);

// печать: «клиенту» платит цену изделия + печати, «на продажу» — свою цену
const printed = { quantity: 10, sell_price_item: 100, result: { costTotal: 60 },
    printings: [{ name: 'Логотип', qty: 10, price: 5, sell_price: 20 }],
    tirage_allocation: { stock: 4, stock_price: 90, partner: 2 } };
const withPrint = calculateOrderSummary([printed], [], [], [], P, [], {});
assert.equal(withPrint.clientRevenue, 4 * 120);
assert.equal(withPrint.stockRevenue, 4 * 90);
assert.equal(withPrint.totalRevenue, 840);
assert.equal(withPrint.totalEarned, 118.2);
assert.equal(withPrint.marginPercent, 14.07);
assert.deepEqual([withPrint.stockQty, withPrint.freeQty, withPrint.freeCost], [4, 2, 120]);
// цена «на продажу» не задана — берётся цена строки вместе с печатью
const defaultPrice = calculateOrderSummary([{ ...printed, tirage_allocation: { stock: 4, partner: 2 } }], [], [], [], P, [], {});
assert.equal(defaultPrice.stockRevenue, 4 * 120);

// в одной строке и «клиенту», и «на продажу»; скидка — только на клиентскую часть
const mixed = { quantity: 100, sell_price_item: 1000, result: { costTotal: 100 },
    tirage_allocation: { stock: 40, stock_price: 800 } };
const mixedDiscount = calculateOrderSummary([mixed], [], [], [], P, [], { mode: 'percent', value: 10 });
assert.equal(mixedDiscount.discountAmount, 6000);
assert.equal(mixedDiscount.clientRevenue, 54000);
assert.equal(mixedDiscount.stockRevenue, 32000);
assert.equal(mixedDiscount.totalRevenue, 86000);
assert.equal(mixedDiscount.totalEarned, 63530);

// строка целиком бесплатная: выручки нет, затраты есть
const giveaway = calculateOrderSummary([{ quantity: 10, sell_price_item: 100, result: { costTotal: 50 }, tirage_allocation: { gift: 10 } }], [], [], [], P, [], {});
assert.deepEqual([giveaway.totalRevenue, giveaway.totalEarned, giveaway.marginPercent, giveaway.freeQty, giveaway.freeCost], [0, -500, 0, 10, 500]);

// несколько размеченных строк складываются
const twoLines = calculateOrderSummary([lemonItem, printed], [], [], [], P, [], {});
assert.deepEqual([twoLines.stockQty, twoLines.freeQty, twoLines.freeCost, twoLines.stockRevenue], [34, 72, 68114.5, 177360]);

// строка без расчёта (result) по-прежнему пропускается
assert.equal(calculateOrderSummary([{ ...lemonItem, result: null }], [], [], [], P, [], {}).totalRevenue, 0);

// «Отдаём бесплатно» — вместе с фурнитурой и упаковкой бесплатных штук строки:
// доля бесплатных = (партнёр + подарки + образцы) / тираж строки
const lemonHw = { qty: 100, sell_price: 10, parent_item_index: 0, result: { costPerUnit: 5 } };
const lemonWithHw = calculateOrderSummary([lemonItem], [lemonHw], [], [], P, [], {});
assert.equal(lemonWithHw.freeQty, 70, 'штуки — только изделия');
assert.equal(lemonWithHw.freeCost, round2Test(67994.5 + 100 * 5 * 0.7));
assert.equal(lemonWithHw.totalEarned, 53700, 'фурнитура не клиентской доли — чистая себестоимость');
const lemonPkg = { qty: 100, sell_price: 0, packaging_parent_item_index: 0, result: { costPerUnit: 8 } };
assert.equal(calculateOrderSummary([lemonItem], [lemonHw], [lemonPkg], [], P, [], {}).freeCost,
    round2Test(67994.5 + 100 * 5 * 0.7 + 100 * 8 * 0.7));
// 40 клиенту / 60 партнёру: бесплатная доля фурнитуры — 0.6
const withHwFree = calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }], [hw], [], [], P, [], {});
assert.equal(withHwFree.freeCost, round2Test(60 * 971.35 + 100 * 5 * 0.6));
// фурнитура на весь заказ и фурнитура неразмеченной строки в «бесплатно» не попадают
assert.equal(calculateOrderSummary([lemonItem], [{ ...lemonHw, parent_item_index: null }], [], [], P, [], {}).freeCost, 67994.5);
assert.equal(calculateOrderSummary([lemonItem, a], [{ ...lemonHw, parent_item_index: 1 }], [], [], P, [], {}).freeCost, 67994.5);
// «на продажу» — не бесплатно: строка целиком на продажу бесплатной фурнитуры не даёт
assert.equal(calculateOrderSummary([b], [{ ...lemonHw, parent_item_index: 0 }], [], [], P, [], {}).freeCost, 0);

// ---------------------------------------------------------------------------
// calculateFinDirectorData («Смета для финдиректора»): те же честные деньги, что и в смете
// ---------------------------------------------------------------------------
// Затраты строки финдиректор берёт из раскладки себестоимости штуки.
const lemonFin = { ...lemonItem, result: { costTotal: 971.35, costFot: 300, costIndirect: 500, costPlastic: 100, costMoldAmortization: 71.35 } };
const finSplit = calculateFinDirectorData([lemonFin], [], [], P, [], {});
assert.equal(finSplit.revenue, calculateOrderSummary([lemonFin], [], [], [], P, [], {}).totalRevenue);
assert.deepEqual([finSplit.grossRevenue, finSplit.revenue, finSplit.revenueNet, finSplit.revenueWithVat], [177000, 177000, 177000, 185850]);
assert.equal(finSplit.taxes, round2Test(finSplit.revenue * 0.07));
// налог, коммерческий процент и благотворительность зависят только от выручки:
// у «Лимона» они такие же, как у заказа, где честно продали 30 штук по 5 900 ₽
const finSold30 = calculateFinDirectorData([{ ...lemonFin, quantity: 30, tirage_allocation: null }], [], [], P, [], {});
assert.deepEqual([finSplit.taxes, finSplit.commercial, finSplit.charity], [finSold30.taxes, finSold30.commercial, finSold30.charity]);
// затраты — на весь тираж: как у тех же 100 штук без разметки
const finPlain = calculateFinDirectorData([{ ...lemonFin, tirage_allocation: null }], [], [], P, [], {});
const pickCosts = f => [f.salary, f.indirect, f.hardwarePurchase, f.nfcTotal, f.hardwareDelivery, f.packagingPurchase,
    f.packagingDelivery, f.design, f.printing, f.plastic, f.molds, f.delivery];
assert.deepEqual(pickCosts(finSplit), pickCosts(finPlain));
assert.deepEqual(pickCosts(finSplit), [30000, 50000, 0, 0, 0, 0, 0, 0, 0, 10000, 7135, 0]);
assert.equal(finPlain.revenue, 590000, 'без разметки финдиректор считает весь тираж, как раньше');
assert.equal(finSplit.totalCosts, 97135 + finSplit.taxes + finSplit.commercial + finSplit.charity);
// скидка у финдиректора — тоже только на «клиенту», как в смете
const finDiscount = calculateFinDirectorData([a, b], [], [], P, [], { mode: 'percent', value: 10 });
assert.deepEqual([finDiscount.grossRevenue, finDiscount.discountAmount, finDiscount.discountPercent, finDiscount.revenue],
    [150000, 5000, 10, d.totalRevenue]);
assert.equal(finDiscount.taxes, round2Test(145000 * 0.07));
const finBigDiscount = calculateFinDirectorData([a, b], [], [], P, [], { mode: 'amount', value: 80000 });
assert.deepEqual([finBigDiscount.discountAmount, finBigDiscount.revenue], [50000, big.totalRevenue]);
// фурнитура и упаковка размеченной строки: выручка — с доли «клиенту», закупка — на весь тираж
const finSplitLine = { ...lemonFin, tirage_allocation: { client: 40, stock: 0, partner: 60 } };
const finHw = calculateFinDirectorData([finSplitLine],
    [{ ...hw, price: 4, delivery_price: 1, result: { costPerUnit: 5, hoursHardware: 0, indirectPerUnit: 0 } }], [], P, [], {});
assert.equal(finHw.revenue, withHw.totalRevenue);
assert.deepEqual([finHw.hardwarePurchase, finHw.hardwareDelivery], [400, 100]);
const finPkg = calculateFinDirectorData([finSplitLine],
    [], [{ ...pkg, price: 4, delivery_price: 1, result: { costPerUnit: 5, hoursPackaging: 0, indirectPerUnit: 0 } }], P, [], {});
assert.equal(finPkg.revenue, withPkg.totalRevenue);
assert.deepEqual([finPkg.packagingPurchase, finPkg.packagingDelivery], [400, 100]);
// печать: «клиенту» платит изделие + печать, «на продажу» — свою цену
assert.equal(calculateFinDirectorData([printed], [], [], P, [], {}).revenue, withPrint.totalRevenue);

// Заказ без разметки: цифры финдиректора сняты с расчёта до этой правки и не должны сдвинуться.
const finParams = { ...P, fotPerHour: 100, indirectPerHour: 50 };
const finLegacyItems = [
    { quantity: 120, sell_price_item: 450, printings: [{ name: 'Логотип', qty: 120, price: 12, sell_price: 35 }],
        result: { costTotal: 188.4, costFot: 20, costIndirect: 30, costPlastic: 12.5, costPrinting: 13.1, costMoldAmortization: 4.4, costDelivery: 0 } },
    { quantity: 30, sell_price_item: 1290, result: { costTotal: 640.15, costFot: 80, costIndirect: 120, costPlastic: 40, costMoldAmortization: 10 } },
];
const finLegacyHardware = [
    { qty: 120, price: 6, delivery_price: 1, sell_price: 18, parent_item_index: 0, result: { costPerUnit: 9.5, hoursHardware: 1.2, indirectPerUnit: 0.6 } },
    { qty: 30, price: 3, delivery_price: 0.5, sell_price: 0, parent_item_index: null, result: { costPerUnit: 4, hoursHardware: 0.3, indirectPerUnit: 0.2 } },
];
const finLegacyPackaging = [{ qty: 150, price: 8, delivery_price: 1.2, sell_price: 25, parent_item_index: null,
    result: { costPerUnit: 11.2, hoursPackaging: 2, indirectPerUnit: 0.4 } }];
const finLegacyPendants = [{ quantity: 10, elements: [], cords: [], carabiners: [],
    result: { totalRevenue: 4500, sellPerUnit: 450, costPerUnit: 190, assemblyHours: 1, packagingHours: 0.5, attachmentIndirectTotal: 25 } }];
const finLegacyCosts = { salary: 5300, indirect: 7363, hardwarePurchase: 810, nfcTotal: 0, hardwareDelivery: 135, packagingPurchase: 1200,
    packagingDelivery: 180, design: 0, printing: 1572, plastic: 2700, molds: 828, delivery: 0 };
[
    [{}, { ...finLegacyCosts, taxes: 7511.7, commercial: 7511.7, charity: 1073.1, grossRevenue: 107310, discountAmount: 0,
        discountPercent: 0, revenueNet: 107310, revenueWithVat: 112675.5, revenue: 107310, totalCosts: 36184.5 }],
    [{ mode: 'percent', value: 7.5 }, { ...finLegacyCosts, taxes: 6948.32, commercial: 6948.32, charity: 992.62, grossRevenue: 107310,
        discountAmount: 8048.25, discountPercent: 7.5, revenueNet: 99261.75, revenueWithVat: 104224.84, revenue: 99261.75, totalCosts: 34977.26 }],
    [{ mode: 'amount', value: 4000 }, { ...finLegacyCosts, taxes: 7231.7, commercial: 7231.7, charity: 1033.1, grossRevenue: 107310,
        discountAmount: 4000, discountPercent: 3.73, revenueNet: 103310, revenueWithVat: 108475.5, revenue: 103310, totalCosts: 35584.5 }],
].forEach(([discount, expected]) => {
    assert.deepEqual(
        plain(calculateFinDirectorData(finLegacyItems, finLegacyHardware, finLegacyPackaging, finParams, finLegacyPendants, discount)),
        expected,
        `финдиректор без разметки (${JSON.stringify(discount)}) не меняется`);
});

// некоммерческие назначения («Переделка», «Сток / образец») разметку не учитывают
const rework = applyProductionPurposeToOrderSummary(s, 'rework', [lemonItem], [], [], []);
assert.deepEqual(
    [rework.totalRevenue, rework.totalEarned, rework.clientRevenue, rework.stockRevenue, rework.stockQty, rework.freeQty, rework.freeCost],
    [0, -97135, 0, 0, 0, 0, 0]);
const commercial = applyProductionPurposeToOrderSummary(s, 'commercial', [lemonItem], [], [], []);
assert.deepEqual([commercial.totalRevenue, commercial.stockRevenue, commercial.freeQty], [177000, 177000, 70]);

// ---------------------------------------------------------------------------
// getOrderLiveCalculatorSnapshot: разметка из item_data доезжает до денег заказа
// ---------------------------------------------------------------------------
const snapshotParams = {
    ...P,
    setupHoursBlank: 0.5,
    setupHoursCustom: 1,
    wasteFactor: 1,
    fotPerHour: 100,
    indirectPerHour: 0,
    indirectCostMode: 'all',
    plasticCostPerKg: 0,
    moldBaseCost: 0,
    cuttingSpeed: 0,
    nfcWriteSpeed: 0,
    nfcTagCost: 0,
    plasticHours: 100,
    packagingHours: 100,
};
const lemonAllocation = { stock: 30, partner: 50, gift: 20, stock_price: 5900 };
const lemonRow = extra => ({
    item_type: 'product',
    product_name: 'Лимон',
    quantity: 100,
    sell_price_item: 5900,
    pieces_per_hour: 100,
    weight_grams: 0,
    is_blank_mold: false,
    base_mold_in_stock: true,
    ...extra,
});
const expectLemonSnapshot = (snapshot, label) => {
    assert.equal(snapshot.revenue, 177000, `${label}: выручка = только 30 штук «на продажу»`);
    assert.equal(snapshot.summary.stockRevenue, 177000, label);
    assert.equal(snapshot.summary.clientRevenue, 0, label);
    assert.equal(snapshot.summary.stockQty, 30, label);
    assert.equal(snapshot.summary.freeQty, 70, label);
    const unitCost = snapshot.products[0].result.costTotal;
    assert.ok(unitCost > 0, `${label}: у штуки есть себестоимость`);
    assert.equal(snapshot.summary.freeCost, Math.round(70 * unitCost * 100) / 100, label);
    assert.equal(
        snapshot.summary.totalEarned,
        Math.round((30 * (5900 * 0.855 - unitCost) - 70 * unitCost) * 100) / 100,
        `${label}: затраты на весь тираж, прибыль только с проданного`);
};

// строка заказа: разметка внутри item_data
expectLemonSnapshot(
    getOrderLiveCalculatorSnapshot({}, [lemonRow({ item_data: { tirage_allocation: lemonAllocation } })], snapshotParams, []),
    'item_data-объект');
// item_data бывает JSON-строкой, а разметка внутри — тоже строкой
expectLemonSnapshot(
    getOrderLiveCalculatorSnapshot({}, [lemonRow({ item_data: JSON.stringify({ tirage_allocation: lemonAllocation }) })], snapshotParams, []),
    'item_data-строка');
expectLemonSnapshot(
    getOrderLiveCalculatorSnapshot({}, [lemonRow({ item_data: { tirage_allocation: JSON.stringify(lemonAllocation) } })], snapshotParams, []),
    'разметка-строка');
// разметка доезжает до изделия снимка (карточка и доска берут её оттуда)
const lemonSnapshot = getOrderLiveCalculatorSnapshot({}, [lemonRow({ item_data: { tirage_allocation: lemonAllocation } })], snapshotParams, []);
assert.deepEqual(plain(lemonSnapshot.products[0].tirage_allocation), lemonAllocation);

// без разметки (старые строки, null) — как раньше, ничего не появляется
const oldSnapshot = getOrderLiveCalculatorSnapshot({}, [lemonRow({})], snapshotParams, []);
assert.equal(oldSnapshot.revenue, 590000);
assert.equal(oldSnapshot.summary.stockQty, 0);
assert.equal(oldSnapshot.summary.freeQty, 0);
assert.equal('tirage_allocation' in oldSnapshot.products[0], false);
const nullSnapshot = getOrderLiveCalculatorSnapshot({}, [lemonRow({ item_data: { tirage_allocation: null } })], snapshotParams, []);
assert.equal(nullSnapshot.revenue, 590000);
assert.equal(nullSnapshot.products[0].tirage_allocation ?? null, null, 'null в item_data остаётся «нет разметки»');
const brokenSnapshot = getOrderLiveCalculatorSnapshot({}, [lemonRow({ item_data: { tirage_allocation: '{не json' } })], snapshotParams, []);
assert.equal(brokenSnapshot.revenue, 590000, 'испорченная разметка = нет разметки');

// фурнитура строки заказа называет родителя hardware_parent_item_index
const hardwareRow = parent => ({
    item_type: 'hardware',
    product_name: 'Карабин',
    quantity: 100,
    sell_price_hardware: 10,
    hardware_price_per_unit: 5,
    hardware_parent_item_index: parent,
});
const splitWithHw = getOrderLiveCalculatorSnapshot({}, [
    lemonRow({ item_data: { tirage_allocation: { client: 40, partner: 60 } } }),
    hardwareRow(0),
], snapshotParams, []);
assert.equal(splitWithHw.revenue, 40 * 5900 + 40 * 10, 'фурнитура продаётся только на 40 клиентских штук');
const splitWithOrderHw = getOrderLiveCalculatorSnapshot({}, [
    lemonRow({ item_data: { tirage_allocation: { client: 40, partner: 60 } } }),
    hardwareRow(null),
], snapshotParams, []);
assert.equal(splitWithOrderHw.revenue, 40 * 5900 + 100 * 10, 'фурнитура на весь заказ разметкой не режется');

// некоммерческий заказ разметку не учитывает
const reworkSnapshot = getOrderLiveCalculatorSnapshot({ production_purpose: 'rework' },
    [lemonRow({ item_data: { tirage_allocation: lemonAllocation } })], snapshotParams, []);
assert.equal(reworkSnapshot.revenue, 0);
assert.equal(reworkSnapshot.summary.freeQty, 0);
assert.equal(reworkSnapshot.summary.stockRevenue, 0);

// B2C-заказы из маркетплейсов разметку не используют: весь тираж уходит на склад готовой продукции.
// Правило то же, что у Orders._shouldSyncOrderToReadyGoods: клиент «B2C» без учёта регистра.
assert.deepEqual(['B2C', 'b2c', 'ООО B2C', '', null, undefined].map(name => isB2CClientName(name)),
    [true, true, false, false, false, false]);
[{ client_name: 'B2C' }, { client_name: 'b2c' }].forEach(order => {
    const b2cSplit = getOrderLiveCalculatorSnapshot(order,
        [lemonRow({ item_data: { tirage_allocation: lemonAllocation } }), hardwareRow(0)], snapshotParams, []);
    const b2cPlain = getOrderLiveCalculatorSnapshot(order, [lemonRow({}), hardwareRow(0)], snapshotParams, []);
    assert.deepEqual(plain(b2cSplit.summary), plain(b2cPlain.summary), `${order.client_name}: сохранённая разметка не учитывается`);
    assert.equal(b2cSplit.revenue, 590000 + 100 * 10);
});
assert.equal(getOrderLiveCalculatorSnapshot({ client_name: 'ООО Лимон' },
    [lemonRow({ item_data: { tirage_allocation: lemonAllocation } })], snapshotParams, []).revenue, 177000,
'у обычного клиента разметка работает');

// ---------------------------------------------------------------------------
// allocateRealCostToRows: себестоимость платной штуки по строкам (склад готовой продукции)
// ---------------------------------------------------------------------------
// «Лимон»: одна строка — все реальные затраты заказа (121 000 ₽) на 30 платных штук
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 97135, paidQty: 30 }], 121000), { 1: 4033.33 });
// затраты делятся между строками пропорционально плановой себестоимости, затем на платные штуки строки
assert.deepEqual(allocateRealCostToRows([
    { key: '1', planCost: 30000, paidQty: 100 },
    { key: '2', planCost: 10000, paidQty: 10 },
], 60000), { 1: 450, 2: 1500 });
// плана нет совсем — делим по платным штукам
assert.deepEqual(allocateRealCostToRows([
    { key: '1', planCost: 0, paidQty: 10 },
    { key: '2', planCost: 0, paidQty: 30 },
], 4000), { 1: 100, 2: 100 });
// у строки нет платных штук — штуке на складе взяться неоткуда
assert.equal(allocateRealCostToRows([{ key: '1', planCost: 500, paidQty: 0 }], 900)['1'], 0);

// строка без платных штук забирает свою долю затрат: остальные строки её не доплачивают
assert.deepEqual(allocateRealCostToRows([
    { key: 'a', planCost: 1000, paidQty: 0 },
    { key: 'b', planCost: 3000, paidQty: 10 },
], 8000), { a: 0, b: 600 });
// округление до копеек
assert.deepEqual(allocateRealCostToRows([{ key: 'x', planCost: 1, paidQty: 3 }], 100), { x: 33.33 });
assert.deepEqual(allocateRealCostToRows([{ key: 'x', planCost: 1, paidQty: 3 }], 200), { x: 66.67 });
// ключ может быть числом (номер строки) — в ответе он обычный ключ объекта
assert.deepEqual(allocateRealCostToRows([{ key: 0, planCost: 10, paidQty: 5 }], 50), { 0: 10 });
// деньги не теряются и не придумываются: сумма по платным штукам = затраты с точностью до копейки на штуку
const conserved = [
    { key: '1', planCost: 97135, paidQty: 30 },
    { key: '2', planCost: 25000, paidQty: 7 },
    { key: '3', planCost: 4100, paidQty: 12 },
];
const conservedUnit = allocateRealCostToRows(conserved, 150000);
const conservedSum = conserved.reduce((sum, row) => sum + conservedUnit[row.key] * row.paidQty, 0);
assert.ok(Math.abs(conservedSum - 150000) <= 0.005 * (30 + 7 + 12) + 1e-9, `сумма по штукам ${conservedSum} должна сходиться с затратами`);

// пустые и испорченные данные: никаких NaN и исключений
assert.deepEqual(allocateRealCostToRows([], 1000), {});
assert.deepEqual(allocateRealCostToRows(null, 1000), {});
assert.deepEqual(allocateRealCostToRows(undefined, 1000), {});
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 100, paidQty: 5 }], 0), { 1: 0 }, 'затрат нет — штука ничего не стоит');
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 100, paidQty: 5 }], -500), { 1: 0 }, 'отрицательные затраты не бывают');
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 100, paidQty: 5 }], 'мусор'), { 1: 0 });
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 0, paidQty: 0 }], 500), { 1: 0 }, 'ни плана, ни платных штук');
assert.deepEqual(allocateRealCostToRows([
    { key: '1', planCost: '30 000', paidQty: '100' },
    { key: '2', planCost: -5, paidQty: 'abc' },
    null,
], '60000'), { 1: 600, 2: 0 }, 'числа из строк читаются, отрицательное и мусор = 0, пустая строка списка пропускается');

// computeRealMargin: реальная маржа карточки — заработок по калькулятору за вычетом перерасхода
// себестоимости против плана («Факт» − план), от выручки
// «Лимон»: (54 200 − (121 000 − 97 135)) / 177 000
assert.equal(computeRealMargin(54200, 177000, 121000, 97135), 17.14);
// себестоимость как в плане (в том числе без табеля: итог «Факта» = план) — маржа плановая
assert.equal(computeRealMargin(54200, 177000, 97135, 97135), 30.62);
// дешевле плана — маржа выше
assert.equal(computeRealMargin(54200, 177000, 90000, 97135), Math.round((54200 + 7135) * 100 / 177000 * 100) / 100);
// числа из строк читаются
assert.equal(computeRealMargin('54200', '177000', '121000', '97135'), 17.14);
// считать не из чего — null, а не 0 и не NaN
assert.equal(computeRealMargin(54200, 0, 121000, 97135), null, 'нет выручки');
assert.equal(computeRealMargin(54200, -5, 121000, 97135), null, 'отрицательная выручка');
assert.equal(computeRealMargin(null, 177000, 121000, 97135), null, 'заработок неизвестен');
assert.equal(computeRealMargin(54200, 177000, undefined, 97135), null, 'реальной себестоимости нет');
assert.equal(computeRealMargin(54200, 177000, 121000, ''), null, 'плановой нет');
assert.equal(computeRealMargin(54200, 177000, 'мусор', 97135), null);

console.log('tirage-allocation-smoke: OK');

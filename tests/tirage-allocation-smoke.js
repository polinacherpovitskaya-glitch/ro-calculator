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
    applyProductionPurposeToOrderSummary,
    getOrderLiveCalculatorSnapshot,
};`, context, { filename: 'js/calculator.js' });

const {
    normalizeTirageAllocation: normalizeInContext,
    hasTirageSplit,
    getTirageFreeQty,
    TIRAGE_PARTS,
    calculateOrderSummary,
    applyProductionPurposeToOrderSummary,
    getOrderLiveCalculatorSnapshot,
} = context.__tirage;

// Объекты из vm-контекста имеют чужие прототипы: для deepEqual приводим к обычным.
const plain = value => JSON.parse(JSON.stringify(value));
const normalizeTirageAllocation = (...args) => plain(normalizeInContext(...args));

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

console.log('tirage-allocation-smoke: OK');

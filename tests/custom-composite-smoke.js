const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');
const context = vm.createContext({ console, Math, Date, JSON, Number, String, Array, Object, Set, Map });
vm.runInContext(`${source}
globalThis.__t = {
    normalizeCustomParts, isCustomCompositeItem, getCustomCompositeIssue, getCustomCompositeSummary,
    getItemSetupHours, calculateItemCost, calculateFinDirectorData, getEmptyCostResult,
};`, context, { filename: 'js/calculator.js' });
const t = context.__t;
const plain = value => JSON.parse(JSON.stringify(value));

const params = {
    setupHoursBlank: 0.5,
    setupHoursCustom: 1,
    wasteFactor: 1,
    fotPerHour: 100,
    indirectPerHour: 0,
    indirectCostMode: 'all',
    plasticCostPerKg: 1000,
    moldBaseCost: 10000,
    designCost: 0,
    cuttingSpeed: 300,
    nfcWriteSpeed: 0,
    nfcTagCost: 0,
    printingDeliveryCost: 0,
    deliveryCostMoscow: 0,
    taxRate: 0,
    charityRate: 0,
    commercialRate: 0,
    vatRate: 0,
};

function compositeItem(overrides = {}) {
    return {
        quantity: 500,
        is_blank_mold: false,
        custom_composite: true,
        // Устаревшие поля позиции — движок должен их игнорировать.
        pieces_per_hour: 999,
        weight_grams: 999,
        base_mold_in_stock: true,
        extra_molds: 0,
        colors: [{ id: 1, name: 'Белый' }],
        custom_parts: [
            { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: false },
            { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: false },
        ],
        ...overrides,
    };
}

// --- Сводка: пример из спеки ---
const summary = plain(t.getCustomCompositeSummary(compositeItem()));
assert.equal(summary.piecesPerHour, 30, '1 / (1/60 + 2/120) = 30 finished items per hour');
assert.equal(summary.weightGrams, 40, '30 + 2 × 5 = 40 g');
assert.equal(summary.piecesPerItem, 3, 'one body + two buttons are cast per item');
assert.equal(summary.newMoldCount, 2, 'every part needs its own new mold regardless of qty');
assert.equal(summary.allMoldsInStock, false);

// --- Себестоимость примера ---
assert.equal(t.getItemSetupHours(compositeItem(), params), 2.5, '1 h per new part mold + 0.5 h per colour');
const cost = t.calculateItemCost(compositeItem(), params);
assert.equal(cost.hoursPlastic, 19.17, '2.5 h setup + 500 / 30 h runtime');
assert.equal(cost.costMoldAmortization, 40, '2 new molds × 10000 / 500');
assert.equal(cost.hoursCutting, 5, 'sprues are cut on 1500 cast pieces at 300 per hour');
assert.equal(cost.costPlastic, 40, 'plastic uses the summed 40 g weight');

// --- Молды на складе и доп. молды ---
const oneInStock = compositeItem({
    custom_parts: [
        { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: true },
        { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: false },
    ],
});
assert.equal(t.getCustomCompositeSummary(oneInStock).newMoldCount, 1);
assert.equal(t.getItemSetupHours(oneInStock, params), 1.5, 'stock part mold skips its setup hour');
assert.equal(t.calculateItemCost(oneInStock, params).costMoldAmortization, 20);

const allInStock = compositeItem({
    base_mold_in_stock: false,
    custom_parts: [
        { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: true },
        { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: true },
    ],
});
assert.equal(t.getCustomCompositeSummary(allInStock).allMoldsInStock, true);
assert.equal(t.getItemSetupHours(allInStock, params), 0.5, 'only the colour change remains');
assert.equal(t.calculateItemCost(allInStock, params).costMoldAmortization, 0);

const allInStockPlusExtra = { ...allInStock, extra_molds: 1 };
assert.equal(t.getItemSetupHours(allInStockPlusExtra, params), 1.5, 'extra mold adds one setup hour');
assert.equal(t.calculateItemCost(allInStockPlusExtra, params).costMoldAmortization, 20);

assert.equal(
    t.getItemSetupHours(compositeItem({ setup_hours_override: 0.75 }), params),
    0.75,
    'an explicit setup override still wins',
);

// --- Сборка частей ---
const withAssembly = t.calculateItemCost(compositeItem({ builtin_assembly_name: 'Сборка частей', builtin_assembly_speed: 60 }), params);
assert.equal(withAssembly.hoursBuiltinAssembly, 8.33, '500 items at 60 per hour');
assert.equal(withAssembly.hoursAssemblyZone, 8.33);

// --- JSON-строка из БД = массив ---
const fromJson = compositeItem({ custom_parts: JSON.stringify(compositeItem().custom_parts) });
assert.deepEqual(plain(t.calculateItemCost(fromJson, params)), plain(cost));

// --- Незаполненный составной режим не считается по устаревшим полям ---
const missingPph = compositeItem({
    custom_parts: [
        { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1 },
        { name: 'Кнопка', pieces_per_hour: 0, weight_grams: 5, qty: 2 },
    ],
});
assert.equal(t.getCustomCompositeSummary(missingPph), null);
assert.equal(t.getCustomCompositeIssue(missingPph), 'Заполните шт/ч у части 2');
assert.equal(t.calculateItemCost(missingPph, params).costTotal, 0);
assert.equal(t.calculateItemCost(missingPph, params).hoursPlastic, 0);

const onePart = compositeItem({ custom_parts: [compositeItem().custom_parts[0]] });
assert.equal(t.getCustomCompositeIssue(onePart), 'Нужно минимум 2 части');
assert.equal(t.calculateItemCost(onePart, params).costTotal, 0);

// --- Нормализация частей ---
assert.deepEqual(plain(t.normalizeCustomParts([
    { name: '  Крышка ', pieces_per_hour: '40,5', weight_grams: '', qty: 0, mold_in_stock: 'true' },
    null,
    'junk',
])), [
    { name: 'Крышка', pieces_per_hour: 40.5, weight_grams: 0, qty: 1, mold_in_stock: true },
]);
assert.deepEqual(plain(t.normalizeCustomParts({ custom_parts: 'not json' })), []);

// --- Совместимость: без режима и у бланка части игнорируются ---
const legacyCustom = {
    quantity: 500, is_blank_mold: false, pieces_per_hour: 40, weight_grams: 12,
    extra_molds: 1, base_mold_in_stock: false, colors: [{ id: 1 }],
};
const legacyWithParts = { ...legacyCustom, custom_composite: false, custom_parts: compositeItem().custom_parts };
assert.equal(t.isCustomCompositeItem(legacyWithParts), false);
assert.equal(t.getCustomCompositeIssue(legacyWithParts), '');
assert.deepEqual(plain(t.calculateItemCost(legacyWithParts, params)), plain(t.calculateItemCost(legacyCustom, params)));

const blank = { quantity: 500, is_blank_mold: true, pieces_per_hour: 40, weight_grams: 12, blank_mold_total_cost: 9000 };
const blankWithParts = { ...blank, custom_composite: true, custom_parts: compositeItem().custom_parts };
assert.equal(t.getCustomCompositeSummary(blankWithParts), null);
assert.deepEqual(plain(t.calculateItemCost(blankWithParts, params)), plain(t.calculateItemCost(blank, params)));

// --- Резервный расчёт молдов в сводке заказа ---
const finItem = { ...oneInStock, result: t.getEmptyCostResult() };
assert.equal(
    t.calculateFinDirectorData([finItem], [], [], params).molds,
    10000,
    'fallback counts the one new part mold, not the stale base_mold_in_stock flag',
);

console.log('custom composite smoke checks passed');

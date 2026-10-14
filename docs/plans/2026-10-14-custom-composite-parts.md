# Составной кастом: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** В кастомной позиции калькулятора можно включить «Составное изделие» и перечислить части вручную; скорость, вес, молды, запуск, срезка и сборка частей считаются автоматически.

**Architecture:** Чистые функции в `js/calculator.js` (`normalizeCustomParts`, `isCustomCompositeItem`, `getCustomCompositeIssue`, `getCustomCompositeSummary`) — единственный источник правды. `calculateItemCost`, `getItemSetupHours` и резервный расчёт молдов в `calculateFinDirectorData` читают сводку. Калькулятор (`js/app.js`) хранит `custom_composite` + `custom_parts` в позиции, пишет итоговые шт/ч, вес и `base_mold_in_stock` в обычные поля, чтобы план производства и списки работали без изменений.

**Tech Stack:** vanilla JS без сборщика, Node `vm`-смоуки в `tests/`.

**Spec:** `docs/specs/2026-10-14-custom-composite-parts.md`

## Global Constraints

- Старые позиции (без `custom_composite`) и бланки считаются бит-в-бит как раньше.
- Никаких миграций БД: новые поля уходят в `item_data` через `_filterForDB`.
- Не переименовывать существующие DOM id (`item-pph-${idx}`, `item-weight-${idx}`, `calc-items-container` и т.д.) и публичные функции (`Calculator.recalculate`, `calculateItemCost`).
- Версия: `main + 1` во всех 4 местах (`js/version.json`, `APP_VERSION` в `js/app.js`, `CURRENT_HTML_VERSION` и `#app-version` в `index.html`), плюс `?v=` у изменённых скриптов.
- Шрифты нового блока не мельче 13 px.
- Коммиты заканчиваются строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Позиция переключена в «Бланковую» после составного режима → режим выключен, сборка частей не остаётся в себестоимости (тест в Task 3).
- Составной режим включён, но у части пустые шт/ч → себестоимость 0, а не расчёт по устаревшим шт/ч позиции (тест в Task 1).
- `custom_parts` пришли из БД JSON-строкой → тот же результат, что и массив (тест в Task 1, загрузка в Task 2).
- Устаревшие `pieces_per_hour` / `weight_grams` / `base_mold_in_stock` в позиции при включённом режиме игнорируются движком (тест в Task 1).
- Снятие галочки «Составное изделие» сохраняет части и обнуляет сборку частей (тест в Task 3).

---

### Task 1: Движок — сводка частей и расчёт себестоимости

**Files:**
- Modify: `js/calculator.js` (после `getBlankTemplateTotalMoldCost`, в `getItemSetupHours`, `calculateItemCost`, `calculateFinDirectorData`, экспорт в конце файла)
- Create: `tests/custom-composite-smoke.js`
- Modify: `.github/workflows/deploy-pages.yml` (добавить смоук в verify)

**Interfaces:**
- Produces:
  - `CUSTOM_PARTS_ASSEMBLY_NAME = 'Сборка частей'`
  - `isCalcTrueLike(value) → boolean`
  - `normalizeCustomParts(itemOrPartsOrJson) → Array<{ name: string, pieces_per_hour: number, weight_grams: number, qty: number (int ≥ 1), mold_in_stock: boolean }>`
  - `isCustomCompositeItem(item) → boolean` (не бланк и `custom_composite` истинно)
  - `getCustomCompositeIssue(item) → string` (`''`, `'Нужно минимум 2 части'`, `'Заполните шт/ч у части N'`)
  - `getCustomCompositeSummary(item) → null | { isComposite: true, parts, piecesPerHour, weightGrams, piecesPerItem, newMoldCount, allMoldsInStock }`

- [x] **Step 1: Написать падающий смоук**

`tests/custom-composite-smoke.js`:

```js
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
```

- [x] **Step 2: Убедиться, что падает**

Run: `node tests/custom-composite-smoke.js`
Expected: FAIL — `ReferenceError: normalizeCustomParts is not defined`.

- [x] **Step 3: Добавить чистые функции**

В `js/calculator.js` сразу после функции `getBlankTemplateTotalMoldCost`:

```js
const CUSTOM_PARTS_ASSEMBLY_NAME = 'Сборка частей';

function isCalcTrueLike(value) {
    return value === true
        || Number(value) === 1
        || String(value ?? '').trim().toLowerCase() === 'true';
}

// Части составного кастома вводятся вручную: у каждой своя новая форма и
// отдельная проливка. Незаполненные строки не выкидываем — их правит UI.
function normalizeCustomParts(source) {
    let parts = (source && typeof source === 'object' && !Array.isArray(source))
        ? source.custom_parts
        : source;
    if (typeof parts === 'string') {
        try { parts = JSON.parse(parts); } catch (_) { parts = []; }
    }
    if (!Array.isArray(parts)) return [];
    return parts
        .filter(part => part && typeof part === 'object')
        .map(part => ({
            name: String(part.name || '').trim(),
            pieces_per_hour: Math.max(0, calcNumber(part.pieces_per_hour, 0)),
            weight_grams: Math.max(0, calcNumber(part.weight_grams, 0)),
            qty: Math.max(1, Math.round(calcNumber(part.qty, 1)) || 1),
            mold_in_stock: isCalcTrueLike(part.mold_in_stock),
        }));
}

function isCustomCompositeItem(item) {
    return !!item && !item.is_blank_mold && isCalcTrueLike(item.custom_composite);
}

function getCustomCompositeIssue(item) {
    if (!isCustomCompositeItem(item)) return '';
    const parts = normalizeCustomParts(item);
    if (parts.length < 2) return 'Нужно минимум 2 части';
    const missingIdx = parts.findIndex(part => !(part.pieces_per_hour > 0));
    if (missingIdx >= 0) return `Заполните шт/ч у части ${missingIdx + 1}`;
    return '';
}

/**
 * Составной кастом: части отливаются последовательно, каждая в своей форме.
 * Готовое изделие требует qty/pph часов на каждой части, поэтому скорость
 * = 1 / Σ(qty / pph) — как у составного бланка (getCompositeMoldSummary).
 */
function getCustomCompositeSummary(item) {
    if (!isCustomCompositeItem(item) || getCustomCompositeIssue(item)) return null;
    const parts = normalizeCustomParts(item);
    const hoursPerItem = parts.reduce((sum, part) => sum + part.qty / part.pieces_per_hour, 0);
    if (!(hoursPerItem > 0)) return null;
    const newMoldCount = parts.filter(part => !part.mold_in_stock).length;
    return {
        isComposite: true,
        parts,
        piecesPerHour: round2(1 / hoursPerItem),
        weightGrams: round2(parts.reduce((sum, part) => sum + part.weight_grams * part.qty, 0)),
        piecesPerItem: parts.reduce((sum, part) => sum + part.qty, 0),
        newMoldCount,
        allMoldsInStock: newMoldCount === 0,
    };
}
```

- [x] **Step 4: Запуск — `getItemSetupHours`**

В `getItemSetupHours` после строки `const extraMolds = Math.max(0, calcNumber(item && item.extra_molds, 0));` вставить:

```js
    const composite = getCustomCompositeSummary(item);
    if (composite) {
        // Составной кастом: час подготовки на каждую новую форму-часть.
        return customMoldSetupHours * (composite.newMoldCount + extraMolds) + colorSetupHours * colorCount;
    }
```

- [x] **Step 5: Себестоимость — `calculateItemCost`**

Заменить начало функции:

```js
function calculateItemCost(item, params) {
    const p = params;
    const qty = calcNumber(item.quantity, 0);
    const composite = getCustomCompositeSummary(item);
    // Составной кастом с незаполненными частями не считаем по устаревшим
    // шт/ч позиции — как обычный кастом без шт/ч.
    if (isCustomCompositeItem(item) && !composite) return getEmptyCostResult();
    const pph = composite ? composite.piecesPerHour : calcNumber(item.pieces_per_hour, 0);
    const weight = composite ? composite.weightGrams : calcNumber(item.weight_grams, 0);
```

В блоке амортизации заменить строку `const paidBaseMolds = ...` на:

```js
    const paidBaseMolds = composite
        ? composite.newMoldCount
        : ((!item.is_blank_mold && item.base_mold_in_stock) ? 0 : 1);
```

Заменить строку `const hoursCutting = ...` на:

```js
    // Лейник срезается с каждой отлитой детали: у составного кастома их несколько.
    const castPiecesPerItem = composite ? composite.piecesPerItem : 1;
    const hoursCutting = p.cuttingSpeed > 0 ? qty * castPiecesPerItem / p.cuttingSpeed * p.wasteFactor : 0;
```

- [x] **Step 6: Резервный расчёт молдов — `calculateFinDirectorData`**

В ветке `else` после `if (savedMoldTotal > 0) totalMolds += savedMoldTotal;` заменить строку `const paidBaseMolds = item.base_mold_in_stock ? 0 : 1;` на:

```js
            const composite = getCustomCompositeSummary(item);
            const paidBaseMolds = composite ? composite.newMoldCount : (item.base_mold_in_stock ? 0 : 1);
```

- [x] **Step 7: Экспорт для Node**

В конце `js/calculator.js` дополнить `module.exports`:

```js
    module.exports = { getProductionParams, calculateItemCost, getItemColorCount, getCustomCompositeSummary, normalizeCustomParts };
```

- [x] **Step 8: Прогнать смоуки**

Run: `node tests/custom-composite-smoke.js && node tests/active-order-recalculation-smoke.js && node tests/molds-smoke.js && node tests/marketplaces-smoke.js`
Expected: все `passed` / `OK`.

- [x] **Step 9: Добавить смоук в CI**

В `.github/workflows/deploy-pages.yml` после строки `node tests/active-order-recalculation-smoke.js` добавить строку с тем же отступом:

```
          node tests/custom-composite-smoke.js
```

- [x] **Step 10: Commit**

```bash
git add js/calculator.js tests/custom-composite-smoke.js .github/workflows/deploy-pages.yml
git commit -m "Count custom composite parts in item cost

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Сохранение и загрузка частей

**Files:**
- Modify: `js/app.js` (`getEmptyItem`, `_isMeaningfulProductItem`, `_collectItemsForSave`, `loadOrder` restore, восстановление локального черновика)
- Modify: `js/supabase.js` (`ORDER_ITEM_CALC_FIELDS`)
- Modify: `js/factual.js` (резервный `calculateItemCost`)
- Test: `tests/order-flow-smoke.js` (новая функция `smokeCustomCompositePersistence`)

**Interfaces:**
- Consumes: `normalizeCustomParts`, `isCustomCompositeItem` из Task 1.
- Produces: позиция калькулятора всегда имеет `custom_composite: boolean` и `custom_parts: Array` (массив, не строка); сохранённая строка заказа содержит `custom_composite` (boolean) и `custom_parts` (JSON-строка).

- [x] **Step 1: Написать падающий тест**

В `tests/order-flow-smoke.js` добавить функцию перед `async function main()`:

```js
async function smokeCustomCompositePersistence(context) {
    const saved = clone(await vm.runInContext(`(() => {
        Calculator.items = [Calculator.getEmptyItem(1)];
        Calculator.hardwareItems = [];
        Calculator.packagingItems = [];
        Calculator.pendants = [];
        const item = Calculator.items[0];
        item.product_name = 'Составной кастом';
        item.quantity = 500;
        item.custom_composite = true;
        item.custom_parts = [
            { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: true },
            { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: false },
        ];
        return Calculator._collectItemsForSave();
    })()`, context));
    const row = saved.find(item => item.item_type === 'product');
    assert.equal(row.custom_composite, true);
    assert.equal(typeof row.custom_parts, 'string', 'parts are stored as JSON like printings/colors');
    assert.deepEqual(JSON.parse(row.custom_parts).map(part => part.name), ['Корпус', 'Кнопка']);

    const meaningful = vm.runInContext(`Calculator._isMeaningfulProductItem({ ...Calculator.getEmptyItem(1), custom_composite: true })`, context);
    assert.equal(meaningful, true, 'an item with only the composite toggle on is still saved');

    context.__loadOrderData = {
        order: { id: 9101, order_name: 'Composite', status: 'draft' },
        items: clone(saved),
        repaired_duplicates: false,
    };
    context.loadOrder = async () => clone(context.__loadOrderData);
    vm.runInContext(`
        Calculator.renderItemBlock = () => {};
        Calculator.renderHardwareRow = () => {};
        Calculator.renderPackagingRow = () => {};
        Calculator.renderExtraCosts = () => {};
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.recalculate = () => {};
        Calculator.showOrderHistory = () => {};
        Calculator._ensureWhPickerData = async () => ({});
    `, context);
    await vm.runInContext('Calculator.loadOrder(9101)', context);
    const restored = clone(vm.runInContext('Calculator.items[0]', context));
    assert.equal(restored.custom_composite, true);
    assert.equal(Array.isArray(restored.custom_parts), true, 'parts are parsed back into an array');
    assert.equal(restored.custom_parts.length, 2);
    assert.equal(restored.custom_parts[0].mold_in_stock, true);
    assert.equal(restored.custom_parts[1].qty, 2);
}
```

`supabase.js` не загружается в этот смоук, поэтому `ORDER_ITEM_CALC_FIELDS` проверяем отдельной командой в Step 6.

В `main()` после `await smokeCalculatorPersistence(context);` добавить:

```js
    await smokeCustomCompositePersistence(context);
```

- [x] **Step 2: Убедиться, что падает**

Run: `node tests/order-flow-smoke.js`
Expected: FAIL на `assert.equal(row.custom_composite, true)` (поле не сохраняется).

- [x] **Step 3: Поля позиции**

В `js/app.js`, `getEmptyItem`, после строки `base_mold_in_stock: false,`:

```js
            // Составной кастом: части со своими формами (getCustomCompositeSummary)
            custom_composite: false,
            custom_parts: [],
```

В `_isMeaningfulProductItem` после строки `|| !!item.base_mold_in_stock` добавить:

```js
            || !!item.custom_composite
```

В `_collectItemsForSave`, в объекте позиции после строки `delivery_included: item.delivery_included,`:

```js
                custom_composite: isCustomCompositeItem(item),
                custom_parts: JSON.stringify(normalizeCustomParts(item)),
```

- [x] **Step 4: Загрузка заказа и черновика**

В `loadOrder` (блок `// Restore product items`) после строки `if (!Array.isArray(item.colors)) item.colors = [];`:

```js
            item.custom_parts = normalizeCustomParts(item);
            item.custom_composite = isCustomCompositeItem(item);
```

В восстановлении локального черновика (цикл `this.items.forEach((item, idx) => {` с `if (!Array.isArray(item.colors)) item.colors = [];` перед `this.renderItemBlock(idx);`) добавить после строки про colors:

```js
            item.custom_parts = normalizeCustomParts(item);
```

- [x] **Step 5: Лёгкие поля списка заказов и факт**

`js/supabase.js`, `ORDER_ITEM_CALC_FIELDS`: заменить строку

```js
    'base_mold_in_stock', 'delivery_included', 'blank_mold_total_cost',
```

на

```js
    'base_mold_in_stock', 'delivery_included', 'blank_mold_total_cost',
    'custom_composite', 'custom_parts',
```

`js/factual.js`, резервный `calculateItemCost({...})`: после строки `base_mold_in_stock: ri.base_mold_in_stock || false,` добавить:

```js
                        custom_composite: ri.custom_composite || false,
                        custom_parts: ri.custom_parts || [],
```

- [x] **Step 6: Прогнать тесты**

Run: `node tests/order-flow-smoke.js && node tests/factual-smoke.js && node tests/orders-performance-smoke.js && node -e "const s=require('fs').readFileSync('js/supabase.js','utf8'); if(!/'custom_composite', 'custom_parts'/.test(s)) process.exit(1); console.log('calc fields ok')"`
Expected: `order-flow smoke checks passed`, `factual smoke checks passed`, orders-performance OK, `calc fields ok`.

- [x] **Step 7: Commit**

```bash
git add js/app.js js/supabase.js js/factual.js tests/order-flow-smoke.js
git commit -m "Save and load custom composite parts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Блок «Составное изделие» в карточке позиции

**Files:**
- Modify: `js/app.js` (`renderItemBlock`, `setMoldType`, `_doRecalculate`, новые методы Calculator рядом с `onToggle`)
- Test: `tests/order-flow-smoke.js` (новая функция `smokeCustomCompositeEditing`)

**Interfaces:**
- Consumes: `normalizeCustomParts`, `isCustomCompositeItem`, `getCustomCompositeIssue`, `getCustomCompositeSummary`, `CUSTOM_PARTS_ASSEMBLY_NAME` (Task 1); поля позиции из Task 2.
- Produces (методы `Calculator`):
  - `toggleCustomComposite(idx, checked)`
  - `addCustomPart(idx)`, `removeCustomPart(idx, partIdx)`
  - `updateCustomPart(idx, partIdx, field, value)` — `field ∈ {'name','pieces_per_hour','weight_grams','qty','mold_in_stock'}`
  - `onCustomAssemblySpeedChange(idx, value)`
  - `_applyCustomCompositeToItem(item) → summary | null`
  - `_renderCustomCompositeBlock(idx, item) → string`
  - `_customCompositeSummaryHtml(item) → string`
  - `_ruPlural(value, one, few, many) → string`

- [x] **Step 1: Написать падающий тест**

В `tests/order-flow-smoke.js` перед `async function main()`:

```js
async function smokeCustomCompositeEditing(context) {
    const state = clone(await vm.runInContext(`(() => {
        Calculator.renderItemBlock = () => {};
        Calculator.recalculate = () => {};
        Calculator.scheduleAutosave = () => {};
        Calculator.items = [Calculator.getEmptyItem(1)];
        const item = Calculator.items[0];
        item.product_name = 'Корпус';
        item.quantity = 500;
        item.pieces_per_hour = 60;
        item.weight_grams = 30;

        Calculator.toggleCustomComposite(0, true);
        const afterEnable = JSON.parse(JSON.stringify(item));

        Calculator.updateCustomPart(0, 1, 'name', 'Кнопка');
        Calculator.updateCustomPart(0, 1, 'pieces_per_hour', '120');
        Calculator.updateCustomPart(0, 1, 'weight_grams', '5');
        Calculator.updateCustomPart(0, 1, 'qty', '2');
        const afterParts = { pph: item.pieces_per_hour, weight: item.weight_grams, stock: item.base_mold_in_stock };

        Calculator.updateCustomPart(0, 0, 'mold_in_stock', true);
        Calculator.updateCustomPart(0, 1, 'mold_in_stock', true);
        const allStock = item.base_mold_in_stock;

        Calculator.removeCustomPart(0, 1);
        const partsAfterBlockedRemove = item.custom_parts.length;
        Calculator.addCustomPart(0);
        const partsAfterAdd = item.custom_parts.length;
        Calculator.removeCustomPart(0, 2);

        Calculator.onCustomAssemblySpeedChange(0, '60');
        const assembly = { name: item.builtin_assembly_name, speed: item.builtin_assembly_speed };

        const html = Calculator._renderCustomCompositeBlock(0, item);

        Calculator.toggleCustomComposite(0, false);
        const afterDisable = JSON.parse(JSON.stringify(item));

        Calculator.toggleCustomComposite(0, true);
        Calculator.onCustomAssemblySpeedChange(0, '60');
        Calculator._syncTemplateHardware = () => {};
        Calculator.setMoldType(0, true);
        const afterBlank = JSON.parse(JSON.stringify(item));

        return { afterEnable, afterParts, allStock, partsAfterBlockedRemove, partsAfterAdd, assembly, html, afterDisable, afterBlank };
    })()`, context));

    assert.equal(state.afterEnable.custom_composite, true);
    assert.equal(state.afterEnable.custom_parts.length, 2, 'enabling creates two parts');
    assert.deepEqual(
        { name: state.afterEnable.custom_parts[0].name, pph: state.afterEnable.custom_parts[0].pieces_per_hour, weight: state.afterEnable.custom_parts[0].weight_grams },
        { name: 'Корпус', pph: 60, weight: 30 },
        'the first part is prefilled from the item',
    );
    assert.equal(state.afterEnable.pieces_per_hour, 0, 'an unfinished second part leaves the item uncalculated');

    assert.deepEqual(state.afterParts, { pph: 30, weight: 40, stock: false });
    assert.equal(state.allStock, true, 'all parts in stock clears the mold wait');
    assert.equal(state.partsAfterBlockedRemove, 2, 'cannot go below two parts');
    assert.equal(state.partsAfterAdd, 3);
    assert.deepEqual(state.assembly, { name: 'Сборка частей', speed: 60 });

    assert.match(state.html, /Составное изделие/);
    assert.match(state.html, /Итог: 30 изд\/ч · 40 г · 3 детали на изделие · 0 новых молдов/);
    assert.match(state.html, /value="Кнопка"/);

    assert.equal(state.afterDisable.custom_composite, false);
    assert.equal(state.afterDisable.custom_parts.length, 2, 'parts survive switching the mode off');
    assert.equal(state.afterDisable.builtin_assembly_speed, 0, 'part assembly is dropped with the mode');
    assert.equal(state.afterDisable.pieces_per_hour, 30, 'last computed speed stays editable');

    assert.equal(state.afterBlank.custom_composite, false, 'blank mold turns composite off');
    assert.equal(state.afterBlank.builtin_assembly_speed, 0, 'part assembly does not leak into a blank');

    // Реальная карточка: оригинальный renderItemBlock сохранён в main() до стабов.
    const cardHtml = String(await vm.runInContext(`(() => {
        Calculator._renderPerItemHwPkg = () => {};
        Calculator.items = [Calculator.getEmptyItem(1)];
        const item = Calculator.items[0];
        item.quantity = 500;
        item.custom_composite = true;
        item.custom_parts = [
            { name: 'Корпус', pieces_per_hour: 60, weight_grams: 30, qty: 1, mold_in_stock: false },
            { name: 'Кнопка', pieces_per_hour: 120, weight_grams: 5, qty: 2, mold_in_stock: false },
        ];
        Calculator._applyCustomCompositeToItem(item);
        globalThis.__originalRenderItemBlock.call(Calculator, 0);
        return document.getElementById('item-block-0').outerHTML;
    })()`, context));
    assert.match(cardHtml, /Составное изделие \(2\+ части\)/);
    assert.match(cardHtml, /id="item-pph-0" readonly/, 'speed is derived from the parts');
    assert.match(cardHtml, /id="item-weight-0" readonly/, 'weight is derived from the parts');
    assert.doesNotMatch(cardHtml, /item-stock-mold-0/, 'per-part stock replaces the item stock toggle');
    assert.match(cardHtml, /2 части/, 'collapsed summary shows the part count');
    assert.match(cardHtml, /2 новых молда/);
}
```

В `main()` сразу после `stubRuntime(context);` (до всех смоуков, которые подменяют `renderItemBlock`):

```js
    vm.runInContext('globalThis.__originalRenderItemBlock = Calculator.renderItemBlock;', context);
```

И после `await smokeCustomCompositePersistence(context);`:

```js
    await smokeCustomCompositeEditing(context);
```

- [x] **Step 2: Убедиться, что падает**

Run: `node tests/order-flow-smoke.js`
Expected: FAIL — `Calculator.toggleCustomComposite is not a function`.

- [x] **Step 3: Методы редактирования**

В `js/app.js` сразу после метода `onToggle(idx, field, checked) { ... },` вставить:

```js
    // ==========================================
    // СОСТАВНОЙ КАСТОМ (части со своими формами)
    // ==========================================

    _getEmptyCustomPart() {
        return { name: '', pieces_per_hour: 0, weight_grams: 0, qty: 1, mold_in_stock: false };
    },

    // Итог частей пишем в обычные поля позиции: план производства, склад и
    // списки читают шт/ч, вес и «молд на складе» напрямую.
    _applyCustomCompositeToItem(item) {
        if (!isCustomCompositeItem(item)) return null;
        const parts = normalizeCustomParts(item);
        const summary = getCustomCompositeSummary(item);
        item.pieces_per_hour = summary ? summary.piecesPerHour : 0;
        if (summary) item.weight_grams = summary.weightGrams;
        item.base_mold_in_stock = parts.length > 0 && parts.every(part => part.mold_in_stock);
        return summary;
    },

    toggleCustomComposite(idx, checked) {
        const item = this.items[idx];
        if (!item) return;
        item.custom_parts = normalizeCustomParts(item);
        item.custom_composite = !!checked && !item.is_blank_mold;
        if (item.custom_composite) {
            if (item.custom_parts.length === 0) {
                item.custom_parts.push({
                    ...this._getEmptyCustomPart(),
                    name: String(item.product_name || '').trim(),
                    pieces_per_hour: calcNumber(item.pieces_per_hour, 0),
                    weight_grams: calcNumber(item.weight_grams, 0),
                    mold_in_stock: !!item.base_mold_in_stock,
                });
            }
            while (item.custom_parts.length < 2) item.custom_parts.push(this._getEmptyCustomPart());
            item.builtin_assembly_name = CUSTOM_PARTS_ASSEMBLY_NAME;
            this._applyCustomCompositeToItem(item);
        } else {
            item.builtin_assembly_name = '';
            item.builtin_assembly_speed = 0;
        }
        this.renderItemBlock(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    addCustomPart(idx) {
        const item = this.items[idx];
        if (!isCustomCompositeItem(item)) return;
        item.custom_parts = normalizeCustomParts(item);
        item.custom_parts.push(this._getEmptyCustomPart());
        this._applyCustomCompositeToItem(item);
        this.renderItemBlock(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    removeCustomPart(idx, partIdx) {
        const item = this.items[idx];
        if (!isCustomCompositeItem(item)) return;
        item.custom_parts = normalizeCustomParts(item);
        if (item.custom_parts.length <= 2 || !item.custom_parts[partIdx]) return;
        item.custom_parts.splice(partIdx, 1);
        this._applyCustomCompositeToItem(item);
        this.renderItemBlock(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    // Ввод в поля части не перерисовывает карточку, чтобы не терять фокус.
    updateCustomPart(idx, partIdx, field, value) {
        const item = this.items[idx];
        const part = Array.isArray(item?.custom_parts) ? item.custom_parts[partIdx] : null;
        if (!part) return;
        if (field === 'name') part.name = String(value || '');
        else if (field === 'mold_in_stock') part.mold_in_stock = !!value;
        else if (field === 'qty') part.qty = Math.max(1, Math.round(parseFloat(value) || 1));
        else if (field === 'pieces_per_hour' || field === 'weight_grams') part[field] = Math.max(0, parseFloat(String(value).replace(',', '.')) || 0);
        else return;
        this._applyCustomCompositeToItem(item);
        this._refreshCustomCompositeDom(idx);
        if (field !== 'name') this.recalculate();
        this.scheduleAutosave();
    },

    onCustomAssemblySpeedChange(idx, value) {
        const item = this.items[idx];
        if (!isCustomCompositeItem(item)) return;
        item.builtin_assembly_name = CUSTOM_PARTS_ASSEMBLY_NAME;
        item.builtin_assembly_speed = Math.max(0, parseFloat(String(value).replace(',', '.')) || 0);
        this.recalculate();
        this.scheduleAutosave();
    },

    _refreshCustomCompositeDom(idx) {
        const item = this.items[idx];
        const pphEl = document.getElementById('item-pph-' + idx);
        if (pphEl) pphEl.value = item.pieces_per_hour || '';
        const weightEl = document.getElementById('item-weight-' + idx);
        if (weightEl) weightEl.value = item.weight_grams || '';
        const summaryEl = document.getElementById('custom-parts-summary-' + idx);
        if (summaryEl) summaryEl.innerHTML = this._customCompositeSummaryHtml(item);
    },

    _ruPlural(value, one, few, many) {
        const abs = Math.abs(Math.trunc(Number(value) || 0));
        const mod10 = abs % 10;
        const mod100 = abs % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    },

    _customCompositeSummaryHtml(item) {
        const issue = getCustomCompositeIssue(item);
        if (issue) return `<span style="color:var(--orange);">${this._esc(issue)}</span>`;
        const summary = getCustomCompositeSummary(item);
        if (!summary) return '';
        const fmt = value => Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
        const pieces = summary.piecesPerItem;
        const molds = summary.newMoldCount;
        return `Итог: ${fmt(summary.piecesPerHour)} изд/ч · ${fmt(summary.weightGrams)} г · `
            + `${pieces} ${this._ruPlural(pieces, 'деталь', 'детали', 'деталей')} на изделие · `
            + `${molds} ${this._ruPlural(molds, 'новый молд', 'новых молда', 'новых молдов')}`;
    },

    _renderCustomCompositeBlock(idx, item) {
        const enabled = isCustomCompositeItem(item);
        const parts = normalizeCustomParts(item);
        const canRemove = parts.length > 2;
        const labelStyle = 'display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--text-secondary);';
        const inputStyle = 'height:36px;font-size:14px;';
        const rowsHtml = enabled ? parts.map((part, pi) => `
            <div class="custom-part-row" style="display:flex;flex-wrap:wrap;gap:8px 10px;align-items:flex-end;padding:8px 0;border-bottom:1px dashed var(--border);">
                <div style="font-size:14px;font-weight:600;min-width:64px;padding-bottom:8px;">Часть ${pi + 1}</div>
                <label style="${labelStyle}flex:1 1 160px;"><span>Название</span>
                    <input type="text" style="${inputStyle}" value="${this._escAttr(part.name)}" placeholder="Например, корпус" oninput="Calculator.updateCustomPart(${idx}, ${pi}, 'name', this.value)">
                </label>
                <label style="${labelStyle}width:90px;"><span>Шт/ч</span>
                    <input type="number" min="0" step="any" style="${inputStyle}" value="${part.pieces_per_hour || ''}" oninput="Calculator.updateCustomPart(${idx}, ${pi}, 'pieces_per_hour', this.value)">
                </label>
                <label style="${labelStyle}width:90px;"><span>Вес, г</span>
                    <input type="number" min="0" step="any" style="${inputStyle}" value="${part.weight_grams || ''}" oninput="Calculator.updateCustomPart(${idx}, ${pi}, 'weight_grams', this.value)">
                </label>
                <label style="${labelStyle}width:110px;"><span>Шт. в изделии</span>
                    <input type="number" min="1" step="1" style="${inputStyle}" value="${part.qty}" oninput="Calculator.updateCustomPart(${idx}, ${pi}, 'qty', this.value)">
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;padding-bottom:9px;white-space:nowrap;cursor:pointer;">
                    <input type="checkbox" ${part.mold_in_stock ? 'checked' : ''} onchange="Calculator.updateCustomPart(${idx}, ${pi}, 'mold_in_stock', this.checked)">
                    молд на складе
                </label>
                <button type="button" class="btn btn-sm btn-outline" style="height:36px;min-width:36px;" ${canRemove ? '' : 'disabled'}
                    title="${canRemove ? 'Убрать часть' : 'Нужно минимум 2 части'}" onclick="Calculator.removeCustomPart(${idx}, ${pi})">✕</button>
            </div>`).join('') : '';

        return `
            <div class="custom-composite-block" id="custom-composite-${idx}" style="margin:4px 0 14px;padding:12px 14px;border:1px solid var(--border);border-radius:var(--radius);background:var(--card-bg);">
                <div class="toggle-row" style="padding:0;">
                    <input type="checkbox" class="toggle" id="item-custom-composite-${idx}" ${enabled ? 'checked' : ''} onchange="Calculator.toggleCustomComposite(${idx}, this.checked)">
                    <label for="item-custom-composite-${idx}" style="font-size:14px;font-weight:600;">Составное изделие (2+ части)</label>
                </div>
                ${enabled ? `
                <div style="font-size:13px;color:var(--text-muted);margin:6px 0 4px;">Каждая часть — своя форма и отдельная проливка. Шт/ч и вес изделия считаются по частям.</div>
                <div id="custom-parts-list-${idx}">${rowsHtml}</div>
                <button type="button" class="btn btn-sm btn-outline" style="margin-top:10px;" onclick="Calculator.addCustomPart(${idx})">+ Часть</button>
                <div class="form-group" style="margin-top:12px;max-width:280px;">
                    <label for="item-custom-assembly-${idx}" style="font-size:13px;">Сборка частей, изд/ч</label>
                    <input type="number" id="item-custom-assembly-${idx}" min="0" step="any" style="${inputStyle}" value="${item.builtin_assembly_speed || ''}" placeholder="пусто — не считаем" oninput="Calculator.onCustomAssemblySpeedChange(${idx}, this.value)">
                </div>
                <div id="custom-parts-summary-${idx}" style="margin-top:10px;font-size:14px;font-weight:600;">${this._customCompositeSummaryHtml(item)}</div>
                ` : ''}
            </div>`;
    },
```

- [x] **Step 4: Встроить блок в `renderItemBlock`**

В начале `renderItemBlock` после `const showCustomOnly = !item.is_blank_mold;`:

```js
        item.custom_parts = normalizeCustomParts(item);
        const isCustomComposite = isCustomCompositeItem(item);
        const derivedFieldAttrs = isCustomComposite
            ? 'readonly title="Считается по частям" style="background:var(--bg);color:var(--text-muted);"'
            : '';
```

В инпутах шт/ч и веса добавить атрибуты и подсказку — заменить два блока `form-group`:

```js
                <div class="form-group">
                    <label>Шт/час</label>
                    <input type="number" min="0" value="${item.pieces_per_hour || ''}" id="item-pph-${idx}" ${derivedFieldAttrs} oninput="Calculator.onNumChange(${idx}, 'pieces_per_hour', this.value)">
                    ${isCustomComposite ? '<span class="form-hint">считается по частям</span>' : ''}
                </div>
                <div class="form-group">
                    <label>Вес (г)</label>
                    <input type="number" min="0" value="${item.weight_grams || ''}" id="item-weight-${idx}" ${derivedFieldAttrs} oninput="Calculator.onNumChange(${idx}, 'weight_grams', this.value)">
                    ${isCustomComposite ? '<span class="form-hint">считается по частям</span>' : ''}
                </div>
```

Сразу после закрывающего `</div>` этой строки `form-row` (перед `<details class="item-advanced-details"`):

```js
            ${showCustomOnly ? this._renderCustomCompositeBlock(idx, item) : ''}
```

В «Дополнительно» обернуть toggle «Молд уже лежит на складе» условием — заменить его `toggle-row` на:

```js
            ${isCustomComposite ? '' : `
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-stock-mold-${idx}" ${item.base_mold_in_stock ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'base_mold_in_stock', this.checked)">
                <label for="item-stock-mold-${idx}">Молд уже лежит на складе и не идет в стоимость заказа</label>
            </div>`}
```

В свёрнутой сводке после блока `Цвет` (`<div class="item-summary-stat">…Цвет…</div>`) добавить:

```js
                ${isCustomComposite ? `<div class="item-summary-stat">
                    <span class="item-summary-label">Составное</span>
                    <span class="item-summary-value">${item.custom_parts.length} ${this._ruPlural(item.custom_parts.length, 'часть', 'части', 'частей')}</span>
                </div>` : ''}
```

- [x] **Step 5: Переключение в бланк и пересчёт**

В `setMoldType`, внутри `if (isBlank) {` после `this.items[idx].nfc_programming = false;`:

```js
            if (this.items[idx].custom_composite) {
                this.items[idx].builtin_assembly_name = '';
                this.items[idx].builtin_assembly_speed = 0;
            }
            this.items[idx].custom_composite = false;
```

В `_doRecalculate`, в цикле `this.items.forEach((item, idx) => {` перед `const result = calculateItemCost(item, params);`:

```js
            this._applyCustomCompositeToItem(item);
```

- [x] **Step 6: Прогнать тесты**

Run: `node tests/order-flow-smoke.js && node tests/custom-composite-smoke.js && node --check js/app.js && node --check js/calculator.js`
Expected: `order-flow smoke checks passed`, `custom composite smoke checks passed`, без ошибок синтаксиса.

- [x] **Step 7: Визуальная проверка**

Открыть `index.html` локально (или опубликовать статический превью-артефакт с карточкой), включить «Кастомная» → «Составное изделие», ввести пример из спеки, убедиться: итог «30 изд/ч · 40 г · 3 детали на изделие · 2 новых молда», шт/ч и вес серые, на ширине ~375 px строки частей переносятся без горизонтального скролла.

- [x] **Step 8: Commit**

```bash
git add js/app.js tests/order-flow-smoke.js
git commit -m "Add composite parts editor to custom calculator items

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Версия, план, PR

**Files:**
- Modify: `js/version.json`, `js/app.js` (`APP_VERSION`), `index.html` (`CURRENT_HTML_VERSION`, `#app-version`, `?v=` у `js/calculator.js`, `js/app.js`, `js/supabase.js`, `js/factual.js`)
- Modify: `docs/plans/2026-10-14-custom-composite-parts.md` (галочки)

- [x] **Step 1: Узнать текущую версию main**

Run: `git fetch origin main && git show origin/main:js/version.json`
Взять `vN`, новая версия `v(N+1)` (на момент написания `v477` → `v478`).

- [x] **Step 2: Поднять версию в 4 местах и ?v=**

- `js/version.json`: `{"version": "v478"}`
- `js/app.js`: `const APP_VERSION = 'v478';`
- `index.html`: `const CURRENT_HTML_VERSION = 'v478';` и `<span id="app-version">v478</span>`
- `index.html`: `js/supabase.js?v=478`, `js/calculator.js?v=478`, `js/app.js?v=478`, `js/factual.js?v=96`

- [x] **Step 3: Финальный прогон**

Run: `node tests/version-smoke.js && node tests/custom-composite-smoke.js && node tests/order-flow-smoke.js && node tests/active-order-recalculation-smoke.js && node tests/factual-smoke.js && node tests/molds-smoke.js && node tests/marketplaces-smoke.js && node tests/orders-performance-smoke.js && for f in js/*.js; do node --check "$f" || exit 1; done`
Expected: все `passed`/`OK`, `version smoke checks passed (v478)`.

- [x] **Step 4: Отметить план и закоммитить**

```bash
git add js/version.json js/app.js index.html docs/plans/2026-10-14-custom-composite-parts.md
git commit -m "Bump version v477 -> v478

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push и PR** — только после подтверждения владельца.

```bash
git push -u origin claude/custom-composite-parts
gh pr create --title "Composite parts for custom calculator items" --body-file <(printf '...')
```

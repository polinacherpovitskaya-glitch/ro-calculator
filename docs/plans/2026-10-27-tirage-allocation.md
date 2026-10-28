# Разметка тиража и честная экономика (часть 1) — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** тираж строки изделия делится на «клиенту / на продажу / партнёру / в подарок / образцы»; деньги, реальная себестоимость и склад готовой продукции считаются по этой разметке.

**Architecture:** вся математика разметки и денег — чистые функции в `js/calculator.js` (одна формула для калькулятора, карточки, доски). Разметка хранится в `item_data.tirage_allocation` строки заказа. Реальные затраты берутся из модуля «Факт» (`js/factual.js`). Склад готовой продукции пишется патчами через `POST /api/compat/blob-patch`.

**Tech Stack:** vanilla JS SPA (`js/*.js`, без сборщика), Node/Express `ops/api`, смоуки `node tests/*.js` (vm-песочница), `node --test` в `ops/api`.

**Spec:** `docs/specs/2026-10-27-tirage-allocation.md`

## Global Constraints

- Разметка хранится внутри `item_data` строки заказа: новых колонок `order_items` нет.
- Деньги считаются в одном месте (`js/calculator.js`), все экраны берут их оттуда.
- Склад готовой продукции (`ready_goods_stock_json`, `ready_goods_history_json`, `ready_goods_sales_records_json`) пишется только патчами через `POST /api/compat/blob-patch`.
- У заказов без разметки не меняется ни одна цифра; B2C-заказы работают как сейчас.
- Реальную маржу и общую сумму реальной себестоимости видят все, кто видит заказ; строки зарплаты и «Косвенные» в разбивке — только при `App.isAdmin()`, как на странице «Факт».
- Не менять сигнатуры `Calculator.recalculate/toJSON/loadOrder`, DOM-идентификаторы и селекторы смоуков; новых файлов в `js/` не создавать (`AGENTS.md`).
- Версия: `v482` в 4 местах + `?v=482` у каждого изменённого `js/*.js` в `index.html`; `node tests/version-smoke.js`.
- Тексты интерфейса по-русски; блок разметки раскрывается прямо под строкой, крупный текст.

## Review Focus

1. Тираж строки уменьшили ниже суммы «на продажу + подарок + образцы + партнёру» → части уменьшаются в порядке «На продажу» → «В подарок» → «Образцы» → «Партнёру», ничего не отрицательное, менеджер видит, что поменялось (Task 1, Task 2).
2. Скидка суммой больше выручки «клиенту» → скидка упирается в выручку «клиенту», ожидаемая выручка «на продажу» не трогается (Task 1).
3. Перевод в «Готово» дважды (доска + план производства, повторный клик) → позиции на складе не задваиваются (Task 5).
4. Возврат из «Готово», когда часть штук уже продана → статус не меняется, понятное сообщение (Task 5).
5. По заказу нет табеля или статья «Факта» пустая → реальная себестоимость берёт план по этой статье с пометкой «по плану», а не 0; табеля нет совсем → вся себестоимость плановая (`realTotal = planTotal`), статьи показывают, что есть в «Факте» (Task 3).

---

### Task 1: Математика разметки и честная выручка

**Files:**
- Modify: `js/calculator.js` (новые функции рядом с `calculateOrderSummary`, правка `calculateOrderSummary` ~1840, `getOrderLiveCalculatorSnapshot` ~2011)
- Create: `tests/tirage-allocation-smoke.js`
- Modify: `.github/workflows/deploy-pages.yml` (добавить смоук в список `verify`, рядом с `warehouse-blob-patch-smoke.js`)

**Interfaces:**
- Produces:
  - `TIRAGE_PARTS = ['client', 'stock', 'partner', 'gift', 'sample']`
  - `normalizeTirageAllocation(raw, quantity, defaultStockPrice) -> { allocation, reduced }`, где `allocation = { client, stock, partner, gift, sample, stock_price, partner_note, gift_note }` (целые ≥ 0, сумма = `quantity`, `client` = остаток), `reduced = [{ part, from, to }]`.
  - `hasTirageSplit(allocation) -> boolean` (есть что-то кроме `client`).
  - `getTirageFreeQty(allocation) -> number` (`partner + gift + sample`).
  - `calculateOrderSummary(...)` возвращает дополнительно `clientRevenue`, `stockRevenue`, `stockQty`, `freeQty`, `freeCost`.

- [x] **Step 1: Тест `normalize` — в `tests/tirage-allocation-smoke.js`** (загрузить `js/calculator.js` в `vm`-контекст с заглушкой `App = { params: {} }`):

```js
// всё клиенту по умолчанию
assert.deepEqual(normalizeTirageAllocation(null, 100, 5900).allocation,
  { client: 100, stock: 0, partner: 0, gift: 0, sample: 0, stock_price: 5900, partner_note: '', gift_note: '' });
// Лимон
const lemon = normalizeTirageAllocation({ stock: 30, partner: 50, gift: 20, stock_price: 5900, partner_note: 'художница' }, 100, 5900);
assert.equal(lemon.allocation.client, 0); assert.deepEqual(lemon.reduced, []);
// тираж уменьшили до 60: режем «на продажу», потом «в подарок»
const cut = normalizeTirageAllocation({ stock: 30, partner: 50, gift: 20 }, 60, 5900);
assert.deepEqual([cut.allocation.client, cut.allocation.stock, cut.allocation.gift, cut.allocation.partner], [0, 0, 10, 50]);
assert.deepEqual(cut.reduced, [{ part: 'stock', from: 30, to: 0 }, { part: 'gift', from: 20, to: 10 }]);
// мусор во вводе
assert.deepEqual(normalizeTirageAllocation({ stock: -5, partner: 2.7 }, 10, 0).allocation.client, 8);
assert.equal(normalizeTirageAllocation({ stock: 3 }, 0, 100).allocation.stock, 0);
```

- [x] **Step 2: Запустить** `node tests/tirage-allocation-smoke.js` → FAIL (`normalizeTirageAllocation is not defined`).
- [x] **Step 3: Реализовать** `TIRAGE_PARTS`, `normalizeTirageAllocation`, `hasTirageSplit`, `getTirageFreeQty` в `js/calculator.js`. Дробные — вниз до целого, отрицательные → 0; порядок урезания: `stock`, `gift`, `sample`, `partner`; `stock_price` по умолчанию = `defaultStockPrice`.
- [x] **Step 4: Тест денег** (параметры `{ taxRate: 0.07, commercialRate: 0.065, charityRate: 0.01, vatRate: 0.05 }` → удержание 0.855):

```js
const lemonItem = { quantity: 100, sell_price_item: 5900, result: { costTotal: 971.35 },
  tirage_allocation: { stock: 30, partner: 50, gift: 20, stock_price: 5900 } };
const s = calculateOrderSummary([lemonItem], [], [], [], P, [], {});
assert.equal(s.totalRevenue, 177000); assert.equal(s.stockRevenue, 177000); assert.equal(s.clientRevenue, 0);
assert.equal(s.freeQty, 70); assert.equal(s.freeCost, 67994.5);
assert.equal(s.totalEarned, 54200); assert.equal(s.marginPercent, 30.62);
// без разметки — как раньше
const plain = calculateOrderSummary([{ ...lemonItem, tirage_allocation: null }], [], [], [], P, [], {});
assert.equal(plain.totalRevenue, 590000); assert.equal(plain.totalEarned, 407315);
// скидка только на «клиенту»
const a = { quantity: 50, sell_price_item: 1000, result: { costTotal: 100 } };
const b = { quantity: 50, sell_price_item: 2000, result: { costTotal: 200 }, tirage_allocation: { stock: 50, stock_price: 2000 } };
const d = calculateOrderSummary([a, b], [], [], [], P, [], { mode: 'percent', value: 10 });
assert.equal(d.discountAmount, 5000); assert.equal(d.totalRevenue, 145000); assert.equal(d.totalEarned, 108975);
const big = calculateOrderSummary([a, b], [], [], [], P, [], { mode: 'amount', value: 80000 });
assert.equal(big.discountAmount, 50000); assert.equal(big.totalRevenue, 100000);
// фурнитура строки с ценой: выручка только с доли «клиенту»
const hw = { qty: 100, sell_price: 10, parent_item_index: 0, result: { costPerUnit: 5 } };
const withHw = calculateOrderSummary([{ ...lemonItem, tirage_allocation: { client: 40, stock: 0, partner: 60 } }], [hw], [], [], P, [], {});
assert.equal(withHw.totalRevenue, 40 * 5900 + 40 * 10);
```

- [x] **Step 5: Запустить** → FAIL.
- [x] **Step 6: Реализовать в `calculateOrderSummary`**: для изделия с разметкой — выручка `client × (цена + печать) + stock × stock_price`; заработок `client × margin(цена+печать) + stock × margin(stock_price) − free × costTotal` через `calculateActualMargin`; скидка считается от `totalRevenue − stockRevenue` и уменьшает только её; фурнитура/упаковка с `parent_item_index` — выручка и заработок по доле `client / quantity` родителя, остальная доля — только себестоимость. Без разметки код идёт ровно как сейчас.
- [x] **Step 7: `getOrderLiveCalculatorSnapshot`** — убедиться, что `tirage_allocation` из `item_data` доезжает до объектов изделий, которые уходят в `calculateOrderSummary`; тест: снимок заказа из строки с `item_data: { tirage_allocation: { stock: 30, partner: 50, gift: 20, stock_price: 5900 } }` даёт выручку 177000.
- [x] **Step 8: Запустить** `node tests/tirage-allocation-smoke.js` → PASS; добавить его в `deploy-pages.yml`.
- [x] **Step 9: Commit** `Count only paid tirage in order revenue`.

### Task 2: Разметка в калькуляторе, сохранение, счёт и КП

**Files:**
- Modify: `js/app.js` — `getEmptyItem` (~2028), `renderItemBlock` (~2112, после поля тиража ~2337), `onNumChange` (тираж), `_collectItemsForSave` (~5968), строки счёта (~5508), `generateKP` (~7089), сводка калькулятора (место показа выручки/маржи)
- Modify: `js/supabase.js` — `ORDER_ITEM_CALC_FIELDS` += `'tirage_allocation'`
- Test: `tests/order-flow-smoke.js` (новый `smokeTirageAllocationPersistsAndInvoices`, с восстановлением заглушек в `finally`)

**Interfaces:**
- Consumes: Task 1 (`normalizeTirageAllocation`, `hasTirageSplit`, `getTirageFreeQty`, поля сводки).
- Produces: `item.tirage_allocation` в состоянии калькулятора и в `item_data`; `Calculator.renderTirageBlock(idx) -> string`, `Calculator.onTirageChange(idx, part, value)`, `Calculator.onTirageTextChange(idx, field, value)` (`field` ∈ `stock_price | partner_note | gift_note`), `Calculator.toggleTirageBlock(idx)`.

- [x] **Step 1: Тест**: строка с `quantity: 100`, разметка `{ stock: 30, partner: 50, gift: 20, stock_price: 5900, partner_note: 'художница' }` → `_collectItemsForSave()[0].tirage_allocation` равен нормализованной разметке; после `Calculator.loadOrder` с этим элементом `Calculator.items[0].tirage_allocation.partner_note === 'художница'`; строки счёта и КП для строки с `client: 40` дают `qty: 40`, при `client: 0` строки нет; `onNumChange(0, 'quantity', 60)` оставляет сумму частей 60.
- [x] **Step 2: Запустить** `node tests/order-flow-smoke.js` → FAIL.
- [x] **Step 3: Реализовать**: `getEmptyItem` — `tirage_allocation: null`; `_collectItemsForSave` — нормализованная разметка или `null`, если всё клиенту; изменение тиража перенормализует разметку и показывает под строкой «Тираж уменьшился: на продажу 30 → 0, в подарок 20 → 10»; счёт/КП берут `client`.
- [x] **Step 4: Блок «Тираж»** в `renderItemBlock`: свёрнуто — «Тираж: весь — клиенту ▸ разметить» или «клиенту 0 · на продажу 30 по 5 900 ₽ · партнёру 50 · в подарок 20»; развёрнуто под строкой — 5 полей количества, цена продажи, «кому» у партнёра и подарка; «Клиенту» только показывает остаток; поле не даёт ввести больше доступного. Скрыт, если `isNonCommercialProductionPurpose`/`leftover_assembly` или клиент «B2C».
- [x] **Step 5: Сводка калькулятора**: при разметке — подпись выручки «ожидаем, если продадим N шт.» и строка «Отдаём бесплатно: N шт. на X ₽ себестоимости»; рядом с маржой «план».
- [x] **Step 6: Запустить** `node tests/order-flow-smoke.js` → PASS.
- [x] **Step 7: Commit** `Let managers split a product line's tirage in the calculator`.

### Task 3: Реальная себестоимость заказа и себестоимость складской штуки

**Files:**
- Modify: `js/factual.js` — новые `Factual._buildRealCostBreakdown(planData, factData)` и `Factual.computeOrderRealCost(orderId)`
- Modify: `js/calculator.js` — новая `allocateRealCostToRows(rows, realProductionCost)`
- Test: `tests/tirage-allocation-smoke.js` (calculator), новый `tests/factual-real-cost-smoke.js` (vm: `js/calculator.js` + `js/factual.js`) → в `deploy-pages.yml`

**Interfaces:**
- Produces:
  - `REAL_COST_ROW_KEYS = ['salary_production', 'salary_trim', 'salary_assembly', 'salary_packaging', 'indirect_production', 'hardware_total', 'nfc_total', 'packaging_total', 'design_printing', 'plastic', 'molds', 'other']` (в `factual.js`; без налогов, коммерческого, благотворительности, доставки).
  - `Factual._buildRealCostBreakdown(planData, factData) -> { rows: [{ key, label, plan, fact, used, source: 'fact'|'plan', isSalary }], planTotal, realTotal, salaryReal }`
  - `Factual.computeOrderRealCost(orderId) -> Promise<{ ...breakdown, hoursPlan, hoursFact, hasTimesheet } | null>` — сам догружает `this._entries` (`loadTimeEntries`) и `this._employees` (`loadEmployees`), если их нет; ничего не рисует. Без табеля (`hasTimesheet: false`) `realTotal = planTotal` — вся себестоимость плановая (спека); по ней считают шапка карточки и склад.
  - `allocateRealCostToRows(rows: [{ key, planCost, paidQty }], realProductionCost) -> { [key]: unitCost }`

- [x] **Step 1: Тесты**:

```js
// allocateRealCostToRows
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 97135, paidQty: 30 }], 121000), { 1: 4033.33 });
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 30000, paidQty: 100 }, { key: '2', planCost: 10000, paidQty: 10 }], 60000), { 1: 450, 2: 1500 });
assert.deepEqual(allocateRealCostToRows([{ key: '1', planCost: 0, paidQty: 10 }, { key: '2', planCost: 0, paidQty: 30 }], 4000), { 1: 100, 2: 100 });
assert.equal(allocateRealCostToRows([{ key: '1', planCost: 500, paidQty: 0 }], 900)['1'], 0);
// _buildRealCostBreakdown: факт есть — факт; факта нет — план с пометкой
const b = Factual._buildRealCostBreakdown(
  { salaryProduction: 2000, molds: 0, plastic: 3000, packagingTotal: 1500 },
  { fact_salary_production: 3500, fact_plastic: 0, fact_packaging_total: 1700 });
assert.deepEqual(b.rows.find(r => r.key === 'salary_production'), { key: 'salary_production', label: 'ЗП выливание', plan: 2000, fact: 3500, used: 3500, source: 'fact', isSalary: true });
assert.equal(b.rows.find(r => r.key === 'plastic').source, 'plan');
assert.equal(b.realTotal, 3500 + 3000 + 1700); assert.equal(b.salaryReal, 3500);
assert.equal(b.rows.some(r => r.key === 'taxes'), false);
```

- [x] **Step 2: Запустить** оба смоука → FAIL.
- [x] **Step 3: Реализовать** `allocateRealCostToRows` (доля = `planCost / Σ planCost`, при Σ = 0 — по `paidQty`; округление до копеек), `_buildRealCostBreakdown` (подписи из `Factual.ROWS`), `computeOrderRealCost` поверх `_ensureComputedOrder` (часы: план — `planHours`, факт — сумма `fact_hours_*`).
- [x] **Step 4: Запустить** → PASS. «Факт» берёт выручку из `total_revenue_plan`, которую калькулятор сохраняет из новой сводки, — его менять не нужно.
- [x] **Step 5: Commit** `Compute an order's real cost and split it across product lines`.

### Task 4: Склад готовой продукции — запись патчами

**Files:**
- Modify: `ops/api/src/compat-blob-patch.js` — `BLOB_TARGETS` += `ready_goods_stock`, `ready_goods_history`, `ready_goods_sales_records` (таблица `settings`, `primaryKey: ['key']`, `field: 'value'`, `kind: 'records'`, `sourceId`/`keyRow.key` = `ready_goods_stock_json` / `ready_goods_history_json` / `ready_goods_sales_records_json`)
- Modify: `js/supabase.js` — `loadReadyGoods/loadReadyGoodsHistory/loadSalesRecords` отслеживаются `_trackRecordBlob`; `_saveReadyGoodsStore` шлёт `_diffRecordBlob` через `_sendBlobPatch`, старая запись целиком — только при 404/405
- Test: `ops/api/test/compat-blob-patch.test.js`, `tests/warehouse-blob-patch-smoke.js`

**Interfaces:**
- Produces: имена целей `ready_goods_stock | ready_goods_history | ready_goods_sales_records`; сигнатуры `saveReadyGoods/saveReadyGoodsHistory/saveSalesRecords` не меняются.

- [x] **Step 1: Тесты**: (api) `executeBlobPatch({ target: 'ready_goods_stock', patch: { upserts: [{ id: 7 }] } })` на пустом `settings` создаёт строку с `key: 'ready_goods_stock_json'`, `value` — строка `'[{"id":7}]'`; (смоук) две вкладки: A загрузила склад `[{id:1}]`, B добавила `{id:2}` и сохранила, A изменила `id:1` и сохранила → на сервере `[1, 2]`; после неудачной загрузки `saveReadyGoods` по-прежнему отклоняется.
- [x] **Step 2: Запустить** `cd ops/api && node --test test/compat-blob-patch.test.js` и `node tests/warehouse-blob-patch-smoke.js` → FAIL.
- [x] **Step 3: Реализовать.**
- [x] **Step 4: Запустить** → PASS.
- [x] **Step 5: Commit** `Write ready goods as patches`.

### Task 5: Перенос «на продажу» на склад, откат и пересчёт

**Files:**
- Modify: `js/warehouse.js` — `moveOrderToReadyGoods` (~7408), `removeOrderFromReadyGoods` (~7472), новые `getOrderReadyGoodsSoldQty(orderId)`, `syncOrderReadyGoodsToTirage(orderId)`, `recalcOrderReadyGoodsCost(orderId)`
- Modify: `js/orders.js` — `_shouldSyncOrderToReadyGoods` (~1562), `_ensureStatusTransitionAllowed` (~1188)
- Modify: `js/production_plan.js` (~538) — после `updateOrderStatus` проверка `_ensureStatusTransitionAllowed` и вызов `Orders._finishStatusTransition`, как в `js/order-detail.js:1244-1257`
- Modify: `js/app.js` — `Calculator.saveOrder` и `_doAutosave`: для заказа в «Готово» — `syncOrderReadyGoodsToTirage`; если «на продажу» меньше уже проданного — не сохранять, сообщение
- Test: `tests/order-flow-smoke.js` (новый `smokeTirageReadyGoodsTransfer`)

**Interfaces:**
- Consumes: Task 1 (`normalizeTirageAllocation`), Task 3 (`Factual.computeOrderRealCost`, `allocateRealCostToRows`), Task 4 (патчи).
- Produces: позиция склада `{ id, product_name, order_name, order_id, order_item_number, order_line_key, source: 'tirage', location_type: 'our', qty, cost_per_unit, sale_price, added_at, added_by }` (`order_line_key` — `line_key` разметки строки: калькулятор перенумеровывает строки, ключ остаётся); `Warehouse.getOrderReadyGoodsSoldQty(orderId) -> Promise<number>`; `Warehouse.syncOrderReadyGoodsToTirage(orderId) -> Promise<{ ok, message }>`; `Warehouse.recalcOrderReadyGoodsCost(orderId) -> Promise<number>` (сколько позиций обновлено; без ответа «Факта» — отказ `READY_GOODS_REAL_COST_UNAVAILABLE`, позиции не меняются).

- [x] **Step 1: Тест** (заглушки `loadOrder`, `Factual.computeOrderRealCost` → `{ realTotal: 121000 }`, склад в памяти): заказ «Лимон» с разметкой → `moveOrderToReadyGoods` добавляет одну позицию `qty: 30`, `cost_per_unit: 4033.33`, `sale_price: 5900`, `source: 'tirage'`; повторный вызов не добавляет вторую; B2C-заказ переносится как раньше (весь тираж, `cost_total`); заказ без разметки — 0 позиций; при продаже 5 штук `_ensureStatusTransitionAllowed(id, 'production_casting')` из «Готово» → не разрешено, текст «Уже продано 5 шт. со склада — заказ нельзя вернуть из «Готово»»; без продаж — откат снимает позицию; `recalcOrderReadyGoodsCost` при `realTotal: 150000` меняет `cost_per_unit` на 5000 и не трогает записи продаж.
- [x] **Step 2: Запустить** → FAIL.
- [x] **Step 3: Реализовать** перенос (позиция на строку с `stock > 0`, себестоимость штуки — `allocateRealCostToRows` по строкам: `planCost` = `cost_total × quantity` строки + её фурнитура/упаковка, `paidQty` = `client + stock`; без табеля — план), защиту от дублей (позиция с тем же `order_id`, `source: 'tirage'` и ключом строки уже есть → только сверка количества; позиция ищется по `order_line_key` = `line_key` разметки строки, у старых позиций без ключа — по `order_item_number`), запрет отката при продажах, синхронизацию при сохранении «Готово» (количество = `stock − продано`), пересчёт себестоимости непроданных.
- [x] **Step 4: Запустить** `node tests/order-flow-smoke.js` → PASS.
- [x] **Step 5: Commit** `Move the for-sale part of a tirage to ready goods at real cost`.

### Task 6: Карточка — честная шапка и блок «Тираж»

**Files:**
- Modify: `js/order-detail.js` — `renderStats` (~143), вкладка «Информация» (~193): новый блок `renderTirageInfo()`
- Modify: `js/orders.js` — `renderBoardCard` (~929): у маржи подпись «план»
- Test: `tests/order-flow-smoke.js` (новый `smokeOrderCardTirageAndRealMargin`)

**Interfaces:**
- Consumes: Task 1 (поля сводки), Task 3 (`Factual.computeOrderRealCost`), Task 5 (`getOrderReadyGoodsSoldQty`, `recalcOrderReadyGoodsCost`).
- Produces: `OrderDetail.renderTirageInfo() -> string`, `OrderDetail.renderRealCostDetails(breakdown, canSeeSalary) -> string`.

- [x] **Step 1: Тест**: для «Лимона» (сводка из Task 1, реальная себестоимость `realTotal 121000` при плановой `planTotal 97135`) шапка показывает «177 000 ₽», подпись «ожидаем, если продадим 30 шт.», реальную маржу `round2((54200 − (121000 − 97135)) × 100 / 177000)` = 17.14% и «план 30.62%», часы «план 12.1 · табель 18», строку «Отдаём бесплатно: 70 шт. на 67 995 ₽ себестоимости»; карточка доски показывает маржу с подписью «план»; `renderRealCostDetails(b, false)` не содержит «ЗП», `renderRealCostDetails(b, true)` содержит «ЗП выливание»; блок «Тираж» показывает «клиенту 0 · на продажу 30 по 5 900 ₽ · партнёру 50 (художница) · в подарок 20» и, после переноса, «На складе 30 из 30 · заморожено 121 000 ₽ · продано 0»; кнопка «Пересчитать себестоимость» есть только при позициях на складе.
- [x] **Step 2: Запустить** → FAIL.
- [x] **Step 3: Реализовать** (реальная маржа = `(totalEarned − (realTotal − planTotal)) / totalRevenue`; без табеля — подпись «по плану»; разбивка — по клику, строки зарплаты и «Косвенные» только при `App.isAdmin()`, как на странице «Факт»; общая сумма и реальная маржа видны всем).
- [x] **Step 4: Запустить** → PASS.
- [x] **Step 5: Commit** `Show honest money and the tirage split on the order card`.

### Task 7: Версия, полный прогон, PR

- [ ] **Step 1:** `git fetch origin main && git show origin/main:js/version.json` → поднять до `max(main)+1` (ожидаем `v482`) в 4 местах и `?v=` изменённых файлов.
- [ ] **Step 2:** прогнать все `node tests/*.js` из `deploy-pages.yml` (ожидаемо падает только `task-notification-smoke.js` локально — нет `bot/`) и `cd ops/api && node --test test/compat-blob-patch.test.js test/atomic-order-save-unit.test.js test/compat-rows-narrow.test.js`.
- [ ] **Step 3:** коммит `Bump version v481 -> v482`, пуш ветки `claude/tirage-allocation`, PR со спекой и планом.

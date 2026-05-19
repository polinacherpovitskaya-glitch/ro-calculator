# Block 7 — ⭐ Калькулятор (golden-master + порт) Implementation Plan

> **REQUIRED:** мастер-плейбук + **[BUG-INVENTORY.md](2026-05-15-BUG-INVENTORY.md)** (классы L, M, N, O, U) + **[STABILITY-PROGRAM.md](2026-05-15-STABILITY-PROGRAM.md)**.
>
> **САМЫЙ КРИТИЧНЫЙ БЛОК.** Пользователь сказал:
> *"Калькулятор самый важный и дотошный: это просто должно быть перетянуто, чтобы не потерялось вообще ничего."*
>
> И позже: *"калькулятор тоже постоянно лажает... чтобы летало и никогда не падало"*. Это значит мы **И** переносим 1:1 формулы (через golden-master) **И** фиксим архитектурные баги (numeric coercion, pricing inconsistency, duplicate saves).
>
> **Двойная стратегия:**
> 1. **Формулы** — переносим 1:1. Golden-master гарантирует это.
> 2. **Архитектура** — редизайним. TypeScript типы вместо `parseFloat(event.target.value)`, единый `pricing.ts` вместо 5 разрозненных мест, snapshot semantics для `calculator_data`, явная кнопка «Пересчитать» вместо невидимого auto-recalc.

**Goal:** Перенести всю расчётную логику из `js/calculator.js`, `js/pendant.js`, `js/factual.js`, `js/colors.js`, нужная часть `js/tpa.js` в чистый TypeScript-модуль, изолированный от UI. Полный набор golden-master тестов на основе ≥20 реальных заказов. Архитектурные защиты против классов багов L-N-O-U.

**Класс багов, которые фиксятся:**
- **L. Calc draft duplicate saves** → Idempotency + явная кнопка save (no auto-save)
- **M. Numeric coercion** → TypeScript типы + runtime валидация на API границе
- **N. Pricing inconsistency** (blank/pendant/B2B) → единый `pricing.ts`, переиспользуется всеми surfaces
- **O. Slow startup, stale assets** → Vite hash-based bundling, один JS-бандл
- **U. Margin drift on save** → no auto-recalc, явная кнопка «Пересчитать»

**Что переносим 1:1 (без изменений):**
- Все формулы расчёта (это блокировка golden-master'ом)
- Все edge case'ы и «странности»
- Все коэффициенты

**Что меняем архитектурно:**
- Структуру: разрозненная логика в `js/calculator.js` → модули в `ops/api/src/calc/`
- Типы: динамическая JS → TypeScript strict
- Pricing: 5 мест → 1 модуль `pricing.ts`
- Recalc: implicit/auto → explicit user action

**Source files to study (read first):**
- `js/calculator.js` — главный движок (~5000 строк)
- `js/pendant.js` — конструктор подвесов
- `js/factual.js` — фактические показатели
- `js/colors.js` — справочник цветов (используется в расчётах)
- `js/tpa.js` — только функция live-calc (раздел "ТПА живой расчёт")
- `js/indirect_costs.js` — косвенные расходы (используются в расчёте маржи)

**Dependencies:** Blocks 1-6.

**Branch:** `block-7-calculator`

---

## Architecture

```
ops/api/src/calc/
├── index.ts             публичный API: calcOrder(input) → output
├── pricing.ts           ⭐ ЕДИНЫЙ модуль расчёта цены (фикс класса N)
│                        retailPrice, b2bPrice, costPrice — три ф-ции
│                        Все остальные модули дёргают ОТСЮДА.
├── pendant.ts           логика подвесов (использует pricing.ts)
├── packaging.ts         логика упаковки (использует pricing.ts)
├── hardware.ts          логика фурнитуры (использует pricing.ts)
├── colors.ts            справочник цветов и расход
├── factual.ts           фактические показатели + сравнение план/факт
├── indirect.ts          косвенные расходы
├── tpa.ts               ТПА живой калькулятор
├── types.ts             все TypeScript интерфейсы (strict mode)
├── validate.ts          runtime валидация входов (zod схемы)
└── README.md            документация: что куда подключается, как работают формулы
```

**Принципы:**
- Каждый файл — чистые функции, без `window`, без `document`, без сетевых вызовов. Все данные передаются параметрами. Тесты могут вызывать функции напрямую без поднятия Express.
- **TypeScript strict mode**, никаких `any`, все числовые поля типа `number` (не `number | string`).
- На границе API (`POST /api/calc/preview`) — runtime валидация через zod схему. Если клиент шлёт `"1.5"` строкой — преобразуется в число или 400 если не парсится. **Фикс класса M.**
- **ЕДИНЫЙ pricing.ts.** Все surface (calculator screen, КП, factual recalc, b2b price suggestion) дёргают одни и те же функции. **Фикс класса N.** Никакого «retail price считается тут, B2B price там, blank price вообще третьим способом».

---

## File Structure

| File | Action |
|------|--------|
| `ops/api/src/calc/*` | Все 9 файлов выше |
| `ops/api/test/calc/golden-master.test.ts` | Основной тест |
| `ops/api/test/fixtures/orders/` | JSON-снапшоты реальных заказов |
| `ops/scripts/export-golden-fixtures.mjs` | Из Supabase + старого UI собирает 20+ снапшотов |
| `ops/api/src/routes/calc.js` | (опц) сервисный эндпойнт `/api/calc/preview` для UI live-preview |
| `tests/playwright/calculator.spec.ts` | E2E — открыть реальный заказ в старой calc.recycleobject.ru, открыть его же на ops-staging, сверить ИТОГО |

---

## Task 1: Подготовка golden-master fixtures

**Files:** Create `ops/scripts/export-golden-fixtures.mjs`, fixtures directory

**Цель:** собрать 20+ реальных заказов с входными данными и ожидаемыми расчётами.

- [ ] Создать `ops/scripts/export-golden-fixtures.mjs`:

```js
// Скачивает реальные заказы из Supabase, в т.ч. их calculator_data,
// и сохраняет на диск как JSON для golden-master тестов.
//
// Список ID заказов — в файле ops/scripts/fixtures-order-ids.txt (по одному id на строку).
// Выбирать заказы разные: с молдами, без молдов, с подвесами, без, разных размеров,
// с факт-данными и без, разных статусов.
//
// Запуск:
//   node ops/scripts/export-golden-fixtures.mjs

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import path from 'node:path';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const FIXTURES_DIR = path.resolve('ops/api/test/fixtures/orders');

async function main() {
  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  const idsText = await fs.readFile('ops/scripts/fixtures-order-ids.txt', 'utf8');
  const ids = idsText.split('\n').map(s => s.trim()).filter(Boolean);
  console.log(`Exporting ${ids.length} orders`);

  for (const id of ids) {
    const order = (await supabase.from('orders').select('*').eq('id', id).single()).data;
    const items = (await supabase.from('order_items').select('*').eq('order_id', id)).data;
    const factuals = (await supabase.from('order_factuals').select('*').eq('order_id', id)).data;
    const fixture = { id, order, items, factuals, exportedAt: new Date().toISOString() };
    await fs.writeFile(path.join(FIXTURES_DIR, `${id}.json`), JSON.stringify(fixture, null, 2));
    console.log(`✓ ${id}: ${items.length} items, ${factuals.length} factuals`);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] Создать `ops/scripts/fixtures-order-ids.txt` — изначально пустой. Заполни 20+ ID реальных заказов (выбирать вручную в Supabase Studio):
  - 5+ простых заказов (1-2 позиции, без молдов)
  - 5+ заказов с подвесами
  - 5+ заказов с молдами и фурнитурой
  - 3+ заказов с факт-данными
  - 2+ "сложных" — больше 10 позиций, несколько молдов, кастомные параметры

- [ ] Запустить: `node ops/scripts/export-golden-fixtures.mjs`
- [ ] Проверить файлы появились в `ops/api/test/fixtures/orders/`.

**На что ОСОБЕННО смотреть при выборе fixture'ов:**
- Заказы с `calculator_data` JSON (там есть `total_revenue`, `total_cost`, `total_margin`, `margin_percent`, `factual` детали — это наши expected outputs)

- [ ] Commit (НЕ pushить фикстуры если в них реальные клиенты — но в данном случае это staging, можно):
  `Export 20+ real-order golden master fixtures`

---

## Task 2: Извлечь логику расчёта из старого кода

Это **исследовательский шаг**. Перед написанием TS-кода прочитай:

- [ ] `js/calculator.js`: главные функции — `calculateOrderSummary`, `calculateProductionLoad`, `calculateFinDirectorData`. Понять их сигнатуру и какие данные нужны.
- [ ] `js/calculator.js`: формулы себестоимости, маржи, налогов (если есть).
- [ ] `js/pendant.js`: `calculatePendantCost`.
- [ ] `js/factual.js`: как из факт-данных вычисляется реальная себестоимость + прибыль.
- [ ] `js/indirect_costs.js`: как разносятся косвенные расходы (по молдам? по штукам? по часам?).
- [ ] `js/tpa.js`: формула live-калькулятора ТПА.

Записать **схему всех функций** в `ops/api/src/calc/README.md` — какие входы, какие выходы, какие зависимости.

```markdown
# Calc engine layout

## Public API (index.ts)

calcOrder(input: OrderInput): OrderOutput
  - Считает полный заказ: позиции, упаковка, фурнитура, подвесы, ТПА, маржа.
  - Источник: js/calculator.js#calculateOrderSummary

calcPendant(input: PendantInput): PendantOutput
  - Источник: js/pendant.js#calculatePendantCost

calcFactual(plan: OrderOutput, factual: FactualInput): FactualOutput
  - Сравнение план/факт.
  - Источник: js/factual.js#calculateFinDirectorData

calcTpaLive(input: TpaInput): TpaOutput
  - ТПА живой калькулятор.
  - Источник: js/tpa.js#liveCalc (только нужный кусок)

## Internal (hardware.ts, packaging.ts, ...)

[описание каждой функции, как использовалась в старом коде]
```

- [ ] Commit: `Document calc engine layout (README + types)`

---

## Task 3: TypeScript типы

**Files:** Create `ops/api/src/calc/types.ts`

```ts
// Все интерфейсы калькулятора. Имена полей — как в старом коде (snake_case или
// camelCase — смотри `js/calculator.js`). НЕ переименовывать поля.

export interface OrderInput {
  id?: number;
  order_name?: string;
  client_name?: string;
  quantity: number;
  items: OrderItemInput[];
  pendants?: PendantInput[];
  hardware?: HardwareInput[];
  packaging?: PackagingInput[];
  molds?: MoldInput[];
  // ... продолжать на основе js/calculator.js
}

export interface OrderItemInput {
  id?: number;
  type: string;          // 'standard', 'custom', 'pendant', ...
  name: string;
  qty: number;
  // ...
}

// ... все остальные интерфейсы
```

- [ ] Сначала добавить плейсхолдеры, потом по ходу написания тестов и реализации — конкретизировать.

- [ ] Commit: `Add calc TypeScript types skeleton`

---

## Task 4: Golden master test runner

**File:** Create `ops/api/test/calc/golden-master.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { calcOrder } from '../../src/calc/index.js';

const FIXTURES_DIR = path.resolve('test/fixtures/orders');

const TOLERANCE = 0.005;  // 0.5 копейки — для float arithmetic

function fixtureToInput(fixture) {
  // Преобразовать снапшот из Supabase в форму OrderInput для нашего движка.
  // ВНИМАНИЕ: эта функция — частая причина расхождений. Не угадывать, читать
  // js/calculator.js и js/orders.js, как они собирают input.
  return {
    id: fixture.order.id,
    order_name: fixture.order.order_name,
    quantity: fixture.order.quantity,
    items: fixture.items,
    // ... все поля
  };
}

function expectedFromFixture(fixture) {
  // calculator_data в старом коде хранил рассчитанные значения.
  const calcData = typeof fixture.order.calculator_data === 'string'
    ? JSON.parse(fixture.order.calculator_data)
    : fixture.order.calculator_data || {};
  return {
    total_revenue_plan: fixture.order.total_revenue ?? calcData.total_revenue,
    total_cost_plan: fixture.order.total_cost ?? calcData.total_cost,
    total_margin_plan: fixture.order.total_margin ?? calcData.total_margin,
    margin_percent_plan: fixture.order.margin_percent ?? calcData.margin_percent,
  };
}

const fixtures = await fs.readdir(FIXTURES_DIR);

for (const f of fixtures.filter(f => f.endsWith('.json'))) {
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, f), 'utf8'));
  test(`golden master: order ${fixture.id}`, () => {
    const input = fixtureToInput(fixture);
    const output = calcOrder(input);
    const expected = expectedFromFixture(fixture);

    assert.ok(
      Math.abs(output.total_revenue - expected.total_revenue_plan) < TOLERANCE,
      `total_revenue: got ${output.total_revenue}, expected ${expected.total_revenue_plan}`
    );
    assert.ok(
      Math.abs(output.total_cost - expected.total_cost_plan) < TOLERANCE,
      `total_cost: got ${output.total_cost}, expected ${expected.total_cost_plan}`
    );
    assert.ok(
      Math.abs(output.total_margin - expected.total_margin_plan) < TOLERANCE,
      `total_margin: got ${output.total_margin}, expected ${expected.total_margin_plan}`
    );
    assert.ok(
      Math.abs(output.margin_percent - expected.margin_percent_plan) < TOLERANCE,
      `margin_percent: got ${output.margin_percent}, expected ${expected.margin_percent_plan}`
    );
  });
}
```

- [ ] Запустить — все тесты упадут (`calcOrder` ещё не реализован, или возвращает заглушку).

- [ ] Commit: `Add golden master test runner for calc engine`

---

## Task 5-10: Реализация модулей по очереди

**Стратегия:** идём по одной формуле / одному типу позиции за раз. После каждого добавления — запускаем golden-master, смотрим какие тесты прошли. Постепенно подходим к 20/20.

### Task 5: Базовые позиции (без специальной логики)

- [ ] Реализовать `calcOrder()` для заказов с простыми позициями (без молдов, без подвесов).
- [ ] Из 20 фикстур — пусть проходят первые 5 простых.
- [ ] Commit: `calc: support basic order items, 5/20 golden masters pass`

### Task 6: Hardware (фурнитура)

- [ ] Перенести логику фурнитуры — `js/calculator.js` секция about hardware.
- [ ] Должны проходить заказы с фурнитурой → ≥10/20.
- [ ] Commit: `calc: support hardware, 10/20 golden masters pass`

### Task 7: Packaging

- [ ] Логика упаковки — отдельные блоки, расход материалов на упаковку.
- [ ] ≥12/20 проходят.
- [ ] Commit: `calc: support packaging, 12/20 golden masters pass`

### Task 8: Молды

- [ ] Расчёт стоимости использования молда: износ + материалы + время.
- [ ] ≥15/20.
- [ ] Commit: `calc: support molds, 15/20 golden masters pass`

### Task 9: Подвесы (pendant)

- [ ] Перенос `js/pendant.js` → `ops/api/src/calc/pendant.ts`.
- [ ] ≥17/20.
- [ ] Commit: `calc: support pendants, 17/20 golden masters pass`

### Task 10: Косвенные расходы + ТПА + factual

- [ ] Indirect costs из `js/indirect_costs.js`.
- [ ] ТПА live calc из `js/tpa.js`.
- [ ] Factual из `js/factual.js`.
- [ ] **20/20 проходят.**
- [ ] Commit: `calc: COMPLETE — all 20 golden masters pass`

---

## Task 11: Live preview endpoint

**Files:** Create `ops/api/src/routes/calc.js`

Сервисный эндпойнт `/api/calc/preview` для UI (Block 9 — Order editor): UI шлёт текущее состояние формы заказа → API считает → возвращает посчитанные значения.

```js
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { calcOrder } from '../calc/index.js';

const router = Router();

router.post('/preview', requireAuth, (req, res) => {
  try {
    const output = calcOrder(req.body);
    res.json(output);
  } catch (e) {
    res.status(400).json({ error: { code: 'CALC_ERROR', message: e.message } });
  }
});

export default router;
```

- [ ] Тесты: запрос с типовым input → 200 с правильным расчётом.
- [ ] Commit: `Add /api/calc/preview live-calc endpoint`

---

## Task 12: Двойной smoke на staging (ручная сверка)

**Не автоматизируется.** Ручной шаг.

- [ ] Откройте 5 свежих реальных заказов в старой `calc.recycleobject.ru`.
- [ ] Запишите их `total_revenue, total_cost, total_margin, margin_percent`.
- [ ] Откройте те же заказы на staging (после Block 9 — пока через прямой curl на `/api/calc/preview` с теми же входными данными).
- [ ] Сверка: цифры должны совпадать копейка в копейку.

Если расхождение — это **БЛОКЕР Block 9**. Фиксим в Block 7 и обновляем golden-master fixture.

- [ ] Commit (если были правки): `Fix calc engine: handle edge case X`

---

## Task 13: PR + merge

- [ ] PR в main с описанием "Block 7: Calculator engine. 20/20 golden master fixtures pass."
- [ ] CI должен быть зелёным.
- [ ] Merge.

## Acceptance Criteria

- [ ] `ops/api/test/fixtures/orders/` содержит ≥20 JSON-снапшотов реальных заказов
  - Минимум 3-5 B2B-заказа в выборке (чтобы покрыть pricing.ts:b2bPrice)
  - Минимум 5 с подвесами (pendant.ts)
  - Минимум 5 с молдами (mold cost + indirect)
- [ ] `npm test` запускает все golden master тесты, **20/20 проходят**
- [ ] Расхождение по любому полю **< 0.005 (полкопейки)**
- [ ] `/api/calc/preview` живой на staging, возвращает корректные ответы
- [ ] Ручная сверка с 5 реальными заказами — копейка в копейку
- [ ] `ops/api/src/calc/README.md` документирует все формулы и зависимости
- [ ] **TypeScript strict mode** включён без single `any` или `@ts-ignore`
- [ ] **pricing.ts** имеет ≥30 unit-тестов (отдельно от golden-master): edge cases (zero base, negative margin, missing currency, etc.)
- [ ] **Все retail/B2B/cost функции вызываются ТОЛЬКО из pricing.ts** — grep на остальные `.ts` файлы должен показать что нет дублирования pricing формул
- [ ] **No auto-recalc:** в UI кнопка «Пересчитать» нажимается явно. PATCH /orders/:id НЕ вызывает calcOrder.
- [ ] PR смержен в main

## Что делать если golden master ВНЕЗАПНО ломается

1. **Не паниковать.** Не "поправлять" expected значение в фикстуре.
2. Сравнить input → output между старой и новой логикой пошагово (логи debug).
3. Найти строку в `js/calculator.js`, где значение начинает расходиться.
4. Дублировать ту же строку в новый код **байт-в-байт**.
5. Если в старом коде явный баг (например, делит на 0 в edge case) — обсудить с пользователем. Чаще всего: перенести как есть, фиксить после Stage D.

## Замечание про дату/timezone

Старый код может использовать `new Date()` с локальным временем. В новом коде использовать UTC везде, **кроме** случаев когда golden master показывает расхождение из-за timezone — там тоже использовать ту же логику что в js/.

## Замечание про float arithmetic

Если расхождения порядка `0.001` — это float quirks. Применяй `Math.round(x * 100) / 100` ровно там же, где это делает старый код. Не лепи `toFixed(2)` где попало — это меняет результат.

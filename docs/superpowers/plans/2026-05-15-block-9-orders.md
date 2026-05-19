# Block 9 — ⭐ Orders + Order items + Factual Implementation Plan

> **REQUIRED:** мастер-плейбук + Block 7 (calc engine) + Block 8 (templates).
>
> **ВТОРОЙ САМЫЙ КРИТИЧНЫЙ БЛОК (после Block 7).** Пользователь сказал:
> *"Заказы: супер важная штука. Мы очень активно смотрим и каждый день пользуемся. Очень важно, чтобы это тоже перенеслось точь-в-точь, копеечку в копеечку."*

**Goal:** Перенести структуру заказов целиком: список, редактор/КП, факт-данные, операцию «списать фурнитуру под заказ». Связки с warehouse (через reservations), с calc engine (через `/api/calc/preview`), с production plan.

**Source reference:** `js/orders.js`, `js/order-detail.js`, `js/factual.js`, `js/kp.js`. Это самые большие модули.

**Dependencies:** Blocks 1-8.

**Branch:** `block-9-orders`

---

## File Structure

| File | Action |
|------|--------|
| `ops/db/migrations/008_orders.sql` | Tables `orders`, `order_items`, `order_factuals` |
| `ops/api/src/routes/orders.js` | CRUD + status transitions + consume-hardware |
| `ops/api/src/routes/order-items.js` | Под /api/orders/:id/items |
| `ops/api/src/routes/factual.js` | Факт-данные |
| `ops/api/test/orders.test.js`, `factual.test.js` | Tests |
| `ops/api/test/golden-master-full-order.test.ts` | Расширенная сверка: создать заказ через API, считать через calc, сверить с фикстурой |
| `ops/scripts/refresh/07-orders.mjs` | Copy orders/items/factuals |
| `ops/web/src/api/orders.ts` | Wrappers |
| `ops/web/src/stores/orders.ts` | Pinia |
| `ops/web/src/views/OrdersListView.vue` | Список |
| `ops/web/src/views/OrderEditorView.vue` | **Самый большой экран — редактор/КП** |
| `ops/web/src/components/order/*.vue` | Подкомпоненты редактора |
| `ops/web/src/views/FactualView.vue` | Факт-данные |
| `tests/playwright/orders.spec.ts` | E2E включая ручной двойной smoke |

---

## Task 1: SQL миграция

```sql
-- 008_orders.sql

CREATE TABLE IF NOT EXISTS orders (
    id                  BIGINT PRIMARY KEY,
    order_name          TEXT,
    client_name         TEXT,
    client_email        TEXT,
    client_phone        TEXT,
    status              TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft','quoted','approved','in_production','ready','shipped','closed','cancelled'
    )),
    deadline            DATE,
    deadline_start      DATE,
    manager_id          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    quantity            INTEGER,
    total_revenue       NUMERIC,
    total_cost          NUMERIC,
    total_margin        NUMERIC,
    margin_percent      NUMERIC,
    calculator_data     JSONB,                  -- весь снапшот расчёта
    extras              JSONB DEFAULT '{}'::jsonb,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_deadline ON orders(deadline);
CREATE INDEX IF NOT EXISTS idx_orders_client ON orders(LOWER(client_name));

CREATE TABLE IF NOT EXISTS order_items (
    id              BIGINT PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    type            TEXT,
    name            TEXT,
    qty             NUMERIC,
    unit_price      NUMERIC,
    line_total      NUMERIC,
    item_data       JSONB DEFAULT '{}'::jsonb,  -- хранится подробная спецификация
    position        INTEGER,                    -- порядок отображения
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_factuals (
    id              BIGINT PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    factual_data    JSONB NOT NULL,             -- факт-показатели (часы, расходы, итог)
    actual_revenue  NUMERIC,
    actual_cost     NUMERIC,
    actual_margin   NUMERIC,
    closed_at       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (order_id)
);

INSERT INTO app_meta (id, version) VALUES (1, '008-orders')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Commit: `Add orders + items + factuals tables`

---

## Task 2: Orders API

**Endpoints:**

```
GET    /api/orders[?status=&from=&to=&search=&manager_id=]
POST   /api/orders                              создать (draft)
GET    /api/orders/:id                          с items + factual
PATCH  /api/orders/:id                          обновить любые поля
DELETE /api/orders/:id                          (только admin, и только draft/cancelled)

POST   /api/orders/:id/items                    добавить позицию
PATCH  /api/orders/:id/items/:itemId            обновить
DELETE /api/orders/:id/items/:itemId

POST   /api/orders/:id/recalc                   пересчитать через calc engine, обновить calculator_data, total_*
POST   /api/orders/:id/status                   { new_status }: проверить переход допустим

POST   /api/orders/:id/consume-hardware         { items: [{warehouse_item_id, qty}], note }:
                                                списать фурнитуру со склада + history записи
                                                ИДЕМПОТЕНТНО (через Idempotency-Key)
```

**Бизнес-правила:**
- `consume-hardware` — критическая операция. Транзакция:
  1. Для каждой `{warehouse_item_id, qty}`: проверить `available_qty >= qty`, иначе 400.
  2. Уменьшить `warehouse_items.qty` на qty.
  3. Создать `warehouse_history` запись type='consume', order_id=:id, qty_change=-qty.
  4. Если есть активные `warehouse_reservations` для этого item+order — переводим в status='consumed' (по очереди FIFO до покрытия qty).
- `recalc`: вызвать `calcOrder()` из Block 7, сохранить результат в `orders.calculator_data` + `total_*` поля.
- `status` transitions allow only valid moves (например, нельзя из `cancelled` в `in_production`).

**Тесты (≥25):**
- CRUD стандартный
- Idempotency на consume-hardware (повторный вызов → нет дубликата списания)
- consume-hardware с недостаточным остатком → 400
- recalc обновляет calculator_data
- Status transitions: валидные проходят, невалидные → 400 INVALID_TRANSITION
- DELETE non-draft → 400 NOT_DELETABLE

- [ ] TDD-цикл. Commits: `Add orders API list+CRUD`, `Add order items API`, `Add consume-hardware operation`, `Add status transitions and recalc`

---

## Task 3: Factual API

**Endpoints:**
- GET `/api/orders/:id/factual`
- POST `/api/orders/:id/factual` (create if missing)
- PATCH `/api/orders/:id/factual`
- POST `/api/orders/:id/factual/recalc` → пересчитать `actual_revenue/cost/margin` через `calcFactual()` из Block 7

- [ ] Commit: `Add factual API`

---

## Task 4: Расширенный golden-master тест

**File:** `ops/api/test/golden-master-full-order.test.ts`

Это **end-to-end** тест: создать заказ через API → recalc → сверить `calculator_data` с эталоном из фикстуры.

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const FIXTURES_DIR = path.resolve('test/fixtures/orders');
const fixtures = await fs.readdir(FIXTURES_DIR);

async function loginAdmin() { /* login as admin, return cookie */ }
async function startServer() { /* spawn server with test DB */ }

for (const f of fixtures.filter(f => f.endsWith('.json'))) {
  const fixture = JSON.parse(await fs.readFile(path.join(FIXTURES_DIR, f), 'utf8'));
  test(`full-order golden master: order ${fixture.id}`, async (t) => {
    const server = await startServer();
    t.after(() => server.stop());
    const cookie = await loginAdmin();

    // Create order with same input as fixture
    const created = await fetch(`http://127.0.0.1:${server.port}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({
        order_name: fixture.order.order_name,
        quantity: fixture.order.quantity,
        // ...
      }),
    }).then(r => r.json());

    // Add items
    for (const item of fixture.items) {
      await fetch(`http://127.0.0.1:${server.port}/api/orders/${created.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(item),
      });
    }

    // Recalc
    await fetch(`http://127.0.0.1:${server.port}/api/orders/${created.id}/recalc`, {
      method: 'POST',
      headers: { Cookie: cookie, 'Idempotency-Key': crypto.randomUUID() },
    });

    // Fetch and verify
    const final = await fetch(`http://127.0.0.1:${server.port}/api/orders/${created.id}`, { headers: { Cookie: cookie } }).then(r => r.json());

    assert.ok(Math.abs(final.total_revenue - fixture.order.total_revenue) < 0.005);
    assert.ok(Math.abs(final.total_cost - fixture.order.total_cost) < 0.005);
    assert.ok(Math.abs(final.total_margin - fixture.order.total_margin) < 0.005);
  });
}
```

- [ ] Все 20 фикстур должны проходить. **Любая регрессия — БЛОКЕР.**
- [ ] Commit: `Add full-order golden master integration test`

---

## Task 5: refresh + compare

Скрипт `07-orders.mjs` копирует orders, order_items, order_factuals.

Особенности:
- `calculator_data` в Supabase — JSON. Переносим как есть.
- `extras` — старая система могла класть туда любые поля. Сохраняем.
- BIGINT для id, поэтому используем `pool.query('SELECT setval(...))')` после insert'ов для всех sequence'ов (хотя у нас orders.id — не serial, а bigint).

- [ ] Commit: `Add orders refresh and compare`

---

## Task 6: Vue 3 — Orders list

**File:** `ops/web/src/views/OrdersListView.vue`

Таблица заказов с колонками: id, name, client, status (с цветной плашкой), deadline (с подсветкой если просрочен), manager, revenue, margin %.

Фильтры:
- Status (multi-select)
- Date range (from / to)
- Manager
- Search (по order_name, client_name)

Сортировка по любой колонке. Пагинация если >100 записей.

Кнопка «Новый заказ» → переход на `/orders/new`.

- [ ] Commit: `Add orders list view`

---

## Task 7: Vue 3 — ⭐ Order editor / КП

**Files:** `ops/web/src/views/OrderEditorView.vue` + подкомпоненты в `ops/web/src/components/order/`

**Это самый большой и важный экран всей системы.** Перенести `js/orders.js` UI + `js/order-detail.js` 1:1.

Структура страницы:
1. **Шапка:** order_name, client info, status, deadline. Кнопки: "Сохранить", "Пересчитать", "Сменить статус", "Удалить", "Печать КП".
2. **Таб «Позиции» (items):**
   - Таблица позиций с inline-editing (qty, name, unit_price)
   - Кнопка "Добавить позицию" → диалог с типами: товар из шаблона / молд + фурнитура / подвес / упаковка / прочее
   - Кнопка "Списать фурнитуру со склада" → диалог: выбор позиций из warehouse, qty, note → POST `/api/orders/:id/consume-hardware`
3. **Таб «Расчёт» (calculator):**
   - Все цифры из `calculator_data`: revenue, cost, margin, разбивка по позициям
   - Live preview: при изменении в табе «Позиции» — автоматически вызывается `/api/calc/preview` для подсчёта
4. **Таб «Производство»:**
   - Список production_plan записей привязанных к заказу
   - Кнопка добавить план
5. **Таб «Факт» (factual):**
   - Поля факт-данных
   - Кнопка "Пересчитать факт" → POST `/factual/recalc`
   - Сравнение план/факт
6. **Таб «История»:**
   - Все изменения статуса
   - Все consume-hardware операции
   - Все ресэйвы

**Подкомпоненты:**
- `OrderHeader.vue`
- `OrderItemsTab.vue`
- `OrderItemRow.vue`
- `AddItemDialog.vue`
- `ConsumeHardwareDialog.vue`
- `OrderCalculatorTab.vue`
- `OrderProductionTab.vue`
- `OrderFactualTab.vue`
- `OrderHistoryTab.vue`

**Принципы:**
- Каждое сохранение — явная кнопка "Сохранить", не auto-save (auto-save в старой системе создавал странности — см. `js/orders.js`).
- При уходе со страницы с несохранёнными изменениями — confirm dialog.
- Live preview расчётов — асинхронно (debounce 500ms после последнего изменения).
- Idempotency-Key на каждое сохранение через api/index.ts (Block 2).

- [ ] Commits: `Add order header`, `Add items tab`, `Add calculator tab with live preview`, `Add production tab`, `Add factual tab`, `Add history tab`, `Add consume-hardware dialog`

---

## Task 8: Vue 3 — Factual view (отдельный экран если нужен)

В `js/factual.js` была отдельная страница `/factual` со списком всех закрытых заказов и финансовыми отчётами. Решить: оставить отдельную страницу или это всё внутри OrderEditor таб «Факт»?

Если оставлять отдельную:
- `/factual` — таблица всех заказов status='closed' с факт-данными
- Аналитика: суммы по месяцам, отклонение план/факт
- Экспорт в Excel/CSV

- [ ] Решение зафиксировать в `ops/README.md`. Commit accordingly.

---

## Task 9: Playwright E2E + ручная сверка с реальными заказами

**File:** `tests/playwright/orders.spec.ts`

Сценарий 1: login → /orders → создать новый заказ → добавить 2 позиции → recalc → проверить что цифры посчитались → сохранить → перезагрузить страницу → данные сохранились.

Сценарий 2: открыть существующий заказ → consume-hardware на 1 единицу фурнитуры → проверить что qty склада уменьшился, history запись появилась.

**Ручная сверка (БЛОКЕР на merge):**
- Взять 5 реальных активных заказов из production calc.recycleobject.ru
- На staging создать аналогичные заказы (или загрузить через refresh-snapshot)
- Сверить ИТОГО суммы копейка-в-копейку
- Если расхождение → стоп, разбираемся в Block 7

- [ ] Commit: `Add orders Playwright smoke`

---

## Task 10: PR + merge

- [ ] PR в main с описанием: «Block 9 complete. Все golden master full-order тесты зелёные. Ручная сверка на 5 заказах — копейка-в-копейку.»
- [ ] Code review (если есть кто review-ит) или self-approve.
- [ ] Merge.
- [ ] После merge — staging автодеплоится. Проверить главные сценарии вручную ещё раз.

## Acceptance Criteria

- [ ] API тесты ≥ 35 (orders + items + consume + factual + status)
- [ ] **20/20 full-order golden masters проходят**
- [ ] **5/5 реальных заказов сверены вручную, расхождений нет**
- [ ] consume-hardware идемпотентен — повторный вызов не списывает дважды
- [ ] На staging: orders list, editor, all tabs — работают
- [ ] compare-datasets совпадает по orders/items/factuals
- [ ] PR смержен в main, CI зелёный

## После завершения Block 9

К этому моменту система уже умеет делать то, ради чего всё затевалось:
- Сотрудница в России создаёт заказы, видит остатки, списывает фурнитуру.
- Калькулятор работает 1:1.
- Финансовые цифры совпадают с production.

С точки зрения операционного контура — **можно делать cutover уже сейчас**. Но мы продолжаем дальше блоки 10-16 (storage, tasks, время, аналитика, прочее), чтобы Supabase можно было ПОЛНОСТЬЮ отключить.

Если по какой-то причине хочется ускорить — после Block 9 можно сделать «частичный cutover»: переносим operations на staging, но финансы/задачи/время продолжают жить в старой calc на Supabase. Это не наш план, но опция доступна.

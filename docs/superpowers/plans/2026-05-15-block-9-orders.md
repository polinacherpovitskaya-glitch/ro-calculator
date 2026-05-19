# Block 9 — ⭐ Orders + Order items + Factual Implementation Plan

> **REQUIRED:** мастер-плейбук + Block 7 + Block 8 + **[WAREHOUSE-INTERACTION-MAP.md](2026-05-15-WAREHOUSE-INTERACTION-MAP.md)** + **[BUG-INVENTORY.md](2026-05-15-BUG-INVENTORY.md)**.

> **Класс багов, которые фиксятся (главные!):**
> - **D. "Project hardware ready" не помечается / не обновляется** — фиксили 4+ раза. Решение: state хранится только в `warehouse_reservations.status`, UI читает оттуда. `_buildProjectHardwareStockTruth` УДАЛЯЕТСЯ как класс.
> - **C. Фантомные/орфанные резервы** — FK `warehouse_reservations.order_id REFERENCES orders(id) ON DELETE CASCADE` + cron-задача очистки при close/cancel
> - **E. Дубликаты позиций в orders / item_data drift** — order_items хранятся отдельно от calculator_data
> - **B. Двойное consume** — Idempotency-Key
> - **G. Race conditions** при параллельных consume — транзакция + SELECT FOR UPDATE
> - **F. Цены рассинхрон** — calculator_data хранит snapshot цен, не живые ссылки
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

**Бизнес-правила (главная часть редизайна, см. WAREHOUSE-INTERACTION-MAP и BUG-INVENTORY):**

### consume-hardware — критическая операция

Транзакция с FOR UPDATE и идемпотентностью (фикс классов B, G, D):

```js
// POST /api/orders/:id/consume-hardware
// Body: { items: [{ warehouse_item_id, qty, note? }], note? }
// Header: Idempotency-Key
//
router.post('/:id/consume-hardware', requireAuth, async (req, res) => {
  await withIdempotency(req, res, async (req, res) => {
    const orderId = Number(req.params.id);
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) throw httpError(400, 'NO_ITEMS');

    await withTransaction(async (client) => {
      // 1. Lock order
      const orderRes = await client.query(
        `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`, [orderId]
      );
      if (!orderRes.rows[0]) throw httpError(404, 'NOT_FOUND');
      if (['closed', 'cancelled'].includes(orderRes.rows[0].status)) {
        throw httpError(400, 'ORDER_FINAL', 'Нельзя списывать в закрытый/отменённый заказ');
      }

      // 2. Lock all warehouse items в одном порядке (ORDER BY id — избегаем дедлоков)
      const itemIds = [...new Set(items.map(i => Number(i.warehouse_item_id)))].sort((a,b) => a-b);
      await client.query(
        `SELECT id, qty FROM warehouse_items WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
        [itemIds]
      );

      // 3. Для каждого item: проверить хватает, посчитать new qty, обновить, записать history
      for (const inp of items) {
        const itemId = Number(inp.warehouse_item_id);
        const qtyNeeded = Number(inp.qty);
        if (qtyNeeded <= 0) throw httpError(400, 'BAD_QTY');

        const cur = await client.query(
          `SELECT qty FROM warehouse_items WHERE id = $1`, [itemId]
        );
        const qty_before = Number(cur.rows[0].qty);
        const qty_after = qty_before - qtyNeeded;
        if (qty_after < 0) {
          throw httpError(400, 'INSUFFICIENT_STOCK',
            `На складе ${qty_before}, запрошено ${qtyNeeded}`, { item_id: itemId, available: qty_before, requested: qtyNeeded });
        }

        await client.query(
          `UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`,
          [qty_after, itemId]
        );
        await client.query(
          `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change,
             order_id, actor_user_id, actor_name, note)
           VALUES ($1, 'consume', $2, $3, $4, $5, $6, $7, $8)`,
          [itemId, qty_before, qty_after, -qtyNeeded, orderId, req.user.id, req.user.email, inp.note || null]
        );

        // 4. Если у заказа были резервы на этот item — переводим в consumed (FIFO)
        const reservationsToConsume = await client.query(
          `SELECT id, qty FROM warehouse_reservations
            WHERE order_id = $1 AND item_id = $2 AND status = 'active' AND source = 'order'
            ORDER BY created_at ASC
            FOR UPDATE`,
          [orderId, itemId]
        );
        let remaining = qtyNeeded;
        for (const r of reservationsToConsume.rows) {
          if (remaining <= 0) break;
          const rQty = Number(r.qty);
          if (rQty <= remaining) {
            // Полностью consume
            await client.query(
              `UPDATE warehouse_reservations SET status = 'consumed', consumed_at = NOW()
               WHERE id = $1`, [r.id]
            );
            remaining -= rQty;
          } else {
            // Частичное — split: текущий резерв становится consumed на qty=remaining,
            // остаток создаётся новой записью со status='active'
            await client.query(
              `UPDATE warehouse_reservations SET qty = $1, status = 'consumed', consumed_at = NOW()
               WHERE id = $2`, [remaining, r.id]
            );
            await client.query(
              `INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status, note, actor_user_id)
               VALUES ($1, $2, $3, 'order', 'active', $4, $5)`,
              [itemId, orderId, rQty - remaining,
               `Split from consumed res #${r.id}`, req.user.id]
            );
            remaining = 0;
          }
        }
      }
    });
    res.json({ ok: true });
  });
});
```

### Резервы под заказ (fix классы C, D, E)

- При **создании заказа** или **изменении состава фурнитуры** (если order_items содержат `warehouse_item_id`):
  - В транзакции: удалить все `active` резервы со `source='order'` и `order_id=:id`, создать новые согласно текущему составу.
  - Не пытаемся «обновить» существующие резервы — это путь к багам класса E. Только полная пересборка.
- При `DELETE order` или `status = 'closed'/'cancelled'`:
  - CASCADE FK удаляет резервы физически — для DELETE
  - Для close/cancel cron-задача переводит резервы в `released`, no qty change

### Cron-задача очистки резервов

Файл `ops/api/src/cron/reservation-cleanup.js`:

```js
import { getPool } from '../db.js';

export async function releaseOrphanReservations() {
  const pool = getPool();
  // Резервы где order закрыт/отменён — переводим в released
  const res = await pool.query(`
    UPDATE warehouse_reservations r
    SET status = 'released', released_at = NOW()
    FROM orders o
    WHERE r.order_id = o.id
      AND r.source = 'order'
      AND r.status = 'active'
      AND o.status IN ('closed', 'cancelled')
    RETURNING r.id, r.item_id, r.order_id, r.qty
  `);
  console.log(`[cron] released ${res.rows.length} orphan reservations`);
  return res.rows;
}
```

Запуск: через `node-cron` каждый час, или через systemd timer:

```
# ops/infra/systemd/ops-reservation-cleanup.timer
[Unit]
Description=Release orphan reservations for closed/cancelled orders

[Timer]
OnCalendar=hourly
Persistent=true

[Install]
WantedBy=timers.target
```

```
# ops/infra/systemd/ops-reservation-cleanup.service
[Unit]
Description=Release orphan reservations
[Service]
Type=oneshot
ExecStart=/usr/bin/curl -fsS -X POST -H "Authorization: Bearer <internal-token>" https://localhost/api/internal/cleanup-reservations
```

Эндпойнт `POST /api/internal/cleanup-reservations` — с auth по internal-token (НЕ user session), вызывает `releaseOrphanReservations()`.

### Другие правила

- `recalc`: вызвать `calcOrder()` из Block 7, сохранить результат в `orders.calculator_data` + `total_*` поля.
- `status` transitions allow only valid moves (например, нельзя из `cancelled` в `in_production`).
- **calculator_data — snapshot**, не live ссылки на цены (фикс класс F). При recalc пересоздаётся.
- **order_items хранятся отдельно** от calculator_data — отдельные эндпойнты, не json merge (фикс класс E).
- При `consume-hardware` — `UPDATE orders SET updated_at = NOW()` чтобы `updated_at` отражал реальное состояние.

**Тесты (≥35, фокус на регрессионных багах):**
- CRUD стандартный
- Idempotency на consume-hardware (повторный вызов с тем же ключом → нет дубликата списания) — фикс класс B
- consume-hardware с недостаточным остатком → 400 INSUFFICIENT_STOCK c details (item_id, available, requested)
- consume-hardware в order со status='closed'/'cancelled' → 400 ORDER_FINAL
- consume-hardware с qty <= 0 → 400 BAD_QTY
- **Race-condition тест:** два параллельных consume на один item, qty=5, item.qty=8 → один 200, другой 400 INSUFFICIENT_STOCK (не оба прошли из-за FOR UPDATE)
- consume переводит соответствующие active reservations в consumed (FIFO)
- Резерв split: если qty запроса < qty резерва — split на consumed + новый active
- **DELETE order CASCADE удаляет резервы** — проверить SELECT после DELETE возвращает 0 строк
- close/cancel order + запуск cron releaseOrphanReservations() → резервы становятся released
- recalc обновляет calculator_data
- Status transitions: валидные проходят, невалидные → 400 INVALID_TRANSITION
- DELETE non-draft → 400 NOT_DELETABLE
- **Инвариант I1** после серии consume: SUM(active reservations qty) ≤ warehouse_items.qty
- **Инвариант I2** после операций: SUM(qty_change в history) = warehouse_items.qty
- **Инвариант I4**: после close order → 0 orphan active reservations

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

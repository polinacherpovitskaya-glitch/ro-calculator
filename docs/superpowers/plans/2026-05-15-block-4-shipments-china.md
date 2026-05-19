# Block 4 — Приёмки + Китай (закупки + каталог) Implementation Plan

> **REQUIRED:** мастер-плейбук + Block 3 plan + **[WAREHOUSE-INTERACTION-MAP.md](2026-05-15-WAREHOUSE-INTERACTION-MAP.md)** + **[BUG-INVENTORY.md](2026-05-15-BUG-INVENTORY.md)**. `receive` операция — главная точка где склад растёт; здесь применяются все защиты из map'а.

> **Класс багов, которые фиксятся в этом блоке** (см. BUG-INVENTORY):
> - **I. Авто-создание «пустых» позиций при приёмке** (commit e93ca26) → валидация `warehouse_item_id` или явный `create_new=true`
> - **B. Двойная приёмка** → Idempotency-Key на receive
> - **G. Race conditions** при параллельных приёмках → `SELECT FOR UPDATE` + транзакция
> - **A. Stale qty после приёмки** → один путь, никаких локальных кэшей

**Goal:** Сотрудник может:
- Создавать «приёмки» (shipments) — груз пришёл, такие-то позиции в таком-то количестве
- Принимать приёмку → автоматически добавляются `warehouse_history` записи type='receipt' + увеличивается qty
- Вести Китай-закупки: статусы (черновик → оплачено → в пути → пришло → принято), привязка к shipment при приёмке
- Смотреть Китай-каталог (справочник того, что заказывали в Китае с фото/ценами)

**Source reference:** `js/china.js`, `js/china_catalog.js`, `js/orders.js` (часть про shipments).

**Dependencies:** Block 3 (warehouse существует — нужно для FK на item_id в shipments).

**Branch:** `block-4-shipments-china`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `ops/db/migrations/004_shipments_china.sql` | **Create** | Tables `shipments`, `shipment_items`, `china_purchases`, `china_purchase_items`, `china_catalog` |
| `ops/api/src/routes/shipments.js` | **Create** | CRUD + POST :id/receive |
| `ops/api/src/routes/china.js` | **Create** | Purchases CRUD + catalog read/write |
| `ops/api/test/shipments.test.js` + `china.test.js` | **Create** | TDD |
| `ops/scripts/refresh/03-shipments-china.mjs` | **Create** | Copy shipments + china_* |
| `ops/scripts/refresh-staging-snapshot.mjs` | **Modify** | Add `03-shipments-china` to scripts list |
| `ops/scripts/compare-datasets.mjs` | **Modify** | Add `shipments`, `china_purchases`, `china_catalog` to TABLES |
| `ops/web/src/api/shipments.ts` + `china.ts` | **Create** | fetch обёртки |
| `ops/web/src/stores/shipments.ts` + `china.ts` | **Create** | Pinia stores |
| `ops/web/src/views/ShipmentsListView.vue` + `ShipmentView.vue` | **Create** | Список + форма приёмки |
| `ops/web/src/views/ChinaPurchasesView.vue` + `ChinaPurchaseView.vue` | **Create** | Закупки |
| `ops/web/src/views/ChinaCatalogView.vue` | **Create** | Каталог |
| `ops/web/src/router.ts` | **Modify** | `/shipments`, `/shipments/:id`, `/china`, `/china/:id`, `/china/catalog` |
| `tests/playwright/shipments-china.spec.ts` | **Create** | E2E |

---

## Task 1: SQL миграция

```sql
-- 004_shipments_china.sql

CREATE TABLE IF NOT EXISTS shipments (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    source          TEXT,                   -- 'china', 'russia', 'other'
    status          TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_transit','received','cancelled')),
    expected_date   DATE,
    received_at     TIMESTAMPTZ,
    total_cost      NUMERIC,
    currency        TEXT,
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shipment_items (
    id              BIGSERIAL PRIMARY KEY,
    shipment_id     BIGINT NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
    warehouse_item_id BIGINT REFERENCES warehouse_items(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    qty             NUMERIC NOT NULL,
    unit_price      NUMERIC,
    currency        TEXT,
    received_qty    NUMERIC,
    extras          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_shipment_items_shipment ON shipment_items(shipment_id);

CREATE TABLE IF NOT EXISTS china_purchases (
    id              BIGINT PRIMARY KEY,
    title           TEXT,
    supplier        TEXT,
    order_url       TEXT,
    status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','paid','in_transit','arrived','received','cancelled')),
    paid_amount     NUMERIC,
    paid_currency   TEXT,
    paid_at         TIMESTAMPTZ,
    arrived_at      TIMESTAMPTZ,
    shipment_id     BIGINT REFERENCES shipments(id) ON DELETE SET NULL,
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS china_purchase_items (
    id              BIGSERIAL PRIMARY KEY,
    purchase_id     BIGINT NOT NULL REFERENCES china_purchases(id) ON DELETE CASCADE,
    warehouse_item_id BIGINT REFERENCES warehouse_items(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    qty             NUMERIC NOT NULL,
    unit_price      NUMERIC,
    currency        TEXT,
    extras          JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS china_catalog (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    sku             TEXT,
    description     TEXT,
    photo_url       TEXT,
    last_price      NUMERIC,
    last_currency   TEXT,
    supplier        TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_meta (id, version) VALUES (1, '004-shipments-china')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Apply, commit: `Add shipments + china_purchases + catalog tables`

---

## Task 2: Shipments API

**Files:** `ops/api/src/routes/shipments.js`, `ops/api/test/shipments.test.js`

Endpoints:
- `GET /api/shipments[?status=&from=&to=]` — список с фильтрами
- `GET /api/shipments/:id` — детально с items
- `POST /api/shipments` — создать
- `PATCH /api/shipments/:id`
- `DELETE /api/shipments/:id` (только если status='planned')
- `POST /api/shipments/:id/receive` — **критическая операция** (фиксит классы B/G/I/A из BUG-INVENTORY):
  - Всё в одной транзакции (`withTransaction`)
  - Идемпотентно через `withIdempotency` — повторный вызов с тем же ключом не дублирует
  - `SELECT ... FOR UPDATE` на shipment row + на все затронутые warehouse_items (lock — фиксит race conditions класс G)
  - **Валидация перед мутацией** (класс I):
    - shipment.status != 'received' иначе 400 ALREADY_RECEIVED
    - shipment_items не пустой иначе 400 EMPTY_SHIPMENT
    - каждый shipment_item имеет `warehouse_item_id` ИЛИ `extras.create_new === true` с обязательными `name`, `extras.sku`. Иначе 400 NO_WAREHOUSE_LINK.
  - Для `create_new` items: создаётся warehouse_item (qty=0 initially), потом по общему пути.
  - Для каждого item: increment `warehouse_items.qty`, обновить `last_price`/`last_currency` если в shipment_item указаны.
  - Запись в `warehouse_history` с **каноническим type='receipt'**, shipment_id=..., actor_user_id=..., qty_change > 0 (CHECK constraint enforce-нёт).
  - Mark shipment.status='received', received_at=NOW().
  - Если есть связанный `china_purchases.shipment_id` — обновить его status='received', arrived_at=NOW().
  - **НЕ создаёт reservations.** Receipt — это просто увеличение qty, никаких резервов это не порождает.

Тесты:
- POST receive дважды с тем же Idempotency-Key → второй раз возвращает кешированный ответ, qty НЕ увеличивается дважды
- POST receive без Idempotency-Key → 400
- POST receive shipment, у которого нет items → 400 EMPTY_SHIPMENT
- POST receive обновляет qty + добавляет history записи c type='receipt'
- POST receive с item без warehouse_item_id и без create_new → 400 NO_WAREHOUSE_LINK (фикс класс I)
- POST receive с create_new=true но без name/sku → 400 INSUFFICIENT_NEW_ITEM_DATA
- POST receive дважды без Idempotency-Key (разные ключи) → второй вызов 400 ALREADY_RECEIVED
- **Race-condition тест:** два одновременных receive разных shipments на одни warehouse_items → оба завершаются без потери qty (sequential через FOR UPDATE)
- **Инвариант I2 после receive:** SUM(qty_change) в history по item = текущему qty

- [ ] TDD: тесты падают → реализация → зелёные
- [ ] Commits: `Add shipments API`, `Add shipment receive operation`

---

## Task 3: China API

**Files:** `ops/api/src/routes/china.js`, `ops/api/test/china.test.js`

Endpoints:
- `GET /api/china/purchases[?status=]`
- `POST /api/china/purchases`
- `GET/PATCH/DELETE /api/china/purchases/:id`
- `POST /api/china/purchases/:id/receive` — создаёт shipment, переносит items в shipment_items, затем receive (та же логика что Task 2)
- `GET /api/china/catalog[?search=]`
- `POST /api/china/catalog` (добавить позицию)
- `PATCH /api/china/catalog/:id`

Тесты — стандартные CRUD + idempotency + статусные переходы.

- [ ] Commit: `Add china API: purchases + catalog`

---

## Task 4: refresh + compare

- [ ] `ops/scripts/refresh/03-shipments-china.mjs` — копирует все 5 таблиц.
- [ ] Дополнить `refresh-staging-snapshot.mjs` (добавить `03-shipments-china`) и `compare-datasets.mjs` (добавить таблицы).
- [ ] Прогнать локально, цифры должны совпасть.
- [ ] Commit: `Add shipments+china refresh and compare`

---

## Task 5: Vue 3 экраны

**Файлы:** `Shipments(List|)View.vue`, `China(Purchases|Catalog|Purchase)View.vue`, обновить router

Минимальный список экранов:
- `/shipments` — список приёмок, фильтр по статусу
- `/shipments/new` — модалка или страница
- `/shipments/:id` — редактирование + кнопка «Принять (receive)» с подтверждением (огромная красная плашка «это увеличит qty на складе, отменить нельзя»)
- `/china` — список закупок Китая, фильтр по статусу
- `/china/:id` — закупка с привязкой к каталогу
- `/china/catalog` — таблица каталога, поиск, добавление

Стандартный паттерн: Pinia store + API обёртки + сами Vue компоненты.

- [ ] Commits: `Add shipments views`, `Add china views`

---

## Task 6: Playwright smoke + README + PR

**File:** `tests/playwright/shipments-china.spec.ts`

Сценарий: login → создать приёмку с 2 позициями → принять → открыть warehouse → увидеть что qty увеличился → открыть history → увидеть type='receipt'.

- [ ] PR в main, ждать CI, merge.

## Acceptance Criteria

- [ ] API тесты зелёные (shipments + china ≥ 20 тестов)
- [ ] Playwright smoke зелёный
- [ ] На staging: приёмка приходит, qty увеличивается, history записывается
- [ ] Idempotency POST /receive проверен (повторный вызов с тем же ключом не дублирует)
- [ ] compare-datasets показывает совпадение по shipments, china_purchases, china_catalog

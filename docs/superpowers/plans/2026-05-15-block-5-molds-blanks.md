# Block 5 — Молды + Бланки + Цвета + Marketplaces Implementation Plan

> **REQUIRED:** мастер-плейбук + предыдущие блоки.

**Goal:** Перенести модули:
- **Молды** (`molds`) — формы для отливки с привязкой к hardware/blanks
- **Бланки** (`hw_blanks`, `pkg_blanks`) — заготовки, очень важная страница (пользователь сказал "Бланки: супер важная страница")
- **Цвета** (`app_colors`) — справочник
- **Marketplaces (Битуси)** (`marketplace_sets`) — наборы для продаж

**Source reference:** `js/molds.js`, разделы в `index.html` про hardware/packaging/colors/marketplaces.

**Dependencies:** Block 3 (warehouse — нужно для привязки фурнитуры к молдам и бланкам).

**Branch:** `block-5-molds-blanks`

---

## File Structure

| File | Action |
|------|--------|
| `ops/db/migrations/005_molds_blanks.sql` | Tables: `molds`, `mold_hardware`, `mold_usage_log`, `hw_blanks`, `pkg_blanks`, `app_colors`, `marketplace_sets` |
| `ops/api/src/routes/molds.js` | API |
| `ops/api/src/routes/blanks.js` | API для hw_blanks, pkg_blanks |
| `ops/api/src/routes/colors.js` | API для app_colors |
| `ops/api/src/routes/marketplaces.js` | API |
| `ops/api/test/molds.test.js`, `blanks.test.js`, `colors.test.js`, `marketplaces.test.js` | Tests |
| `ops/scripts/refresh/04-molds-blanks.mjs` | Copy from Supabase |
| `ops/web/src/api/(molds|blanks|colors|marketplaces).ts` | Wrappers |
| `ops/web/src/stores/(molds|blanks|colors|marketplaces).ts` | Pinia |
| `ops/web/src/views/MoldsListView.vue`, `MoldView.vue` | Молды |
| `ops/web/src/views/BlanksView.vue` | Бланки (hw + pkg в табах) |
| `ops/web/src/views/ColorsView.vue` | Цвета |
| `ops/web/src/views/MarketplacesView.vue` | Marketplaces |
| `ops/web/src/router.ts` | Routes |
| `tests/playwright/molds-blanks.spec.ts` | E2E |

---

## Task 1: SQL миграция

```sql
-- 005_molds_blanks.sql

CREATE TABLE IF NOT EXISTS molds (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    type            TEXT,                       -- 'silicone', 'plastic', 'metal', etc.
    status          TEXT DEFAULT 'active' CHECK (status IN ('active','retired','broken')),
    capacity        INTEGER,                    -- сколько единиц за прогон
    usage_count     INTEGER NOT NULL DEFAULT 0,
    usage_limit     INTEGER,                    -- предполагаемый ресурс
    photo_url       TEXT,
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mold_hardware (
    id              BIGSERIAL PRIMARY KEY,
    mold_id         BIGINT NOT NULL REFERENCES molds(id) ON DELETE CASCADE,
    warehouse_item_id BIGINT REFERENCES warehouse_items(id) ON DELETE SET NULL,
    qty_per_use     NUMERIC NOT NULL,
    note            TEXT,
    UNIQUE (mold_id, warehouse_item_id)
);

CREATE TABLE IF NOT EXISTS mold_usage_log (
    id              BIGSERIAL PRIMARY KEY,
    mold_id         BIGINT NOT NULL REFERENCES molds(id) ON DELETE CASCADE,
    units           INTEGER NOT NULL,
    order_id        BIGINT,
    operator_name   TEXT,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS hw_blanks (
    id              BIGINT PRIMARY KEY,
    sku             TEXT,
    name            TEXT NOT NULL,
    category        TEXT,
    weight          NUMERIC,
    last_price      NUMERIC,
    last_currency   TEXT,
    photo_url       TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pkg_blanks (
    id              BIGINT PRIMARY KEY,
    sku             TEXT,
    name            TEXT NOT NULL,
    category        TEXT,
    last_price      NUMERIC,
    last_currency   TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_colors (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    hex             TEXT,
    category        TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketplace_sets (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    marketplace     TEXT,                       -- 'wb', 'ozon', 'битуси', etc.
    sku             TEXT,
    price           NUMERIC,
    currency        TEXT,
    composition     JSONB DEFAULT '[]'::jsonb,  -- список позиций (warehouse_item_id + qty)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_meta (id, version) VALUES (1, '005-molds-blanks')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Commit: `Add molds, blanks, colors, marketplaces tables`

---

## Task 2-5: API для каждого ресурса (стандартный паттерн)

Для каждого из 4 ресурсов (molds, blanks, colors, marketplaces):
- 4 эндпойнта: GET list, POST, PATCH :id, DELETE :id
- Стандартный auth middleware + idempotency на мутациях
- TDD тесты: 5-6 тестов на ресурс

**Особенности молдов:**
- `GET /api/molds/:id/hardware` — список привязанной фурнитуры
- `PUT /api/molds/:id/hardware` — заменить весь список (массив `[{warehouse_item_id, qty_per_use, note}, ...]`)
- `POST /api/molds/:id/use` — записать использование: `usage_count` инкрементируется на `units`, запись в `mold_usage_log`. Если есть привязанные `mold_hardware` — для каждого: создать или увеличить активный резерв в `warehouse_reservations` по `qty_per_use * units` (или сразу списать через consume — зависит от рабочего флоу, читай `js/molds.js` секцию `useMold()`)

**Особенности marketplaces:**
- `composition` — массив `[{warehouse_item_id, qty}, ...]`. Валидация: все referencce-ы существуют.

- [ ] 4 коммита: `Add molds API`, `Add blanks API`, `Add colors API`, `Add marketplaces API`

---

## Task 6: refresh + compare

- [ ] `ops/scripts/refresh/04-molds-blanks.mjs` — копирует все 7 таблиц (molds + mold_hardware + mold_usage_log + hw_blanks + pkg_blanks + app_colors + marketplace_sets).
- [ ] Дополнить orchestrator и compare скрипты.
- [ ] Commit: `Add molds-blanks refresh and compare`

---

## Task 7: Vue 3 экраны

**Молды (`/molds`, `/molds/:id`):**
- Список с поиском, фильтром по статусу, индикатором износа (`usage_count / usage_limit`)
- Карточка молда: поля + табы (фурнитура / журнал использования)
- На вкладке фурнитура — список с qty_per_use, кнопка "Добавить фурнитуру" → выбор из warehouse_items
- Кнопка "Зафиксировать использование" → форма с units, order_id, operator_name → POST /use

**Бланки (`/blanks`):**
- Два таба: «Hardware» и «Packaging». В каждом — таблица позиций.
- Кнопка "Новый бланк" → форма.
- Простой CRUD.

**Цвета (`/colors`):**
- Простая таблица: name, hex (с превью цветного квадратика), category.
- Кнопка "Новый цвет".

**Marketplaces (`/marketplaces`):**
- Список наборов с marketplace и ценой.
- Открыть набор → редактор composition (мульти-селект из warehouse_items с qty).

- [ ] Commits: `Add molds views`, `Add blanks view`, `Add colors view`, `Add marketplaces view`

---

## Task 8: Playwright smoke + PR

Сценарий: login → /molds → открыть один → добавить hardware привязку → зафиксировать использование → проверить что `usage_count` вырос.

- [ ] Acceptance: PR в main, CI зелёный, на staging всё видно.

## Acceptance Criteria

- [ ] API тесты ≥ 25 (по 6 на ресурс)
- [ ] Playwright smoke green
- [ ] На staging: молды, бланки, цвета, marketplaces — открываются и редактируются
- [ ] compare-datasets совпадает

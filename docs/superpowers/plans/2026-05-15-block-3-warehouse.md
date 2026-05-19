# Block 3 — Склад (warehouse) Implementation Plan

> **REQUIRED:** Прочитай мастер-плейбук + Block 2 plan (паттерны auth, idempotency, общие обёртки).

**Goal:** Сотрудник видит склад в новой системе. Может посмотреть остатки, открыть карточку позиции, отредактировать qty/min/категорию, посмотреть журнал движений. Резервы под проекты — отдельная таблица, видна в карточке. Инвентаризация — отдельный сценарий.

**Why this is critical:** склад — главная боль текущей системы. Тут нет права на "оптимистичный UI" — все изменения только после подтверждения сервером.

**Source reference:** изучить `js/warehouse.js` в репо (7700 строк) — оттуда переносим логику инвентаризации, расчёта `available_qty = qty - reserved_qty`, фильтров по категориям, поиска и т.п.

**Dependencies:** Block 2 (auth + middleware готовы).

**Branch:** `block-3-warehouse`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `ops/db/migrations/003_warehouse.sql` | **Create** | Tables `warehouse_items`, `warehouse_reservations`, `warehouse_history` |
| `ops/api/src/routes/warehouse.js` | **Create** | CRUD + reservations + history + inventory audit |
| `ops/api/src/idempotency.js` | **Create** | Helper `withIdempotency()` для всех POST/PATCH/DELETE |
| `ops/api/test/warehouse.test.js` | **Create** | Покрытие всех эндпойнтов + idempotency |
| `ops/scripts/refresh/02-warehouse.mjs` | **Create** | Копирует warehouse_items + reservations + history из Supabase |
| `ops/scripts/refresh-staging-snapshot.mjs` | **Create** | Главный orchestrator: дропает таблицы (кроме auth), накатывает миграции, вызывает 01-*, 02-*, 03-*, ... refresh-скрипты |
| `ops/scripts/compare-datasets.mjs` | **Create** | Сравнивает Supabase и Postgres: row counts + контрольные записи |
| `ops/web/src/api/warehouse.ts` | **Create** | Обёртки над fetch |
| `ops/web/src/stores/warehouse.ts` | **Create** | Pinia store |
| `ops/web/src/views/WarehouseListView.vue` | **Create** | Таблица позиций, поиск, фильтры |
| `ops/web/src/views/WarehouseItemView.vue` | **Create** | Карточка позиции + журнал движений |
| `ops/web/src/views/InventoryAuditView.vue` | **Create** | Инвентаризация (форма для ввода фактических количеств) |
| `ops/web/src/views/WarehouseHistoryView.vue` | **Create** | Общий журнал движений |
| `ops/web/src/router.ts` | **Modify** | Маршруты `/warehouse`, `/warehouse/:id`, `/warehouse/history`, `/warehouse/inventory` |
| `tests/playwright/warehouse.spec.ts` | **Create** | E2E: login → открыть склад → отредактировать qty → проверить запись в history |

---

## Task 1: SQL миграция

**Files:** Create `ops/db/migrations/003_warehouse.sql`

```sql
-- 003_warehouse.sql
-- Структура warehouse_items: нормализуем item_data JSON в нормальные колонки.
-- Все поля из старой системы (см. js/warehouse.js WAREHOUSE_SEED_DATA для образца).

CREATE TABLE IF NOT EXISTS warehouse_items (
    id              BIGINT PRIMARY KEY,
    sku             TEXT,
    name            TEXT NOT NULL,
    category        TEXT,
    qty             NUMERIC NOT NULL DEFAULT 0,
    unit            TEXT,
    min_qty         NUMERIC,
    last_price      NUMERIC,
    last_currency   TEXT,
    notes           TEXT,
    linked_order_id BIGINT,
    photo_url       TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warehouse_items_sku ON warehouse_items(LOWER(sku));
CREATE INDEX IF NOT EXISTS idx_warehouse_items_category ON warehouse_items(category);

CREATE TABLE IF NOT EXISTS warehouse_reservations (
    id              BIGSERIAL PRIMARY KEY,
    item_id         BIGINT NOT NULL REFERENCES warehouse_items(id) ON DELETE CASCADE,
    order_id        BIGINT,
    project_id      BIGINT,
    qty             NUMERIC NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed')),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at     TIMESTAMPTZ,
    released_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_reservations_item ON warehouse_reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_reservations_order ON warehouse_reservations(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_status ON warehouse_reservations(status);

CREATE TABLE IF NOT EXISTS warehouse_history (
    id              BIGSERIAL PRIMARY KEY,
    item_id         BIGINT REFERENCES warehouse_items(id) ON DELETE SET NULL,
    type            TEXT NOT NULL,    -- receipt, consume, adjust, inventory_audit, manual_edit
    qty_before      NUMERIC,
    qty_after       NUMERIC,
    qty_change      NUMERIC,
    order_id        BIGINT,
    shipment_id     BIGINT,
    manager_name    TEXT,
    note            TEXT,
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_history_item ON warehouse_history(item_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON warehouse_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_history_type ON warehouse_history(type);

INSERT INTO app_meta (id, version) VALUES (1, '003-warehouse')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Apply, commit: `Add warehouse_items, reservations, history tables`

---

## Task 2: idempotency helper

**Files:** Create `ops/api/src/idempotency.js`

```js
import { getPool } from './db.js';

export async function withIdempotency(req, res, handler) {
  const key = req.get('Idempotency-Key');
  if (!key) {
    return res.status(400).json({
      error: { code: 'NO_IDEMPOTENCY_KEY', message: 'Заголовок Idempotency-Key обязателен' },
    });
  }
  const pool = getPool();
  const existing = await pool.query(
    `SELECT response_status, response_body FROM idempotency_keys WHERE key = $1`,
    [key]
  );
  if (existing.rows[0]) {
    res.status(existing.rows[0].response_status).type('application/json').send(existing.rows[0].response_body);
    return;
  }

  // Capture handler's response
  const origJson = res.json.bind(res);
  let captured = null;
  res.json = (body) => {
    captured = { status: res.statusCode || 200, body: JSON.stringify(body) };
    return origJson(body);
  };

  await handler(req, res);

  if (captured && res.statusCode < 500) {
    await pool.query(
      `INSERT INTO idempotency_keys (key, user_id, method, path, response_status, response_body)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO NOTHING`,
      [key, req.user?.id || null, req.method, req.path, captured.status, captured.body]
    );
  }
}
```

- [ ] Commit: `Add idempotency helper for mutating endpoints`

---

## Task 3: Warehouse API (TDD)

**Files:** Create `ops/api/src/routes/warehouse.js`, `ops/api/test/warehouse.test.js`

API endpoints:

```
GET    /api/warehouse/items[?category=&search=]
POST   /api/warehouse/items           создать
PATCH  /api/warehouse/items/:id       обновить
DELETE /api/warehouse/items/:id

GET    /api/warehouse/reservations[?item_id=&order_id=&status=]
POST   /api/warehouse/reservations    создать резерв
POST   /api/warehouse/reservations/:id/release
POST   /api/warehouse/reservations/:id/consume

GET    /api/warehouse/history[?item_id=&from=&to=&limit=]
POST   /api/warehouse/inventory-audit перенос всех актуальных qty + список несоответствий
```

**Бизнес-правила:**
- `qty` всегда >= 0 (по БД проверяется при обновлении; если итог < 0 — 400 INSUFFICIENT_STOCK)
- На каждое изменение `qty` (вручную, через приёмку, через consume) — запись в `warehouse_history`
- При `POST /reservations/:id/consume`: текущий резерв переводится в status='consumed', `qty` позиции уменьшается на `reservation.qty`, в history добавляется запись type='consume'
- При `POST /reservations/:id/release`: резерв → 'released', qty не меняется
- При создании item — autoincrement ID (или передать ID, если копируем из Supabase — поэтому BIGINT PRIMARY KEY, не SERIAL)

**Тесты в `ops/api/test/warehouse.test.js`:**
- GET без auth → 401
- POST без Idempotency-Key → 400 NO_IDEMPOTENCY_KEY
- POST с Idempotency-Key повторно → возвращает закешированный ответ, НЕ создаёт дубликат
- Создание item → history содержит запись type='manual_edit'
- Резерв > qty → 400 INSUFFICIENT_STOCK
- consume резерв → qty уменьшается, history растёт
- DELETE item с активными резервами → 400 HAS_RESERVATIONS

(Заголовок тестов аналогично Block 2 — `import { test } from 'node:test'`, helper для login и получения cookie, помощник для парcинга `Set-Cookie`)

- [ ] Сначала писать тесты — упадут. Потом реализовать. Потом зелёные. Стандарт TDD из плейбука.

- [ ] Commit (по 2-3 раза в процессе): `Add warehouse API: items CRUD`, `Add reservations`, `Add inventory audit and history`

---

## Task 4: Скрипты копирования и сравнения данных

**Files:** Create `ops/scripts/refresh/02-warehouse.mjs`, `ops/scripts/refresh-staging-snapshot.mjs`, `ops/scripts/compare-datasets.mjs`

- [ ] `ops/scripts/refresh/02-warehouse.mjs`:

```js
// Копирует warehouse_items, reservations, history из Supabase.
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function parseItem(row) {
  // В старой структуре часть данных могла лежать в item_data JSON.
  if (row.item_data) {
    try {
      const data = typeof row.item_data === 'string' ? JSON.parse(row.item_data) : row.item_data;
      return { ...data, id: row.id };
    } catch { return row; }
  }
  return row;
}

async function main() {
  // 1. warehouse_items
  const items = (await supabase.from('warehouse_items').select('*').throwOnError()).data.map(parseItem);
  console.log(`warehouse_items: ${items.length}`);
  for (const i of items) {
    await pool.query(
      `INSERT INTO warehouse_items
         (id, sku, name, category, qty, unit, min_qty, last_price, last_currency, notes, linked_order_id, photo_url, extras, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         sku = EXCLUDED.sku, name = EXCLUDED.name, category = EXCLUDED.category,
         qty = EXCLUDED.qty, unit = EXCLUDED.unit, min_qty = EXCLUDED.min_qty,
         last_price = EXCLUDED.last_price, last_currency = EXCLUDED.last_currency,
         notes = EXCLUDED.notes, linked_order_id = EXCLUDED.linked_order_id,
         photo_url = EXCLUDED.photo_url, extras = EXCLUDED.extras,
         updated_at = EXCLUDED.updated_at`,
      [
        i.id, i.sku || null, i.name || '', i.category || null,
        i.qty ?? 0, i.unit || null, i.min_qty ?? null,
        i.last_price ?? null, i.last_currency || null, i.notes || null,
        i.linked_order_id || null, i.photo_url || null,
        i.extras || {}, i.created_at || new Date().toISOString(), i.updated_at || new Date().toISOString(),
      ]
    );
  }

  // 2. reservations
  const reservations = (await supabase.from('warehouse_reservations').select('*').throwOnError()).data;
  console.log(`warehouse_reservations: ${reservations.length}`);
  for (const r of reservations) {
    await pool.query(
      `INSERT INTO warehouse_reservations
         (id, item_id, order_id, project_id, qty, status, note, created_at, consumed_at, released_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, qty = EXCLUDED.qty, note = EXCLUDED.note,
         consumed_at = EXCLUDED.consumed_at, released_at = EXCLUDED.released_at`,
      [r.id, r.item_id, r.order_id || null, r.project_id || null, r.qty, r.status || 'active',
       r.note || null, r.created_at || new Date().toISOString(), r.consumed_at || null, r.released_at || null]
    );
  }

  // 3. history
  const history = (await supabase.from('warehouse_history').select('*').throwOnError()).data;
  console.log(`warehouse_history: ${history.length}`);
  for (const h of history) {
    await pool.query(
      `INSERT INTO warehouse_history
         (id, item_id, type, qty_before, qty_after, qty_change, order_id, shipment_id, manager_name, note, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [h.id, h.item_id || null, h.type || 'manual_edit',
       h.qty_before ?? null, h.qty_after ?? null, h.qty_change ?? null,
       h.order_id || null, h.shipment_id || null, h.manager_name || null,
       h.note || null, h.details || {}, h.created_at || new Date().toISOString()]
    );
  }

  // Bump sequences for serial columns so future inserts don't conflict
  await pool.query(`SELECT setval('warehouse_reservations_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM warehouse_reservations), 1))`);
  await pool.query(`SELECT setval('warehouse_history_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM warehouse_history), 1))`);

  await pool.end();
  console.log('Warehouse refresh complete.');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] `ops/scripts/refresh-staging-snapshot.mjs` — главный orchestrator:

```js
// Главный скрипт «обновить staging копию из Supabase».
// Полная переливка: дропает таблицы (КРОМЕ auth_users, auth_sessions, idempotency_keys),
// накатывает миграции заново, вызывает refresh/*.mjs в порядке.
import { execSync } from 'node:child_process';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const KEEP = ['auth_users', 'auth_sessions', 'idempotency_keys', 'app_meta', 'schema_migrations'];

async function dropAllExcept(keep) {
  const { rows } = await pool.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  for (const r of rows) {
    if (keep.includes(r.tablename)) continue;
    console.log(`DROP TABLE ${r.tablename} CASCADE`);
    await pool.query(`DROP TABLE IF EXISTS "${r.tablename}" CASCADE`);
  }
}

async function main() {
  console.log('=== Refreshing staging snapshot ===');
  await dropAllExcept(KEEP);
  await pool.end();

  console.log('=== Applying migrations ===');
  execSync('bash ops/db/migrate.sh', { stdio: 'inherit', env: process.env });

  console.log('=== Running refresh scripts in order ===');
  const scripts = ['01-employees', '02-warehouse'];
  // Add more as blocks complete: 03-shipments-china, 04-molds-blanks, etc.
  for (const s of scripts) {
    console.log(`--- ${s} ---`);
    execSync(`node ops/scripts/refresh/${s}.mjs`, { stdio: 'inherit', env: process.env });
  }

  console.log('=== Refresh complete ===');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] `ops/scripts/compare-datasets.mjs`:

```js
// Сравнивает counts и контрольные записи между Supabase и Postgres.
// Запуск: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... DATABASE_URL=... node compare-datasets.mjs
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const TABLES = [
  'employees',
  'warehouse_items',
  'warehouse_reservations',
  'warehouse_history',
  // Добавлять по мере выхода блоков
];

async function main() {
  let allOk = true;
  console.log('Table                         Supabase  Postgres  Diff');
  console.log('----------------------------- --------  --------  ----');
  for (const t of TABLES) {
    const { count: sbCount } = await supabase.from(t).select('*', { count: 'exact', head: true });
    const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM ${t}`);
    const pgCount = Number(rows[0].n);
    const diff = pgCount - sbCount;
    const status = diff === 0 ? 'OK' : 'MISMATCH';
    console.log(`${t.padEnd(29)} ${String(sbCount).padStart(8)} ${String(pgCount).padStart(9)} ${String(diff).padStart(5)} ${status}`);
    if (diff !== 0) allOk = false;
  }
  await pool.end();
  if (!allOk) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] Запустить локально: `refresh-staging-snapshot.mjs` → `compare-datasets.mjs`. Все цифры должны совпасть.

- [ ] Commit: `Add warehouse refresh + dataset compare scripts`

---

## Task 5: Vue 3 — Warehouse list view

**Files:** Create `ops/web/src/api/warehouse.ts`, `ops/web/src/stores/warehouse.ts`, `ops/web/src/views/WarehouseListView.vue`, modify router

- [ ] `ops/web/src/api/warehouse.ts` — обёртки над fetch (по примеру Block 2 `api/auth.ts`).
- [ ] `ops/web/src/stores/warehouse.ts` — Pinia store: `items[]`, `loadItems()`, `updateItem()`, `createItem()`, `deleteItem()`.
- [ ] `ops/web/src/views/WarehouseListView.vue` — таблица позиций с колонками: SKU, Название, Категория, Количество, Зарезервировано, Доступно, Мин, Цена, Действия (открыть карточку). Поиск по name/sku. Фильтр по категории. Кнопка "Новая позиция" → модалка.
- [ ] Маршруты `/warehouse` (list), `/warehouse/new` (модалка/отдельная страница для создания).
- [ ] Commit: `Add warehouse list view with search and filters`

---

## Task 6: Vue 3 — Warehouse item card + history

**Files:** Create `ops/web/src/views/WarehouseItemView.vue`

- [ ] Карточка показывает все поля позиции в виде формы (редактируемые).
- [ ] Кнопка «Сохранить» → PATCH. Кнопка «Удалить» с confirm-модалкой.
- [ ] Внизу — журнал движений (последние 50 записей type/qty_change/note/created_at).
- [ ] Маршрут `/warehouse/:id`.
- [ ] Commit: `Add warehouse item card with history`

---

## Task 7: Vue 3 — Inventory audit (инвентаризация)

**Files:** Create `ops/web/src/views/InventoryAuditView.vue`

- [ ] Открывается длинной формой: для каждой позиции склада — текущее `qty` (readonly) + поле «фактическое». Введя число, видим разницу.
- [ ] Кнопка «Завершить инвентаризацию» → POST `/api/warehouse/inventory-audit` со всеми изменениями. Для каждой меняющейся позиции — запись в history type='inventory_audit'.
- [ ] Маршрут `/warehouse/inventory`.
- [ ] Commit: `Add inventory audit view`

---

## Task 8: Vue 3 — общий журнал движений

**Files:** Create `ops/web/src/views/WarehouseHistoryView.vue`

- [ ] Таблица всех записей `warehouse_history` с фильтрами: по дате, по типу, по позиции, по сотруднику.
- [ ] Пагинация.
- [ ] Маршрут `/warehouse/history`.
- [ ] Commit: `Add warehouse history view`

---

## Task 9: Playwright E2E smoke

**Files:** Create `tests/playwright/warehouse.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('warehouse e2e — login, edit qty, verify history', async ({ page }) => {
  await page.goto('https://ops-staging.recycleobject.ru/login');
  await page.fill('input[type=email]', process.env.E2E_USER!);
  await page.fill('input[type=password]', process.env.E2E_PASSWORD!);
  await page.click('button[type=submit]');

  await page.goto('https://ops-staging.recycleobject.ru/warehouse');
  await expect(page.locator('h1')).toContainText('Склад');

  // Открыть первую позицию
  await page.locator('a[href^="/warehouse/"]').first().click();
  await expect(page.locator('input[name=qty]')).toBeVisible();

  const before = Number(await page.inputValue('input[name=qty]'));
  await page.fill('input[name=qty]', String(before + 1));
  await page.click('button[type=submit]');
  await expect(page.locator('.history-entry').first()).toContainText('manual_edit');
});
```

- [ ] Запускается из CI на staging-сайте после deploy.
- [ ] Commit: `Add Playwright warehouse smoke test`

---

## Task 10: Обновить ops/README + PR

- [ ] Дополнить `ops/README.md` секцией "Warehouse module: эндпойнты, экраны, тесты".
- [ ] `git push origin block-3-warehouse`, открыть PR в main.
- [ ] Дождаться зелёного CI, merge.
- [ ] После merge — staging автодеплоится. Проверить `https://ops-staging.recycleobject.ru/warehouse` живой.

## Acceptance Criteria

- [ ] `npm test` в `ops/api/` зелёный (warehouse тесты ≥ 12)
- [ ] Playwright smoke зелёный
- [ ] На staging: можно залогиниться, открыть склад, отредактировать qty, увидеть запись в history
- [ ] `compare-datasets.mjs` показывает ровные count'ы для warehouse_*
- [ ] `refresh-staging-snapshot.mjs` без ошибок прокатывается
- [ ] PR смержен в `main`

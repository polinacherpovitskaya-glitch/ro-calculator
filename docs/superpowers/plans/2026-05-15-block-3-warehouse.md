# Block 3 — Склад (warehouse) Implementation Plan

> **REQUIRED:** Прочитай мастер-плейбук + **[WAREHOUSE-INTERACTION-MAP.md](2026-05-15-WAREHOUSE-INTERACTION-MAP.md)** + **[BUG-INVENTORY.md](2026-05-15-BUG-INVENTORY.md)**. Эти два документа описывают, **что и зачем мы редизайним** в складе. Без них этот план не имеет смысла.

> **ВАЖНО:** В отличие от других блоков, Block 3 **редизайнит** структуру склада, а не переносит 1:1. Конкретно:
> - История движений: 5 канонических типов вместо текущих 12+ (см. map раздел 3)
> - Резервы: 2 источника вместо текущих 8+ (см. map раздел 4)
> - State machine резервов: active → consumed | released, без обратных переходов (см. map раздел 2)
> - Инварианты I1-I7 проверяются в CI (см. map раздел 6)
> - Idempotency обязателен для всех мутаций (см. bug-inventory класс B)
> - `SELECT FOR UPDATE` на всех изменениях qty (см. bug-inventory класс G)

**Goal:** Сотрудник видит склад в новой системе. Может посмотреть остатки, открыть карточку позиции, отредактировать qty/min/категорию, посмотреть журнал движений. Резервы под проекты — отдельная таблица, видна в карточке. Инвентаризация — отдельный сценарий. **Никаких локальных кэшей, никаких bootstrap'ов, единственный источник истины — Postgres через API.**

**Why this is critical:** склад — главная боль текущей системы (см. BUG-INVENTORY раздел A — "Cache hell" с 8+ commit'ами попыток починки только за последние 60 дней). Здесь мы лечим целые классы багов сменой архитектуры.

**Source reference:**
- `js/warehouse.js` (7700 строк) — UI логика, перенести как есть для **отображения**
- `js/warehouse.js` функции вокруг `_isProjectHardwareReservationSource`, `_releaseProjectHardwareReservationsForRow` — **НЕ переносить дословно**, заменить чистым API (см. map раздел 2)
- `js/supabase.js` функции `loadWarehouseItems`, `saveWarehouseItem`, `loadWarehouseReservations` — **НЕ переносить fallback-каскад**, заменить прямыми запросами

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
    -- CASCADE на order: удаление заказа физически удаляет резервы
    -- (это часть лечения класса C "фантомные резервы")
    order_id        BIGINT REFERENCES orders(id) ON DELETE CASCADE,
    qty             NUMERIC NOT NULL CHECK (qty > 0),
    -- Канонические source: 'order' | 'manual' (см. WAREHOUSE-INTERACTION-MAP раздел 4)
    source          TEXT NOT NULL DEFAULT 'order' CHECK (source IN ('order','manual')),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','released','consumed')),
    note            TEXT,
    actor_user_id   INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    consumed_at     TIMESTAMPTZ,
    released_at     TIMESTAMPTZ,
    -- Если source='order' — обязателен order_id
    CONSTRAINT reservation_order_has_order_id
        CHECK ((source = 'order' AND order_id IS NOT NULL) OR source != 'order'),
    -- Финальные статусы — иммутабельны (но это enforce-ится на уровне API, не SQL)
    -- consumed_at / released_at заполнены только для соответствующих статусов
    CONSTRAINT reservation_consumed_has_timestamp
        CHECK ((status = 'consumed' AND consumed_at IS NOT NULL) OR status != 'consumed'),
    CONSTRAINT reservation_released_has_timestamp
        CHECK ((status = 'released' AND released_at IS NOT NULL) OR status != 'released')
);
CREATE INDEX IF NOT EXISTS idx_reservations_item ON warehouse_reservations(item_id);
CREATE INDEX IF NOT EXISTS idx_reservations_order ON warehouse_reservations(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservations_status ON warehouse_reservations(status);
CREATE INDEX IF NOT EXISTS idx_reservations_active_by_item ON warehouse_reservations(item_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS warehouse_history (
    id              BIGSERIAL PRIMARY KEY,
    item_id         BIGINT REFERENCES warehouse_items(id) ON DELETE SET NULL,
    -- Канонические 5 типов (см. WAREHOUSE-INTERACTION-MAP раздел 3)
    type            TEXT NOT NULL CHECK (type IN ('receipt','consume','inventory_audit','manual_edit','return')),
    qty_before      NUMERIC,
    qty_after       NUMERIC,
    qty_change      NUMERIC NOT NULL,
    -- Контекст: хотя бы одна из этих ссылок заполнена (или ни одной — для manual_edit/inventory_audit)
    order_id        BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    shipment_id     BIGINT,                       -- FK добавляется в Block 4
    mold_id         BIGINT,                       -- FK добавляется в Block 5
    marketplace_set_id BIGINT,                    -- FK добавляется в Block 5
    audit_id        BIGINT,                       -- группирует inventory_audit
    actor_user_id   INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
    actor_name      TEXT,                          -- snapshot имени для случаев когда юзер удалён
    note            TEXT,
    details         JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Инвариант: receipt всегда qty_change > 0
    CONSTRAINT history_receipt_positive CHECK (type != 'receipt' OR qty_change > 0),
    -- Инвариант: consume всегда qty_change < 0
    CONSTRAINT history_consume_negative CHECK (type != 'consume' OR qty_change < 0),
    -- Инвариант: return всегда qty_change > 0
    CONSTRAINT history_return_positive CHECK (type != 'return' OR qty_change > 0)
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

**Бизнес-правила (см. WAREHOUSE-INTERACTION-MAP раздел 1-3 для полной картины):**
- `qty` всегда >= 0 (по БД проверяется при обновлении; если итог < 0 — 400 INSUFFICIENT_STOCK)
- На каждое изменение `qty` (вручную, через приёмку, через consume) — запись в `warehouse_history` с **каноническим** `type` из 5 разрешённых: `receipt`, `consume`, `inventory_audit`, `manual_edit`, `return`.
- При `POST /reservations/:id/consume`: текущий резерв переводится в status='consumed', `qty` позиции уменьшается на `reservation.qty`, в history добавляется запись type='consume'. Всё в одной транзакции с `SELECT FOR UPDATE` на warehouse_items строке.
- При `POST /reservations/:id/release`: резерв → 'released', qty не меняется.
- Резервы со status='consumed' или 'released' — **иммутабельны**: PATCH запрещён, DELETE запрещён (только CASCADE-удаление через order).
- При создании item — передаётся ID (BIGINT, не SERIAL — чтобы совпадать с существующими ID в старой Supabase).
- **Idempotency-Key обязателен** на всех мутациях (POST/PATCH/DELETE). Без него — 400 NO_IDEMPOTENCY_KEY.
- **Все мутации qty — внутри транзакции** с `SELECT FOR UPDATE` на затронутых items (см. BUG-INVENTORY класс G).

**Тесты в `ops/api/test/warehouse.test.js`:**
- GET без auth → 401
- POST без Idempotency-Key → 400 NO_IDEMPOTENCY_KEY
- POST с Idempotency-Key повторно → возвращает закешированный ответ, НЕ создаёт дубликат
- Создание item → history содержит запись type='manual_edit' с actor_user_id
- Резерв > available qty → 400 INSUFFICIENT_STOCK
- consume резерв → qty уменьшается, history растёт, status='consumed', consumed_at заполнен
- DELETE item с активными резервами → 400 HAS_RESERVATIONS
- PATCH резерва status='consumed' → 400 IMMUTABLE_RESERVATION (нельзя ничего менять у финальных статусов)
- Параллельные consume (две сессии, одно qty=10, available=5): одна 200, вторая 400 INSUFFICIENT_STOCK. Race-condition тест через `Promise.all`.

**Инвариантные тесты (отдельный файл `ops/api/test/warehouse-invariants.test.js`):**
Каждый из 7 инвариантов (см. WAREHOUSE-INTERACTION-MAP раздел 6) — отдельный SQL-запрос, который должен возвращать 0 строк после любой серии операций. Эти тесты подготавливают сценарии (создают items, резервы, делают consume), затем проверяют что ни один инвариант не нарушен.

Пример:
```js
test('I1: sum of active reservations never exceeds qty', async () => {
  // Создать item с qty=10
  // Зарезервировать 5, потом ещё 3, потом попытаться 5 — должно дать 400
  // SELECT по инварианту I1 должен вернуть 0 строк
});
test('I2: sum of qty_change in history equals current qty', async () => {
  // Создать item, сделать 5 разных операций (manual_edit, consume, receipt, inventory_audit)
  // SUM(qty_change) должно быть равно текущему qty
});
// ... и так далее для I3-I7
```

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
  // ВАЖНО: source mapping (см. WAREHOUSE-INTERACTION-MAP раздел 4).
  // Старые источники → канонические 2.
  function mapReservationSource(oldSource, hasOrderId) {
    const s = String(oldSource || '').toLowerCase();
    if (['order_calc', 'project_hardware', 'order'].includes(s)) return 'order';
    if (hasOrderId) return 'order';  // если есть order_id — это order-резерв, даже если source мусорный
    return 'manual';
  }

  const reservations = (await supabase.from('warehouse_reservations').select('*').throwOnError()).data;
  console.log(`warehouse_reservations: ${reservations.length}`);
  let droppedReservations = 0;
  for (const r of reservations) {
    const newSource = mapReservationSource(r.source, !!r.order_id);
    // Если source=order но нет order_id — это битый резерв, пропускаем
    if (newSource === 'order' && !r.order_id) { droppedReservations++; continue; }
    // Финальные статусы — должны иметь timestamps
    const consumed_at = r.status === 'consumed' ? (r.consumed_at || r.updated_at || r.created_at) : null;
    const released_at = r.status === 'released' ? (r.released_at || r.updated_at || r.created_at) : null;
    await pool.query(
      `INSERT INTO warehouse_reservations
         (id, item_id, order_id, qty, source, status, note, created_at, consumed_at, released_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status, qty = EXCLUDED.qty, note = EXCLUDED.note,
         consumed_at = EXCLUDED.consumed_at, released_at = EXCLUDED.released_at`,
      [r.id, r.item_id, r.order_id || null, r.qty, newSource, r.status || 'active',
       r.note || null, r.created_at || new Date().toISOString(), consumed_at, released_at]
    );
  }
  if (droppedReservations) console.warn(`Dropped ${droppedReservations} reservations with source='order' but no order_id`);

  // 3. history
  // ВАЖНО: type mapping (см. WAREHOUSE-INTERACTION-MAP раздел 3).
  // 12+ старых типов → 5 канонических.
  function mapHistoryType(oldType, qty_change, ctx) {
    const t = String(oldType || '').toLowerCase();
    if (['receipt', 'shipment_receive'].includes(t)) return 'receipt';
    if (['inventory_audit', 'inventory_adjustment', 'inventory_apply'].includes(t)) return 'inventory_audit';
    if (['return_to_warehouse', 'return_from_order'].includes(t)) return 'return';
    if (['from_order', 'mold_usage', 'packaging', 'pendant', 'hardware', 'consume'].includes(t)) return 'consume';
    if (['manual_add', 'manual_edit', 'manual', 'addition', 'deduction', 'adjustment', 'writeoff', 'extra_cost', 'import'].includes(t)) {
      return 'manual_edit';
    }
    // unknown: эвристика по знаку
    if (Number(qty_change) > 0 && ctx.shipment_id) return 'receipt';
    if (Number(qty_change) < 0 && ctx.order_id) return 'consume';
    return 'manual_edit';
  }

  const history = (await supabase.from('warehouse_history').select('*').throwOnError()).data;
  console.log(`warehouse_history: ${history.length}`);
  let droppedHistory = 0;
  for (const h of history) {
    const newType = mapHistoryType(h.type, h.qty_change, {
      shipment_id: h.shipment_id,
      order_id: h.order_id,
    });
    // Проверка инварианта: receipt > 0, consume < 0, return > 0
    if (newType === 'receipt' && Number(h.qty_change) <= 0) { droppedHistory++; continue; }
    if (newType === 'consume' && Number(h.qty_change) >= 0) { droppedHistory++; continue; }
    if (newType === 'return' && Number(h.qty_change) <= 0) { droppedHistory++; continue; }
    await pool.query(
      `INSERT INTO warehouse_history
         (id, item_id, type, qty_before, qty_after, qty_change, order_id, shipment_id, actor_name, note, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO NOTHING`,
      [h.id, h.item_id || null, newType,
       h.qty_before ?? null, h.qty_after ?? null, h.qty_change ?? 0,
       h.order_id || null, h.shipment_id || null, h.manager_name || null,
       h.note || null, h.details || {}, h.created_at || new Date().toISOString()]
    );
  }
  if (droppedHistory) console.warn(`Dropped ${droppedHistory} history rows with violated type/sign invariants — needs manual review`);

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

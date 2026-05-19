# Block 8 — Product templates + Production calendar + Plan + Indirect costs Implementation Plan

> **REQUIRED:** мастер-плейбук + Block 7 (calc engine, использует indirect costs).

**Goal:** Перенести:
- **`product_templates`** — шаблоны товаров для быстрого создания заказа
- **Production calendar** — производственный календарь (когда работаем/выходные, спецдни, рабочие часы)
- **Production plan** — план производства (по дням/неделям, привязка к заказам)
- **Indirect costs** — косвенные расходы (используются в калькуляторе для расчёта маржи)

**Source reference:**
- `js/calculator.js` про templates
- `js/indirect_costs.js`
- `js/production_plan.js`
- В Supabase: ключи в `settings` — `productionCalendar`, `indirectCosts`. Сейчас они хранятся как JSON в `settings` таблице.

**Dependencies:** Block 7 (calc).

**Branch:** `block-8-production`

---

## File Structure

| File | Action |
|------|--------|
| `ops/db/migrations/007_production.sql` | Tables `product_templates`, `production_calendar_days`, `production_plan_entries`, `indirect_costs` |
| `ops/api/src/routes/templates.js` | CRUD |
| `ops/api/src/routes/production.js` | Calendar + plan |
| `ops/api/src/routes/indirect.js` | Indirect costs |
| `ops/api/src/calc/indirect.ts` | (Block 7 уже имеет заглушку — теперь подключает реальные данные через DB) |
| `ops/api/test/templates.test.js`, `production.test.js`, `indirect.test.js` | Tests |
| `ops/scripts/refresh/06-production.mjs` | Copy from Supabase (включая распарсить JSON из settings) |
| `ops/web/src/views/TemplatesView.vue` | Шаблоны |
| `ops/web/src/views/ProductionCalendarView.vue` | Календарь |
| `ops/web/src/views/ProductionPlanView.vue` | План |
| `ops/web/src/views/IndirectCostsView.vue` | Косвенные |

---

## Task 1: SQL

```sql
-- 007_production.sql

CREATE TABLE IF NOT EXISTS product_templates (
    id              BIGINT PRIMARY KEY,
    name            TEXT NOT NULL,
    category        TEXT,
    data            JSONB NOT NULL,           -- полная структура шаблона (items, hardware, etc.)
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_calendar_days (
    date            DATE PRIMARY KEY,
    is_working      BOOLEAN NOT NULL,
    hours           NUMERIC NOT NULL DEFAULT 8,
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_production_calendar_working ON production_calendar_days(is_working);

CREATE TABLE IF NOT EXISTS production_plan_entries (
    id              BIGSERIAL PRIMARY KEY,
    date            DATE NOT NULL,
    order_id        BIGINT,
    item_name       TEXT,
    qty             NUMERIC,
    hours_planned   NUMERIC,
    operator_id     INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    status          TEXT DEFAULT 'planned' CHECK (status IN ('planned','in_progress','done','cancelled')),
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_production_plan_date ON production_plan_entries(date);
CREATE INDEX IF NOT EXISTS idx_production_plan_order ON production_plan_entries(order_id);

CREATE TABLE IF NOT EXISTS indirect_costs (
    id              BIGSERIAL PRIMARY KEY,
    period_year     INTEGER NOT NULL,
    period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    category        TEXT NOT NULL,            -- 'rent', 'salary_admin', 'utilities', ...
    amount          NUMERIC NOT NULL,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (period_year, period_month, category)
);

INSERT INTO app_meta (id, version) VALUES (1, '007-production')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Commit: `Add production tables`

---

## Task 2: API endpoints

**templates.js:**
- GET/POST/PATCH/DELETE `/api/templates`

**production.js:**
- GET/PUT `/api/production/calendar?year=YYYY` (PUT принимает массив дней — bulk update)
- GET/POST/PATCH/DELETE `/api/production/plan` (фильтры по date, order_id)

**indirect.js:**
- GET `/api/indirect-costs?year=&month=`
- POST/PATCH/DELETE `/api/indirect-costs/:id`

Стандартные паттерны (auth, idempotency). Тесты по 5-7 на ресурс.

- [ ] Commits: `Add templates API`, `Add production API`, `Add indirect-costs API`

---

## Task 3: Подключить indirect costs к calc engine

В Block 7 был placeholder `ops/api/src/calc/indirect.ts`. Теперь:

- [ ] Реализовать функцию `getIndirectAllocation(year, month, hoursTotal): { perHour: number }`:
  - Берёт все indirect_costs за период
  - Делит сумму на общее число рабочих часов в периоде (из production_calendar_days)
  - Возвращает стоимость одного производственного часа
- [ ] Подключить в calcOrder: production_hours * perHour добавляется к total_cost.
- [ ] **Все 20 golden masters должны продолжать проходить.** Если ломаются — значит надо проверить, как старый код применяет indirect costs. Скорее всего вообще не применяет в `calculator_data` (только в фактических отчётах). Тогда в `calcOrder` это значение возвращается отдельным полем, не суммируется.

- [ ] Commit: `Wire real indirect costs into calc engine`

---

## Task 4: refresh + compare

Скрипт `06-production.mjs` должен:
- Копировать `product_templates` (отдельная таблица в Supabase)
- Распарсить `settings.productionCalendar` JSON и записать в `production_calendar_days`
- Распарсить `settings.productionPlan` (если есть) и записать в `production_plan_entries`
- Распарсить `settings.indirectCosts` и записать в `indirect_costs`

- [ ] Commit: `Add production refresh script (settings JSON → tables)`

---

## Task 5: Vue 3 экраны

- `TemplatesView.vue` — таблица шаблонов с поиском по name/category. Открыть шаблон → JSON-редактор (для admin) или раскрытое отображение (для user).
- `ProductionCalendarView.vue` — календарь (грид по месяцам). Зелёное = working day, серое = выходной. Клик по дню → форма edit (is_working, hours, note).
- `ProductionPlanView.vue` — таблица плана с фильтрами: дата, заказ, оператор, статус. Кнопка "Добавить запись".
- `IndirectCostsView.vue` — таблица: год/месяц/категория/сумма. Фильтр по году. Группировка по месяцам.

- [ ] Commits по экранам

---

## Task 6: Playwright + PR

Smoke: login → /production/calendar → отредактировать один день → /templates → создать шаблон → /indirect-costs → ввести запись.

- [ ] PR в main, merge.

## Acceptance Criteria

- [ ] API тесты ≥ 20
- [ ] Все 20 golden masters Block 7 продолжают проходить (никакой регрессии калькулятора)
- [ ] На staging: все 4 экрана работают
- [ ] compare-datasets совпадает

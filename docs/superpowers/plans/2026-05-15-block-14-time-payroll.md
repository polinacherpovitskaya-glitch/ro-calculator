# Block 14 — Time + Vacations + Payroll Implementation Plan

> **REQUIRED:** мастер-плейбук.

**Goal:** Перенести учёт времени, отпуска и расчёт зарплат. Пользователь сказал: «Часы: пользуемся. Здесь у нас все мы смотрим, зарплаты платим и так далее». Это важная функциональность.

**Source reference:** `js/timetrack.js`. В Supabase: `time_entries`, `app_vacations`. Также в `settings` могут быть ключи `payroll_*`.

**Dependencies:** Block 2 (employees in Postgres).

**Branch:** `block-14-time-payroll`

---

## File Structure

| File | Action |
|------|--------|
| `ops/db/migrations/011_time_payroll.sql` | `time_entries`, `app_vacations`, `payroll_rates`, `payroll_periods` |
| `ops/api/src/routes/time.js` | API time entries |
| `ops/api/src/routes/vacations.js` | API vacations |
| `ops/api/src/routes/payroll.js` | API payroll calculations |
| `ops/api/src/payroll/calc.ts` | Расчёт зарплат (логика из `js/timetrack.js`) |
| `ops/api/test/*.test.js` | Tests |
| `ops/scripts/refresh/09-time-payroll.mjs` | Copy |
| `ops/web/src/views/TimeTrackingView.vue` | Часы |
| `ops/web/src/views/VacationsView.vue` | Отпуска |
| `ops/web/src/views/PayrollView.vue` | Зарплаты |

---

## Task 1: SQL миграция

```sql
-- 011_time_payroll.sql

CREATE TABLE IF NOT EXISTS time_entries (
    id              BIGINT PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date            DATE NOT NULL,
    hours           NUMERIC NOT NULL CHECK (hours >= 0),
    task_id         BIGINT,
    project_id      BIGINT,
    order_id        BIGINT,
    note            TEXT,
    is_overtime     BOOLEAN NOT NULL DEFAULT FALSE,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON time_entries(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_order ON time_entries(order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_vacations (
    id              BIGINT PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL CHECK (end_date >= start_date),
    type            TEXT NOT NULL DEFAULT 'vacation',  -- 'vacation','sick','unpaid','holiday'
    is_paid         BOOLEAN NOT NULL DEFAULT TRUE,
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacations_employee ON app_vacations(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacations_range ON app_vacations(start_date, end_date);

CREATE TABLE IF NOT EXISTS payroll_rates (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    valid_from      DATE NOT NULL,
    valid_to        DATE,
    hourly_rate     NUMERIC NOT NULL,
    overtime_rate   NUMERIC,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    base_salary     NUMERIC,                       -- для штатных оклад/мес
    tier            TEXT,                          -- например, для Жени "tier" подъёмная сетка
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_rates_employee ON payroll_rates(employee_id, valid_from DESC);

CREATE TABLE IF NOT EXISTS payroll_periods (
    id              BIGSERIAL PRIMARY KEY,
    period_year     INTEGER NOT NULL,
    period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_half     TEXT NOT NULL CHECK (period_half IN ('first','second','full')),
    employee_id     INTEGER REFERENCES employees(id) ON DELETE CASCADE,
    hours_regular   NUMERIC NOT NULL DEFAULT 0,
    hours_overtime  NUMERIC NOT NULL DEFAULT 0,
    base_amount     NUMERIC NOT NULL DEFAULT 0,
    overtime_amount NUMERIC NOT NULL DEFAULT 0,
    bonuses         NUMERIC NOT NULL DEFAULT 0,
    deductions      NUMERIC NOT NULL DEFAULT 0,
    total           NUMERIC NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    paid_at         TIMESTAMPTZ,
    note            TEXT,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (period_year, period_month, period_half, employee_id)
);

INSERT INTO app_meta (id, version) VALUES (1, '011-time-payroll')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Commit: `Add time + vacations + payroll tables`

---

## Task 2: Payroll calc engine

**File:** `ops/api/src/payroll/calc.ts`

Перенести логику из `js/timetrack.js` секция payroll. Пользователь упоминал:
- *"Женя тиерная подъёмная сетка"* — значит у некоторых сотрудников разные ставки в зависимости от часов в месяце (tier 1 до 80 часов, tier 2 80-120 часов, tier 3 >120 часов и т.п.)
- *"Тая overtime"* — overtime отдельно

Функция:

```ts
export interface PayrollInput {
  employeeId: number;
  year: number;
  month: number;
  half: 'first' | 'second' | 'full';
  hoursRegular: number;
  hoursOvertime: number;
  rate: PayrollRate;        // запись из payroll_rates действующая на период
  bonuses?: number;
  deductions?: number;
}

export interface PayrollOutput {
  baseAmount: number;
  overtimeAmount: number;
  total: number;
}

export function calcPayroll(input: PayrollInput): PayrollOutput {
  // Реализация по правилам из js/timetrack.js.
  // Tier поддержка: rate.tier === 'tiered' → читать rate.extras.tiers
  // Базовая ставка по часам или оклад / число рабочих дней в месяце.
}
```

**Тесты:** взять 5 реальных периодов из Supabase, посчитать через старый JS и наш TS — должны совпасть.

- [ ] Commit: `Add payroll calc engine with tier support`

---

## Task 3-5: API ресурсов

- **time.js**: GET/POST/PATCH/DELETE `/api/time-entries`. Фильтры по employee, date range.
- **vacations.js**: GET/POST/PATCH/DELETE `/api/vacations`.
- **payroll.js**:
  - GET `/api/payroll/rates?employee_id=` — текущие ставки
  - POST/PATCH `/api/payroll/rates`
  - GET `/api/payroll/periods?year=&month=&half=` — рассчитанные периоды
  - POST `/api/payroll/calculate { year, month, half, employee_id? }` — пересчитать, записать в payroll_periods
  - POST `/api/payroll/periods/:id/mark-paid`

- [ ] Тесты, commits

---

## Task 6: refresh + compare

- [ ] Commit

---

## Task 7-9: Vue экраны

**TimeTrackingView:**
- Таблица записей time_entries с фильтрами employee/date.
- Inline-add: дата, часы, задача/проект/заказ (опц), note, overtime.
- Сводка снизу: часы за выбранный период.

**VacationsView:**
- Таблица отпусков. Календарь с подсветкой отпускных периодов.

**PayrollView:**
- Селектор периода (год + месяц + полумесяц или полный).
- Таблица сотрудников с рассчитанными суммами.
- Кнопка "Пересчитать всех" → POST /payroll/calculate.
- Кнопка "Отметить выплачено" по каждому сотруднику.

- [ ] Commits

---

## Task 10: Playwright + PR

Smoke: login → /time-tracking → добавить запись → /payroll → выбрать период → пересчитать → видим сумму.

- [ ] Merge

## Acceptance Criteria

- [ ] API тесты ≥ 20
- [ ] Payroll цифры совпадают с 5+ периодами из старой системы
- [ ] На staging: записи времени, отпуска, расчёт зарплат — работают
- [ ] compare-datasets совпадает по time_entries, app_vacations

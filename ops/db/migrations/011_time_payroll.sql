-- 011_time_payroll.sql
-- Time tracking, vacations, payroll rates, and payroll periods.

CREATE TABLE IF NOT EXISTS time_entries (
    id              BIGINT PRIMARY KEY,
    employee_id     BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name   TEXT DEFAULT '',
    date            DATE NOT NULL,
    hours           NUMERIC NOT NULL CHECK (hours >= 0),
    task_id         BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
    project_id      BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    project_name    TEXT DEFAULT '',
    order_id        BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    stage           TEXT DEFAULT '',
    note            TEXT,
    is_overtime     BOOLEAN NOT NULL DEFAULT FALSE,
    source          TEXT DEFAULT 'manual',
    extras          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON time_entries(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_order ON time_entries(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id) WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_vacations (
    id              BIGINT PRIMARY KEY,
    employee_id     BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    employee_name   TEXT DEFAULT '',
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL CHECK (end_date >= start_date),
    type            TEXT NOT NULL DEFAULT 'vacation' CHECK (type IN ('vacation','sick','unpaid','holiday')),
    is_paid         BOOLEAN NOT NULL DEFAULT TRUE,
    note            TEXT,
    extras          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vacations_employee ON app_vacations(employee_id);
CREATE INDEX IF NOT EXISTS idx_vacations_range ON app_vacations(start_date, end_date);

CREATE TABLE IF NOT EXISTS payroll_rates (
    id              BIGSERIAL PRIMARY KEY,
    employee_id     BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    valid_from      DATE NOT NULL,
    valid_to        DATE,
    hourly_rate     NUMERIC NOT NULL DEFAULT 0,
    overtime_rate   NUMERIC,
    weekend_rate    NUMERIC,
    holiday_rate    NUMERIC,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    base_salary     NUMERIC,
    base_hours_month NUMERIC,
    base_hours_semimonth NUMERIC,
    tier            TEXT,
    extras          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payroll_rates_employee ON payroll_rates(employee_id, valid_from DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_rates_employee_valid_from ON payroll_rates(employee_id, valid_from);

CREATE TABLE IF NOT EXISTS payroll_periods (
    id              BIGSERIAL PRIMARY KEY,
    period_year     INTEGER NOT NULL,
    period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_half     TEXT NOT NULL CHECK (period_half IN ('first','second','full')),
    employee_id     BIGINT REFERENCES employees(id) ON DELETE CASCADE,
    employee_name   TEXT DEFAULT '',
    hours_regular   NUMERIC NOT NULL DEFAULT 0,
    hours_overtime  NUMERIC NOT NULL DEFAULT 0,
    hours_weekend   NUMERIC NOT NULL DEFAULT 0,
    hours_holiday   NUMERIC NOT NULL DEFAULT 0,
    base_amount     NUMERIC NOT NULL DEFAULT 0,
    overtime_amount NUMERIC NOT NULL DEFAULT 0,
    weekend_amount  NUMERIC NOT NULL DEFAULT 0,
    holiday_amount  NUMERIC NOT NULL DEFAULT 0,
    bonuses         NUMERIC NOT NULL DEFAULT 0,
    deductions      NUMERIC NOT NULL DEFAULT 0,
    total           NUMERIC NOT NULL DEFAULT 0,
    currency        TEXT NOT NULL DEFAULT 'RUB',
    paid_at         TIMESTAMPTZ,
    note            TEXT,
    extras          JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (period_year, period_month, period_half, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_period ON payroll_periods(period_year, period_month, period_half);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_employee ON payroll_periods(employee_id);

INSERT INTO app_meta (id, version) VALUES (1, '011-time-payroll')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

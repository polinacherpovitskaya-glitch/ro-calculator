-- 019_bonuses.sql
-- Схемы бонусов, цели периодов, утверждения складских работ, результаты,
-- план и факт отдела. Доступ только из API (/api/bonuses/*, роль admin).

CREATE TABLE IF NOT EXISTS bonus_schemes (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id     BIGINT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('production', 'commercial')),
  period_type     TEXT NOT NULL DEFAULT 'quarter' CHECK (period_type = 'quarter'),
  rates_json      JSONB NOT NULL DEFAULT '{"rate":0}'::jsonb,
  quality_json    JSONB NOT NULL DEFAULT '{"weights":{"productivity":1,"on_time_share":0,"rework_share":0}}'::jsonb,
  ladder_json     JSONB NOT NULL DEFAULT '{"below_min":0,"min":0.5,"target":1,"max":1.5}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bonus_schemes_active_employee
  ON bonus_schemes (employee_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS bonus_period_targets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES bonus_schemes(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL,
  min_value       NUMERIC NOT NULL,
  target_value    NUMERIC NOT NULL,
  max_value       NUMERIC NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scheme_id, period, metric_key)
);

CREATE TABLE IF NOT EXISTS bonus_stock_approvals (
  period          TEXT NOT NULL,
  order_id        BIGINT NOT NULL,
  approved_by     TEXT NOT NULL DEFAULT '',
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (period, order_id)
);

CREATE TABLE IF NOT EXISTS bonus_period_results (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scheme_id       BIGINT NOT NULL REFERENCES bonus_schemes(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'paid')),
  computed_json   JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount_computed NUMERIC(14,2) NOT NULL DEFAULT 0,
  amount_final    NUMERIC(14,2) NOT NULL DEFAULT 0,
  adjustments_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  closed_at       TIMESTAMPTZ,
  closed_by       TEXT NOT NULL DEFAULT '',
  paid_at         TIMESTAMPTZ,
  UNIQUE (scheme_id, period)
);

CREATE TABLE IF NOT EXISTS bonus_team_targets (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team            TEXT NOT NULL,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL,
  min_value       NUMERIC NOT NULL,
  target_value    NUMERIC NOT NULL,
  max_value       NUMERIC NOT NULL,
  note            TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team, period, metric_key)
);

CREATE TABLE IF NOT EXISTS bonus_team_facts (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team            TEXT NOT NULL,
  period          TEXT NOT NULL,
  metric_key      TEXT NOT NULL,
  value           NUMERIC NOT NULL,
  source          TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'fintablo')),
  note            TEXT NOT NULL DEFAULT '',
  updated_by      TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team, period, metric_key)
);

INSERT INTO app_meta (id, version) VALUES (1, '019-bonuses')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

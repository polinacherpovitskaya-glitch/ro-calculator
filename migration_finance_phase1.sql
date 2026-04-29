-- =============================================
-- Recycle Object — Finance Phase 1 Storage Split
-- Purpose:
--   Move finance/bank/legacy-import data out of settings JSON blobs
--   into explicit relational tables.
-- Source blobs to replace over time:
--   - finance_workspace_json
--   - tochka_snapshot_json
--   - fintablo_snapshot_json
-- =============================================

BEGIN;

-- Needed if we later decide to add UUID helpers or text search extensions.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------
-- Shared dictionaries
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS finance_sources (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('bank', 'legacy_import', 'manual', 'internal')),
  provider TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS finance_accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  source_id BIGINT REFERENCES finance_sources(id) ON DELETE SET NULL,
  account_kind TEXT NOT NULL CHECK (account_kind IN ('bank', 'cash', 'card', 'fund', 'tax', 'crypto', 'other')),
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  name TEXT NOT NULL,
  owner_name TEXT DEFAULT '',
  external_account_id TEXT DEFAULT '',
  account_number TEXT DEFAULT '',
  bank_name TEXT DEFAULT '',
  bank_bic TEXT DEFAULT '',
  bank_iban TEXT DEFAULT '',
  is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  opened_at DATE,
  closed_at DATE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_accounts_source_id ON finance_accounts(source_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_kind ON finance_accounts(account_kind);

CREATE TABLE IF NOT EXISTS finance_categories (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  category_group TEXT NOT NULL CHECK (category_group IN (
    'income',
    'direct',
    'payroll',
    'tax',
    'opex',
    'transfer',
    'asset',
    'charity',
    'other'
  )),
  bucket TEXT NOT NULL DEFAULT 'general',
  color TEXT DEFAULT '',
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_categories_group ON finance_categories(category_group);

CREATE TABLE IF NOT EXISTS finance_directions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  parent_id BIGINT REFERENCES finance_directions(id) ON DELETE SET NULL,
  code TEXT UNIQUE,
  name TEXT NOT NULL,
  level_num SMALLINT NOT NULL DEFAULT 1 CHECK (level_num BETWEEN 1 AND 3),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_directions_parent_id ON finance_directions(parent_id);

CREATE TABLE IF NOT EXISTS finance_counterparties (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  name TEXT NOT NULL,
  legal_name TEXT DEFAULT '',
  counterparty_type TEXT NOT NULL DEFAULT 'company' CHECK (counterparty_type IN ('company', 'person', 'bank', 'government', 'service', 'other')),
  inn TEXT DEFAULT '',
  kpp TEXT DEFAULT '',
  ogrn TEXT DEFAULT '',
  country_code TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  default_category_id BIGINT REFERENCES finance_categories(id) ON DELETE SET NULL,
  default_direction_id BIGINT REFERENCES finance_directions(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_counterparties_name ON finance_counterparties(name);
CREATE INDEX IF NOT EXISTS idx_finance_counterparties_inn ON finance_counterparties(inn);

-- ---------------------------------------------
-- Canonical finance ledger
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS finance_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_tx_key TEXT UNIQUE,
  source_id BIGINT REFERENCES finance_sources(id) ON DELETE SET NULL,
  account_id BIGINT REFERENCES finance_accounts(id) ON DELETE SET NULL,
  counterparty_id BIGINT REFERENCES finance_counterparties(id) ON DELETE SET NULL,
  category_id BIGINT REFERENCES finance_categories(id) ON DELETE SET NULL,
  direction_id BIGINT REFERENCES finance_directions(id) ON DELETE SET NULL,
  order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
  employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
  linked_order_label TEXT DEFAULT '',
  linked_project_ref TEXT DEFAULT '',
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer', 'payroll', 'asset', 'tax', 'charity', 'adjustment')),
  review_status TEXT NOT NULL DEFAULT 'review' CHECK (review_status IN ('review', 'confirmed', 'ignored', 'hidden', 'draft')),
  confidence NUMERIC(5,4) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  exchange_rate NUMERIC(14,6),
  amount_rub NUMERIC(14,2),
  occurred_on DATE NOT NULL,
  booked_at TIMESTAMPTZ,
  description TEXT DEFAULT '',
  note TEXT DEFAULT '',
  route TEXT DEFAULT '',
  external_transaction_id TEXT DEFAULT '',
  external_reference TEXT DEFAULT '',
  imported_from TEXT DEFAULT '',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by TEXT DEFAULT '',
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_transactions_account_date ON finance_transactions(account_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_category ON finance_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_direction ON finance_transactions(direction_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_order ON finance_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_status ON finance_transactions(review_status);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_type ON finance_transactions(transaction_type);

CREATE TABLE IF NOT EXISTS finance_transaction_links (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  from_transaction_id BIGINT NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  to_transaction_id BIGINT NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  link_kind TEXT NOT NULL CHECK (link_kind IN (
    'transfer_pair',
    'tax_hold',
    'charity_hold',
    'bank_fee',
    'service_fee',
    'payroll_batch',
    'related_income',
    'related_expense',
    'duplicate_of'
  )),
  ratio NUMERIC(12,6),
  amount NUMERIC(14,2),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (from_transaction_id, to_transaction_id, link_kind)
);

CREATE INDEX IF NOT EXISTS idx_finance_links_from ON finance_transaction_links(from_transaction_id);
CREATE INDEX IF NOT EXISTS idx_finance_links_to ON finance_transaction_links(to_transaction_id);

CREATE TABLE IF NOT EXISTS finance_rules (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  legacy_id TEXT UNIQUE,
  rule_kind TEXT NOT NULL DEFAULT 'match' CHECK (rule_kind IN ('match', 'preset', 'recurring', 'override')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  match_text TEXT DEFAULT '',
  match_account_legacy_id TEXT DEFAULT '',
  match_amount NUMERIC(14,2),
  match_amount_sign TEXT DEFAULT '' CHECK (match_amount_sign IN ('', 'income', 'expense')),
  target_transaction_type TEXT DEFAULT '' CHECK (target_transaction_type IN ('', 'income', 'expense', 'transfer', 'payroll', 'asset', 'tax', 'charity', 'adjustment')),
  target_category_id BIGINT REFERENCES finance_categories(id) ON DELETE SET NULL,
  target_direction_id BIGINT REFERENCES finance_directions(id) ON DELETE SET NULL,
  target_counterparty_id BIGINT REFERENCES finance_counterparties(id) ON DELETE SET NULL,
  target_note TEXT DEFAULT '',
  auto_apply BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_rules_priority ON finance_rules(priority, is_active);

CREATE TABLE IF NOT EXISTS finance_manual_decisions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  transaction_id BIGINT NOT NULL REFERENCES finance_transactions(id) ON DELETE CASCADE,
  decision_kind TEXT NOT NULL CHECK (decision_kind IN ('confirm', 'change', 'reset', 'ignore', 'split')),
  decided_by TEXT NOT NULL DEFAULT '',
  decision_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_manual_decisions_transaction ON finance_manual_decisions(transaction_id);

-- ---------------------------------------------
-- Bank ingestion staging
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS bank_sync_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'partial', 'failed')),
  date_from DATE,
  date_to DATE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  imported_accounts_count INTEGER NOT NULL DEFAULT 0,
  imported_transactions_count INTEGER NOT NULL DEFAULT 0,
  request_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_text TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_bank_sync_runs_provider_started ON bank_sync_runs(provider, started_at DESC);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  sync_run_id BIGINT REFERENCES bank_sync_runs(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  account_number TEXT DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  owner_name TEXT DEFAULT '',
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  bank_name TEXT DEFAULT '',
  bank_bic TEXT DEFAULT '',
  status TEXT DEFAULT '',
  opened_at DATE,
  closed_at DATE,
  last_balance NUMERIC(14,2),
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_provider ON bank_accounts(provider);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider TEXT NOT NULL,
  sync_run_id BIGINT REFERENCES bank_sync_runs(id) ON DELETE SET NULL,
  bank_account_id BIGINT REFERENCES bank_accounts(id) ON DELETE CASCADE,
  finance_transaction_id BIGINT REFERENCES finance_transactions(id) ON DELETE SET NULL,
  external_id TEXT NOT NULL,
  external_account_id TEXT DEFAULT '',
  direction TEXT NOT NULL DEFAULT '' CHECK (direction IN ('', 'income', 'expense')),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  booked_at TIMESTAMPTZ,
  occurred_on DATE,
  description TEXT DEFAULT '',
  counterparty_name TEXT DEFAULT '',
  counterparty_inn TEXT DEFAULT '',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_date ON bank_transactions(bank_account_id, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_finance_transaction ON bank_transactions(finance_transaction_id);

-- ---------------------------------------------
-- Legacy imports (FinTablo and other historical layers)
-- ---------------------------------------------

CREATE TABLE IF NOT EXISTS legacy_finance_import_runs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_system TEXT NOT NULL CHECK (source_system IN ('fintablo', 'csv', 'manual_legacy')),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_from DATE,
  date_to DATE,
  rows_count INTEGER NOT NULL DEFAULT 0,
  source_reference TEXT DEFAULT '',
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS legacy_finance_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_run_id BIGINT REFERENCES legacy_finance_import_runs(id) ON DELETE CASCADE,
  finance_transaction_id BIGINT REFERENCES finance_transactions(id) ON DELETE SET NULL,
  legacy_account_id TEXT DEFAULT '',
  legacy_transaction_id TEXT DEFAULT '',
  occurred_on DATE,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'RUB',
  description TEXT DEFAULT '',
  source_label TEXT DEFAULT '',
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (import_run_id, legacy_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_finance_transactions_finance_transaction ON legacy_finance_transactions(finance_transaction_id);

-- ---------------------------------------------
-- Seed minimal sources
-- ---------------------------------------------

INSERT INTO finance_sources (slug, source_type, provider, name)
VALUES
  ('tochka_api', 'bank', 'tochka', 'Точка API'),
  ('legacy_fintablo', 'legacy_import', 'fintablo', 'Legacy FinTablo import'),
  ('manual_finance', 'manual', 'app', 'Ручные операции')
ON CONFLICT (slug) DO NOTHING;

COMMIT;

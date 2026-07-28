-- Exact row-shape store for the existing vanilla calculator. This lets the
-- browser leave Supabase without forcing a simultaneous rewrite of its public
-- data-layer contracts. The independent Express API is the only runtime that
-- may access this table.

CREATE TABLE IF NOT EXISTS compat_rows (
  table_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  data JSONB NOT NULL,
  copied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (table_name, source_id)
);

CREATE INDEX IF NOT EXISTS compat_rows_table_idx
  ON compat_rows (table_name);

CREATE INDEX IF NOT EXISTS compat_rows_data_gin_idx
  ON compat_rows USING GIN (data jsonb_path_ops);

INSERT INTO app_meta (id, version) VALUES (1, '017-compatibility-store')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

-- Preserve Supabase-only website and legacy application tables that are not
-- consumed by the calculator API. Rows remain queryable as JSON until their
-- owning website is moved to first-class API routes.

CREATE TABLE IF NOT EXISTS legacy_supabase_rows (
  table_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  data JSONB NOT NULL,
  copied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (table_name, source_id)
);

CREATE INDEX IF NOT EXISTS legacy_supabase_rows_table_idx
  ON legacy_supabase_rows (table_name);

INSERT INTO app_meta (id, version) VALUES (1, '015-legacy-site-archive')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

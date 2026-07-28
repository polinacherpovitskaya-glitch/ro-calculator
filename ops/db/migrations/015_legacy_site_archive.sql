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

INSERT INTO app_meta (key, value)
VALUES ('migration_015', 'legacy_site_archive')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

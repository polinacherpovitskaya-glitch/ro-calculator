-- 001_init.sql
-- Smallest possible schema: a single metadata row so we can prove the
-- connection works and migrations are tracked. Real tables come in later blocks.

CREATE TABLE IF NOT EXISTS app_meta (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    version     TEXT NOT NULL,
    applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT app_meta_single_row CHECK (id = 1)
);

INSERT INTO app_meta (id, version) VALUES (1, '001-init')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

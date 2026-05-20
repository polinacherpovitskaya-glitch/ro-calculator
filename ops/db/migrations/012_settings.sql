-- 012_settings.sql
-- Remaining generic app settings that are not normalized into earlier blocks.

CREATE TABLE IF NOT EXISTS settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by  INTEGER REFERENCES auth_users(id) ON DELETE SET NULL
);

INSERT INTO app_meta (id, version) VALUES (1, '012-settings')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

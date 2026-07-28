-- Link the existing calculator accounts to API sessions without exposing the
-- legacy password hashes to the browser. Password verification now happens
-- inside the Yandex-hosted API.

ALTER TABLE auth_users
  ADD COLUMN IF NOT EXISTS legacy_account_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS auth_users_legacy_account_id_unique
  ON auth_users (legacy_account_id)
  WHERE legacy_account_id IS NOT NULL;

INSERT INTO app_meta (id, version) VALUES (1, '018-legacy-auth-bridge')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

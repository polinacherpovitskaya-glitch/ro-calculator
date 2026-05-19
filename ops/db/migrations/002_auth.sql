-- 002_auth.sql
-- Auth + employees + idempotency. Copied employees keep the same IDs as the
-- old system.

CREATE TABLE IF NOT EXISTS employees (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    email           TEXT,
    role            TEXT,
    hourly_rate     NUMERIC,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    extras          JSONB DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_employees_active ON employees(is_active);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(LOWER(email));

CREATE TABLE IF NOT EXISTS auth_users (
    id                     SERIAL PRIMARY KEY,
    email                  TEXT NOT NULL UNIQUE,
    password_hash          TEXT NOT NULL,
    employee_id            INTEGER REFERENCES employees(id) ON DELETE SET NULL,
    role                   TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    must_change_password   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(LOWER(email));

CREATE TABLE IF NOT EXISTS auth_sessions (
    id             TEXT PRIMARY KEY,
    user_id        INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ NOT NULL,
    ip             TEXT,
    user_agent     TEXT,
    revoked_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    key             TEXT PRIMARY KEY,
    user_id         INTEGER REFERENCES auth_users(id) ON DELETE SET NULL,
    method          TEXT NOT NULL,
    path            TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created ON idempotency_keys(created_at);

INSERT INTO app_meta (id, version) VALUES (1, '002-auth')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();

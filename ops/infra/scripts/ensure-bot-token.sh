#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${ENV_FILE:-/srv/ops/infra/.env}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-ops-postgres}"
POSTGRES_USER="${POSTGRES_USER:-ops}"
POSTGRES_DB="${POSTGRES_DB:-ops}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ensure-bot-token: env file not found, skipping"
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${OPS_BOT_TOKEN:-}" ]]; then
  echo "ensure-bot-token: OPS_BOT_TOKEN is not set, skipping"
  exit 0
fi

if ! docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT to_regclass('public.bot_tokens')" | grep -q '^bot_tokens$'; then
  echo "ensure-bot-token: bot_tokens table does not exist yet, skipping"
  exit 0
fi

docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v token="$OPS_BOT_TOKEN" <<'SQL' >/dev/null
INSERT INTO bot_tokens (token, name, role)
VALUES (:'token', 'taskbot', 'admin')
ON CONFLICT (token) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role;
SQL

echo "ensure-bot-token: taskbot token is present"

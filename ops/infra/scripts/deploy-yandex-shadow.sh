#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
COMPOSE_FILE="${INFRA_DIR}/docker-compose.yandex-shadow.yml"
ENV_FILE="${RO_SHADOW_ENV_FILE:-${INFRA_DIR}/.env.shadow}"
POSTGRES_CONTAINER="ro-platform-shadow-postgres"
API_PORT="${SHADOW_API_PORT:-3100}"

if [[ ! -f "${ENV_FILE}" ]]; then
  umask 077
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  cat > "${ENV_FILE}" <<EOF
POSTGRES_USER=ro_app
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=ro_app
APP_VERSION=shadow
SHADOW_API_PORT=${API_PORT}
EOF
  chmod 600 "${ENV_FILE}"
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

test -n "${POSTGRES_USER:-}"
test -n "${POSTGRES_PASSWORD:-}"
test -n "${POSTGRES_DB:-}"

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  up -d --build

for migration in "${ROOT_DIR}"/db/migrations/*.sql; do
  echo "Applying $(basename "${migration}")"
  docker exec -i "${POSTGRES_CONTAINER}" \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 \
    < "${migration}"
done

for attempt in 1 2 3 4 5 6; do
  if curl --fail --silent --show-error \
    "http://127.0.0.1:${API_PORT}/api/health" \
    > /tmp/ro-platform-shadow-health.json; then
    node -e "
      const fs = require('node:fs');
      const payload = JSON.parse(fs.readFileSync('/tmp/ro-platform-shadow-health.json', 'utf8'));
      if (payload.status !== 'ok' || payload.db?.ok !== true) process.exit(1);
      console.log(JSON.stringify(payload));
    "
    exit 0
  fi
  echo "Shadow API health attempt ${attempt}/6 failed"
  sleep 3
done

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  ps
exit 1


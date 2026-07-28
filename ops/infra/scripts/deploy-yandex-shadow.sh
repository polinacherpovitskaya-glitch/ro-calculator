#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${ROOT_DIR}/infra"
COMPOSE_FILE="${INFRA_DIR}/docker-compose.yandex-shadow.yml"
ENV_FILE="${RO_SHADOW_ENV_FILE:-${INFRA_DIR}/.env.shadow}"
POSTGRES_CONTAINER="ro-platform-shadow-postgres"
API_PORT="${SHADOW_API_PORT:-3100}"
BACKUP_DIR="${RO_SHADOW_BACKUP_DIR:-/home/robot/platform-backups}"

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
    if grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' \
      /tmp/ro-platform-shadow-health.json \
      && grep -Eq '"db"[[:space:]]*:[[:space:]]*\{[[:space:]]*"ok"[[:space:]]*:[[:space:]]*true' \
        /tmp/ro-platform-shadow-health.json; then
      install -d -m 700 "${BACKUP_DIR}"
      BACKUP_FILE="${BACKUP_DIR}/ro-platform-shadow-$(date -u +%Y%m%d-%H%M%S).dump"
      docker exec -i "${POSTGRES_CONTAINER}" \
        pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
        > "${BACKUP_FILE}"
      test -s "${BACKUP_FILE}"
      docker exec -i "${POSTGRES_CONTAINER}" pg_restore --list \
        < "${BACKUP_FILE}" > /dev/null
      chmod 600 "${BACKUP_FILE}"
      find "${BACKUP_DIR}" -type f -name 'ro-platform-shadow-*.dump' \
        -mtime +7 -delete
      cat /tmp/ro-platform-shadow-health.json
      printf '\n'
      exit 0
    fi
  fi
  echo "Shadow API health attempt ${attempt}/6 failed"
  sleep 3
done

docker compose \
  --env-file "${ENV_FILE}" \
  -f "${COMPOSE_FILE}" \
  ps
exit 1

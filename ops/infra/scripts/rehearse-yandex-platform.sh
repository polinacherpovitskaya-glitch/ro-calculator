#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${RO_SHADOW_ENV_FILE:-${ROOT_DIR}/infra/.env.shadow}"
SOURCE_ENV_FILE="${RO_SUPABASE_ENV_FILE:-/home/robot/sb/docker/.env}"
POSTGRES_CONTAINER="ro-platform-shadow-postgres"
NETWORK_NAME="ro-platform-shadow_shadow"
MODULES_VOLUME="ro-platform-shadow-scripts-node-modules"
REPORT_DIR="${RO_SHADOW_REPORT_DIR:-/home/robot/platform-reports}"
BACKUP_DIR="${RO_SHADOW_BACKUP_DIR:-/home/robot/platform-backups}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
REPORT_FILE="${REPORT_DIR}/parity-${STAMP}.log"
BACKUP_FILE="${BACKUP_DIR}/ro-platform-shadow-rehearsal-${STAMP}.dump"

test -f "${ENV_FILE}"
test -f "${SOURCE_ENV_FILE}"

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

SERVICE_KEY="$(sed -n 's/^SERVICE_ROLE_KEY=//p' "${SOURCE_ENV_FILE}")"
test -n "${SERVICE_KEY}"
export SUPABASE_SERVICE_KEY="${SERVICE_KEY}"
test -n "${POSTGRES_USER:-}"
test -n "${POSTGRES_PASSWORD:-}"
test -n "${POSTGRES_DB:-}"

install -d -m 700 "${REPORT_DIR}" "${BACKUP_DIR}"
docker volume create "${MODULES_VOLUME}" > /dev/null

docker run --rm \
  --network "${NETWORK_NAME}" \
  --env SUPABASE_URL=https://db.recycleobject.ru \
  --env SUPABASE_SERVICE_KEY \
  --env POSTGRES_USER \
  --env POSTGRES_PASSWORD \
  --env POSTGRES_DB \
  -v "${ROOT_DIR}:/work" \
  -v "${MODULES_VOLUME}:/work/scripts/node_modules" \
  -w /work/scripts \
  node:20-alpine sh -lc '
    set -eu
    export DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@ro-platform-shadow-postgres:5432/${POSTGRES_DB}"
    npm ci --omit=dev
    node refresh-staging-snapshot.mjs
    node compare-datasets.mjs
  ' | tee "${REPORT_FILE}"

chmod 600 "${REPORT_FILE}"
grep -q 'time_entries' "${REPORT_FILE}"
grep -q 'settings' "${REPORT_FILE}"
if grep -q 'MISMATCH' "${REPORT_FILE}"; then
  echo "Parity report contains mismatches" >&2
  exit 1
fi

docker exec -i "${POSTGRES_CONTAINER}" \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -Fc \
  > "${BACKUP_FILE}"
test -s "${BACKUP_FILE}"
docker exec -i "${POSTGRES_CONTAINER}" pg_restore --list \
  < "${BACKUP_FILE}" > /dev/null
chmod 600 "${BACKUP_FILE}"

find "${REPORT_DIR}" -type f -name 'parity-*.log' -mtime +14 -delete
find "${BACKUP_DIR}" -type f -name 'ro-platform-shadow-rehearsal-*.dump' \
  -mtime +7 -delete

printf 'Parity report: %s\n' "${REPORT_FILE}"
printf 'Verified backup: %s\n' "${BACKUP_FILE}"

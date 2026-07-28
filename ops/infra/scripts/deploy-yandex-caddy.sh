#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SOURCE_DIR="${ROOT_DIR}/infra/yandex-caddy"
CADDY_DIR="${RO_CADDY_DIR:-/home/robot/caddy}"
CADDY_CONTAINER="caddy-caddy-1"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP_DIR="${CADDY_DIR}/backup-${STAMP}"

test -f "${SOURCE_DIR}/Caddyfile"
test -f "${SOURCE_DIR}/compose.yml"
test -d "${CADDY_DIR}"

docker run --rm \
  -v "${SOURCE_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro" \
  caddy:2 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

install -d -m 700 "${BACKUP_DIR}"
install -m 600 "${CADDY_DIR}/Caddyfile" "${BACKUP_DIR}/Caddyfile"
install -m 600 "${CADDY_DIR}/compose.yml" "${BACKUP_DIR}/compose.yml"

rollback() {
  echo "Caddy verification failed; restoring ${BACKUP_DIR}" >&2
  install -m 644 "${BACKUP_DIR}/Caddyfile" "${CADDY_DIR}/Caddyfile"
  install -m 644 "${BACKUP_DIR}/compose.yml" "${CADDY_DIR}/compose.yml"
  docker compose -f "${CADDY_DIR}/compose.yml" up -d
}
trap rollback ERR

install -m 644 "${SOURCE_DIR}/Caddyfile" "${CADDY_DIR}/Caddyfile"
install -m 644 "${SOURCE_DIR}/compose.yml" "${CADDY_DIR}/compose.yml"
docker compose -f "${CADDY_DIR}/compose.yml" up -d
docker exec "${CADDY_CONTAINER}" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  db_status="$(
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      --resolve db.recycleobject.ru:443:127.0.0.1 \
      https://db.recycleobject.ru/auth/v1/health || true
  )"
  api_health="$(
    curl --fail --silent --show-error \
      --resolve api.recycleobject.ru:443:127.0.0.1 \
      https://api.recycleobject.ru/api/health || true
  )"
  if [[ "${db_status}" =~ ^(200|401)$ ]] \
    && grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"${api_health}" \
    && grep -Eq '"db"[[:space:]]*:[[:space:]]*\{[[:space:]]*"ok"[[:space:]]*:[[:space:]]*true' <<<"${api_health}"; then
    trap - ERR
    printf '%s\n' "${api_health}"
    exit 0
  fi
  echo "Caddy health attempt ${attempt}/10 failed (db=${db_status:-none})"
  sleep 6
done

trap - ERR
rollback
exit 1

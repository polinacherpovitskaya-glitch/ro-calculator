#!/usr/bin/env bash
# Daily backup of the ops Postgres database.
# Dumps the DB, gzips, uploads to Selectel Object Storage, rotates locally.
#
# Required environment variables (typically from /srv/ops/infra/.env):
#   POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
#   S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY
#
# Usage:
#   bash backup.sh
#
# Schedule via systemd timer (see ops-backup.timer).

set -euo pipefail

ENV_FILE="/srv/ops/infra/.env"
if [[ -f "${ENV_FILE}" ]]; then
  set -a
  source "${ENV_FILE}"
  set +a
fi

: "${POSTGRES_USER:?must be set}"
: "${POSTGRES_DB:?must be set}"
: "${S3_ENDPOINT:?must be set}"
: "${S3_BUCKET:?must be set}"
: "${S3_ACCESS_KEY:?must be set}"
: "${S3_SECRET_KEY:?must be set}"

BACKUP_DIR="/srv/ops/backups"
mkdir -p "${BACKUP_DIR}"

TS="$(date -u +%Y%m%d-%H%M)"
FILE="${BACKUP_DIR}/${POSTGRES_DB}-${TS}.sql.gz"

echo "==> [$(date -Iseconds)] pg_dump -> ${FILE}"
docker exec -i ops-postgres pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" | gzip > "${FILE}"

SIZE=$(stat -c %s "${FILE}")
echo "==> Dump size: ${SIZE} bytes"

S3_HOST="$(echo "${S3_ENDPOINT}" | sed 's|^https\?://||')"
S3CFG="$(mktemp)"
cat > "${S3CFG}" <<EOF
[default]
host_base = ${S3_HOST}
host_bucket = %(bucket)s.${S3_HOST}
access_key = ${S3_ACCESS_KEY}
secret_key = ${S3_SECRET_KEY}
use_https = True
signature_v2 = False
EOF

echo "==> Upload to s3://${S3_BUCKET}/$(basename "${FILE}")"
s3cmd -c "${S3CFG}" put "${FILE}" "s3://${S3_BUCKET}/$(basename "${FILE}")"

rm -f "${S3CFG}"

echo "==> Rotate local backups (keep 7 days)"
find "${BACKUP_DIR}" -name "${POSTGRES_DB}-*.sql.gz" -mtime +7 -delete

echo "==> [$(date -Iseconds)] Backup complete."

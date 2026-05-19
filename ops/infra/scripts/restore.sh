#!/usr/bin/env bash
# Restore the Postgres database from the latest (or a specified) backup in
# Selectel Object Storage.
#
# Usage:
#   bash restore.sh           # restore latest backup (DANGER: overwrites prod)
#   bash restore.sh <file>    # restore specific file (filename or s3 path)
#
# Recommend running on a STAGING/TEST VPS, not on production.

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

TARGET="${1:-}"
if [[ -z "${TARGET}" ]]; then
  TARGET="$(s3cmd -c "${S3CFG}" ls "s3://${S3_BUCKET}/" | awk '{print $4}' | grep "${POSTGRES_DB}-" | sort | tail -1)"
  if [[ -z "${TARGET}" ]]; then
    echo "No backups found in s3://${S3_BUCKET}/"
    rm -f "${S3CFG}"
    exit 1
  fi
fi

LOCAL="/tmp/$(basename "${TARGET}")"
echo "==> Downloading ${TARGET}"
s3cmd -c "${S3CFG}" get --force "${TARGET}" "${LOCAL}"

echo "==> Restoring to database ${POSTGRES_DB} (DROPPING existing data!)"
read -r -p "Are you sure? Type 'yes' to continue: " CONFIRM
if [[ "${CONFIRM}" != "yes" ]]; then
  echo "Cancelled."
  rm -f "${LOCAL}" "${S3CFG}"
  exit 1
fi

docker exec ops-postgres dropdb -U "${POSTGRES_USER}" --if-exists "${POSTGRES_DB}_old" || true
docker exec ops-postgres psql -U "${POSTGRES_USER}" -d postgres -c "ALTER DATABASE ${POSTGRES_DB} RENAME TO ${POSTGRES_DB}_old;" || true
docker exec ops-postgres createdb -U "${POSTGRES_USER}" "${POSTGRES_DB}"
gunzip -c "${LOCAL}" | docker exec -i ops-postgres psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

rm -f "${LOCAL}" "${S3CFG}"
echo "==> Restore complete. Old data preserved in database ${POSTGRES_DB}_old."
echo "    Drop it manually when satisfied: docker exec ops-postgres dropdb -U ${POSTGRES_USER} ${POSTGRES_DB}_old"

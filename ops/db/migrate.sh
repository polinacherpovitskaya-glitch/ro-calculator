#!/usr/bin/env bash
# Apply all SQL files in ops/db/migrations/ to the database
# defined in DATABASE_URL or in arguments.
#
# Usage:
#   DATABASE_URL=postgres://user:pass@host:5432/db ./migrate.sh
#   ./migrate.sh postgres://user:pass@host:5432/db

set -euo pipefail

DB_URL="${1:-${DATABASE_URL:-}}"
if [[ -z "${DB_URL}" ]]; then
  echo "Usage: $0 <database_url>"
  echo "Or set DATABASE_URL environment variable."
  exit 1
fi

MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

echo "==> Applying migrations from ${MIGRATIONS_DIR}"
for f in "${MIGRATIONS_DIR}"/*.sql; do
  echo "    Running $(basename "$f")"
  psql "${DB_URL}" -v ON_ERROR_STOP=1 -f "$f"
done

echo "==> Migrations complete."

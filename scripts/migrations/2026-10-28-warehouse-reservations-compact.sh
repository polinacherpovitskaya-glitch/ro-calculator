#!/usr/bin/env bash
# Compacts the shared warehouse reservations blob
# (compat_rows table_name='warehouse_reservations', data->>'reservations_data'):
# drops records with status 'released' whose released_at is older than N days.
# Active and cancelled records are never touched. Nothing in the app reads
# released records, and tabs with an older copy cannot bring them back: a save
# sends only records it changed and removes only ids it dropped itself.
#
# Spec: docs/specs/2026-10-28-reservations-in-place.md
# Run ONLY with Polina's explicit go-ahead. Runs on the VM, piped over ssh:
#
#   # dry run: prints before/after, writes nothing
#   ssh -i ~/.ssh/ro_yandex_cutover_ed25519 robot@201.24.63.243 'bash -s -- --days 14' \
#     < scripts/migrations/2026-10-28-warehouse-reservations-compact.sh
#
#   # apply: backup to /home/robot/platform-backups/manual/, then compact
#   ssh -i ~/.ssh/ro_yandex_cutover_ed25519 robot@201.24.63.243 'bash -s -- --days 14 --apply' \
#     < scripts/migrations/2026-10-28-warehouse-reservations-compact.sh
#
# The update runs under the advisory lock the API's blob-patch takes
# (compat:warehouse_reservations) and only if the row still matches the backup
# (md5); if a save landed in between it aborts and can simply be re-run.
#
# Restore (overwrites reservations changed after the compaction):
#   { printf '%s' "BEGIN; SELECT pg_advisory_xact_lock(hashtext('compat:warehouse_reservations')); UPDATE compat_rows SET data = \$ro_backup\$"; \
#     cat /home/robot/platform-backups/manual/<backup>.json; \
#     printf '%s\n' "\$ro_backup\$::jsonb, updated_at = now() WHERE table_name = 'warehouse_reservations' AND source_id = '1'; COMMIT;"; } \
#   | docker exec -i ro-platform-shadow-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1
set -euo pipefail

DAYS=14
APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --days) DAYS="${2:-}"; shift 2 ;;
    --apply) APPLY=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if ! [[ "$DAYS" =~ ^[0-9]+$ ]]; then
  echo "--days must be a whole number of days, got: $DAYS" >&2
  exit 2
fi

PG_CONTAINER="${RO_PG_CONTAINER:-ro-platform-shadow-postgres}"
BACKUP_DIR="${RO_MANUAL_BACKUP_DIR:-/home/robot/platform-backups/manual}"
set -a
# shellcheck disable=SC1091
. /home/robot/platform/infra/.env.shadow
set +a

# `docker exec -i` reads stdin; under `ssh ... bash -s` that is this script, so
# every call gets its own stdin (a heredoc or /dev/null).
psql_q() {
  docker exec -i "$PG_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -At -F $'\t' "$@"
}

# The records that stay, in their original order. Shared by the report and the update.
KEPT_CTE=$(cat <<'SQL'
cur AS (
  SELECT data FROM compat_rows
  WHERE table_name = 'warehouse_reservations' AND source_id = '1'
),
items AS (
  SELECT e, ord
  FROM cur, jsonb_array_elements((cur.data->>'reservations_data')::jsonb) WITH ORDINALITY t(e, ord)
),
kept AS (
  SELECT coalesce(jsonb_agg(e ORDER BY ord), '[]'::jsonb) AS arr
  FROM items
  WHERE NOT (
    e->>'status' = 'released'
    AND coalesce(nullif(e->>'released_at', ''), e->>'created_at')::timestamptz < now() - make_interval(days => :days)
  )
)
SQL
)

report() {
  psql_q -v days="$DAYS" <<SQL
WITH $KEPT_CTE
SELECT 'records', (SELECT count(*) FROM items)::text, jsonb_array_length(kept.arr)::text FROM kept
UNION ALL SELECT 'active', (SELECT count(*) FROM items WHERE e->>'status' = 'active')::text,
  (SELECT count(*) FROM kept, jsonb_array_elements(kept.arr) k WHERE k->>'status' = 'active')::text FROM kept
UNION ALL SELECT 'released', (SELECT count(*) FROM items WHERE e->>'status' = 'released')::text,
  (SELECT count(*) FROM kept, jsonb_array_elements(kept.arr) k WHERE k->>'status' = 'released')::text FROM kept
UNION ALL SELECT 'bytes', (SELECT length(data->>'reservations_data') FROM cur)::text, length(kept.arr::text)::text FROM kept;
SQL
}

echo "warehouse_reservations: dropping released records older than $DAYS days"
echo -e "what\tnow\tafter"
report

if [ "$APPLY" != 1 ]; then
  echo "dry run: nothing written (add --apply to back up and compact)"
  exit 0
fi

mkdir -p "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$BACKUP_DIR/warehouse-reservations-before-compact-$STAMP.json"
RAW=$(mktemp)
trap 'rm -f "$RAW"' EXIT
psql_q -c "SELECT md5(data::text), data::text FROM compat_rows WHERE table_name = 'warehouse_reservations' AND source_id = '1'" < /dev/null > "$RAW"
EXPECTED_MD5=$(cut -f1 "$RAW")
cut -f2- "$RAW" > "$BACKUP"
chmod 600 "$BACKUP"
if [ "$(tr -d '\n' < "$BACKUP" | md5sum | cut -d' ' -f1)" != "$EXPECTED_MD5" ] || ! jq -e '.reservations_data | type == "string"' "$BACKUP" > /dev/null; then
  echo "backup check failed, nothing changed: $BACKUP" >&2
  exit 1
fi
echo "backup: $BACKUP ($(wc -c < "$BACKUP") bytes, md5 $EXPECTED_MD5)"

psql_q -v days="$DAYS" -v expected_md5="$EXPECTED_MD5" <<SQL
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '1min';
SELECT pg_advisory_xact_lock(hashtext('compat:warehouse_reservations')) \\g /dev/null
WITH $KEPT_CTE
UPDATE compat_rows c
SET data = jsonb_set(
      jsonb_set(c.data, '{reservations_data}', to_jsonb(kept.arr::text)),
      '{updated_at}', to_jsonb(to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))),
    updated_at = now()
FROM kept
WHERE c.table_name = 'warehouse_reservations' AND c.source_id = '1'
  AND md5(c.data::text) = :'expected_md5'
RETURNING 1 AS compacted \\gset
COMMIT;
SQL

echo "compacted; now:"
echo -e "what\tnow\tafter"
report

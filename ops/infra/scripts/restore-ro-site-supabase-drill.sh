#!/usr/bin/env bash
set -euo pipefail

dump_path="${RO_SITE_RESTORE_DUMP:?set RO_SITE_RESTORE_DUMP}"
restore_db="${RO_SITE_RESTORE_DB:?set RO_SITE_RESTORE_DB}"
pg_container="${RO_SITE_PG_CONTAINER:-supabase-db}"
restore_role="${RO_SITE_RESTORE_ROLE:-supabase_admin}"
manifest_path="${RO_SITE_RESTORE_MANIFEST:-}"
storage_archive="${RO_SITE_RESTORE_STORAGE_ARCHIVE:-}"

case "$restore_db" in
  codex_ro_site_restore_[A-Za-z0-9_]*) ;;
  *) echo "restore database must start with codex_ro_site_restore_" >&2; exit 2 ;;
esac

case "$dump_path" in
  /*.dump) ;;
  *) echo "restore dump must be an absolute .dump path" >&2; exit 2 ;;
esac

test -s "$dump_path"
if [[ -n "$manifest_path" ]]; then test -s "$manifest_path"; fi
if [[ -n "$storage_archive" ]]; then
  test -s "$storage_archive"
  tar -tzf "$storage_archive" >/dev/null
fi

database_exists="$(docker exec "$pg_container" psql -U "$restore_role" -d postgres -Atc \
  "select count(*) from pg_database where datname = '$restore_db';")"
if [[ "$database_exists" != "0" ]]; then
  echo "restore database already exists; refusing to overwrite it" >&2
  exit 2
fi

container_dump="/tmp/${restore_db}.dump"
cleanup() {
  docker exec "$pg_container" unlink -- "$container_dump" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker cp "$dump_path" "$pg_container:$container_dump"
docker exec "$pg_container" createdb -U "$restore_role" -O "$restore_role" \
  -T template0 "$restore_db"
docker exec "$pg_container" pg_restore -U "$restore_role" -d "$restore_db" \
  --no-privileges "$container_dump"
docker exec "$pg_container" psql -U "$restore_role" -d "$restore_db" \
  -v ON_ERROR_STOP=1 -c 'ANALYZE;' >/dev/null

stats="$(docker exec "$pg_container" psql -U "$restore_role" -d "$restore_db" -Atc \
  "select json_build_object('public_tables', (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'), 'public_rows', (select coalesce(sum(n_live_tup), 0)::bigint from pg_stat_user_tables where schemaname = 'public'), 'auth_users', (select count(*) from auth.users), 'auth_identities', (select count(*) from auth.identities), 'storage_objects', (select count(*) from storage.objects));")"

if [[ -n "$manifest_path" ]]; then
  python3 - "$manifest_path" "$stats" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
actual = json.loads(sys.argv[2])
expected = manifest["databaseStats"]
if actual != expected:
    raise SystemExit(f"restore stats mismatch: expected={expected} actual={actual}")
PY
fi

printf 'restore_database=%s\n' "$restore_db"
printf 'restore_stats=%s\n' "$stats"
if [[ -n "$storage_archive" ]]; then printf 'storage_archive_traversal=ok\n'; fi

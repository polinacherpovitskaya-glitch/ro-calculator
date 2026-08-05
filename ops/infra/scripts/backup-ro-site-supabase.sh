#!/usr/bin/env bash
set -euo pipefail

backup_dir="${RO_SITE_BACKUP_DIR:?set RO_SITE_BACKUP_DIR}"
bucket="${RO_SITE_BACKUP_BUCKET:?set RO_SITE_BACKUP_BUCKET}"
yc_bin="${RO_SITE_YC_BIN:?set RO_SITE_YC_BIN}"
yc_profile="${RO_SITE_YC_PROFILE:-}"
pg_container="${RO_SITE_PG_CONTAINER:-supabase-db}"
database="${RO_SITE_DB_NAME:-postgres}"
storage_dir="${RO_SITE_STORAGE_DIR:-/home/robot/sb/docker/volumes/storage}"
remote_prefix="${RO_SITE_REMOTE_PREFIX:-ro-site/daily}"
retention_days="${RO_SITE_LOCAL_RETENTION_DAYS:-7}"

for required_dir in "$backup_dir" "$storage_dir"; do
  case "$required_dir" in
    /*) ;;
    *) echo "backup and storage directories must be absolute" >&2; exit 2 ;;
  esac
  if [[ "$required_dir" == "/" ]]; then
    echo "refusing a filesystem-root backup directory" >&2
    exit 2
  fi
done

if ! [[ "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "RO_SITE_LOCAL_RETENTION_DAYS must be a non-negative integer" >&2
  exit 2
fi

test -d "$storage_dir"
test -x "$yc_bin"
install -d -m 700 "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump_name="ro-site-${stamp}.dump"
storage_name="ro-site-storage-${stamp}.tar.gz"
manifest_name="ro-site-${stamp}.manifest.json"
checksum_name="ro-site-${stamp}.SHA256SUMS"
dump_path="$backup_dir/$dump_name"
storage_path="$backup_dir/$storage_name"
manifest_path="$backup_dir/$manifest_name"
checksum_path="$backup_dir/$checksum_name"

docker exec "$pg_container" sh -lc \
  'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$dump_path"
tar -C "$(dirname "$storage_dir")" -czf "$storage_path" "$(basename "$storage_dir")"
chmod 600 "$dump_path" "$storage_path"

database_stats="$({
  docker exec "$pg_container" sh -lc \
    'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select json_build_object('\''public_tables'\'', (select count(*) from information_schema.tables where table_schema = '\''public'\'' and table_type = '\''BASE TABLE'\''), '\''public_rows'\'', (select coalesce(sum(n_live_tup), 0)::bigint from pg_stat_user_tables where schemaname = '\''public'\''), '\''auth_users'\'', (select count(*) from auth.users), '\''auth_identities'\'', (select count(*) from auth.identities), '\''storage_objects'\'', (select count(*) from storage.objects));"'
} | tail -n 1)"

dump_bytes="$(stat -c '%s' "$dump_path")"
storage_bytes="$(stat -c '%s' "$storage_path")"
python3 -c '
import json, sys
stats = json.loads(sys.argv[2])
print(json.dumps({
    "schemaVersion": 1,
    "createdAt": sys.argv[1],
    "database": sys.argv[3],
    "databaseStats": stats,
    "dumpBytes": int(sys.argv[4]),
    "storageArchiveBytes": int(sys.argv[5]),
}, ensure_ascii=False, indent=2))
' "$stamp" "$database_stats" "$database" "$dump_bytes" "$storage_bytes" > "$manifest_path"
chmod 600 "$manifest_path"

(
  cd "$backup_dir"
  sha256sum "$dump_name" "$storage_name" "$manifest_name" > "$checksum_name"
)
chmod 600 "$checksum_path"

yc_args=()
if [[ -n "$yc_profile" ]]; then yc_args+=(--profile "$yc_profile"); fi
remote="s3://${bucket}/${remote_prefix}/${stamp}"
for name in "$dump_name" "$storage_name" "$manifest_name" "$checksum_name"; do
  "$yc_bin" "${yc_args[@]}" storage s3 cp \
    "$backup_dir/$name" "$remote/$name" >/dev/null
done

verify_dir="$(mktemp -d "$backup_dir/.verify-${stamp}.XXXXXX")"
for name in "$dump_name" "$storage_name" "$manifest_name" "$checksum_name"; do
  "$yc_bin" "${yc_args[@]}" storage s3 cp \
    "$remote/$name" "$verify_dir/$name" >/dev/null
done
(
  cd "$verify_dir"
  sha256sum -c "$checksum_name"
)
find "$verify_dir" -maxdepth 1 -type f -delete
rmdir "$verify_dir"

find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'ro-site-*.dump' -o -name 'ro-site-storage-*.tar.gz' \
     -o -name 'ro-site-*.manifest.json' -o -name 'ro-site-*.SHA256SUMS' \) \
  -mtime "+$retention_days" -delete

printf 'backup_prefix=%s\n' "$remote"
printf 'dump_bytes=%s storage_archive_bytes=%s\n' "$dump_bytes" "$storage_bytes"

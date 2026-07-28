# План: усиление резервного копирования Yandex production

## Source

- Spec:
  [`docs/specs/2026-07-28-yandex-backup-hardening.md`](../specs/2026-07-28-yandex-backup-hardening.md)
- Parent migration:
  [`docs/plans/2026-07-28-supabase-retirement.md`](2026-07-28-supabase-retirement.md)

## Tasks

- [x] Добавить ежедневный dump новой Yandex PostgreSQL рядом с source dump.
- [x] Проверять source/target dump через `pg_restore --list`.
- [x] Сохранять проверенную target-копию на VM.
- [x] Загружать и повторно скачивать три backup artifacts с SHA-256.
- [x] Включать и проверять versioning backup/media buckets.
- [x] Добавить отдельный immutable prefix для cutover bundle.
- [x] Расширить workflow smoke contract.
- [x] Запустить workflow с сохранением cutover bundle.
- [x] Проверить production health после backup.

## Stop-and-fix

- При несовпадении любого checksum cloud upload не считается backup.
- При ошибке target dump старый backup workflow не удаляет исходные данные.
- Никакой Supabase container, volume или source object не удаляется этим
  проектом.

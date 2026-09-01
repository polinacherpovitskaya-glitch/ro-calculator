# План: защита Yandex VM от переполнения диска

**Spec:** `docs/specs/2026-08-31-yandex-disk-exhaustion.md`

## M1. Восстановление production `[x]`

- [x] Подтвердить публичный `502` и состояние calculator API.
- [x] Найти причину на VM: 100% disk usage и отказ PostgreSQL WAL recovery.
- [x] Освободить место удалением только остановленного временного build-контейнера
  без mounts и его untagged image.
- [x] Запустить PostgreSQL, дождаться healthy и затем запустить calculator API.
- [x] Проверить публичный health с `db.ok=true`.

## M2. Безопасная локальная ротация `[x]`

- [x] Запускать site-backup rotation до создания нового dump/archive.
- [x] Добавить disk free-space guard и cleanup неполного текущего поколения.
- [x] Ограничить локальные daily-копии активной PostgreSQL семью днями.
- [x] Сохранить cloud generations, cutover bundles, containers и volumes.

## M3. Регрессии и релиз `[x]`

- [x] Расширить site-backup и workflow smoke-проверки.
- [x] Поднять четыре version anchor от свежего `origin/main`.
- [x] Запустить backup, syntax и version smokes.
- [x] Применить безопасную ротацию к уже загруженным локальным копиям на VM.
- [x] Проверить свободное место, контейнеры и публичный health после ротации.

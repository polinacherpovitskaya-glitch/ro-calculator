# План: надёжная синхронизация Yandex static mirrors

## Source

- Spec:
  [`docs/specs/2026-07-28-yandex-static-sync-retry.md`](../specs/2026-07-28-yandex-static-sync-retry.md)

## Tasks

- [x] Ограничить matrix одной одновременно работающей сборкой.
- [x] Запретить отмену уже начавшегося bucket upload.
- [x] Добавить три попытки полной bootstrap-сборки с паузой.
- [x] Зафиксировать контракт в `bootstrap-guard-smoke`.
- [x] Поднять release version.
- [x] Опубликовать оба Yandex mirrors.
- [x] Проверить live, mirror и write-back smokes.

## Stop-and-fix

- Пустой `order_items` или другая обязательная таблица никогда не публикуется.
- Если все три попытки упали, bucket сохраняет предыдущий рабочий snapshot.

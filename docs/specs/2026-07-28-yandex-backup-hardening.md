# Усиление резервного копирования Yandex production

## Контекст

После production cutover основной runtime пишет в
`ro-platform-shadow-postgres`, а старый `supabase-db` остаётся нетронутым
rollback-контуром. Существующий ежедневный workflow сохраняет старую базу и
Supabase Storage, но новая production-база получает локальный dump только во
время deploy.

## Цель

Сделать потерю одной VM, одного volume или одного объекта недостаточной для
потери production-данных:

1. ежедневно сохранять старую и новую PostgreSQL;
2. оставлять проверенную локальную копию новой базы на VM;
3. загружать обе базы и старый Storage в приватный Yandex backup bucket;
4. скачивать cloud-копии обратно и проверять SHA-256;
5. включить versioning для backup и production media buckets;
6. один раз сохранить полный cutover bundle в отдельном постоянном prefix.

## Ограничения безопасности

- Не останавливать и не удалять Supabase-контейнеры, volumes или Storage.
- Не изменять production rows во время backup.
- Не публиковать дампы, токены или ключи как GitHub artifacts.
- Ротация ежедневных snapshots не затрагивает постоянный `cutover/` prefix.
- Удаление старых видимых snapshot keys безопаснее после включения versioning:
  предыдущие версии остаются восстановимыми.

## Приёмка

- Оба custom-format dumps проходят `pg_restore --list`.
- Архив старого Storage проходит `tar -tzf`.
- VM SHA-256 новой базы совпадает со скачанной runner-копией.
- Загруженные cloud-объекты скачиваются и проходят общий SHA-256 manifest.
- Оба Yandex buckets показывают versioning enabled.
- Полный cutover bundle проходит оба исходных checksum manifest до и после
  загрузки.
- Старый Supabase продолжает работать, новый API и timebot остаются зелёными.


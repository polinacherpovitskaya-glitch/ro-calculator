# План: стабильность Yandex API и timebot monitor

## Source

- Spec:
  [`docs/specs/2026-07-28-yandex-runtime-stability.md`](../specs/2026-07-28-yandex-runtime-stability.md)

## Tasks

- [x] Зафиксировать restart/OOM/runtime diagnostics.
- [x] Найти причину API restart по отфильтрованным логам.
- [x] Добавить pool error listener и безопасный connect timeout.
- [x] Добавить unit/contract tests.
- [x] Добавить API-only deploy с pre-deploy backup.
- [x] Убрать автоматическое удаление старых deploy dumps.
- [x] Делегировать одиночный Telegram timeout независимому relay probe.
- [ ] Выполнить production API deploy.
- [ ] Проверить restart count, bot, live, mirror и write-back.

## Stop-and-fix

- Deploy не выполняется при неуспешных API tests или backup validation.
- Любой production refresh запрещён.
- Старый Supabase и rollback assets не изменяются.

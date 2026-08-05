# План: перенос taskbot в Yandex Cloud

## Source

- Spec:
  [`docs/specs/2026-08-05-yandex-taskbot-cutover.md`](../specs/2026-08-05-yandex-taskbot-cutover.md)
- Parent program:
  [`docs/plans/2026-08-04-russia-cloud-consolidation.md`](2026-08-04-russia-cloud-consolidation.md)
- Last updated: 2026-08-05.

## Assumptions

- GitHub Secrets `TASK_BOT_TOKEN`, `OPS_BOT_TOKEN`,
  `TELEGRAM_RELAY_SECRET` и Yandex VM SSH credentials уже существуют.
- `ro-platform-shadow-api` и PostgreSQL на Yandex являются production target.
- Локальный LaunchAgent остаётся доступным для rollback и не удаляется.
- Managed Supabase не отключается этим изменением.

## M1. Deployment contract `[ ]`

- [ ] Расширить Yandex bot deploy вторым контейнером `ro-taskbot`.
- [ ] Передавать taskbot только Telegram relay и Ops API credentials.
- [ ] Проверять отсутствие `SUPABASE_*` и `DATABASE_URL`.
- [ ] Проверять API event queue read без mutations.
- [ ] Проверять startup logs и нулевой restart count.

### Validation

```sh
node tests/yandex-taskbot-cutover-smoke.js
node tests/timebot-server-migration-smoke.js
```

## M2. Ongoing health `[ ]`

- [ ] Добавить `ro-taskbot` в пятиминутный Yandex bot monitor.
- [ ] Проверять taskbot token через защищённый Vercel relay.
- [ ] Сохранить существующие timebot heartbeat/DB/API проверки.
- [ ] Расширить alert scope на оба production bot.

### Validation

```sh
node tests/timebot-health-monitor-smoke.js
```

## M3. Preservation and release `[ ]`

- [ ] Поднять app version с v437 до v438 по четырём anchors.
- [ ] Записать обнаруженный legacy consumer и rollback boundary в общий status.
- [ ] Запустить version, preservation и bot tests.
- [ ] Отправить отдельный PR из свежего `origin/main`.

### Validation

```sh
node tests/version-smoke.js
node tests/cloud-consolidation-preservation-smoke.js
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
```

## M4. Production cutover `[ ]`

- [ ] Зафиксировать SHA-256 локального plist и наличие rollback env без
  вывода secret values.
- [ ] Выполнить `launchctl bootout` только для
  `com.recycleobject.taskbot.v2`.
- [ ] Merge/deploy `ro-taskbot` и дождаться зелёных deploy/health checks.
- [ ] Подтвердить локальное отсутствие legacy process и сохранность plist/env.
- [ ] Подтвердить прекращение 15-секундного Supabase poll traffic.

### Rollback gate

При любом failure или conflict 409 остановить Yandex `ro-taskbot` и вернуть
локальный LaunchAgent через `launchctl bootstrap`. Ни один provider и ни один
dataset не удалять.

## Definition of done

- Task notifications обслуживает единственный `ro-taskbot` на Yandex.
- Task events читаются и помечаются через Yandex Ops API/PostgreSQL.
- Managed Supabase больше не получает legacy Node poll.
- Timebot, taskbot, API, live site и оба calculator mirror остаются зелёными.
- Локальный rollback сохранён, physical decommission не выполнен.

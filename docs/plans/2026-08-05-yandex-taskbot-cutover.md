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

## M1. Deployment contract `[x]`

- [x] Расширить Yandex bot deploy вторым контейнером `ro-taskbot`.
- [x] Передавать taskbot только Telegram relay и Ops API credentials.
- [x] Проверять отсутствие `SUPABASE_*` и `DATABASE_URL`.
- [x] Проверять API event queue read без mutations.
- [x] Проверять startup logs и нулевой restart count.

### Validation

```sh
node tests/yandex-taskbot-cutover-smoke.js
node tests/timebot-server-migration-smoke.js
```

## M2. Ongoing health `[x]`

- [x] Добавить `ro-taskbot` в пятиминутный Yandex bot monitor.
- [x] Проверять taskbot token через защищённый Vercel relay.
- [x] Сохранить существующие timebot heartbeat/DB/API проверки.
- [x] Расширить alert scope на оба production bot.

### Validation

```sh
node tests/timebot-health-monitor-smoke.js
```

## M3. Preservation and release `[x]`

- [x] Поднять app version с v437 до v438 по четырём anchors.
- [x] Записать обнаруженный legacy consumer и rollback boundary в spec/plan.
- [x] Запустить version, preservation и bot tests.
- [x] Подготовить отдельный PR из свежего `origin/main`.

### Validation

```sh
node tests/version-smoke.js
node tests/cloud-consolidation-preservation-smoke.js
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
```

## M4. Production cutover `[x]`

- [x] Зафиксировать SHA-256 локального plist и наличие rollback env без
  вывода secret values.
- [x] Выполнить `launchctl bootout` только для
  `com.recycleobject.taskbot.v2`.
- [x] Deploy `ro-taskbot` и дождаться зелёных deploy/health checks.
- [x] Подтвердить локальное отсутствие legacy process и сохранность plist/env.
- [x] Подтвердить прекращение 15-секундного Supabase poll traffic.

### Production evidence

- Preservation guard: Actions run `31014933604`, success.
- Yandex deploy: Actions run `31015020487`, success; `ro-timebot` и
  `ro-taskbot` running, restart count `0`, API read probe passed.
- Independent bot health: Actions run `31015151087`, success; оба Telegram
  relay probe, Yandex API и PostgreSQL green.
- Local LaunchAgent plist SHA-256:
  `7e9d1c8958d20f63a5fd89549e0d5320dfb9756897d6a647dd970c671a90dc6a`.
- Local rollback `.env` SHA-256:
  `468c271c36660c910a0ead567fde412c1ab7163b227265d60b19619f2332e535`;
  permissions hardened from `0644` to `0600`, contents unchanged.
- Managed Supabase Unified Logs: последний 15-секундный Node poll
  `/rest/v1/task_notification_events` — `2026-08-05 11:23:55 -03`; после
  cutover новые строки Storage продолжали поступать, а task poll не повторился.
- Старые публичные Storage image reads из Instagram всё ещё присутствуют и
  отдельно блокируют немедленную паузу managed Supabase.

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

# Статус полного отказа от Supabase

## Snapshot

- Current phase: M8 — наблюдение после production cutover.
- Plan file: `docs/plans/2026-07-28-supabase-retirement.md`.
- Status: green; v422 and API-backed timebot are live.
- Last updated: 2026-07-28.

## Done

- Production данные перенесены из Supabase Cloud в self-hosted Supabase Yandex.
- `calc` и `calc2` работают из Yandex Object Storage.
- Timebot работает на Yandex VM.
- Подтверждён фактический Yandex bill: 1 314,56 ₽ за 30 дней.
- Зафиксированы ресурсы VM: 2 vCPU, 3,9 ГБ RAM, 39 ГБ disk.
- Зафиксирован DB baseline: 124 МБ.
- Зафиксирован Storage baseline: 420 объектов, 4 buckets.
- Выполнен data-path audit: 133 функции, 26 remote tables.
- Подтверждено существование независимых `ops/api`, migrations и refresh scripts.
- Selectel исключён из целевой архитектуры.
- Vercel оставлен только как Telegram-relay.
- Отдельные PostgreSQL 16 и Express API работают на Yandex VM.
- `https://api.recycleobject.ru/api/health` опубликован через Caddy с HTTPS.
- Caddy сохраняет прежний маршрут `db.recycleobject.ru` и автоматически
  откатывается при неуспешной проверке.
- Shadow backup создаётся в custom format, проверяется через `pg_restore
  --list` и хранится с семидневной ротацией.
- Shadow stack пережил контрольный restart.
- Новый stack использует около 57 МБ RAM: PostgreSQL 36,9 МБ и API 20,0 МБ.
- Timebot monitor проверяет replacement API/PostgreSQL и отправил тестовое
  Telegram-уведомление.
- Илья Теряев (`@ILAYTONKO`) и Влад Галкин (`@tigreslav`) активны; их записи
  времени за 27 июля присутствуют в production DB.
- Полный rehearsal перенёс все 64 legacy-набора и прошёл без расхождений.
- Count parity включает 366 `time_entries`, 309 активных заказов, 838
  `order_items`, склад, 19 178
  `finance_transactions`, 17 534 `legacy_finance_transactions` и 1 644
  `bank_transactions`.
- Compatibility-слой сохранил 43 028 исходных строк с точной формой payload.
- Storage перенесён в приватный Yandex Object Storage: 420 из 420 объектов,
  410 254 132 байта, checksum manifest совпал.
- Старые абсолютные и относительные Supabase Storage URL переписаны на Yandex.
- Frontend transport, timebot, FinTablo, Точка, static builder и write-back
  workflow переведены на собственный API.
- Пароли calculator auth теперь проверяются сервером и не попадают в browser
  cache.
- Actions run `30382180892` повторно подтвердил migrations, API/bot tests,
  HTTPS health, Storage read/write, полный rehearsal и восстановление
  automation token после refresh.
- Write/read/delete smoke через публичный Yandex API прошёл в run
  `30382619258`.
- Последний dump размером 76 344 012 байт восстановлен в отдельную БД:
  66 public tables и ключевые counts полностью совпали; временная БД удалена.
- Rollback release закреплён Git-тегом
  `pre-yandex-cutover-v421-20260728`.
- Cutover bundle хранится на VM в
  `/home/robot/cutover-backups/20260728T172717Z`, локально в
  `/Users/krollipolli/Documents/RO backups/20260728T172717Z` и отдельной
  проверенной копией в приватном Yandex backup bucket (run `30383083266`).
- Bundle содержит source Supabase dump, target Yandex dump, архив 420 файлов
  и SHA-256 manifest; финальные source/target dumps сняты после остановки
  старого poller.
- Старый bot image сохранён как
  `ro-timebot:pre-yandex-cutover-v421-20260728`.
- Финальная parity после write freeze совпала, включая 366/366 записей часов.
- API-backed timebot deploy `30383667643` и повторный полный health
  `30383872866` зелёные.
- Оба Yandex static buckets опубликовали v422 в run `30383670546`.
- После публикации зелёные: write-back `30384324698`, calc2 browser smoke
  `30384552008` и calc browser smoke `30384892744`.

## In Progress

- Окно наблюдения. Старый Supabase и его Storage остаются нетронутыми.
- Усиливается ежедневный backup: source Supabase + target Yandex PostgreSQL,
  локальная target-копия на VM, проверенная cloud-копия и bucket versioning.
- Backup hardening run `30386066187` зелёный: ежедневный и постоянный cutover
  наборы загружены, скачаны обратно и прошли исходные SHA-256 manifests.
- Последовательный static run `30386829294` опубликовал `v424` на обоих
  доменах после transient `order_items` failure; API health зелёный.
- Runtime diagnostics `30390030439` подтвердил все rollback assets и parity
  366/366; API restart связан с 1-секундным PostgreSQL connection timeout, а
  не OOM или потерей данных.

## Next

- Контролировать health, записи часов, backups и отсутствие обращений к
  Supabase.
- Не удалять старые контейнеры, volumes, Storage и rollback image.
- После стабильного окна запросить отдельное подтверждение на физическое
  удаление Supabase.

## Decisions Made

- Использовать существующий `ops/api` вместо нового API с нуля — он уже покрывает
  основные домены и имеет integration tests.
- Разворачивать на текущей Yandex VM — ресурсов достаточно, новая VM не нужна.
- Использовать отдельный PostgreSQL volume до cutover — rollback остаётся
  простым.
- Мигрировать клиентов волнами — один большой rewrite запрещён.
- Не отключать Vercel relay — он решает отдельную Telegram networking проблему.

## Assumptions In Force

- `api.recycleobject.ru` можно направить на текущую VM.
- Текущий Caddy можно расширить вторым site block без остановки
  `db.recycleobject.ru`.
- Внешние consumers будут добавлены в checklist до M7.

## Commands

```sh
node scripts/audit-data-paths.mjs
cd ops/api && npm test
cd ops/bot && npm test
node tests/version-smoke.js
```

## Current Blockers

- Нет. Физическое удаление старого Supabase запрещено до завершения M7 и окна
  наблюдения.

## Audit Log

| Date | Milestone | Files / systems | Commands | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 2026-07-28 | M1 | Yandex billing | Chrome billing detail | 1 314,56 ₽ / 30 дней | M2 |
| 2026-07-28 | M1 | `ro-db` | `free`, `df`, `docker ps`, `docker stats` | 2,1 ГБ RAM и 28 ГБ disk доступны | M2 |
| 2026-07-28 | M1 | PostgreSQL | `pg_database_size`, `pg_stat_user_tables` | 124 МБ, table baseline captured | M2 |
| 2026-07-28 | M1 | repo data layer | `node scripts/audit-data-paths.mjs` | 133 functions, 26 tables | M2 |
| 2026-07-28 | M2 | Yandex shadow | Actions run `30364415037` | PostgreSQL/API deploy green | Caddy |
| 2026-07-28 | M2 | DNS/Caddy | Actions run `30365536034` | Public HTTPS health green; old DB route green | M3 |
| 2026-07-28 | M2 | backup/restart | `pg_restore --list`, container restart | Verified backup; API recovered with DB healthy | M3 |
| 2026-07-28 | M2 | timebot monitor | Actions run `30365779852` | Bot, relay, DB, replacement API and test alert green | M3 |
| 2026-07-28 | M3 | core data rehearsal | ten refresh scripts + `compare-datasets.mjs` | 39/39 core datasets count-match | finance |
| 2026-07-28 | M3 | finance rehearsal | migration 014 + refresh 11 | 15/15 finance datasets count-match; 54/54 total | site gap |
| 2026-07-28 | M3 | full parity + URL rewrite | Actions `30371648837` | all datasets green; no old Storage URLs | token order |
| 2026-07-28 | M3 | final rehearsal | Actions `30382180892` | API/bot/Storage/parity green; token restored after refresh | restore drill |
| 2026-07-28 | M3 | restore drill | temporary DB `ro_restore_drill_20260728` | 66 tables and key counts match; temp DB removed | M7 |
| 2026-07-28 | M4/M6 | public write-back | Actions `30382619258` | setting + time entry write/read/delete and cleanup green | M7 |
| 2026-07-28 | M7 | rollback copies | VM + local + Actions `30383083266` | source/target/Storage SHA-256 verified; v421 Git tag saved | freeze |
| 2026-07-28 | M7 | final parity | source + Yandex PostgreSQL | 366/366 hours; all datasets and URL rewrite green | switch |
| 2026-07-28 | M7 | timebot | Actions `30383667643`, `30383872866` | API poller, Telegram relay, DB and heartbeat green | frontend |
| 2026-07-28 | M7 | v422 production | Actions `30383670546`, `30384324698`, `30384552008`, `30384892744` | both domains, write-back and browser smokes green | M8 |
| 2026-07-28 | M8 | merged cutover | PR `#212`, merge `6ad500ce` | main deploy, timebot, write-back, health and live smoke green | backup hardening |
| 2026-07-28 | M8 | backup hardening | Actions `30386066187` | source/target/Storage cloud round-trip green; media and backup versioning enabled | observation |
| 2026-07-28 | M8 | static retry | Actions `30386829294` | sequential calc/calc2 build and upload green; both serve v424 | production smokes |
| 2026-07-28 | M8 | runtime diagnostics | Actions `30390030439`, `30390167041` | DB/bot/Supabase stable; API pool timeout caused automatic restarts | pool hardening |

## Smoke / Demo Checklist

- [x] Current calculator is healthy before migration.
- [x] Current timebot health is green before migration.
- [x] Shadow API health is green.
- [x] Shadow DB parity is green.
- [x] Timebot writes without Supabase.
- [x] Both calculator domains work without Supabase.
- [ ] Production survives VM reboot without Supabase containers.

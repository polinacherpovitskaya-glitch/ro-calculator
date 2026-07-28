# Статус полного отказа от Supabase

## Snapshot

- Current phase: M3 — Rehearsal и parity всех данных.
- Plan file: `docs/plans/2026-07-28-supabase-retirement.md`.
- Status: yellow.
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
- Десять refresh scripts скопировали production snapshot в shadow PostgreSQL.
- Count parity: 54 из 54 покрытых наборов совпали, включая 364
  `time_entries`, 309 активных заказов, 838 `order_items`, склад, 19 178
  `finance_transactions`, 17 534 `legacy_finance_transactions` и 1 644
  `bank_transactions`.

## In Progress

- Gap-анализ и migrations/routes для оставшихся site-таблиц.

## Next

- M3: запустить refresh scripts, получить первый parity report и закрыть
  непокрытые таблицы.

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

- Нет. DNS/certificate выполняются только после готовности shadow API.

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

## Smoke / Demo Checklist

- [x] Current calculator is healthy before migration.
- [x] Current timebot health is green before migration.
- [x] Shadow API health is green.
- [ ] Shadow DB parity is green.
- [ ] Timebot writes without Supabase.
- [ ] Both calculator domains work without Supabase.
- [ ] Production survives VM reboot without Supabase containers.

# Статус полного отказа от Supabase

## Snapshot

- Current phase: M2 — Shadow PostgreSQL + API на Yandex.
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

## In Progress

- Yandex-specific shadow deployment для `ops-api` и PostgreSQL.

## Next

- M2: поднять shadow stack без production traffic и применить migrations.

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

## Smoke / Demo Checklist

- [x] Current calculator is healthy before migration.
- [x] Current timebot health is green before migration.
- [ ] Shadow API health is green.
- [ ] Shadow DB parity is green.
- [ ] Timebot writes without Supabase.
- [ ] Both calculator domains work without Supabase.
- [ ] Production survives VM reboot without Supabase containers.

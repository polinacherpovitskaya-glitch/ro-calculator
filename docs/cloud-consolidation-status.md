# Статус консолидации инфраструктуры

## Snapshot

- Current phase: M1 — preservation inventory и decommission guard.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status: yellow; production не изменён, полный cross-provider backup ещё не
  подтверждён.
- Last updated: 2026-08-04.

## Done

- Выбрана целевая архитектура Yandex Cloud + Vercel Telegram relay.
- Зафиксирована Russia-first граница для персональных данных.
- Проверено, что `calc.recycleobject.ru` уже обслуживается Yandex Object
  Storage.
- Зафиксированы текущие providers четырёх продуктов.
- Подтверждено существование backup/restore контура калькулятора RO.
- Подтверждено, что текущий Yandex backup не покрывает все managed Supabase,
  Firestore/Firebase Storage и Railway Volume.
- Создан чистый worktree от свежего `origin/main`; локальный dirty worktree не
  изменён.

## In progress

- Non-secret inventory источников и обязательных backup evidence.
- Машинно-проверяемый preservation manifest.
- Fail-closed decommission guard и smoke tests.

## Next

- Завершить M1 и получить первый structural inventory report.
- Затем начать M2 с актуального backup калькулятора RO и provider exports
  калькулятора RePanel.

## Decisions made

- Yandex Cloud — единственный production data plane и основной runtime.
- Vercel остаётся только для Telegram relay и preview без production-данных.
- YDB не расширяется как общая data platform; целевая реляционная база —
  PostgreSQL.
- Каждый продуктовый cutover — отдельный branch/PR.
- Старые источники после cutover сначала paused/read-only, а не удалены.
- Physical delete требует отдельного подтверждения пользователя.

## Assumptions in force

- Доступы к provider dashboards и production secrets будут доступны для M2.
- Локальные `.env` используются только как источник key-name inventory;
  значения не копируются и не выводятся.
- Existing Yandex backup bucket остаётся private и versioned.

## Current blockers

- В GitHub repositories `cnc-calculator`, `repanel-site` и
  `recycle-object-site` нет настроенных Actions secrets; provider exports M2
  потребуют безопасно использовать существующие локальные/provider credentials
  или добавить отдельные secrets.
- Полный Firestore/Firebase Storage export ещё не подтверждён.
- Полный Railway Volume snapshot ещё не подтверждён.
- Managed Supabase Auth exports обоих сайтов ещё не подтверждены.

## Commands

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=inventory
node tests/cloud-consolidation-preservation-smoke.js
node tests/version-smoke.js
```

## Audit log

| Date | Milestone | Files / systems | Commands | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 2026-08-04 | M0 | Four products / five providers | DNS, live HTTP, repo and provider audits | Target architecture agreed | M1 |
| 2026-08-04 | M1 | Fresh `origin/main` worktree | `git fetch`, `git worktree add` | clean branch created | preservation guard |
| 2026-08-04 | M1 | GitHub secret-name inventory | `gh secret list` | RO secrets present; other repos empty | plan M2 credentials |
| 2026-08-04 | M1 | Local env key inventory | key names only | no values exposed | encode required evidence |

## Smoke / demo checklist

- [x] Existing production URLs remain HTTP 200.
- [x] No provider or dataset has been deleted, paused or overwritten.
- [ ] Preservation inventory validates structurally.
- [ ] Decommission mode fails closed while backups are pending.
- [ ] Every source has a named owner, export, checksum and restore requirement.

# Статус консолидации инфраструктуры

## Snapshot

- Current phase: M2 — полные backup/restore drills всех источников.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status: yellow; preservation guard зелёный, production не изменён, полный
  cross-provider backup ещё не подтверждён.
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
- Добавлен non-secret inventory четырёх продуктов и 16 обязательных источников.
- Добавлен preservation manifest с отдельными backup/cloud/offline/restore/
  parity gates.
- Добавлен validator в режимах `inventory`, `backups` и `decommission`.
- Подтверждено, что pending backup и отсутствие owner approval блокируют
  decommission.
- Добавлен CI preservation guard и включён inventory check в основной verify.
- Версия приложения поднята с v433 до v434 по четырём обязательным anchors.

## In progress

- Проверка доступности provider export tooling и действующих credentials без
  вывода значений.
- Свежий backup калькулятора RO.
- Подготовка полного Firestore/Firebase/Railway export калькулятора RePanel.

## Next

- Получить актуальный backup калькулятора RO и записать evidence.
- Выполнить provider exports калькулятора RePanel и restore drill.

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
| 2026-08-04 | M1 | Manifest, validator, tests, CI | Node checks, inventory, negative backup/decommission modes, YAML parse | pass; fail-closed confirmed | M2 provider exports |

## Smoke / demo checklist

- [x] Existing production URLs remain HTTP 200.
- [x] No provider or dataset has been deleted, paused or overwritten.
- [x] Preservation inventory validates structurally.
- [x] Decommission mode fails closed while backups are pending.
- [x] Every source has a named provider, location, export, checksum and restore
  requirement.

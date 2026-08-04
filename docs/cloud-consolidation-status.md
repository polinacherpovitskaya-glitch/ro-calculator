# Статус консолидации инфраструктуры

## Snapshot

- Current phase: M2 — полные backup/restore drills всех источников.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status: yellow; локальный зашифрованный preservation set проверен,
  production не изменён, Yandex offsite copy и restore drills ещё не завершены.
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
- Созданы и проверены Git bundles четырёх репозиториев; отдельно сохранены
  dirty/untracked working trees исходных каталогов.
- Создан зашифрованный backup конфигурации; пароль хранится только в macOS
  Keychain.
- Снят и проверен Railway Volume snapshot: 246 200 320 bytes, 332 files,
  SHA-256 `6aeeedc9544561c9acbf150fc063be807c8b9f6e75466f211b7c2114725988ca`.
- Выполнен managed Firestore export: 55 140 documents; локально 435 objects и
  74 007 377 source bytes, generation parity без изменений.
- Скопирован Firebase Storage: 4 010 objects, 2 788 529 164 bytes; каждый
  объект скачан по generation, source parity без изменений.
- Выполнен RePanel Supabase application-logical export: 10 tables, 7 rows,
  0 Auth users, 1 bucket, 0 objects; SHA-256 manifest проверен.
- Выполнен Recycle Object Supabase application-logical export: 65 tables,
  43 165 rows, 1 Auth user, 4 buckets, 420 objects и 410 254 132 object bytes;
  SHA-256 manifest проверен.
- Подтверждены managed physical backups Supabase: Recycle Object от
  2026-08-04 06:58:10 UTC, RePanel от 2026-08-02 05:16:33 UTC. Physical
  backups не включают Storage objects.
- Выполнен production Yandex backup run
  `https://github.com/polinacherpovitskaya-glitch/ro-calculator/actions/runs/30881000943`;
  source/target PostgreSQL, source Storage, VM copy и bucket versioning
  отмечены workflow как успешные.
- Собран единый encrypted offline set размером 5 418 823 712 bytes, SHA-256
  `6ba64d98b78f365c6df6f30ac2d57a3d303819589bb67b52e49ad284e9849aaa`;
  полный decrypt + tar traversal завершился успешно.
- Временные Supabase/Yandex CLI access tokens отозваны, локальные profiles и
  временные файлы с API keys удалены.

## In progress

- Получение downloadable full PostgreSQL dump managed Supabase; текущие
  application-logical exports не включают roles, extensions, triggers,
  functions, RLS и unexposed schemas.
- Yandex offsite upload encrypted preservation set.
- Изолированные restore drills Firestore, Firebase Storage, Railway Volume и
  managed Supabase exports.

## Next

- Получить доступ к Yandex Cloud account/service account, который видит cloud
  `b1gl59l77vb50ihub2nd`, и загрузить encrypted set в private versioned bucket.
- Получить DB passwords или официальный downloadable logical dump обоих
  managed Supabase projects без reset production credentials.
- Выполнить restore drills и только после них переходить к Yandex landing zone.

## Decisions made

- Yandex Cloud — единственный production data plane и основной runtime.
- Vercel остаётся только для Telegram relay и preview без production-данных.
- YDB не расширяется как общая data platform; целевая реляционная база —
  PostgreSQL.
- Каждый продуктовый cutover — отдельный branch/PR.
- Старые источники после cutover сначала paused/read-only, а не удалены.
- Physical delete требует отдельного подтверждения пользователя.

## Assumptions in force

- Доступы к Supabase, Railway и Google dashboards доступны на чтение; Yandex
  browser account `panels@recycleobject.com` не зарегистрирован в Yandex Cloud.
- Локальные `.env` используются только как источник key-name inventory;
  значения не копируются и не выводятся.
- Existing Yandex backup bucket остаётся private и versioned.

## Current blockers

- Нет локального/Yandex service-account доступа к cloud
  `b1gl59l77vb50ihub2nd`; поэтому encrypted offsite copy в Yandex пока не
  загружена.
- У managed Supabase projects нет доступного DB password, а dashboard physical
  backup поддерживает restore внутри Supabase, но не downloadable full dump.
- RePanel YDB export ещё не выполнен.
- Restore drills всех stateful sources ещё не выполнены; сохранённые production
  providers остаются включены как rollback copies.

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
| 2026-08-04 | M2 | Four repositories + working trees | `git bundle verify`, binary patches, untracked tar snapshots | verified local copies | encrypted set |
| 2026-08-04 | M2 | Yandex RO backup workflow | run `30881000943` | provider workflow green; offline bytes/restore pending | retain production |
| 2026-08-04 | M2 | Railway Volume | server tar, split transfer, server/local SHA-256 parity, tar traversal | 246 200 320 bytes verified | isolated restore |
| 2026-08-04 | M2 | Firestore + Firebase Storage | managed export, generation-pinned download, second source listing, SHA-256 | 55 140 docs; 4 445 local objects verified | isolated restore |
| 2026-08-04 | M2 | Two managed Supabase projects | managed physical backup audit + application-logical export | tables/Auth/Storage captured; full pg_dump pending | obtain DB dump |
| 2026-08-04 | M2 | Encrypted offline set | AES-256-CBC PBKDF2, SHA-256, full decrypt/tar traversal | 5 418 823 712 bytes verified | Yandex offsite upload |

## Smoke / demo checklist

- [x] Existing production URLs remain HTTP 200.
- [x] No provider or dataset has been deleted, paused or overwritten.
- [x] Temporary provider access tokens created during preservation were revoked.
- [x] Preservation inventory validates structurally.
- [x] Decommission mode fails closed while backups are pending.
- [x] Every source has a named provider, location, export, checksum and restore
  requirement.
- [x] Encrypted preservation set can be fully decrypted and traversed.
- [ ] Encrypted preservation set has a verified Yandex offsite copy.
- [ ] Every stateful source has passed an isolated restore drill.

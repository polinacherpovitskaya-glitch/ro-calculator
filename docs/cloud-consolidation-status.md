# Статус консолидации инфраструктуры

## Snapshot

- Current phase: M3 — Yandex landing zone для калькулятора RePanel.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status: green for M2; все 16 источников имеют проверенные backup, Yandex
  offsite copy, offline copy, restore и source-parity evidence. Production не
  изменён; M3 ещё не начат.
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

## M2 evidence

- Все четыре encrypted archives повторно прошли `SHA256SUMS`: общий
  preservation set, YDB export, managed Supabase full dumps и RO platform
  backup.
- Все архивы загружены в private versioned bucket
  `ro-yandex-migration-snapshots-b1gl59l77vb50ihub2nd`, скачаны обратно и
  совпали по SHA-256.
- Managed Supabase RePanel восстановлен в изолированном PostgreSQL 17.6:
  48 таблиц, public 10 таблиц / 7 строк.
- Managed Supabase Recycle Object восстановлен в изолированном PostgreSQL
  17.6: 107 таблиц, public 65 таблиц / 43 165 строк, `auth.users` 1 строка.
- Firestore export загружен в локальный emulator: 23 root collections и
  55 140 документов. Firebase Storage: 4 010 объектов, все checksum entries
  совпали.
- Railway Volume запустил текущий RePanel-код на изолированной копии:
  `/health` 200, principal stores загружены.
- Active Yandex PostgreSQL восстановлен: 66 таблиц / 95 029 строк. Legacy
  Supabase: 103 таблицы / 43 593 строки. Storage: 420 файлов / 410 254 132
  байта. Timebot: 4 файла / 29 415 байт.
- YDB backup `etn3vo50868nb3fmbofu` восстановлен в отдельную защищённую базу
  `etn75mh40qa5pto3kt0c`; таблица `personal_data_records` содержит ожидаемые
  6 строк.
- Четыре Git bundle клонированы в bare repositories и прошли `git fsck
  --full` + `git bundle verify`.
- Полный внешний отчёт без значений secrets хранится в локальном
  `PRESERVATION-STATUS.md`; manifest содержит машинно-проверяемые ссылки на
  checksums, counts и restore evidence.

## In progress

- Подготовка отдельной M3 spec/plan branch в `cnc-calculator`.
- Выбор минимального российского runtime, persistent storage и shadow hostname
  для RePanel calculator без production writes.

## Next

- Поднять изолированный RePanel shadow runtime в Yandex без Railway/Firebase
  credentials.
- Проверить persistence после restart, `/health`, logs, backup и restore
  automation.
- Не выполнять data import/cutover, пока shadow storage не подтверждён.

## Decisions made

- Yandex Cloud — единственный production data plane и основной runtime.
- Vercel остаётся только для Telegram relay и preview без production-данных.
- YDB не расширяется как общая data platform; целевая реляционная база —
  PostgreSQL.
- Каждый продуктовый cutover — отдельный branch/PR.
- Старые источники после cutover сначала paused/read-only, а не удалены.
- Physical delete требует отдельного подтверждения пользователя.

## Assumptions in force

- Доступы к Supabase, Railway и Google остаются доступными на чтение как
  rollback-копии до окончания окна наблюдения.
- Локальные `.env` используются только как источник key-name inventory;
  значения не копируются и не выводятся.
- Yandex backup bucket остаётся private и versioned; restore-drill databases и
  Docker volumes защищены от случайного production traffic.

## Current blockers

- M2 blockers отсутствуют.
- Для M3 ещё не утверждён конкретный shadow hostname; это не блокирует создание
  внутреннего runtime и health check на Yandex.

## Commands

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
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
| 2026-08-04 | M2 | Yandex private versioned backup bucket | four encrypted uploads + complete read-back SHA-256 | all four remote copies verified | restore drills |
| 2026-08-04 | M2 | Managed Supabase projects | full `pg_dump`, isolated PostgreSQL 17.6 restores | RePanel 48 tables; Recycle Object 107 tables; logical/Auth parity | retain managed sources |
| 2026-08-04 | M2 | Firestore, Firebase Storage, Railway | emulator import, per-object checksums, isolated app boot | 55 140 docs; 4 010 objects; `/health` 200 | retain providers |
| 2026-08-04 | M2 | RO PostgreSQL, legacy Supabase, Storage, timebot | isolated DB/file restores | all counts/checksums verified | retain rollback copies |
| 2026-08-04 | M2 | YDB backup | restore API + direct YDB CLI count | protected restore DB, 6/6 rows | retain source and restore DB |
| 2026-08-04 | M2 | Four Git bundles | bare clone, `git fsck --full`, `git bundle verify` | all four verified | M3 |

## Smoke / demo checklist

- [x] Existing production URLs remain HTTP 200.
- [x] No provider or dataset has been deleted, paused or overwritten.
- [x] Temporary provider access tokens created during preservation were revoked.
- [x] Preservation inventory validates structurally.
- [x] Decommission mode fails closed while observation/write-stop/owner approval
  are pending.
- [x] Every source has a named provider, location, export, checksum and restore
  requirement.
- [x] Encrypted preservation set can be fully decrypted and traversed.
- [x] Encrypted preservation set has a verified Yandex offsite copy.
- [x] Every stateful source has passed an isolated restore drill.

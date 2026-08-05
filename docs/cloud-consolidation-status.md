# Статус консолидации инфраструктуры

## Snapshot

- Current phase: M6/M7 — завершение cutover сайта Recycle Object и окно
  наблюдения.
- Plan file: `docs/plans/2026-08-04-russia-cloud-consolidation.md`.
- Status: green for M3–M5 и основной runtime/data-plane M6. Калькулятор и сайт
  RePanel работают в Yandex; `recycleobject.ru` остаётся на разрешённом Vercel
  frontend, а database/Auth/Storage обслуживаются из Yandex. Неиспользуемый AI
  генератор удалён вместе с Gemini/Yandex credentials. Отдельный taskbot
  уведомлений перенесён со старого локального Supabase poller в Yandex. Старые
  stateful providers сохранены как rollback и не удалены.
- Last updated: 2026-08-05.

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
- Калькулятор RePanel перенесён с Railway/Firebase в Yandex и работает на
  production hostname; исходные данные сохранены для rollback.
- Сайт RePanel перенесён с managed Supabase/YDB в Yandex PostgreSQL и
  production runtime; legacy Supabase keys отозваны без удаления source.
- `recycleobject.ru` переключён на `https://db.recycleobject.ru`: 65 таблиц /
  43 165 source rows объединены с target без truncate, добавлено 146 строк и
  обновлено 5 source-newer записей.
- Перенесены 1 Supabase Auth user и 1 identity с исходным password hash;
  orphan checks равны нулю.
- Все 420 Storage objects / 410 254 132 bytes совпали по SHA-256; финальная
  source delta не обнаружила новых таблиц или файлов.
- Cutover-комплект сайта RO загружен в private versioned Yandex bucket и
  прошёл read-back: source archive, target pre-sync archive и post-cutover dump
  совпали по SHA-256.
- На Yandex VM включён `ro-site-backup.timer`. Первый run создал custom-format
  PostgreSQL dump, Storage archive, manifest и checksums, загрузил 4 объекта в
  `ro-site/daily/20260805T060513Z` и успешно проверил их обратным скачиванием.
- Тот же scheduled dump восстановлен в изолированную БД
  `codex_ro_site_restore_20260805_060513`: 65 public tables / 43 176 rows,
  Auth 1 user / 1 identity и 420 Storage metadata rows точно совпали с
  manifest; Storage archive полностью traversed.
- Временные локальные/VM-файлы с ключами, password hash и merge SQL удалены
  после подтверждения независимых копий.
- После подтверждения владельца, что генератор описаний не используется, из
  production удалены AI-кнопка, client handler и server route. Ручное поле и
  все существующие описания сохранены. Gemini/Yandex AI env удалены из Vercel,
  неиспользованный scoped Yandex key удалён; service account остался без ключей.
- Google Fonts runtime удалён: Montserrat и Alfa Slab One self-hosted внутри
  Vercel build. Preview и production Chrome подтвердили локальную загрузку
  обоих шрифтов и отсутствие Google font links.
- Site PR `#6` self-hosted шрифты, а site PR `#7` удалил неиспользуемый AI
  runtime. Vercel production Ready; повторный public audit проверил 122 URL и
  41 mold без ошибок.
- Подтверждено, что два cron сайта имеют одного scheduler owner — Vercel — и
  работают с Yandex database. `payment-recovery?dry=1` вернул dry summary без
  mutations, email или платежных side effects.
- Найден остаточный managed Supabase consumer: локальный LaunchAgent
  `com.recycleobject.taskbot.v2` девять дней опрашивал
  `task_notification_events` через legacy Supabase SDK каждые 15 секунд.
- Развёрнут отдельный `ro-taskbot` на Yandex VM через приватный Ops API и
  защищённый Vercel Telegram relay. Deploy `31015020487` и independent health
  `31015151087` зелёные; оба bot container running с restart count `0`.
- Локальный legacy poller выгружен, но plist и `.env` сохранены для rollback;
  права `.env` усилены до `0600` без изменения содержимого.
- Unified Logs подтвердил прекращение legacy Node poll: последний запрос
  `task_notification_events` был `2026-08-05 11:23:55 -03`. В логах остаются
  публичные чтения старых Supabase Storage URL из Instagram, поэтому Supabase
  пока нельзя ставить на паузу.

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

- Наблюдение за тремя production cutover и ежедневными Yandex backups.
- Безопасные integration smokes без реального списания и дублирующих сообщений.
- Наблюдение за `ro-taskbot` и остаточными публичными Supabase Storage reads.

## Next

- Повторять restore drill на свежих scheduled backups в окне наблюдения.
- Выяснить срок жизни старых Supabase image URL в Instagram и не ставить
  проект на паузу, пока эти ссылки должны продолжать открываться.
- Продолжать 14-дневное наблюдение; Supabase/Railway/Firebase не удалять без
  отдельного подтверждения владельца.

## Decisions made

- Yandex Cloud — единственный production data plane и основной runtime.
- Vercel остаётся для публичных frontends, Telegram relay и preview, но не как
  authoritative database или Storage.
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

- Блокеров сохранности данных нет.
- Физический decommission старых providers намеренно заблокирован до окончания
  окна наблюдения и отдельного подтверждения владельца.
- Paused state managed Supabase дополнительно заблокирован активными внешними
  чтениями старых Storage URL из Instagram; production database writes туда
  не возвращались.

## Commands

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
node tests/cloud-consolidation-preservation-smoke.js
node tests/ro-site-backup-smoke.js
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
| 2026-08-05 | M3–M5 | RePanel calculator + site | Yandex shadow/parity/cutover/live smokes | production moved; rollback retained | M6 |
| 2026-08-05 | M6 | Recycle Object Supabase/Auth/Storage | full export, rehearsal restore, union merge, final delta, live smokes | Yandex data plane live; 420/420 objects | observe |
| 2026-08-05 | M6 | RO site cutover backups | private versioned upload + full read-back SHA-256 | source/pre/post copies verified | daily automation |
| 2026-08-05 | M6 | `ro-site-backup.timer` | DB dump, Storage tar, upload, download, SHA-256 | first run success; 4 objects | monitor timer |
| 2026-08-05 | M7 | Scheduled RO site backup | isolated Supabase restore + manifest comparison + Storage traversal | 65 tables / 43 176 rows; Auth 1/1; Storage 420 | observe |
| 2026-08-05 | M6 | RO site AI/fonts + Vercel cron | Fontsource, AI feature removal, Chrome admin/font checks, public audit, dry cron smoke | Google/Yandex AI runtime and credentials removed; public flows green | observe |
| 2026-08-05 | M7 | Local taskbot + managed Supabase logs | LaunchAgent inventory, Yandex deploy `31015020487`, health `31015151087`, Unified Logs | API-backed `ro-taskbot` green; 15-second Supabase poll stopped; rollback retained | observe Storage reads |

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
- [x] RePanel calculator and RePanel site production run from Yandex.
- [x] RO site database/Auth/Storage run from Yandex behind the Vercel frontend.
- [x] RO site daily DB + Storage backup timer is active and its first run passed
  remote read-back verification.
- [x] Fresh scheduled RO site backup passed isolated database restore and
  Storage archive traversal.
- [x] Неиспользуемый AI description runtime и Gemini/Yandex AI credentials
  удалены; ручное поле описания и существующие данные сохранены.
- [x] Task notification poller работает в Yandex через Ops API; локальный
  Supabase consumer остановлен с сохранённым rollback.
- [ ] 14-day observation window and fresh post-cutover restore drill complete.

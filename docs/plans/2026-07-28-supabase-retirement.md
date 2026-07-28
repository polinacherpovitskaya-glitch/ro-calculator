# План: полный отказ от Supabase

## Source

- Task: полностью убрать Supabase, сохранив данные и работу timebot.
- Canonical input:
  [`docs/specs/2026-07-28-supabase-retirement.md`](../specs/2026-07-28-supabase-retirement.md)
- Repo context: `js/supabase.js`, `ops/api`, `ops/db`, `ops/bot`, CI и Yandex VM.
- Last updated: 2026-07-28.

## Assumptions

- Вся целевая инфраструктура базы и API находится в Yandex Cloud.
- Selectel не используется и не является fallback.
- Vercel остаётся только Telegram-relay.
- Новый API разворачивается на текущей `ro-db`, без новой VM и без роста
  базового бюджета.
- Production Supabase не останавливается до финального go/no-go.

## Milestone Order

| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| M1 | Baseline и карта зависимостей | — | [x] |
| M2 | Shadow PostgreSQL + API на Yandex | M1 | [x] |
| M3 | Rehearsal и parity всех данных | M2 | [x] |
| M4 | Timebot без Supabase | M3 | [x] |
| M5 | Frontend migration waves | M3 | [x] |
| M6 | Scripts, CI и Storage | M5 | [x] |
| M7 | Production cutover | M4, M5, M6 | [x] |
| M8 | Наблюдение и удаление Supabase | M7 | [ ] |

## M1. Baseline и карта зависимостей `[x]`

### Goal

- Зафиксировать реальное состояние VM, данных, Storage и runtime consumers.

### Tasks

- [x] Проверить Yandex billing.
- [x] Проверить ресурсы VM и контейнеры.
- [x] Получить table counts и Storage counts.
- [x] Запустить data-path audit.
- [x] Проверить покрытие `ops/api`, migrations и refresh scripts.
- [x] Зафиксировать целевую архитектуру без Selectel.

### Definition of Done

- Baseline записан в spec/status.
- Первый рискованный write не выполнялся.

### Validation

```sh
node scripts/audit-data-paths.mjs
node tests/version-smoke.js
```

### Known Risks

- Часть внешних consumers находится вне этого репозитория.

### Stop-and-Fix Rule

- Любой неучтённый runtime consumer добавляется в карту до следующего milestone.

## M2. Shadow PostgreSQL + API на Yandex `[x]`

### Goal

- Независимый API/PostgreSQL работает рядом с Supabase и не принимает
  production writes.

### Tasks

- [x] Добавить Yandex-specific compose без Selectel S3 defaults.
- [x] Запустить отдельный PostgreSQL volume и `ops-api`.
- [x] Применить все migrations.
- [x] Подключить `api.recycleobject.ru` через существующий Caddy.
- [x] Добавить health monitor и backup.
- [x] Зафиксировать RAM/CPU после запуска.

### Definition of Done

- `GET https://api.recycleobject.ru/api/health` зелёный.
- Supabase production и timebot продолжают работать без изменений.
- Новый PostgreSQL переживает restart и имеет проверяемый backup.

### Validation

```sh
cd ops/api && npm ci
cd ops/api && TEST_DATABASE_URL=postgres://ops:ops_dev_password@127.0.0.1:5433/ops npm test
curl -fsS https://api.recycleobject.ru/api/health
```

### Known Risks

- Ошибка Caddy или port binding может затронуть `db.recycleobject.ru`.
- Shadow containers временно увеличат RAM usage.

### Stop-and-Fix Rule

- При ухудшении `db.recycleobject.ru` shadow stack останавливается до
  восстановления текущего production.

## M3. Rehearsal и parity всех данных `[x]`

### Goal

- Новый PostgreSQL содержит полную и проверенную копию production данных.

### Tasks

- [x] Запустить десять существующих refresh scripts.
- [x] Добавить migrations/routes для непокрытых finance/site tables.
- [x] Сравнить counts, ID, timestamps и JSON payloads.
- [x] Перенести Storage в Yandex Object Storage.
- [x] Провести URL rewrite rehearsal.
- [x] Выполнить restore drill в отдельную временную БД.

### Definition of Done

- Parity report не содержит необъяснённых расхождений.
- Storage manifest совпадает по count/size/checksum.
- Повторный rehearsal идемпотентен.

### Validation

```sh
node ops/scripts/refresh/01-employees.mjs
node ops/scripts/refresh/09-time-payroll.mjs
node scripts/audit-data-paths.mjs
```

### Known Risks

- Ops schema нормализует часть legacy JSON и может потерять редкие поля.

### Stop-and-Fix Rule

- Любое расхождение останавливает migration wave до исправления mapper/test.

## M4. Timebot без Supabase `[x]`

### Goal

- Timebot читает сотрудников и пишет часы только через собственный API.

### Tasks

- [x] Добавить bot-token endpoints для employees/time entries.
- [x] Расширить bot API client и compatibility transport.
- [x] Перевести timebot с `@supabase/supabase-js` на API client.
- [x] Сохранить persistent state и Telegram bindings.
- [x] Обновить health workflow.
- [x] Выполнить тестовую запись и cleanup.
- [x] Переключить production-контейнер во время M7.

### Definition of Done

- В timebot runtime отсутствуют `SUPABASE_URL` и `SUPABASE_KEY`.
- Контрольная запись видна в новом PostgreSQL.
- Heartbeat, Telegram и API health зелёные.

### Validation

```sh
cd ops/bot && npm test
node tests/timebot-state-utils-smoke.js
node tests/timebot-health-monitor-smoke.js
```

### Known Risks

- Потеря одного редкого query/filter из текущего Supabase client.

### Stop-and-Fix Rule

- При любой ошибке записи timebot возвращается на текущий Supabase URL до
  исправления.

## M5. Frontend migration waves `[x]`

### Goal

- Все функции `js/supabase.js` используют собственный API без изменения
  публичных cross-module contracts.

### Tasks

- [x] Wave A: employees, time entries, settings/auth.
- [x] Wave B: orders, items, warehouse, production.
- [x] Wave C: molds, blanks, colors, marketplaces.
- [x] Wave D: finance, work management, bugs.
- [x] Удалить Supabase SDK после последней волны.
- [x] Опубликовать frontend и выполнить live smokes во время M7.

### Definition of Done

- Все 133 data functions имеют API transport либо осознанно local-only.
- Live smokes обоих доменов зелёные.
- В browser bundle нет Supabase URL/key/SDK.

### Validation

```sh
node tests/supabase-fallback-smoke.js
node tests/order-flow-smoke.js
node tests/warehouse-migration-smoke.js
node tests/finance-smoke.js
node tests/tasks-smoke.js
```

### Known Risks

- Большой legacy surface и local fallback могут скрыть remote write failure.

### Stop-and-Fix Rule

- Волны не объединяются; упавшая волна чинится или откатывается отдельно.

## M6. Scripts, CI и Storage `[x]`

### Goal

- Ни один production consumer больше не использует Supabase endpoints.

### Tasks

- [x] Перевести bootstrap/static sync.
- [x] Перевести FinTablo и Точка.
- [x] Перевести production write-back workflow.
- [x] Перевести upload/download на Yandex Object Storage через API.
- [x] Ограничить Vercel минимальным Telegram-relay.
- [ ] Отключить migration-only snapshot workflows после M7.

### Definition of Done

- Runtime grep не находит `SUPABASE_*`, `/rest/v1`, `/storage/v1`.
- Собственный write-back smoke зелёный.

### Validation

```sh
rg -n "SUPABASE_|/rest/v1|/storage/v1|supabase-js" js ops/bot scripts api .github/workflows
node tests/yandex-writeback-smoke.mjs
```

### Known Risks

- Внешние репозитории/плагины могут сохранить старый endpoint.

### Stop-and-Fix Rule

- Cutover запрещён, пока старый access log показывает неизвестный consumer.

## M7. Production cutover `[x]`

### Goal

- Production writes идут только через собственный API/PostgreSQL.

### Tasks

- [x] Сделать свежий backup.
- [x] Ввести короткий write freeze.
- [x] Применить финальную дельту и parity.
- [x] Переключить frontend, bot и CI.
- [x] Выполнить browser/live/write-back smokes.
- [x] Снять freeze.

### Definition of Done

- Production работает без Supabase API.
- Rollback values зафиксированы и проверены.

### Validation

```sh
node tests/live-site-smoke.mjs
node tests/yandex-mirror-smoke.mjs
curl -fsS https://api.recycleobject.ru/api/health
```

### Known Risks

- Новые writes между final delta и переключением.

### Stop-and-Fix Rule

- При parity/write smoke failure freeze сохраняется либо выполняется
  документированный rollback.

## M8. Наблюдение и удаление Supabase `[ ]`

### Goal

- Supabase полностью отсутствует в runtime и на VM.

### Tasks

- [ ] Наблюдать health, errors, backups и access logs.
- [ ] Подтвердить отсутствие старого трафика.
- [ ] Остановить Supabase compose.
- [ ] Проверить production после restart VM.
- [ ] Удалить контейнеры, images, secrets и старый volume отдельным
  подтверждённым действием.

### Definition of Done

- `docker ps` не содержит `supabase-*`.
- Данные восстановимы из нового backup.
- Production и timebot зелёные после reboot.

### Validation

```sh
docker ps --format '{{.Names}}' | rg supabase
curl -fsS https://api.recycleobject.ru/api/health
```

### Known Risks

- Удаление volume необратимо без backup.

### Stop-and-Fix Rule

- Volume не удаляется без отдельного подтверждения пользователя и успешного
  restore drill.

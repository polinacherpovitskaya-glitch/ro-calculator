# План: консолидация инфраструктуры в Yandex Cloud

## Source

- Task: сохранить все данные и перенести четыре продукта с пяти провайдеров в
  Yandex Cloud + минимальный Vercel Telegram relay.
- Canonical input:
  [`docs/specs/2026-08-04-russia-cloud-consolidation.md`](../specs/2026-08-04-russia-cloud-consolidation.md)
- Repositories: `ro-calculator`, `cnc-calculator`, `repanel-site`,
  `recycle-object-site`.
- Last updated: 2026-08-04.

## Execution analysis

- Программа разбита на preservation foundation и три независимых продуктовых
  cutover. Общий destructive cutover запрещён.
- Первый этап создаёт машинно-проверяемый реестр источников, exports и restore
  drills. Он не меняет production и не требует write freeze.
- Калькулятор RePanel идёт первым: он устраняет Railway и Firebase и является
  upstream для сайта RePanel.
- Каждый следующий продукт получает отдельные spec, plan, branch и PR.
- Любая потеря parity, невозможность восстановления или неизвестный writer
  останавливает текущий milestone до исправления.

## Assumptions

- Целевой регион Yandex Cloud — Россия (`ru-central1`).
- Vercel сохраняется только для Telegram relay и безопасных preview без
  production-данных.
- Telegram остаётся разрешённой внешней интеграцией.
- Действующие проекты Supabase, Railway и Firebase доступны на чтение до конца
  окна наблюдения.
- Значения secrets никогда не фиксируются в Git или preservation manifest.
- Физическое удаление старых данных требует отдельного подтверждения владельца.

## Validation assumptions

- Для Node-проектов используются существующие `node tests/*.js` / `npm test` /
  `npm run build`.
- Для Flask-калькулятора используются `pytest`, `/health` и production browser
  smoke.
- Provider exports проверяются структурно, по SHA-256 и реальным restore drill,
  а не только фактом скачивания.

## Milestone order

| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| M0 | Архитектурное решение и safety policy | — | [x] |
| M1 | Preservation inventory и decommission guard | M0 | [x] |
| M2 | Полные backup/restore drills всех источников | M1 | [~] |
| M3 | Yandex landing zone для калькулятора RePanel | M2 | [ ] |
| M4 | Калькулятор RePanel: shadow, parity, cutover | M3 | [ ] |
| M5 | Сайт RePanel: shadow, parity, cutover | M4 | [ ] |
| M6 | Сайт Recycle Object: shadow, parity, cutover | M5 | [ ] |
| M7 | Наблюдение и прекращение foreign writes | M4, M5, M6 | [ ] |
| M8 | Paused state и отдельный decommission | M7 | [ ] |

## M0. Архитектурное решение и safety policy `[x]`

### Goal

- Зафиксировать целевую платформу и необратимые границы.

### Tasks

- [x] Выбрать Yandex Cloud основным production-контуром.
- [x] Оставить Vercel только для Telegram relay/preview.
- [x] Зафиксировать Russia-first data boundary.
- [x] Запретить удаление без backup, restore, parity и отдельного подтверждения.

### Definition of done

- Spec описывает целевую архитектуру и preservation invariant.

### Validation

```sh
test -s docs/specs/2026-08-04-russia-cloud-consolidation.md
```

### Known risks

- Юридические документы и уведомления Роскомнадзора требуют отдельной проверки
  ответственным за персональные данные.

### Stop-and-fix rule

- Любой новый foreign data processor добавляется в scope до миграции.

## M1. Preservation inventory и decommission guard `[x]`

### Goal

- Ни один старый сервис нельзя отключить без полного набора проверенных backup
  evidence.

### Tasks

- [x] Добавить non-secret inventory четырёх систем и всех источников данных.
- [x] Добавить preservation manifest со статусами backup/restore/parity.
- [x] Добавить Node validator с режимами `inventory`, `backups` и
  `decommission`.
- [x] Добавить fail-closed тесты validator.
- [x] Добавить CI guard.
- [x] Зафиксировать GitHub secret-name inventory без значений.
- [x] Зафиксировать локальные env key names без значений.

### Definition of done

- Структурная проверка inventory зелёная.
- Decommission mode красный, пока обязательные exports не подтверждены.
- Тест доказывает, что пропущенный restore/checksum блокирует отключение.

### Validation

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=inventory
node tests/cloud-consolidation-preservation-smoke.js
```

### Known risks

- Наличие credential name не подтверждает, что credential ещё действует.
- Provider dashboard может содержать источник, не отражённый в репозиториях.

### Stop-and-fix rule

- Не начинать provider export, пока inventory не перечисляет его данные,
  файлы, auth и runtime state.

## M2. Полные backup/restore drills всех источников `[ ]`

### Goal

- Получить восстановимые копии всех production-источников до первого shadow
  migration.

### Tasks

- [ ] Обновить backup калькулятора RO и подтвердить текущий Yandex PostgreSQL,
  legacy Supabase, Storage и timebot state.
- [x] Экспортировать RePanel Firestore, Firebase Storage и Railway Volume.
- [ ] Экспортировать managed Supabase + Storage сайта RePanel и YDB.
- [ ] Экспортировать managed Supabase + Storage сайта Recycle Object, включая
  auth/admin state.
- [x] Создать Git bundles всех четырёх release commits.
- [x] Сгенерировать SHA-256 manifests и зашифрованную офлайн-копию.
- [ ] Загрузить копии в private versioned Yandex backup bucket.
- [ ] Восстановить каждый DB/file bundle в изолированную среду и записать
  counts/checksums.

### Definition of done

- Все обязательные entries M2 имеют `backupStatus=verified` и
  `restoreStatus=verified`.
- Ни один backup не существует только в том же provider, что и source.

### Validation

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=backups
node tests/cloud-consolidation-preservation-smoke.js
```

### Known risks

- Supabase Auth и Firebase metadata требуют отдельного export, не только
  public tables.
- Railway Volume не имеет автоматических Hobby backups.
- Supabase application-logical export не заменяет `pg_dump`: roles,
  extensions, triggers, functions, RLS и unexposed schemas должны быть
  сохранены отдельно до cutover.
- Yandex offsite upload требует service account или browser account, который
  действительно зарегистрирован в целевом cloud.

### Stop-and-fix rule

- Любой failed restore возвращает entry в `pending`; shadow migration не
  начинается.

## M3. Yandex landing zone для калькулятора RePanel `[ ]`

### Goal

- Поднять изолированный российский runtime и data plane без production writes.

### Tasks

- [ ] Создать отдельную spec/plan branch в `cnc-calculator`.
- [ ] Выбрать runtime, persistent disk/PostgreSQL и Object Storage.
- [ ] Создать отдельные service accounts, secrets и network rules.
- [ ] Опубликовать shadow hostname и `/health`.
- [ ] Настроить logs, metrics, backup и restore automation.

### Definition of done

- Shadow runtime работает без Railway/Firebase credentials.
- Production Railway/Firebase не изменены.

### Validation

```sh
curl -fsS "$REPANEL_SHADOW_URL/health"
```

### Known risks

- Flask monolith использует in-process locks и Firestore-specific operations.

### Stop-and-fix rule

- Не импортировать production data, пока persistence не переживает restart.

## M4. Калькулятор RePanel: shadow, parity, cutover `[ ]`

### Goal

- Перенести runtime, Firestore, Firebase Storage и Railway Volume в Yandex без
  потери данных.

### Tasks

- [ ] Добавить Yandex storage adapter и повторяемый importer.
- [ ] Провести full import и parity всех collections/files.
- [ ] Прогнать CRM, orders, warehouse, production, finance, time и attachment
  flows в shadow.
- [ ] Выполнить финальный write freeze/delta/parity.
- [ ] Переключить публичный calculator origin.
- [ ] Сохранить Railway/Firebase как read-only rollback.

### Definition of done

- Production использует Yandex; counts и контрольные payload совпадают.
- Сайт RePanel читает новый calculator origin.

### Validation

```sh
pytest -q
curl -fsS "$REPANEL_PRODUCTION_URL/health"
```

### Known risks

- Большая часть данных хранится документами и full-list rewrites; concurrent
  writes требуют короткого freeze.

### Stop-and-fix rule

- Любой mismatch сохраняет старый writer и отменяет DNS/origin switch.

## M5. Сайт RePanel: shadow, parity, cutover `[ ]`

### Goal

- Убрать Supabase/YDB split и обслуживать сайт из Yandex.

### Tasks

- [ ] Создать отдельную spec/plan branch в `repanel-site`.
- [ ] Перенести catalog/promos и четыре YDB personal tables в отдельную
  PostgreSQL schema.
- [ ] Перенести `product-images` в Object Storage.
- [ ] Переключить API/auth/admin/payments/webhooks.
- [ ] Прогнать checkout/refund/return/certificate flows.
- [ ] Переключить `re-panel.ru` и `www` после финальной parity.

### Definition of done

- Сайт не использует Supabase/YDB credentials в runtime.
- Production domain обслуживается из Yandex.

### Validation

```sh
npm test
npm run build
```

### Known risks

- Платежный webhook нельзя принимать одновременно двумя writers.

### Stop-and-fix rule

- Payment/order mismatch немедленно возвращает traffic на старый runtime.

## M6. Сайт Recycle Object: shadow, parity, cutover `[ ]`

### Goal

- Перенести магазин, Supabase Auth, Storage, jobs и integrations в Yandex.

### Tasks

- [ ] Создать отдельную spec/plan branch в `recycle-object-site`.
- [ ] Повторно снять дельту после snapshot 2026-07-28.
- [ ] Перенести admin auth и ограничить service credentials.
- [ ] Подключить migrated database/media.
- [ ] Перенести Vercel cron jobs в Yandex timers/jobs.
- [ ] Проверить Точку, CDEK, Yandex Delivery, email и Telegram.
- [ ] Переключить домен после test orders и final parity.

### Definition of done

- Все customer/order writes идут в Yandex.
- Старый Supabase access log не получает production traffic.

### Validation

```sh
npm test
npm run build
```

### Known risks

- Auth, payment, webhook и cron могут создать duplicate side effects.

### Stop-and-fix rule

- Идемпотентность и single-writer подтверждаются до DNS switch.

## M7. Наблюдение и прекращение foreign writes `[ ]`

### Goal

- Подтвердить стабильность Yandex production до остановки старых providers.

### Tasks

- [ ] Наблюдать минимум 14 дней после последнего cutover.
- [ ] Проверять live flows, error logs, backup jobs и old-provider access logs.
- [ ] Подтвердить отсутствие новых writes в Supabase/Firebase/Railway.
- [ ] Провести Yandex restore drill на свежем post-cutover backup.

### Definition of done

- 14 дней без необъяснённых расхождений или fallback traffic.

### Validation

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=decommission
```

### Known risks

- Редкие месячные/возвратные сценарии могут не попасть в короткое окно.

### Stop-and-fix rule

- Любой неизвестный old-provider request продлевает окно наблюдения.

## M8. Paused state и отдельный decommission `[ ]`

### Goal

- Остановить расходы и доступы без немедленного физического удаления данных.

### Tasks

- [ ] Перевести Supabase, Railway и Firebase в paused/read-only, где возможно.
- [ ] Отозвать runtime credentials после повторной проверки Yandex.
- [ ] Зафиксировать billing stop и final provider exports.
- [ ] Подготовить отдельный destructive checklist для удаления.
- [ ] Получить явное подтверждение владельца на каждый physical delete.

### Definition of done

- Старые providers не обслуживают production и не создают регулярный bill.
- Backup/restore evidence остаётся доступным.

### Validation

```sh
node scripts/cloud-consolidation/verify-preservation-manifest.mjs \
  ops/migration/cloud-consolidation-preservation.json --mode=decommission
```

### Known risks

- Отзыв credential до проверки редкого consumer может нарушить интеграцию.

### Stop-and-fix rule

- Physical delete не входит в этот milestone без отдельного подтверждения.

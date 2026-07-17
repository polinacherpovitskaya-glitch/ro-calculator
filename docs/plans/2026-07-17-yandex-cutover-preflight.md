# План: воспроизводимый preflight перед миграцией в Yandex

Связанная спека: [`../specs/2026-07-17-yandex-cutover-preflight.md`](../specs/2026-07-17-yandex-cutover-preflight.md)

## Предпосылки и ограничения

- Рабочий `main` остаётся на Supabase до отдельного подтверждённого cutover.
- Текущая колонка `order_items.item_data` — TEXT; безопасный UI-режим до миграции — сохранённые финансовые показатели.
- Self-hosted Supabase, `db.recycleobject.ru`, новые ключи и новый Storage должны существовать и быть проверены до rehearsal; этот PR их не создаёт.
- Не выполнять SQL из этого пакета против production без окна фриза, свежего backup и ручного go/no-go.

## 1. Проверяемый аудит данных

- [x] Добавить read-only аудит `item_data` с пагинацией и безопасным отчётом.
- [x] Считать блокерами пустые, невалидные и double-encoded записи.
- [x] Добавить fixture-smoke для форматов TEXT, JSONB, double-encoded и битого JSON.

Проверка:

```sh
node tests/order-item-data-jsonb-preflight-smoke.mjs
node scripts/audit-order-item-data-jsonb.mjs --out output/order-item-data-preflight.json
```

## 2. SQL-переход и откат

- [x] Добавить транзакционный SQL `TEXT -> JSONB` с предохранителями и backup-таблицей.
- [x] Добавить rollback, восстанавливающий исходный TEXT из backup.
- [x] Проверить контракт SQL smoke-тестом.

Проверка на staging (не production):

```sh
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/2026-07-17-order-items-item-data-jsonb.sql
psql "$TARGET_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/2026-07-17-order-items-item-data-jsonb-rollback.sql
```

## 3. Runbook и репетиция

- [x] Зафиксировать preflight/checklist, критерии остановки и rollback.
- [x] Зафиксировать Storage/Figma validation как обязательные gates, а не обещания.
- [ ] Выполнить rehearsal на новом стенде после его создания.
- [ ] Получить ручное подтверждение go/no-go после результатов rehearsal.

Проверка:

```sh
node tests/order-item-data-jsonb-preflight-smoke.mjs
node tests/order-flow-smoke.js
node tests/supabase-fallback-smoke.js
```

## 4. Релизный пакет

- [x] Обновить общий `plans.md`, `status.md` и `test-plan.md`.
- [x] Поднять app version и cache-bust в соответствии с правилами репозитория.
- [ ] Прогнать локальные проверки, создать PR и дождаться deploy/smoke на `main`.

## Stop-and-fix

- Если аудит показывает хотя бы одну unsafe запись, не запускать SQL: сначала нормализовать запись отдельной миграцией и повторить аудит.
- Если backup, restore, Storage inventory, save/reload или photo flow не подтверждены на новом стенде, фриз не объявляется.
- Если live parity с JSONB отличается хотя бы на одном fixture, не переключать URL и не менять source of truth.

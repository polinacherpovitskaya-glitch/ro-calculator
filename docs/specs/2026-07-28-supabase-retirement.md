# Полный отказ от Supabase на Yandex

## Контекст

Production уже перенесён с Supabase Cloud на Yandex Cloud, но
`db.recycleobject.ru` всё ещё является self-hosted Supabase. На VM `ro-db`
работают:

- `supabase-db`;
- `supabase-rest`;
- `supabase-storage`;
- `supabase-kong`;
- `supabase-auth`;
- `supabase-meta`;
- `supabase-imgproxy`;
- `supabase-studio`.

Данные физически находятся в России, но приложение, timebot, CI и служебные
скрипты продолжают зависеть от Supabase API, ключей и SDK.

Аудит 28 июля 2026 года:

- база PostgreSQL — 124 МБ;
- 364 записи времени, 369 заказов, 1 252 позиции заказов;
- 420 Storage-объектов в четырёх buckets;
- `js/supabase.js` содержит 133 data-функции, 66 remote writers и 39 readers;
- runtime обращается минимум к 26 таблицам;
- в `ops/` уже есть независимые Express API, PostgreSQL migrations и десять
  refresh-скриптов;
- VM имеет 2 vCPU, 3,9 ГБ RAM, около 2,1 ГБ доступной памяти и 28 ГБ свободного
  диска;
- Yandex Cloud потребляет около 1 315 ₽ за 30 дней.

## Решение

Переиспользовать существующий `ops/api` и `ops/db`, но развернуть их на текущей
Yandex VM. Selectel не является частью целевой архитектуры.

```text
calc.recycleobject.ru ─┐
                       ├── api.recycleobject.ru ── Express API
calc2.recycleobject.ru ┘                              │
                                                     ▼
Telegram timebot ─────────────────────────────── PostgreSQL 16
                                                     │
                                                     ▼
                                          Yandex Object Storage
```

Vercel остаётся только рабочим Telegram-relay. Он не хранит данные и не входит
в Supabase migration scope.

## Цели

1. Поднять независимые PostgreSQL и API рядом с работающим Supabase, без
   переключения production.
2. Перенести все таблицы и Storage-объекты с проверяемой parity.
3. Переключить timebot на собственный API.
4. Перевести функции `js/supabase.js` на собственный API небольшими волнами без
   изменения публичных cross-module контрактов.
5. Перевести bootstrap, синхронизации и health checks.
6. Провести production cutover с коротким write freeze и проверенным rollback.
7. После окна наблюдения остановить и удалить все Supabase-контейнеры, ключи и
   runtime-зависимости.

## Не цели

- Не переписывать `js/supabase.js`, `js/calculator.js`, `js/warehouse.js` или
  `js/app.js` целиком.
- Не менять UX калькулятора.
- Не переносить runtime на Selectel.
- Не отключать Vercel Telegram-relay в рамках этой миграции.
- Не удалять исходную базу до завершения parity, backup/restore drill и окна
  наблюдения.

## Миграционная стратегия

### 1. Shadow stack

На той же VM запускаются отдельные `postgres:16-alpine` и `ops-api`. Они
используют отдельный volume и не принимают production-трафик.

### 2. Rehearsal

Существующие refresh-скрипты копируют данные из self-hosted Supabase в новый
PostgreSQL. Для отсутствующих таблиц и полей добавляются migrations и API
routes. Parity сравнивает counts, ключевые ID, timestamps и JSON-поля.

### 3. Клиентские волны

Порядок определяется риском:

1. employees + time_entries + timebot;
2. orders + order_items + warehouse + production;
3. molds + blanks + colors + marketplaces + Storage;
4. settings + auth payloads + finance + work management;
5. CI, bootstrap, FinTablo, Точка и служебные scripts.

Каждая волна сохраняет текущие имена функций в `js/supabase.js`, меняя только
внутренний transport.

### 4. Cutover

После rehearsal вводится короткий write freeze, выполняется финальная дельта и
переключается production API base URL. Supabase остаётся остановленным, но
восстановимым, до конца окна наблюдения.

## Безопасность

- Публичный anon JWT больше не используется как универсальный write key.
- Browser получает cookie/session либо ограниченный application token.
- Timebot использует отдельный server-only bearer token.
- Все write endpoints поддерживают idempotency keys.
- Секреты остаются в VM env и GitHub Secrets.
- API не возвращает service credentials и не логирует чувствительные payloads.

## Данные и Storage

- PostgreSQL мигрируется в отдельный volume с `pg_dump` до каждой destructive
  стадии.
- Storage переносится в Yandex Object Storage.
- Старые `supabase://` и `/storage/v1/` ссылки переписываются только после
  manifest/checksum parity.
- URL rewrite идемпотентен и имеет отдельный rollback manifest.

## Надёжность

- Shadow stack проходит health check, API integration tests и restore drill.
- На этапе cutover включается dual-read/parity для критичных коллекций.
- Контрольная запись создаётся, читается и удаляется через новый API.
- Timebot monitor проверяет процесс, Telegram и собственный API/PostgreSQL.
- Production alert содержит точную упавшую стадию.

## Приёмочные критерии

- Все production данные и Storage прошли parity без расхождений.
- Timebot записывает часы без Supabase SDK/API.
- Оба калькулятора работают через `api.recycleobject.ru`.
- В runtime отсутствуют обращения к `/rest/v1`, `/storage/v1` и
  `SUPABASE_*`.
- CI, FinTablo и Точка используют собственный API.
- Backup и restore нового PostgreSQL проверены.
- После cutover нет новых обращений к Supabase в течение окна наблюдения.
- Все `supabase-*` контейнеры остановлены и затем удалены отдельным
  подтверждённым действием.


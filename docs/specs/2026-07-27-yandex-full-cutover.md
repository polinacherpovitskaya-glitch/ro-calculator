# Полный cutover рабочего контура в Yandex Cloud

**Дата:** 2026-07-27  
**Статус:** approved by owner, implementation in progress

## Цель

Перевести ежедневный рабочий контур Recycle Object на российскую
инфраструктуру без переписывания приложения:

- `calc.recycleobject.ru` и `calc2.recycleobject.ru` раздаются из Yandex Object
  Storage;
- рабочие Postgres-данные и Supabase Storage обслуживает self-hosted Supabase
  на Yandex Compute VM `ro-db`;
- timebot работает на Yandex VM и пишет часы в тот же источник данных;
- зарубежные Supabase и Vercel перестают быть production-зависимостями и
  остаются только как rollback на 14 дней.

## Подтверждённое исходное состояние

- `calc.recycleobject.ru` работает на Vercel и ходит напрямую в
  `jbpmorruwjrxcieqlbmd.supabase.co`.
- `calc2.recycleobject.ru` размещён в Yandex Object Storage, но его API Gateway
  и Cloud Function проксируют запросы в тот же зарубежный Supabase.
- В Yandex уже существует VM `ro-db` (`db.recycleobject.ru`) с self-hosted
  Supabase, но production-клиенты на неё не переключены.
- В приватном Yandex bucket ежедневно сохраняются полные JSON-снимки исходного
  Supabase.
- VM оценивается Yandex Cloud в 3 498,85 ₽ за 30-дневный месяц; с serverless и
  Object Storage ожидаемый рабочий счёт около 3 530 ₽.

## Целевая архитектура

```text
calc.recycleobject.ru ─┐
                       ├─ Yandex Object Storage ── db.recycleobject.ru
calc2.recycleobject.ru ┘                           (Supabase on Yandex VM)
                                                     │
Telegram ── timebot on Yandex VM ────────────────────┘
```

GitHub остаётся хранилищем исходного кода и управляющим CI. Он не хранит
production-базу и не обслуживает пользовательский runtime.

## Объём

### Входит

1. Проверка конфигурации self-hosted Supabase, TLS, CORS и публичных API-paths.
2. Полный перенос схемы, таблиц и Storage-объектов с сохранением путей.
3. Parity-отчёт по таблицам, контрольным строкам и Storage manifest.
4. Ночной `pg_dump` новой базы в приватный Yandex bucket и проверка restore.
5. Переключение URL и anon key во всех runtime-потребителях этого репозитория.
6. Обновление GitHub Actions secrets для сборки и smoke against Yandex.
7. Развёртывание timebot на Yandex VM с persistent state и single-poller
   cutover.
8. Размещение основного `calc.recycleobject.ru` в Yandex Object Storage и
   переключение DNS.
9. Production smokes, реальная контрольная запись и документированный rollback.

### Не входит

- немедленное удаление Supabase/Vercel: они сохраняются 14 дней без production
  трафика;
- переписывание vanilla JS приложения или замена Supabase API собственным API;
- миграция GitHub-репозитория с GitHub;
- перенос отдельного маркетингового сайта `recycleobject.ru` в рамках этого PR.
  Его credentials к общей базе должны быть переключены в том же окне, а
  hosting переносится отдельным repo-scoped изменением.

## Инварианты данных

- До фриза старая база остаётся единственным источником записи.
- Во время финальной синхронизации вводится короткий write freeze.
- Сравниваются counts всех таблиц, последние timestamps и контрольные ID.
- `order_items.item_data` не меняет тип без успешного preflight/rehearsal.
- Старые Storage URL переписываются только после копирования и проверки
  объектов; операция идемпотентна и имеет backup.
- Локальный timebot отключается только после запуска и проверки единственного
  poller на Yandex VM.

## Cutover

1. Сделать свежий dump и Storage manifest.
2. Восстановить/синхронизировать self-hosted Supabase.
3. Проверить новый API через staging credentials.
4. Объявить write freeze, повторить финальную дельту и parity.
5. Переключить конфиги клиентов, CI secrets и timebot.
6. Загрузить release bundle в оба Yandex-hosted домена.
7. Переключить DNS `calc.recycleobject.ru`.
8. Прогнать live, mirror и write-back smoke.
9. Снять freeze и начать 14-дневное наблюдение.

## Rollback

- DNS `calc.recycleobject.ru` возвращается на Vercel.
- Runtime URL/key возвращаются на старый Supabase.
- Yandex-контур не удаляется и сохраняется для расследования.
- Если после cutover были новые записи, перед откатом выполняется их экспорт,
  чтобы не потерять дельту.

## Go/no-go

Cutover запрещён, пока не выполнены все условия:

- Yandex billing account имеет положительный запас средств.
- Есть подтверждённый административный SSH-доступ к VM.
- Новый Supabase health green, а production API-paths доступны по TLS.
- Table parity и Storage manifest не имеют расхождений.
- Проверен ночной backup и тестовый restore.
- Новый timebot отвечает на `getMe` и не конфликтует с локальным poller.
- Подготовлен точный rollback для DNS, URL/key и бота.


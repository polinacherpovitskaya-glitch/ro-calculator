# План: полный cutover в Yandex Cloud

Связанная спека:
[`../specs/2026-07-27-yandex-full-cutover.md`](../specs/2026-07-27-yandex-full-cutover.md)

## 1. Доступ и baseline

- [x] Пополнить Yandex billing account и зафиксировать положительный баланс.
- [x] Добавить отдельный migration SSH key на `ro-db`.
- [x] Проверить контейнеры, версии, диски, firewall, TLS и Caddy/Kong.
- [x] Снять baseline старого Supabase: counts, timestamps, JSONB preflight,
      Storage manifest.
- [x] Снять baseline нового Supabase и сохранить parity report без содержимого
      чувствительных строк.

## 2. Бэкап и восстановление

- [x] Сделать свежий source dump и проверить checksum.
- [x] Восстановить схему/данные в Yandex Supabase.
- [x] Скопировать все Storage buckets с сохранением object keys.
- [x] Проверить count/size/checksum Storage manifest.
- [x] Настроить nightly `pg_dump` в приватный Yandex bucket.
- [x] Выполнить пробный restore в отдельную временную базу.

## 3. Runtime-конфигурация

- [x] Перевести `js/supabase.js` на `https://db.recycleobject.ru`.
- [x] Убрать runtime-зависимость `calc2` от proxy к зарубежному Supabase.
- [x] Перевести bootstrap/build/scripts на env-based Yandex URL/key.
- [x] Обновить CI secrets без публикации ключей в Git или логи.
- [x] Обновить отдельные потребители в этом репозитории: FinTablo, Точка,
      finance backfill.
- [ ] Обновить внешние потребители: floor publisher,
      маркетинговый сайт и Figma plugin checklist.

## 4. Timebot

- [x] Развернуть persistent timebot на Yandex VM.
- [x] Проверить employees binding и Telegram `getMe`.
- [ ] Проверить тестовую запись часов через реальный диалог сотрудника.
- [x] Остановить локальный LaunchAgent только перед запуском production poller.
- [x] Проверить отсутствие Telegram 409.
- [ ] Проверить появление новой реальной записи в timetrack.

## 5. Frontend и DNS

- [x] Создать/настроить Yandex bucket для `calc.recycleobject.ru`.
- [x] Настроить website hosting.
- [ ] Настроить и проверить HTTPS certificate после DNS cutover.
- [ ] Загрузить тот же release bundle в `calc` и `calc2`.
- [ ] Переключить DNS `calc.recycleobject.ru` с Vercel на Yandex.
- [ ] Проверить version, cache headers, assets и hash routes.

## 6. Проверка и release

- [x] Поднять app version относительно свежего `origin/main`.
- [x] Прогнать `node tests/version-smoke.js`.
- [x] Прогнать Supabase/data/order/timebot smokes.
- [ ] Выполнить live browser smoke на обоих доменах.
- [x] Выполнить контрольную запись и чтение из Yandex DB.
- [x] Зафиксировать rollback values и начало 14-дневного окна.
- [ ] Создать PR и дождаться зелёных deploy/smoke workflows.

## 7. После cutover

- [ ] 14 дней проверять health, backups, ошибки и старый Supabase access log.
- [ ] При отсутствии старого трафика отключить Supabase Pro.
- [ ] Удалить production alias/deploy dependency Vercel.
- [ ] Удаление старых проектов выполнять отдельным подтверждённым действием.

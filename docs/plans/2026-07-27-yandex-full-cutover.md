# План: полный cutover в Yandex Cloud

Связанная спека:
[`../specs/2026-07-27-yandex-full-cutover.md`](../specs/2026-07-27-yandex-full-cutover.md)

## 1. Доступ и baseline

- [ ] Пополнить Yandex billing account и зафиксировать положительный баланс.
- [ ] Добавить отдельный migration SSH key на `ro-db`.
- [ ] Проверить контейнеры, версии, диски, firewall, TLS и Caddy/Kong.
- [ ] Снять baseline старого Supabase: counts, timestamps, JSONB preflight,
      Storage manifest.
- [ ] Снять baseline нового Supabase и сохранить parity report без содержимого
      чувствительных строк.

## 2. Бэкап и восстановление

- [ ] Сделать свежий source dump и проверить checksum.
- [ ] Восстановить схему/данные в Yandex Supabase.
- [ ] Скопировать все Storage buckets с сохранением object keys.
- [ ] Проверить count/size/checksum Storage manifest.
- [ ] Настроить nightly `pg_dump` в приватный Yandex bucket.
- [ ] Выполнить пробный restore в отдельную временную базу.

## 3. Runtime-конфигурация

- [ ] Перевести `js/supabase.js` на `https://db.recycleobject.ru`.
- [ ] Убрать runtime-зависимость `calc2` от proxy к зарубежному Supabase.
- [ ] Перевести bootstrap/build/scripts на env-based Yandex URL/key.
- [ ] Обновить CI secrets без публикации ключей в Git или логи.
- [ ] Обновить отдельные потребители: FinTablo, Точка, floor publisher,
      маркетинговый сайт и Figma plugin checklist.

## 4. Timebot

- [ ] Развернуть persistent timebot на Yandex VM.
- [ ] Проверить employees binding, Telegram `getMe` и тестовую запись часов.
- [ ] Остановить локальный LaunchAgent только перед запуском production poller.
- [ ] Проверить отсутствие Telegram 409 и появление записи в timetrack.

## 5. Frontend и DNS

- [ ] Создать/настроить Yandex bucket для `calc.recycleobject.ru`.
- [ ] Настроить HTTPS certificate и website hosting.
- [ ] Загрузить тот же release bundle в `calc` и `calc2`.
- [ ] Переключить DNS `calc.recycleobject.ru` с Vercel на Yandex.
- [ ] Проверить version, cache headers, assets и hash routes.

## 6. Проверка и release

- [ ] Поднять app version относительно свежего `origin/main`.
- [ ] Прогнать `node tests/version-smoke.js`.
- [ ] Прогнать Supabase/data/order/timebot smokes.
- [ ] Выполнить live browser smoke на обоих доменах.
- [ ] Выполнить контрольную запись и чтение из Yandex DB.
- [ ] Зафиксировать rollback values и начало 14-дневного окна.
- [ ] Создать PR и дождаться зелёных deploy/smoke workflows.

## 7. После cutover

- [ ] 14 дней проверять health, backups, ошибки и старый Supabase access log.
- [ ] При отсутствии старого трафика отключить Supabase Pro.
- [ ] Удалить production alias/deploy dependency Vercel.
- [ ] Удаление старых проектов выполнять отдельным подтверждённым действием.


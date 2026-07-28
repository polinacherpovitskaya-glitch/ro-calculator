# План: Yandex Telegram relay без Vercel

Связанный spec:
[`docs/specs/2026-07-28-yandex-telegram-relay-egress.md`](../specs/2026-07-28-yandex-telegram-relay-egress.md)

## Milestone 1 — Аудит и сетевой клиент

- [x] Проверить фактическое потребление Yandex Cloud.
- [x] Подтвердить существование неиспользуемых Function и API Gateway.
- [x] Поднять логи предыдущего `fetch failed`.
- [ ] Заменить upstream `fetch` на тестируемый IPv4 HTTPS-клиент.
- [ ] Добавить безопасную диагностику сетевых ошибок.
- [ ] Расширить unit-тесты relay.

## Milestone 2 — Canary

- [ ] Добавить отдельный canary workflow без изменения timebot.
- [ ] Проверить стандартный serverless egress.
- [ ] При необходимости проверить функцию в сети `default`.
- [ ] Получить успешный production `getMe`.

## Milestone 3 — Cutover

- [ ] Переключить `yandex-timebot-deploy.yml` на Yandex Gateway.
- [ ] Проверить `getMe` до перезапуска timebot.
- [ ] Перезапустить timebot с существующим persistent volume.
- [ ] Проверить heartbeat, Telegram relay и Yandex DB.
- [ ] Проверить отсутствие conflict 409.
- [ ] Выполнить контрольную запись часов.

## Milestone 4 — Release и выключение Vercel

- [ ] Взять следующую версию от свежего `origin/main`.
- [ ] Обновить четыре version anchor и нужные cache-bust suffix.
- [ ] Прогнать обязательные тесты.
- [ ] Открыть PR, дождаться зелёных checks и merge.
- [ ] Наблюдать Yandex relay без повторяющихся timeout.
- [ ] Удалить Vercel relay и runtime secret.
- [ ] Зафиксировать итоговый месячный расход Yandex.


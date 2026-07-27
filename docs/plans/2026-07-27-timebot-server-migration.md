# План: перенос timebot на постоянный сервер

Связанный spec:
[`docs/specs/2026-07-27-timebot-server-migration.md`](../specs/2026-07-27-timebot-server-migration.md)

## Milestone 1 — Telegram relay

- [ ] Добавить `yandex/telegram-relay/index.js`.
- [ ] Ограничить upstream только Telegram Bot API.
- [ ] Защитить relay секретным path prefix.
- [ ] Добавить unit-тесты relay.
- [ ] Добавить workflow деплоя функции и API Gateway.

## Milestone 2 — Bot runtime

- [ ] Добавить поддержку `TELEGRAM_BASE_API_URL`.
- [ ] Сделать polling timeout настраиваемым.
- [ ] Вынести runtime-файлы timebot в `TIMEBOT_STATE_DIR`.
- [ ] Увеличить TTL незавершённого отчёта до 24 часов.
- [ ] Добавить unit-тесты runtime-конфигурации и state directory.

## Milestone 3 — Docker и секреты

- [ ] Добавить отдельный compose service/profile `timebot`.
- [ ] Подключить постоянный volume `timebot-state`.
- [ ] Обеспечить права записи пользователя `node` в `/app/state`.
- [ ] Исключить `.env.timebot` из rsync cleanup.
- [ ] Автоматизировать безопасную доставку server-only env на VPS.

## Milestone 4 — Проверки и release

- [ ] Прогнать `ops/bot` test suite.
- [ ] Прогнать relay tests и syntax check.
- [ ] Прогнать релевантные app smoke tests.
- [ ] Взять следующий app version от свежего `origin/main`.
- [ ] Обновить четыре version anchor и проверить `version-smoke`.
- [ ] Проверить diff на отсутствие секретов.

## Milestone 5 — Cutover

- [ ] Отправить ветку и открыть draft PR.
- [ ] Дождаться зелёных PR checks.
- [ ] Merge в `main`.
- [ ] Отключить локальный `com.recycleobject.timebot.v2`.
- [ ] Дождаться Yandex relay deploy и server timebot start.
- [ ] Проверить `getMe`, container state и отсутствие conflict 409.
- [ ] Проверить `/status` и реальную запись времени.
- [ ] Убедиться, что запись видна в `calc2/#timetrack`.

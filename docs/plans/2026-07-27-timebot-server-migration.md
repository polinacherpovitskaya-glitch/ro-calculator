# План: перенос timebot на постоянный сервер

Связанный spec:
[`docs/specs/2026-07-27-timebot-server-migration.md`](../specs/2026-07-27-timebot-server-migration.md)

## Milestone 1 — Telegram relay

- [x] Добавить `yandex/telegram-relay/index.js`.
- [x] Ограничить upstream только Telegram Bot API.
- [x] Защитить relay секретным path prefix.
- [x] Добавить unit-тесты relay.
- [x] Добавить workflow деплоя функции и API Gateway.

## Milestone 2 — Bot runtime

- [x] Добавить поддержку `TELEGRAM_BASE_API_URL`.
- [x] Сделать polling timeout настраиваемым.
- [x] Вынести runtime-файлы timebot в `TIMEBOT_STATE_DIR`.
- [x] Увеличить TTL незавершённого отчёта до 24 часов.
- [x] Добавить unit-тесты runtime-конфигурации и state directory.

## Milestone 3 — Docker и секреты

- [x] Добавить отдельный compose service/profile `timebot`.
- [x] Подключить постоянный volume `timebot-state`.
- [x] Обеспечить права записи пользователя `node` в `/app/state`.
- [x] Исключить `.env.timebot` из rsync cleanup.
- [x] Автоматизировать безопасную доставку server-only env на VPS.

## Milestone 4 — Проверки и release

- [x] Прогнать `ops/bot` test suite.
- [x] Прогнать relay tests и syntax check.
- [x] Прогнать релевантные app smoke tests.
- [x] Взять следующий app version от свежего `origin/main`.
- [x] Обновить четыре version anchor и проверить `version-smoke`.
- [x] Проверить diff на отсутствие секретов.

## Milestone 5 — Cutover

- [x] Отправить ветку и открыть draft PR.
- [x] Дождаться зелёных PR checks.
- [x] Merge в `main`.
- [x] Выполнить production-проверку Yandex relay — получен upstream HTTP 502.
- [x] Снова включить локальный `com.recycleobject.timebot.v2` после rollback.
- [ ] Выполнить cutover по follow-up плану
  [`2026-07-27-timebot-vercel-relay.md`](2026-07-27-timebot-vercel-relay.md).
- [ ] Проверить `getMe`, container state и отсутствие conflict 409.
- [ ] Проверить `/status` и реальную запись времени.
- [ ] Убедиться, что запись видна в `calc2/#timetrack`.

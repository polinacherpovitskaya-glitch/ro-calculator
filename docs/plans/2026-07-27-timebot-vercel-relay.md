# План: Vercel relay для серверного timebot

Связанный spec:
[`docs/specs/2026-07-27-timebot-vercel-relay.md`](../specs/2026-07-27-timebot-vercel-relay.md)

## Milestone 1 — Relay adapter

- [x] Добавить Vercel Function adapter поверх общего relay handler.
- [x] Добавить wildcard rewrite и 45-секундный max duration.
- [x] Покрыть adapter unit-тестами.
- [x] Сохранить фиксированный Telegram upstream и проверку секретного prefix.

## Milestone 2 — Deploy orchestration

- [x] Передать relay secret в production Vercel deploy как runtime env.
- [x] Заменить Yandex relay deploy на ожидание production Vercel `getMe`.
- [x] Добавить relay-файлы в path filters Ops workflow.
- [x] Сохранить безопасную доставку `.env.timebot` на VPS.

## Milestone 3 — Проверки и release

- [x] Обновить migration smoke под Vercel architecture.
- [x] Прогнать relay, bot runtime и server migration tests.
- [x] Прогнать workflow YAML parse и version smoke.
- [x] Взять следующий app version от свежего `origin/main`.
- [x] Обновить четыре version anchor и cache-bust `js/app.js`.
- [x] Проверить diff на отсутствие секретов.

## Milestone 4 — Cutover

- [x] Отправить ветку и открыть draft PR.
- [x] Дождаться зелёных PR checks.
- [ ] Merge в `main`.
- [ ] Дождаться production Vercel relay и успешного `getMe`.
- [ ] Отключить локальный `com.recycleobject.timebot.v2`.
- [ ] Дождаться запуска `ops-timebot`.
- [ ] Проверить container state, polling и отсутствие conflict 409.
- [ ] Проверить `/status` и тестовую запись времени.
- [ ] Убедиться, что запись видна в `calc2/#timetrack`.

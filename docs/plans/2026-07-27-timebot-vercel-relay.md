# План: Vercel relay для серверного timebot

Связанный spec:
[`docs/specs/2026-07-27-timebot-vercel-relay.md`](../specs/2026-07-27-timebot-vercel-relay.md)

## Milestone 1 — Relay adapter

- [ ] Добавить Vercel Function adapter поверх общего relay handler.
- [ ] Добавить wildcard rewrite и 45-секундный max duration.
- [ ] Покрыть adapter unit-тестами.
- [ ] Сохранить фиксированный Telegram upstream и проверку секретного prefix.

## Milestone 2 — Deploy orchestration

- [ ] Передать relay secret в production Vercel deploy как runtime env.
- [ ] Заменить Yandex relay deploy на ожидание production Vercel `getMe`.
- [ ] Добавить relay-файлы в path filters Ops workflow.
- [ ] Сохранить безопасную доставку `.env.timebot` на VPS.

## Milestone 3 — Проверки и release

- [ ] Обновить migration smoke под Vercel architecture.
- [ ] Прогнать relay, bot runtime и server migration tests.
- [ ] Прогнать workflow YAML parse и version smoke.
- [ ] Взять следующий app version от свежего `origin/main`.
- [ ] Обновить четыре version anchor и cache-bust `js/app.js`.
- [ ] Проверить diff на отсутствие секретов.

## Milestone 4 — Cutover

- [ ] Отправить ветку и открыть draft PR.
- [ ] Дождаться зелёных PR checks.
- [ ] Merge в `main`.
- [ ] Дождаться production Vercel relay и успешного `getMe`.
- [ ] Отключить локальный `com.recycleobject.timebot.v2`.
- [ ] Дождаться запуска `ops-timebot`.
- [ ] Проверить container state, polling и отсутствие conflict 409.
- [ ] Проверить `/status` и тестовую запись времени.
- [ ] Убедиться, что запись видна в `calc2/#timetrack`.

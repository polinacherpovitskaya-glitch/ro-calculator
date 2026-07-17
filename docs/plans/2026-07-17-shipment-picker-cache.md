# План: быстрый picker в приёмке склада

Связанная спека: [`../specs/2026-07-17-shipment-picker-cache.md`](../specs/2026-07-17-shipment-picker-cache.md)

## M1. Cached путь `[x]`

- [x] Добавить необязательный cached режим picker без сетевой задержки.
- [x] Включить его только для первичного рендера приёмки.
- [x] Покрыть кейс уже загруженных позиций и недоступной сети.

**Проверка:** `node tests/warehouse-migration-smoke.js` и `node tests/version-smoke.js`.

## M2. Выпуск `[ ]`

- [ ] Поднять версию и cache-bust `warehouse.js`.
- [ ] Проверить статические тесты и оба production mirror smoke.

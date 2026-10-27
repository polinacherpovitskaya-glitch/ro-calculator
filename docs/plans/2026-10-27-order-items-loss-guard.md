# План: защита позиций заказа + быстрый сервер

Спека: `docs/specs/2026-10-27-order-items-loss-guard.md`

- [x] 1. API: `order-save` удаляет только `knownItemIds` (unit-тест сначала)
- [x] 2. Клиент: `saveOrder` передаёт `knownItemIds`, fallback query-builder удаляет только их
- [x] 3. Клиент: `loadOrder` возвращает `source`, fallback без `_rewriteOrderItems`
- [x] 4. Калькулятор: блок сохранения во время загрузки и для устаревшей копии; `knownItemIds` после полной загрузки; в черновике
- [x] 5. API: SQL-предфильтр в `readCompatRows`, узкое чтение в `order-save`
- [x] 6. Бамп версии, все смоуки, PR

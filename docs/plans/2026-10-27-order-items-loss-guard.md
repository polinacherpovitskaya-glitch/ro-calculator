# План: защита позиций заказа + быстрый сервер

Спека: `docs/specs/2026-10-27-order-items-loss-guard.md`

- [ ] 1. API: `order-save` удаляет только `knownItemIds` (unit-тест сначала)
- [ ] 2. Клиент: `saveOrder` передаёт `knownItemIds`, fallback query-builder удаляет только их
- [ ] 3. Клиент: `loadOrder` возвращает `source`, fallback без `_rewriteOrderItems`
- [ ] 4. Калькулятор: блок сохранения во время загрузки и для устаревшей копии; `knownItemIds` после полной загрузки; в черновике
- [ ] 5. API: SQL-предфильтр в `readCompatRows`, узкое чтение в `order-save`
- [ ] 6. Бамп версии, все смоуки, PR

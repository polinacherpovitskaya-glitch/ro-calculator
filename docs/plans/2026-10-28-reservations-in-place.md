# План: резервы фурнитуры на месте

Спека: `docs/specs/2026-10-28-reservations-in-place.md`

- [ ] 1. Смоук `tests/warehouse-reservations-churn-smoke.js`: дважды сохранить тот же заказ и
  дважды открыть склад через настоящие `loadWarehouseReservations/saveWarehouseReservations`
  и серверное слияние — список не растёт, второй проход не шлёт патч (сначала падает)
- [ ] 2. `warehouse.js`: общий помощник «привести резервы пары к нужному количеству на месте»;
  `syncProjectHardwareOrderState` и `reconcileProjectHardwareReservations` считают
  распределение как раньше, но применяют его через помощник; уникальные `id` новых резервов
- [ ] 3. Скрипт сжатия `scripts/migrations/2026-10-28-warehouse-reservations-compact.sh`
  (бэкап → dry run → `--apply`), не запускать без OK
- [ ] 4. Бамп версии, `?v=` у `warehouse.js`, смоуки, PR

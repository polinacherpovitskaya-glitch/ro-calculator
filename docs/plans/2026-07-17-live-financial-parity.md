# План: паритет живого финансового расчёта

Связанная спека: [`../specs/2026-07-17-live-financial-parity.md`](../specs/2026-07-17-live-financial-parity.md)

## 1. Fail-safe старой схемы

- [x] Воспроизвести неполный TEXT summary-path тестом.
- [x] Запретить живой пересчёт без полного покрытия `item_type`.
- [x] Сохранить snapshot fallback только для действительно полного массива.
- [x] Проверить, что stored revenue/margin/hours не заменяются частичным расчётом.

Проверка: `node tests/order-flow-smoke.js`

## 2. Полный лёгкий snapshot для JSONB

- [x] Добавить `calculator_data` в список заказов и tolerant JSON hydration.
- [x] Дополнить order-item summary всеми входами движка.
- [x] Не выбирать тяжёлые фото/base64-поля.
- [x] Проверить PostgREST select contract тестом.

Проверка: `node tests/supabase-fallback-smoke.js`

## 3. Паритет формул

- [x] Сравнить card/full и list/summary для скидки.
- [x] Сравнить несколько цветов и `setup_hours_override`.
- [x] Сравнить legacy-печать, hardware и packaging.
- [x] Сравнить подвес с элементами и несколькими вложениями.

Production read-only audit: 336 заказов / 1 224 позиции, расхождений full vs summary — 0.

Проверка: `node tests/order-flow-smoke.js`

## 4. Релизный пакет

- [x] Поднять app version во всех четырёх anchors.
- [x] Поднять cache-bust изменённых runtime-скриптов.
- [x] Прогнать syntax + релевантные smokes.
- [x] Зафиксировать, что миграция БД остаётся отдельным следующим sub-project.

Проверки:

```bash
node --check js/orders.js
node --check js/supabase.js
node tests/version-smoke.js
node tests/order-flow-smoke.js
node tests/supabase-fallback-smoke.js
node tests/molds-smoke.js
node tests/warehouse-migration-smoke.js
```

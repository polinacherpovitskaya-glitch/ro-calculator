# План: паритет живого финансового расчёта

Связанная спека: [`../specs/2026-07-17-live-financial-parity.md`](../specs/2026-07-17-live-financial-parity.md)

## 1. Fail-safe старой схемы

- [ ] Воспроизвести неполный TEXT summary-path тестом.
- [ ] Запретить живой пересчёт без полного покрытия `item_type`.
- [ ] Сохранить snapshot fallback только для действительно полного массива.
- [ ] Проверить, что stored revenue/margin/hours не заменяются частичным расчётом.

Проверка: `node tests/order-flow-smoke.js`

## 2. Полный лёгкий snapshot для JSONB

- [ ] Добавить `calculator_data` в список заказов и tolerant JSON hydration.
- [ ] Дополнить order-item summary всеми входами движка.
- [ ] Не выбирать тяжёлые фото/base64-поля.
- [ ] Проверить PostgREST select contract тестом.

Проверка: `node tests/supabase-fallback-smoke.js`

## 3. Паритет формул

- [ ] Сравнить card/full и list/summary для скидки.
- [ ] Сравнить несколько цветов и `setup_hours_override`.
- [ ] Сравнить legacy-печать, hardware и packaging.
- [ ] Сравнить подвес с элементами и несколькими вложениями.

Проверка: `node tests/order-flow-smoke.js`

## 4. Релизный пакет

- [ ] Поднять app version во всех четырёх anchors.
- [ ] Поднять cache-bust `orders.js` и `supabase.js`.
- [ ] Прогнать syntax + релевантные smokes.
- [ ] Зафиксировать, что миграция БД остаётся отдельным следующим sub-project.

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


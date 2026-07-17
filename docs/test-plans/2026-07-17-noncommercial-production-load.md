# Test plan: некоммерческие работы и физическая загрузка

## Source

- Task: выделить переделку брака и сток-образцы как некоммерческие работы.
- Plan: `docs/plans/2026-07-17-noncommercial-production-load.md`.
- Status: `docs/status/2026-07-17-noncommercial-production-load.md`.
- Repo context: vanilla JS calculator, Supabase order snapshots, оба production mirrors.

## Validation scope

- In scope: сохранение типа работ, нулевая выручка/потери, доска, карточка,
  квартальная плашка и fallback старых записей.
- Out of scope: новая схема Supabase, финансовые проводки, пересчёт цен.

## Fixtures

- `commercial`: 20 ч, 100 000 ₽ выручки.
- `rework`: 3,04 ч, 14 604,50 ₽ затрат, 0 ₽ выручки.
- `stock_sample`: 29 ч, 0 ₽ выручки.
- `sample` без `production_purpose`: коммерческий legacy-заказ.

## Test levels

### Unit

- Нормализация `production_purpose` и переход `commercial ↔ rework`.
- Сводка: `salesGap` не меняется от некоммерческих часов; `freeCapacity`
  уменьшается.
- Нулевая/невалидная дата и отменённая работа не учитываются.

### Integration

- Save/load переносит поле через `calculator_data` в list select.
- Карточка и доска показывают одинаковую сумму потерь.

### End-to-end / smoke

- Создать переделку, сохранить, открыть список и увидеть тип, потери и часы.
- После reload физическая занятость включает переделку и сток, но «продать
  ещё» остаётся по коммерческим часам.

## Acceptance gates

- [x] `node tests/order-flow-smoke.js`
- [x] `node test/production_load.test.js`
- [x] `node tests/supabase-fallback-smoke.js`
- [x] `node tests/version-smoke.js` (после version bump повторить)
- [x] `node --check js/app.js && node --check js/orders.js && node --check js/production_load.js`
- [ ] deployment smoke обоих доменов.

## Open risks

- Нельзя автоматически считать любой заказ с 0 ₽ стоком или переделкой:
  среди таких записей есть черновики и отменённые сделки.
- Не следует включать ту же сумму расходов в фиксированные косвенные без
  отдельного правила периода — это даст двойной учёт.

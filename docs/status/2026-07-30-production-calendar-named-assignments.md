# Status — Именные назначения в производственном календаре

## Snapshot

- Current phase: M1 — unique order visual identity
- Plan file: `docs/plans/2026-07-30-production-calendar-named-assignments.md`
- Spec file: `docs/specs/2026-07-30-production-calendar-named-assignments.md`
- Status: green — execution started
- Last updated: 2026-07-30

## Done

- Разобран production screenshot `v431`.
- Подтверждена причина повторов: восемь цветов выбираются по hash modulo.
- Подтверждено наличие `employees` с `role`, `is_active` и `daily_hours`.
- Подтверждено наличие employee-linked `time_entries`.
- Подтверждено наличие `production_quantity` в production model.
- Выбрана IA: компактная очередь сверху + подробная выдвижная панель.
- Зафиксирован гибрид назначений: авто по умолчанию, конкретные имена вручную.
- Отделена волна именного плана от вечернего ввода факта.

## In progress

- M1: unique color slots and queue-wide visual map.

## Next

- M1: уникальная визуальная идентичность заказов.

## Decisions made

- Очередь располагается сверху: она задаёт причину расписания и не должна
  постоянно отнимать ширину.
- Имена берутся из существующих active production employees; ничего не
  хардкодится как «я / жена / мальчик 1 / мальчик 2».
- Ручное назначение жёсткое; автоматическое можно пересчитывать.
- Плановые штуки показываются только при надёжных исходных данных.
- Закрытие смены станет отдельным зависимым под-проектом.

## Assumptions in force

- В production-справочнике есть четыре актуальных сотрудника либо начальник
  сможет выбрать текущий состав.
- `production_quantity` пригоден для однородных заказов.
- Расширение `production_plan_state_json` допустимо без миграции.

## Commands

```sh
node tests/production-calendar-smoke.js
node tests/employee-auth-payroll-smoke.js
node tests/order-flow-smoke.js
node tests/version-smoke.js
```

## Current blockers

- None.

## Audit log

| Date | Milestone | Files | Commands | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 2026-07-30 | Design | spec, plan, status, test plan | repo and screenshot inspection | pass | M1 |

## Smoke / demo checklist

- [ ] 12+ заказов имеют уникальные акценты.
- [ ] Очередь редактируется сверху без потери ширины календаря.
- [ ] Четыре линии подписаны реальными именами.
- [ ] Два выбранных человека связаны с одним заказом.
- [ ] Остальные люди получают следующие заказы.
- [ ] На сегодня видны часы и безопасные плановые штуки.
- [ ] Reload сохраняет состав и ручные назначения.

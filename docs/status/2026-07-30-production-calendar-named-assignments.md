# Status — Именные назначения в производственном календаре

## Snapshot

- Current phase: M5 complete — ready for handoff
- Plan file: `docs/plans/2026-07-30-production-calendar-named-assignments.md`
- Spec file: `docs/specs/2026-07-30-production-calendar-named-assignments.md`
- Status: green — implementation and validation complete
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
- Добавлена компактная перетаскиваемая очередь над календарём и подробная
  выдвижная панель без постоянной потери ширины.
- Все видимые заказы получают стабильные уникальные акценты.
- Линии календаря связаны с выбранными активными сотрудниками из «Часов».
- Ручное назначение жёстко закрепляет заказ за конкретными людьми.
- На линии видны сегодняшний заказ, этап, часы и безопасная плановая норма.
- Версия поднята с `v431` до `v432`.
- Desktop, mobile, week/month и drawer проверены в headed browser на fixture из
  12 заказов.

## In progress

- None.

## Next

- Ручная проверка на реальных данных после публикации.
- Отдельная волна B: вечернее закрытие смены и фактические штуки.

## Decisions made

- Очередь располагается сверху: она задаёт причину расписания и не должна
  постоянно отнимать ширину.
- Имена берутся из существующих active employees в «Часах»; production идёт
  первым, но management тоже доступен для производственной смены.
- Ручное назначение жёсткое; автоматическое можно пересчитывать.
- Плановые штуки показываются только при надёжных исходных данных.
- Закрытие смены станет отдельным зависимым под-проектом.

## Assumptions in force

- В справочнике «Часы» есть четыре актуальных сотрудника либо начальник
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
| 2026-07-30 | M1–M4 | calculator, production-core, gantt, CSS, HTML | production calendar smoke | pass | M5 |
| 2026-07-30 | Browser | desktop/mobile, week/month, drawer | headed Playwright fixture | pass | version |
| 2026-07-30 | M5 | v432 anchors and regression suite | syntax + focused smokes | pass | handoff |

## Smoke / demo checklist

- [x] 12+ заказов имеют уникальные акценты.
- [x] Очередь редактируется сверху без потери ширины календаря.
- [x] Четыре линии подписаны реальными именами.
- [x] Два выбранных человека связаны с одним заказом.
- [x] Остальные люди получают следующие заказы.
- [x] На сегодня видны часы и безопасные плановые штуки.
- [x] Reload сохраняет состав и ручные назначения.

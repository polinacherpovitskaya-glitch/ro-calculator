# Production Calendar Status

## Snapshot
- Current phase: C3 planning capacity separated from pricing, China waiting layer next
- Plan file: `/private/tmp/ro-codex-push-sync.v100/docs/production-calendar-plan.md`
- Status: yellow
- Last updated: 2026-03-17

## Goal
- Превратить текущие `План производства + Календарь` в один рабочий `Производственный календарь`, который отражает реальные стадии, блокеры и мощности цеха.

## Confirmed Findings
- В продукте уже были две конкурирующие production pages:
  - `/private/tmp/ro-codex-push-sync.v100/js/production_plan.js` — список с приоритетами;
  - `/private/tmp/ro-codex-push-sync.v100/js/gantt.js` — авто-Gantt.
- Текущий scheduler по-прежнему остается упрощенным:
  - стартует заказы от `today`;
  - использует модель `molding -> assembly -> packaging`;
  - еще не знает `trim`, mold blockers, China dependencies и реальную мощность.
- `buildProductionSchedule()` использовал только status/deadline сортировку и не видел ручной очереди начальника производства.
- `production_holidays` уже есть в settings, но scheduling engine их пока не учитывает.
- Заказы, которые ждут mold/China receipt, все еще не могут быть честно показаны как blocked; они пока просто попадают в общую schedulable очередь.

## Decisions
- Каноническим экраном становится один `Производственный календарь`.
- Старый `План производства` не остается отдельной truth-page; его очередь/приоритет переезжает в верхний блок канонического экрана.
- Старый `Календарь` route становится базой нового экрана.
- В календаре остаются только `Неделя` и `Месяц`.
- В первом usable slice порядок можно менять кнопками `вверх/вниз`; полноценный drag остается следующим этапом.
- Ручной приоритет очереди хранится через существующий `production plan state`, чтобы не потерять уже знакомую механику.

## Assumptions
- Первая волна живет без новой таблицы и использует существующий `production plan state` для приоритета.
- Для части blocked-кейсов понадобится manual override в следующем этапе, потому что старые заказы не всегда имеют полную data-linkage.
- MVP может использовать упрощенные overlap rules, если они честные и понятные начальнику производства.

## Done
- Прочитан и зафиксирован текущий production perimeter:
  - `/private/tmp/ro-codex-push-sync.v100/js/gantt.js`
  - `/private/tmp/ro-codex-push-sync.v100/js/production_plan.js`
  - `/private/tmp/ro-codex-push-sync.v100/js/calculator.js`
  - `/private/tmp/ro-codex-push-sync.v100/index.html`
- Подтверждено, что текущая модель не покрывает реальные ограничения по mold-ам и внешним blockers.
- Зафиксирован отдельный execution track под production calendar redesign.
- Реализован первый usable slice `v105`:
  - в sidebar остался один entry point `Производственный календарь`;
  - route aliases `production-plan` / `calendar` сводятся в `gantt`;
  - `Неделя` и `Месяц` стали единственными режимами;
  - календарь и capacity chart стали крупнее и читабельнее;
  - над timeline появился блок `Очередь к запуску`;
  - порядок заказов теперь можно менять кнопками `вверх/вниз` прямо в очереди;
  - ручной приоритет очереди влияет на `buildProductionSchedule()`.
- Реализован второй usable slice `v106`:
  - scheduler теперь исключает не только выходные, но и `production_holidays` из настроек;
  - schedule dates больше не строятся через `toISOString()`, поэтому локальная дата не съезжает в браузерах с положительным UTC offset;
  - заголовок календаря визуально помечает праздничные дни так же, как другие non-working days.
- Реализован третий usable slice `v107`:
  - календарь теперь читает `order_items` и выводит отдельный блок `Ждут молд / пока не планируются`;
  - заказ с кастомной позицией без `base_mold_in_stock` не попадает в active timeline и не создает ложную загрузку;
  - порядок очереди можно заранее менять даже для blocked-заказов, чтобы они встали на нужное место после разблокировки;
  - summary и stats теперь явно показывают, сколько заказов готово к плану и сколько еще ждут молд.
- Реализован четвертый usable slice `v108`:
  - planning capacity теперь живет отдельно от pricing settings;
  - scheduler берет `planning_workers_count × planning_hours_per_day`, а не `workers_count` из калькулятора;
  - если planning settings еще не трогали, календарь использует консервативный baseline `2 сотрудника × 8ч`, а не pricing `3.5`;
  - в `Настройки -> Производство` появились отдельные поля для реальной мощности календаря.
- Добавлен и подключен новый regression smoke:
  - `/private/tmp/ro-codex-push-sync.v100/tests/production-calendar-smoke.js`
  - `.github/workflows/deploy-pages.yml`
- `production-calendar-smoke` расширен и теперь исполняет `buildProductionSchedule()` в vm:
  - проверяет, что holidays реально исключаются из расписания;
  - страхует от регресса со сдвигом local date.
- `production-calendar-smoke` расширен еще раз:
  - проверяет, что `Gantt` подтягивает `order_items` для readiness;
  - исполняемо страхует правило `custom mold without stock => blocked`.
- `production-calendar-smoke` теперь также проверяет:
  - наличие planning capacity fields в settings UI;
  - использование `planning_workers_count` в scheduler.

## In Progress
- C4: China waiting + needs-review readiness layer.

## Next
- C4: ввести `blocked / needs review / ready-to-plan` слой для China waiting кейсов.
- C5: добавить честный reorder/drag state и persist уже внутри канонического calendar model, без зависимости от legacy screen.
- C6: подключить factual overlay месяца из `TimeTrack` в сам production calendar.

## Risks
- Пока не разведен pricing capacity и planning capacity, календарь все еще может красиво врать по доступным часам.
- Пока не добавлен blocker model, sample/China/mold orders будут планироваться раньше физической готовности.
- Первая волна заменяет day view и sidebar duplicates, но еще не решает stage-уровень `trim` и `blocked`.

## Blockers
- Внешних blockers пока нет.
- Внутренний product blocker снят частично: `production-plan` больше не виден в меню, но legacy page все еще остается в кодовой базе как временный compatibility layer.

## Validation
- [x] `for f in js/*.js corporate-gift/*.js; do node --check "$f"; done`
- [x] `node tests/version-smoke.js`
- [x] `node tests/work-management-smoke.js`
- [x] `node tests/order-flow-smoke.js`
- [x] `node tests/auth-hardening-smoke.js`
- [x] `node tests/employee-auth-payroll-smoke.js`
- [x] `node tests/payroll-half-month-smoke.js`
- [x] `node tests/production-calendar-smoke.js`
- [x] `node tests/factual-smoke.js`
- [x] `node tests/supabase-fallback-smoke.js`
- [ ] headed browser smoke on local calendar page

## Audit Log
| Date | Area | Evidence | Outcome | Next |
| --- | --- | --- | --- | --- |
| 2026-03-17 | Competing pages | `index.html`, `js/production_plan.js`, `js/gantt.js` | confirmed two overlapping production tools | collapse into one canonical page |
| 2026-03-17 | Scheduler start logic | `js/calculator.js:699+` | confirmed orders start from `today`, not from readiness/blocker logic | add readiness model |
| 2026-03-17 | Stage model | `js/gantt.js` | confirmed only `molding/assembly/packaging` | add `trim`, `blocked`, optional `printing` |
| 2026-03-17 | Capacity model | `js/calculator.js`, `settings` | confirmed use of pricing worker count | separate planning capacity from pricing capacity |
| 2026-03-17 | Holidays | `settings.js`, `gantt.js` | confirmed holidays exist in settings but not in scheduler | wire holidays into engine |
| 2026-03-17 | Mold constraints | `app.js`, `molds.js` | confirmed mold metadata exists but is not used in scheduling | integrate mold-aware planning |
| 2026-03-17 | China blocker | `china.js` | confirmed shipment/purchase statuses exist but do not block schedule | derive blocked states from China receipt |
| 2026-03-17 | C1 usable slice | `js/app.js`, `js/gantt.js`, `index.html`, `css/style.css` | canonical route + larger week/month UI + queue reorder delivered | move to blocker/capacity model |
| 2026-03-17 | Holidays + local date drift | `js/calculator.js`, `js/gantt.js`, `tests/production-calendar-smoke.js` | scheduler now skips configured holidays and keeps local calendar dates stable across timezones | continue into blocker/readiness model |
| 2026-03-17 | Mold blocker readiness | `js/gantt.js`, `css/style.css`, `tests/production-calendar-smoke.js` | custom orders without mold in stock are separated from active planning into blocked queue | continue into China waiting + capacity model |
| 2026-03-17 | Planning capacity split | `js/calculator.js`, `js/settings.js`, `index.html`, `tests/production-calendar-smoke.js` | calendar capacity is separated from pricing worker count and gets dedicated settings | continue into China waiting readiness |

## Smoke / Demo Checklist
- [x] В меню слева остается один понятный `Производственный календарь`.
- [x] `Неделя` и `Месяц` читаются крупно без day view.
- [x] Начальник производства может менять порядок очереди без похода в отдельный screen.
- [x] Заказ без молда на складе не попадает в active plan и виден отдельно как `Ждет молд`.
- [x] Календарь считает реальную мощность отдельно от pricing `3.5 сотрудника`.
- [ ] Заказ, который ждет mold из Китая, явно виден как blocked и не планируется раньше receipt.
- [ ] Mold-limited заказ не выглядит фальшиво распараллеленным.
- [ ] При перегрузе до дедлайна экран явно показывает risk.
- [ ] Заказ можно передвинуть bubble-ом и увидеть последствия.
- [ ] Фактические часы месяца видны отдельно от плановых.

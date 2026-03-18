# Production Calendar Status

## Snapshot
- Current phase: C9.5 factual-vs-plan month tracking shipped locally, next up timeline-level replan UX
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
- Реализован пятый usable slice `v109`:
  - readiness model стала трехсостоячной: `ready`, `blocked`, `needs review`;
  - если у blocked кастомного заказа есть незавершенная China purchase по `order_id`, календарь показывает `Ждет Китай: ...`, а не общий `Ждет молд`;
  - если China purchase уже `received`, но mold все еще не отмечен как доступный, заказ уходит в отдельный блок `Требуют проверки`, а не остается бесконечно заблокированным без объяснения.
- Реализован шестой usable slice `v110`:
  - календарь загружает `time_entries` и `employees` и считает фактические production-часы текущего месяца;
  - в stats появились отдельные карточки `План часов в этом месяце` и `Факт часов в этом месяце`;
  - factual overlay считает только production-сотрудников и не тащит management-часы в картину цеха.
- Реализован седьмой usable slice `v111`:
  - календарь теперь агрегирует production-часы по заказам и стадиям и уменьшает планируемый остаток автоматически;
  - очередь и sidebar показывают `факт / план / осталось`, а не только абстрактный полный объем из калькулятора;
  - ручное ограничение `не раньше этой даты` стало реальным scheduler constraint, а не просто UI-пометкой;
  - safe unique-name fallback помогает подтянуть legacy production hours даже до полной ручной разметки `order_id`.
- Реализован follow-up slice `v112`:
  - `прочее` больше не надувает production progress и не уменьшает remaining hours;
  - queue progress теперь считает только stage-linked часы (`литье/сборка/упаковка`), а `прочее` показывает отдельно как hint.
- Реализован следующий slice `v113`:
  - на карточках очереди появились быстрые кнопки сдвига старта на рабочий день раньше/позже;
  - shift logic пропускает выходные и `production_holidays`;
  - local ISO date parsing в calendar UI стабилизирован, чтобы ручные сдвиги и подписи дат не уезжали на день из-за UTC drift.
- Реализован следующий slice `v114`:
  - очередь заказов теперь можно перетаскивать drag-and-drop, а не только тыкать стрелками;
  - drag reorder сохраняется в том же `production plan state`, так что порядок не теряется после reload;
  - визуально добавлены `dragging / drag-over` состояния, чтобы было понятно, куда встанет заказ.
- Реализован cleanup slice `v115`:
  - в `Gantt` убраны последние `toISOString().slice(0, 10)` пути для capacity chart и today-based stats;
  - calendar stats и capacity overlay теперь используют один и тот же local-date-safe helper;
  - smoke дополнительно страхует отсутствие drift-prone date slicing в `js/gantt.js`.
- Реализован следующий slice `v116`:
  - риск дедлайна теперь считается в рабочих днях, а не только бинарно `красный/зеленый`;
  - queue cards и sidebar показывают `Опаздывает`, `Впритык к дедлайну` или `Буфер N раб.дн.`;
  - deadline markers и queue badges различают `late` и `tight`, чтобы критические заказы читались быстрее;
  - smoke страхует working-day buffer и overdue/tight risk summaries.
- Реализован следующий slice `v117`:
  - stats теперь показывают `факт / план к сегодня`, а не только голый факт за месяц;
  - календарь считает отдельный `plannedToDate`, чтобы было видно, отстаем ли мы от собственного плана уже сейчас;
  - smoke страхует current-month tracking summary и gap-to-date.
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
- `production-calendar-smoke` теперь страхует и China-ready ветку:
  - `pending China purchase => blocked`;
  - `received China purchase + no in-stock mold flag => needs_review`.
- `production-calendar-smoke` теперь страхует и factual overlay:
  - календарь загружает `time_entries` и `employees`;
  - factual monthly hours считают только production entries текущего месяца.
- `production-calendar-smoke` теперь также страхует:
  - уже сданные часы уменьшают `remaining` в scheduler;
  - `production_not_before` реально сдвигает старт заказа;
  - order actuals собираются по linked `order_id` и по safe unique-name fallback.
- `production-calendar-smoke` теперь дополнительно страхует:
  - `other` hours не искажают stage progress и не уменьшают remaining.
- `production-calendar-smoke` теперь также страхует:
  - quick working-day shift skip weekends and production holidays.
- `production-calendar-smoke` теперь также страхует:
  - pure reorder helper для drag-and-drop очереди.

## In Progress
- C9: richer timeline drag/replan persistence.

## Next
- C9: добавить еще более наглядный timeline drag/replan UX поверх уже работающего queue drag слоя, без зависимости от legacy screen.

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
| 2026-03-17 | China waiting / review states | `js/gantt.js`, `css/style.css`, `tests/production-calendar-smoke.js` | blocked custom orders now distinguish pending China vs received-but-unreconciled states | continue into drag persistence + factual overlay |
| 2026-03-17 | Monthly factual overlay | `js/gantt.js`, `tests/production-calendar-smoke.js` | calendar now shows planned vs actual production hours for the current month using TimeTrack data | continue into drag/persist layer |
| 2026-03-17 | Actual vs remaining hours | `js/gantt.js`, `js/calculator.js`, `tests/production-calendar-smoke.js` | factual order hours now reduce remaining scheduled work and manual `not before` dates actually delay start | continue into richer manual reschedule UX |
| 2026-03-17 | Progress math stabilization | `js/gantt.js`, `js/calculator.js`, `tests/production-calendar-smoke.js` | non-stage `other` hours are separated from production progress and no longer distort remaining work | continue into richer manual reschedule UX |
| 2026-03-17 | Quick working-day shifts | `js/gantt.js`, `tests/production-calendar-smoke.js` | production queue cards can now move manual start earlier/later by working days, with local-date-safe parsing | continue into richer drag/replan UX |
| 2026-03-17 | Queue drag reorder | `js/gantt.js`, `css/style.css`, `tests/production-calendar-smoke.js` | production manager can reorder queue cards by drag-and-drop with persisted sequence state | continue into richer timeline drag/replan UX |
| 2026-03-17 | Local-date drift cleanup | `js/gantt.js`, `tests/production-calendar-smoke.js` | capacity chart and calendar stats now use local-date-safe helpers instead of `toISOString().slice(0,10)` paths | continue into richer timeline drag/replan UX |
| 2026-03-17 | Deadline buffer readability | `js/gantt.js`, `css/style.css`, `tests/production-calendar-smoke.js` | queue, sidebar and markers now show working-day buffer vs overdue state instead of only binary deadline risk | continue into timeline-level replan UX |
| 2026-03-17 | Month tracking to-date | `js/gantt.js`, `tests/production-calendar-smoke.js` | stats now compare factual submitted hours against the scheduled plan up to today, not only against the full month | continue into timeline-level replan UX |

## Smoke / Demo Checklist
- [x] В меню слева остается один понятный `Производственный календарь`.
- [x] `Неделя` и `Месяц` читаются крупно без day view.
- [x] Начальник производства может менять порядок очереди без похода в отдельный screen.
- [x] Заказ без молда на складе не попадает в active plan и виден отдельно как `Ждет молд`.
- [x] Календарь считает реальную мощность отдельно от pricing `3.5 сотрудника`.
- [x] Заказ, который ждет mold из Китая, явно виден как blocked и не планируется раньше receipt.
- [x] Заказ с конфликтом `Китай уже принят, но mold не reconciled` уходит в `Требуют проверки`.
- [x] Фактические часы месяца видны отдельно от плановых.
- [x] Уже сданные часы уменьшают остаток заказа прямо в календаре.
- [x] На карточке заказа видно `факт / план / осталось`.
- [x] Начальник производства может быстро подвинуть старт заказа на рабочий день раньше/позже.
- [x] Начальник производства может менять порядок очереди drag-and-drop, а не только стрелками.
- [ ] Mold-limited заказ не выглядит фальшиво распараллеленным.
- [ ] При перегрузе до дедлайна экран явно показывает risk.
- [ ] Заказ можно передвинуть bubble-ом и увидеть последствия.

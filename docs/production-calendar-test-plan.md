# Production Calendar Test Plan

## Source
- Task: перепроектировать `Производственный календарь` так, чтобы он отражал реальные стадии, блокеры, mold constraints, фактическую загрузку и дедлайн-риск.
- Plan file: `/private/tmp/ro-codex-push-sync.v100/docs/production-calendar-plan.md`
- Status file: `/private/tmp/ro-codex-push-sync.v100/docs/production-calendar-status.md`
- Last updated: 2026-03-17

## Validation Scope
- In scope:
  - единый production calendar route и IA;
  - derived readiness/blocker model;
  - mold-aware scheduling;
  - week/month calendar rendering;
  - manual drag/replan state;
  - overload and deadline-risk detection;
  - factual hours overlay from `TimeTrack`.
- Out of scope in first wave:
  - perfect batch-level simulation of every stage;
  - shift-by-shift planning per employee;
  - accounting recalculation beyond already existing `Часы` and `План-факт`.

## Critical Fixtures
- `Blank mold order`:
  - бланковый заказ с известным `mold_count = 1`;
  - должен показывать single-mold constraint.
- `Custom mold in stock order`:
  - кастомный заказ, у которого mold уже на складе;
  - должен планироваться без blocked state.
- `Custom mold from China order`:
  - заказ в sample/production perimeter, но mold еще не `received`;
  - должен отображаться как blocked.
- `Long casting + short assembly order`:
  - проверка, что assembly не рисуется начавшейся раньше физически возможного окна.
- `Late deadline order`:
  - заказ, которому по текущей мощности не хватает часов до дедлайна;
  - должен светить risk/overdue.
- `Month actual-hours fixture`:
  - production employees с реальными time entries;
  - отдельный management employee, который не должен искажать production actuals.

## Test Levels

### Logic / Unit
- Verify readiness model:
  - order with no blocker gets computed `ready_to_plan_at`;
  - order with China mold waiting gets blocked;
  - manual override can move `blocked_until` later or clear it.
- Verify stage model:
  - `casting`, `trim`, `assembly`, `packaging` hours map correctly from order data;
  - missing trim split is marked as estimated, not silently precise.
- Verify capacity model:
  - planning capacity uses operational settings, not pricing settings;
  - weekends and configured holidays are excluded;
  - overload day is detected when planned hours exceed day capacity.
- Verify mold constraints:
  - single-mold order cannot exceed one casting lane;
  - multi-mold order can expand only up to allowed slots.
- Verify actual overlay:
  - actual monthly hours come from `TimeTrack`;
  - management-only hours do not pollute production actuals by default.

### Integration
- `Orders/Calculator -> Production Calendar`:
  - newly saved order with `deadline_start`, `deadline_end`, `production_hours_*` appears in queue/calendar;
  - changing deadline updates calendar risk.
- `Molds -> Production Calendar`:
  - blank/custom mold metadata affects constraint badge and planning.
- `China -> Production Calendar`:
  - purchase/shipment not `received` blocks production;
  - receiving shipment unblocks planning.
- `Warehouse -> Production Calendar`:
  - if stage is blocked by warehouse-dependent readiness in future slices, blocker changes should propagate.
- `TimeTrack -> Production Calendar`:
  - monthly factual hours summary matches production-role submitted hours for selected month.
- `Production manager interaction`:
  - drag order/stage;
  - lock manual start;
  - set manual blocker;
  - open order drawer and navigate to source order.

### End-to-End / Smoke
- Open `Производственный календарь` and confirm:
  - one canonical page;
  - no redundant day mode;
  - readable large week/month grid.
- Build auto-plan and confirm:
  - blocked China-mold order stays blocked;
  - active production orders land before deadline when capacity allows;
  - overloaded orders show risk.
- Manually move an order and confirm:
  - state persists after reload;
  - conflict/risk recomputes;
  - linked order details still open.
- Open monthly actual strip and confirm:
  - planned hours are not identical to factual by accident;
  - factual month reflects `TimeTrack`.

## Negative Cases
- Order without `deadline_end` must not vanish; it should fall back to explicit no-deadline presentation.
- Blocked order must not silently auto-start because `today` moved.
- Single mold must not appear split across parallel casting bars.
- Order waiting for China receipt must not appear as freely draggable in active production lane unless operator overrides it explicitly.
- Pricing worker count `3.5` must not automatically become planning capacity if operational capacity is set lower.
- Actual hours overlay must not use bubble-plan hours when time entries are absent.
- Manual drag override must not be lost on reload.
- Legacy orders without perfect mold linkage must surface a clear `needs review` state rather than fake precision.

## Acceptance Gates
- [x] `for f in js/*.js corporate-gift/*.js; do node --check "$f"; done`
- [x] `node tests/order-flow-smoke.js`
- [x] `node tests/payroll-half-month-smoke.js`
- [x] `node tests/production-calendar-smoke.js`
- [ ] `node tests/production-capacity-smoke.js`
- [ ] headed browser smoke on local page (local http.server was not stable in this session)
- [ ] Manual smoke:
  - `production calendar week/month`
  - `blocked China mold`
  - `single mold constraint`
  - `drag + reload persistence`
  - `month actual hours`

## Release / Demo Readiness
- [x] В меню один production planning entry point.
- [x] `Неделя` и `Месяц` читаются крупно.
- [x] Начальник производства может менять порядок очереди кнопками, а не только смотреть авто-график.
- [ ] Mold blockers и China blockers видны явно.
- [ ] Перегруз до дедлайна подсвечивается сразу.
- [ ] Плановая и фактическая загрузка месяца не смешаны.
- [x] Старые `План производства` и `Календарь` больше не создают conflicting truths в меню и routing.
- [x] Настроенные `production_holidays` исключаются из расписания и не съезжают на день из-за timezone drift.
- [x] Заказ с кастомной позицией без молда на складе уходит в отдельный blocked-блок и не планируется как ready.
- [x] Календарь берет мощность из `planning_workers_count`, а не из pricing `workers_count`.
- [x] China-linked blocked orders различаются как `Ждет Китай` и `Требует проверки` после receipt.

## Command Matrix
```sh
for f in js/*.js; do node --check "$f"; done
rg -n "buildProductionSchedule|production_plan_state_json|mold_count|production_holidays|deadline_start|deadline_end" js/*.js
node tests/order-flow-smoke.js
node tests/payroll-half-month-smoke.js
python3 -m http.server 4173
```

## Open Risks
- Для части overlap logic может потребоваться batch model, если sequential MVP окажется слишком грубым.
- Реальная связка `order -> mold waiting in China` может потребовать дополнительного explicit data field, если существующих связей не хватит.
- Drag-heavy UI может быть неудобен на мобильном, даже если desktop станет сильно лучше.
- Factual hours по стадиям могут потребовать дополнительной дисциплины stage-tagging в `Часы`, иначе этапная аналитика будет ограниченной.

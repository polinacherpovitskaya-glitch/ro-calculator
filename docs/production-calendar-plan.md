# Production Calendar Plan

## Source
- Task: глубоко перепроектировать `производственный календарь` так, чтобы он стал реальным инструментом начальника производства, а не просто красивой диаграммой.
- Canonical input: пользовательский запрос в чате от 2026-03-17 про крупный недельный/месячный календарь, реальную логику стадий производства, ограничение по людям и молдам, перенос заказов bubble-ами, подсветку нехватки часов до дедлайна и блокеры вида `ждем молд из Китая`.
- Repo context:
  - текущий production list живет в `/private/tmp/ro-codex-push-sync.v100/js/production_plan.js`;
  - текущий календарь/график живет в `/private/tmp/ro-codex-push-sync.v100/js/gantt.js`;
  - расчет плановых production-hours живет в `/private/tmp/ro-codex-push-sync.v100/js/calculator.js`;
  - производственные даты и дедлайны сохраняются из калькулятора в `deadline_start`, `deadline_end`, `production_hours_*`;
  - Китай и приход молдов/комплектующих живут в `/private/tmp/ro-codex-push-sync.v100/js/china.js` и `/private/tmp/ro-codex-push-sync.v100/js/warehouse.js`;
  - фактические часы сотрудников живут в `/private/tmp/ro-codex-push-sync.v100/js/timetrack.js`.
- Last updated: 2026-03-17

## Execution Analysis
- Сейчас в продукте уже есть две конкурирующие модели: `План производства` как список-приоритезатор и `Календарь` как авто-Gantt. Пользователь ожидает не две страницы, а один канонический `Производственный календарь`.
- Основная проблема не в размере шрифта, а в том, что текущий scheduler стартует все заказы "сегодня", смотрит только на три грубые фазы и не знает про mold constraints, trim, blocking dependencies и реальную мощность цеха.
- Порядок работ должен быть таким: сначала закрепить каноническую продуктовую модель и данные, потом объединить IA/route, потом переписать engine планирования, и только после этого переносить UI на крупный drag-based календарь. Если начать с верстки, получится красивая, но ложная картинка.
- Самый важный продуктовый guardrail: плановые часы живут в календаре, а фактические часы месяца должны по-прежнему подтверждаться из `Часы`, потому что именно они потом кормят косвенные расходы и `План-факт`.

## Product Intent
- Сделать один канонический экран `Производственный календарь` в левом меню.
- Дать начальнику производства визуальный конструктор:
  - видеть все актуальные заказы между `вход в производство` и `дедлайн`;
  - видеть блокеры (`ждем молд из Китая`, `нет склада`, `не подтвержден цвет`);
  - двигать план вперед/назад bubble-ами;
  - понимать, где мощностей не хватает.
- Развести три разных слоя:
  - `план`: как мы хотим произвести заказ;
  - `факт`: сколько часов реально сдали люди;
  - `блокеры`: что вообще не дает стартовать производству.
- Сохранить связь календаря с заказом, молдом, Китаем, складом и факт-часами без отдельной ручной таблицы вне системы.

## Current State Findings
- В меню сейчас отдельно живут `План производства` и `Календарь`, что уже само по себе создает двойной источник истины.
- Текущий `gantt.js`:
  - оставляет лишний `День` view, который пользователю не нужен;
  - строит расписание от `today`;
  - знает только `molding -> assembly -> packaging`;
  - не знает `trim`, `printing`, `waiting for mold`, `waiting for receipt`, `sample blocked`;
  - использует общую мощность `workers_count * 8`, игнорируя реальную модель `2-2.5` человека;
  - не использует `production_holidays`;
  - не хранит ручные перетаскивания и не поддерживает bubble planning.
- Текущий `production_plan.js`:
  - хранит только приоритет order ids;
  - не распределяет часы по календарю;
  - не умеет показывать blockers и зависимости;
  - не является конструктором плана.
- `buildProductionSchedule()` в `/private/tmp/ro-codex-push-sync.v100/js/calculator.js` опирается на calculator-hours, но:
  - не учитывает mold count;
  - не учитывает отдельную trim phase;
  - не умеет partial overlap для сборки/упаковки;
  - не умеет readiness-date от Китая/склада;
  - не использует историю статусов заказа.
- В данных уже есть важные building blocks:
  - `production_hours_plastic`, `production_hours_hardware`, `production_hours_packaging`;
  - `deadline_start`, `deadline_end`;
  - признаки blank/custom mold через `is_blank_mold`, `template_id`, `base_mold_in_stock`, `extra_molds`;
  - `mold_count` у бланков;
  - связанные China purchases и shipment statuses;
  - factual time entries per employee.

## Non-Negotiables
- Не терять текущие order-level production hours из калькулятора: они остаются базой планового расписания.
- Не смешивать `план мощности` и `фактически отработанные часы`: фактический месяц должен опираться на `Часы`, а не на календарный forecast.
- Для mold-constrained стадий нельзя рисовать фальшивое ускорение несколькими людьми, если у заказа физически один mold.
- Любой order blocker (`ждем молд`, `ждем Китай`, `не готова печать/цвет`) должен явно блокировать старт стадии, а не просто отображаться текстом.
- На первом этапе не делать тяжелый backend rewrite; использовать текущий dual-write pattern и отдельное состояние календаря поверх order data.

## Proposed Canonical IA

### 1. Left menu / route
- В левом меню остается один пункт: `Производственный календарь`.
- Текущий `Календарь` route становится каноническим production screen.
- Текущий `План производства` не остается отдельной страницей; его функции переезжают внутрь новой страницы как режим `Очередь`.

### 2. Single page, three working zones
- `Очередь`:
  - все заказы, которые надо спланировать или перепланировать;
  - карточки с дедлайном, стадией, блокером, mold-type, mold-count, общими плановыми часами.
- `Календарь`:
  - крупный week/month view;
  - bubble/segment bars, которые можно двигать;
  - day view удаляется.
- `Мощности и факт`:
  - загрузка по стадиям;
  - сколько часов планом запланировано на месяц;
  - сколько часов реально сдали сотрудники;
  - расхождение `план vs факт`.

### 3. Right-side detail drawer
- По клику на заказ открывается drawer:
  - общая информация заказа;
  - стадии и их плановые часы;
  - mold constraints;
  - blockers;
  - manual overrides;
  - ссылочный переход в заказ / Китай / склад.

## Proposed Canonical Planning Model

### 1. Planning unit
- Каноническая единица в календаре: `production job` на уровне заказа.
- Один заказ может состоять из нескольких stage segments:
  - `blocked`;
  - `casting`;
  - `trim`;
  - `printing` (если реально нужна);
  - `assembly`;
  - `packaging`;
  - `ready`.

### 2. Stage hours source of truth
- По умолчанию плановые часы stage берутся из сохраненных calculator fields:
  - `production_hours_plastic` -> `casting + trim` base;
  - `production_hours_hardware` -> `assembly`;
  - `production_hours_packaging` -> `packaging`.
- Для `trim` вводится derived split:
  - если у продукта сохранены `hoursPlastic` и `hoursCutting`, используем их;
  - если нет, на MVP применяем heuristic split `casting = plastic`, `trim = cutting`, агрегируя по items;
  - если точного split нет, UI должен честно показывать `trim estimated`, а не скрывать это.

### 3. Resource pools
- В календаре появляются отдельные capacity pools:
  - `mold/casting pool`;
  - `trim pool`;
  - `assembly pool`;
  - `packaging pool`.
- В settings добавляется явная operational capacity:
  - `planning_workers_effective` = сколько людей реально планируем в цеху;
  - `planning_manager_share` = сколько часов Лёша может реально закрывать как producer;
  - `planning_hours_per_day`;
  - `planning_holidays`.
- Важно: pricing-capacity (`3.5`) и planning-capacity (`2` или `2.5`) становятся разными параметрами. Календарь не должен опираться на pricing assumptions.

### 4. Mold constraints
- Для каждой plastic stage календарь знает:
  - blank mold / custom mold;
  - `mold_count`;
  - один mold или несколько;
  - mold already in stock vs waiting.
- Правило MVP:
  - если `effective mold count = 1`, casting не распараллеливается;
  - если `mold_count > 1`, допускается parallel casting capacity до `min(mold_count, available casting slots)`.
- Для custom mold без готового mold availability order уходит в `blocked`, пока blocker не снят.

### 5. Blockers and readiness
- Заказ может иметь `ready_to_plan_at`, который считается как максимум из:
  - дата перевода в `sample/production` или ручной `production release`;
  - готовность молда;
  - готовность ключевых комплектующих;
  - снятие ручного блокера.
- Новый blocker model:
  - `waiting_mold_china`;
  - `waiting_mold_receipt`;
  - `waiting_hardware`;
  - `waiting_color_approval`;
  - `manual_hold`.
- Для China-linked mold/calendar dependencies вводится derived status:
  - если есть привязанная mold purchase/shipment и она еще не `received`, order/stage стартовать нельзя.

### 6. Overlap rules
- `casting` не overlap-ится сам с собой сверх mold limits.
- `trim` на MVP можно:
  - либо вести строго после casting;
  - либо разрешать частичный overlap флагом `allow_trim_overlap_after_first_batch`.
- `assembly` и `packaging` могут стартовать до полного завершения casting, но только после порога готовности:
  - `first batch ready`;
  - либо `X% output complete`.
- Для первой волны рекомендован упрощенный, но честный rule set:
  - `casting -> trim` sequential by default;
  - `assembly` может стартовать после `trim ready at first batch`;
  - `packaging` может стартовать после `assembly started` или `assembly batch ready`.
- Later phase может расширить это до batch-flow, но MVP не должен лгать про полную последовательность там, где производство реально overlap-ится.

### 7. Planned vs actual layer
- Плановые бары календаря показывают forecast.
- Отдельный monthly strip показывает:
  - `planned production hours`;
  - `actual submitted hours`;
  - `delta`.
- Фактические часы берутся из `TimeTrack`, а не из перетаскиваний bubble-ов.
- Этот слой нужен не только для начальника производства, но и для расчета косвенных расходов и загрузки цеха.

### 8. Manual overrides
- Начальник производства должен мочь вручную:
  - сдвигать start/end;
  - менять priority;
  - ставить/снимать blocker;
  - фиксировать `must start no later than`;
  - указывать `split allowed / split forbidden`;
  - отмечать `1 mold / N molds`.
- Для этого вводится отдельное состояние `production_calendar_state_json`, а не попытка записывать все overrides прямо в order row.

## Proposed State Model
- `production_calendar_state_json`:
  - per order:
    - `manual_priority`;
    - `ready_to_plan_override`;
    - `blocked_reason`;
    - `blocked_until`;
    - `mold_mode`;
    - `mold_count_override`;
    - `allow_trim_overlap`;
    - `allow_assembly_overlap`;
    - `manual_segments`;
    - `updated_at`, `updated_by`.
- Если state отсутствует, календарь строится автоматически из order data.
- При наличии manual segments auto-scheduler пересчитывает только незалоченные части.

## Milestone Order
| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| C1 | Зафиксировать каноническую IA и state model | - | [ ] |
| C2 | Собрать derived readiness/blocker model из orders, molds, China и склада | C1 | [ ] |
| C3 | Переписать scheduling engine под реальные стадии и мощности | C1, C2 | [ ] |
| C4 | Собрать новый production calendar UI: очередь + неделя/месяц + drawer | C1, C3 | [ ] |
| C5 | Подтянуть factual hours и overload analytics | C3, C4 | [ ] |
| C6 | Прогнать регрессию, rollout и зачистить старые конкурирующие страницы | C4, C5 | [ ] |

## C1. Зафиксировать каноническую IA и state model `[ ]`
### Goal
- Перестать жить с двумя competing production pages и определить один канонический экран, route и формат состояния календаря.

### Tasks
- [ ] Зафиксировать, что `Производственный календарь` становится каноническим menu item вместо старого отдельного `Календаря`.
- [ ] Определить судьбу `План производства`: либо он превращается во вкладку `Очередь`, либо удаляется как отдельный route.
- [ ] Описать `production_calendar_state_json` и правила совместимости с текущим `production_plan_state_json`.
- [ ] Зафиксировать week/month as only supported planning views.

### Definition of Done
- Есть один канонический route и понятная IA страницы.
- Есть agreed state model для manual planning overrides.

### Validation
```sh
rg -n "data-page=\"production-plan\"|data-page=\"gantt\"|page-production-plan|page-gantt" index.html js/*.js
rg -n "loadProductionPlanState|saveProductionPlanState|buildProductionSchedule" js/*.js
```

### Known Risks
- Если сразу удалить старый route без migration-перехода, пользователи потеряют привычные точки входа.

### Stop-and-Fix Rule
- Не начинать новый engine, пока не закреплен один канонический экран и формат состояния.

## C2. Собрать derived readiness/blocker model из orders, molds, China и склада `[ ]`
### Goal
- Календарь должен знать не только дедлайн, но и реальную готовность заказа к производству.

### Tasks
- [ ] Определить `ready_to_plan_at` для заказа из:
  - production status/history;
  - deadline window;
  - mold availability;
  - China-linked blockers;
  - hardware/package blockers при необходимости.
- [ ] Добавить derived blockers для кейсов `ждем молд`, `ждем Китай`, `ждем приемку`, `manual hold`.
- [ ] Прописать MVP-правило для sample-orders: что реально можно планировать, а что висит как blocked sample.
- [ ] Отдельно описать кейс `NFC sample, mold едет из Китая`.

### Definition of Done
- Для каждого order в календаре можно объяснить, почему он уже планируемый или почему он заблокирован.

### Validation
```sh
rg -n "deadline_start|deadline_end|created_at|status|shipment_id|in_china_warehouse|received|mold_count|base_mold_in_stock" js/*.js
```

### Known Risks
- У части старых заказов нет идеальных связей между mold, China и order, значит придется иметь явный manual blocker override.

### Stop-and-Fix Rule
- Не строить drag calendar, пока blocked orders нельзя честно объяснить данными.

## C3. Переписать scheduling engine под реальные стадии и мощности `[ ]`
### Goal
- Перестать планировать "от сегодня всем подряд" и перейти к stage-aware scheduler с реальными ограничениями.

### Tasks
- [ ] Развести pricing capacity и planning capacity.
- [ ] Добавить стадии `casting`, `trim`, `assembly`, `packaging`, optional `printing`, `blocked`.
- [ ] Добавить mold-aware planning rule и запрет фальшивого parallel casting.
- [ ] Добавить readiness gate, deadline risk и capacity overload flags.
- [ ] Подготовить auto-plan, который строит baseline до ручных правок.

### Definition of Done
- Auto-plan больше не стартует все заказы от today.
- Календарь умеет показать, где order физически не успевает в дедлайн.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/order-flow-smoke.js
# planned add: node tests/production-calendar-smoke.js
```

### Known Risks
- Слишком умный batch scheduler может быстро разрастись; первая волна должна быть честной и объяснимой, а не "магической".

### Stop-and-Fix Rule
- Если engine дает красивый, но необъяснимый результат, упрощать правила до inspectable behavior.

## C4. Собрать новый production calendar UI: очередь + неделя/месяц + drawer `[ ]`
### Goal
- Начальник производства должен реально работать с экраном, а не щуриться в мелкий timeline.

### Tasks
- [ ] Увеличить размер grid/header/day labels так, чтобы даты `1..30` и bubble text читались без приближения.
- [ ] Удалить `День` mode и оставить `Неделя` + `Месяц`.
- [ ] Перенести `приоритет/готовность/блокер` в левую очередь.
- [ ] Сделать bubble/segment drag + resize для start/end.
- [ ] Добавить detail drawer с быстрыми действиями по заказу.

### Definition of Done
- Страница читается как рабочий инструмент, а не техдемо.
- Менеджер производства может передвинуть заказ и сразу увидеть последствия по дедлайну/перегрузке.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
python3 -m http.server 4173
# manual smoke: production calendar week/month drag and drawer
```

### Known Risks
- Drag UX легко ломается на мобильной ширине; нужен desktop-first, но не полностью broken mobile fallback.

### Stop-and-Fix Rule
- Если page visually unreadable or drag unreliable, не переходить к rollout.

## C5. Подтянуть factual hours и overload analytics `[ ]`
### Goal
- Календарь должен не только обещать, но и помогать видеть, сколько цех реально отработал в месяце.

### Tasks
- [ ] Добавить summary `план часов в месяце / факт часов в месяце`.
- [ ] Подтянуть factual hours по production-role employees из `TimeTrack`.
- [ ] Добавить разрез по стадиям, если это можно вывести из stage-tagged time entries.
- [ ] Подготовить данные для дальнейшего косвенного распределения и план-факт связки.

### Definition of Done
- На календаре видно не только forecast, но и реальную отработку месяца.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/payroll-half-month-smoke.js
# planned add: node tests/production-capacity-smoke.js
```

### Known Risks
- Исторические часы не всегда идеально размечены по стадиям и заказам; нужен честный fallback.

### Stop-and-Fix Rule
- Не показывать ложную точность; если stage split не доказан, явно помечать aggregated actual hours.

## C6. Прогнать регрессию, rollout и зачистить старые конкурирующие страницы `[ ]`
### Goal
- Новый production calendar становится каноническим экраном без двойной логики и без слома соседних flows.

### Tasks
- [ ] Прогнать regression по orders, calculator, china, warehouse, timetrack.
- [ ] Проверить, что старые routes/labels не путают пользователя.
- [ ] Либо скрыть old `План производства`, либо оставить temporary alias с redirect.
- [ ] Обновить docs и smoke coverage.

### Definition of Done
- В продукте остается одна понятная production planning model.

### Validation
```sh
for f in js/*.js corporate-gift/*.js; do node --check "$f"; done
node tests/order-flow-smoke.js
node tests/factual-smoke.js
node tests/payroll-half-month-smoke.js
python3 -m http.server 4173
```

### Known Risks
- Легко оставить куски старой модели в коде и получить расходящиеся расчеты.

### Stop-and-Fix Rule
- Если после rollout в продукте остаются две competing production truths, релиз не считать завершенным.

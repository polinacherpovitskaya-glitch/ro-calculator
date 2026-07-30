# Test plan — Именные назначения в производственном календаре

## Source

- Task: уникальные цвета, верхняя очередь, реальные сотрудники, ручные
  назначения и дневная норма.
- Plan file: `docs/plans/2026-07-30-production-calendar-named-assignments.md`
- Status file: `docs/status/2026-07-30-production-calendar-named-assignments.md`
- Repo context: `js/gantt.js`, `js/production-core.js`,
  `tests/production-calendar-smoke.js`
- Last updated: 2026-07-30

## Validation scope

- In scope:
  - уникальная визуальная карта заказов;
  - верхняя очередь и панель редактирования;
  - roster из active employees с приоритетом production;
  - автоматические и ручные именные назначения;
  - отсутствие пересечений на линии сотрудника;
  - плановые часы и безопасные плановые штуки;
  - backward compatibility plan state.
- Out of scope:
  - сохранение фактических штук;
  - вечернее закрытие смены;
  - отпуска, навыки и персональные коэффициенты скорости.

## Environment / fixtures

- Четыре активных employee с разными `daily_hours` и ролями.
- Пятый неактивный employee.
- Один действующий management employee для проверки ручного выбора.
- Очередь из 12 заказов для проверки цветов.
- Верхний заказ на двух вручную выбранных людей.
- Следующие два заказа в автоматическом режиме.
- Однородный заказ с `production_quantity=2000`.
- Смешанный заказ без надёжной нормы.
- Legacy plan state только с `order_ids`, `manual_start_dates` и
  `parallel_workers`.

## Test levels

### Logic / unit

- Нормализация отбрасывает неизвестные employee IDs.
- До четырёх active employees становятся roster автоматически, production
  сотрудники идут первыми.
- Неактивный сотрудник не занимает линию, active management доступен для выбора.
- Каждому видимому order ID назначается уникальный color slot.
- Соседние четыре заказа проходят минимальную цветовую дистанцию.
- Reorder не меняет color slot существующего заказа.
- Ручное назначение превращается в конкретные employee lanes.
- Занятый закреплённый employee не подменяется.
- Автоматический заказ получает первую допустимую свободную линию.
- Два интервала одного employee ID не пересекаются.
- Дневные часы равны сумме интервалов.
- Сумма плановых штук этапа не превышает production quantity.
- Неполные данные возвращают `units=null` и `needsNorm=true`.

### Integration

- `loadEmployees -> Gantt` показывает актуальные имена и daily hours.
- Изменение `employee_assignments` сохраняется через
  `saveProductionPlanState` и переживает reload.
- Ручной выбор синхронизирует legacy `parallel_workers`.
- Queue reorder сохраняет assignments и color slots.
- Фактические linked time entries продолжают уменьшать remaining hours.
- Публичная модель без новых полей продолжает строиться.

### End-to-end / smoke

- Открыть календарь с 12+ заказами:
  - нет одинаковых акцентов;
  - очередь сверху;
  - календарь занимает всю ширину.
- Открыть `Настроить очередь`, перетащить заказ, закрыть панель:
  - порядок и фокус сохраняются;
  - календарь пересчитан.
- Назначить заказ двум именам:
  - обе полосы используют нужные линии;
  - другие люди получают следующие заказы.
- Перезагрузить страницу:
  - roster, assignment и colors сохранены.
- Проверить week/month и узкий экран.

## Negative / edge cases

- В справочнике 0–3 активных сотрудника.
- В справочнике больше четырёх активных сотрудников.
- Сохранённый employee ID больше не активен.
- Один сотрудник вручную выбран в нескольких следующих заказах.
- Очередь длиннее числа базовых цветовых слотов.
- У заказа нет quantity.
- У этапа нулевые plan hours.
- Заказ состоит из неоднородных items.
- Legacy plan state не содержит новых ключей.
- Cached employees обновляются после первого render.

## Acceptance gates

- [x] JS syntax checks.
- [x] `node tests/production-calendar-smoke.js`
- [x] `node tests/partial-delivery-smoke.js`
- [x] `node tests/order-flow-smoke.js`
- [x] `node tests/employee-auth-payroll-smoke.js`
- [x] `node tests/version-smoke.js`
- [x] Headed browser fixture with 12+ orders and four named employees.
- [x] Desktop week/month visual check.
- [x] Narrow viewport visual check.

## Release / demo readiness

- [x] Все видимые заказы различимы.
- [x] Очередь управляется без постоянной потери ширины.
- [x] Руководитель видит конкретные имена.
- [x] Ручные назначения не нарушают ресурсные инварианты.
- [x] Сегодняшний план понятен в часах и, где возможно, в штуках.
- [x] Старые планы открываются без ручной миграции.
- [x] Нет blocker-level known issue.

## Command matrix

```sh
for f in js/*.js; do node --check "$f"; done
node tests/production-calendar-smoke.js
node tests/partial-delivery-smoke.js
node tests/order-flow-smoke.js
node tests/employee-auth-payroll-smoke.js
node tests/version-smoke.js
```

## Open risks

- Агрегат production quantity может быть слишком грубым для смешанных заказов.
- Визуальная уникальность требует проверки не только RGB-разницы, но и
  реальной читаемости на светлом фоне.
- Cached employees могут коротко показать устаревшее имя до refresh event.

## Deferred coverage

- Вечерняя форма, upsert time entry и фактические штуки будут покрыты test plan
  отдельной волны B.

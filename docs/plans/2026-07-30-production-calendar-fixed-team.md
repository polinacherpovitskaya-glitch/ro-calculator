# План: фиксированный состав производственного календаря

## Source

- Task: ограничить календарь сотрудниками производства и считать каждому смену 9 часов.
- Spec: `docs/specs/2026-07-30-production-calendar-fixed-team.md`
- Repo area: `js/production-core.js`, `js/gantt.js`, `tests/production-calendar-smoke.js`
- Last updated: 2026-07-30

## Assumptions

- «Влад» и «Галкин» в исходной формулировке — один сотрудник `Влад Галкин`, как
  он записан в «Часах» и показан на приложенном скриншоте.
- Канонический признак принадлежности к цеху — активная роль `production`.
- Текущий предел календаря остаётся равным четырём производственным линиям.

## Milestone Order

| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| M1 | Ограничить roster производством | - | [x] |
| M2 | Зафиксировать девятичасовую смену и UX | M1 | [x] |
| M3 | Регрессия, версия и готовность к публикации | M2 | [x] |

## M1. Ограничить roster производством `[x]`

### Goal

- В roster и picker попадают только активные сотрудники с ролью `production`.

### Tasks

- [x] Отфильтровать кандидатов в `production-core` и `Gantt`.
- [x] Не принимать сохранённые назначения сотрудников других ролей.
- [x] Добавить негативные тесты для management/office.

### Definition of Done

- Не-производственные сотрудники не занимают линии и не влияют на мощность.

### Validation

```sh
node tests/production-calendar-smoke.js
```

### Stop-and-Fix Rule

- Любой провал календарного smoke исправляется до перехода к M2.

## M2. Зафиксировать девятичасовую смену и UX `[x]`

### Goal

- Каждая производственная линия всегда равна 9 часам.

### Tasks

- [x] Игнорировать `daily_hours` сотрудника в roster календаря.
- [x] Показывать `9ч` в picker и в мощности линии.
- [x] Обновить пояснение и empty state редактора очереди.

### Definition of Done

- Сотрудники с `daily_hours = 6` или `8` всё равно планируются по 9 часов.

### Validation

```sh
node tests/production-calendar-smoke.js
```

### Stop-and-Fix Rule

- Если календарь наследует часы из общего справочника, M2 не считается готовым.

## M3. Регрессия, версия и готовность к публикации `[x]`

### Goal

- Подготовить самостоятельный безопасный релиз.

### Tasks

- [x] Обновить version anchors и cache-bust изменённых scripts.
- [x] Выполнить syntax, version и production calendar smokes.
- [x] Зафиксировать результат в status/test-plan.

### Definition of Done

- Все обязательные проверки зелёные; четыре version anchors синхронны.

### Validation

```sh
node --check js/production-core.js
node --check js/gantt.js
node tests/version-smoke.js
node tests/production-calendar-smoke.js
```

### Stop-and-Fix Rule

- Не публиковать релиз с падающим smoke или несовпадающей версией.

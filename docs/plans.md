# Plans

## Source
- Task: внедрить MVP внутренней системы задач и проектов внутри существующего сайта Recycle Object без смены стека и без потери старых задач.
- Canonical input: пользовательский PRD из чата 2026-03-13 с fixed decisions по `Order`, `Project`, `Area`, `Task`, миграции legacy tasks, UI-вьюхам, шаблонам и notification hooks.
- Repo context: vanilla JS SPA (`index.html` + `js/*`) с dual-write стилем `Supabase + localStorage`, существующими модулями `orders`, `tasks`, `china`, `warehouse`, `settings`.
- Last updated: 2026-03-13

## Assumptions
- Архитектурный стиль проекта сохраняется: без нового крупного framework, без смены роутинга, без замены текущего data-access слоя.
- Старый раздел задач не удаляется; он мигрируется и расширяется поверх новой normalized model.
- Все пользовательские тексты остаются на русском.
- Полный green status возможен только после прогона на реальной Supabase-схеме и в авторизованной сессии, потому что в репозитории нет тестового логина для e2e.
- До применения DDL MVP может работать через удалённый `settings` fallback, который уже существует в проекте и доступен текущему anon-backed клиенту.

## Validation Assumptions
- В репозитории нет явного `package.json`-пайплайна для `lint/typecheck/build`, поэтому базовыми gates считаются syntax-check JS и repo-specific smoke script.
- SQL rollout в рабочую Supabase-инстанцию делается вручную через SQL editor / migration pipeline проекта.

## Milestone Order
| ID | Title | Depends on | Status |
| --- | --- | --- | --- |
| M1 | Ввести новую data model и безопасную миграцию legacy tasks | - | [x] |
| M2 | Довести UI задач и проектов и связать его с orders | M1 | [x] |
| M3 | Провести rollout validation и закрыть release gaps | M1, M2 | [~] |

## M1. Ввести новую data model и безопасную миграцию legacy tasks `[x]`
### Goal
- В проекте есть отдельные сущности `areas`, `projects`, `tasks` и связанные записи для comments, attachments/links, checklist, watchers, activity, templates и notification events.
- Старые задачи конвертируются в новую модель без потери title, assignee, deadline, description и order linkage.

### Tasks
- [x] Добавить shared work-management constants/helpers для статусов, приоритетов, контекстов, шаблонов и миграции legacy fields.
- [x] Расширить `js/supabase.js` новым набором таблиц/локальных ключей и CRUD-функциями для задач, проектов и связанных сущностей.
- [x] Реализовать bootstrap/migration из legacy task storage в новую normalized model.
- [x] Подготовить SQL schema/migration files и seed data для `areas` и стартовых templates.
- [x] Добавить activity logging и event persistence hooks для будущих уведомлений.

### Definition of Done
- Репозиторий содержит новую модель данных и migration-safe слой доступа.
- Legacy tasks могут открываться в новом UI после bootstrap без ручной пересборки данных.
- Есть SQL-артефакты для применения схемы в Supabase.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/work-management-smoke.js
```

### Known Risks
- Реальная Supabase-схема еще не подтверждена against live dataset в рамках этой сессии.
- Для максимально безопасной совместимости часть полей legacy migration оставлена мягче, чем идеальная строгая schema (`nullable` там, где старые данные могли быть неполными).

### Stop-and-Fix Rule
- Если syntax checks или smoke migration checks падают, исправить data-layer и migration helpers до перехода к UI milestone.

## M2. Довести UI задач и проектов и связать его с orders `[x]`
### Goal
- Пользователь может работать с задачами и проектами внутри существующего интерфейса без ухода в чаты и сторонние документы.

### Tasks
- [x] Переписать раздел `Задачи` под новые данные и обязательные представления: мои, все, просроченные, list, kanban, calendar.
- [x] Добавить filters/sorting/manual ordering для очереди исполнителя.
- [x] Сделать полноценный task detail с comments, files, links, checklist, subtasks, watchers, waiting, activity и review flow.
- [x] Добавить отдельный раздел `Проекты` со списком, деталкой, filters и create flows.
- [x] Интегрировать проекты и новые задачи в карточку заказа.
- [x] Подключить template-based create flows и event hooks.

### Definition of Done
- В приложении есть рабочие страницы `Задачи` и `Проекты`.
- Заказ показывает direct tasks, project-linked tasks и связанные проекты.
- Создание задач из общего модуля, заказа и проекта подставляет корректный контекст.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/work-management-smoke.js
python3 -m http.server 4173
```

### Known Risks
- Browser page-load smoke подтверждает загрузку скриптов, но не заменяет авторизованный ручной прогон CRUD-сценариев.
- Хранение файлов для MVP сделано в текущем стиле проекта без отдельного file storage сервиса; для больших вложений это не финальная архитектура.
- Пока normalized tables отсутствуют в live Supabase, production backing store для work-management идёт через `settings` JSON. Это рабочий режим для ночного rollout, но не финальная целевая схема.

### Stop-and-Fix Rule
- Если новая навигация, task detail или order integration ломают существующие страницы, исправить регрессию до перехода к rollout milestone.

## M3. Провести rollout validation и закрыть release gaps `[~]`
### Goal
- Подтвердить, что MVP работает на реальной схеме и в реальной авторизованной сессии, и зафиксировать остаточные ограничения v1.

### Tasks
- [ ] Применить `migration_tasks_projects_mvp.sql` и синхронные schema updates к целевой Supabase-базе.
- [ ] Дать приложению автогидратировать новые таблицы из `settings` fallback после появления схемы.
- [ ] Прогнать авторизованные ручные сценарии: create/edit task, project flow, order integration, review flow, checklist, comments, files, links.
- [ ] Проверить migration safety на живых legacy tasks и убедиться, что ничего не потеряно.
- [ ] Дофиксить найденные rollout issues и обновить execution docs.
- [ ] Подготовить короткий release/demo checklist для команды.

### Definition of Done
- SQL применен, live data читается новым модулем, базовые сценарии проходят в UI.
- Статус в `docs/status.md` можно перевести в green без blocker-level gaps.

### Validation
```sh
for f in js/*.js; do node --check "$f"; done
node tests/work-management-smoke.js
python3 -m http.server 4173
```

### Known Risks
- Нужен доступ к реальной базе и валидной учетке.
- Реальные legacy записи могут выявить edge cases, которых нет в локальном smoke script.
- Пока DDL не применён, live Supabase не знает таблицы `areas/projects/tasks/...`; модуль уже умеет безопасно деградировать в local fallback, но это не заменяет rollout схемы.
- Ночной remote fallback уже живёт в `settings`; при rollout нужно аккуратно подтвердить, что гидратация в normalized tables отработала без дублирования.

### Stop-and-Fix Rule
- Если live migration или авторизованный smoke выявляют потерю данных, broken CRUD или регрессию orders/tasks, остановить rollout и чинить до релиза.

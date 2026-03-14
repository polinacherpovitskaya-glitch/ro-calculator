# Test Plan

## Source
- Task: внедрить MVP внутренней системы задач и проектов с миграцией legacy tasks и интеграцией в orders.
- Plan file: `/Users/krollipolli/.codex/worktrees/cc3e/RO calculator/docs/plans.md`
- Status file: `/Users/krollipolli/.codex/worktrees/cc3e/RO calculator/docs/status.md`
- Repo context: vanilla JS SPA с модулями `orders`, `tasks`, `china`, `warehouse`, `settings`, data layer в `js/supabase.js`.
- Last updated: 2026-03-13

## Validation Scope
- In scope: новая data model задач и проектов, legacy migration bootstrap, tasks list/kanban/calendar, task detail, comments/files/links/checklist/subtasks/watchers/activity, review flow, order integration, templates, event hooks.
- Out of scope: полноценный Telegram workflow, private permissions, recurring tasks, Gantt-планирование, внешний full-text сервис, отдельный file storage backend.

## Environment / Fixtures
- Data fixtures: legacy tasks из `app_tasks/tasks_data`, seeded `areas` и `work_templates`, существующие `orders`, `employees`, `china` и `warehouse` сущности проекта.
- External dependencies: Supabase schema/data, браузер для ручного smoke, локальный HTTP server для page-load проверки.
- Setup assumptions: нужна авторизованная сессия приложения и доступ к Supabase SQL editor или migration pipeline для применения схемы.
- Временный production-safe fallback до rollout новых таблиц: `settings` JSON keys `work_*_json`.

## Test Levels

### Unit
- Проверить helper-логику в `js/work-management-core.js`: парсинг дедлайнов, map legacy statuses, area inference, context resolution, mention extraction.
- Проверить, что event emission не ломает task save flow даже без полноценного notification center.

### Integration
- Проверить bootstrap/migration в `js/supabase.js`: legacy task без order/project падает в area `Общее`, legacy task с order сохраняет order context, legacy project text приводит к созданию/поиску `Project`.
- Проверить CRUD связных сущностей: `task_comments`, `work_assets`, `task_checklist_items`, `task_watchers`, `work_activity`.
- Проверить order integration: order detail показывает direct tasks и project-linked tasks, если проект привязан к заказу.
- Проверить template flows: task/project from template предзаполняют title/description/checklist/subtasks/area/priority.
- Проверить settings-backed remote fallback: данные `work_tasks_json`, `work_projects_json`, `work_areas_json`, `work_templates_json` реально пишутся и читаются через live Supabase REST.

### End-to-End / Smoke
- Открыть приложение в браузере и убедиться, что страницы `Задачи` и `Проекты` загружаются без runtime errors.
- В авторизованной сессии создать generic task, order task и project from template.
- Проверить task detail: комментарий, упоминание, ссылка, файл, checklist item, subtask, reviewer flow, watcher.
- Проверить order detail: видны direct tasks, project-linked tasks и связанные проекты.
- Проверить manual ordering в очереди исполнителя.
- Проверить fallback mode: при отсутствии новых таблиц в Supabase work-management модуль не зависает на `PGRST205`, а продолжает работать через local storage.
- Проверить remote fallback mode: после refresh/новой сессии задачи и проекты восстанавливаются из `settings`, а не пропадают.

## Negative / Edge Cases
- Legacy task без assignee или deadline не должен теряться при миграции.
- Задача без `order_id/project_id` должна корректно попасть в `Area` context.
- Перевод в `На согласовании` без reviewer не должен ломать сохранение; UI должен оставаться предсказуемым.
- Удаление родительской задачи должно удалять зависимые subtasks и связные сущности без orphan-данных.
- Добавление больших вложений должно быть ограничено текущим MVP-лимитом, без падения страницы.
- Поиск и фильтры не должны ломаться, если order/project/china/warehouse ссылка отсутствует.

## Acceptance Gates
- [x] `for f in js/*.js; do node --check "$f"; done`
- [x] `node tests/work-management-smoke.js`
- [x] Локальный browser smoke с create task / create project на fresh cache-bust HTML
- [x] Live REST readback подтверждает заполненные `work_tasks_json`, `work_projects_json`, `work_areas_json`, `work_templates_json`
- [ ] Применение [`migration_tasks_projects_mvp.sql`](/Users/krollipolli/.codex/worktrees/cc3e/RO%20calculator/migration_tasks_projects_mvp.sql) к целевой Supabase-базе
- [ ] Авторизованный ручной smoke задач/проектов в браузере
- [ ] Проверка migration safety на реальных legacy tasks/orders

## Release / Demo Readiness
- [x] Core scenario works end to end в текущем `settings`-backed fallback режиме
- [x] Primary local regression checks are green
- [ ] No blocker-level known issue remains
- [x] Demo steps воспроизводимы в текущем ночном fallback-режиме
- [ ] Demo steps воспроизводимы на normalized schema после SQL rollout

## Command Matrix
```sh
for f in js/*.js; do node --check "$f"; done
node tests/work-management-smoke.js
python3 -m http.server 4173
```

## Open Risks
- Главный риск сейчас не в коде, а в отсутствии live validation на реальной схеме и под реальной учеткой.
- Legacy dataset может содержать edge cases по assignee/project linkage, которые не покрываются локальным smoke script.
- Файлы в MVP хранятся в текущем lightweight-формате; это ок для первой версии, но требует контроля размеров вложений.
- В репозитории есть отдельный legacy schema drift по `product_templates` (`cny_rate` отсутствует в live schema cache); это не блокирует tasks/projects path, но шумит в консоли при полном app init.
- После применения normalized schema нужно убедиться, что `settings` fallback корректно гидратировался в таблицы и не оставил рассинхрон между двумя источниками.

## Deferred Coverage
- Полноценные e2e-автотесты с логином, если в репозитории появится стабильный test account или мок auth.
- Нагрузочные/массовые проверки для длинных task lists и больших comment/activity history.
- Глубокие permission-based кейсы и приватные задачи, когда появится соответствующая модель доступа.

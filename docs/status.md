# Status

## Snapshot
- Current phase: M3 - rollout validation и release hardening
- Plan file: `/Users/krollipolli/.codex/worktrees/cc3e/RO calculator/docs/plans.md`
- Status: yellow
- Last updated: 2026-03-13

## Done
- Введена новая normalized model для work management: `areas`, `projects`, `tasks`, `task_comments`, `work_assets`, `task_checklist_items`, `task_watchers`, `work_activity`, `work_templates`, `task_notification_events`.
- Добавлены shared helpers и template seeds для задач/проектов.
- Реализован legacy migration bootstrap из старого task storage в новую модель без удаления старого функционала.
- Переписан раздел `Задачи` под list/kanban/calendar, filters, sort, ручную очередь, detail panel, review flow, comments, files, links, checklist, subtasks, watchers и activity.
- Добавлен раздел `Проекты` со списком, деталкой, фильтрами, быстрым созданием и шаблонами.
- Интеграция заказов обновлена: карточка заказа показывает связанные проекты, direct tasks и project-linked tasks.
- Подготовлены SQL migration/schema updates и smoke test для work-management helpers.
- Добавлен graceful fallback для work-management модуля: при отсутствии новых таблиц в live Supabase блок автоматически работает через local storage, не зависая на лавине `PGRST205`.
- Fallback расширен до удалённого хранения через существующую таблицу `settings`: `work_tasks_json`, `work_projects_json`, `work_areas_json`, `work_templates_json` и связанные JSON-ключи теперь живут в Supabase даже до rollout новых таблиц.
- Подтверждено через live REST API, что remote fallback реально заполнен: `work_tasks_json=30`, `work_projects_json=8`, `work_areas_json=7`, `work_templates_json=7`.
- Прогнан ручной browser smoke на свежей версии `v86`: обычный логин, переход в `Задачи` и `Проекты`, рендер новых экранов, фильтров и списков проходит без blocker-level runtime ошибок.

## In Progress
- Подтверждение rollout на реальной normalized Supabase-схеме.

## Next
- Применить SQL из [`migration_tasks_projects_mvp.sql`](/Users/krollipolli/.codex/worktrees/cc3e/RO%20calculator/migration_tasks_projects_mvp.sql), после чего дать приложению автоматически гидратировать новые таблицы из `settings` fallback и перепроверить live CRUD уже на normalized schema.

## Decisions Made
- Стек и архитектурный стиль не менялись: решение построено поверх текущего `index.html + js modules + Supabase/localStorage`.
- `Area` сделана справочной сущностью, а не hardcoded enum, с seed-значениями из PRD.
- Для будущих уведомлений внедрен легкий event/persistence слой вместо полной Telegram-интеграции.
- Для минимальной инвазивности файлы в MVP хранятся в существующем стиле проекта, без нового storage framework.
- Совместимость с legacy tasks приоритетнее строгих DB constraints на первом шаге rollout.
- До выката новых таблиц канонический удалённый backing store для задач/проектов временно сделан через `settings` JSON, потому что этот паттерн уже используется в проекте и не требует service-role миграции ночью.

## Assumptions In Force
- Авторизованный UI smoke можно воспроизводить через существующий client-side session bootstrap для реального аккаунта, не зная его пароль.
- SQL schema будет применяться в той же среде Supabase, где живут текущие данные orders/tasks.
- Каноничным источником текущего execution state считается этот файл вместе с `docs/plans.md`.
- До применения DDL утренний просмотр результата должен идти через новую кодовую ветку + `settings` fallback, а не через отсутствующие таблицы `areas/projects/tasks/...`.

## Commands
```sh
for f in js/*.js; do node --check "$f"; done
node tests/work-management-smoke.js
python3 -m http.server 4173
```

## Current Blockers
- SQL migration еще не подтверждена на живой базе в рамках этой сессии: live Supabase отвечает, но таблицы `areas/projects/tasks/...` там пока отсутствуют.
- Нет сервисного ключа / migration pipeline доступа, чтобы применить DDL из этой сессии напрямую.

## Audit Log
| Date | Milestone | Files | Commands | Result | Next |
| --- | --- | --- | --- | --- | --- |
| 2026-03-13 | M1 | `js/work-management-core.js`, `js/supabase.js`, `migration_tasks_projects_mvp.sql`, `migration_missing_tables.sql`, `supabase_schema.sql` | `for f in js/*.js; do node --check "$f"; done` | pass | Перейти к UI и order integration |
| 2026-03-13 | M2 | `js/tasks.js`, `js/projects.js`, `js/order-detail.js`, `js/app.js`, `js/settings.js`, `index.html`, `css/style.css`, `js/task-events.js` | `for f in js/*.js; do node --check "$f"; done` | pass | Добавить smoke checks и локальный page-load verify |
| 2026-03-13 | M2 | `tests/work-management-smoke.js`, `.github/workflows/deploy-pages.yml` | `node tests/work-management-smoke.js` | pass | Подтвердить rollout на live schema/auth |
| 2026-03-13 | M3 | локальный browser smoke | `python3 -m http.server 4173` + локальное открытие страницы | pass (page-load only) | Применить SQL и прогнать авторизованные сценарии |
| 2026-03-13 | M3 | `js/supabase.js`, `js/app.js`, `index.html` | `node --check js/supabase.js && node --check js/app.js && node tests/work-management-smoke.js` | pass | Перепроверить браузер с cache-bust |
| 2026-03-13 | M3 | browser smoke с `index.html?cb=2` | local auth bootstrap, create task, create project | pass (fallback mode) | Нужен SQL rollout на живой Supabase |
| 2026-03-14 | M3 | `js/supabase.js`, `index.html`, `js/app.js` | live REST readback `work_*_json` + browser smoke на `v86` | pass | Нужен только rollout normalized tables |

## Smoke / Demo Checklist
- [x] Скрипты приложения проходят syntax-check.
- [x] Repo-specific smoke script для work-management helpers проходит.
- [x] Локальная страница загружается без runtime JS errors blocker-уровня.
- [x] Авторизованный локальный browser smoke пройден для create task / create project flows.
- [x] Удалённый fallback в `settings` реально заполнен и читается.
- [ ] Новая normalized схема применена к реальной Supabase-базе.
- [ ] Авторизованный сценарий task/project CRUD пройден вручную на live Supabase schema.
- [ ] Проверена migration safety на реальных legacy tasks.

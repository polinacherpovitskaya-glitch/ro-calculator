# Block 11 — Tasks + Projects + Areas + Gantt Implementation Plan

> **REQUIRED:** мастер-плейбук.

**Goal:** Перенести work management: задачи, проекты, области, гант. Пользователь оценил эту часть как «нужно, но не критично» — переносим с нормальным качеством, без golden-master подхода.

**Source reference:** `js/tasks.js`, `js/projects.js`, `js/gantt.js`, `js/work-management-core.js`, `js/task-events.js`. Также `migration_tasks_projects_mvp.sql`.

**Dependencies:** Block 2 (auth). Может выполняться параллельно с Blocks 7-9 (они не пересекаются).

**Branch:** `block-11-tasks-projects`

---

## File Structure

| File | Action |
|------|--------|
| `ops/db/migrations/009_work_management.sql` | Все таблицы work_* |
| `ops/api/src/routes/tasks.js`, `projects.js`, `areas.js` | API |
| `ops/api/src/routes/work-events.js` | task_comments, task_checklist_items, task_watchers, task_notification_events, work_activity, work_templates |
| `ops/api/test/*` | Tests |
| `ops/scripts/refresh/08-work-management.mjs` | Copy |
| `ops/web/src/views/Tasks(List|)View.vue` | Список + карточка |
| `ops/web/src/views/Projects(List|)View.vue` | Проекты |
| `ops/web/src/views/AreasView.vue` | Области |
| `ops/web/src/views/GanttView.vue` | Гант |

---

## Task 1: SQL миграция

См. `migration_tasks_projects_mvp.sql` в репо как шаблон. Перенести оттуда структуру в `ops/db/migrations/009_work_management.sql`. Скорее всего таблицы:

```sql
CREATE TABLE areas (id BIGINT PRIMARY KEY, name TEXT NOT NULL, color TEXT, is_active BOOLEAN DEFAULT TRUE, extras JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE projects (id BIGINT PRIMARY KEY, name TEXT NOT NULL, area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL, order_id BIGINT, status TEXT DEFAULT 'active', start_date DATE, end_date DATE, extras JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE tasks (id BIGINT PRIMARY KEY, title TEXT NOT NULL, description TEXT, project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL, area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL, status TEXT DEFAULT 'todo', priority TEXT, assignee_id INTEGER REFERENCES employees(id), reporter_id INTEGER REFERENCES employees(id), due_date DATE, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, extras JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE task_comments (id BIGINT PRIMARY KEY, task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE, author_id INTEGER REFERENCES employees(id), body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE task_checklist_items (id BIGINT PRIMARY KEY, task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE, text TEXT NOT NULL, done BOOLEAN DEFAULT FALSE, position INTEGER, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE task_watchers (id BIGSERIAL PRIMARY KEY, task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE, employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE, UNIQUE(task_id, employee_id));

CREATE TABLE task_notification_events (id BIGSERIAL PRIMARY KEY, task_id BIGINT REFERENCES tasks(id), event_type TEXT NOT NULL, payload JSONB DEFAULT '{}', dispatched_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE work_assets (id BIGINT PRIMARY KEY, task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE, name TEXT, url TEXT, mime_type TEXT, size_bytes BIGINT, uploaded_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE work_activity (id BIGSERIAL PRIMARY KEY, task_id BIGINT REFERENCES tasks(id), actor_id INTEGER REFERENCES employees(id), action TEXT NOT NULL, payload JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE work_templates (id BIGINT PRIMARY KEY, name TEXT NOT NULL, kind TEXT, data JSONB NOT NULL, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());

-- Индексы стандартные
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_due ON tasks(due_date) WHERE due_date IS NOT NULL;

INSERT INTO app_meta (id, version) VALUES (1, '009-work-management')
ON CONFLICT (id) DO UPDATE SET version = EXCLUDED.version, applied_at = NOW();
```

- [ ] Commit: `Add work management tables`

---

## Task 2-5: API ресурсов

- `tasks.js` — CRUD + assign + complete + status transitions
- `projects.js` — CRUD
- `areas.js` — CRUD (мало)
- `work-events.js` — comments, checklist items, watchers, notification events, activity, templates

Стандартный auth + idempotency. Тесты ≥ 25.

- [ ] 4 коммита по ресурсам

---

## Task 6: refresh + compare

Скрипт `08-work-management.mjs` — копирует все 9 таблиц.

- [ ] Commit

---

## Task 7-10: Vue экраны

- **TasksListView**: канбан или таблица (выбрать по `js/tasks.js`). Фильтры: status, assignee, project, due_date. Поиск.
- **TaskView** (или модалка): описание, чек-лист, комментарии, вложения, watchers, история активности.
- **ProjectsListView** + **ProjectView**: список проектов + редактор.
- **AreasView**: простая таблица.
- **GanttView**: таймлайн задач/проектов. Использовать существующую gantt-библиотеку (например `frappe-gantt` или `dhtmlx-gantt` бесплатный). В `js/gantt.js` смотри что использует старый код.

- [ ] 5 коммитов

---

## Task 11: Playwright + PR

Сценарий: login → /tasks → создать задачу → добавить комментарий → отметить чек-лист → закрыть → проверить активность.

- [ ] Merge

## Acceptance Criteria

- [ ] API тесты ≥ 30
- [ ] На staging: задачи/проекты/гант работают
- [ ] compare-datasets совпадает

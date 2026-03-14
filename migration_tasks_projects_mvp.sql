-- =============================================
-- Recycle Object — Work Management MVP
-- Projects / Tasks / Areas / Activity / Templates
-- =============================================

CREATE TABLE IF NOT EXISTS areas (
    id BIGINT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#6b7280',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'Другое',
    owner_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    owner_name TEXT DEFAULT '',
    linked_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    linked_order_name TEXT DEFAULT '',
    area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL,
    start_date DATE,
    due_date DATE,
    launch_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active',
    brief TEXT DEFAULT '',
    goal TEXT DEFAULT '',
    result_summary TEXT DEFAULT '',
    created_by BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    created_by_name TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
    id BIGINT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'incoming',
    priority TEXT DEFAULT 'normal',
    reporter_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    reporter_name TEXT DEFAULT '',
    assignee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    assignee_name TEXT DEFAULT '',
    reviewer_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    reviewer_name TEXT DEFAULT '',
    area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    order_name TEXT DEFAULT '',
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    project_title TEXT DEFAULT '',
    china_purchase_id BIGINT REFERENCES china_purchases(id) ON DELETE SET NULL,
    warehouse_item_id BIGINT REFERENCES warehouse_items(id) ON DELETE SET NULL,
    primary_context_kind TEXT DEFAULT 'area',
    due_date DATE,
    due_time TIME,
    waiting_for_text TEXT DEFAULT '',
    sort_index NUMERIC DEFAULT 0,
    parent_task_id BIGINT REFERENCES tasks(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT tasks_context_required CHECK (
        order_id IS NOT NULL OR project_id IS NOT NULL OR area_id IS NOT NULL
    )
);

CREATE TABLE IF NOT EXISTS task_comments (
    id BIGINT PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    author_name TEXT DEFAULT '',
    body TEXT NOT NULL,
    mentions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_assets (
    id BIGINT PRIMARY KEY,
    task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT DEFAULT '',
    url TEXT DEFAULT '',
    file_name TEXT DEFAULT '',
    file_type TEXT DEFAULT '',
    file_size BIGINT DEFAULT 0,
    data_url TEXT DEFAULT '',
    preview_meta JSONB DEFAULT '{}'::jsonb,
    created_by BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    created_by_name TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_checklist_items (
    id BIGINT PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_done BOOLEAN DEFAULT false,
    sort_index NUMERIC DEFAULT 0,
    assignee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_watchers (
    task_id BIGINT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS work_activity (
    id BIGINT PRIMARY KEY,
    task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
    author_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    author_name TEXT DEFAULT '',
    activity_type TEXT DEFAULT 'note',
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_templates (
    id BIGINT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    title TEXT DEFAULT '',
    project_type TEXT DEFAULT '',
    description TEXT DEFAULT '',
    default_priority TEXT DEFAULT 'normal',
    suggested_area_id BIGINT REFERENCES areas(id) ON DELETE SET NULL,
    checklist_items JSONB DEFAULT '[]'::jsonb,
    suggested_subtasks JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_notification_events (
    id BIGINT PRIMARY KEY,
    task_id BIGINT REFERENCES tasks(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_linked_order ON projects(linked_order_id);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_work_assets_task ON work_assets(task_id);
CREATE INDEX IF NOT EXISTS idx_work_assets_project ON work_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist_items(task_id);
CREATE INDEX IF NOT EXISTS idx_work_activity_task ON work_activity(task_id);
CREATE INDEX IF NOT EXISTS idx_work_activity_project ON work_activity(project_id);
CREATE INDEX IF NOT EXISTS idx_notification_events_task ON task_notification_events(task_id);

INSERT INTO areas (id, slug, name, color)
VALUES
    (9101, 'marketing', 'Маркетинг', '#2563eb'),
    (9102, 'design', 'Дизайн', '#7c3aed'),
    (9103, 'warehouse', 'Склад', '#ca8a04'),
    (9104, 'china', 'China', '#ea580c'),
    (9105, 'website', 'Сайт', '#0f766e'),
    (9106, 'finance', 'Финансы', '#16a34a'),
    (9107, 'general', 'Общее', '#6b7280')
ON CONFLICT (id) DO UPDATE
SET slug = EXCLUDED.slug,
    name = EXCLUDED.name,
    color = EXCLUDED.color,
    updated_at = NOW();

INSERT INTO work_templates (id, kind, name, title, project_type, description, default_priority, suggested_area_id, checklist_items, suggested_subtasks)
VALUES
    (9201, 'task', 'Задача по заказу', 'Новая задача по заказу', '', 'Опишите, что нужно сделать по заказу, какие есть ограничения и какой ожидается результат.', 'normal', 9107, '["Уточнить вводные","Собрать материалы","Подготовить результат"]'::jsonb, '[]'::jsonb),
    (9202, 'project', 'Съёмка', 'Съёмка', 'Съёмка', 'Организовать съёмку, согласовать визуал, тайминг и итоговые материалы.', 'normal', 9101, '["Бриф","Референсы","План съёмки","Съёмка","Отбор","Финальные материалы"]'::jsonb, '["Собрать мудборд","Согласовать дату","Подготовить список кадров"]'::jsonb),
    (9203, 'project', 'Маркетинговая акция', 'Маркетинговая акция', 'Маркетинговая акция', 'Подготовить запуск акции, визуалы, контент и дату публикации.', 'normal', 9101, '["Цель акции","Механика","Визуалы","Контент-план","Дата запуска"]'::jsonb, '["Согласовать скидки","Подготовить креативы","Проверить сайт"]'::jsonb),
    (9204, 'task', 'Дизайн-задача', 'Новая дизайн-задача', '', 'Опишите задачу для дизайна, формат результата и дедлайн.', 'high', 9102, '["Собрать бриф","Приложить референсы","Согласовать макет"]'::jsonb, '[]'::jsonb),
    (9205, 'task', 'Закупка в China', 'Новая задача по China', '', 'Что нужно найти или закупить, ссылки, бюджет и требования к доставке.', 'normal', 9104, '["Найти поставщика","Проверить условия","Согласовать закупку"]'::jsonb, '[]'::jsonb),
    (9206, 'task', 'Задача по складу', 'Новая задача по складу', '', 'Что нужно сделать на складе, какой результат и срок.', 'normal', 9103, '["Проверить остатки","Собрать фото/референсы","Зафиксировать результат"]'::jsonb, '[]'::jsonb),
    (9207, 'task', 'Задача по сайту', 'Новая задача по сайту', '', 'Опишите, что нужно изменить на сайте и какой результат ожидается.', 'high', 9105, '["Проверить ТЗ","Согласовать изменения","Проверить после выкладки"]'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE
SET kind = EXCLUDED.kind,
    name = EXCLUDED.name,
    title = EXCLUDED.title,
    project_type = EXCLUDED.project_type,
    description = EXCLUDED.description,
    default_priority = EXCLUDED.default_priority,
    suggested_area_id = EXCLUDED.suggested_area_id,
    checklist_items = EXCLUDED.checklist_items,
    suggested_subtasks = EXCLUDED.suggested_subtasks,
    updated_at = NOW();

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_watchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notification_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
CREATE POLICY "anon_all_areas" ON areas FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_projects" ON projects FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_tasks_v2" ON tasks FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_task_comments" ON task_comments FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_work_assets" ON work_assets FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_task_checklist_items" ON task_checklist_items FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_task_watchers" ON task_watchers FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_work_activity" ON work_activity FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_work_templates" ON work_templates FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
CREATE POLICY "anon_all_task_notification_events" ON task_notification_events FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.WorkManagementCore = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    const AREA_SEEDS = [
        { id: 9101, slug: 'marketing', name: 'Маркетинг', color: '#2563eb' },
        { id: 9102, slug: 'design', name: 'Дизайн', color: '#7c3aed' },
        { id: 9103, slug: 'warehouse', name: 'Склад', color: '#ca8a04' },
        { id: 9104, slug: 'china', name: 'China', color: '#ea580c' },
        { id: 9105, slug: 'website', name: 'Сайт', color: '#0f766e' },
        { id: 9106, slug: 'finance', name: 'Финансы', color: '#16a34a' },
        { id: 9107, slug: 'general', name: 'Общее', color: '#6b7280' },
    ];

    const PROJECT_TYPE_OPTIONS = [
        'Съёмка',
        'Маркетинговая акция',
        'Контент / SMM',
        'Дизайн',
        'Закупка в сток',
        'Сайт / разработка',
        'Внутренний проект',
        'Другое',
    ];

    const PROJECT_STATUS_OPTIONS = [
        { value: 'active', label: 'Активный' },
        { value: 'on_hold', label: 'На паузе' },
        { value: 'done', label: 'Завершён' },
        { value: 'archived', label: 'В архиве' },
    ];

    const TASK_STATUS_OPTIONS = [
        { value: 'incoming', label: 'Новая' },
        { value: 'planned', label: 'Запланировано' },
        { value: 'in_progress', label: 'В работе' },
        { value: 'review', label: 'На согласовании' },
        { value: 'waiting', label: 'Ждём' },
        { value: 'done', label: 'Готово' },
        { value: 'cancelled', label: 'Отменено' },
    ];

    const TASK_PRIORITY_OPTIONS = [
        { value: 'low', label: 'Низкий', weight: 1 },
        { value: 'normal', label: 'Обычный', weight: 2 },
        { value: 'high', label: 'Высокий', weight: 3 },
        { value: 'urgent', label: 'Срочно', weight: 4 },
    ];

    const TASK_CONTEXT_OPTIONS = [
        { value: 'order', label: 'Заказ' },
        { value: 'project', label: 'Проект' },
        { value: 'area', label: 'Направление' },
    ];

    const TEMPLATE_SEEDS = [
        {
            kind: 'task',
            name: 'Задача по заказу',
            title: 'Новая задача по заказу',
            description: 'Опишите, что нужно сделать по заказу, какие есть ограничения и какой ожидается результат.',
            default_priority: 'normal',
            suggested_area_slug: 'general',
            checklist_items: ['Уточнить вводные', 'Собрать материалы', 'Подготовить результат'],
            suggested_subtasks: [],
        },
        {
            kind: 'project',
            name: 'Съёмка',
            title: 'Съёмка',
            project_type: 'Съёмка',
            description: 'Организовать съёмку, согласовать визуал, тайминг и итоговые материалы.',
            suggested_area_slug: 'marketing',
            checklist_items: ['Бриф', 'Референсы', 'План съёмки', 'Съёмка', 'Отбор', 'Финальные материалы'],
            suggested_subtasks: ['Собрать мудборд', 'Согласовать дату', 'Подготовить список кадров'],
        },
        {
            kind: 'project',
            name: 'Маркетинговая акция',
            title: 'Маркетинговая акция',
            project_type: 'Маркетинговая акция',
            description: 'Подготовить запуск акции, визуалы, контент и дату публикации.',
            suggested_area_slug: 'marketing',
            checklist_items: ['Цель акции', 'Механика', 'Визуалы', 'Контент-план', 'Дата запуска'],
            suggested_subtasks: ['Согласовать скидки', 'Подготовить креативы', 'Проверить сайт'],
        },
        {
            kind: 'task',
            name: 'Дизайн-задача',
            title: 'Новая дизайн-задача',
            description: 'Опишите задачу для дизайна, формат результата и дедлайн.',
            default_priority: 'high',
            suggested_area_slug: 'design',
            checklist_items: ['Собрать бриф', 'Приложить референсы', 'Согласовать макет'],
            suggested_subtasks: [],
        },
        {
            kind: 'task',
            name: 'Закупка в China',
            title: 'Новая задача по China',
            description: 'Что нужно найти или закупить, ссылки, бюджет и требования к доставке.',
            default_priority: 'normal',
            suggested_area_slug: 'china',
            checklist_items: ['Найти поставщика', 'Проверить условия', 'Согласовать закупку'],
            suggested_subtasks: [],
        },
        {
            kind: 'task',
            name: 'Задача по складу',
            title: 'Новая задача по складу',
            description: 'Что нужно сделать на складе, какой результат и срок.',
            default_priority: 'normal',
            suggested_area_slug: 'warehouse',
            checklist_items: ['Проверить остатки', 'Собрать фото/референсы', 'Зафиксировать результат'],
            suggested_subtasks: [],
        },
        {
            kind: 'task',
            name: 'Задача по сайту',
            title: 'Новая задача по сайту',
            description: 'Опишите, что нужно изменить на сайте и какой результат ожидается.',
            default_priority: 'high',
            suggested_area_slug: 'website',
            checklist_items: ['Проверить ТЗ', 'Согласовать изменения', 'Проверить после выкладки'],
            suggested_subtasks: [],
        },
    ];

    function slugify(value) {
        return String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9а-яё]+/gi, '-')
            .replace(/^-+|-+$/g, '');
    }

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function isoDate(value) {
        if (!value) return null;
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toISOString().slice(0, 10);
    }

    function pad2(value) {
        const num = parseInt(value, 10);
        if (!Number.isFinite(num)) return '00';
        return String(num).padStart(2, '0');
    }

    function extractTime(value) {
        if (!value) return null;
        const match = String(value).match(/(\d{1,2}):(\d{2})/);
        if (!match) return null;
        return `${pad2(match[1])}:${pad2(match[2])}`;
    }

    function parseLegacyDeadline(deadline) {
        if (!deadline) return { due_date: null, due_time: null };
        const source = String(deadline).trim();
        const lastChunk = source.includes('→')
            ? source.split('→').map(part => part.trim()).filter(Boolean).pop()
            : source;
        const parsedDate = isoDate(lastChunk);
        return {
            due_date: parsedDate,
            due_time: extractTime(lastChunk),
        };
    }

    function mapLegacyTaskStatus(status) {
        const normalized = normalizeText(status);
        if (normalized === 'in progress') return 'in_progress';
        if (normalized === 'done') return 'done';
        if (normalized === 'cancelled') return 'cancelled';
        return 'incoming';
    }

    function inferAreaSlugFromText(text) {
        const normalized = normalizeText(text);
        if (!normalized) return 'general';
        if (/(дизайн|макет|баннер|визуал|креатив)/.test(normalized)) return 'design';
        if (/(маркет|smm|рилс|контент|акци|скидк|реклам)/.test(normalized)) return 'marketing';
        if (/(склад|короб|упаков|фурнитур|резерв|остатк)/.test(normalized)) return 'warehouse';
        if (/(china|китай|1688|закупк|поставщик)/.test(normalized)) return 'china';
        if (/(сайт|лендинг|страниц|seo|frontend|разработк)/.test(normalized)) return 'website';
        if (/(финанс|счет|акт|оплат|бюджет)/.test(normalized)) return 'finance';
        return 'general';
    }

    function priorityWeight(priority) {
        return (TASK_PRIORITY_OPTIONS.find(item => item.value === priority) || TASK_PRIORITY_OPTIONS[1]).weight;
    }

    function getTaskStatusLabel(status) {
        return (TASK_STATUS_OPTIONS.find(item => item.value === status) || TASK_STATUS_OPTIONS[0]).label;
    }

    function getProjectStatusLabel(status) {
        return (PROJECT_STATUS_OPTIONS.find(item => item.value === status) || PROJECT_STATUS_OPTIONS[0]).label;
    }

    function ensurePrimaryContextKind(task, project) {
        if (task.primary_context_kind === 'project' && task.project_id) return 'project';
        if (task.primary_context_kind === 'order' && task.order_id) return 'order';
        if (task.primary_context_kind === 'area' && task.area_id) return 'area';
        if (task.project_id) return 'project';
        if (task.order_id || (project && project.linked_order_id)) return 'order';
        return 'area';
    }

    function isTaskFinished(task) {
        return task && (task.status === 'done' || task.status === 'cancelled');
    }

    function isTaskOverdue(task, nowDate) {
        if (!task || !task.due_date || isTaskFinished(task)) return false;
        const now = nowDate ? new Date(nowDate) : new Date();
        const today = isoDate(now);
        return String(task.due_date) < String(today);
    }

    function buildTaskDueIso(task) {
        if (!task || !task.due_date) return '';
        if (task.due_time) return `${task.due_date}T${task.due_time}`;
        return `${task.due_date}T23:59`;
    }

    function generateEntityId() {
        return Date.now() + Math.floor(Math.random() * 100000);
    }

    function sortByName(list, field) {
        return (list || []).slice().sort((a, b) => String(a?.[field] || '').localeCompare(String(b?.[field] || ''), 'ru'));
    }

    function extractMentionedEmployeeIds(body, employees) {
        const normalizedBody = normalizeText(body);
        if (!normalizedBody || !Array.isArray(employees) || employees.length === 0) return [];
        return employees
            .slice()
            .sort((a, b) => String(b.name || '').length - String(a.name || '').length)
            .filter(emp => emp && emp.id != null && normalizedBody.includes(`@${normalizeText(emp.name)}`))
            .map(emp => emp.id);
    }

    return {
        AREA_SEEDS,
        PROJECT_TYPE_OPTIONS,
        PROJECT_STATUS_OPTIONS,
        TASK_STATUS_OPTIONS,
        TASK_PRIORITY_OPTIONS,
        TASK_CONTEXT_OPTIONS,
        TEMPLATE_SEEDS,
        slugify,
        normalizeText,
        isoDate,
        pad2,
        parseLegacyDeadline,
        mapLegacyTaskStatus,
        inferAreaSlugFromText,
        priorityWeight,
        getTaskStatusLabel,
        getProjectStatusLabel,
        ensurePrimaryContextKind,
        isTaskFinished,
        isTaskOverdue,
        buildTaskDueIso,
        generateEntityId,
        sortByName,
        extractMentionedEmployeeIds,
    };
}));

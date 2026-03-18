(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    root.BugReportCore = api;
}(typeof window !== 'undefined' ? window : globalThis, function () {
    const BUG_SEVERITY_OPTIONS = [
        { value: 'low', label: 'Низкий' },
        { value: 'medium', label: 'Средний' },
        { value: 'high', label: 'Высокий' },
        { value: 'critical', label: 'Критичный' },
    ];

    const BUG_SECTION_CATALOG = [
        {
            key: 'orders',
            label: 'Заказы',
            routeAliases: ['orders', 'order-detail'],
            subsections: [
                { key: 'list', label: 'Список заказов' },
                { key: 'detail', label: 'Карточка заказа' },
                { key: 'tasks_tab', label: 'Вкладка задач' },
                { key: 'files_tab', label: 'Вкладка файлов' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'calculator',
            label: 'Калькулятор',
            routeAliases: ['calculator'],
            subsections: [
                { key: 'order_header', label: 'Шапка заказа' },
                { key: 'items', label: 'Блок изделий' },
                { key: 'hardware', label: 'Фурнитура' },
                { key: 'packaging', label: 'Упаковка' },
                { key: 'save', label: 'Сохранение / автосейв' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'tasks',
            label: 'Задачи',
            routeAliases: ['tasks'],
            subsections: [
                { key: 'list', label: 'Список / лента' },
                { key: 'kanban', label: 'Канбан' },
                { key: 'calendar', label: 'Календарь' },
                { key: 'drawer', label: 'Карточка задачи' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'projects',
            label: 'Проекты',
            routeAliases: ['projects'],
            subsections: [
                { key: 'list', label: 'Список проектов' },
                { key: 'detail', label: 'Карточка проекта' },
                { key: 'assets', label: 'Файлы и ссылки' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'production_plan',
            label: 'План производства',
            routeAliases: ['production-plan'],
            subsections: [
                { key: 'board', label: 'Основной экран' },
                { key: 'attachments', label: 'Вложения' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'warehouse',
            label: 'Склад',
            routeAliases: ['warehouse'],
            subsections: [
                { key: 'table', label: 'Таблица склада' },
                { key: 'item_form', label: 'Карточка позиции' },
                { key: 'shipments', label: 'Приемки из Китая' },
                { key: 'audit', label: 'Инвентаризация' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'marketplaces',
            label: 'B2C продажи',
            routeAliases: ['marketplaces'],
            subsections: [
                { key: 'sets', label: 'Наборы' },
                { key: 'builder', label: 'Сборщик заказа в производство' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'china',
            label: 'Китай',
            routeAliases: ['china'],
            subsections: [
                { key: 'pipeline', label: 'Пайплайн закупок' },
                { key: 'purchase_form', label: 'Карточка закупки' },
                { key: 'catalog', label: 'Каталог China' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'analytics',
            label: 'Аналитика и отчеты',
            routeAliases: ['analytics', 'factual', 'import', 'gantt', 'timetrack'],
            subsections: [
                { key: 'dashboard', label: 'Основной экран' },
                { key: 'charts', label: 'Графики / таблицы' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'settings',
            label: 'Настройки и справочники',
            routeAliases: ['settings', 'molds', 'colors'],
            subsections: [
                { key: 'employees', label: 'Сотрудники / доступы' },
                { key: 'catalogs', label: 'Справочники / шаблоны' },
                { key: 'other', label: 'Другое' },
            ],
        },
        {
            key: 'general',
            label: 'Другое',
            routeAliases: ['bugs'],
            subsections: [
                { key: 'other', label: 'Другое' },
            ],
        },
    ];

    function cloneSection(section) {
        return {
            ...section,
            subsections: Array.isArray(section?.subsections) ? section.subsections.map(item => ({ ...item })) : [],
        };
    }

    function normalizeText(value) {
        return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    function safeText(value) {
        return String(value || '').replace(/\r\n/g, '\n').trim();
    }

    function getSectionCatalog() {
        return BUG_SECTION_CATALOG.map(cloneSection);
    }

    function getSectionByKey(sectionKey) {
        return BUG_SECTION_CATALOG.find(item => item.key === sectionKey) || BUG_SECTION_CATALOG.find(item => item.key === 'general') || null;
    }

    function getSubsectionByKey(sectionKey, subsectionKey) {
        const section = getSectionByKey(sectionKey);
        if (!section) return null;
        return (section.subsections || []).find(item => item.key === subsectionKey) || null;
    }

    function severityLabel(value) {
        return (BUG_SEVERITY_OPTIONS.find(item => item.value === value) || BUG_SEVERITY_OPTIONS[1]).label;
    }

    function routeToken(route) {
        const raw = String(route || '').trim().replace(/^#/, '');
        if (!raw) return '';
        return raw.split('/').filter(Boolean)[0] || '';
    }

    function inferSectionFromRoute(route) {
        const token = normalizeText(routeToken(route));
        if (!token) return getSectionByKey('general');
        return BUG_SECTION_CATALOG.find(section => (section.routeAliases || []).some(alias => normalizeText(alias) === token))
            || getSectionByKey('general');
    }

    function inferSubsectionKey(sectionKey, route) {
        const token = normalizeText(routeToken(route));
        if (!token) return 'other';
        if (sectionKey === 'orders' && token === 'order-detail') return 'detail';
        return 'other';
    }

    function summarizeBrowser(userAgent) {
        const ua = String(userAgent || '');
        if (!ua) return '';
        if (/Edg\//.test(ua)) return 'Edge';
        if (/OPR\//.test(ua) || /Opera/.test(ua)) return 'Opera';
        if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
        if (/Firefox\//.test(ua)) return 'Firefox';
        if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
        return 'Не определен';
    }

    function summarizeOs(userAgent) {
        const ua = String(userAgent || '');
        if (!ua) return '';
        if (/Windows/i.test(ua)) return 'Windows';
        if (/Mac OS X/i.test(ua)) return 'macOS';
        if (/Android/i.test(ua)) return 'Android';
        if (/(iPhone|iPad|iPod)/i.test(ua)) return 'iOS';
        if (/Linux/i.test(ua)) return 'Linux';
        return '';
    }

    function buildBugTaskTitle(report) {
        const section = safeText(report?.section_name || getSectionByKey(report?.section_key)?.label);
        const subsection = safeText(report?.subsection_name || getSubsectionByKey(report?.section_key, report?.subsection_key)?.label);
        const title = safeText(report?.title);
        const context = [section, subsection].filter(Boolean).join(' / ');
        if (!context) return `[Баг] ${title || 'Без названия'}`;
        if (!title) return `[Баг] ${context}`;
        return `[Баг] ${context} — ${title}`;
    }

    function buildBugSummary(report) {
        const lines = [];
        if (report?.actual_result) lines.push(`Проблема: ${safeText(report.actual_result)}`);
        if (report?.expected_result) lines.push(`Ожидалось: ${safeText(report.expected_result)}`);
        if (report?.steps_to_reproduce) lines.push(`Шаги: ${safeText(report.steps_to_reproduce)}`);
        return lines.join('\n\n');
    }

    function formatAssetLine(asset, index) {
        const kind = String(asset?.kind || '').trim();
        const title = safeText(asset?.title || asset?.file_name || asset?.url || `Вложение ${index + 1}`);
        const url = safeText(asset?.url || asset?.data_url || '');
        if (!url) return `${index + 1}. ${title}`;
        if (kind === 'file') return `${index + 1}. ${title}: ${url}`;
        return `${index + 1}. Ссылка ${title}: ${url}`;
    }

    function buildCodexPrompt(input) {
        const task = input?.task || {};
        const report = input?.report || {};
        const assets = Array.isArray(input?.assets) ? input.assets : [];
        const repoPath = safeText(input?.repoPath);
        const route = safeText(report.page_route);
        const lines = [
            'Нужно разобраться и исправить баг в приложении Recycle Object.',
            repoPath ? `Рабочий репозиторий: ${repoPath}` : '',
            '',
            `Заголовок тикета: ${safeText(task.title || buildBugTaskTitle(report) || 'Без названия')}`,
            `Серьезность: ${severityLabel(report.severity)}`,
            `Раздел: ${safeText(report.section_name || getSectionByKey(report.section_key)?.label || 'Не указан')}`,
            `Подраздел: ${safeText(report.subsection_name || getSubsectionByKey(report.section_key, report.subsection_key)?.label || 'Не указан')}`,
            route ? `Маршрут / hash: ${route}` : '',
            report.page_url ? `URL: ${safeText(report.page_url)}` : '',
            report.app_version ? `Версия приложения: ${safeText(report.app_version)}` : '',
            report.browser ? `Браузер: ${safeText(report.browser)}` : '',
            report.os ? `ОС: ${safeText(report.os)}` : '',
            report.viewport ? `Viewport: ${safeText(report.viewport)}` : '',
            report.submitted_by_name ? `Сообщил: ${safeText(report.submitted_by_name)}` : '',
            '',
            'Что не работает:',
            safeText(report.actual_result) || 'Не указано',
            '',
            'Что ожидалось:',
            safeText(report.expected_result) || 'Не указано',
            '',
            'Шаги для воспроизведения:',
            safeText(report.steps_to_reproduce) || 'Не указано',
            '',
            assets.length > 0 ? 'Вложения:' : '',
            assets.length > 0 ? assets.map(formatAssetLine).join('\n') : '',
            '',
            'Что нужно сделать:',
            '1. Найти причину бага в коде.',
            '2. Исправить поведение без побочных регрессий.',
            '3. Проверить затронутый сценарий и соседние сценарии.',
            '4. Кратко описать, что было сломано и как это исправлено.',
        ];
        return lines.filter((line, index, arr) => {
            if (line !== '') return true;
            return arr[index - 1] !== '';
        }).join('\n').trim();
    }

    return {
        BUG_SEVERITY_OPTIONS,
        BUG_SECTION_CATALOG,
        normalizeText,
        safeText,
        getSectionCatalog,
        getSectionByKey,
        getSubsectionByKey,
        inferSectionFromRoute,
        inferSubsectionKey,
        summarizeBrowser,
        summarizeOs,
        severityLabel,
        buildBugTaskTitle,
        buildBugSummary,
        buildCodexPrompt,
    };
}));

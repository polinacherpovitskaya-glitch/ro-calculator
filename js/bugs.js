const BugReports = {
    bundle: null,
    employees: [],
    isLoading: false,
    filters: {
        search: '',
        severity: '',
        section: '',
        status: 'open',
    },
    quickDraft: null,
    _overlayOpen: false,
    submittingPrefixes: new Set(),
    _draftSaveTimer: null,
    _draftRestored: false,

    async load() {
        this.isLoading = true;
        this.render();
        try {
            await this.refreshData();
        } finally {
            this.isLoading = false;
            this.render();
        }
    },

    async refreshData() {
        const [bundle, employees] = await Promise.all([
            loadWorkBundle(),
            loadEmployees(),
        ]);
        this.bundle = this._hydrateBundle(bundle);
        this.employees = employees || [];
    },

    _hydrateBundle(bundle) {
        const next = bundle && typeof bundle === 'object' ? { ...bundle } : {};
        next.tasks = Array.isArray(next.tasks) ? next.tasks.slice() : [];
        const reports = Array.isArray(next.bugReports) ? next.bugReports.map(report => ({ ...report })) : [];
        const reportTaskIds = new Set(
            reports
                .map(report => String(report?.task_id || '').trim())
                .filter(Boolean)
        );

        next.tasks.forEach(task => {
            if (!this._isBugLikeTask(task)) return;
            const taskId = String(task?.id || '').trim();
            if (!taskId || reportTaskIds.has(taskId)) return;
            const synthetic = this._buildSyntheticBugReport(task);
            if (!synthetic) return;
            reports.push(synthetic);
            reportTaskIds.add(taskId);
        });

        next.bugReports = reports.sort((a, b) => String(b?.created_at || '').localeCompare(String(a?.created_at || '')));
        return next;
    },

    _isBugLikeTask(task) {
        const title = String(task?.title || '').trim();
        if (/^\[баг\]/i.test(title)) return true;
        return String(task?.type || '').trim().toLowerCase() === 'bug';
    },

    _extractBugTaskDescriptionFields(description) {
        const fields = {
            actual_result: '',
            expected_result: '',
            steps_to_reproduce: '',
            page_route: '',
            page_url: '',
            browser: '',
            os: '',
            viewport: '',
            severity: '',
            submitted_by_name: '',
        };
        String(description || '')
            .split(/\n\s*\n/)
            .map(block => String(block || '').trim())
            .filter(Boolean)
            .forEach(block => {
                if (/^проблема:/i.test(block)) fields.actual_result = block.replace(/^проблема:\s*/i, '').trim();
                else if (/^ожидалось:/i.test(block)) fields.expected_result = block.replace(/^ожидалось:\s*/i, '').trim();
                else if (/^шаги:/i.test(block)) fields.steps_to_reproduce = block.replace(/^шаги:\s*/i, '').trim();
                else if (/^маршрут\s*\/\s*hash:/i.test(block)) fields.page_route = block.replace(/^маршрут\s*\/\s*hash:\s*/i, '').trim();
                else if (/^url:/i.test(block)) fields.page_url = block.replace(/^url:\s*/i, '').trim();
                else if (/^браузер:/i.test(block)) fields.browser = block.replace(/^браузер:\s*/i, '').trim();
                else if (/^ос:/i.test(block)) fields.os = block.replace(/^ос:\s*/i, '').trim();
                else if (/^viewport:/i.test(block)) fields.viewport = block.replace(/^viewport:\s*/i, '').trim();
                else if (/^серьезность:/i.test(block)) fields.severity = block.replace(/^серьезность:\s*/i, '').trim().toLowerCase();
                else if (/^сообщил:/i.test(block)) fields.submitted_by_name = block.replace(/^сообщил:\s*/i, '').trim();
            });
        return fields;
    },

    _findSectionByLabel(label) {
        const normalized = BugReportCore.normalizeText(label);
        if (!normalized) return null;
        return (BugReportCore.getSectionCatalog() || []).find(section =>
            BugReportCore.normalizeText(section?.label) === normalized
        ) || null;
    },

    _findSubsectionByLabel(sectionKey, label) {
        const normalized = BugReportCore.normalizeText(label);
        if (!normalized) return null;
        const section = BugReportCore.getSectionByKey(sectionKey);
        return (section?.subsections || []).find(item =>
            BugReportCore.normalizeText(item?.label) === normalized
        ) || null;
    },

    _parseBugTaskTitle(task) {
        const rawTitle = String(task?.title || '').trim();
        const stripped = rawTitle.replace(/^\[баг\]\s*/i, '').trim();
        const match = stripped.match(/^(.+?)\s+—\s+(.+)$/);
        const context = match ? String(match[1] || '').trim() : '';
        const title = match ? String(match[2] || '').trim() : stripped;
        const contextParts = context
            ? context.split(/\s*\/\s*/).map(part => String(part || '').trim()).filter(Boolean)
            : [];
        const section = contextParts.length > 0 ? this._findSectionByLabel(contextParts[0]) : null;
        const subsection = section && contextParts.length > 1
            ? this._findSubsectionByLabel(section.key, contextParts[1])
            : null;
        return {
            title: title || stripped || rawTitle,
            section,
            subsection,
        };
    },

    _severityFromTask(task, parsedSeverity) {
        const explicit = String(parsedSeverity || '').trim().toLowerCase();
        if (['low', 'medium', 'high', 'critical'].includes(explicit)) return explicit;
        const priority = String(task?.priority || '').trim().toLowerCase();
        if (priority === 'urgent') return 'critical';
        if (priority === 'high') return 'high';
        if (priority === 'low') return 'low';
        return 'medium';
    },

    _buildSyntheticBugReport(task) {
        if (!task || !task.id) return null;
        const parsedTitle = this._parseBugTaskTitle(task);
        const parsedDescription = this._extractBugTaskDescriptionFields(task.description);
        const inferredSection = parsedTitle.section || BugReportCore.inferSectionFromRoute(parsedDescription.page_route);
        const section = inferredSection || BugReportCore.getSectionByKey('general');
        const subsection = parsedTitle.subsection
            || BugReportCore.getSubsectionByKey(section?.key, BugReportCore.inferSubsectionKey(section?.key, parsedDescription.page_route))
            || BugReportCore.getSubsectionByKey(section?.key, 'other');
        return {
            id: `task:${task.id}`,
            task_id: Number(task.id),
            title: parsedTitle.title,
            section_key: section?.key || 'general',
            section_name: section?.label || 'Другое',
            subsection_key: subsection?.key || 'other',
            subsection_name: subsection?.label || 'Другое',
            page_route: parsedDescription.page_route || '',
            page_url: parsedDescription.page_url || '',
            app_version: '',
            browser: parsedDescription.browser || '',
            os: parsedDescription.os || '',
            viewport: parsedDescription.viewport || '',
            steps_to_reproduce: parsedDescription.steps_to_reproduce || '',
            expected_result: parsedDescription.expected_result || '',
            actual_result: parsedDescription.actual_result || String(task.description || '').trim(),
            severity: this._severityFromTask(task, parsedDescription.severity),
            codex_prompt: '',
            codex_status: '',
            codex_result: '',
            codex_error: '',
            submitted_by: task.created_by || null,
            submitted_by_name: parsedDescription.submitted_by_name || task.created_by_name || task.author_name || '',
            created_at: task.created_at || new Date().toISOString(),
            updated_at: task.updated_at || task.created_at || new Date().toISOString(),
            synthetic: true,
        };
    },

    esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    currentRoute() {
        const raw = window.location.hash || '';
        return raw === '#bugs' ? '' : raw;
    },

    currentPageUrl() {
        try {
            return window.location.href || '';
        } catch (error) {
            return '';
        }
    },

    draftStorageKey() {
        return `ro_bug_report_draft_v1:${App?.currentEmployeeId || 'guest'}`;
    },

    draftTtlMs() {
        return 6 * 60 * 60 * 1000;
    },

    meaningfulDraft(draft) {
        if (!draft || typeof draft !== 'object') return false;
        return [
            draft.title,
            draft.actual_result,
            draft.expected_result,
            draft.steps_to_reproduce,
            draft.extra_link,
        ].some(value => String(value || '').trim());
    },

    readStoredDraft() {
        try {
            const raw = localStorage.getItem(this.draftStorageKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.saved_at || (Date.now() - Number(parsed.saved_at)) > this.draftTtlMs()) {
                localStorage.removeItem(this.draftStorageKey());
                return null;
            }
            return parsed.draft || null;
        } catch (error) {
            return null;
        }
    },

    persistStoredDraft(draft) {
        try {
            if (!this.meaningfulDraft(draft)) {
                localStorage.removeItem(this.draftStorageKey());
                return;
            }
            localStorage.setItem(this.draftStorageKey(), JSON.stringify({
                saved_at: Date.now(),
                draft,
            }));
        } catch (error) {
            console.warn('[BugReports] draft persist failed:', error);
        }
    },

    clearStoredDraft() {
        clearTimeout(this._draftSaveTimer);
        this._draftSaveTimer = null;
        this._draftRestored = false;
        try {
            localStorage.removeItem(this.draftStorageKey());
        } catch (error) {
            console.warn('[BugReports] draft clear failed:', error);
        }
    },

    currentContextDraft(preset = {}) {
        const storedDraft = Object.keys(preset || {}).length === 0 ? this.readStoredDraft() : null;
        this._draftRestored = !!storedDraft;
        const baseDraft = storedDraft || {};
        const route = preset.page_route != null ? preset.page_route : (baseDraft.page_route || this.currentRoute());
        const inferredSection = preset.section_key
            ? BugReportCore.getSectionByKey(preset.section_key)
            : BugReportCore.inferSectionFromRoute(route);
        const sectionKey = preset.section_key || baseDraft.section_key || inferredSection?.key || 'general';
        const subsectionKey = preset.subsection_key || baseDraft.subsection_key || BugReportCore.inferSubsectionKey(sectionKey, route);
        return {
            title: preset.title || baseDraft.title || '',
            section_key: sectionKey,
            section_name: preset.section_name || baseDraft.section_name || BugReportCore.getSectionByKey(sectionKey)?.label || '',
            subsection_key: subsectionKey,
            subsection_name: preset.subsection_name || baseDraft.subsection_name || BugReportCore.getSubsectionByKey(sectionKey, subsectionKey)?.label || '',
            page_route: route,
            page_url: preset.page_url || baseDraft.page_url || this.currentPageUrl(),
            browser: preset.browser || baseDraft.browser || BugReportCore.summarizeBrowser(navigator.userAgent),
            os: preset.os || baseDraft.os || BugReportCore.summarizeOs(navigator.userAgent),
            viewport: preset.viewport || baseDraft.viewport || `${window.innerWidth || 0}x${window.innerHeight || 0}`,
            app_version: preset.app_version || baseDraft.app_version || (typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''),
            severity: preset.severity || baseDraft.severity || 'medium',
            actual_result: preset.actual_result || baseDraft.actual_result || '',
            expected_result: preset.expected_result || baseDraft.expected_result || '',
            steps_to_reproduce: preset.steps_to_reproduce || baseDraft.steps_to_reproduce || '',
            extra_link: preset.extra_link || baseDraft.extra_link || '',
        };
    },

    pageReports() {
        const tasksById = new Map((this.bundle?.tasks || []).map(task => [String(task.id), task]));
        const assetsByTask = new Map();
        (this.bundle?.assets || []).forEach(asset => {
            const key = String(asset.task_id || '');
            if (!key) return;
            const bucket = assetsByTask.get(key) || [];
            bucket.push(asset);
            assetsByTask.set(key, bucket);
        });
        return (this.bundle?.bugReports || [])
            .map(report => ({
                report,
                task: tasksById.get(String(report.task_id || '')) || null,
                assets: assetsByTask.get(String(report.task_id || '')) || [],
            }))
            .sort((a, b) => String(b.report?.created_at || '').localeCompare(String(a.report?.created_at || '')));
    },

    filteredReports() {
        const search = BugReportCore.normalizeText(this.filters.search);
        return this.pageReports().filter(entry => {
            const task = entry.task || {};
            const report = entry.report || {};
            if (this.filters.severity && report.severity !== this.filters.severity) return false;
            if (this.filters.section && report.section_key !== this.filters.section) return false;
            if (this.filters.status === 'open' && this.isTaskClosed(task)) return false;
            if (this.filters.status === 'closed' && !this.isTaskClosed(task)) return false;
            if (!search) return true;
            const haystack = [
                task.title,
                report.title,
                report.actual_result,
                report.expected_result,
                report.steps_to_reproduce,
                report.section_name,
                report.subsection_name,
                report.page_route,
            ].map(BugReportCore.normalizeText).join(' ');
            return haystack.includes(search);
        });
    },

    isTaskClosed(task) {
        return task && (task.status === 'done' || task.status === 'cancelled');
    },

    openStats() {
        const reports = this.pageReports();
        return {
            total: reports.length,
            open: reports.filter(entry => !this.isTaskClosed(entry.task)).length,
            high: reports.filter(entry => ['high', 'critical'].includes(entry.report?.severity)).length,
            promptReady: reports.filter(entry => this.promptText(entry.report)).length,
        };
    },

    statusLabel(task) {
        return task ? WorkManagementCore.getTaskStatusLabel(task.status) : 'Без задачи';
    },

    promptText(report) {
        if (!report) return '';
        return String(
            report.codex_prompt
            || report.prompt
            || report.codex_result
            || ''
        ).trim();
    },

    priorityFromSeverity(severity) {
        if (severity === 'critical') return 'urgent';
        if (severity === 'high') return 'high';
        if (severity === 'low') return 'low';
        return 'normal';
    },

    dueDateFromSeverity(severity) {
        const base = new Date();
        const shiftDays = severity === 'critical' ? 0 : severity === 'high' ? 1 : severity === 'low' ? 5 : 3;
        base.setDate(base.getDate() + shiftDays);
        return base.toISOString().slice(0, 10);
    },

    findAreaId(slug) {
        return (this.bundle?.areas || []).find(item => String(item.slug || '') === slug)?.id || null;
    },

    defaultBugAssigneeId() {
        const configured = Number(App?.settings?.bug_report_default_assignee_id || 0);
        if (Number.isFinite(configured) && configured > 0) return configured;
        const currentEmployeeId = Number(App?.currentEmployeeId || 0);
        if (Number.isFinite(currentEmployeeId) && currentEmployeeId > 0) return currentEmployeeId;
        const polina = (this.employees || []).find(item => Number(item.id) === 5);
        if (polina) return polina.id;
        return App.currentEmployeeId || null;
    },

    employeeName(employeeId) {
        return (this.employees || []).find(item => String(item.id) === String(employeeId))?.name || '';
    },

    render() {
        const container = document.getElementById('page-bugs');
        if (!container) return;
        if (this.isLoading && !this.bundle) {
            container.innerHTML = `
                <div class="page-header">
                    <div>
                        <h1>Баги</h1>
                        <div class="text-muted" style="font-size:13px;">Собираем баги из команды в одном месте</div>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-label">Всего</div><div class="stat-value">…</div></div>
                    <div class="stat-card"><div class="stat-label">Открытые</div><div class="stat-value">…</div></div>
                    <div class="stat-card"><div class="stat-label">Срочные</div><div class="stat-value">…</div></div>
                    <div class="stat-card"><div class="stat-label">Prompt готов</div><div class="stat-value">…</div></div>
                </div>
            `;
            return;
        }

        const stats = this.openStats();
        const reports = this.filteredReports();
        const draft = this.currentContextDraft();
        container.innerHTML = `
            <div class="bug-page-header">
                <div>
                    <h1>Баги</h1>
                    <p class="bug-page-subtitle">Единая точка входа для команды: баг попадает в задачу, получает prompt для Codex и не теряется в чатах.</p>
                </div>
                <div class="bug-page-actions">
                    <button class="btn btn-outline" onclick="BugReports.openQuickReport()">Быстрый репорт</button>
                    <button class="btn btn-primary" onclick="window.scrollTo({ top: 0, behavior: 'smooth' })">К форме</button>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-label">Всего репортов</div>
                    <div class="stat-value">${stats.total}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Открытые</div>
                    <div class="stat-value">${stats.open}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Высокий / критичный</div>
                    <div class="stat-value">${stats.high}</div>
                </div>
                <div class="stat-card">
                    <div class="stat-label">Prompt для Codex</div>
                    <div class="stat-value">${stats.promptReady}</div>
                </div>
            </div>

            <div class="bug-layout">
                <div>
                    ${this.renderForm('page', draft, false)}
                </div>
                <div>
                    ${this.renderReportFeed(reports)}
                </div>
            </div>
        `;
        this.syncQuickButton();
    },

    renderForm(scope, draft, compact) {
        const prefix = scope === 'overlay' ? 'bug-overlay' : 'bug-page';
        return `
            <div class="card bug-form-card ${compact ? 'bug-form-card-compact' : ''}" oninput="BugReports.onDraftFieldChange('${prefix}')" onchange="BugReports.onDraftFieldChange('${prefix}')">
                <div class="card-header">
                    <h3>${compact ? 'Сообщить о баге' : 'Новый баг-репорт'}</h3>
                    ${compact ? '<button class="btn btn-sm btn-outline" onclick="BugReports.closeQuickReport()">Закрыть</button>' : ''}
                </div>
                ${this._draftRestored ? `
                    <div class="task-draft-banner">
                        <strong>Черновик восстановлен.</strong> Он хранится локально в этом браузере и удалится автоматически через 6 часов.
                    </div>
                ` : ''}
                <div class="form-group">
                    <label>Короткий заголовок *</label>
                    <input type="text" id="${prefix}-title" value="${this.esc(draft.title)}" placeholder="Например: не сохраняется дедлайн в карточке заказа">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Раздел *</label>
                        <select id="${prefix}-section" onchange="BugReports.onSectionChange('${prefix}')">
                            ${this.sectionOptionsHtml(draft.section_key)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Подраздел *</label>
                        <select id="${prefix}-subsection">
                            ${this.subsectionOptionsHtml(draft.section_key, draft.subsection_key)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Серьезность</label>
                        <select id="${prefix}-severity">
                            ${BugReportCore.BUG_SEVERITY_OPTIONS.map(item => `<option value="${item.value}"${item.value === draft.severity ? ' selected' : ''}>${item.label}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Маршрут / hash</label>
                        <input type="text" id="${prefix}-route" value="${this.esc(draft.page_route)}" placeholder="#orders/123">
                    </div>
                    <div class="form-group">
                        <label>Текущий URL</label>
                        <input type="text" id="${prefix}-url" value="${this.esc(draft.page_url)}" placeholder="https://...">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Браузер</label>
                        <input type="text" id="${prefix}-browser" value="${this.esc(draft.browser)}">
                    </div>
                    <div class="form-group">
                        <label>ОС</label>
                        <input type="text" id="${prefix}-os" value="${this.esc(draft.os)}">
                    </div>
                    <div class="form-group">
                        <label>Viewport</label>
                        <input type="text" id="${prefix}-viewport" value="${this.esc(draft.viewport)}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Что не работает *</label>
                    <textarea id="${prefix}-actual" rows="4" placeholder="Опишите, что именно происходит">${this.esc(draft.actual_result)}</textarea>
                </div>
                <div class="form-group">
                    <label>Что ожидалось</label>
                    <textarea id="${prefix}-expected" rows="3" placeholder="Как должно было работать">${this.esc(draft.expected_result)}</textarea>
                </div>
                <div class="form-group">
                    <label>Шаги воспроизведения</label>
                    <textarea id="${prefix}-steps" rows="4" placeholder="1. Открыть...\n2. Нажать...\n3. Получить ошибку...">${this.esc(draft.steps_to_reproduce)}</textarea>
                </div>
                <div class="form-group">
                    <label>Скриншоты</label>
                    <input type="file" id="${prefix}-files" accept="image/*" multiple onchange="BugReports.updateFileSummary('${prefix}')">
                    <div class="form-hint">Можно приложить несколько изображений. Если storage недоступен, форма сама переключится на безопасный fallback.</div>
                    <div id="${prefix}-files-summary" class="bug-file-summary">Файлы не выбраны</div>
                </div>
                <div class="form-group">
                    <label>Дополнительная ссылка</label>
                    <input type="url" id="${prefix}-link" value="${this.esc(draft.extra_link)}" placeholder="Ссылка на Loom / документ / чат">
                </div>
                <div class="bug-form-actions">
                    <button class="btn btn-success" type="button" id="${prefix}-submit" onclick="BugReports.submit('${prefix}')">Отправить баг</button>
                    ${compact ? '<button class="btn btn-outline" onclick="BugReports.closeQuickReport()">Отмена</button>' : '<button class="btn btn-outline" onclick="BugReports.resetPageForm()">Сбросить</button>'}
                </div>
            </div>
        `;
    },

    renderReportFeed(reports) {
        return `
            <div class="card">
                <div class="card-header">
                    <h3>Лента багов</h3>
                    <span class="badge badge-blue">${reports.length}</span>
                </div>
                <div class="tasks-toolbar" style="margin-bottom:16px;">
                    <div class="tasks-search-wrap">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                        <input type="text" value="${this.esc(this.filters.search)}" oninput="BugReports.setFilter('search', this.value)" placeholder="Поиск по багам...">
                    </div>
                </div>
                <div class="form-row" style="margin-bottom:16px;">
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Статус</label>
                        <select onchange="BugReports.setFilter('status', this.value)">
                            <option value="open"${this.filters.status === 'open' ? ' selected' : ''}>Открытые</option>
                            <option value="all"${this.filters.status === 'all' ? ' selected' : ''}>Все</option>
                            <option value="closed"${this.filters.status === 'closed' ? ' selected' : ''}>Закрытые</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Серьезность</label>
                        <select onchange="BugReports.setFilter('severity', this.value)">
                            <option value="">Все</option>
                            ${BugReportCore.BUG_SEVERITY_OPTIONS.map(item => `<option value="${item.value}"${item.value === this.filters.severity ? ' selected' : ''}>${item.label}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <label>Раздел</label>
                        <select onchange="BugReports.setFilter('section', this.value)">
                            <option value="">Все</option>
                            ${BugReportCore.getSectionCatalog().map(section => `<option value="${section.key}"${section.key === this.filters.section ? ' selected' : ''}>${this.esc(section.label)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="bug-report-feed">
                    ${reports.length === 0
                        ? `<div class="empty-state"><div class="empty-icon">&#128027;</div><p>По выбранным фильтрам багов нет.</p></div>`
                        : reports.map(entry => this.reportCardHtml(entry)).join('')}
                </div>
            </div>
        `;
    },

    reportCardHtml(entry) {
        const report = entry.report || {};
        const task = entry.task || {};
        const assets = entry.assets || [];
        const isClosed = this.isTaskClosed(task);
        const prompt = this.promptText(report);
        const severityClass = report.severity === 'critical'
            ? 'badge-red'
            : report.severity === 'high'
                ? 'badge-yellow'
                : report.severity === 'low'
                    ? 'badge-gray'
                    : 'badge-blue';
        const codexBadgeClass = report.codex_status === 'failed'
            ? 'badge-red'
            : prompt
                ? 'badge-green'
                : 'badge-gray';
        return `
            <article class="bug-report-card ${isClosed ? 'is-closed' : ''}">
                <div class="bug-report-card-top">
                    <div>
                        <h4>${this.esc(task.title || BugReportCore.buildBugTaskTitle(report))}</h4>
                        <div class="bug-report-meta">
                            <span>${this.esc(report.section_name || 'Без раздела')}</span>
                            <span>•</span>
                            <span>${this.esc(report.subsection_name || 'Без подраздела')}</span>
                            ${report.page_route ? `<span>•</span><span>${this.esc(report.page_route)}</span>` : ''}
                        </div>
                    </div>
                    <div class="bug-report-badges">
                        <span class="badge ${severityClass}">${this.esc(BugReportCore.severityLabel(report.severity))}</span>
                        <span class="badge ${isClosed ? 'badge-gray' : 'badge-blue'}">${this.esc(this.statusLabel(task))}</span>
                        <span class="badge ${codexBadgeClass}">${this.esc(report.codex_status || 'pending')}</span>
                    </div>
                </div>
                <p class="bug-report-description">${this.esc(report.actual_result || 'Описание не указано')}</p>
                <div class="bug-report-footer">
                    <div class="bug-report-footer-meta">
                        <span>${this.esc(report.submitted_by_name || 'Без автора')}</span>
                        <span>•</span>
                        <span>${this.formatDateTime(report.created_at)}</span>
                        <span>•</span>
                        <span>${assets.length} влож.</span>
                    </div>
                    <div class="bug-report-actions">
                        ${task?.id && !isClosed ? `
                            <button
                                class="btn btn-sm bug-report-done-btn"
                                type="button"
                                title="Закрыть задачу как готовую"
                                aria-label="Закрыть задачу как готовую"
                                onclick="BugReports.closeTask(${Number(task.id)})"
                            >Готово</button>
                        ` : ''}
                        <button class="btn btn-sm btn-outline" onclick="BugReports.openTask(${Number(report.task_id)})">Открыть задачу</button>
                        <button class="btn btn-sm btn-outline" onclick="BugReports.copyPrompt(${Number(report.id)})"${prompt ? '' : ' disabled'}>Скопировать prompt</button>
                    </div>
                </div>
                ${prompt ? `
                    <details class="bug-report-prompt-box">
                        <summary>Показать prompt для Codex</summary>
                        <pre>${this.esc(prompt)}</pre>
                    </details>
                ` : ''}
            </article>
        `;
    },

    formatDateTime(value) {
        if (!value) return '—';
        try {
            return new Date(value).toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch (error) {
            return value;
        }
    },

    setFilter(key, value) {
        this.filters[key] = value;
        this.render();
    },

    sectionOptionsHtml(selectedKey) {
        return BugReportCore.getSectionCatalog().map(section => (
            `<option value="${section.key}"${section.key === selectedKey ? ' selected' : ''}>${this.esc(section.label)}</option>`
        )).join('');
    },

    subsectionOptionsHtml(sectionKey, selectedKey) {
        const section = BugReportCore.getSectionByKey(sectionKey);
        const list = Array.isArray(section?.subsections) && section.subsections.length > 0
            ? section.subsections
            : [{ key: 'other', label: 'Другое' }];
        return list.map(item => `<option value="${item.key}"${item.key === selectedKey ? ' selected' : ''}>${this.esc(item.label)}</option>`).join('');
    },

    onSectionChange(prefix) {
        const sectionSelect = document.getElementById(`${prefix}-section`);
        const subsectionSelect = document.getElementById(`${prefix}-subsection`);
        if (!sectionSelect || !subsectionSelect) return;
        const sectionKey = sectionSelect.value || 'general';
        subsectionSelect.innerHTML = this.subsectionOptionsHtml(sectionKey, 'other');
    },

    updateFileSummary(prefix) {
        const input = document.getElementById(`${prefix}-files`);
        const summary = document.getElementById(`${prefix}-files-summary`);
        const files = Array.from(input?.files || []);
        if (!summary) return;
        if (files.length === 0) {
            summary.textContent = 'Файлы не выбраны';
            return;
        }
        summary.textContent = files.map(file => `${file.name} (${Math.round((file.size || 0) / 1024)} КБ)`).join(' · ');
    },

    resetPageForm() {
        this.clearStoredDraft();
        this.render();
    },

    onDraftFieldChange(prefix) {
        clearTimeout(this._draftSaveTimer);
        this._draftSaveTimer = setTimeout(() => {
            const draft = this.collectForm(prefix);
            this.persistStoredDraft({
                ...draft,
                files: [],
                app_version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
                page_route: draft.page_route || this.currentRoute(),
                page_url: draft.page_url || this.currentPageUrl(),
            });
        }, 180);
    },

    setSubmitState(prefix, isSubmitting) {
        if (isSubmitting) this.submittingPrefixes.add(prefix);
        else this.submittingPrefixes.delete(prefix);

        const button = document.getElementById(`${prefix}-submit`);
        if (!button) return;
        button.disabled = !!isSubmitting;
        button.textContent = isSubmitting ? 'Отправляем…' : 'Отправить баг';
        button.style.opacity = isSubmitting ? '0.75' : '';
        button.style.cursor = isSubmitting ? 'progress' : '';
    },

    async withTimeout(promiseFactory, label, timeoutMs = 12000) {
        let timer = null;
        try {
            return await Promise.race([
                Promise.resolve().then(promiseFactory),
                new Promise((_, reject) => {
                    timer = setTimeout(() => {
                        const error = new Error(`timeout (${label}, ${timeoutMs}ms)`);
                        error.code = 'timeout';
                        reject(error);
                    }, timeoutMs);
                }),
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    },

    syncQuickButton() {
        const button = document.getElementById('quick-bug-report-btn');
        if (!button) return;
        const show = !!App?.currentUser;
        button.style.display = show ? 'inline-flex' : 'none';
    },

    openQuickReport(preset = {}) {
        this.quickDraft = this.currentContextDraft(preset);
        this.renderQuickReport();
    },

    renderQuickReport() {
        let overlay = document.getElementById('bug-report-overlay');
        if (!this.quickDraft) {
            if (overlay) overlay.remove();
            this._overlayOpen = false;
            return;
        }
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'bug-report-overlay';
            overlay.className = 'task-drawer-overlay bug-overlay';
            overlay.innerHTML = `
                <div class="task-drawer-backdrop" onclick="BugReports.closeQuickReport()"></div>
                <div class="task-drawer-panel">
                    <div class="task-drawer-content"></div>
                </div>
            `;
            document.body.appendChild(overlay);
        }
        overlay.querySelector('.task-drawer-content').innerHTML = this.renderForm('overlay', this.quickDraft, true);
        document.body.style.overflow = 'hidden';
        requestAnimationFrame(() => overlay.classList.add('is-open'));
        this._overlayOpen = true;
    },

    closeQuickReport(options = {}) {
        const { preserveDraft = true } = options;
        if (preserveDraft) this.onDraftFieldChange('bug-overlay');
        const overlay = document.getElementById('bug-report-overlay');
        if (overlay) {
            overlay.classList.remove('is-open');
            setTimeout(() => overlay.remove(), 220);
        }
        document.body.style.overflow = '';
        this.quickDraft = null;
        this._overlayOpen = false;
    },

    collectForm(prefix) {
        const sectionKey = document.getElementById(`${prefix}-section`)?.value || 'general';
        const subsectionKey = document.getElementById(`${prefix}-subsection`)?.value || 'other';
        return {
            title: document.getElementById(`${prefix}-title`)?.value.trim() || '',
            section_key: sectionKey,
            section_name: BugReportCore.getSectionByKey(sectionKey)?.label || '',
            subsection_key: subsectionKey,
            subsection_name: BugReportCore.getSubsectionByKey(sectionKey, subsectionKey)?.label || 'Другое',
            page_route: document.getElementById(`${prefix}-route`)?.value.trim() || '',
            page_url: document.getElementById(`${prefix}-url`)?.value.trim() || '',
            browser: document.getElementById(`${prefix}-browser`)?.value.trim() || '',
            os: document.getElementById(`${prefix}-os`)?.value.trim() || '',
            viewport: document.getElementById(`${prefix}-viewport`)?.value.trim() || '',
            actual_result: document.getElementById(`${prefix}-actual`)?.value.trim() || '',
            expected_result: document.getElementById(`${prefix}-expected`)?.value.trim() || '',
            steps_to_reproduce: document.getElementById(`${prefix}-steps`)?.value.trim() || '',
            severity: document.getElementById(`${prefix}-severity`)?.value || 'medium',
            extra_link: document.getElementById(`${prefix}-link`)?.value.trim() || '',
            files: Array.from(document.getElementById(`${prefix}-files`)?.files || []),
        };
    },

    async submit(prefix) {
        if (this.submittingPrefixes.has(prefix)) return;
        this.setSubmitState(prefix, true);
        try {
            const payload = this.collectForm(prefix);
            if (!payload.title) {
                App.toast('Добавьте короткий заголовок бага');
                return;
            }
            if (!payload.actual_result) {
                App.toast('Опишите, что не работает');
                return;
            }

            const assigneeId = this.defaultBugAssigneeId();
            const assigneeName = this.employeeName(assigneeId);
            const areaId = this.findAreaId('website') || this.findAreaId('general');
            const taskRow = await this.withTimeout(() => saveWorkTask({
                title: BugReportCore.buildBugTaskTitle(payload),
                description: BugReportCore.buildBugSummary(payload),
                status: 'incoming',
                priority: this.priorityFromSeverity(payload.severity),
                reporter_id: App.currentEmployeeId || null,
                reporter_name: App.getCurrentEmployeeName(),
                assignee_id: assigneeId,
                assignee_name: assigneeName,
                reviewer_id: null,
                reviewer_name: '',
                area_id: areaId,
                order_id: null,
                project_id: null,
                primary_context_kind: 'area',
                due_date: this.dueDateFromSeverity(payload.severity),
                due_time: null,
                waiting_for_text: '',
            }, {
                actor_id: App.currentEmployeeId,
                actor_name: App.getCurrentEmployeeName(),
            }), 'создание задачи бага');

            const assets = [];
            for (const file of payload.files) {
                try {
                    const savedAsset = await this.withTimeout(() => this.uploadBugFile(taskRow.id, file), `загрузка файла ${file.name || ''}`.trim(), 18000);
                    if (savedAsset) assets.push(savedAsset);
                } catch (error) {
                    console.warn('[BugReports] file upload skipped:', error);
                    App.toast(`Баг отправим без файла ${file.name || ''}: загрузка не ответила.`);
                }
            }
            if (payload.extra_link) {
                try {
                    const linkAsset = await this.withTimeout(() => saveWorkAsset({
                        task_id: taskRow.id,
                        kind: 'link',
                        title: 'Дополнительная ссылка',
                        url: payload.extra_link,
                        created_by: App.currentEmployeeId,
                        created_by_name: App.getCurrentEmployeeName(),
                    }), 'сохранение ссылки бага');
                    assets.push(linkAsset);
                } catch (error) {
                    console.warn('[BugReports] link asset skipped:', error);
                }
            }

            const bugRow = await this.withTimeout(() => saveBugReport({
                task_id: taskRow.id,
                title: payload.title,
                section_key: payload.section_key,
                section_name: payload.section_name,
                subsection_key: payload.subsection_key,
                subsection_name: payload.subsection_name,
                page_route: payload.page_route,
                page_url: payload.page_url,
                app_version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '',
                browser: payload.browser,
                os: payload.os,
                viewport: payload.viewport,
                steps_to_reproduce: payload.steps_to_reproduce,
                expected_result: payload.expected_result,
                actual_result: payload.actual_result,
                severity: payload.severity,
                submitted_by: App.currentEmployeeId,
                submitted_by_name: App.getCurrentEmployeeName(),
                codex_prompt: '',
                codex_status: 'pending',
            }, {
                actor_id: App.currentEmployeeId,
                actor_name: App.getCurrentEmployeeName(),
            }), 'сохранение баг-репорта');

            const codexPrompt = BugReportCore.buildCodexPrompt({
                task: taskRow,
                report: bugRow,
                assets,
            });

            const finalBugRow = await this.withTimeout(() => saveBugReport({
                ...bugRow,
                codex_prompt: codexPrompt,
                codex_status: 'prompt_ready',
                codex_error: '',
            }, {
                actor_id: App.currentEmployeeId,
                actor_name: App.getCurrentEmployeeName(),
            }), 'подготовка prompt бага');

            if (taskRow.assignee_id) {
                this.withTimeout(() => TaskEvents.emit('task_assigned', {
                        task_id: taskRow.id,
                        project_id: null,
                        assignee_id: taskRow.assignee_id,
                    }), 'уведомление о назначении', 7000)
                    .catch(error => console.warn('[BugReports] task_assigned event skipped:', error));
            }
            this.withTimeout(() => TaskEvents.emit('bug_report_submitted', {
                    task_id: taskRow.id,
                    project_id: null,
                    bug_report_id: finalBugRow.id,
                    severity: finalBugRow.severity,
                    section_key: finalBugRow.section_key,
                    subsection_key: finalBugRow.subsection_key,
                }), 'уведомление о баге', 7000)
                .catch(error => console.warn('[BugReports] bug_report_submitted event skipped:', error));

            try {
                await this.withTimeout(() => this.refreshData(), 'обновление списка багов', 12000);
            } catch (error) {
                console.warn('[BugReports] refresh after submit skipped:', error);
                this.bundle = this._hydrateBundle({
                    ...(this.bundle || {}),
                    tasks: [...(this.bundle?.tasks || []), taskRow],
                    bugReports: [...(this.bundle?.bugReports || []), finalBugRow],
                    assets: [...(this.bundle?.assets || []), ...assets],
                });
            }
            this.render();
            this.clearStoredDraft();
            if (prefix === 'bug-overlay') {
                this.closeQuickReport({ preserveDraft: false });
            }
            App.toast('Баг отправлен. Prompt для Codex готов.');
        } catch (error) {
            console.error('[BugReports] submit failed:', error);
            App.toast(`Не удалось отправить баг: ${error.message || error}`);
        } finally {
            this.setSubmitState(prefix, false);
        }
    },

    async uploadBugFile(taskId, file) {
        if (!file) return null;
        const maxBytes = isSupabaseReady() ? 12 * 1024 * 1024 : 3 * 1024 * 1024;
        if ((file.size || 0) > maxBytes) {
            App.toast(`Файл ${file.name} слишком большой`);
            return null;
        }

        let storagePath = '';
        if (isSupabaseReady() && typeof supabaseClient?.storage?.from === 'function') {
            try {
                const safeName = String(file.name || 'attachment').replace(/[^a-zA-Z0-9._-]+/g, '-');
                storagePath = `${taskId}/${Date.now()}-${Math.floor(Math.random() * 100000)}-${safeName}`;
                const bucket = supabaseClient.storage.from('bug-attachments');
                const { error } = await bucket.upload(storagePath, file, {
                    upsert: false,
                    contentType: file.type || 'application/octet-stream',
                });
                if (!error) {
                    const { data } = bucket.getPublicUrl(storagePath);
                    const publicUrl = data?.publicUrl || '';
                    if (publicUrl) {
                        return saveWorkAsset({
                            task_id: taskId,
                            kind: 'file',
                            title: file.name,
                            file_name: file.name,
                            file_type: file.type || '',
                            file_size: file.size || 0,
                            url: publicUrl,
                            data_url: '',
                            preview_meta: {
                                source: 'supabase_storage',
                                bucket: 'bug-attachments',
                                storage_path: storagePath,
                            },
                            created_by: App.currentEmployeeId,
                            created_by_name: App.getCurrentEmployeeName(),
                        });
                    }
                }
            } catch (error) {
                console.warn('[BugReports] storage upload failed, falling back to data URL:', error);
            }
        }

        if ((file.size || 0) > 3 * 1024 * 1024) {
            App.toast(`Файл ${file.name} не удалось положить в storage, а для fallback он слишком большой.`);
            return null;
        }

        const dataUrl = await this.readFileAsDataUrl(file);
        return saveWorkAsset({
            task_id: taskId,
            kind: 'file',
            title: file.name,
            file_name: file.name,
            file_type: file.type || '',
            file_size: file.size || 0,
            url: dataUrl,
            data_url: dataUrl,
            preview_meta: {
                source: 'data_url_fallback',
                bucket: storagePath ? 'bug-attachments' : '',
            },
            created_by: App.currentEmployeeId,
            created_by_name: App.getCurrentEmployeeName(),
        });
    },

    readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result || '');
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    copyPrompt(reportId) {
        const report = (this.bundle?.bugReports || []).find(item => String(item.id) === String(reportId));
        const prompt = this.promptText(report);
        if (!prompt) {
            App.toast('Prompt пока не готов');
            return;
        }
        navigator.clipboard.writeText(prompt)
            .then(() => App.toast('Prompt скопирован'))
            .catch(() => App.toast('Не удалось скопировать prompt'));
    },

    async closeTask(taskId) {
        const normalizedTaskId = Number(taskId || 0);
        if (!normalizedTaskId) return;
        const task = (this.bundle?.tasks || []).find(item => Number(item.id) === normalizedTaskId);
        if (!task) {
            App.toast('Связанная задача не найдена');
            return;
        }
        if (this.isTaskClosed(task)) {
            App.toast('Задача уже закрыта');
            return;
        }
        try {
            const taskFromTasksModule = typeof Tasks !== 'undefined'
                && Tasks
                && typeof Tasks.taskById === 'function'
                ? Tasks.taskById(normalizedTaskId)
                : null;
            if (taskFromTasksModule && typeof Tasks.changeStatus === 'function') {
                await Tasks.changeStatus(normalizedTaskId, 'done', { preserveSelection: false });
            } else {
                const saved = await saveWorkTask({
                    ...task,
                    status: 'done',
                }, {
                    actor_id: App.currentEmployeeId,
                    actor_name: App.getCurrentEmployeeName(),
                });
                if (typeof Tasks !== 'undefined' && Tasks && typeof Tasks.emitTaskEvents === 'function') {
                    const previousOverdue = typeof Tasks.isOverdue === 'function'
                        ? Tasks.isOverdue(task)
                        : false;
                    await Tasks.emitTaskEvents(saved, task, previousOverdue, { preserveSelection: false });
                }
            }
            await this.refreshData();
            this.render();
            App.toast('Задача закрыта');
        } catch (error) {
            console.error('[BugReports] closeTask failed:', error);
            App.toast(`Не удалось закрыть задачу: ${error.message || error}`);
        }
    },

    openTask(taskId) {
        App.navigate('tasks', true, taskId);
    },
};

if (typeof window !== 'undefined') {
    window.BugReports = BugReports;
}

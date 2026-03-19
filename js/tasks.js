const Tasks = {
    bundle: null,
    employees: [],
    orders: [],
    chinaPurchases: [],
    warehouseItems: [],
    _loadSeq: 0,
    currentTaskId: null,
    createDraft: null,
    templateDraft: null,
    templateManagerOpen: false,
    editorUi: {
        visibleContexts: { order: false, project: false, china: false, warehouse: false },
        restoredDraft: false,
    },
    view: 'list',
    scope: 'my',
    myMode: 'assigned',
    isLoading: false,
    calendarMonth: new Date().toISOString().slice(0, 7),
    filters: {
        search: '',
        status: '',
        priority: '',
        assignee_id: '',
        reporter_id: '',
        project_id: '',
        order_id: '',
        area_id: '',
        due: '',
        mine: false,
        awaiting_review: false,
        waiting_only: false,
    },
    sort: 'manual',
    _completedOpen: Object.create(null),
    _draftSaveTimer: null,

    emptyBundle() {
        return {
            areas: [],
            projects: [],
            tasks: [],
            bugReports: [],
            comments: [],
            assets: [],
            checklistItems: [],
            watchers: [],
            activity: [],
            templates: [],
        };
    },

    normalizeBundle(bundle = {}) {
        return {
            ...this.emptyBundle(),
            ...(bundle || {}),
        };
    },

    hydrateFromCache() {
        if (typeof getLocal !== 'function' || typeof LOCAL_KEYS === 'undefined') return false;

        const cachedBundle = this.normalizeBundle({
            areas: getLocal(LOCAL_KEYS.workAreas) || [],
            projects: getLocal(LOCAL_KEYS.workProjects) || [],
            tasks: getLocal(LOCAL_KEYS.workTasks) || [],
            bugReports: getLocal(LOCAL_KEYS.bugReports) || [],
            comments: getLocal(LOCAL_KEYS.taskComments) || [],
            assets: getLocal(LOCAL_KEYS.workAssets) || [],
            checklistItems: getLocal(LOCAL_KEYS.taskChecklistItems) || [],
            watchers: getLocal(LOCAL_KEYS.taskWatchers) || [],
            activity: getLocal(LOCAL_KEYS.workActivity) || [],
            templates: getLocal(LOCAL_KEYS.workTemplatesV2) || [],
        });
        const hasBundleData = Object.values(cachedBundle).some(value => Array.isArray(value) && value.length > 0);
        if (hasBundleData) {
            this.bundle = cachedBundle;
        }

        const cachedEmployees = getLocal(LOCAL_KEYS.employees) || [];
        if (cachedEmployees.length > 0) this.employees = cachedEmployees;

        const cachedOrders = (getLocal(LOCAL_KEYS.orders) || []).filter(item => item.status !== 'deleted');
        if (cachedOrders.length > 0) this.orders = cachedOrders;

        const cachedChina = getLocal(LOCAL_KEYS.chinaPurchases) || [];
        if (cachedChina.length > 0) this.chinaPurchases = cachedChina;

        const cachedWarehouse = getLocal(LOCAL_KEYS.warehouseItems) || [];
        if (cachedWarehouse.length > 0) this.warehouseItems = cachedWarehouse;

        return hasBundleData;
    },

    async load(taskId) {
        if (!this.scope) this.scope = App.currentEmployeeId ? 'my' : 'all';
        if (taskId) {
            this.currentTaskId = Number(taskId);
            this.createDraft = null;
        }
        const loadSeq = ++this._loadSeq;
        const hasCachedBundle = !!this.bundle || this.hydrateFromCache();
        this.isLoading = !hasCachedBundle;
        this.render();

        const secondaryPromise = this.refreshSecondaryData()
            .then(() => {
                if (this._loadSeq !== loadSeq) return;
                this.render();
            })
            .catch(error => {
                console.warn('Tasks secondary load error:', error);
            });

        try {
            await this.refreshPrimaryData();
            if (this._loadSeq !== loadSeq) return;
            this.isLoading = false;
            this.render();
        } catch (error) {
            console.error('Tasks load error:', error);
            if (this._loadSeq === loadSeq) {
                this.isLoading = false;
                this.render();
            }
        }

        secondaryPromise.catch(() => {});
    },

    async refreshPrimaryData() {
        const [
            areas,
            projects,
            tasks,
            templates,
            employees,
        ] = await Promise.all([
            loadWorkAreas(),
            loadWorkProjects(),
            loadWorkTasks(),
            loadWorkTemplatesV2(),
            loadEmployees(),
        ]);
        this.bundle = this.normalizeBundle({
            ...(this.bundle || {}),
            areas,
            projects,
            tasks,
            templates,
        });
        this.employees = employees;
    },

    async refreshSecondaryData() {
        const [
            bugReports,
            comments,
            assets,
            checklistItems,
            watchers,
            activity,
            orders,
            chinaPurchases,
            warehouseItems,
        ] = await Promise.all([
            loadBugReports(),
            loadTaskComments(),
            loadWorkAssets(),
            loadTaskChecklistItems(),
            loadTaskWatchers(),
            loadWorkActivity(),
            loadOrders({}),
            loadChinaPurchases({}),
            loadWarehouseItems(),
        ]);
        this.bundle = this.normalizeBundle({
            ...(this.bundle || {}),
            bugReports,
            comments,
            assets,
            checklistItems,
            watchers,
            activity,
        });
        this.orders = orders;
        this.chinaPurchases = chinaPurchases;
        this.warehouseItems = warehouseItems;
    },

    async refreshData() {
        await Promise.all([
            this.refreshPrimaryData(),
            this.refreshSecondaryData(),
        ]);
    },

    esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    todayYmd() {
        return new Date().toISOString().slice(0, 10);
    },

    currentEmployee() {
        return (this.employees || []).find(item => String(item.id) === String(App.currentEmployeeId)) || null;
    },

    taskById(taskId) {
        return (this.bundle?.tasks || []).find(item => String(item.id) === String(taskId)) || null;
    },

    projectById(projectId) {
        return (this.bundle?.projects || []).find(item => String(item.id) === String(projectId)) || null;
    },

    areaById(areaId) {
        return (this.bundle?.areas || []).find(item => String(item.id) === String(areaId)) || null;
    },

    orderById(orderId) {
        return (this.orders || []).find(item => String(item.id) === String(orderId)) || null;
    },

    employeeNameById(id, fallback) {
        return (this.employees || []).find(item => String(item.id) === String(id))?.name || fallback || '—';
    },

    chinaPurchaseById(id) {
        return (this.chinaPurchases || []).find(item => String(item.id) === String(id)) || null;
    },

    warehouseItemById(id) {
        return (this.warehouseItems || []).find(item => String(item.id) === String(id)) || null;
    },

    areaBySlug(slug) {
        const normalized = WorkManagementCore.normalizeText(slug);
        return (this.bundle?.areas || []).find(item => WorkManagementCore.normalizeText(item.slug || item.name || '') === normalized) || null;
    },

    visibleContextsForTask(task) {
        const fallback = {
            order: !!task?.order_id,
            project: !!task?.project_id,
            china: !!task?.china_purchase_id,
            warehouse: !!task?.warehouse_item_id,
        };
        return {
            order: !!(this.editorUi?.visibleContexts?.order || fallback.order),
            project: !!(this.editorUi?.visibleContexts?.project || fallback.project),
            china: !!(this.editorUi?.visibleContexts?.china || fallback.china),
            warehouse: !!(this.editorUi?.visibleContexts?.warehouse || fallback.warehouse),
        };
    },

    syncEditorUiForTask(task) {
        this.editorUi = {
            ...(this.editorUi || {}),
            visibleContexts: {
                order: !!task?.order_id,
                project: !!task?.project_id,
                china: !!task?.china_purchase_id,
                warehouse: !!task?.warehouse_item_id,
            },
            restoredDraft: false,
        };
    },

    inferHiddenAreaId(taskLike = {}) {
        if (taskLike.area_id) return Number(taskLike.area_id) || taskLike.area_id;
        if (taskLike.project_id) {
            const project = this.projectById(taskLike.project_id);
            if (project?.area_id) return project.area_id;
        }
        if (taskLike.china_purchase_id) return this.areaBySlug('china')?.id || '';
        if (taskLike.warehouse_item_id) return this.areaBySlug('warehouse')?.id || '';
        return this.areaBySlug('general')?.id || '';
    },

    inferPrimaryContextKind(taskLike = {}) {
        if (taskLike.project_id) return 'project';
        if (taskLike.order_id) return 'order';
        return 'area';
    },

    meaningfulDraft(taskLike = {}) {
        return !!(
            String(taskLike.title || '').trim()
            || String(taskLike.description || '').trim()
            || String(taskLike.waiting_for_text || '').trim()
            || String(taskLike.template_id || '').trim()
            || String(taskLike.assignee_id || '').trim()
            || String(taskLike.due_date || '').trim()
            || String(taskLike.order_id || '').trim()
            || String(taskLike.project_id || '').trim()
            || String(taskLike.china_purchase_id || '').trim()
            || String(taskLike.warehouse_item_id || '').trim()
            || (Array.isArray(taskLike.watcher_ids) && taskLike.watcher_ids.length > 0)
        );
    },

    draftStorageKey() {
        return `ro_task_editor_draft_v3:${App.currentEmployeeId || 'guest'}`;
    },

    draftTtlMs() {
        return 30 * 60 * 1000;
    },

    loadStoredDraft() {
        try {
            const raw = localStorage.getItem(this.draftStorageKey());
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;
            if (!parsed.saved_at || (Date.now() - Number(parsed.saved_at)) > this.draftTtlMs()) {
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
            if (!draft || !this.meaningfulDraft(draft)) {
                localStorage.removeItem(this.draftStorageKey());
                return;
            }
            localStorage.setItem(this.draftStorageKey(), JSON.stringify({
                saved_at: Date.now(),
                draft,
            }));
        } catch (error) {
            // Ignore storage issues in the browser.
        }
    },

    clearStoredDraft() {
        try {
            localStorage.removeItem(this.draftStorageKey());
        } catch (error) {
            // Ignore storage issues in the browser.
        }
    },

    maybeRestoreCreateDraft(preset = {}, templateId = null) {
        const hasPreset = Object.keys(preset || {}).some(key => {
            const value = preset[key];
            return value !== null && value !== undefined && String(value) !== '';
        });
        if (templateId || hasPreset) return null;
        return this.loadStoredDraft();
    },

    formatDate(value) {
        if (!value) return '—';
        try {
            return new Date(value).toLocaleDateString('ru-RU');
        } catch (error) {
            return value;
        }
    },

    formatTaskDue(task) {
        if (!task?.due_date) return '—';
        return `${this.formatDate(task.due_date)}${task.due_time ? ` ${task.due_time}` : ''}`;
    },

    isOverdue(task) {
        return WorkManagementCore.isTaskOverdue(task);
    },

    statusLabel(status) {
        return WorkManagementCore.getTaskStatusLabel(status);
    },

    priorityLabel(priority) {
        return (WorkManagementCore.TASK_PRIORITY_OPTIONS.find(item => item.value === priority) || WorkManagementCore.TASK_PRIORITY_OPTIONS[1]).label;
    },

    priorityBadgeClass(priority) {
        if (priority === 'urgent') return 'badge-red';
        if (priority === 'high') return 'badge-yellow';
        if (priority === 'low') return 'badge-gray';
        return 'badge-blue';
    },

    bugSeverityLabel(severity) {
        if (severity === 'critical') return 'Критичный';
        if (severity === 'high') return 'Высокий';
        if (severity === 'low') return 'Низкий';
        return 'Средний';
    },

    bugSeverityBadgeClass(severity) {
        if (severity === 'critical') return 'badge-red';
        if (severity === 'high') return 'badge-yellow';
        if (severity === 'low') return 'badge-gray';
        return 'badge-blue';
    },

    bugPromptStatusLabel(status, hasPrompt) {
        if (status === 'failed') return 'Ошибка prompt';
        if (status === 'prompt_ready' || hasPrompt) return 'Prompt готов';
        if (status === 'pending') return 'Prompt в очереди';
        return status || 'Без prompt';
    },

    bugPromptBadgeClass(status, hasPrompt) {
        if (status === 'failed') return 'badge-red';
        if (status === 'prompt_ready' || hasPrompt) return 'badge-green';
        if (status === 'pending') return 'badge-yellow';
        return 'badge-gray';
    },

    contextLabel(task) {
        const project = task.project_id ? this.projectById(task.project_id) : null;
        const order = task.order_id ? this.orderById(task.order_id) : (project?.linked_order_id ? this.orderById(project.linked_order_id) : null);
        const chunks = [];
        if (order) chunks.push(`Заказ: ${order.order_name}`);
        if (project) chunks.push(`Проект: ${project.title}`);
        if (task.china_purchase_id) {
            const china = this.chinaPurchaseById(task.china_purchase_id);
            if (china) chunks.push(`China: ${china.purchase_name || `Закупка #${china.id}`}`);
        }
        if (task.warehouse_item_id) {
            const warehouse = this.warehouseItemById(task.warehouse_item_id);
            if (warehouse) chunks.push(`Склад: ${warehouse.name || warehouse.sku || `Позиция #${warehouse.id}`}`);
        }
        const area = task.area_id ? this.areaById(task.area_id) : (project?.area_id ? this.areaById(project.area_id) : null);
        if (!chunks.length && area && WorkManagementCore.normalizeText(area.slug || area.name || '') !== 'general') {
            chunks.push(`Направление: ${area.name}`);
        }
        return chunks.join(' · ') || 'Без привязки';
    },

    commentsForTask(taskId) {
        return (this.bundle?.comments || [])
            .filter(item => String(item.task_id) === String(taskId))
            .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    },

    assetsForTask(taskId) {
        return (this.bundle?.assets || [])
            .filter(item => String(item.task_id) === String(taskId))
            .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));
    },

    checklistForTask(taskId) {
        return (this.bundle?.checklistItems || [])
            .filter(item => String(item.task_id) === String(taskId))
            .sort((a, b) => (Number(a.sort_index) || 0) - (Number(b.sort_index) || 0));
    },

    watcherIdsForTask(taskId) {
        return (this.bundle?.watchers || [])
            .filter(item => String(item.task_id) === String(taskId))
            .map(item => Number(item.user_id));
    },

    bugReportForTask(taskId) {
        return (this.bundle?.bugReports || [])
            .filter(item => String(item.task_id || '') === String(taskId))
            .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))[0] || null;
    },

    activityForTask(taskId) {
        return (this.bundle?.activity || [])
            .filter(item => String(item.task_id) === String(taskId))
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    },

    subtasksForTask(taskId) {
        return (this.bundle?.tasks || [])
            .filter(item => String(item.parent_task_id || '') === String(taskId))
            .sort((a, b) => (Number(a.sort_index) || 0) - (Number(b.sort_index) || 0));
    },

    getTasksForOrder(orderId) {
        const projectsForOrder = (this.bundle?.projects || []).filter(item => String(item.linked_order_id || '') === String(orderId));
        const projectIds = new Set(projectsForOrder.map(item => String(item.id)));
        return (this.bundle?.tasks || []).filter(task =>
            String(task.order_id || '') === String(orderId)
            || projectIds.has(String(task.project_id || ''))
        );
    },

    populateFilters() {
        // Backward compatibility no-op.
    },

    openTask(taskId) {
        this.templateManagerOpen = false;
        this.templateDraft = null;
        this.createDraft = null;
        this.currentTaskId = Number(taskId);
        this.syncEditorUiForTask(this.taskById(taskId));
        if (App.currentPage !== 'tasks') {
            App.navigate('tasks', true, taskId);
            return;
        }
        this.render();
    },

    showAddForm(orderId, _orderName) {
        this.openCreate(orderId ? { order_id: orderId } : {});
    },

    openCreate(preset = {}, templateId = null) {
        this.templateManagerOpen = false;
        this.templateDraft = null;
        const template = templateId
            ? (this.bundle?.templates || []).find(item => String(item.id) === String(templateId))
            : null;
        const project = preset.project_id ? this.projectById(preset.project_id) : null;
        const restored = this.maybeRestoreCreateDraft(preset, templateId);
        const baseDraft = restored || {};
        this.createDraft = {
            id: '',
            template_id: preset.template_id || template?.id || baseDraft.template_id || '',
            title: preset.title || template?.title || baseDraft.title || '',
            description: preset.description || template?.description || baseDraft.description || '',
            status: preset.status || baseDraft.status || 'incoming',
            priority: preset.priority || template?.default_priority || baseDraft.priority || 'normal',
            reporter_id: preset.reporter_id || baseDraft.reporter_id || App.currentEmployeeId || '',
            assignee_id: preset.assignee_id || baseDraft.assignee_id || '',
            reviewer_id: '',
            area_id: preset.area_id || baseDraft.area_id || project?.area_id || template?.suggested_area_id || '',
            order_id: preset.order_id || baseDraft.order_id || project?.linked_order_id || '',
            project_id: preset.project_id || baseDraft.project_id || '',
            china_purchase_id: preset.china_purchase_id || baseDraft.china_purchase_id || '',
            warehouse_item_id: preset.warehouse_item_id || baseDraft.warehouse_item_id || '',
            primary_context_kind: this.inferPrimaryContextKind({
                ...baseDraft,
                ...preset,
                project_id: preset.project_id || baseDraft.project_id || '',
                order_id: preset.order_id || baseDraft.order_id || project?.linked_order_id || '',
            }),
            due_date: preset.due_date || baseDraft.due_date || '',
            due_time: preset.due_time || baseDraft.due_time || '',
            waiting_for_text: preset.waiting_for_text || baseDraft.waiting_for_text || '',
            parent_task_id: preset.parent_task_id || baseDraft.parent_task_id || '',
            watcher_ids: preset.watcher_ids || baseDraft.watcher_ids || [],
        };
        this.editorUi = {
            ...this.editorUi,
            visibleContexts: {
                order: !!(preset.order_id || baseDraft.order_id || project?.linked_order_id),
                project: !!(preset.project_id || baseDraft.project_id),
                china: !!(preset.china_purchase_id || baseDraft.china_purchase_id),
                warehouse: !!(preset.warehouse_item_id || baseDraft.warehouse_item_id),
            },
            restoredDraft: !!restored,
        };
        this.currentTaskId = null;
        if (App.currentPage !== 'tasks') {
            App.navigate('tasks');
            return;
        }
        this.render();
    },

    cancelEditor() {
        if (this.createDraft) {
            const draft = this.readEditorForm();
            if (this.meaningfulDraft(draft)) {
                this.persistStoredDraft({
                    ...this.createDraft,
                    ...draft,
                });
                App.toast('Черновик задачи сохранен локально');
            } else {
                this.clearStoredDraft();
            }
        }
        this.createDraft = null;
        this.currentTaskId = null;
        this.editorUi = {
            ...this.editorUi,
            visibleContexts: { order: false, project: false, china: false, warehouse: false },
            restoredDraft: false,
        };
        const drawer = document.getElementById('task-drawer-overlay');
        if (drawer) {
            drawer.classList.remove('is-open');
            document.body.style.overflow = '';
            setTimeout(() => { drawer.remove(); }, 250);
        }
    },

    setView(view) {
        this.view = view;
        this.render();
    },

    setScope(scope) {
        this.scope = scope;
        this.render();
    },

    setMyMode(mode) {
        this.myMode = mode || 'assigned';
        this.render();
    },

    setSort(value) {
        this.sort = value || 'manual';
        this.render();
    },

    _filtersOpen: false,

    toggleFilters() {
        this._filtersOpen = !this._filtersOpen;
        const panel = document.getElementById('tasks-filters-panel');
        if (panel) panel.style.display = this._filtersOpen ? '' : 'none';
        document.querySelector('.tasks-filter-toggle')?.classList.toggle('is-open', this._filtersOpen);
    },

    resetFilters() {
        this.filters = { search: '', status: '', priority: '', assignee_id: '', reporter_id: '', project_id: '', order_id: '', area_id: '', due: '', mine: false, awaiting_review: false, waiting_only: false };
        this.sort = 'manual';
        this.render();
    },

    updateFilter(field, value) {
        this.filters[field] = value;
        this.render();
    },

    viewTabsHtml() {
        return `
            <div class="tasks-view-toggle">
                <button class="tasks-view-btn ${this.view === 'list' ? 'active' : ''}" onclick="Tasks.setView('list')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                    Список
                </button>
                <button class="tasks-view-btn ${this.view === 'kanban' ? 'active' : ''}" onclick="Tasks.setView('kanban')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="10" rx="1"/></svg>
                    Канбан
                </button>
                <button class="tasks-view-btn ${this.view === 'calendar' ? 'active' : ''}" onclick="Tasks.setView('calendar')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Календарь
                </button>
            </div>
        `;
    },

    scopeTabsHtml() {
        const currentEmployee = this.currentEmployee();
        const myCount = this.activeTasksCount(this.myTasks('assigned'));
        const allCount = this.activeTasksCount(this.bundle?.tasks || []);
        const overdueCount = this.activeTasksCount((this.bundle?.tasks || []).filter(task => this.isOverdue(task)));
        return `
            <div class="tasks-scope-tabs">
                <button class="tasks-scope-btn ${this.scope === 'my' ? 'active' : ''}" onclick="Tasks.setScope('my')">
                    Мои задачи${currentEmployee ? ` <span class="tasks-scope-count">${myCount}</span>` : ''}
                </button>
                <button class="tasks-scope-btn ${this.scope === 'all' ? 'active' : ''}" onclick="Tasks.setScope('all')">Все задачи <span class="tasks-scope-count">${allCount}</span></button>
                <button class="tasks-scope-btn ${this.scope === 'overdue' ? 'active' : ''}" onclick="Tasks.setScope('overdue')">Просроченные <span class="tasks-scope-count">${overdueCount}</span></button>
            </div>
        `;
    },

    myModeTabsHtml() {
        if (this.scope !== 'my' || !App.currentEmployeeId) return '';
        const assignedCount = this.activeTasksCount(this.myTasks('assigned'));
        const outgoingCount = this.activeTasksCount(this.myTasks('outgoing'));
        const allMyCount = this.activeTasksCount(this.myTasks('all'));
        return `
            <div class="tasks-subscope-tabs">
                <button class="tasks-subscope-btn ${this.myMode === 'assigned' ? 'active' : ''}" onclick="Tasks.setMyMode('assigned')">
                    Мне поставили <span class="tasks-scope-count">${assignedCount}</span>
                </button>
                <button class="tasks-subscope-btn ${this.myMode === 'outgoing' ? 'active' : ''}" onclick="Tasks.setMyMode('outgoing')">
                    Поставил я <span class="tasks-scope-count">${outgoingCount}</span>
                </button>
                <button class="tasks-subscope-btn ${this.myMode === 'all' ? 'active' : ''}" onclick="Tasks.setMyMode('all')">
                    Всё моё <span class="tasks-scope-count">${allMyCount}</span>
                </button>
            </div>
        `;
    },

    myTasks(mode = 'assigned') {
        const currentEmployeeId = String(App.currentEmployeeId || '');
        if (!currentEmployeeId) return [];
        return (this.bundle?.tasks || []).filter(task => {
            const assigneeId = String(task.assignee_id || '');
            const reporterId = String(task.reporter_id || '');
            const watcherMatch = this.watcherIdsForTask(task.id).some(id => String(id) === currentEmployeeId);
            if (mode === 'outgoing') return reporterId === currentEmployeeId;
            if (mode === 'all') return assigneeId === currentEmployeeId || reporterId === currentEmployeeId || watcherMatch;
            return assigneeId === currentEmployeeId;
        });
    },

    isTaskFinished(task) {
        return WorkManagementCore.isTaskFinished(task);
    },

    activeTasksCount(list) {
        return (list || []).filter(task => !this.isTaskFinished(task)).length;
    },

    completedTasksCount(list) {
        return (list || []).filter(task => this.isTaskFinished(task)).length;
    },

    splitTasksByCompletion(list) {
        return (list || []).reduce((acc, task) => {
            if (this.isTaskFinished(task)) acc.completed.push(task);
            else acc.active.push(task);
            return acc;
        }, { active: [], completed: [] });
    },

    activeFeedTitle() {
        if (this.scope === 'overdue') return 'Просроченные задачи';
        if (this.scope === 'all') return 'Актуальные задачи';
        if (this.myMode === 'outgoing') return 'Исходящие задачи';
        if (this.myMode === 'all') return 'Мои активные задачи';
        return 'Задачи, поставленные мне';
    },

    activeFeedSubtitle() {
        if (this.scope === 'overdue') return 'То, что уже требует внимания прямо сейчас.';
        if (this.scope === 'all') return 'Здесь только то, что еще в работе. Готовые задачи убраны ниже.';
        if (this.myMode === 'outgoing') return 'Задачи, которые вы поставили другим сотрудникам, чтобы быстро проверять статус.';
        if (this.myMode === 'all') return 'Все мои входящие и исходящие задачи без завершенных.';
        return 'То, что сейчас нужно делать вам. Готовые задачи убраны в скрытый блок ниже.';
    },

    completedPanelKey() {
        return `${this.scope}:${this.myMode}:${this.filters.search}:${this.view}`;
    },

    isCompletedPanelOpen() {
        return !!this._completedOpen[this.completedPanelKey()];
    },

    toggleCompletedPanel() {
        const key = this.completedPanelKey();
        this._completedOpen[key] = !this._completedOpen[key];
        this.render();
    },

    filteredTasks() {
        const search = WorkManagementCore.normalizeText(this.filters.search);
        const commentsByTask = new Map();
        this.bundle?.comments?.forEach(comment => {
            const bucket = commentsByTask.get(String(comment.task_id)) || [];
            bucket.push(comment.body || '');
            commentsByTask.set(String(comment.task_id), bucket);
        });

        let list = (this.bundle?.tasks || []).slice();

        if (this.scope === 'my' && App.currentEmployeeId) {
            list = this.myTasks(this.myMode);
        }
        if (this.scope === 'overdue') {
            list = list.filter(task => this.isOverdue(task));
        }

        if (this.filters.status) list = list.filter(task => task.status === this.filters.status);
        if (this.filters.priority) list = list.filter(task => task.priority === this.filters.priority);
        if (this.filters.assignee_id) list = list.filter(task => String(task.assignee_id || '') === String(this.filters.assignee_id));
        if (this.filters.reporter_id) list = list.filter(task => String(task.reporter_id || '') === String(this.filters.reporter_id));
        if (this.filters.project_id) list = list.filter(task => String(task.project_id || '') === String(this.filters.project_id));
        if (this.filters.order_id) {
            list = list.filter(task => {
                if (String(task.order_id || '') === String(this.filters.order_id)) return true;
                const project = task.project_id ? this.projectById(task.project_id) : null;
                return String(project?.linked_order_id || '') === String(this.filters.order_id);
            });
        }
        if (this.filters.area_id) {
            list = list.filter(task => {
                if (String(task.area_id || '') === String(this.filters.area_id)) return true;
                const project = task.project_id ? this.projectById(task.project_id) : null;
                return String(project?.area_id || '') === String(this.filters.area_id);
            });
        }
        if (this.filters.mine && App.currentEmployeeId) {
            list = list.filter(task => String(task.assignee_id || '') === String(App.currentEmployeeId));
        }
        if (this.filters.awaiting_review) list = list.filter(task => task.status === 'review');
        if (this.filters.waiting_only) list = list.filter(task => task.status === 'waiting');
        if (this.filters.due === 'overdue') list = list.filter(task => this.isOverdue(task));
        if (this.filters.due === 'today') list = list.filter(task => task.due_date === this.todayYmd());
        if (this.filters.due === 'week') {
            const now = new Date();
            const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            list = list.filter(task => task.due_date && task.due_date >= this.todayYmd() && task.due_date <= weekLater.toISOString().slice(0, 10));
        }
        if (this.filters.due === 'no_deadline') list = list.filter(task => !task.due_date);

        if (search) {
            list = list.filter(task => {
                const project = task.project_id ? this.projectById(task.project_id) : null;
                const order = task.order_id ? this.orderById(task.order_id) : (project?.linked_order_id ? this.orderById(project.linked_order_id) : null);
                const china = task.china_purchase_id ? this.chinaPurchaseById(task.china_purchase_id) : null;
                const warehouse = task.warehouse_item_id ? this.warehouseItemById(task.warehouse_item_id) : null;
                const haystack = WorkManagementCore.normalizeText([
                    task.title,
                    task.description,
                    task.assignee_name,
                    task.reporter_name,
                    task.waiting_for_text,
                    project?.title,
                    order?.order_name,
                    china?.purchase_name,
                    warehouse?.name,
                    warehouse?.sku,
                    ...(commentsByTask.get(String(task.id)) || []),
                ].join(' '));
                return haystack.includes(search);
            });
        }

        list.sort((a, b) => {
            if (this.sort === 'priority') {
                return WorkManagementCore.priorityWeight(b.priority) - WorkManagementCore.priorityWeight(a.priority)
                    || String(WorkManagementCore.buildTaskDueIso(a)).localeCompare(String(WorkManagementCore.buildTaskDueIso(b)), 'ru');
            }
            if (this.sort === 'due') {
                return String(WorkManagementCore.buildTaskDueIso(a)).localeCompare(String(WorkManagementCore.buildTaskDueIso(b)), 'ru')
                    || WorkManagementCore.priorityWeight(b.priority) - WorkManagementCore.priorityWeight(a.priority);
            }
            if (this.sort === 'created') {
                return String(b.created_at || '').localeCompare(String(a.created_at || ''));
            }
            return (Number(a.sort_index) || 0) - (Number(b.sort_index) || 0)
                || WorkManagementCore.priorityWeight(b.priority) - WorkManagementCore.priorityWeight(a.priority)
                || String(a.title || '').localeCompare(String(b.title || ''), 'ru');
        });

        return list;
    },

    statsCardsHtml() {
        const all = this.bundle?.tasks || [];
        const overdue = all.filter(task => this.isOverdue(task)).length;
        const review = all.filter(task => task.status === 'review').length;
        const waiting = all.filter(task => task.status === 'waiting').length;
        return `
            <div class="tasks-stats">
                <div class="task-stat-card task-stat-total">
                    <div class="task-stat-icon">&#128203;</div>
                    <div class="task-stat-info"><div class="stat-value">${this.activeTasksCount(all)}</div><div class="stat-label">Активные задачи</div></div>
                </div>
                <div class="task-stat-card task-stat-mine">
                    <div class="task-stat-icon">&#128100;</div>
                    <div class="task-stat-info"><div class="stat-value">${this.activeTasksCount(this.myTasks('assigned'))}</div><div class="stat-label">Поставили мне</div></div>
                </div>
                <div class="task-stat-card task-stat-review">
                    <div class="task-stat-icon">&#128172;</div>
                    <div class="task-stat-info"><div class="stat-value">${this.activeTasksCount(this.myTasks('outgoing'))}</div><div class="stat-label">Поставил я</div></div>
                </div>
                <div class="task-stat-card ${overdue > 0 ? 'task-stat-overdue-active' : 'task-stat-overdue'}">
                    <div class="task-stat-icon">${overdue > 0 ? '&#9888;' : '&#9989;'}</div>
                    <div class="task-stat-info"><div class="stat-value">${overdue}</div><div class="stat-label">Просрочено</div></div>
                </div>
                <div class="task-stat-card task-stat-review">
                    <div class="task-stat-icon">&#128172;</div>
                    <div class="task-stat-info"><div class="stat-value">${review}</div><div class="stat-label">На согласовании</div></div>
                </div>
                <div class="task-stat-card task-stat-waiting">
                    <div class="task-stat-icon">&#9203;</div>
                    <div class="task-stat-info"><div class="stat-value">${waiting}</div><div class="stat-label">Ждём</div></div>
                </div>
            </div>
        `;
    },

    filtersHtml() {
        const assigneeOptions = (this.employees || [])
            .filter(item => item.is_active !== false)
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.filters.assignee_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
        const reporterOptions = assigneeOptions;
        const projectOptions = (this.bundle?.projects || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.filters.project_id || '') ? 'selected' : ''}>${this.esc(item.title)}</option>`)
            .join('');
        const orderOptions = (this.orders || [])
            .filter(item => item.status !== 'deleted')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.filters.order_id || '') ? 'selected' : ''}>${this.esc(item.order_name || 'Без названия')}</option>`)
            .join('');
        const areaOptions = (this.bundle?.areas || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.filters.area_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
        const statusOptions = WorkManagementCore.TASK_STATUS_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === this.filters.status ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');
        const priorityOptions = WorkManagementCore.TASK_PRIORITY_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === this.filters.priority ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');
        return `
            <div class="tasks-filters-panel" id="tasks-filters-panel" style="display:${this._filtersOpen ? '' : 'none'}">
                <div class="form-row" style="align-items:end">
                    <div class="form-group" style="margin:0">
                        <label>Статус</label>
                        <select onchange="Tasks.updateFilter('status', this.value)">
                            <option value="">Все</option>
                            ${statusOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Приоритет</label>
                        <select onchange="Tasks.updateFilter('priority', this.value)">
                            <option value="">Все</option>
                            ${priorityOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Исполнитель</label>
                        <select onchange="Tasks.updateFilter('assignee_id', this.value)">
                            <option value="">Все</option>
                            ${assigneeOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Постановщик</label>
                        <select onchange="Tasks.updateFilter('reporter_id', this.value)">
                            <option value="">Все</option>
                            ${reporterOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Проект</label>
                        <select onchange="Tasks.updateFilter('project_id', this.value)">
                            <option value="">Все</option>
                            ${projectOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row" style="align-items:end;margin-top:8px;">
                    <div class="form-group" style="margin:0">
                        <label>Заказ</label>
                        <select onchange="Tasks.updateFilter('order_id', this.value)">
                            <option value="">Все</option>
                            ${orderOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Направление</label>
                        <select onchange="Tasks.updateFilter('area_id', this.value)">
                            <option value="">Все</option>
                            ${areaOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Дедлайн</label>
                        <select onchange="Tasks.updateFilter('due', this.value)">
                            <option value="">Все</option>
                            <option value="today" ${this.filters.due === 'today' ? 'selected' : ''}>Сегодня</option>
                            <option value="week" ${this.filters.due === 'week' ? 'selected' : ''}>7 дней</option>
                            <option value="overdue" ${this.filters.due === 'overdue' ? 'selected' : ''}>Просрочено</option>
                            <option value="no_deadline" ${this.filters.due === 'no_deadline' ? 'selected' : ''}>Без дедлайна</option>
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Сортировка</label>
                        <select onchange="Tasks.setSort(this.value)">
                            <option value="manual" ${this.sort === 'manual' ? 'selected' : ''}>Ручная очередь</option>
                            <option value="priority" ${this.sort === 'priority' ? 'selected' : ''}>По приоритету</option>
                            <option value="due" ${this.sort === 'due' ? 'selected' : ''}>По дедлайну</option>
                            <option value="created" ${this.sort === 'created' ? 'selected' : ''}>По созданию</option>
                        </select>
                    </div>
                </div>
                <div class="form-row" style="align-items:center;margin-top:8px;">
                    <label class="tasks-checkbox-label"><input type="checkbox" ${this.filters.mine ? 'checked' : ''} onchange="Tasks.updateFilter('mine', this.checked)"> Только мои</label>
                    <label class="tasks-checkbox-label"><input type="checkbox" ${this.filters.awaiting_review ? 'checked' : ''} onchange="Tasks.updateFilter('awaiting_review', this.checked)"> На согласовании</label>
                    <label class="tasks-checkbox-label"><input type="checkbox" ${this.filters.waiting_only ? 'checked' : ''} onchange="Tasks.updateFilter('waiting_only', this.checked)"> Только «Ждём»</label>
                    <button class="btn btn-sm btn-outline" style="margin-left:auto" onclick="Tasks.resetFilters()">Сбросить</button>
                </div>
            </div>
        `;
    },

    inlineStatusSelectHtml(task) {
        return `
            <select
                class="inline-status-select status-${this.esc(task.status || 'incoming')}"
                onclick="Tasks.onInlineStatusClick(event)"
                onchange="Tasks.onInlineStatusChange(event, ${task.id}, this.value)"
            >
                ${this.statusOptionsHtml(task.status || 'incoming')}
            </select>
        `;
    },

    renderRowActions(task, { showManualMoves = false } = {}) {
        return `
            <div class="task-row-actions">
                ${showManualMoves ? `
                    <button class="btn btn-sm btn-outline task-row-icon-btn" type="button" title="Поднять выше" aria-label="Поднять задачу выше" onclick="return Tasks.onMoveTaskClick(event, ${task.id}, -1)">↑</button>
                    <button class="btn btn-sm btn-outline task-row-icon-btn" type="button" title="Опустить ниже" aria-label="Опустить задачу ниже" onclick="return Tasks.onMoveTaskClick(event, ${task.id}, 1)">↓</button>
                ` : ''}
                <button class="btn btn-sm btn-outline task-row-icon-btn task-row-delete-btn" type="button" title="Удалить задачу" aria-label="Удалить задачу" onclick="return Tasks.onDeleteTaskClick(event, ${task.id})">&times;</button>
            </div>
        `;
    },

    renderListView(tasks, options = {}) {
        const showManualMoves = this.sort === 'manual' && !options.disableManualMoves;
        const rows = tasks.map(task => `
            <tr onclick="Tasks.openTask(${task.id})" style="cursor:pointer">
                <td>
                    <div style="font-weight:600">${this.esc(task.title)}</div>
                    <div class="text-muted" style="font-size:12px">${this.esc(this.contextLabel(task))}</div>
                </td>
                <td>${this.inlineStatusSelectHtml(task)}</td>
                <td><span class="badge ${this.priorityBadgeClass(task.priority)}">${this.esc(this.priorityLabel(task.priority))}</span></td>
                <td>${this.esc(task.assignee_name || this.employeeNameById(task.assignee_id, '—'))}</td>
                <td>${this.esc(task.reporter_name || this.employeeNameById(task.reporter_id, '—'))}</td>
                <td class="${this.isOverdue(task) ? 'text-red' : ''}">${this.esc(this.formatTaskDue(task))}</td>
                <td>${this.renderRowActions(task, { showManualMoves })}</td>
            </tr>
        `).join('');

        return `
            <div class="card" style="padding:0;">
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Задача</th>
                                <th>Статус</th>
                                <th>Приоритет</th>
                                <th>Исполнитель</th>
                                <th>Постановщик</th>
                                <th>Дедлайн</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td colspan="7" class="text-center text-muted">Нет задач</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderCompletedSection(tasks) {
        if (!tasks.length) return '';
        const isOpen = this.isCompletedPanelOpen();
        return `
            <div class="tasks-completed-section">
                <button class="tasks-completed-toggle ${isOpen ? 'is-open' : ''}" onclick="Tasks.toggleCompletedPanel()">
                    <div>
                        <div class="tasks-completed-title">Готовые и отмененные задачи</div>
                        <div class="tasks-completed-subtitle">Скрыты, чтобы не мешать актуальной работе, но всегда доступны для проверки.</div>
                    </div>
                    <div class="tasks-completed-meta">
                        <span class="tasks-completed-count">${tasks.length}</span>
                        <span class="tasks-completed-chevron">${isOpen ? '&#9650;' : '&#9660;'}</span>
                    </div>
                </button>
                <div class="tasks-completed-body" style="display:${isOpen ? '' : 'none'}">
                    ${this.renderListView(tasks, { disableManualMoves: true })}
                </div>
            </div>
        `;
    },

    renderKanbanView(tasks) {
        const columns = WorkManagementCore.TASK_STATUS_OPTIONS.map(status => {
            const columnTasks = tasks.filter(task => task.status === status.value);
            return `
                <div class="kanban-column">
                    <div class="kanban-header"><span>${this.esc(status.label)}</span><span class="kanban-count">${columnTasks.length}</span></div>
                    <div class="kanban-cards">
                        ${columnTasks.map(task => `
                            <div class="kanban-card" onclick="Tasks.openTask(${task.id})">
                                <div class="task-card-title">${this.esc(task.title)}</div>
                                <div class="task-card-meta">
                                    <span class="task-project-tag">${this.esc(this.priorityLabel(task.priority))}</span>
                                    <span class="${this.isOverdue(task) ? 'text-red' : ''}">${this.esc(this.formatTaskDue(task))}</span>
                                </div>
                                <div class="text-muted" style="font-size:12px;">${this.esc(task.assignee_name || this.employeeNameById(task.assignee_id, '—'))}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        return `<div class="kanban-board">${columns}</div>`;
    },

    renderCalendarView(tasks) {
        const [year, month] = this.calendarMonth.split('-').map(value => Number(value));
        const firstDay = new Date(year, month - 1, 1);
        const daysInMonth = new Date(year, month, 0).getDate();
        const startWeekday = (firstDay.getDay() + 6) % 7;
        const cells = [];

        for (let i = 0; i < startWeekday; i += 1) {
            cells.push('<div class="wm-calendar-cell is-empty"></div>');
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dateKey = `${this.calendarMonth}-${String(day).padStart(2, '0')}`;
            const dayTasks = tasks.filter(task => task.due_date === dateKey);
            cells.push(`
                <div class="wm-calendar-cell">
                    <div class="wm-calendar-day">${day}</div>
                    <div class="wm-calendar-tasks">
                        ${dayTasks.map(task => `
                            <button class="wm-calendar-task ${this.isOverdue(task) ? 'is-overdue' : ''}" onclick="Tasks.openTask(${task.id})">
                                ${this.esc(task.title)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `);
        }

        const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        return `
            <div class="card">
                <div class="card-header">
                    <h3>Календарь задач</h3>
                    <div class="flex gap-8">
                        <button class="btn btn-sm btn-outline" onclick="Tasks.shiftCalendar(-1)">←</button>
                        <span style="font-weight:600;">${this.esc(monthLabel)}</span>
                        <button class="btn btn-sm btn-outline" onclick="Tasks.shiftCalendar(1)">→</button>
                    </div>
                </div>
                <div class="wm-calendar-grid wm-calendar-head">
                    <div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div>
                </div>
                <div class="wm-calendar-grid wm-calendar-body">
                    ${cells.join('')}
                </div>
            </div>
        `;
    },

    renderMainContent(tasks) {
        const groups = this.splitTasksByCompletion(tasks);
        const activeMarkup = this.view === 'kanban'
            ? this.renderKanbanView(groups.active)
            : this.view === 'calendar'
                ? this.renderCalendarView(groups.active)
                : this.renderListView(groups.active);
        const emptyMarkup = `
            <div class="card">
                <div class="empty-state">
                    <div class="empty-icon">&#9989;</div>
                    <p>Здесь нет актуальных задач.</p>
                </div>
            </div>
        `;
        return `
            <div class="tasks-feed-section">
                <div class="tasks-feed-header">
                    <div>
                        <h3>${this.esc(this.activeFeedTitle())}</h3>
                        <p>${this.esc(this.activeFeedSubtitle())}</p>
                    </div>
                    <div class="tasks-feed-badge">${groups.active.length}</div>
                </div>
                ${groups.active.length ? activeMarkup : emptyMarkup}
            </div>
            ${this.renderCompletedSection(groups.completed)}
        `;
    },

    editorTask() {
        return this.createDraft || (this.currentTaskId ? this.taskById(this.currentTaskId) : null);
    },

    editorWatcherIds(task) {
        if (!task) return [];
        const ids = new Set(this.createDraft ? (this.createDraft.watcher_ids || []) : this.watcherIdsForTask(task.id));
        if (task.reviewer_id) ids.add(Number(task.reviewer_id));
        return Array.from(ids).filter(Boolean);
    },

    editorTitle(task) {
        return this.createDraft ? 'Новая задача' : 'Карточка задачи';
    },

    resetTemplateDraft(template = null) {
        this.templateDraft = template
            ? {
                id: template.id,
                kind: 'task',
                name: template.name || '',
                title: template.title || '',
                description: template.description || '',
                default_priority: template.default_priority || 'normal',
                checklist_items: Array.isArray(template.checklist_items) ? template.checklist_items.join('\n') : '',
                suggested_subtasks: Array.isArray(template.suggested_subtasks) ? template.suggested_subtasks.join('\n') : '',
            }
            : {
                id: '',
                kind: 'task',
                name: '',
                title: '',
                description: '',
                default_priority: 'normal',
                checklist_items: '',
                suggested_subtasks: '',
            };
        if (this.templateManagerOpen) this.renderTemplateManager();
    },

    openTemplateManager(templateId = null) {
        const selectedId = templateId
            || document.getElementById('task-editor-template')?.value
            || this.createDraft?.template_id
            || this.defaultTaskTemplateId();
        const template = (this.bundle?.templates || []).find(item => item.kind === 'task' && String(item.id) === String(selectedId));
        this.templateManagerOpen = true;
        this.resetTemplateDraft(template || null);
        this.renderTemplateManager();
    },

    closeTemplateManager() {
        this.templateManagerOpen = false;
        this.templateDraft = null;
        const drawer = document.getElementById('task-template-overlay');
        if (drawer) {
            drawer.classList.remove('is-open');
            setTimeout(() => { drawer.remove(); }, 250);
        }
    },

    taskTemplateOptionsHtml(selectedTemplateId) {
        return (this.bundle?.templates || [])
            .filter(item => item.kind === 'task')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selectedTemplateId || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
    },

    statusOptionsHtml(selected) {
        return WorkManagementCore.TASK_STATUS_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');
    },

    priorityOptionsHtml(selected) {
        return WorkManagementCore.TASK_PRIORITY_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === selected ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');
    },

    employeeOptionsHtml(selected) {
        return (this.employees || [])
            .filter(item => item.is_active !== false)
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
    },

    orderOptionsHtml(selected) {
        return (this.orders || [])
            .filter(item => item.status !== 'deleted')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${this.esc(item.order_name || 'Без названия')}</option>`)
            .join('');
    },

    projectOptionsHtml(selected) {
        return (this.bundle?.projects || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${this.esc(item.title)}</option>`)
            .join('');
    },

    areaOptionsHtml(selected) {
        return (this.bundle?.areas || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
    },

    chinaOptionsHtml(selected) {
        return (this.chinaPurchases || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${this.esc(item.purchase_name || `Закупка #${item.id}`)}</option>`)
            .join('');
    },

    warehouseOptionsHtml(selected) {
        return (this.warehouseItems || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(selected || '') ? 'selected' : ''}>${this.esc(item.name || `Позиция #${item.id}`)}</option>`)
            .join('');
    },

    contextToggleButtonsHtml(task) {
        const visible = this.visibleContextsForTask(task);
        const items = [
            { key: 'order', label: 'Заказ', active: visible.order },
            { key: 'project', label: 'Проект', active: visible.project },
            { key: 'china', label: 'China', active: visible.china },
            { key: 'warehouse', label: 'Склад', active: visible.warehouse },
        ];
        return `
            <div class="task-context-toggles">
                ${items.map(item => `
                    <button type="button" class="task-context-toggle ${item.active ? 'active' : ''}" data-context-key="${item.key}" data-label="${this.esc(item.label)}" onclick="Tasks.toggleContextBinding('${item.key}')">
                        ${item.active ? '✓ ' : '+ '}${this.esc(item.label)}
                    </button>
                `).join('')}
            </div>
        `;
    },

    contextSelectHtml(config) {
        return `
            <div class="form-group task-context-field ${config.visible ? '' : 'is-hidden'}" data-context-key="${this.esc(config.key)}">
                <label>${this.esc(config.label)}</label>
                <div class="task-context-select-row">
                    <select id="${this.esc(config.id)}">
                        <option value="">—</option>
                        ${config.optionsHtml}
                    </select>
                    <button type="button" class="btn btn-sm btn-outline" onclick="Tasks.toggleContextBinding('${this.esc(config.key)}')">Убрать</button>
                </div>
            </div>
        `;
    },

    renderChecklistSection(task) {
        if (!task?.id) {
            return '<div class="card"><div class="text-muted">Сначала сохраните задачу, затем добавьте чек-лист, комментарии и файлы.</div></div>';
        }
        const items = this.checklistForTask(task.id);
        return `
            <div class="card">
                <div class="card-header"><h3>Чек-лист</h3></div>
                <div class="wm-checklist-list">
                    ${items.length === 0 ? '<div class="text-muted">Пока нет пунктов</div>' : items.map(item => `
                        <label class="wm-checklist-row">
                            <input type="checkbox" ${item.is_done ? 'checked' : ''} onchange="Tasks.toggleChecklist(${item.id}, this.checked)">
                            <span class="${item.is_done ? 'text-muted' : ''}">${this.esc(item.title)}</span>
                            <button class="btn btn-sm btn-outline" type="button" onclick="Tasks.deleteChecklistItem(${item.id})">Удалить</button>
                        </label>
                    `).join('')}
                </div>
                <div class="form-row" style="align-items:end;margin-top:12px;">
                    <div class="form-group" style="flex:1">
                        <label>Новый пункт</label>
                        <input id="task-checklist-new" type="text" placeholder="Что проверить?">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;">
                        <button class="btn btn-outline" onclick="Tasks.addChecklistItem(${task.id})">Добавить</button>
                    </div>
                </div>
            </div>
        `;
    },

    renderSubtasksSection(task) {
        if (!task?.id) return '';
        const subtasks = this.subtasksForTask(task.id);
        return `
            <div class="card">
                <div class="card-header">
                    <h3>Подзадачи</h3>
                    <button class="btn btn-sm btn-outline" onclick="Tasks.openCreate({ parent_task_id: ${task.id}, project_id: ${task.project_id || 'null'}, order_id: ${task.order_id || 'null'}, china_purchase_id: ${task.china_purchase_id || 'null'}, warehouse_item_id: ${task.warehouse_item_id || 'null'}, due_date: '${task.due_date || ''}' })">+ Подзадача</button>
                </div>
                <div class="wm-subtasks-list">
                    ${subtasks.length === 0
                        ? '<div class="text-muted">Подзадач пока нет</div>'
                        : subtasks.map(item => `
                            <button class="wm-subtask-row" onclick="Tasks.openTask(${item.id})">
                                <span>${this.esc(item.title)}</span>
                                <span class="text-muted">${this.esc(this.statusLabel(item.status))} · ${this.esc(this.formatTaskDue(item))}</span>
                            </button>
                        `).join('')}
                </div>
            </div>
        `;
    },

    renderCommentsSection(task) {
        if (!task?.id) return '';
        const comments = this.commentsForTask(task.id);
        return `
            <div class="card">
                <div class="card-header"><h3>Комментарии</h3></div>
                <div class="wm-comments-list">
                    ${comments.length === 0
                        ? '<div class="text-muted">Комментариев пока нет</div>'
                        : comments.map(comment => `
                            <div class="wm-comment-row">
                                <div style="font-weight:600">${this.esc(comment.author_name || 'Сотрудник')}</div>
                                <div style="white-space:pre-wrap;">${this.esc(comment.body)}</div>
                                <div class="text-muted" style="font-size:12px">${this.esc(this.formatDate(comment.created_at))}</div>
                            </div>
                        `).join('')}
                </div>
                <div class="form-group" style="margin-top:12px;">
                    <label>Новый комментарий</label>
                    <textarea id="task-comment-new" rows="3" placeholder="Можно упоминать коллег как @Имя Фамилия"></textarea>
                </div>
                <button class="btn btn-outline" onclick="Tasks.addComment(${task.id})">Добавить комментарий</button>
            </div>
        `;
    },

    renderAssetsSection(task) {
        if (!task?.id) return '';
        const assets = this.assetsForTask(task.id);
        return `
            <div class="card">
                <div class="card-header"><h3>Файлы и ссылки</h3></div>
                <div class="form-row" style="align-items:end;">
                    <div class="form-group" style="flex:2">
                        <label>Ссылка</label>
                        <input id="task-link-url" type="url" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label>Название</label>
                        <input id="task-link-title" type="text" placeholder="Например, референс">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;">
                        <button class="btn btn-outline" onclick="Tasks.addLink(${task.id})">Добавить ссылку</button>
                    </div>
                </div>
                <div class="form-row" style="align-items:end;">
                    <div class="form-group" style="flex:2">
                        <label>Файл</label>
                        <input id="task-file-input" type="file" accept="image/*,.pdf,.ai,.psd,.svg,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt">
                    </div>
                    <div class="form-group">
                        <label>Название</label>
                        <input id="task-file-title" type="text" placeholder="Необязательно">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;">
                        <button class="btn btn-outline" onclick="Tasks.addFile(${task.id})">Загрузить</button>
                    </div>
                </div>
                <div class="wm-assets-list">
                    ${assets.length === 0
                        ? '<div class="text-muted">Пока ничего не добавлено</div>'
                        : assets.map(asset => asset.kind === 'file'
                            ? `
                                <div class="wm-asset-row">
                                    <div>
                                        <div style="font-weight:600">${this.esc(asset.title || asset.file_name || 'Файл')}</div>
                                        <div class="text-muted" style="font-size:12px">${this.esc(asset.file_name || '')}</div>
                                    </div>
                                    <div class="flex gap-8">
                                        <a class="btn btn-sm btn-outline" href="${this.esc(asset.data_url || asset.url)}" target="_blank">Открыть</a>
                                        <button class="btn btn-sm btn-outline" onclick="Tasks.deleteAsset(${asset.id})">Удалить</button>
                                    </div>
                                </div>
                            `
                            : `
                                <div class="wm-asset-row">
                                    <div>
                                        <div style="font-weight:600">${this.esc(asset.title || 'Ссылка')}</div>
                                        <div class="text-muted" style="font-size:12px">${this.esc(asset.url || '')}</div>
                                    </div>
                                    <div class="flex gap-8">
                                        <a class="btn btn-sm btn-outline" href="${this.esc(asset.url)}" target="_blank">Открыть</a>
                                        <button class="btn btn-sm btn-outline" onclick="Tasks.deleteAsset(${asset.id})">Удалить</button>
                                    </div>
                                </div>
                            `
                        ).join('')}
                </div>
            </div>
        `;
    },

    renderActivitySection(task) {
        if (!task?.id) return '';
        const items = this.activityForTask(task.id);
        return `
            <div class="card">
                <div class="card-header"><h3>История</h3></div>
                <div class="wm-activity-list">
                    ${items.length === 0
                        ? '<div class="text-muted">История пока пустая</div>'
                        : items.map(item => `
                            <div class="wm-activity-row">
                                <div style="font-weight:600">${this.esc(item.message)}</div>
                                <div class="text-muted" style="font-size:12px">${this.esc(item.author_name || 'Система')} · ${this.esc(this.formatDate(item.created_at))}</div>
                            </div>
                        `).join('')}
                </div>
            </div>
        `;
    },

    renderBugReportSection(task) {
        if (!task?.id) return '';
        const report = this.bugReportForTask(task.id);
        if (!report) return '';
        const prompt = String(report.codex_prompt || '').trim();
        const route = report.page_route || report.page_url || '—';
        return `
            <div class="card">
                <div class="card-header">
                    <h3>Связанный баг</h3>
                    <div class="bug-report-actions">
                        ${report.page_url ? `<a class="btn btn-sm btn-outline" href="${this.esc(report.page_url)}" target="_blank" rel="noopener">Открыть страницу</a>` : ''}
                        <button class="btn btn-sm btn-outline" onclick="Tasks.copyBugPrompt(${task.id})"${prompt ? '' : ' disabled'}>Скопировать prompt</button>
                    </div>
                </div>
                <div class="bug-report-card">
                    <div class="bug-report-card-top">
                        <div>
                            <h4>${this.esc(report.title || task.title || 'Баг-репорт')}</h4>
                            <div class="bug-report-meta">
                                <span>${this.esc(report.section_name || 'Без раздела')}</span>
                                <span>•</span>
                                <span>${this.esc(report.subsection_name || 'Без подраздела')}</span>
                                <span>•</span>
                                <span>${this.esc(route)}</span>
                            </div>
                        </div>
                        <div class="bug-report-badges">
                            <span class="badge ${this.bugSeverityBadgeClass(report.severity)}">${this.esc(this.bugSeverityLabel(report.severity))}</span>
                            <span class="badge ${this.bugPromptBadgeClass(report.codex_status, !!prompt)}">${this.esc(this.bugPromptStatusLabel(report.codex_status, !!prompt))}</span>
                        </div>
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label>Что не работает</label>
                        <p class="bug-report-description">${this.esc(report.actual_result || 'Не указано')}</p>
                    </div>
                    ${report.expected_result ? `
                        <div class="form-group" style="margin-bottom:12px;">
                            <label>Что ожидалось</label>
                            <p class="bug-report-description">${this.esc(report.expected_result)}</p>
                        </div>
                    ` : ''}
                    ${report.steps_to_reproduce ? `
                        <div class="form-group" style="margin-bottom:12px;">
                            <label>Шаги</label>
                            <p class="bug-report-description">${this.esc(report.steps_to_reproduce)}</p>
                        </div>
                    ` : ''}
                    <div class="bug-report-prompt-box">
                        <div class="bug-report-footer">
                            <div class="bug-report-footer-meta">
                                <span>Prompt для Codex</span>
                                <span>•</span>
                                <span>${this.esc(report.app_version || 'Версия не указана')}</span>
                            </div>
                            <div class="bug-report-actions">
                                <button class="btn btn-sm btn-outline" onclick="Tasks.copyBugPrompt(${task.id})"${prompt ? '' : ' disabled'}>Скопировать prompt</button>
                            </div>
                        </div>
                        ${prompt
                            ? `<pre>${this.esc(prompt)}</pre>`
                            : '<div class="text-muted" style="margin-top:10px;">Prompt ещё не сгенерировался.</div>'}
                    </div>
                </div>
            </div>
        `;
    },

    renderEditor(task) {
        if (!task) return '';
        const isNew = !task.id;
        const watcherIds = this.editorWatcherIds(task);
        const visibleContexts = this.visibleContextsForTask(task);
        const restoredDraftNotice = this.createDraft && this.editorUi?.restoredDraft;
        return `
            <div class="card">
                <div class="card-header">
                    <h3>${this.esc(this.editorTitle(task))}</h3>
                    <div class="flex gap-8">
                        ${this.createDraft ? `<button class="btn btn-sm btn-outline" onclick="Tasks.discardStoredDraft()">Сбросить черновик</button>` : ''}
                        ${!isNew ? `<button class="btn btn-sm btn-outline" onclick="Tasks.deleteTask(${task.id})">Удалить</button>` : ''}
                        <button class="btn btn-sm btn-outline" onclick="Tasks.cancelEditor()">Закрыть</button>
                    </div>
                </div>
                <input type="hidden" id="task-editor-id" value="${this.esc(task.id || '')}">
                ${restoredDraftNotice ? `
                    <div class="task-draft-banner">
                        <strong>Черновик восстановлен.</strong> Эта версия хранится только локально в вашем браузере и скоро истечет сама.
                    </div>
                ` : ''}
                <div class="form-row">
                    <div class="form-group" style="flex:2">
                        <label>Шаблон</label>
                        <div class="task-template-picker-row">
                            <select id="task-editor-template" onchange="Tasks.onTemplateChange(this.value)">
                                <option value="">Без шаблона</option>
                                ${this.taskTemplateOptionsHtml(task.template_id)}
                            </select>
                            <button type="button" class="btn btn-sm btn-outline" onclick="Tasks.openTemplateManager()">Шаблоны</button>
                        </div>
                    </div>
                    <div class="form-group" style="flex:4">
                        <label>Название</label>
                        <input id="task-editor-title" type="text" value="${this.esc(task.title || '')}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Статус</label>
                        <select id="task-editor-status">${this.statusOptionsHtml(task.status || 'incoming')}</select>
                    </div>
                    <div class="form-group">
                        <label>Приоритет</label>
                        <select id="task-editor-priority">${this.priorityOptionsHtml(task.priority || 'normal')}</select>
                    </div>
                    <div class="form-group">
                        <label>Дедлайн</label>
                        <input id="task-editor-due-date" type="date" value="${this.esc(task.due_date || '')}">
                    </div>
                    <div class="form-group">
                        <label>Время</label>
                        <input id="task-editor-due-time" type="time" value="${this.esc(task.due_time || '')}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Постановщик</label>
                        <select id="task-editor-reporter">
                            <option value="">—</option>
                            ${this.employeeOptionsHtml(task.reporter_id)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Исполнитель</label>
                        <select id="task-editor-assignee">
                            <option value="">—</option>
                            ${this.employeeOptionsHtml(task.assignee_id)}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Привязки</label>
                    ${this.contextToggleButtonsHtml(task)}
                    <div class="text-muted" style="font-size:12px;margin-top:8px;">
                        Можно оставить задачу без привязки или прикрепить сразу к нескольким сущностям.
                    </div>
                </div>
                <div class="form-row task-context-grid">
                    ${this.contextSelectHtml({
                        key: 'order',
                        label: 'Заказ',
                        id: 'task-editor-order',
                        optionsHtml: this.orderOptionsHtml(task.order_id),
                        visible: visibleContexts.order,
                    })}
                    ${this.contextSelectHtml({
                        key: 'project',
                        label: 'Проект',
                        id: 'task-editor-project',
                        optionsHtml: this.projectOptionsHtml(task.project_id),
                        visible: visibleContexts.project,
                    })}
                    ${this.contextSelectHtml({
                        key: 'china',
                        label: 'China',
                        id: 'task-editor-china',
                        optionsHtml: this.chinaOptionsHtml(task.china_purchase_id),
                        visible: visibleContexts.china,
                    })}
                    ${this.contextSelectHtml({
                        key: 'warehouse',
                        label: 'Склад',
                        id: 'task-editor-warehouse',
                        optionsHtml: this.warehouseOptionsHtml(task.warehouse_item_id),
                        visible: visibleContexts.warehouse,
                    })}
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Ждём от кого / что ждём</label>
                        <input id="task-editor-waiting" type="text" value="${this.esc(task.waiting_for_text || '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="task-editor-description" rows="4">${this.esc(task.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Наблюдатели</label>
                    <div class="text-muted" style="font-size:12px;margin-bottom:8px;">Наблюдатели тоже видят задачу и получают уведомления о согласовании.</div>
                    <div class="wm-watchers-grid">
                        ${(this.employees || []).filter(item => item.is_active !== false).map(item => `
                            <label class="wm-watcher-chip">
                                <input type="checkbox" value="${item.id}" ${watcherIds.includes(Number(item.id)) ? 'checked' : ''}>
                                <span>${this.esc(item.name)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
                <div class="flex gap-8" style="flex-wrap:wrap;">
                    <button class="btn btn-success" onclick="Tasks.saveTask()">Сохранить</button>
                    ${!isNew ? `<button class="btn btn-outline" onclick="Tasks.sendToReview(${task.id})">На согласование</button>` : ''}
                    ${!isNew ? `<button class="btn btn-outline" onclick="Tasks.returnToWork(${task.id})">Вернуть в работу</button>` : ''}
                    ${!isNew ? `<button class="btn btn-outline" onclick="Tasks.approveTask(${task.id})">Готово</button>` : ''}
                    ${!isNew ? `<button class="btn btn-outline" onclick="Tasks.changeStatus(${task.id}, 'cancelled')">Отменить</button>` : ''}
                </div>
            </div>
            ${this.renderBugReportSection(task)}
            ${this.renderChecklistSection(task)}
            ${this.renderSubtasksSection(task)}
            ${this.renderCommentsSection(task)}
            ${this.renderAssetsSection(task)}
            ${this.renderActivitySection(task)}
        `;
    },

    render() {
        const container = document.getElementById('page-tasks');
        if (!container) return;
        if (this.isLoading && !this.bundle) {
            container.innerHTML = `
                <div class="page-header">
                    <div>
                        <h1>Задачи</h1>
                        <div class="text-muted" style="font-size:13px;">Собираем задачи по заказам, проектам и направлениям</div>
                    </div>
                </div>
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-label">Мои задачи</div><div class="stat-value">…</div></div>
                    <div class="stat-card"><div class="stat-label">Все задачи</div><div class="stat-value">…</div></div>
                    <div class="stat-card"><div class="stat-label">Просроченные</div><div class="stat-value">…</div></div>
                    <div class="stat-card"><div class="stat-label">На согласовании</div><div class="stat-value">…</div></div>
                </div>
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128221;</div>
                        <p>Загружаем рабочий центр задач…</p>
                    </div>
                </div>
            `;
            return;
        }
        const tasks = this.filteredTasks();
        const activeTask = this.editorTask();
        const hasActiveFilters = this.filters.status || this.filters.priority || this.filters.assignee_id || this.filters.reporter_id || this.filters.project_id || this.filters.order_id || this.filters.area_id || this.filters.due || this.filters.mine || this.filters.awaiting_review || this.filters.waiting_only;
        container.innerHTML = `
            <div class="tasks-page-header">
                <div class="tasks-header-top">
                    <div>
                        <h1>Задачи</h1>
                        <p class="tasks-page-subtitle">Очереди исполнителей, задачи по заказам и живая база шаблонов</p>
                    </div>
                    <div class="tasks-header-actions">
                        <button class="btn btn-outline" onclick="Tasks.openTemplateManager()">Шаблоны</button>
                        <button class="btn btn-outline" onclick="Tasks.openCreate()">+ Задача</button>
                        <button class="btn btn-success" onclick="Tasks.openCreate({}, ${this.defaultTaskTemplateId() || "''"})">Из шаблона</button>
                    </div>
                </div>
                <div class="tasks-header-controls">
                    <div class="tasks-header-scope-stack">
                        ${this.scopeTabsHtml()}
                        ${this.myModeTabsHtml()}
                    </div>
                    ${this.viewTabsHtml()}
                </div>
            </div>
            ${this.statsCardsHtml()}
            <div class="tasks-toolbar">
                <div class="tasks-search-wrap">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input type="text" value="${this.esc(this.filters.search)}" oninput="Tasks.updateFilter('search', this.value)" placeholder="Поиск по названию, описанию, комментариям...">
                </div>
                <button class="btn btn-outline btn-sm tasks-filter-toggle ${hasActiveFilters ? 'has-active' : ''}" onclick="Tasks.toggleFilters()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/></svg>
                    Фильтры${hasActiveFilters ? ' ●' : ''}
                </button>
            </div>
            ${this.filtersHtml()}
            ${this.renderMainContent(tasks)}
        `;
        this.renderDrawer(activeTask);
        this.renderTemplateManager();
    },

    renderDrawer(task) {
        let drawer = document.getElementById('task-drawer-overlay');
        if (!task) {
            if (drawer) {
                drawer.classList.remove('is-open');
                document.body.style.overflow = '';
                setTimeout(() => drawer.remove(), 250);
            }
            return;
        }
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'task-drawer-overlay';
            drawer.className = 'task-drawer-overlay';
            drawer.innerHTML = `
                <div class="task-drawer-backdrop" onclick="Tasks.cancelEditor()"></div>
                <div class="task-drawer-panel">
                    <div class="task-drawer-content"></div>
                </div>
            `;
            document.body.appendChild(drawer);
            document.body.style.overflow = 'hidden';
            requestAnimationFrame(() => drawer.classList.add('is-open'));
            if (!this._escHandler) {
                this._escHandler = (e) => { if (e.key === 'Escape') Tasks.cancelEditor(); };
                document.addEventListener('keydown', this._escHandler);
            }
        } else {
            if (!drawer.classList.contains('is-open')) {
                document.body.style.overflow = 'hidden';
                requestAnimationFrame(() => drawer.classList.add('is-open'));
            }
        }
        const content = drawer.querySelector('.task-drawer-content');
        if (content) {
            content.innerHTML = this.renderEditor(task);
            this.bindEditorListeners(content);
        }
    },

    bindEditorListeners(container) {
        if (!container || !this.createDraft) return;
        const fields = container.querySelectorAll('input, textarea, select');
        fields.forEach(field => {
            const handler = () => this.captureLocalDraftFromEditor();
            field.addEventListener('input', handler);
            field.addEventListener('change', handler);
        });
    },

    captureLocalDraftFromEditor() {
        if (!this.createDraft) return;
        clearTimeout(this._draftSaveTimer);
        this._draftSaveTimer = setTimeout(() => {
            const draft = this.readEditorForm();
            this.createDraft = {
                ...this.createDraft,
                ...draft,
            };
            this.persistStoredDraft(this.createDraft);
        }, 250);
    },

    toggleContextBinding(kind) {
        if (!this.editorUi?.visibleContexts) {
            this.editorUi = {
                ...(this.editorUi || {}),
                visibleContexts: { order: false, project: false, china: false, warehouse: false },
            };
        }
        const nextVisible = !this.editorUi.visibleContexts[kind];
        this.editorUi.visibleContexts[kind] = nextVisible;
        const button = document.querySelector(`.task-context-toggle[data-context-key="${kind}"]`);
        if (button) {
            const baseLabel = button.getAttribute('data-label') || button.textContent.replace(/^(\+|✓)\s*/, '');
            button.classList.toggle('active', nextVisible);
            button.textContent = `${nextVisible ? '✓ ' : '+ '}${baseLabel}`;
        }
        const fieldWrapper = document.querySelector(`.task-context-field[data-context-key="${kind}"]`);
        if (fieldWrapper) fieldWrapper.classList.toggle('is-hidden', !nextVisible);
        const fieldMap = {
            order: 'task-editor-order',
            project: 'task-editor-project',
            china: 'task-editor-china',
            warehouse: 'task-editor-warehouse',
        };
        const draftFieldMap = {
            order: 'order_id',
            project: 'project_id',
            china: 'china_purchase_id',
            warehouse: 'warehouse_item_id',
        };
        if (!nextVisible) {
            const input = document.getElementById(fieldMap[kind]);
            if (input) input.value = '';
            if (this.createDraft) this.createDraft[draftFieldMap[kind]] = '';
        }
        this.captureLocalDraftFromEditor();
    },

    renderTemplateManager() {
        let drawer = document.getElementById('task-template-overlay');
        if (!this.templateManagerOpen) {
            if (drawer) {
                drawer.classList.remove('is-open');
                setTimeout(() => drawer.remove(), 250);
            }
            return;
        }
        if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'task-template-overlay';
            drawer.className = 'task-drawer-overlay task-template-overlay';
            drawer.innerHTML = `
                <div class="task-drawer-backdrop" onclick="Tasks.closeTemplateManager()"></div>
                <div class="task-drawer-panel task-template-panel">
                    <div class="task-drawer-content"></div>
                </div>
            `;
            document.body.appendChild(drawer);
            requestAnimationFrame(() => drawer.classList.add('is-open'));
        } else if (!drawer.classList.contains('is-open')) {
            requestAnimationFrame(() => drawer.classList.add('is-open'));
        }
        const content = drawer.querySelector('.task-drawer-content');
        const templates = (this.bundle?.templates || []).filter(item => item.kind === 'task');
        if (content) {
            content.innerHTML = `
                <div class="card">
                    <div class="card-header">
                        <h3>Шаблоны задач</h3>
                        <div class="flex gap-8">
                            <button class="btn btn-sm btn-outline" onclick="Tasks.resetTemplateDraft()">+ Новый шаблон</button>
                            <button class="btn btn-sm btn-outline" onclick="Tasks.closeTemplateManager()">Закрыть</button>
                        </div>
                    </div>
                    <div class="task-template-layout">
                        <div class="task-template-list">
                            ${templates.map(item => `
                                <button type="button" class="task-template-list-item ${String(item.id) === String(this.templateDraft?.id || '') ? 'active' : ''}" onclick="Tasks.selectTemplateDraft(${item.id})">
                                    <strong>${this.esc(item.name)}</strong>
                                    <span>${this.esc(item.title || 'Без названия')}</span>
                                </button>
                            `).join('') || '<div class="text-muted">Шаблонов пока нет</div>'}
                        </div>
                        <div class="task-template-form">
                            <div class="form-group">
                                <label>Название шаблона</label>
                                <input id="task-template-name" type="text" value="${this.esc(this.templateDraft?.name || '')}" placeholder="Например, Поставка на склад">
                            </div>
                            <div class="form-group">
                                <label>Название задачи</label>
                                <input id="task-template-title" type="text" value="${this.esc(this.templateDraft?.title || '')}" placeholder="Как будет называться новая задача">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Приоритет по умолчанию</label>
                                    <select id="task-template-priority">${this.priorityOptionsHtml(this.templateDraft?.default_priority || 'normal')}</select>
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Описание</label>
                                <textarea id="task-template-description" rows="5">${this.esc(this.templateDraft?.description || '')}</textarea>
                            </div>
                            <div class="form-group">
                                <label>Чек-лист</label>
                                <textarea id="task-template-checklist" rows="5" placeholder="Один пункт на строку">${this.esc(this.templateDraft?.checklist_items || '')}</textarea>
                            </div>
                            <div class="form-group">
                                <label>Подзадачи</label>
                                <textarea id="task-template-subtasks" rows="4" placeholder="Одна подзадача на строку">${this.esc(this.templateDraft?.suggested_subtasks || '')}</textarea>
                            </div>
                            <div class="flex gap-8" style="flex-wrap:wrap;">
                                <button class="btn btn-success" type="button" onclick="Tasks.saveTemplate()">Сохранить шаблон</button>
                                ${this.templateDraft?.id ? `<button class="btn btn-outline" type="button" onclick="Tasks.deleteTemplate(${this.templateDraft.id})">Удалить</button>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    },

    selectTemplateDraft(templateId) {
        const template = (this.bundle?.templates || []).find(item => item.kind === 'task' && String(item.id) === String(templateId));
        this.resetTemplateDraft(template || null);
        this.renderTemplateManager();
    },

    readTemplateForm() {
        return {
            id: this.templateDraft?.id || '',
            name: document.getElementById('task-template-name')?.value.trim() || '',
            title: document.getElementById('task-template-title')?.value.trim() || '',
            description: document.getElementById('task-template-description')?.value.trim() || '',
            default_priority: document.getElementById('task-template-priority')?.value || 'normal',
            checklist_items: document.getElementById('task-template-checklist')?.value || '',
            suggested_subtasks: document.getElementById('task-template-subtasks')?.value || '',
        };
    },

    async saveTemplate() {
        const draft = this.readTemplateForm();
        const saved = await saveWorkTemplate(draft);
        await this.refreshData();
        this.resetTemplateDraft(saved);
        if (this.createDraft) {
            this.createDraft.template_id = saved.id;
            this.editorUi.restoredDraft = false;
        }
        App.toast(draft.id ? 'Шаблон обновлен' : 'Шаблон создан');
        this.render();
    },

    async deleteTemplate(templateId) {
        if (!confirm('Удалить шаблон задачи?')) return;
        await deleteWorkTemplate(templateId);
        await this.refreshData();
        this.resetTemplateDraft(null);
        if (this.createDraft && String(this.createDraft.template_id || '') === String(templateId)) {
            this.createDraft.template_id = '';
        }
        App.toast('Шаблон удален');
        this.render();
    },

    discardStoredDraft() {
        this.clearStoredDraft();
        this.editorUi.restoredDraft = false;
        if (this.createDraft) {
            const preserved = {
                reporter_id: App.currentEmployeeId || '',
                status: 'incoming',
                priority: this.createDraft.priority || 'normal',
            };
            this.openCreate(preserved, this.createDraft.template_id || null);
        }
    },

    defaultTaskTemplateId() {
        return (this.bundle?.templates || []).find(item => item.kind === 'task')?.id || '';
    },

    shiftCalendar(delta) {
        const [year, month] = this.calendarMonth.split('-').map(value => Number(value));
        const next = new Date(year, month - 1 + delta, 1);
        this.calendarMonth = next.toISOString().slice(0, 7);
        this.render();
    },

    readEditorForm() {
        const watcherIds = Array.from(document.querySelectorAll('.wm-watcher-chip input:checked')).map(input => Number(input.value));
        const existing = this.currentTaskId ? this.taskById(this.currentTaskId) : null;
        const orderId = document.getElementById('task-editor-order')?.value || '';
        const projectId = document.getElementById('task-editor-project')?.value || '';
        const chinaPurchaseId = document.getElementById('task-editor-china')?.value || '';
        const warehouseItemId = document.getElementById('task-editor-warehouse')?.value || '';
        const areaId = this.inferHiddenAreaId({
            ...(this.createDraft || existing || {}),
            order_id: orderId,
            project_id: projectId,
            china_purchase_id: chinaPurchaseId,
            warehouse_item_id: warehouseItemId,
        });
        return {
            id: document.getElementById('task-editor-id')?.value || '',
            template_id: document.getElementById('task-editor-template')?.value || '',
            title: document.getElementById('task-editor-title')?.value.trim() || '',
            status: document.getElementById('task-editor-status')?.value || 'incoming',
            priority: document.getElementById('task-editor-priority')?.value || 'normal',
            due_date: document.getElementById('task-editor-due-date')?.value || '',
            due_time: document.getElementById('task-editor-due-time')?.value || '',
            reporter_id: document.getElementById('task-editor-reporter')?.value || '',
            assignee_id: document.getElementById('task-editor-assignee')?.value || '',
            reviewer_id: watcherIds[0] || '',
            primary_context_kind: this.inferPrimaryContextKind({
                order_id: orderId,
                project_id: projectId,
            }),
            order_id: orderId,
            project_id: projectId,
            area_id: areaId || '',
            china_purchase_id: chinaPurchaseId,
            warehouse_item_id: warehouseItemId,
            description: document.getElementById('task-editor-description')?.value.trim() || '',
            waiting_for_text: document.getElementById('task-editor-waiting')?.value.trim() || '',
            watcher_ids: watcherIds,
            parent_task_id: this.createDraft?.parent_task_id || this.taskById(this.currentTaskId)?.parent_task_id || '',
        };
    },

    async saveTask() {
        const draft = this.readEditorForm();
        const existing = draft.id ? this.taskById(draft.id) : null;
        if (!draft.title) {
            App.toast('Введите название задачи');
            return;
        }
        if (!draft.assignee_id && !existing?.assignee_id) {
            App.toast('Укажите исполнителя');
            return;
        }
        if (!draft.due_date && !existing?.due_date) {
            App.toast('Укажите дедлайн');
            return;
        }

        const previousOverdue = existing ? this.isOverdue(existing) : false;
        const saved = await saveWorkTask(draft, {
            actor_id: App.currentEmployeeId,
            actor_name: App.getCurrentEmployeeName(),
        });
        await saveTaskWatchers(saved.id, draft.watcher_ids);

        const template = draft.template_id
            ? (this.bundle?.templates || []).find(item => String(item.id) === String(draft.template_id))
            : null;
        if (!existing && template) {
            await this.applyTaskTemplateArtifacts(saved, template);
        }

        await this.emitTaskEvents(saved, existing, previousOverdue, { watcherUserIds: draft.watcher_ids });
        await this.refreshData();
        this.createDraft = null;
        this.clearStoredDraft();
        this.editorUi.restoredDraft = false;
        this.currentTaskId = saved.id;
        App.toast(existing ? 'Задача обновлена' : 'Задача создана');
        this.render();
    },

    async emitTaskEvents(saved, existing, previousOverdue, options = {}) {
        if (!existing || String(existing.assignee_id || '') !== String(saved.assignee_id || '')) {
            if (saved.assignee_id) {
                await TaskEvents.emit('task_assigned', {
                    task_id: saved.id,
                    project_id: saved.project_id || null,
                    assignee_id: saved.assignee_id,
                });
            }
        }

        if (saved.status === 'review' && existing?.status !== 'review') {
            await TaskEvents.emit('task_sent_to_review', {
                task_id: saved.id,
                project_id: saved.project_id || null,
                reviewer_id: saved.reviewer_id || null,
                watcher_user_ids: Array.isArray(options.watcherUserIds) ? options.watcherUserIds : this.watcherIdsForTask(saved.id),
            });
        }

        const currentOverdue = this.isOverdue(saved);
        if (previousOverdue !== currentOverdue) {
            await TaskEvents.emit('task_overdue_state_changed', {
                task_id: saved.id,
                project_id: saved.project_id || null,
                is_overdue: currentOverdue,
            });
        }

        if (saved.due_date && !currentOverdue && saved.status !== 'done' && saved.status !== 'cancelled') {
            const dueAt = new Date(WorkManagementCore.buildTaskDueIso(saved));
            const diffMs = dueAt.getTime() - Date.now();
            if (diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000) {
                await TaskEvents.emit('task_due_soon', {
                    task_id: saved.id,
                    project_id: saved.project_id || null,
                    due_date: saved.due_date,
                    due_time: saved.due_time || null,
                });
            }
        }
    },

    async applyTaskTemplateArtifacts(task, template) {
        for (const [index, title] of (template.checklist_items || []).entries()) {
            await saveTaskChecklistItem({
                task_id: task.id,
                title,
                sort_index: (index + 1) * 100,
            });
        }
        for (const [index, title] of (template.suggested_subtasks || []).entries()) {
            await saveWorkTask({
                title,
                description: '',
                status: 'incoming',
                priority: template.default_priority || task.priority || 'normal',
                reporter_id: task.reporter_id || App.currentEmployeeId,
                reporter_name: task.reporter_name || App.getCurrentEmployeeName(),
                assignee_id: task.assignee_id || App.currentEmployeeId,
                assignee_name: task.assignee_name || App.getCurrentEmployeeName(),
                reviewer_id: task.reviewer_id || null,
                reviewer_name: task.reviewer_name || '',
                area_id: task.area_id || template.suggested_area_id || this.inferHiddenAreaId(task) || null,
                order_id: task.order_id || null,
                project_id: task.project_id || null,
                primary_context_kind: task.primary_context_kind || 'area',
                due_date: task.due_date || this.todayYmd(),
                due_time: task.due_time || null,
                parent_task_id: task.id,
                sort_index: (index + 1) * 100,
            }, {
                actor_id: App.currentEmployeeId,
                actor_name: App.getCurrentEmployeeName(),
            });
        }
    },

    async addChecklistItem(taskId) {
        const input = document.getElementById('task-checklist-new');
        const title = input?.value.trim() || '';
        if (!title) {
            App.toast('Введите текст пункта');
            return;
        }
        await saveTaskChecklistItem({ task_id: taskId, title });
        await this.refreshData();
        this.currentTaskId = Number(taskId);
        this.render();
    },

    async toggleChecklist(itemId, checked) {
        const item = (this.bundle?.checklistItems || []).find(entry => String(entry.id) === String(itemId));
        if (!item) return;
        await saveTaskChecklistItem({ ...item, is_done: checked });
        await this.refreshData();
        this.render();
    },

    async deleteChecklistItem(itemId) {
        await deleteTaskChecklistItem(itemId);
        await this.refreshData();
        this.render();
    },

    async addComment(taskId) {
        const textarea = document.getElementById('task-comment-new');
        const body = textarea?.value.trim() || '';
        if (!body) {
            App.toast('Введите комментарий');
            return;
        }
        const comment = await saveTaskComment({
            task_id: taskId,
            author_id: App.currentEmployeeId,
            author_name: App.getCurrentEmployeeName(),
            body,
        });
        if ((comment.mentions || []).length > 0) {
            await TaskEvents.emit('task_mentioned', {
                task_id: taskId,
                project_id: this.taskById(taskId)?.project_id || null,
                mention_user_ids: comment.mentions,
                comment_id: comment.id,
            });
        }
        await this.refreshData();
        this.currentTaskId = Number(taskId);
        this.render();
    },

    async addLink(taskId) {
        const url = document.getElementById('task-link-url')?.value.trim() || '';
        const title = document.getElementById('task-link-title')?.value.trim() || '';
        if (!url) {
            App.toast('Укажите ссылку');
            return;
        }
        const task = this.taskById(taskId);
        await saveWorkAsset({
            task_id: taskId,
            project_id: task?.project_id || null,
            kind: 'link',
            title,
            url,
            created_by: App.currentEmployeeId,
            created_by_name: App.getCurrentEmployeeName(),
        });
        await this.refreshData();
        this.currentTaskId = Number(taskId);
        this.render();
    },

    async addFile(taskId) {
        const input = document.getElementById('task-file-input');
        const file = input?.files?.[0];
        if (!file) {
            App.toast('Выберите файл');
            return;
        }
        if (file.size > 3 * 1024 * 1024) {
            App.toast('Файл слишком большой. Максимум 3 МБ');
            return;
        }
        const dataUrl = await this.readFileAsDataUrl(file);
        const task = this.taskById(taskId);
        await saveWorkAsset({
            task_id: taskId,
            project_id: task?.project_id || null,
            kind: 'file',
            title: document.getElementById('task-file-title')?.value.trim() || file.name,
            file_name: file.name,
            file_type: file.type || '',
            file_size: file.size || 0,
            data_url: dataUrl,
            url: dataUrl,
            created_by: App.currentEmployeeId,
            created_by_name: App.getCurrentEmployeeName(),
        });
        await this.refreshData();
        this.currentTaskId = Number(taskId);
        this.render();
    },

    async deleteAsset(assetId) {
        if (!confirm('Удалить файл или ссылку?')) return;
        await deleteWorkAsset(assetId);
        await this.refreshData();
        this.render();
    },

    async changeStatus(taskId, status, options = {}) {
        const task = this.taskById(taskId);
        if (!task) return;
        const previousOverdue = this.isOverdue(task);
        const preserveSelection = options.preserveSelection ?? (this.currentTaskId === Number(taskId));
        const nextCurrentTaskId = preserveSelection
            ? Number(taskId)
            : (this.currentTaskId === Number(taskId) ? null : this.currentTaskId);
        const saved = await saveWorkTask({ ...task, status }, {
            actor_id: App.currentEmployeeId,
            actor_name: App.getCurrentEmployeeName(),
        });
        await this.emitTaskEvents(saved, task, previousOverdue, options);
        await this.refreshData();
        this.currentTaskId = nextCurrentTaskId;
        this.render();
    },

    async sendToReview(taskId) {
        const task = this.taskById(taskId);
        if (!task) return;
        const watcherIds = this.currentTaskId === Number(taskId)
            ? Array.from(document.querySelectorAll('.wm-watcher-chip input:checked')).map(input => Number(input.value))
            : this.watcherIdsForTask(taskId);
        if (!watcherIds.length) {
            App.toast('Добавьте наблюдателя перед согласованием');
            return;
        }
        if (this.currentTaskId === Number(taskId)) {
            await saveTaskWatchers(taskId, watcherIds);
        }
        await this.changeStatus(taskId, 'review', { watcherUserIds: watcherIds });
    },

    async returnToWork(taskId) {
        await this.changeStatus(taskId, 'in_progress');
    },

    async approveTask(taskId) {
        await this.changeStatus(taskId, 'done');
    },

    onInlineStatusClick(event) {
        event?.stopPropagation?.();
        return false;
    },

    onInlineStatusChange(event, taskId, value) {
        event?.stopPropagation?.();
        const select = event?.currentTarget || event?.target;
        if (select && value) {
            select.className = 'inline-status-select status-' + value;
        }
        return this.changeStatus(taskId, value, { preserveSelection: this.currentTaskId === Number(taskId) });
    },

    onDeleteTaskClick(event, taskId) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        void this.deleteTask(taskId);
        return false;
    },

    onMoveTaskClick(event, taskId, direction) {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        void this.moveTask(taskId, direction);
        return false;
    },

    async deleteTask(taskId) {
        if (!confirm('Удалить задачу со всеми комментариями и файлами?')) return;
        await deleteWorkTask(taskId);
        await this.refreshData();
        this.currentTaskId = null;
        this.render();
    },

    copyBugPrompt(taskId) {
        const report = this.bugReportForTask(taskId);
        if (!report?.codex_prompt) {
            App.toast('Prompt пока не готов');
            return;
        }
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            App.toast('Не удалось скопировать prompt');
            return;
        }
        navigator.clipboard.writeText(report.codex_prompt)
            .then(() => App.toast('Prompt скопирован'))
            .catch(() => App.toast('Не удалось скопировать prompt'));
    },

    async moveTask(taskId, direction) {
        const task = this.taskById(taskId);
        if (!task) return;
        const queue = this.filteredTasks().filter(item =>
            String(item.assignee_id || '') === String(task.assignee_id || '')
            && String(item.parent_task_id || '') === String(task.parent_task_id || '')
        );
        const idx = queue.findIndex(item => String(item.id) === String(task.id));
        const swapWith = queue[idx + direction];
        if (!swapWith) return;
        await saveWorkTask({ ...task, sort_index: swapWith.sort_index }, {
            actor_id: App.currentEmployeeId,
            actor_name: App.getCurrentEmployeeName(),
            skipActivity: true,
        });
        await saveWorkTask({ ...swapWith, sort_index: task.sort_index }, {
            actor_id: App.currentEmployeeId,
            actor_name: App.getCurrentEmployeeName(),
            skipActivity: true,
        });
        await this.refreshData();
        this.render();
    },

    async onTemplateChange(templateId) {
        if (!this.createDraft) return;
        const template = (this.bundle?.templates || []).find(item => String(item.id) === String(templateId));
        if (!template) return;
        this.createDraft = {
            ...this.createDraft,
            template_id: template.id,
            title: template.title || this.createDraft.title,
            description: template.description || this.createDraft.description,
            priority: template.default_priority || this.createDraft.priority,
            area_id: template.suggested_area_id || this.createDraft.area_id,
        };
        this.persistStoredDraft(this.createDraft);
        this.render();
    },

    readFileAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = event => resolve(event.target?.result || '');
            reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
            reader.readAsDataURL(file);
        });
    },
};

const Tasks = {
    bundle: null,
    employees: [],
    orders: [],
    chinaPurchases: [],
    warehouseItems: [],
    currentTaskId: null,
    createDraft: null,
    view: 'list',
    scope: 'my',
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

    async load(taskId) {
        if (!this.scope) this.scope = App.currentEmployeeId ? 'my' : 'all';
        if (taskId) {
            this.currentTaskId = Number(taskId);
            this.createDraft = null;
        }
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
        const [
            bundle,
            employees,
            orders,
            chinaPurchases,
            warehouseItems,
        ] = await Promise.all([
            loadWorkBundle(),
            loadEmployees(),
            loadOrders({}),
            loadChinaPurchases({}),
            loadWarehouseItems(),
        ]);
        this.bundle = bundle;
        this.employees = employees;
        this.orders = orders;
        this.chinaPurchases = chinaPurchases;
        this.warehouseItems = warehouseItems;
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

    contextLabel(task) {
        const project = task.project_id ? this.projectById(task.project_id) : null;
        const order = task.order_id ? this.orderById(task.order_id) : (project?.linked_order_id ? this.orderById(project.linked_order_id) : null);
        const area = task.area_id ? this.areaById(task.area_id) : (project?.area_id ? this.areaById(project.area_id) : null);
        const chunks = [];
        if (order) chunks.push(`Заказ: ${order.order_name}`);
        if (project) chunks.push(`Проект: ${project.title}`);
        if (area) chunks.push(`Направление: ${area.name}`);
        return chunks.join(' · ') || 'Без контекста';
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
        this.createDraft = null;
        this.currentTaskId = Number(taskId);
        if (App.currentPage !== 'tasks') {
            App.navigate('tasks', true, taskId);
            return;
        }
        this.render();
    },

    showAddForm(orderId, _orderName) {
        this.openCreate(orderId ? { order_id: orderId, primary_context_kind: 'order' } : {});
    },

    openCreate(preset = {}, templateId = null) {
        const template = templateId
            ? (this.bundle?.templates || []).find(item => String(item.id) === String(templateId))
            : null;
        const project = preset.project_id ? this.projectById(preset.project_id) : null;
        this.createDraft = {
            id: '',
            template_id: template?.id || '',
            title: preset.title || template?.title || '',
            description: preset.description || template?.description || '',
            status: preset.status || 'incoming',
            priority: preset.priority || template?.default_priority || 'normal',
            reporter_id: preset.reporter_id || App.currentEmployeeId || '',
            assignee_id: preset.assignee_id || '',
            reviewer_id: preset.reviewer_id || '',
            area_id: preset.area_id || project?.area_id || template?.suggested_area_id || '',
            order_id: preset.order_id || project?.linked_order_id || '',
            project_id: preset.project_id || '',
            china_purchase_id: preset.china_purchase_id || '',
            warehouse_item_id: preset.warehouse_item_id || '',
            primary_context_kind: preset.primary_context_kind || (preset.project_id ? 'project' : (preset.order_id ? 'order' : 'area')),
            due_date: preset.due_date || '',
            due_time: preset.due_time || '',
            waiting_for_text: preset.waiting_for_text || '',
            parent_task_id: preset.parent_task_id || '',
            watcher_ids: preset.watcher_ids || [],
        };
        this.currentTaskId = null;
        if (App.currentPage !== 'tasks') {
            App.navigate('tasks');
            return;
        }
        this.render();
    },

    cancelEditor() {
        this.createDraft = null;
        this.currentTaskId = null;
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
        const myCount = this.myTasks().length;
        return `
            <div class="tasks-scope-tabs">
                <button class="tasks-scope-btn ${this.scope === 'my' ? 'active' : ''}" onclick="Tasks.setScope('my')">
                    Мои задачи${currentEmployee ? ` <span class="tasks-scope-count">${myCount}</span>` : ''}
                </button>
                <button class="tasks-scope-btn ${this.scope === 'all' ? 'active' : ''}" onclick="Tasks.setScope('all')">Все задачи</button>
                <button class="tasks-scope-btn ${this.scope === 'overdue' ? 'active' : ''}" onclick="Tasks.setScope('overdue')">Просроченные</button>
            </div>
        `;
    },

    myTasks() {
        const currentEmployeeId = String(App.currentEmployeeId || '');
        return (this.bundle?.tasks || []).filter(task => String(task.assignee_id || '') === currentEmployeeId);
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
            list = list.filter(task => String(task.assignee_id || '') === String(App.currentEmployeeId));
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
                const haystack = WorkManagementCore.normalizeText([
                    task.title,
                    task.description,
                    task.assignee_name,
                    task.reporter_name,
                    task.waiting_for_text,
                    project?.title,
                    order?.order_name,
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
                    <div class="task-stat-info"><div class="stat-value">${all.length}</div><div class="stat-label">Всего задач</div></div>
                </div>
                <div class="task-stat-card task-stat-mine">
                    <div class="task-stat-icon">&#128100;</div>
                    <div class="task-stat-info"><div class="stat-value">${this.myTasks().length}</div><div class="stat-label">Мои</div></div>
                </div>
                <div class="task-stat-card task-stat-review">
                    <div class="task-stat-icon">&#128172;</div>
                    <div class="task-stat-info"><div class="stat-value">${review}</div><div class="stat-label">На согласовании</div></div>
                </div>
                <div class="task-stat-card ${overdue > 0 ? 'task-stat-overdue-active' : 'task-stat-overdue'}">
                    <div class="task-stat-icon">${overdue > 0 ? '&#9888;' : '&#9989;'}</div>
                    <div class="task-stat-info"><div class="stat-value">${overdue}</div><div class="stat-label">Просрочено</div></div>
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

    renderListView(tasks) {
        const rows = tasks.map(task => `
            <tr onclick="Tasks.openTask(${task.id})" style="cursor:pointer">
                <td>
                    <div style="font-weight:600">${this.esc(task.title)}</div>
                    <div class="text-muted" style="font-size:12px">${this.esc(this.contextLabel(task))}</div>
                </td>
                <td><span class="badge ${task.status === 'done' ? 'badge-green' : task.status === 'cancelled' ? 'badge-red' : task.status === 'review' ? 'badge-blue' : task.status === 'waiting' ? 'badge-yellow' : 'badge-gray'}">${this.esc(this.statusLabel(task.status))}</span></td>
                <td><span class="badge ${this.priorityBadgeClass(task.priority)}">${this.esc(this.priorityLabel(task.priority))}</span></td>
                <td>${this.esc(task.assignee_name || this.employeeNameById(task.assignee_id, '—'))}</td>
                <td>${this.esc(task.reporter_name || this.employeeNameById(task.reporter_id, '—'))}</td>
                <td class="${this.isOverdue(task) ? 'text-red' : ''}">${this.esc(this.formatTaskDue(task))}</td>
                <td>
                    ${this.sort === 'manual' ? `
                        <div class="flex gap-4">
                            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Tasks.moveTask(${task.id}, -1)">↑</button>
                            <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Tasks.moveTask(${task.id}, 1)">↓</button>
                        </div>
                    ` : ''}
                </td>
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
                                <th></th>
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
        if (this.view === 'kanban') return this.renderKanbanView(tasks);
        if (this.view === 'calendar') return this.renderCalendarView(tasks);
        return this.renderListView(tasks);
    },

    editorTask() {
        return this.createDraft || (this.currentTaskId ? this.taskById(this.currentTaskId) : null);
    },

    editorWatcherIds(task) {
        if (!task) return [];
        if (this.createDraft) return this.createDraft.watcher_ids || [];
        return this.watcherIdsForTask(task.id);
    },

    editorTitle(task) {
        return this.createDraft ? 'Новая задача' : 'Карточка задачи';
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
                    <button class="btn btn-sm btn-outline" onclick="Tasks.openCreate({ parent_task_id: ${task.id}, project_id: ${task.project_id || 'null'}, order_id: ${task.order_id || 'null'}, area_id: ${task.area_id || 'null'}, primary_context_kind: '${task.primary_context_kind || 'project'}', due_date: '${task.due_date || ''}' })">+ Подзадача</button>
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

    renderEditor(task) {
        if (!task) return '';
        const isNew = !task.id;
        const watcherIds = this.editorWatcherIds(task);
        return `
            <div class="card">
                <div class="card-header">
                    <h3>${this.esc(this.editorTitle(task))}</h3>
                    <div class="flex gap-8">
                        ${!isNew ? `<button class="btn btn-sm btn-outline" onclick="Tasks.deleteTask(${task.id})">Удалить</button>` : ''}
                        <button class="btn btn-sm btn-outline" onclick="Tasks.cancelEditor()">Закрыть</button>
                    </div>
                </div>
                <input type="hidden" id="task-editor-id" value="${this.esc(task.id || '')}">
                <div class="form-row">
                    <div class="form-group" style="flex:2">
                        <label>Шаблон</label>
                        <select id="task-editor-template" onchange="Tasks.onTemplateChange(this.value)">
                            <option value="">Без шаблона</option>
                            ${this.taskTemplateOptionsHtml(task.template_id)}
                        </select>
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
                    <div class="form-group">
                        <label>Проверяющий</label>
                        <select id="task-editor-reviewer">
                            <option value="">—</option>
                            ${this.employeeOptionsHtml(task.reviewer_id)}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Основной контекст</label>
                        <select id="task-editor-context">
                            ${WorkManagementCore.TASK_CONTEXT_OPTIONS.map(item => `<option value="${item.value}" ${item.value === (task.primary_context_kind || 'area') ? 'selected' : ''}>${this.esc(item.label)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Заказ</label>
                        <select id="task-editor-order">
                            <option value="">—</option>
                            ${this.orderOptionsHtml(task.order_id)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Проект</label>
                        <select id="task-editor-project">
                            <option value="">—</option>
                            ${this.projectOptionsHtml(task.project_id)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Направление</label>
                        <select id="task-editor-area">
                            <option value="">—</option>
                            ${this.areaOptionsHtml(task.area_id)}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>China</label>
                        <select id="task-editor-china">
                            <option value="">—</option>
                            ${this.chinaOptionsHtml(task.china_purchase_id)}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Склад</label>
                        <select id="task-editor-warehouse">
                            <option value="">—</option>
                            ${this.warehouseOptionsHtml(task.warehouse_item_id)}
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Описание</label>
                    <textarea id="task-editor-description" rows="4">${this.esc(task.description || '')}</textarea>
                </div>
                <div class="form-group">
                    <label>Ждём от кого / что ждём</label>
                    <input id="task-editor-waiting" type="text" value="${this.esc(task.waiting_for_text || '')}">
                </div>
                <div class="form-group">
                    <label>Наблюдатели</label>
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
                        <p class="tasks-page-subtitle">Очереди исполнителей, задачи по заказам и проектам</p>
                    </div>
                    <div class="tasks-header-actions">
                        <button class="btn btn-outline" onclick="Tasks.openCreate()">+ Задача</button>
                        <button class="btn btn-success" onclick="Tasks.openCreate({}, ${this.defaultTaskTemplateId() || "''"})">Из шаблона</button>
                    </div>
                </div>
                <div class="tasks-header-controls">
                    ${this.scopeTabsHtml()}
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
            reviewer_id: document.getElementById('task-editor-reviewer')?.value || '',
            primary_context_kind: document.getElementById('task-editor-context')?.value || 'area',
            order_id: document.getElementById('task-editor-order')?.value || '',
            project_id: document.getElementById('task-editor-project')?.value || '',
            area_id: document.getElementById('task-editor-area')?.value || '',
            china_purchase_id: document.getElementById('task-editor-china')?.value || '',
            warehouse_item_id: document.getElementById('task-editor-warehouse')?.value || '',
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
        if (!draft.order_id && !draft.project_id && !draft.area_id && !existing?.order_id && !existing?.project_id && !existing?.area_id) {
            App.toast('Выберите контекст задачи');
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

        await this.emitTaskEvents(saved, existing, previousOverdue);
        await this.refreshData();
        this.createDraft = null;
        this.currentTaskId = saved.id;
        App.toast(existing ? 'Задача обновлена' : 'Задача создана');
        this.render();
    },

    async emitTaskEvents(saved, existing, previousOverdue) {
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
                area_id: task.area_id || template.suggested_area_id || null,
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

    async changeStatus(taskId, status) {
        const task = this.taskById(taskId);
        if (!task) return;
        const previousOverdue = this.isOverdue(task);
        const saved = await saveWorkTask({ ...task, status }, {
            actor_id: App.currentEmployeeId,
            actor_name: App.getCurrentEmployeeName(),
        });
        await this.emitTaskEvents(saved, task, previousOverdue);
        await this.refreshData();
        this.currentTaskId = Number(taskId);
        this.render();
    },

    async sendToReview(taskId) {
        const task = this.taskById(taskId);
        if (!task) return;
        if (!task.reviewer_id && !document.getElementById('task-editor-reviewer')?.value) {
            App.toast('Сначала укажите проверяющего');
            return;
        }
        await this.changeStatus(taskId, 'review');
    },

    async returnToWork(taskId) {
        await this.changeStatus(taskId, 'in_progress');
    },

    async approveTask(taskId) {
        await this.changeStatus(taskId, 'done');
    },

    async deleteTask(taskId) {
        if (!confirm('Удалить задачу со всеми комментариями и файлами?')) return;
        await deleteWorkTask(taskId);
        await this.refreshData();
        this.currentTaskId = null;
        this.render();
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

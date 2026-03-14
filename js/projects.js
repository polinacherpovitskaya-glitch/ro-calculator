const Projects = {
    bundle: null,
    employees: [],
    orders: [],
    currentProjectId: null,
    createDraft: null,
    listFilters: {
        search: '',
        type: '',
        owner_id: '',
        status: '',
        area_id: '',
        order_id: '',
    },

    async load(projectId) {
        this.currentProjectId = projectId ? Number(projectId) : null;
        await this.refreshData();
        this.render();
    },

    async refreshData() {
        this.bundle = await loadWorkBundle();
        this.employees = await loadEmployees();
        this.orders = await loadOrders({});
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

    formatDate(value) {
        if (!value) return '—';
        try {
            return new Date(value).toLocaleDateString('ru-RU');
        } catch (error) {
            return value;
        }
    },

    employeeNameById(id, fallback) {
        const employee = (this.employees || []).find(item => String(item.id) === String(id));
        return employee?.name || fallback || '—';
    },

    areaName(areaId) {
        return (this.bundle?.areas || []).find(item => String(item.id) === String(areaId))?.name || '—';
    },

    orderName(orderId, fallback) {
        return (this.orders || []).find(item => String(item.id) === String(orderId))?.order_name || fallback || '—';
    },

    projectById(projectId) {
        return (this.bundle?.projects || []).find(item => String(item.id) === String(projectId)) || null;
    },

    tasksForProject(projectId) {
        return (this.bundle?.tasks || []).filter(item => String(item.project_id) === String(projectId));
    },

    assetsForProject(projectId) {
        return (this.bundle?.assets || []).filter(item =>
            String(item.project_id) === String(projectId) && !item.task_id
        );
    },

    activityForProject(projectId) {
        return (this.bundle?.activity || []).filter(item => String(item.project_id) === String(projectId));
    },

    openCreate(preset = {}, templateId = null) {
        const template = templateId
            ? (this.bundle?.templates || []).find(item => String(item.id) === String(templateId))
            : null;
        this.currentProjectId = null;
        this.createDraft = {
            id: '',
            template_id: template?.id || '',
            title: preset.title || template?.title || '',
            type: preset.type || template?.project_type || 'Другое',
            owner_id: preset.owner_id || App.currentEmployeeId || '',
            linked_order_id: preset.linked_order_id || '',
            area_id: preset.area_id || template?.suggested_area_id || '',
            start_date: preset.start_date || this.todayYmd(),
            due_date: preset.due_date || '',
            launch_at: preset.launch_at || '',
            status: preset.status || 'active',
            brief: preset.brief || template?.description || '',
            goal: preset.goal || '',
            result_summary: preset.result_summary || '',
        };
        if (App.currentPage !== 'projects') {
            App.navigate('projects');
            return;
        }
        this.render();
    },

    cancelCreate() {
        this.createDraft = null;
        this.render();
    },

    updateListFilter(field, value) {
        this.listFilters[field] = value || '';
        this.render();
    },

    buildProjectTableRows(projects) {
        return projects.map(project => {
            const taskCount = this.tasksForProject(project.id).length;
            const statusLabel = WorkManagementCore.getProjectStatusLabel(project.status);
            return `
                <tr onclick="App.navigate('projects', true, ${project.id})" style="cursor:pointer">
                    <td style="font-weight:600">${this.esc(project.title)}</td>
                    <td>${this.esc(project.type || '—')}</td>
                    <td><span class="badge">${this.esc(statusLabel)}</span></td>
                    <td>${this.esc(this.employeeNameById(project.owner_id, project.owner_name))}</td>
                    <td>${this.esc(this.orderName(project.linked_order_id, project.linked_order_name))}</td>
                    <td>${this.esc(this.areaName(project.area_id))}</td>
                    <td>${taskCount}</td>
                    <td>${this.esc(project.due_date ? this.formatDate(project.due_date) : '—')}</td>
                </tr>
            `;
        }).join('');
    },

    filteredProjects() {
        const search = WorkManagementCore.normalizeText(this.listFilters.search);
        return (this.bundle?.projects || []).filter(project => {
            if (this.listFilters.type && project.type !== this.listFilters.type) return false;
            if (this.listFilters.owner_id && String(project.owner_id || '') !== String(this.listFilters.owner_id)) return false;
            if (this.listFilters.status && project.status !== this.listFilters.status) return false;
            if (this.listFilters.area_id && String(project.area_id || '') !== String(this.listFilters.area_id)) return false;
            if (this.listFilters.order_id && String(project.linked_order_id || '') !== String(this.listFilters.order_id)) return false;
            if (!search) return true;
            const projectTasks = (this.bundle?.tasks || []).filter(item => String(item.project_id || '') === String(project.id));
            const commentText = projectTasks
                .flatMap(task => (this.bundle?.comments || []).filter(comment => String(comment.task_id) === String(task.id)).map(comment => comment.body || ''))
                .join(' ');
            const text = WorkManagementCore.normalizeText([
                project.title,
                project.type,
                project.brief,
                project.goal,
                this.orderName(project.linked_order_id, project.linked_order_name),
                this.employeeNameById(project.owner_id, project.owner_name),
                projectTasks.map(item => `${item.title} ${item.description || ''}`).join(' '),
                commentText,
            ].join(' '));
            return text.includes(search);
        });
    },

    renderCreateForm() {
        if (!this.createDraft) return '';
        const templateOptions = (this.bundle?.templates || [])
            .filter(item => item.kind === 'project')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.createDraft.template_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');

        const ownerOptions = (this.employees || [])
            .filter(item => item.is_active !== false)
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.createDraft.owner_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');

        const areaOptions = (this.bundle?.areas || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.createDraft.area_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');

        const orderOptions = (this.orders || [])
            .filter(item => item.status !== 'deleted')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.createDraft.linked_order_id || '') ? 'selected' : ''}>${this.esc(item.order_name || 'Без названия')}</option>`)
            .join('');

        const projectTypeOptions = WorkManagementCore.PROJECT_TYPE_OPTIONS
            .map(item => `<option value="${this.esc(item)}" ${item === this.createDraft.type ? 'selected' : ''}>${this.esc(item)}</option>`)
            .join('');

        const statusOptions = WorkManagementCore.PROJECT_STATUS_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === this.createDraft.status ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');

        return `
            <div class="card">
                <div class="card-header">
                    <h3>Новый проект</h3>
                    <button class="btn btn-sm btn-outline" onclick="Projects.cancelCreate()">Закрыть</button>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:2">
                        <label>Шаблон</label>
                        <select id="project-create-template" onchange="Projects.onCreateTemplateChange(this.value)">
                            <option value="">Без шаблона</option>
                            ${templateOptions}
                        </select>
                    </div>
                    <div class="form-group" style="flex:3">
                        <label>Название</label>
                        <input id="project-create-title" type="text" value="${this.esc(this.createDraft.title)}">
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Тип</label>
                        <select id="project-create-type">${projectTypeOptions}</select>
                    </div>
                    <div class="form-group">
                        <label>Владелец</label>
                        <select id="project-create-owner">
                            <option value="">—</option>
                            ${ownerOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Статус</label>
                        <select id="project-create-status">${statusOptions}</select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Заказ</label>
                        <select id="project-create-order">
                            <option value="">Без заказа</option>
                            ${orderOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Направление</label>
                        <select id="project-create-area">
                            <option value="">—</option>
                            ${areaOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Старт</label>
                        <input id="project-create-start" type="date" value="${this.esc(this.createDraft.start_date)}">
                    </div>
                    <div class="form-group">
                        <label>Дедлайн</label>
                        <input id="project-create-due" type="date" value="${this.esc(this.createDraft.due_date)}">
                    </div>
                    <div class="form-group">
                        <label>Запуск</label>
                        <input id="project-create-launch" type="datetime-local" value="${this.esc(this.createDraft.launch_at ? this.createDraft.launch_at.slice(0, 16) : '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Краткое описание</label>
                    <textarea id="project-create-brief" rows="4">${this.esc(this.createDraft.brief)}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Цель</label>
                        <textarea id="project-create-goal" rows="3">${this.esc(this.createDraft.goal)}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Результат</label>
                        <textarea id="project-create-result" rows="3">${this.esc(this.createDraft.result_summary)}</textarea>
                    </div>
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-success" onclick="Projects.saveCreateForm()">Сохранить проект</button>
                    <button class="btn btn-outline" onclick="Projects.cancelCreate()">Отмена</button>
                </div>
            </div>
        `;
    },

    renderListPage() {
        const rows = this.filteredProjects();
        const ownerFilterOptions = (this.employees || [])
            .filter(item => item.is_active !== false)
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.listFilters.owner_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
        const areaFilterOptions = (this.bundle?.areas || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.listFilters.area_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
        const orderFilterOptions = (this.orders || [])
            .filter(item => item.status !== 'deleted')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(this.listFilters.order_id || '') ? 'selected' : ''}>${this.esc(item.order_name || 'Без названия')}</option>`)
            .join('');
        const typeOptions = WorkManagementCore.PROJECT_TYPE_OPTIONS
            .map(item => `<option value="${this.esc(item)}" ${item === this.listFilters.type ? 'selected' : ''}>${this.esc(item)}</option>`)
            .join('');
        const statusOptions = WorkManagementCore.PROJECT_STATUS_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === this.listFilters.status ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');

        return `
            <div class="page-header">
                <h1>Проекты</h1>
                <div class="flex gap-8">
                    <button class="btn btn-outline" onclick="Projects.openCreate({}, '')">+ Проект</button>
                    <button class="btn btn-success" onclick="Projects.openCreate({}, ${this.defaultProjectTemplateId() || "''"})">Из шаблона</button>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card"><div class="stat-label">Всего</div><div class="stat-value">${(this.bundle?.projects || []).length}</div></div>
                <div class="stat-card"><div class="stat-label">Активные</div><div class="stat-value">${(this.bundle?.projects || []).filter(item => item.status === 'active').length}</div></div>
                <div class="stat-card"><div class="stat-label">На паузе</div><div class="stat-value">${(this.bundle?.projects || []).filter(item => item.status === 'on_hold').length}</div></div>
                <div class="stat-card"><div class="stat-label">Завершённые</div><div class="stat-value">${(this.bundle?.projects || []).filter(item => item.status === 'done').length}</div></div>
            </div>

            ${this.renderCreateForm()}

            <div class="card" style="padding:12px 20px;">
                <div class="form-row" style="align-items:end">
                    <div class="form-group" style="margin:0;flex:2">
                        <label>Поиск</label>
                        <input type="text" value="${this.esc(this.listFilters.search)}" oninput="Projects.updateListFilter('search', this.value)" placeholder="Название, описание, заказ">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Тип</label>
                        <select onchange="Projects.updateListFilter('type', this.value)">
                            <option value="">Все</option>
                            ${typeOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Владелец</label>
                        <select onchange="Projects.updateListFilter('owner_id', this.value)">
                            <option value="">Все</option>
                            ${ownerFilterOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Статус</label>
                        <select onchange="Projects.updateListFilter('status', this.value)">
                            <option value="">Все</option>
                            ${statusOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Направление</label>
                        <select onchange="Projects.updateListFilter('area_id', this.value)">
                            <option value="">Все</option>
                            ${areaFilterOptions}
                        </select>
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>Заказ</label>
                        <select onchange="Projects.updateListFilter('order_id', this.value)">
                            <option value="">Все</option>
                            ${orderFilterOptions}
                        </select>
                    </div>
                </div>
            </div>

            <div class="card" style="padding:0;">
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Проект</th>
                                <th>Тип</th>
                                <th>Статус</th>
                                <th>Владелец</th>
                                <th>Заказ</th>
                                <th>Направление</th>
                                <th>Задач</th>
                                <th>Дедлайн</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length === 0 ? '<tr><td colspan="8" class="text-center text-muted">Нет проектов по фильтру</td></tr>' : this.buildProjectTableRows(rows)}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderAssetsSection(project) {
        const assets = this.assetsForProject(project.id);
        const rows = assets.map(asset => {
            if (asset.kind === 'file') {
                return `
                    <div class="wm-asset-row">
                        <div>
                            <div style="font-weight:600">${this.esc(asset.title || asset.file_name || 'Файл')}</div>
                            <div class="text-muted" style="font-size:12px">${this.esc(asset.file_name || '')}</div>
                        </div>
                        <div class="flex gap-8">
                            <a class="btn btn-sm btn-outline" href="${this.esc(asset.data_url || asset.url)}" target="_blank">Открыть</a>
                            <button class="btn btn-sm btn-outline" onclick="Projects.deleteAsset(${asset.id}, ${project.id})">Удалить</button>
                        </div>
                    </div>
                `;
            }
            return `
                <div class="wm-asset-row">
                    <div>
                        <div style="font-weight:600">${this.esc(asset.title || 'Ссылка')}</div>
                        <div class="text-muted" style="font-size:12px">${this.esc(asset.url || '')}</div>
                    </div>
                    <div class="flex gap-8">
                        <a class="btn btn-sm btn-outline" href="${this.esc(asset.url)}" target="_blank">Открыть</a>
                        <button class="btn btn-sm btn-outline" onclick="Projects.deleteAsset(${asset.id}, ${project.id})">Удалить</button>
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="card">
                <div class="card-header">
                    <h3>Файлы и ссылки</h3>
                </div>
                <div class="form-row">
                    <div class="form-group" style="flex:2">
                        <label>Ссылка</label>
                        <input id="project-link-url" type="url" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label>Название</label>
                        <input id="project-link-title" type="text" placeholder="Например, мудборд">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;">
                        <button class="btn btn-outline" onclick="Projects.addLink(${project.id})">Добавить ссылку</button>
                    </div>
                </div>
                <div class="form-row" style="align-items:end;">
                    <div class="form-group" style="flex:2">
                        <label>Файл</label>
                        <input id="project-file-input" type="file" accept="image/*,.pdf,.ai,.psd,.svg,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt">
                    </div>
                    <div class="form-group">
                        <label>Название</label>
                        <input id="project-file-title" type="text" placeholder="Необязательно">
                    </div>
                    <div class="form-group" style="display:flex;align-items:flex-end;">
                        <button class="btn btn-outline" onclick="Projects.addFile(${project.id})">Загрузить</button>
                    </div>
                </div>
                <div class="wm-assets-list">
                    ${rows || '<div class="text-muted">Пока ничего не добавлено</div>'}
                </div>
            </div>
        `;
    },

    renderProjectTasksSection(project) {
        const tasks = this.tasksForProject(project.id)
            .slice()
            .sort((a, b) => {
                const aDue = WorkManagementCore.buildTaskDueIso(a);
                const bDue = WorkManagementCore.buildTaskDueIso(b);
                return String(aDue).localeCompare(String(bDue), 'ru');
            });

        const rows = tasks.map(task => `
            <tr onclick="App.navigate('tasks', true, ${task.id})" style="cursor:pointer">
                <td style="font-weight:600">${this.esc(task.title)}</td>
                <td>${this.esc(WorkManagementCore.getTaskStatusLabel(task.status))}</td>
                <td>${this.esc(task.assignee_name || this.employeeNameById(task.assignee_id, '—'))}</td>
                <td>${this.esc(task.priority || 'normal')}</td>
                <td>${this.esc(task.due_date ? this.formatDate(task.due_date) : '—')}</td>
            </tr>
        `).join('');

        return `
            <div class="card">
                <div class="card-header">
                    <h3>Задачи</h3>
                    <button class="btn btn-sm btn-success" onclick="Tasks.openCreate({ project_id: ${project.id}, order_id: ${project.linked_order_id || 'null'}, area_id: ${project.area_id || 'null'}, primary_context_kind: 'project' })">+ Задача</button>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Задача</th>
                                <th>Статус</th>
                                <th>Исполнитель</th>
                                <th>Приоритет</th>
                                <th>Дедлайн</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows || '<tr><td colspan="5" class="text-center text-muted">Пока нет задач</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    renderActivitySection(project) {
        const rows = this.activityForProject(project.id)
            .slice()
            .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

        return `
            <div class="card">
                <div class="card-header"><h3>Активность</h3></div>
                <div class="wm-activity-list">
                    ${rows.length === 0
                        ? '<div class="text-muted">Пока нет активности</div>'
                        : rows.map(item => `
                            <div class="wm-activity-row">
                                <div style="font-weight:600">${this.esc(item.message)}</div>
                                <div class="text-muted" style="font-size:12px">${this.esc(item.author_name || 'Система')} · ${this.esc(this.formatDate(item.created_at))}</div>
                            </div>
                        `).join('')}
                </div>
            </div>
        `;
    },

    renderDetailPage(project) {
        if (!project) {
            return `
                <div class="page-header">
                    <h1>Проекты</h1>
                    <button class="btn btn-outline" onclick="App.navigate('projects')">Назад</button>
                </div>
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128193;</div>
                        <p>Проект не найден</p>
                    </div>
                </div>
            `;
        }

        const ownerOptions = (this.employees || [])
            .filter(item => item.is_active !== false)
            .map(item => `<option value="${item.id}" ${String(item.id) === String(project.owner_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
        const orderOptions = (this.orders || [])
            .filter(item => item.status !== 'deleted')
            .map(item => `<option value="${item.id}" ${String(item.id) === String(project.linked_order_id || '') ? 'selected' : ''}>${this.esc(item.order_name || 'Без названия')}</option>`)
            .join('');
        const areaOptions = (this.bundle?.areas || [])
            .map(item => `<option value="${item.id}" ${String(item.id) === String(project.area_id || '') ? 'selected' : ''}>${this.esc(item.name)}</option>`)
            .join('');
        const typeOptions = WorkManagementCore.PROJECT_TYPE_OPTIONS
            .map(item => `<option value="${this.esc(item)}" ${item === project.type ? 'selected' : ''}>${this.esc(item)}</option>`)
            .join('');
        const statusOptions = WorkManagementCore.PROJECT_STATUS_OPTIONS
            .map(item => `<option value="${item.value}" ${item.value === project.status ? 'selected' : ''}>${this.esc(item.label)}</option>`)
            .join('');

        return `
            <div class="page-header">
                <div>
                    <h1>${this.esc(project.title)}</h1>
                    <div class="text-muted" style="font-size:13px;">${this.esc(project.type || 'Другое')} · ${this.esc(WorkManagementCore.getProjectStatusLabel(project.status))}</div>
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-outline" onclick="App.navigate('projects')">К списку</button>
                    <button class="btn btn-success" onclick="Tasks.openCreate({ project_id: ${project.id}, order_id: ${project.linked_order_id || 'null'}, area_id: ${project.area_id || 'null'}, primary_context_kind: 'project' })">+ Задача</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h3>Карточка проекта</h3></div>
                <input type="hidden" id="project-detail-id" value="${project.id}">
                <div class="form-row">
                    <div class="form-group" style="flex:2">
                        <label>Название</label>
                        <input id="project-detail-title" type="text" value="${this.esc(project.title)}">
                    </div>
                    <div class="form-group">
                        <label>Тип</label>
                        <select id="project-detail-type">${typeOptions}</select>
                    </div>
                    <div class="form-group">
                        <label>Статус</label>
                        <select id="project-detail-status">${statusOptions}</select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Владелец</label>
                        <select id="project-detail-owner">
                            <option value="">—</option>
                            ${ownerOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Заказ</label>
                        <select id="project-detail-order">
                            <option value="">Без заказа</option>
                            ${orderOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Направление</label>
                        <select id="project-detail-area">
                            <option value="">—</option>
                            ${areaOptions}
                        </select>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Старт</label>
                        <input id="project-detail-start" type="date" value="${this.esc(project.start_date || '')}">
                    </div>
                    <div class="form-group">
                        <label>Дедлайн</label>
                        <input id="project-detail-due" type="date" value="${this.esc(project.due_date || '')}">
                    </div>
                    <div class="form-group">
                        <label>Запуск</label>
                        <input id="project-detail-launch" type="datetime-local" value="${this.esc(project.launch_at ? project.launch_at.slice(0, 16) : '')}">
                    </div>
                </div>
                <div class="form-group">
                    <label>Краткое описание</label>
                    <textarea id="project-detail-brief" rows="4">${this.esc(project.brief || '')}</textarea>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Цель</label>
                        <textarea id="project-detail-goal" rows="3">${this.esc(project.goal || '')}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Результат</label>
                        <textarea id="project-detail-result" rows="3">${this.esc(project.result_summary || '')}</textarea>
                    </div>
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-success" onclick="Projects.saveDetailForm()">Сохранить</button>
                </div>
            </div>

            ${this.renderProjectTasksSection(project)}
            ${this.renderAssetsSection(project)}
            ${this.renderActivitySection(project)}
        `;
    },

    render() {
        const container = document.getElementById('page-projects');
        if (!container) return;
        const project = this.currentProjectId ? this.projectById(this.currentProjectId) : null;
        container.innerHTML = this.currentProjectId
            ? this.renderDetailPage(project)
            : this.renderListPage();
    },

    onCreateTemplateChange(templateId) {
        const template = (this.bundle?.templates || []).find(item => String(item.id) === String(templateId));
        if (!template) {
            this.createDraft.template_id = '';
            this.render();
            return;
        }
        this.createDraft = {
            ...this.createDraft,
            template_id: template.id,
            title: template.title || this.createDraft.title,
            type: template.project_type || this.createDraft.type,
            area_id: template.suggested_area_id || this.createDraft.area_id,
            brief: template.description || this.createDraft.brief,
        };
        this.render();
    },

    readCreateForm() {
        return {
            template_id: document.getElementById('project-create-template')?.value || '',
            title: document.getElementById('project-create-title')?.value.trim() || '',
            type: document.getElementById('project-create-type')?.value || 'Другое',
            owner_id: document.getElementById('project-create-owner')?.value || '',
            linked_order_id: document.getElementById('project-create-order')?.value || '',
            area_id: document.getElementById('project-create-area')?.value || '',
            start_date: document.getElementById('project-create-start')?.value || '',
            due_date: document.getElementById('project-create-due')?.value || '',
            launch_at: document.getElementById('project-create-launch')?.value || '',
            status: document.getElementById('project-create-status')?.value || 'active',
            brief: document.getElementById('project-create-brief')?.value.trim() || '',
            goal: document.getElementById('project-create-goal')?.value.trim() || '',
            result_summary: document.getElementById('project-create-result')?.value.trim() || '',
        };
    },

    readDetailForm() {
        return {
            id: document.getElementById('project-detail-id')?.value || '',
            title: document.getElementById('project-detail-title')?.value.trim() || '',
            type: document.getElementById('project-detail-type')?.value || 'Другое',
            owner_id: document.getElementById('project-detail-owner')?.value || '',
            linked_order_id: document.getElementById('project-detail-order')?.value || '',
            area_id: document.getElementById('project-detail-area')?.value || '',
            start_date: document.getElementById('project-detail-start')?.value || '',
            due_date: document.getElementById('project-detail-due')?.value || '',
            launch_at: document.getElementById('project-detail-launch')?.value || '',
            status: document.getElementById('project-detail-status')?.value || 'active',
            brief: document.getElementById('project-detail-brief')?.value.trim() || '',
            goal: document.getElementById('project-detail-goal')?.value.trim() || '',
            result_summary: document.getElementById('project-detail-result')?.value.trim() || '',
        };
    },

    async saveCreateForm() {
        const draft = this.readCreateForm();
        if (!draft.title) {
            App.toast('Введите название проекта');
            return;
        }
        const isNew = true;
        const saved = await saveWorkProject(draft, {
            id: App.currentEmployeeId,
            name: App.getCurrentEmployeeName(),
        });
        const template = draft.template_id
            ? (this.bundle?.templates || []).find(item => String(item.id) === String(draft.template_id))
            : null;
        if (isNew && template) {
            await this.applyProjectTemplateArtifacts(saved, template);
        }
        this.createDraft = null;
        await this.refreshData();
        App.toast('Проект сохранён');
        App.navigate('projects', true, saved.id);
    },

    async saveDetailForm() {
        const draft = this.readDetailForm();
        if (!draft.title) {
            App.toast('Введите название проекта');
            return;
        }
        const saved = await saveWorkProject(draft, {
            id: App.currentEmployeeId,
            name: App.getCurrentEmployeeName(),
        });
        await this.refreshData();
        this.currentProjectId = saved.id;
        App.toast('Проект обновлён');
        this.render();
    },

    defaultProjectTemplateId() {
        return (this.bundle?.templates || []).find(item => item.kind === 'project')?.id || '';
    },

    async applyProjectTemplateArtifacts(project, template) {
        const dueDate = project.due_date || project.start_date || this.todayYmd();
        const kickoffTask = await saveWorkTask({
            title: `Старт проекта: ${project.title}`,
            description: template.description || '',
            status: 'planned',
            priority: template.default_priority || 'normal',
            reporter_id: App.currentEmployeeId,
            reporter_name: App.getCurrentEmployeeName(),
            assignee_id: project.owner_id || App.currentEmployeeId,
            assignee_name: project.owner_name || App.getCurrentEmployeeName(),
            area_id: project.area_id || template.suggested_area_id || null,
            order_id: project.linked_order_id || null,
            project_id: project.id,
            primary_context_kind: 'project',
            due_date: dueDate,
            due_time: null,
        }, {
            actor_id: App.currentEmployeeId,
            actor_name: App.getCurrentEmployeeName(),
        });

        for (const [index, title] of (template.checklist_items || []).entries()) {
            await saveTaskChecklistItem({
                task_id: kickoffTask.id,
                title,
                sort_index: (index + 1) * 100,
            });
        }

        for (const [index, title] of (template.suggested_subtasks || []).entries()) {
            await saveWorkTask({
                title,
                description: '',
                status: 'incoming',
                priority: template.default_priority || 'normal',
                reporter_id: App.currentEmployeeId,
                reporter_name: App.getCurrentEmployeeName(),
                assignee_id: project.owner_id || App.currentEmployeeId,
                assignee_name: project.owner_name || App.getCurrentEmployeeName(),
                area_id: project.area_id || template.suggested_area_id || null,
                order_id: project.linked_order_id || null,
                project_id: project.id,
                parent_task_id: kickoffTask.id,
                primary_context_kind: 'project',
                due_date: dueDate,
                due_time: null,
                sort_index: (index + 1) * 100,
            }, {
                actor_id: App.currentEmployeeId,
                actor_name: App.getCurrentEmployeeName(),
            });
        }
    },

    async addLink(projectId) {
        const url = document.getElementById('project-link-url')?.value.trim() || '';
        const title = document.getElementById('project-link-title')?.value.trim() || '';
        if (!url) {
            App.toast('Укажите ссылку');
            return;
        }
        await saveWorkAsset({
            project_id: projectId,
            kind: 'link',
            title,
            url,
            created_by: App.currentEmployeeId,
            created_by_name: App.getCurrentEmployeeName(),
        });
        await this.refreshData();
        this.render();
    },

    async addFile(projectId) {
        const input = document.getElementById('project-file-input');
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
        await saveWorkAsset({
            project_id: projectId,
            kind: 'file',
            title: document.getElementById('project-file-title')?.value.trim() || file.name,
            file_name: file.name,
            file_type: file.type || '',
            file_size: file.size || 0,
            data_url: dataUrl,
            url: dataUrl,
            created_by: App.currentEmployeeId,
            created_by_name: App.getCurrentEmployeeName(),
        });
        await this.refreshData();
        this.render();
    },

    async deleteAsset(assetId, projectId) {
        if (!confirm('Удалить файл или ссылку?')) return;
        await deleteWorkAsset(assetId);
        await this.refreshData();
        this.currentProjectId = Number(projectId);
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

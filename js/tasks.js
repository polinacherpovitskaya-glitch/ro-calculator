// =============================================
// Recycle Object — Task Tracker (To-do Kanban)
// Перенесено из Notion
// =============================================

const Tasks = {
    allTasks: [],
    view: 'kanban', // 'kanban' | 'list'

    async load() {
        this.allTasks = await loadTasks();
        if (this.allTasks.length === 0) {
            // First load: import default tasks
            this.allTasks = this.getDefaultTasks();
            await saveTasks(this.allTasks);
        }
        this.renderStats();
        this.render();
    },

    // === RENDER ===

    render() {
        if (this.view === 'kanban') {
            this.renderKanban();
        } else {
            this.renderList();
        }
    },

    setView(v) {
        this.view = v;
        document.querySelectorAll('.tasks-view-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-view="${v}"]`)?.classList.add('active');
        this.render();
    },

    renderStats() {
        const total = this.allTasks.length;
        const notStarted = this.allTasks.filter(t => t.status === 'Not started').length;
        const inProgress = this.allTasks.filter(t => t.status === 'In progress').length;
        const done = this.allTasks.filter(t => t.status === 'Done').length;

        document.getElementById('tasks-total').textContent = total;
        document.getElementById('tasks-not-started').textContent = notStarted;
        document.getElementById('tasks-in-progress').textContent = inProgress;
        document.getElementById('tasks-done').textContent = done;
    },

    renderKanban() {
        const container = document.getElementById('tasks-kanban');
        const filterAssignee = document.getElementById('tasks-filter-assignee')?.value || '';
        const filterProject = document.getElementById('tasks-filter-project')?.value || '';
        const search = (document.getElementById('tasks-search')?.value || '').toLowerCase().trim();

        let filtered = this.filterTasks(filterAssignee, filterProject, search);

        const columns = [
            { status: 'Not started', label: 'Не начато', color: '#6b7280', icon: '○' },
            { status: 'In progress', label: 'В работе', color: '#f59e0b', icon: '◐' },
            { status: 'Done', label: 'Готово', color: '#10b981', icon: '●' },
            { status: 'Cancelled', label: 'Отменено', color: '#ef4444', icon: '✕' },
        ];

        container.innerHTML = columns.map(col => {
            const tasks = filtered.filter(t => t.status === col.status);
            return `
            <div class="kanban-column" data-status="${col.status}">
                <div class="kanban-header" style="border-top: 3px solid ${col.color}">
                    <span>${col.icon} ${col.label}</span>
                    <span class="kanban-count">${tasks.length}</span>
                </div>
                <div class="kanban-cards" ondrop="Tasks.onDrop(event, '${col.status}')" ondragover="event.preventDefault()">
                    ${tasks.map(t => this.renderCard(t)).join('')}
                </div>
            </div>`;
        }).join('');
    },

    renderCard(task) {
        const deadlineHtml = task.deadline
            ? `<div class="task-deadline ${this.isOverdue(task.deadline) ? 'overdue' : ''}">${this.formatDeadline(task.deadline)}</div>`
            : '';

        const assignees = (task.assignee || '').split(',').map(a => a.trim()).filter(Boolean);
        const assigneeHtml = assignees.length > 0
            ? `<div class="task-assignees">${assignees.map(a => `<span class="task-avatar" title="${this.esc(a)}">${this.initials(a)}</span>`).join('')}</div>`
            : '';

        const projectHtml = task.project
            ? `<span class="task-project-tag">${this.esc(this.shortProject(task.project))}</span>`
            : '';

        return `
        <div class="kanban-card" draggable="true" ondragstart="Tasks.onDragStart(event, ${task.id})" onclick="Tasks.openTask(${task.id})">
            <div class="task-card-title">${this.esc(task.title)}</div>
            <div class="task-card-meta">
                ${projectHtml}
                ${deadlineHtml}
            </div>
            ${assigneeHtml}
        </div>`;
    },

    renderList() {
        const container = document.getElementById('tasks-kanban');
        const filterAssignee = document.getElementById('tasks-filter-assignee')?.value || '';
        const filterProject = document.getElementById('tasks-filter-project')?.value || '';
        const search = (document.getElementById('tasks-search')?.value || '').toLowerCase().trim();

        let filtered = this.filterTasks(filterAssignee, filterProject, search);

        // Sort: In progress first, then Not started, then Done, then Cancelled
        const order = { 'In progress': 0, 'Not started': 1, 'Done': 2, 'Cancelled': 3 };
        filtered.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));

        const statusBadge = (s) => {
            const map = {
                'Not started': '<span class="badge badge-gray">Не начато</span>',
                'In progress': '<span class="badge badge-yellow">В работе</span>',
                'Done': '<span class="badge badge-green">Готово</span>',
                'Cancelled': '<span class="badge badge-red">Отменено</span>',
            };
            return map[s] || s;
        };

        container.innerHTML = `
        <div class="card" style="grid-column: 1 / -1; padding: 0;">
            <div class="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>Задача</th>
                            <th>Статус</th>
                            <th>Ответственный</th>
                            <th>Дедлайн</th>
                            <th>Проект</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? '<tr><td colspan="6" class="text-center text-muted">Нет задач</td></tr>' : ''}
                        ${filtered.map(t => `
                        <tr onclick="Tasks.openTask(${t.id})" style="cursor:pointer">
                            <td><b>${this.esc(t.title)}</b></td>
                            <td>${statusBadge(t.status)}</td>
                            <td style="font-size:12px">${this.esc(t.assignee || '')}</td>
                            <td style="font-size:12px" class="${this.isOverdue(t.deadline) ? 'text-red' : ''}">${t.deadline ? this.formatDeadline(t.deadline) : ''}</td>
                            <td style="font-size:12px">${this.esc(this.shortProject(t.project) || '')}</td>
                            <td><button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Tasks.deleteTask(${t.id})">&#10005;</button></td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    },

    filterTasks(assignee, project, search) {
        let filtered = [...this.allTasks];

        // Hide 'Done' and 'Cancelled' by default unless searching or filtering specifically
        const statusFilter = document.getElementById('tasks-filter-status')?.value || 'active';
        if (statusFilter === 'active') {
            filtered = filtered.filter(t => t.status === 'Not started' || t.status === 'In progress');
        } else if (statusFilter !== 'all') {
            filtered = filtered.filter(t => t.status === statusFilter);
        }

        if (assignee) {
            filtered = filtered.filter(t => (t.assignee || '').includes(assignee));
        }
        if (project) {
            filtered = filtered.filter(t => (t.project || '').includes(project));
        }
        if (search) {
            filtered = filtered.filter(t =>
                (t.title || '').toLowerCase().includes(search) ||
                (t.assignee || '').toLowerCase().includes(search) ||
                (t.project || '').toLowerCase().includes(search)
            );
        }
        return filtered;
    },

    // === DRAG & DROP ===

    onDragStart(e, taskId) {
        e.dataTransfer.setData('text/plain', taskId);
    },

    async onDrop(e, newStatus) {
        e.preventDefault();
        const taskId = parseInt(e.dataTransfer.getData('text/plain'));
        const task = this.allTasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            task.updated_at = new Date().toISOString();
            await saveTasks(this.allTasks);
            this.renderStats();
            this.render();
        }
    },

    // === CRUD ===

    showAddForm() {
        document.getElementById('tasks-add-form').style.display = '';
        document.getElementById('task-edit-title').value = '';
        document.getElementById('task-edit-assignee').value = '';
        document.getElementById('task-edit-deadline').value = '';
        document.getElementById('task-edit-project').value = '';
        document.getElementById('task-edit-description').value = '';
        document.getElementById('task-edit-id').value = '';
        this.populateProjectOptions();
    },

    hideAddForm() {
        document.getElementById('tasks-add-form').style.display = 'none';
    },

    populateProjectOptions() {
        // Collect unique projects from tasks
        const projects = [...new Set(this.allTasks.map(t => t.project).filter(Boolean))].sort();
        const datalist = document.getElementById('task-projects-datalist');
        if (datalist) {
            datalist.innerHTML = projects.map(p => `<option value="${this.esc(p)}">`).join('');
        }
    },

    async saveTask() {
        const id = document.getElementById('task-edit-id').value;
        const title = document.getElementById('task-edit-title').value.trim();
        const assignee = document.getElementById('task-edit-assignee').value.trim();
        const deadline = document.getElementById('task-edit-deadline').value;
        const project = document.getElementById('task-edit-project').value.trim();
        const description = document.getElementById('task-edit-description').value.trim();

        if (!title) { App.toast('Введите название задачи'); return; }

        if (id) {
            // Edit existing
            const task = this.allTasks.find(t => t.id === parseInt(id));
            if (task) {
                task.title = title;
                task.assignee = assignee;
                task.deadline = deadline || null;
                task.project = project;
                task.description = description;
                task.updated_at = new Date().toISOString();
            }
        } else {
            // New task
            this.allTasks.push({
                id: Date.now(),
                title,
                status: 'Not started',
                assignee,
                deadline: deadline || null,
                project,
                description,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
        }

        await saveTasks(this.allTasks);
        this.hideAddForm();
        App.toast(id ? 'Задача обновлена' : 'Задача создана');
        this.renderStats();
        this.render();
        this.populateFilters();
    },

    openTask(taskId) {
        const task = this.allTasks.find(t => t.id === taskId);
        if (!task) return;

        document.getElementById('tasks-add-form').style.display = '';
        document.getElementById('task-edit-id').value = task.id;
        document.getElementById('task-edit-title').value = task.title || '';
        document.getElementById('task-edit-assignee').value = task.assignee || '';
        document.getElementById('task-edit-deadline').value = task.deadline || '';
        document.getElementById('task-edit-project').value = task.project || '';
        document.getElementById('task-edit-description').value = task.description || '';
        this.populateProjectOptions();

        // Scroll to form
        document.getElementById('tasks-add-form').scrollIntoView({ behavior: 'smooth' });
    },

    async deleteTask(taskId) {
        if (!confirm('Удалить задачу?')) return;
        this.allTasks = this.allTasks.filter(t => t.id !== taskId);
        await saveTasks(this.allTasks);
        App.toast('Задача удалена');
        this.renderStats();
        this.render();
    },

    async changeStatus(taskId, newStatus) {
        const task = this.allTasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            task.updated_at = new Date().toISOString();
            await saveTasks(this.allTasks);
            this.renderStats();
            this.render();
        }
    },

    populateFilters() {
        // Assignees
        const assignees = [...new Set(this.allTasks.flatMap(t => (t.assignee || '').split(',').map(a => a.trim())).filter(Boolean))].sort();
        const aSelect = document.getElementById('tasks-filter-assignee');
        if (aSelect) {
            while (aSelect.options.length > 1) aSelect.remove(1);
            assignees.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a;
                opt.textContent = a;
                aSelect.appendChild(opt);
            });
        }

        // Projects
        const projects = [...new Set(this.allTasks.map(t => t.project).filter(Boolean))].sort();
        const pSelect = document.getElementById('tasks-filter-project');
        if (pSelect) {
            while (pSelect.options.length > 1) pSelect.remove(1);
            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.textContent = this.shortProject(p);
                pSelect.appendChild(opt);
            });
        }
    },

    // === HELPERS ===

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    initials(name) {
        if (!name) return '?';
        // Clean up email-like names
        const clean = name.replace(/@.*/, '').replace(/chiefoperating/, 'Операц.');
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return clean.substring(0, 2).toUpperCase();
    },

    shortProject(p) {
        if (!p) return '';
        // Remove Notion URLs from project name
        return p.replace(/\s*\(https?:\/\/[^)]+\)/g, '').trim();
    },

    formatDeadline(d) {
        if (!d) return '';
        // Handle range deadlines "February 10, 2025 → February 12, 2025"
        if (d.includes('→')) {
            const parts = d.split('→').map(s => s.trim());
            return this.formatSingleDate(parts[1]); // Show end date
        }
        return this.formatSingleDate(d);
    },

    formatSingleDate(d) {
        if (!d) return '';
        try {
            const date = new Date(d);
            if (isNaN(date.getTime())) return d;
            return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        } catch { return d; }
    },

    isOverdue(d) {
        if (!d) return false;
        try {
            let dateStr = d;
            if (d.includes('→')) dateStr = d.split('→').pop().trim();
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return false;
            return date < new Date() && date.toDateString() !== new Date().toDateString();
        } catch { return false; }
    },

    // === DEFAULT DATA (from Notion CSV) ===

    getDefaultTasks() {
        const now = new Date().toISOString();
        const tasks = [
            // Active tasks (Not started / In progress)
            { id: 1, title: 'Придумать бомбическую упаковку для музеев', status: 'Not started', assignee: 'Полина Черповицкая', deadline: 'March 21, 2025', project: '', description: '' },
            { id: 2, title: 'Сделать акты для Пушкинского', status: 'Not started', assignee: 'Алина Семенова', deadline: null, project: '', description: '' },
            { id: 3, title: 'Найти резинку 0,5 см близкую к CMYK 32 0 67 0', status: 'In progress', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 4, title: 'Посмотреть стоимость стержней для точки по истории заказов 1688 на тираж 200', status: 'In progress', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 5, title: 'Покрасить пластик для Озон банка', status: 'Not started', assignee: 'chiefoperating@recycleobject.com, Алексей Маркелов', deadline: null, project: '', description: '' },
            { id: 6, title: 'Обновить информацию о производительности для старых и новых форм (кол-во изделий в час)', status: 'Not started', assignee: 'chiefoperating@recycleobject.com, Алексей Маркелов', deadline: null, project: '', description: '' },
            { id: 7, title: 'Уточнить можно ли сделать резинку 2 мм и в тираже 500 м, какие сроки?', status: 'Not started', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 8, title: 'Зарегистрироваться на площадке Сбер Аст для тендера Отелло (срочная задача)', status: 'Not started', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 9, title: 'Найти штуки для кликабельности клавиш (реф в тг)', status: 'Not started', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 10, title: 'Благодарственные письма от заказчиков', status: 'Not started', assignee: 'Anna Ovcharenko', deadline: 'February 13, 2026 → February 16, 2026', project: '', description: '' },

            // Recent Done tasks (last 30)
            { id: 101, title: 'Заказать на пробу 4 ретрактора: 3 зеленых и 1 желтый', status: 'Done', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 102, title: 'Найти в истории 1688 подрядчика для гравировки на карабинах', status: 'Done', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 103, title: 'Коробки по аналогии с новыми крафтовыми на МП для заказчика (тираж 300 шт)', status: 'Done', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: '', description: '' },
            { id: 104, title: 'Заказать серебристые карабины 20 мм 800 шт', status: 'Done', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: 'Точка нфс', description: '' },
            { id: 105, title: 'Убрать бирюзовый цвет с товаров на сайте', status: 'Done', assignee: 'Elina Kemaйкина', deadline: null, project: '', description: '' },
            { id: 106, title: 'Присвоить всей фурнитуре серийные номера для учета', status: 'Done', assignee: 'Егор', deadline: 'October 1, 2025', project: '', description: '' },
            { id: 107, title: 'Заказать карабины для Мелон (и в сток)', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: 'Melon fashion обвесы', description: '' },
            { id: 108, title: 'Заказать шнурки для Мелон', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: 'Melon fashion обвесы', description: '' },
            { id: 109, title: 'Заказать шнуры для Фонбет, доставка АВИА', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: '', description: '' },
            { id: 110, title: 'Заказать цветные карабины', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: '', description: '' },
            { id: 111, title: 'Заказать шнуры на пробу 4 мм', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: '', description: '' },
            { id: 112, title: 'Заказать шнуры в сток', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: '', description: '' },
            { id: 113, title: 'Найти исполнителя по составлению дашборда из аналитики CRM', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: '', description: '' },
            { id: 114, title: 'Заказать молд пуговиц', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: 'Гараж пуговицы', description: '' },
            { id: 115, title: 'Фурнитура и упаковка для воркшопа ВК', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: 'ВК фест kids', description: '' },
            { id: 116, title: 'Заказать НФС клавишу', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: 'Яндекс воркшоп + клавиша НФС', description: '' },
            { id: 117, title: 'Заказать черные тросы', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: 'Яндекс team смотка', description: '' },
            { id: 118, title: 'Заказать фурнитуру для Точки 1000 стержней с синими чернилами', status: 'Done', assignee: 'Анна Мирная', deadline: null, project: '', description: '' },
            { id: 119, title: 'Заказать паракорды для Точки 300 шт', status: 'Done', assignee: 'chiefoperating@recycleobject.com', deadline: 'November 21, 2025', project: 'обвесы точка', description: '' },
            { id: 120, title: 'Финальная фурнитура на тираж Т-банк (1100 шт)', status: 'Done', assignee: 'chiefoperating@recycleobject.com', deadline: null, project: 'Т-банк картхолдеры для стикеров', description: '' },
        ];

        tasks.forEach(t => {
            t.created_at = now;
            t.updated_at = now;
        });

        return tasks;
    },
};

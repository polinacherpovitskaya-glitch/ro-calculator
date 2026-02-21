// =============================================
// Recycle Object — Time Tracking
// Учет рабочего времени сотрудников
// + Daily status dashboard with employee awareness
// =============================================

const TimeTrack = {
    entries: [],
    employees: [],

    async load() {
        this.entries = await loadTimeEntries();
        this.employees = await loadEmployees();
        this.populateWorkerSelect();
        this.populateFilters();
        this.filterAndRender();
        this.updateStats();
        this.populateProjectSelect();
        this.renderDailyStatus();
        // Set today's date for manual entry
        const dateInput = document.getElementById('tt-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    // === UI toggles ===

    showBotSetup() {
        document.getElementById('tt-bot-setup').style.display = '';
    },

    hideBotSetup() {
        document.getElementById('tt-bot-setup').style.display = 'none';
    },

    showManualEntry() {
        document.getElementById('tt-manual-form').style.display = '';
    },

    hideManualEntry() {
        document.getElementById('tt-manual-form').style.display = 'none';
    },

    // === Populate worker select from employees list ===

    populateWorkerSelect() {
        const select = document.getElementById('tt-worker-name');
        if (!select) return;
        select.innerHTML = '<option value="">-- Выберите --</option>';
        const active = this.employees.filter(e => e.is_active !== false);
        active.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.name;
            opt.textContent = e.name;
            select.appendChild(opt);
        });
    },

    // === Populate project select with active orders ===

    async populateProjectSelect() {
        const select = document.getElementById('tt-project-select');
        if (!select) return;

        // Keep first two options (empty + general)
        while (select.options.length > 2) select.remove(2);

        // Load active orders
        const orders = await loadOrders({});
        orders.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.order_name + (o.client_name ? ` (${o.client_name})` : '');
            select.appendChild(opt);
        });
    },

    // === Daily Status Dashboard ===

    renderDailyStatus() {
        const container = document.getElementById('tt-daily-status-content');
        const dateEl = document.getElementById('tt-daily-date');
        if (!container) return;

        const today = new Date().toISOString().split('T')[0];
        if (dateEl) dateEl.textContent = today;

        const activeEmployees = this.employees.filter(e => e.is_active !== false);
        if (activeEmployees.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px;">Добавьте сотрудников в Настройки → Сотрудники</p>';
            return;
        }

        // Group today's entries by worker
        const todayEntries = this.entries.filter(e => e.date === today);
        const byWorker = {};
        todayEntries.forEach(e => {
            if (!byWorker[e.worker_name]) byWorker[e.worker_name] = [];
            byWorker[e.worker_name].push(e);
        });

        const rows = activeEmployees.map(emp => {
            const entries = byWorker[emp.name] || [];
            const totalHours = entries.reduce((s, e) => s + (e.hours || 0), 0);
            const totalPct = emp.daily_hours > 0 ? Math.round(totalHours / emp.daily_hours * 100) : 0;

            let icon, statusColor, statusText;
            if (totalPct >= 100) {
                icon = '<span style="color:var(--green);font-size:16px;">&#10004;</span>';
                statusColor = 'var(--green)';
                statusText = `${totalPct}%`;
            } else if (totalPct > 0) {
                icon = '<span style="color:var(--orange);font-size:16px;">&#9888;</span>';
                statusColor = 'var(--orange)';
                statusText = `${totalPct}% — не закончил`;
            } else {
                icon = '<span style="color:var(--text-muted);font-size:16px;">&#10060;</span>';
                statusColor = 'var(--text-muted)';
                statusText = 'не отчитался';
            }

            const projectList = entries.length > 0
                ? entries.map(e => {
                    const pctLabel = e.percentage ? `${e.percentage}%` : `${e.hours}ч`;
                    return `<span style="font-size:11px;">${this.esc(e.project_name)} (${pctLabel})</span>`;
                }).join(', ')
                : '';

            const roleLabels = { production: 'Пр', office: 'Оф', management: 'Рук' };
            const roleBadge = `<span style="font-size:9px;color:var(--text-muted);">${roleLabels[emp.role] || ''}</span>`;

            return `
            <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border);">
                ${icon}
                <div style="min-width:90px;">
                    <span style="font-weight:600; font-size:13px;">${this.esc(emp.name)}</span>
                    ${roleBadge}
                </div>
                <div style="flex:1;">
                    <span style="color:${statusColor}; font-weight:600; font-size:12px;">${statusText}</span>
                    ${projectList ? `<div style="margin-top:2px;">${projectList}</div>` : ''}
                </div>
                <div style="font-size:11px; color:var(--text-muted);">${totalHours.toFixed(1)}ч / ${emp.daily_hours}ч</div>
            </div>`;
        });

        container.innerHTML = rows.join('');
    },

    // === Filters ===

    populateFilters() {
        // Workers filter — from employees + from entries (for legacy)
        const employeeNames = this.employees.filter(e => e.is_active !== false).map(e => e.name);
        const entryWorkers = this.entries.map(e => e.worker_name).filter(Boolean);
        const allWorkers = [...new Set([...employeeNames, ...entryWorkers])].sort();

        const wSelect = document.getElementById('tt-filter-worker');
        while (wSelect.options.length > 1) wSelect.remove(1);
        allWorkers.forEach(w => {
            const opt = document.createElement('option');
            opt.value = w;
            opt.textContent = w;
            wSelect.appendChild(opt);
        });

        // Projects filter
        const projects = [...new Set(this.entries.map(e => e.project_name).filter(Boolean))];
        const pSelect = document.getElementById('tt-filter-project');
        while (pSelect.options.length > 1) pSelect.remove(1);
        projects.sort().forEach(p => {
            const opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            pSelect.appendChild(opt);
        });
    },

    filterAndRender() {
        const period = document.getElementById('tt-filter-period').value;
        const worker = document.getElementById('tt-filter-worker').value;
        const project = document.getElementById('tt-filter-project').value;

        let filtered = [...this.entries];

        // Period filter
        const now = new Date();
        if (period === 'week') {
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filtered = filtered.filter(e => new Date(e.date) >= weekAgo);
        } else if (period === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            filtered = filtered.filter(e => new Date(e.date) >= monthStart);
        }

        // Worker filter
        if (worker) {
            filtered = filtered.filter(e => e.worker_name === worker);
        }

        // Project filter
        if (project) {
            filtered = filtered.filter(e => e.project_name === project);
        }

        // Sort by date desc
        filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

        this.renderTable(filtered);
        this.renderProjectSummary(filtered);
    },

    renderTable(entries) {
        const tbody = document.getElementById('tt-table-body');

        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Нет записей</td></tr>';
            return;
        }

        tbody.innerHTML = entries.map(e => {
            const pctLabel = e.percentage ? ` <span style="color:var(--text-muted);font-size:11px">(${e.percentage}%)</span>` : '';
            const srcIcon = e.source === 'telegram' ? ' <span title="Из Telegram-бота" style="font-size:10px">&#128225;</span>' : '';
            return `
            <tr>
                <td>${App.formatDate(e.date)}</td>
                <td><b>${this.esc(e.worker_name)}</b>${srcIcon}</td>
                <td>${this.esc(e.project_name)}${e.order_id ? ' <span class="badge badge-blue" style="font-size:10px">заказ</span>' : ''}</td>
                <td class="text-right"><b>${e.hours}</b> ч${pctLabel}</td>
                <td class="text-muted">${this.esc(e.description || '')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="TimeTrack.deleteEntry(${e.id})">&#10005;</button></td>
            </tr>`;
        }).join('');
    },

    renderProjectSummary(entries) {
        const container = document.getElementById('tt-project-summary');

        // Group by project
        const byProject = {};
        entries.forEach(e => {
            const pn = e.project_name || 'Без проекта';
            if (!byProject[pn]) byProject[pn] = { hours: 0, workers: new Set() };
            byProject[pn].hours += e.hours;
            byProject[pn].workers.add(e.worker_name);
        });

        const projects = Object.entries(byProject).sort((a, b) => b[1].hours - a[1].hours);

        if (projects.length === 0) {
            container.innerHTML = '<p class="text-muted" style="padding:8px">Нет данных</p>';
            return;
        }

        const maxHours = Math.max(...projects.map(([_, v]) => v.hours));

        container.innerHTML = projects.map(([name, data]) => {
            const pct = maxHours > 0 ? (data.hours / maxHours * 100) : 0;
            return `
            <div style="margin-bottom:10px">
                <div class="flex-between" style="margin-bottom:2px">
                    <span style="font-size:13px; font-weight:600">${this.esc(name)}</span>
                    <span style="font-size:13px; font-weight:700">${data.hours} ч</span>
                </div>
                <div class="load-bar" style="height:6px">
                    <div class="load-bar-fill green" style="width:${pct}%"></div>
                </div>
                <div style="font-size:11px; color:var(--text-muted)">${data.workers.size} сотр.</div>
            </div>`;
        }).join('');
    },

    updateStats() {
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const weekHours = this.entries
            .filter(e => new Date(e.date) >= weekAgo)
            .reduce((s, e) => s + e.hours, 0);

        const monthHours = this.entries
            .filter(e => new Date(e.date) >= monthStart)
            .reduce((s, e) => s + e.hours, 0);

        const workers = new Set(this.entries.map(e => e.worker_name)).size;
        const projects = new Set(this.entries.map(e => e.project_name)).size;

        document.getElementById('tt-week-hours').textContent = weekHours.toFixed(1);
        document.getElementById('tt-month-hours').textContent = monthHours.toFixed(1);
        document.getElementById('tt-workers-count').textContent = workers;
        document.getElementById('tt-projects-count').textContent = projects;
    },

    // === CRUD ===

    async saveEntry() {
        const workerName = document.getElementById('tt-worker-name').value.trim();
        const projectSelect = document.getElementById('tt-project-select');
        const hours = parseFloat(document.getElementById('tt-hours').value) || 0;
        const date = document.getElementById('tt-date').value;
        const description = document.getElementById('tt-description').value.trim();

        if (!workerName) { App.toast('Укажите сотрудника'); return; }
        if (hours <= 0) { App.toast('Укажите количество часов'); return; }
        if (!date) { App.toast('Укажите дату'); return; }

        const projectValue = projectSelect.value;
        let projectName = '';
        let orderId = null;

        if (projectValue === '__general') {
            projectName = 'Общие работы';
        } else if (projectValue) {
            orderId = parseInt(projectValue);
            projectName = projectSelect.options[projectSelect.selectedIndex].textContent;
        } else {
            App.toast('Выберите проект'); return;
        }

        const entry = {
            worker_name: workerName,
            project_name: projectName,
            order_id: orderId,
            hours: hours,
            date: date,
            description: description,
            source: 'manual',
        };

        await saveTimeEntry(entry);
        App.toast('Запись добавлена');

        // Clear form
        document.getElementById('tt-hours').value = '';
        document.getElementById('tt-description').value = '';

        // Reload
        this.load();
    },

    async deleteEntry(id) {
        if (!confirm('Удалить запись?')) return;
        await deleteTimeEntry(id);
        App.toast('Запись удалена');
        this.load();
    },

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

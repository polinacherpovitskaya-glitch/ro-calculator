// =============================================
// Recycle Object — Settings Page
// Now with inline editing for forms catalog
// + Employee management for Telegram bot
// =============================================

const Settings = {
    currentTab: 'production',
    moldsData: [],   // local copy of molds for inline editing
    dirtyMolds: {},  // track which molds were edited { id: true }
    employeesData: [],
    editingEmployeeId: null,

    async load() {
        this.populateFields();
        await this.loadMoldsForEditing();
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.settings-tab-content').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.tabs .tab').forEach(el => {
            el.classList.toggle('active', el.dataset.tab === tab);
        });
        const target = document.getElementById('settings-tab-' + tab);
        if (target) target.style.display = '';

        // Lazy-load employees when tab is opened
        if (tab === 'employees' && this.employeesData.length === 0) {
            this.loadEmployeesTab();
        }
    },

    populateFields() {
        const s = App.settings;
        if (!s) return;

        // Fill all inputs with data-key attribute
        document.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            if (s[key] !== undefined) {
                input.value = s[key];
            }
        });
    },

    async saveAll() {
        const newSettings = { ...App.settings };

        document.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            newSettings[key] = parseFloat(input.value) || 0;
        });

        await saveAllSettings(newSettings);

        // Update app state
        App.settings = newSettings;
        App.params = getProductionParams(newSettings);

        // Recalculate if calculator has data
        if (Calculator && Calculator.items && Calculator.items.length > 0) {
            Calculator.recalculate();
        }

        App.toast('Настройки сохранены');
    },

    // ==========================================
    // MOLDS / TEMPLATES — INLINE EDITING
    // ==========================================

    async loadMoldsForEditing() {
        this.moldsData = await loadMolds();
        this.dirtyMolds = {};
        this.renderMoldsTable();
    },

    renderMoldsTable() {
        const tbody = document.getElementById('settings-templates-body');
        if (!this.moldsData || this.moldsData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Нет данных</td></tr>';
            return;
        }

        tbody.innerHTML = this.moldsData.map(m => {
            const dirty = this.dirtyMolds[m.id] ? ' style="background:var(--green-light);"' : '';
            const catBadge = m.category === 'nfc' ? '<span class="badge badge-yellow">NFC</span>'
                : m.category === 'blank' ? '<span class="badge badge-blue">Бланк</span>'
                : '<span class="badge">Кастом</span>';

            return `
            <tr${dirty} id="tpl-row-${m.id}">
                <td style="font-weight:600;font-size:12px;max-width:160px;">${this.escHtml(m.name)}</td>
                <td style="text-align:center;">${catBadge}</td>
                <td>
                    <input type="number" min="0" value="${m.pph_min || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'pph_min', this.value)">
                </td>
                <td>
                    <input type="number" min="0" value="${m.pph_max || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'pph_max', this.value)">
                </td>
                <td>
                    <input type="number" min="0" value="${m.pph_actual || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'pph_actual', this.value)" placeholder="—">
                </td>
                <td>
                    <input type="number" min="0" value="${m.weight_grams || ''}" style="width:60px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'weight_grams', this.value)">
                </td>
                <td>
                    <input type="number" min="1" value="${m.mold_count || 1}" style="width:50px;text-align:center;padding:2px 4px;font-size:12px;"
                        onchange="Settings.onMoldField(${m.id}, 'mold_count', this.value)">
                </td>
                <td>
                    <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px" title="Открыть в бланках" onclick="Settings.goToMold(${m.id})">&#10140;</button>
                </td>
            </tr>`;
        }).join('');

        // Update save button visibility
        this.updateSaveMoldsBtn();
    },

    onMoldField(id, field, value) {
        const m = this.moldsData.find(x => x.id === id);
        if (!m) return;

        if (field === 'pph_actual') {
            m[field] = value ? parseFloat(value) : null;
        } else {
            m[field] = parseFloat(value) || 0;
        }

        // If pph_max is changed but pph_min > pph_max, sync
        if (field === 'pph_min' && m.pph_min > (m.pph_max || 0) && m.pph_max > 0) {
            m.pph_max = m.pph_min;
        }

        this.dirtyMolds[id] = true;

        // Highlight the row
        const row = document.getElementById('tpl-row-' + id);
        if (row) row.style.background = 'var(--green-light)';

        this.updateSaveMoldsBtn();
    },

    updateSaveMoldsBtn() {
        const btn = document.getElementById('settings-save-molds-btn');
        if (!btn) return;
        const dirtyCount = Object.keys(this.dirtyMolds).length;
        if (dirtyCount > 0) {
            btn.style.display = '';
            btn.textContent = `Сохранить (${dirtyCount} изм.)`;
        } else {
            btn.style.display = 'none';
        }
    },

    async saveMoldsChanges() {
        const dirtyIds = Object.keys(this.dirtyMolds).map(Number);
        if (dirtyIds.length === 0) return;

        for (const id of dirtyIds) {
            const m = this.moldsData.find(x => x.id === id);
            if (m) await saveMold(m);
        }

        // Also regenerate templates from molds
        App.templates = this.moldsData.map(m => {
            const pMin = m.pph_min || 0;
            const pMax = m.pph_max || 0;
            const display = pMin === 0 ? '—' : (pMin === pMax ? String(pMin) : `${pMin}-${pMax}`);
            return {
                id: m.id,
                name: m.name,
                category: m.category === 'nfc' ? 'blank' : m.category,
                pieces_per_hour_display: display,
                pieces_per_hour_min: pMin,
                pieces_per_hour_max: pMax,
                weight_grams: m.weight_grams,
            };
        });

        this.dirtyMolds = {};
        this.renderMoldsTable();
        App.toast(`Сохранено ${dirtyIds.length} бланков`);
    },

    goToMold(id) {
        App.navigate('molds');
        // After navigation, scroll to mold (it will reload)
        setTimeout(() => {
            Molds.editMold(id);
        }, 300);
    },

    // ==========================================
    // EMPLOYEES — Management for Telegram bot
    // ==========================================

    async loadEmployeesTab() {
        this.employeesData = await loadEmployees();
        this.renderEmployeesTable();
    },

    renderEmployeesTable() {
        const tbody = document.getElementById('employees-table-body');
        if (!tbody) return;

        if (!this.employeesData || this.employeesData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center">Нет сотрудников</td></tr>';
            return;
        }

        const roleLabels = { production: 'Производство', office: 'Офис', management: 'Руководство' };
        const roleBadges = { production: 'badge-blue', office: 'badge-yellow', management: 'badge-green' };

        tbody.innerHTML = this.employeesData.map(e => {
            const roleBadge = `<span class="badge ${roleBadges[e.role] || ''}">${roleLabels[e.role] || e.role}</span>`;
            const tgStatus = e.telegram_id
                ? `<span style="color:var(--green);" title="Привязан: ${this.escHtml(e.telegram_username || 'ID:' + e.telegram_id)}">&#10004;</span>`
                : `<span style="color:var(--text-muted);" title="Не привязан">—</span>`;
            const reminderTime = `${String(e.reminder_hour || 17).padStart(2, '0')}:${String(e.reminder_minute || 30).padStart(2, '0')} UTC+${e.timezone_offset || 3}`;
            const tasksIcon = e.tasks_required ? '<span style="color:var(--orange);" title="Обязательное описание задач">&#9998;</span>' : '';
            const statusBadge = e.is_active !== false
                ? '<span class="badge badge-green">Активен</span>'
                : '<span class="badge">Неактивен</span>';

            return `
            <tr>
                <td style="font-weight:600;">${this.escHtml(e.name)}</td>
                <td style="text-align:center;">${roleBadge}</td>
                <td style="text-align:center;">${e.daily_hours || 8}ч</td>
                <td style="text-align:center;">${tgStatus}</td>
                <td style="text-align:center;font-size:11px;">${reminderTime}</td>
                <td style="text-align:center;">${tasksIcon}</td>
                <td style="text-align:center;">${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Settings.editEmployee(${e.id})">&#9998;</button>
                </td>
            </tr>`;
        }).join('');
    },

    showAddEmployee() {
        this.editingEmployeeId = null;
        this.clearEmployeeForm();
        document.getElementById('employee-form').style.display = '';
        document.getElementById('emp-delete-btn').style.display = 'none';
        document.getElementById('emp-name').focus();
    },

    editEmployee(id) {
        const e = this.employeesData.find(x => x.id === id);
        if (!e) return;
        this.editingEmployeeId = id;

        document.getElementById('emp-edit-id').value = id;
        document.getElementById('emp-name').value = e.name || '';
        document.getElementById('emp-role').value = e.role || 'production';
        document.getElementById('emp-daily-hours').value = e.daily_hours || 8;
        document.getElementById('emp-tg-username').value = e.telegram_username || '';
        document.getElementById('emp-reminder-hour').value = e.reminder_hour ?? 17;
        document.getElementById('emp-reminder-min').value = e.reminder_minute ?? 30;
        document.getElementById('emp-tz-offset').value = e.timezone_offset ?? 3;
        document.getElementById('emp-tasks-required').checked = !!e.tasks_required;

        document.getElementById('employee-form').style.display = '';
        document.getElementById('emp-delete-btn').style.display = '';
    },

    clearEmployeeForm() {
        document.getElementById('emp-edit-id').value = '';
        document.getElementById('emp-name').value = '';
        document.getElementById('emp-role').value = 'production';
        document.getElementById('emp-daily-hours').value = 8;
        document.getElementById('emp-tg-username').value = '';
        document.getElementById('emp-reminder-hour').value = 17;
        document.getElementById('emp-reminder-min').value = 30;
        document.getElementById('emp-tz-offset').value = 3;
        document.getElementById('emp-tasks-required').checked = false;
    },

    cancelEmployee() {
        document.getElementById('employee-form').style.display = 'none';
        this.editingEmployeeId = null;
    },

    async saveEmployee() {
        const name = document.getElementById('emp-name').value.trim();
        if (!name) { App.toast('Введите имя сотрудника'); return; }

        const employee = {
            id: this.editingEmployeeId || undefined,
            name,
            role: document.getElementById('emp-role').value,
            daily_hours: parseFloat(document.getElementById('emp-daily-hours').value) || 8,
            telegram_username: document.getElementById('emp-tg-username').value.trim(),
            reminder_hour: parseInt(document.getElementById('emp-reminder-hour').value) || 17,
            reminder_minute: parseInt(document.getElementById('emp-reminder-min').value) || 30,
            timezone_offset: parseInt(document.getElementById('emp-tz-offset').value) ?? 3,
            is_active: true,
            tasks_required: document.getElementById('emp-tasks-required').checked,
        };

        // Preserve telegram_id if editing existing
        if (this.editingEmployeeId) {
            const existing = this.employeesData.find(e => e.id === this.editingEmployeeId);
            if (existing) {
                employee.telegram_id = existing.telegram_id || null;
            }
        }

        await saveEmployee(employee);
        App.toast('Сотрудник сохранён');
        this.cancelEmployee();
        await this.loadEmployeesTab();
    },

    async deleteEmployee() {
        if (!this.editingEmployeeId) return;
        const e = this.employeesData.find(x => x.id === this.editingEmployeeId);
        if (!confirm(`Удалить сотрудника "${e?.name || ''}"?`)) return;

        await deleteEmployee(this.editingEmployeeId);
        App.toast('Сотрудник удалён');
        this.cancelEmployee();
        await this.loadEmployeesTab();
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

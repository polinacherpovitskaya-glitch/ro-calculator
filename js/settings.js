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
    authAccountsData: [],
    authActivityData: [],
    authSessionsData: [],
    editingAuthAccountId: null,

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
        if (tab === 'logins') {
            this.loadLoginsTab();
        }
        if (tab === 'sessions') {
            this.loadSessionsTab();
        }
        // Load backup tab info
        if (tab === 'backup') {
            this.loadBackupTab();
        }
        // Load timing editor
        if (tab === 'timing') {
            this.loadTimingTab();
        }
    },

    populateFields() {
        const s = App.settings;
        if (!s) return;

        // Fill all numeric inputs with data-key attribute
        document.querySelectorAll('[data-key]').forEach(input => {
            const key = input.dataset.key;
            if (s[key] !== undefined) {
                input.value = s[key];
            }
        });

        // Fill all text inputs with data-key-text attribute
        document.querySelectorAll('[data-key-text]').forEach(input => {
            const key = input.dataset.keyText;
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

        // Save text fields (company legal details etc.)
        document.querySelectorAll('[data-key-text]').forEach(input => {
            const key = input.dataset.keyText;
            newSettings[key] = input.value.trim();
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
        refreshTemplatesFromMolds(this.moldsData);

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
        await App.refreshEmployees();
    },

    async deleteEmployee() {
        if (!this.editingEmployeeId) return;
        const e = this.employeesData.find(x => x.id === this.editingEmployeeId);
        if (!confirm(`Удалить сотрудника "${e?.name || ''}"?`)) return;

        await deleteEmployee(this.editingEmployeeId);
        App.toast('Сотрудник удалён');
        this.cancelEmployee();
        await this.loadEmployeesTab();
        await App.refreshEmployees();
    },

    // ==========================================
    // AUTH LOGINS — system accounts per employee
    // ==========================================

    async loadLoginsTab() {
        this.employeesData = await loadEmployees();
        this.authAccountsData = await loadAuthAccounts();
        this.authActivityData = await loadAuthActivity();
        this.renderAuthAccountsTable();
        this.renderAuthActivityTable();
    },

    async loadSessionsTab() {
        this.authSessionsData = await loadAuthSessions();
        this.renderSessionsStats();
        this.renderSessionsSummary();
        this.renderSessionsList();
    },

    showAddAuthAccount() {
        this.editingAuthAccountId = null;
        this.clearAuthAccountForm();
        this.populateAuthEmployeeSelect();
        document.getElementById('auth-account-form').style.display = '';
        document.getElementById('auth-account-delete-btn').style.display = 'none';
    },

    populateAuthEmployeeSelect() {
        const select = document.getElementById('auth-account-employee');
        if (!select) return;
        const active = (this.employeesData || []).filter(e => e.is_active !== false);
        let html = '<option value="">-- Выберите сотрудника --</option>';
        html += active.map(e => `<option value="${this.escHtml(String(e.id))}">${this.escHtml(e.name || '')}</option>`).join('');
        select.innerHTML = html;
    },

    clearAuthAccountForm() {
        const idEl = document.getElementById('auth-account-id');
        if (idEl) idEl.value = '';
        const empEl = document.getElementById('auth-account-employee');
        if (empEl) empEl.value = '';
        const userEl = document.getElementById('auth-account-username');
        if (userEl) userEl.value = '';
        const passEl = document.getElementById('auth-account-password');
        if (passEl) passEl.value = '';
        const activeEl = document.getElementById('auth-account-active');
        if (activeEl) activeEl.value = '1';
    },

    cancelAuthAccount() {
        document.getElementById('auth-account-form').style.display = 'none';
        this.editingAuthAccountId = null;
    },

    editAuthAccount(id) {
        const a = (this.authAccountsData || []).find(x => String(x.id) === String(id));
        if (!a) return;
        this.editingAuthAccountId = a.id;
        this.populateAuthEmployeeSelect();
        document.getElementById('auth-account-id').value = String(a.id);
        document.getElementById('auth-account-employee').value = String(a.employee_id || '');
        document.getElementById('auth-account-username').value = a.username || '';
        document.getElementById('auth-account-password').value = '';
        document.getElementById('auth-account-active').value = a.is_active === false ? '0' : '1';
        document.getElementById('auth-account-form').style.display = '';
        document.getElementById('auth-account-delete-btn').style.display = '';
    },

    async saveAuthAccount() {
        const employeeId = parseInt(document.getElementById('auth-account-employee').value, 10);
        const username = (document.getElementById('auth-account-username').value || '').trim().toLowerCase();
        const password = document.getElementById('auth-account-password').value || '';
        const isActive = document.getElementById('auth-account-active').value === '1';

        if (!employeeId) { App.toast('Выберите сотрудника'); return; }
        if (!username) { App.toast('Введите логин'); return; }

        const employee = (this.employeesData || []).find(e => Number(e.id) === employeeId);
        if (!employee) { App.toast('Сотрудник не найден'); return; }

        const duplicate = (this.authAccountsData || []).find(a =>
            (a.username || '').toLowerCase() === username && String(a.id) !== String(this.editingAuthAccountId)
        );
        if (duplicate) { App.toast('Логин уже занят'); return; }

        let account = null;
        if (this.editingAuthAccountId) {
            account = this.authAccountsData.find(a => String(a.id) === String(this.editingAuthAccountId));
            if (!account) return;
        } else {
            account = {
                id: Date.now(),
                created_at: new Date().toISOString(),
                last_login_at: null,
            };
            this.authAccountsData.push(account);
        }

        account.employee_id = employeeId;
        account.employee_name = employee.name || '';
        account.role = employee.role || 'employee';
        account.username = username;
        account.is_active = isActive;
        account.updated_at = new Date().toISOString();

        if (password) {
            account.password_hash = App.hashUserPassword(username, password);
        } else if (!account.password_hash) {
            App.toast('Укажите пароль');
            return;
        }

        await saveAuthAccounts(this.authAccountsData);
        await appendAuthActivity({
            type: this.editingAuthAccountId ? 'account_update' : 'account_create',
            actor: App.getCurrentEmployeeName(),
            target_user: account.employee_name || account.username,
        });
        App.toast('Логин сохранён');
        this.cancelAuthAccount();
        await this.loadLoginsTab();
        await App.refreshAuthUsers();
    },

    async deleteAuthAccount() {
        if (!this.editingAuthAccountId) return;
        const a = this.authAccountsData.find(x => String(x.id) === String(this.editingAuthAccountId));
        if (!a) return;
        if (!confirm(`Удалить логин "${a.username}"?`)) return;

        this.authAccountsData = this.authAccountsData.filter(x => String(x.id) !== String(this.editingAuthAccountId));
        await saveAuthAccounts(this.authAccountsData);
        await appendAuthActivity({
            type: 'account_delete',
            actor: App.getCurrentEmployeeName(),
            target_user: a.employee_name || a.username,
        });
        App.toast('Логин удалён');
        this.cancelAuthAccount();
        await this.loadLoginsTab();
        await App.refreshAuthUsers();
    },

    renderAuthAccountsTable() {
        const tbody = document.getElementById('auth-accounts-table-body');
        if (!tbody) return;
        if (!this.authAccountsData || this.authAccountsData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Нет логинов</td></tr>';
            return;
        }

        const rows = [...this.authAccountsData]
            .sort((a, b) => String(a.employee_name || '').localeCompare(String(b.employee_name || ''), 'ru'))
            .map(a => {
                const status = a.is_active === false
                    ? '<span class="badge">Отключен</span>'
                    : '<span class="badge badge-green">Активен</span>';
                const last = a.last_login_at
                    ? new Date(a.last_login_at).toLocaleString('ru-RU')
                    : '—';
                return `<tr>
                    <td style="font-weight:600;">${this.escHtml(a.employee_name || '—')}</td>
                    <td>${this.escHtml(a.username || '')}</td>
                    <td style="text-align:center;">${status}</td>
                    <td>${this.escHtml(last)}</td>
                    <td><button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Settings.editAuthAccount('${this.escHtml(String(a.id))}')">&#9998;</button></td>
                </tr>`;
            });
        tbody.innerHTML = rows.join('');
    },

    renderAuthActivityTable() {
        const tbody = document.getElementById('auth-activity-table-body');
        if (!tbody) return;
        const list = (this.authActivityData || []).slice(0, 100);
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Нет событий</td></tr>';
            return;
        }

        const rows = list.map(e => {
            const at = e.at ? new Date(e.at).toLocaleString('ru-RU') : '—';
            const actor = this.escHtml(e.actor || '—');
            const action = this.escHtml(e.type || '');
            const page = this.escHtml(e.to_page || e.page || '');
            return `<tr>
                <td>${at}</td>
                <td>${actor}</td>
                <td>${action}</td>
                <td>${page || '—'}</td>
            </tr>`;
        });
        tbody.innerHTML = rows.join('');
    },

    renderSessionsStats() {
        const sessions = this.normalizeSessions(this.authSessionsData || []);
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const weekStart = now.getTime() - (7 * 24 * 3600 * 1000);

        const todaySec = sessions
            .filter(s => new Date(s.started_at).getTime() >= todayStart)
            .reduce((sum, s) => sum + (s.duration_sec || 0), 0);

        const weekSec = sessions
            .filter(s => new Date(s.started_at).getTime() >= weekStart)
            .reduce((sum, s) => sum + (s.duration_sec || 0), 0);

        const activeNow = sessions.filter(s => s.effective_status === 'active').length;
        const users = new Set(sessions.map(s => s.actor || '—').filter(Boolean)).size;

        const todayEl = document.getElementById('sessions-today-hours');
        const weekEl = document.getElementById('sessions-week-hours');
        const activeEl = document.getElementById('sessions-active-now');
        const usersEl = document.getElementById('sessions-users-count');
        if (todayEl) todayEl.textContent = this.formatDuration(todaySec);
        if (weekEl) weekEl.textContent = this.formatDuration(weekSec);
        if (activeEl) activeEl.textContent = String(activeNow);
        if (usersEl) usersEl.textContent = String(users);
    },

    renderSessionsSummary() {
        const tbody = document.getElementById('sessions-summary-body');
        if (!tbody) return;
        const sessions = this.normalizeSessions(this.authSessionsData || []);
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Нет данных</td></tr>';
            return;
        }

        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const weekStart = now.getTime() - (7 * 24 * 3600 * 1000);
        const byUser = new Map();

        sessions.forEach(s => {
            const actor = s.actor || '—';
            const row = byUser.get(actor) || {
                actor,
                todaySec: 0,
                weekSec: 0,
                count: 0,
                lastSeenAt: null,
            };
            const startMs = new Date(s.started_at).getTime();
            if (startMs >= todayStart) row.todaySec += (s.duration_sec || 0);
            if (startMs >= weekStart) row.weekSec += (s.duration_sec || 0);
            row.count += 1;
            const lastSeenMs = s.last_seen_at ? new Date(s.last_seen_at).getTime() : 0;
            if (!row.lastSeenAt || lastSeenMs > new Date(row.lastSeenAt).getTime()) row.lastSeenAt = s.last_seen_at || s.started_at;
            byUser.set(actor, row);
        });

        const rows = [...byUser.values()]
            .sort((a, b) => b.weekSec - a.weekSec)
            .map(r => `<tr>
                <td style="font-weight:600;">${this.escHtml(r.actor)}</td>
                <td class="text-right">${this.formatDuration(r.todaySec)}</td>
                <td class="text-right">${this.formatDuration(r.weekSec)}</td>
                <td class="text-right">${r.count}</td>
                <td>${r.lastSeenAt ? new Date(r.lastSeenAt).toLocaleString('ru-RU') : '—'}</td>
            </tr>`);

        tbody.innerHTML = rows.join('');
    },

    renderSessionsList() {
        const tbody = document.getElementById('sessions-list-body');
        if (!tbody) return;
        const sessions = this.normalizeSessions(this.authSessionsData || []).slice(0, 200);
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Нет данных</td></tr>';
            return;
        }

        const rows = sessions.map(s => {
            const start = s.started_at ? new Date(s.started_at).toLocaleString('ru-RU') : '—';
            const end = s.ended_at ? new Date(s.ended_at).toLocaleString('ru-RU') : '—';
            const status = s.effective_status === 'active'
                ? '<span class="badge badge-green">Активна</span>'
                : '<span class="badge">Завершена</span>';
            return `<tr>
                <td>${start}</td>
                <td>${end}</td>
                <td>${this.escHtml(s.actor || '—')}</td>
                <td class="text-right">${this.formatDuration(s.duration_sec || 0)}</td>
                <td>${status}</td>
            </tr>`;
        });

        tbody.innerHTML = rows.join('');
    },

    normalizeSessions(sessions) {
        const nowMs = Date.now();
        return (sessions || []).map(s => {
            const startedMs = s.started_at ? new Date(s.started_at).getTime() : Date.now();
            const endedMs = s.ended_at ? new Date(s.ended_at).getTime() : Date.now();
            const computed = Math.max(0, Math.round((endedMs - startedMs) / 1000));
            const lastSeenMs = s.last_seen_at ? new Date(s.last_seen_at).getTime() : startedMs;
            const stale = (nowMs - lastSeenMs) > (2 * 60 * 1000);
            const effectiveStatus = (s.status === 'active' && !stale) ? 'active' : 'closed';
            return {
                ...s,
                duration_sec: Math.max(0, parseInt(s.duration_sec || 0, 10) || computed),
                started_at: s.started_at || new Date(startedMs).toISOString(),
                effective_status: effectiveStatus,
            };
        }).sort((a, b) => new Date(b.started_at) - new Date(a.started_at));
    },

    formatDuration(sec) {
        const total = Math.max(0, Math.round(sec || 0));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        return `${h}ч ${String(m).padStart(2, '0')}м`;
    },

    // ==========================================
    // BACKUP / RESTORE
    // ==========================================

    // All localStorage keys used by the app
    BACKUP_KEYS: [
        'ro_calc_orders', 'ro_calc_order_items', 'ro_calc_settings',
        'ro_calc_molds', 'ro_calc_employees', 'ro_calc_tasks',
        'ro_calc_time_entries', 'ro_calc_chinaPurchases',
        'ro_calc_warehouseItems', 'ro_calc_warehouseReservations',
        'ro_calc_warehouseHistory', 'ro_calc_shipments',
        'ro_calc_vacations', 'ro_calc_order_factuals', 'ro_calc_imports',
        'ro_calc_colors',
        'ro_calc_auth_accounts', 'ro_calc_auth_activity',
        'ro_calc_auth_sessions',
        'ro_calc_assembly_timing',
    ],

    downloadBackup() {
        const backup = {
            _meta: {
                app: 'RecycleObject',
                version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown',
                date: new Date().toISOString(),
                browser: navigator.userAgent.slice(0, 80),
            },
        };

        let totalRecords = 0;
        this.BACKUP_KEYS.forEach(key => {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    backup[key] = JSON.parse(raw);
                    if (Array.isArray(backup[key])) totalRecords += backup[key].length;
                }
            } catch (e) { /* skip corrupted */ }
        });

        // Also save autosave state
        const autosaveKeys = ['ro_calc_autosave_draft', 'ro_calc_editing_order_id'];
        autosaveKeys.forEach(key => {
            try {
                const raw = localStorage.getItem(key);
                if (raw) backup[key] = JSON.parse(raw);
            } catch (e) {
                const raw = localStorage.getItem(key);
                if (raw) backup[key] = raw;
            }
        });

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        a.href = url;
        a.download = `RO_backup_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);

        const sizeKb = Math.round(json.length / 1024);
        const infoEl = document.getElementById('backup-info');
        if (infoEl) {
            infoEl.innerHTML = `<span style="color:var(--green)">Бэкап скачан: ${sizeKb} КБ, ${totalRecords} записей</span>`;
        }

        App.toast(`Бэкап скачан (${sizeKb} КБ)`);
    },

    async restoreBackup(file) {
        if (!file) return;
        const infoEl = document.getElementById('restore-info');

        try {
            const text = await file.text();
            const backup = JSON.parse(text);

            if (!backup._meta || backup._meta.app !== 'RecycleObject') {
                if (infoEl) infoEl.innerHTML = '<span style="color:var(--red)">Это не бэкап Recycle Object</span>';
                return;
            }

            // Confirm
            const backupDate = backup._meta.date ? new Date(backup._meta.date).toLocaleString('ru-RU') : '?';
            const backupVer = backup._meta.version || '?';
            if (!confirm(`Восстановить бэкап от ${backupDate} (${backupVer})?\n\nНовые данные будут ДОПОЛНЕНЫ к существующим.`)) {
                return;
            }

            // Auto-backup current state first
            this.autoBackup('pre-restore');

            let restored = 0;
            let merged = 0;

            this.BACKUP_KEYS.forEach(key => {
                if (!backup[key]) return;
                const backupData = backup[key];

                if (Array.isArray(backupData)) {
                    // Merge arrays by ID
                    let existing = [];
                    try { existing = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { existing = []; }

                    const existingIds = new Set(existing.map(r => r.id));
                    let added = 0;

                    backupData.forEach(record => {
                        if (record.id && !existingIds.has(record.id)) {
                            existing.push(record);
                            added++;
                        }
                    });

                    if (added > 0) {
                        localStorage.setItem(key, JSON.stringify(existing));
                        merged += added;
                    }
                    restored++;
                } else if (typeof backupData === 'object') {
                    // Settings: merge keys (don't overwrite existing)
                    let existing = {};
                    try { existing = JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { existing = {}; }

                    const mergedSettings = { ...backupData, ...existing }; // existing takes priority
                    localStorage.setItem(key, JSON.stringify(mergedSettings));
                    restored++;
                }
            });

            if (infoEl) {
                infoEl.innerHTML = `<span style="color:var(--green)">Восстановлено: ${restored} коллекций, +${merged} новых записей</span>`;
            }

            App.toast(`Бэкап восстановлен: +${merged} записей`);

            // Reload page to apply
            setTimeout(() => { location.reload(); }, 1500);

        } catch (e) {
            console.error('Restore error:', e);
            if (infoEl) infoEl.innerHTML = `<span style="color:var(--red)">Ошибка: ${e.message}</span>`;
        }

        // Reset file input
        document.getElementById('backup-file-input').value = '';
    },

    autoBackup(reason) {
        const backup = { _meta: { app: 'RecycleObject', version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : '?', date: new Date().toISOString(), reason } };
        this.BACKUP_KEYS.forEach(key => {
            try {
                const raw = localStorage.getItem(key);
                if (raw) backup[key] = JSON.parse(raw);
            } catch (e) { /* skip */ }
        });

        // Store up to 3 auto-backups
        let autoBackups = [];
        try { autoBackups = JSON.parse(localStorage.getItem('ro_calc_auto_backups')) || []; } catch (e) { autoBackups = []; }

        autoBackups.unshift(backup);
        if (autoBackups.length > 3) autoBackups = autoBackups.slice(0, 3);

        try {
            localStorage.setItem('ro_calc_auto_backups', JSON.stringify(autoBackups));
        } catch (e) {
            // localStorage full — remove oldest
            autoBackups = autoBackups.slice(0, 1);
            try { localStorage.setItem('ro_calc_auto_backups', JSON.stringify(autoBackups)); } catch (e2) { /* give up */ }
        }
    },

    loadBackupTab() {
        // Show auto-backups list
        const listEl = document.getElementById('auto-backup-list');
        if (!listEl) return;

        let autoBackups = [];
        try { autoBackups = JSON.parse(localStorage.getItem('ro_calc_auto_backups')) || []; } catch (e) {}

        if (autoBackups.length === 0) {
            listEl.innerHTML = 'Нет авто-бэкапов. Первый создастся при следующем обновлении.';
        } else {
            listEl.innerHTML = autoBackups.map((b, i) => {
                const date = b._meta?.date ? new Date(b._meta.date).toLocaleString('ru-RU') : '?';
                const ver = b._meta?.version || '?';
                const reason = b._meta?.reason || '';
                const orders = Array.isArray(b.ro_calc_orders) ? b.ro_calc_orders.length : 0;
                return `<div style="padding:6px 0;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
                    <span>${date} &middot; ${ver} &middot; ${reason} &middot; ${orders} заказов</span>
                    <button class="btn btn-sm btn-outline" onclick="Settings.downloadAutoBackup(${i})" style="font-size:10px;padding:2px 8px;">Скачать</button>
                </div>`;
            }).join('');
        }

        // Supabase status
        const statusEl = document.getElementById('supabase-status-text');
        if (statusEl) {
            if (typeof isSupabaseReady === 'function' && isSupabaseReady()) {
                statusEl.innerHTML = '<span style="color:var(--green);font-weight:600;">Supabase подключён — данные синхронизируются</span>';
            } else {
                statusEl.innerHTML = '<span style="color:var(--red);font-weight:600;">Supabase НЕ подключён — данные только в этом браузере!</span>';
            }
        }
    },

    downloadAutoBackup(index) {
        let autoBackups = [];
        try { autoBackups = JSON.parse(localStorage.getItem('ro_calc_auto_backups')) || []; } catch (e) {}
        const backup = autoBackups[index];
        if (!backup) return;

        const json = JSON.stringify(backup, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = backup._meta?.date ? backup._meta.date.slice(0, 10).replace(/-/g, '') : 'unknown';
        a.href = url;
        a.download = `RO_autobackup_${dateStr}.json`;
        a.click();
        URL.revokeObjectURL(url);
        App.toast('Авто-бэкап скачан');
    },

    // ==========================================
    // ASSEMBLY TIMING — Editable reference data
    // ==========================================

    TIMING_STORAGE_KEY: 'ro_calc_assembly_timing',

    _defaultTimingData() {
        return [
            { section: 'Отдельные операции', items: [
                ['Карабин', 4], ['Среднее кольцо', 5], ['Железный трос', 11],
                ['Шариковая цепочка', 5], ['Шнур (миланский, кожаный)', 10], ['Приклеить зеркало', 18],
            ]},
            { section: 'Сборки', items: [
                ['Кисточка + соед. кольцо', 34], ['Тег + соед. кольцо', 9],
                ['Трос + соед. кольцо + тег', 13],
                ['Вощ./кож. шнур 90см на изделие', 36],
                ['NFC: карабин + изделие + соед. кольцо', 16],
                ['Открывашка: шнур + наконечники (2шт)', 20],
                ['NFC: карабин + плоск. кольцо + тег + соед. кольцо', 30],
                ['Адресник: шарик. цепочка + изделие', 9],
                ['Карабин + шарик. цепочка + тег', 17],
                ['Милан. шнур + наконечники + вязка + 2 карабина', 50],
                ['Шарик. цепочка + гвоздь + бусина', 65],
                ['Колье: шарик. цепочка 90см + крепление', 128],
            ]},
            { section: 'Упаковка', items: [] },
        ];
    },

    getTimingData() {
        try {
            const raw = localStorage.getItem(this.TIMING_STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                if (Array.isArray(data) && data.length > 0) return data;
            }
        } catch (e) {}
        return this._defaultTimingData();
    },

    saveTimingData(data) {
        localStorage.setItem(this.TIMING_STORAGE_KEY, JSON.stringify(data));
    },

    loadTimingTab() {
        const container = document.getElementById('timing-editor');
        if (!container) return;
        const data = this.getTimingData();

        let html = '';
        data.forEach((group, gi) => {
            html += `<div class="card" style="margin-bottom:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <input type="text" value="${this.escHtml(group.section)}" style="font-weight:700;font-size:14px;border:none;padding:0;background:transparent;flex:1;"
                        onchange="Settings.onTimingSectionName(${gi}, this.value)">
                    <button class="btn-remove" style="font-size:9px;width:20px;height:20px;" onclick="Settings.deleteTimingSection(${gi})" title="Удалить раздел">✕</button>
                </div>
                <table style="width:100%;font-size:12px;">
                    <thead><tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;">
                        <th style="text-align:left;padding:2px 4px;">Операция</th>
                        <th style="width:70px;text-align:center;padding:2px 4px;">Секунды</th>
                        <th style="width:70px;text-align:center;padding:2px 4px;">шт/мин</th>
                        <th style="width:30px;"></th>
                    </tr></thead>
                    <tbody>`;

            (group.items || []).forEach(([name, sec], ii) => {
                const raw = 60 / (sec * 1.3);
                const pcsPerMin = raw >= 1 ? Math.floor(raw) : Math.round(raw * 10) / 10;
                html += `<tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:3px 4px;"><input type="text" value="${this.escHtml(name)}" style="width:100%;font-size:12px;padding:2px 4px;border:1px solid var(--border);border-radius:4px;" onchange="Settings.onTimingItem(${gi},${ii},'name',this.value)"></td>
                    <td style="padding:3px 4px;"><input type="number" min="1" value="${sec}" style="width:100%;text-align:center;font-size:12px;padding:2px 4px;" onchange="Settings.onTimingItem(${gi},${ii},'sec',this.value)"></td>
                    <td style="padding:3px 4px;text-align:center;font-weight:600;color:var(--accent);">${pcsPerMin}</td>
                    <td style="padding:3px 4px;"><button class="btn-remove" style="font-size:8px;width:18px;height:18px;" onclick="Settings.deleteTimingItem(${gi},${ii})">✕</button></td>
                </tr>`;
            });

            html += `</tbody></table>
                <button class="btn btn-sm btn-outline" style="margin-top:6px;font-size:11px;" onclick="Settings.addTimingItem(${gi})">+ Добавить операцию</button>
            </div>`;
        });

        html += `<button class="btn btn-sm btn-outline" onclick="Settings.addTimingSection()">+ Добавить раздел</button>`;
        container.innerHTML = html;
    },

    onTimingSectionName(gi, value) {
        const data = this.getTimingData();
        if (data[gi]) { data[gi].section = value.trim(); this.saveTimingData(data); }
    },

    onTimingItem(gi, ii, field, value) {
        const data = this.getTimingData();
        if (!data[gi] || !data[gi].items[ii]) return;
        if (field === 'name') data[gi].items[ii][0] = value.trim();
        if (field === 'sec') data[gi].items[ii][1] = parseInt(value) || 1;
        this.saveTimingData(data);
        this.loadTimingTab();
    },

    addTimingItem(gi) {
        const data = this.getTimingData();
        if (!data[gi]) return;
        data[gi].items.push(['Новая операция', 10]);
        this.saveTimingData(data);
        this.loadTimingTab();
    },

    deleteTimingItem(gi, ii) {
        const data = this.getTimingData();
        if (!data[gi] || !data[gi].items[ii]) return;
        data[gi].items.splice(ii, 1);
        this.saveTimingData(data);
        this.loadTimingTab();
    },

    addTimingSection() {
        const data = this.getTimingData();
        data.push({ section: 'Новый раздел', items: [] });
        this.saveTimingData(data);
        this.loadTimingTab();
    },

    deleteTimingSection(gi) {
        const data = this.getTimingData();
        if (!data[gi]) return;
        if (data[gi].items.length > 0 && !confirm(`Удалить раздел "${data[gi].section}" с ${data[gi].items.length} операциями?`)) return;
        data.splice(gi, 1);
        this.saveTimingData(data);
        this.loadTimingTab();
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

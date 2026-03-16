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
    visiblePasswords: {},

    // Tabs that require admin access
    ADMIN_TABS: new Set(['indirect', 'costs', 'logins', 'sessions', 'backup']),

    async load() {
        this._applyAdminVisibility();
        this.populateFields();
        await this.loadMoldsForEditing();
    },

    _applyAdminVisibility() {
        const admin = App.isAdmin();
        // Hide/show admin-only tabs in the tab bar
        document.querySelectorAll('#page-settings .tabs .tab').forEach(el => {
            const tab = el.dataset.tab;
            if (this.ADMIN_TABS.has(tab)) {
                el.style.display = admin ? '' : 'none';
            }
        });
        // In the employees tab, hide salary columns for non-admin
        // (handled in _renderEmployeesList and _renderEditForm)
    },

    switchTab(tab) {
        // Block non-admin from accessing restricted tabs
        if (this.ADMIN_TABS.has(tab) && !App.isAdmin()) {
            App.toast('Доступ ограничен');
            return;
        }
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
        if (tab === 'indirect') {
            IndirectCosts.load();
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
        const yFrom = document.getElementById('set-holidays-year-from');
        const yTo = document.getElementById('set-holidays-year-to');
        const nowYear = new Date().getFullYear();
        if (yFrom && !yFrom.value) yFrom.value = String(nowYear);
        if (yTo && !yTo.value) yTo.value = String(nowYear + 1);
        this.updateProductionHints();
    },

    _rfProdCalendarHolidaysByYear(year) {
        // Official production calendars (non-working holiday dates incl. transfer days)
        // Sources: consultant production calendars for 2024/2025/2026.
        const m = {
            2024: [
                '2024-01-01','2024-01-02','2024-01-03','2024-01-04','2024-01-05','2024-01-06','2024-01-07','2024-01-08',
                '2024-02-23','2024-03-08',
                '2024-04-29','2024-04-30',
                '2024-05-01','2024-05-09','2024-05-10',
                '2024-06-12','2024-11-04',
                '2024-12-30','2024-12-31',
            ],
            2025: [
                '2025-01-01','2025-01-02','2025-01-03','2025-01-04','2025-01-05','2025-01-06','2025-01-07','2025-01-08',
                '2025-02-23','2025-03-08',
                '2025-05-01','2025-05-02','2025-05-08','2025-05-09',
                '2025-06-12','2025-06-13',
                '2025-11-03','2025-11-04',
                '2025-12-31',
            ],
            2026: [
                '2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05','2026-01-06','2026-01-07','2026-01-08','2026-01-09',
                '2026-02-23','2026-03-08','2026-03-09',
                '2026-05-01','2026-05-09','2026-05-11',
                '2026-06-12','2026-11-04',
                '2026-12-31',
            ],
        };
        return m[year] ? [...m[year]] : null;
    },

    _rfStatutoryFallbackByYear(year) {
        const d = (mmdd) => `${year}-${mmdd}`;
        return [
            d('01-01'), d('01-02'), d('01-03'), d('01-04'),
            d('01-05'), d('01-06'), d('01-07'), d('01-08'),
            d('02-23'), d('03-08'),
            d('05-01'), d('05-09'),
            d('06-12'), d('11-04'),
        ];
    },

    async autofillProductionHolidaysRf() {
        const fromEl = document.getElementById('set-holidays-year-from');
        const toEl = document.getElementById('set-holidays-year-to');
        const inputEl = document.getElementById('set-production_holidays');
        if (!fromEl || !toEl || !inputEl) return;

        let from = parseInt(fromEl.value, 10);
        let to = parseInt(toEl.value, 10);
        if (!Number.isFinite(from) || !Number.isFinite(to)) {
            App.toast('Укажите корректный диапазон лет');
            return;
        }
        if (from > to) [from, to] = [to, from];
        if (to - from > 20) {
            App.toast('Слишком большой диапазон лет (макс. 20)');
            return;
        }

        const allDates = [];
        const fallbackYears = [];
        for (let y = from; y <= to; y++) {
            const known = this._rfProdCalendarHolidaysByYear(y);
            if (known && known.length > 0) {
                allDates.push(...known);
            } else {
                fallbackYears.push(y);
                allDates.push(...this._rfStatutoryFallbackByYear(y));
            }
        }
        const uniqueSorted = Array.from(new Set(allDates))
            .filter(v => /^\d{4}-\d{2}-\d{2}$/.test(v))
            .sort();
        const value = uniqueSorted.join(', ');
        inputEl.value = value;

        App.settings = App.settings || {};
        App.settings.production_holidays = value;
        await saveSetting('production_holidays', value);

        if (fallbackYears.length > 0) {
            App.toast(`Праздники заполнены. Для ${fallbackYears.join(', ')} использован базовый набор ст.112 ТК РФ (без переносов).`);
        } else {
            App.toast('Праздничные даты заполнены из производственного календаря РФ и сохранены');
        }
    },

    updateProductionHints() {
        const readNum = (id, fallback = 0) => {
            const el = document.getElementById(id);
            if (!el) return fallback;
            const v = parseFloat(el.value);
            return Number.isFinite(v) ? v : fallback;
        };
        const setHint = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        const pct = (v) => `${Math.round((v || 0) * 1000) / 10}%`;

        const hoursPerWorker = readNum('set-hours_per_worker', 168);
        const workLoad = readNum('set-work_load_ratio', 0.8);
        const plasticRatio = readNum('set-plastic_injection_ratio', 0.7);
        const packagingRatio = readNum('set-packaging_ratio', 0.3);
        const wasteFactor = readNum('set-waste_factor', 1.1);

        setHint('set-hours-per-worker-hint', `ч/мес (сейчас: ${hoursPerWorker})`);
        setHint('set-work-load-hint', `${workLoad} = ${pct(workLoad)}`);
        setHint('set-plastic-ratio-hint', `${plasticRatio} = ${pct(plasticRatio)}`);
        setHint('set-packaging-ratio-hint', `${packagingRatio} = ${pct(packagingRatio)}`);
        const wastePct = Math.round((wasteFactor - 1) * 1000) / 10;
        const wasteSign = wastePct >= 0 ? '+' : '';
        setHint('set-waste-factor-hint', `${wasteFactor} = ${wasteSign}${wastePct}% к времени/себестоимости`);
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
        try {
            this.employeesData = await loadEmployees();
        } catch (err) {
            console.error('loadEmployeesTab error:', err);
            this.employeesData = [];
        }
        if (!this.employeesData || !Array.isArray(this.employeesData)) {
            this.employeesData = [];
        }
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
            const isFired = !!e.fired_date;
            const statusBadge = isFired
                ? `<span class="badge" title="Уволен ${e.fired_date}">Уволен ${e.fired_date}</span>`
                : (e.is_active !== false
                    ? '<span class="badge badge-green">Активен</span>'
                    : '<span class="badge">Неактивен</span>');
            const rowStyle = isFired ? 'opacity:0.5' : '';
            return `
            <tr style="${rowStyle}">
                <td style="font-weight:600;">${this.escHtml(e.name)}</td>
                <td style="text-align:center;">${roleBadge}</td>
                <td style="text-align:center;">${e.daily_hours || 8}ч</td>
                <td style="text-align:center;">${tgStatus}</td>
                <td style="text-align:center;font-size:11px;">${reminderTime}</td>
                <td style="text-align:center;">${tasksIcon}</td>
                <td style="text-align:center;">${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Settings.editEmployee('${e.id}')">&#9998;</button>
                </td>
            </tr>`;
        }).join('');
    },

    showAddEmployee() {
        this.editingEmployeeId = null;
        this.clearEmployeeForm();
        document.getElementById('employee-form').style.display = '';
        document.getElementById('emp-delete-btn').style.display = 'none';
        // Hide salary section from non-admin
        const paySection = document.getElementById('emp-pay-section');
        if (paySection) paySection.style.display = App.isAdmin() ? '' : 'none';
        document.getElementById('emp-name').focus();
    },

    // Tax calculation: white salary is NET → gross = net / 0.87
    // НДФЛ = gross × 13%, Social = gross × 30.2%
    // Total cost = white_net + black + НДФЛ + Social = gross×(1+0.302) + black
    NDFL_RATE: 0.13,
    SOCIAL_RATE: 0.302,

    calcEmployeeTaxes(whiteNet) {
        if (!whiteNet || whiteNet <= 0) return { gross: 0, ndfl: 0, social: 0, totalTaxes: 0 };
        const gross = Math.round(whiteNet / (1 - this.NDFL_RATE));
        const ndfl = Math.round(gross * this.NDFL_RATE);
        const social = Math.round(gross * this.SOCIAL_RATE);
        return { gross, ndfl, social, totalTaxes: ndfl + social };
    },

    calcEmployeeTotalCost(whiteNet, black) {
        const { totalTaxes } = this.calcEmployeeTaxes(whiteNet);
        return (whiteNet || 0) + (black || 0) + totalTaxes;
    },

    recalcEmployeeCost() {
        const white = parseFloat(document.getElementById('emp-pay-white')?.value) || 0;
        const black = parseFloat(document.getElementById('emp-pay-black')?.value) || 0;
        const { ndfl, social, totalTaxes } = this.calcEmployeeTaxes(white);
        const total = white + black + totalTaxes;

        const fmt = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';
        const ndflEl = document.getElementById('emp-tax-ndfl');
        const socialEl = document.getElementById('emp-tax-social');
        const totalEl = document.getElementById('emp-total-cost');
        if (ndflEl) ndflEl.value = white > 0 ? fmt(ndfl) : '—';
        if (socialEl) socialEl.value = white > 0 ? fmt(social) : '—';
        if (totalEl) totalEl.value = total > 0 ? fmt(total) : '—';
    },

    editEmployee(id) {
        id = String(id);
        const e = this.employeesData.find(x => String(x.id) === id);
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
        // Migration: if no white/black split exists but pay_base_salary_month does, treat as all black
        let white = parseFloat(e.pay_white_salary) || 0;
        let black = parseFloat(e.pay_black_salary) || 0;
        if (white === 0 && black === 0 && (parseFloat(e.pay_base_salary_month) || 0) > 0) {
            black = parseFloat(e.pay_base_salary_month);
        }
        document.getElementById('emp-pay-white').value = white;
        document.getElementById('emp-pay-black').value = black;
        document.getElementById('emp-pay-base-hours').value = parseFloat(e.pay_base_hours_month) || 176;
        document.getElementById('emp-pay-overtime-rate').value = parseFloat(e.pay_overtime_hour_rate) || 0;
        document.getElementById('emp-pay-weekend-rate').value = parseFloat(e.pay_weekend_hour_rate) || 0;
        document.getElementById('emp-pay-holiday-rate').value = parseFloat(e.pay_holiday_hour_rate) || 0;
        this.recalcEmployeeCost();

        // Fired date
        const firedEl = document.getElementById('emp-fired-date');
        if (firedEl) firedEl.value = e.fired_date || '';

        document.getElementById('employee-form').style.display = '';
        document.getElementById('emp-delete-btn').style.display = '';

        // Hide salary section from non-admin
        const paySection = document.getElementById('emp-pay-section');
        if (paySection) paySection.style.display = App.isAdmin() ? '' : 'none';

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
        document.getElementById('emp-pay-white').value = '';
        document.getElementById('emp-pay-black').value = '';
        document.getElementById('emp-pay-base-hours').value = 176;
        document.getElementById('emp-pay-overtime-rate').value = '';
        document.getElementById('emp-pay-weekend-rate').value = '';
        document.getElementById('emp-pay-holiday-rate').value = '';
        document.getElementById('emp-tax-ndfl').value = '';
        document.getElementById('emp-tax-social').value = '';
        document.getElementById('emp-total-cost').value = '';
    },

    cancelEmployee() {
        document.getElementById('employee-form').style.display = 'none';
        this.editingEmployeeId = null;
    },

    // Page access checkboxes
    PAGE_LABELS: {
        calculator: 'Калькулятор', orders: 'Заказы',
        'production-plan': 'Производство', factual: 'План-Факт', analytics: 'Аналитика',
        molds: 'Молды', colors: 'Цвета', timetrack: 'Учёт времени',
        tasks: 'Задачи', projects: 'Проекты', gantt: 'Гант', import: 'Импорт',
        warehouse: 'Склад', marketplaces: 'Маркетплейсы', china: 'Китай',
        settings: 'Настройки',
    },


    async saveEmployee() {
        const name = document.getElementById('emp-name').value.trim();
        if (!name) { App.toast('Введите имя сотрудника'); return; }
        const isNewEmployee = !this.editingEmployeeId;

        const employee = {
            id: this.editingEmployeeId || undefined,
            name,
            role: document.getElementById('emp-role').value,
            daily_hours: parseFloat(document.getElementById('emp-daily-hours').value) || 8,
            telegram_username: document.getElementById('emp-tg-username').value.trim(),
            reminder_hour: parseInt(document.getElementById('emp-reminder-hour').value) || 17,
            reminder_minute: parseInt(document.getElementById('emp-reminder-min').value) || 30,
            timezone_offset: parseInt(document.getElementById('emp-tz-offset').value) ?? 3,
            is_active: !document.getElementById('emp-fired-date')?.value, // active = no fired date
            fired_date: document.getElementById('emp-fired-date')?.value || null,
            tasks_required: document.getElementById('emp-tasks-required').checked,
            pay_white_salary: parseFloat(document.getElementById('emp-pay-white').value) || 0,
            pay_black_salary: parseFloat(document.getElementById('emp-pay-black').value) || 0,
            pay_base_salary_month: (parseFloat(document.getElementById('emp-pay-white').value) || 0) + (parseFloat(document.getElementById('emp-pay-black').value) || 0),
            pay_base_hours_month: parseFloat(document.getElementById('emp-pay-base-hours').value) || 176,
            pay_overtime_hour_rate: parseFloat(document.getElementById('emp-pay-overtime-rate').value) || 0,
            pay_weekend_hour_rate: parseFloat(document.getElementById('emp-pay-weekend-rate').value) || 0,
            pay_holiday_hour_rate: parseFloat(document.getElementById('emp-pay-holiday-rate').value) || 0,
        };

        // Preserve telegram_id if editing existing
        if (this.editingEmployeeId) {
            const existing = this.employeesData.find(e => String(e.id) === String(this.editingEmployeeId));
            if (existing) {
                employee.telegram_id = existing.telegram_id || null;
            }
        }

        const savedId = await saveEmployee(employee);
        if (!savedId) {
            App.toast('Не удалось сохранить сотрудника', 'error');
            return;
        }

        if (isNewEmployee) {
            await this.ensureLoginForNewEmployee({ ...employee, id: savedId });
        }
        App.toast('Сотрудник сохранён');
        this.cancelEmployee();
        await this.loadEmployeesTab();
        await App.refreshEmployees();
        await App.refreshAuthUsers();
    },

    async deleteEmployee() {
        if (!this.editingEmployeeId) return;
        const e = this.employeesData.find(x => String(x.id) === String(this.editingEmployeeId));
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
        await this.ensureAutoLoginsForEmployees();
        this.authActivityData = await loadAuthActivity();
        this.visiblePasswords = {};
        this.renderAuthAccountsTable();
        this.renderAuthActivityTable();
    },

    normalizeNameForLogin(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-zа-яё0-9_-]+/gi, '')
            .replace(/_+/g, '_')
            .replace(/^_+|_+$/g, '');
    },

    getAutoLoginBase(name) {
        const normalized = this.normalizeNameForLogin(name);
        const stem = normalized || 'user';
        return `${stem}_ro`;
    },

    getUniqueAutoUsername(baseUsername) {
        const used = new Set((this.authAccountsData || []).map(a => String(a.username || '').toLowerCase()).filter(Boolean));
        if (!used.has(baseUsername.toLowerCase())) return baseUsername.toLowerCase();
        let i = 1;
        while (used.has(`${baseUsername.toLowerCase()}_${i}`)) i++;
        return `${baseUsername.toLowerCase()}_${i}`;
    },

    generateStrongPassword(length = 12) {
        const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
        const bytes = new Uint32Array(length);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 4294967295);
        }
        let out = '';
        for (let i = 0; i < length; i++) {
            out += alphabet[bytes[i] % alphabet.length];
        }
        return out;
    },

    shouldSkipAutoLoginForEmployee(employeeName) {
        const skip = new Set(['алина', 'аня', 'полина']);
        return skip.has(String(employeeName || '').trim().toLowerCase());
    },

    async ensureLoginForNewEmployee(employee) {
        if (!employee || !employee.id) return;
        if (this.shouldSkipAutoLoginForEmployee(employee.name)) return;

        if (!this.authAccountsData || this.authAccountsData.length === 0) {
            this.authAccountsData = await loadAuthAccounts();
        }

        const exists = (this.authAccountsData || []).some(a => Number(a.employee_id) === Number(employee.id));
        if (exists) return;

        const username = this.getUniqueAutoUsername(this.getAutoLoginBase(employee.name));
        const passwordPlain = this.generateStrongPassword(12);
        const account = {
            id: Date.now(),
            employee_id: Number(employee.id),
            employee_name: employee.name || '',
            role: employee.role || 'employee',
            username,
            is_active: true,
            password_hash: App.hashUserPassword(username, passwordPlain),
            password_plain: passwordPlain,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_login_at: null,
        };
        this.authAccountsData.push(account);
        await saveAuthAccounts(this.authAccountsData);
        await appendAuthActivity({
            type: 'account_auto_create',
            actor: App.getCurrentEmployeeName(),
            target_user: account.employee_name || account.username,
        });
    },

    async ensureAutoLoginsForEmployees() {
        const employees = (this.employeesData || []).filter(e => e && e.is_active !== false);
        if (!employees.length) return;

        let changed = false;
        for (const employee of employees) {
            if (this.shouldSkipAutoLoginForEmployee(employee.name)) continue;
            const exists = (this.authAccountsData || []).some(a => Number(a.employee_id) === Number(employee.id));
            if (exists) continue;

            const username = this.getUniqueAutoUsername(this.getAutoLoginBase(employee.name));
            const passwordPlain = this.generateStrongPassword(12);
            this.authAccountsData.push({
                id: Date.now() + Math.floor(Math.random() * 100000),
                employee_id: Number(employee.id),
                employee_name: employee.name || '',
                role: employee.role || 'employee',
                username,
                is_active: true,
                password_hash: App.hashUserPassword(username, passwordPlain),
                password_plain: passwordPlain,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_login_at: null,
            });
            changed = true;
        }
        if (!changed) return;
        await saveAuthAccounts(this.authAccountsData);
        await appendAuthActivity({
            type: 'account_auto_create_batch',
            actor: App.getCurrentEmployeeName(),
            target_user: 'new employees',
        });
        await App.refreshAuthUsers();
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
        // When employee changes, update page checkboxes
        select.onchange = () => {
            const empId = select.value;
            if (empId) this._renderAuthPageCheckboxes(empId);
        };
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
        // Render page access checkboxes for this employee
        if (a.employee_id) this._renderAuthPageCheckboxes(a.employee_id);
    },

    // Page checkboxes in auth account form
    _renderAuthPageCheckboxes(empId) {
        const container = document.getElementById('auth-pages-checkboxes');
        if (!container) return;
        const allowed = App.getEmployeePages(empId) || [...App.DEFAULT_PAGES];
        container.innerHTML = App.ALL_PAGES.map(page => {
            const checked = allowed.includes(page) ? 'checked' : '';
            const label = this.PAGE_LABELS[page] || page;
            return `<label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                <input type="checkbox" class="auth-page-cb" data-page="${page}" ${checked}> ${label}
            </label>`;
        }).join('');
    },

    _saveAuthPageCheckboxes(empId) {
        const cbs = document.querySelectorAll('#auth-pages-checkboxes .auth-page-cb');
        if (!cbs.length) return;
        const pages = [];
        cbs.forEach(cb => { if (cb.checked) pages.push(cb.dataset.page); });
        App.setEmployeePages(empId, pages);
    },

    authPagesSelectAll() {
        document.querySelectorAll('#auth-pages-checkboxes .auth-page-cb').forEach(cb => cb.checked = true);
    },

    authPagesSelectNone() {
        document.querySelectorAll('#auth-pages-checkboxes .auth-page-cb').forEach(cb => cb.checked = false);
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
        let prevUsername = '';
        if (this.editingAuthAccountId) {
            account = this.authAccountsData.find(a => String(a.id) === String(this.editingAuthAccountId));
            if (!account) return;
            prevUsername = String(account.username || '').toLowerCase();
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
            account.password_plain = password;
        } else if (this.editingAuthAccountId && prevUsername && prevUsername !== username) {
            App.toast('При смене логина укажите новый пароль');
            return;
        } else if (!account.password_hash) {
            App.toast('Укажите пароль');
            return;
        }

        // Save page access: both in localStorage AND in auth account object (for Supabase sync)
        const cbs = document.querySelectorAll('#auth-pages-checkboxes .auth-page-cb');
        if (cbs.length) {
            const pages = [];
            cbs.forEach(cb => { if (cb.checked) pages.push(cb.dataset.page); });
            account.pages = pages;
            App.setEmployeePages(employeeId, pages);
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
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Нет логинов</td></tr>';
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
                const isVisible = !!this.visiblePasswords[a.id];
                const passwordMasked = '••••••••••••';
                const passwordShown = a.password_plain || 'не сохранён';
                const passwordCell = isVisible ? this.escHtml(passwordShown) : passwordMasked;
                return `<tr>
                    <td style="font-weight:600;">${this.escHtml(a.employee_name || '—')}</td>
                    <td>${this.escHtml(a.username || '')}</td>
                    <td><code>${passwordCell}</code></td>
                    <td style="text-align:center;">${status}</td>
                    <td>${this.escHtml(last)}</td>
                    <td style="white-space:nowrap;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Settings.toggleAuthPasswordVisibility('${this.escHtml(String(a.id))}')">${isVisible ? 'Скрыть' : 'Показать'}</button>
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Settings.resetAuthPassword('${this.escHtml(String(a.id))}')">Сбросить</button>
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Settings.editAuthAccount('${this.escHtml(String(a.id))}')">&#9998;</button>
                    </td>
                </tr>`;
            });
        tbody.innerHTML = rows.join('');
    },

    toggleAuthPasswordVisibility(id) {
        if (!id) return;
        const key = String(id);
        this.visiblePasswords[key] = !this.visiblePasswords[key];
        this.renderAuthAccountsTable();
    },

    async resetAuthPassword(id) {
        const account = (this.authAccountsData || []).find(a => String(a.id) === String(id));
        if (!account) return;
        const generated = this.generateStrongPassword(12);
        const nextPassword = prompt(`Новый пароль для "${account.employee_name || account.username}"`, generated);
        if (nextPassword === null) return;
        const pass = String(nextPassword || '').trim();
        if (!pass) {
            App.toast('Пароль не может быть пустым');
            return;
        }
        account.password_hash = App.hashUserPassword(account.username, pass);
        account.password_plain = pass;
        account.updated_at = new Date().toISOString();
        await saveAuthAccounts(this.authAccountsData);
        await appendAuthActivity({
            type: 'password_reset',
            actor: App.getCurrentEmployeeName(),
            target_user: account.employee_name || account.username,
        });
        this.visiblePasswords[account.id] = true;
        this.renderAuthAccountsTable();
        App.toast('Пароль обновлён');
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

    formatMoney(v) {
        return `${(parseFloat(v) || 0).toLocaleString('ru-RU')} ₽`;
    },
};

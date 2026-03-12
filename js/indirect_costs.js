// =============================================
// Recycle Object — Косвенные расходы
// Breakdown and tracking of indirect/overhead costs
// =============================================

const IndirectCosts = {
    employees: [],
    monthsData: {},   // { "2026-03": { rent: ..., utilities: ..., ... } }
    currentMonth: '',

    COST_ITEMS: [
        { key: 'rent',          label: 'Аренда (все площадки)',       avg: 256054 },
        { key: 'subscriptions', label: 'Программы и сервисы',        avg: 90513 },
        { key: 'marketing',     label: 'Маркетинг',                  avg: 81067 },
        { key: 'representation',label: 'Представительские',          avg: 38412 },
        { key: 'bank',          label: 'Банковское обслуживание',    avg: 16069 },
        { key: 'photo',         label: 'Фотограф',                   avg: 11865 },
        { key: 'staff_costs',   label: 'Расходы на персонал',        avg: 7190 },
        { key: 'internet',      label: 'Интернет',                   avg: 4086 },
        { key: 'household',     label: 'Хоз. товары',                avg: 1761 },
        { key: 'workshop',      label: 'Обслуживание цеха',          avg: 714 },
        { key: 'fuel',          label: 'Бензин',                     avg: 214 },
        { key: 'other',         label: 'Прочее',                     avg: 0 },
    ],

    ROLE_DEFAULT_SHARE: {
        production: 100,
        office: 0,
        management: 0, // Леша = 50% через override в ro_production_shares
    },

    // ==========================================
    // Load
    // ==========================================

    async load() {
        this.employees = (await loadEmployees()) || [];
        this.monthsData = loadIndirectCostsData();
        this.currentMonth = this._todayMonth();

        // Load production_share overrides from settings (stored separately
        // because Supabase employees table may not have this column)
        this._shareOverrides = JSON.parse(localStorage.getItem('ro_production_shares') || '{}');

        // Apply production_share: override > role default
        this.employees.forEach(e => {
            const key = String(e.id);
            if (this._shareOverrides[key] !== undefined) {
                e.production_share = this._shareOverrides[key];
            } else {
                e.production_share = this.ROLE_DEFAULT_SHARE[e.role] ?? 0;
            }
        });

        // Auto-load FinTablo history if no data yet
        if (Object.keys(this.monthsData).length === 0) {
            this.loadHistory();
        }

        // Set month picker
        const picker = document.getElementById('ic-month-picker');
        if (picker) picker.value = this.currentMonth;

        this.render();
    },

    // ==========================================
    // Month management
    // ==========================================

    setMonth(yyyymm) {
        if (!yyyymm) return;
        this.currentMonth = yyyymm;
        this.render();
    },

    _todayMonth() {
        const d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    },

    _getMonthData() {
        return this.monthsData[this.currentMonth] || {};
    },

    _monthLabel(yyyymm) {
        const months = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                        'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
        const [y, m] = yyyymm.split('-');
        return months[parseInt(m) - 1] + ' ' + y;
    },

    // ==========================================
    // Calculations
    // ==========================================

    // Tax calc: white salary is NET → gross = net / 0.87
    // НДФЛ = gross × 13%, Social = gross × 30.2%
    NDFL_RATE: 0.13,
    SOCIAL_RATE: 0.302,

    _calcEmployeeTotalCost(e) {
        let white = e.pay_white_salary || 0;
        let black = e.pay_black_salary || 0;
        // Migration: if no white/black but has pay_base_salary_month, treat as all black
        if (white === 0 && black === 0 && (e.pay_base_salary_month || 0) > 0) {
            black = e.pay_base_salary_month;
        }
        let taxes = 0;
        if (white > 0) {
            const gross = Math.round(white / (1 - this.NDFL_RATE));
            taxes = Math.round(gross * this.NDFL_RATE) + Math.round(gross * this.SOCIAL_RATE);
        }
        return white + black + taxes;
    },

    calcEmployeeIndirectTotal() {
        return this.employees
            .filter(e => e.is_active !== false)
            .reduce((sum, e) => {
                const totalCost = this._calcEmployeeTotalCost(e);
                const share = e.production_share ?? 0;
                return sum + totalCost * (100 - share) / 100;
            }, 0);
    },

    calcFixedTotal() {
        const data = this._getMonthData();
        return this.COST_ITEMS.reduce((sum, item) => sum + (parseFloat(data[item.key]) || 0), 0);
    },

    calcGrandTotal() {
        return this.calcEmployeeIndirectTotal() + this.calcFixedTotal();
    },

    _getWorkloadHours() {
        const settings = App.settings || {};
        const s = key => settings[key] || 0;
        const totalHoursAll = s('workers_count') * s('hours_per_worker');
        const workLoadHours = totalHoursAll * s('work_load_ratio');
        const indirectCostMode = settings['indirect_cost_mode'] || 'production';
        const plasticHours = workLoadHours * s('plastic_injection_ratio');
        return indirectCostMode === 'all' ? workLoadHours : plasticHours;
    },

    // ==========================================
    // Rendering
    // ==========================================

    render() {
        this._renderStats();
        this._renderEmployees();
        this._renderCostItems();
        this._renderHistory();
    },

    _renderStats() {
        const salaryIndirect = this.calcEmployeeIndirectTotal();
        const fixedTotal = this.calcFixedTotal();
        const grandTotal = salaryIndirect + fixedTotal;
        const hours = this._getWorkloadHours();
        const perHour = hours > 0 ? grandTotal / hours : 0;

        document.getElementById('ic-stat-salary').textContent = formatRub(salaryIndirect);
        document.getElementById('ic-stat-fixed').textContent = formatRub(fixedTotal);
        document.getElementById('ic-stat-total').textContent = formatRub(grandTotal);
        document.getElementById('ic-stat-per-hour').textContent = formatRub(Math.round(perHour));
    },

    _renderEmployees() {
        const tbody = document.getElementById('ic-employees-body');
        if (!tbody) return;

        const roleLabels = { production: 'Производство', office: 'Офис', management: 'Руководство' };
        const roleBadges = { production: 'badge-blue', office: 'badge-yellow', management: 'badge-green' };

        // Only show employees who contribute to indirect costs (production_share < 100)
        const activeEmps = this.employees.filter(e => {
            if (e.is_active === false) return false;
            const share = e.production_share ?? (this.ROLE_DEFAULT_SHARE[e.role] ?? 0);
            return share < 100; // hide 100% production workers
        });

        if (activeEmps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Нет активных сотрудников. Добавьте в Настройках → Сотрудники</td></tr>';
            document.getElementById('ic-employees-total').textContent = '0 ₽';
            return;
        }

        tbody.innerHTML = activeEmps.map(e => {
            const totalCost = this._calcEmployeeTotalCost(e);
            const white = e.pay_white_salary || 0;
            const black = e.pay_black_salary || 0;
            const taxes = totalCost - white - black;
            const share = e.production_share ?? 0;
            const indirect = totalCost * (100 - share) / 100;
            const badge = `<span class="badge ${roleBadges[e.role] || ''}">${roleLabels[e.role] || e.role || '—'}</span>`;
            const costHint = taxes > 0
                ? `<span class="text-muted" style="font-size:10px">б:${formatRub(white)} ч:${formatRub(black)} нал:${formatRub(taxes)}</span>`
                : `<span class="text-muted" style="font-size:10px">${white > 0 ? 'б:' + formatRub(white) : ''}${black > 0 ? ' ч:' + formatRub(black) : ''}</span>`;

            return `<tr>
                <td style="font-weight:600">${this._esc(e.name)}</td>
                <td>${badge}</td>
                <td class="text-right">${formatRub(totalCost)}<br>${costHint}</td>
                <td class="text-right">
                    <input type="number" min="0" max="100" value="${share}"
                        class="ic-inline-input" style="width:60px;text-align:right"
                        onchange="IndirectCosts.updateShare(${e.id}, this.value)">%
                </td>
                <td class="text-right" style="${indirect > 0 ? 'color:var(--danger)' : 'color:var(--text-muted)'}">
                    ${formatRub(indirect)}
                </td>
            </tr>`;
        }).join('');

        document.getElementById('ic-employees-total').textContent = formatRub(this.calcEmployeeIndirectTotal());
    },

    _renderCostItems() {
        const container = document.getElementById('ic-cost-items');
        if (!container) return;

        const data = this._getMonthData();

        container.innerHTML = this.COST_ITEMS.map(item => {
            const val = data[item.key] || '';
            const hint = item.avg ? `<span style="font-size:10px;color:var(--text-muted);margin-left:4px" title="Среднее за 6 мес из FinTablo">FinTablo: ${formatRub(item.avg)}</span>` : '';
            return `<div class="ic-cost-row">
                <label class="ic-cost-label">${item.label}</label>
                <div class="ic-cost-input-wrap">
                    <input type="number" class="ic-inline-input" value="${val}"
                        placeholder="${item.avg || 0}" data-cost-key="${item.key}"
                        oninput="IndirectCosts.onCostChange('${item.key}', this.value)">
                    <span class="text-muted" style="font-size:12px">₽</span>
                    ${hint}
                </div>
            </div>`;
        }).join('');

        document.getElementById('ic-fixed-total').textContent = formatRub(this.calcFixedTotal());
    },

    _renderHistory() {
        const tbody = document.getElementById('ic-history-body');
        if (!tbody) return;

        const months = Object.keys(this.monthsData).sort().reverse();
        if (months.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-muted text-center">Нет сохранённых данных</td></tr>';
            return;
        }

        tbody.innerHTML = months.map(m => {
            const d = this.monthsData[m];
            const salaryInd = d.salary_indirect || 0;
            const fixed = this.COST_ITEMS.reduce((s, item) => s + (parseFloat(d[item.key]) || 0), 0);
            const total = d.total || (salaryInd + fixed);
            const isCurrent = m === this.currentMonth;

            return `<tr style="${isCurrent ? 'background:var(--bg);font-weight:600' : ''}"
                        onclick="IndirectCosts.setMonth('${m}'); document.getElementById('ic-month-picker').value='${m}';"
                        style="cursor:pointer">
                <td>${this._monthLabel(m)}${isCurrent ? ' ←' : ''}</td>
                <td class="text-right">${formatRub(salaryInd)}</td>
                <td class="text-right">${formatRub(fixed)}</td>
                <td class="text-right" style="color:var(--danger)">${formatRub(total)}</td>
            </tr>`;
        }).join('');
    },

    // ==========================================
    // User actions
    // ==========================================

    updateShare(employeeId, value) {
        const share = Math.max(0, Math.min(100, parseInt(value) || 0));
        const emp = this.employees.find(e => e.id === employeeId);
        if (emp) {
            emp.production_share = share;
            // Persist to separate storage (Supabase employees table may lack this column)
            if (!this._shareOverrides) this._shareOverrides = {};
            this._shareOverrides[String(employeeId)] = share;
            localStorage.setItem('ro_production_shares', JSON.stringify(this._shareOverrides));
        }
        this._renderStats();
        this._renderEmployees();
    },

    onCostChange(key, value) {
        if (!this.monthsData[this.currentMonth]) {
            this.monthsData[this.currentMonth] = {};
        }
        this.monthsData[this.currentMonth][key] = parseFloat(value) || 0;
        document.getElementById('ic-fixed-total').textContent = formatRub(this.calcFixedTotal());
        this._renderStats();
    },

    async saveAll() {
        // 1. Save production_share overrides (stored separately from employees table)
        localStorage.setItem('ro_production_shares', JSON.stringify(this._shareOverrides || {}));

        // 2. Save month snapshot
        const salaryIndirect = this.calcEmployeeIndirectTotal();
        const fixedTotal = this.calcFixedTotal();
        const grandTotal = salaryIndirect + fixedTotal;

        if (!this.monthsData[this.currentMonth]) {
            this.monthsData[this.currentMonth] = {};
        }
        const md = this.monthsData[this.currentMonth];
        md.salary_indirect = salaryIndirect;
        md.total = grandTotal;
        md.saved_at = new Date().toISOString();

        saveIndirectCostsData(this.monthsData);

        // 3. Auto-sync to settings
        await saveSetting('indirect_costs_monthly', grandTotal);

        // Update settings in memory
        if (App.settings) {
            App.settings.indirect_costs_monthly = grandTotal;
        }

        // Update the readonly field in settings page if visible
        const settingsInput = document.getElementById('set-indirect_costs_monthly');
        if (settingsInput) settingsInput.value = grandTotal;

        App.toast('Косвенные расходы сохранены (' + formatRub(grandTotal) + ')');
        this._renderHistory();
    },

    // ==========================================
    // Pre-fill from FinTablo averages
    // ==========================================

    prefillFromAverages() {
        if (!this.monthsData[this.currentMonth]) {
            this.monthsData[this.currentMonth] = {};
        }
        const md = this.monthsData[this.currentMonth];
        this.COST_ITEMS.forEach(item => {
            if (item.avg && !md[item.key]) {
                md[item.key] = item.avg;
            }
        });
        this._renderCostItems();
        this._renderStats();
        App.toast('Средние значения из FinTablo подставлены');
    },

    // ==========================================
    // Pre-fill historical data (Sep 2025 – Mar 2026 from FinTablo)
    // ==========================================

    // Налоги на ЗП теперь считаются автоматически по сотрудникам (белая часть → НДФЛ + взносы)
    FINTABLO_HISTORY: {
        '2025-09': { rent: 246073, subscriptions: 104277, marketing: 29000, representation: 85000, bank: 6769, photo: 0, staff_costs: 0, internet: 0, household: 488, workshop: 0, fuel: 0 },
        '2025-10': { rent: 381960, subscriptions: 46777, marketing: 120620, representation: 0, bank: 17725, photo: 0, staff_costs: 5449, internet: 15600, household: 1901, workshop: 0, fuel: 0 },
        '2025-11': { rent: 327232, subscriptions: 109559, marketing: 12000, representation: 1164, bank: 51950, photo: 0, staff_costs: 6150, internet: 1300, household: 2029, workshop: 0, fuel: 1500 },
        '2025-12': { rent: 229052, subscriptions: 16110, marketing: 163800, representation: 152721, bank: 25565, photo: 0, staff_costs: 21234, internet: 0, household: 2329, workshop: 0, fuel: 0 },
        '2026-01': { rent: 180000, subscriptions: 255610, marketing: 53000, representation: 0, bank: 10175, photo: 19902, staff_costs: 0, internet: 0, household: 0, workshop: 0, fuel: 0 },
        '2026-02': { rent: 233063, subscriptions: 98308, marketing: 147200, representation: 0, bank: 150, photo: 40152, staff_costs: 10000, internet: 11700, household: 0, workshop: 0, fuel: 0 },
        '2026-03': { rent: 195000, subscriptions: 2950, marketing: 41850, representation: 30000, bank: 150, photo: 23000, staff_costs: 7500, internet: 0, household: 5577, workshop: 5000, fuel: 0 },
    },

    loadHistory() {
        let changed = false;
        for (const [month, data] of Object.entries(this.FINTABLO_HISTORY)) {
            if (!this.monthsData[month]) {
                this.monthsData[month] = {};
                changed = true;
            }
            const md = this.monthsData[month];
            for (const [key, val] of Object.entries(data)) {
                if (!md[key] && val > 0) {
                    md[key] = val;
                    changed = true;
                }
            }
            // Calc totals
            const fixed = this.COST_ITEMS.reduce((s, item) => s + (parseFloat(md[item.key]) || 0), 0);
            md.total = fixed + (md.salary_indirect || 0);
        }
        if (changed) {
            saveIndirectCostsData(this.monthsData);
            this._renderHistory();
            App.toast('История за 7 месяцев загружена из FinTablo');
        }
    },

    // ==========================================
    // Utils
    // ==========================================

    _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },
};

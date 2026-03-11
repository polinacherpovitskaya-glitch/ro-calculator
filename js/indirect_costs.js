// =============================================
// Recycle Object — Косвенные расходы
// Breakdown and tracking of indirect/overhead costs
// =============================================

const IndirectCosts = {
    employees: [],
    monthsData: {},   // { "2026-03": { rent: ..., utilities: ..., ... } }
    currentMonth: '',

    COST_ITEMS: [
        { key: 'rent',          label: 'Аренда офиса / склада' },
        { key: 'utilities',     label: 'Коммунальные (электр., вода, интернет)' },
        { key: 'amortization',  label: 'Амортизация оборудования' },
        { key: 'marketing',     label: 'Маркетинг' },
        { key: 'subscriptions', label: 'Подписки / софт' },
        { key: 'other',         label: 'Прочее' },
    ],

    ROLE_DEFAULT_SHARE: {
        production: 100,
        office: 0,
        management: 50,
    },

    // ==========================================
    // Load
    // ==========================================

    async load() {
        this.employees = (await loadEmployees()) || [];
        this.monthsData = loadIndirectCostsData();
        this.currentMonth = this._todayMonth();

        // Auto-fill production_share defaults for employees missing the field
        let needsSave = false;
        this.employees.forEach(e => {
            if (e.production_share === undefined || e.production_share === null) {
                e.production_share = this.ROLE_DEFAULT_SHARE[e.role] ?? 0;
                needsSave = true;
            }
        });
        if (needsSave) {
            for (const e of this.employees) {
                await saveEmployee(e);
            }
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

    calcEmployeeIndirectTotal() {
        return this.employees
            .filter(e => e.is_active !== false)
            .reduce((sum, e) => {
                const salary = e.pay_base_salary_month || 0;
                const share = e.production_share ?? 0;
                return sum + salary * (100 - share) / 100;
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

        const activeEmps = this.employees.filter(e => e.is_active !== false);

        if (activeEmps.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">Нет активных сотрудников. Добавьте в Настройках → Сотрудники</td></tr>';
            document.getElementById('ic-employees-total').textContent = '0 ₽';
            return;
        }

        tbody.innerHTML = activeEmps.map(e => {
            const salary = e.pay_base_salary_month || 0;
            const share = e.production_share ?? 0;
            const indirect = salary * (100 - share) / 100;
            const badge = `<span class="badge ${roleBadges[e.role] || ''}">${roleLabels[e.role] || e.role || '—'}</span>`;

            return `<tr>
                <td style="font-weight:600">${this._esc(e.name)}</td>
                <td>${badge}</td>
                <td class="text-right">${formatRub(salary)}</td>
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
            return `<div class="ic-cost-row">
                <label class="ic-cost-label">${item.label}</label>
                <div class="ic-cost-input-wrap">
                    <input type="number" class="ic-inline-input" value="${val}"
                        placeholder="0" data-cost-key="${item.key}"
                        oninput="IndirectCosts.onCostChange('${item.key}', this.value)">
                    <span class="text-muted" style="font-size:12px">₽</span>
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
            const fixed = (d.rent || 0) + (d.utilities || 0) + (d.amortization || 0) +
                          (d.marketing || 0) + (d.subscriptions || 0) + (d.other || 0);
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
        // 1. Save employee production_share updates
        for (const e of this.employees) {
            await saveEmployee(e);
        }

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

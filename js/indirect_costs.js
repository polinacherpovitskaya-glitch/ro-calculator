// =============================================
// Recycle Object — Косвенные расходы
// Breakdown and tracking of indirect/overhead costs
// v7: total override, carry-forward, Supabase sync
// =============================================

const IndirectCosts = {
    employees: [],
    timeEntries: [],
    monthsData: {},   // { "2026-03": { rent: ..., utilities: ..., total_override: ..., ... } }
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

    SUPABASE_KEY: 'indirect_costs_json',

    // ==========================================
    // Load
    // ==========================================

    async load() {
        this.employees = (await loadEmployees()) || [];
        this.timeEntries = (await loadTimeEntries()) || [];
        // Load from Supabase first, fallback to localStorage
        await this._loadFromSupabase();
        this.currentMonth = this._todayMonth();

        // Load production_share overrides from settings
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

    async _loadFromSupabase() {
        if (!supabaseClient) {
            this.monthsData = getLocal(LOCAL_KEYS.indirectCosts) || {};
            return;
        }
        try {
            const { data, error } = await supabaseClient
                .from('settings')
                .select('value')
                .eq('key', this.SUPABASE_KEY)
                .single();
            if (data && data.value && !error) {
                const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                if (parsed && typeof parsed === 'object') {
                    this.monthsData = parsed;
                    // Also save to localStorage as cache
                    setLocal(LOCAL_KEYS.indirectCosts, this.monthsData);
                    return;
                }
            }
        } catch (e) {
            console.warn('IndirectCosts: Supabase load failed, using localStorage', e);
        }
        // Fallback to localStorage
        this.monthsData = getLocal(LOCAL_KEYS.indirectCosts) || {};
    },

    async _saveToSupabase() {
        if (!supabaseClient) return;
        try {
            await supabaseClient
                .from('settings')
                .upsert({ key: this.SUPABASE_KEY, value: JSON.stringify(this.monthsData) }, { onConflict: 'key' });
        } catch (e) {
            console.warn('IndirectCosts: Supabase save failed', e);
        }
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
        if (this.monthsData[this.currentMonth]) return this.monthsData[this.currentMonth];
        // No data for this month — carry forward from the most recent saved month
        const prev = this._getLatestSavedMonth(this.currentMonth);
        if (prev) {
            // Clone cost items + total_override from the last saved month
            const cloned = {};
            this.COST_ITEMS.forEach(item => {
                if (prev[item.key] !== undefined) cloned[item.key] = prev[item.key];
            });
            // Carry forward total_override too
            if (prev.total_override) cloned.total_override = prev.total_override;
            this.monthsData[this.currentMonth] = cloned;
            return cloned;
        }
        return {};
    },

    /** Return the month-data object from the most recent saved month strictly before `beforeMonth` */
    _getLatestSavedMonth(beforeMonth) {
        const months = Object.keys(this.monthsData).filter(m => m < beforeMonth).sort();
        if (months.length === 0) return null;
        return this.monthsData[months[months.length - 1]];
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

    _getEmployeePayrollProfile(employee) {
        const explicit = String(employee?.payroll_profile || '').trim();
        if (explicit) return explicit;
        const baseSalary = parseFloat(employee?.pay_base_salary_month) || 0;
        if (String(employee?.role || '') === 'management' && baseSalary > 0) {
            return 'management_salary_with_production_allocation';
        }
        if (baseSalary > 0) return 'salary_monthly';
        return 'hourly';
    },

    _getEmployeeProductionHoursForCurrentMonth(employee) {
        if (!employee) return 0;
        const prefix = `${this.currentMonth}-`;
        return (this.timeEntries || []).reduce((sum, entry) => {
            if (!String(entry.date || '').startsWith(prefix)) return sum;
            const sameEmployeeId = entry.employee_id != null && String(entry.employee_id) === String(employee.id);
            const sameName = String(entry.worker_name || '').trim() === String(employee.name || '').trim();
            if (!sameEmployeeId && !sameName) return sum;
            return sum + (parseFloat(entry.hours) || 0);
        }, 0);
    },

    _getEffectiveProductionShare(employee) {
        const payrollProfile = this._getEmployeePayrollProfile(employee);
        if (payrollProfile === 'management_salary_with_production_allocation') {
            const baseHours = parseFloat(employee?.pay_base_hours_month) || 176;
            if (baseHours <= 0) return 0;
            const productionHours = this._getEmployeeProductionHoursForCurrentMonth(employee);
            return Math.max(0, Math.min(100, Math.round((productionHours / baseHours) * 1000) / 10));
        }
        const key = String(employee?.id || '');
        if (this._shareOverrides && this._shareOverrides[key] !== undefined) {
            return this._shareOverrides[key];
        }
        return employee?.production_share ?? (this.ROLE_DEFAULT_SHARE[employee?.role] ?? 0);
    },

    calcEmployeeIndirectTotal() {
        return this.employees
            .filter(e => e.is_active !== false)
            .reduce((sum, e) => {
                const totalCost = this._calcEmployeeTotalCost(e);
                const share = this._getEffectiveProductionShare(e);
                return sum + totalCost * (100 - share) / 100;
            }, 0);
    },

    calcFixedTotal() {
        const data = this._getMonthData();
        return this.COST_ITEMS.reduce((sum, item) => sum + (parseFloat(data[item.key]) || 0), 0);
    },

    /** Calculated total (salary indirect + fixed costs) */
    calcGrandTotalCalc() {
        return this.calcEmployeeIndirectTotal() + this.calcFixedTotal();
    },

    /** Effective total — user override or calculated */
    calcGrandTotal() {
        const data = this._getMonthData();
        if (data.total_override && data.total_override > 0) {
            return data.total_override;
        }
        return this.calcGrandTotalCalc();
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
        this._renderTotalOverride();
        this._renderHistory();
    },

    _renderStats() {
        const salaryIndirect = this.calcEmployeeIndirectTotal();
        const fixedTotal = this.calcFixedTotal();
        const grandTotal = this.calcGrandTotal();
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
            const share = this._getEffectiveProductionShare(e);
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
            const share = this._getEffectiveProductionShare(e);
            const indirect = totalCost * (100 - share) / 100;
            const payrollProfile = this._getEmployeePayrollProfile(e);
            const dynamicHours = payrollProfile === 'management_salary_with_production_allocation'
                ? this._getEmployeeProductionHoursForCurrentMonth(e)
                : 0;
            const badge = `<span class="badge ${roleBadges[e.role] || ''}">${roleLabels[e.role] || e.role || '—'}</span>`;
            const costHint = taxes > 0
                ? `<span class="text-muted" style="font-size:10px">б:${formatRub(white)} ч:${formatRub(black)} нал:${formatRub(taxes)}</span>`
                : `<span class="text-muted" style="font-size:10px">${white > 0 ? 'б:' + formatRub(white) : ''}${black > 0 ? ' ч:' + formatRub(black) : ''}</span>`;
            const shareCell = payrollProfile === 'management_salary_with_production_allocation'
                ? `<div class="text-right" style="font-weight:600;">${share.toFixed(1)}%</div><div class="text-muted" style="font-size:10px">по часам: ${dynamicHours.toFixed(1)}ч / ${(parseFloat(e.pay_base_hours_month) || 176)}ч</div>`
                : `<input type="number" min="0" max="100" value="${share}"
                        class="ic-inline-input" style="width:60px;text-align:right"
                        onchange="IndirectCosts.updateShare(${e.id}, this.value)">%`;

            return `<tr>
                <td style="font-weight:600">${this._esc(e.name)}</td>
                <td>${badge}</td>
                <td class="text-right">${formatRub(totalCost)}<br>${costHint}</td>
                <td class="text-right">${shareCell}</td>
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
        // Check if this month was inherited (no saved_at means auto-filled from previous month)
        const isInherited = !data.saved_at && Object.keys(data).length > 0;

        let html = '';
        if (isInherited) {
            html += `<div style="padding:6px 10px;background:var(--warning-bg,#fff8e1);border-radius:6px;font-size:12px;color:var(--text-muted);margin-bottom:8px;">
                ℹ Значения скопированы из предыдущего месяца. Измените при необходимости и нажмите «Сохранить».
            </div>`;
        }

        html += this.COST_ITEMS.map(item => {
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

        container.innerHTML = html;

        document.getElementById('ic-fixed-total').textContent = formatRub(this.calcFixedTotal());
    },

    _renderTotalOverride() {
        const data = this._getMonthData();
        const calcTotal = this.calcGrandTotalCalc();
        const overrideInput = document.getElementById('ic-total-override');
        const calcHint = document.getElementById('ic-calc-hint');

        if (calcHint) {
            calcHint.textContent = `Рассчитано: ${formatRub(calcTotal)} (ЗП ${formatRub(this.calcEmployeeIndirectTotal())} + постоянные ${formatRub(this.calcFixedTotal())})`;
        }

        if (overrideInput) {
            const override = data.total_override || '';
            overrideInput.value = override || Math.round(calcTotal);
            // Highlight if overridden above calc
            if (override && override > calcTotal) {
                overrideInput.style.color = 'var(--primary)';
            } else {
                overrideInput.style.color = '';
            }
        }
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
            const effective = d.total_override || d.total || (salaryInd + fixed);
            const isOverridden = d.total_override && d.total_override > 0;
            const isCurrent = m === this.currentMonth;

            return `<tr style="${isCurrent ? 'background:var(--bg);font-weight:600' : ''};cursor:pointer"
                        onclick="IndirectCosts.setMonth('${m}'); document.getElementById('ic-month-picker').value='${m}';">
                <td>${this._monthLabel(m)}${isCurrent ? ' ←' : ''}</td>
                <td class="text-right">${formatRub(salaryInd)}</td>
                <td class="text-right">${formatRub(fixed)}</td>
                <td class="text-right" style="color:var(--danger)">
                    ${formatRub(effective)}${isOverridden ? ' ✏️' : ''}
                </td>
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
            if (this._getEmployeePayrollProfile(emp) === 'management_salary_with_production_allocation') {
                this.render();
                return;
            }
            emp.production_share = share;
            if (!this._shareOverrides) this._shareOverrides = {};
            this._shareOverrides[String(employeeId)] = share;
            localStorage.setItem('ro_production_shares', JSON.stringify(this._shareOverrides));
        }
        this._renderStats();
        this._renderEmployees();
        this._renderTotalOverride();
    },

    onCostChange(key, value) {
        if (!this.monthsData[this.currentMonth]) {
            this.monthsData[this.currentMonth] = {};
        }
        this.monthsData[this.currentMonth][key] = parseFloat(value) || 0;
        document.getElementById('ic-fixed-total').textContent = formatRub(this.calcFixedTotal());
        this._renderStats();
        this._renderTotalOverride();
    },

    onTotalOverrideChange(value) {
        if (!this.monthsData[this.currentMonth]) {
            this.monthsData[this.currentMonth] = {};
        }
        const v = parseFloat(value) || 0;
        this.monthsData[this.currentMonth].total_override = v > 0 ? v : 0;
        this._renderStats();
    },

    resetTotalToCalc() {
        const data = this._getMonthData();
        delete data.total_override;
        const overrideInput = document.getElementById('ic-total-override');
        if (overrideInput) {
            overrideInput.value = Math.round(this.calcGrandTotalCalc());
            overrideInput.style.color = '';
        }
        this._renderStats();
    },

    async saveAll() {
        // 1. Save production_share overrides
        localStorage.setItem('ro_production_shares', JSON.stringify(this._shareOverrides || {}));

        // 2. Save month snapshot
        const salaryIndirect = this.calcEmployeeIndirectTotal();
        const fixedTotal = this.calcFixedTotal();
        const effectiveTotal = this.calcGrandTotal();

        if (!this.monthsData[this.currentMonth]) {
            this.monthsData[this.currentMonth] = {};
        }
        const md = this.monthsData[this.currentMonth];
        md.salary_indirect = salaryIndirect;
        md.fixed_total = fixedTotal;
        md.total = effectiveTotal;
        md.saved_at = new Date().toISOString();

        // Save to localStorage
        saveIndirectCostsData(this.monthsData);
        // Save to Supabase
        await this._saveToSupabase();

        // 3. Auto-sync effective total to settings (for calculator)
        await saveSetting('indirect_costs_monthly', effectiveTotal);

        // Update settings in memory
        if (App.settings) {
            App.settings.indirect_costs_monthly = effectiveTotal;
        }

        // Update the readonly field in settings page if visible
        const settingsInput = document.getElementById('set-indirect_costs_monthly');
        if (settingsInput) settingsInput.value = effectiveTotal;

        App.toast('Косвенные расходы сохранены (' + formatRub(effectiveTotal) + ')');
        this._renderHistory();
        this._renderTotalOverride();
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
        this._renderTotalOverride();
        App.toast('Средние значения из FinTablo подставлены');
    },

    // ==========================================
    // Pre-fill historical data (Sep 2025 – Mar 2026 from FinTablo)
    // ==========================================

    FINTABLO_HISTORY: {
        '2025-09': { rent: 246073, subscriptions: 104277, marketing: 29000, representation: 85000, bank: 6769, photo: 0, staff_costs: 0, internet: 0, household: 488, workshop: 0, fuel: 0 },
        '2025-10': { rent: 381960, subscriptions: 46777, marketing: 120620, representation: 0, bank: 17725, photo: 0, staff_costs: 5449, internet: 15600, household: 1901, workshop: 0, fuel: 0 },
        '2025-11': { rent: 327232, subscriptions: 109559, marketing: 12000, representation: 1164, bank: 51950, photo: 0, staff_costs: 6150, internet: 1300, household: 2029, workshop: 0, fuel: 0 },
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
            md.total = (md.total_override || 0) > 0 ? md.total_override : fixed + (md.salary_indirect || 0);
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

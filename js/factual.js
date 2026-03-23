// =============================================
// Recycle Object — План-факт (v2 — multi-order)
// All active orders on one page with accordion
// =============================================

const Factual = {
    _allOrders: [],
    _filteredOrders: [],
    _entries: [],
    _employees: [],
    _orderCache: {},  // orderId → { plan, fact, hours, order, items }
    _openOrderId: null,
    _filterRange: 'all',
    _filterFrom: null,
    _filterTo: null,
    _renderTimer: null,

    VISIBLE_STATUSES: ['sample', 'production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery', 'completed'],
    STATUS_LABELS: {
        sample: '🔬 Образец',
        production_casting: '🔧 Литьё',
        production_printing: '🖨️ Печать',
        production_hardware: '🔩 Сборка',
        production_packaging: '📦 Упаковка',
        in_production: '⚙️ Производство',
        delivery: '🚚 Доставка',
        completed: '✅ Готово',
    },
    STATUS_ORDER: {
        production_casting: 1, production_printing: 2, production_hardware: 3, production_packaging: 4, in_production: 5,
        delivery: 6, sample: 7, completed: 8,
    },

    ROWS: [
        { key: 'salary_production',   label: 'ЗП выливание',     planField: 'salaryProduction', hint: 'часы × ставка' },
        { key: 'salary_trim',         label: 'ЗП срезание',      planField: 'salaryTrim',       hint: 'часы × ставка' },
        { key: 'salary_assembly',     label: 'ЗП сборка',        planField: 'salaryAssembly',   hint: 'часы × ставка' },
        { key: 'salary_packaging',    label: 'ЗП упаковка',      planField: 'salaryPackaging',  hint: 'часы × ставка' },
        { key: 'indirect_production', label: 'Косвенные',        planField: 'indirectProduction', hint: 'часы × косв./ч' },
        { key: 'hardware_total',      label: 'Фурнитура+NFC',    planField: 'hardwareTotal',    hint: 'склад или план' },
        { key: 'packaging_total',     label: 'Упаковка',         planField: 'packagingTotal',   hint: 'склад или план' },
        { key: 'design_printing',     label: 'Нанесение',        planField: 'designPrinting',   hint: 'FinTablo / вруч.' },
        { key: 'plastic',             label: 'Пластик / материалы', planField: 'plastic',       hint: 'план + ФинТабло / вруч.' },
        { key: 'molds',               label: 'Молды',            planField: 'molds',            hint: 'FinTablo / вруч.' },
        { key: 'delivery_client',     label: 'Доставка',         planField: 'delivery',         hint: 'вручную' },
        { key: 'taxes',               label: 'Налоги',           planField: 'taxes',            hint: 'калькулятор / ФинТабло' },
        { key: 'other',               label: 'Прочее',           planField: 'other',            hint: 'FinTablo / вруч.' },
    ],

    HOUR_ROWS: [
        { key: 'hours_production', label: 'Выливание',  planField: 'hoursPlastic' },
        { key: 'hours_trim',       label: 'Срезание',   planField: 'hoursTrim' },
        { key: 'hours_assembly',   label: 'Сборка',     planField: 'hoursHardware' },
        { key: 'hours_packaging',  label: 'Упаковка',   planField: 'hoursPackaging' },
    ],

    AUTO_FACT_KEYS: new Set([
        'salary_production', 'salary_trim', 'salary_assembly', 'salary_packaging',
        'indirect_production', 'hardware_total', 'packaging_total',
        'design_printing', 'plastic', 'molds', 'delivery_client', 'taxes', 'other',
    ]),

    _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },
    _getSourceHints(factData) {
        const raw = factData && factData._source_hints;
        return (raw && typeof raw === 'object') ? raw : {};
    },
    _setSourceHint(factData, key, hint) {
        if (!factData || !key || !hint) return;
        const hints = this._getSourceHints(factData);
        hints[key] = hint;
        factData._source_hints = hints;
    },
    _getRowSourceHint(factData, factKey, fallback) {
        return this._getSourceHints(factData)[factKey]
            || (factData?._auto_fintablo?.[factKey] ? 'ФинТабло' : fallback);
    },
    _splitWeightedValue(total, weights, stageKeys) {
        const out = { casting: 0, trim: 0, assembly: 0, packaging: 0 };
        const activeKeys = (stageKeys || []).filter(stage => this._num(weights?.[stage]) > 0);
        if (!activeKeys.length) return out;
        let allocated = 0;
        activeKeys.forEach((stage, idx) => {
            const part = idx === activeKeys.length - 1
                ? round2(total - allocated)
                : round2(total * this._num(weights[stage]));
            out[stage] = part;
            allocated += part;
        });
        return out;
    },
    _isLegacyImportedEntry(entry) {
        const desc = String(entry?.description || entry?.task_description || '');
        return /legacy google-таблиц/i.test(desc) || /Импорт часов 1[–-]15 марта/i.test(desc);
    },
    _collectStageActuals(orderId, planHours = {}, params = {}) {
        const stageKeys = ['casting', 'trim', 'assembly', 'packaging'];
        const entries = (this._entries || []).filter(e => Number(e.order_id) === Number(orderId));
        const stageHours = { casting: 0, trim: 0, assembly: 0, packaging: 0 };
        const stageSalary = { casting: 0, trim: 0, assembly: 0, packaging: 0 };
        const planStageHours = {
            casting: this._num(planHours.hoursPlastic),
            trim: this._num(planHours.hoursTrim),
            assembly: this._num(planHours.hoursHardware),
            packaging: this._num(planHours.hoursPackaging),
        };
        const planTotal = stageKeys.reduce((sum, stage) => sum + planStageHours[stage], 0);
        const weights = planTotal > 0
            ? stageKeys.reduce((acc, stage) => ({ ...acc, [stage]: planStageHours[stage] / planTotal }), {})
            : null;
        let usedLegacyDistribution = false;

        entries.forEach(entry => {
            const stage = this._stageKey(entry);
            const hours = this._num(entry.hours);
            if (hours <= 0) return;
            const rate = this._employeeRateByName(entry.worker_name, params, entry);
            if (stageHours[stage] !== undefined) {
                stageHours[stage] += hours;
                stageSalary[stage] += hours * rate;
                return;
            }
            if (!weights || !this._isLegacyImportedEntry(entry)) return;
            const distributed = this._splitWeightedValue(hours, weights, stageKeys);
            stageKeys.forEach(stageKey => {
                const splitHours = this._num(distributed[stageKey]);
                if (splitHours <= 0) return;
                stageHours[stageKey] += splitHours;
                stageSalary[stageKey] += splitHours * rate;
            });
            usedLegacyDistribution = true;
        });

        stageKeys.forEach(stage => {
            stageHours[stage] = round2(stageHours[stage]);
            stageSalary[stage] = round2(stageSalary[stage]);
        });

        return { hours: stageHours, salary: stageSalary, usedLegacyDistribution };
    },

    // ==========================================
    // Load
    // ==========================================

    async load() {
        this._orderCache = {};
        const allOrders = await loadOrders();
        this._allOrders = (allOrders || []).filter(o => this.VISIBLE_STATUSES.includes(o.status));
        this._allOrders.sort((a, b) => (this.STATUS_ORDER[a.status] || 99) - (this.STATUS_ORDER[b.status] || 99));
        this._entries = await loadTimeEntries();
        this._employees = (await loadEmployees()) || [];

        this._applyFilter();
        await this._renderAll();
    },

    // ==========================================
    // Filter
    // ==========================================

    setFilter(range) {
        this._filterRange = range;
        // Update active button
        document.querySelectorAll('.fact-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.range === range);
        });
        if (range !== 'custom') {
            this._filterFrom = null;
            this._filterTo = null;
        }
        this._applyFilter();
        this._renderAll();
    },

    setCustomRange() {
        const from = document.getElementById('fact-date-from')?.value;
        const to = document.getElementById('fact-date-to')?.value;
        this._filterRange = 'custom';
        this._filterFrom = from || null;
        this._filterTo = to || null;
        document.querySelectorAll('.fact-filter-btn').forEach(btn => btn.classList.remove('active'));
        this._applyFilter();
        this._renderAll();
    },

    _applyFilter() {
        if (this._filterRange === 'all') {
            this._filteredOrders = [...this._allOrders];
            return;
        }

        let from, to;
        const now = new Date();
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        if (this._filterRange === 'custom') {
            from = this._filterFrom ? new Date(this._filterFrom) : new Date(2020, 0, 1);
            to = this._filterTo ? new Date(this._filterTo + 'T23:59:59') : to;
        } else {
            const months = { '1m': 1, '3m': 3, '6m': 6, '1y': 12 }[this._filterRange] || 0;
            from = new Date(now.getFullYear(), now.getMonth() - months, 1);
        }

        this._filteredOrders = this._allOrders.filter(o => {
            const d = new Date(o.created_at || o.updated_at || 0);
            return d >= from && d <= to;
        });
    },

    // ==========================================
    // Render all
    // ==========================================

    async _renderAll() {
        await this._renderGlobalStats();
        this._renderOrdersTable();
    },

    async _renderGlobalStats() {
    const orders = this._filteredOrders;
    const $ = id => document.getElementById(id);
    if (!$('fact-stat-orders')) return;

    // Counts
    const inProd = orders.filter(o => this.SECTION_PRODUCTION.has(o.status));
    const completed = orders.filter(o => o.status === 'completed');
    const samples = orders.filter(o => o.status === 'sample');
    $('fact-stat-orders').textContent = String(orders.length);
    $('fact-stat-orders-hint').textContent = `произв: ${inProd.length} · готово: ${completed.length} · образцы: ${samples.length}`;

    // Plan totals
    let planRevTotal = 0, planCostTotal = 0, planHoursTotal = 0;
    orders.forEach(o => {
        planRevTotal += this._num(o.total_revenue_plan);
        planCostTotal += this._num(o.total_cost_plan);
        planHoursTotal += this._num(o.production_hours_plastic) + this._num(o.production_hours_packaging) + this._num(o.production_hours_hardware);
    });
    const planProfit = this._calcProfitability(planRevTotal, planCostTotal);
    $('fact-stat-plan-revenue').textContent = this.fmtRub(planRevTotal);
    $('fact-stat-plan-costs').textContent = this.fmtRub(planCostTotal);
    $('fact-stat-plan-margin').textContent = this.fmtRub(planProfit.profit);
    $('fact-stat-plan-margin').style.color = planProfit.color;
    if ($('fact-stat-plan-margin-hint')) {
        $('fact-stat-plan-margin-hint').textContent = planRevTotal > 0 ? `${planProfit.margin}% рентаб.` : '—';
    }

    // Production load
    const params = App.params || {};
    const workloadPerMonth = this._num(params.workLoadHours);
    if (workloadPerMonth > 0) {
        const months = this._getFilterMonths();
        const capacity = workloadPerMonth * months;
        const loadPct = capacity > 0 ? round2(planHoursTotal * 100 / capacity) : 0;
        const loadColor = loadPct >= 90 ? 'var(--red)' : loadPct >= 70 ? 'var(--yellow)' : 'var(--green)';
        $('fact-stat-load').innerHTML = `<span style="color:${loadColor}">${loadPct}%</span>`;
        $('fact-stat-load-hint').textContent = `${round2(planHoursTotal)}ч / ${round2(capacity)}ч (${months} мес)`;
    } else {
        $('fact-stat-load').textContent = '—';
        $('fact-stat-load-hint').textContent = '';
    }

    // Indirect costs per month
    const indirectMonthly = this._num(App.settings?.indirect_costs_monthly);
    if (indirectMonthly > 0) {
        $('fact-stat-indirect').textContent = this.fmtRub(indirectMonthly);
        const perHour = this._num(params.indirectPerHour);
        $('fact-stat-indirect-hint').textContent = perHour > 0 ? `${this.fmtRub(perHour)}/ч` : '';
    } else {
        $('fact-stat-indirect').textContent = '—';
        $('fact-stat-indirect-hint').textContent = '';
    }

    // Fact totals
    const computedOrders = await Promise.all(orders.map(o => this._ensureComputedOrder(o)));
    let factRevTotal = 0, factCostTotal = 0;
    let hasFactData = false;

    orders.forEach((o, idx) => {
        const f = computedOrders[idx]?.factData;
        if (!f) return;
        const factRevenue = this._num(f.fact_revenue);
        let factCosts = 0;
        this.ROWS.forEach(r => { factCosts += this._num(f['fact_' + r.key]); });

        if (factRevenue > 0 || factCosts > 0) {
            factRevTotal += factRevenue;
            factCostTotal += factCosts;
            hasFactData = true;
        }
    });

    const factProfit = this._calcProfitability(factRevTotal, factCostTotal);
    $('fact-stat-fact-revenue').textContent = hasFactData ? this.fmtRub(factRevTotal) : '—';
    $('fact-stat-fact-costs').textContent = hasFactData ? this.fmtRub(factCostTotal) : '—';

    const factProfitEl = $('fact-stat-fact-margin');
    factProfitEl.textContent = hasFactData ? this.fmtRub(factProfit.profit) : '—';
    factProfitEl.style.color = hasFactData ? factProfit.color : '';
    if ($('fact-stat-fact-margin-hint')) {
        $('fact-stat-fact-margin-hint').textContent = !hasFactData
            ? '—'
            : (factProfit.margin != null ? `${factProfit.margin}% по полученным деньгам` : 'выручка еще не поступила');
    }

    const revDelta = factRevTotal - planRevTotal;
    const costDelta = factCostTotal - planCostTotal;
    const profitDelta = factProfit.profit - planProfit.profit;
    this._renderDelta($('fact-stat-rev-delta'), revDelta, hasFactData);
    this._renderDelta($('fact-stat-cost-delta'), costDelta, hasFactData, true);
    this._renderDelta($('fact-stat-earned-delta'), profitDelta, hasFactData);
},

_renderDelta(el, delta, hasData, invertColor = false) {
    if (!el) return;
    if (!hasData) { el.textContent = '—'; el.style.color = ''; return; }
    el.textContent = `${delta >= 0 ? '+' : ''}${this.fmtRub(delta)}`;
    if (invertColor) {
        el.style.color = delta <= 0 ? 'var(--green)' : 'var(--red)';
    } else {
        el.style.color = delta >= 0 ? 'var(--green)' : 'var(--red)';
    }
},

_calcProfitability(revenue, cost) {
    const rev = this._num(revenue);
    const expenses = this._num(cost);
    const hasRevenue = rev > 0;
    const hasCosts = expenses > 0;
    const profit = round2(rev - expenses);
    const margin = hasRevenue ? round2((profit * 100) / rev) : null;
    let color = 'var(--text-muted)';
    if (margin != null) {
        color = margin >= 30 ? 'var(--green)' : margin >= 20 ? 'var(--yellow)' : 'var(--red)';
    } else if (hasCosts && !hasRevenue) {
        color = 'var(--red)';
    } else if (profit > 0) {
        color = 'var(--green)';
    }
    return { revenue: rev, cost: expenses, profit, margin, hasRevenue, hasCosts, color };
},

_renderCompactResult(result, options = {}) {
    const emptyLabel = options.emptyLabel || '—';
    if (!result || (!result.hasRevenue && !result.hasCosts)) {
        return `<span class="text-muted">${emptyLabel}</span>`;
    }
    const hint = result.margin != null
        ? `${result.margin}%`
        : (result.hasCosts ? 'без выручки' : '—');
    const hintColor = result.margin != null ? result.color : 'var(--text-muted)';
    return `<div style="font-weight:600;color:${result.color}">${this.fmtRub(result.profit)}</div><div style="font-size:11px;color:${hintColor}">${hint}</div>`;
},

_getFilterMonths() {

        if (this._filterRange === '1m') return 1;
        if (this._filterRange === '3m') return 3;
        if (this._filterRange === '6m') return 6;
        if (this._filterRange === '1y') return 12;
        if (this._filterRange === 'custom' && this._filterFrom && this._filterTo) {
            const from = new Date(this._filterFrom);
            const to = new Date(this._filterTo);
            const diffMs = to - from;
            return Math.max(1, Math.round(diffMs / (30.4 * 24 * 60 * 60 * 1000)));
        }
        // 'all' — count from earliest order
        if (this._allOrders.length === 0) return 1;
        const earliest = this._allOrders.reduce((min, o) => {
            const d = new Date(o.created_at || 0);
            return d < min ? d : min;
        }, new Date());
        const diffMs = Date.now() - earliest.getTime();
        return Math.max(1, Math.round(diffMs / (30.4 * 24 * 60 * 60 * 1000)));
    },

    SECTION_PRODUCTION: new Set(['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery']),
    SECTION_SAMPLE: new Set(['sample']),
    SECTION_COMPLETED: new Set(['completed']),

    SECTIONS: [
        { key: 'production', label: '⚙️ В производстве', icon: '🔧', statuses: null },
        { key: 'sample',     label: '🔬 Образцы',        icon: '🔬', statuses: null },
        { key: 'completed',  label: '✅ Готово',          icon: '✅', statuses: null },
    ],

    _getSection(status) {
        if (this.SECTION_PRODUCTION.has(status)) return 'production';
        if (this.SECTION_SAMPLE.has(status)) return 'sample';
        if (this.SECTION_COMPLETED.has(status)) return 'completed';
        return 'production';
    },

    _renderOrdersTable() {
        const tbody = document.getElementById('fact-orders-body');
        if (!tbody) return;

        if (this._filteredOrders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center" style="padding:24px">Нет заказов за выбранный период</td></tr>';
            return;
        }

        // Group orders by section
        const groups = { production: [], sample: [], completed: [] };
        this._filteredOrders.forEach(o => {
            const sec = this._getSection(o.status);
            groups[sec].push(o);
        });

        const sectionMeta = [
            { key: 'production', label: '⚙️ В производстве', color: 'var(--yellow)' },
            { key: 'sample',     label: '🔬 Образцы',        color: 'var(--accent)' },
            { key: 'completed',  label: '✅ Готово',          color: 'var(--green)' },
        ];

        let html = '';
        sectionMeta.forEach(sec => {
            const orders = groups[sec.key];
            if (orders.length === 0) return;

            // Section header row
            html += `<tr class="fact-section-header">
                <td colspan="9" style="padding:10px 8px 6px;font-weight:700;font-size:13px;color:${sec.color};border-bottom:2px solid ${sec.color};background:var(--bg)">
                    ${sec.label} <span style="font-weight:400;font-size:12px;color:var(--text-muted)">(${orders.length})</span>
                </td>
            </tr>`;

            orders.forEach(o => {
                html += this._renderOrderRow(o);
            });
        });

        tbody.innerHTML = html;

        // Load fact summaries for each order (lightweight — just fact totals)
        this._loadFactSummaries();

        // Re-open detail if was open
        if (this._openOrderId) {
            const detailRow = document.getElementById('fact-detail-row-' + this._openOrderId);
            if (detailRow) {
                detailRow.style.display = '';
                this._loadAndRenderDetail(this._openOrderId);
            }
        }
    },

    _renderOrderRow(o) {
    const planRevenue = this._num(o.total_revenue_plan);
    const planCost = this._num(o.total_cost_plan);
    const planResult = this._calcProfitability(planRevenue, planCost);
    const status = this.STATUS_LABELS[o.status] || o.status;
    const isOpen = this._openOrderId === o.id;

    let html = `<tr class="fact-order-row ${isOpen ? 'fact-row-open' : ''}" onclick="Factual.toggleDetail(${o.id})" style="cursor:pointer">
        <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(o.order_name || '—')}</td>
        <td><span class="fact-status-badge">${status}</span></td>
        <td class="text-right text-muted">${this.fmtRub(planCost)}</td>
        <td class="text-right" id="fact-row-fcost-${o.id}"><span class="text-muted">—</span></td>
        <td class="text-right text-muted">${this.fmtRub(planRevenue)}</td>
        <td class="text-right" id="fact-row-frevenue-${o.id}"><span class="text-muted">—</span></td>
        <td class="text-right">${this._renderCompactResult(planResult)}</td>
        <td class="text-right" id="fact-row-fresult-${o.id}"><span class="text-muted">—</span></td>
        <td style="text-align:center;font-size:12px">${isOpen ? '▼' : '▶'}</td>
    </tr>`;
    html += `<tr id="fact-detail-row-${o.id}" class="fact-detail-row" style="${isOpen ? '' : 'display:none'}">
        <td colspan="9" style="padding:0;background:var(--bg)">
            <div id="fact-detail-${o.id}" style="padding:16px"></div>
        </td>
    </tr>`;
    return html;
},

async _loadFactSummaries() {
    const computedOrders = await Promise.all(this._filteredOrders.map(o => this._ensureComputedOrder(o)));
    this._filteredOrders.forEach((o, idx) => {
        const f = computedOrders[idx]?.factData;
        if (!f) return;

        const factRevenue = parseFloat(f.fact_revenue) || 0;
        let factCosts = 0;
        this.ROWS.forEach(r => { factCosts += parseFloat(f['fact_' + r.key]) || 0; });
        const hasFactData = factRevenue > 0 || factCosts > 0;

        const costEl = document.getElementById('fact-row-fcost-' + o.id);
        const revenueEl = document.getElementById('fact-row-frevenue-' + o.id);
        const resultEl = document.getElementById('fact-row-fresult-' + o.id);

        if (costEl) {
            if (hasFactData) {
                const planCost = this._num(o.total_cost_plan);
                const alarm = this.getAlarm(factCosts, planCost);
                costEl.innerHTML = `<span style="color:${alarm.color};font-weight:500">${this.fmtRub(factCosts)}</span>`;
            } else {
                costEl.innerHTML = '<span class="text-muted">—</span>';
            }
        }
        if (revenueEl) {
            if (hasFactData) {
                const color = factRevenue > 0 ? 'var(--green)' : 'var(--text-muted)';
                revenueEl.innerHTML = `<span style="color:${color};font-weight:500">${this.fmtRub(factRevenue)}</span>`;
            } else {
                revenueEl.innerHTML = '<span class="text-muted">—</span>';
            }
        }
        if (resultEl) {
            resultEl.innerHTML = hasFactData
                ? this._renderCompactResult(this._calcProfitability(factRevenue, factCosts))
                : '<span class="text-muted">—</span>';
        }
    });
},

// ==========================================
// Accordion toggle

    // ==========================================

    async toggleDetail(orderId) {
        if (typeof orderId === 'string') orderId = Number(orderId);

        const detailRow = document.getElementById('fact-detail-row-' + orderId);
        if (!detailRow) return;

        if (this._openOrderId === orderId) {
            // Close
            detailRow.style.display = 'none';
            this._openOrderId = null;
            this._renderOrdersTable();
            return;
        }

        // Close previous
        if (this._openOrderId) {
            const prev = document.getElementById('fact-detail-row-' + this._openOrderId);
            if (prev) prev.style.display = 'none';
        }

        this._openOrderId = orderId;
        detailRow.style.display = '';
        this._renderOrdersTable();
        await this._loadAndRenderDetail(orderId);
    },

    // ==========================================
    // Load plan+fact for one order
    // ==========================================

    async _loadAndRenderDetail(orderId) {
        const container = document.getElementById('fact-detail-' + orderId);
        if (!container) return;
        container.innerHTML = '<p class="text-muted text-center">⏳ Загрузка...</p>';

        const computed = await this._ensureComputedOrder(orderId);
        if (!computed) {
            container.innerHTML = '<p class="text-muted">Заказ не найден</p>';
            return;
        }
        const { order, planData, planHours, factData, planMeta } = computed;
        this._renderDetail(orderId, container, planData, planHours, factData, order, planMeta || {});
    },

    _buildPlan(order, rawItems, params) {
        const calcItems = [];
        const calcHw = [];
        const calcPkg = [];

        rawItems.forEach(ri => {
            if (ri.item_type === 'product') {
                const item = {
                    quantity: ri.quantity, pieces_per_hour: ri.pieces_per_hour,
                    weight_grams: ri.weight_grams, extra_molds: ri.extra_molds || 0,
                    base_mold_in_stock: ri.base_mold_in_stock || false,
                    complex_design: ri.complex_design || false, is_blank_mold: ri.is_blank_mold || false,
                    is_nfc: ri.is_nfc || false, nfc_programming: ri.nfc_programming || false,
                    delivery_included: ri.delivery_included || false,
                    printings: ri.printings ? (typeof ri.printings === 'string' ? JSON.parse(ri.printings) : ri.printings) : [],
                    sell_price_item: ri.sell_price_item || 0, sell_price_printing: ri.sell_price_printing || 0,
                    product_name: ri.product_name, template_id: ri.template_id || null,
                    builtin_hw_name: ri.builtin_hw_name || '', builtin_hw_price: ri.builtin_hw_price || 0,
                    builtin_hw_delivery_total: ri.builtin_hw_delivery_total || 0, builtin_hw_speed: ri.builtin_hw_speed || 0,
                };
                const savedProductResult = (ri.result && typeof ri.result === 'object')
                    ? {
                        hoursPlastic: this._num(ri.result.hoursPlastic),
                        hoursCutting: this._num(ri.result.hoursCutting),
                    }
                    : null;
                const rawHoursPlastic = this._num(ri.hours_plastic);
                const rawHoursCutting = this._num(ri.hours_cutting);
                if (savedProductResult && (savedProductResult.hoursPlastic > 0 || savedProductResult.hoursCutting > 0)) {
                    item.result = savedProductResult;
                } else if (rawHoursPlastic > 0 || rawHoursCutting > 0) {
                    item.result = { hoursPlastic: round2(rawHoursPlastic), hoursCutting: round2(rawHoursCutting) };
                } else {
                    item.result = calculateItemCost(item, params);
                }
                calcItems.push(item);
            } else if (ri.item_type === 'hardware') {
                const savedHardwareHours = this._num(ri.result?.hoursHardware || ri.hours_hardware);
                const hw = {
                    name: ri.product_name,
                    qty: ri.quantity,
                    assembly_speed: ri.hardware_assembly_speed || ri.assembly_speed || 60,
                    price: ri.hardware_price_per_unit || 0,
                    delivery_price: ri.hardware_delivery_per_unit || 0,
                    delivery_total: ri.hardware_delivery_total || 0,
                    sell_price: ri.sell_price_hardware || 0,
                };
                hw.result = savedHardwareHours > 0
                    ? { hoursHardware: round2(savedHardwareHours) }
                    : calculateHardwareCost(hw, params);
                calcHw.push(hw);
            } else if (ri.item_type === 'packaging') {
                const savedPackagingHours = this._num(ri.result?.hoursPackaging || ri.hours_packaging);
                const pkg = {
                    name: ri.product_name,
                    qty: ri.quantity,
                    assembly_speed: ri.packaging_assembly_speed || ri.assembly_speed || 60,
                    price: ri.packaging_price_per_unit || 0,
                    delivery_price: ri.packaging_delivery_per_unit || 0,
                    delivery_total: ri.packaging_delivery_total || 0,
                    sell_price: ri.sell_price_packaging || 0,
                };
                pkg.result = savedPackagingHours > 0
                    ? { hoursPackaging: round2(savedPackagingHours) }
                    : calculatePackagingCost(pkg, params);
                calcPkg.push(pkg);
            }
        });

        let planHoursPlastic = 0, planHoursTrim = 0, planHoursAssembly = 0, planHoursPackaging = 0;
        calcItems.forEach(item => {
            if (item.result) {
                planHoursPlastic += item.result.hoursPlastic || 0;
                planHoursTrim += item.result.hoursCutting || 0;
            }
        });
        calcHw.forEach(hw => { if (hw.result) planHoursAssembly += hw.result.hoursHardware || 0; });
        calcPkg.forEach(pkg => { if (pkg.result) planHoursPackaging += pkg.result.hoursPackaging || 0; });

        const derivedAssemblyHours = round2(planHoursAssembly);
        const derivedPackagingHours = round2(planHoursPackaging);
        const hasBlankAssemblyDriver = rawItems.some(ri =>
            (ri.item_type === 'product' && !!ri.is_blank_mold) ||
            (ri.item_type === 'hardware' && !!ri.hardware_from_template)
        );
        const savedAssemblyHours = this._num(order.production_hours_hardware);
        if (savedAssemblyHours > 0 && !hasBlankAssemblyDriver) planHoursAssembly = savedAssemblyHours;
        const savedPackagingHours = this._num(order.production_hours_packaging);
        if (savedPackagingHours > 0) planHoursPackaging = savedPackagingHours;

        const salaryProduction = round2(planHoursPlastic * (params.fotPerHour || 0));
        const salaryTrim = round2(planHoursTrim * (params.fotPerHour || 0));
        const salaryAssembly = round2(planHoursAssembly * (params.fotPerHour || 0));
        const salaryPackaging = round2(planHoursPackaging * (params.fotPerHour || 0));

        let hardwarePurchase = 0, hardwareDelivery = 0, packagingPurchase = 0, packagingDelivery = 0;
        let designPrinting = 0, plastic = 0, molds = 0, delivery = 0;

        rawItems.forEach(ri => {
            const qty = this._num(ri.quantity);
            if (qty <= 0) return;
            if (ri.item_type === 'product') {
                plastic += qty * this._num(ri.cost_plastic);
                if (!ri.is_blank_mold) molds += qty * this._num(ri.cost_mold_amortization);
                designPrinting += qty * (this._num(ri.cost_design) + this._num(ri.cost_printing));
                delivery += qty * this._num(ri.cost_delivery);
                hardwarePurchase += qty * this._num(ri.cost_nfc_tag);
            } else if (ri.item_type === 'hardware') {
                hardwarePurchase += qty * this._num(ri.hardware_price_per_unit);
                hardwareDelivery += qty * this._num(ri.hardware_delivery_per_unit);
            } else if (ri.item_type === 'packaging') {
                packagingPurchase += qty * this._num(ri.packaging_price_per_unit);
                packagingDelivery += qty * this._num(ri.packaging_delivery_per_unit);
            }
        });

        const plannedHoursTotal = planHoursPlastic + planHoursTrim + planHoursAssembly + planHoursPackaging;
        const prodIndirect = round2(plannedHoursTotal * (params.indirectPerHour || 0));

        const orderRevenue = this._num(order.total_revenue_plan);
        const orderCosts = this._num(order.total_cost_plan);
        const rowsWithoutTaxes = round2(
            round2(salaryProduction) + round2(salaryTrim) + round2(salaryAssembly) + round2(salaryPackaging) + round2(prodIndirect) +
            round2(hardwarePurchase) + round2(hardwareDelivery) + round2(packagingPurchase) + round2(packagingDelivery) +
            round2(designPrinting) + round2(plastic) + round2(molds) + round2(delivery)
        );
        const taxesByFormula = round2(orderRevenue * (this._num(params.taxRate) + this._num(params.vatRate)));
        const taxesByBalance = round2(Math.max(0, orderCosts > 0 ? (orderCosts - rowsWithoutTaxes) : 0));
        const taxes = taxesByFormula > 0 ? taxesByFormula : taxesByBalance;
        const computedTotalCosts = round2(rowsWithoutTaxes + taxes);

        return {
            planData: {
                salaryProduction: round2(salaryProduction), salaryTrim: round2(salaryTrim),
                salaryAssembly: round2(salaryAssembly), salaryPackaging: round2(salaryPackaging),
                indirectProduction: round2(prodIndirect),
                hardwareTotal: round2(hardwarePurchase + hardwareDelivery),
                packagingTotal: round2(packagingPurchase + packagingDelivery),
                designPrinting: round2(designPrinting), plastic: round2(plastic),
                molds: round2(molds), delivery: round2(delivery), taxes: round2(taxes), other: 0,
                totalCosts: orderCosts > 0 ? round2(orderCosts) : computedTotalCosts,
                revenue: orderRevenue > 0 ? round2(orderRevenue) : 0,
                planMarginPercent: this._num(order.margin_percent_plan),
                planEarned: this._num(order.total_margin_plan),
            },
            planHours: {
                hoursPlastic: round2(planHoursPlastic), hoursTrim: round2(planHoursTrim),
                hoursHardware: round2(planHoursAssembly), hoursPackaging: round2(planHoursPackaging),
            },
            planMeta: {
                salary_production: {
                    planHours: round2(planHoursPlastic),
                    source: 'derived_items',
                },
                salary_trim: {
                    planHours: round2(planHoursTrim),
                    source: 'derived_items',
                },
                salary_assembly: {
                    planHours: round2(planHoursAssembly),
                    source: hasBlankAssemblyDriver ? 'blank_norms' : (savedAssemblyHours > 0 ? 'saved_order' : 'derived_items'),
                    savedHours: round2(savedAssemblyHours),
                    derivedHours: round2(derivedAssemblyHours),
                },
                salary_packaging: {
                    planHours: round2(planHoursPackaging),
                    source: savedPackagingHours > 0 ? 'saved_order' : 'derived_items',
                    savedHours: round2(savedPackagingHours),
                    derivedHours: round2(derivedPackagingHours),
                },
                indirect_production: {
                    planHours: round2(plannedHoursTotal),
                    perHour: this._num(params.indirectPerHour),
                    source: 'hours_formula',
                    formula: 'общие плановые часы × косв./ч',
                },
            },
        };
    },

    // ==========================================
    // Auto-fact sources (same logic as before)

    // ==========================================

    _getManualOverrides(factData) {
        const raw = factData && factData._manual_overrides;
        return (raw && typeof raw === 'object') ? raw : {};
    },
    _isManualOverride(factData, key) { return !!this._getManualOverrides(factData)[key]; },
    _setManualOverride(factData, key, enabled) {
        if (!factData) return;
        const ov = this._getManualOverrides(factData);
        if (enabled) ov[key] = true; else delete ov[key];
        factData._manual_overrides = ov;
    },
    _applyAutoFactValue(factData, key, value) {
        if (!factData || this._isManualOverride(factData, key)) return;
        factData[key] = round2(this._num(value));
    },
    _isAutoFactRow(factData, key) {
        if (this.AUTO_FACT_KEYS.has(key)) return true;
        // Revenue is auto if sourced from fintablo
        if (key === 'revenue' && factData?._auto_fintablo?.fact_revenue) return true;
        return false;
    },

    async _ensureComputedOrder(orderRef) {
        const orderId = typeof orderRef === 'object' ? Number(orderRef?.id) : Number(orderRef);
        if (!Number.isFinite(orderId)) return null;

        const cached = this._orderCache[orderId];
        if (cached?.computed) return cached;

        const orderData = await loadOrder(orderId);
        if (!orderData?.order) return null;

        const params = App.params || {};
        const { order, items: rawItems } = orderData;
        const { planData, planHours, planMeta } = this._buildPlan(order, rawItems || [], params);
        const factData = { ...(await loadFactual(orderId) || {}) };

        this._applyHoursFromEntries(factData, orderId, planHours, params);
        await this._applyDerivedFacts(factData, planData, planHours, params, orderId, order.order_name || '');

        const computed = {
            ...(cached || {}),
            order,
            planData,
            planHours,
            planMeta,
            factData,
            computed: true,
        };
        this._orderCache[orderId] = computed;
        return computed;
    },

    _applyHoursFromEntries(factData, orderId, planHours = {}, params = {}) {
        const stageActuals = this._collectStageActuals(orderId, planHours, params);
        factData.fact_hours_production = round2(stageActuals.hours.casting);
        factData.fact_hours_trim = round2(stageActuals.hours.trim);
        factData.fact_hours_assembly = round2(stageActuals.hours.assembly);
        factData.fact_hours_packaging = round2(stageActuals.hours.packaging);
        factData._auto_stage_salary = stageActuals.salary;
        factData._hours_source = stageActuals.usedLegacyDistribution ? 'timetrack+legacy-stage-estimate' : 'timetrack';
        factData._legacy_stage_estimate = stageActuals.usedLegacyDistribution;
        if (stageActuals.usedLegacyDistribution) {
            this._setSourceHint(factData, 'fact_salary_production', 'часы × ставка, legacy по плану');
            this._setSourceHint(factData, 'fact_salary_trim', 'часы × ставка, legacy по плану');
            this._setSourceHint(factData, 'fact_salary_assembly', 'часы × ставка, legacy по плану');
            this._setSourceHint(factData, 'fact_salary_packaging', 'часы × ставка, legacy по плану');
            this._setSourceHint(factData, 'fact_indirect_production', 'часы × косв./ч, legacy по плану');
        }
    },

    _employeeRateByName(name, params, entry = null) {
        const fallback = params?.fotPerHour || 0;
        const employees = this._employees || [];
        let emp = null;
        const entryEmployeeId = Number(entry?.employee_id);
        if (Number.isFinite(entryEmployeeId) && entryEmployeeId > 0) {
            emp = employees.find(candidate => Number(candidate.id) === entryEmployeeId) || null;
        }
        if (!emp && name) {
            const needle = String(name || '').trim().toLowerCase();
            emp = employees.find(candidate => String(candidate.name || '').trim().toLowerCase() === needle) || null;
            if (!emp && needle) {
                emp = employees.find(candidate => {
                    const candidateName = String(candidate.name || '').trim().toLowerCase();
                    return candidateName.startsWith(needle) || needle.startsWith(candidateName);
                }) || null;
            }
        }
        if (!emp) return fallback;
        const baseSalary = this._num(emp.pay_base_salary_month);
        const baseHours = this._num(emp.pay_base_hours_month);
        if (baseSalary > 0 && baseHours > 0) return baseSalary / baseHours;
        const overtimeRate = this._num(emp.pay_overtime_hour_rate);
        if (overtimeRate > 0) return overtimeRate;
        const rate = this._num(emp.hourly_rate) || this._num(emp.hourly_cost) || this._num(emp.cost_per_hour) || this._num(emp.fot_per_hour);
        return rate > 0 ? rate : fallback;
    },

    _sumStageSalary(orderId, stage, params, planHours = {}) {
        const stageActuals = this._collectStageActuals(orderId, planHours, params);
        return round2(stageActuals.salary[stage] || 0);
    },

    async _applyDerivedFacts(factData, planData, planHours, params, orderId, orderName) {
        const hProd = parseFloat(factData.fact_hours_production) || 0;
        const hTrim = parseFloat(factData.fact_hours_trim) || 0;
        const hAsm = parseFloat(factData.fact_hours_assembly) || 0;
        const hPkg = parseFloat(factData.fact_hours_packaging) || 0;
        const totalHours = hProd + hTrim + hAsm + hPkg;
        const stageSalary = factData._auto_stage_salary || {
            casting: this._sumStageSalary(orderId, 'casting', params, planHours),
            trim: this._sumStageSalary(orderId, 'trim', params, planHours),
            assembly: this._sumStageSalary(orderId, 'assembly', params, planHours),
            packaging: this._sumStageSalary(orderId, 'packaging', params, planHours),
        };

        // 1. Salaries from time entries (per-stage)
        this._applyAutoFactValue(factData, 'fact_salary_production', stageSalary.casting);
        this._applyAutoFactValue(factData, 'fact_salary_trim', stageSalary.trim);
        this._applyAutoFactValue(factData, 'fact_salary_assembly', stageSalary.assembly);
        this._applyAutoFactValue(factData, 'fact_salary_packaging', stageSalary.packaging);

        // 2. Indirect costs from hours
        this._applyAutoFactValue(factData, 'fact_indirect_production', totalHours * (params?.indirectPerHour || 0));

        // 3. FinTablo imports — pull all available fact fields
        factData._auto_fintablo = {};
        const imports = (await loadFintabloImports(orderId)) || [];
        if (imports.length > 0) {
            const latest = [...imports].sort((a, b) => new Date(b.import_date || 0) - new Date(a.import_date || 0))[0];

            const ftMap = {
                fact_hardware: 'fact_hardware_total',
                fact_printing: 'fact_design_printing',
                fact_molds: 'fact_molds',
                fact_delivery: 'fact_delivery_client',
                fact_taxes: 'fact_taxes',
                fact_other: 'fact_other',
            };

            for (const [ftKey, ourKey] of Object.entries(ftMap)) {
                const val = this._num(latest[ftKey]);
                if (val > 0) {
                    this._applyAutoFactValue(factData, ourKey, val);
                    factData._auto_fintablo[ourKey] = true;
                }
            }

            const ftMaterials = this._num(latest.fact_materials);
            if (ftMaterials > 0) {
                const plasticBase = this._num(planData?.plastic);
                this._applyAutoFactValue(factData, 'fact_plastic', plasticBase + ftMaterials);
                factData._auto_fintablo.fact_plastic = true;
                this._setSourceHint(factData, 'fact_plastic', plasticBase > 0 ? 'план + ФинТабло' : 'ФинТабло');
            }

            const ftRevenue = this._num(latest.fact_revenue);
            if (ftRevenue > 0) {
                this._applyAutoFactValue(factData, 'fact_revenue', ftRevenue);
                factData._auto_fintablo.fact_revenue = true;
            }

            const ftPackaging = this._num(latest.fact_packaging);
            if (ftPackaging > 0) {
                this._applyAutoFactValue(factData, 'fact_packaging_total', ftPackaging);
                factData._auto_fintablo.fact_packaging_total = true;
            }
        }

        if (!this._isManualOverride(factData, 'fact_plastic') && !factData._auto_fintablo.fact_plastic && this._num(planData?.plastic) > 0) {
            this._applyAutoFactValue(factData, 'fact_plastic', planData.plastic);
            this._setSourceHint(factData, 'fact_plastic', 'план');
        }

        // 4. Warehouse fallback for hardware/packaging (only if fintablo didn't provide them)
        if (!factData._auto_fintablo.fact_hardware_total || !factData._auto_fintablo.fact_packaging_total) {
            const whActual = await this._deriveMaterialFacts(orderId, orderName);
            if (!factData._auto_fintablo.fact_hardware_total) {
                this._applyAutoFactValue(factData, 'fact_hardware_total', whActual.found ? whActual.hardware : (planData?.hardwareTotal || 0));
                this._setSourceHint(factData, 'fact_hardware_total', whActual.found ? 'склад' : 'план');
            }
            if (!factData._auto_fintablo.fact_packaging_total) {
                this._applyAutoFactValue(factData, 'fact_packaging_total', whActual.found ? whActual.packaging : (planData?.packagingTotal || 0));
                this._setSourceHint(factData, 'fact_packaging_total', whActual.found ? 'склад' : 'план');
            }
        }
    },

    async _deriveMaterialFacts
(orderId, orderName) {
        const history = (await loadWarehouseHistory()) || [];
        if (history.length === 0) return { found: false, hardware: 0, packaging: 0 };
        const items = (await loadWarehouseItems()) || [];
        const itemMap = new Map(items.map(i => [Number(i.id), i]));
        const sameOrder = (h) => {
            if (h.order_id !== undefined && h.order_id !== null && h.order_id !== '') return Number(h.order_id) === Number(orderId);
            return orderName && String(h.order_name || '').trim() === String(orderName).trim();
        };
        let hardware = 0, packaging = 0, found = false;
        history.forEach(h => {
            if (!sameOrder(h)) return;
            const type = String(h.type || '');
            if (type !== 'deduction' && type !== 'addition') return;
            const qtyChange = this._num(h.qty_change);
            if (qtyChange === 0) return;
            const unitPrice = this._num(h.unit_price) || this._num((itemMap.get(Number(h.item_id)) || {}).price_per_unit);
            const deltaCost = round2(-qtyChange * unitPrice);
            if (deltaCost === 0) return;
            const category = String(h.item_category || (itemMap.get(Number(h.item_id)) || {}).category || '').toLowerCase();
            if (category === 'packaging') packaging += deltaCost; else hardware += deltaCost;
            found = true;
        });
        return { found, hardware: round2(Math.max(0, hardware)), packaging: round2(Math.max(0, packaging)) };
    },

    _stageKey(entry) {
        const desc = String(entry?.description || '');
        const marker = desc.match(/^\[meta\](\{.*?\})\[\/meta\]\s*/);
        if (marker) { try { const p = JSON.parse(marker[1]); if (p?.stage) return p.stage; } catch (e) {} }
        if (entry?.stage) return entry.stage;
        const stageMatch = desc.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
        const label = (stageMatch?.[1] || '').toLowerCase();
        if (label.includes('вылив')) return 'casting';
        if (label.includes('литник') || label.includes('лейник') || label.includes('срез')) return 'trim';
        if (label.includes('сбор')) return 'assembly';
        if (label.includes('упаков')) return 'packaging';
        return 'other';
    },

    // ==========================================
    // Render detail accordion
    // ==========================================

    _renderDetail(orderId, container, plan, planHours, fact, order, planMeta = {}) {
    let html = '';

    const planRev = plan.revenue || 0;
    const planCost = plan.totalCosts || 0;
    const factRev = parseFloat(fact.fact_revenue) || 0;
    let factCost = 0;
    this.ROWS.forEach(r => { factCost += parseFloat(fact['fact_' + r.key]) || 0; });
    const planResult = this._calcProfitability(planRev, planCost);
    const factResult = this._calcProfitability(factRev, factCost);
    const hasFactPnL = factRev > 0 || factCost > 0;
    const revIsAuto = this._isAutoFactRow(fact, 'revenue');
    const revManual = this._isManualOverride(fact, 'fact_revenue');
    const revAutoClass = revIsAuto && !revManual ? 'fact-input-auto' : '';
    const factRevenueHint = fact._auto_fintablo?.fact_revenue
        ? (factRev > 0 && planRev > factRev ? 'получено из ФинТабло, оплата пока частичная' : 'получено из ФинТабло')
        : (revManual ? 'внесено вручную' : 'пока не внесена');

    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px">
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План расходы</span><br><b>${this.fmtRub(planCost)}</b><div class="text-muted" style="font-size:11px">из калькулятора</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт расходы</span><br><b style="color:${hasFactPnL ? (factCost > planCost * 1.15 ? 'var(--red)' : factCost > planCost ? 'var(--yellow)' : 'var(--green)') : 'var(--text-muted)'}">${hasFactPnL ? this.fmtRub(factCost) : '—'}</b><div class="text-muted" style="font-size:11px">часы + склад + ФинТабло</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План выручка</span><br><b>${this.fmtRub(planRev)}</b><div class="text-muted" style="font-size:11px">из калькулятора</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт выручка</span><br><b style="color:${hasFactPnL ? (factRev > 0 ? 'var(--green)' : 'var(--text-muted)') : 'var(--text-muted)'}">${hasFactPnL ? this.fmtRub(factRev) : '—'}</b><div class="text-muted" style="font-size:11px">${factRevenueHint}</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План прибыль</span><div style="margin-top:6px">${this._renderCompactResult(planResult)}</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт прибыль</span><div style="margin-top:6px">${this._renderCompactResult(factResult)}</div></div>
    </div>`;
    if (fact._legacy_stage_estimate) {
        html += `<div style="margin:-2px 0 10px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-muted);font-size:11px;color:var(--text-muted)">
            Legacy-часы без этапа распределены по плановым стадиям заказа, чтобы выливание/срезание/сборка отражали реальную загрузку до ручной детализации.
        </div>`;
    }

    const factHoursByRow = {
        salary_production: this._num(fact.fact_hours_production),
        salary_trim: this._num(fact.fact_hours_trim),
        salary_assembly: this._num(fact.fact_hours_assembly),
        salary_packaging: this._num(fact.fact_hours_packaging),
        indirect_production: round2(
            this._num(fact.fact_hours_production) +
            this._num(fact.fact_hours_trim) +
            this._num(fact.fact_hours_assembly) +
            this._num(fact.fact_hours_packaging)
        ),
    };

    html += '<div style="overflow-x:auto"><table class="data-table" style="width:100%;font-size:12px">';
    html += '<thead><tr><th style="text-align:left;width:35%">Статья расходов</th><th class="text-right" style="width:20%">План</th><th class="text-right" style="width:25%">Факт</th><th class="text-right" style="width:20%">Δ</th></tr></thead><tbody>';

    let planTotal = 0, factTotal = 0;
    const _isAdmin = App.isAdmin();
    this.ROWS.forEach(row => {
        const planVal = plan[row.planField] || 0;
        const factKey = 'fact_' + row.key;
        const factVal = parseFloat(fact[factKey]) || 0;
        if (row.key === 'molds' && planVal === 0 && factVal === 0) return;
        const isSalaryRow = row.key.startsWith('salary_') || row.key === 'indirect_production';
        const isAuto = this._isAutoFactRow(fact, row.key);
        const manualOverride = this._isManualOverride(fact, factKey);
        planTotal += planVal;
        factTotal += factVal;
        const delta = factVal - planVal;
        const pct = planVal > 0 ? ((delta / planVal) * 100) : 0;
        const alarm = this.getAlarm(factVal, planVal);

        const sourceHint = manualOverride ? 'вручную' : this._getRowSourceHint(fact, factKey, row.hint);
        const planDetail = this._renderPlanRowDetail(row.key, planMeta);
        const factDetail = this._renderFactRowDetail(row.key, factHoursByRow, planMeta);

        if (isSalaryRow && !_isAdmin) {
            return;
        }
        html += `<tr style="${alarm.bgStyle}">
            <td style="padding:6px 8px;font-weight:500">${row.label} <span class="text-muted" style="font-size:10px">${sourceHint}</span></td>
            <td class="text-right" style="padding:6px 8px;color:var(--text-muted)">
                <div>${this.fmtRub(planVal)}</div>
                ${planDetail ? `<div class="text-muted" style="font-size:11px;margin-top:2px;line-height:1.35">${planDetail}</div>` : ''}
            </td>
            <td class="text-right" style="padding:6px 4px">
                <input type="text" inputmode="decimal" value="${factVal || ''}"
                    class="fact-input ${isAuto && !manualOverride ? 'fact-input-auto' : ''}"
                    oninput="Factual.onFactInput(${orderId}, '${row.key}', this.value)">
                ${factDetail ? `<div class="text-muted" style="font-size:11px;margin-top:2px;line-height:1.35;text-align:right;padding-right:4px">${factDetail}</div>` : ''}
            </td>
            <td class="text-right" style="padding:6px 8px;font-weight:600;color:${alarm.color}">
                ${factVal > 0 ? alarm.icon + ' ' + this.fmtDelta(delta, pct) : '<span class="text-muted">—</span>'}
            </td>
        </tr>`;
    });

    const planTotalRows = round2(planTotal);
    const planTotalBase = round2(plan.totalCosts || planTotalRows);
    const hasPlanDrift = Math.abs(planTotalRows - planTotalBase) > 0.01;
    const tDelta = factTotal - planTotalBase;
    const tPct = planTotalBase > 0 ? (tDelta / planTotalBase) * 100 : 0;
    const tAlarm = this.getAlarm(factTotal, planTotalBase);
    html += `<tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg-muted)">
        <td style="padding:8px">ИТОГО расходы</td>
        <td class="text-right" style="padding:8px">${this.fmtRub(planTotalBase)}</td>
        <td class="text-right" style="padding:8px">${factTotal > 0 ? this.fmtRub(factTotal) : '—'}</td>
        <td class="text-right" style="padding:8px;color:${tAlarm.color}">${factTotal > 0 ? tAlarm.icon + ' ' + this.fmtDelta(tDelta, tPct) : '—'}</td>
    </tr>`;
    if (hasPlanDrift) {
        html += `<tr style="background:var(--bg)">
            <td colspan="4" style="padding:6px 8px;font-size:11px;color:var(--text-muted)">
                Пересчитанные статьи дают ${this.fmtRub(planTotalRows)}, но сохраненный план заказа равен ${this.fmtRub(planTotalBase)}. ИТОГО использует сохраненный план заказа.
            </td>
        </tr>`;
    }
    html += '</tbody></table></div>';

    html += `<div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--card-bg)">
        <div style="font-weight:700;margin-bottom:8px">Выручка и деньги по сделке</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end">
            <div>
                <div class="text-muted" style="font-size:11px;margin-bottom:6px">Факт выручка</div>
                <input type="text" inputmode="decimal" value="${factRev || ''}"
                    class="fact-input ${revAutoClass}" style="max-width:220px;font-weight:600"
                    oninput="Factual.onFactInput(${orderId}, 'revenue', this.value)">
            </div>
            <div class="text-muted" style="font-size:11px;line-height:1.5">
                Факт выручка = деньги, которые реально пришли по этой сделке. ${fact._auto_fintablo?.fact_revenue ? 'Сейчас значение приходит из ФинТабло.' : 'Сейчас значение можно ввести вручную.'}
                ${fact._auto_fintablo?.fact_revenue ? ' Пока клиент оплатил не все, фактическая прибыльность может выглядеть хуже плана — это нормально.' : ''}
            </div>
        </div>
    </div>`;

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px">';
    this.HOUR_ROWS.forEach(row => {
        const pv = planHours[row.planField] || 0;
        const fv = parseFloat(fact['fact_' + row.key]) || 0;
        const d = fv - pv;
        const a = fv > 0 ? this.getAlarm(fv, pv) : { color: 'var(--text-muted)', icon: '' };
        html += `<div class="fact-mini-stat">
            <span class="text-muted" style="font-size:10px">${row.label}</span><br>
            <span class="text-muted" style="font-size:11px">план ${pv.toFixed(1)}ч</span>
            <span style="font-weight:600"> → ${fv > 0 ? fv.toFixed(1) + 'ч' : '—'}</span>
            ${fv > 0 ? `<span style="font-size:11px;color:${a.color}"> ${a.icon}${d >= 0 ? '+' : ''}${d.toFixed(1)}</span>` : ''}
        </div>`;
    });
    html += '</div>';

    html += `<div style="margin-top:12px;display:flex;gap:12px;align-items:flex-start">
        <textarea class="form-control" rows="2" style="flex:1;font-size:12px"
            placeholder="Комментарий..." oninput="Factual.onNotesChange(${orderId}, this.value)">${this._esc(fact.notes || '')}</textarea>
        <button class="btn btn-success" onclick="Factual.saveFact(${orderId})">💾 Сохранить</button>
    </div>`;

    container.innerHTML = html;
},

// ==========================================
// User input handlers

    // ==========================================

    onFactInput(orderId, key, value) {
        const cached = this._orderCache[orderId];
        if (!cached) return;
        const num = parseFloat(value.replace(/\s/g, '').replace(',', '.')) || 0;
        if (key === 'revenue') {
            cached.factData.fact_revenue = num;
            this._setManualOverride(cached.factData, 'fact_revenue', true);
        } else {
            cached.factData['fact_' + key] = num;
            this._setManualOverride(cached.factData, 'fact_' + key, true);
        }
        clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => {
            const container = document.getElementById('fact-detail-' + orderId);
            if (container && cached) {
                this._renderDetail(orderId, container, cached.planData, cached.planHours, cached.factData, cached.order, cached.planMeta || {});
            }
        }, 500);
    },

    onNotesChange(orderId, value) {
        const cached = this._orderCache[orderId];
        if (cached) cached.factData.notes = value;
    },

    async saveFact(orderId) {
        const cached = this._orderCache[orderId];
        if (!cached) { App.toast('Данные не загружены'); return; }

        let factTotal = 0;
        this.ROWS.forEach(row => { factTotal += parseFloat(cached.factData['fact_' + row.key]) || 0; });
        cached.factData.fact_total = round2(factTotal);
        cached.factData.updated_by = document.getElementById('calc-manager-name')?.value || '';

        await saveFactual(orderId, cached.factData);
        App.toast('Сохранено: ' + (cached.order.order_name || ''));

        await this._renderGlobalStats();
        // Update summary in table
        this._loadFactSummaries();
    },

    // ==========================================
    // Alarm & formatting
    // ==========================================

    getAlarm(factVal, planVal) {
        if (factVal <= 0) return { color: 'var(--text-muted)', icon: '', bgStyle: '' };
        if (planVal <= 0) return { color: 'var(--text-muted)', icon: '\u2014', bgStyle: '' };
        const ratio = factVal / planVal;
        if (ratio <= 1.0) return { color: 'var(--green)', icon: '\u2713', bgStyle: '' };
        if (ratio <= 1.15) return { color: 'var(--yellow)', icon: '\u26A0', bgStyle: 'background:rgba(255,193,7,0.05)' };
        return { color: 'var(--red)', icon: '\u2717', bgStyle: 'background:rgba(220,53,69,0.05)' };
    },

    fmtRub(n) {
        if (!n && n !== 0) return '0 \u20BD';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' \u20BD';
    },

    fmtDelta(delta, pct) {
        const sign = delta >= 0 ? '+' : '';
        return sign + new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(delta)) +
            ' \u20BD (' + sign + pct.toFixed(0) + '%)';
    },
    fmtHours(n) {
        const num = this._num(n);
        if (Math.abs(num) < 0.005) return '0ч';
        const fractionDigits = Number.isInteger(num) ? 0 : (Math.abs(num * 10 - Math.round(num * 10)) < 0.001 ? 1 : 2);
        return new Intl.NumberFormat('ru-RU', {
            minimumFractionDigits: 0,
            maximumFractionDigits: fractionDigits,
        }).format(round2(num)) + 'ч';
    },
    _renderPlanRowDetail(rowKey, planMeta = {}) {
        const meta = planMeta?.[rowKey];
        if (!meta) return '';
        if (rowKey === 'indirect_production') {
            return `${this.fmtHours(meta.planHours)} × ${this.fmtRub(meta.perHour || 0)}/ч`;
        }
        if (!rowKey.startsWith('salary_')) return '';
        let detail = this.fmtHours(meta.planHours);
        if (meta.source === 'blank_norms') {
            detail += ' • по текущим бланкам';
            if (this._num(meta.savedHours) > 0 && Math.abs(this._num(meta.savedHours) - this._num(meta.planHours)) > 0.05) {
                detail += `<br>в заказе было: ${this.fmtHours(meta.savedHours)}`;
            }
            return detail;
        }
        if (meta.source === 'saved_order') {
            detail += ' • сохранено в заказе';
            if (Math.abs(this._num(meta.derivedHours) - this._num(meta.planHours)) > 0.05) {
                detail += `<br>по текущим строкам: ${this.fmtHours(meta.derivedHours)}`;
            }
        }
        return detail;
    },
    _renderFactRowDetail(rowKey, factHoursByRow = {}, planMeta = {}) {
        const factHours = this._num(factHoursByRow?.[rowKey]);
        if (factHours <= 0) return '';
        if (rowKey === 'indirect_production') {
            return `${this.fmtHours(factHours)} × ${this.fmtRub(planMeta?.indirect_production?.perHour || 0)}/ч`;
        }
        if (!rowKey.startsWith('salary_')) return '';
        return this.fmtHours(factHours);
    },

    _esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

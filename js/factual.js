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
        { key: 'plastic',             label: 'Пластик',          planField: 'plastic',          hint: 'вручную' },
        { key: 'molds',               label: 'Молды',            planField: 'molds',            hint: 'вручную' },
        { key: 'delivery_client',     label: 'Доставка',         planField: 'delivery',         hint: 'вручную' },
        { key: 'taxes',               label: 'Налоги',           planField: 'taxes',            hint: 'балансом' },
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
    ]),

    _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },

    // ==========================================
    // Load
    // ==========================================

    async load() {
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
        const countEl = document.getElementById('fact-stat-orders');
        const planEl = document.getElementById('fact-stat-plan-margin');
        const factEl = document.getElementById('fact-stat-fact-margin');
        const deltaEl = document.getElementById('fact-stat-earned-delta');
        if (!countEl) return;

        countEl.textContent = String(orders.length);

        const completed = orders.filter(o => o.status === 'completed');
        const planAvg = completed.length
            ? round2(completed.reduce((s, o) => s + (parseFloat(o.margin_percent_plan) || 0), 0) / completed.length)
            : 0;
        planEl.textContent = completed.length ? `${planAvg}%` : '—';

        const factuals = await Promise.all(completed.map(o => loadFactual(o.id)));
        let factMargins = [];
        let earnedDelta = 0;
        completed.forEach((o, idx) => {
            const f = factuals[idx];
            if (!f) return;
            const planRevenue = parseFloat(o.total_revenue_plan) || 0;
            const planCosts = parseFloat(o.total_cost_plan) || 0;
            const planEarned = planRevenue - planCosts;
            const factRevenue = parseFloat(f.fact_revenue) || 0;
            let factCosts = 0;
            this.ROWS.forEach(r => { factCosts += parseFloat(f['fact_' + r.key]) || 0; });
            if (factRevenue > 0) {
                factMargins.push(round2((factRevenue - factCosts) * 100 / factRevenue));
                earnedDelta += (factRevenue - factCosts) - planEarned;
            }
        });
        const factAvg = factMargins.length ? round2(factMargins.reduce((s, v) => s + v, 0) / factMargins.length) : 0;
        factEl.textContent = factMargins.length ? `${factAvg}%` : '—';
        deltaEl.textContent = `${earnedDelta >= 0 ? '+' : ''}${this.fmtRub(earnedDelta)}`;
        deltaEl.style.color = earnedDelta >= 0 ? 'var(--green)' : 'var(--red)';
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
            tbody.innerHTML = '<tr><td colspan="8" class="text-muted text-center" style="padding:24px">Нет заказов за выбранный период</td></tr>';
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
                <td colspan="8" style="padding:10px 8px 6px;font-weight:700;font-size:13px;color:${sec.color};border-bottom:2px solid ${sec.color};background:var(--bg)">
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
        const rev = this._num(o.total_revenue_plan);
        const cost = this._num(o.total_cost_plan);
        const margin = rev > 0 ? round2((rev - cost) * 100 / rev) : 0;
        const marginColor = margin >= 30 ? 'var(--green)' : margin >= 20 ? 'var(--yellow)' : 'var(--red)';
        const status = this.STATUS_LABELS[o.status] || o.status;
        const isOpen = this._openOrderId === o.id;

        let html = `<tr class="fact-order-row ${isOpen ? 'fact-row-open' : ''}" onclick="Factual.toggleDetail(${o.id})" style="cursor:pointer">
            <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(o.order_name || '—')}</td>
            <td><span class="fact-status-badge">${status}</span></td>
            <td class="text-right text-muted">${this.fmtRub(cost)}</td>
            <td class="text-right" id="fact-row-fcost-${o.id}"><span class="text-muted">—</span></td>
            <td class="text-right text-muted">${this.fmtRub(rev)}</td>
            <td class="text-right" style="color:${marginColor};font-weight:600">${margin}%</td>
            <td class="text-right" id="fact-row-fmargin-${o.id}"><span class="text-muted">—</span></td>
            <td style="text-align:center;font-size:12px">${isOpen ? '▼' : '▶'}</td>
        </tr>`;
        html += `<tr id="fact-detail-row-${o.id}" class="fact-detail-row" style="${isOpen ? '' : 'display:none'}">
            <td colspan="8" style="padding:0;background:var(--bg)">
                <div id="fact-detail-${o.id}" style="padding:16px"></div>
            </td>
        </tr>`;
        return html;
    },

    async _loadFactSummaries() {
        for (const o of this._filteredOrders) {
            const f = await loadFactual(o.id);
            if (!f) continue;

            const factRevenue = parseFloat(f.fact_revenue) || 0;
            let factCosts = 0;
            this.ROWS.forEach(r => { factCosts += parseFloat(f['fact_' + r.key]) || 0; });

            const costEl = document.getElementById('fact-row-fcost-' + o.id);
            const marginEl = document.getElementById('fact-row-fmargin-' + o.id);

            if (costEl && factCosts > 0) {
                const planCost = this._num(o.total_cost_plan);
                const alarm = this.getAlarm(factCosts, planCost);
                costEl.innerHTML = `<span style="color:${alarm.color};font-weight:500">${this.fmtRub(factCosts)}</span>`;
            }
            if (marginEl && factRevenue > 0 && factCosts > 0) {
                const factMargin = round2((factRevenue - factCosts) * 100 / factRevenue);
                const mc = factMargin >= 30 ? 'var(--green)' : factMargin >= 20 ? 'var(--yellow)' : 'var(--red)';
                marginEl.innerHTML = `<span style="color:${mc};font-weight:600">${factMargin}%</span>`;
            }
        }
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

        const orderData = await loadOrder(orderId);
        if (!orderData) {
            container.innerHTML = '<p class="text-muted">Заказ не найден</p>';
            return;
        }

        const { order, items: rawItems } = orderData;
        const params = App.params || {};
        const { planData, planHours } = this._buildPlan(order, rawItems, params);
        const factData = await loadFactual(orderId) || {};

        // Apply auto facts
        this._applyHoursFromEntries(factData, orderId);
        await this._applyDerivedFacts(factData, planData, params, orderId, order.order_name || '');

        // Cache for save
        this._orderCache[orderId] = { order, planData, planHours, factData };

        this._renderDetail(orderId, container, planData, planHours, factData, order);
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
                    complex_design: ri.complex_design || false, is_blank_mold: ri.is_blank_mold || false,
                    is_nfc: ri.is_nfc || false, nfc_programming: ri.nfc_programming || false,
                    delivery_included: ri.delivery_included || false,
                    printings: ri.printings ? (typeof ri.printings === 'string' ? JSON.parse(ri.printings) : ri.printings) : [],
                    sell_price_item: ri.sell_price_item || 0, sell_price_printing: ri.sell_price_printing || 0,
                    product_name: ri.product_name, template_id: ri.template_id || null,
                    builtin_hw_name: ri.builtin_hw_name || '', builtin_hw_price: ri.builtin_hw_price || 0,
                    builtin_hw_delivery_total: ri.builtin_hw_delivery_total || 0, builtin_hw_speed: ri.builtin_hw_speed || 0,
                };
                item.result = calculateItemCost(item, params);
                calcItems.push(item);
            } else if (ri.item_type === 'hardware') {
                const hw = { name: ri.product_name, qty: ri.quantity, assembly_speed: ri.hardware_assembly_speed || 60,
                    price: ri.hardware_price_per_unit || 0, delivery_price: ri.hardware_delivery_per_unit || 0,
                    delivery_total: ri.hardware_delivery_total || 0, sell_price: ri.sell_price_hardware || 0 };
                hw.result = calculateHardwareCost(hw, params);
                calcHw.push(hw);
            } else if (ri.item_type === 'packaging') {
                const pkg = { name: ri.product_name, qty: ri.quantity, assembly_speed: ri.packaging_assembly_speed || 60,
                    price: ri.packaging_price_per_unit || 0, delivery_price: ri.packaging_delivery_per_unit || 0,
                    delivery_total: ri.packaging_delivery_total || 0, sell_price: ri.sell_price_packaging || 0 };
                pkg.result = calculatePackagingCost(pkg, params);
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

        const salaryProduction = round2(planHoursPlastic * (params.fotPerHour || 0));
        const salaryTrim = round2(planHoursTrim * (params.fotPerHour || 0));
        const salaryAssembly = round2(planHoursAssembly * (params.fotPerHour || 0));
        const salaryPackaging = round2(planHoursPackaging * (params.fotPerHour || 0));

        let hardwarePurchase = 0, hardwareDelivery = 0, packagingPurchase = 0, packagingDelivery = 0;
        let designPrinting = 0, plastic = 0, molds = 0, delivery = 0, prodIndirect = 0;

        rawItems.forEach(ri => {
            const qty = this._num(ri.quantity);
            if (qty <= 0) return;
            if (ri.item_type === 'product') {
                prodIndirect += qty * (this._num(ri.cost_indirect) + this._num(ri.cost_cutting_indirect) + this._num(ri.cost_nfc_indirect));
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
        if (prodIndirect <= 0) prodIndirect = round2(plannedHoursTotal * (params.indirectPerHour || 0));

        const orderRevenue = this._num(order.total_revenue_plan);
        const orderCosts = this._num(order.total_cost_plan);
        const rowsWithoutTaxes = round2(
            round2(salaryProduction) + round2(salaryTrim) + round2(salaryAssembly) + round2(salaryPackaging) + round2(prodIndirect) +
            round2(hardwarePurchase) + round2(hardwareDelivery) + round2(packagingPurchase) + round2(packagingDelivery) +
            round2(designPrinting) + round2(plastic) + round2(molds) + round2(delivery)
        );
        const taxes = round2(Math.max(0, orderCosts > 0 ? (orderCosts - rowsWithoutTaxes) : 0));

        return {
            planData: {
                salaryProduction: round2(salaryProduction), salaryTrim: round2(salaryTrim),
                salaryAssembly: round2(salaryAssembly), salaryPackaging: round2(salaryPackaging),
                indirectProduction: round2(prodIndirect),
                hardwareTotal: round2(hardwarePurchase + hardwareDelivery),
                packagingTotal: round2(packagingPurchase + packagingDelivery),
                designPrinting: round2(designPrinting), plastic: round2(plastic),
                molds: round2(molds), delivery: round2(delivery), taxes: round2(taxes),
                totalCosts: orderCosts > 0 ? round2(orderCosts) : round2(rowsWithoutTaxes + taxes),
                revenue: orderRevenue > 0 ? round2(orderRevenue) : 0,
                planMarginPercent: this._num(order.margin_percent_plan),
                planEarned: this._num(order.total_margin_plan),
            },
            planHours: {
                hoursPlastic: round2(planHoursPlastic), hoursTrim: round2(planHoursTrim),
                hoursHardware: round2(planHoursAssembly), hoursPackaging: round2(planHoursPackaging),
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
        if (key === 'design_printing' && factData && factData._auto_printing_from_import) return true;
        return false;
    },

    _applyHoursFromEntries(factData, orderId) {
        const entries = (this._entries || []).filter(e => Number(e.order_id) === Number(orderId));
        let casting = 0, trim = 0, assembly = 0, packaging = 0;
        entries.forEach(e => {
            const stage = this._stageKey(e);
            const h = parseFloat(e.hours) || 0;
            if (stage === 'casting') casting += h;
            else if (stage === 'trim') trim += h;
            else if (stage === 'assembly') assembly += h;
            else if (stage === 'packaging') packaging += h;
        });
        factData.fact_hours_production = round2(casting);
        factData.fact_hours_trim = round2(trim);
        factData.fact_hours_assembly = round2(assembly);
        factData.fact_hours_packaging = round2(packaging);
        factData._hours_source = 'timetrack';
    },

    _employeeRateByName(name, params) {
        const fallback = params?.fotPerHour || 0;
        if (!name) return fallback;
        const emp = (this._employees || []).find(e => String(e.name || '').trim() === String(name || '').trim());
        if (!emp) return fallback;
        const baseSalary = this._num(emp.pay_base_salary_month);
        const baseHours = this._num(emp.pay_base_hours_month);
        if (baseSalary > 0 && baseHours > 0) return baseSalary / baseHours;
        const overtimeRate = this._num(emp.pay_overtime_hour_rate);
        if (overtimeRate > 0) return overtimeRate;
        const rate = this._num(emp.hourly_rate) || this._num(emp.hourly_cost) || this._num(emp.cost_per_hour) || this._num(emp.fot_per_hour);
        return rate > 0 ? rate : fallback;
    },

    _sumStageSalary(orderId, stage, params) {
        const entries = (this._entries || []).filter(e => Number(e.order_id) === Number(orderId) && this._stageKey(e) === stage);
        let total = 0;
        entries.forEach(e => {
            const hours = parseFloat(e.hours) || 0;
            if (hours > 0) total += hours * this._employeeRateByName(e.worker_name, params);
        });
        return round2(total);
    },

    async _applyDerivedFacts(factData, planData, params, orderId, orderName) {
        const hProd = parseFloat(factData.fact_hours_production) || 0;
        const hTrim = parseFloat(factData.fact_hours_trim) || 0;
        const hAsm = parseFloat(factData.fact_hours_assembly) || 0;
        const hPkg = parseFloat(factData.fact_hours_packaging) || 0;
        const totalHours = hProd + hTrim + hAsm + hPkg;

        this._applyAutoFactValue(factData, 'fact_salary_production', this._sumStageSalary(orderId, 'casting', params));
        this._applyAutoFactValue(factData, 'fact_salary_trim', this._sumStageSalary(orderId, 'trim', params));
        this._applyAutoFactValue(factData, 'fact_salary_assembly', this._sumStageSalary(orderId, 'assembly', params));
        this._applyAutoFactValue(factData, 'fact_salary_packaging', this._sumStageSalary(orderId, 'packaging', params));
        this._applyAutoFactValue(factData, 'fact_indirect_production', totalHours * (params?.indirectPerHour || 0));

        factData._auto_printing_from_import = false;
        const imports = (await loadFintabloImports(orderId)) || [];
        if (imports.length > 0) {
            const latest = [...imports].sort((a, b) => new Date(b.import_date || 0) - new Date(a.import_date || 0))[0];
            const importedPrinting = this._num(latest && latest.fact_printing);
            if (importedPrinting > 0) {
                this._applyAutoFactValue(factData, 'fact_design_printing', importedPrinting);
                factData._auto_printing_from_import = true;
            }
        }

        const whActual = await this._deriveMaterialFacts(orderId, orderName);
        this._applyAutoFactValue(factData, 'fact_hardware_total', whActual.found ? whActual.hardware : (planData?.hardwareTotal || 0));
        this._applyAutoFactValue(factData, 'fact_packaging_total', whActual.found ? whActual.packaging : (planData?.packagingTotal || 0));
    },

    async _deriveMaterialFacts(orderId, orderName) {
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

    _renderDetail(orderId, container, plan, planHours, fact, order) {
        let html = '';

        // Summary cards
        const planRev = plan.revenue || 0;
        const planCost = plan.totalCosts || 0;
        const factRev = parseFloat(fact.fact_revenue) || 0;
        let factCost = 0;
        this.ROWS.forEach(r => { factCost += parseFloat(fact['fact_' + r.key]) || 0; });
        const planMargin = planRev > 0 ? round2((planRev - planCost) * 100 / planRev) : 0;
        const factMargin = factRev > 0 ? round2((factRev - factCost) * 100 / factRev) : 0;

        html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:12px">
            <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План расх.</span><br><b>${this.fmtRub(planCost)}</b></div>
            <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт расх.</span><br><b style="color:${factCost > planCost * 1.15 ? 'var(--red)' : factCost > planCost ? 'var(--yellow)' : 'var(--green)'}">${factCost > 0 ? this.fmtRub(factCost) : '—'}</b></div>
            <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План маржа</span><br><b>${planMargin}%</b></div>
            <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт маржа</span><br><b style="color:${factRev > 0 ? (factMargin >= planMargin ? 'var(--green)' : 'var(--red)') : ''}">${factRev > 0 ? factMargin + '%' : '—'}</b></div>
        </div>`;

        // Cost table
        html += '<div style="overflow-x:auto"><table class="data-table" style="width:100%;font-size:12px">';
        html += '<thead><tr><th style="text-align:left;width:35%">Статья</th><th class="text-right" style="width:20%">План</th><th class="text-right" style="width:25%">Факт</th><th class="text-right" style="width:20%">Δ</th></tr></thead><tbody>';

        let planTotal = 0, factTotal = 0;
        this.ROWS.forEach(row => {
            const planVal = plan[row.planField] || 0;
            const factKey = 'fact_' + row.key;
            const factVal = parseFloat(fact[factKey]) || 0;
            if (row.key === 'molds' && planVal === 0 && factVal === 0) return;
            const isAuto = this._isAutoFactRow(fact, row.key);
            const manualOverride = this._isManualOverride(fact, factKey);
            planTotal += planVal;
            factTotal += factVal;
            const delta = factVal - planVal;
            const pct = planVal > 0 ? ((delta / planVal) * 100) : 0;
            const alarm = this.getAlarm(factVal, planVal);

            html += `<tr style="${alarm.bgStyle}">
                <td style="padding:6px 8px;font-weight:500">${row.label} <span class="text-muted" style="font-size:10px">${row.hint}</span></td>
                <td class="text-right" style="padding:6px 8px;color:var(--text-muted)">${this.fmtRub(planVal)}</td>
                <td class="text-right" style="padding:6px 4px">
                    <input type="text" inputmode="decimal" value="${factVal || ''}"
                        class="fact-input ${isAuto && !manualOverride ? 'fact-input-auto' : ''}"
                        oninput="Factual.onFactInput(${orderId}, '${row.key}', this.value)">
                </td>
                <td class="text-right" style="padding:6px 8px;font-weight:600;color:${alarm.color}">
                    ${factVal > 0 ? alarm.icon + ' ' + this.fmtDelta(delta, pct) : '<span class="text-muted">—</span>'}
                </td>
            </tr>`;
        });

        // Total
        const tDelta = factTotal - planTotal;
        const tPct = planTotal > 0 ? (tDelta / planTotal) * 100 : 0;
        const tAlarm = this.getAlarm(factTotal, planTotal);
        html += `<tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg-muted)">
            <td style="padding:8px">ИТОГО</td>
            <td class="text-right" style="padding:8px">${this.fmtRub(planTotal)}</td>
            <td class="text-right" style="padding:8px">${factTotal > 0 ? this.fmtRub(factTotal) : '—'}</td>
            <td class="text-right" style="padding:8px;color:${tAlarm.color}">${factTotal > 0 ? tAlarm.icon + ' ' + this.fmtDelta(tDelta, tPct) : '—'}</td>
        </tr>`;

        // Revenue
        const planRevenue = plan.revenue || 0;
        const factRevenue = parseFloat(fact.fact_revenue) || 0;
        html += `<tr style="background:var(--green-light)">
            <td style="padding:8px;font-weight:700">Выручка</td>
            <td class="text-right" style="padding:8px;color:var(--green);font-weight:600">${this.fmtRub(planRevenue)}</td>
            <td class="text-right" style="padding:8px 4px">
                <input type="text" inputmode="decimal" value="${factRevenue || ''}"
                    class="fact-input" style="font-weight:600"
                    oninput="Factual.onFactInput(${orderId}, 'revenue', this.value)">
            </td>
            <td class="text-right" style="padding:8px"></td>
        </tr>`;
        html += '</tbody></table></div>';

        // Hours grid
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

        // Notes + Save
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
        } else {
            cached.factData['fact_' + key] = num;
            this._setManualOverride(cached.factData, 'fact_' + key, true);
        }
        clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => {
            const container = document.getElementById('fact-detail-' + orderId);
            if (container && cached) {
                this._renderDetail(orderId, container, cached.planData, cached.planHours, cached.factData, cached.order);
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

    _esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

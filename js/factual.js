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
    _periodKind: 'month',
    _periodAnchor: null,
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
        { key: 'hardware_total',      label: 'Фурнитура',        planField: 'hardwareTotal',    hint: 'склад или план' },
        { key: 'nfc_total',           label: 'NFC',              planField: 'nfcTotal',         hint: 'склад или план' },
        { key: 'packaging_total',     label: 'Упаковка',         planField: 'packagingTotal',   hint: 'склад или план' },
        { key: 'design_printing',     label: 'Нанесение',        planField: 'designPrinting',   hint: 'FinTablo / вруч.' },
        { key: 'plastic',             label: 'Пластик / материалы', planField: 'plastic',       hint: 'план + ФинТабло / вруч.' },
        { key: 'molds',               label: 'Молды',            planField: 'molds',            hint: 'FinTablo / вруч.' },
        { key: 'delivery_client',     label: 'Доставка',         planField: 'delivery',         hint: 'вручную' },
        { key: 'taxes',               label: 'Налоги',            planField: 'taxes',            hint: 'калькулятор / ФинТабло' },
        { key: 'commercial',          label: 'Коммерческий отдел', planField: 'commercial',     hint: '6.5% от выручки' },
        { key: 'charity',             label: 'Благотворительность', planField: 'charity',       hint: '1% / ФинТабло' },
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
        'indirect_production', 'hardware_total', 'nfc_total', 'packaging_total',
        'design_printing', 'plastic', 'molds', 'delivery_client', 'taxes', 'commercial', 'charity', 'other',
    ]),

    _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },
    _planItemCost(item, ...keys) {
        for (const key of keys) {
            const value = this._num(item?.[key]);
            if (value !== 0) return value;
        }
        return 0;
    },
    _planItemHours(item, ...keys) {
        for (const key of keys) {
            const value = this._num(item?.[key]);
            if (value > 0) return value;
        }
        return 0;
    },
    _makePlanDedupKey(item) {
        if (!item || !item.item_type) return null;
        if (item.item_type === 'hardware') {
            return [
                'hardware',
                item.product_name || '',
                this._num(item.quantity),
                this._num(item.hardware_price_per_unit),
                this._num(item.hardware_delivery_per_unit),
                item.hardware_warehouse_sku || '',
                item.hardware_source || '',
                item.hardware_parent_item_index ?? '',
            ].join('|');
        }
        if (item.item_type === 'packaging') {
            return [
                'packaging',
                item.product_name || '',
                this._num(item.quantity),
                this._num(item.packaging_price_per_unit),
                this._num(item.packaging_delivery_per_unit),
                item.packaging_warehouse_sku || '',
                item.packaging_source || '',
                item.packaging_parent_item_index ?? '',
            ].join('|');
        }
        return null;
    },
    _dedupePlanItems(rawItems = []) {
        const seen = new Set();
        return (rawItems || []).filter(item => {
            const key = this._makePlanDedupKey(item);
            if (!key) return true;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },
    _collectWarehouseDemandRows(items = [], allItems = []) {
        if (window.Warehouse && typeof window.Warehouse._collectWarehouseDemandFromOrderItems === 'function') {
            const previousItems = window.Warehouse.allItems;
            try {
                if ((!window.Warehouse.allItems || !window.Warehouse.allItems.length) && Array.isArray(allItems) && allItems.length) {
                    window.Warehouse.allItems = allItems;
                }
                const rows = window.Warehouse._collectWarehouseDemandFromOrderItems(items || []) || [];
                return Array.isArray(rows) ? rows : [];
            } finally {
                if (previousItems !== undefined) window.Warehouse.allItems = previousItems;
            }
        }

        const grouped = new Map();
        const explicitHardwareWarehouseIds = new Set();
        const addDemandRow = (itemId, qty, name, materialType = 'hardware', attachmentType = '') => {
            const normalizedItemId = Number(itemId || 0);
            const normalizedQty = parseFloat(qty) || 0;
            if (!normalizedItemId || normalizedQty <= 0) return;

            const key = String(normalizedItemId);
            const prev = grouped.get(key);
            const normalizedName = name || '';
            if (!prev) {
                grouped.set(key, {
                    warehouse_item_id: normalizedItemId,
                    qty: normalizedQty,
                    names: normalizedName ? [normalizedName] : [],
                    material_type: materialType,
                    attachment_type: attachmentType || '',
                });
                return;
            }

            prev.qty += normalizedQty;
            if (normalizedName && !prev.names.includes(normalizedName)) prev.names.push(normalizedName);
            if (prev.material_type !== materialType) prev.material_type = 'mixed';
            if (attachmentType && prev.attachment_type !== attachmentType) prev.attachment_type = attachmentType;
            grouped.set(key, prev);
        };

        (items || []).forEach(item => {
            const itemType = String(item.item_type || '').toLowerCase();
            if (itemType !== 'hardware') return;
            const src = String(item.source || item.hardware_source || '').toLowerCase();
            const itemId = Number(item.warehouse_item_id ?? item.hardware_warehouse_item_id ?? 0);
            const qty = parseFloat(item.quantity ?? item.hardware_qty ?? item.qty ?? 0) || 0;
            if (src === 'warehouse' && itemId && qty > 0) explicitHardwareWarehouseIds.add(itemId);
        });

        (items || []).forEach(item => {
            const itemType = String(item.item_type || '').toLowerCase();
            if (itemType === 'pendant' && typeof getPendantWarehouseDemandRows === 'function') {
                (getPendantWarehouseDemandRows(item) || []).forEach(row => {
                    addDemandRow(row.warehouse_item_id, row.qty, row.name, row.material_type || 'hardware', row.attachment_type || '');
                });
                return;
            }

            if (itemType === 'product' && typeof getProductWarehouseDemandRows === 'function') {
                (getProductWarehouseDemandRows(item, allItems || []) || []).forEach(row => {
                    if (explicitHardwareWarehouseIds.has(Number(row.warehouse_item_id || 0))) return;
                    addDemandRow(row.warehouse_item_id, row.qty, row.name, row.material_type || 'hardware', row.attachment_type || '');
                });
                return;
            }

            const isHardware = itemType === 'hardware';
            const isPackaging = itemType === 'packaging';
            if (!isHardware && !isPackaging) return;

            const src = String(
                item.source
                || (isHardware ? item.hardware_source : item.packaging_source)
                || ''
            ).toLowerCase();
            if (src !== 'warehouse') return;

            const itemId = Number(
                item.warehouse_item_id
                ?? (isHardware ? item.hardware_warehouse_item_id : item.packaging_warehouse_item_id)
                ?? 0
            );
            const qty = parseFloat(
                item.quantity
                ?? (isHardware ? item.hardware_qty : item.packaging_qty)
                ?? item.qty
                ?? 0
            ) || 0;
            const name = item.product_name || item.name || '';
            addDemandRow(itemId, qty, name, isPackaging ? 'packaging' : 'hardware', item.attachment_type || '');
        });

        return Array.from(grouped.values());
    },
    _isNfcWarehouseRow(row = {}, warehouseItem = null) {
        const attachmentType = String(row?.attachment_type || '').trim().toLowerCase();
        if (attachmentType === 'nfc') return true;
        const candidates = [
            row?.warehouse_sku,
            row?.sku,
            warehouseItem?.sku,
            row?.name,
            Array.isArray(row?.names) ? row.names.join(' ') : '',
            row?.product_name,
            warehouseItem?.name,
        ];
        return candidates.some(value => {
            const normalized = String(value || '').trim().toLowerCase();
            if (!normalized) return false;
            if (normalized === 'nfc') return true;
            return /(^|[^a-zа-яё])nfc([^a-zа-яё]|$)/i.test(normalized) || normalized.includes('нфс') || normalized.includes('чип');
        });
    },
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
    _isWorkshopOrder(orderRef = null) {
        const value = typeof orderRef === 'string'
            ? orderRef
            : (orderRef?.order_name || orderRef?.project_name || orderRef?.name || '');
        return /воркшоп|workshop/i.test(String(value || ''));
    },
    _collectStageActuals(orderId, planHours = {}, params = {}, orderRef = null) {
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
        const isWorkshopOrder = this._isWorkshopOrder(orderRef);
        const legacyEligibleStages = isWorkshopOrder ? ['casting', 'trim'] : stageKeys;
        const legacyStageKeys = legacyEligibleStages.filter(stage => this._num(planStageHours[stage]) > 0);
        const legacyPlanTotal = legacyStageKeys.reduce((sum, stage) => sum + planStageHours[stage], 0);
        const legacyWeights = legacyPlanTotal > 0
            ? legacyStageKeys.reduce((acc, stage) => ({ ...acc, [stage]: planStageHours[stage] / legacyPlanTotal }), {})
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
            if (!legacyWeights || !this._isLegacyImportedEntry(entry)) return;
            const distributed = this._splitWeightedValue(hours, legacyWeights, legacyStageKeys);
            legacyStageKeys.forEach(stageKey => {
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

        return {
            hours: stageHours,
            salary: stageSalary,
            usedLegacyDistribution,
            legacyScope: isWorkshopOrder ? 'production_only' : 'all_planned',
        };
    },

    // ==========================================
    // Load
    // ==========================================

    async load() {
        this._orderCache = {};
        const allOrders = await loadOrders();
        this._allOrders = (allOrders || []).filter(o => this.VISIBLE_STATUSES.includes(o.status));
        this._allOrders.sort((a, b) => (this.STATUS_ORDER[a.status] || 99) - (this.STATUS_ORDER[b.status] || 99));
        this._ensurePeriodState();
        this._syncPeriodControls();
        this._applyFilter();
        await this._syncFinTabloImportsIfNeeded();
        this._entries = await loadTimeEntries();
        this._employees = (await loadEmployees()) || [];
        await this._renderAll();
    },

    // ==========================================
    // Period filter
    // ==========================================

    _currentMonthValue() {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        return `${now.getFullYear()}-${month}`;
    },

    _ensurePeriodState() {
        if (!this._periodAnchor) this._periodAnchor = this._currentMonthValue();
        if (!this._periodKind) this._periodKind = 'month';
    },

    _syncPeriodControls() {
        this._ensurePeriodState();
        const periodInput = document.getElementById('fact-period-anchor');
        if (periodInput && periodInput.value !== this._periodAnchor) {
            periodInput.value = this._periodAnchor;
        }
        if (typeof document.querySelectorAll === 'function') {
            document.querySelectorAll('.fact-period-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.period === this._periodKind);
            });
        }
    },

    setPeriodKind(kind) {
        if (!kind) return;
        this._periodKind = kind;
        this._syncPeriodControls();
        this._applyFilter();
        this._renderAll();
    },

    setPeriodAnchor(value = null) {
        const nextValue = value || document.getElementById('fact-period-anchor')?.value || this._currentMonthValue();
        this._periodAnchor = nextValue;
        this._syncPeriodControls();
        this._applyFilter();
        this._renderAll();
    },

    shiftPeriod(direction) {
        this._ensurePeriodState();
        const [yearRaw, monthRaw] = String(this._periodAnchor || this._currentMonthValue()).split('-');
        const year = Number(yearRaw) || new Date().getFullYear();
        const monthIndex = (Number(monthRaw) || 1) - 1;
        const stepMonths = this._periodKind === 'quarter' ? 3
            : this._periodKind === 'halfyear' ? 6
            : this._periodKind === 'year' ? 12
            : 1;
        const anchor = new Date(year, monthIndex + stepMonths * Number(direction || 0), 1);
        const nextMonth = String(anchor.getMonth() + 1).padStart(2, '0');
        this.setPeriodAnchor(`${anchor.getFullYear()}-${nextMonth}`);
    },

    // Backward compatibility with old rolling buttons
    setFilter(range) {
        const map = { '1m': 'month', '3m': 'quarter', '6m': 'halfyear', '1y': 'year' };
        this.setPeriodKind(map[range] || 'month');
    },

    async _syncFinTabloImportsIfNeeded() {
        if (!Array.isArray(this._allOrders) || this._allOrders.length === 0) return;
        if (typeof window === 'undefined' || !window.FinTablo || typeof window.FinTablo.autoSyncMatchedImports !== 'function') return;
        const scopedOrders = Array.isArray(this._filteredOrders) && this._filteredOrders.length
            ? this._filteredOrders
            : this._allOrders;
        const orderIds = scopedOrders
            .map(order => Number(order?.id))
            .filter(Number.isFinite);
        if (!orderIds.length) return;
        await window.FinTablo.autoSyncMatchedImports({
            orderIds,
            orders: scopedOrders,
            silent: true,
            minIntervalMs: 60 * 1000,
        });
    },

    setCustomRange() {
        this._applyFilter();
        this._renderAll();
    },

    _applyFilter() {
        const range = this._getPeriodRange();
        this._filteredOrders = this._allOrders.filter(order => {
            const orderDate = this._getOrderPeriodDate(order);
            if (!orderDate) return false;
            return orderDate >= range.from && orderDate <= range.to;
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

        const period = this._getPeriodRange();
        const computedOrders = await Promise.all(orders.map(o => this._ensureComputedOrder(o)));

        const inProd = orders.filter(o => this.SECTION_PRODUCTION.has(o.status));
        const completed = orders.filter(o => o.status === 'completed');
        const samples = orders.filter(o => o.status === 'sample');
        $('fact-stat-period').textContent = period.label;
        $('fact-stat-period-hint').textContent = period.caption;
        $('fact-stat-orders').textContent = String(orders.length);
        $('fact-stat-orders-hint').textContent = `произв: ${inProd.length} · готово: ${completed.length} · образцы: ${samples.length}`;

        let planRevTotal = 0;
        let planCostTotal = 0;
        let planHoursTotal = 0;
        let factRevTotal = 0;
        let factCostTotal = 0;
        let hasFactData = false;

        computedOrders.forEach((computed, idx) => {
            const order = orders[idx];
            const plan = computed?.planData || {};
            const planHours = computed?.planHours || {};
            const fact = computed?.factData || {};

            planRevTotal += this._num(plan.revenue ?? order?.total_revenue_plan);
            planCostTotal += this._num(plan.totalCosts ?? order?.total_cost_plan);
            planHoursTotal += this._num(planHours.hoursPlastic)
                + this._num(planHours.hoursTrim)
                + this._num(planHours.hoursHardware)
                + this._num(planHours.hoursPackaging);

            const factRevenue = this._num(fact.fact_revenue);
            let factCosts = 0;
            this.ROWS.forEach(r => { factCosts += this._num(fact['fact_' + r.key]); });
            if (factRevenue > 0 || factCosts > 0) {
                factRevTotal += factRevenue;
                factCostTotal += factCosts;
                hasFactData = true;
            }
        });

        const planProfit = this._calcProfitability(planRevTotal, planCostTotal);
        $('fact-stat-plan-revenue').textContent = this.fmtRub(planRevTotal);
        $('fact-stat-plan-costs').textContent = this.fmtRub(planCostTotal);
        $('fact-stat-plan-margin').textContent = this.fmtRub(planProfit.profit);
        $('fact-stat-plan-margin').style.color = planProfit.color;
        if ($('fact-stat-plan-margin-hint')) {
            $('fact-stat-plan-margin-hint').textContent = planRevTotal > 0 ? `${planProfit.margin}% рентаб.` : '—';
        }

        const params = App.params || {};
        const workloadPerMonth = this._num(params.workLoadHours);
        const capacity = workloadPerMonth > 0 ? workloadPerMonth * period.months : 0;
        const planLoadPct = capacity > 0 ? round2(planHoursTotal * 100 / capacity) : 0;
        const factLoadHours = this._getFactLoadHoursForPeriod(period.from, period.to);
        const factLoadPct = capacity > 0 ? round2(factLoadHours * 100 / capacity) : 0;
        this._renderLoadCard($('fact-stat-plan-load'), $('fact-stat-plan-load-hint'), planLoadPct, planHoursTotal, capacity, `план по заказам периода · ${period.months} мес`);
        this._renderLoadCard($('fact-stat-fact-load'), $('fact-stat-fact-load-hint'), factLoadPct, factLoadHours, capacity, `табель сотрудников · ${period.months} мес`);

        const indirectMonthly = this._num(App.settings?.indirect_costs_monthly);
        if (indirectMonthly > 0) {
            $('fact-stat-indirect').textContent = this.fmtRub(indirectMonthly);
            const perHour = this._num(params.indirectPerHour);
            $('fact-stat-indirect-hint').textContent = perHour > 0 ? `${this.fmtRub(perHour)}/ч` : 'фикс на месяц';
        } else {
            $('fact-stat-indirect').textContent = '—';
            $('fact-stat-indirect-hint').textContent = '';
        }

        const factProfit = this._calcProfitability(factRevTotal, factCostTotal);
        $('fact-stat-fact-revenue').textContent = hasFactData ? this.fmtRub(factRevTotal) : '—';
        $('fact-stat-fact-costs').textContent = hasFactData ? this.fmtRub(factCostTotal) : '—';

        const factProfitEl = $('fact-stat-fact-margin');
        factProfitEl.textContent = hasFactData ? this.fmtRub(factProfit.profit) : '—';
        factProfitEl.style.color = hasFactData ? factProfit.color : '';
        if ($('fact-stat-fact-margin-hint')) {
            $('fact-stat-fact-margin-hint').textContent = !hasFactData
                ? '—'
                : (factProfit.margin != null ? `${factProfit.margin}% по полученным деньгам` : 'выручка ещё не поступила');
        }

        const revDelta = factRevTotal - planRevTotal;
        const costDelta = factCostTotal - planCostTotal;
        const profitDelta = factProfit.profit - planProfit.profit;
        this._renderDelta($('fact-stat-rev-delta'), revDelta, hasFactData);
        this._renderDelta($('fact-stat-cost-delta'), costDelta, hasFactData, true);
        this._renderDelta($('fact-stat-earned-delta'), profitDelta, hasFactData);

        const summaryNote = $('fact-stat-summary-note');
        const summaryHint = $('fact-stat-summary-note-hint');
        if (summaryNote) {
            if (!orders.length) {
                summaryNote.textContent = 'Нет заказов';
                summaryNote.style.color = 'var(--text-muted)';
                if (summaryHint) summaryHint.textContent = 'Попробуй переключить период';
            } else if (!hasFactData) {
                summaryNote.textContent = 'Факт ещё копится';
                summaryNote.style.color = 'var(--text-muted)';
                if (summaryHint) summaryHint.textContent = 'Пока есть только план';
            } else if (profitDelta >= 0) {
                summaryNote.textContent = 'Идём лучше плана';
                summaryNote.style.color = 'var(--green)';
                if (summaryHint) summaryHint.textContent = 'Факт прибыли не хуже плана';
            } else {
                summaryNote.textContent = 'Факт хуже плана';
                summaryNote.style.color = 'var(--red)';
                if (summaryHint) summaryHint.textContent = 'Проверь выручку, фурнитуру и часы';
            }
        }

        const ordersTitle = $('fact-orders-title');
        const ordersHint = $('fact-orders-hint');
        if (ordersTitle) ordersTitle.textContent = `План-факт по заказам · ${period.label}`;
        if (ordersHint) {
            ordersHint.textContent = 'Верхние карточки — периодный срез, строки ниже — детализация по каждому заказу.';
        }
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

    _renderLoadCard(valueEl, hintEl, percent, hours, capacity, suffix = '') {
        if (!valueEl) return;
        if (!(capacity > 0)) {
            valueEl.textContent = '—';
            if (hintEl) hintEl.textContent = '';
            return;
        }
        const loadColor = percent >= 100 ? 'var(--red)' : percent >= 80 ? 'var(--yellow)' : 'var(--green)';
        valueEl.innerHTML = `<span style="color:${loadColor}">${percent}%</span>`;
        if (hintEl) {
            hintEl.textContent = `${round2(hours)}ч / ${round2(capacity)}ч${suffix ? ` · ${suffix}` : ''}`;
        }
    },

    _parseDateValue(rawValue) {
        if (!rawValue) return null;
        if (rawValue instanceof Date) return Number.isFinite(rawValue.getTime()) ? rawValue : null;
        const raw = String(rawValue).trim();
        if (!raw) return null;
        const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw)
            ? new Date(`${raw}T12:00:00`)
            : new Date(raw);
        return Number.isFinite(normalized.getTime()) ? normalized : null;
    },

    _monthLabel(date) {
        return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date);
    },

    _formatDateLabel(date) {
        return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
    },

    _getPeriodRange() {
        this._ensurePeriodState();
        const [yearRaw, monthRaw] = String(this._periodAnchor || this._currentMonthValue()).split('-');
        const year = Number(yearRaw) || new Date().getFullYear();
        const monthIndex = Math.max(0, (Number(monthRaw) || 1) - 1);
        let startMonth = monthIndex;
        let months = 1;
        let label = this._monthLabel(new Date(year, monthIndex, 1));

        if (this._periodKind === 'quarter') {
            startMonth = Math.floor(monthIndex / 3) * 3;
            months = 3;
            label = `${Math.floor(startMonth / 3) + 1} квартал ${year}`;
        } else if (this._periodKind === 'halfyear') {
            startMonth = monthIndex < 6 ? 0 : 6;
            months = 6;
            label = `${startMonth === 0 ? 'I' : 'II'} полугодие ${year}`;
        } else if (this._periodKind === 'year') {
            startMonth = 0;
            months = 12;
            label = String(year);
        }

        const from = new Date(year, startMonth, 1, 0, 0, 0, 0);
        const to = new Date(year, startMonth + months, 0, 23, 59, 59, 999);
        return {
            from,
            to,
            months,
            label,
            caption: `${this._formatDateLabel(from)} — ${this._formatDateLabel(to)}`,
        };
    },

    _getOrderPeriodDate(order) {
        return this._parseDateValue(
            order?.deadline_end
            || order?.deadline
            || order?.deadline_start
            || order?.created_at
            || order?.updated_at
        );
    },

    _getEntryPeriodDate(entry) {
        return this._parseDateValue(entry?.date || entry?.work_date || entry?.created_at || entry?.updated_at);
    },

    _isProductionLoadEntry(entry) {
        const stage = this._stageKey(entry);
        return stage === 'casting'
            || stage === 'trim'
            || stage === 'assembly'
            || stage === 'packaging'
            || this._isLegacyImportedEntry(entry);
    },

    _getFactLoadHoursForPeriod(from, to) {
        return round2((this._entries || []).reduce((sum, entry) => {
            const date = this._getEntryPeriodDate(entry);
            if (!date || date < from || date > to) return sum;
            if (!this._isProductionLoadEntry(entry)) return sum;
            return sum + this._num(entry.hours);
        }, 0));
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
    const computed = this._orderCache[o.id] || {};
    const planRevenue = this._num(computed.planData?.revenue ?? o.total_revenue_plan);
    const planCost = this._num(computed.planData?.totalCosts ?? o.total_cost_plan);
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
                const planCost = this._num(computedOrders[idx]?.planData?.totalCosts ?? o.total_cost_plan);
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
        const planItems = this._dedupePlanItems(rawItems || []);
        let planHoursPlastic = 0, planHoursTrim = 0, planHoursAssembly = 0, planHoursPackaging = 0;
        let planHoursAssemblyProducts = 0, planHoursAssemblyExternal = 0;
        let hardwarePurchase = 0, hardwareDelivery = 0, nfcTotal = 0, packagingPurchase = 0, packagingDelivery = 0;
        let designPrinting = 0, plastic = 0, molds = 0, delivery = 0;
        let savedIndirect = 0;
        let hasProductAssemblySnapshot = false;
        let hasSavedSnapshot = false;
        let usedDuplicateCollapse = planItems.length !== (rawItems || []).length;

        planItems.forEach(ri => {
            const qty = this._num(ri.quantity);
            if (qty <= 0) return;

            if (ri.item_type === 'product') {
                const liveTemplate = ri.template_id && Array.isArray(App?.templates)
                    ? App.templates.find(template => String(template.id) === String(ri.template_id))
                    : null;
                const snapshotHoursPlastic = this._num(ri.hours_plastic) || this._num(ri.result?.hoursPlastic);
                const snapshotHoursTrim = this._num(ri.hours_cutting) || this._num(ri.result?.hoursCutting);
                const snapshotHoursAssembly = this._planItemHours(ri, 'hours_assembly');
                const calcFallback = ((!snapshotHoursPlastic && !snapshotHoursTrim) || !(snapshotHoursAssembly > 0))
                    ? calculateItemCost({
                        quantity: ri.quantity,
                        pieces_per_hour: ri.pieces_per_hour,
                        weight_grams: ri.weight_grams,
                        extra_molds: ri.extra_molds || 0,
                        base_mold_in_stock: ri.base_mold_in_stock || false,
                        complex_design: ri.complex_design || false,
                        is_blank_mold: ri.is_blank_mold || false,
                        is_nfc: ri.is_nfc || false,
                        nfc_programming: ri.nfc_programming || false,
                        delivery_included: ri.delivery_included || false,
                        printings: ri.printings ? (typeof ri.printings === 'string' ? JSON.parse(ri.printings) : ri.printings) : [],
                        sell_price_item: ri.sell_price_item || 0,
                        sell_price_printing: ri.sell_price_printing || 0,
                        product_name: ri.product_name,
                        template_id: ri.template_id || null,
                        builtin_hw_name: ri.builtin_hw_name || liveTemplate?.hw_name || '',
                        builtin_hw_price: ri.builtin_hw_price || liveTemplate?.hw_price_per_unit || 0,
                        builtin_hw_delivery_total: ri.builtin_hw_delivery_total || liveTemplate?.hw_delivery_total || 0,
                        builtin_hw_speed: ri.builtin_hw_speed || liveTemplate?.hw_speed || 0,
                        builtin_assembly_name: ri.builtin_assembly_name || liveTemplate?.builtin_assembly_name || '',
                        builtin_assembly_speed: ri.builtin_assembly_speed || liveTemplate?.builtin_assembly_speed || 0,
                    }, params)
                    : null;
                planHoursPlastic += snapshotHoursPlastic > 0 ? snapshotHoursPlastic : this._num(calcFallback?.hoursPlastic);
                planHoursTrim += snapshotHoursTrim > 0 ? snapshotHoursTrim : this._num(calcFallback?.hoursCutting);
                const resolvedProductAssemblyHours = snapshotHoursAssembly > 0
                    ? snapshotHoursAssembly
                    : this._num(calcFallback?.hoursAssemblyZone);
                planHoursAssembly += resolvedProductAssemblyHours;
                planHoursAssemblyProducts += resolvedProductAssemblyHours;

                const productFot = this._planItemCost(ri, 'cost_fot');
                const productCutting = this._planItemCost(ri, 'cost_cutting');
                const productIndirect = this._planItemCost(ri, 'cost_indirect');
                const cuttingIndirect = this._planItemCost(ri, 'cost_cutting_indirect');
                const productAssembly = this._planItemCost(ri, 'cost_builtin_assembly');
                const productAssemblyIndirect = this._planItemCost(ri, 'cost_builtin_assembly_indirect');
                const productPlastic = this._planItemCost(ri, 'cost_plastic');
                const productMold = this._planItemCost(ri, 'cost_mold_amortization');
                const productDesign = this._planItemCost(ri, 'cost_design');
                const productPrinting = this._planItemCost(ri, 'cost_printing');
                const productDelivery = this._planItemCost(ri, 'cost_delivery');
                const productNfc = this._planItemCost(ri, 'cost_nfc_tag');
                if (productFot || productCutting || productIndirect || cuttingIndirect || productAssembly || productAssemblyIndirect || productPlastic || productMold || productDesign || productPrinting || productDelivery || productNfc) {
                    hasSavedSnapshot = true;
                }
                if (productAssembly || productAssemblyIndirect || snapshotHoursAssembly > 0) {
                    hasProductAssemblySnapshot = true;
                }

                plastic += qty * productPlastic;
                molds += qty * productMold;
                designPrinting += qty * (productDesign + productPrinting);
                delivery += qty * productDelivery;
                nfcTotal += qty * productNfc;
                savedIndirect += qty * (productIndirect + cuttingIndirect + productAssemblyIndirect);
            } else if (ri.item_type === 'hardware') {
                const savedHardwareHours = this._num(ri.hours_hardware) || this._num(ri.result?.hoursHardware);
                planHoursAssembly += savedHardwareHours;
                planHoursAssemblyExternal += savedHardwareHours;
                hardwarePurchase += qty * this._planItemCost(ri, 'hardware_price_per_unit');
                hardwareDelivery += qty * this._planItemCost(ri, 'hardware_delivery_per_unit');
                if (savedHardwareHours > 0 || this._planItemCost(ri, 'hardware_price_per_unit', 'hardware_delivery_per_unit') > 0) {
                    hasSavedSnapshot = true;
                }
            } else if (ri.item_type === 'packaging') {
                const savedPackagingHours = this._num(ri.hours_packaging) || this._num(ri.result?.hoursPackaging);
                planHoursPackaging += savedPackagingHours;
                packagingPurchase += qty * this._planItemCost(ri, 'packaging_price_per_unit');
                packagingDelivery += qty * this._planItemCost(ri, 'packaging_delivery_per_unit');
                if (savedPackagingHours > 0 || this._planItemCost(ri, 'packaging_price_per_unit', 'packaging_delivery_per_unit') > 0) {
                    hasSavedSnapshot = true;
                }
            }
        });

        const derivedAssemblyHours = round2(planHoursAssembly);
        const derivedPackagingHours = round2(planHoursPackaging);
        const savedAssemblyHours = this._num(order.production_hours_hardware);
        if (savedAssemblyHours > 0) planHoursAssembly = savedAssemblyHours;
        const savedPackagingHours = this._num(order.production_hours_packaging);
        if (savedPackagingHours > 0) planHoursPackaging = savedPackagingHours;

        const salaryProduction = round2(hasSavedSnapshot
            ? planItems.reduce((sum, ri) => ri.item_type === 'product' ? sum + (this._num(ri.quantity) * this._planItemCost(ri, 'cost_fot')) : sum, 0)
            : (planHoursPlastic * (params.fotPerHour || 0)));
        const salaryTrim = round2(hasSavedSnapshot
            ? planItems.reduce((sum, ri) => ri.item_type === 'product' ? sum + (this._num(ri.quantity) * this._planItemCost(ri, 'cost_cutting')) : sum, 0)
            : (planHoursTrim * (params.fotPerHour || 0)));
        const externalAssemblyHoursForSalary = Math.max(0, planHoursAssembly - planHoursAssemblyProducts);
        const salaryAssembly = round2(hasSavedSnapshot
            ? (hasProductAssemblySnapshot
                ? (
                    planItems.reduce((sum, ri) => ri.item_type === 'product'
                        ? sum + (this._num(ri.quantity) * this._planItemCost(ri, 'cost_builtin_assembly'))
                        : sum, 0)
                    + (externalAssemblyHoursForSalary * (params.fotPerHour || 0))
                )
                : (planHoursAssembly * (params.fotPerHour || 0)))
            : (planHoursAssembly * (params.fotPerHour || 0)));
        const salaryPackaging = round2(planHoursPackaging * (params.fotPerHour || 0));

        const plannedHoursTotal = planHoursPlastic + planHoursTrim + planHoursAssembly + planHoursPackaging;
        const prodIndirect = round2(hasSavedSnapshot
            ? (savedIndirect + ((planHoursAssemblyExternal + planHoursPackaging) * (params.indirectPerHour || 0)))
            : (plannedHoursTotal * (params.indirectPerHour || 0)));

        const orderRevenue = this._num(order.total_revenue_plan);
        const rowsWithoutTaxes = round2(
            round2(salaryProduction) + round2(salaryTrim) + round2(salaryAssembly) + round2(salaryPackaging) + round2(prodIndirect) +
            round2(hardwarePurchase) + round2(hardwareDelivery) + round2(nfcTotal) + round2(packagingPurchase) + round2(packagingDelivery) +
            round2(designPrinting) + round2(plastic) + round2(molds) + round2(delivery)
        );
        const charityRate = this._num(params.charityRate) || 0.01;
        const taxes = round2(orderRevenue * this._num(params.taxRate));
        const commercial = round2(orderRevenue * 0.065);
        const charity = round2(orderRevenue * charityRate);
        const otherBalance = 0;
        const computedTotalCosts = round2(rowsWithoutTaxes + taxes + commercial + charity + otherBalance);
        const computedMarginPercent = orderRevenue > 0 ? round2(((orderRevenue - computedTotalCosts) / orderRevenue) * 100) : 0;
        const computedEarned = round2(orderRevenue - computedTotalCosts);

        return {
            planData: {
                salaryProduction: round2(salaryProduction), salaryTrim: round2(salaryTrim),
                salaryAssembly: round2(salaryAssembly), salaryPackaging: round2(salaryPackaging),
                indirectProduction: round2(prodIndirect),
                hardwareTotal: round2(hardwarePurchase + hardwareDelivery),
                nfcTotal: round2(nfcTotal),
                packagingTotal: round2(packagingPurchase + packagingDelivery),
                designPrinting: round2(designPrinting), plastic: round2(plastic),
                molds: round2(molds), delivery: round2(delivery), taxes: round2(taxes), commercial: round2(commercial), charity: round2(charity), other: round2(otherBalance),
                totalCosts: computedTotalCosts,
                revenue: orderRevenue > 0 ? round2(orderRevenue) : 0,
                planMarginPercent: computedMarginPercent,
                planEarned: computedEarned,
            },
            planHours: {
                hoursPlastic: round2(planHoursPlastic), hoursTrim: round2(planHoursTrim),
                hoursHardware: round2(planHoursAssembly), hoursPackaging: round2(planHoursPackaging),
            },
            planMeta: {
                salary_production: {
                    planHours: round2(planHoursPlastic),
                    source: hasSavedSnapshot ? 'saved_items' : 'derived_items',
                },
                salary_trim: {
                    planHours: round2(planHoursTrim),
                    source: hasSavedSnapshot ? 'saved_items' : 'derived_items',
                },
                salary_assembly: {
                    planHours: round2(planHoursAssembly),
                    source: savedAssemblyHours > 0
                        ? 'saved_order'
                        : (derivedAssemblyHours > 0 ? 'saved_items' : 'derived_items'),
                    savedHours: round2(savedAssemblyHours),
                    derivedHours: round2(derivedAssemblyHours),
                },
                salary_packaging: {
                    planHours: round2(planHoursPackaging),
                    source: savedPackagingHours > 0 ? 'saved_order' : (derivedPackagingHours > 0 ? 'saved_items' : 'derived_items'),
                    savedHours: round2(savedPackagingHours),
                    derivedHours: round2(derivedPackagingHours),
                },
                indirect_production: {
                    planHours: round2(plannedHoursTotal),
                    perHour: this._num(params.indirectPerHour),
                    source: hasSavedSnapshot ? 'saved_items' : 'hours_formula',
                    detailHtml: hasSavedSnapshot
                        ? `косвенные из текущих строк заказа${usedDuplicateCollapse ? '<br>одинаковые складские позиции объединены, чтобы не считать фурнитуру дважды' : ''}`
                        : undefined,
                    formula: hasSavedSnapshot ? 'текущие cost_indirect из строк заказа' : 'общие плановые часы × косв./ч',
                },
            },
        };
    },

    async _applyCurrentPlanMaterialTotals(planBuild, rawItems = []) {
        if (!planBuild || !planBuild.planData) return planBuild;

        let warehouseItems = [];
        try {
            warehouseItems = (await loadWarehouseItems()) || [];
        } catch (error) {
            console.warn('Factual: failed to load warehouse items for current plan materials', error);
            warehouseItems = [];
        }
        if (!warehouseItems.length) return planBuild;

        const planItems = this._dedupePlanItems(rawItems || []);
        if (!planItems.length) return planBuild;

        const itemMap = new Map((warehouseItems || []).map(item => [Number(item.id || 0), item]));
        const demandRows = this._collectWarehouseDemandRows(planItems, warehouseItems);
        let hardwareWarehouseTotal = 0;
        let nfcWarehouseTotal = 0;
        let packagingWarehouseTotal = 0;
        let usedCurrentWarehouse = false;

        (demandRows || []).forEach(row => {
            const itemId = Number(row.warehouse_item_id || 0);
            const qty = this._num(row.qty);
            if (!itemId || qty <= 0) return;
            const warehouseItem = itemMap.get(itemId) || null;
            const unitPrice = this._num(warehouseItem?.price_per_unit);
            const rowTotal = round2(qty * unitPrice);
            const category = String(row.material_type || warehouseItem?.category || '').toLowerCase();
            if (category === 'packaging') packagingWarehouseTotal += rowTotal;
            else if (this._isNfcWarehouseRow(row, warehouseItem)) nfcWarehouseTotal += rowTotal;
            else hardwareWarehouseTotal += rowTotal;
            usedCurrentWarehouse = true;
        });

        let hardwareManualTotal = 0;
        let nfcManualTotal = 0;
        let packagingManualTotal = 0;
        planItems.forEach(item => {
            const type = String(item?.item_type || '').toLowerCase();
            if (type !== 'hardware' && type !== 'packaging') return;
            const source = String(item?.source || (type === 'hardware' ? item?.hardware_source : item?.packaging_source) || '').toLowerCase();
            if (source === 'warehouse') return;
            const qty = this._num(item?.quantity ?? item?.qty);
            if (qty <= 0) return;
            const unitPrice = type === 'hardware'
                ? this._planItemCost(item, 'hardware_price_per_unit')
                : this._planItemCost(item, 'packaging_price_per_unit');
            const unitDelivery = type === 'hardware'
                ? this._planItemCost(item, 'hardware_delivery_per_unit')
                : this._planItemCost(item, 'packaging_delivery_per_unit');
            const rowTotal = round2(qty * (unitPrice + unitDelivery));
            if (type === 'packaging') packagingManualTotal += rowTotal;
            else if (this._isNfcWarehouseRow({
                warehouse_sku: item?.hardware_warehouse_sku,
                sku: item?.hardware_warehouse_sku,
                name: item?.product_name || item?.name,
                product_name: item?.product_name || item?.name,
            })) nfcManualTotal += rowTotal;
            else hardwareManualTotal += rowTotal;
        });

        if (!usedCurrentWarehouse && !hardwareManualTotal && !nfcManualTotal && !packagingManualTotal) return planBuild;

        const planData = planBuild.planData;
        const nextHardwareTotal = round2(hardwareWarehouseTotal + hardwareManualTotal);
        const nextNfcTotal = round2(nfcWarehouseTotal + nfcManualTotal);
        const nextPackagingTotal = round2(packagingWarehouseTotal + packagingManualTotal);
        planData.hardwareTotal = nextHardwareTotal;
        planData.nfcTotal = nextNfcTotal;
        planData.packagingTotal = nextPackagingTotal;

        const recomputedTotalCosts = round2(
            this._num(planData.salaryProduction) +
            this._num(planData.salaryTrim) +
            this._num(planData.salaryAssembly) +
            this._num(planData.salaryPackaging) +
            this._num(planData.indirectProduction) +
            this._num(planData.hardwareTotal) +
            this._num(planData.nfcTotal) +
            this._num(planData.packagingTotal) +
            this._num(planData.designPrinting) +
            this._num(planData.plastic) +
            this._num(planData.molds) +
            this._num(planData.delivery) +
            this._num(planData.taxes) +
            this._num(planData.commercial) +
            this._num(planData.charity) +
            this._num(planData.other)
        );
        planData.totalCosts = recomputedTotalCosts;
        planData.planMarginPercent = planData.revenue > 0
            ? round2(((this._num(planData.revenue) - recomputedTotalCosts) / this._num(planData.revenue)) * 100)
            : 0;
        planData.planEarned = round2(this._num(planData.revenue) - recomputedTotalCosts);

        const planMeta = planBuild.planMeta || {};
        planMeta.hardware_total = {
            source: usedCurrentWarehouse ? 'current_warehouse' : 'manual_items',
        };
        planMeta.nfc_total = {
            source: usedCurrentWarehouse ? 'current_warehouse' : 'manual_items',
        };
        planMeta.packaging_total = {
            source: usedCurrentWarehouse ? 'current_warehouse' : 'manual_items',
        };
        planBuild.planMeta = planMeta;
        return planBuild;
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
    async _recomputeCachedFact(cached) {
        if (!cached) return;
        const factData = cached.factData || {};
        const planData = cached.planData || {};
        const planHours = cached.planHours || {};
        const orderId = Number(cached.order?.id || cached.orderId || 0);
        await this._applyHoursFromEntries(factData, orderId, planHours, App.params || {}, cached.order || null);
        await this._applyDerivedFacts(factData, planData, planHours, App.params || {}, orderId, cached.order?.order_name || '', cached.order || null, cached.items || []);
        let factTotal = 0;
        this.ROWS.forEach(row => { factTotal += parseFloat(factData['fact_' + row.key]) || 0; });
        factData.fact_total = round2(factTotal);
    },
    _renderAutoResetControl(orderId, key, isAuto, manualOverride) {
        if (!isAuto || !manualOverride) return '';
        return `<button type="button" class="btn btn-outline" style="padding:2px 6px;font-size:10px;line-height:1.2;margin-left:6px"
                    onclick="event.stopPropagation();Factual.resetFactInput(${orderId}, '${key}')">↺ авто</button>`;
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
        const planBuild = this._buildPlan(order, rawItems || [], params);
        await this._applyCurrentPlanMaterialTotals(planBuild, rawItems || []);
        const { planData, planHours, planMeta } = planBuild;
        const factData = { ...(await loadFactual(orderId) || {}) };

        this._applyHoursFromEntries(factData, orderId, planHours, params, order);
        await this._applyDerivedFacts(factData, planData, planHours, params, orderId, order.order_name || '', order, rawItems || []);

        const computed = {
            ...(cached || {}),
            order,
            items: rawItems || [],
            planData,
            planHours,
            planMeta,
            factData,
            computed: true,
        };
        this._orderCache[orderId] = computed;
        return computed;
    },

    _applyHoursFromEntries(factData, orderId, planHours = {}, params = {}, orderRef = null) {
        const stageActuals = this._collectStageActuals(orderId, planHours, params, orderRef);
        factData.fact_hours_production = round2(stageActuals.hours.casting);
        factData.fact_hours_trim = round2(stageActuals.hours.trim);
        factData.fact_hours_assembly = round2(stageActuals.hours.assembly);
        factData.fact_hours_packaging = round2(stageActuals.hours.packaging);
        factData._auto_stage_salary = stageActuals.salary;
        factData._hours_source = stageActuals.usedLegacyDistribution ? 'timetrack+legacy-stage-estimate' : 'timetrack';
        factData._legacy_stage_estimate = stageActuals.usedLegacyDistribution;
        factData._legacy_stage_scope = stageActuals.legacyScope || 'all_planned';
        if (stageActuals.usedLegacyDistribution) {
            this._setSourceHint(factData, 'fact_salary_production', 'часы × ставка, legacy по плану');
            this._setSourceHint(factData, 'fact_salary_trim', 'часы × ставка, legacy по плану');
            if (stageActuals.legacyScope !== 'production_only') {
                this._setSourceHint(factData, 'fact_salary_assembly', 'часы × ставка, legacy по плану');
                this._setSourceHint(factData, 'fact_salary_packaging', 'часы × ставка, legacy по плану');
                this._setSourceHint(factData, 'fact_indirect_production', 'часы × косв./ч, legacy по плану');
            } else {
                this._setSourceHint(factData, 'fact_indirect_production', 'часы × косв./ч, legacy в выливание/срезание');
            }
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

    _sumStageSalary(orderId, stage, params, planHours = {}, orderRef = null) {
        const stageActuals = this._collectStageActuals(orderId, planHours, params, orderRef);
        return round2(stageActuals.salary[stage] || 0);
    },

    async _applyDerivedFacts(factData, planData, planHours, params, orderId, orderName, orderRef = null, orderItems = []) {
        const hProd = parseFloat(factData.fact_hours_production) || 0;
        const hTrim = parseFloat(factData.fact_hours_trim) || 0;
        const hAsm = parseFloat(factData.fact_hours_assembly) || 0;
        const hPkg = parseFloat(factData.fact_hours_packaging) || 0;
        const totalHours = hProd + hTrim + hAsm + hPkg;
        const stageSalary = factData._auto_stage_salary || {
            casting: this._sumStageSalary(orderId, 'casting', params, planHours, orderName),
            trim: this._sumStageSalary(orderId, 'trim', params, planHours, orderName),
            assembly: this._sumStageSalary(orderId, 'assembly', params, planHours, orderName),
            packaging: this._sumStageSalary(orderId, 'packaging', params, planHours, orderName),
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
                fact_other: 'fact_other',
                fact_charity: 'fact_charity',
            };

            for (const [ftKey, ourKey] of Object.entries(ftMap)) {
                const val = this._num(latest[ftKey]);
                if (val > 0) {
                    this._applyAutoFactValue(factData, ourKey, val);
                    factData._auto_fintablo[ourKey] = true;
                }
            }

            const ftMaterials = this._num(latest.fact_materials);
            if (ftMaterials > 0 && this._num(planData?.plastic) <= 0) {
                this._applyAutoFactValue(factData, 'fact_plastic', ftMaterials);
                factData._auto_fintablo.fact_plastic = true;
                this._setSourceHint(factData, 'fact_plastic', 'ФинТабло');
            }

            const ftRevenue = this._num(latest.fact_revenue);
            if (ftRevenue > 0) {
                this._applyAutoFactValue(factData, 'fact_revenue', ftRevenue);
                factData._auto_fintablo.fact_revenue = true;
            }

            const importedTaxes = this._num(latest.fact_taxes);
            const importedCommercial = this._num(latest.fact_commercial);
            const importedCharity = this._num(latest.fact_charity);
            const currentFactRevenue = this._num(factData.fact_revenue);
            const charityRate = this._num(params?.charityRate) || 0.01;
            const commercialByRevenue = currentFactRevenue > 0 ? round2(currentFactRevenue * 0.065) : 0;
            const charityByRevenue = currentFactRevenue > 0 ? round2(currentFactRevenue * charityRate) : 0;
            if (importedTaxes > 0) {
                this._applyAutoFactValue(factData, 'fact_taxes', importedTaxes);
                factData._auto_fintablo.fact_taxes = importedTaxes > 0;
                this._setSourceHint(factData, 'fact_taxes', 'ФинТабло');
            }
            const effectiveCommercial = importedCommercial > 0 ? importedCommercial : commercialByRevenue;
            if (effectiveCommercial > 0) {
                this._applyAutoFactValue(factData, 'fact_commercial', effectiveCommercial);
                factData._auto_fintablo.fact_commercial = importedCommercial > 0;
                this._setSourceHint(factData, 'fact_commercial', importedCommercial > 0 ? 'ФинТабло' : '6.5% от факта выручки');
            }
            const effectiveCharity = importedCharity > 0 ? importedCharity : charityByRevenue;
            if (effectiveCharity > 0) {
                this._applyAutoFactValue(factData, 'fact_charity', effectiveCharity);
                factData._auto_fintablo.fact_charity = importedCharity > 0;
                this._setSourceHint(factData, 'fact_charity', importedCharity > 0 ? 'ФинТабло' : '1% от факта выручки');
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
        if (!factData._auto_fintablo.fact_hardware_total || !factData._auto_fintablo.fact_nfc_total || !factData._auto_fintablo.fact_packaging_total) {
            const whActual = this._isWorkshopOrder(orderRef || orderName)
                ? await this._deriveWorkshopMaterialFacts(orderId, orderRef || { order_name: orderName }, orderItems || [])
                : await this._deriveMaterialFacts(orderId, orderName);
                if (!factData._auto_fintablo.fact_hardware_total) {
                    this._applyAutoFactValue(factData, 'fact_hardware_total', whActual.found ? whActual.hardware : (planData?.hardwareTotal || 0));
                    this._setSourceHint(factData, 'fact_hardware_total', whActual.found ? (whActual.sourceHint || 'склад') : 'план');
                }
                if (!factData._auto_fintablo.fact_nfc_total) {
                    this._applyAutoFactValue(factData, 'fact_nfc_total', whActual.found ? whActual.nfc : (planData?.nfcTotal || 0));
                    this._setSourceHint(factData, 'fact_nfc_total', whActual.found ? (whActual.nfcSourceHint || whActual.sourceHint || 'склад') : 'план');
                }
                if (!factData._auto_fintablo.fact_packaging_total) {
                    this._applyAutoFactValue(factData, 'fact_packaging_total', whActual.found ? whActual.packaging : (planData?.packagingTotal || 0));
                    this._setSourceHint(factData, 'fact_packaging_total', whActual.found ? (whActual.packagingSourceHint || whActual.sourceHint || 'склад') : 'план');
                }
            }
    },

    async _deriveWorkshopMaterialFacts(orderId, orderRef = null, orderItems = []) {
        const projectState = (typeof loadProjectHardwareState === 'function'
            ? (await loadProjectHardwareState())
            : { checks: {}, actual_qtys: {} }) || { checks: {}, actual_qtys: {} };
        const checks = (projectState && projectState.checks && typeof projectState.checks === 'object') ? projectState.checks : {};
        const actuals = (projectState && projectState.actual_qtys && typeof projectState.actual_qtys === 'object') ? projectState.actual_qtys : {};
        const items = (await loadWarehouseItems()) || [];
        const itemMap = new Map(items.map(i => [Number(i.id), i]));
        const demandRows = this._collectWarehouseDemandRows(orderItems || [], items || []);

        if (!demandRows.length) return { found: false, hardware: 0, packaging: 0 };

        let hardware = 0;
        let nfc = 0;
        let packaging = 0;
        let found = false;
        const normalizedOrderId = Number(typeof orderRef === 'object' ? orderRef?.id ?? orderId : orderId) || Number(orderId) || 0;

        demandRows.forEach(row => {
            const itemId = Number(row.warehouse_item_id || 0);
            if (!itemId) return;
            const key = `${normalizedOrderId}:${itemId}`;
            const ready = !!checks[key];
            if (!ready) return;

            const plannedQty = this._num(row.qty);
            const hasActual = Object.prototype.hasOwnProperty.call(actuals, key);
            const consumedQty = hasActual ? Math.max(0, this._num(actuals[key])) : plannedQty;
            const unitPrice = this._num((itemMap.get(itemId) || {}).price_per_unit);
            const deltaCost = round2(consumedQty * unitPrice);
            const category = String(row.material_type || (itemMap.get(itemId) || {}).category || '').toLowerCase();
            if (category === 'packaging') packaging += deltaCost;
            else if (this._isNfcWarehouseRow(row, itemMap.get(itemId) || null)) nfc += deltaCost;
            else hardware += deltaCost;
            found = true;
        });

        return {
            found,
            hardware: round2(hardware),
            nfc: round2(nfc),
            packaging: round2(packaging),
            sourceHint: found ? 'фурнитура проекта' : 'склад',
            nfcSourceHint: found ? 'фурнитура проекта' : 'склад',
            packagingSourceHint: found ? 'фурнитура проекта' : 'склад',
        };
    },

    async _deriveMaterialFacts
(orderId, orderName) {
        const history = (await loadWarehouseHistory()) || [];
        if (history.length === 0) return { found: false, hardware: 0, nfc: 0, packaging: 0 };
        const items = (await loadWarehouseItems()) || [];
        const itemMap = new Map(items.map(i => [Number(i.id), i]));
        const sameOrder = (h) => {
            if (h.order_id !== undefined && h.order_id !== null && h.order_id !== '') return Number(h.order_id) === Number(orderId);
            return orderName && String(h.order_name || '').trim() === String(orderName).trim();
        };
        let hardware = 0, nfc = 0, packaging = 0, found = false;
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
            if (category !== 'packaging' && this._isNfcWarehouseRow(h, itemMap.get(Number(h.item_id)) || null)) {
                nfc += deltaCost;
                hardware -= deltaCost;
            }
            found = true;
        });
        return {
            found,
            hardware: round2(Math.max(0, hardware)),
            nfc: round2(Math.max(0, nfc)),
            packaging: round2(Math.max(0, packaging)),
            nfcSourceHint: found ? 'склад' : 'план',
        };
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
    const revenueResetControl = this._renderAutoResetControl(orderId, 'revenue', revIsAuto, revManual);
    const factRevenueHint = fact._auto_fintablo?.fact_revenue
        ? (factRev > 0 && planRev > factRev ? 'получено из ФинТабло, оплата пока частичная' : 'получено из ФинТабло')
        : (revManual ? 'внесено вручную' : 'пока не внесена');
    const _isAdmin = App.isAdmin();
    const planTotalRowsVisible = round2(this.ROWS.reduce((sum, row) => {
        const planVal = plan[row.planField] || 0;
        const factKey = 'fact_' + row.key;
        const factVal = parseFloat(fact[factKey]) || 0;
        if (row.key === 'molds' && planVal === 0 && factVal === 0) return sum;
        const isSalaryRow = row.key.startsWith('salary_') || row.key === 'indirect_production';
        if (isSalaryRow && !_isAdmin) return sum;
        return sum + planVal;
    }, 0));
    const planTotalBase = round2(plan.totalCosts || planTotalRowsVisible);
    const hasPlanDrift = Math.abs(planTotalRowsVisible - planTotalBase) > 0.01;

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
            ${fact._legacy_stage_scope === 'production_only'
                ? 'Legacy-часы без этапа распределены только в выливание/срезание по плановым стадиям заказа. Сборка и упаковка считаются только по явно указанным этапам.'
                : 'Legacy-часы без этапа распределены по плановым стадиям заказа, чтобы выливание/срезание/сборка отражали реальную загрузку до ручной детализации.'}
        </div>`;
    }
    if (hasPlanDrift) {
        html += `<div style="margin:-2px 0 10px;padding:8px 10px;border:1px solid #f59e0b;border-radius:10px;background:#fff7ed;font-size:11px;color:#92400e">
            Важно: видимые плановые строки сейчас пересчитаны по текущим строкам заказа и дают ${this.fmtRub(planTotalRowsVisible)}, но сохраненный план заказа в калькуляторе равен ${this.fmtRub(planTotalBase)}. Верхний ИТОГО использует сохраненный план заказа.
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
        const resetControl = this._renderAutoResetControl(orderId, row.key, isAuto, manualOverride);
        const planDetail = this._renderPlanRowDetail(row.key, planMeta);
        const factDetail = this._renderFactRowDetail(row.key, factHoursByRow, planMeta);

        if (isSalaryRow && !_isAdmin) {
            return;
        }
        html += `<tr style="${alarm.bgStyle}">
            <td style="padding:6px 8px;font-weight:500">${row.label} <span class="text-muted" style="font-size:10px">${sourceHint}</span>${resetControl}</td>
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
                ${revenueResetControl}
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

    async resetFactInput(orderId, key) {
        const cached = this._orderCache[orderId] || await this._ensureComputedOrder(orderId);
        if (!cached) return;
        if (!this._isAutoFactRow(cached.factData, key)) return;

        if (key === 'revenue') {
            delete cached.factData.fact_revenue;
            this._setManualOverride(cached.factData, 'fact_revenue', false);
        } else {
            delete cached.factData['fact_' + key];
            this._setManualOverride(cached.factData, 'fact_' + key, false);
        }

        await this._recomputeCachedFact(cached);
        const container = document.getElementById('fact-detail-' + orderId);
        if (container) {
            this._renderDetail(orderId, container, cached.planData, cached.planHours, cached.factData, cached.order, cached.planMeta || {});
        }
        await this._renderGlobalStats();
        await this._loadFactSummaries();
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
        if (meta.detailHtml) return meta.detailHtml;
        if (rowKey === 'indirect_production') {
            return `${this.fmtHours(meta.planHours)} × ${this.fmtRub(meta.perHour || 0)}/ч`;
        }
        if (!rowKey.startsWith('salary_')) return '';
        let detail = this.fmtHours(meta.planHours);
        if (meta.source === 'blank_norms_plus_manual') {
            detail += ' • бланки + вручную';
            detail += `<br>по текущим бланкам: ${this.fmtHours(meta.derivedHours)}`;
            detail += `<br>вручную добавлено: ${this.fmtHours(meta.savedHours)}`;
            return detail;
        }
        if (meta.source === 'blank_norms') {
            detail += ' • по текущим бланкам';
            if (this._num(meta.savedHours) > 0 && Math.abs(this._num(meta.savedHours) - this._num(meta.planHours)) > 0.05) {
                detail += `<br>в заказе было: ${this.fmtHours(meta.savedHours)}`;
            }
            return detail;
        }
        if (meta.source === 'saved_items') {
            detail += ' • из текущих строк заказа';
            if (Math.abs(this._num(meta.derivedHours) - this._num(meta.planHours)) > 0.05) {
                detail += `<br>по текущим строкам: ${this.fmtHours(meta.derivedHours)}`;
            }
            return detail;
        }
        if (meta.source === 'saved_order') {
            detail += ' • текущее значение заказа';
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

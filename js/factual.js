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
    _monthSnapshots: {},
    _visibleOrderRecords: [],

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
        { key: 'taxes',               label: 'Налоги',            planField: 'taxes',            hint: '7% от выручки без НДС / ФинТабло' },
        { key: 'commercial',          label: 'Коммерческий отдел', planField: 'commercial',     hint: '6.5% от выручки с НДС' },
        { key: 'charity',             label: 'Благотворительность', planField: 'charity',       hint: '1% от выручки с НДС / ФинТабло' },
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
    AUTO_FACT_FIELDS: [
        'fact_salary_production',
        'fact_salary_trim',
        'fact_salary_assembly',
        'fact_salary_packaging',
        'fact_indirect_production',
        'fact_hardware_total',
        'fact_nfc_total',
        'fact_packaging_total',
        'fact_design_printing',
        'fact_plastic',
        'fact_molds',
        'fact_delivery_client',
        'fact_taxes',
        'fact_commercial',
        'fact_charity',
        'fact_other',
        'fact_revenue',
    ],
    MATERIAL_ROW_KEYS: new Set(['hardware_total', 'nfc_total', 'packaging_total']),
    MONEY_ONLY_ROW_KEYS: new Set(['design_printing', 'delivery_client', 'taxes', 'commercial', 'charity', 'other']),

    _num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; },
    _vatRate(params) { const raw = Number(params?.vatRate); return Number.isFinite(raw) ? raw : 0.05; },
    _taxRate(params) { const raw = Number(params?.taxRate); return Number.isFinite(raw) ? raw : 0.07; },
    _charityRate(params) { const raw = Number(params?.charityRate); return Number.isFinite(raw) ? raw : 0.01; },
    _commercialRate() { return 0.065; },
    _grossMultiplier(params) { return 1 + this._vatRate(params); },
    _calcTaxesByRevenue(revenue, params) { return round2(this._num(revenue) * this._taxRate(params)); },
    _calcCommercialByRevenue(revenue, params) { return round2(this._num(revenue) * this._commercialRate() * this._grossMultiplier(params)); },
    _calcCharityByRevenue(revenue, params) { return round2(this._num(revenue) * this._charityRate(params) * this._grossMultiplier(params)); },
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
    _getFinTabloBreakdowns(factData) {
        const raw = factData && factData._fintablo_breakdown;
        return (raw && typeof raw === 'object') ? raw : {};
    },
    _getStaleFinTabloSummary(factData) {
        const raw = factData && factData._stale_fintablo;
        return (raw && typeof raw === 'object') ? raw : null;
    },
    _getConfirmedMaterialFacts(factData) {
        const raw = factData && factData._confirmed_material_facts;
        return (raw && typeof raw === 'object') ? raw : {};
    },
    _setConfirmedMaterialFact(factData, rowKey, payload) {
        if (!factData || !rowKey) return;
        const current = this._getConfirmedMaterialFacts(factData);
        if (payload && typeof payload === 'object') current[rowKey] = payload;
        else delete current[rowKey];
        factData._confirmed_material_facts = current;
    },
    _getMaterialFactBreakdowns(factData) {
        const raw = factData && factData._material_fact_breakdown;
        return (raw && typeof raw === 'object') ? raw : {};
    },
    _setMaterialFactBreakdown(factData, rowKey, payload) {
        if (!factData || !rowKey) return;
        const current = this._getMaterialFactBreakdowns(factData);
        if (payload && typeof payload === 'object') current[rowKey] = payload;
        else delete current[rowKey];
        factData._material_fact_breakdown = current;
    },
    _setFinTabloBreakdowns(factData, breakdown) {
        if (!factData) return;
        factData._fintablo_breakdown = (breakdown && typeof breakdown === 'object') ? breakdown : {};
    },
    _setStaleFinTabloSummary(factData, summary) {
        if (!factData) return;
        if (summary && typeof summary === 'object' && this._num(summary.total) > 0) {
            factData._stale_fintablo = summary;
        } else {
            delete factData._stale_fintablo;
        }
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
        this._visibleOrderRecords = [];
        const allOrders = await loadOrders();
        this._allOrders = (allOrders || []).filter(o => this.VISIBLE_STATUSES.includes(o.status));
        this._allOrders.sort((a, b) => (this.STATUS_ORDER[a.status] || 99) - (this.STATUS_ORDER[b.status] || 99));
        this._monthSnapshots = (typeof loadFactualSnapshots === 'function'
            ? ((await loadFactualSnapshots()) || {})
            : {}) || {};
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
        const staleImportOrderIds = await this._collectStaleFinTabloOrderIds(orderIds);
        await window.FinTablo.autoSyncMatchedImports({
            orderIds,
            orders: scopedOrders,
            silent: true,
            minIntervalMs: staleImportOrderIds.length ? 0 : 60 * 1000,
            force: staleImportOrderIds.length > 0,
        });
    },

    async _collectStaleFinTabloOrderIds(orderIds = []) {
        const staleOrderIds = [];
        for (const rawId of orderIds) {
            const orderId = Number(rawId);
            if (!Number.isFinite(orderId)) continue;
            const imports = (await loadFintabloImports(orderId)) || [];
            if (imports.some(row => this._isStaleSplitFinTabloImport(row))) {
                staleOrderIds.push(orderId);
            }
        }
        return staleOrderIds;
    },

    _isStaleSplitFinTabloImport(row = {}) {
        const rawData = row?.raw_data || {};
        if (String(row?.source || '') !== 'api') return false;
        if (!rawData?.splitApplied) return false;
        const breakdown = rawData?.field_breakdown;
        const hasBreakdown = breakdown && Object.values(breakdown).some(value => Array.isArray(value) && value.length > 0);
        if (hasBreakdown) return false;
        const factOther = this._num(row?.fact_other);
        if (factOther <= 0) return false;
        const classifiedTotal = this._num(row?.fact_materials)
            + this._num(row?.fact_hardware)
            + this._num(row?.fact_packaging)
            + this._num(row?.fact_delivery)
            + this._num(row?.fact_printing)
            + this._num(row?.fact_molds)
            + this._num(row?.fact_taxes)
            + this._num(row?.fact_commercial)
            + this._num(row?.fact_charity);
        return classifiedTotal <= 0.01;
    },

    _partitionFinTabloImports(imports = []) {
        const healthy = [];
        const stale = [];
        (Array.isArray(imports) ? imports : []).forEach(row => {
            if (this._isStaleSplitFinTabloImport(row)) stale.push(row);
            else healthy.push(row);
        });
        return { healthy, stale };
    },

    _summarizeStaleFinTabloImports(rows = []) {
        const list = Array.isArray(rows) ? rows : [];
        const total = round2(list.reduce((sum, row) => {
            const rowTotal = this._num(row?.fact_materials)
                + this._num(row?.fact_hardware)
                + this._num(row?.fact_packaging)
                + this._num(row?.fact_delivery)
                + this._num(row?.fact_printing)
                + this._num(row?.fact_molds)
                + this._num(row?.fact_taxes)
                + this._num(row?.fact_commercial)
                + this._num(row?.fact_charity)
                + this._num(row?.fact_other);
            return sum + rowTotal;
        }, 0));
        if (total <= 0) return null;
        return {
            count: list.length,
            total,
            latestUpdatedAt: list
                .map(row => row?.updated_at || row?.import_date || row?.created_at || '')
                .filter(Boolean)
                .sort()
                .slice(-1)[0] || '',
        };
    },

    _resetDerivedMoneyFacts(factData) {
        if (!factData) return;
        this.AUTO_FACT_FIELDS.forEach(field => {
            if (!this._isManualOverride(factData, field)) factData[field] = 0;
        });
        const hints = { ...this._getSourceHints(factData) };
        [
            'fact_hardware_total',
            'fact_nfc_total',
            'fact_packaging_total',
            'fact_design_printing',
            'fact_plastic',
            'fact_molds',
            'fact_delivery_client',
            'fact_taxes',
            'fact_commercial',
            'fact_charity',
            'fact_other',
            'fact_revenue',
        ].forEach(key => delete hints[key]);
        factData._source_hints = hints;
        factData._auto_fintablo = {};
        this._setFinTabloBreakdowns(factData, {});
        factData._material_fact_breakdown = {};
        this._setStaleFinTabloSummary(factData, null);
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

    _snapshotMonthKey() {
        this._ensurePeriodState();
        return this._periodKind === 'month' ? String(this._periodAnchor || this._currentMonthValue()) : '';
    },

    _currentMonthKey() {
        return this._currentMonthValue();
    },

    _isPastMonthKey(monthKey) {
        const normalized = String(monthKey || '').slice(0, 7);
        return !!normalized && normalized < this._currentMonthKey();
    },

    _getSnapshotStore() {
        if (!this._monthSnapshots || typeof this._monthSnapshots !== 'object') this._monthSnapshots = {};
        return this._monthSnapshots;
    },

    _getActiveSnapshot() {
        const monthKey = this._snapshotMonthKey();
        if (!monthKey || !this._isPastMonthKey(monthKey)) return null;
        const snapshot = this._getSnapshotStore()[monthKey];
        if (!snapshot || !Array.isArray(snapshot.records)) return null;
        return snapshot;
    },

    _makeLiveRecord(computed) {
        if (!computed?.order) return null;
        return {
            orderId: Number(computed.order.id),
            order: computed.order,
            planData: computed.planData || {},
            planHours: computed.planHours || {},
            planMeta: computed.planMeta || {},
            factData: computed.factData || {},
            snapshot: false,
            snapshotMeta: null,
        };
    },

    async _getVisibleOrderRecords() {
        const snapshot = this._getActiveSnapshot();
        if (snapshot) {
            return (snapshot.records || []).map(record => ({
                ...JSON.parse(JSON.stringify(record)),
                snapshot: true,
                snapshotMeta: {
                    monthKey: snapshot.monthKey || this._snapshotMonthKey(),
                    savedAt: snapshot.savedAt || snapshot.saved_at || '',
                },
            }));
        }
        const computedOrders = await Promise.all(this._filteredOrders.map(order => this._ensureComputedOrder(order)));
        return computedOrders.map(computed => this._makeLiveRecord(computed)).filter(Boolean);
    },

    async saveMonthlySnapshot() {
        if (this._periodKind !== 'month') {
            App.toast('Снимки доступны только для помесячной аналитики');
            return;
        }
        const period = this._getPeriodRange();
        const computedOrders = await Promise.all(this._filteredOrders.map(order => this._ensureComputedOrder(order)));
        const records = computedOrders
            .map(computed => this._makeLiveRecord(computed))
            .filter(Boolean)
            .map(record => JSON.parse(JSON.stringify({
                orderId: record.orderId,
                order: record.order,
                planData: record.planData,
                planHours: record.planHours,
                planMeta: record.planMeta,
                factData: record.factData,
            })));
        const store = this._getSnapshotStore();
        const monthKey = this._snapshotMonthKey();
        store[monthKey] = {
            monthKey,
            label: period.label,
            caption: period.caption,
            savedAt: new Date().toISOString(),
            records,
        };
        this._monthSnapshots = store;
        if (typeof saveFactualSnapshots === 'function') {
            await saveFactualSnapshots(store);
        }
        App.toast(`Снимок ${period.label} зафиксирован`);
        await this._renderAll();
    },

    _renderSnapshotBanner() {
        const el = document.getElementById('fact-snapshot-banner');
        if (!el) return;
        if (this._periodKind !== 'month') {
            el.innerHTML = '';
            return;
        }

        const monthKey = this._snapshotMonthKey();
        const snapshot = this._getSnapshotStore()[monthKey];
        const isPast = this._isPastMonthKey(monthKey);
        const savedAt = snapshot?.savedAt || snapshot?.saved_at || '';
        const savedLabel = savedAt ? this._formatDateLabel(new Date(savedAt)) : '';

        if (snapshot && Array.isArray(snapshot.records) && isPast) {
            el.innerHTML = `<div class="card" style="padding:12px 14px;border:1px solid rgba(34,197,94,0.25);background:rgba(34,197,94,0.06)">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
                    <div>
                        <div style="font-weight:700;color:var(--green)">Снимок месяца активен</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
                            Для ${this._esc(monthKey)} показывается зафиксированный срез${savedLabel ? ` от ${savedLabel}` : ''}. Эти цифры не дрейфуют от поздних правок заказов.
                        </div>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="Factual.saveMonthlySnapshot()">Обновить снимок</button>
                </div>
            </div>`;
            return;
        }

        if (isPast) {
            el.innerHTML = `<div class="card" style="padding:12px 14px;border:1px solid rgba(245,158,11,0.35);background:#fff7ed">
                <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
                    <div>
                        <div style="font-weight:700;color:#92400e">Снимок месяца ещё не зафиксирован</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
                            Сейчас для ${this._esc(monthKey)} показываются живые данные. Если позже кто-то пересохранит заказ, цифры месяца изменятся.
                        </div>
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="Factual.saveMonthlySnapshot()">Зафиксировать месяц</button>
                </div>
            </div>`;
            return;
        }

        el.innerHTML = `<div class="card" style="padding:12px 14px">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
                <div>
                    <div style="font-weight:700">Текущий месяц показывается по живым данным</div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
                        Можно вручную зафиксировать снапшот, когда нужно закрыть месяц для финдиректора.
                    </div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="Factual.saveMonthlySnapshot()">Зафиксировать сейчас</button>
            </div>
        </div>`;
    },

    // ==========================================
    // Render all
    // ==========================================

    async _renderAll() {
        this._visibleOrderRecords = await this._getVisibleOrderRecords();
        this._renderSnapshotBanner();
        await this._renderGlobalStats();
        this._renderOrdersTable();
    },

    async _renderGlobalStats() {
        const records = Array.isArray(this._visibleOrderRecords) ? this._visibleOrderRecords : [];
        const orders = records.map(record => record.order).filter(Boolean);
        const $ = id => document.getElementById(id);
        if (!$('fact-stat-orders')) return;

        const period = this._getPeriodRange();

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

        records.forEach(record => {
            const order = record?.order || {};
            const plan = record?.planData || {};
            const planHours = record?.planHours || {};
            const fact = record?.factData || {};

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
            ordersHint.textContent = 'Внутри каждого заказа отдельно показаны: план заказа, факт производства и факт денег. Для прошлого месяца может открываться зафиксированный снапшот.';
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

    _sourceBadgeStyle(label) {
        const normalized = String(label || '').toLowerCase();
        if (normalized.includes('финтабло')) return 'background:rgba(59,130,246,0.12);color:#1d4ed8;border:1px solid rgba(59,130,246,0.18)';
        if (normalized.includes('план')) return 'background:rgba(148,163,184,0.14);color:#475569;border:1px solid rgba(148,163,184,0.2)';
        if (normalized.includes('склад') || normalized.includes('фурнитура проекта')) return 'background:rgba(16,185,129,0.12);color:#047857;border:1px solid rgba(16,185,129,0.18)';
        if (normalized.includes('вручную')) return 'background:rgba(245,158,11,0.12);color:#b45309;border:1px solid rgba(245,158,11,0.2)';
        if (normalized.includes('ожидает')) return 'background:#fff7ed;color:#9a3412;border:1px solid rgba(245,158,11,0.25)';
        if (normalized.includes('формула') || normalized.includes('табель') || normalized.includes('норма') || normalized.includes('заказ')) return 'background:rgba(168,85,247,0.1);color:#7e22ce;border:1px solid rgba(168,85,247,0.16)';
        return 'background:var(--bg-muted);color:var(--text-muted);border:1px solid var(--border)';
    },

    _renderSourceBadges(labels = []) {
        const unique = [...new Set((labels || []).filter(Boolean).map(label => String(label).trim()).filter(Boolean))];
        if (!unique.length) return '';
        return `<div style="display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;margin-top:4px">${unique.map(label => {
            return `<span style="display:inline-flex;align-items:center;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:600;${this._sourceBadgeStyle(label)}">${this._esc(label)}</span>`;
        }).join('')}</div>`;
    },

    _renderBreakdownDetails(detailHtml = '') {
        if (!detailHtml) return '';
        return `<details style="margin-top:4px">
            <summary style="cursor:pointer;font-size:11px;color:var(--text-muted)">из чего сложилось</summary>
            <div style="margin-top:6px;font-size:11px;line-height:1.4;color:var(--text-muted)">${detailHtml}</div>
        </details>`;
    },

    _renderLayerCell(view = {}, options = {}) {
        const amount = view?.amount;
        const hasValue = amount != null && (this._num(amount) > 0 || view?.showZero);
        const amountHtml = options.editable
            ? `<input type="text" inputmode="decimal" value="${this._num(amount) || ''}"
                class="fact-input ${options.inputClass || ''}" ${options.disabled ? 'disabled' : ''}
                oninput="${options.onInput || ''}">`
            : (hasValue ? `<div>${this.fmtRub(amount)}</div>` : '<div class="text-muted">—</div>');
        return `<div style="min-width:0">
            ${amountHtml}
            ${this._renderSourceBadges(view?.labels || [])}
            ${this._renderBreakdownDetails(view?.detailHtml || '')}
            ${view?.actionHtml ? `<div style="margin-top:6px">${view.actionHtml}</div>` : ''}
        </div>`;
    },

    _buildMaterialPlanLabels(meta = {}) {
        const labels = ['план'];
        if (meta.source === 'current_warehouse') labels.push('склад');
        else if (meta.source === 'manual_items') labels.push('ожидает подтверждения');
        else if (meta.source === 'mixed') labels.push('склад', 'ожидает подтверждения');
        return labels;
    },

    _buildPlanRowLabels(rowKey, planMeta = {}) {
        const meta = planMeta?.[rowKey] || {};
        if (this.MATERIAL_ROW_KEYS.has(rowKey)) return this._buildMaterialPlanLabels(meta);
        if (rowKey.startsWith('salary_')) {
            const labels = ['план'];
            if (meta.source === 'blank_norms' || meta.source === 'blank_norms_plus_manual') labels.push('бланки');
            if (meta.source === 'saved_items' || meta.source === 'saved_order' || meta.source === 'blank_norms_plus_manual') labels.push('заказ');
            return labels;
        }
        if (rowKey === 'indirect_production') return ['план', 'формула'];
        if (rowKey === 'taxes' || rowKey === 'commercial' || rowKey === 'charity') return ['план', 'формула'];
        if (rowKey === 'plastic' || rowKey === 'molds') return ['план', 'норма'];
        return ['план'];
    },

    _buildMoneyRowLabels(rowKey, factData = {}, planMeta = {}) {
        if (rowKey === 'revenue') {
            if (this._isManualOverride(factData, 'fact_revenue')) return ['вручную'];
            if (factData?._auto_fintablo?.fact_revenue) return ['ФинТабло'];
            return [];
        }
        const factKey = `fact_${rowKey}`;
        if (this._isManualOverride(factData, factKey)) return ['вручную'];
        if (factData?._auto_fintablo?.[factKey]) return ['ФинТабло'];
        if (this.MATERIAL_ROW_KEYS.has(rowKey)) {
            const breakdown = this._getMaterialFactBreakdowns(factData)?.[rowKey] || {};
            const labels = [];
            if (this._num(breakdown.warehouseActual) > 0) labels.push(breakdown.actualHint || 'склад');
            if (this._num(breakdown.confirmedManual) > 0) labels.push('вручную');
            if (!labels.length && (this._num(breakdown.warehousePlan) > 0 || this._num(breakdown.manualPlan) > 0)) labels.push('ожидает подтверждения');
            return labels.length ? labels : this._buildMaterialPlanLabels(planMeta?.[rowKey] || {});
        }
        const hint = this._getRowSourceHint(factData, factKey, '');
        if (hint.includes('переимпорт')) return ['нужен переимпорт'];
        if (hint.includes('ФинТабло')) return ['ФинТабло'];
        if (hint.includes('вручную')) return ['вручную'];
        if (hint.includes('табель') || hint.includes('legacy')) return ['табель'];
        if (hint.includes('формула')) return ['формула'];
        if (hint.includes('план')) return ['план'];
        return [];
    },

    _buildMoneyRowDetail(rowKey, factData = {}, planMeta = {}, planData = {}) {
        const breakdownRows = this._getFinTabloBreakdowns(factData)[`fact_${rowKey}`];
        if (Array.isArray(breakdownRows) && breakdownRows.length) {
            return breakdownRows.slice(0, 8).map(row => {
                const label = this._esc(row.description || row.category || 'операция');
                return `${label} — ${this.fmtRub(row.amount)}`;
            }).join('<br>');
        }
        if (this.MATERIAL_ROW_KEYS.has(rowKey)) {
            const breakdown = this._getMaterialFactBreakdowns(factData)?.[rowKey] || {};
            const lines = [];
            if (this._num(breakdown.warehousePlan) > 0) lines.push(`план со склада — ${this.fmtRub(breakdown.warehousePlan)}`);
            if (Array.isArray(breakdown.details) && breakdown.details.length) {
                breakdown.details.slice(0, 6).forEach(item => {
                    lines.push(`${item.label} · ${item.qty} шт — ${this.fmtRub(item.amount)}`);
                });
            } else if (this._num(breakdown.warehouseActual) > 0) {
                lines.push(`подтверждено складом — ${this.fmtRub(breakdown.warehouseActual)}`);
            }
            if (this._num(breakdown.manualPlan) > 0) lines.push(`кастом по заказу — ${this.fmtRub(breakdown.manualPlan)}`);
            if (this._num(breakdown.confirmedManual) > 0) lines.push(`подтверждено вручную — ${this.fmtRub(breakdown.confirmedManual)}`);
            if (!this._num(breakdown.confirmedManual) && this._num(breakdown.manualPlan) > 0) lines.push(`ожидает подтверждения — ${this.fmtRub(breakdown.manualPlan)}`);
            return lines.join('<br>');
        }
        if (rowKey === 'other') {
            const stale = this._getStaleFinTabloSummary(factData);
            if (stale && this._num(stale.total) > 0) {
                const dateLabel = stale.latestUpdatedAt ? this._formatDateLabel(new Date(stale.latestUpdatedAt)) : '';
                return `старый split-импорт ФинТабло без расшифровки исключён из факта денег — ${this.fmtRub(stale.total)}${dateLabel ? ` · последнее обновление ${dateLabel}` : ''}<br>нужен новый переимпорт из ФинТабло`;
            }
        }
        if (rowKey === 'taxes') {
            const factRevenue = this._num(factData.fact_revenue);
            const taxRate = this._taxRate(App.params || {});
            return factRevenue > 0 ? `${round2(taxRate * 100)}% от ${this.fmtRub(factRevenue)} без НДС` : '';
        }
        if (rowKey === 'commercial') {
            const factRevenue = this._num(factData.fact_revenue);
            const grossRevenue = round2(factRevenue * this._grossMultiplier(App.params || {}));
            return factRevenue > 0 ? `6.5% от ${this.fmtRub(grossRevenue)} с НДС` : '';
        }
        if (rowKey === 'charity') {
            const factRevenue = this._num(factData.fact_revenue);
            const grossRevenue = round2(factRevenue * this._grossMultiplier(App.params || {}));
            return factRevenue > 0 ? `1% от ${this.fmtRub(grossRevenue)} с НДС` : '';
        }
        if ((rowKey === 'plastic' || rowKey === 'molds') && this._num(planData?.[rowKey === 'delivery_client' ? 'delivery' : rowKey]) > 0) {
            return `без отдельного денежного факта, пока используем расчетную норму — ${this.fmtRub(planData[rowKey === 'delivery_client' ? 'delivery' : rowKey])}`;
        }
        return '';
    },

    _buildProductionMaterialView(rowKey, factData = {}, planMeta = {}) {
        const breakdown = this._getMaterialFactBreakdowns(factData)?.[rowKey] || {};
        const amount = round2(this._num(breakdown.warehouseActual) + this._num(breakdown.confirmedManual));
        const labels = [];
        if (this._num(breakdown.warehouseActual) > 0) labels.push(breakdown.actualHint || 'склад');
        if (this._num(breakdown.confirmedManual) > 0) labels.push('вручную');
        if (!labels.length && (this._num(breakdown.warehousePlan) > 0 || this._num(breakdown.manualPlan) > 0)) labels.push('ожидает подтверждения');
        const lines = [];
        if (this._num(breakdown.warehousePlan) > 0) lines.push(`план со склада — ${this.fmtRub(breakdown.warehousePlan)}`);
        if (Array.isArray(breakdown.details) && breakdown.details.length) {
            breakdown.details.slice(0, 6).forEach(item => {
                lines.push(`${item.label} · ${item.qty} шт — ${this.fmtRub(item.amount)}`);
            });
        } else if (this._num(breakdown.warehouseActual) > 0) {
            lines.push(`подтверждено складом — ${this.fmtRub(breakdown.warehouseActual)}`);
        }
        if (this._num(breakdown.manualPlan) > 0) lines.push(`кастом по заказу — ${this.fmtRub(breakdown.manualPlan)}`);
        if (this._num(breakdown.confirmedManual) > 0) lines.push(`подтверждено вручную — ${this.fmtRub(breakdown.confirmedManual)}`);
        if (!this._num(breakdown.confirmedManual) && this._num(breakdown.manualPlan) > 0) lines.push(`ожидает подтверждения — ${this.fmtRub(breakdown.manualPlan)}`);
        return {
            amount,
            labels,
            detailHtml: lines.join('<br>'),
            waitingManual: this._num(breakdown.manualPlan) > this._num(breakdown.confirmedManual),
            manualOutstanding: round2(Math.max(0, this._num(breakdown.manualPlan) - this._num(breakdown.confirmedManual))),
        };
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

        const records = Array.isArray(this._visibleOrderRecords) ? this._visibleOrderRecords : [];

        if (records.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center" style="padding:24px">Нет заказов за выбранный период</td></tr>';
            return;
        }

        // Group orders by section
        const groups = { production: [], sample: [], completed: [] };
        records.forEach(record => {
            const sec = this._getSection(record?.order?.status);
            groups[sec].push(record);
        });

        const sectionMeta = [
            { key: 'production', label: '⚙️ В производстве', color: 'var(--yellow)' },
            { key: 'sample',     label: '🔬 Образцы',        color: 'var(--accent)' },
            { key: 'completed',  label: '✅ Готово',          color: 'var(--green)' },
        ];

        let html = '';
        sectionMeta.forEach(sec => {
            const sectionRecords = groups[sec.key];
            if (sectionRecords.length === 0) return;

            // Section header row
            html += `<tr class="fact-section-header">
                <td colspan="9" style="padding:10px 8px 6px;font-weight:700;font-size:13px;color:${sec.color};border-bottom:2px solid ${sec.color};background:var(--bg)">
                    ${sec.label} <span style="font-weight:400;font-size:12px;color:var(--text-muted)">(${sectionRecords.length})</span>
                </td>
            </tr>`;

            sectionRecords.forEach(record => {
                html += this._renderOrderRow(record);
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

    _renderOrderRow(record) {
    const o = record?.order || {};
    const planRevenue = this._num(record?.planData?.revenue ?? o.total_revenue_plan);
    const planCost = this._num(record?.planData?.totalCosts ?? o.total_cost_plan);
    const planResult = this._calcProfitability(planRevenue, planCost);
    const status = this.STATUS_LABELS[o.status] || o.status;
    const isOpen = this._openOrderId === o.id;
    const snapshotHint = record?.snapshot ? '<div class="text-muted" style="font-size:10px;margin-top:2px">снимок месяца</div>' : '';

    let html = `<tr class="fact-order-row ${isOpen ? 'fact-row-open' : ''}" onclick="Factual.toggleDetail(${o.id})" style="cursor:pointer">
        <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${this._esc(o.order_name || '—')}${snapshotHint}</td>
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
    const records = Array.isArray(this._visibleOrderRecords) ? this._visibleOrderRecords : [];
    records.forEach(record => {
        const o = record?.order || {};
        const f = record?.factData;
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
                const planCost = this._num(record?.planData?.totalCosts ?? o.total_cost_plan);
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

        const snapshotRecord = (this._visibleOrderRecords || []).find(record => Number(record?.orderId) === Number(orderId));
        if (snapshotRecord?.snapshot) {
            this._renderDetail(
                orderId,
                container,
                snapshotRecord.planData || {},
                snapshotRecord.planHours || {},
                snapshotRecord.factData || {},
                snapshotRecord.order || {},
                snapshotRecord.planMeta || {},
                { snapshot: true, snapshotMeta: snapshotRecord.snapshotMeta || null }
            );
            return;
        }

        const computed = await this._ensureComputedOrder(orderId);
        if (!computed) {
            container.innerHTML = '<p class="text-muted">Заказ не найден</p>';
            return;
        }
        const { order, planData, planHours, factData, planMeta } = computed;
        this._renderDetail(orderId, container, planData, planHours, factData, order, planMeta || {}, { snapshot: false, snapshotMeta: null });
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
        const taxes = this._calcTaxesByRevenue(orderRevenue, params);
        const commercial = this._calcCommercialByRevenue(orderRevenue, params);
        const charity = this._calcCharityByRevenue(orderRevenue, params);
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

        const hasWarehousePlan = hardwareWarehouseTotal > 0 || nfcWarehouseTotal > 0 || packagingWarehouseTotal > 0;
        if (!hasWarehousePlan && !hardwareManualTotal && !nfcManualTotal && !packagingManualTotal) return planBuild;

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

        const materialSource = (warehouseTotal, manualTotal) => {
            const hasWarehouse = this._num(warehouseTotal) > 0;
            const hasManual = this._num(manualTotal) > 0;
            if (hasWarehouse && hasManual) return 'mixed';
            if (hasWarehouse) return 'current_warehouse';
            if (hasManual) return 'manual_items';
            return 'none';
        };

        const planMeta = planBuild.planMeta || {};
        planMeta.hardware_total = {
            source: materialSource(hardwareWarehouseTotal, hardwareManualTotal),
            warehouseTotal: round2(hardwareWarehouseTotal),
            manualTotal: round2(hardwareManualTotal),
        };
        planMeta.nfc_total = {
            source: materialSource(nfcWarehouseTotal, nfcManualTotal),
            warehouseTotal: round2(nfcWarehouseTotal),
            manualTotal: round2(nfcManualTotal),
        };
        planMeta.packaging_total = {
            source: materialSource(packagingWarehouseTotal, packagingManualTotal),
            warehouseTotal: round2(packagingWarehouseTotal),
            manualTotal: round2(packagingManualTotal),
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
        await this._applyDerivedFacts(factData, planData, planHours, App.params || {}, orderId, cached.order?.order_name || '', cached.order || null, cached.items || [], cached.planMeta || {});
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
        await this._applyDerivedFacts(factData, planData, planHours, params, orderId, order.order_name || '', order, rawItems || [], planMeta || {});

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

    async _applyDerivedFacts(factData, planData, planHours, params, orderId, orderName, orderRef = null, orderItems = [], planMeta = {}) {
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

        this._resetDerivedMoneyFacts(factData);

        // 1. Salaries from time entries (per-stage)
        this._applyAutoFactValue(factData, 'fact_salary_production', stageSalary.casting);
        this._applyAutoFactValue(factData, 'fact_salary_trim', stageSalary.trim);
        this._applyAutoFactValue(factData, 'fact_salary_assembly', stageSalary.assembly);
        this._applyAutoFactValue(factData, 'fact_salary_packaging', stageSalary.packaging);

        // 2. Indirect costs from hours
        this._applyAutoFactValue(factData, 'fact_indirect_production', totalHours * (params?.indirectPerHour || 0));

        // 3. FinTablo imports — pull all available fact fields
        const rawImports = (await loadFintabloImports(orderId)) || [];
        const { healthy: imports, stale: staleImports } = this._partitionFinTabloImports(rawImports);
        this._setStaleFinTabloSummary(factData, this._summarizeStaleFinTabloImports(staleImports));
        if (imports.length > 0) {
            const importTotals = imports.reduce((acc, row) => {
                acc.fact_materials += this._num(row?.fact_materials);
                acc.fact_hardware += this._num(row?.fact_hardware);
                acc.fact_packaging += this._num(row?.fact_packaging);
                acc.fact_delivery += this._num(row?.fact_delivery);
                acc.fact_printing += this._num(row?.fact_printing);
                acc.fact_molds += this._num(row?.fact_molds);
                acc.fact_taxes += this._num(row?.fact_taxes);
                acc.fact_commercial += this._num(row?.fact_commercial);
                acc.fact_charity += this._num(row?.fact_charity);
                acc.fact_other += this._num(row?.fact_other);
                acc.fact_revenue += this._num(row?.fact_revenue);
                return acc;
            }, {
                fact_materials: 0,
                fact_hardware: 0,
                fact_packaging: 0,
                fact_delivery: 0,
                fact_printing: 0,
                fact_molds: 0,
                fact_taxes: 0,
                fact_commercial: 0,
                fact_charity: 0,
                fact_other: 0,
                fact_revenue: 0,
            });
            const breakdown = {};
            const ftKeyToFactKey = {
                fact_materials: 'fact_plastic',
                fact_hardware: 'fact_hardware_total',
                fact_packaging: 'fact_packaging_total',
                fact_delivery: 'fact_delivery_client',
                fact_printing: 'fact_design_printing',
                fact_molds: 'fact_molds',
                fact_taxes: 'fact_taxes',
                fact_commercial: 'fact_commercial',
                fact_charity: 'fact_charity',
                fact_other: 'fact_other',
            };
            imports.forEach(row => {
                const importBreakdown = row?.raw_data?.field_breakdown;
                if (!importBreakdown || typeof importBreakdown !== 'object') return;
                Object.entries(importBreakdown).forEach(([ftKey, rows]) => {
                    const factKey = ftKeyToFactKey[ftKey];
                    if (!factKey || !Array.isArray(rows) || !rows.length) return;
                    if (!Array.isArray(breakdown[factKey])) breakdown[factKey] = [];
                    rows.forEach(item => {
                        const amount = this._num(item?.amount);
                        if (amount <= 0) return;
                        breakdown[factKey].push({
                            amount,
                            description: String(item?.description || '').trim(),
                            category: String(item?.category || '').trim(),
                            date: item?.date || '',
                        });
                    });
                });
            });
            Object.keys(breakdown).forEach(key => {
                breakdown[key] = breakdown[key]
                    .sort((a, b) => this._num(b.amount) - this._num(a.amount))
                    .slice(0, 10);
            });
            this._setFinTabloBreakdowns(factData, breakdown);

            const ftMap = {
                fact_hardware: 'fact_hardware_total',
                fact_printing: 'fact_design_printing',
                fact_molds: 'fact_molds',
                fact_delivery: 'fact_delivery_client',
                fact_other: 'fact_other',
                fact_charity: 'fact_charity',
            };

            for (const [ftKey, ourKey] of Object.entries(ftMap)) {
                const val = this._num(importTotals[ftKey]);
                if (val > 0) {
                    this._applyAutoFactValue(factData, ourKey, val);
                    factData._auto_fintablo[ourKey] = true;
                    this._setSourceHint(factData, ourKey, 'ФинТабло');
                }
            }

            const ftMaterials = this._num(importTotals.fact_materials);
            if (ftMaterials > 0 && this._num(planData?.plastic) <= 0) {
                this._applyAutoFactValue(factData, 'fact_plastic', ftMaterials);
                factData._auto_fintablo.fact_plastic = true;
                this._setSourceHint(factData, 'fact_plastic', 'ФинТабло');
            }

            const ftRevenue = this._num(importTotals.fact_revenue);
            if (ftRevenue > 0) {
                this._applyAutoFactValue(factData, 'fact_revenue', ftRevenue);
                factData._auto_fintablo.fact_revenue = true;
            }

            const importedTaxes = this._num(importTotals.fact_taxes);
            const importedCommercial = this._num(importTotals.fact_commercial);
            const importedCharity = this._num(importTotals.fact_charity);
            const currentFactRevenue = this._num(factData.fact_revenue);
            const taxRate = this._taxRate(params);
            const taxesByRevenue = currentFactRevenue > 0 ? this._calcTaxesByRevenue(currentFactRevenue, params) : 0;
            const commercialByRevenue = currentFactRevenue > 0 ? this._calcCommercialByRevenue(currentFactRevenue, params) : 0;
            const charityByRevenue = currentFactRevenue > 0 ? this._calcCharityByRevenue(currentFactRevenue, params) : 0;
            const effectiveTaxes = importedTaxes > 0 ? importedTaxes : taxesByRevenue;
            if (effectiveTaxes > 0) {
                this._applyAutoFactValue(factData, 'fact_taxes', effectiveTaxes);
                factData._auto_fintablo.fact_taxes = importedTaxes > 0;
                this._setSourceHint(
                    factData,
                    'fact_taxes',
                    importedTaxes > 0 ? 'ФинТабло' : `${round2(taxRate * 100)}% от факта выручки без НДС`
                );
            }
            const effectiveCommercial = importedCommercial > 0 ? importedCommercial : commercialByRevenue;
            if (effectiveCommercial > 0) {
                this._applyAutoFactValue(factData, 'fact_commercial', effectiveCommercial);
                factData._auto_fintablo.fact_commercial = importedCommercial > 0;
                this._setSourceHint(factData, 'fact_commercial', importedCommercial > 0 ? 'ФинТабло' : '6.5% от факта выручки с НДС');
            }
            const effectiveCharity = importedCharity > 0 ? importedCharity : charityByRevenue;
            if (effectiveCharity > 0) {
                this._applyAutoFactValue(factData, 'fact_charity', effectiveCharity);
                factData._auto_fintablo.fact_charity = importedCharity > 0;
                this._setSourceHint(factData, 'fact_charity', importedCharity > 0 ? 'ФинТабло' : '1% от факта выручки с НДС');
            }

            const ftPackaging = this._num(importTotals.fact_packaging);
            if (ftPackaging > 0) {
                this._applyAutoFactValue(factData, 'fact_packaging_total', ftPackaging);
                factData._auto_fintablo.fact_packaging_total = true;
                this._setSourceHint(factData, 'fact_packaging_total', 'ФинТабло');
            }
        }

        if (!this._isManualOverride(factData, 'fact_plastic') && !factData._auto_fintablo.fact_plastic && this._num(planData?.plastic) > 0) {
            this._applyAutoFactValue(factData, 'fact_plastic', planData.plastic);
            this._setSourceHint(factData, 'fact_plastic', 'план');
        }
        if (!this._isManualOverride(factData, 'fact_molds') && !factData._auto_fintablo.fact_molds && this._num(planData?.molds) > 0) {
            this._applyAutoFactValue(factData, 'fact_molds', planData.molds);
            this._setSourceHint(factData, 'fact_molds', 'план');
        }

        // 4. Warehouse fallback for hardware/packaging (only if fintablo didn't provide them)
        const whActual = this._isWorkshopOrder(orderRef || orderName)
            ? await this._deriveWorkshopMaterialFacts(orderId, orderRef || { order_name: orderName }, orderItems || [])
            : await this._deriveMaterialFacts(orderId, orderName);
        const confirmedMaterials = this._getConfirmedMaterialFacts(factData);
        const resolveMaterialFallback = (rowKey, actualValue, meta = {}, actualHint, waitingHint, details = []) => {
            const factKey = `fact_${rowKey}`;
            const warehousePlan = this._num(meta?.warehouseTotal);
            const manualPlan = this._num(meta?.manualTotal);
            const warehouseActual = whActual.found ? this._num(actualValue) : 0;
            const confirmedManual = this._num(confirmedMaterials?.[rowKey]?.amount);
            const nextValue = round2(Math.max(0, warehouseActual + confirmedManual));

            this._setMaterialFactBreakdown(factData, rowKey, {
                warehousePlan: round2(warehousePlan),
                manualPlan: round2(manualPlan),
                warehouseActual: round2(warehouseActual),
                confirmedManual: round2(confirmedManual),
                details: Array.isArray(details) ? details : [],
                actualHint: actualHint || 'склад',
                waitingHint,
            });

            if (!factData._auto_fintablo[factKey]) {
                this._applyAutoFactValue(factData, factKey, nextValue);
                let hint = '';
                if (warehouseActual > 0 && confirmedManual > 0) hint = `${actualHint} + вручную подтверждено`;
                else if (warehouseActual > 0) hint = actualHint || 'склад';
                else if (confirmedManual > 0) hint = 'вручную подтверждено';
                else if (warehousePlan > 0 || manualPlan > 0) hint = waitingHint;
                if (hint) this._setSourceHint(factData, factKey, hint);
            }
        };

        resolveMaterialFallback(
            'hardware_total',
            whActual.hardware,
            planMeta?.hardware_total || {},
            whActual.sourceHint || 'склад',
            'ожидает подтверждения',
            whActual.hardwareDetails || []
        );
        resolveMaterialFallback(
            'nfc_total',
            whActual.nfc,
            planMeta?.nfc_total || {},
            whActual.nfcSourceHint || whActual.sourceHint || 'склад',
            'ожидает подтверждения',
            whActual.nfcDetails || []
        );
        resolveMaterialFallback(
            'packaging_total',
            whActual.packaging,
            planMeta?.packaging_total || {},
            whActual.packagingSourceHint || whActual.sourceHint || 'склад',
            'ожидает подтверждения',
            whActual.packagingDetails || []
        );
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
        const hardwareDetails = [];
        const nfcDetails = [];
        const packagingDetails = [];
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
            const detailEntry = {
                label: this._esc((row.names || []).join(', ') || (itemMap.get(itemId) || {}).name || `#${itemId}`),
                qty: round2(consumedQty),
                amount: deltaCost,
            };
            if (category === 'packaging') {
                packaging += deltaCost;
                packagingDetails.push(detailEntry);
            } else if (this._isNfcWarehouseRow(row, itemMap.get(itemId) || null)) {
                nfc += deltaCost;
                nfcDetails.push(detailEntry);
            } else {
                hardware += deltaCost;
                hardwareDetails.push(detailEntry);
            }
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
            hardwareDetails,
            nfcDetails,
            packagingDetails,
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
        const byGroup = {
            hardware: new Map(),
            nfc: new Map(),
            packaging: new Map(),
        };
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
            const entryLabel = String(h.item_name || (itemMap.get(Number(h.item_id)) || {}).name || h.sku || `#${h.item_id}`).trim() || `#${h.item_id}`;
            const qtyAbs = Math.abs(this._num(qtyChange));
            const addDetail = (bucketKey, label) => {
                const bucket = byGroup[bucketKey];
                const prev = bucket.get(label) || { label: this._esc(label), qty: 0, amount: 0 };
                prev.qty = round2(prev.qty + qtyAbs);
                prev.amount = round2(prev.amount + deltaCost);
                bucket.set(label, prev);
            };
            if (category === 'packaging') {
                packaging += deltaCost;
                addDetail('packaging', entryLabel);
            } else {
                hardware += deltaCost;
                addDetail('hardware', entryLabel);
            }
            if (category !== 'packaging' && this._isNfcWarehouseRow(h, itemMap.get(Number(h.item_id)) || null)) {
                nfc += deltaCost;
                hardware -= deltaCost;
                addDetail('nfc', entryLabel);
                const hardwareBucket = byGroup.hardware.get(entryLabel);
                if (hardwareBucket) {
                    hardwareBucket.amount = round2(hardwareBucket.amount - deltaCost);
                    if (hardwareBucket.amount <= 0.009) byGroup.hardware.delete(entryLabel);
                    else byGroup.hardware.set(entryLabel, hardwareBucket);
                }
            }
            found = true;
        });
        return {
            found,
            hardware: round2(Math.max(0, hardware)),
            nfc: round2(Math.max(0, nfc)),
            packaging: round2(Math.max(0, packaging)),
            nfcSourceHint: found ? 'склад' : 'план',
            hardwareDetails: Array.from(byGroup.hardware.values()).filter(item => item.amount > 0),
            nfcDetails: Array.from(byGroup.nfc.values()).filter(item => item.amount > 0),
            packagingDetails: Array.from(byGroup.packaging.values()).filter(item => item.amount > 0),
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

    _renderDetail(orderId, container, plan, planHours, fact, order, planMeta = {}, options = {}) {
    let html = '';

    const isSnapshot = !!options?.snapshot;
    const snapshotSavedAt = options?.snapshotMeta?.savedAt || '';
    const planRev = this._num(plan.revenue);
    const planCost = this._num(plan.totalCosts);
    const factRev = this._num(fact.fact_revenue);
    let factCost = 0;
    this.ROWS.forEach(r => { factCost += this._num(fact['fact_' + r.key]); });
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
        const planVal = this._num(plan[row.planField]);
        const factVal = this._num(fact[`fact_${row.key}`]);
        if (row.key === 'molds' && planVal === 0 && factVal === 0) return sum;
        const isSalaryRow = row.key.startsWith('salary_') || row.key === 'indirect_production';
        if (isSalaryRow && !_isAdmin) return sum;
        return sum + planVal;
    }, 0));
    const planTotalBase = round2(plan.totalCosts || planTotalRowsVisible);
    const hasPlanDrift = Math.abs(planTotalRowsVisible - planTotalBase) > 0.01;
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

    let productionTotal = 0;

    if (isSnapshot) {
        html += `<div style="margin:0 0 12px;padding:10px 12px;border:1px solid rgba(34,197,94,0.25);border-radius:10px;background:rgba(34,197,94,0.06);font-size:12px">
            <b style="color:var(--green)">Снимок месяца</b>
            <div class="text-muted" style="margin-top:4px">Открыт зафиксированный срез${snapshotSavedAt ? ` от ${this._formatDateLabel(new Date(snapshotSavedAt))}` : ''}. В этом режиме строки только для чтения.</div>
        </div>`;
    }

    html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px">
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План заказа · расходы</span><br><b>${this.fmtRub(planCost)}</b><div class="text-muted" style="font-size:11px">что было заложено в калькуляторе</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт денег · расходы</span><br><b style="color:${hasFactPnL ? (factCost > planCost * 1.15 ? 'var(--red)' : factCost > planCost ? 'var(--yellow)' : 'var(--green)') : 'var(--text-muted)'}">${hasFactPnL ? this.fmtRub(factCost) : '—'}</b><div class="text-muted" style="font-size:11px">ФинТабло + вручную + подтверждённые факты</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План заказа · выручка</span><br><b>${this.fmtRub(planRev)}</b><div class="text-muted" style="font-size:11px">без НДС</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт денег · выручка</span><br><b style="color:${hasFactPnL ? (factRev > 0 ? 'var(--green)' : 'var(--text-muted)') : 'var(--text-muted)'}">${hasFactPnL ? this.fmtRub(factRev) : '—'}</b><div class="text-muted" style="font-size:11px">${factRevenueHint}</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">План заказа · прибыль</span><div style="margin-top:6px">${this._renderCompactResult(planResult)}</div></div>
        <div class="fact-mini-stat"><span class="text-muted" style="font-size:11px">Факт денег · прибыль</span><div style="margin-top:6px">${this._renderCompactResult(factResult)}</div></div>
    </div>`;
    if (fact._legacy_stage_estimate) {
        html += `<div style="margin:-2px 0 10px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--bg-muted);font-size:11px;color:var(--text-muted)">
            ${fact._legacy_stage_scope === 'production_only'
                ? 'Legacy-часы без этапа распределены только в выливание/срезание по плановым стадиям заказа. Сборка и упаковка считаются только по явно указанным этапам.'
                : 'Legacy-часы без этапа распределены по плановым стадиям заказа, чтобы выливание/срезание/сборка отражали реальную загрузку до ручной детализации.'}
        </div>`;
    }
    const staleFinTablo = this._getStaleFinTabloSummary(fact);
    if (staleFinTablo && this._num(staleFinTablo.total) > 0) {
        const staleDateLabel = staleFinTablo.latestUpdatedAt ? this._formatDateLabel(new Date(staleFinTablo.latestUpdatedAt)) : '';
        html += `<div style="margin:-2px 0 10px;padding:8px 10px;border:1px solid #f59e0b;border-radius:10px;background:#fff7ed;font-size:11px;color:#92400e">
            Найден старый split-импорт ФинТабло без расшифровки. Он исключён из факта денег, чтобы не засорять “Прочее”: ${this.fmtRub(staleFinTablo.total)}${staleDateLabel ? ` · последнее обновление ${staleDateLabel}` : ''}. Нужен свежий переимпорт ФинТабло.
        </div>`;
    }
    if (hasPlanDrift) {
        html += `<div style="margin:-2px 0 10px;padding:8px 10px;border:1px solid #f59e0b;border-radius:10px;background:#fff7ed;font-size:11px;color:#92400e">
            Видимые плановые строки сейчас дают ${this.fmtRub(planTotalRowsVisible)}, но сохранённый план заказа в калькуляторе равен ${this.fmtRub(planTotalBase)}. В прибыли и ИТОГО используется сохранённый план заказа.
        </div>`;
    }

    html += '<div style="overflow-x:auto"><table class="data-table" style="width:100%;font-size:12px">';
    html += '<thead><tr><th style="text-align:left;width:24%">Статья расходов</th><th class="text-right" style="width:20%">План заказа</th><th class="text-right" style="width:20%">Факт производства</th><th class="text-right" style="width:23%">Факт денег</th><th class="text-right" style="width:13%">Δ денег</th></tr></thead><tbody>';

    this.ROWS.forEach(row => {
        const planVal = this._num(plan[row.planField]);
        const factKey = `fact_${row.key}`;
        const factVal = this._num(fact[factKey]);
        if (row.key === 'molds' && planVal === 0 && factVal === 0) return;
        const isSalaryRow = row.key.startsWith('salary_') || row.key === 'indirect_production';
        if (isSalaryRow && !_isAdmin) return;

        const planView = {
            amount: planVal,
            showZero: true,
            labels: this._buildPlanRowLabels(row.key, planMeta),
            detailHtml: this._renderPlanRowDetail(row.key, planMeta, plan),
        };

        let productionView = { amount: null, labels: [], detailHtml: '' };
        if (row.key.startsWith('salary_')) {
            productionView = {
                amount: this._num((fact._auto_stage_salary || {})[
                    row.key === 'salary_production' ? 'casting'
                        : row.key === 'salary_trim' ? 'trim'
                        : row.key === 'salary_assembly' ? 'assembly'
                        : 'packaging'
                ]),
                labels: ['табель'],
                detailHtml: factHoursByRow[row.key] > 0 ? this.fmtHours(factHoursByRow[row.key]) : '',
            };
        } else if (row.key === 'indirect_production') {
            productionView = {
                amount: this._num(fact._auto_stage_salary) ? this._num(fact.fact_indirect_production) : this._num(fact.fact_indirect_production),
                labels: factHoursByRow.indirect_production > 0 ? ['табель', 'формула'] : [],
                detailHtml: factHoursByRow.indirect_production > 0
                    ? `${this.fmtHours(factHoursByRow.indirect_production)} × ${this.fmtRub(planMeta?.indirect_production?.perHour || 0)}/ч`
                    : '',
            };
        } else if (this.MATERIAL_ROW_KEYS.has(row.key)) {
            productionView = this._buildProductionMaterialView(row.key, fact, planMeta);
        } else if (row.key === 'plastic' || row.key === 'molds') {
            productionView = {
                amount: planVal,
                labels: planVal > 0 ? ['норма'] : [],
                detailHtml: planVal > 0 ? `расчетная норма из калькулятора — ${this.fmtRub(planVal)}` : '',
            };
        }

        if (productionView.amount != null) productionTotal += this._num(productionView.amount);

        const moneyView = {
            amount: factVal,
            showZero: this.MATERIAL_ROW_KEYS.has(row.key) && !!this._getMaterialFactBreakdowns(fact)?.[row.key],
            labels: this._buildMoneyRowLabels(row.key, fact, planMeta),
            detailHtml: this._buildMoneyRowDetail(row.key, fact, planMeta, plan),
            actionHtml: '',
        };

        if (this.MATERIAL_ROW_KEYS.has(row.key) && !isSnapshot && !this._isManualOverride(fact, factKey) && !fact?._auto_fintablo?.[factKey]) {
            const confirmedAmount = this._num(this._getConfirmedMaterialFacts(fact)?.[row.key]?.amount);
            if (productionView.waitingManual && productionView.manualOutstanding > 0) {
                moneyView.actionHtml = `<button class="btn btn-sm btn-outline" type="button" onclick="event.stopPropagation();Factual.confirmMaterialFact(${orderId}, '${row.key}')">Подтвердить ${this.fmtRub(productionView.manualOutstanding)}</button>`;
            } else if (confirmedAmount > 0) {
                moneyView.actionHtml = `<button class="btn btn-sm btn-outline" type="button" onclick="event.stopPropagation();Factual.clearConfirmedMaterialFact(${orderId}, '${row.key}')">Снять подтверждение</button>`;
            }
        }

        const delta = factVal - planVal;
        const pct = planVal > 0 ? ((delta / planVal) * 100) : 0;
        const alarm = this.getAlarm(factVal, planVal);
        const isAuto = this._isAutoFactRow(fact, row.key);
        const manualOverride = this._isManualOverride(fact, factKey);
        const inputClass = isAuto && !manualOverride ? 'fact-input-auto' : '';
        const resetControl = this._renderAutoResetControl(orderId, row.key, isAuto, manualOverride);
        const rowHint = row.key.startsWith('salary_')
            ? 'план/табель/деньги'
            : this.MATERIAL_ROW_KEYS.has(row.key)
                ? 'план/склад/деньги'
                : this.MONEY_ONLY_ROW_KEYS.has(row.key)
                    ? 'денежная статья'
                    : 'норма/деньги';

        html += `<tr style="${alarm.bgStyle}">
            <td style="padding:8px 8px;font-weight:500;vertical-align:top">
                <div>${row.label}</div>
                <div class="text-muted" style="font-size:10px;margin-top:4px">${rowHint}${resetControl}</div>
            </td>
            <td class="text-right" style="padding:8px 8px;vertical-align:top">${this._renderLayerCell(planView)}</td>
            <td class="text-right" style="padding:8px 8px;vertical-align:top">${this._renderLayerCell(productionView)}</td>
            <td class="text-right" style="padding:8px 4px;vertical-align:top">${this._renderLayerCell(moneyView, {
                editable: !isSnapshot,
                disabled: isSnapshot,
                inputClass,
                onInput: `Factual.onFactInput(${orderId}, '${row.key}', this.value)`,
            })}</td>
            <td class="text-right" style="padding:8px 8px;font-weight:600;color:${alarm.color};vertical-align:top">
                ${factVal > 0 ? alarm.icon + ' ' + this.fmtDelta(delta, pct) : '<span class="text-muted">—</span>'}
            </td>
        </tr>`;
    });

    const productionAlarm = this.getAlarm(productionTotal, planTotalBase);
    const moneyAlarm = this.getAlarm(factCost, planTotalBase);
    const productionDelta = productionTotal - planTotalBase;
    const productionPct = planTotalBase > 0 ? (productionDelta / planTotalBase) * 100 : 0;
    const moneyDelta = factCost - planTotalBase;
    const moneyPct = planTotalBase > 0 ? (moneyDelta / planTotalBase) * 100 : 0;

    html += `<tr style="border-top:2px solid var(--border);font-weight:700;background:var(--bg-muted)">
        <td style="padding:8px">ИТОГО расходы</td>
        <td class="text-right" style="padding:8px">${this.fmtRub(planTotalBase)}</td>
        <td class="text-right" style="padding:8px">${productionTotal > 0 ? `<span style="color:${productionAlarm.color}">${this.fmtRub(productionTotal)}</span><div style="font-size:11px;color:${productionAlarm.color}">${productionAlarm.icon} ${this.fmtDelta(productionDelta, productionPct)}</div>` : '—'}</td>
        <td class="text-right" style="padding:8px">${factCost > 0 ? this.fmtRub(factCost) : '—'}</td>
        <td class="text-right" style="padding:8px;color:${moneyAlarm.color}">${factCost > 0 ? moneyAlarm.icon + ' ' + this.fmtDelta(moneyDelta, moneyPct) : '—'}</td>
    </tr>`;
    html += '</tbody></table></div>';

    html += `<div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:10px;background:var(--card-bg)">
        <div style="font-weight:700;margin-bottom:8px">Деньги по сделке</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end">
            <div>
                <div class="text-muted" style="font-size:11px;margin-bottom:6px">Факт выручка без НДС</div>
                ${isSnapshot
                    ? `<div style="font-weight:600">${factRev > 0 ? this.fmtRub(factRev) : '—'}</div>`
                    : `<input type="text" inputmode="decimal" value="${factRev || ''}"
                        class="fact-input ${revAutoClass}" style="max-width:220px;font-weight:600"
                        oninput="Factual.onFactInput(${orderId}, 'revenue', this.value)">`}
                ${!isSnapshot ? revenueResetControl : ''}
                ${this._renderSourceBadges(this._buildMoneyRowLabels('revenue', fact, planMeta))}
            </div>
            <div class="text-muted" style="font-size:11px;line-height:1.5">
                Факт денег = реальные деньги и статьи расходов по сделке. Факт производства рядом показывает только подтвержденные часы/склад/ручные подтверждения, чтобы план не путался с денежным фактом.
            </div>
        </div>
    </div>`;

    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin-top:12px">';
    this.HOUR_ROWS.forEach(row => {
        const pv = this._num(planHours[row.planField]);
        const fv = this._num(fact[`fact_${row.key}`]);
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
        <textarea class="form-control" rows="2" style="flex:1;font-size:12px" ${isSnapshot ? 'disabled' : ''}
            placeholder="Комментарий..." oninput="Factual.onNotesChange(${orderId}, this.value)">${this._esc(fact.notes || '')}</textarea>
        ${isSnapshot ? '<button class="btn btn-outline" disabled>Снимок</button>' : `<button class="btn btn-success" onclick="Factual.saveFact(${orderId})">💾 Сохранить</button>`}
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

    async confirmMaterialFact(orderId, rowKey) {
        const activeSnapshot = this._getActiveSnapshot();
        if (activeSnapshot) {
            App.toast('Снимок месяца открыт только для чтения');
            return;
        }
        const cached = this._orderCache[orderId] || await this._ensureComputedOrder(orderId);
        if (!cached) return;
        const breakdown = this._getMaterialFactBreakdowns(cached.factData)?.[rowKey] || {};
        const targetAmount = this._num(breakdown.manualPlan);
        if (!(targetAmount > 0)) {
            App.toast('Для этой строки нечего подтверждать вручную');
            return;
        }
        this._setConfirmedMaterialFact(cached.factData, rowKey, {
            amount: round2(targetAmount),
            confirmed_at: new Date().toISOString(),
            source: 'manual_confirmation',
        });
        await this._recomputeCachedFact(cached);
        const container = document.getElementById(`fact-detail-${orderId}`);
        if (container) {
            this._renderDetail(orderId, container, cached.planData, cached.planHours, cached.factData, cached.order, cached.planMeta || {}, { snapshot: false, snapshotMeta: null });
        }
        await this._renderGlobalStats();
        await this._loadFactSummaries();
    },

    async clearConfirmedMaterialFact(orderId, rowKey) {
        const activeSnapshot = this._getActiveSnapshot();
        if (activeSnapshot) {
            App.toast('Снимок месяца открыт только для чтения');
            return;
        }
        const cached = this._orderCache[orderId] || await this._ensureComputedOrder(orderId);
        if (!cached) return;
        this._setConfirmedMaterialFact(cached.factData, rowKey, null);
        await this._recomputeCachedFact(cached);
        const container = document.getElementById(`fact-detail-${orderId}`);
        if (container) {
            this._renderDetail(orderId, container, cached.planData, cached.planHours, cached.factData, cached.order, cached.planMeta || {}, { snapshot: false, snapshotMeta: null });
        }
        await this._renderGlobalStats();
        await this._loadFactSummaries();
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
    _renderPlanRowDetail(rowKey, planMeta = {}, planData = {}) {
        const meta = planMeta?.[rowKey];
        if (meta?.detailHtml) return meta.detailHtml;
        if (rowKey === 'indirect_production') {
            const planHours = this._num(meta?.planHours);
            const perHour = this._num(meta?.perHour || 0);
            return (planHours > 0 || perHour > 0)
                ? `${this.fmtHours(planHours)} × ${this.fmtRub(perHour)}/ч`
                : '';
        }
        if (this.MATERIAL_ROW_KEYS.has(rowKey)) {
            const lines = [];
            if (this._num(meta?.warehouseTotal) > 0) lines.push(`склад по заказу — ${this.fmtRub(meta.warehouseTotal)}`);
            if (this._num(meta?.manualTotal) > 0) lines.push(`задано в заказе — ${this.fmtRub(meta.manualTotal)}`);
            return lines.join('<br>');
        }
        if (rowKey === 'taxes') {
            const rate = this._taxRate(App.params || {});
            return rate > 0 ? `${round2(rate * 100)}% от выручки без НДС` : '';
        }
        if (rowKey === 'commercial') return '6.5% от выручки с НДС';
        if (rowKey === 'charity') return '1% от выручки с НДС';
        if (rowKey === 'plastic' || rowKey === 'molds') {
            const amount = this._num(planData?.[rowKey === 'delivery_client' ? 'delivery' : rowKey]);
            return amount > 0 ? `расчетная норма — ${this.fmtRub(amount)}` : '';
        }
        if (!meta) return '';
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
    _renderFactRowDetail(rowKey, factHoursByRow = {}, planMeta = {}, factData = {}) {
        if (this.MATERIAL_ROW_KEYS.has(rowKey)) {
            return this._buildMoneyRowDetail(rowKey, factData, planMeta, {});
        }
        const factHours = this._num(factHoursByRow?.[rowKey]);
        if (rowKey === 'indirect_production') {
            if (factHours <= 0) return '';
            return `${this.fmtHours(factHours)} × ${this.fmtRub(planMeta?.indirect_production?.perHour || 0)}/ч`;
        }
        if (rowKey.startsWith('salary_')) return factHours > 0 ? this.fmtHours(factHours) : '';

        const breakdownRows = this._getFinTabloBreakdowns(factData)[`fact_${rowKey}`];
        if (Array.isArray(breakdownRows) && breakdownRows.length) {
            return breakdownRows.slice(0, 3).map(row => {
                const label = this._esc(row.description || row.category || 'операция');
                return `${label} — ${this.fmtRub(row.amount)}`;
            }).join('<br>');
        }
        return '';
    },

    _esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

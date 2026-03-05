// =============================================
// Recycle Object — План-факт
// Compare planned vs actual expenses per order
// =============================================

const Factual = {
    currentOrderId: null,
    planData: null,
    factData: null,
    planHours: null,
    _entries: [],
    _orderPlanMeta: null,

    // Cost row definitions: key, label, planField, hint (source of fact data)
    ROWS: [
        { key: 'salary_production',   label: 'ЗП производство (выливание)',       planField: 'salaryProduction', hint: 'из бота: часы сотрудников на выливание' },
        { key: 'salary_assembly',     label: 'ЗП сборка + упаковка + срезка',     planField: 'salaryAssembly',   hint: 'из бота: часы на сборку фурнитуры, упаковку, срезание' },
        { key: 'indirect_production', label: 'Косвенные (по фактическим часам)',  planField: 'indirectProduction', hint: 'авто: фактические часы × косвенные/час' },
        { key: 'hardware_purchase',   label: 'Закупка фурнитуры + NFC',           planField: 'hardwarePurchase', hint: 'стоимость фурнитуры (склад или кастомная закупка)' },
        { key: 'hardware_delivery',   label: 'Доставка фурнитуры',                planField: 'hardwareDelivery', hint: 'доставка из Китая / РФ' },
        { key: 'packaging_purchase',  label: 'Закупка упаковки',                  planField: 'packagingPurchase', hint: '' },
        { key: 'packaging_delivery',  label: 'Доставка упаковки',                 planField: 'packagingDelivery', hint: '' },
        { key: 'design_printing',     label: 'Нанесение (печать)',                 planField: 'designPrinting',  hint: 'фактическая стоимость печати (УФ, тампо и т.д.)' },
        { key: 'plastic',             label: 'Пластик',                            planField: 'plastic',         hint: 'от начальника производства' },
        { key: 'molds',               label: 'Молды (формы)',                      planField: 'molds',           hint: 'фактическая стоимость изготовления/ремонта форм' },
        { key: 'delivery_client',     label: 'Доставка клиенту',                   planField: 'delivery',        hint: '' },
        { key: 'taxes',               label: 'Налоги',                             planField: 'taxes',           hint: '' },
    ],

    HOUR_ROWS: [
        { key: 'hours_production', label: 'Часы: выливание пластика',    planField: 'hoursPlastic' },
        { key: 'hours_assembly',   label: 'Часы: сборка фурнитуры',      planField: 'hoursHardware' },
        { key: 'hours_packaging',  label: 'Часы: упаковка + срезание',    planField: 'hoursPackaging' },
    ],

    _num(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    },

    async load() {
        const select = document.getElementById('fact-order-select');
        if (!select) return;

        // Load only completed orders for plan-fact
        const orders = await loadOrders();
        const completedOrders = (orders || []).filter(o => o.status === 'completed');
        select.innerHTML = '<option value="">-- Выберите заказ (статус: Готово) --</option>';
        completedOrders.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = (o.order_name || 'Без названия') +
                (o.client_name ? ' — ' + o.client_name : '') +
                ' (' + (o.status || 'draft') + ')';
            select.appendChild(opt);
        });

        await this.renderGlobalStats(completedOrders);

        // If we had a previous selection, restore it
        if (this.currentOrderId) {
            select.value = this.currentOrderId;
            await this.onOrderSelect(this.currentOrderId);
        }
    },

    async onOrderSelect(orderId) {
        // Fix type mismatch: select value is string, but order IDs from Date.now() are numbers
        if (orderId && typeof orderId === 'string' && /^\d+$/.test(orderId)) {
            orderId = Number(orderId);
        }

        const tableCard = document.getElementById('fact-table-card');
        const hoursCard = document.getElementById('fact-hours-card');
        const notesCard = document.getElementById('fact-notes-card');
        const analyticsCard = document.getElementById('fact-order-analytics-card');
        const statusEl = document.getElementById('fact-order-status');

        if (!orderId) {
            this.currentOrderId = null;
            if (tableCard) tableCard.style.display = 'none';
            if (hoursCard) hoursCard.style.display = 'none';
            if (notesCard) notesCard.style.display = 'none';
            if (analyticsCard) analyticsCard.style.display = 'none';
            return;
        }

        this.currentOrderId = orderId;

        // Load order data
        const orderData = await loadOrder(orderId);
        if (!orderData) {
            if (statusEl) statusEl.textContent = 'Заказ не найден';
            return;
        }

        const { order, items: rawItems } = orderData;
        if (statusEl) statusEl.textContent = order.status || '';
        if (order.status !== 'completed') {
            if (statusEl) statusEl.textContent = 'Доступно только для заказов со статусом "Готово"';
            if (tableCard) tableCard.style.display = 'none';
            if (hoursCard) hoursCard.style.display = 'none';
            if (notesCard) notesCard.style.display = 'none';
            if (analyticsCard) analyticsCard.style.display = 'none';
            return;
        }

        // Reconstruct calculator items/hw/pkg from saved data
        const params = App.params || {};
        const calcItems = [];
        const calcHw = [];
        const calcPkg = [];

        rawItems.forEach(ri => {
            if (ri.item_type === 'product') {
                const item = {
                    quantity: ri.quantity,
                    pieces_per_hour: ri.pieces_per_hour,
                    weight_grams: ri.weight_grams,
                    extra_molds: ri.extra_molds || 0,
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
                    builtin_hw_name: ri.builtin_hw_name || '',
                    builtin_hw_price: ri.builtin_hw_price || 0,
                    builtin_hw_delivery_total: ri.builtin_hw_delivery_total || 0,
                    builtin_hw_speed: ri.builtin_hw_speed || 0,
                };
                item.result = calculateItemCost(item, params);
                calcItems.push(item);
            } else if (ri.item_type === 'hardware') {
                const hw = {
                    name: ri.product_name,
                    qty: ri.quantity,
                    assembly_speed: ri.hardware_assembly_speed || 60,
                    price: ri.hardware_price_per_unit || 0,
                    delivery_price: ri.hardware_delivery_per_unit || 0,
                    delivery_total: ri.hardware_delivery_total || 0,
                    sell_price: ri.sell_price_hardware || 0,
                };
                hw.result = calculateHardwareCost(hw, params);
                calcHw.push(hw);
            } else if (ri.item_type === 'packaging') {
                const pkg = {
                    name: ri.product_name,
                    qty: ri.quantity,
                    assembly_speed: ri.packaging_assembly_speed || 60,
                    price: ri.packaging_price_per_unit || 0,
                    delivery_price: ri.packaging_delivery_per_unit || 0,
                    delivery_total: ri.packaging_delivery_total || 0,
                    sell_price: ri.sell_price_packaging || 0,
                };
                pkg.result = calculatePackagingCost(pkg, params);
                calcPkg.push(pkg);
            }
        });

        // Calculate plan data using the same function as findirector
        const loadData = calculateProductionLoad(calcItems, calcHw, calcPkg, params);

        // Split salary into production (plastic) vs assembly (hw + pkg)
        let salaryProduction = 0;
        let salaryAssembly = 0;
        calcItems.forEach(item => {
            if (item.result) {
                salaryProduction += item.result.hoursTotalPlasticNfc * params.fotPerHour;
            }
        });
        calcHw.forEach(hw => {
            if (hw.result) salaryAssembly += hw.result.hoursHardware * params.fotPerHour;
        });
        calcPkg.forEach(pkg => {
            if (pkg.result) salaryAssembly += pkg.result.hoursPackaging * params.fotPerHour;
        });

        // Build plan rows from saved calculator components (order_items),
        // fallback to recalculated values when old orders miss component fields.
        let hardwarePurchase = 0;
        let hardwareDelivery = 0;
        let packagingPurchase = 0;
        let packagingDelivery = 0;
        let designPrinting = 0;
        let plastic = 0;
        let molds = 0;
        let delivery = 0;
        let taxes = 0;
        let prodIndirect = 0;

        rawItems.forEach(ri => {
            const qty = this._num(ri.quantity);
            if (qty <= 0) return;

            if (ri.item_type === 'product') {
                const costIndirect = this._num(ri.cost_indirect);
                const costCuttingIndirect = this._num(ri.cost_cutting_indirect);
                const costNfcIndirect = this._num(ri.cost_nfc_indirect);
                const costPlastic = this._num(ri.cost_plastic);
                const costMold = this._num(ri.cost_mold_amortization);
                const costDesign = this._num(ri.cost_design);
                const costPrinting = this._num(ri.cost_printing);
                const costDelivery = this._num(ri.cost_delivery);
                const costNfcTag = this._num(ri.cost_nfc_tag);

                prodIndirect += qty * (costIndirect + costCuttingIndirect + costNfcIndirect);
                plastic += qty * costPlastic;
                // For blank forms molds should not be charged in plan-fact.
                if (!ri.is_blank_mold) molds += qty * costMold;
                designPrinting += qty * (costDesign + costPrinting);
                delivery += qty * costDelivery;
                hardwarePurchase += qty * costNfcTag;
            } else if (ri.item_type === 'hardware') {
                hardwarePurchase += qty * this._num(ri.hardware_price_per_unit);
                hardwareDelivery += qty * this._num(ri.hardware_delivery_per_unit);
            } else if (ri.item_type === 'packaging') {
                packagingPurchase += qty * this._num(ri.packaging_price_per_unit);
                packagingDelivery += qty * this._num(ri.packaging_delivery_per_unit);
            }
        });

        // Indirect from production load/hours is the authoritative logic for this page.
        const indirectByHours = round2((loadData.hoursPlasticTotal + loadData.hoursHardwareTotal + loadData.hoursPackagingTotal) * (params.indirectPerHour || 0));
        if (prodIndirect <= 0) prodIndirect = indirectByHours;

        const orderRevenue = this._num(order.total_revenue_plan);
        const orderCosts = this._num(order.total_cost_plan);
        const orderMarginPct = this._num(order.margin_percent_plan);
        const orderEarned = this._num(order.total_margin_plan);

        // Keep taxes as balancing row so row sum matches saved plan total from "Заказы".
        const rowsWithoutTaxes = round2(
            round2(salaryProduction) + round2(salaryAssembly) + round2(prodIndirect) +
            round2(hardwarePurchase) + round2(hardwareDelivery) +
            round2(packagingPurchase) + round2(packagingDelivery) +
            round2(designPrinting) + round2(plastic) + round2(molds) + round2(delivery)
        );
        taxes = round2(Math.max(0, orderCosts > 0 ? (orderCosts - rowsWithoutTaxes) : 0));

        this.planData = {
            salaryProduction: round2(salaryProduction),
            salaryAssembly: round2(salaryAssembly),
            indirectProduction: round2(prodIndirect),
            hardwarePurchase: round2(hardwarePurchase),
            hardwareDelivery: round2(hardwareDelivery),
            packagingPurchase: round2(packagingPurchase),
            packagingDelivery: round2(packagingDelivery),
            designPrinting: round2(designPrinting),
            plastic: round2(plastic),
            molds: round2(molds),
            delivery: round2(delivery),
            taxes: round2(taxes),
            totalCosts: orderCosts > 0 ? round2(orderCosts) : round2(rowsWithoutTaxes + taxes),
            revenue: orderRevenue > 0 ? round2(orderRevenue) : 0,
            planMarginPercent: orderMarginPct,
            planEarned: orderEarned,
        };

        this._orderPlanMeta = {
            revenue: orderRevenue,
            costs: orderCosts,
            marginPercent: orderMarginPct,
            earned: orderEarned,
        };

        this.planHours = {
            hoursPlastic: round2(loadData.hoursPlasticTotal),
            hoursHardware: round2(loadData.hoursHardwareTotal),
            hoursPackaging: round2(loadData.hoursPackagingTotal),
        };

        // Load saved factual data
        this.factData = await loadFactual(orderId) || {};
        this._entries = await loadTimeEntries();
        this.applyHoursFromEntries(orderId, params);
        this.applyDerivedFactCosts(params);

        // Render
        this.renderTable();
        this.renderHours();
        this.renderOrderAnalytics();

        if (tableCard) tableCard.style.display = '';
        if (hoursCard) hoursCard.style.display = '';
        if (notesCard) notesCard.style.display = '';
        if (analyticsCard) analyticsCard.style.display = '';

        // Restore notes
        const notesEl = document.getElementById('fact-notes');
        if (notesEl) notesEl.value = this.factData.notes || '';
    },

    renderTable() {
        const container = document.getElementById('fact-table-content');
        if (!container) return;

        const plan = this.planData;
        const fact = this.factData;

        let html = '<div style="overflow-x:auto;">';
        html += '<table class="data-table" style="width:100%; font-size:13px;">';
        html += '<thead><tr>';
        html += '<th style="text-align:left; width:40%;">Категория</th>';
        html += '<th style="text-align:right; width:20%;">План</th>';
        html += '<th style="text-align:right; width:20%;">Факт</th>';
        html += '<th style="text-align:right; width:20%;">Отклонение</th>';
        html += '</tr></thead><tbody>';

        let planTotal = 0;
        let factTotal = 0;

        this.ROWS.forEach(row => {
            const planVal = plan[row.planField] || 0;
            const factKey = 'fact_' + row.key;
            const factVal = parseFloat(fact[factKey]) || 0;
            if (row.key === 'molds' && planVal === 0 && factVal === 0) return;
            planTotal += planVal;
            factTotal += factVal;

            const delta = factVal - planVal;
            const pct = planVal > 0 ? ((delta / planVal) * 100) : 0;
            const alarm = this.getAlarm(factVal, planVal);

            html += `<tr style="${alarm.bgStyle}">`;
            html += `<td style="padding:8px 12px; font-weight:500;">${row.label}${row.hint ? '<div style="font-size:10px;color:var(--text-muted);font-weight:400;margin-top:1px;">' + row.hint + '</div>' : ''}</td>`;
            html += `<td style="text-align:right; padding:8px 12px; color:var(--text-muted);">${this.fmtRub(planVal)}</td>`;
            html += `<td style="text-align:right; padding:8px 4px;">
                <input type="text" inputmode="decimal" value="${factVal || ''}"
                    style="width:110px; text-align:right; padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size:13px;"
                    oninput="Factual.onFactInput('${row.key}', this.value)">
            </td>`;
            html += `<td style="text-align:right; padding:8px 12px; font-weight:600; color:${alarm.color};">
                ${factVal > 0 ? alarm.icon + ' ' + this.fmtDelta(delta, pct) : '<span style="color:var(--text-muted);">—</span>'}
            </td>`;
            html += '</tr>';
        });

        // TOTAL row
        const totalDelta = factTotal - planTotal;
        const totalPct = planTotal > 0 ? ((totalDelta / planTotal) * 100) : 0;
        const totalAlarm = this.getAlarm(factTotal, planTotal);

        html += `<tr style="border-top:2px solid var(--border); font-weight:700; background:var(--bg-muted);">`;
        html += `<td style="padding:10px 12px;">ИТОГО расходы</td>`;
        html += `<td style="text-align:right; padding:10px 12px;">${this.fmtRub(planTotal)}</td>`;
        html += `<td style="text-align:right; padding:10px 12px;">${factTotal > 0 ? this.fmtRub(factTotal) : '—'}</td>`;
        html += `<td style="text-align:right; padding:10px 12px; color:${totalAlarm.color};">
            ${factTotal > 0 ? totalAlarm.icon + ' ' + this.fmtDelta(totalDelta, totalPct) : '—'}
        </td>`;
        html += '</tr>';

        // Revenue row
        const planRevenue = plan.revenue || 0;
        const factRevenue = parseFloat(fact.fact_revenue) || 0;
        const revDelta = factRevenue - planRevenue;
        const revPct = planRevenue > 0 ? ((revDelta / planRevenue) * 100) : 0;
        // For revenue, MORE is better (inverted alarm)
        const revAlarm = factRevenue > 0 ? (
            factRevenue >= planRevenue ? { color: 'var(--green)', icon: '\u2713', bgStyle: '' } :
            factRevenue >= planRevenue * 0.85 ? { color: 'var(--yellow)', icon: '\u26A0', bgStyle: '' } :
            { color: 'var(--red)', icon: '\u2717', bgStyle: '' }
        ) : { color: '', icon: '', bgStyle: '' };

        html += `<tr style="background:var(--green-light);">`;
        html += `<td style="padding:10px 12px; font-weight:700;">Выручка</td>`;
        html += `<td style="text-align:right; padding:10px 12px; color:var(--green); font-weight:600;">${this.fmtRub(planRevenue)}</td>`;
        html += `<td style="text-align:right; padding:10px 4px;">
            <input type="text" inputmode="decimal" value="${factRevenue || ''}"
                style="width:110px; text-align:right; padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-size:13px; font-weight:600;"
                oninput="Factual.onFactInput('revenue', this.value)">
        </td>`;
        html += `<td style="text-align:right; padding:10px 12px; font-weight:600; color:${revAlarm.color};">
            ${factRevenue > 0 ? revAlarm.icon + ' ' + this.fmtDelta(revDelta, revPct) : '—'}
        </td>`;
        html += '</tr>';

        // Margin row (calculated)
        if (factRevenue > 0 && factTotal > 0) {
            const factMargin = round2(((factRevenue - factTotal) / factRevenue) * 100);
            const planMargin = this._num(plan.planMarginPercent) || (planRevenue > 0 ? round2(((planRevenue - planTotal) / planRevenue) * 100) : 0);
            const marginColor = factMargin >= 30 ? 'var(--green)' : factMargin >= 20 ? 'var(--yellow)' : 'var(--red)';

            html += `<tr style="border-top:2px solid var(--border);">`;
            html += `<td style="padding:10px 12px; font-weight:700;">Маржа</td>`;
            html += `<td style="text-align:right; padding:10px 12px;">${planMargin.toFixed(1)}%</td>`;
            html += `<td style="text-align:right; padding:10px 12px; font-weight:700; font-size:16px; color:${marginColor};">${factMargin.toFixed(1)}%</td>`;
            html += `<td style="text-align:right; padding:10px 12px; color:${marginColor};">${(factMargin - planMargin) >= 0 ? '+' : ''}${(factMargin - planMargin).toFixed(1)} п.п.</td>`;
            html += '</tr>';
        }

        html += '</tbody></table></div>';
        container.innerHTML = html;
    },

    renderHours() {
        const container = document.getElementById('fact-hours-content');
        if (!container) return;

        const plan = this.planHours;
        const fact = this.factData;

        let html = '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">';

        this.HOUR_ROWS.forEach(row => {
            const planVal = plan[row.planField] || 0;
            const factKey = 'fact_' + row.key;
            const factVal = parseFloat(fact[factKey]) || 0;
            const delta = factVal - planVal;
            const alarm = factVal > 0 ? this.getAlarm(factVal, planVal) : { color: 'var(--text-muted)', icon: '', bgStyle: '' };

            html += `<div style="padding:12px; border:1px solid var(--border); border-radius:8px; ${factVal > 0 && alarm.bgStyle ? alarm.bgStyle : ''}">`;
            html += `<div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">${row.label}</div>`;
            html += `<div style="display:flex; justify-content:space-between; align-items:baseline;">`;
            html += `<span style="font-size:12px; color:var(--text-muted);">План: ${planVal.toFixed(1)} ч</span>`;
            html += `</div>`;
            html += `<div style="margin-top:4px;">`;
            html += `<input type="text" value="${factVal || ''}" readonly
                style="width:100%; text-align:center; padding:6px; border:1px solid var(--border); border-radius:4px; font-size:14px; font-weight:600; background:var(--bg);">`;
            html += `</div>`;
            if (factVal > 0) {
                html += `<div style="margin-top:4px; text-align:center; font-size:11px; font-weight:600; color:${alarm.color};">${alarm.icon} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ч</div>`;
            }
            html += '</div>';
        });

        html += '</div>';
        container.innerHTML = html;
    },

    getAlarm(factVal, planVal) {
        if (factVal <= 0) return { color: 'var(--text-muted)', icon: '', bgStyle: '' };
        if (planVal <= 0) return { color: 'var(--text-muted)', icon: '\u2014', bgStyle: '' };

        const ratio = factVal / planVal;
        if (ratio <= 1.0) return { color: 'var(--green)', icon: '\u2713', bgStyle: '' };
        if (ratio <= 1.15) return { color: 'var(--yellow)', icon: '\u26A0', bgStyle: 'background:rgba(255,193,7,0.05);' };
        return { color: 'var(--red)', icon: '\u2717', bgStyle: 'background:rgba(220,53,69,0.05);' };
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

    onFactInput(key, value) {
        const num = parseFloat(value.replace(/\s/g, '').replace(',', '.')) || 0;
        if (key === 'revenue') {
            this.factData.fact_revenue = num;
        } else {
            this.factData['fact_' + key] = num;
        }
        // Recalculate totals and re-render (debounced)
        clearTimeout(this._renderTimer);
        this._renderTimer = setTimeout(() => this.renderTable(), 400);
    },

    onNotesChange(value) {
        this.factData.notes = value;
    },

    async saveFact() {
        if (!this.currentOrderId) {
            App.toast('Сначала выберите заказ');
            return;
        }

        // Calculate fact_total
        let factTotal = 0;
        this.ROWS.forEach(row => {
            factTotal += parseFloat(this.factData['fact_' + row.key]) || 0;
        });
        this.factData.fact_total = round2(factTotal);
        this.factData.updated_by = document.getElementById('calc-manager-name')?.value || '';

        await saveFactual(this.currentOrderId, this.factData);
        App.toast('Фактические данные сохранены');
        await this.load();
    },

    applyHoursFromEntries(orderId, params) {
        const entries = (this._entries || []).filter(e => Number(e.order_id) === Number(orderId));
        let casting = 0;
        let assembly = 0;
        let packaging = 0;
        entries.forEach(e => {
            const stage = this._stageKey(e);
            const h = parseFloat(e.hours) || 0;
            if (stage === 'casting' || stage === 'trim') casting += h;
            else if (stage === 'assembly') assembly += h;
            else if (stage === 'packaging') packaging += h;
        });
        this.factData.fact_hours_production = round2(casting);
        this.factData.fact_hours_assembly = round2(assembly);
        this.factData.fact_hours_packaging = round2(packaging);
        this.factData._hours_source = 'timetrack';
    },

    applyDerivedFactCosts(params) {
        const hProd = parseFloat(this.factData.fact_hours_production) || 0;
        const hAsm = parseFloat(this.factData.fact_hours_assembly) || 0;
        const hPkg = parseFloat(this.factData.fact_hours_packaging) || 0;
        const totalHours = hProd + hAsm + hPkg;
        const fot = params?.fotPerHour || 0;
        const indirectPerHour = params?.indirectPerHour || 0;

        this.factData.fact_salary_production = round2(hProd * fot);
        this.factData.fact_salary_assembly = round2((hAsm + hPkg) * fot);
        this.factData.fact_indirect_production = round2(totalHours * indirectPerHour);
    },

    _stageKey(entry) {
        const desc = String(entry?.description || '');
        const marker = desc.match(/^\[meta\](\{.*?\})\[\/meta\]\s*/);
        if (marker) {
            try {
                const parsed = JSON.parse(marker[1]);
                if (parsed?.stage) return parsed.stage;
            } catch (e) {}
        }
        if (entry?.stage) return entry.stage;
        const stageMatch = desc.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
        const label = (stageMatch?.[1] || '').toLowerCase();
        if (label.includes('вылив')) return 'casting';
        if (label.includes('литник') || label.includes('лейник') || label.includes('срез')) return 'trim';
        if (label.includes('сбор')) return 'assembly';
        if (label.includes('упаков')) return 'packaging';
        return 'other';
    },

    renderOrderAnalytics() {
        const el = document.getElementById('fact-order-analytics');
        if (!el || !this.planData || !this.factData) return;

        const planRevenue = parseFloat(this.planData.revenue) || 0;
        const planTotal = this.ROWS.reduce((s, r) => s + (parseFloat(this.planData[r.planField]) || 0), 0);
        const factRevenue = parseFloat(this.factData.fact_revenue) || 0;
        const factTotal = this.ROWS.reduce((s, r) => s + (parseFloat(this.factData['fact_' + r.key]) || 0), 0);

        const planEarned = this._num(this.planData.planEarned) || round2(planRevenue - planTotal);
        const factEarned = factRevenue > 0 ? round2(factRevenue - factTotal) : 0;
        const planMargin = this._num(this.planData.planMarginPercent) || (planRevenue > 0 ? round2(planEarned * 100 / planRevenue) : 0);
        const factMargin = factRevenue > 0 ? round2(factEarned * 100 / factRevenue) : 0;
        const deltaEarned = round2(factEarned - planEarned);

        el.innerHTML = `<div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;">
            <div style="padding:10px;border:1px solid var(--border);border-radius:8px;"><div style="font-size:11px;color:var(--text-muted)">План маржа</div><div style="font-size:20px;font-weight:700;">${planMargin}%</div></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:8px;"><div style="font-size:11px;color:var(--text-muted)">Факт маржа</div><div style="font-size:20px;font-weight:700;${factRevenue > 0 ? (factMargin >= planMargin ? 'color:var(--green)' : 'color:var(--red)') : ''}">${factRevenue > 0 ? factMargin + '%' : '—'}</div></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:8px;"><div style="font-size:11px;color:var(--text-muted)">План прибыль</div><div style="font-size:20px;font-weight:700;">${this.fmtRub(planEarned)}</div></div>
            <div style="padding:10px;border:1px solid var(--border);border-radius:8px;"><div style="font-size:11px;color:var(--text-muted)">Отклонение прибыли</div><div style="font-size:20px;font-weight:700;${factRevenue > 0 ? (deltaEarned >= 0 ? 'color:var(--green)' : 'color:var(--red)') : ''}">${factRevenue > 0 ? ((deltaEarned >= 0 ? '+' : '') + this.fmtRub(deltaEarned)) : '—'}</div></div>
        </div>`;
    },

    async renderGlobalStats(completedOrders) {
        const orders = completedOrders || [];
        const countEl = document.getElementById('fact-stat-orders');
        const planEl = document.getElementById('fact-stat-plan-margin');
        const factEl = document.getElementById('fact-stat-fact-margin');
        const deltaEl = document.getElementById('fact-stat-earned-delta');
        if (!countEl || !planEl || !factEl || !deltaEl) return;

        countEl.textContent = String(orders.length);
        const planAvg = orders.length
            ? round2(orders.reduce((s, o) => s + (parseFloat(o.margin_percent_plan) || 0), 0) / orders.length)
            : 0;
        planEl.textContent = `${planAvg}%`;

        const factuals = await Promise.all(orders.map(o => loadFactual(o.id)));
        let factMargins = [];
        let earnedDelta = 0;
        orders.forEach((o, idx) => {
            const f = factuals[idx];
            if (!f) return;
            const planRevenue = parseFloat(o.total_revenue_plan) || 0;
            const planCosts = parseFloat(o.total_cost_plan) || 0;
            const planEarned = planRevenue - planCosts;
            const factRevenue = parseFloat(f.fact_revenue) || 0;
            let factCosts = 0;
            this.ROWS.forEach(r => { factCosts += parseFloat(f['fact_' + r.key]) || 0; });
            if (factRevenue > 0) {
                const m = round2((factRevenue - factCosts) * 100 / factRevenue);
                factMargins.push(m);
                earnedDelta += (factRevenue - factCosts) - planEarned;
            }
        });
        const factAvg = factMargins.length ? round2(factMargins.reduce((s, v) => s + v, 0) / factMargins.length) : 0;
        factEl.textContent = factMargins.length ? `${factAvg}%` : '—';
        deltaEl.textContent = `${earnedDelta >= 0 ? '+' : ''}${this.fmtRub(earnedDelta)}`;
        deltaEl.style.color = earnedDelta >= 0 ? 'var(--green)' : 'var(--red)';
    },
};

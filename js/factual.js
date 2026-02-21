// =============================================
// Recycle Object — Factual Costs (Plan vs Fact)
// Compare planned vs actual expenses per order
// =============================================

const Factual = {
    currentOrderId: null,
    planData: null,
    factData: null,
    planHours: null,

    // Cost row definitions: key, label, planField
    ROWS: [
        { key: 'salary_production',   label: 'ЗП выливание',              planField: 'salaryProduction' },
        { key: 'salary_assembly',     label: 'ЗП сборка / упаковка',      planField: 'salaryAssembly' },
        { key: 'hardware_purchase',   label: 'Закупка фурнитуры + NFC',   planField: 'hardwarePurchase' },
        { key: 'hardware_delivery',   label: 'Доставка фурнитуры',        planField: 'hardwareDelivery' },
        { key: 'packaging_purchase',  label: 'Закупка упаковки',          planField: 'packagingPurchase' },
        { key: 'packaging_delivery',  label: 'Доставка упаковки',         planField: 'packagingDelivery' },
        { key: 'design_printing',     label: 'Проектирование + нанесение', planField: 'designPrinting' },
        { key: 'plastic',             label: 'Пластик',                   planField: 'plastic' },
        { key: 'molds',               label: 'Молды',                     planField: 'molds' },
        { key: 'delivery_client',     label: 'Доставка клиенту',          planField: 'delivery' },
        { key: 'taxes',               label: 'Налоги',                    planField: 'taxes' },
    ],

    HOUR_ROWS: [
        { key: 'hours_production', label: 'Часы выливание',           planField: 'hoursPlastic' },
        { key: 'hours_assembly',   label: 'Часы сборка фурнитуры',   planField: 'hoursHardware' },
        { key: 'hours_packaging',  label: 'Часы упаковка / срезание', planField: 'hoursPackaging' },
    ],

    async load() {
        const select = document.getElementById('fact-order-select');
        if (!select) return;

        // Load all orders
        const orders = await loadOrders();
        select.innerHTML = '<option value="">-- Выберите заказ --</option>';
        orders.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = (o.order_name || 'Без названия') +
                (o.client_name ? ' — ' + o.client_name : '') +
                ' (' + (o.status || 'draft') + ')';
            select.appendChild(opt);
        });

        // If we had a previous selection, restore it
        if (this.currentOrderId) {
            select.value = this.currentOrderId;
            await this.onOrderSelect(this.currentOrderId);
        }
    },

    async onOrderSelect(orderId) {
        const tableCard = document.getElementById('fact-table-card');
        const hoursCard = document.getElementById('fact-hours-card');
        const notesCard = document.getElementById('fact-notes-card');
        const statusEl = document.getElementById('fact-order-status');

        if (!orderId) {
            this.currentOrderId = null;
            if (tableCard) tableCard.style.display = 'none';
            if (hoursCard) hoursCard.style.display = 'none';
            if (notesCard) notesCard.style.display = 'none';
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
        const finData = calculateFinDirectorData(calcItems, calcHw, calcPkg, params);
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

        this.planData = {
            salaryProduction: round2(salaryProduction),
            salaryAssembly: round2(salaryAssembly),
            hardwarePurchase: finData.hardwarePurchase,
            hardwareDelivery: finData.hardwareDelivery,
            packagingPurchase: finData.packagingPurchase,
            packagingDelivery: finData.packagingDelivery,
            designPrinting: round2(finData.design + finData.printing),
            plastic: finData.plastic,
            molds: finData.molds,
            delivery: finData.delivery,
            taxes: finData.taxes,
            totalCosts: finData.totalCosts,
            revenue: finData.revenue,
        };

        this.planHours = {
            hoursPlastic: round2(loadData.hoursPlasticTotal),
            hoursHardware: round2(loadData.hoursHardwareTotal),
            hoursPackaging: round2(loadData.hoursPackagingTotal),
        };

        // Load saved factual data
        this.factData = await loadFactual(orderId) || {};

        // Render
        this.renderTable();
        this.renderHours();

        if (tableCard) tableCard.style.display = '';
        if (hoursCard) hoursCard.style.display = '';
        if (notesCard) notesCard.style.display = '';

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
            planTotal += planVal;
            factTotal += factVal;

            const delta = factVal - planVal;
            const pct = planVal > 0 ? ((delta / planVal) * 100) : 0;
            const alarm = this.getAlarm(factVal, planVal);

            html += `<tr style="${alarm.bgStyle}">`;
            html += `<td style="padding:8px 12px; font-weight:500;">${row.label}</td>`;
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
            const planMargin = planRevenue > 0 ? round2(((planRevenue - planTotal) / planRevenue) * 100) : 0;
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
            html += `<input type="text" inputmode="decimal" value="${factVal || ''}" placeholder="Факт часы"
                style="width:100%; text-align:center; padding:6px; border:1px solid var(--border); border-radius:4px; font-size:14px; font-weight:600;"
                oninput="Factual.onHourInput('${row.key}', this.value)">`;
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

    onHourInput(key, value) {
        const num = parseFloat(value.replace(/\s/g, '').replace(',', '.')) || 0;
        this.factData['fact_' + key] = num;
        clearTimeout(this._hoursTimer);
        this._hoursTimer = setTimeout(() => this.renderHours(), 400);
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
    },
};

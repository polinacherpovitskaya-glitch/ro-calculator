// =============================================
// Recycle Object — План производства
// =============================================

const ProductionPlan = {
    PRODUCTION_STATUSES: ['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery'],
    allRows: [],
    filteredRows: [],
    priority: [],
    _state: { order_ids: [] },
    _projectHardwareState: { checks: {} },

    async load() {
        const [orders, state, projectHwState] = await Promise.all([
            loadOrders(),
            loadProductionPlanState(),
            loadProjectHardwareState(),
        ]);

        this._state = state || { order_ids: [] };
        this._projectHardwareState = projectHwState || { checks: {} };
        if (!this._projectHardwareState.checks || typeof this._projectHardwareState.checks !== 'object') {
            this._projectHardwareState.checks = {};
        }
        this.priority = Array.isArray(this._state.order_ids) ? this._state.order_ids.map(x => Number(x)) : [];

        const productionOrders = (orders || []).filter(o => this.PRODUCTION_STATUSES.includes(o.status));
        const details = await Promise.all(productionOrders.map(o => loadOrder(o.id).catch(() => null)));
        const byId = new Map(details.filter(Boolean).map(d => [Number(d.order.id), d]));

        this.allRows = productionOrders.map(order => {
            const detail = byId.get(Number(order.id));
            return this._buildRow(order, detail?.items || []);
        });

        this._syncPriority();
        this.renderFilters();
        this.applyFilters();
    },

    renderFilters() {
        const managerEl = document.getElementById('pp-filter-manager');
        if (!managerEl) return;
        const current = managerEl.value;
        const managers = [...new Set(this.allRows.map(r => r.manager).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
        managerEl.innerHTML = '<option value="">Все</option>' + managers.map(m => `<option value="${this.esc(m)}">${this.esc(m)}</option>`).join('');
        managerEl.value = managers.includes(current) ? current : '';
    },

    applyFilters() {
        const q = (document.getElementById('pp-search')?.value || '').toLowerCase().trim();
        const manager = document.getElementById('pp-filter-manager')?.value || '';
        const stage = document.getElementById('pp-filter-stage')?.value || '';

        let rows = this.allRows.slice();
        if (manager) rows = rows.filter(r => r.manager === manager);
        if (stage) rows = rows.filter(r => r.status === stage);
        if (q) {
            rows = rows.filter(r => [
                r.orderName,
                r.manager,
                r.notes,
                r.colorsPlain,
                r.hwPlain,
                r.pkgPlain,
                r.productsPlain,
            ].join(' ').toLowerCase().includes(q));
        }

        this.filteredRows = this._sortRows(rows);
        this.renderStats();
        this.renderTable();
        this.renderMobile();
    },

    renderStats() {
        const cntEl = document.getElementById('pp-stat-count');
        const qtyEl = document.getElementById('pp-stat-qty');
        const lateEl = document.getElementById('pp-stat-late');
        if (!cntEl || !qtyEl || !lateEl) return;

        const now = new Date();
        let qty = 0;
        let late = 0;
        this.filteredRows.forEach(r => {
            qty += r.qtyTotal;
            if (r.deadlineTs && r.deadlineTs < now.getTime()) late += 1;
        });
        cntEl.textContent = String(this.filteredRows.length);
        qtyEl.textContent = String(qty);
        lateEl.textContent = String(late);
    },

    renderTable() {
        const el = document.getElementById('pp-table-wrap');
        if (!el) return;
        if (!this.filteredRows.length) {
            el.innerHTML = '<div class="card"><div class="empty-state"><p>Нет заказов в производстве</p></div></div>';
            return;
        }

        let html = `<div class="card table-wrap"><table class="pp-table"><thead><tr>
            <th style="width:64px">Приоритет</th>
            <th>Заказ</th>
            <th>Менеджер</th>
            <th>Старт / дедлайн</th>
            <th>Количество</th>
            <th>Цвет</th>
            <th>Фурнитура / упаковка</th>
            <th>Заметки</th>
            <th></th>
        </tr></thead><tbody>`;

        this.filteredRows.forEach((r) => {
            const late = r.deadlineTs && r.deadlineTs < Date.now();
            html += `<tr>
                <td>
                    <div class="pp-rank">
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveUp(${r.id})">&#8593;</button>
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveDown(${r.id})">&#8595;</button>
                    </div>
                </td>
                <td>
                    <div class="pp-order-name">${this.esc(r.orderName)}</div>
                    <div class="pp-sub">${this.esc(r.statusLabel)} · ${this.esc(r.productsPlain || 'Без изделий')}</div>
                    <div style="margin-top:8px;">${this._renderProgressBar(r)}</div>
                </td>
                <td>${this.esc(r.manager || '—')}</td>
                <td>
                    <div class="pp-sub">Старт: ${this.esc(r.startLabel)}</div>
                    <div class="pp-sub ${late ? 'text-red' : ''}">Дедлайн: ${this.esc(r.deadlineLabel)}</div>
                </td>
                <td><strong>${r.qtyTotal}</strong></td>
                <td>${this._renderColorCell(r)}</td>
                <td>${this._renderSupplyCell(r)}</td>
                <td class="pp-sub">${this.esc(r.notes || '—')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${r.id})">Открыть</button></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        el.innerHTML = html;
    },

    renderMobile() {
        const el = document.getElementById('pp-mobile-list');
        if (!el) return;
        if (!this.filteredRows.length) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = this.filteredRows.map(r => {
            const late = r.deadlineTs && r.deadlineTs < Date.now();
            return `<div class="card pp-mobile-card">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                    <div>
                        <div class="pp-order-name">${this.esc(r.orderName)}</div>
                        <div class="pp-sub">${this.esc(r.statusLabel)} · ${r.qtyTotal} шт</div>
                    </div>
                    <div class="pp-rank">
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveUp(${r.id})">&#8593;</button>
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveDown(${r.id})">&#8595;</button>
                    </div>
                </div>
                <div class="pp-sub" style="margin-top:6px;"><strong>Менеджер:</strong> ${this.esc(r.manager || '—')}</div>
                <div class="pp-sub"><strong>Старт:</strong> ${this.esc(r.startLabel)}</div>
                <div class="pp-sub ${late ? 'text-red' : ''}"><strong>Дедлайн:</strong> ${this.esc(r.deadlineLabel)}</div>
                <div style="margin-top:8px;">${this._renderProgressBar(r)}</div>
                <div style="margin-top:8px;">${this._renderColorCell(r)}</div>
                <div style="margin-top:8px;">${this._renderSupplyCell(r)}</div>
                <div class="pp-sub"><strong>Заметки:</strong> ${this.esc(r.notes || '—')}</div>
                <div style="margin-top:10px;"><button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${r.id})">Открыть заказ</button></div>
            </div>`;
        }).join('');
    },

    async moveUp(orderId) {
        this._syncPriority();
        const i = this.priority.indexOf(Number(orderId));
        if (i <= 0) return;
        [this.priority[i - 1], this.priority[i]] = [this.priority[i], this.priority[i - 1]];
        await this._savePriority();
        this.applyFilters();
    },

    async moveDown(orderId) {
        this._syncPriority();
        const i = this.priority.indexOf(Number(orderId));
        if (i < 0 || i >= this.priority.length - 1) return;
        [this.priority[i], this.priority[i + 1]] = [this.priority[i + 1], this.priority[i]];
        await this._savePriority();
        this.applyFilters();
    },

    _sortRows(rows) {
        const pos = new Map(this.priority.map((id, i) => [Number(id), i]));
        return rows.slice().sort((a, b) => {
            const pa = pos.has(a.id) ? pos.get(a.id) : 999999;
            const pb = pos.has(b.id) ? pos.get(b.id) : 999999;
            if (pa !== pb) return pa - pb;
            if (a.deadlineTs && b.deadlineTs) return a.deadlineTs - b.deadlineTs;
            if (a.deadlineTs) return -1;
            if (b.deadlineTs) return 1;
            return (b.createdTs || 0) - (a.createdTs || 0);
        });
    },

    _syncPriority() {
        const ids = this.allRows.map(r => Number(r.id));
        const existing = new Set(ids);
        this.priority = this.priority.filter(id => existing.has(Number(id)));

        const missingRows = this.allRows
            .filter(r => !this.priority.includes(Number(r.id)))
            .sort((a, b) => {
                if (a.deadlineTs && b.deadlineTs) return a.deadlineTs - b.deadlineTs;
                if (a.deadlineTs) return -1;
                if (b.deadlineTs) return 1;
                return (a.createdTs || 0) - (b.createdTs || 0);
            });
        this.priority.push(...missingRows.map(r => Number(r.id)));
    },

    async _savePriority() {
        this._state = {
            order_ids: this.priority.slice(),
            updated_at: new Date().toISOString(),
            updated_by: App.getCurrentEmployeeName(),
        };
        await saveProductionPlanState(this._state);
    },

    // Extract color group from product name brackets, e.g.
    // "Бланк треугольник [Желтый]" → "Желтый"
    _extractColorGroup(productName) {
        const match = (productName || '').match(/\[([^\]]+)\]/);
        return match ? match[1] : '';
    },

    _buildRow(order, items) {
        const productItems = (items || []).filter(i => !i.item_type || i.item_type === 'product');
        const hwItems = (items || []).filter(i => i.item_type === 'hardware');
        const pkgItems = (items || []).filter(i => i.item_type === 'packaging');

        const qtyTotal = productItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
        const productsPlain = productItems.map(i => i.product_name).filter(Boolean).join(', ');

        // Build product-index → colorGroup map for hardware/packaging linking
        const productColorGroupByIndex = {};
        productItems.forEach((item, idx) => {
            productColorGroupByIndex[idx] = this._extractColorGroup(item.product_name);
        });

        const colorLines = [];
        const attachments = [];
        const printingLines = [];
        const hasCustomMold = productItems.some(i => !i.is_blank_mold);
        const hasPrinting = productItems.some(i => {
            let p = i.printings;
            if (typeof p === 'string') { try { p = JSON.parse(p); } catch(e) { p = []; } }
            return Array.isArray(p) && p.some(pr => (parseFloat(pr.qty) || 0) > 0 || (parseFloat(pr.price) || 0) > 0 || pr.name);
        });
        productItems.forEach(item => {
            const colors = this._extractColorNames(item);
            const qty = parseFloat(item.quantity) || 0;
            const setName = item.marketplace_set_name || '';
            const colorGroup = this._extractColorGroup(item.product_name);
            if (colors.length) {
                colorLines.push({ text: `${item.product_name || 'Изделие'}: ${colors.join(' + ')}`, qty, name: item.product_name || 'Изделие', colors, setName, colorGroup });
            } else {
                colorLines.push({ text: item.product_name || 'Изделие', qty, name: item.product_name || 'Изделие', colors: [], setName, colorGroup });
            }
            const att = this._extractAttachment(item);
            if (att) attachments.push(att);
            const printings = this._extractPrintings(item);
            if (printings.length) printingLines.push(`${item.product_name || 'Изделие'}: ${printings.join(', ')}`);
        });

        // Products grouped by marketplace set name
        const productsBySet = new Map();
        colorLines.forEach(cl => {
            const sn = cl.setName || '';
            if (!productsBySet.has(sn)) productsBySet.set(sn, []);
            productsBySet.get(sn).push(cl);
        });

        // Products grouped by color group (bracket content in product name)
        const productsByColorGroup = new Map();
        colorLines.forEach(cl => {
            const cg = cl.colorGroup || '';
            if (!productsByColorGroup.has(cg)) productsByColorGroup.set(cg, []);
            productsByColorGroup.get(cg).push(cl);
        });

        // HW/PKG grouped by marketplace set name
        const hwBySet = new Map();
        hwItems.forEach(item => {
            const setName = item.marketplace_set_name || '';
            if (!hwBySet.has(setName)) hwBySet.set(setName, []);
            hwBySet.get(setName).push(item);
        });
        const pkgBySet = new Map();
        pkgItems.forEach(item => {
            const setName = item.marketplace_set_name || '';
            if (!pkgBySet.has(setName)) pkgBySet.set(setName, []);
            pkgBySet.get(setName).push(item);
        });

        // HW/PKG grouped by parent product's color group
        const hwByColorGroup = new Map();
        hwItems.forEach(item => {
            const parentIdx = item.hardware_parent_item_index;
            const cg = (parentIdx !== null && parentIdx !== undefined)
                ? (productColorGroupByIndex[parentIdx] || '')
                : '';
            if (!hwByColorGroup.has(cg)) hwByColorGroup.set(cg, []);
            hwByColorGroup.get(cg).push(item);
        });
        const pkgByColorGroup = new Map();
        pkgItems.forEach(item => {
            const parentIdx = item.packaging_parent_item_index;
            const cg = (parentIdx !== null && parentIdx !== undefined)
                ? (productColorGroupByIndex[parentIdx] || '')
                : '';
            if (!pkgByColorGroup.has(cg)) pkgByColorGroup.set(cg, []);
            pkgByColorGroup.get(cg).push(item);
        });

        const hwLines = hwItems.map(i => `${i.product_name || 'Фурнитура'} × ${(parseFloat(i.quantity) || 0)}`);
        const pkgLines = pkgItems.map(i => `${i.product_name || 'Упаковка'} × ${(parseFloat(i.quantity) || 0)}`);
        const hwPlain = hwLines.join(', ');
        const pkgPlain = pkgLines.join(', ');
        const hwDemands = this._collectWarehouseDemandFromOrderItems(hwItems);
        const hwReady = hwDemands.filter(d => this._isHardwareLineReady(order.id, d.warehouse_item_id)).length;
        const hwTotal = hwDemands.length;
        const hardwareReadyLabelHtml = hwTotal === 0
            ? '<span style="color:#6b7280;">не требуется</span>'
            : (hwReady === hwTotal
                ? '<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#dcfce7;color:#166534;font-weight:600;">да, готово</span>'
                : `<span style="display:inline-block;padding:1px 8px;border-radius:10px;background:#fee2e2;color:#991b1b;font-weight:600;">нет (${hwReady}/${hwTotal})</span>`);

        const startIso = order.created_at || order.deadline_start || order.deadline || null;
        const endIso = order.deadline_end || order.deadline || null;
        const startLabel = startIso ? App.formatDate(startIso) : '—';
        let deadlineLabel = '—';
        if (endIso && startIso && endIso !== startIso) deadlineLabel = `${App.formatDate(startIso)} → ${App.formatDate(endIso)}`;
        else if (endIso || startIso) deadlineLabel = App.formatDate(endIso || startIso);

        return {
            id: Number(order.id),
            orderName: order.order_name || 'Заказ',
            manager: order.manager_name || '',
            notes: [order.notes || '', printingLines.length ? ('Печать: ' + printingLines.join(' · ')) : ''].filter(Boolean).join(' · '),
            status: order.status,
            statusLabel: App.statusLabel(order.status),
            qtyTotal,
            productsPlain,
            hwLines,
            pkgLines,
            hwPlain,
            pkgPlain,
            hardwareReadyLabelHtml,
            colorLines,
            colorsPlain: colorLines.map(cl => cl.text).join(' · '),
            productsBySet: Object.fromEntries(productsBySet),
            productsByColorGroup: Object.fromEntries(productsByColorGroup),
            hwItemsRaw: hwItems,
            pkgItemsRaw: pkgItems,
            hwBySet: Object.fromEntries(hwBySet),
            pkgBySet: Object.fromEntries(pkgBySet),
            hwByColorGroup: Object.fromEntries(hwByColorGroup),
            pkgByColorGroup: Object.fromEntries(pkgByColorGroup),
            attachments,
            hasCustomMold,
            hasPrinting,
            startLabel,
            deadlineLabel,
            deadlineTs: endIso ? new Date(endIso).getTime() : (startIso ? new Date(startIso).getTime() : null),
            createdTs: order.created_at ? new Date(order.created_at).getTime() : 0,
        };
    },

    _collectWarehouseDemandFromOrderItems(hwItems) {
        const grouped = new Map();
        (hwItems || []).forEach(item => {
            const src = (item.source || item.hardware_source || '').toLowerCase();
            if (src !== 'warehouse') return;
            const itemId = Number(item.warehouse_item_id || item.hardware_warehouse_item_id || 0);
            const qty = parseFloat(item.quantity || item.qty || 0) || 0;
            if (!itemId || qty <= 0) return;
            grouped.set(itemId, (grouped.get(itemId) || 0) + qty);
        });
        return Array.from(grouped.entries()).map(([warehouse_item_id, qty]) => ({ warehouse_item_id, qty }));
    },

    _isHardwareLineReady(orderId, warehouseItemId) {
        const checks = (this._projectHardwareState && this._projectHardwareState.checks) || {};
        return !!checks[`${Number(orderId) || 0}:${Number(warehouseItemId) || 0}`];
    },

    _getProgressStages(row) {
        const stages = [
            { key: 'casting', label: 'Выливание' },
            { key: 'mold', label: 'Форма' },
            { key: 'trim', label: 'Обрезание/линейка' },
            { key: 'printing', label: 'Печать' },
            { key: 'assembly', label: 'Сборка' },
            { key: 'packaging', label: 'Упаковка' },
            { key: 'delivery', label: 'Доставка' },
        ];

        const currentByStatus = {
            production_casting: 'casting',
            in_production: 'trim',
            production_printing: 'printing',
            production_hardware: 'assembly',
            production_packaging: 'packaging',
            delivery: 'delivery',
            completed: 'delivery',
        };
        const currentKey = currentByStatus[row.status] || 'casting';
        const currentIdx = stages.findIndex(s => s.key === currentKey);

        return stages.map((s, idx) => {
            if (s.key === 'mold' && !row.hasCustomMold) {
                return { ...s, state: 'skipped' };
            }
            if (s.key === 'printing' && !row.hasPrinting) {
                return { ...s, state: 'skipped' };
            }
            if (idx < currentIdx) return { ...s, state: 'done' };
            if (idx === currentIdx) return { ...s, state: 'active' };
            return { ...s, state: 'todo' };
        });
    },

    _renderProgressBar(row) {
        const stages = this._getProgressStages(row);
        const stageToStatus = {
            casting: 'production_casting',
            mold: 'in_production',
            trim: 'in_production',
            printing: 'production_printing',
            assembly: 'production_hardware',
            packaging: 'production_packaging',
            delivery: 'delivery',
        };
        const legend = stages.map(s => {
            const dotColor =
                s.state === 'done' ? '#16a34a' :
                s.state === 'active' ? '#2563eb' :
                s.state === 'skipped' ? '#9ca3af' :
                '#d1d5db';
            const textColor =
                s.state === 'done' ? '#166534' :
                s.state === 'active' ? '#1d4ed8' :
                s.state === 'skipped' ? '#6b7280' :
                '#6b7280';
            const weight = s.state === 'active' ? 700 : 500;
            const mark = s.state === 'done' ? '&#10003;' : (s.state === 'skipped' ? '&#8212;' : '&bull;');
            const targetStatus = stageToStatus[s.key];
            const clickable = s.state !== 'skipped' && targetStatus ? 'cursor:pointer;' : '';
            const onClick = s.state !== 'skipped' && targetStatus
                ? `onclick="ProductionPlan.setOrderStageStatus(${row.id}, '${targetStatus}')"`
                : '';
            return `<button type="button" ${onClick} style="display:flex;align-items:center;gap:4px;white-space:nowrap;color:${textColor};font-size:10px;font-weight:${weight};border:0;background:transparent;padding:0;${clickable}">
                <span style="display:inline-flex;align-items:center;justify-content:center;width:12px;height:12px;border-radius:999px;background:${dotColor};color:#fff;font-size:8px;line-height:1;">${mark}</span>
                <span>${this.esc(s.label)}</span>
            </button>`;
        }).join('<span style="color:#9ca3af;">›</span>');

        const segments = stages.map((s, idx) => {
            const bg =
                s.state === 'done' ? '#22c55e' :
                s.state === 'active' ? '#3b82f6' :
                s.state === 'skipped' ? '#9ca3af' :
                '#e5e7eb';
            const borderRadius =
                idx === 0 && idx === stages.length - 1 ? '6px' :
                idx === 0 ? '6px 0 0 6px' :
                idx === stages.length - 1 ? '0 6px 6px 0' :
                '0';
            return `<div style="flex:1;height:8px;background:${bg};border-radius:${borderRadius};"></div>`;
        }).join('');

        const nextStatusByCurrent = {
            production_casting: 'in_production',
            in_production: 'production_printing',
            production_printing: 'production_hardware',
            production_hardware: 'production_packaging',
            production_packaging: 'delivery',
            delivery: 'completed',
        };
        const nextStatus = nextStatusByCurrent[row.status] || '';
        const nextLabel = nextStatus ? (App.statusLabel(nextStatus) || nextStatus) : '';
        const nextBtn = nextStatus
            ? `<button class="btn btn-sm btn-outline" onclick="ProductionPlan.goNextStage(${row.id})" style="margin-top:8px;">Следующий этап → ${this.esc(nextLabel)}</button>`
            : '';

        return `<div>
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">${legend}</div>
            <div style="display:flex;gap:2px;margin-top:6px;">${segments}</div>
            ${nextBtn}
        </div>`;
    },

    async setOrderStageStatus(orderId, newStatus) {
        const row = this.allRows.find(r => Number(r.id) === Number(orderId));
        if (!row || !newStatus || row.status === newStatus) return;
        await this._changeOrderStatus(row, newStatus);
    },

    async goNextStage(orderId) {
        const row = this.allRows.find(r => Number(r.id) === Number(orderId));
        if (!row) return;
        const nextStatusByCurrent = {
            production_casting: 'in_production',
            in_production: 'production_printing',
            production_printing: 'production_hardware',
            production_hardware: 'production_packaging',
            production_packaging: 'delivery',
            delivery: 'completed',
        };
        const next = nextStatusByCurrent[row.status];
        if (!next) return;
        await this._changeOrderStatus(row, next);
    },

    async _changeOrderStatus(row, newStatus) {
        const oldStatus = row.status;
        const orderId = Number(row.id);
        const managerName = App.getCurrentEmployeeName() || 'Неизвестный';

        await updateOrderStatus(orderId, newStatus);

        if (typeof Orders !== 'undefined' && Orders && typeof Orders._syncWarehouseByStatus === 'function') {
            try {
                await Orders._syncWarehouseByStatus(orderId, oldStatus, newStatus, row.orderName, managerName);
            } catch (e) {
                console.error('ProductionPlan syncWarehouseByStatus failed:', e);
            }
        }

        if (typeof Orders !== 'undefined' && Orders && typeof Orders.addChangeRecord === 'function') {
            try {
                await Orders.addChangeRecord(orderId, {
                    field: 'status',
                    old_value: App.statusLabel(oldStatus),
                    new_value: App.statusLabel(newStatus),
                    manager: managerName,
                });
            } catch (e) {
                console.error('ProductionPlan addChangeRecord failed:', e);
            }
        }

        row.status = newStatus;
        App.toast(`Статус: ${App.statusLabel(newStatus)}`);
        await this.load();
    },

    _extractColorNames(item) {
        let colors = item.colors;
        if (typeof colors === 'string') {
            try { colors = JSON.parse(colors); } catch (e) { colors = []; }
        }
        if (!Array.isArray(colors)) colors = [];
        const names = colors.map(c => {
            if (typeof c === 'string') return c;
            const num = c?.number || '';
            const name = c?.name || '';
            return num ? `${num} ${name}`.trim() : name;
        }).filter(Boolean);
        if (!names.length && item.color_name) names.push(item.color_name);
        return names;
    },

    _extractAttachment(item) {
        let att = item.color_solution_attachment || null;
        if (typeof att === 'string') {
            try { att = JSON.parse(att); } catch (e) { att = null; }
        }
        if (!att || !att.data_url) return null;
        return {
            name: att.name || 'Файл',
            type: att.type || '',
            data_url: att.data_url,
        };
    },

    _extractPrintings(item) {
        let printings = item.printings;
        if (typeof printings === 'string') {
            try { printings = JSON.parse(printings); } catch (e) { printings = []; }
        }
        if (!Array.isArray(printings)) return [];
        return printings
            .filter(p => (parseFloat(p.qty) || 0) > 0 || (parseFloat(p.price) || 0) > 0 || p.name)
            .map(p => p.name || 'нанесение');
    },

    _renderColorCell(row) {
        const hasColors = row.colorLines.length > 0;
        if (!hasColors) {
            return `<div class="pp-cell-block"><div class="pp-block-title">Детали</div><div class="pp-sub">—</div></div>`;
        }

        const renderProductLine = (cl) => {
            const qtyLabel = cl.qty ? ` <strong style="color:var(--accent);">&times; ${cl.qty} шт</strong>` : '';
            const baseName = (cl.name || '').replace(/\s*\[.*?\]/g, '').trim();
            const colorStr = cl.colors.length ? ' — ' + this.esc(cl.colors.join(' + ')) : '';
            return `<div class="pp-line-item pp-line-color">${this.esc(baseName)}${qtyLabel}${colorStr}</div>`;
        };

        // Check for color groups (bracket content like [Желтый], [Черно-белый])
        const colorGroups = row.productsByColorGroup || {};
        const cgKeys = Object.keys(colorGroups);
        const hasColorGroups = cgKeys.length > 1 || (cgKeys.length === 1 && cgKeys[0] !== '');

        // Check for set grouping
        const productsBySet = row.productsBySet || {};
        const setKeys = Object.keys(productsBySet);
        const hasSetGroups = setKeys.length > 0 && !(setKeys.length === 1 && setKeys[0] === '');

        let linesHtml = '';

        if (hasColorGroups) {
            // Primary grouping: by color group
            if (hasSetGroups) {
                // Within each set, sub-group by color group
                for (const [setName, setItems] of Object.entries(productsBySet)) {
                    const byColor = new Map();
                    setItems.forEach(cl => {
                        const cg = cl.colorGroup || '';
                        if (!byColor.has(cg)) byColor.set(cg, []);
                        byColor.get(cg).push(cl);
                    });

                    let setHtml = '';
                    if (setName) {
                        setHtml += `<div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:2px;">&#128230; ${this.esc(setName)}:</div>`;
                    }
                    for (const [cg, items] of byColor) {
                        if (cg) {
                            setHtml += `<div style="margin-left:4px;margin-top:6px;margin-bottom:3px;padding:2px 8px;background:#f3f4f6;border-radius:6px;font-size:11px;font-weight:600;color:#374151;">&#127912; ${this.esc(cg)}</div>`;
                        }
                        setHtml += `<div style="margin-left:${cg ? '8' : '0'}px;">${items.map(cl => renderProductLine(cl)).join('')}</div>`;
                    }
                    linesHtml += `<div style="margin-bottom:8px;">${setHtml}</div>`;
                }
            } else {
                // No set names — just group by color group
                for (const [cg, items] of Object.entries(colorGroups)) {
                    if (cg) {
                        linesHtml += `<div style="margin-top:6px;margin-bottom:3px;padding:2px 8px;background:#f3f4f6;border-radius:6px;font-size:11px;font-weight:600;color:#374151;">&#127912; ${this.esc(cg)}</div>`;
                    }
                    linesHtml += `<div style="margin-left:${cg ? '4' : '0'}px;">${items.map(cl => renderProductLine(cl)).join('')}</div>`;
                }
            }
        } else if (hasSetGroups) {
            // Only set grouping, no color groups
            for (const [setName, items] of Object.entries(productsBySet)) {
                const itemsHtml = items.map(cl => renderProductLine(cl)).join('');
                if (setName) {
                    linesHtml += `<div style="margin-bottom:6px;"><div style="font-size:11px;font-weight:600;color:#6b7280;margin-bottom:2px;">&#128230; ${this.esc(setName)}:</div>${itemsHtml}</div>`;
                } else {
                    linesHtml += itemsHtml;
                }
            }
        } else {
            // Flat list
            linesHtml = `<div class="pp-lines">${row.colorLines.map(cl => renderProductLine(cl)).join('')}</div>`;
        }

        const imgs = row.attachments
            .filter(att => (att.type || '').startsWith('image/'))
            .map(att => `<a href="javascript:void(0)" onclick="ProductionPlan.showPhotoLightbox(this)" class="pp-color-image-link"><img class="pp-color-image" src="${att.data_url}" alt="${this.esc(att.name)}"></a>`)
            .join('');

        const nonImg = row.attachments
            .filter(att => !(att.type || '').startsWith('image/'))
            .map(att => `<a href="${att.data_url}" target="_blank" class="pp-file-link">&#128206; ${this.esc(att.name)}</a>`)
            .join('');

        return `<div class="pp-cell-block">
            <div class="pp-block-title">Детали</div>
            ${linesHtml}
            ${imgs ? `<div class="pp-color-images">${imgs}</div>` : ''}
            ${nonImg ? `<div class="pp-files">${nonImg}</div>` : ''}
        </div>`;
    },

    _renderSupplyCell(row) {
        const hwByColorGroup = row.hwByColorGroup || {};
        const pkgByColorGroup = row.pkgByColorGroup || {};
        const hwCgKeys = Object.keys(hwByColorGroup);
        const pkgCgKeys = Object.keys(pkgByColorGroup);
        const hasHwColorGroups = hwCgKeys.length > 1 || (hwCgKeys.length === 1 && hwCgKeys[0] !== '');
        const hasPkgColorGroups = pkgCgKeys.length > 1 || (pkgCgKeys.length === 1 && pkgCgKeys[0] !== '');

        const hwBySet = row.hwBySet || {};
        const pkgBySet = row.pkgBySet || {};
        const hasSetGroups = (setObj) => {
            const keys = Object.keys(setObj);
            return keys.length > 0 && !(keys.length === 1 && keys[0] === '');
        };

        const renderItemLine = (i, label, skuField) => {
            const name = i.product_name || label;
            const qty = parseFloat(i.quantity) || 0;
            const sku = i[skuField] || '';
            const skuHtml = sku ? `<span style="color:#6b7280;font-size:11px;"> (${this.esc(sku)})</span>` : '';
            return `<div class="pp-line-item" style="padding-left:8px;">${this.esc(name)}${skuHtml} &times; ${qty}</div>`;
        };

        const renderByColor = (byColorGroup, fallbackBySet, fallbackItems, label, skuField, hasColorGrouping) => {
            // Primary: group by color if available
            if (hasColorGrouping) {
                let html = '';
                for (const [cg, items] of Object.entries(byColorGroup)) {
                    if (cg) {
                        html += `<div style="margin-top:4px;margin-bottom:2px;padding:1px 6px;background:#f3f4f6;border-radius:4px;font-size:10px;font-weight:600;color:#374151;">&#127912; ${this.esc(cg)}</div>`;
                    }
                    html += items.map(i => renderItemLine(i, label, skuField)).join('');
                }
                return html || '<div class="pp-sub">—</div>';
            }
            // Fallback: group by set
            if (hasSetGroups(fallbackBySet)) {
                let html = '';
                for (const [setName, items] of Object.entries(fallbackBySet)) {
                    const itemsHtml = items.map(i => renderItemLine(i, label, skuField)).join('');
                    if (setName && setName !== '') {
                        html += `<div style="font-size:11px;font-weight:600;color:#6b7280;margin-top:4px;">&#128230; ${this.esc(setName)}:</div>${itemsHtml}`;
                    } else {
                        html += itemsHtml;
                    }
                }
                return html || '<div class="pp-sub">—</div>';
            }
            // Flat
            return (fallbackItems || []).length
                ? `<div class="pp-lines">${fallbackItems.map(i => renderItemLine(i, label, skuField)).join('')}</div>`
                : '<div class="pp-sub">—</div>';
        };

        const hw = renderByColor(hwByColorGroup, hwBySet, row.hwItemsRaw, 'Фурнитура', 'hardware_warehouse_sku', hasHwColorGroups);
        const pkg = renderByColor(pkgByColorGroup, pkgBySet, row.pkgItemsRaw, 'Упаковка', 'packaging_warehouse_sku', hasPkgColorGroups);

        return `<div class="pp-cell-block">
            <div class="pp-duo-block">
                <div class="pp-mini-block">
                    <div class="pp-block-title">Фурнитура</div>
                    ${hw}
                </div>
                <div class="pp-mini-block">
                    <div class="pp-block-title">Упаковка</div>
                    ${pkg}
                </div>
            </div>
            <div class="pp-sub" style="margin-top:6px;"><strong>Готовность:</strong> ${row.hardwareReadyLabelHtml}</div>
        </div>`;
    },

    esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    // ==========================================
    // Photo Lightbox
    // ==========================================

    showPhotoLightbox(linkEl) {
        const img = linkEl.querySelector('img');
        if (!img) return;
        const src = img.src;

        // Remove existing lightbox if any
        const existing = document.getElementById('pp-photo-lightbox');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'pp-photo-lightbox';
        overlay.className = 'pp-lightbox-overlay';
        overlay.innerHTML = `
            <div class="pp-lightbox-content">
                <img src="${src}" class="pp-lightbox-img" alt="Фото">
                <button class="pp-lightbox-close" title="Закрыть">&times;</button>
            </div>
        `;

        // Close on overlay click or close button
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.classList.contains('pp-lightbox-close')) {
                overlay.remove();
            }
        });

        // Close on Escape key
        const onKey = (e) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
            }
        };
        document.addEventListener('keydown', onKey);

        document.body.appendChild(overlay);
    },
};

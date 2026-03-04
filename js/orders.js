// =============================================
// Recycle Object — Orders History Page
// v35: Table + Kanban board views
// =============================================

const STATUS_OPTIONS = [
    { value: 'draft',                label: 'Черновик' },
    { value: 'sample',               label: 'Заказ образца' },
    { value: 'production_casting',   label: 'Производство: Выливание' },
    { value: 'production_hardware',  label: 'Производство: Сборка' },
    { value: 'production_packaging', label: 'Производство: Упаковка' },
    { value: 'delivery',             label: 'Доставка' },
    { value: 'completed',            label: 'Готово' },
    { value: 'cancelled',            label: 'Отменён' },
    { value: 'deleted',              label: 'Удалён' },
];

// Production sub-stage labels for board card badge
const PRODUCTION_SUBSTAGES = {
    production_casting:   'Выливание формы',
    production_hardware:  'Сборка фурнитуры',
    production_packaging: 'Упаковка',
    in_production:        'В производстве',
};

const BOARD_COLUMNS = [
    { status: 'draft',      label: 'Черновик',      color: '#6b7280', icon: '○', statuses: ['draft', 'calculated'] },
    { status: 'sample',     label: 'Заказ образца', color: '#3b82f6', icon: '◎', statuses: ['sample'] },
    { status: 'production', label: 'Производство',  color: '#f59e0b', icon: '◐', statuses: ['production_casting', 'production_hardware', 'production_packaging', 'in_production'] },
    { status: 'delivery',   label: 'Доставка',      color: '#8b5cf6', icon: '→', statuses: ['delivery'] },
    { status: 'completed',  label: 'Готово',         color: '#22c55e', icon: '●', statuses: ['completed'] },
    { status: 'cancelled',  label: 'Отменён',        color: '#ef4444', icon: '✕', statuses: ['cancelled'] },
];

const Orders = {
    allOrders: [],
    view: 'board', // 'board' | 'table'

    setView(v) {
        this.view = v;
        document.querySelectorAll('.orders-view-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.orders-view-btn[data-view="${v}"]`)?.classList.add('active');
        document.getElementById('orders-table-view').style.display = v === 'table' ? '' : 'none';
        document.getElementById('orders-board-view').style.display = v === 'board' ? '' : 'none';

        if (v === 'board') {
            this.renderBoard(this.allOrders);
        } else {
            this.renderTable(this.allOrders);
        }
    },

    async loadList() {
        try {
            const status = document.getElementById('orders-filter-status').value;
            const filters = {};
            if (status) filters.status = status;

            this.allOrders = await loadOrders(filters);

            if (this.view === 'board') {
                this.renderBoard(this.allOrders);
            } else {
                this.renderTable(this.allOrders);
            }
        } catch (e) {
            console.error('Orders load error:', e);
        }
    },

    filterLocal() {
        const query = (document.getElementById('orders-search').value || '').toLowerCase().trim();
        if (!query) {
            if (this.view === 'board') this.renderBoard(this.allOrders);
            else this.renderTable(this.allOrders);
            return;
        }
        const filtered = this.allOrders.filter(o =>
            (o.order_name || '').toLowerCase().includes(query)
            || (o.client_name || '').toLowerCase().includes(query)
            || (o.manager_name || '').toLowerCase().includes(query)
        );
        if (this.view === 'board') this.renderBoard(filtered);
        else this.renderTable(filtered);
    },

    // ==========================================
    // TABLE VIEW (grouped by status sections)
    // ==========================================

    // Which sections are collapsed
    collapsedSections: {},

    toggleSection(status) {
        this.collapsedSections[status] = !this.collapsedSections[status];
        const body = document.getElementById('orders-section-body-' + status);
        const icon = document.getElementById('orders-section-icon-' + status);
        if (body) body.style.display = this.collapsedSections[status] ? 'none' : '';
        if (icon) icon.textContent = this.collapsedSections[status] ? '▸' : '▾';
    },

    // Section display order and config for table view
    // Each section has a 'statuses' array for backward compat grouping
    STATUS_SECTIONS: [
        { status: 'draft',       label: 'Черновик',      color: '#6b7280', icon: '○', defaultOpen: true,  statuses: ['draft', 'calculated'] },
        { status: 'sample',      label: 'Заказ образца', color: '#3b82f6', icon: '◎', defaultOpen: true,  statuses: ['sample'] },
        { status: 'production',  label: 'Производство',  color: '#f59e0b', icon: '◐', defaultOpen: true,  statuses: ['production_casting', 'production_hardware', 'production_packaging', 'in_production'] },
        { status: 'delivery',    label: 'Доставка',      color: '#8b5cf6', icon: '→', defaultOpen: true,  statuses: ['delivery'] },
        { status: 'completed',   label: 'Готово',         color: '#22c55e', icon: '●', defaultOpen: false, statuses: ['completed'] },
        { status: 'cancelled',   label: 'Отменён',        color: '#ef4444', icon: '✕', defaultOpen: false, statuses: ['cancelled'] },
        { status: 'deleted',     label: 'Корзина',        color: '#9ca3af', icon: '&#128465;', defaultOpen: false, statuses: ['deleted'] },
    ],

    renderTable(orders) {
        const container = document.getElementById('orders-table-view');

        if (orders.length === 0) {
            container.innerHTML = `<div class="card"><div class="empty-state">
                <div class="empty-icon">&#9776;</div>
                <p>Нет заказов</p>
            </div></div>`;
            return;
        }

        // Check if we're filtering by specific status
        const statusFilter = document.getElementById('orders-filter-status').value;

        // Choose which sections to show
        // When filtering, find the section that contains the filtered status
        const sections = statusFilter
            ? this.STATUS_SECTIONS.filter(s => s.statuses.includes(statusFilter))
            : this.STATUS_SECTIONS;

        let html = '';

        for (const section of sections) {
            const sectionOrders = orders.filter(o => section.statuses.includes(o.status));
            if (sectionOrders.length === 0 && !statusFilter) continue; // skip empty sections in all-view

            const totalRevenue = sectionOrders.reduce((s, o) => s + (o.total_revenue_plan || 0), 0);

            // Determine collapsed state (use defaults for first render)
            if (this.collapsedSections[section.status] === undefined) {
                this.collapsedSections[section.status] = !section.defaultOpen;
            }
            const collapsed = this.collapsedSections[section.status];

            html += `
            <div class="orders-section" style="margin-bottom:8px">
                <div class="orders-section-header" onclick="Orders.toggleSection('${section.status}')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);${collapsed ? '' : 'border-bottom-left-radius:0;border-bottom-right-radius:0;'}">
                    <span id="orders-section-icon-${section.status}" style="font-size:12px;color:var(--text-muted);width:12px">${collapsed ? '▸' : '▾'}</span>
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${section.color}"></span>
                    <span style="font-weight:700;font-size:13px">${section.label}</span>
                    <span style="font-size:12px;color:var(--text-muted);font-weight:600">${sectionOrders.length}</span>
                    <span style="flex:1"></span>
                    <span style="font-size:12px;color:var(--text-muted)">${this.shortRub(totalRevenue)}</span>
                </div>
                <div id="orders-section-body-${section.status}" style="${collapsed ? 'display:none' : ''}">
                    ${sectionOrders.length === 0
                        ? `<div class="card" style="border-top-left-radius:0;border-top-right-radius:0;border-top:0"><p class="text-muted" style="padding:12px;font-size:12px;text-align:center">Нет заказов</p></div>`
                        : `<div class="card" style="padding:0;border-top-left-radius:0;border-top-right-radius:0;border-top:0"><div class="table-wrap"><table>
                        <thead><tr>
                            <th>Заказ</th>
                            <th>Клиент</th>
                            <th>Менеджер</th>
                            <th>Статус</th>
                            <th>Оплата</th>
                            <th class="text-right">Выручка</th>
                            <th class="text-right">Маржа</th>
                            <th>Дата</th>
                            <th></th>
                        </tr></thead>
                        <tbody>${sectionOrders.map(o => this._renderOrderRow(o)).join('')}</tbody>
                    </table></div></div>`
                    }
                </div>
            </div>`;
        }

        container.innerHTML = html;
    },

    _renderOrderRow(o) {
        const isDeleted = o.status === 'deleted';

        // Deleted date display
        const dateDisplay = isDeleted && o.deleted_at
            ? App.formatDate(o.deleted_at) + ' <span style="color:var(--red);font-size:10px;">(удалён)</span>'
            : App.formatDate(o.created_at);

        // Action buttons
        const actionButtons = isDeleted
            ? `<div class="flex gap-8">
                    <button class="btn btn-sm btn-outline" onclick="Orders.restoreOrder(${o.id})" title="Восстановить" style="color:var(--green);border-color:var(--green);">&#8634;</button>
                    <button class="btn btn-sm btn-danger" onclick="Orders.confirmPermanentDelete(${o.id})">&#10005;</button>
               </div>`
            : `<div class="flex gap-8">
                    <button class="btn btn-sm btn-outline" onclick="Orders.cloneOrder(${o.id})" title="Копировать">&#10697;</button>
                    <button class="btn btn-sm btn-outline" onclick="Orders.editOrder(${o.id})" title="Редактировать">&#9998;</button>
                    <button class="btn btn-sm btn-danger" onclick="Orders.confirmDelete(${o.id})">&#10005;</button>
               </div>`;

        // Payment status badge
        const ps = PAYMENT_STATUSES.find(s => s.key === (o.payment_status || 'not_sent')) || PAYMENT_STATUSES[0];
        const paymentBadge = `<span class="badge badge-${ps.color}" style="font-size:10px;">${ps.label}</span>`;

        // Inline status select
        const statusSelect = isDeleted
            ? `<span style="font-size:11px;color:var(--text-muted)">Удалён</span>`
            : `<select class="inline-status-select status-${o.status}" onchange="Orders.onStatusChange(${o.id}, this.value, '${o.status}')" onclick="event.stopPropagation()">
                ${STATUS_OPTIONS.filter(s => s.value !== 'deleted').map(s =>
                    `<option value="${s.value}" ${s.value === o.status ? 'selected' : ''}>${s.label}</option>`
                ).join('')}
            </select>`;

        return `
        <tr style="${isDeleted ? 'opacity:0.7;' : ''}">
            <td><a href="#order-detail/${o.id}" onclick="App.navigate('order-detail', true, ${o.id}); return false;" style="color:var(--accent);font-weight:600;text-decoration:none" title="Открыть карточку заказа">${this.escHtml(o.order_name)}</a></td>
            <td>${this.escHtml(o.client_name || '—')}</td>
            <td style="font-size:12px">${this.escHtml(o.manager_name || '—')}</td>
            <td>${statusSelect}</td>
            <td>${paymentBadge}</td>
            <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
            <td class="text-right ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</td>
            <td style="font-size:12px">${dateDisplay}</td>
            <td>${actionButtons}</td>
        </tr>`;
    },

    // ==========================================
    // BOARD VIEW (Kanban)
    // ==========================================

    renderBoard(orders) {
        const container = document.getElementById('orders-board-view');
        if (!container) return;

        // Exclude only deleted from board (cancelled has its own column)
        const active = orders.filter(o => o.status !== 'deleted');

        container.innerHTML = BOARD_COLUMNS.map(col => {
            const colOrders = active.filter(o => col.statuses.includes(o.status));
            const totalRevenue = colOrders.reduce((s, o) => s + (o.total_revenue_plan || 0), 0);

            return `
            <div class="orders-board-col" data-status="${col.status}"
                 ondragover="Orders.onBoardDragOver(event)"
                 ondragleave="Orders.onBoardDragLeave(event)"
                 ondrop="Orders.onBoardDrop(event, '${col.status}')">
                <div class="orders-board-col-header" style="border-top:3px solid ${col.color}">
                    <span>${col.icon} ${col.label} <span style="font-weight:400;color:var(--text-muted)">(${colOrders.length})</span></span>
                    <span style="font-size:11px;color:var(--text-muted)">${this.shortRub(totalRevenue)}</span>
                </div>
                <div class="orders-board-col-body">
                    ${colOrders.length === 0
                        ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0">Нет заказов</div>'
                        : colOrders.map(o => this.renderBoardCard(o, col.color)).join('')}
                </div>
            </div>`;
        }).join('');
    },

    renderBoardCard(order, statusColor) {
        const ps = PAYMENT_STATUSES.find(s => s.key === (order.payment_status || 'not_sent')) || PAYMENT_STATUSES[0];
        const margin = order.margin_percent_plan || 0;

        // Deadline display
        let deadlineHtml = '';
        if (order.deadline_end || order.deadline_start || order.deadline) {
            const d = order.deadline_end || order.deadline_start || order.deadline;
            try {
                const dt = new Date(d);
                const isOverdue = dt < new Date() && order.status !== 'completed';
                deadlineHtml = `<span style="font-size:10px;${isOverdue ? 'color:var(--red);font-weight:600' : 'color:var(--text-muted)'}">
                    ${isOverdue ? '!' : ''}${dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>`;
            } catch (e) {}
        }

        // Production sub-stage badge
        const subStage = PRODUCTION_SUBSTAGES[order.status];
        const subStageBadge = subStage
            ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;margin-bottom:4px;">◉ ${subStage}</div>`
            : '';

        return `
        <div class="order-board-card" draggable="true"
             ondragstart="Orders.onBoardDragStart(event, ${order.id})"
             onclick="App.navigate('order-detail', true, ${order.id})">
            <div class="order-board-card-title">${this.escHtml(order.order_name || 'Без названия')}</div>
            ${subStageBadge}
            <div class="order-board-card-client">${this.escHtml(order.client_name || '')} ${order.manager_name ? '/ ' + this.escHtml(order.manager_name) : ''}</div>
            <div class="order-board-card-footer">
                <span class="badge badge-${ps.color}" style="font-size:9px">${ps.label}</span>
                <span style="font-size:11px;font-weight:600;${margin >= 30 ? 'color:var(--green)' : 'color:var(--red)'}">${formatPercent(margin)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                <span style="font-size:11px;color:var(--text-muted)">${formatRub(order.total_revenue_plan || 0)}</span>
                ${deadlineHtml}
            </div>
        </div>`;
    },

    // Drag & drop for board
    onBoardDragStart(e, orderId) {
        e.dataTransfer.setData('text/plain', orderId);
        e.target.classList.add('dragging');
    },

    onBoardDragOver(e) {
        e.preventDefault();
        const col = e.currentTarget;
        col.classList.add('drag-over');
    },

    onBoardDragLeave(e) {
        e.currentTarget.classList.remove('drag-over');
    },

    async onBoardDrop(e, newStatus) {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-over');

        const orderId = parseInt(e.dataTransfer.getData('text/plain'));
        const order = this.allOrders.find(o => o.id === orderId);
        if (!order) return;

        // When dropping into «Производство» column, start at the first sub-stage
        const actualStatus = newStatus === 'production' ? 'production_casting' : newStatus;
        if (order.status === actualStatus) return;

        const oldStatus = order.status;
        const managerName = App.getCurrentEmployeeName();

        await updateOrderStatus(orderId, actualStatus);
        await this._syncWarehouseByStatus(orderId, oldStatus, actualStatus, order.order_name, managerName || 'Неизвестный');
        order.status = actualStatus;

        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: App.statusLabel(oldStatus),
            new_value: App.statusLabel(actualStatus),
            manager: managerName || 'Неизвестный',
        });

        App.toast(`Статус: ${App.statusLabel(actualStatus)}`);
        this.renderBoard(this.allOrders);
    },

    shortRub(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
        return amount.toFixed(0);
    },

    // ==========================================
    // STATUS CHANGE (table)
    // ==========================================

    async onStatusChange(orderId, newStatus, oldStatus) {
        if (newStatus === oldStatus) return;

        const managerName = App.getCurrentEmployeeName();

        await updateOrderStatus(orderId, newStatus);
        const order = this.allOrders.find(o => o.id === orderId);
        await this._syncWarehouseByStatus(orderId, oldStatus, newStatus, order && order.order_name, managerName || 'Неизвестный');

        // Save change history
        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: App.statusLabel(oldStatus),
            new_value: App.statusLabel(newStatus),
            manager: managerName || 'Неизвестный',
        });

        App.toast(`Статус: ${App.statusLabel(newStatus)}`);
        this.loadList();
    },

    _isConsumedStatus(status) {
        return ['production_casting', 'production_hardware', 'production_packaging', 'in_production', 'delivery', 'completed'].includes(status);
    },

    _collectWarehouseDemand(items) {
        const demand = new Map();
        const add = (itemId, qty) => {
            if (!itemId || qty <= 0) return;
            demand.set(itemId, (demand.get(itemId) || 0) + qty);
        };

        (items || []).forEach(it => {
            const qty = parseFloat(
                it.quantity
                ?? it.hardware_qty
                ?? it.packaging_qty
                ?? it.qty
            ) || 0;
            if (qty <= 0) return;
            if (it.item_type === 'hardware' && it.hardware_source === 'warehouse' && it.hardware_warehouse_item_id) {
                add(it.hardware_warehouse_item_id, qty);
            }
            if (it.item_type === 'packaging' && it.packaging_source === 'warehouse' && it.packaging_warehouse_item_id) {
                add(it.packaging_warehouse_item_id, qty);
            }
        });
        return demand;
    },

    async _syncWarehouseByStatus(orderId, oldStatus, newStatus, orderName, managerName) {
        if (oldStatus === newStatus) return;
        const data = await loadOrder(orderId);
        if (!data) return;
        const demand = this._collectWarehouseDemand(data.items);
        if (demand.size === 0) return;

        const wasConsumed = this._isConsumedStatus(oldStatus);
        const nowConsumed = this._isConsumedStatus(newStatus);
        const nowSample = newStatus === 'sample';

        // 1) Release old auto-reservations for this order
        const reservations = await loadWarehouseReservations();
        const nowIso = new Date().toISOString();
        reservations.forEach(r => {
            if (r.status === 'active' && r.source === 'order_calc' && r.order_id === orderId) {
                r.status = 'released';
                r.released_at = nowIso;
            }
        });
        await saveWarehouseReservations(reservations);

        // 2) Return stock when leaving consumed statuses to non-consumed
        if (wasConsumed && !nowConsumed) {
            for (const [itemId, qty] of demand.entries()) {
                await Warehouse.adjustStock(
                    itemId,
                    qty,
                    'addition',
                    orderName || 'Заказ',
                    `Возврат на склад при смене статуса: ${App.statusLabel(oldStatus)} → ${App.statusLabel(newStatus)}`,
                    managerName || ''
                );
            }
        }

        // 3) Reserve stock for sample
        if (nowSample) {
            const freshReservations = await loadWarehouseReservations();
            const items = await loadWarehouseItems();
            const activeReservedByItem = new Map();
            freshReservations.forEach(r => {
                if (r.status !== 'active') return;
                activeReservedByItem.set(r.item_id, (activeReservedByItem.get(r.item_id) || 0) + (parseFloat(r.qty) || 0));
            });

            const toInsert = [];
            demand.forEach((qty, itemId) => {
                const wh = items.find(i => i.id === itemId);
                if (!wh) return;
                const stock = parseFloat(wh.qty) || 0;
                const reserved = activeReservedByItem.get(itemId) || 0;
                const available = Math.max(0, stock - reserved);
                const reserveQty = Math.min(qty, available);
                if (reserveQty > 0) {
                    toInsert.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        item_id: itemId,
                        order_id: orderId,
                        order_name: orderName || 'Заказ',
                        qty: reserveQty,
                        status: 'active',
                        source: 'order_calc',
                        created_at: new Date().toISOString(),
                        created_by: managerName || '',
                    });
                }
            });

            if (toInsert.length > 0) {
                await saveWarehouseReservations([...freshReservations, ...toInsert]);
            }
            return;
        }

        // 4) Deduct stock when entering consumed statuses from non-consumed
        if (!wasConsumed && nowConsumed) {
            for (const [itemId, qty] of demand.entries()) {
                await Warehouse.adjustStock(
                    itemId,
                    -qty,
                    'deduction',
                    orderName || 'Заказ',
                    `Списание при смене статуса: ${App.statusLabel(oldStatus)} → ${App.statusLabel(newStatus)}`,
                    managerName || ''
                );
            }
        }
    },

    editOrder(orderId) {
        App.navigate('order-detail', true, orderId);
    },

    async cloneOrder(orderId) {
        App.toast('Копирование заказа...');
        try {
            const data = await loadOrder(orderId);
            if (!data) { App.toast('Ошибка загрузки', 'error'); return; }

            const clonedOrder = { ...data.order };
            delete clonedOrder.id;
            clonedOrder.order_name = (clonedOrder.order_name || 'Заказ') + ' (копия)';
            clonedOrder.status = 'draft';
            delete clonedOrder.created_at;
            delete clonedOrder.updated_at;

            const clonedItems = (data.items || []).map(item => {
                const c = { ...item };
                delete c.id;
                delete c.order_id;
                return c;
            });

            const newId = await saveOrder(clonedOrder, clonedItems);
            if (newId) {
                App.toast('Заказ скопирован');
                Calculator.loadOrder(newId);
            }
        } catch (e) {
            console.error('Clone order error:', e);
            App.toast('Ошибка копирования', 'error');
        }
    },

    async confirmDelete(orderId) {
        const order = this.allOrders.find(o => o.id === orderId);
        const name = order && order.order_name ? order.order_name : 'Без названия';
        if (confirm(`Перенести заказ "${name}" в корзину?`)) {
            const managerName = App.getCurrentEmployeeName();
            await deleteOrder(orderId);
            await this.addChangeRecord(orderId, {
                field: 'status',
                old_value: 'Активный',
                new_value: 'Удалён (в корзину)',
                manager: managerName,
            });
            App.toast('Заказ перемещён в корзину');
            this.loadList();
        }
    },

    async restoreOrder(orderId) {
        await restoreOrder(orderId);
        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: 'Удалён',
            new_value: 'Черновик (восстановлен)',
            manager: App.getCurrentEmployeeName(),
        });
        App.toast('Заказ восстановлен');
        this.loadList();
    },

    async confirmPermanentDelete(orderId) {
        const order = this.allOrders.find(o => o.id === orderId);
        const name = order && order.order_name ? order.order_name : 'Без названия';
        if (confirm(`ВНИМАНИЕ: Удалить заказ "${name}" НАВСЕГДА? Это действие нельзя отменить!`)) {
            await permanentDeleteOrder(orderId);
            App.toast('Заказ удалён навсегда');
            this.loadList();
        }
    },

    // ==========================================
    // CHANGE HISTORY
    // ==========================================

    async addChangeRecord(orderId, change) {
        const history = await this.loadHistory(orderId);
        history.push({
            date: new Date().toISOString(),
            manager: change.manager || '',
            field: change.field || '',
            old_value: change.old_value || '',
            new_value: change.new_value || '',
            description: change.description || '',
        });
        await this.saveHistory(orderId, history);
    },

    async loadHistory(orderId) {
        const key = 'ro_calc_order_history_' + orderId;
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) { return []; }
    },

    async saveHistory(orderId, history) {
        const key = 'ro_calc_order_history_' + orderId;
        localStorage.setItem(key, JSON.stringify(history));
    },

    escHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
};

// =============================================
// Recycle Object — Orders History Page
// v35: Table + Kanban board views
// =============================================

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Черновик' },
    { value: 'calculated', label: 'Рассчитан' },
    { value: 'in_production', label: 'В производстве' },
    { value: 'completed', label: 'Выполнен' },
    { value: 'cancelled', label: 'Отменен' },
    { value: 'deleted', label: 'Удалён' },
];

const BOARD_COLUMNS = [
    { status: 'draft', label: 'Черновик', color: '#6b7280', icon: '○' },
    { status: 'calculated', label: 'Рассчитан', color: '#2563eb', icon: '◉' },
    { status: 'in_production', label: 'В производстве', color: '#f59e0b', icon: '◐' },
    { status: 'completed', label: 'Выполнен', color: '#10b981', icon: '●' },
];

const Orders = {
    allOrders: [],
    view: 'table', // 'table' | 'board'

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
    // TABLE VIEW
    // ==========================================

    renderTable(orders) {
        const tbody = document.getElementById('orders-table-body');

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="empty-state">
                <div class="empty-icon">&#9776;</div>
                <p>Нет заказов</p>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = orders.map(o => {
            const isDeleted = o.status === 'deleted';

            // Build status dropdown (exclude 'deleted' from manual selection)
            const statusOpts = STATUS_OPTIONS
                .filter(s => s.value !== 'deleted')
                .map(s => `<option value="${s.value}" ${o.status === s.value ? 'selected' : ''}>${s.label}</option>`)
                .join('');

            // Deleted date display
            const dateDisplay = isDeleted && o.deleted_at
                ? App.formatDate(o.deleted_at) + ' <span style="color:var(--red);font-size:10px;">(удалён)</span>'
                : App.formatDate(o.created_at);

            // Action buttons differ for deleted vs active orders
            const actionButtons = isDeleted
                ? `<div class="flex gap-8">
                        <button class="btn btn-sm btn-outline" onclick="Orders.restoreOrder(${o.id})" title="Восстановить" style="color:var(--green);border-color:var(--green);">&#8634; Восстановить</button>
                        <button class="btn btn-sm btn-danger" onclick="Orders.confirmPermanentDelete(${o.id}, '${this.escHtml(o.order_name)}')">&#10005; Навсегда</button>
                   </div>`
                : `<div class="flex gap-8">
                        <button class="btn btn-sm btn-outline" onclick="Orders.editOrder(${o.id})" title="Редактировать">&#9998;</button>
                        <button class="btn btn-sm btn-danger" onclick="Orders.confirmDelete(${o.id}, '${this.escHtml(o.order_name)}')">&#10005;</button>
                   </div>`;

            // Status cell: for deleted orders show static label, for others show dropdown
            const statusCell = isDeleted
                ? `<span style="color:var(--red);font-weight:600;font-size:12px;">&#128465; Удалён</span>`
                : `<select class="status-select status-${o.status}" onchange="Orders.onStatusChange(${o.id}, this.value, '${o.status}')" style="font-size:12px; padding:2px 4px; border-radius:6px; border:1px solid var(--border); background:var(--bg); cursor:pointer;">
                        ${statusOpts}
                   </select>`;

            // Payment status badge
            const ps = PAYMENT_STATUSES.find(s => s.key === (o.payment_status || 'not_sent')) || PAYMENT_STATUSES[0];
            const paymentBadge = `<span class="badge badge-${ps.color}" style="font-size:10px;">${ps.label}</span>`;

            return `
            <tr style="${isDeleted ? 'opacity:0.7;' : ''}">
                <td><a href="#order-detail/${o.id}" onclick="App.navigate('order-detail', true, ${o.id}); return false;" style="color:var(--accent);font-weight:600;text-decoration:none" title="Открыть карточку заказа">${this.escHtml(o.order_name)}</a></td>
                <td>${this.escHtml(o.client_name || '—')}</td>
                <td>${this.escHtml(o.manager_name || '—')}</td>
                <td>${statusCell}</td>
                <td>${paymentBadge}</td>
                <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
                <td class="text-right ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</td>
                <td>${dateDisplay}</td>
                <td>${actionButtons}</td>
            </tr>`;
        }).join('');
    },

    // ==========================================
    // BOARD VIEW (Kanban)
    // ==========================================

    renderBoard(orders) {
        const container = document.getElementById('orders-board-view');
        if (!container) return;

        // Exclude deleted from board
        const active = orders.filter(o => o.status !== 'deleted' && o.status !== 'cancelled');

        container.innerHTML = BOARD_COLUMNS.map(col => {
            const colOrders = active.filter(o => o.status === col.status);
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
            } catch {}
        }

        return `
        <div class="order-board-card" draggable="true"
             ondragstart="Orders.onBoardDragStart(event, ${order.id})"
             onclick="App.navigate('order-detail', true, ${order.id})">
            <div class="order-board-card-title">${this.escHtml(order.order_name || 'Без названия')}</div>
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
        if (!order || order.status === newStatus) return;

        const oldStatus = order.status;
        const managerName = prompt('Имя менеджера (для истории изменений):');
        if (managerName === null) return; // user cancelled

        await updateOrderStatus(orderId, newStatus);
        order.status = newStatus;

        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: App.statusLabel(oldStatus),
            new_value: App.statusLabel(newStatus),
            manager: managerName || 'Неизвестный',
        });

        App.toast(`Статус: ${App.statusLabel(newStatus)}`);
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

        const managerName = prompt('Имя менеджера (для истории изменений):');
        if (managerName === null) {
            // User cancelled — revert select
            this.loadList();
            return;
        }

        await updateOrderStatus(orderId, newStatus);

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

    editOrder(orderId) {
        App.navigate('order-detail', true, orderId);
    },

    async confirmDelete(orderId, name) {
        if (confirm(`Перенести заказ "${name}" в корзину?`)) {
            const managerName = document.getElementById('calc-manager-name')
                ? (document.getElementById('calc-manager-name').value.trim() || 'Неизвестный')
                : 'Неизвестный';
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
            manager: 'Неизвестный',
        });
        App.toast('Заказ восстановлен');
        this.loadList();
    },

    async confirmPermanentDelete(orderId, name) {
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
        } catch { return []; }
    },

    async saveHistory(orderId, history) {
        const key = 'ro_calc_order_history_' + orderId;
        localStorage.setItem(key, JSON.stringify(history));
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

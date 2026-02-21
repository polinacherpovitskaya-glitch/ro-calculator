// =============================================
// Recycle Object — Orders History Page
// =============================================

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Черновик' },
    { value: 'calculated', label: 'Рассчитан' },
    { value: 'in_production', label: 'В производстве' },
    { value: 'completed', label: 'Выполнен' },
    { value: 'cancelled', label: 'Отменен' },
    { value: 'deleted', label: 'Удалён' },
];

const Orders = {
    allOrders: [],

    async loadList() {
        try {
            const status = document.getElementById('orders-filter-status').value;
            const filters = {};
            if (status) filters.status = status;

            this.allOrders = await loadOrders(filters);
            this.renderTable(this.allOrders);
        } catch (e) {
            console.error('Orders load error:', e);
        }
    },

    filterLocal() {
        const query = (document.getElementById('orders-search').value || '').toLowerCase().trim();
        if (!query) {
            this.renderTable(this.allOrders);
            return;
        }
        const filtered = this.allOrders.filter(o =>
            (o.order_name || '').toLowerCase().includes(query)
            || (o.client_name || '').toLowerCase().includes(query)
            || (o.manager_name || '').toLowerCase().includes(query)
        );
        this.renderTable(filtered);
    },

    renderTable(orders) {
        const tbody = document.getElementById('orders-table-body');

        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="empty-state">
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

            return `
            <tr style="${isDeleted ? 'opacity:0.7;' : ''}">
                <td><a href="#" onclick="Orders.editOrder(${o.id}); return false;" style="color:var(--accent);font-weight:600;text-decoration:none" title="Открыть в калькуляторе">${this.escHtml(o.order_name)}</a></td>
                <td>${this.escHtml(o.client_name || '—')}</td>
                <td>${this.escHtml(o.manager_name || '—')}</td>
                <td>${statusCell}</td>
                <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
                <td class="text-right ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</td>
                <td>${dateDisplay}</td>
                <td>${actionButtons}</td>
            </tr>`;
        }).join('');
    },

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

    async editOrder(orderId) {
        await Calculator.loadOrder(orderId);
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

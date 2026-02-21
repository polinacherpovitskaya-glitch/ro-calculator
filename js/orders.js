// =============================================
// Recycle Object — Orders History Page
// =============================================

const STATUS_OPTIONS = [
    { value: 'draft', label: 'Черновик' },
    { value: 'calculated', label: 'Рассчитан' },
    { value: 'in_production', label: 'В производстве' },
    { value: 'completed', label: 'Выполнен' },
    { value: 'cancelled', label: 'Отменен' },
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
            // Build status dropdown
            const statusOpts = STATUS_OPTIONS.map(s =>
                `<option value="${s.value}" ${o.status === s.value ? 'selected' : ''}>${s.label}</option>`
            ).join('');

            return `
            <tr>
                <td><a href="#" onclick="Orders.editOrder(${o.id}); return false;" style="color:var(--accent);font-weight:600;text-decoration:none" title="Открыть в калькуляторе">${this.escHtml(o.order_name)}</a></td>
                <td>${this.escHtml(o.client_name || '—')}</td>
                <td>${this.escHtml(o.manager_name || '—')}</td>
                <td>
                    <select class="status-select status-${o.status}" onchange="Orders.onStatusChange(${o.id}, this.value, '${o.status}')" style="font-size:12px; padding:2px 4px; border-radius:6px; border:1px solid var(--border); background:var(--bg); cursor:pointer;">
                        ${statusOpts}
                    </select>
                </td>
                <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
                <td class="text-right ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</td>
                <td>${App.formatDate(o.created_at)}</td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-sm btn-outline" onclick="Orders.editOrder(${o.id})" title="Редактировать">&#9998;</button>
                        <button class="btn btn-sm btn-danger" onclick="Orders.confirmDelete(${o.id}, '${this.escHtml(o.order_name)}')">&#10005;</button>
                    </div>
                </td>
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
        if (confirm(`Удалить заказ "${name}"?`)) {
            await deleteOrder(orderId);
            App.toast('Заказ удален');
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

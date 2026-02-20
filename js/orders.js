// =============================================
// Recycle Object — Orders History Page
// =============================================

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

        tbody.innerHTML = orders.map(o => `
            <tr>
                <td><a href="#" onclick="Calculator.loadOrder(${o.id}); return false;" style="color:var(--accent);font-weight:600;text-decoration:none">${this.escHtml(o.order_name)}</a></td>
                <td>${this.escHtml(o.client_name || '—')}</td>
                <td>${this.escHtml(o.manager_name || '—')}</td>
                <td><span class="status-dot ${o.status}"></span>${App.statusLabel(o.status)}</td>
                <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
                <td class="text-right ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</td>
                <td>${App.formatDate(o.created_at)}</td>
                <td>
                    <div class="flex gap-8">
                        <button class="btn btn-sm btn-outline" onclick="Orders.changeStatus(${o.id}, '${o.status}')">Статус</button>
                        <button class="btn btn-sm btn-danger" onclick="Orders.confirmDelete(${o.id}, '${this.escHtml(o.order_name)}')">&#10005;</button>
                    </div>
                </td>
            </tr>
        `).join('');
    },

    async changeStatus(orderId, currentStatus) {
        const flow = ['draft', 'calculated', 'in_production', 'completed', 'cancelled'];
        const currentIdx = flow.indexOf(currentStatus);
        const nextIdx = currentIdx < flow.length - 2 ? currentIdx + 1 : 0;
        const nextStatus = flow[nextIdx];

        await updateOrderStatus(orderId, nextStatus);
        App.toast(`Статус: ${App.statusLabel(nextStatus)}`);
        this.loadList();
    },

    async confirmDelete(orderId, name) {
        if (confirm(`Удалить заказ "${name}"?`)) {
            await deleteOrder(orderId);
            App.toast('Заказ удален');
            this.loadList();
        }
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

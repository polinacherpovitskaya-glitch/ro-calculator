// =============================================
// Recycle Object — Dashboard Page
// =============================================

const Dashboard = {
    async load() {
        try {
            const orders = await loadOrders({ limit: 10 });
            this.renderStats(orders);
            this.renderTable(orders);
        } catch (e) {
            console.error('Dashboard load error:', e);
        }
    },

    renderStats(orders) {
        const active = orders.filter(o => o.status === 'in_production' || o.status === 'calculated');
        document.getElementById('dash-orders-active').textContent = active.length;

        // Calculate total load from active orders
        let totalPlasticHours = 0;
        let totalPackagingHours = 0;
        let totalRevenue = 0;

        orders.forEach(o => {
            if (o.status === 'in_production' || o.status === 'calculated') {
                totalPlasticHours += o.production_hours_plastic || 0;
                totalPackagingHours += (o.production_hours_packaging || 0) + (o.production_hours_hardware || 0);
            }
            totalRevenue += o.total_revenue_plan || 0;
        });

        const params = App.params;
        const plasticPct = params && params.plasticHours > 0
            ? round2(totalPlasticHours * 100 / params.plasticHours) : 0;
        const packagingPct = params && params.packagingHours > 0
            ? round2(totalPackagingHours * 100 / params.packagingHours) : 0;

        document.getElementById('dash-load-plastic').textContent = formatPercent(plasticPct);
        document.getElementById('dash-load-packaging').textContent = formatPercent(packagingPct);
        document.getElementById('dash-revenue').textContent = formatRub(totalRevenue);

        this.setLoadBar('dash-load-plastic-bar', plasticPct);
        this.setLoadBar('dash-load-packaging-bar', packagingPct);
    },

    setLoadBar(barId, percent) {
        const bar = document.getElementById(barId);
        if (!bar) return;
        const clamped = Math.min(percent, 100);
        bar.style.width = clamped + '%';
        bar.className = 'load-bar-fill ' + (percent > 90 ? 'red' : percent > 70 ? 'yellow' : 'green');
    },

    renderTable(orders) {
        const tbody = document.getElementById('dashboard-orders-table');
        if (orders.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-state">
                <div class="empty-icon">&#9998;</div>
                <p>Нет расчетов. Создайте первый заказ.</p>
                <button class="btn btn-primary" onclick="App.navigate('calculator')">Новый расчет</button>
            </td></tr>`;
            return;
        }

        tbody.innerHTML = orders.slice(0, 5).map(o => `
            <tr style="cursor:pointer" onclick="Calculator.loadOrder(${o.id})">
                <td><strong>${this.escHtml(o.order_name)}</strong></td>
                <td>${this.escHtml(o.client_name || '—')}</td>
                <td><span class="status-dot ${o.status}"></span>${App.statusLabel(o.status)}</td>
                <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
                <td class="text-right ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</td>
                <td>${App.formatDate(o.created_at)}</td>
            </tr>
        `).join('');
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

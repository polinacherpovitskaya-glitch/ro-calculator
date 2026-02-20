// =============================================
// Recycle Object — Analytics Page
// =============================================

const Analytics = {
    chart: null,

    async load() {
        try {
            const orders = await loadOrders({});
            this.renderStats(orders);
            this.renderTable(orders);
            this.renderChart(orders);
        } catch (e) {
            console.error('Analytics load error:', e);
        }
    },

    renderStats(orders) {
        const totalOrders = orders.length;
        let totalRevenue = 0;
        let totalEarned = 0;
        let marginSum = 0;
        let marginCount = 0;

        orders.forEach(o => {
            totalRevenue += o.total_revenue_plan || 0;
            totalEarned += o.total_margin_plan || 0;
            if (o.margin_percent_plan) {
                marginSum += o.margin_percent_plan;
                marginCount++;
            }
        });

        const avgMargin = marginCount > 0 ? round2(marginSum / marginCount) : 0;

        document.getElementById('anl-total-orders').textContent = totalOrders;
        document.getElementById('anl-avg-margin').textContent = formatPercent(avgMargin);
        document.getElementById('anl-total-revenue').textContent = formatRub(totalRevenue);
        document.getElementById('anl-total-earned').textContent = formatRub(totalEarned);
    },

    renderTable(orders) {
        const tbody = document.getElementById('analytics-table-body');

        if (orders.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Нет данных</td></tr>';
            return;
        }

        // Sort by margin desc
        const sorted = [...orders].sort((a, b) => (b.margin_percent_plan || 0) - (a.margin_percent_plan || 0));

        tbody.innerHTML = sorted.map(o => {
            const cost = (o.total_revenue_plan || 0) - (o.total_margin_plan || 0);
            const marginClass = (o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red';
            return `
                <tr>
                    <td>${this.escHtml(o.order_name)}</td>
                    <td>${this.escHtml(o.client_name || '—')}</td>
                    <td class="text-right">${formatRub(o.total_revenue_plan || 0)}</td>
                    <td class="text-right">${formatRub(cost)}</td>
                    <td class="text-right ${marginClass}">${formatPercent(o.margin_percent_plan || 0)}</td>
                </tr>
            `;
        }).join('');
    },

    renderChart(orders) {
        // Aggregate cost structure across all orders
        // We'll use a simple distribution based on typical cost factors
        const canvas = document.getElementById('analytics-cost-chart');
        if (!canvas) return;

        let totalFot = 0;
        let totalIndirect = 0;
        let totalPlastic = 0;
        let totalMolds = 0;
        let totalPrinting = 0;
        let totalHardware = 0;
        let totalOther = 0;

        // Use rough estimates from order data
        orders.forEach(o => {
            const cost = (o.total_revenue_plan || 0) - (o.total_margin_plan || 0);
            if (cost > 0) {
                // Approximate breakdown (typical ratios)
                totalFot += cost * 0.25;
                totalIndirect += cost * 0.30;
                totalPlastic += cost * 0.15;
                totalMolds += cost * 0.10;
                totalPrinting += cost * 0.10;
                totalHardware += cost * 0.05;
                totalOther += cost * 0.05;
            }
        });

        if (this.chart) {
            this.chart.destroy();
        }

        if (typeof Chart === 'undefined') return;

        this.chart = new Chart(canvas, {
            type: 'doughnut',
            data: {
                labels: ['ФОТ', 'Косвенные', 'Пластик', 'Молды', 'Нанесение', 'Фурнитура', 'Прочее'],
                datasets: [{
                    data: [totalFot, totalIndirect, totalPlastic, totalMolds, totalPrinting, totalHardware, totalOther],
                    backgroundColor: [
                        '#2563eb', '#7c3aed', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#6b7280'
                    ],
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'bottom' },
                },
            },
        });
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

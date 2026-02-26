// =============================================
// Recycle Object — Dashboard (Main Page)
// v44b: KPI stats + drafts cards + active orders (new statuses)
// =============================================

const DASH_LOAD_STATUSES = ['sample','production_casting','production_hardware','production_packaging','delivery','in_production'];

const Dashboard = {
    async load() {
        try {
            const orders = await loadOrders({ limit: 50 });
            this.renderStats(orders);
            this.renderSections(orders);
        } catch (e) {
            console.error('Dashboard load error:', e);
        }
    },

    renderStats(orders) {
        const active = orders.filter(o => DASH_LOAD_STATUSES.includes(o.status));
        document.getElementById('dash-orders-active').textContent = active.length;

        let totalPlasticHours = 0;
        let totalPackagingHours = 0;
        let totalRevenue = 0;

        orders.forEach(o => {
            if (DASH_LOAD_STATUSES.includes(o.status)) {
                totalPlasticHours += o.production_hours_plastic || 0;
                totalPackagingHours += (o.production_hours_packaging || 0) + (o.production_hours_hardware || 0);
            }
            if (!['draft','calculated','cancelled','deleted'].includes(o.status)) {
                totalRevenue += o.total_revenue_plan || 0;
            }
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

    renderSections(orders) {
        const drafts = orders.filter(o => o.status === 'draft' || o.status === 'calculated');
        const active = orders.filter(o => DASH_LOAD_STATUSES.includes(o.status));

        const draftsSection = document.getElementById('dash-drafts-section');
        const activeSection = document.getElementById('dash-active-section');
        const emptyState = document.getElementById('dash-empty-state');

        // Drafts
        if (drafts.length > 0) {
            draftsSection.style.display = '';
            document.getElementById('dash-drafts-list').innerHTML =
                drafts.slice(0, 6).map(o => this.renderCard(o, '#6b7280')).join('')
                + (drafts.length > 6 ? `<div class="dash-card dash-card-more" onclick="App.navigate('orders')"><span>+${drafts.length - 6} ещё</span></div>` : '');
        } else {
            draftsSection.style.display = 'none';
        }

        // Active orders
        if (active.length > 0) {
            activeSection.style.display = '';
            document.getElementById('dash-active-list').innerHTML =
                active.slice(0, 6).map(o => {
                    const colors = { sample: '#3b82f6', production_casting: '#f59e0b', production_hardware: '#f59e0b', production_packaging: '#f59e0b', in_production: '#f59e0b', delivery: '#8b5cf6' };
                    return this.renderCard(o, colors[o.status] || '#2563eb');
                }).join('')
                + (active.length > 6 ? `<div class="dash-card dash-card-more" onclick="App.navigate('orders')"><span>+${active.length - 6} ещё</span></div>` : '');
        } else {
            activeSection.style.display = 'none';
        }

        // Empty state
        emptyState.style.display = (drafts.length === 0 && active.length === 0) ? '' : 'none';
    },

    renderCard(order, statusColor) {
        const margin = order.margin_percent_plan || 0;
        const revenue = order.total_revenue_plan || 0;
        const statusLabel = App.statusLabel(order.status);
        const dateStr = this.shortDate(order.updated_at || order.created_at);

        return `
        <div class="dash-card" onclick="Calculator.loadOrder(${order.id})" title="Открыть в калькуляторе">
            <div class="dash-card-header">
                <span class="dash-card-status" style="background:${statusColor}">${statusLabel}</span>
                <span class="dash-card-date">${dateStr}</span>
            </div>
            <div class="dash-card-title">${this.escHtml(order.order_name || 'Без названия')}</div>
            <div class="dash-card-client">${this.escHtml(order.client_name || '')}</div>
            <div class="dash-card-footer">
                <span class="dash-card-revenue">${formatRub(revenue)}</span>
                <span class="dash-card-margin ${margin >= 30 ? 'text-green' : 'text-red'}">${formatPercent(margin)}</span>
            </div>
        </div>`;
    },

    shortDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        } catch (e) { return ''; }
    },

    escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

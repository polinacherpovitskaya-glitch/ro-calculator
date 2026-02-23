// =============================================
// Recycle Object — Gantt Production Calendar
// v34: Horizontal timeline of orders
// =============================================

const Gantt = {
    orders: [],
    zoom: 'week', // 'day' | 'week' | 'month'
    scrollOffset: 0,

    async load() {
        try {
            this.orders = await loadOrders({});
            // Filter only active orders with deadlines
            this.orders = this.orders.filter(o =>
                o.status !== 'deleted' && o.status !== 'cancelled'
                && (o.deadline_start || o.deadline_end || o.deadline)
            );
            this.render();
        } catch (e) {
            console.error('Gantt load error:', e);
        }
    },

    setZoom(z) {
        this.zoom = z;
        document.querySelectorAll('.gantt-zoom-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.gantt-zoom-btn[data-zoom="${z}"]`)?.classList.add('active');
        this.render();
    },

    render() {
        const container = document.getElementById('gantt-container');
        if (!container) return;

        if (this.orders.length === 0) {
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128197;</div>
                        <p>Нет заказов с дедлайнами для отображения</p>
                        <p class="text-muted" style="font-size:12px">Укажите дедлайн (начало и конец) в карточке заказа</p>
                    </div>
                </div>`;
            this.renderStats();
            return;
        }

        // Calculate date range
        const { minDate, maxDate } = this.getDateRange();
        const days = this.daysBetween(minDate, maxDate);
        const cellWidth = this.zoom === 'day' ? 36 : this.zoom === 'week' ? 24 : 12;
        const totalWidth = days * cellWidth;

        // Sort orders: in_production first, then by start date
        const sorted = [...this.orders].sort((a, b) => {
            const statusOrder = { in_production: 0, calculated: 1, draft: 2, completed: 3 };
            const sa = statusOrder[a.status] ?? 5;
            const sb = statusOrder[b.status] ?? 5;
            if (sa !== sb) return sa - sb;
            const da = this.getStart(a);
            const db = this.getStart(b);
            return da - db;
        });

        // Build header (time axis)
        const headerHtml = this.renderTimeAxis(minDate, days, cellWidth);

        // Build rows
        const rowsHtml = sorted.map(o => this.renderRow(o, minDate, days, cellWidth)).join('');

        // Today marker
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOffset = this.daysBetween(minDate, today);
        const todayLeft = todayOffset * cellWidth;
        const showToday = todayOffset >= 0 && todayOffset <= days;

        container.innerHTML = `
            <div class="gantt-wrapper">
                <div class="gantt-sidebar">
                    <div class="gantt-sidebar-header">Заказ</div>
                    ${sorted.map(o => `
                        <div class="gantt-sidebar-row" title="${this.esc(o.order_name || '')}" onclick="App.navigate('order-detail', true, ${o.id})" style="cursor:pointer">
                            <div class="gantt-order-name">${this.esc(this.shortName(o.order_name || 'Без названия'))}</div>
                            <div class="gantt-order-meta">${this.esc(o.client_name || '')}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="gantt-timeline" id="gantt-timeline">
                    <div class="gantt-timeline-inner" style="width:${totalWidth + 20}px">
                        <div class="gantt-header">${headerHtml}</div>
                        <div class="gantt-body">
                            ${showToday ? `<div class="gantt-today-line" style="left:${todayLeft}px" title="Сегодня"></div>` : ''}
                            ${rowsHtml}
                        </div>
                    </div>
                </div>
            </div>`;

        // Scroll to today
        if (showToday) {
            const timeline = document.getElementById('gantt-timeline');
            if (timeline) {
                timeline.scrollLeft = Math.max(0, todayLeft - timeline.clientWidth / 3);
            }
        }

        this.renderStats();
    },

    renderTimeAxis(minDate, days, cellWidth) {
        let html = '';

        if (this.zoom === 'month') {
            // Month headers
            let d = new Date(minDate);
            while (d <= new Date(minDate.getTime() + days * 86400000)) {
                const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
                const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                const startDay = Math.max(0, this.daysBetween(minDate, monthStart));
                const endDay = Math.min(days, this.daysBetween(minDate, monthEnd) + 1);
                const width = (endDay - startDay) * cellWidth;

                if (width > 0) {
                    html += `<div class="gantt-header-cell" style="left:${startDay * cellWidth}px;width:${width}px">
                        ${d.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' })}
                    </div>`;
                }
                d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            }
        } else if (this.zoom === 'week') {
            // Week headers with day lines
            let d = new Date(minDate);
            let weekNum = 0;
            while (this.daysBetween(minDate, d) <= days) {
                // Find Monday
                const dayOfWeek = d.getDay() || 7;
                if (dayOfWeek === 1 || weekNum === 0) {
                    const dayOffset = this.daysBetween(minDate, d);
                    const nextMon = new Date(d);
                    nextMon.setDate(nextMon.getDate() + 7);
                    const endOffset = Math.min(days, this.daysBetween(minDate, nextMon));
                    const width = (endOffset - dayOffset) * cellWidth;

                    if (width > 0) {
                        html += `<div class="gantt-header-cell" style="left:${dayOffset * cellWidth}px;width:${width}px">
                            ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                        </div>`;
                    }
                    weekNum++;
                }
                d.setDate(d.getDate() + 1);
            }
        } else {
            // Day headers
            for (let i = 0; i <= days; i++) {
                const d = new Date(minDate.getTime() + i * 86400000);
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                html += `<div class="gantt-header-cell gantt-day-cell ${isWeekend ? 'gantt-weekend' : ''}" style="left:${i * cellWidth}px;width:${cellWidth}px">
                    ${d.getDate()}
                </div>`;
            }
        }

        return html;
    },

    renderRow(order, minDate, days, cellWidth) {
        const start = this.getStart(order);
        const end = this.getEnd(order);

        const startOffset = Math.max(0, this.daysBetween(minDate, start));
        const endOffset = Math.min(days, this.daysBetween(minDate, end));
        const barLeft = startOffset * cellWidth;
        const barWidth = Math.max(cellWidth, (endOffset - startOffset + 1) * cellWidth);

        const color = this.statusColor(order.status);
        const isCompleted = order.status === 'completed';

        // Payment badge
        const ps = PAYMENT_STATUSES.find(s => s.key === (order.payment_status || 'not_sent'));
        const paymentEmoji = ps && ps.key === 'paid_100' ? ' $' : ps && ps.key === 'paid_50' ? ' ~$' : '';

        return `
        <div class="gantt-row">
            <div class="gantt-bar ${isCompleted ? 'gantt-bar-completed' : ''}"
                 style="left:${barLeft}px;width:${barWidth}px;background:${color}20;border-left:3px solid ${color}"
                 onclick="App.navigate('order-detail', true, ${order.id})"
                 title="${this.esc(order.order_name || '')} | ${this.formatDate(start)} — ${this.formatDate(end)}${paymentEmoji}">
                <span class="gantt-bar-text" style="color:${color}">${this.esc(this.shortName(order.order_name || ''))}${paymentEmoji}</span>
            </div>
        </div>`;
    },

    renderStats() {
        const statsEl = document.getElementById('gantt-stats');
        if (!statsEl) return;

        const total = this.orders.length;
        const inProd = this.orders.filter(o => o.status === 'in_production').length;
        const calc = this.orders.filter(o => o.status === 'calculated').length;

        // Weekly hours capacity
        const today = new Date();
        const weekEnd = new Date(today);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const activeOrders = this.orders.filter(o => {
            if (o.status !== 'in_production') return false;
            const s = this.getStart(o);
            const e = this.getEnd(o);
            return s <= weekEnd && e >= today;
        });

        const weekHours = activeOrders.reduce((sum, o) => sum + (o.total_hours_plan || 0), 0);
        const capacity = 160; // ~4 people * 40 hours

        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${total}</div>
                <div class="stat-label">Заказов с дедлайном</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:var(--orange)">${inProd}</div>
                <div class="stat-label">В производстве</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" style="color:var(--accent)">${calc}</div>
                <div class="stat-label">Рассчитано</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${weekHours > capacity ? 'text-red' : 'text-green'}">${weekHours}ч</div>
                <div class="stat-label">Часов на неделе ${weekHours > capacity ? '(перегруз!)' : ''}</div>
            </div>`;
    },

    // ==========================================
    // HELPERS
    // ==========================================

    getDateRange() {
        let minDate = new Date();
        let maxDate = new Date();
        minDate.setDate(minDate.getDate() - 14); // 2 weeks before today
        maxDate.setDate(maxDate.getDate() + 60); // ~2 months ahead

        this.orders.forEach(o => {
            const s = this.getStart(o);
            const e = this.getEnd(o);
            if (s < minDate) minDate = new Date(s);
            if (e > maxDate) maxDate = new Date(e);
        });

        // Add some padding
        minDate.setDate(minDate.getDate() - 3);
        maxDate.setDate(maxDate.getDate() + 7);
        minDate.setHours(0, 0, 0, 0);
        maxDate.setHours(0, 0, 0, 0);

        return { minDate, maxDate };
    },

    getStart(order) {
        const d = order.deadline_start || order.deadline;
        if (!d) return new Date();
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    },

    getEnd(order) {
        const d = order.deadline_end || order.deadline_start || order.deadline;
        if (!d) {
            const start = this.getStart(order);
            const end = new Date(start);
            end.setDate(end.getDate() + 7); // Default 1-week bar
            return end;
        }
        const parsed = new Date(d);
        return isNaN(parsed.getTime()) ? new Date() : parsed;
    },

    daysBetween(d1, d2) {
        const ms = d2.getTime() - d1.getTime();
        return Math.round(ms / 86400000);
    },

    statusColor(status) {
        const map = {
            draft: '#6b7280',
            calculated: '#2563eb',
            in_production: '#f59e0b',
            completed: '#10b981',
        };
        return map[status] || '#6b7280';
    },

    formatDate(d) {
        if (!d) return '';
        return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    },

    shortName(name) {
        if (!name) return '';
        return name.length > 28 ? name.substring(0, 26) + '..' : name;
    },

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

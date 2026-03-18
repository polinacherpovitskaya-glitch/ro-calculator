// =============================================
// Recycle Object — Production Calendar
// v44b: Resource-based schedule with phase bars + capacity chart (new statuses)
// =============================================

const Gantt = {
    orders: [],
    schedule: null,
    zoom: 'week', // 'day' | 'week' | 'month'

    async load() {
        try {
            const allOrders = await loadOrders({});
            // Only schedulable orders with production hours
            const GANTT_STATUSES = ['sample','production_casting','production_printing','production_hardware','production_packaging','delivery','in_production'];
            this.orders = allOrders.filter(o =>
                GANTT_STATUSES.includes(o.status)
                && ((o.production_hours_plastic || 0) + (o.production_hours_packaging || 0) + (o.production_hours_hardware || 0) > 0)
            );
            // Build schedule
            this.schedule = buildProductionSchedule(this.orders, App.settings || {});
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
        const capContainer = document.getElementById('gantt-capacity-chart');
        if (!container) return;

        if (!this.schedule || this.schedule.queue.length === 0) {
            if (capContainer) capContainer.innerHTML = '';
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128197;</div>
                        <p>Нет заказов для планирования</p>
                        <p class="text-muted" style="font-size:12px">Создайте заказ с изделиями в калькуляторе — часы рассчитаются автоматически</p>
                    </div>
                </div>`;
            this.renderStats();
            return;
        }

        const { queue, dailyCapacity, days } = this.schedule;
        if (days.length === 0) {
            if (capContainer) capContainer.innerHTML = '';
            container.innerHTML = '<div class="card"><p class="text-muted text-center">Нет данных для отображения</p></div>';
            this.renderStats();
            return;
        }

        // Date range from schedule days
        const firstDate = new Date(days[0].date);
        const lastDate = new Date(days[days.length - 1].date);
        firstDate.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);

        // Add padding
        const minDate = new Date(firstDate);
        minDate.setDate(minDate.getDate() - 2);
        const maxDate = new Date(lastDate);
        maxDate.setDate(maxDate.getDate() + 5);

        const totalDays = this.daysBetween(minDate, maxDate);
        const cellWidth = this.zoom === 'day' ? 36 : this.zoom === 'week' ? 24 : 12;
        const totalWidth = totalDays * cellWidth;

        // Build a date → day data map
        const dayMap = {};
        days.forEach(d => { dayMap[d.date] = d; });

        // ── CAPACITY CHART ──
        if (capContainer) {
            this.renderCapacityChart(capContainer, minDate, totalDays, cellWidth, totalWidth, dayMap, dailyCapacity);
        }

        // ── ORDER TIMELINE ──
        const headerHtml = this.renderTimeAxis(minDate, totalDays, cellWidth);

        // Filter orders that have schedules
        const activeQueue = queue.filter(q => q.schedule.length > 0);

        // Build order rows
        const rowsHtml = activeQueue.map(q => this.renderOrderRow(q, minDate, totalDays, cellWidth)).join('');

        // Sidebar
        const sidebarRows = activeQueue.map(q => {
            const totalH = formatHours(q.totalHours);
            const badgeColors = { production_casting: '#f59e0b', production_printing: '#f59e0b', production_hardware: '#f59e0b', production_packaging: '#f59e0b', in_production: '#f59e0b', sample: '#3b82f6', delivery: '#8b5cf6' };
            const statusBadge = `<span style="color:${badgeColors[q.status] || '#6b7280'}">&#9679;</span>`;
            return `
                <div class="gantt-sidebar-row" title="${this.esc(q.orderName)}" onclick="Calculator.loadOrder(${q.orderId})" style="cursor:pointer">
                    <div class="gantt-order-name">${statusBadge} ${this.esc(this.shortName(q.orderName))}</div>
                    <div class="gantt-order-meta">${this.esc(q.clientName)} &middot; ${totalH}</div>
                </div>`;
        }).join('');

        // Today marker
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOffset = this.daysBetween(minDate, today);
        const todayLeft = todayOffset * cellWidth;
        const showToday = todayOffset >= 0 && todayOffset <= totalDays;

        container.innerHTML = `
            <div class="gantt-wrapper">
                <div class="gantt-sidebar">
                    <div class="gantt-sidebar-header">Заказ</div>
                    ${sidebarRows}
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

    // ════════════════════════════════
    // CAPACITY CHART — stacked bars per day
    // ════════════════════════════════
    renderCapacityChart(el, minDate, totalDays, cellWidth, totalWidth, dayMap, dailyCapacity) {
        const chartH = 60;
        const maxH = Math.max(dailyCapacity * 1.3, 1); // Scale: 130% of capacity = full height

        let barsHtml = '';

        for (let i = 0; i < totalDays; i++) {
            const d = new Date(minDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().slice(0, 10);
            const dayData = dayMap[dateStr];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;

            if (!dayData || isWeekend) continue;

            // Sum hours by phase
            let moldingH = 0, packagingH = 0, assemblyH = 0;
            dayData.allocations.forEach(a => {
                if (a.phase === 'molding') moldingH += a.hours;
                else if (a.phase === 'packaging') packagingH += a.hours;
                else if (a.phase === 'assembly') assemblyH += a.hours;
            });

            const total = moldingH + packagingH + assemblyH;
            const overload = total > dailyCapacity;
            const left = i * cellWidth;
            const barW = Math.max(cellWidth - 2, 4);

            // Stacked: molding (bottom) → assembly → packaging (top)
            const moldPx = (moldingH / maxH) * chartH;
            const asmPx = (assemblyH / maxH) * chartH;
            const packPx = (packagingH / maxH) * chartH;

            barsHtml += `<div class="gantt-cap-day" style="left:${left}px;width:${barW}px;height:${chartH}px" title="${this.formatDateStr(dateStr)}: ${round2(total)}ч / ${dailyCapacity}ч">`;

            if (moldingH > 0) {
                barsHtml += `<div class="gantt-cap-seg" style="height:${moldPx}px;background:#f59e0b;bottom:0"></div>`;
            }
            if (assemblyH > 0) {
                barsHtml += `<div class="gantt-cap-seg" style="height:${asmPx}px;background:#06b6d4;bottom:${moldPx}px"></div>`;
            }
            if (packagingH > 0) {
                barsHtml += `<div class="gantt-cap-seg" style="height:${packPx}px;background:#8b5cf6;bottom:${moldPx + asmPx}px"></div>`;
            }

            if (overload) {
                barsHtml += `<div class="gantt-cap-overload" title="Перегруз!">!</div>`;
            }

            barsHtml += '</div>';
        }

        // Capacity line
        const capLinePx = (dailyCapacity / maxH) * chartH;

        el.innerHTML = `
            <div class="gantt-cap-wrap">
                <div class="gantt-cap-label">${dailyCapacity}ч/день</div>
                <div class="gantt-cap-chart" style="height:${chartH}px;width:${totalWidth + 20}px" id="gantt-cap-scroll-area">
                    <div class="gantt-cap-line" style="bottom:${capLinePx}px"></div>
                    ${barsHtml}
                </div>
            </div>`;

        // Sync scroll with timeline
        const capScrollArea = document.getElementById('gantt-cap-scroll-area');
        const timeline = document.getElementById('gantt-timeline');
        if (capScrollArea && timeline) {
            // Wrap in a scrollable container
            el.style.overflowX = 'auto';
            el.style.marginLeft = '160px'; // match sidebar width

            const syncScroll = () => {
                if (timeline.scrollLeft !== undefined) {
                    el.scrollLeft = timeline.scrollLeft;
                }
            };
            // We'll sync after render via MutationObserver or manual
            setTimeout(() => {
                timeline.addEventListener('scroll', () => { el.scrollLeft = timeline.scrollLeft; });
                el.addEventListener('scroll', () => { timeline.scrollLeft = el.scrollLeft; });
            }, 100);
        }
    },

    // ════════════════════════════════
    // ORDER ROW — phase-segmented bars
    // ════════════════════════════════
    renderOrderRow(q, minDate, totalDays, cellWidth) {
        // Group consecutive days of the same phase into bars
        const bars = [];
        let currentBar = null;

        q.schedule.forEach(s => {
            if (currentBar && currentBar.phase === s.phase) {
                // Extend current bar
                currentBar.endDate = s.date;
                currentBar.hours += s.hours;
            } else {
                if (currentBar) bars.push(currentBar);
                currentBar = {
                    phase: s.phase,
                    startDate: s.date,
                    endDate: s.date,
                    hours: s.hours,
                };
            }
        });
        if (currentBar) bars.push(currentBar);

        const phaseColors = { molding: '#f59e0b', packaging: '#8b5cf6', assembly: '#06b6d4' };
        const phaseLabels = { molding: 'Литьё', packaging: 'Упаковка', assembly: 'Сборка' };

        let barsHtml = '';
        bars.forEach(bar => {
            const startOffset = this.daysBetween(minDate, new Date(bar.startDate));
            const endOffset = this.daysBetween(minDate, new Date(bar.endDate));
            const left = startOffset * cellWidth;
            const width = Math.max(cellWidth, (endOffset - startOffset + 1) * cellWidth);
            const color = phaseColors[bar.phase] || '#6b7280';
            const label = phaseLabels[bar.phase] || bar.phase;

            barsHtml += `
                <div class="gantt-phase-bar" style="left:${left}px;width:${width}px;background:${color}25;border-left:3px solid ${color}"
                     title="${label}: ${round2(bar.hours)}ч (${this.formatDateStr(bar.startDate)} — ${this.formatDateStr(bar.endDate)})">
                    <span class="gantt-bar-text" style="color:${color}">${width > 50 ? label : ''}</span>
                </div>`;
        });

        // Deadline marker
        if (q.deadlineEnd) {
            const deadlineDate = new Date(q.deadlineEnd);
            deadlineDate.setHours(0, 0, 0, 0);
            const dlOffset = this.daysBetween(minDate, deadlineDate);
            if (dlOffset >= 0 && dlOffset <= totalDays) {
                const dlLeft = dlOffset * cellWidth;
                // Check if overdue
                const lastScheduleDate = q.schedule.length > 0 ? q.schedule[q.schedule.length - 1].date : null;
                const isOverdue = lastScheduleDate && lastScheduleDate > q.deadlineEnd;
                barsHtml += `<div class="gantt-deadline-marker ${isOverdue ? 'overdue' : ''}" style="left:${dlLeft}px" title="Дедлайн: ${this.formatDateStr(q.deadlineEnd)}${isOverdue ? ' (опаздывает!)' : ''}">&#9670;</div>`;
            }
        }

        return `<div class="gantt-row">${barsHtml}</div>`;
    },

    // ════════════════════════════════
    // STATS
    // ════════════════════════════════
    renderStats() {
        const statsEl = document.getElementById('gantt-stats');
        if (!statsEl) return;

        if (!this.schedule) {
            statsEl.innerHTML = '';
            return;
        }

        const { queue, dailyCapacity, days } = this.schedule;
        const totalOrders = queue.filter(q => q.schedule.length > 0).length;

        // Weekly capacity (next 5 working days)
        const today = new Date().toISOString().slice(0, 10);
        const weekDays = days.filter(d => d.date >= today).slice(0, 5);
        const weekUsed = weekDays.reduce((s, d) => s + d.totalUsed, 0);
        const weekCapacity = round2(dailyCapacity * 5);
        const freeHours = round2(weekCapacity - weekUsed);

        // Overload detection
        const overloadDays = days.filter(d => d.totalUsed > dailyCapacity);

        // Check overdue orders
        const overdueOrders = queue.filter(q => {
            if (!q.deadlineEnd || q.schedule.length === 0) return false;
            return q.schedule[q.schedule.length - 1].date > q.deadlineEnd;
        });

        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${totalOrders}</div>
                <div class="stat-label">Заказов в плане</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${round2(weekUsed)}ч <span style="font-size:12px;color:var(--text-muted)">/ ${weekCapacity}ч</span></div>
                <div class="stat-label">Загрузка на неделю</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${freeHours < 0 ? 'text-red' : 'text-green'}">${freeHours > 0 ? '+' : ''}${freeHours}ч</div>
                <div class="stat-label">Свободных часов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${overloadDays.length > 0 || overdueOrders.length > 0 ? 'text-red' : 'text-green'}">
                    ${overloadDays.length > 0 ? overloadDays.length + ' дн.' : overdueOrders.length > 0 ? overdueOrders.length + ' зак.' : 'OK'}
                </div>
                <div class="stat-label">${overloadDays.length > 0 ? 'Перегруз' : overdueOrders.length > 0 ? 'Опаздывают' : 'Без проблем'}</div>
            </div>`;
    },

    // ════════════════════════════════
    // TIME AXIS — reused from old version
    // ════════════════════════════════
    renderTimeAxis(minDate, days, cellWidth) {
        let html = '';

        if (this.zoom === 'month') {
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
            let d = new Date(minDate);
            let weekNum = 0;
            while (this.daysBetween(minDate, d) <= days) {
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

    // ════════════════════════════════
    // HELPERS
    // ════════════════════════════════
    daysBetween(d1, d2) {
        const ms = d2.getTime() - d1.getTime();
        return Math.round(ms / 86400000);
    },

    formatDateStr(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        } catch (e) { return dateStr; }
    },

    shortName(name) {
        if (!name) return '';
        return name.length > 24 ? name.substring(0, 22) + '..' : name;
    },

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

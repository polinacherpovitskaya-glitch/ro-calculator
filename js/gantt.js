// =============================================
// Recycle Object — Production Calendar
// v50: canonical week/month production calendar with queue + capacity
// =============================================

const Gantt = {
    orders: [],
    blockedOrders: [],
    schedule: null,
    orderSequence: [],
    zoom: 'week',
    LOADABLE_STATUSES: ['sample', 'production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'delivery', 'in_production'],
    STATUS_LABELS: {
        sample: 'Образец',
        production_casting: 'Литьё',
        production_printing: 'Печать',
        production_hardware: 'Сборка',
        production_packaging: 'Упаковка',
        in_production: 'В производстве',
        delivery: 'Отгрузка',
    },

    async load() {
        try {
            const [allOrders, planState] = await Promise.all([
                loadOrders({}),
                loadProductionPlanState().catch(() => ({ order_ids: [] })),
            ]);

            const priorityIds = Array.isArray(planState?.order_ids)
                ? planState.order_ids.map(x => Number(x)).filter(Number.isFinite)
                : [];
            const priorityPos = new Map(priorityIds.map((id, index) => [id, index]));

            const orderedOrders = (allOrders || [])
                .filter(order => this.isSchedulableOrder(order))
                .map((order, index) => ({
                    ...order,
                    production_priority: priorityPos.has(Number(order.id))
                        ? priorityPos.get(Number(order.id))
                        : 1000 + index,
                }))
                .sort((a, b) => Number(a.production_priority || 0) - Number(b.production_priority || 0));

            const orderItems = await loadOrderItemsByOrderIds(orderedOrders.map(order => order.id)).catch(() => []);
            const itemsByOrderId = new Map();
            (orderItems || []).forEach(item => {
                const key = Number(item.order_id);
                if (!itemsByOrderId.has(key)) itemsByOrderId.set(key, []);
                itemsByOrderId.get(key).push(item);
            });

            this.orders = orderedOrders.map(order => ({
                ...order,
                ...this.getOrderReadiness(order, itemsByOrderId.get(Number(order.id)) || []),
            }));
            this.blockedOrders = this.orders.filter(order => order.production_ready_state === 'blocked');
            this.orderSequence = this.orders.map(order => Number(order.id));
            this.schedule = buildProductionSchedule(
                this.orders.filter(order => order.production_ready_state !== 'blocked'),
                App.settings || {}
            );
            this.render();
        } catch (e) {
            console.error('Gantt load error:', e);
        }
    },

    isSchedulableOrder(order) {
        if (!order || !this.LOADABLE_STATUSES.includes(order.status)) return false;
        return this.getOrderTotalHours(order) > 0;
    },

    getOrderTotalHours(order) {
        return round2(
            (order?.production_hours_plastic || 0)
            + (order?.production_hours_hardware || 0)
            + (order?.production_hours_packaging || 0)
        );
    },

    getOrderReadiness(order, items = []) {
        const productItems = (items || []).filter(item => String(item?.item_type || 'product') === 'product');
        const customMoldItems = productItems.filter(item => item && item.is_blank_mold === false);
        const blockedItems = customMoldItems.filter(item => !this.isTrueLike(item.base_mold_in_stock));
        if (blockedItems.length > 0) {
            return {
                production_ready_state: 'blocked',
                production_blocked_reason: this.describeBlockedByMold(blockedItems),
                production_blocked_items: blockedItems.length,
            };
        }
        return {
            production_ready_state: 'ready',
            production_blocked_reason: '',
            production_blocked_items: 0,
        };
    },

    isTrueLike(value) {
        return value === true || value === 1 || value === '1' || value === 'true';
    },

    describeBlockedByMold(items = []) {
        const names = Array.from(new Set((items || [])
            .map(item => String(item?.product_name || '').trim())
            .filter(Boolean)));
        if (names.length === 1) {
            return `Ждет молд: ${names[0]}`;
        }
        if (names.length > 1) {
            return `Ждет молды для ${names.length} позиций`;
        }
        return 'Ждет молд';
    },

    async moveOrder(orderId, direction) {
        const orderIds = Array.isArray(this.orderSequence) && this.orderSequence.length
            ? [...this.orderSequence]
            : (this.orders || []).map(item => Number(item.id || item.orderId));
        const currentIndex = orderIds.indexOf(Number(orderId));
        const targetIndex = currentIndex + direction;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderIds.length) return;

        [orderIds[currentIndex], orderIds[targetIndex]] = [orderIds[targetIndex], orderIds[currentIndex]];
        await saveProductionPlanState({ order_ids: orderIds });
        await this.load();
    },

    async moveUp(orderId) {
        await this.moveOrder(orderId, -1);
    },

    async moveDown(orderId) {
        await this.moveOrder(orderId, 1);
    },

    setZoom(z) {
        if (!['week', 'month'].includes(z)) return;
        this.zoom = z;
        document.querySelectorAll('.gantt-zoom-btn').forEach(button => button.classList.remove('active'));
        document.querySelector(`.gantt-zoom-btn[data-zoom="${z}"]`)?.classList.add('active');
        this.render();
    },

    render() {
        const container = document.getElementById('gantt-container');
        const capContainer = document.getElementById('gantt-capacity-chart');
        const queueContainer = document.getElementById('gantt-queue');
        if (!container) return;

        const blockedQueue = this.blockedOrders || [];
        if (!this.schedule || (this.schedule.queue.length === 0 && blockedQueue.length === 0)) {
            if (capContainer) capContainer.innerHTML = '';
            if (queueContainer) queueContainer.innerHTML = '';
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128197;</div>
                        <p>Нет заказов для планирования</p>
                        <p class="text-muted" style="font-size:13px">Создайте заказ с изделиями в калькуляторе — после этого он появится в очереди и календаре.</p>
                    </div>
                </div>`;
            this.renderStats();
            return;
        }

        const { queue, dailyCapacity, days } = this.schedule;
        const activeQueue = queue.filter(item => item.schedule.length > 0);
        this.renderQueue(activeQueue, blockedQueue);

        if (!days.length || !activeQueue.length) {
            if (capContainer) capContainer.innerHTML = '';
            container.innerHTML = `
                <div class="card">
                    <p class="text-muted text-center">
                        ${blockedQueue.length
                            ? 'Сейчас нет готовых к запуску заказов: активный план пуст, а заблокированные заказы вынесены выше в отдельный блок.'
                            : 'Нет данных для отображения'}
                    </p>
                </div>`;
            this.renderStats();
            return;
        }

        const firstDate = new Date(days[0].date);
        const lastDate = new Date(days[days.length - 1].date);
        firstDate.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);

        const minDate = new Date(firstDate);
        minDate.setDate(minDate.getDate() - 1);
        const maxDate = new Date(lastDate);
        maxDate.setDate(maxDate.getDate() + 5);

        const totalDays = this.daysBetween(minDate, maxDate) + 1;
        const cellWidth = this.zoom === 'week' ? 56 : 34;
        const totalWidth = totalDays * cellWidth;

        const dayMap = {};
        days.forEach(day => {
            dayMap[day.date] = day;
        });

        const headerHtml = this.renderTimeAxis(minDate, totalDays, cellWidth, this.getHolidaySet());
        const rowsHtml = activeQueue.map(item => this.renderOrderRow(item, minDate, totalDays, cellWidth)).join('');
        const sidebarRows = activeQueue.map(item => {
            const statusDot = item.deadlineEnd && item.schedule[item.schedule.length - 1]?.date > item.deadlineEnd
                ? '<span style="color:#e11d48">&#9679;</span>'
                : '<span style="color:#16a34a">&#9679;</span>';
            return `
                <div class="gantt-sidebar-row" title="${this.esc(item.orderName)}" onclick="App.navigate('order-detail', true, ${item.orderId})" style="cursor:pointer">
                    <div class="gantt-order-name">${statusDot} ${this.esc(this.shortName(item.orderName))}</div>
                    <div class="gantt-order-meta">${this.esc(item.clientName || 'Без клиента')} · ${this.formatHours(item.totalHours)}</div>
                </div>`;
        }).join('');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOffset = this.daysBetween(minDate, today);
        const todayLeft = todayOffset * cellWidth;
        const showToday = todayOffset >= 0 && todayOffset < totalDays;

        container.innerHTML = `
            <div class="gantt-wrapper">
                <div class="gantt-sidebar">
                    <div class="gantt-sidebar-header">Очередь заказов</div>
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

        if (capContainer) {
            this.renderCapacityChart(capContainer, minDate, totalDays, cellWidth, totalWidth, dayMap, dailyCapacity);
        }

        if (showToday) {
            const timeline = document.getElementById('gantt-timeline');
            if (timeline) {
                timeline.scrollLeft = Math.max(0, todayLeft - timeline.clientWidth / 3);
                if (capContainer) capContainer.scrollLeft = timeline.scrollLeft;
            }
        }

        this.renderStats();
    },

    renderQueue(queue, blockedQueue = []) {
        const queueEl = document.getElementById('gantt-queue');
        if (!queueEl) return;
        if (!queue.length && !blockedQueue.length) {
            queueEl.innerHTML = '';
            return;
        }

        const totalHours = round2(queue.reduce((sum, item) => sum + (item.totalHours || 0), 0));
        const riskCount = queue.filter(item => item.deadlineEnd && item.schedule[item.schedule.length - 1]?.date > item.deadlineEnd).length;
        const blockedCount = blockedQueue.length;
        const cardsHtml = queue.map(item => this.renderQueueCard(item)).join('');
        const blockedHtml = blockedQueue.map(item => this.renderQueueCard(item, { blocked: true })).join('');

        queueEl.innerHTML = `
            <div class="gantt-queue-card-wrap">
                <div class="gantt-queue-head">
                    <div>
                        <h3>Очередь к запуску</h3>
                        <p>Порядок сверху задает, что начальник производства запускает раньше. Его можно быстро подвигать кнопками на карточках.</p>
                    </div>
                    <div class="gantt-queue-summary">
                        <strong>${queue.length}</strong> готово к плану · <strong>${this.formatHours(totalHours)}</strong>${riskCount ? ` · <span class="text-red">${riskCount} с риском дедлайна</span>` : ''}${blockedCount ? ` · <span class="text-orange">${blockedCount} ждут молд</span>` : ''}
                    </div>
                </div>
                ${queue.length ? `
                    <div class="gantt-queue-section">
                        <div class="gantt-queue-grid">
                            ${cardsHtml}
                        </div>
                    </div>` : ''}
                ${blockedCount ? `
                    <div class="gantt-queue-section gantt-queue-section-blocked">
                        <div class="gantt-queue-subhead">
                            <h4>Ждут молд / пока не планируются</h4>
                            <p>Эти заказы не попадают в active timeline, пока по ним нет молда на складе. Порядок очереди можно заранее настроить уже сейчас.</p>
                        </div>
                        <div class="gantt-queue-grid">
                            ${blockedHtml}
                        </div>
                    </div>` : ''}
            </div>`;
    },

    renderQueueCard(item, options = {}) {
        const blocked = !!options.blocked;
        const startDate = blocked ? null : (item.schedule[0]?.date || null);
        const finishDate = blocked ? null : (item.schedule[item.schedule.length - 1]?.date || null);
        const deadlineRisk = !blocked && item.deadlineEnd && finishDate && finishDate > item.deadlineEnd;
        const deadlineLabel = item.deadlineEnd ? this.formatDateStr(item.deadlineEnd) : 'без дедлайна';
        const phasePills = [
            { label: 'Литьё', hours: this.getPhaseHours(item, 'molding'), color: '#f59e0b' },
            { label: 'Сборка', hours: this.getPhaseHours(item, 'assembly'), color: '#06b6d4' },
            { label: 'Упаковка', hours: this.getPhaseHours(item, 'packaging'), color: '#8b5cf6' },
        ].filter(phase => phase.hours > 0).map(phase => `
            <span class="gantt-queue-phase-pill" style="--phase-color:${phase.color}">${phase.label}: ${this.formatHours(phase.hours)}</span>`).join('');

        return `
            <article class="gantt-queue-card ${deadlineRisk ? 'risk' : ''} ${blocked ? 'blocked' : ''}" onclick="App.navigate('order-detail', true, ${item.orderId || item.id})">
                <div class="gantt-queue-card-top">
                    <div>
                        <div class="gantt-queue-title">${this.esc(item.orderName || item.order_name)}</div>
                        <div class="gantt-queue-meta">${this.esc(this.getStatusLabel(item.status))} · ${this.esc(item.clientName || item.client_name || 'Без клиента')} · ${this.formatHours(item.totalHours || this.getOrderTotalHours(item))}</div>
                    </div>
                    <div class="gantt-queue-controls">
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Gantt.moveUp(${item.orderId || item.id})" title="Поднять в очереди">&#8593;</button>
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Gantt.moveDown(${item.orderId || item.id})" title="Опустить в очереди">&#8595;</button>
                    </div>
                </div>
                <div class="gantt-queue-dates">
                    <strong>${blocked ? 'Старт:' : 'План:'}</strong> ${blocked ? 'ждет готовности' : this.formatDateRange(startDate, finishDate)}
                    <span> · </span>
                    <strong>Дедлайн:</strong> ${deadlineLabel}
                </div>
                <div class="gantt-queue-phases">${phasePills || '<span class="text-muted">Нет производственных часов</span>'}</div>
                <div class="gantt-queue-footer">
                    <span class="gantt-queue-badge ${blocked ? 'blocked' : (deadlineRisk ? 'risk' : 'ok')}">${blocked ? this.esc(item.production_blocked_reason || 'Ждет молд') : (deadlineRisk ? 'Риск дедлайна' : 'Вмещается в план')}</span>
                    <span class="gantt-queue-open">Открыть заказ</span>
                </div>
            </article>`;
    },

    renderCapacityChart(el, minDate, totalDays, cellWidth, totalWidth, dayMap, dailyCapacity) {
        const chartH = 84;
        const maxH = Math.max(dailyCapacity * 1.3, 1);
        let barsHtml = '';

        for (let i = 0; i < totalDays; i++) {
            const date = new Date(minDate);
            date.setDate(date.getDate() + i);
            const dateStr = date.toISOString().slice(0, 10);
            const dayData = dayMap[dateStr];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            if (!dayData || isWeekend) continue;

            let moldingHours = 0;
            let assemblyHours = 0;
            let packagingHours = 0;
            dayData.allocations.forEach(allocation => {
                if (allocation.phase === 'molding') moldingHours += allocation.hours;
                if (allocation.phase === 'assembly') assemblyHours += allocation.hours;
                if (allocation.phase === 'packaging') packagingHours += allocation.hours;
            });

            const totalUsed = moldingHours + assemblyHours + packagingHours;
            const overload = totalUsed > dailyCapacity;
            const left = i * cellWidth;
            const barWidth = Math.max(cellWidth - 4, 6);
            const moldPx = (moldingHours / maxH) * chartH;
            const assemblyPx = (assemblyHours / maxH) * chartH;
            const packagingPx = (packagingHours / maxH) * chartH;

            barsHtml += `<div class="gantt-cap-day" style="left:${left}px;width:${barWidth}px;height:${chartH}px" title="${this.formatDateStr(dateStr)}: ${this.formatHours(totalUsed)} / ${this.formatHours(dailyCapacity)}">`;
            if (moldingHours > 0) {
                barsHtml += `<div class="gantt-cap-seg" style="height:${moldPx}px;background:#f59e0b;bottom:0"></div>`;
            }
            if (assemblyHours > 0) {
                barsHtml += `<div class="gantt-cap-seg" style="height:${assemblyPx}px;background:#06b6d4;bottom:${moldPx}px"></div>`;
            }
            if (packagingHours > 0) {
                barsHtml += `<div class="gantt-cap-seg" style="height:${packagingPx}px;background:#8b5cf6;bottom:${moldPx + assemblyPx}px"></div>`;
            }
            if (overload) {
                barsHtml += '<div class="gantt-cap-overload" title="Перегруз!">!</div>';
            }
            barsHtml += '</div>';
        }

        const capLinePx = (dailyCapacity / maxH) * chartH;
        el.innerHTML = `
            <div class="gantt-cap-wrap">
                <div class="gantt-cap-label">${this.formatHours(dailyCapacity)} в день</div>
                <div class="gantt-cap-chart" style="height:${chartH}px;width:${totalWidth + 20}px">
                    <div class="gantt-cap-line" style="bottom:${capLinePx}px"></div>
                    ${barsHtml}
                </div>
            </div>`;

        const timeline = document.getElementById('gantt-timeline');
        if (timeline) {
            timeline.onscroll = () => {
                if (el.scrollLeft !== timeline.scrollLeft) el.scrollLeft = timeline.scrollLeft;
            };
            el.onscroll = () => {
                if (timeline.scrollLeft !== el.scrollLeft) timeline.scrollLeft = el.scrollLeft;
            };
        }
    },

    renderOrderRow(item, minDate, totalDays, cellWidth) {
        const bars = [];
        let currentBar = null;

        item.schedule.forEach(segment => {
            if (currentBar && currentBar.phase === segment.phase) {
                currentBar.endDate = segment.date;
                currentBar.hours += segment.hours;
            } else {
                if (currentBar) bars.push(currentBar);
                currentBar = {
                    phase: segment.phase,
                    startDate: segment.date,
                    endDate: segment.date,
                    hours: segment.hours,
                };
            }
        });
        if (currentBar) bars.push(currentBar);

        const phaseColors = { molding: '#f59e0b', assembly: '#06b6d4', packaging: '#8b5cf6' };
        const phaseLabels = { molding: 'Литьё', assembly: 'Сборка', packaging: 'Упаковка' };

        const barsHtml = bars.map(bar => {
            const startOffset = this.daysBetween(minDate, new Date(bar.startDate));
            const endOffset = this.daysBetween(minDate, new Date(bar.endDate));
            const left = startOffset * cellWidth;
            const width = Math.max(cellWidth, (endOffset - startOffset + 1) * cellWidth);
            const color = phaseColors[bar.phase] || '#6b7280';
            const label = phaseLabels[bar.phase] || bar.phase;
            return `
                <div class="gantt-phase-bar" style="left:${left}px;width:${width}px;background:${color}22;border-left:4px solid ${color}" title="${label}: ${this.formatHours(bar.hours)} (${this.formatDateStr(bar.startDate)} — ${this.formatDateStr(bar.endDate)})">
                    <span class="gantt-bar-text" style="color:${color}">${width > 92 ? label : this.formatHours(bar.hours)}</span>
                </div>`;
        }).join('');

        let deadlineHtml = '';
        if (item.deadlineEnd) {
            const deadlineDate = new Date(item.deadlineEnd);
            deadlineDate.setHours(0, 0, 0, 0);
            const deadlineOffset = this.daysBetween(minDate, deadlineDate);
            if (deadlineOffset >= 0 && deadlineOffset < totalDays) {
                const deadlineLeft = deadlineOffset * cellWidth;
                const lastScheduleDate = item.schedule[item.schedule.length - 1]?.date || null;
                const isOverdue = lastScheduleDate && lastScheduleDate > item.deadlineEnd;
                deadlineHtml = `<div class="gantt-deadline-marker ${isOverdue ? 'overdue' : ''}" style="left:${deadlineLeft}px" title="Дедлайн: ${this.formatDateStr(item.deadlineEnd)}${isOverdue ? ' (опаздывает)' : ''}">&#9670;</div>`;
            }
        }

        return `<div class="gantt-row">${barsHtml}${deadlineHtml}</div>`;
    },

    renderStats() {
        const statsEl = document.getElementById('gantt-stats');
        if (!statsEl) return;
        if (!this.schedule) {
            statsEl.innerHTML = '';
            return;
        }

        const { queue, dailyCapacity, days } = this.schedule;
        const totalOrders = queue.filter(item => item.schedule.length > 0).length;
        const blockedCount = (this.blockedOrders || []).length;
        const today = new Date().toISOString().slice(0, 10);
        const nextWorkDays = days.filter(day => day.date >= today).slice(0, 5);
        const weekUsed = round2(nextWorkDays.reduce((sum, day) => sum + day.totalUsed, 0));
        const weekCapacity = round2(dailyCapacity * 5);
        const freeHours = round2(weekCapacity - weekUsed);
        const overloadDays = days.filter(day => day.totalUsed > dailyCapacity).length;
        const riskyOrders = queue.filter(item => item.deadlineEnd && item.schedule[item.schedule.length - 1]?.date > item.deadlineEnd).length;

        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${totalOrders}${blockedCount ? ` <span style="font-size:12px;color:var(--orange)">+${blockedCount}</span>` : ''}</div>
                <div class="stat-label">${blockedCount ? 'В плане + ждут молд' : 'Заказов в плане'}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.formatHours(weekUsed)} <span style="font-size:12px;color:var(--text-muted)">/ ${this.formatHours(weekCapacity)}</span></div>
                <div class="stat-label">Загрузка на 5 рабочих дней</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${freeHours < 0 ? 'text-red' : 'text-green'}">${freeHours > 0 ? '+' : ''}${this.formatHours(freeHours)}</div>
                <div class="stat-label">Свободных часов</div>
            </div>
            <div class="stat-card">
                <div class="stat-value ${(overloadDays || riskyOrders) ? 'text-red' : 'text-green'}">${overloadDays ? `${overloadDays} дн.` : riskyOrders ? `${riskyOrders} зак.` : 'OK'}</div>
                <div class="stat-label">${overloadDays ? 'Перегруз в днях' : riskyOrders ? 'Риск дедлайна' : 'Риски не найдены'}</div>
            </div>`;
    },

    renderTimeAxis(minDate, totalDays, cellWidth, holidaySet = new Set()) {
        let html = '';
        for (let index = 0; index < totalDays; index++) {
            const date = new Date(minDate);
            date.setDate(date.getDate() + index);
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isHoliday = holidaySet.has(this.formatIsoDateLocal(date));
            const isNonWorking = isWeekend || isHoliday;
            const isMonthBreak = index === 0 || date.getDate() === 1;
            const weekday = date.toLocaleDateString('ru-RU', { weekday: 'short' }).replace('.', '');
            const month = date.toLocaleDateString('ru-RU', { month: 'short' }).replace('.', '');
            const primary = this.zoom === 'week' ? weekday : String(date.getDate());
            const secondary = this.zoom === 'week' ? String(date.getDate()) : (isMonthBreak ? month : '&nbsp;');
            const tertiary = this.zoom === 'week' && isMonthBreak ? month : '';
            html += `
                <div class="gantt-header-cell ${isNonWorking ? 'gantt-weekend' : ''} ${isMonthBreak ? 'gantt-month-break' : ''}" style="left:${index * cellWidth}px;width:${cellWidth}px">
                    <span class="gantt-header-primary">${primary}</span>
                    <span class="gantt-header-secondary">${secondary}</span>
                    ${tertiary ? `<span class="gantt-header-tertiary">${tertiary}</span>` : ''}
                </div>`;
        }
        return html;
    },

    getStatusLabel(status) {
        return this.STATUS_LABELS[status] || status || 'Без статуса';
    },

    getPhaseHours(item, phaseName) {
        return round2((item.phases || []).find(phase => phase.name === phaseName)?.total || 0);
    },

    formatDateRange(startDate, endDate) {
        if (!startDate && !endDate) return 'даты пока не рассчитаны';
        if (!startDate || !endDate) return this.formatDateStr(startDate || endDate);
        return `${this.formatDateStr(startDate)} → ${this.formatDateStr(endDate)}`;
    },

    formatHours(hours) {
        const value = round2(hours || 0);
        const rendered = Number.isInteger(value) ? String(value) : String(value).replace(/\.0$/, '');
        return `${rendered.replace('.', ',')}ч`;
    },

    daysBetween(d1, d2) {
        const ms = d2.getTime() - d1.getTime();
        return Math.round(ms / 86400000);
    },

    formatDateStr(dateStr) {
        if (!dateStr) return '—';
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
        } catch (e) {
            return dateStr;
        }
    },

    shortName(name) {
        if (!name) return '';
        return name.length > 34 ? `${name.substring(0, 32)}..` : name;
    },

    getHolidaySet() {
        const raw = String((App.settings && App.settings.production_holidays) || '').trim();
        if (!raw) return new Set();
        return new Set(
            raw
                .split(/[\s,;]+/)
                .map(value => value.trim())
                .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
        );
    },

    formatIsoDateLocal(date) {
        const value = date instanceof Date ? date : new Date(date);
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
    },

    esc(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },
};

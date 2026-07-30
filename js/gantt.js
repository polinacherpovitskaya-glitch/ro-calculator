// =============================================
// Recycle Object — Production Calendar
// Unified week/month priority Gantt for a four-person production team
// =============================================

const Gantt = {
    orders: [],
    blockedOrders: [],
    reviewOrders: [],
    schedule: null,
    orderSequence: [],
    actualMonthSummary: { actualHours: 0, employeeCount: 0 },
    planState: { order_ids: [], manual_start_dates: {}, active_workers_count: null, parallel_workers: {} },
    draggedOrderId: null,
    zoom: 'week',
    isLoading: false,
    _loadSeq: 0,
    TEAM_SIZE: 4,
    SHIFT_HOURS: 9,
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

    hydrateFromCache() {
        if (typeof getLocal !== 'function' || typeof LOCAL_KEYS === 'undefined') return false;
        const cachedOrders = getLocal(LOCAL_KEYS.orders) || [];
        if (!Array.isArray(cachedOrders) || cachedOrders.length === 0) return false;
        const planState = getLocal(LOCAL_KEYS.productionPlan) || { order_ids: [] };
        const orderIds = this.buildOrderedOrders(cachedOrders, planState).map(order => Number(order.id));
        const orderIdSet = new Set(orderIds);
        const orderItems = (getLocal(LOCAL_KEYS.orderItems) || []).filter(item => orderIdSet.has(Number(item.order_id)));
        const allChinaPurchases = getLocal(LOCAL_KEYS.chinaPurchases) || [];
        const timeEntries = getLocal(LOCAL_KEYS.timeEntries) || [];
        const employees = getLocal(LOCAL_KEYS.employees) || [];
        this.applyLoadedData({ allOrders: cachedOrders, planState, allChinaPurchases, timeEntries, employees, orderItems });
        return this.orders.length > 0 || this.blockedOrders.length > 0 || this.reviewOrders.length > 0;
    },

    buildOrderedOrders(allOrders = [], planState = { order_ids: [] }) {
        const normalizedState = this.normalizePlanState(planState);
        const priorityIds = Array.isArray(normalizedState.order_ids)
            ? normalizedState.order_ids.map(x => Number(x)).filter(Number.isFinite)
            : [];
        const priorityPos = new Map(priorityIds.map((id, index) => [id, index]));

        return (allOrders || [])
            .filter(order => this.isSchedulableOrder(order))
            .map((order, index) => ({
                ...order,
                production_priority: priorityPos.has(Number(order.id))
                    ? priorityPos.get(Number(order.id))
                    : 1000 + index,
            }))
            .sort((a, b) => Number(a.production_priority || 0) - Number(b.production_priority || 0));
    },

    applyLoadedData({ allOrders = [], planState = { order_ids: [] }, allChinaPurchases = [], timeEntries = [], employees = [], orderItems = [] }) {
        this.planState = this.normalizePlanState(planState);
        const effectivePlanningSettings = this.getEffectivePlanningSettings(App.settings || {});
        const orderedOrders = this.buildOrderedOrders(allOrders, this.planState);

        // Pure data -> model pipeline (shared with a headless publisher).
        const model = buildProductionModel({
            orders: orderedOrders,
            orderItems,
            planState: this.planState,
            settings: effectivePlanningSettings,
            timeEntries,
            employees,
            chinaPurchases: allChinaPurchases,
        });

        this.orders = model.orders;
        this.blockedOrders = model.blocked;
        this.reviewOrders = model.review;
        this.orderSequence = this.orders.map(order => Number(order.id));
        this.actualMonthSummary = this.buildActualMonthSummary(timeEntries, employees);
        this.schedule = {
            queue: model.queue,
            days: model.days,
            dailyCapacity: model.dailyCapacity,
        };
    },

    async load() {
        const loadSeq = ++this._loadSeq;
        const hydrated = (this.orders || []).length > 0 || this.hydrateFromCache();
        this.isLoading = !hydrated;
        this.render();
        try {
            const [allOrders, planState] = await Promise.all([
                loadOrders({}),
                loadProductionPlanState().catch(() => ({ order_ids: [] })),
            ]);
            if (this._loadSeq !== loadSeq) return;

            const orderedOrders = this.buildOrderedOrders(allOrders, planState);
            const orderedIds = orderedOrders.map(order => Number(order.id)).filter(Number.isFinite);
            const orderItemsPromise = loadOrderItemsByOrderIds(orderedIds).catch(() => []);
            const chinaPromise = loadChinaPurchases({}).catch(() => []);
            const actualsPromise = Promise.all([
                loadTimeEntries().catch(() => []),
                loadEmployees().catch(() => []),
            ]);

            const [orderItems, allChinaPurchases] = await Promise.all([orderItemsPromise, chinaPromise]);
            if (this._loadSeq !== loadSeq) return;

            this.applyLoadedData({
                allOrders,
                planState,
                allChinaPurchases,
                timeEntries: [],
                employees: [],
                orderItems,
            });
            this.isLoading = false;
            this.render();

            actualsPromise
                .then(([timeEntries, employees]) => {
                    if (this._loadSeq !== loadSeq) return;
                    this.applyLoadedData({
                        allOrders,
                        planState,
                        allChinaPurchases,
                        timeEntries,
                        employees,
                        orderItems,
                    });
                    this.render();
                })
                .catch(error => {
                    console.warn('Gantt actuals load error:', error);
                });
        } catch (e) {
            console.error('Gantt load error:', e);
            if (this._loadSeq === loadSeq) {
                this.isLoading = false;
                this.render();
            }
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

    buildOrderActuals(entries = [], employees = [], orders = []) {
        // Thin delegator to the canonical pure implementation in
        // js/production-core.js (bare name resolves to the global free function,
        // not this method, so there is no recursion). resolveEntryOrder /
        // tokenizeSearchText / getTimeEntryPhase / mapStageToProductionPhase now
        // live in production-core.js alongside it.
        return buildOrderActuals(entries, employees, orders);
    },

    normalizePlanState(state) {
        const raw = state && typeof state === 'object' ? state : {};
        const manualStartDates = {};
        const parallelWorkers = {};
        Object.entries(raw.manual_start_dates || {}).forEach(([orderId, value]) => {
            const normalized = String(value || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                manualStartDates[String(orderId)] = normalized;
            }
        });
        Object.entries(raw.parallel_workers || {}).forEach(([orderId, value]) => {
            const normalized = Math.round(Number(value) || 0);
            if (normalized >= 1) {
                parallelWorkers[String(orderId)] = Math.min(normalized, this.TEAM_SIZE);
            }
        });
        const activeWorkersCountRaw = Number(raw.active_workers_count);
        return {
            order_ids: Array.isArray(raw.order_ids) ? raw.order_ids : [],
            manual_start_dates: manualStartDates,
            active_workers_count: activeWorkersCountRaw > 0 ? round2(activeWorkersCountRaw) : null,
            parallel_workers: parallelWorkers,
        };
    },

    getEffectivePlanningSettings(baseSettings = App.settings || {}) {
        return {
            ...(baseSettings || {}),
            planning_workers_count: this.TEAM_SIZE,
            planning_hours_per_day: this.SHIFT_HOURS,
        };
    },

    getEffectivePlanningCapacity(baseSettings = App.settings || {}) {
        if (typeof getProductionPlanningCapacity === 'function') {
            return getProductionPlanningCapacity(this.getEffectivePlanningSettings(baseSettings));
        }
        const workersCount = this.TEAM_SIZE;
        const hoursPerDay = this.SHIFT_HOURS;
        return {
            workersCount: round2(workersCount),
            hoursPerDay: round2(hoursPerDay),
            dailyCapacity: round2(workersCount * hoursPerDay),
        };
    },

    getWorkerSlotCount(capacity = this.getEffectivePlanningCapacity()) {
        const workers = Math.max(Number(capacity?.workersCount || 0), 0);
        const fullSlots = Math.floor(workers);
        const fractional = round2(workers - fullSlots);
        return Math.min(this.TEAM_SIZE, fullSlots + (fractional > 0.001 ? 1 : 0));
    },

    getOrderParallelWorkers(orderId) {
        const normalizedId = String(Number(orderId) || 0);
        const stored = Math.round(Number(this.planState?.parallel_workers?.[normalizedId] || 0));
        return stored >= 1 ? stored : 1;
    },

    getOrderReadiness(order, items = [], chinaPurchases = []) {
        // Thin delegator to the canonical readiness classifier in
        // js/production-core.js. Its helpers (isTrueLike, describeBlockedByMold,
        // isChinaPurchaseReceived, describeChinaBlocked,
        // describeReviewAfterChinaReceipt) now live in production-core.js too.
        return deriveReadyState(order, items, chinaPurchases);
    },

    async moveOrder(orderId, direction) {
        const orderIds = Array.isArray(this.orderSequence) && this.orderSequence.length
            ? [...this.orderSequence]
            : (this.orders || []).map(item => Number(item.id || item.orderId));
        const currentIndex = orderIds.indexOf(Number(orderId));
        const targetIndex = currentIndex + direction;
        if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderIds.length) return;

        [orderIds[currentIndex], orderIds[targetIndex]] = [orderIds[targetIndex], orderIds[currentIndex]];
        const nextState = this.normalizePlanState(this.planState);
        nextState.order_ids = orderIds;
        await saveProductionPlanState(nextState);
        this.planState = nextState;
        await this.load();
    },

    reorderOrderSequence(orderIds = [], draggedOrderId, targetOrderId) {
        const draggedId = Number(draggedOrderId);
        const targetId = Number(targetOrderId);
        const normalized = (orderIds || []).map(id => Number(id)).filter(Number.isFinite);
        const currentIndex = normalized.indexOf(draggedId);
        const targetIndex = normalized.indexOf(targetId);
        if (currentIndex < 0 || targetIndex < 0 || draggedId === targetId) return normalized;
        const next = [...normalized];
        next.splice(currentIndex, 1);
        const insertIndex = next.indexOf(targetId);
        next.splice(insertIndex, 0, draggedId);
        return next;
    },

    async moveUp(orderId) {
        await this.moveOrder(orderId, -1);
    },

    async moveDown(orderId) {
        await this.moveOrder(orderId, 1);
    },

    async promptManualStart(orderId) {
        const state = this.normalizePlanState(this.planState);
        const current = state.manual_start_dates[String(orderId)] || '';
        const answer = window.prompt('Старт не раньше даты (YYYY-MM-DD). Оставьте пусто, чтобы убрать ограничение.', current);
        if (answer === null) return;
        const normalized = String(answer || '').trim();
        if (!normalized) {
            delete state.manual_start_dates[String(orderId)];
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
            App.toast('Введите дату в формате YYYY-MM-DD');
            return;
        } else {
            state.manual_start_dates[String(orderId)] = normalized;
        }
        await saveProductionPlanState(state);
        this.planState = state;
        await this.load();
    },

    async shiftManualStart(orderId, direction) {
        if (!Number.isFinite(Number(direction)) || Number(direction) === 0) return;
        const order = (this.orders || []).find(item => Number(item.id || item.orderId) === Number(orderId));
        const state = this.normalizePlanState(this.planState);
        const current = state.manual_start_dates[String(orderId)]
            || order?.production_not_before
            || order?.schedule?.[0]?.date
            || this.formatIsoDateLocal(new Date());
        const nextDate = this.shiftWorkingDate(current, Number(direction), this.getHolidaySet());
        state.manual_start_dates[String(orderId)] = nextDate;
        await saveProductionPlanState(state);
        this.planState = state;
        await this.load();
    },

    async setOrderParallelWorkers(orderId, value) {
        const normalizedOrderId = String(Number(orderId) || 0);
        if (!normalizedOrderId || normalizedOrderId === '0') return;
        const slotLimit = Math.max(1, Math.min(this.TEAM_SIZE, this.getWorkerSlotCount()));
        const normalized = Math.max(1, Math.min(slotLimit, Math.round(Number(value) || 1)));
        const state = this.normalizePlanState(this.planState);
        state.parallel_workers[normalizedOrderId] = normalized;
        await saveProductionPlanState(state);
        this.planState = state;
        await this.load();
    },

    async adjustParallelWorkers(orderId, delta) {
        const current = this.getOrderParallelWorkers(orderId);
        await this.setOrderParallelWorkers(orderId, current + Number(delta || 0));
    },

    onOrderDragStart(event, orderId) {
        this.draggedOrderId = Number(orderId);
        if (event?.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', String(orderId));
        }
        event?.currentTarget?.classList.add('dragging');
    },

    onOrderDragOver(event) {
        event.preventDefault();
        if (event?.dataTransfer) event.dataTransfer.dropEffect = 'move';
        event?.currentTarget?.classList.add('drag-over');
    },

    onOrderDragLeave(event) {
        event?.currentTarget?.classList.remove('drag-over');
    },

    onOrderDragEnd(event) {
        this.draggedOrderId = null;
        event?.currentTarget?.classList.remove('dragging');
        document.querySelectorAll('.gantt-priority-card.drag-over').forEach(node => node.classList.remove('drag-over'));
    },

    async onOrderDrop(event, targetOrderId) {
        event.preventDefault();
        event?.currentTarget?.classList.remove('drag-over');
        const draggedOrderId = Number(
            event?.dataTransfer?.getData('text/plain')
            || this.draggedOrderId
            || 0
        );
        if (!draggedOrderId || draggedOrderId === Number(targetOrderId)) {
            this.draggedOrderId = null;
            return;
        }
        const nextOrderIds = this.reorderOrderSequence(this.orderSequence, draggedOrderId, targetOrderId);
        const nextState = this.normalizePlanState(this.planState);
        nextState.order_ids = nextOrderIds;
        await saveProductionPlanState(nextState);
        this.planState = nextState;
        this.draggedOrderId = null;
        await this.load();
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
        if (!container) return;

        if (this.isLoading && !this.schedule && !(this.orders || []).length) {
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128197;</div>
                        <p>Загружаем производственный календарь…</p>
                    </div>
                </div>`;
            return;
        }

        const blockedQueue = this.blockedOrders || [];
        const reviewQueue = this.reviewOrders || [];
        if (!this.schedule || (this.schedule.queue.length === 0 && blockedQueue.length === 0 && reviewQueue.length === 0)) {
            container.innerHTML = `
                <div class="card">
                    <div class="empty-state">
                        <div class="empty-icon">&#128197;</div>
                        <p>Нет заказов для планирования</p>
                        <p class="text-muted" style="font-size:13px">Создайте заказ с производственными часами — после этого он появится здесь.</p>
                    </div>
                </div>`;
            return;
        }

        const { queue, days } = this.schedule;
        const activeQueue = queue.filter(item => item.schedule.length > 0);
        const pausedHtml = this.renderPausedOrders(blockedQueue, reviewQueue);

        if (!days.length || !activeQueue.length) {
            container.innerHTML = `
                <div class="card">
                    <p class="text-muted text-center">
                        ${(blockedQueue.length || reviewQueue.length)
                            ? 'Сейчас нет готовых к планированию заказов. Заказы, которые ждут данные или молд, показаны ниже.'
                            : 'Нет данных для отображения'}
                    </p>
                </div>
                ${pausedHtml}`;
            return;
        }

        const firstDate = this.parseLocalDate(days[0].date);
        const lastDate = this.parseLocalDate(days[days.length - 1].date);
        firstDate.setHours(0, 0, 0, 0);
        lastDate.setHours(0, 0, 0, 0);

        const minDate = new Date(firstDate);
        minDate.setDate(minDate.getDate() - 1);
        const maxDate = new Date(lastDate);
        maxDate.setDate(maxDate.getDate() + 5);

        const totalDays = this.daysBetween(minDate, maxDate) + 1;
        const cellWidth = this.zoom === 'week' ? 56 : 34;
        const totalWidth = totalDays * cellWidth;

        const holidaySet = this.getHolidaySet();
        const headerHtml = this.renderTimeAxis(minDate, totalDays, cellWidth, holidaySet);
        const priorityCards = activeQueue.map((item, index) => this.renderPriorityCard(item, index, holidaySet)).join('');
        const capacity = this.getEffectivePlanningCapacity();
        const hoursPerDay = Number(capacity.hoursPerDay || this.SHIFT_HOURS);
        const deadlineHtml = this.renderDeadlineStrip(activeQueue, minDate, totalDays, cellWidth);
        const workerRows = Array.from(
            { length: this.TEAM_SIZE },
            (_, index) => this.renderWorkerLane(index + 1, activeQueue, minDate, totalDays, cellWidth, hoursPerDay, holidaySet)
        ).join('');
        const workerLabels = Array.from(
            { length: this.TEAM_SIZE },
            (_, index) => `
                <div class="gantt-resource-label" title="Условный производственный слот ${index + 1}">
                    <span>Человек</span>
                    <strong>${index + 1}</strong>
                </div>`
        ).join('');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOffset = this.daysBetween(minDate, today);
        const todayLeft = todayOffset * cellWidth;
        const showToday = todayOffset >= 0 && todayOffset < totalDays;

        container.innerHTML = `
            <div class="gantt-planner">
                <aside class="gantt-priority-panel">
                    <div class="gantt-priority-header">
                        <div>
                            <strong>Приоритеты</strong>
                            <span>перетащите заказ</span>
                        </div>
                        <span class="gantt-team-label">4 чел.</span>
                    </div>
                    <div class="gantt-priority-list">${priorityCards}</div>
                </aside>
                <section class="gantt-resource-board">
                    <div class="gantt-resource-labels">
                        <div class="gantt-resource-label-header">Люди</div>
                        <div class="gantt-resource-label-deadline">Сроки</div>
                        ${workerLabels}
                    </div>
                    <div class="gantt-timeline" id="gantt-timeline">
                        <div class="gantt-timeline-inner" style="width:${totalWidth + 20}px">
                            <div class="gantt-header">${headerHtml}</div>
                            <div class="gantt-resource-body">
                                ${showToday ? `<div class="gantt-today-line" style="left:${todayLeft}px" title="Сегодня"></div>` : ''}
                                <div class="gantt-deadline-strip">${deadlineHtml}</div>
                                ${workerRows}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            ${pausedHtml}`;

        if (showToday) {
            const timeline = document.getElementById('gantt-timeline');
            if (timeline) {
                timeline.scrollLeft = Math.max(0, todayLeft - timeline.clientWidth / 3);
            }
        }
    },

    renderPriorityCard(item, index, holidaySet = new Set()) {
        const orderId = Number(item.orderId || item.id);
        const progress = this.getOrderProgress(item);
        const risk = this.getNextDeliveryRiskSummary(item) || this.getDeadlineRiskSummary(item, holidaySet);
        const workerTarget = Math.max(
            1,
            Math.min(
                this.TEAM_SIZE,
                Number(item.parallelWorkersTarget || item.production_parallel_workers || this.getOrderParallelWorkers(orderId))
            )
        );
        const riskClass = risk.status === 'late'
            ? 'risk'
            : ((risk.status === 'critical' || risk.status === 'tight') ? 'tight' : 'ok');
        const deadlineLabel = item.deadlineEnd
            ? `дедлайн ${this.formatDateStr(item.deadlineEnd)}`
            : 'без дедлайна';
        const title = [
            item.orderName || 'Без названия',
            item.clientName || 'Без клиента',
            `Осталось ${this.formatHours(progress.remaining)}`,
            risk.label,
            deadlineLabel,
        ].join(' · ');

        return `
            <div class="gantt-priority-card ${riskClass}" draggable="true" title="${this.esc(title)}"
                ondragstart="Gantt.onOrderDragStart(event, ${orderId})"
                ondragover="Gantt.onOrderDragOver(event)"
                ondragleave="Gantt.onOrderDragLeave(event)"
                ondragend="Gantt.onOrderDragEnd(event)"
                ondrop="Gantt.onOrderDrop(event, ${orderId})">
                <span class="gantt-drag-handle" title="Перетащить заказ">&#8942;&#8942;</span>
                <span class="gantt-priority-index">${index + 1}</span>
                <div class="gantt-priority-main">
                    <div class="gantt-order-name" title="${this.esc(item.orderName)}">${this.esc(item.orderName || 'Без названия')}</div>
                    <div class="gantt-order-meta">ост. ${this.formatHours(progress.remaining)} · ${deadlineLabel}</div>
                </div>
                <div class="gantt-priority-actions" onclick="event.stopPropagation()">
                    <span class="gantt-worker-stepper">
                        <button class="gantt-worker-button" onclick="Gantt.adjustParallelWorkers(${orderId}, -1)" ${workerTarget <= 1 ? 'disabled' : ''} title="Уменьшить число сотрудников">&#8722;</button>
                        <span class="gantt-worker-count" title="Максимум сотрудников одновременно">до ${workerTarget}</span>
                        <button class="gantt-worker-button" onclick="Gantt.adjustParallelWorkers(${orderId}, 1)" ${workerTarget >= this.TEAM_SIZE ? 'disabled' : ''} title="Увеличить число сотрудников">+</button>
                    </span>
                    <button class="gantt-open-order" onclick="App.navigate('order-detail', true, ${orderId})">Открыть</button>
                </div>
            </div>`;
    },

    renderPausedOrders(blockedQueue = [], reviewQueue = []) {
        const renderGroup = (title, items, type) => {
            if (!items.length) return '';
            const rows = items.map(item => {
                const orderId = Number(item.orderId || item.id);
                const name = item.orderName || item.order_name || 'Без названия';
                const reason = item.production_blocked_reason
                    || (type === 'review' ? 'Нужно проверить данные заказа' : 'Заказ пока не готов к производству');
                return `
                    <div class="gantt-paused-row ${type}">
                        <div>
                            <strong>${this.esc(name)}</strong>
                            <span>${this.esc(reason)}</span>
                        </div>
                        <button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${orderId})">Открыть заказ</button>
                    </div>`;
            }).join('');
            return `
                <section class="gantt-paused-group">
                    <h3>${title} <span>${items.length}</span></h3>
                    ${rows}
                </section>`;
        };

        const groups = [
            renderGroup('Ждут готовности', blockedQueue, 'blocked'),
            renderGroup('Нужно проверить', reviewQueue, 'review'),
        ].filter(Boolean).join('');
        return groups ? `<div class="gantt-paused-card">${groups}</div>` : '';
    },

    getWorkerLaneAllocations(queue = [], workerSlot, hoursPerDay = this.SHIFT_HOURS) {
        const normalizedSlot = Math.max(1, Math.min(this.TEAM_SIZE, Math.round(Number(workerSlot) || 1)));
        const normalizedShift = Math.max(Number(hoursPerDay || this.SHIFT_HOURS), 0.01);
        const allocations = [];

        (queue || []).forEach((item, priorityIndex) => {
            (item.schedule || []).forEach((segment, segmentIndex) => {
                if (Number(segment.workerSlot || 1) !== normalizedSlot) return;
                const hours = Math.max(0, Number(segment.hours || 0));
                const rawStart = Number(segment.startHour);
                const startHour = Math.max(
                    0,
                    Math.min(normalizedShift, Number.isFinite(rawStart) ? rawStart : 0)
                );
                const rawEnd = Number(segment.endHour);
                const endHour = Math.max(
                    startHour,
                    Math.min(normalizedShift, Number.isFinite(rawEnd) ? rawEnd : startHour + hours)
                );
                if (!(endHour > startHour)) return;
                allocations.push({
                    ...segment,
                    orderId: Number(item.orderId || item.id),
                    orderName: item.orderName || item.order_name || 'Без названия',
                    priorityIndex,
                    segmentIndex,
                    workerSlot: normalizedSlot,
                    startHour: round2(startHour),
                    endHour: round2(endHour),
                });
            });
        });

        allocations.sort((left, right) => (
            String(left.date || '').localeCompare(String(right.date || ''))
            || Number(left.startHour || 0) - Number(right.startHour || 0)
            || Number(left.priorityIndex || 0) - Number(right.priorityIndex || 0)
            || Number(left.segmentIndex || 0) - Number(right.segmentIndex || 0)
        ));
        return allocations.reduce((merged, allocation) => {
            const previous = merged[merged.length - 1];
            const isContinuation = previous
                && previous.date === allocation.date
                && previous.orderId === allocation.orderId
                && previous.phase === allocation.phase
                && previous.workerSlot === allocation.workerSlot
                && Math.abs(Number(previous.endHour || 0) - Number(allocation.startHour || 0)) < 0.001;
            if (!isContinuation) {
                merged.push({ ...allocation });
                return merged;
            }
            previous.endHour = allocation.endHour;
            previous.hours = round2(Number(previous.hours || 0) + Number(allocation.hours || 0));
            return merged;
        }, []);
    },

    renderTimelineGrid(minDate, totalDays, cellWidth, holidaySet = new Set()) {
        let html = '';
        for (let index = 0; index < totalDays; index++) {
            const date = new Date(minDate);
            date.setDate(date.getDate() + index);
            const isNonWorking = this.isNonWorkingDate(date, holidaySet);
            html += `<span class="gantt-grid-cell ${isNonWorking ? 'gantt-weekend' : ''}" style="left:${index * cellWidth}px;width:${cellWidth}px"></span>`;
        }
        return html;
    },

    renderDeadlineStrip(queue, minDate, totalDays, cellWidth) {
        const markers = [];
        (queue || []).forEach((item, priorityIndex) => {
            const milestones = (item.deliveryMilestones || []).length
                ? item.deliveryMilestones
                : (item.deadlineEnd
                    ? [{
                        date: item.deadlineEnd,
                        quantity: 0,
                        finishDate: item.schedule?.[item.schedule.length - 1]?.date || null,
                    }]
                    : []);
            milestones.forEach(milestone => {
                const deadlineDate = this.parseLocalDate(milestone.date);
                deadlineDate.setHours(0, 0, 0, 0);
                const deadlineOffset = this.daysBetween(minDate, deadlineDate);
                if (deadlineOffset < 0 || deadlineOffset >= totalDays) return;
                const risk = (item.deliveryMilestones || []).length
                    ? this.getDeliveryMilestoneRisk(milestone)
                    : this.getDeadlineRiskSummary(item);
                const riskClass = risk.status === 'late'
                    ? 'overdue'
                    : ((risk.status === 'critical' || risk.status === 'tight') ? 'tight' : '');
                const quantityLabel = milestone.quantity
                    ? `${Number(milestone.quantity).toLocaleString('ru-RU')} шт. · `
                    : '';
                const title = `#${priorityIndex + 1} ${item.orderName || item.order_name || 'Без названия'} · ${quantityLabel}${this.formatDateStr(milestone.date)} · ${risk.label}`;
                markers.push(`
                    <span class="gantt-deadline-chip ${riskClass}" style="left:${(deadlineOffset + 0.72) * cellWidth}px" title="${this.esc(title)}">
                        <span aria-hidden="true">&#9670;</span><strong>${priorityIndex + 1}</strong>
                    </span>`);
            });
        });
        return `${this.renderTimelineGrid(minDate, totalDays, cellWidth, this.getHolidaySet())}${markers.join('')}`;
    },

    renderWorkerLane(workerSlot, queue, minDate, totalDays, cellWidth, hoursPerDay, holidaySet = new Set()) {
        const phaseColors = { molding: '#f59e0b', assembly: '#06b6d4', packaging: '#8b5cf6' };
        const phaseLabels = { molding: 'Литьё', assembly: 'Сборка', packaging: 'Упаковка' };
        const allocations = this.getWorkerLaneAllocations(queue, workerSlot, hoursPerDay);
        const barsHtml = allocations.map(allocation => {
            const dayOffset = this.daysBetween(minDate, this.parseLocalDate(allocation.date));
            const left = (
                dayOffset * cellWidth
                + (Number(allocation.startHour || 0) / hoursPerDay) * cellWidth
            );
            const duration = Math.max(Number(allocation.endHour || 0) - Number(allocation.startHour || 0), 0);
            const width = Math.max(2, (duration / hoursPerDay) * cellWidth);
            const color = phaseColors[allocation.phase] || '#64748b';
            const phaseLabel = phaseLabels[allocation.phase] || allocation.phase || 'Работа';
            const orderLabel = `#${allocation.priorityIndex + 1} ${allocation.orderName}`;
            const intervalLabel = `${this.formatHours(allocation.startHour)}–${this.formatHours(allocation.endHour)} смены`;
            const title = `Человек ${workerSlot} · ${orderLabel} · ${phaseLabel} · ${this.formatDateStr(allocation.date)} · ${intervalLabel}`;
            return `
                <button type="button" class="gantt-worker-task" style="left:${left}px;width:${width}px;--task-color:${color};--task-bg:${color}20"
                    onclick="App.navigate('order-detail', true, ${allocation.orderId})" title="${this.esc(title)}">
                    <span>${this.esc(orderLabel)}</span>
                    <small>${this.esc(phaseLabel)}</small>
                </button>`;
        }).join('');

        return `
            <div class="gantt-worker-lane" data-worker-slot="${workerSlot}">
                ${this.renderTimelineGrid(minDate, totalDays, cellWidth, holidaySet)}
                ${barsHtml}
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
        return round2((item.phases || [])
            .filter(phase => phase.name === phaseName)
            .reduce((sum, phase) => sum + (phase.total || 0), 0));
    },

    getPhaseProgress(item, phaseName) {
        const phases = (item.phases || []).filter(entry => entry.name === phaseName);
        return {
            planned: round2(phases.reduce((sum, phase) => sum + (phase.total || 0), 0)),
            actual: round2(phases.reduce((sum, phase) => sum + (phase.actual || 0), 0)),
            remaining: round2(phases.reduce((sum, phase) => sum + (phase.remaining || 0), 0)),
        };
    },

    getOrderProgress(item) {
        const planned = round2(item.plannedTotalHours || this.getOrderTotalHours(item));
        const actual = round2(item.actualTotalHours || 0);
        const remaining = round2(item.remainingTotalHours != null ? item.remainingTotalHours : Math.max(planned - actual, 0));
        const overrun = round2(Math.max(actual - planned, 0));
        return { planned, actual, remaining, overrun };
    },

    countWorkingDaysBetween(startDate, endDate, holidaySet = this.getHolidaySet()) {
        const start = this.parseLocalDate(startDate);
        const end = this.parseLocalDate(endDate);
        start.setHours(0, 0, 0, 0);
        end.setHours(0, 0, 0, 0);
        if (start.getTime() === end.getTime()) return 0;
        const step = start < end ? 1 : -1;
        let count = 0;
        const cursor = new Date(start.getTime());
        while ((step > 0 && cursor < end) || (step < 0 && cursor > end)) {
            cursor.setDate(cursor.getDate() + step);
            if (!this.isNonWorkingDate(cursor, holidaySet)) count += 1;
        }
        return count;
    },

    getDeadlineRiskSummary(item, holidaySet = this.getHolidaySet()) {
        const deliveryRisks = (item?.deliveryMilestones || [])
            .filter(milestone => !milestone.completed)
            .map(milestone => this.getDeliveryMilestoneRisk(milestone, holidaySet));
        if (deliveryRisks.length > 0) {
            const severity = { late: 4, critical: 3, tight: 2, unplanned: 1, ok: 0 };
            return deliveryRisks.sort((a, b) => (severity[b.status] || 0) - (severity[a.status] || 0))[0];
        }
        const deadlineEnd = item?.deadlineEnd || item?.deadline_end || '';
        const finishDate = item?.schedule?.[item.schedule.length - 1]?.date || null;
        if (!deadlineEnd) {
            return { status: 'no_deadline', label: 'Без дедлайна', finishDate };
        }
        if (!finishDate) {
            return { status: 'unplanned', label: 'Пока без даты финиша', finishDate };
        }
        if (finishDate > deadlineEnd) {
            const lateDays = this.countWorkingDaysBetween(deadlineEnd, finishDate, holidaySet);
            return {
                status: 'late',
                label: `Опаздывает на ${Math.max(lateDays, 1)} раб.дн.`,
                finishDate,
            };
        }
        const bufferDays = this.countWorkingDaysBetween(finishDate, deadlineEnd, holidaySet);
        if (bufferDays === 0) {
            return { status: 'critical', label: 'Впритык к дедлайну', finishDate };
        }
        if (bufferDays <= 2) {
            return { status: 'tight', label: `Буфер ${bufferDays} раб.дн.`, finishDate };
        }
        return { status: 'ok', label: `Буфер ${bufferDays} раб.дн.`, finishDate };
    },

    getDeliveryMilestoneRisk(milestone, holidaySet = this.getHolidaySet()) {
        const finishDate = milestone?.finishDate || null;
        const deadlineEnd = milestone?.date || '';
        const quantity = Number(milestone?.quantity || 0);
        if (milestone?.completed) {
            return { status: 'done', label: 'Партия готова', finishDate, deadlineEnd, quantity, milestone };
        }
        if (!finishDate) {
            return { status: 'unplanned', label: 'Партия пока без даты финиша', finishDate, deadlineEnd, quantity, milestone };
        }
        if (finishDate > deadlineEnd) {
            const lateDays = this.countWorkingDaysBetween(deadlineEnd, finishDate, holidaySet);
            return {
                status: 'late',
                label: `Партия опаздывает на ${Math.max(lateDays, 1)} раб.дн.`,
                finishDate,
                deadlineEnd,
                quantity,
                milestone,
            };
        }
        const bufferDays = this.countWorkingDaysBetween(finishDate, deadlineEnd, holidaySet);
        if (bufferDays === 0) {
            return { status: 'critical', label: 'Партия впритык к сроку', finishDate, deadlineEnd, quantity, milestone };
        }
        if (bufferDays <= 2) {
            return { status: 'tight', label: `Партия: буфер ${bufferDays} раб.дн.`, finishDate, deadlineEnd, quantity, milestone };
        }
        return { status: 'ok', label: `Партия: буфер ${bufferDays} раб.дн.`, finishDate, deadlineEnd, quantity, milestone };
    },

    getNextDeliveryRiskSummary(item, holidaySet = this.getHolidaySet()) {
        const next = (item?.deliveryMilestones || []).find(milestone => !milestone.completed);
        return next ? this.getDeliveryMilestoneRisk(next, holidaySet) : null;
    },

    buildActualMonthSummary(entries = [], employees = [], referenceDate = new Date()) {
        const monthPrefix = this.getMonthPrefix(referenceDate);
        const actualWorkers = new Set();
        let actualHours = 0;
        (entries || []).forEach(entry => {
            if (!String(entry?.date || '').startsWith(monthPrefix)) return;
            const employee = this.findProductionEmployeeForEntry(entry, employees);
            if (!employee) return;
            const hours = parseFloat(entry.hours) || 0;
            if (hours <= 0) return;
            actualHours += hours;
            actualWorkers.add(String(employee.id || employee.name || entry.worker_name || ''));
        });
        return {
            actualHours: round2(actualHours),
            employeeCount: actualWorkers.size,
        };
    },

    buildCurrentMonthTrackingSummary(days = [], actualMonthSummary = {}, referenceDate = new Date()) {
        const point = referenceDate instanceof Date ? referenceDate : this.parseLocalDate(referenceDate);
        const today = this.formatIsoDateLocal(point);
        const monthPrefix = this.getMonthPrefix(point);
        const relevantDays = (days || []).filter(day => String(day?.date || '').startsWith(monthPrefix));
        const plannedMonthHours = round2(relevantDays.reduce((sum, day) => sum + (day.totalUsed || 0), 0));
        const plannedToDateHours = round2(relevantDays.filter(day => day.date <= today).reduce((sum, day) => sum + (day.totalUsed || 0), 0));
        const actualMonthHours = round2(actualMonthSummary?.actualHours || 0);
        return {
            plannedMonthHours,
            plannedToDateHours,
            actualMonthHours,
            gapToDate: round2(actualMonthHours - plannedToDateHours),
            employeeCount: Number(actualMonthSummary?.employeeCount || 0),
        };
    },

    buildCapacityRiskSummary(days = [], dailyCapacity = 0, referenceDate = new Date()) {
        // Thin delegator to the canonical overload calc in js/production-core.js.
        return computeOverloadSummary(days, dailyCapacity, referenceDate);
    },

    getMonthPrefix(date) {
        const value = date instanceof Date ? date : new Date(date);
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-`;
    },

    findProductionEmployeeForEntry(entry, employees = []) {
        if (!entry) return null;
        const employeeId = entry.employee_id != null ? String(entry.employee_id) : '';
        if (employeeId) {
            const byId = (employees || []).find(emp => String(emp.id) === employeeId && emp.role === 'production');
            if (byId) return byId;
        }
        const normalizedWorker = this.normalizePersonName(entry.worker_name || entry.employee_name || '');
        if (!normalizedWorker) return null;
        const exactMatches = (employees || []).filter(emp =>
            emp.role === 'production' && this.normalizePersonName(emp.name) === normalizedWorker
        );
        if (exactMatches.length === 1) return exactMatches[0];
        const shortKey = this.getPersonShortKey(entry.worker_name || entry.employee_name || '');
        if (!shortKey) return null;
        const shortMatches = (employees || []).filter(emp =>
            emp.role === 'production' && this.getPersonShortKey(emp.name) === shortKey
        );
        return shortMatches.length === 1 ? shortMatches[0] : null;
    },

    normalizePersonName(name) {
        return String(name || '')
            .trim()
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{N}\s]/gu, '')
            .trim();
    },

    getPersonShortKey(name) {
        return this.normalizePersonName(name).split(' ').filter(Boolean)[0] || '';
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
            const date = this.parseLocalDate(dateStr);
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

    isNonWorkingDate(date, holidaySet = new Set()) {
        const value = this.parseLocalDate(date);
        const weekday = value.getDay();
        if (weekday === 0 || weekday === 6) return true;
        return holidaySet.has(this.formatIsoDateLocal(value));
    },

    shiftWorkingDate(dateStr, delta, holidaySet = new Set()) {
        const step = delta >= 0 ? 1 : -1;
        let remaining = Math.abs(Number(delta) || 0);
        const date = this.parseLocalDate(dateStr || new Date());
        date.setHours(0, 0, 0, 0);
        while (remaining > 0) {
            date.setDate(date.getDate() + step);
            if (!this.isNonWorkingDate(date, holidaySet)) {
                remaining -= 1;
            }
        }
        return this.formatIsoDateLocal(date);
    },

    parseLocalDate(value) {
        if (value instanceof Date) return new Date(value.getTime());
        const raw = String(value || '').trim();
        const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (match) {
            return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        }
        return new Date(value);
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

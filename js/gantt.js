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
    employees: [],
    roster: [],
    orderVisualMap: new Map(),
    actualMonthSummary: { actualHours: 0, employeeCount: 0 },
    planState: {
        order_ids: [],
        manual_start_dates: {},
        active_workers_count: null,
        parallel_workers: {},
        roster_employee_ids: [],
        employee_assignments: {},
        order_color_slots: {},
    },
    draggedOrderId: null,
    queueEditorOpen: false,
    zoom: 'week',
    priorityPanelWidth: null,
    _priorityPanelResize: null,
    _visualSaveQueued: false,
    isLoading: false,
    _loadSeq: 0,
    TEAM_SIZE: 4,
    SHIFT_HOURS: 9,
    PRIORITY_PANEL_DEFAULT_WIDTH: 220,
    PRIORITY_PANEL_MIN_WIDTH: 180,
    PRIORITY_PANEL_MAX_WIDTH: 400,
    PRIORITY_PANEL_STORAGE_KEY: 'ro_gantt_priority_panel_width',
    DEADLINE_STRIP_HEIGHT: 44,
    WORKER_LANE_HEIGHT: 84,
    PROJECT_PALETTE: [
        { color: '#2563eb', tint: '#dbeafe' },
        { color: '#c026d3', tint: '#fae8ff' },
        { color: '#059669', tint: '#d1fae5' },
        { color: '#e11d48', tint: '#ffe4e6' },
        { color: '#4f46e5', tint: '#e0e7ff' },
        { color: '#0f766e', tint: '#ccfbf1' },
        { color: '#c2410c', tint: '#ffedd5' },
        { color: '#475569', tint: '#e2e8f0' },
        { color: '#7c3aed', tint: '#ede9fe' },
        { color: '#4d7c0f', tint: '#ecfccb' },
        { color: '#0369a1', tint: '#e0f2fe' },
        { color: '#be185d', tint: '#fce7f3' },
        { color: '#a16207', tint: '#fef3c7' },
        { color: '#047857', tint: '#d1fae5' },
        { color: '#6d28d9', tint: '#ede9fe' },
        { color: '#0e7490', tint: '#cffafe' },
        { color: '#b91c1c', tint: '#fee2e2' },
        { color: '#334155', tint: '#e2e8f0' },
        { color: '#a21caf', tint: '#fae8ff' },
        { color: '#15803d', tint: '#dcfce7' },
        { color: '#1d4ed8', tint: '#dbeafe' },
        { color: '#92400e', tint: '#fef3c7' },
        { color: '#4338ca', tint: '#e0e7ff' },
        { color: '#9f1239', tint: '#ffe4e6' },
    ],
    PHASE_VISUALS: {
        molding: { color: '#b45309', background: '#fff0cf', label: 'Литьё' },
        assembly: { color: '#0e7490', background: '#cff5fb', label: 'Сборка' },
        packaging: { color: '#6d28d9', background: '#ede9fe', label: 'Упаковка' },
    },
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
        this.employees = Array.isArray(employees) ? employees : [];
        this.roster = Array.isArray(model.roster) ? model.roster : [];
        this.orderSequence = this.orders.map(order => Number(order.id));
        this.actualMonthSummary = this.buildActualMonthSummary(timeEntries, employees);
        this.schedule = {
            queue: model.queue,
            days: model.days,
            dailyCapacity: model.dailyCapacity,
            workerSlots: model.workerSlots || model.roster || [],
            hoursPerDay: model.workerSlots?.length
                ? Math.max(...model.workerSlots.map(slot => Number(slot.dailyHours || 0)).filter(hours => hours > 0))
                : this.SHIFT_HOURS,
        };
        this.buildOrderVisualMap(model.queue || []);
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
        const employeeAssignments = {};
        const orderColorSlots = {};
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
        Object.entries(raw.employee_assignments || {}).forEach(([orderId, value]) => {
            if (!Array.isArray(value)) return;
            const normalized = Array.from(new Set(
                value
                    .map(employeeId => String(employeeId ?? '').trim())
                    .filter(Boolean)
            )).slice(0, this.TEAM_SIZE);
            if (normalized.length > 0) employeeAssignments[String(orderId)] = normalized;
        });
        Object.entries(raw.order_color_slots || {}).forEach(([orderId, value]) => {
            const normalized = Math.floor(Number(value));
            if (Number.isInteger(normalized) && normalized >= 0) {
                orderColorSlots[String(orderId)] = normalized;
            }
        });
        const activeWorkersCountRaw = Number(raw.active_workers_count);
        return {
            order_ids: Array.isArray(raw.order_ids) ? raw.order_ids : [],
            manual_start_dates: manualStartDates,
            active_workers_count: activeWorkersCountRaw > 0 ? round2(activeWorkersCountRaw) : null,
            parallel_workers: parallelWorkers,
            roster_employee_ids: Array.isArray(raw.roster_employee_ids)
                ? Array.from(new Set(raw.roster_employee_ids.map(id => String(id ?? '').trim()).filter(Boolean))).slice(0, this.TEAM_SIZE)
                : [],
            employee_assignments: employeeAssignments,
            order_color_slots: orderColorSlots,
        };
    },

    getEffectivePlanningSettings(baseSettings = App.settings || {}) {
        const namedSlots = (this.roster || []).map(slot => ({
            employeeId: slot.employeeId,
            employeeName: slot.employeeName,
            dailyHours: Number(slot.dailyHours || this.SHIFT_HOURS),
        }));
        return {
            ...(baseSettings || {}),
            planning_workers_count: namedSlots.length || this.TEAM_SIZE,
            planning_hours_per_day: this.SHIFT_HOURS,
            planning_worker_slots: namedSlots,
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

    getRosterCandidates() {
        return (this.employees || [])
            .filter(employee => (
                employee?.is_active !== false
                && employee?.is_active !== 0
                && employee?.is_active !== 'false'
                && !employee?.fired_date
            ))
            .sort((left, right) => {
                const leftProduction = String(left.role || '').trim().toLowerCase() === 'production' ? 0 : 1;
                const rightProduction = String(right.role || '').trim().toLowerCase() === 'production' ? 0 : 1;
                return leftProduction - rightProduction
                    || String(left.name || '').localeCompare(String(right.name || ''), 'ru');
            });
    },

    getOrderAssignedEmployeeIds(orderId) {
        const stored = this.planState?.employee_assignments?.[String(Number(orderId) || '')];
        return Array.isArray(stored) ? stored.map(id => String(id)) : [];
    },

    async setOrderEmployeeAssignment(orderId, employeeIds = []) {
        const normalizedOrderId = String(Number(orderId) || '');
        if (!normalizedOrderId) return;
        const rosterIds = new Set((this.roster || []).map(slot => String(slot.employeeId)));
        const normalized = Array.from(new Set(
            (employeeIds || []).map(id => String(id)).filter(id => rosterIds.has(id))
        )).slice(0, this.TEAM_SIZE);
        const state = this.normalizePlanState(this.planState);
        if (normalized.length > 0) {
            state.employee_assignments[normalizedOrderId] = normalized;
            state.parallel_workers[normalizedOrderId] = normalized.length;
        } else {
            delete state.employee_assignments[normalizedOrderId];
        }
        await saveProductionPlanState(state);
        this.planState = state;
        await this.load();
    },

    async toggleOrderEmployee(orderId, employeeId) {
        const current = this.getOrderAssignedEmployeeIds(orderId);
        const normalizedEmployeeId = String(employeeId);
        const next = current.includes(normalizedEmployeeId)
            ? current.filter(id => id !== normalizedEmployeeId)
            : [...current, normalizedEmployeeId];
        await this.setOrderEmployeeAssignment(orderId, next);
    },

    async setOrderAutoAssignment(orderId) {
        await this.setOrderEmployeeAssignment(orderId, []);
    },

    async toggleRosterEmployee(employeeId) {
        const normalizedEmployeeId = String(employeeId);
        const candidateIds = new Set(this.getRosterCandidates().map(employee => String(employee.id)));
        if (!candidateIds.has(normalizedEmployeeId)) return;
        const current = (this.planState?.roster_employee_ids || []).length > 0
            ? this.planState.roster_employee_ids.map(id => String(id))
            : (this.roster || []).map(slot => String(slot.employeeId));
        let next;
        if (current.includes(normalizedEmployeeId)) {
            if (current.length <= 1) {
                App.toast('В составе должен остаться хотя бы один сотрудник');
                return;
            }
            next = current.filter(id => id !== normalizedEmployeeId);
        } else {
            if (current.length >= this.TEAM_SIZE) {
                App.toast(`В календаре максимум ${this.TEAM_SIZE} сотрудника`);
                return;
            }
            next = [...current, normalizedEmployeeId];
        }
        const state = this.normalizePlanState(this.planState);
        state.roster_employee_ids = next;
        await saveProductionPlanState(state);
        this.planState = state;
        await this.load();
    },

    toggleQueueEditor(force) {
        const wasOpen = this.queueEditorOpen;
        this.queueEditorOpen = typeof force === 'boolean' ? force : !this.queueEditorOpen;
        this.render();
        if (this.queueEditorOpen) {
            requestAnimationFrame(() => {
                document.querySelector('.gantt-queue-drawer-close')?.focus();
            });
        } else if (wasOpen) {
            requestAnimationFrame(() => {
                document.querySelector('.gantt-queue-edit-button')?.focus();
            });
        }
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
        document.querySelectorAll('.gantt-priority-card.drag-over, .gantt-queue-chip.drag-over')
            .forEach(node => node.classList.remove('drag-over'));
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

    clampPriorityPanelWidth(width) {
        const normalized = Number(width);
        const fallback = this.PRIORITY_PANEL_DEFAULT_WIDTH;
        return Math.round(Math.max(
            this.PRIORITY_PANEL_MIN_WIDTH,
            Math.min(this.PRIORITY_PANEL_MAX_WIDTH, Number.isFinite(normalized) ? normalized : fallback)
        ));
    },

    getPriorityPanelWidth() {
        if (this.priorityPanelWidth !== null && Number.isFinite(Number(this.priorityPanelWidth))) {
            return this.clampPriorityPanelWidth(this.priorityPanelWidth);
        }
        let storedWidth = null;
        try {
            storedWidth = typeof localStorage !== 'undefined'
                ? Number(localStorage.getItem(this.PRIORITY_PANEL_STORAGE_KEY))
                : null;
        } catch (error) {
            storedWidth = null;
        }
        this.priorityPanelWidth = storedWidth > 0
            ? this.clampPriorityPanelWidth(storedWidth)
            : this.PRIORITY_PANEL_DEFAULT_WIDTH;
        return this.priorityPanelWidth;
    },

    setPriorityPanelWidth(width, persist = false) {
        const normalized = this.clampPriorityPanelWidth(width);
        this.priorityPanelWidth = normalized;
        const planner = document.querySelector('.gantt-planner');
        planner?.style.setProperty('--gantt-priority-width', `${normalized}px`);
        const resizer = planner?.querySelector('.gantt-panel-resizer');
        resizer?.setAttribute('aria-valuenow', String(normalized));
        if (persist) {
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem(this.PRIORITY_PANEL_STORAGE_KEY, String(normalized));
                }
            } catch (error) {
                console.warn('Gantt panel width save error:', error);
            }
        }
        return normalized;
    },

    startPriorityPanelResize(event) {
        if (!event || (Number.isFinite(event.button) && event.button !== 0)) return;
        const planner = event.currentTarget?.closest('.gantt-planner');
        const panel = planner?.querySelector('.gantt-priority-panel');
        if (!planner || !panel || window.matchMedia('(max-width: 768px)').matches) return;

        this.finishPriorityPanelResize(false);
        event.preventDefault();
        const resizer = event.currentTarget;
        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startWidth = panel.getBoundingClientRect().width;

        const onMove = moveEvent => {
            if (Number.isFinite(pointerId) && moveEvent.pointerId !== pointerId) return;
            moveEvent.preventDefault();
            this.setPriorityPanelWidth(startWidth + moveEvent.clientX - startX);
        };
        const onFinish = finishEvent => {
            if (Number.isFinite(pointerId) && finishEvent.pointerId !== pointerId) return;
            this.finishPriorityPanelResize(true);
        };

        this._priorityPanelResize = { planner, resizer, pointerId, onMove, onFinish };
        planner.classList.add('is-resizing');
        document.body.classList.add('gantt-resizing');
        resizer.setAttribute('aria-grabbed', 'true');
        try {
            resizer.setPointerCapture?.(pointerId);
        } catch (error) {
            // Window listeners below still keep resizing reliable.
        }
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onFinish);
        window.addEventListener('pointercancel', onFinish);
    },

    finishPriorityPanelResize(persist = true) {
        const resize = this._priorityPanelResize;
        if (!resize) return;
        window.removeEventListener('pointermove', resize.onMove);
        window.removeEventListener('pointerup', resize.onFinish);
        window.removeEventListener('pointercancel', resize.onFinish);
        resize.planner?.classList.remove('is-resizing');
        resize.resizer?.setAttribute('aria-grabbed', 'false');
        document.body.classList.remove('gantt-resizing');
        try {
            if (resize.resizer?.hasPointerCapture?.(resize.pointerId)) {
                resize.resizer.releasePointerCapture(resize.pointerId);
            }
        } catch (error) {
            // Pointer capture may already be released by the browser.
        }
        this._priorityPanelResize = null;
        if (persist) this.setPriorityPanelWidth(this.priorityPanelWidth, true);
    },

    resizePriorityPanelByKey(event) {
        if (!event) return;
        const step = event.shiftKey ? 40 : 16;
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            this.setPriorityPanelWidth(this.getPriorityPanelWidth() - step, true);
        } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            this.setPriorityPanelWidth(this.getPriorityPanelWidth() + step, true);
        } else if (event.key === 'Home' || event.key === 'Enter') {
            event.preventDefault();
            this.resetPriorityPanelWidth();
        }
    },

    resetPriorityPanelWidth() {
        this.setPriorityPanelWidth(this.PRIORITY_PANEL_DEFAULT_WIDTH, true);
    },

    scrollToToday(smooth = true) {
        const timeline = document.getElementById('gantt-timeline');
        const todayLine = timeline?.querySelector('.gantt-today-line');
        if (!timeline || !todayLine) {
            App.toast('Сегодня вне текущего горизонта плана');
            return;
        }
        const todayLeft = Number.parseFloat(todayLine.style.left || '0') || 0;
        timeline.scrollTo({
            left: Math.max(0, todayLeft - timeline.clientWidth / 3),
            behavior: smooth ? 'smooth' : 'auto',
        });
    },

    highlightOrder(orderId) {
        const root = document.getElementById('gantt-container');
        const planner = document.querySelector('.gantt-planner');
        const normalizedId = Number(orderId);
        if (!root || !planner || !Number.isFinite(normalizedId)) return;
        planner.classList.add('order-focus');
        root.querySelectorAll('[data-order-id]').forEach(node => {
            node.classList.toggle('order-focused', Number(node.dataset.orderId) === normalizedId);
        });
    },

    clearOrderHighlight() {
        const root = document.getElementById('gantt-container');
        const planner = document.querySelector('.gantt-planner');
        if (!root || !planner) return;
        planner.classList.remove('order-focus');
        root.querySelectorAll('.order-focused').forEach(node => node.classList.remove('order-focused'));
    },

    getDisplayWorkerSlots() {
        const named = Array.isArray(this.schedule?.workerSlots) ? this.schedule.workerSlots : [];
        if (named.length > 0) return named.slice(0, this.TEAM_SIZE);
        return Array.from({ length: this.TEAM_SIZE }, (_, index) => ({
            employeeId: `slot-${index + 1}`,
            employeeName: `Сотрудник ${index + 1}`,
            dailyHours: this.SHIFT_HOURS,
        }));
    },

    getPersonInitials(name) {
        const parts = String(name || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (!parts.length) return '?';
        return parts.slice(0, 2).map(part => part[0]).join('').toUpperCase();
    },

    getWorkerTodaySummary(workerSlot, queue = []) {
        const today = this.formatIsoDateLocal(new Date());
        const entries = [];
        (queue || []).forEach(item => {
            (item.schedule || []).forEach(segment => {
                if (segment.date !== today || Number(segment.workerSlot) !== Number(workerSlot)) return;
                const phase = this.PHASE_VISUALS[segment.phase] || {
                    label: segment.phase || 'Работа',
                };
                entries.push({
                    orderId: Number(item.orderId || item.id),
                    orderName: item.orderName || item.order_name || 'Без названия',
                    phase: segment.phase,
                    phaseLabel: phase.label,
                    hours: Number(segment.hours || 0),
                    plannedUnits: segment.plannedUnits != null && Number.isFinite(Number(segment.plannedUnits))
                        ? Number(segment.plannedUnits)
                        : null,
                    needsNorm: segment.needsNorm === true,
                    startHour: Number(segment.startHour || 0),
                });
            });
        });
        entries.sort((left, right) => left.startHour - right.startHour);
        const totalHours = round2(entries.reduce((sum, entry) => sum + entry.hours, 0));
        const plannedUnits = entries.every(entry => entry.plannedUnits != null)
            ? entries.reduce((sum, entry) => sum + Number(entry.plannedUnits || 0), 0)
            : null;
        return {
            entries,
            totalHours,
            plannedUnits,
            needsNorm: entries.some(entry => entry.needsNorm),
        };
    },

    renderQueueRail(queue = []) {
        const chips = (queue || []).map((item, index) => {
            const orderId = Number(item.orderId || item.id);
            const visual = this.getOrderVisual(orderId);
            const assignedIds = this.getOrderAssignedEmployeeIds(orderId);
            const assignedNames = assignedIds
                .map(id => (this.roster || []).find(slot => String(slot.employeeId) === String(id))?.employeeName)
                .filter(Boolean);
            const assignment = item.production_assignment_needs_review === true
                ? 'Переназначить'
                : (assignedNames.length > 0
                    ? assignedNames.map(name => this.getPersonInitials(name)).join('·')
                    : `Авто ${Math.max(1, Number(item.parallelWorkersTarget || 1))}`);
            const window = this.getOrderScheduleWindow(item);
            const title = [
                `#${index + 1} ${item.orderName || 'Без названия'}`,
                `Команда: ${assignedNames.join(', ') || assignment}`,
                `Старт ${this.formatScheduleDate(window.startDate, true, window.startHour)}`,
                `Готово ${this.formatScheduleDate(window.finishDate)}`,
            ].join(' · ');
            return `
                <button class="gantt-queue-chip" data-order-id="${orderId}" draggable="true"
                    style="--project-color:${visual.color};--project-tint:${visual.tint}"
                    title="${this.esc(title)}"
                    onclick="Gantt.toggleQueueEditor(true)"
                    ondragstart="Gantt.onOrderDragStart(event, ${orderId})"
                    ondragover="Gantt.onOrderDragOver(event)"
                    ondragleave="Gantt.onOrderDragLeave(event)"
                    ondragend="Gantt.onOrderDragEnd(event)"
                    ondrop="Gantt.onOrderDrop(event, ${orderId})"
                    onmouseenter="Gantt.highlightOrder(${orderId})"
                    onmouseleave="Gantt.clearOrderHighlight()">
                    <strong>${index + 1}</strong>
                    <span>${this.esc(item.orderName || 'Без названия')}</span>
                    <em>${this.esc(assignment)}</em>
                </button>`;
        }).join('');
        return `
            <section class="gantt-queue-rail" aria-label="Очередь заказов">
                <div class="gantt-queue-rail-title">
                    <strong>Очередь</strong>
                    <span>слева выполняются раньше</span>
                </div>
                <div class="gantt-queue-chips">${chips}</div>
                <button class="btn btn-sm btn-outline gantt-queue-edit-button" onclick="Gantt.toggleQueueEditor(true)">
                    Настроить очередь
                </button>
            </section>`;
    },

    renderRosterPicker() {
        const selected = new Set((this.roster || []).map(slot => String(slot.employeeId)));
        const candidates = this.getRosterCandidates();
        if (!candidates.length) {
            return '<p class="gantt-roster-empty">В «Часах» пока нет активных сотрудников.</p>';
        }
        return `
            <div class="gantt-roster-picker">
                ${candidates.map(employee => {
                    const employeeId = String(employee.id);
                    const isSelected = selected.has(employeeId);
                    return `
                        <button class="gantt-roster-chip ${isSelected ? 'active' : ''}"
                            onclick="Gantt.toggleRosterEmployee('${this.esc(employeeId)}')"
                            title="${isSelected ? 'Убрать из текущей команды' : 'Добавить в текущую команду'}">
                            <span>${this.esc(this.getPersonInitials(employee.name))}</span>
                            ${this.esc(employee.name || 'Без имени')}
                            <em>${this.formatHours(employee.daily_hours || this.SHIFT_HOURS)}</em>
                        </button>`;
                }).join('')}
            </div>`;
    },

    renderQueueDrawer(priorityCards, immediateOrderCount, waitingOrderCount) {
        if (!this.queueEditorOpen) return '';
        return `
            <div class="gantt-queue-drawer-backdrop" role="presentation" tabindex="-1"
                onclick="if (event.target === this) Gantt.toggleQueueEditor(false)"
                onkeydown="if (event.key === 'Escape') Gantt.toggleQueueEditor(false)">
                <aside class="gantt-queue-drawer" role="dialog" aria-modal="true" aria-label="Настроить очередь заказов">
                    <div class="gantt-queue-drawer-header">
                        <div>
                            <strong>Очередь заказов</strong>
                            <span>${immediateOrderCount} уже запущены · ${waitingOrderCount} дальше</span>
                        </div>
                        <button class="gantt-queue-drawer-close" onclick="Gantt.toggleQueueEditor(false)" aria-label="Закрыть очередь">&times;</button>
                    </div>
                    <section class="gantt-roster-section">
                        <div>
                            <strong>Команда календаря</strong>
                            <span>Выберите до ${this.TEAM_SIZE} активных сотрудников из «Часов» — независимо от роли</span>
                        </div>
                        ${this.renderRosterPicker()}
                    </section>
                    <div class="gantt-priority-list">${priorityCards}</div>
                </aside>
            </div>`;
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
        const priorityQueue = queue.filter(item => !item.done || item.schedule.length > 0);
        const pausedHtml = this.renderPausedOrders(blockedQueue, reviewQueue);

        if (!days.length || !priorityQueue.length) {
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
        const dayLoadByDate = new Map((days || []).map(day => [day.date, Number(day.totalUsed || 0)]));
        const headerHtml = this.renderTimeAxis(
            minDate,
            totalDays,
            cellWidth,
            holidaySet,
            dayLoadByDate,
            Number(this.schedule.dailyCapacity || 0)
        );
        const waitingTailIndex = priorityQueue.findIndex((item, index) => (
            this.isOrderWaitingForStart(item)
            && priorityQueue.slice(index).every(candidate => this.isOrderWaitingForStart(candidate))
        ));
        const immediateOrderCount = priorityQueue.filter(item => !this.isOrderWaitingForStart(item)).length;
        const waitingOrderCount = Math.max(priorityQueue.length - immediateOrderCount, 0);
        const priorityCards = priorityQueue.map((item, index) => `
            ${index === waitingTailIndex ? `
                <div class="gantt-waiting-divider">
                    <strong>Следующие уже запланированы</strong>
                    <span>Начнут на первых освободившихся линиях</span>
                </div>` : ''}
            ${this.renderPriorityCard(item, index, holidaySet)}
        `).join('');
        const capacity = this.getEffectivePlanningCapacity();
        const hoursPerDay = Number(this.schedule?.hoursPerDay || capacity.hoursPerDay || this.SHIFT_HOURS);
        const deadlineHtml = this.renderDeadlineStrip(priorityQueue, minDate, totalDays, cellWidth);
        const workerSlots = this.getDisplayWorkerSlots();
        const workerRows = workerSlots.map(
            (_, index) => this.renderWorkerLane(index + 1, priorityQueue, minDate, totalDays, cellWidth, hoursPerDay, holidaySet)
        ).join('');
        const teamBrackets = this.renderTeamBrackets(
            priorityQueue,
            minDate,
            totalDays,
            cellWidth,
            hoursPerDay
        );
        const workerLabels = workerSlots.map((slot, index) => {
            const summary = this.getWorkerTodaySummary(index + 1, priorityQueue);
            const first = summary.entries[0];
            const capacityHours = Number(slot.dailyHours || this.SHIFT_HOURS);
            const unitsLabel = summary.plannedUnits != null
                ? ` · ${summary.plannedUnits.toLocaleString('ru-RU')} шт.`
                : (summary.needsNorm && summary.entries.length ? ' · нужна норма' : '');
            const taskLabel = first
                ? `${first.phaseLabel} · ${first.orderName}${summary.entries.length > 1 ? ` · ещё ${summary.entries.length - 1}` : ''}`
                : 'Сегодня свободен';
            const title = summary.entries.length
                ? summary.entries.map(entry => `${entry.phaseLabel} · ${entry.orderName} · ${this.formatHours(entry.hours)}${entry.plannedUnits != null ? ` · ${entry.plannedUnits} шт.` : ''}`).join('\n')
                : 'На сегодня работа не запланирована';
            return `
                <div class="gantt-resource-label" title="${this.esc(title)}">
                    <strong>${this.esc(this.getPersonInitials(slot.employeeName))}</strong>
                    <span class="gantt-resource-person">${this.esc(slot.employeeName || `Сотрудник ${index + 1}`)}</span>
                    <span class="gantt-resource-hours">${this.formatHours(summary.totalHours)} из ${this.formatHours(capacityHours)}${unitsLabel}</span>
                    <span class="gantt-resource-task">${this.esc(taskLabel)}</span>
                </div>`;
        }).join('');

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayOffset = this.daysBetween(minDate, today);
        const todayLeft = todayOffset * cellWidth;
        const showToday = todayOffset >= 0 && todayOffset < totalDays;
        const queueRail = this.renderQueueRail(priorityQueue);
        const queueDrawer = this.renderQueueDrawer(priorityCards, immediateOrderCount, waitingOrderCount);

        container.innerHTML = `
            ${queueRail}
            <div class="gantt-planner">
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
                                ${teamBrackets}
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            ${queueDrawer}
            ${pausedHtml}`;

        if (showToday) this.scrollToToday(false);
    },

    getOrderScheduleWindow(item) {
        const schedule = Array.isArray(item?.schedule)
            ? item.schedule.filter(segment => segment?.date)
            : [];
        if (!schedule.length) {
            return { startDate: null, startHour: null, finishDate: null, finishHour: null };
        }
        const normalized = schedule.map(segment => ({
            ...segment,
            startHour: Number.isFinite(Number(segment.startHour)) ? Number(segment.startHour) : 0,
            endHour: Number.isFinite(Number(segment.endHour))
                ? Number(segment.endHour)
                : Number(segment.startHour || 0) + Number(segment.hours || 0),
        }));
        const starts = [...normalized].sort((left, right) => (
            String(left.date).localeCompare(String(right.date))
            || left.startHour - right.startHour
        ));
        const finishes = [...normalized].sort((left, right) => (
            String(left.date).localeCompare(String(right.date))
            || left.endHour - right.endHour
        ));
        const first = starts[0];
        const last = finishes[finishes.length - 1];
        return {
            startDate: first.date,
            startHour: first.startHour,
            finishDate: last.date,
            finishHour: last.endHour,
        };
    },

    isOrderWaitingForStart(item) {
        if (!item) return false;
        const { startDate, startHour } = this.getOrderScheduleWindow(item);
        if (!startDate) return !item.done;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const plannedStart = this.parseLocalDate(startDate);
        plannedStart.setHours(0, 0, 0, 0);
        return plannedStart > today
            || (plannedStart.getTime() === today.getTime() && Number(startHour || 0) > 0.001);
    },

    formatScheduleDate(dateStr, todayLabel = false, startHour = 0) {
        if (!dateStr) return 'за горизонтом';
        if (todayLabel) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const date = this.parseLocalDate(dateStr);
            date.setHours(0, 0, 0, 0);
            if (date.getTime() === today.getTime()) {
                return Number(startHour || 0) > 0.001
                    ? `сегодня +${this.formatHours(startHour)}`
                    : 'сегодня';
            }
        }
        return this.formatDateStr(dateStr);
    },

    getOrderVisualBySlot(slot) {
        const normalized = Math.max(0, Math.floor(Number(slot) || 0));
        if (normalized < this.PROJECT_PALETTE.length) return this.PROJECT_PALETTE[normalized];
        const hue = Math.round((normalized * 137.508 + 19) % 360);
        return {
            color: `hsl(${hue} 72% 36%)`,
            tint: `hsl(${hue} 88% 94%)`,
        };
    },

    buildOrderVisualMap(queue = []) {
        const state = this.normalizePlanState(this.planState);
        const slots = { ...(state.order_color_slots || {}) };
        const allReserved = new Set(
            Object.values(slots)
                .map(value => Math.floor(Number(value)))
                .filter(value => Number.isInteger(value) && value >= 0)
        );
        const activeSlots = new Set();
        const map = new Map();
        let changed = false;

        (queue || []).forEach(item => {
            const orderId = String(Number(item?.orderId || item?.id) || '');
            if (!orderId) return;
            let slot = Math.floor(Number(slots[orderId]));
            if (!Number.isInteger(slot) || slot < 0 || activeSlots.has(slot)) {
                slot = 0;
                while (allReserved.has(slot) || activeSlots.has(slot)) slot += 1;
                slots[orderId] = slot;
                allReserved.add(slot);
                changed = true;
            }
            activeSlots.add(slot);
            map.set(orderId, this.getOrderVisualBySlot(slot));
        });

        this.orderVisualMap = map;
        if (changed) {
            state.order_color_slots = slots;
            this.planState = state;
            this.queueVisualStateSave();
        }
        return map;
    },

    queueVisualStateSave() {
        if (this._visualSaveQueued || typeof saveProductionPlanState !== 'function') return;
        this._visualSaveQueued = true;
        Promise.resolve()
            .then(() => saveProductionPlanState(this.planState))
            .catch(error => console.warn('Gantt color state save error:', error))
            .finally(() => {
                this._visualSaveQueued = false;
            });
    },

    getOrderVisual(orderId) {
        const key = String(Number(orderId) || '');
        if (this.orderVisualMap?.has(key)) return this.orderVisualMap.get(key);
        const stored = this.planState?.order_color_slots?.[key];
        if (Number.isInteger(Number(stored)) && Number(stored) >= 0) {
            return this.getOrderVisualBySlot(Number(stored));
        }
        const source = String(orderId ?? '');
        const hash = source.split('').reduce(
            (sum, character) => ((sum * 31) + character.charCodeAt(0)) >>> 0,
            7
        );
        return this.getOrderVisualBySlot(hash);
    },

    getOrderTeamSummary(item) {
        const groups = new Map();
        (item?.schedule || []).forEach(segment => {
            const workerSlot = Math.round(Number(segment.workerSlot));
            if (!(workerSlot >= 1 && workerSlot <= this.TEAM_SIZE) || !segment?.date) return;
            const startHour = Number.isFinite(Number(segment.startHour))
                ? round2(Number(segment.startHour))
                : 0;
            const endHour = Number.isFinite(Number(segment.endHour))
                ? round2(Number(segment.endHour))
                : round2(startHour + Number(segment.hours || 0));
            const key = `${segment.date}:${startHour}:${segment.phase || ''}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    date: segment.date,
                    startHour,
                    endHour,
                    phase: segment.phase || '',
                    workerSlots: [],
                });
            }
            const group = groups.get(key);
            group.endHour = Math.max(group.endHour, endHour);
            if (!group.workerSlots.includes(workerSlot)) group.workerSlots.push(workerSlot);
        });
        const ranked = Array.from(groups.values())
            .map(group => ({
                ...group,
                workerSlots: group.workerSlots.sort((left, right) => left - right),
                teamSize: group.workerSlots.length,
            }))
            .sort((left, right) => (
                right.teamSize - left.teamSize
                || String(left.date).localeCompare(String(right.date))
                || left.startHour - right.startHour
            ));
        return ranked[0] || {
            date: null,
            startHour: 0,
            endHour: 0,
            phase: '',
            workerSlots: [],
            teamSize: 0,
        };
    },

    renderPriorityCard(item, index, holidaySet = new Set()) {
        const orderId = Number(item.orderId || item.id);
        const progress = this.getOrderProgress(item);
        const risk = this.getNextDeliveryRiskSummary(item) || this.getDeadlineRiskSummary(item, holidaySet);
        const scheduleWindow = this.getOrderScheduleWindow(item);
        const isWaiting = this.isOrderWaitingForStart(item);
        const queueStatus = scheduleWindow.startDate ? 'Дальше по плану' : 'Ждёт расчёта';
        const startLabel = this.formatScheduleDate(scheduleWindow.startDate, true, scheduleWindow.startHour);
        const finishLabel = this.formatScheduleDate(scheduleWindow.finishDate);
        const workerTarget = Math.max(
            1,
            Math.min(
                this.TEAM_SIZE,
                Number(item.parallelWorkersTarget || item.production_parallel_workers || this.getOrderParallelWorkers(orderId))
            )
        );
        const actualTeamSize = this.getOrderTeamSummary(item).teamSize;
        const workerLabel = actualTeamSize > 0 && actualTeamSize < workerTarget
            ? `${actualTeamSize}/${workerTarget} чел.`
            : `${workerTarget} чел.`;
        const assignedIds = this.getOrderAssignedEmployeeIds(orderId);
        const assignmentNeedsReview = item.production_assignment_needs_review === true;
        const roster = this.roster || [];
        const assignmentLabel = assignedIds.length > 0
            ? assignedIds
                .map(id => roster.find(slot => String(slot.employeeId) === String(id))?.employeeName)
                .filter(Boolean)
                .join(', ')
            : `Авто · ${workerLabel}`;
        const visual = this.getOrderVisual(orderId);
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
            isWaiting ? queueStatus : '',
            `Старт ${startLabel}`,
            `Готово ${finishLabel}`,
            `Исполнители: ${assignmentLabel || 'Нужно переназначить'}`,
            risk.label,
            deadlineLabel,
        ].filter(Boolean).join(' · ');

        return `
            <div class="gantt-priority-card ${riskClass} ${isWaiting ? 'waiting' : ''}" draggable="true" data-order-id="${orderId}" title="${this.esc(title)}"
                style="--project-color:${visual.color};--project-tint:${visual.tint}"
                ondragstart="Gantt.onOrderDragStart(event, ${orderId})"
                ondragover="Gantt.onOrderDragOver(event)"
                ondragleave="Gantt.onOrderDragLeave(event)"
                ondragend="Gantt.onOrderDragEnd(event)"
                ondrop="Gantt.onOrderDrop(event, ${orderId})"
                onmouseenter="Gantt.highlightOrder(${orderId})"
                onmouseleave="Gantt.clearOrderHighlight()"
                onfocusin="Gantt.highlightOrder(${orderId})"
                onfocusout="if (!this.contains(event.relatedTarget)) Gantt.clearOrderHighlight()">
                <span class="gantt-drag-handle" title="Перетащить заказ">&#8942;&#8942;</span>
                <span class="gantt-priority-index">${index + 1}</span>
                <div class="gantt-priority-main">
                    <div class="gantt-order-name" title="${this.esc(item.orderName)}"><span class="gantt-project-dot"></span>${this.esc(item.orderName || 'Без названия')}</div>
                    <div class="gantt-order-meta">${isWaiting ? queueStatus : `ост. ${this.formatHours(progress.remaining)}`} · ${deadlineLabel}</div>
                    <div class="gantt-order-window">
                        <span>Старт ${startLabel}</span>
                        <span>Готово ${finishLabel}</span>
                    </div>
                </div>
                <div class="gantt-priority-actions" onclick="event.stopPropagation()">
                    <div class="gantt-assignee-picker ${assignmentNeedsReview ? 'needs-review' : ''}">
                        <button class="gantt-assignee-auto ${assignedIds.length === 0 ? 'active' : ''}"
                            onclick="Gantt.setOrderAutoAssignment(${orderId})"
                            title="Автоматически выбрать первые свободные линии">Авто</button>
                        ${roster.map(slot => {
                            const employeeId = String(slot.employeeId);
                            const isAssigned = assignedIds.includes(employeeId);
                            return `
                                <button class="gantt-assignee-chip ${isAssigned ? 'active' : ''}"
                                    onclick="Gantt.toggleOrderEmployee(${orderId}, '${this.esc(employeeId)}')"
                                    title="${this.esc(slot.employeeName)}${isAssigned ? ' — назначен' : ' — назначить'}">
                                    ${this.esc(this.getPersonInitials(slot.employeeName))}
                                </button>`;
                        }).join('')}
                    </div>
                    <span class="gantt-assignee-label">${assignmentNeedsReview ? 'Нужно переназначить' : this.esc(assignmentLabel)}</span>
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
            const scheduleWindow = this.getOrderScheduleWindow(item);
            const teamSummary = this.getOrderTeamSummary(item);
            const visual = this.getOrderVisual(Number(item.orderId || item.id));
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
                    deadlineEnd: item.deadlineEnd || item.deadline_end || null,
                    parallelWorkersTarget: Math.max(1, Number(item.parallelWorkersTarget || 1)),
                    orderFinishDate: scheduleWindow.finishDate,
                    orderFinishHour: scheduleWindow.finishHour,
                    teamSize: teamSummary.teamSize,
                    teamWorkerSlots: teamSummary.workerSlots,
                    projectColor: visual.color,
                    projectTint: visual.tint,
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
            previous.plannedUnits = previous.plannedUnits != null && allocation.plannedUnits != null
                ? Number(previous.plannedUnits || 0) + Number(allocation.plannedUnits || 0)
                : null;
            previous.needsNorm = previous.needsNorm === true || allocation.needsNorm === true;
            return merged;
        }, []);
    },

    isNextWorkingDate(leftDate, rightDate, holidaySet = new Set()) {
        if (!leftDate || !rightDate || leftDate >= rightDate) return false;
        const cursor = this.parseLocalDate(leftDate);
        cursor.setHours(0, 0, 0, 0);
        do {
            cursor.setDate(cursor.getDate() + 1);
        } while (this.isNonWorkingDate(cursor, holidaySet));
        return this.formatIsoDateLocal(cursor) === rightDate;
    },

    getWorkerLaneOrderRuns(
        queue = [],
        workerSlot,
        hoursPerDay = this.SHIFT_HOURS,
        holidaySet = new Set()
    ) {
        const allocations = this.getWorkerLaneAllocations(queue, workerSlot, hoursPerDay);
        const runs = [];

        allocations.forEach(allocation => {
            const previousRun = runs[runs.length - 1];
            const previousSegment = previousRun?.segments?.[previousRun.segments.length - 1];
            const sameDayForward = previousSegment
                && previousSegment.date === allocation.date
                && Number(previousSegment.endHour || 0) <= Number(allocation.startHour || 0) + 0.001;
            const nextWorkingDay = previousSegment
                && this.isNextWorkingDate(previousSegment.date, allocation.date, holidaySet);
            const isSameOrderRun = previousRun
                && previousRun.orderId === allocation.orderId
                && (sameDayForward || nextWorkingDay);

            if (!isSameOrderRun) {
                runs.push({
                    orderId: allocation.orderId,
                    orderName: allocation.orderName,
                    priorityIndex: allocation.priorityIndex,
                    workerSlot: allocation.workerSlot,
                    deadlineEnd: allocation.deadlineEnd,
                    parallelWorkersTarget: allocation.parallelWorkersTarget,
                    orderFinishDate: allocation.orderFinishDate,
                    orderFinishHour: allocation.orderFinishHour,
                    teamSize: allocation.teamSize,
                    teamWorkerSlots: allocation.teamWorkerSlots,
                    projectColor: allocation.projectColor,
                    projectTint: allocation.projectTint,
                    segments: [allocation],
                });
                return;
            }
            previousRun.segments.push(allocation);
        });

        runs.forEach(run => {
            const first = run.segments[0];
            const last = run.segments[run.segments.length - 1];
            run.startDate = first.date;
            run.startHour = first.startHour;
            run.endDate = last.date;
            run.endHour = last.endHour;
            run.phaseRuns = run.segments.reduce((phaseRuns, segment) => {
                const previous = phaseRuns[phaseRuns.length - 1];
                const sameDayContinuation = previous
                    && previous.phase === segment.phase
                    && previous.endDate === segment.date
                    && Math.abs(Number(previous.endHour || 0) - Number(segment.startHour || 0)) < 0.001;
                const nextCalendarDay = previous
                    && previous.phase === segment.phase
                    && Number(previous.endHour || 0) >= Number(hoursPerDay || this.SHIFT_HOURS) - 0.001
                    && Number(segment.startHour || 0) <= 0.001
                    && this.daysBetween(
                        this.parseLocalDate(previous.endDate),
                        this.parseLocalDate(segment.date)
                    ) === 1;
                if (!sameDayContinuation && !nextCalendarDay) {
                    phaseRuns.push({
                        phase: segment.phase,
                        startDate: segment.date,
                        startHour: segment.startHour,
                        endDate: segment.date,
                        endHour: segment.endHour,
                        hours: Number(segment.hours || 0),
                        plannedUnits: segment.plannedUnits != null ? Number(segment.plannedUnits) : null,
                        needsNorm: segment.needsNorm === true,
                    });
                    return phaseRuns;
                }
                previous.endDate = segment.date;
                previous.endHour = segment.endHour;
                previous.hours = round2(Number(previous.hours || 0) + Number(segment.hours || 0));
                previous.plannedUnits = previous.plannedUnits != null && segment.plannedUnits != null
                    ? Number(previous.plannedUnits || 0) + Number(segment.plannedUnits || 0)
                    : null;
                previous.needsNorm = previous.needsNorm === true || segment.needsNorm === true;
                return phaseRuns;
            }, []);
        });
        return runs;
    },

    getTimelinePoint(date, hour, minDate, cellWidth, hoursPerDay) {
        const dayOffset = this.daysBetween(minDate, this.parseLocalDate(date));
        return (
            dayOffset * cellWidth
            + (Number(hour || 0) / Math.max(Number(hoursPerDay || this.SHIFT_HOURS), 0.01)) * cellWidth
        );
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
        const stackByDate = new Map();
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
                const stackIndex = Number(stackByDate.get(milestone.date) || 0);
                stackByDate.set(milestone.date, stackIndex + 1);
                const visual = this.getOrderVisual(Number(item.orderId || item.id));
                markers.push(`
                    <span class="gantt-deadline-chip ${riskClass}" data-order-id="${Number(item.orderId || item.id)}"
                        style="left:${(deadlineOffset + 0.96) * cellWidth}px;top:${3 + (stackIndex % 2) * 19}px;--project-color:${visual.color};--project-tint:${visual.tint}" title="${this.esc(title)}"
                        onmouseenter="Gantt.highlightOrder(${Number(item.orderId || item.id)})"
                        onmouseleave="Gantt.clearOrderHighlight()">
                        <span class="gantt-deadline-diamond" aria-hidden="true">&#9670;</span>
                        <strong>#${priorityIndex + 1}</strong>
                        <em>${this.esc(item.orderName || item.order_name || 'Без названия')}</em>
                    </span>`);
            });
        });
        return `${this.renderTimelineGrid(minDate, totalDays, cellWidth, this.getHolidaySet())}${markers.join('')}`;
    },

    renderWorkerLane(workerSlot, queue, minDate, totalDays, cellWidth, hoursPerDay, holidaySet = new Set()) {
        const runs = this.getWorkerLaneOrderRuns(queue, workerSlot, hoursPerDay, holidaySet);
        const barsHtml = runs.map(run => {
            const left = this.getTimelinePoint(run.startDate, run.startHour, minDate, cellWidth, hoursPerDay);
            const right = this.getTimelinePoint(run.endDate, run.endHour, minDate, cellWidth, hoursPerDay);
            const width = Math.max(3, right - left);
            const phaseGeometry = (run.phaseRuns || []).map((phaseRun, phaseIndex) => {
                const phaseLeft = this.getTimelinePoint(
                    phaseRun.startDate,
                    phaseRun.startHour,
                    minDate,
                    cellWidth,
                    hoursPerDay
                ) - left;
                const phaseRight = this.getTimelinePoint(
                    phaseRun.endDate,
                    phaseRun.endHour,
                    minDate,
                    cellWidth,
                    hoursPerDay
                ) - left;
                return {
                    ...phaseRun,
                    phaseIndex,
                    left: phaseLeft,
                    width: Math.max(2, phaseRight - phaseLeft),
                };
            });
            const widestPhaseByName = new Map();
            phaseGeometry.forEach(phaseRun => {
                const previous = widestPhaseByName.get(phaseRun.phase);
                if (!previous || phaseRun.width > previous.width) {
                    widestPhaseByName.set(phaseRun.phase, phaseRun);
                }
            });
            const phaseHtml = phaseGeometry.map(phaseRun => {
                const phaseVisual = this.PHASE_VISUALS[phaseRun.phase]
                    || { color: '#475569', background: '#e2e8f0', label: phaseRun.phase || 'Работа' };
                const showLabel = widestPhaseByName.get(phaseRun.phase)?.phaseIndex === phaseRun.phaseIndex
                    && phaseRun.width >= 34;
                const unitsLabel = phaseRun.plannedUnits != null
                    ? ` · ${Number(phaseRun.plannedUnits).toLocaleString('ru-RU')} шт.`
                    : (phaseRun.needsNorm ? ' · нужна норма' : '');
                const phaseTitle = `${phaseVisual.label} · ${this.formatHours(phaseRun.hours)}${unitsLabel}`;
                return `
                    <span class="gantt-run-phase ${showLabel ? 'has-label' : ''}"
                        style="left:${Number(phaseRun.left.toFixed(2))}px;width:${Number(phaseRun.width.toFixed(2))}px;--phase-color:${phaseVisual.color};--phase-bg:${phaseVisual.background}"
                        title="${this.esc(phaseTitle)}">
                        ${showLabel ? `<small>${this.esc(phaseVisual.label)}${phaseRun.plannedUnits != null && phaseRun.width >= 76 ? ` · ${Number(phaseRun.plannedUnits).toLocaleString('ru-RU')} шт.` : ''}</small>` : ''}
                    </span>`;
            }).join('');
            const teamWorkerSlots = Array.isArray(run.teamWorkerSlots) ? run.teamWorkerSlots : [];
            const memberIndex = teamWorkerSlots.indexOf(workerSlot);
            const memberLabel = run.teamSize > 1 && memberIndex >= 0
                ? `${memberIndex + 1}/${run.teamSize}`
                : '';
            const isOrderFinish = run.orderFinishDate === run.endDate
                && Math.abs(Number(run.orderFinishHour || 0) - Number(run.endHour || 0)) < 0.001;
            const phaseLabels = Array.from(new Set((run.phaseRuns || []).map(phaseRun => (
                this.PHASE_VISUALS[phaseRun.phase]?.label || phaseRun.phase || 'Работа'
            ))));
            const orderLabel = `#${run.priorityIndex + 1} ${run.orderName}`;
            const slot = this.getDisplayWorkerSlots()[workerSlot - 1];
            const employeeLabel = slot?.employeeName || `Сотрудник ${workerSlot}`;
            const runHours = round2((run.segments || []).reduce((sum, segment) => sum + Number(segment.hours || 0), 0));
            const runUnits = (run.segments || []).every(segment => segment.plannedUnits != null)
                ? (run.segments || []).reduce((sum, segment) => sum + Number(segment.plannedUnits || 0), 0)
                : null;
            const deadlineLabel = run.deadlineEnd
                ? `Дедлайн ${this.formatDateStr(run.deadlineEnd)}`
                : 'Без дедлайна';
            const title = [
                employeeLabel,
                orderLabel,
                memberLabel ? `${memberIndex + 1}-й из ${run.teamSize} человек` : '',
                phaseLabels.join(' → '),
                `${this.formatHours(runHours)}${runUnits != null ? ` · план ${runUnits.toLocaleString('ru-RU')} шт.` : ''}`,
                `${this.formatDateStr(run.startDate)} — ${this.formatDateStr(run.endDate)}`,
                isOrderFinish ? `Готово ${this.formatDateStr(run.endDate)}` : '',
                deadlineLabel,
            ].filter(Boolean).join(' · ');
            return `
                <button type="button" class="gantt-order-run ${width < 82 ? 'compact' : ''}" data-order-id="${run.orderId}"
                    style="left:${Number(left.toFixed(2))}px;width:${Number(width.toFixed(2))}px;--project-color:${run.projectColor};--project-tint:${run.projectTint}"
                    onclick="App.navigate('order-detail', true, ${run.orderId})" title="${this.esc(title)}"
                    onmouseenter="Gantt.highlightOrder(${run.orderId})"
                    onmouseleave="Gantt.clearOrderHighlight()"
                    onfocus="Gantt.highlightOrder(${run.orderId})"
                    onblur="Gantt.clearOrderHighlight()">
                    ${phaseHtml}
                    <span class="gantt-run-start" aria-hidden="true"></span>
                    <span class="gantt-run-title">
                        <strong>#${run.priorityIndex + 1}</strong>
                        <em>${this.esc(run.orderName)}</em>
                    </span>
                    ${memberLabel ? `<span class="gantt-run-member">${memberLabel}</span>` : ''}
                    ${isOrderFinish ? `<span class="gantt-run-finish">Готово ${this.formatDateStr(run.endDate)}</span>` : ''}
                </button>`;
        }).join('');

        return `
            <div class="gantt-worker-lane" data-worker-slot="${workerSlot}">
                ${this.renderTimelineGrid(minDate, totalDays, cellWidth, holidaySet)}
                ${barsHtml}
            </div>`;
    },

    renderTeamBrackets(queue, minDate, totalDays, cellWidth, hoursPerDay) {
        return (queue || []).map((item, priorityIndex) => {
            const summary = this.getOrderTeamSummary(item);
            if (summary.teamSize <= 1 || !summary.date) return '';
            const left = this.getTimelinePoint(
                summary.date,
                summary.startHour,
                minDate,
                cellWidth,
                hoursPerDay
            );
            if (left < 0 || left > totalDays * cellWidth) return '';
            const firstWorker = Math.min(...summary.workerSlots);
            const lastWorker = Math.max(...summary.workerSlots);
            const top = this.DEADLINE_STRIP_HEIGHT
                + (firstWorker - 1) * this.WORKER_LANE_HEIGHT
                + 10;
            const height = (lastWorker - firstWorker) * this.WORKER_LANE_HEIGHT + 64;
            const visual = this.getOrderVisual(Number(item.orderId || item.id));
            return `
                <div class="gantt-team-bracket" data-order-id="${Number(item.orderId || item.id)}"
                    style="left:${Number(left.toFixed(2))}px;top:${top}px;height:${height}px;--project-color:${visual.color};--project-tint:${visual.tint}"
                    title="#${priorityIndex + 1} ${this.esc(item.orderName || item.order_name || 'Без названия')} · ${summary.teamSize} чел.">
                    <span>${summary.teamSize} чел.</span>
                </div>`;
        }).join('');
    },

    renderTimeAxis(
        minDate,
        totalDays,
        cellWidth,
        holidaySet = new Set(),
        dayLoadByDate = new Map(),
        dailyCapacity = 0
    ) {
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
            const dateStr = this.formatIsoDateLocal(date);
            const usedHours = Number(dayLoadByDate.get(dateStr) || 0);
            const loadRatio = dailyCapacity > 0 ? Math.min(usedHours / dailyCapacity, 1) : 0;
            const loadClass = loadRatio >= 0.95 ? 'full' : (loadRatio >= 0.65 ? 'active' : 'light');
            const loadTitle = usedHours > 0 && dailyCapacity > 0
                ? `Занято ${this.formatHours(usedHours)} из ${this.formatHours(dailyCapacity)}`
                : 'Нет запланированной работы';
            html += `
                <div class="gantt-header-cell ${isNonWorking ? 'gantt-weekend' : ''} ${isMonthBreak ? 'gantt-month-break' : ''}"
                    style="left:${index * cellWidth}px;width:${cellWidth}px" title="${this.esc(loadTitle)}">
                    <span class="gantt-header-primary">${primary}</span>
                    <span class="gantt-header-secondary">${secondary}</span>
                    ${tertiary ? `<span class="gantt-header-tertiary">${tertiary}</span>` : ''}
                    ${!isNonWorking ? `<span class="gantt-day-load ${loadClass}"><span style="width:${loadRatio * 100}%"></span></span>` : ''}
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

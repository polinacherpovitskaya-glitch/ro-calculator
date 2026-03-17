// =============================================
// Recycle Object — Production Calendar
// v50: canonical week/month production calendar with queue + capacity
// =============================================

const Gantt = {
    orders: [],
    blockedOrders: [],
    reviewOrders: [],
    schedule: null,
    orderSequence: [],
    actualMonthSummary: { actualHours: 0, employeeCount: 0 },
    planState: { order_ids: [], manual_start_dates: {} },
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
            const [allOrders, planState, allChinaPurchases, timeEntries, employees] = await Promise.all([
                loadOrders({}),
                loadProductionPlanState().catch(() => ({ order_ids: [] })),
                loadChinaPurchases({}).catch(() => []),
                loadTimeEntries().catch(() => []),
                loadEmployees().catch(() => []),
            ]);

            this.planState = this.normalizePlanState(planState);
            const priorityIds = Array.isArray(this.planState.order_ids)
                ? this.planState.order_ids.map(x => Number(x)).filter(Number.isFinite)
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
            const chinaPurchasesByOrderId = new Map();
            (allChinaPurchases || []).forEach(purchase => {
                const key = Number(purchase.order_id);
                if (!Number.isFinite(key) || key <= 0) return;
                if (!chinaPurchasesByOrderId.has(key)) chinaPurchasesByOrderId.set(key, []);
                chinaPurchasesByOrderId.get(key).push(purchase);
            });

            const orderActuals = this.buildOrderActuals(timeEntries, employees, orderedOrders);
            this.orders = orderedOrders.map(order => {
                const actuals = orderActuals.get(Number(order.id)) || this.getEmptyOrderActuals();
                const plannedMolding = round2(order.production_hours_plastic || 0);
                const plannedAssembly = round2(order.production_hours_hardware || 0);
                const plannedPackaging = round2(order.production_hours_packaging || 0);
                const plannedTotal = round2(plannedMolding + plannedAssembly + plannedPackaging);
                const remainingTotal = round2(
                    Math.max(plannedMolding - actuals.molding, 0)
                    + Math.max(plannedAssembly - actuals.assembly, 0)
                    + Math.max(plannedPackaging - actuals.packaging, 0)
                );
                const actualTotalForPlan = round2(actuals.molding + actuals.assembly + actuals.packaging);
                const progressPercent = plannedTotal > 0
                    ? round2(Math.min((actualTotalForPlan / plannedTotal) * 100, 999))
                    : 0;

                return {
                    ...order,
                    production_not_before: this.planState.manual_start_dates[String(order.id)] || '',
                    actual_hours_molding: actuals.molding,
                    actual_hours_assembly: actuals.assembly,
                    actual_hours_packaging: actuals.packaging,
                    actual_hours_other: actuals.other,
                    actual_hours_total: actuals.total,
                    actual_hours_employee_count: actuals.employeeCount,
                    actual_hours_entry_count: actuals.entryCount,
                    actual_hours_resolved_by_name: actuals.resolvedByNameCount,
                    planned_hours_total: plannedTotal,
                    remaining_hours_total: remainingTotal,
                    progress_percent: progressPercent,
                    ...this.getOrderReadiness(
                        order,
                        itemsByOrderId.get(Number(order.id)) || [],
                        chinaPurchasesByOrderId.get(Number(order.id)) || []
                    ),
                };
            });
            this.blockedOrders = this.orders.filter(order => order.production_ready_state === 'blocked');
            this.reviewOrders = this.orders.filter(order => order.production_ready_state === 'needs_review');
            this.orderSequence = this.orders.map(order => Number(order.id));
            this.actualMonthSummary = this.buildActualMonthSummary(timeEntries, employees);
            this.schedule = buildProductionSchedule(
                this.orders.filter(order => order.production_ready_state === 'ready'),
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

    getEmptyOrderActuals() {
        return {
            molding: 0,
            assembly: 0,
            packaging: 0,
            other: 0,
            total: 0,
            employeeCount: 0,
            entryCount: 0,
            resolvedByNameCount: 0,
        };
    },

    buildOrderActuals(entries = [], employees = [], orders = []) {
        const buckets = new Map();
        const indexedOrders = (orders || [])
            .map(order => ({
                id: Number(order.id),
                nameKey: this.normalizePersonName(order.order_name || ''),
                tokens: this.tokenizeSearchText(order.order_name || ''),
            }))
            .filter(order => Number.isFinite(order.id) && order.id > 0);

        indexedOrders.forEach(order => {
            buckets.set(order.id, { ...this.getEmptyOrderActuals(), _employees: new Set() });
        });

        (entries || []).forEach(entry => {
            const employee = this.findProductionEmployeeForEntry(entry, employees);
            if (!employee) return;
            const resolved = this.resolveEntryOrder(entry, indexedOrders);
            if (!resolved) return;
            const bucket = buckets.get(resolved.id);
            if (!bucket) return;
            const hours = round2(parseFloat(entry?.hours) || 0);
            if (hours <= 0) return;
            const phase = this.getTimeEntryPhase(entry);
            if (phase === 'molding') bucket.molding = round2(bucket.molding + hours);
            else if (phase === 'assembly') bucket.assembly = round2(bucket.assembly + hours);
            else if (phase === 'packaging') bucket.packaging = round2(bucket.packaging + hours);
            else bucket.other = round2(bucket.other + hours);
            bucket.total = round2(bucket.total + hours);
            bucket.entryCount += 1;
            bucket._employees.add(String(employee.id || employee.name || entry.worker_name || ''));
            if (resolved.source === 'name') bucket.resolvedByNameCount += 1;
        });

        buckets.forEach(bucket => {
            bucket.employeeCount = bucket._employees.size;
            delete bucket._employees;
        });

        return buckets;
    },

    resolveEntryOrder(entry, indexedOrders = []) {
        if (!entry) return null;
        const directOrderId = Number(entry.order_id);
        if (Number.isFinite(directOrderId) && directOrderId > 0) {
            const exact = indexedOrders.find(order => order.id === directOrderId);
            if (exact) return { id: exact.id, source: 'order_id' };
        }

        const projectKey = this.normalizePersonName(entry.project_name || entry.project || '');
        if (!projectKey) return null;

        const exactMatches = indexedOrders.filter(order => order.nameKey === projectKey);
        if (exactMatches.length === 1) return { id: exactMatches[0].id, source: 'name' };

        const containsMatches = indexedOrders.filter(order =>
            order.nameKey && (order.nameKey.includes(projectKey) || projectKey.includes(order.nameKey))
        );
        if (containsMatches.length === 1) return { id: containsMatches[0].id, source: 'name' };

        const tokens = this.tokenizeSearchText(projectKey);
        if (!tokens.length) return null;
        const tokenMatches = indexedOrders.filter(order =>
            tokens.every(token => order.tokens.includes(token) || order.nameKey.includes(token))
        );
        return tokenMatches.length === 1 ? { id: tokenMatches[0].id, source: 'name' } : null;
    },

    tokenizeSearchText(value) {
        return this.normalizePersonName(value)
            .split(' ')
            .map(token => token.trim())
            .filter(token => token.length >= 2);
    },

    getTimeEntryPhase(entry) {
        if (!entry) return 'other';
        const description = String(entry.task_description || entry.description || '');
        const metaMatch = description.match(/^\[meta\](\{.*?\})\[\/meta\]/);
        if (metaMatch) {
            try {
                const parsed = JSON.parse(metaMatch[1]);
                const phase = this.mapStageToProductionPhase(parsed?.stage || parsed?.stage_key || '');
                if (phase !== 'other') return phase;
            } catch (e) {
                // ignore invalid meta payloads
            }
        }
        const stage = this.mapStageToProductionPhase(entry.stage || '');
        if (stage !== 'other') return stage;
        const stageLine = description.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
        return this.mapStageToProductionPhase(stageLine ? stageLine[1] : '');
    },

    mapStageToProductionPhase(stage) {
        const value = this.normalizePersonName(stage);
        if (!value) return 'other';
        if (value.includes('casting') || value.includes('trim') || value.includes('вылив') || value.includes('срез') || value.includes('литник') || value.includes('лейник')) {
            return 'molding';
        }
        if (value.includes('assembly') || value.includes('сбор')) return 'assembly';
        if (value.includes('packaging') || value.includes('упаков')) return 'packaging';
        return 'other';
    },

    normalizePlanState(state) {
        const raw = state && typeof state === 'object' ? state : {};
        const manualStartDates = {};
        Object.entries(raw.manual_start_dates || {}).forEach(([orderId, value]) => {
            const normalized = String(value || '').trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
                manualStartDates[String(orderId)] = normalized;
            }
        });
        return {
            order_ids: Array.isArray(raw.order_ids) ? raw.order_ids : [],
            manual_start_dates: manualStartDates,
        };
    },

    getOrderReadiness(order, items = [], chinaPurchases = []) {
        const productItems = (items || []).filter(item => String(item?.item_type || 'product') === 'product');
        const customMoldItems = productItems.filter(item => item && item.is_blank_mold === false);
        const blockedItems = customMoldItems.filter(item => !this.isTrueLike(item.base_mold_in_stock));
        if (blockedItems.length > 0) {
            const pendingChinaPurchases = (chinaPurchases || []).filter(purchase => !this.isChinaPurchaseReceived(purchase));
            if (pendingChinaPurchases.length > 0) {
                return {
                    production_ready_state: 'blocked',
                    production_blocked_reason: this.describeChinaBlocked(pendingChinaPurchases),
                    production_blocked_items: blockedItems.length,
                };
            }
            const receivedChinaPurchases = (chinaPurchases || []).filter(purchase => this.isChinaPurchaseReceived(purchase));
            if (receivedChinaPurchases.length > 0) {
                return {
                    production_ready_state: 'needs_review',
                    production_blocked_reason: this.describeReviewAfterChinaReceipt(receivedChinaPurchases),
                    production_blocked_items: blockedItems.length,
                };
            }
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

    isChinaPurchaseReceived(purchase) {
        return String(purchase?.status || '').trim().toLowerCase() === 'received';
    },

    describeChinaBlocked(purchases = []) {
        const names = Array.from(new Set((purchases || [])
            .map(purchase => String(purchase?.purchase_name || '').trim())
            .filter(Boolean)));
        if (names.length === 1) {
            return `Ждет Китай: ${names[0]}`;
        }
        if (names.length > 1) {
            return `Ждет Китай: ${names.length} закупки`;
        }
        return 'Ждет Китай / молд';
    },

    describeReviewAfterChinaReceipt(purchases = []) {
        const names = Array.from(new Set((purchases || [])
            .map(purchase => String(purchase?.purchase_name || '').trim())
            .filter(Boolean)));
        if (names.length === 1) {
            return `Проверьте молд: Китай уже принят (${names[0]})`;
        }
        return 'Проверьте молд: Китай уже принят';
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
        const reviewQueue = this.reviewOrders || [];
        if (!this.schedule || (this.schedule.queue.length === 0 && blockedQueue.length === 0 && reviewQueue.length === 0)) {
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
        this.renderQueue(activeQueue, blockedQueue, reviewQueue);

        if (!days.length || !activeQueue.length) {
            if (capContainer) capContainer.innerHTML = '';
            container.innerHTML = `
                <div class="card">
                    <p class="text-muted text-center">
                        ${(blockedQueue.length || reviewQueue.length)
                            ? 'Сейчас нет готовых к запуску заказов: активный план пуст, а ожидающие/требующие проверки заказы вынесены выше в отдельные блоки.'
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
            const progress = this.getOrderProgress(item);
            return `
                <div class="gantt-sidebar-row" title="${this.esc(item.orderName)}" onclick="App.navigate('order-detail', true, ${item.orderId})" style="cursor:pointer">
                    <div class="gantt-order-name">${statusDot} ${this.esc(this.shortName(item.orderName))}</div>
                    <div class="gantt-order-meta">${this.esc(item.clientName || 'Без клиента')} · осталось ${this.formatHours(progress.remaining)} · факт ${this.formatHours(progress.actual)}</div>
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

    renderQueue(queue, blockedQueue = [], reviewQueue = []) {
        const queueEl = document.getElementById('gantt-queue');
        if (!queueEl) return;
        if (!queue.length && !blockedQueue.length && !reviewQueue.length) {
            queueEl.innerHTML = '';
            return;
        }

        const totalHours = round2(queue.reduce((sum, item) => sum + (item.remainingTotalHours || item.totalHours || 0), 0));
        const actualHours = round2(queue.reduce((sum, item) => sum + (item.actualTotalHours || 0), 0));
        const riskCount = queue.filter(item => item.deadlineEnd && item.schedule[item.schedule.length - 1]?.date > item.deadlineEnd).length;
        const blockedCount = blockedQueue.length;
        const reviewCount = reviewQueue.length;
        const cardsHtml = queue.map(item => this.renderQueueCard(item)).join('');
        const blockedHtml = blockedQueue.map(item => this.renderQueueCard(item, { blocked: true })).join('');
        const reviewHtml = reviewQueue.map(item => this.renderQueueCard(item, { review: true })).join('');

        queueEl.innerHTML = `
            <div class="gantt-queue-card-wrap">
                <div class="gantt-queue-head">
                    <div>
                        <h3>Очередь к запуску</h3>
                        <p>Порядок сверху задает, что начальник производства запускает раньше. Фактические часы уменьшают остаток автоматически, так что календарь показывает то, что реально еще нужно сделать.</p>
                    </div>
                    <div class="gantt-queue-summary">
                        <strong>${queue.length}</strong> готово к плану · <strong>${this.formatHours(totalHours)}</strong> осталось · <strong>${this.formatHours(actualHours)}</strong> уже сдано${riskCount ? ` · <span class="text-red">${riskCount} с риском дедлайна</span>` : ''}${blockedCount ? ` · <span class="text-orange">${blockedCount} ждут молд/Китай</span>` : ''}${reviewCount ? ` · <span class="text-muted">${reviewCount} требуют проверки</span>` : ''}
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
                ${reviewCount ? `
                    <div class="gantt-queue-section gantt-queue-section-review">
                        <div class="gantt-queue-subhead">
                            <h4>Требуют проверки</h4>
                            <p>По этим заказам календарь видит конфликт в данных: Китай уже принят или связка неполная, но молд все еще не отмечен как доступный. Они не попадают в active timeline, пока их не проверят.</p>
                        </div>
                        <div class="gantt-queue-grid">
                            ${reviewHtml}
                        </div>
                    </div>` : ''}
            </div>`;
    },

    renderQueueCard(item, options = {}) {
        const blocked = !!options.blocked;
        const review = !!options.review;
        const paused = blocked || review;
        const startDate = paused ? null : (item.schedule[0]?.date || null);
        const finishDate = paused ? null : (item.schedule[item.schedule.length - 1]?.date || null);
        const deadlineRisk = !paused && item.deadlineEnd && finishDate && finishDate > item.deadlineEnd;
        const deadlineLabel = item.deadlineEnd ? this.formatDateStr(item.deadlineEnd) : 'без дедлайна';
        const phasePills = [
            { label: 'Литьё', key: 'molding', color: '#f59e0b' },
            { label: 'Сборка', key: 'assembly', color: '#06b6d4' },
            { label: 'Упаковка', key: 'packaging', color: '#8b5cf6' },
        ].map(phase => {
            const summary = this.getPhaseProgress(item, phase.key);
            if (summary.planned <= 0 && summary.actual <= 0) return '';
            return `<span class="gantt-queue-phase-pill" style="--phase-color:${phase.color}">${phase.label}: ${this.formatHours(summary.actual)} / ${this.formatHours(summary.planned)}</span>`;
        }).filter(Boolean).join('');
        const manualStart = item.notBeforeDate || item.production_not_before || '';
        const progress = this.getOrderProgress(item);
        const progressLabel = progress.overrun > 0
            ? `Факт ${this.formatHours(progress.actual)} из ${this.formatHours(progress.planned)} · перерасход +${this.formatHours(progress.overrun)}`
            : `Факт ${this.formatHours(progress.actual)} из ${this.formatHours(progress.planned)} · осталось ${this.formatHours(progress.remaining)}`;

        return `
            <article class="gantt-queue-card ${deadlineRisk ? 'risk' : ''} ${blocked ? 'blocked' : ''} ${review ? 'review' : ''}" onclick="App.navigate('order-detail', true, ${item.orderId || item.id})">
                <div class="gantt-queue-card-top">
                    <div>
                        <div class="gantt-queue-title">${this.esc(item.orderName || item.order_name)}</div>
                        <div class="gantt-queue-meta">${this.esc(this.getStatusLabel(item.status))} · ${this.esc(item.clientName || item.client_name || 'Без клиента')} · осталось ${this.formatHours(progress.remaining)}</div>
                    </div>
                    <div class="gantt-queue-controls">
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Gantt.promptManualStart(${item.orderId || item.id})" title="${manualStart ? 'Изменить дату «не раньше»' : 'Задать дату «не раньше»'}">&#128197;</button>
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Gantt.moveUp(${item.orderId || item.id})" title="Поднять в очереди">&#8593;</button>
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation(); Gantt.moveDown(${item.orderId || item.id})" title="Опустить в очереди">&#8595;</button>
                    </div>
                </div>
                <div class="gantt-queue-dates">
                    <strong>${paused ? 'Старт:' : 'План:'}</strong> ${paused ? 'ждет готовности' : this.formatDateRange(startDate, finishDate)}
                    <span> · </span>
                    <strong>Дедлайн:</strong> ${deadlineLabel}
                    ${manualStart ? `<span> · </span><strong>Не раньше:</strong> ${this.formatDateStr(manualStart)}` : ''}
                </div>
                <div class="gantt-queue-progress">${progressLabel}${item.actual_hours_employee_count ? ` · ${item.actual_hours_employee_count} сотр.` : ''}</div>
                <div class="gantt-queue-phases">${phasePills || '<span class="text-muted">Нет производственных часов</span>'}</div>
                <div class="gantt-queue-footer">
                    <span class="gantt-queue-badge ${blocked ? 'blocked' : review ? 'review' : (deadlineRisk ? 'risk' : 'ok')}">${blocked || review ? this.esc(item.production_blocked_reason || (review ? 'Требует проверки' : 'Ждет молд')) : (deadlineRisk ? 'Риск дедлайна' : 'Вмещается в план')}</span>
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
        const reviewCount = (this.reviewOrders || []).length;
        const today = new Date().toISOString().slice(0, 10);
        const nextWorkDays = days.filter(day => day.date >= today).slice(0, 5);
        const weekUsed = round2(nextWorkDays.reduce((sum, day) => sum + day.totalUsed, 0));
        const weekCapacity = round2(dailyCapacity * 5);
        const freeHours = round2(weekCapacity - weekUsed);
        const overloadDays = days.filter(day => day.totalUsed > dailyCapacity).length;
        const riskyOrders = queue.filter(item => item.deadlineEnd && item.schedule[item.schedule.length - 1]?.date > item.deadlineEnd).length;
        const monthPrefix = this.getMonthPrefix(today);
        const plannedMonthHours = round2(days
            .filter(day => String(day.date || '').startsWith(monthPrefix))
            .reduce((sum, day) => sum + (day.totalUsed || 0), 0));
        const actualMonthHours = round2(this.actualMonthSummary?.actualHours || 0);
        const actualMonthEmployees = Number(this.actualMonthSummary?.employeeCount || 0);
        const activeActualHours = round2(queue.reduce((sum, item) => sum + (item.actualTotalHours || 0), 0));
        const activeRemainingHours = round2(queue.reduce((sum, item) => sum + (item.remainingTotalHours || item.totalHours || 0), 0));

        statsEl.innerHTML = `
            <div class="stat-card">
                <div class="stat-value">${totalOrders}${blockedCount ? ` <span style="font-size:12px;color:var(--orange)">+${blockedCount}</span>` : ''}${reviewCount ? ` <span style="font-size:12px;color:var(--text-muted)">+${reviewCount}</span>` : ''}</div>
                <div class="stat-label">${blockedCount || reviewCount ? 'В плане + ожидание/проверка' : 'Заказов в плане'}</div>
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
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.formatHours(plannedMonthHours)}</div>
                <div class="stat-label">План часов в этом месяце</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.formatHours(actualMonthHours)}</div>
                <div class="stat-label">Факт часов в этом месяце${actualMonthEmployees ? ` · ${actualMonthEmployees} сотр.` : ''}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">${this.formatHours(activeRemainingHours)}</div>
                <div class="stat-label">Осталось по активным заказам · факт ${this.formatHours(activeActualHours)}</div>
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

    getPhaseProgress(item, phaseName) {
        const phase = (item.phases || []).find(entry => entry.name === phaseName) || {};
        return {
            planned: round2(phase.total || 0),
            actual: round2(phase.actual || 0),
            remaining: round2(phase.remaining || 0),
        };
    },

    getOrderProgress(item) {
        const planned = round2(item.plannedTotalHours || this.getOrderTotalHours(item));
        const actual = round2(item.actualTotalHours || 0);
        const remaining = round2(item.remainingTotalHours != null ? item.remainingTotalHours : Math.max(planned - actual, 0));
        const overrun = round2(Math.max(actual - planned, 0));
        return { planned, actual, remaining, overrun };
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

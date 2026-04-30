// =============================================
// Recycle Object — Orders Home Page
// List-first view inspired by Notion Active
// =============================================

const STATUS_OPTIONS = [
    { value: 'draft',                label: 'Черновик' },
    { value: 'sample',               label: 'Заказ образца' },
    { value: 'production_casting',   label: 'Производство: Выливание' },
    { value: 'production_printing',  label: 'Производство: Печать' },
    { value: 'production_hardware',  label: 'Производство: Сборка' },
    { value: 'production_packaging', label: 'Производство: Упаковка' },
    { value: 'delivery',             label: 'Доставка' },
    { value: 'completed',            label: 'Готово' },
    { value: 'cancelled',            label: 'Отменён' },
    { value: 'deleted',              label: 'Удалён' },
];

const DRAFT_STATUSES = ['draft', 'calculated'];
const SAMPLE_STATUSES = ['sample'];
const PRODUCTION_STATUSES = ['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery'];
const ACTIVE_STATUSES = [...SAMPLE_STATUSES, ...PRODUCTION_STATUSES];
const SKY_STATUSES = [...DRAFT_STATUSES, ...ACTIVE_STATUSES, 'completed', 'cancelled'];

const ORDERS_MODE_HINTS = {
    active: 'Список по умолчанию для менеджеров: только Образцы и Production.',
    sample: 'Только заказы, которые находятся в статусе образца.',
    production: 'Только заказы, которые уже пошли в производство.',
    board: 'Доска по всем статусам: черновики, образцы, производство, готово и отменённые.',
    sky: 'Общий плоский список без лишних колонок: название, старт, дедлайн и текущий этап.',
    basket: 'Удалённые заказы. Здесь можно восстановить заказ или удалить его навсегда.',
};

const ORDERS_SECTIONS = {
    sample: {
        key: 'sample',
        label: 'Образцы',
        color: '#3b82f6',
        defaultOpen: true,
        statuses: SAMPLE_STATUSES,
    },
    production: {
        key: 'production',
        label: 'Production',
        color: '#f59e0b',
        defaultOpen: true,
        statuses: PRODUCTION_STATUSES,
    },
    basket: {
        key: 'basket',
        label: 'Корзина',
        color: '#9ca3af',
        defaultOpen: true,
        statuses: ['deleted'],
    },
};

const PRODUCTION_SUBSTAGES = {
    production_casting: 'Выливание формы',
    production_printing: 'Печать / нанесение',
    production_hardware: 'Сборка фурнитуры',
    production_packaging: 'Упаковка',
    in_production: 'В производстве',
};

const BOARD_COLUMNS = [
    { key: 'draft', label: 'Черновики', color: '#6b7280', icon: '○', statuses: DRAFT_STATUSES },
    { key: 'sample', label: 'Образцы', color: '#3b82f6', icon: '◎', statuses: SAMPLE_STATUSES },
    { key: 'production', label: 'Production', color: '#f59e0b', icon: '◐', statuses: PRODUCTION_STATUSES },
    { key: 'completed', label: 'Готово', color: '#22c55e', icon: '●', statuses: ['completed'] },
    { key: 'cancelled', label: 'Отменён', color: '#ef4444', icon: '✕', statuses: ['cancelled'] },
];

const CHINA_STATUS_META = {
    ordered:            { label: 'Заказано',         className: 'badge-orange' },
    in_china_warehouse: { label: 'В Китае',          className: 'badge-yellow' },
    in_transit:         { label: 'В пути',           className: 'badge-blue' },
    delivered:          { label: 'Доставлено',       className: 'badge-green' },
    received:           { label: 'Принято на склад', className: 'badge-green' },
};

const Orders = {
    allOrders: [],
    metaByOrderId: {},
    mode: 'active',
    collapsedSections: {},
    isLoading: false,
    isMetaLoading: false,
    _loadSeq: 0,

    hydrateFromCache() {
        if (typeof getLocal !== 'function' || typeof LOCAL_KEYS === 'undefined') return false;
        const cachedOrders = getLocal(LOCAL_KEYS.orders) || [];
        if (!Array.isArray(cachedOrders) || cachedOrders.length === 0) return false;
        this.allOrders = this.mode === 'basket'
            ? cachedOrders.filter(order => order.status === 'deleted')
            : cachedOrders.filter(order => order.status !== 'deleted');
        return this.allOrders.length > 0;
    },

    setMode(mode) {
        if (!mode) return;
        const reloadRequired = this.allOrders.length === 0 || this.mode === 'basket' || mode === 'basket';
        this.mode = mode;
        this.updateModeControls();
        if (reloadRequired) {
            this.loadList();
            return;
        }
        this.render();
    },

    updateModeControls() {
        document.querySelectorAll('.orders-view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.mode);
        });
        const hint = document.getElementById('orders-mode-hint');
        if (hint) hint.textContent = ORDERS_MODE_HINTS[this.mode] || ORDERS_MODE_HINTS.active;
    },

    async loadList() {
        const loadSeq = ++this._loadSeq;
        try {
            this.updateModeControls();
            const hydrated = this.hydrateFromCache();
            this.isLoading = !hydrated && this.allOrders.length === 0;
            this.isMetaLoading = hydrated && this.mode !== 'basket';
            this.render();
            const filters = this.mode === 'basket' ? { status: 'deleted' } : {};
            this.allOrders = await loadOrders(filters);
            if (this._loadSeq !== loadSeq) return;
            this.isLoading = false;
            if (this.mode === 'basket' || !this.allOrders.length) {
                this.metaByOrderId = {};
                this.isMetaLoading = false;
                this.render();
                return;
            }
            this.isMetaLoading = true;
            this.render();
            await this.buildMeta(this.allOrders);
            if (this._loadSeq !== loadSeq) return;
            this.isMetaLoading = false;
            this.render();
        } catch (e) {
            console.error('Orders load error:', e);
            this.isLoading = false;
            this.isMetaLoading = false;
            const container = document.getElementById('orders-table-view');
            if (container) {
                container.innerHTML = this.renderEmptyState('Не удалось загрузить заказы');
            }
        }
    },

    async buildMeta(orders) {
        if (this.mode === 'basket' || !orders.length) {
            this.metaByOrderId = {};
            return;
        }

        const orderIds = orders.map(order => order.id);
        const { projects, tasks, chinaPurchases, orderItems } = await this.loadMetaBundle(orderIds);

        const projectToOrder = new Map();
        (projects || []).forEach(project => {
            if (project && project.id != null && project.linked_order_id != null) {
                projectToOrder.set(String(project.id), String(project.linked_order_id));
            }
        });

        const tasksByOrder = new Map();
        (tasks || []).forEach(task => {
            if (!task) return;
            const orderId = task.order_id != null
                ? String(task.order_id)
                : projectToOrder.get(String(task.project_id || ''));
            if (!orderId) return;
            if (!tasksByOrder.has(orderId)) tasksByOrder.set(orderId, []);
            tasksByOrder.get(orderId).push(task);
        });

        const purchasesByOrder = new Map();
        (chinaPurchases || []).forEach(purchase => {
            if (!purchase || purchase.order_id == null) return;
            const key = String(purchase.order_id);
            if (!purchasesByOrder.has(key)) purchasesByOrder.set(key, []);
            purchasesByOrder.get(key).push(purchase);
        });

        const itemsByOrder = new Map();
        (orderItems || []).forEach(item => {
            if (!item || item.order_id == null) return;
            const key = String(item.order_id);
            if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
            itemsByOrder.get(key).push(item);
        });

        const nextMeta = {};
        orders.forEach(order => {
            nextMeta[order.id] = this.buildOrderMeta(
                order,
                itemsByOrder.get(String(order.id)) || [],
                purchasesByOrder.get(String(order.id)) || [],
                tasksByOrder.get(String(order.id)) || []
            );
        });
        this.metaByOrderId = nextMeta;
    },

    async loadMetaBundle(orderIds) {
        const ids = [...new Set((orderIds || [])
            .map(id => Number(id))
            .filter(id => Number.isFinite(id) && id > 0))];
        if (ids.length === 0) {
            return { projects: [], tasks: [], chinaPurchases: [], orderItems: [] };
        }

        if (typeof isSupabaseReady === 'function' && isSupabaseReady() && typeof supabaseClient !== 'undefined' && supabaseClient) {
            try {
                return await this.loadMetaBundleRemote(ids);
            } catch (e) {
                console.warn('Orders meta remote load fallback:', e);
            }
        }
        return this.loadMetaBundleLocal(ids);
    },

    async loadMetaBundleRemote(orderIds) {
        const idSet = new Set(orderIds.map(id => String(id)));
        const [projectsResp, directTasksResp, chinaResp, orderItems] = await Promise.all([
            supabaseClient
                .from('projects')
                .select('id,linked_order_id')
                .in('linked_order_id', orderIds),
            supabaseClient
                .from('tasks')
                .select('id,status,order_id,project_id')
                .in('order_id', orderIds),
            supabaseClient
                .from('china_purchases')
                .select('id,status,purchase_data,created_at,updated_at')
                .order('created_at', { ascending: false }),
            typeof loadOrderItemsByOrderIds === 'function'
                ? loadOrderItemsByOrderIds(orderIds).catch(() => [])
                : Promise.resolve([]),
        ]);

        if (projectsResp.error) throw projectsResp.error;
        if (directTasksResp.error) throw directTasksResp.error;
        if (chinaResp.error) throw chinaResp.error;

        const projects = (projectsResp.data || []).filter(project => idSet.has(String(project.linked_order_id)));
        const projectIds = projects.map(project => Number(project.id)).filter(id => Number.isFinite(id) && id > 0);

        let projectTasks = [];
        if (projectIds.length > 0) {
            const projectTasksResp = await supabaseClient
                .from('tasks')
                .select('id,status,order_id,project_id')
                .in('project_id', projectIds);
            if (projectTasksResp.error) throw projectTasksResp.error;
            projectTasks = projectTasksResp.data || [];
        }

        const tasksById = new Map();
        [...(directTasksResp.data || []), ...projectTasks].forEach(task => {
            if (!task || task.id == null) return;
            tasksById.set(String(task.id), task);
        });

        const chinaPurchases = (chinaResp.data || [])
            .map(row => {
                let parsed = {};
                if (row.purchase_data) {
                    try {
                        parsed = typeof row.purchase_data === 'string'
                            ? JSON.parse(row.purchase_data)
                            : row.purchase_data;
                    } catch (e) {
                        parsed = {};
                    }
                }
                return {
                    ...parsed,
                    id: row.id,
                    status: row.status || parsed.status,
                    created_at: row.created_at || parsed.created_at,
                    updated_at: row.updated_at || parsed.updated_at,
                };
            })
            .filter(purchase => idSet.has(String(purchase.order_id)));

        return {
            projects,
            tasks: Array.from(tasksById.values()),
            chinaPurchases,
            orderItems,
        };
    },

    async loadMetaBundleLocal(orderIds) {
        const idSet = new Set(orderIds.map(id => String(id)));
        const [projects, tasks, chinaPurchases, orderItems] = await Promise.all([
            typeof loadWorkProjects === 'function' ? loadWorkProjects().catch(() => []) : Promise.resolve([]),
            typeof loadWorkTasks === 'function' ? loadWorkTasks().catch(() => []) : Promise.resolve([]),
            typeof loadChinaPurchases === 'function' ? loadChinaPurchases({}).catch(() => []) : Promise.resolve([]),
            typeof loadOrderItemsByOrderIds === 'function' ? loadOrderItemsByOrderIds(orderIds).catch(() => []) : Promise.resolve([]),
        ]);

        const filteredProjects = (projects || []).filter(project => idSet.has(String(project.linked_order_id)));
        const projectIds = new Set(filteredProjects.map(project => String(project.id)));
        const filteredTasks = (tasks || []).filter(task =>
            idSet.has(String(task.order_id))
            || projectIds.has(String(task.project_id))
        );
        const filteredPurchases = (chinaPurchases || []).filter(purchase => idSet.has(String(purchase.order_id)));

        return {
            projects: filteredProjects,
            tasks: filteredTasks,
            chinaPurchases: filteredPurchases,
            orderItems,
        };
    },

    buildOrderMeta(order, items, purchases, tasks) {
        return {
            todo: this.buildTodoMeta(tasks),
            hardware: this.buildHardwareMeta(items),
            china: this.buildChinaMeta(purchases, items),
            production: this.buildProductionMeta(order),
            financial: this.buildFinancialMeta(order, items),
        };
    },

    buildFinancialMeta(order, items) {
        if (typeof getOrderLiveCalculatorSnapshot !== 'function') {
            return {
                revenue: Number(order?.total_revenue_plan || 0),
                marginPercent: Number(order?.margin_percent_plan || 0),
                hours: Number(order?.total_hours_plan || 0),
            };
        }
        try {
            const snapshot = getOrderLiveCalculatorSnapshot(order, items || []);
            return {
                revenue: Number(snapshot?.revenue || 0),
                marginPercent: Number(snapshot?.marginPercent || 0),
                hours: Number(snapshot?.hours || 0),
            };
        } catch (e) {
            console.warn('Orders.buildFinancialMeta fallback:', e);
            return {
                revenue: Number(order?.total_revenue_plan || 0),
                marginPercent: Number(order?.margin_percent_plan || 0),
                hours: Number(order?.total_hours_plan || 0),
            };
        }
    },

    buildTodoMeta(tasks) {
        const total = (tasks || []).length;
        const isFinished = task => (
            typeof WorkManagementCore !== 'undefined'
            && typeof WorkManagementCore.isTaskFinished === 'function'
            && WorkManagementCore.isTaskFinished(task)
        );
        const openTasks = (tasks || []).filter(task => !isFinished(task));
        const reviewCount = openTasks.filter(task => task.status === 'review').length;

        if (total === 0) {
            return { label: 'Empty 0', className: 'badge-gray', title: 'К заказу не привязаны задачи' };
        }
        if (openTasks.length === 0) {
            return { label: `Done ${total}/${total}`, className: 'badge-green', title: `Все ${total} задач закрыты` };
        }
        if (reviewCount > 0) {
            return {
                label: `Review ${reviewCount}/${total}`,
                className: 'badge-blue',
                title: `На согласовании: ${reviewCount}. Открыто всего: ${openTasks.length} из ${total}`,
            };
        }
        return {
            label: `To-do ${openTasks.length}/${total}`,
            className: 'badge-yellow',
            title: `Открытых задач: ${openTasks.length} из ${total}`,
        };
    },

    buildHardwareMeta(items) {
        const hardwareItems = (items || []).filter(item => item.item_type === 'hardware');
        const pendantAttachments = [];
        const productNfcAttachments = [];
        if (typeof getPendantAttachmentEntries === 'function') {
            (items || []).filter(item => item.item_type === 'pendant').forEach(pendant => {
                ['cord', 'carabiner'].forEach(type => {
                    getPendantAttachmentEntries(pendant, type).forEach(entry => {
                        pendantAttachments.push({
                            hardware_source: entry.source || 'warehouse',
                            source: entry.source || 'warehouse',
                            custom_country: entry.custom_country || 'china',
                        });
                    });
                });
            });
        }
        if (typeof getProductWarehouseDemandRows === 'function') {
            (items || []).forEach(item => {
                getProductWarehouseDemandRows(item).forEach(() => {
                    productNfcAttachments.push({
                        hardware_source: 'warehouse',
                        source: 'warehouse',
                        custom_country: 'warehouse',
                    });
                });
            });
        }
        const demandItems = [...hardwareItems, ...pendantAttachments, ...productNfcAttachments];
        if (demandItems.length === 0) {
            return {
                label: 'Фурнитура не нужна',
                className: 'badge-red',
                title: 'В заказе нет строк фурнитуры',
            };
        }

        const sourceKinds = new Set(demandItems.map(item => {
            const source = String(item.hardware_source || item.source || 'custom').toLowerCase();
            const country = String(item.custom_country || 'china').toLowerCase();
            if (source === 'warehouse') return 'warehouse';
            if (source === 'china' || (source === 'custom' && country === 'china')) return 'china';
            return 'custom';
        }));

        if (sourceKinds.size === 1 && sourceKinds.has('warehouse')) {
            return {
                label: 'Фурнитура из наличия',
                className: 'badge-yellow',
                title: 'Вся фурнитура берётся со склада',
            };
        }
        if (sourceKinds.size === 1 && sourceKinds.has('china')) {
            return {
                label: 'Фурнитура из Китая',
                className: 'badge-blue',
                title: 'Вся фурнитура идёт через Китай',
            };
        }
        if (sourceKinds.size === 1 && sourceKinds.has('custom')) {
            return {
                label: 'Фурнитура под заказ',
                className: 'badge-orange',
                title: 'Фурнитура кастомная или закупается отдельно',
            };
        }
        if (sourceKinds.has('warehouse')) {
            return {
                label: 'Частично из наличия',
                className: 'badge-blue',
                title: 'Часть фурнитуры со склада, часть под заказ',
            };
        }
        return {
            label: 'Смешанная фурнитура',
            className: 'badge-gray',
            title: 'В заказе несколько типов источников фурнитуры',
        };
    },

    buildChinaMeta(purchases, items) {
        const sortedPurchases = (purchases || []).slice().sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')));
        if (sortedPurchases.length > 0) {
            const latest = sortedPurchases[0];
            const meta = CHINA_STATUS_META[latest.status] || { label: 'Есть закупка', className: 'badge-blue' };
            return {
                label: `${meta.label}${sortedPurchases.length > 1 ? ` · ${sortedPurchases.length}` : ''}`,
                className: meta.className,
                title: `Связанных закупок: ${sortedPurchases.length}`,
            };
        }

        const hasChinaSource = (items || []).some(item => {
            const source = String(item.hardware_source || item.packaging_source || item.source || '').toLowerCase();
            const country = String(item.custom_country || 'china').toLowerCase();
            return source === 'china' || (source === 'custom' && country === 'china');
        });

        if (hasChinaSource) {
            return {
                label: 'Нужна закупка',
                className: 'badge-orange',
                title: 'В заказе есть позиции с China source, но закупка ещё не создана',
            };
        }

        return {
            label: '—',
            className: 'badge-gray',
            title: 'Закупка в Китае не требуется',
        };
    },

    buildProductionMeta(order) {
        return {
            label: App.statusLabel(order.status),
            className: this.statusClassName(order.status),
        };
    },

    statusClassName(status) {
        if (status === 'completed') return 'badge-green';
        if (status === 'cancelled' || status === 'deleted') return 'badge-red';
        if (status === 'sample') return 'badge-blue';
        if (PRODUCTION_STATUSES.includes(status)) return 'badge-yellow';
        return 'badge-gray';
    },

    getModeOrders() {
        if (this.mode === 'basket') {
            return this.allOrders.filter(order => order.status === 'deleted');
        }
        if (this.mode === 'sample') {
            return this.allOrders.filter(order => SAMPLE_STATUSES.includes(order.status));
        }
        if (this.mode === 'production') {
            return this.allOrders.filter(order => PRODUCTION_STATUSES.includes(order.status));
        }
        if (this.mode === 'board') {
            return this.allOrders.filter(order => order.status !== 'deleted');
        }
        if (this.mode === 'sky') {
            return this.allOrders.filter(order => SKY_STATUSES.includes(order.status));
        }
        return this.allOrders.filter(order => ACTIVE_STATUSES.includes(order.status));
    },

    getVisibleOrders() {
        const query = String(document.getElementById('orders-search')?.value || '').toLowerCase().trim();
        const list = this.getModeOrders().slice();
        const filtered = !query
            ? list
            : list.filter(order =>
                (order.order_name || '').toLowerCase().includes(query)
                || (order.client_name || '').toLowerCase().includes(query)
                || (order.manager_name || '').toLowerCase().includes(query)
            );

        const sortFn = this.mode === 'basket'
            ? (a, b) => String(b.deleted_at || b.updated_at || b.created_at || '').localeCompare(String(a.deleted_at || a.updated_at || a.created_at || ''))
            : (a, b) => this.compareOrders(a, b);

        return filtered.sort(sortFn);
    },

    compareOrders(a, b) {
        const aKey = this.orderSortKey(a);
        const bKey = this.orderSortKey(b);
        if (aKey !== bKey) return String(aKey).localeCompare(String(bKey));
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    },

    orderSortKey(order) {
        return order.deadline_end || order.deadline || order.deadline_start || order.created_at || '9999-12-31';
    },

    filterLocal() {
        this.render();
    },

    render() {
        this.updateModeControls();
        const container = document.getElementById('orders-table-view');
        const board = document.getElementById('orders-board-view');
        if (!container) return;

        if (this.isLoading && !this.allOrders.length) {
            container.style.display = '';
            if (board) board.style.display = 'none';
            container.innerHTML = this.renderEmptyState('Загружаем заказы…');
            return;
        }

        const visibleOrders = this.getVisibleOrders();
        if (this.mode === 'board') {
            container.style.display = 'none';
            if (board) board.style.display = '';
            this.renderBoard(visibleOrders);
            return;
        }

        if (board) board.style.display = 'none';
        container.style.display = '';
        if (this.mode === 'sky') {
            container.innerHTML = this.renderSkyView(visibleOrders);
            return;
        }
        if (this.mode === 'basket') {
            container.innerHTML = this.renderBasketView(visibleOrders);
            return;
        }
        container.innerHTML = this.renderManagerView(visibleOrders);
    },

    renderManagerView(orders) {
        const ordersLoadMeta = typeof getLastDataLoadMeta === 'function' ? getLastDataLoadMeta('orders') : null;
        if (orders.length === 0 && ordersLoadMeta?.unavailable) {
            return this.renderEmptyState('Не удалось загрузить заказы из базы. Попробуй обновить страницу чуть позже.');
        }
        if (orders.length === 0) {
            return this.renderEmptyState('Нет заказов в этом списке');
        }

        const sections = this.getSectionsForMode();
        const html = sections
            .map(section => this.renderSection(section, orders.filter(order => section.statuses.includes(order.status))))
            .filter(Boolean)
            .join('');

        return html || this.renderEmptyState('Нет заказов в этом списке');
    },

    renderSkyView(orders) {
        const ordersLoadMeta = typeof getLastDataLoadMeta === 'function' ? getLastDataLoadMeta('orders') : null;
        if (orders.length === 0 && ordersLoadMeta?.unavailable) {
            return this.renderEmptyState('Не удалось загрузить заказы из базы. Попробуй обновить страницу чуть позже.');
        }
        if (orders.length === 0) {
            return this.renderEmptyState('Нет заказов для списка Sky');
        }

        return `<div class="card" style="padding:0">
            <div class="table-wrap">
                <table class="orders-mini-table">
                    <thead>
                        <tr>
                            <th>Заказ</th>
                            <th>Старт</th>
                            <th>Дедлайн</th>
                            <th>Этап</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${orders.map(order => this.renderSkyRow(order)).join('')}</tbody>
                </table>
            </div>
        </div>`;
    },

    renderBasketView(orders) {
        if (orders.length === 0) {
            return this.renderEmptyState('Корзина пуста');
        }

        return `<div class="card" style="padding:0">
            <div class="table-wrap">
                <table class="orders-mini-table">
                    <thead>
                        <tr>
                            <th>Заказ</th>
                            <th>Когда удалён</th>
                            <th>Последний статус</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>${orders.map(order => this.renderBasketRow(order)).join('')}</tbody>
                </table>
            </div>
        </div>`;
    },

    renderSection(section, sectionOrders) {
        if (sectionOrders.length === 0) return '';

        if (this.collapsedSections[section.key] === undefined) {
            this.collapsedSections[section.key] = !section.defaultOpen;
        }

        const collapsed = this.collapsedSections[section.key];
        const totalRevenue = sectionOrders
            .filter(order => (order.client_name || '').toUpperCase() !== 'B2C')
            .reduce((sum, order) => sum + Number(this.metaByOrderId[order.id]?.financial?.revenue || order.total_revenue_plan || 0), 0);
        const b2cCount = sectionOrders.filter(order => (order.client_name || '').toUpperCase() === 'B2C').length;

        return `
            <div class="orders-section" style="margin-bottom:10px">
                <div class="orders-section-header" onclick="Orders.toggleSection('${section.key}')" style="cursor:pointer;display:flex;align-items:center;gap:10px;padding:10px 16px;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);${collapsed ? '' : 'border-bottom-left-radius:0;border-bottom-right-radius:0;'}">
                    <span id="orders-section-icon-${section.key}" style="font-size:12px;color:var(--text-muted);width:12px">${collapsed ? '▸' : '▾'}</span>
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${section.color}"></span>
                    <span style="font-weight:700;font-size:13px">${section.label}</span>
                    <span style="font-size:12px;color:var(--text-muted);font-weight:600">${sectionOrders.length}</span>
                    <span style="flex:1"></span>
                    ${b2cCount > 0 ? `<span style="font-size:10px;color:var(--text-muted);margin-right:6px;" title="B2C заказы (${b2cCount}) не учтены в сумме">B2C: ${b2cCount}</span>` : ''}
                    <span style="font-size:12px;color:var(--text-muted)">${this.shortRub(totalRevenue)}</span>
                </div>
                <div id="orders-section-body-${section.key}" style="${collapsed ? 'display:none' : ''}">
                    <div class="card" style="padding:0;border-top-left-radius:0;border-top-right-radius:0;border-top:0">
                        <div class="table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Заказ</th>
                                        <th>Дедлайн</th>
                                        <th>To-do RO</th>
                                        <th>Кто ведет</th>
                                        <th>Статус оплаты</th>
                                        <th>Статус фурнитуры</th>
                                        <th>Статус производства</th>
                                        <th>Китай</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>${sectionOrders.map(order => this.renderManagerRow(order)).join('')}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>`;
    },

    getSectionsForMode() {
        if (this.mode === 'sample') return [ORDERS_SECTIONS.sample];
        if (this.mode === 'production') return [ORDERS_SECTIONS.production];
        return [ORDERS_SECTIONS.sample, ORDERS_SECTIONS.production];
    },

    renderBoard(orders) {
        const container = document.getElementById('orders-board-view');
        if (!container) return;
        const ordersLoadMeta = typeof getLastDataLoadMeta === 'function' ? getLastDataLoadMeta('orders') : null;
        if (orders.length === 0 && ordersLoadMeta?.unavailable) {
            container.innerHTML = this.renderEmptyState('Не удалось загрузить заказы из базы. Попробуй обновить страницу чуть позже.');
            return;
        }

        container.innerHTML = BOARD_COLUMNS.map(column => {
            const columnOrders = orders.filter(order => column.statuses.includes(order.status));
            const totalRevenue = columnOrders
                .filter(order => (order.client_name || '').toUpperCase() !== 'B2C')
                .reduce((sum, order) => sum + Number(this.metaByOrderId[order.id]?.financial?.revenue || order.total_revenue_plan || 0), 0);
            const b2cCount = columnOrders.filter(order => (order.client_name || '').toUpperCase() === 'B2C').length;

            return `
            <div class="orders-board-col" data-status="${column.key}"
                 ondragover="Orders.onBoardDragOver(event)"
                 ondragleave="Orders.onBoardDragLeave(event)"
                 ondrop="Orders.onBoardDrop(event, '${column.key}')">
                <div class="orders-board-col-header" style="border-top:3px solid ${column.color}">
                    <span>${column.icon} ${column.label} <span style="font-weight:400;color:var(--text-muted)">(${columnOrders.length})</span></span>
                    <span style="font-size:11px;color:var(--text-muted)">${this.shortRub(totalRevenue)}${b2cCount > 0 ? ` <span title="B2C (${b2cCount}) не в сумме" style="font-size:9px;opacity:.6">−B2C</span>` : ''}</span>
                </div>
                <div class="orders-board-col-body">
                    ${columnOrders.length === 0
                        ? '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0">Нет заказов</div>'
                        : columnOrders.map(order => this.renderBoardCard(order)).join('')}
                </div>
            </div>`;
        }).join('');
    },

    renderBoardCard(order) {
        const payment = PAYMENT_STATUSES.find(item => item.key === (order.payment_status || 'not_sent')) || PAYMENT_STATUSES[0];
        const financial = this.metaByOrderId[order.id]?.financial || null;
        const margin = Number(financial?.marginPercent || order.margin_percent_plan || 0);
        const revenue = Number(financial?.revenue || order.total_revenue_plan || 0);

        let deadlineHtml = '';
        if (order.deadline_end || order.deadline_start || order.deadline) {
            const value = order.deadline_end || order.deadline_start || order.deadline;
            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
                const overdue = date < new Date() && order.status !== 'completed';
                deadlineHtml = `<span style="font-size:10px;${overdue ? 'color:var(--red);font-weight:600' : 'color:var(--text-muted)'}">
                    ${overdue ? '!' : ''}${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>`;
            }
        }

        const subStage = PRODUCTION_SUBSTAGES[order.status];
        const subStageBadge = subStage
            ? `<div style="font-size:10px;color:#f59e0b;font-weight:600;margin-bottom:4px;">◉ ${subStage}</div>`
            : '';

        const isB2C = (order.client_name || '').toUpperCase() === 'B2C';
        const b2cBadge = isB2C
            ? '<span style="display:inline-block;font-size:9px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,.1);padding:1px 5px;border-radius:4px;margin-left:4px;">B2C</span>'
            : '';

        return `
        <div class="order-board-card" draggable="true"
             ondragstart="Orders.onBoardDragStart(event, ${order.id})"
             onclick="App.navigate('order-detail', true, ${order.id})">
            <div class="order-board-card-title">${this.escHtml(order.order_name || 'Без названия')}${b2cBadge}</div>
            ${subStageBadge}
            <div class="order-board-card-client">${this.escHtml(order.client_name || '')} ${order.manager_name ? '/ ' + this.escHtml(order.manager_name) : ''}</div>
            <div class="order-board-card-footer">
                <span class="badge badge-${payment.color}" style="font-size:9px">${payment.label}</span>
                <span style="font-size:11px;font-weight:600;${margin >= 30 ? 'color:var(--green)' : 'color:var(--red)'}">${formatPercent(margin)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                <span style="font-size:11px;color:var(--text-muted)">${formatRub(revenue)}</span>
                ${deadlineHtml}
            </div>
        </div>`;
    },

    onBoardDragStart(event, orderId) {
        event.dataTransfer.setData('text/plain', orderId);
        event.currentTarget.classList.add('dragging');
    },

    onBoardDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    },

    onBoardDragLeave(event) {
        event.currentTarget.classList.remove('drag-over');
    },

    async onBoardDrop(event, newStatus) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');

        const orderId = parseInt(event.dataTransfer.getData('text/plain'), 10);
        const order = this.allOrders.find(item => item.id === orderId);
        if (!order) return;

        if (newStatus === 'production' && PRODUCTION_STATUSES.includes(order.status)) {
            return;
        }

        const actualStatus = newStatus === 'production' ? 'production_casting' : newStatus;
        if (order.status === actualStatus) return;

        const guard = await this._ensureStatusTransitionAllowed(orderId, actualStatus);
        if (!guard.ok) {
            this.render();
            return;
        }

        const oldStatus = order.status;
        const managerName = App.getCurrentEmployeeName();

        await updateOrderStatus(orderId, actualStatus);
        await this._syncWarehouseByStatus(orderId, oldStatus, actualStatus, order.order_name, managerName || 'Неизвестный');

        await this._syncReadyGoodsByStatus(orderId, order, oldStatus, actualStatus);

        order.status = actualStatus;

        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: App.statusLabel(oldStatus),
            new_value: App.statusLabel(actualStatus),
            manager: managerName || 'Неизвестный',
        });

        App.toast(`Статус: ${App.statusLabel(actualStatus)}`);
        this.render();
    },

    toggleSection(key) {
        this.collapsedSections[key] = !this.collapsedSections[key];
        const body = document.getElementById(`orders-section-body-${key}`);
        const icon = document.getElementById(`orders-section-icon-${key}`);
        if (body) body.style.display = this.collapsedSections[key] ? 'none' : '';
        if (icon) icon.textContent = this.collapsedSections[key] ? '▸' : '▾';
    },

    renderManagerRow(order) {
        const meta = this.metaByOrderId[order.id] || this.buildOrderMeta(order, [], [], []);

        return `
            <tr>
                <td>${this.renderOrderCell(order)}</td>
                <td>${this.renderDeadlineCell(order)}</td>
                <td>${this.renderBadge(meta.todo.label, meta.todo.className, meta.todo.title)}</td>
                <td>${this.renderManagerCell(order)}</td>
                <td>${this.renderPaymentBadge(order.payment_status || 'not_sent')}</td>
                <td>${this.renderBadge(meta.hardware.label, meta.hardware.className, meta.hardware.title)}</td>
                <td class="orders-status-cell">${this.renderStatusControl(order)}</td>
                <td>${this.renderBadge(meta.china.label, meta.china.className, meta.china.title)}</td>
                <td>${this.renderActionButtons(order)}</td>
            </tr>`;
    },

    renderSkyRow(order) {
        return `
            <tr>
                <td>${this.renderOrderCell(order)}</td>
                <td class="orders-mini-date">${this.formatOrderStart(order)}</td>
                <td class="orders-mini-date">${this.renderDeadlineCell(order)}</td>
                <td>${this.renderBadge(App.statusLabel(order.status), this.statusClassName(order.status))}</td>
                <td>${this.renderActionButtons(order, { compact: true })}</td>
            </tr>`;
    },

    renderBasketRow(order) {
        return `
            <tr style="opacity:.75">
                <td>${this.renderOrderCell(order)}</td>
                <td class="orders-mini-date">${App.formatDate(order.deleted_at || order.updated_at || order.created_at)}</td>
                <td>${this.renderBadge(App.statusLabel(order.status), 'badge-red')}</td>
                <td>${this.renderActionButtons(order, { compact: true })}</td>
            </tr>`;
    },

    renderOrderCell(order) {
        const client = this.escHtml(order.client_name || '—');
        const b2c = (order.client_name || '').toUpperCase() === 'B2C'
            ? this.renderBadge('B2C', 'badge-blue')
            : '';

        return `<div>
            <a href="#order-detail/${order.id}" class="orders-order-link" onclick="App.navigate('order-detail', true, ${order.id}); return false;" title="Открыть карточку заказа">${this.escHtml(order.order_name || 'Без названия')}</a>
            <div class="orders-order-meta">
                <span>${client}</span>
                ${b2c}
            </div>
        </div>`;
    },

    renderManagerCell(order) {
        const manager = this.escHtml(order.manager_name || '—');
        const start = this.formatOrderStart(order);
        return `<div>
            <div>${manager}</div>
            <div class="orders-cell-muted">Старт: ${start}</div>
        </div>`;
    },

    renderDeadlineCell(order) {
        const deadline = this.formatOrderDeadline(order);
        const overdue = this.isOverdue(order);
        if (deadline === '—') {
            return '<span class="orders-cell-muted">—</span>';
        }
        return `<span style="${overdue ? 'color:var(--red);font-weight:700;' : ''}">${deadline}</span>`;
    },

    renderBadge(label, className, title = '') {
        return `<span class="orders-inline-badge ${className || 'badge-gray'}" ${title ? `title="${this.escHtml(title)}"` : ''}>${this.escHtml(label || '—')}</span>`;
    },

    renderPaymentBadge(paymentStatus) {
        const payment = PAYMENT_STATUSES.find(item => item.key === paymentStatus) || PAYMENT_STATUSES[0];
        return this.renderBadge(payment.label, `badge-${payment.color}`);
    },

    renderStatusControl(order) {
        if (order.status === 'deleted') {
            return '<span class="orders-cell-muted">Удалён</span>';
        }

        return `<select class="inline-status-select status-${order.status}" onchange="Orders.onStatusChange(${order.id}, this.value, '${order.status}')" onclick="event.stopPropagation()">
            ${STATUS_OPTIONS.filter(option => option.value !== 'deleted').map(option =>
                `<option value="${option.value}" ${option.value === order.status ? 'selected' : ''}>${option.label}</option>`
            ).join('')}
        </select>`;
    },

    renderActionButtons(order, options = {}) {
        const compact = options.compact === true;

        if (order.status === 'deleted') {
            return `<div class="orders-actions">
                <button class="btn btn-sm btn-outline" onclick="Orders.restoreOrder(${order.id})" title="Восстановить" style="color:var(--green);border-color:var(--green);">&#8634;</button>
                <button class="btn btn-sm btn-danger" onclick="Orders.confirmPermanentDelete(${order.id})" title="Удалить навсегда">&#10005;</button>
            </div>`;
        }

        return `<div class="orders-actions">
            ${compact ? '' : `<button class="btn btn-sm btn-outline" onclick="Orders.cloneOrder(${order.id})" title="Копировать">&#10697;</button>`}
            <button class="btn btn-sm btn-outline" onclick="Orders.editOrder(${order.id})" title="Редактировать">&#9998;</button>
            <button class="btn btn-sm btn-danger" onclick="Orders.confirmDelete(${order.id})" title="Удалить">&#10005;</button>
        </div>`;
    },

    renderEmptyState(text) {
        return `<div class="card"><div class="empty-state">
            <div class="empty-icon">&#9776;</div>
            <p>${this.escHtml(text || 'Нет заказов')}</p>
        </div></div>`;
    },

    _formatCompletedStatusBlockMessage(summary) {
        if (!summary || summary.error) {
            return 'Нельзя перевести заказ в «Готово»: не удалось проверить, все ли позиции со склада отмечены как «собрано».';
        }
        return `Нельзя перевести заказ в «Готово»: не все позиции со склада отмечены как «собрано». Собрано ${summary.readyRows || 0} из ${summary.totalRows || 0}.`;
    },

    async _ensureStatusTransitionAllowed(orderId, newStatus, options = {}) {
        if (newStatus !== 'completed') {
            return { ok: true };
        }

        if (typeof Warehouse === 'undefined'
            || !Warehouse
            || typeof Warehouse.getOrderProjectHardwareCompletion !== 'function') {
            return { ok: true };
        }

        let summary = null;
        try {
            summary = await Warehouse.getOrderProjectHardwareCompletion(orderId, options.orderDetail || null);
        } catch (error) {
            console.error('Orders._ensureStatusTransitionAllowed failed:', error);
            summary = { error: 'exception', totalRows: 0, readyRows: 0, pendingRows: 0 };
        }

        if (summary && summary.canComplete) {
            return { ok: true, summary };
        }

        const message = this._formatCompletedStatusBlockMessage(summary);
        if (options.toast !== false && typeof App !== 'undefined' && App && typeof App.toast === 'function') {
            App.toast(message);
        }
        return {
            ok: false,
            reason: summary && summary.error ? 'project_hardware_check_failed' : 'project_hardware_incomplete',
            message,
            summary,
        };
    },

    formatOrderDeadline(order) {
        const start = order.deadline_start || '';
        const end = order.deadline_end || order.deadline || '';

        if (start && end && String(start) !== String(end)) {
            return `${App.formatDate(start)} → ${App.formatDate(end)}`;
        }
        if (end) return App.formatDate(end);
        if (start) return App.formatDate(start);
        return '—';
    },

    formatOrderStart(order) {
        return App.formatDate(order.deadline_start || order.created_at || '');
    },

    isOverdue(order) {
        const target = String(order.deadline_end || order.deadline || '').slice(0, 10);
        if (!target) return false;
        if (['completed', 'cancelled', 'deleted'].includes(order.status)) return false;
        return target < App.todayLocalYMD();
    },

    shortRub(amount) {
        if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 1000) return (amount / 1000).toFixed(0) + 'K';
        return amount.toFixed(0);
    },

    // ==========================================
    // STATUS CHANGE
    // ==========================================

    async onStatusChange(orderId, newStatus, oldStatus) {
        if (newStatus === oldStatus) return;

        const guard = await this._ensureStatusTransitionAllowed(orderId, newStatus);
        if (!guard.ok) {
            this.render();
            return;
        }

        const managerName = App.getCurrentEmployeeName();

        await updateOrderStatus(orderId, newStatus);
        const order = this.allOrders.find(item => item.id === orderId);
        await this._syncWarehouseByStatus(orderId, oldStatus, newStatus, order && order.order_name, managerName || 'Неизвестный');

        await this._syncReadyGoodsByStatus(orderId, order, oldStatus, newStatus);

        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: App.statusLabel(oldStatus),
            new_value: App.statusLabel(newStatus),
            manager: managerName || 'Неизвестный',
        });

        App.toast(`Статус: ${App.statusLabel(newStatus)}`);
        this.loadList();
    },

    _isConsumedStatus(status) {
        return ['production_casting', 'production_hardware', 'production_packaging', 'in_production', 'delivery', 'completed'].includes(status);
    },

    _collectWarehouseDemand(items, options) {
        const includeHardware = !options || options.hardware !== false;
        const includePackaging = !options || options.packaging !== false;
        const demand = new Map();
        const explicitHardwareIds = new Set();
        const add = (itemId, qty) => {
            if (!itemId || qty <= 0) return;
            demand.set(itemId, (demand.get(itemId) || 0) + qty);
        };

        (items || []).forEach(item => {
            const qty = parseFloat(
                item.quantity
                ?? item.hardware_qty
                ?? item.packaging_qty
                ?? item.qty
            ) || 0;
            if (qty <= 0) return;
            if (includeHardware && item.item_type === 'hardware' && item.hardware_source === 'warehouse' && item.hardware_warehouse_item_id) {
                explicitHardwareIds.add(Number(item.hardware_warehouse_item_id || 0));
            }
        });

        (items || []).forEach(item => {
            const qty = parseFloat(
                item.quantity
                ?? item.hardware_qty
                ?? item.packaging_qty
                ?? item.qty
            ) || 0;
            if (qty <= 0) return;
            if (includeHardware && item.item_type === 'hardware' && item.hardware_source === 'warehouse' && item.hardware_warehouse_item_id) {
                add(item.hardware_warehouse_item_id, qty);
            }
            if (includePackaging && item.item_type === 'packaging' && item.packaging_source === 'warehouse' && item.packaging_warehouse_item_id) {
                add(item.packaging_warehouse_item_id, qty);
            }
            if (includeHardware && item.item_type === 'pendant' && typeof getPendantWarehouseDemandRows === 'function') {
                getPendantWarehouseDemandRows(item).forEach(row => {
                    add(row.warehouse_item_id, parseFloat(row.qty) || 0);
                });
            }
            if (includeHardware && item.item_type === 'product' && typeof getProductWarehouseDemandRows === 'function') {
                getProductWarehouseDemandRows(item).forEach(row => {
                    if (explicitHardwareIds.has(Number(row.warehouse_item_id || 0))) return;
                    add(row.warehouse_item_id, parseFloat(row.qty) || 0);
                });
            }
        });
        return demand;
    },

    async _collectWarehouseReturnDemand(orderId, demand) {
        const history = typeof loadWarehouseHistory === 'function'
            ? await loadWarehouseHistory()
            : [];
        const seenItems = new Set();
        const netDeltaByItem = new Map();

        (history || []).forEach(entry => {
            if (Number(entry.order_id || 0) !== Number(orderId || 0)) return;
            const itemId = Number(entry.item_id || 0);
            if (!itemId) return;
            const note = String(entry.notes || '');
            const type = String(entry.type || '').toLowerCase();
            if (!/при смене статуса/i.test(note)) return;
            if (type !== 'deduction' && type !== 'addition') return;
            const delta = parseFloat(entry.qty_change || 0) || 0;
            if (!delta) return;
            seenItems.add(itemId);
            netDeltaByItem.set(itemId, (netDeltaByItem.get(itemId) || 0) + delta);
        });

        const returnDemand = new Map();
        demand.forEach((qty, itemId) => {
            const normalizedItemId = Number(itemId || 0);
            const normalizedQty = parseFloat(qty) || 0;
            if (!normalizedItemId || normalizedQty <= 0) return;
            if (!seenItems.has(normalizedItemId)) {
                returnDemand.set(normalizedItemId, normalizedQty);
                return;
            }
            const netDelta = parseFloat(netDeltaByItem.get(normalizedItemId) || 0) || 0;
            const consumedQty = Math.max(0, -netDelta);
            const returnQty = Math.min(normalizedQty, consumedQty);
            if (returnQty > 0) {
                returnDemand.set(normalizedItemId, returnQty);
            }
        });
        return returnDemand;
    },

    async _syncWarehouseByStatus(orderId, oldStatus, newStatus, orderName, managerName) {
        if (oldStatus === newStatus) return;
        const data = await loadOrder(orderId);
        if (!data) return;
        if (typeof Warehouse !== 'undefined' && Warehouse.syncProjectHardwareOrderState) {
            await Warehouse.syncProjectHardwareOrderState({
                orderId,
                orderName,
                managerName,
                status: newStatus,
                currentItems: data.items || [],
                previousItems: data.items || [],
            });
            return;
        }

        const demand = this._collectWarehouseDemand(data.items, { hardware: false, packaging: true });
        if (demand.size === 0) return;

        const wasConsumed = this._isConsumedStatus(oldStatus);
        const nowConsumed = this._isConsumedStatus(newStatus);
        const nowSample = newStatus === 'sample';

        const reservations = await loadWarehouseReservations();
        const nowIso = new Date().toISOString();
        reservations.forEach(reservation => {
            if (reservation.status === 'active' && reservation.source === 'order_calc' && reservation.order_id === orderId) {
                reservation.status = 'released';
                reservation.released_at = nowIso;
            }
        });
        await saveWarehouseReservations(reservations);

        if (wasConsumed && !nowConsumed) {
            const returnDemand = await this._collectWarehouseReturnDemand(orderId, demand);
            for (const [itemId, qty] of returnDemand.entries()) {
                await Warehouse.adjustStock(
                    itemId,
                    qty,
                    'addition',
                    orderName || 'Заказ',
                    `Возврат на склад при смене статуса: ${App.statusLabel(oldStatus)} → ${App.statusLabel(newStatus)}`,
                    managerName || '',
                    { order_id: orderId }
                );
            }
        }

        if (nowSample) {
            const freshReservations = await loadWarehouseReservations();
            const items = await loadWarehouseItems();
            const activeReservedByItem = new Map();
            let hadShortage = false;

            freshReservations.forEach(reservation => {
                if (reservation.status !== 'active') return;
                activeReservedByItem.set(reservation.item_id, (activeReservedByItem.get(reservation.item_id) || 0) + (parseFloat(reservation.qty) || 0));
            });

            const toInsert = [];
            demand.forEach((qty, itemId) => {
                const whItem = items.find(item => item.id === itemId);
                if (!whItem) return;
                const stock = parseFloat(whItem.qty) || 0;
                const reserved = activeReservedByItem.get(itemId) || 0;
                const available = Math.max(0, stock - reserved);
                const reserveQty = Math.min(qty, available);
                if (reserveQty > 0) {
                    toInsert.push({
                        id: Date.now() + Math.floor(Math.random() * 1000),
                        item_id: itemId,
                        order_id: orderId,
                        order_name: orderName || 'Заказ',
                        qty: reserveQty,
                        status: 'active',
                        source: 'order_calc',
                        created_at: new Date().toISOString(),
                        created_by: managerName || '',
                    });
                }
                if (reserveQty < qty) {
                    hadShortage = true;
                }
            });

            if (toInsert.length > 0) {
                await saveWarehouseReservations([...freshReservations, ...toInsert]);
            }
            if (hadShortage) {
                App.toast('Часть упаковки не встала в полный резерв: недостаточно остатка');
            }
            return;
        }

        if (!wasConsumed && nowConsumed) {
            let hadShortage = false;
            for (const [itemId, qty] of demand.entries()) {
                const result = await Warehouse.adjustStock(
                    itemId,
                    -qty,
                    'deduction',
                    orderName || 'Заказ',
                    `Списание при смене статуса: ${App.statusLabel(oldStatus)} → ${App.statusLabel(newStatus)}`,
                    managerName || '',
                    { order_id: orderId }
                );
                if (result && result.clamped && (result.requestedQtyChange || 0) < 0) {
                    hadShortage = true;
                }
            }
            if (hadShortage) {
                App.toast('Часть упаковки списана не полностью: недостаточно остатка');
            }
        }
    },

    async _moveToReadyGoods(orderId, order) {
        try {
            if (typeof Warehouse !== 'undefined' && Warehouse.moveOrderToReadyGoods) {
                const count = await Warehouse.moveOrderToReadyGoods(orderId, order && order.order_name);
                if (count > 0) {
                    App.toast(`${count} товар(ов) → Готовая продукция`);
                }
            }
        } catch (e) {
            console.warn('moveToReadyGoods warning:', e);
        }
    },

    _shouldSyncOrderToReadyGoods(order) {
        return (order?.client_name || '').toUpperCase() === 'B2C';
    },

    async _syncReadyGoodsByStatus(orderId, order, oldStatus, newStatus) {
        if (oldStatus !== 'completed' && newStatus === 'completed' && this._shouldSyncOrderToReadyGoods(order)) {
            await this._moveToReadyGoods(orderId, order);
            return;
        }
        if (oldStatus === 'completed' && newStatus !== 'completed') {
            try {
                if (typeof Warehouse !== 'undefined' && Warehouse.removeOrderFromReadyGoods) {
                    const count = await Warehouse.removeOrderFromReadyGoods(orderId, order && order.order_name, newStatus);
                    if (count > 0) {
                        App.toast(`${count} товар(ов) убрано из Готовой продукции`);
                    }
                }
            } catch (e) {
                console.warn('rollbackReadyGoods warning:', e);
            }
        }
    },

    editOrder(orderId) {
        App.navigate('order-detail', true, orderId);
    },

    _cloneDeep(value) {
        if (value == null) return value;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return Array.isArray(value) ? value.slice() : { ...value };
        }
    },

    _parseClonePayload(value) {
        if (!value) return null;
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            } catch (e) {
                return null;
            }
        }
        return value;
    },

    _asCloneArray(value) {
        const parsed = this._parseClonePayload(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    },

    _pickFirstCloneArray(candidates) {
        for (const candidate of candidates || []) {
            const arr = this._asCloneArray(candidate);
            if (arr.length) return arr;
        }
        return [];
    },

    _looksLikeFlattenedCloneItems(items) {
        return Array.isArray(items) && items.some(item =>
            item && typeof item === 'object' && (
                item.item_type != null
                || item.order_id != null
                || item.product_name != null
                || item.cost_total != null
            )
        );
    },

    _extractSnapshotItems(snapshot) {
        const parsed = this._parseClonePayload(snapshot);
        if (Array.isArray(parsed)) return parsed;
        if (!parsed || typeof parsed !== 'object') return [];
        return this._pickFirstCloneArray([
            parsed.items,
            parsed.order_items,
            parsed.product_items,
            parsed.products,
        ]);
    },

    _prepareClonedOrderItem(item) {
        const cloned = this._cloneDeep(item) || {};
        delete cloned.id;
        delete cloned.order_id;
        delete cloned.created_at;
        delete cloned.updated_at;
        return cloned;
    },

    _minutesToCloneSpeedPerHour(value) {
        const minutes = Number(value);
        if (!(minutes > 0)) return 0;
        return Math.round(minutes * 60 * 100) / 100;
    },

    _restoreCloneItemsFromOrderPayload(order) {
        if (!order || typeof order !== 'object') return [];

        const calculatorData = this._parseClonePayload(order.calculator_data) || {};
        const itemsSnapshot = this._parseClonePayload(order.items_snapshot);
        const hardwareSnapshot = this._parseClonePayload(order.hardware_snapshot);
        const packagingSnapshot = this._parseClonePayload(order.packaging_snapshot);

        const directOrderItems = this._asCloneArray(order.items);
        if (this._looksLikeFlattenedCloneItems(directOrderItems)
            && !directOrderItems.some(item => item && typeof item === 'object' && (item.item_type === 'hardware' || item.item_type === 'packaging' || item.item_type === 'pendant' || item.item_type === 'extra_cost'))) {
            // Treat plain `order.items` without explicit item types as calculator product rows.
        } else if (this._looksLikeFlattenedCloneItems(directOrderItems)) {
            return directOrderItems.map(item => this._prepareClonedOrderItem(item));
        }

        const snapshotItems = this._extractSnapshotItems(itemsSnapshot);
        const snapshotHasItemTypes = this._looksLikeFlattenedCloneItems(snapshotItems)
            && snapshotItems.some(item => item && typeof item === 'object' && item.item_type);
        const snapshotHasNonProductTypes = snapshotHasItemTypes
            && snapshotItems.some(item => item && typeof item === 'object' && item.item_type && item.item_type !== 'product');

        if (snapshotHasNonProductTypes) {
            return snapshotItems.map(item => this._prepareClonedOrderItem(item));
        }

        const snapshotProductItems = snapshotHasItemTypes
            ? snapshotItems.filter(item => !item?.item_type || item.item_type === 'product')
            : snapshotItems;
        const snapshotHardwareItems = snapshotHasItemTypes
            ? snapshotItems.filter(item => item?.item_type === 'hardware')
            : [];
        const snapshotPackagingItems = snapshotHasItemTypes
            ? snapshotItems.filter(item => item?.item_type === 'packaging')
            : [];
        const snapshotExtraCosts = snapshotHasItemTypes
            ? snapshotItems.filter(item => item?.item_type === 'extra_cost')
            : [];
        const snapshotPendants = snapshotHasItemTypes
            ? snapshotItems.filter(item => item?.item_type === 'pendant')
            : [];

        const productItems = this._pickFirstCloneArray([
            directOrderItems,
            order.productItems,
            order.product_items,
            order.calculator_items,
            calculatorData.items,
            calculatorData.productItems,
            calculatorData.product_items,
            calculatorData.calculator_items,
            snapshotProductItems,
        ]);

        const hardwareItems = this._pickFirstCloneArray([
            order.hardwareItems,
            order.hardware_items,
            calculatorData.hardwareItems,
            calculatorData.hardware_items,
            hardwareSnapshot,
            hardwareSnapshot && hardwareSnapshot.items,
            snapshotHardwareItems,
        ]);

        const packagingItems = this._pickFirstCloneArray([
            order.packagingItems,
            order.packaging_items,
            calculatorData.packagingItems,
            calculatorData.packaging_items,
            packagingSnapshot,
            packagingSnapshot && packagingSnapshot.items,
            snapshotPackagingItems,
        ]);

        const extraCosts = this._pickFirstCloneArray([
            order.extraCosts,
            order.extra_costs,
            calculatorData.extraCosts,
            calculatorData.extra_costs,
            snapshotExtraCosts,
        ]);

        const pendants = this._pickFirstCloneArray([
            order.pendants,
            order.pendant_items,
            calculatorData.pendants,
            calculatorData.pendant_items,
            snapshotPendants,
        ]);

        const restored = [];

        productItems.forEach((item, index) => {
            const cloned = this._prepareClonedOrderItem(item);
            cloned.item_number = Number.isFinite(Number(cloned.item_number)) ? Number(cloned.item_number) : index + 1;
            cloned.item_type = cloned.item_type || 'product';
            if (Array.isArray(cloned.printings)) cloned.printings = JSON.stringify(cloned.printings);
            if (Array.isArray(cloned.colors)) cloned.colors = JSON.stringify(cloned.colors);
            if (cloned.color_solution_attachment && typeof cloned.color_solution_attachment === 'object') {
                cloned.color_solution_attachment = JSON.stringify(cloned.color_solution_attachment);
            }
            restored.push(cloned);
        });

        hardwareItems.forEach((hw, index) => {
            const cloned = this._prepareClonedOrderItem(hw);
            const qty = cloned.quantity ?? cloned.qty ?? 0;
            const speedPerHour = cloned.hardware_assembly_speed
                ?? cloned.assembly_speed
                ?? this._minutesToCloneSpeedPerHour(cloned.assembly_minutes);
            restored.push({
                ...cloned,
                item_number: Number.isFinite(Number(cloned.item_number)) ? Number(cloned.item_number) : 100 + index,
                item_type: 'hardware',
                product_name: cloned.product_name || cloned.name || '',
                quantity: qty,
                hardware_assembly_speed: speedPerHour,
                hardware_price_per_unit: cloned.hardware_price_per_unit ?? cloned.price ?? 0,
                hardware_delivery_per_unit: cloned.hardware_delivery_per_unit ?? cloned.delivery_price ?? 0,
                hardware_delivery_total: cloned.hardware_delivery_total ?? cloned.delivery_total ?? 0,
                sell_price_hardware: cloned.sell_price_hardware ?? cloned.sell_price ?? 0,
                target_price_hardware: cloned.target_price_hardware ?? cloned.target_price ?? 0,
                hardware_source: cloned.hardware_source || cloned.source || 'custom',
                custom_country: cloned.custom_country || 'china',
                hardware_warehouse_item_id: cloned.hardware_warehouse_item_id ?? cloned.warehouse_item_id ?? null,
                hardware_warehouse_sku: cloned.hardware_warehouse_sku ?? cloned.warehouse_sku ?? '',
                china_item_id: cloned.china_item_id ?? null,
                china_delivery_method: cloned.china_delivery_method || 'avia',
                price_cny: cloned.price_cny ?? 0,
                weight_grams: cloned.weight_grams ?? 0,
                hardware_parent_item_index: cloned.hardware_parent_item_index ?? cloned.parent_item_index ?? null,
                hardware_from_template: cloned.hardware_from_template ?? cloned._from_template ?? false,
            });
        });

        packagingItems.forEach((pkg, index) => {
            const cloned = this._prepareClonedOrderItem(pkg);
            const qty = cloned.quantity ?? cloned.qty ?? 0;
            const speedPerHour = cloned.packaging_assembly_speed
                ?? cloned.assembly_speed
                ?? this._minutesToCloneSpeedPerHour(cloned.assembly_minutes);
            restored.push({
                ...cloned,
                item_number: Number.isFinite(Number(cloned.item_number)) ? Number(cloned.item_number) : 200 + index,
                item_type: 'packaging',
                product_name: cloned.product_name || cloned.name || '',
                quantity: qty,
                packaging_assembly_speed: speedPerHour,
                packaging_price_per_unit: cloned.packaging_price_per_unit ?? cloned.price ?? 0,
                packaging_delivery_per_unit: cloned.packaging_delivery_per_unit ?? cloned.delivery_price ?? 0,
                packaging_delivery_total: cloned.packaging_delivery_total ?? cloned.delivery_total ?? 0,
                sell_price_packaging: cloned.sell_price_packaging ?? cloned.sell_price ?? 0,
                target_price_packaging: cloned.target_price_packaging ?? cloned.target_price ?? 0,
                packaging_source: cloned.packaging_source || cloned.source || 'custom',
                custom_country: cloned.custom_country || 'china',
                packaging_warehouse_item_id: cloned.packaging_warehouse_item_id ?? cloned.warehouse_item_id ?? null,
                packaging_warehouse_sku: cloned.packaging_warehouse_sku ?? cloned.warehouse_sku ?? '',
                china_item_id: cloned.china_item_id ?? null,
                china_delivery_method: cloned.china_delivery_method || 'avia',
                price_cny: cloned.price_cny ?? 0,
                weight_grams: cloned.weight_grams ?? 0,
                packaging_parent_item_index: cloned.packaging_parent_item_index ?? cloned.parent_item_index ?? null,
            });
        });

        extraCosts.forEach((extraCost, index) => {
            const cloned = this._prepareClonedOrderItem(extraCost);
            const amount = cloned.amount ?? cloned.cost_total ?? cloned.sell_price_item ?? 0;
            restored.push({
                ...cloned,
                item_number: Number.isFinite(Number(cloned.item_number)) ? Number(cloned.item_number) : 300 + index,
                item_type: 'extra_cost',
                product_name: cloned.product_name || cloned.name || 'Доп. доход',
                quantity: cloned.quantity || 1,
                cost_total: amount,
                sell_price_item: cloned.sell_price_item ?? amount,
            });
        });

        pendants.forEach((pendant, index) => {
            const cloned = this._prepareClonedOrderItem(pendant);
            restored.push({
                ...cloned,
                item_number: Number.isFinite(Number(cloned.item_number)) ? Number(cloned.item_number) : 400 + index,
                item_type: 'pendant',
                product_name: cloned.product_name || ('Подвес "' + (cloned.name || '') + '"'),
                quantity: cloned.quantity || 0,
                cost_total: cloned.cost_total ?? cloned.result?.costPerUnit ?? 0,
                sell_price_item: cloned.sell_price_item ?? cloned.result?.sellPerUnit ?? cloned._totalSellPerUnit ?? 0,
            });
        });

        return restored;
    },

    async cloneOrder(orderId) {
        App.toast('Копирование заказа...');
        try {
            const data = await loadOrder(orderId);
            if (!data) {
                App.toast('Ошибка загрузки', 'error');
                return;
            }

            const clonedOrder = { ...data.order };
            delete clonedOrder.id;
            clonedOrder.order_name = (clonedOrder.order_name || 'Заказ') + ' (копия)';
            clonedOrder.status = 'draft';
            delete clonedOrder.created_at;
            delete clonedOrder.updated_at;

            const sourceItems = Array.isArray(data.items) && data.items.length
                ? data.items
                : this._restoreCloneItemsFromOrderPayload(data.order);
            const clonedItems = (sourceItems || []).map(item => this._prepareClonedOrderItem(item));

            const newId = await saveOrder(clonedOrder, clonedItems);
            if (newId) {
                App.toast('Заказ скопирован');
                Calculator.loadOrder(newId);
            }
        } catch (e) {
            console.error('Clone order error:', e);
            App.toast('Ошибка копирования', 'error');
        }
    },

    async confirmDelete(orderId) {
        const order = this.allOrders.find(item => item.id === orderId);
        const name = order && order.order_name ? order.order_name : 'Без названия';
        if (confirm(`Перенести заказ "${name}" в корзину?`)) {
            const managerName = App.getCurrentEmployeeName();
            await deleteOrder(orderId);
            await this.addChangeRecord(orderId, {
                field: 'status',
                old_value: 'Активный',
                new_value: 'Удалён (в корзину)',
                manager: managerName,
            });
            App.toast('Заказ перемещён в корзину');
            this.loadList();
        }
    },

    async restoreOrder(orderId) {
        await restoreOrder(orderId);
        await this.addChangeRecord(orderId, {
            field: 'status',
            old_value: 'Удалён',
            new_value: 'Черновик (восстановлен)',
            manager: App.getCurrentEmployeeName(),
        });
        App.toast('Заказ восстановлен');
        this.loadList();
    },

    async confirmPermanentDelete(orderId) {
        const order = this.allOrders.find(item => item.id === orderId);
        const name = order && order.order_name ? order.order_name : 'Без названия';
        if (confirm(`ВНИМАНИЕ: Удалить заказ "${name}" НАВСЕГДА? Это действие нельзя отменить!`)) {
            await permanentDeleteOrder(orderId);
            App.toast('Заказ удалён навсегда');
            this.loadList();
        }
    },

    // ==========================================
    // CHANGE HISTORY
    // ==========================================

    async addChangeRecord(orderId, change) {
        const history = await this.loadHistory(orderId);
        history.push({
            date: new Date().toISOString(),
            manager: change.manager || '',
            field: change.field || '',
            old_value: change.old_value || '',
            new_value: change.new_value || '',
            description: change.description || '',
        });
        await this.saveHistory(orderId, history);
    },

    async loadHistory(orderId) {
        const key = 'ro_calc_order_history_' + orderId;
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch (e) {
            return [];
        }
    },

    async saveHistory(orderId, history) {
        const key = 'ro_calc_order_history_' + orderId;
        localStorage.setItem(key, JSON.stringify(history));
    },

    escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
};

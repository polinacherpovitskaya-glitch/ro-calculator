// =============================================
// Recycle Object — Order Detail Page
// =============================================

const PAYMENT_STATUSES = [
    { key: 'not_sent',      label: 'Не передано в оплату', color: 'gray' },
    { key: 'sent_to_payment', label: 'Передано в оплату',  color: 'blue' },
    { key: 'paid_50',       label: 'Оплачено 50%',        color: 'orange' },
    { key: 'paid_100',      label: 'Оплачено 100%',       color: 'green' },
    { key: 'postpay_100',   label: 'Постоплата 100%',     color: 'green' },
    { key: 'special',       label: 'Особые условия',      color: 'red' },
];

const HARDWARE_STATUSES = [
    { key: 'discussion',      label: 'Обсуждение',       color: 'gray' },
    { key: 'from_stock',      label: 'Из наличия',       color: 'blue' },
    { key: 'ordered_waiting', label: 'Заказана, ждём',   color: 'orange' },
    { key: 'arrived',         label: 'Приехала',         color: 'green' },
    { key: 'not_needed',      label: 'Не нужна',         color: 'gray' },
    { key: 'to_make',         label: 'Сделать',          color: 'yellow' },
];

// Plastic is always PP, print type is set at printing level — removed from UI

const OrderDetail = {
    currentOrder: null,
    currentItems: [],
    currentFinancial: null,
    currentTab: 'info',

    // ==========================================
    // LOAD
    // ==========================================

    async load(orderId) {
        if (!orderId) { App.navigate('orders'); return; }

        const data = await loadOrder(orderId);
        if (!data) {
            App.toast('Заказ не найден');
            App.navigate('orders');
            return;
        }

        this.currentOrder = data.order;
        this.currentItems = data.items || [];
        this.currentFinancial = this.buildLiveFinancialMeta();
        this.currentTab = 'info';

        this.renderHeader();
        this.renderStats();
        this.renderInfoTab();
        this.renderProductionTab();
        this.renderFilesTab();
        this.renderItemsTab();
        await this.renderHardwareTab();
        await this.renderTasksTab();
        this.renderChinaTab();

        // Show first tab
        this.switchTab('info');
        if (data.repaired_duplicates) {
            App.toast('Дубли позиций в заказе были автоматически исправлены');
        }
    },

    // ==========================================
    // TABS
    // ==========================================

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.od-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        document.querySelectorAll('.od-tab-content').forEach(c => {
            c.style.display = c.id === 'od-tab-' + tab ? '' : 'none';
        });
        if (tab === 'hardware') {
            void this.renderHardwareTab();
        }
    },

    // ==========================================
    // HEADER
    // ==========================================

    renderHeader() {
        const o = this.currentOrder;
        document.getElementById('od-title').textContent = o.order_name || 'Без названия';

        const st = STATUS_OPTIONS.find(s => s.value === o.status);
        const badge = document.getElementById('od-status-badge');
        badge.textContent = st ? st.label : o.status;
        badge.className = 'badge badge-' + this._statusColor(o.status);
    },

    // ==========================================
    // STATS
    // ==========================================

    buildLiveFinancialMeta() {
        if (typeof getOrderLiveCalculatorSnapshot !== 'function') {
            return {
                revenue: Number(this.currentOrder?.total_revenue_plan || 0),
                marginPercent: Number(this.currentOrder?.margin_percent_plan || 0),
                hours: Number(this.currentOrder?.total_hours_plan || 0),
            };
        }
        try {
            const snapshot = getOrderLiveCalculatorSnapshot(this.currentOrder || {}, this.currentItems || []);
            return {
                revenue: Number(snapshot?.revenue || 0),
                marginPercent: Number(snapshot?.marginPercent || 0),
                hours: Number(snapshot?.hours || 0),
            };
        } catch (e) {
            console.warn('OrderDetail.buildLiveFinancialMeta fallback:', e);
            return {
                revenue: Number(this.currentOrder?.total_revenue_plan || 0),
                marginPercent: Number(this.currentOrder?.margin_percent_plan || 0),
                hours: Number(this.currentOrder?.total_hours_plan || 0),
            };
        }
    },

    renderStats() {
        const o = this.currentOrder;
        const ps = PAYMENT_STATUSES.find(s => s.key === o.payment_status) || PAYMENT_STATUSES[0];
        this.currentFinancial = this.buildLiveFinancialMeta();
        const revenue = Number(this.currentFinancial?.revenue || o.total_revenue_plan || 0);
        const marginPercent = Number(this.currentFinancial?.marginPercent || o.margin_percent_plan || 0);
        const hours = Number(this.currentFinancial?.hours || o.total_hours_plan || 0);

        document.getElementById('od-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Выручка</div>
                <div class="stat-value">${formatRub(revenue)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Маржа</div>
                <div class="stat-value ${marginPercent >= 30 ? 'text-green' : 'text-red'}">${formatPercent(marginPercent)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Часы</div>
                <div class="stat-value">${hours.toFixed(1)} ч</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Оплата</div>
                <div class="stat-value"><span class="badge badge-${ps.color}">${ps.label}</span></div>
            </div>
        `;
    },

    // ==========================================
    // INFO TAB
    // ==========================================

    renderInfoTab() {
        const o = this.currentOrder;
        const container = document.getElementById('od-tab-info');

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="card">
                <div class="card-header"><h3>Основное</h3></div>
                ${this._fieldRow('order_name', 'Название', o.order_name, 'text')}
                ${this._fieldRow('client_name', 'Клиент', o.client_name, 'text')}
                ${this._fieldRow('manager_name', 'Менеджер', o.manager_name, 'text')}
                ${this._fieldRowDateRange('deadline_start', 'deadline_end', 'Начало → Дедлайн', o.deadline_start || o.deadline, o.deadline_end)}
                ${this._fieldRow('notes', 'Заметки', o.notes, 'textarea')}
            </div>
            <div class="card">
                <div class="card-header"><h3>Контакты и ссылки</h3></div>
                ${this._fieldRow('delivery_address', 'Адрес доставки', o.delivery_address, 'text')}
                ${this._fieldRow('telegram', 'Telegram', o.telegram, 'text')}
                ${this._fieldRow('crm_link', 'CRM', o.crm_link, 'url')}
                ${this._fieldRow('fintablo_link', 'Финтабло', o.fintablo_link, 'url')}
            </div>
        </div>
        `;
    },

    // ==========================================
    // PRODUCTION TAB
    // ==========================================

    renderProductionTab() {
        const o = this.currentOrder;
        const container = document.getElementById('od-tab-production');

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="card">
                <div class="card-header"><h3>Статусы</h3></div>
                ${this._fieldRowSelect('payment_status', 'Статус оплаты', o.payment_status || 'not_sent', PAYMENT_STATUSES)}
            </div>
        </div>
        `;
    },

    // ==========================================
    // FILES TAB
    // ==========================================

    renderFilesTab() {
        const o = this.currentOrder;
        const container = document.getElementById('od-tab-files');

        container.innerHTML = `
        <div class="od-detail-grid">
            <div class="card">
                <div class="card-header"><h3>Файлы проекта</h3></div>
                ${this._fieldRow('print_file_url', 'Файл печати', o.print_file_url, 'url')}
                ${this._fieldRow('cutting_file_url', 'Файл резки/формы', o.cutting_file_url, 'url')}
                ${this._fieldRow('delivery_documents_url', 'Документы доставки', o.delivery_documents_url, 'url')}
            </div>
            <div class="card">
                <div class="card-header"><h3>Референсы</h3></div>
                ${this._fieldRow('reference_urls', 'URL референсов', o.reference_urls, 'textarea')}
                ${this._renderReferenceLinks(o.reference_urls)}
            </div>
        </div>
        `;
    },

    _renderReferenceLinks(urls) {
        if (!urls) return '<p class="text-muted" style="padding:8px 16px;font-size:12px;">Нет референсов</p>';
        const links = urls.split(',').map(u => u.trim()).filter(Boolean);
        if (links.length === 0) return '';
        return `<div style="padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px;">
            ${links.map((u, i) => `<a href="${this._escAttr(u)}" target="_blank" class="od-url-link" title="${this._escAttr(u)}">Референс ${i + 1}</a>`).join('')}
        </div>`;
    },

    // ==========================================
    // ITEMS TAB
    // ==========================================

    renderItemsTab() {
        const container = document.getElementById('od-tab-items');
        const products = this.currentItems.filter(i => i.item_type === 'product' || !i.item_type);
        const allHardware = this.currentItems.filter(i => i.item_type === 'hardware');
        const allPackaging = this.currentItems.filter(i => i.item_type === 'packaging');
        const pendantItems = this.currentItems.filter(i => i.item_type === 'pendant');

        // Build pendant HTML (used in both grouped and non-grouped paths)
        let pendantHtml = '';
        pendantItems.forEach(pndItem => {
            let pnd;
            try { pnd = typeof pndItem.item_data === 'string' ? JSON.parse(pndItem.item_data) : pndItem.item_data; } catch(e) { return; }
            if (!pnd) return;
            pendantHtml += this._renderPendantDetail(pnd, pndItem);
        });

        // Separate order-level vs per-item hw/pkg
        const orderHardware = allHardware.filter(i => i.hardware_parent_item_index === null || i.hardware_parent_item_index === undefined);
        const orderPackaging = allPackaging.filter(i => i.packaging_parent_item_index === null || i.packaging_parent_item_index === undefined);

        // Check if items have marketplace_set_name for grouping
        const hasSetNames = [...products, ...orderHardware, ...orderPackaging].some(i => i.marketplace_set_name);

        let html = '';

        if (hasSetNames) {
            // Group all items by marketplace_set_name
            const setGroups = new Map();
            const noSetProducts = [];
            products.forEach((item, idx) => {
                const sn = item.marketplace_set_name || '';
                if (sn) {
                    if (!setGroups.has(sn)) setGroups.set(sn, { products: [], hw: [], pkg: [] });
                    setGroups.get(sn).products.push({ item, idx });
                } else {
                    noSetProducts.push({ item, idx });
                }
            });
            orderHardware.forEach(item => {
                const sn = item.marketplace_set_name || '';
                if (sn) {
                    if (!setGroups.has(sn)) setGroups.set(sn, { products: [], hw: [], pkg: [] });
                    setGroups.get(sn).hw.push(item);
                }
            });
            orderPackaging.forEach(item => {
                const sn = item.marketplace_set_name || '';
                if (sn) {
                    if (!setGroups.has(sn)) setGroups.set(sn, { products: [], hw: [], pkg: [] });
                    setGroups.get(sn).pkg.push(item);
                }
            });

            // Render grouped by set
            for (const [setName, group] of setGroups) {
                const setQty = group.products.reduce((s, p) => s + (parseFloat(p.item.quantity) || 0), 0);
                html += `<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:10px;padding:12px;">`;
                html += `<h3 style="margin:0 0 8px;display:flex;align-items:center;gap:6px;">&#128230; ${this._esc(setName)} <span class="text-muted" style="font-size:13px;font-weight:400;">(${setQty} шт)</span></h3>`;

                if (group.products.length > 0) {
                    html += '<div style="margin-bottom:6px;font-size:12px;font-weight:600;color:#6b7280;">Изделия:</div>';
                    group.products.forEach(({ item, idx }) => {
                        html += this._renderItemCard(item, 'product');
                        const itemHw = allHardware.filter(h => h.hardware_parent_item_index === idx);
                        const itemPkg = allPackaging.filter(p => p.packaging_parent_item_index === idx);
                        if (itemHw.length > 0 || itemPkg.length > 0) {
                            html += '<div style="margin-left:16px;border-left:2px solid var(--border);padding-left:12px;margin-bottom:8px">';
                            itemHw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                            itemPkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                            html += '</div>';
                        }
                    });
                }
                if (group.hw.length > 0) {
                    html += '<div style="margin-top:8px;font-size:12px;font-weight:600;color:#6b7280;">&#128297; Фурнитура:</div>';
                    group.hw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                }
                if (group.pkg.length > 0) {
                    html += '<div style="margin-top:8px;font-size:12px;font-weight:600;color:#6b7280;">&#128230; Упаковка:</div>';
                    group.pkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                }
                html += '</div>';
            }

            // Products without set name
            if (noSetProducts.length > 0) {
                html += '<h3 style="margin:12px 0 12px">Прочие изделия</h3>';
                noSetProducts.forEach(({ item, idx }) => {
                    html += this._renderItemCard(item, 'product');
                    const itemHw = allHardware.filter(h => h.hardware_parent_item_index === idx);
                    const itemPkg = allPackaging.filter(p => p.packaging_parent_item_index === idx);
                    if (itemHw.length > 0 || itemPkg.length > 0) {
                        html += '<div style="margin-left:16px;border-left:2px solid var(--border);padding-left:12px;margin-bottom:8px">';
                        itemHw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                        itemPkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                        html += '</div>';
                    }
                });
            }

            // HW/PKG without set name
            const noSetHw = orderHardware.filter(i => !i.marketplace_set_name);
            const noSetPkg = orderPackaging.filter(i => !i.marketplace_set_name);
            if (noSetHw.length > 0) {
                html += '<h3 style="margin:16px 0 12px">&#128297; Общая фурнитура</h3>';
                html += noSetHw.map(item => this._renderItemCard(item, 'hardware')).join('');
            }
            if (noSetPkg.length > 0) {
                html += '<h3 style="margin:16px 0 12px">&#128230; Общая упаковка</h3>';
                html += noSetPkg.map(item => this._renderItemCard(item, 'packaging')).join('');
            }

            // Pendant items
            html += pendantHtml;

        } else {
            // Fallback: old display (no set grouping)
            if (products.length > 0) {
                html += '<h3 style="margin:0 0 12px">Изделия</h3>';
                products.forEach((item, idx) => {
                    html += this._renderItemCard(item, 'product');
                    const itemHw = allHardware.filter(h => h.hardware_parent_item_index === idx);
                    const itemPkg = allPackaging.filter(p => p.packaging_parent_item_index === idx);
                    if (itemHw.length > 0 || itemPkg.length > 0) {
                        html += '<div style="margin-left:16px;border-left:2px solid var(--border);padding-left:12px;margin-bottom:8px">';
                        itemHw.forEach(h => { html += this._renderItemCard(h, 'hardware'); });
                        itemPkg.forEach(p => { html += this._renderItemCard(p, 'packaging'); });
                        html += '</div>';
                    }
                });
            }
            if (orderHardware.length > 0) {
                html += '<h3 style="margin:16px 0 12px">&#128297; Общая фурнитура</h3>';
                html += orderHardware.map(item => this._renderItemCard(item, 'hardware')).join('');
            }
            if (orderPackaging.length > 0) {
                html += '<h3 style="margin:16px 0 12px">&#128230; Общая упаковка</h3>';
                html += orderPackaging.map(item => this._renderItemCard(item, 'packaging')).join('');
            }

            // Pendant items
            html += pendantHtml;
        }

        if (!html) {
            html = '<div class="empty-state"><div class="empty-icon">&#128230;</div><p>Нет позиций. Откройте в калькуляторе для добавления.</p></div>';
        }

        container.innerHTML = html;
    },

    async renderHardwareTab() {
        const container = document.getElementById('od-tab-hardware');
        if (!container || !this.currentOrder) return;

        const orderId = Number(this.currentOrder.id || 0);
        if (!orderId) {
            container.innerHTML = '<div class="empty-state"><p>Заказ не найден</p></div>';
            return;
        }

        container.innerHTML = `<div class="card"><p class="text-muted" style="padding:16px">Загружаем фурнитуру заказа…</p></div>`;

        try {
            await Warehouse._ensureProjectHardwareStateLoaded();
            const [warehouseItems, reservations, history] = await Promise.all([
                loadWarehouseItems(),
                loadWarehouseReservations(),
                loadWarehouseHistory(),
            ]);

            Warehouse.allItems = Array.isArray(warehouseItems) ? warehouseItems : [];
            Warehouse.allReservations = Array.isArray(reservations) ? reservations : [];

            const byItemId = new Map((warehouseItems || []).map(item => [Number(item.id), item]));
            const historyDeltaMap = Warehouse._buildProjectHardwareHistoryDeltaMap(history || []);
            const demandRows = Warehouse._collectWarehouseDemandFromOrderItems(this.currentItems || []);
            const activeReservations = reservations || [];

            if (!demandRows.length) {
                container.innerHTML = `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">&#128295;</div>
                            <p>В заказе пока нет складской фурнитуры или упаковки.</p>
                            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
                                <button class="btn btn-outline btn-sm" onclick="OrderDetail.openInCalculator()">Открыть в калькуляторе</button>
                                <button class="btn btn-outline btn-sm" onclick="Warehouse.setView('project-hardware'); App.navigate('warehouse')">Открыть фурнитуру для проектов</button>
                            </div>
                        </div>
                    </div>
                `;
                return;
            }

            const rows = demandRows
                .map(row => {
                    const itemId = Number(row.warehouse_item_id || 0);
                    const whItem = byItemId.get(itemId) || {};
                    const plannedQty = round2(Math.max(0, parseFloat(row.qty) || 0));
                    const targetQty = Warehouse._buildProjectHardwareTargetQty(orderId, itemId, plannedQty, historyDeltaMap);
                    const actualQty = Warehouse._getProjectHardwareDisplayActualQty(orderId, itemId, plannedQty, historyDeltaMap, history || []);
                    const ready = Warehouse._computeProjectHardwareReadyState(orderId, itemId, plannedQty, history || [], historyDeltaMap);
                    const currentReserveQty = Warehouse._getProjectHardwareReservedQtyForOrderItem(activeReservations, orderId, itemId);
                    const totalReservedQty = round2(Warehouse._getActiveReservationsForItem(itemId)
                        .reduce((sum, reservation) => sum + (parseFloat(reservation.qty) || 0), 0));
                    const stockQty = round2(parseFloat(whItem.qty || 0) || 0);
                    const availableQty = Math.max(0, round2(stockQty - totalReservedQty));
                    const reserveHint = ready
                        ? 'Уже собрано'
                        : (Math.abs(currentReserveQty - targetQty) <= 0.000001
                            ? 'Резерв совпадает'
                            : (currentReserveQty < targetQty ? 'Резерв неполный' : 'Резерв скорректирован'));
                    return {
                        itemId,
                        itemName: whItem.name || (Array.isArray(row.names) ? row.names.find(Boolean) : '') || 'Позиция со склада',
                        itemSku: whItem.sku || '',
                        itemKind: Warehouse._projectSupplyKindLabel(row.material_type || whItem.category || 'hardware'),
                        plannedQty,
                        targetQty,
                        actualQty,
                        ready,
                        currentReserveQty,
                        availableQty,
                        reserveHint,
                    };
                })
                .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName), 'ru'));

            const totalPlanned = round2(rows.reduce((sum, row) => sum + row.plannedQty, 0));
            const totalTarget = round2(rows.reduce((sum, row) => sum + row.targetQty, 0));
            const totalReserved = round2(rows.reduce((sum, row) => sum + row.currentReserveQty, 0));
            const totalReady = rows.filter(row => row.ready).length;

            container.innerHTML = `
                <div class="card" style="margin-bottom:12px;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                        <div>
                            <h3 style="margin:0 0 6px;">Фурнитура и упаковка заказа</h3>
                            <div class="text-muted" style="font-size:13px;">
                                Меняйте здесь фактическое количество и сборку по заказу. Резерв на складе пересчитается автоматически.
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;">
                            <button class="btn btn-outline btn-sm" onclick="OrderDetail.openInCalculator()">Открыть в калькуляторе</button>
                            <button class="btn btn-outline btn-sm" onclick="Warehouse.setView('project-hardware'); App.navigate('warehouse')">Открыть на складе</button>
                        </div>
                    </div>
                    <div class="stats-grid" style="margin-top:12px;">
                        <div class="stat-card"><div class="stat-label">Позиций</div><div class="stat-value">${rows.length}</div></div>
                        <div class="stat-card"><div class="stat-label">План</div><div class="stat-value">${totalPlanned} шт</div></div>
                        <div class="stat-card"><div class="stat-label">Факт / цель</div><div class="stat-value">${totalTarget} шт</div></div>
                        <div class="stat-card"><div class="stat-label">В резерве</div><div class="stat-value">${totalReserved} шт</div></div>
                        <div class="stat-card"><div class="stat-label">Собрано</div><div class="stat-value">${totalReady} / ${rows.length}</div></div>
                    </div>
                </div>

                <div class="card" style="padding:0;">
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Комплектующая</th>
                                    <th class="text-right">План</th>
                                    <th class="text-right">Резерв</th>
                                    <th class="text-right">Факт</th>
                                    <th class="text-right">Доступно сейчас</th>
                                    <th>Собрано</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rows.map(row => `
                                    <tr>
                                        <td>
                                            <div style="font-weight:600;">${this._esc(row.itemName)}</div>
                                            <div style="font-size:11px;color:var(--text-muted);">${this._esc(row.itemKind)}</div>
                                            ${row.itemSku ? `<div style="font-size:11px;color:var(--text-muted);">${this._esc(row.itemSku)}</div>` : ''}
                                        </td>
                                        <td class="text-right" style="font-weight:700;">${row.plannedQty}</td>
                                        <td class="text-right">
                                            <div style="font-weight:700;">${row.currentReserveQty}</div>
                                            <div style="font-size:11px;color:var(--text-muted);">${this._esc(row.reserveHint)}</div>
                                        </td>
                                        <td class="text-right">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value="${row.actualQty === null || row.actualQty === undefined ? '' : row.actualQty}"
                                                placeholder="${row.plannedQty}"
                                                style="width:96px;text-align:right;"
                                                onblur="OrderDetail.setProjectHardwareActualQty(${row.itemId}, this.value)"
                                                onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}"
                                            >
                                            <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">если пусто — по плану</div>
                                        </td>
                                        <td class="text-right" style="font-weight:700;">${row.availableQty}</td>
                                        <td>
                                            <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;">
                                                <input type="checkbox" ${row.ready ? 'checked' : ''} onchange="OrderDetail.toggleProjectHardwareReady(${row.itemId}, this.checked)">
                                                <span style="font-size:12px;color:var(--text-secondary);">собрано</span>
                                            </label>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('renderHardwareTab error', error);
            container.innerHTML = `
                <div class="card">
                    <p class="text-muted" style="padding:16px;">Не удалось загрузить фурнитуру заказа.</p>
                </div>
            `;
        }
    },

    async setProjectHardwareActualQty(itemId, rawValue) {
        if (!this.currentOrder) return;
        await Warehouse.setProjectHardwareActualQty(this.currentOrder.id, itemId, rawValue);
        const data = await loadOrder(this.currentOrder.id);
        if (data && data.order) {
            this.currentOrder = data.order;
            this.currentItems = data.items || [];
        }
        await this.renderHardwareTab();
    },

    async toggleProjectHardwareReady(itemId, checked) {
        if (!this.currentOrder) return;
        await Warehouse.toggleProjectHardwareReady(this.currentOrder.id, itemId, checked);
        const data = await loadOrder(this.currentOrder.id);
        if (data && data.order) {
            this.currentOrder = data.order;
            this.currentItems = data.items || [];
        }
        await this.renderHardwareTab();
    },

    _renderPendantDetail(pnd, dbItem) {
        const qty = pnd.quantity || 0;
        const elements = pnd.elements || [];
        const elemPrice = pnd.element_price_per_unit || 0;
        const getAttachmentAllocatedQty = (entry) => {
            if (typeof getPendantAttachmentAllocatedQty === 'function') {
                return getPendantAttachmentAllocatedQty(pnd, entry);
            }
            const allocatedQty = parseFloat(entry?.allocated_qty);
            if (Number.isFinite(allocatedQty) && allocatedQty >= 0) return allocatedQty;
            return qty > 0 ? qty : 0;
        };
        const normalizeAttachments = (type) => {
            const collectionKey = type === 'cord' ? 'cords' : 'carabiners';
            const legacyKey = type === 'cord' ? 'cord' : 'carabiner';
            const fallbackLengthCm = type === 'cord' ? (parseFloat(pnd.cord_length_cm) || 0) : 0;
            let entries = Array.isArray(pnd[collectionKey]) ? pnd[collectionKey] : [];
            if ((!entries || entries.length === 0) && pnd[legacyKey]) {
                entries = [pnd[legacyKey]];
            }
            return (entries || [])
                .map((entry, index) => {
                    const normalized = { ...(entry || {}) };
                    const qtyPerPendant = parseFloat(normalized.qty_per_pendant);
                    const lengthCm = parseFloat(normalized.length_cm);
                    const allocatedQty = parseFloat(normalized.allocated_qty);
                    const hasExplicitAllocatedQty = normalized.allocated_qty !== undefined && normalized.allocated_qty !== null && normalized.allocated_qty !== '';
                    normalized.qty_per_pendant = qtyPerPendant > 0 ? qtyPerPendant : 1;
                    normalized.length_cm = Number.isFinite(lengthCm) ? lengthCm : (type === 'cord' && index === 0 ? fallbackLengthCm : 0);
                    normalized.unit = normalized.unit || 'шт';
                    normalized.allocated_qty = Number.isFinite(allocatedQty)
                        ? Math.max(0, Math.round(allocatedQty))
                        : ((
                            normalized.name
                            || normalized.warehouse_item_id
                            || normalized.warehouse_sku
                            || (parseFloat(normalized.price_per_unit) || 0) > 0
                            || (parseFloat(normalized.delivery_price) || 0) > 0
                            || (parseFloat(normalized.sell_price) || 0) > 0
                            || normalized.source === 'custom'
                        ) && !hasExplicitAllocatedQty && qty > 0 ? qty : 0);
                    return normalized;
                })
                .filter(entry => entry && (
                    entry.name
                    || entry.warehouse_item_id
                    || entry.warehouse_sku
                    || (parseFloat(entry.price_per_unit) || 0) > 0
                    || (parseFloat(entry.delivery_price) || 0) > 0
                    || (parseFloat(entry.sell_price) || 0) > 0
                    || entry.source === 'custom'
                ));
        };
        const attachmentCostPerPendant = (type, entry) => {
            if (type === 'cord' && (entry.unit === 'м' || entry.unit === 'см')) {
                const metricFactor = typeof getPendantMetricRateFactor === 'function'
                    ? getPendantMetricRateFactor(entry)
                    : ((entry.unit === 'см') ? (parseFloat(entry.length_cm) || 0) : ((parseFloat(entry.length_cm) || 0) / 100));
                return round2(((entry.price_per_unit || 0) * metricFactor) + (entry.delivery_price || 0));
            }
            return round2(((entry.price_per_unit || 0) + (entry.delivery_price || 0)) * (entry.qty_per_pendant || 1));
        };
        const cords = normalizeAttachments('cord');
        const carabiners = normalizeAttachments('carabiner');

        // Group elements by color
        const groups = {};
        elements.forEach(el => {
            const key = el.color || 'без цвета';
            if (!groups[key]) groups[key] = [];
            groups[key].push(el);
        });

        let rows = '';
        cords.forEach(cord => {
            const isMetric = cord.unit === 'м' || cord.unit === 'см';
            const allocatedQty = getAttachmentAllocatedQty(cord);
            const totalQtyLabel = isMetric
                ? `${round2((cord.length_cm || 0) * allocatedQty / 100)} м${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`
                : `${round2(allocatedQty * (cord.qty_per_pendant || 1))} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}`;
            const titleSuffix = isMetric && cord.length_cm > 0 ? ` (${cord.length_cm} см/подвес)` : ((cord.qty_per_pendant || 1) > 1 ? ` × ${cord.qty_per_pendant}` : '');
            const pricePerPendant = attachmentCostPerPendant('cord', cord);
            rows += `<tr><td style="padding-left:24px;">&#129525; ${this._esc(cord.name || 'Шнур')}${titleSuffix}</td><td>${totalQtyLabel}</td><td>${formatRub(pricePerPendant)}</td><td>${formatRub(allocatedQty * pricePerPendant)}</td></tr>`;
        });
        carabiners.forEach(carabiner => {
            const allocatedQty = getAttachmentAllocatedQty(carabiner);
            const titleSuffix = (carabiner.qty_per_pendant || 1) > 1 ? ` × ${carabiner.qty_per_pendant}` : '';
            const pricePerPendant = attachmentCostPerPendant('carabiner', carabiner);
            rows += `<tr><td style="padding-left:24px;">&#128279; ${this._esc(carabiner.name || 'Фурнитура')}${titleSuffix}</td><td>${round2(allocatedQty * (carabiner.qty_per_pendant || 1))} шт${allocatedQty > 0 ? ` · ${allocatedQty} подв.` : ''}</td><td>${formatRub(pricePerPendant)}</td><td>${formatRub(allocatedQty * pricePerPendant)}</td></tr>`;
        });
        // Element groups by color
        Object.entries(groups).forEach(([color, els]) => {
            const chars = els.map(e => e.char).join(', ');
            const groupQty = els.length * qty;
            rows += `<tr><td style="padding-left:24px;">&#128292; ${this._esc(chars)} (${this._esc(color)})</td><td>${groupQty}</td><td>${formatRub(elemPrice)}</td><td>${formatRub(groupQty * elemPrice)}</td></tr>`;
        });
        // Print items
        elements.filter(el => el.has_print).forEach(el => {
            rows += `<tr><td style="padding-left:24px;">&#128424; Печать на ${this._esc(el.char)}</td><td>${qty}</td><td>${formatRub(el.print_price)}</td><td>${formatRub(qty * (el.print_price || 0))}</td></tr>`;
        });
        // Packaging
        if (pnd.packaging?.name) {
            rows += `<tr><td style="padding-left:24px;">&#128230; ${this._esc(pnd.packaging.name)}</td><td>${qty}</td><td>${formatRub(pnd.packaging.price_per_unit)}</td><td>${formatRub(qty * (pnd.packaging.price_per_unit || 0))}</td></tr>`;
        }

        const sellPrice = dbItem.sell_price_item || 0;
        const totalRevenue = sellPrice * qty;

        return `
            <div class="card" style="border-left:3px solid var(--accent);margin-bottom:12px;">
                <div class="card-header">
                    <h3 style="margin:0;">&#128292; Подвес "${this._esc(pnd.name)}" × ${qty} шт</h3>
                    <span style="font-size:14px;font-weight:700;">${formatRub(totalRevenue)}</span>
                </div>
                <table style="width:100%;font-size:13px;border-collapse:collapse;padding:8px 16px;">
                    <tr style="color:var(--text-muted);font-size:11px;"><td>Позиция</td><td>Кол-во</td><td>Цена/шт</td><td>Итого</td></tr>
                    ${rows}
                </table>
            </div>
        `;
    },

    _renderItemCard(item, type) {
        const name = item.product_name || '—';
        const qty = item.quantity || 0;
        let costPerUnit = 0;
        let sellPrice = 0;

        if (type === 'product') {
            costPerUnit = item.cost_total || 0;
            sellPrice = item.sell_price_item || 0;
        } else if (type === 'hardware') {
            costPerUnit = item.cost_total || 0;
            sellPrice = item.sell_price_hardware || 0;
        } else if (type === 'packaging') {
            costPerUnit = item.cost_total || 0;
            sellPrice = item.sell_price_packaging || 0;
        }

        const revenue = sellPrice * qty;
        const cost = costPerUnit * qty;
        const margin = revenue > 0 ? ((revenue - cost) / revenue * 100) : 0;
        const productMeta = type === 'product' ? this._renderProductMeta(item) : '';

        return `
        <div class="od-item-card">
            <div class="od-item-header">
                <b>${this._esc(name)}</b>
                <span class="text-muted">${qty} шт</span>
            </div>
            <div class="form-row" style="margin:0;gap:24px;font-size:13px;">
                <div><span class="text-muted">Себестоимость:</span> ${formatRub(costPerUnit)}/шт</div>
                <div><span class="text-muted">Продажа:</span> ${formatRub(sellPrice)}/шт</div>
                <div><span class="text-muted">Выручка:</span> ${formatRub(revenue)}</div>
                <div><span class="text-muted">Маржа:</span> <span class="${margin >= 30 ? 'text-green' : 'text-red'}">${margin.toFixed(1)}%</span></div>
            </div>
            ${productMeta}
        </div>`;
    },

    _renderProductMeta(item) {
        const colors = this._normalizeProductColors(item);
        const attachment = this._normalizeColorAttachment(item);
        const sections = [];

        if (colors.length > 0) {
            sections.push(`
                <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                    <span class="text-muted" style="min-width:62px;">Цвета:</span>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${colors.map(color => `<span class="badge badge-blue">${this._esc(color.name || color.number || `#${color.id || '—'}`)}</span>`).join('')}
                    </div>
                </div>
            `);
        }

        if (attachment) {
            const label = this._esc(attachment.name || 'Файл цветового решения');
            const linkHtml = attachment.data_url
                ? `<a href="${this._escAttr(attachment.data_url)}" download="${this._escAttr(attachment.name || 'color-solution')}" class="od-url-link">${label}</a>`
                : label;
            sections.push(`
                <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;">
                    <span class="text-muted" style="min-width:62px;">Файл:</span>
                    <span>${linkHtml}</span>
                </div>
            `);
        }

        if (sections.length === 0) return '';

        return `
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px;font-size:12px;">
                ${sections.join('')}
            </div>
        `;
    },

    _normalizeProductColors(item) {
        let colors = item?.colors;
        if (typeof colors === 'string') {
            try {
                colors = JSON.parse(colors);
            } catch (e) {
                colors = [];
            }
        }
        if (!Array.isArray(colors)) colors = [];
        colors = colors.filter(color => color && typeof color === 'object');
        if (colors.length > 0) return colors;

        if (item?.color_name) {
            return [{
                id: item.color_id || null,
                name: item.color_name,
            }];
        }

        if (item?.color_id) {
            return [{
                id: item.color_id,
                name: `#${item.color_id}`,
            }];
        }

        return [];
    },

    _normalizeColorAttachment(item) {
        let attachment = item?.color_solution_attachment || null;
        if (typeof attachment === 'string') {
            try {
                attachment = JSON.parse(attachment);
            } catch (e) {
                attachment = null;
            }
        }
        if (!attachment || typeof attachment !== 'object') return null;
        return attachment;
    },

    // ==========================================
    // TASKS TAB (v33: linked tasks)
    // ==========================================

    async renderTasksTab() {
        const container = document.getElementById('od-tab-tasks');
        const orderId = this.currentOrder.id;
        const bundle = await loadWorkBundle();
        const projects = (bundle.projects || []).filter(project => String(project.linked_order_id || '') === String(orderId));
        const projectIds = new Set(projects.map(project => String(project.id)));
        const tasks = (bundle.tasks || []).filter(task =>
            String(task.order_id || '') === String(orderId)
            || projectIds.has(String(task.project_id || ''))
        );

        const projectCards = projects.length === 0
            ? '<div class="text-muted" style="font-size:13px;">Связанных проектов пока нет</div>'
            : projects.map(project => {
                const projectTasks = tasks.filter(task => String(task.project_id || '') === String(project.id));
                return `
                    <button class="od-project-card" onclick="App.navigate('projects', true, ${project.id})">
                        <div style="font-weight:700">${this._esc(project.title)}</div>
                        <div class="text-muted" style="font-size:12px">${this._esc(project.type || 'Другое')} · ${this._esc(WorkManagementCore.getProjectStatusLabel(project.status))}</div>
                        <div class="text-muted" style="font-size:12px">Задач: ${projectTasks.length} · Владелец: ${this._esc(project.owner_name || '—')}</div>
                    </button>
                `;
            }).join('');

        const taskRows = tasks.map(task => {
            const project = task.project_id ? projects.find(item => String(item.id) === String(task.project_id)) : null;
            return `
                <tr onclick="App.navigate('tasks', true, ${task.id})" style="cursor:pointer">
                    <td>
                        <div style="font-weight:600">${this._esc(task.title)}</div>
                        <div class="text-muted" style="font-size:12px">${this._esc(project ? `Проект: ${project.title}` : 'Прямая задача заказа')}</div>
                    </td>
                    <td><span class="badge">${this._esc(WorkManagementCore.getTaskStatusLabel(task.status))}</span></td>
                    <td style="font-size:12px">${this._esc(task.assignee_name || '—')}</td>
                    <td style="font-size:12px" class="${WorkManagementCore.isTaskOverdue(task) ? 'text-red' : ''}">${this._esc(task.due_date ? App.formatDate(task.due_date) + (task.due_time ? ' ' + task.due_time : '') : '—')}</td>
                </tr>
            `;
        }).join('');

        const inProgress = tasks.filter(task => task.status === 'in_progress').length;
        const done = tasks.filter(task => task.status === 'done').length;
        const total = tasks.length;

        container.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:12px;flex-wrap:wrap;">
                <div style="font-size:13px;color:var(--text-muted)">
                    Всего задач: <b>${total}</b> &nbsp;|&nbsp; В работе: <b>${inProgress}</b> &nbsp;|&nbsp; Готово: <b>${done}</b> &nbsp;|&nbsp; Проектов: <b>${projects.length}</b>
                </div>
                <div class="flex gap-8">
                    <button class="btn btn-sm btn-outline" onclick="Projects.openCreate({ linked_order_id: ${orderId} })">+ Проект</button>
                    <button class="btn btn-sm btn-success" onclick="Tasks.openCreate({ order_id: ${orderId}, primary_context_kind: 'order' })">+ Задача</button>
                </div>
            </div>

            <div class="card">
                <div class="card-header"><h3>Связанные проекты</h3></div>
                <div class="od-project-grid">${projectCards}</div>
            </div>

            ${tasks.length === 0
                ? `<div class="card"><div class="empty-state">
                        <div class="empty-icon">&#9745;</div>
                        <p>В этом заказе пока нет задач</p>
                        <button class="btn btn-sm btn-outline" onclick="Tasks.openCreate({ order_id: ${orderId}, primary_context_kind: 'order' })">Создать первую задачу</button>
                   </div></div>`
                : `<div class="card" style="padding:0"><div class="table-wrap"><table>
                    <thead><tr>
                        <th>Задача</th>
                        <th>Статус</th>
                        <th>Ответственный</th>
                        <th>Дедлайн</th>
                    </tr></thead>
                    <tbody>${taskRows}</tbody>
                   </table></div></div>`
            }`;
    },

    // ==========================================
    // CHINA TAB
    // ==========================================

    async renderChinaTab() {
        const container = document.getElementById('od-tab-china');
        const orderId = this.currentOrder.id;
        const orderName = this._esc(this.currentOrder.order_name || '');
        try {
            const purchases = await loadChinaPurchases({ order_id: orderId });

            const addBtn = `<div style="display:flex;justify-content:flex-end;margin-bottom:12px">
                <button class="btn btn-sm btn-success" onclick="App.navigate('china', true); setTimeout(() => { if(typeof ChinaPurchases!=='undefined') { ChinaPurchases.openNewForm(${orderId}); }}, 200);">+ Создать закупку для этого заказа</button>
            </div>`;

            if (!purchases || purchases.length === 0) {
                container.innerHTML = `
                    ${addBtn}
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">&#127464;&#127475;</div>
                            <p>Нет привязанных закупок из Китая</p>
                        </div>
                    </div>`;
                return;
            }
            container.innerHTML = `
                ${addBtn}
                <div class="card" style="padding:0">
                    <div class="table-wrap">
                        <table>
                            <thead><tr>
                                <th>Закупка</th>
                                <th>Поставщик</th>
                                <th>Статус</th>
                                <th>Сумма CNY</th>
                                <th>Трек</th>
                            </tr></thead>
                            <tbody>
                                ${purchases.map(p => {
                                    const st = (typeof ChinaPurchases !== 'undefined' && ChinaPurchases.STATUSES)
                                        ? ChinaPurchases.STATUSES.find(s => s.key === p.status)
                                        : null;
                                    return `<tr style="cursor:pointer" onclick="App.navigate('china', true); setTimeout(() => { if(typeof ChinaPurchases!=='undefined') { ChinaPurchases.openDetail(${p.id}); } }, 250);">
                                        <td><b>${this._esc(p.purchase_name || '')}</b></td>
                                        <td>${this._esc(p.supplier_name || '')}</td>
                                        <td>${st ? '<span class="badge badge-' + st.color + '">' + st.label + '</span>' : (p.status || '')}</td>
                                        <td class="text-right">${(p.total_cny || 0).toFixed(2)}</td>
                                        <td>${this._esc(p.tracking_number || '')}</td>
                                    </tr>`;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>`;
        } catch (e) {
            container.innerHTML = '<div class="card"><p class="text-muted" style="padding:16px">Ошибка загрузки закупок</p></div>';
        }
    },

    // ==========================================
    // ACTIONS
    // ==========================================

    async changeStatus() {
        const o = this.currentOrder;
        const opts = STATUS_OPTIONS.filter(s => s.value !== 'deleted' && s.value !== o.status);
        const labels = opts.map((s, i) => `${i + 1}. ${s.label}`).join('\n');
        const choice = prompt(`Текущий статус: ${App.statusLabel(o.status)}\n\nВыберите новый:\n${labels}\n\nВведите номер:`);
        if (!choice) return;

        const idx = parseInt(choice) - 1;
        if (isNaN(idx) || idx < 0 || idx >= opts.length) {
            App.toast('Неверный выбор');
            return;
        }

        const newStatus = opts[idx].value;
        if (typeof Orders !== 'undefined' && Orders && typeof Orders._ensureStatusTransitionAllowed === 'function') {
            const guard = await Orders._ensureStatusTransitionAllowed(this.currentOrder.id, newStatus);
            if (!guard.ok) return;
        }
        const managerName = prompt('Имя менеджера (для истории):') || 'Неизвестный';

        await updateOrderStatus(this.currentOrder.id, newStatus);
        if (typeof Orders !== 'undefined' && Orders._syncWarehouseByStatus) {
            await Orders._syncWarehouseByStatus(
                this.currentOrder.id,
                o.status,
                newStatus,
                this.currentOrder.order_name || o.order_name,
                managerName
            );
            if (Orders._syncReadyGoodsByStatus) {
                await Orders._syncReadyGoodsByStatus(this.currentOrder.id, this.currentOrder, o.status, newStatus);
            }
        }
        await Orders.addChangeRecord(this.currentOrder.id, {
            field: 'status',
            old_value: App.statusLabel(o.status),
            new_value: App.statusLabel(newStatus),
            manager: managerName,
        });

        this.currentOrder.status = newStatus;
        this.renderHeader();
        App.toast(`Статус: ${App.statusLabel(newStatus)}`);
    },

    openInCalculator() {
        if (this.currentOrder) {
            Calculator.loadOrder(this.currentOrder.id);
        }
    },

    cloneOrder() {
        if (this.currentOrder) {
            Orders.cloneOrder(this.currentOrder.id);
        }
    },

    // ==========================================
    // INLINE EDIT HELPERS
    // ==========================================

    async saveField(field, value) {
        await updateOrderFields(this.currentOrder.id, { [field]: value });
        this.currentOrder[field] = value;

        // Re-render current tab
        const tabRenderers = {
            info: () => this.renderInfoTab(),
            production: () => this.renderProductionTab(),
            files: () => this.renderFilesTab(),
            hardware: () => this.renderHardwareTab(),
        };
        if (tabRenderers[this.currentTab]) tabRenderers[this.currentTab]();
        if (['payment_status'].includes(field)) this.renderStats();

        App.toast('Сохранено');
    },

    startEdit(field, currentValue, inputType) {
        const cell = document.getElementById('od-val-' + field);
        if (!cell) return;
        cell.classList.add('od-editing');

        if (inputType === 'textarea') {
            cell.innerHTML = `<textarea class="od-inline-input" onblur="OrderDetail.finishEdit('${field}', this.value)" style="width:100%;min-height:60px;font-size:13px;padding:6px 8px;border:1px solid var(--accent);border-radius:6px;resize:vertical;">${this._esc(currentValue || '')}</textarea>`;
        } else {
            cell.innerHTML = `<input class="od-inline-input" type="${inputType === 'url' ? 'url' : 'text'}" value="${this._escAttr(currentValue || '')}" onblur="OrderDetail.finishEdit('${field}', this.value)" onkeydown="if(event.key==='Enter'){this.blur();}" style="width:100%;font-size:13px;padding:6px 8px;border:1px solid var(--accent);border-radius:6px;">`;
        }
        cell.querySelector('.od-inline-input').focus();
    },

    finishEdit(field, value) {
        const trimmed = value.trim();
        if (trimmed !== (this.currentOrder[field] || '').toString().trim()) {
            this.saveField(field, trimmed);
        } else {
            // Revert — re-render tab
            const tabRenderers = {
                info: () => this.renderInfoTab(),
                production: () => this.renderProductionTab(),
                files: () => this.renderFilesTab(),
                hardware: () => this.renderHardwareTab(),
            };
            if (tabRenderers[this.currentTab]) tabRenderers[this.currentTab]();
        }
    },

    startEditDate(field, currentValue) {
        const cell = document.getElementById('od-val-' + field);
        if (!cell) return;
        cell.innerHTML = `<input type="date" value="${currentValue || ''}" onblur="OrderDetail.finishEdit('${field}', this.value)" onchange="OrderDetail.finishEdit('${field}', this.value)" style="font-size:13px;padding:4px 8px;border:1px solid var(--accent);border-radius:6px;">`;
        cell.querySelector('input').focus();
    },

    onSelectChange(field, value) {
        this.saveField(field, value);
    },

    onCheckboxChange(field, checked) {
        this.saveField(field, checked);
    },

    // ==========================================
    // FIELD RENDERERS
    // ==========================================

    _fieldRow(field, label, value, inputType) {
        let displayValue = '';
        if (inputType === 'url' && value) {
            const shortUrl = value.length > 50 ? value.substring(0, 50) + '...' : value;
            displayValue = `<a href="${this._escAttr(value)}" target="_blank" class="od-url-link">${this._esc(shortUrl)}</a>`;
        } else {
            displayValue = this._esc(value || '') || '<span class="text-muted">—</span>';
        }

        return `
        <div class="od-field-row" onclick="OrderDetail.startEdit('${field}', ${JSON.stringify(value || '').replace(/'/g, "\\'")}, '${inputType}')" style="cursor:pointer" title="Нажмите для редактирования">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value" id="od-val-${field}">${displayValue}</div>
        </div>`;
    },

    _fieldRowDateRange(fieldStart, fieldEnd, label, valueStart, valueEnd) {
        const fmtStart = valueStart ? App.formatDate(valueStart) : '—';
        const fmtEnd = valueEnd ? App.formatDate(valueEnd) : '';
        const display = fmtEnd ? `${fmtStart} → ${fmtEnd}` : fmtStart;

        return `
        <div class="od-field-row">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value" style="display:flex;gap:8px;align-items:center;justify-content:flex-end;">
                <span id="od-val-${fieldStart}" onclick="OrderDetail.startEditDate('${fieldStart}', '${valueStart || ''}')" style="cursor:pointer" title="Нажмите для изменения">${fmtStart}</span>
                <span>→</span>
                <span id="od-val-${fieldEnd}" onclick="OrderDetail.startEditDate('${fieldEnd}', '${valueEnd || ''}')" style="cursor:pointer" title="Нажмите для изменения">${fmtEnd || '<span class=text-muted>—</span>'}</span>
            </div>
        </div>`;
    },

    _fieldRowSelect(field, label, value, options) {
        const opts = options.map(o =>
            `<option value="${o.key}" ${o.key === value ? 'selected' : ''}>${o.label}</option>`
        ).join('');

        return `
        <div class="od-field-row">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value">
                <select class="od-status-select" onchange="OrderDetail.onSelectChange('${field}', this.value)">
                    ${opts}
                </select>
            </div>
        </div>`;
    },

    _fieldRowCheckbox(field, label, checked) {
        return `
        <div class="od-field-row">
            <div class="od-field-label">${label}</div>
            <div class="od-field-value">
                <input type="checkbox" ${checked ? 'checked' : ''} onchange="OrderDetail.onCheckboxChange('${field}', this.checked)" style="width:18px;height:18px;cursor:pointer;">
            </div>
        </div>`;
    },

    // ==========================================
    // UTILS
    // ==========================================

    _statusColor(status) {
        const map = { draft: 'gray', calculated: 'blue', in_production: 'orange', production_printing: 'orange', completed: 'green', cancelled: 'red', deleted: 'red' };
        return map[status] || 'gray';
    },

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    _escAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
};

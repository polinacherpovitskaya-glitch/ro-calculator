// =============================================
// Recycle Object — China Purchases Page
// =============================================

const ChinaPurchases = {
    allPurchases: [],
    allShipments: [],
    currentView: 'dashboard',
    editingPurchaseId: null,
    consolidationEditingShipmentId: null,
    consolidationSelection: {},
    itemCounter: 0,
    _pendingBoxPdfName: null,
    _pendingBoxPdfData: null,

    STATUSES: [
        { key: 'ordered',            label: 'Заказано',           color: 'accent',  icon: '&#128722;' },
        { key: 'in_china_warehouse', label: 'На складе в Китае',  color: 'yellow',  icon: '&#128230;' },
        { key: 'in_transit',         label: 'В пути',             color: 'blue',    icon: '&#9992;'   },
        { key: 'delivered',          label: 'Доставлено',         color: 'green',   icon: '&#10003;'  },
        { key: 'received',           label: 'Принято на склад',   color: 'green',   icon: '&#9745;'   },
    ],

    DELIVERY_TYPES: [
        { key: 'auto_slow', label: 'Авто (долго)',    days: '35-50' },
        { key: 'air_fast',  label: 'Авиа (быстро)',   days: '7-12' },
        { key: 'air',       label: 'Авиа (обычная)',  days: '10-18' },
        { key: 'auto_fast', label: 'Авто быстро',     days: '20-30' },
    ],

    // ==========================================
    // LIFECYCLE
    // ==========================================

    async load() {
        this.allPurchases = await loadChinaPurchases({});
        this.allShipments = await loadShipments();
        this.allPurchases = this.allPurchases.map(p => {
            if (!p) return p;
            if (p.status === 'consolidating') p.status = 'in_transit';
            return p;
        });
        this.showView(this.currentView);
    },

    showView(view) {
        this.currentView = view;
        document.querySelectorAll('.china-view').forEach(el => el.style.display = 'none');
        document.querySelectorAll('.china-tab').forEach(el => {
            el.classList.toggle('active', el.dataset.view === view);
        });

        switch (view) {
            case 'dashboard':
                document.getElementById('china-view-dashboard').style.display = '';
                this.renderDashboard();
                break;
            case 'list':
                document.getElementById('china-view-list').style.display = '';
                this.renderList();
                break;
            case 'consolidation':
                document.getElementById('china-view-consolidation').style.display = '';
                this.renderConsolidationView();
                break;
            case 'form':
                document.getElementById('china-view-form').style.display = '';
                break;
            case 'detail':
                document.getElementById('china-view-detail').style.display = '';
                break;
        }
    },

    // ==========================================
    // HELPERS
    // ==========================================

    statusLabel(status) {
        const s = this.STATUSES.find(s => s.key === status);
        return s ? s.label : status || '—';
    },

    statusColor(status) {
        const s = this.STATUSES.find(s => s.key === status);
        return s ? s.color : 'muted';
    },

    boxStatusLabel(status) {
        const map = {
            draft: 'Черновик коробки',
            in_transit: 'В пути',
            delivered: 'Доставлено',
            received: 'Принято на склад',
        };
        return map[status] || 'Черновик коробки';
    },

    deliveryLabel(type) {
        const d = this.DELIVERY_TYPES.find(d => d.key === type);
        return d ? d.label : type || '—';
    },

    formatCny(n) {
        if (!n) return '0 \u00A5';
        return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n) + ' \u00A5';
    },

    _proxyPhoto(url) {
        if (!url) return '';
        if (url.includes('alicdn.com') || url.includes('1688.com')) {
            return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&w=80&h=80&fit=cover&default=1';
        }
        return url;
    },

    _normStr(v) {
        return String(v || '').trim().toLowerCase();
    },

    _resolveItemPhoto(item) {
        const direct = this._proxyPhoto(item && item.photo_url ? item.photo_url : '');
        if (direct) return direct;

        try {
            const catalog = getLocal('ro_calc_china_catalog') || [];
            const itemName = this._normStr(item && item.name);
            if (!itemName) return '';
            const match = catalog.find(c => this._normStr(c.name) === itemName && c.photo_url);
            return match ? this._proxyPhoto(match.photo_url) : '';
        } catch (e) {
            return '';
        }
    },

    esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _selectedConsolidationIds() {
        return Object.entries(this.consolidationSelection || {})
            .filter(([, selected]) => !!selected)
            .map(([id]) => parseInt(id, 10))
            .filter(Boolean);
    },

    _findShipment(id) {
        return (this.allShipments || []).find(sh => String(sh.id) === String(id)) || null;
    },

    _getBoxStatus(shipment) {
        if (!shipment) return 'draft';
        if (shipment.status === 'received') return 'received';
        return shipment.china_box_status || 'draft';
    },

    _getChinaBoxes() {
        return (this.allShipments || []).filter(sh => sh && sh.source === 'china_consolidation');
    },

    _appendStatusHistory(purchase, status, note) {
        purchase.status_history = Array.isArray(purchase.status_history) ? purchase.status_history : [];
        purchase.status_history.push({
            status,
            date: new Date().toISOString(),
            note: note || '',
        });
    },

    _availableConsolidationPurchases() {
        const editingShipmentId = this.consolidationEditingShipmentId;
        return (this.allPurchases || []).filter(p => {
            if (!p) return false;
            if (editingShipmentId && String(p.shipment_id || '') === String(editingShipmentId)) return true;
            return p.status === 'in_china_warehouse';
        });
    },

    _buildShipmentItemsFromPurchases(purchases) {
        const items = [];
        (purchases || []).forEach(purchase => {
            const rows = Array.isArray(purchase.items) ? purchase.items : [];
            const purchaseTotal = rows.reduce((sum, item) => {
                return sum + ((parseFloat(item.qty) || 0) * (parseFloat(item.price_cny) || 0));
            }, 0);
            const localDelivery = parseFloat(purchase.delivery_cost_cny) || 0;
            const fallbackDivisor = rows.length || 1;

            rows.forEach((item, index) => {
                const qty = parseFloat(item.qty) || 0;
                const priceCny = parseFloat(item.price_cny) || 0;
                const lineTotal = qty * priceCny;
                let deliveryShare = 0;
                if (localDelivery > 0) {
                    if (purchaseTotal > 0 && lineTotal > 0) {
                        deliveryShare = localDelivery * (lineTotal / purchaseTotal);
                    } else {
                        deliveryShare = localDelivery / fallbackDivisor;
                    }
                }

                items.push({
                    source: item.warehouse_item_id ? 'existing' : 'new',
                    warehouse_item_id: item.warehouse_item_id || null,
                    name: item.name || `Позиция ${index + 1}`,
                    sku: item.sku || '',
                    category: item.category || 'other',
                    size: item.size || '',
                    color: item.color || '',
                    unit: item.unit || 'шт',
                    photo_url: item.photo_url || '',
                    photo_thumbnail: '',
                    qty_received: qty,
                    weight_grams: parseFloat(item.weight_grams) || 0,
                    purchase_price_cny: Math.round((lineTotal + deliveryShare) * 100) / 100,
                    purchase_price_rub: 0,
                    delivery_allocated: 0,
                    total_cost_per_unit: 0,
                    china_purchase_id: purchase.id,
                    china_purchase_name: purchase.purchase_name || '',
                    notes: purchase.purchase_name ? `Закупка: ${purchase.purchase_name}` : '',
                });
            });
        });
        return items;
    },

    _buildShipmentSupplier(purchases) {
        const suppliers = [...new Set((purchases || []).map(p => String(p.supplier_name || '').trim()).filter(Boolean))];
        if (!suppliers.length) return 'Склад в Китае';
        if (suppliers.length === 1) return suppliers[0];
        return suppliers.slice(0, 3).join(', ') + (suppliers.length > 3 ? '…' : '');
    },

    // ==========================================
    // DASHBOARD VIEW
    // ==========================================

    renderDashboard() {
        const all = this.allPurchases;
        const boxes = this._getChinaBoxes();
        const counts = {};
        this.STATUSES.forEach(s => counts[s.key] = 0);
        all.forEach(p => {
            if (p.status === 'ordered' || p.status === 'in_china_warehouse') {
                if (counts[p.status] !== undefined) counts[p.status]++;
            }
        });
        boxes.forEach(box => {
            const boxStatus = this._getBoxStatus(box);
            if (counts[boxStatus] !== undefined) counts[boxStatus]++;
        });

        // Pipeline
        const pipeEl = document.getElementById('china-pipeline');
        pipeEl.innerHTML = this.STATUSES.map(s => `
            <div class="china-pipe-step ${counts[s.key] > 0 ? 'has-items' : ''}"
                 onclick="ChinaPurchases.filterByStatus('${s.key}')">
                <div class="china-pipe-count" style="color:var(--${s.color})">${counts[s.key]}</div>
                <div class="china-pipe-label">${s.label}</div>
            </div>
        `).join('<div class="china-pipe-arrow">&#8594;</div>');

        // Stats
        let totalCny = 0, deliveryCny = 0, inTransit = 0;
        all.forEach(p => {
            totalCny += p.total_cny || 0;
            deliveryCny += p.delivery_cost_cny || 0;
        });
        inTransit = boxes.filter(box => this._getBoxStatus(box) === 'in_transit').length;
        document.getElementById('china-stat-total').textContent = all.length;
        document.getElementById('china-stat-transit').textContent = inTransit;
        document.getElementById('china-stat-cny').textContent = this.formatCny(totalCny);
        document.getElementById('china-stat-delivery').textContent = this.formatCny(deliveryCny);

        // Recent table
        const tbody = document.getElementById('china-recent-body');
        const recent = [...all]
            .sort((a, b) => new Date(b.date || b.created_at || 0) - new Date(a.date || a.created_at || 0))
            .slice(0, 5);
        if (recent.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">Нет закупок. Нажмите «+ Новая закупка»</td></tr>';
            return;
        }
        tbody.innerHTML = recent.map(p => `
            <tr style="cursor:pointer" onclick="ChinaPurchases.openDetail(${p.id})">
                <td><strong>${this.esc(p.purchase_name)}</strong></td>
                <td>${this.esc(p.supplier_name || '—')}</td>
                <td><span class="china-dot ${p.status}"></span>${this.statusLabel(p.status)}</td>
                <td>${this.deliveryLabel(p.delivery_type)}</td>
                <td class="text-right">${this.formatCny(p.total_cny)}</td>
                <td>${App.formatDate(p.date)}</td>
            </tr>
        `).join('');
    },

    filterByStatus(status) {
        if (['in_transit', 'delivered', 'received'].includes(status)) {
            const boxFilter = document.getElementById('china-box-filter-status');
            if (boxFilter) boxFilter.value = status;
            this.openConsolidation();
            return;
        }
        document.getElementById('china-filter-status').value = status;
        this.showView('list');
    },

    // ==========================================
    // LIST VIEW
    // ==========================================

    renderList() {
        const status = document.getElementById('china-filter-status').value;
        const delivery = document.getElementById('china-filter-delivery').value;
        const q = (document.getElementById('china-search').value || '').toLowerCase().trim();

        let list = [...this.allPurchases].filter(p => p.status !== 'in_transit' && p.status !== 'delivered' && p.status !== 'received');
        if (status) list = list.filter(p => p.status === status);
        if (delivery) list = list.filter(p => p.delivery_type === delivery);
        if (q) list = list.filter(p =>
            (p.purchase_name || '').toLowerCase().includes(q)
            || (p.supplier_name || '').toLowerCase().includes(q)
            || (p.order_name || '').toLowerCase().includes(q)
            || ((p.shipment_id ? (this._findShipment(p.shipment_id)?.china_tracking_number || '') : '')).toLowerCase().includes(q)
        );

        const tbody = document.getElementById('china-list-body');
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:32px;">Нет закупок по фильтру</td></tr>';
            return;
        }
        tbody.innerHTML = list.map(p => `<tr>
            <td><a href="#" onclick="ChinaPurchases.openDetail(${p.id});return false" style="color:var(--accent);font-weight:600;text-decoration:none;">${this.esc(p.purchase_name)}</a></td>
            <td>${this.esc(p.supplier_name || '—')}</td>
            <td>${this.esc(p.order_name || '—')}</td>
            <td><span class="china-dot ${p.status}"></span>${this.statusLabel(p.status)}</td>
            <td>${p.shipment_id ? this.deliveryLabel(this._findShipment(p.shipment_id)?.china_delivery_type) : '—'}</td>
            <td class="text-right">${this.formatCny(p.total_cny)}</td>
            <td>${this.esc((p.shipment_id ? this._findShipment(p.shipment_id)?.china_tracking_number : '') || '—')}</td>
            <td>
                <div class="flex gap-4" style="justify-content:flex-end">
                    <button class="btn btn-sm btn-outline" onclick="ChinaPurchases.openForm(${p.id})" title="Редактировать">&#9998;</button>
                    <button class="btn btn-sm btn-outline" onclick="ChinaPurchases.confirmDelete(${p.id})" title="Удалить" style="color:var(--red);">&#10005;</button>
                </div>
            </td>
        </tr>`).join('');
    },

    applyFilters() { this.renderList(); },

    // ==========================================
    // CONSOLIDATION VIEW
    // ==========================================

    async openConsolidation(purchaseIds = [], shipmentId = null) {
        if (!Array.isArray(purchaseIds)) purchaseIds = purchaseIds ? [purchaseIds] : [];
        this.allPurchases = await loadChinaPurchases({});
        this.allShipments = await loadShipments();
        this.resetConsolidationForm(false);

        if (shipmentId) {
            const shipment = this._findShipment(shipmentId);
            this.consolidationEditingShipmentId = shipmentId;
            const linkedIds = (shipment && Array.isArray(shipment.china_purchase_ids) && shipment.china_purchase_ids.length)
                ? shipment.china_purchase_ids
                : this.allPurchases.filter(p => String(p.shipment_id || '') === String(shipmentId)).map(p => p.id);
            this.consolidationSelection = {};
            linkedIds.forEach(id => { this.consolidationSelection[id] = true; });
            if (shipment) {
                document.getElementById('china-cons-name').value = shipment.shipment_name || '';
                document.getElementById('china-cons-date').value = shipment.date || App.todayLocalYMD();
                document.getElementById('china-cons-supplier').value = shipment.supplier || '';
                document.getElementById('china-cons-type').value = shipment.china_delivery_type || '';
                document.getElementById('china-cons-days').value = shipment.china_estimated_days || '';
                document.getElementById('china-cons-tracking').value = shipment.china_tracking_number || '';
                document.getElementById('china-cons-estimated-usd').value = shipment.china_delivery_estimated_usd || '';
                document.getElementById('china-cons-delivery-rub').value = shipment.delivery_china_to_russia || 0;
                document.getElementById('china-cons-moscow-rub').value = shipment.delivery_moscow || 0;
                document.getElementById('china-cons-notes').value = shipment.notes || '';
                this._pendingBoxPdfName = shipment.waybill_pdf_name || null;
                this._pendingBoxPdfData = shipment.waybill_pdf_data || null;
                const pdfInfo = document.getElementById('china-cons-pdf-info');
                if (pdfInfo) pdfInfo.textContent = this._pendingBoxPdfName || 'Файл не выбран';
            }
        } else {
            this.consolidationEditingShipmentId = null;
            this.consolidationSelection = {};
            purchaseIds.forEach(id => { this.consolidationSelection[id] = true; });
            if (purchaseIds.length === 1) {
                const purchase = this.allPurchases.find(p => String(p.id) === String(purchaseIds[0]));
                if (purchase) {
                    document.getElementById('china-cons-name').value = `Коробка: ${purchase.purchase_name || 'закупка'}`;
                    document.getElementById('china-cons-supplier').value = purchase.supplier_name || '';
                }
            }
        }

        this.showView('consolidation');
    },

    resetConsolidationForm(clearSelection = true) {
        if (clearSelection) this.consolidationSelection = {};
        this.consolidationEditingShipmentId = null;
        this._pendingBoxPdfName = null;
        this._pendingBoxPdfData = null;
        const today = App.todayLocalYMD();
        const defaults = {
            'china-cons-name': '',
            'china-cons-date': today,
            'china-cons-supplier': '',
            'china-cons-type': '',
            'china-cons-days': '',
            'china-cons-tracking': '',
            'china-cons-estimated-usd': '',
            'china-cons-delivery-rub': '',
            'china-cons-moscow-rub': '',
            'china-cons-notes': '',
        };
        Object.entries(defaults).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        });
        const btn = document.getElementById('china-cons-open-shipment-btn');
        if (btn) btn.style.display = 'none';
        const pdfInfo = document.getElementById('china-cons-pdf-info');
        if (pdfInfo) pdfInfo.textContent = 'Файл не выбран';
        if (this.currentView === 'consolidation') this.renderConsolidationView();
    },

    toggleConsolidationPurchase(purchaseId, checked) {
        this.consolidationSelection[purchaseId] = !!checked;
        this.renderConsolidationView();
    },

    renderConsolidationView() {
        const available = this._availableConsolidationPurchases();
        const listEl = document.getElementById('china-cons-purchase-list');
        const selectedIds = this._selectedConsolidationIds();
        const selectedSet = new Set(selectedIds.map(String));

        const btn = document.getElementById('china-cons-open-shipment-btn');
        if (btn) btn.style.display = this.consolidationEditingShipmentId ? '' : 'none';

        if (!available.length) {
            listEl.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">Нет закупок на складе в Китае для сборки коробки.</div>';
        } else {
            listEl.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px;">${available.map(p => {
                const checked = selectedSet.has(String(p.id));
                const itemCount = Array.isArray(p.items) ? p.items.length : 0;
                const localDelivery = parseFloat(p.delivery_cost_cny) || 0;
                const linkedBadge = p.shipment_id ? `<span class="china-badge china-badge-${String(p.shipment_id) === String(this.consolidationEditingShipmentId) ? 'blue' : 'yellow'}" style="font-size:11px;">${String(p.shipment_id) === String(this.consolidationEditingShipmentId) ? 'В этой коробке' : 'Уже в коробке'}</span>` : '';
                return `
                    <label style="display:block;border:1px solid ${checked ? 'var(--accent)' : 'var(--border)'};border-radius:10px;padding:12px;background:${checked ? 'rgba(59,130,246,0.05)' : 'var(--card-bg)'};cursor:pointer;">
                        <div style="display:flex;align-items:flex-start;gap:10px;">
                            <input type="checkbox" ${checked ? 'checked' : ''} onchange="ChinaPurchases.toggleConsolidationPurchase(${p.id}, this.checked)" style="margin-top:4px;">
                            <div style="flex:1;min-width:0;">
                                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                    <strong>${this.esc(p.purchase_name || 'Без названия')}</strong>
                                    <span class="china-dot ${p.status}"></span>
                                    <span style="font-size:12px;color:var(--text-muted);">${this.statusLabel(p.status)}</span>
                                    ${linkedBadge}
                                </div>
                                <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${this.esc(p.supplier_name || 'Без поставщика')} · ${itemCount} поз. · Товары ${this.formatCny(p.total_cny)} · Доставка по магазину ${this.formatCny(localDelivery)}</div>
                                ${p.order_name ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Проект: ${this.esc(p.order_name)}</div>` : ''}
                            </div>
                        </div>
                    </label>
                `;
            }).join('')}</div>`;
        }

        document.getElementById('china-cons-count').textContent = `Выбрано: ${selectedIds.length}`;
        this.renderConsolidationSummary();
        this.renderBoxesList();
    },

    renderConsolidationSummary() {
        const selectedIds = this._selectedConsolidationIds();
        const selectedPurchases = (this.allPurchases || []).filter(p => selectedIds.includes(p.id));
        const summaryEl = document.getElementById('china-cons-summary');
        if (!selectedPurchases.length) {
            summaryEl.innerHTML = '<span style="color:var(--text-muted);">Ничего не выбрано</span>';
            return;
        }

        const items = this._buildShipmentItemsFromPurchases(selectedPurchases);
        const totalCny = items.reduce((sum, item) => sum + (parseFloat(item.purchase_price_cny) || 0), 0);
        const totalQty = items.reduce((sum, item) => sum + (parseFloat(item.qty_received) || 0), 0);
        const localDeliveryCny = selectedPurchases.reduce((sum, p) => sum + (parseFloat(p.delivery_cost_cny) || 0), 0);
        const totalWeight = items.reduce((sum, item) => sum + (parseFloat(item.weight_grams) || 0), 0);
        const deliveryRub = (parseFloat(document.getElementById('china-cons-delivery-rub').value) || 0)
            + (parseFloat(document.getElementById('china-cons-moscow-rub').value) || 0);
        const estimatedUsd = parseFloat(document.getElementById('china-cons-estimated-usd').value) || 0;

        summaryEl.innerHTML = `
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;">
                <div><div style="font-size:12px;color:var(--text-muted);">Закупок</div><div style="font-weight:700;">${selectedPurchases.length}</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">Позиций в коробке</div><div style="font-weight:700;">${items.length}</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">Общее кол-во</div><div style="font-weight:700;">${new Intl.NumberFormat('ru-RU').format(totalQty)}</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">Товары + локал. доставка</div><div style="font-weight:700;">${this.formatCny(totalCny)}</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">Локальная доставка CNY</div><div style="font-weight:700;">${this.formatCny(localDeliveryCny)}</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">Вес в приёмке</div><div style="font-weight:700;">${new Intl.NumberFormat('ru-RU').format(totalWeight)} г</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">План перевозки USD</div><div style="font-weight:700;">${estimatedUsd ? new Intl.NumberFormat('ru-RU').format(estimatedUsd) + ' $' : '—'}</div></div>
                <div><div style="font-size:12px;color:var(--text-muted);">Доставка RUB на коробку</div><div style="font-weight:700;">${Math.round(deliveryRub).toLocaleString('ru-RU')} ₽</div></div>
            </div>
        `;
    },

    renderBoxesList() {
        const container = document.getElementById('china-boxes-list');
        if (!container) return;
        const filterStatus = document.getElementById('china-box-filter-status')?.value || '';
        let boxes = this._getChinaBoxes().sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0));
        if (filterStatus) boxes = boxes.filter(box => this._getBoxStatus(box) === filterStatus);

        if (!boxes.length) {
            container.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center;">Нет коробок по выбранному фильтру.</div>';
            return;
        }

        container.innerHTML = `<div class="table-container"><table>
            <thead><tr><th>Коробка</th><th>Статус</th><th>Доставка</th><th>Трек</th><th class="text-right">Факт RUB</th><th>PDF</th><th></th></tr></thead>
            <tbody>${boxes.map(box => {
                const status = this._getBoxStatus(box);
                const pdfHtml = box.waybill_pdf_name && box.waybill_pdf_data
                    ? `<a href="${box.waybill_pdf_data}" download="${this.esc(box.waybill_pdf_name)}" style="color:var(--accent);">PDF</a>`
                    : '—';
                const nextAction = status === 'draft'
                    ? `<button class="btn btn-sm btn-primary" onclick="ChinaPurchases.updateBoxStatus(${box.id}, 'in_transit')">В путь</button>`
                    : status === 'in_transit'
                        ? `<button class="btn btn-sm btn-primary" onclick="ChinaPurchases.updateBoxStatus(${box.id}, 'delivered')">Доставлено</button>`
                        : status === 'delivered'
                            ? `<button class="btn btn-sm btn-outline" onclick="ChinaPurchases.openLinkedShipment(${box.id})">Приёмка</button>`
                            : `<button class="btn btn-sm btn-outline" onclick="ChinaPurchases.openLinkedShipment(${box.id})">Открыть</button>`;
                return `<tr>
                    <td><a href="#" onclick="ChinaPurchases.openConsolidation([], ${box.id});return false" style="color:var(--accent);font-weight:600;text-decoration:none;">${this.esc(box.shipment_name || ('Коробка #' + box.id))}</a></td>
                    <td>${this.boxStatusLabel(status)}</td>
                    <td>${this.deliveryLabel(box.china_delivery_type)}</td>
                    <td>${this.esc(box.china_tracking_number || '—')}</td>
                    <td class="text-right">${Math.round(box.delivery_china_to_russia || 0).toLocaleString('ru-RU')} ₽</td>
                    <td>${pdfHtml}</td>
                    <td><div class="flex gap-4" style="justify-content:flex-end;">${nextAction}</div></td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`;
    },

    async updateBoxStatus(shipmentId, status) {
        const shipment = this._findShipment(shipmentId);
        if (!shipment) return;
        shipment.china_box_status = status;
        shipment.status = status;
        await saveShipment(shipment);
        const linkedIds = Array.isArray(shipment.china_purchase_ids)
            ? shipment.china_purchase_ids
            : this.allPurchases.filter(p => String(p.shipment_id || '') === String(shipmentId)).map(p => p.id);
        for (const purchaseId of linkedIds) {
            const purchase = await loadChinaPurchase(purchaseId);
            if (!purchase) continue;
            purchase.status = status;
            purchase.shipment_id = shipmentId;
            purchase.delivery_type = shipment.china_delivery_type || '';
            purchase.tracking_number = shipment.china_tracking_number || '';
            purchase.estimated_days = shipment.china_estimated_days || 0;
            this._appendStatusHistory(purchase, status, `Статус коробки «${shipment.shipment_name || ''}»`);
            await saveChinaPurchase(purchase);
        }
        this.allPurchases = await loadChinaPurchases({});
        this.allShipments = await loadShipments();
        this.renderBoxesList();
        App.toast(`Коробка: ${this.boxStatusLabel(status)}`);
    },

    handleBoxPdfUpload(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 500 * 1024) {
            App.toast('PDF слишком большой (макс. 500 КБ)');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            this._pendingBoxPdfName = file.name;
            this._pendingBoxPdfData = e.target.result;
            const info = document.getElementById('china-cons-pdf-info');
            if (info) info.textContent = file.name + ' (' + Math.round(file.size / 1024) + ' КБ)';
        };
        reader.readAsDataURL(file);
    },

    async saveConsolidation() {
        const selectedIds = this._selectedConsolidationIds();
        if (!selectedIds.length) {
            App.toast('Выберите хотя бы одну закупку');
            return;
        }

        const shipmentName = (document.getElementById('china-cons-name').value || '').trim();
        if (!shipmentName) {
            App.toast('Укажите название коробки');
            return;
        }

        const selectedPurchases = (this.allPurchases || []).filter(p => selectedIds.includes(p.id));
        const shipmentItems = this._buildShipmentItemsFromPurchases(selectedPurchases);
        if (!shipmentItems.length) {
            App.toast('В выбранных закупках нет позиций');
            return;
        }

        const currentShipment = this.consolidationEditingShipmentId ? this._findShipment(this.consolidationEditingShipmentId) : null;
        const rate = currentShipment?.cny_rate || selectedPurchases.find(p => p.cny_rate)?.cny_rate || App?.params?.china_cny_rate || 12.5;
        const feeCashout = currentShipment?.fee_cashout_percent ?? 1.5;
        const feeCrypto = currentShipment?.fee_crypto_percent ?? 2;
        const fee1688 = currentShipment?.fee_1688_percent ?? 3;
        const feeTotalPct = feeCashout + feeCrypto + fee1688;
        const totalPurchaseCny = shipmentItems.reduce((sum, item) => sum + (parseFloat(item.purchase_price_cny) || 0), 0);
        const chinaRub = parseFloat(document.getElementById('china-cons-delivery-rub').value) || 0;
        const moscowRub = parseFloat(document.getElementById('china-cons-moscow-rub').value) || 0;
        const estimatedUsd = parseFloat(document.getElementById('china-cons-estimated-usd').value) || 0;
        const shipmentData = {
            id: currentShipment?.id,
            date: document.getElementById('china-cons-date').value || App.todayLocalYMD(),
            shipment_name: shipmentName,
            supplier: (document.getElementById('china-cons-supplier').value || '').trim() || this._buildShipmentSupplier(selectedPurchases),
            total_purchase_cny: Math.round(totalPurchaseCny * 100) / 100,
            cny_rate: rate,
            fee_cashout_percent: feeCashout,
            fee_crypto_percent: feeCrypto,
            fee_1688_percent: fee1688,
            fee_total_percent: feeTotalPct,
            total_purchase_rub: totalPurchaseCny * rate * (1 + feeTotalPct / 100),
            delivery_china_to_russia: chinaRub,
            delivery_moscow: moscowRub,
            customs_fees: currentShipment?.customs_fees || 0,
            total_delivery: chinaRub + moscowRub,
            pricing_mode: currentShipment?.pricing_mode || 'weighted_avg',
            total_weight_grams: shipmentItems.reduce((sum, item) => sum + (parseFloat(item.weight_grams) || 0), 0),
            items: shipmentItems,
            notes: (document.getElementById('china-cons-notes').value || '').trim(),
            status: currentShipment?.status || currentShipment?.china_box_status || 'in_transit',
            china_box_status: currentShipment?.china_box_status || currentShipment?.status || 'in_transit',
            source: 'china_consolidation',
            china_purchase_ids: selectedIds,
            china_delivery_type: document.getElementById('china-cons-type').value || '',
            china_estimated_days: parseInt(document.getElementById('china-cons-days').value, 10) || 0,
            china_tracking_number: (document.getElementById('china-cons-tracking').value || '').trim(),
            china_delivery_estimated_usd: estimatedUsd,
            waybill_pdf_name: this._pendingBoxPdfName || currentShipment?.waybill_pdf_name || '',
            waybill_pdf_data: this._pendingBoxPdfData || currentShipment?.waybill_pdf_data || '',
        };

        const shipmentId = await saveShipment(shipmentData);
        const previousSelectedIds = currentShipment && Array.isArray(currentShipment.china_purchase_ids)
            ? currentShipment.china_purchase_ids.map(id => parseInt(id, 10)).filter(Boolean)
            : this.allPurchases.filter(p => String(p.shipment_id || '') === String(this.consolidationEditingShipmentId)).map(p => p.id);
        const removedIds = previousSelectedIds.filter(id => !selectedIds.includes(id));

        const purchaseTotals = selectedPurchases.map(p => ({
            id: p.id,
            grandCny: (parseFloat(p.total_cny) || 0) + (parseFloat(p.delivery_cost_cny) || 0),
        }));
        const grandCnyTotal = purchaseTotals.reduce((sum, row) => sum + row.grandCny, 0);

        for (const purchase of selectedPurchases) {
            const next = JSON.parse(JSON.stringify(purchase));
            next.shipment_id = shipmentId;
            next.delivery_type = shipmentData.china_delivery_type || next.delivery_type || '';
            next.estimated_days = shipmentData.china_estimated_days || next.estimated_days || 0;
            next.tracking_number = shipmentData.china_tracking_number || next.tracking_number || '';
            const grandCny = purchaseTotals.find(row => row.id === purchase.id)?.grandCny || 0;
            next.delivery_cost_rub = grandCnyTotal > 0
                ? Math.round((chinaRub * (grandCny / grandCnyTotal)) * 100) / 100
                : 0;
            if (next.status !== 'in_transit') {
                next.status = 'in_transit';
                this._appendStatusHistory(next, 'in_transit', `Добавлено в коробку «${shipmentName}»`);
            }
            await saveChinaPurchase(next);
        }

        for (const purchaseId of removedIds) {
            const purchase = this.allPurchases.find(p => p.id === purchaseId);
            if (!purchase) continue;
            const next = JSON.parse(JSON.stringify(purchase));
            next.shipment_id = null;
            next.delivery_type = '';
            next.estimated_days = 0;
            next.tracking_number = '';
            next.delivery_cost_rub = 0;
            if (next.status === 'in_transit') {
                next.status = 'in_china_warehouse';
                this._appendStatusHistory(next, 'in_china_warehouse', `Убрано из коробки «${shipmentName}»`);
            }
            await saveChinaPurchase(next);
        }

        this.allPurchases = await loadChinaPurchases({});
        this.allShipments = await loadShipments();
        this.consolidationEditingShipmentId = shipmentId;
        App.toast('Коробка сохранена');
        this.showView('consolidation');
    },

    openLinkedShipment(shipmentId) {
        if (!shipmentId) {
            App.toast('У этой закупки ещё нет коробки');
            return;
        }
        App.navigate('warehouse');
        setTimeout(async () => {
            Warehouse.setView('shipments');
            await Warehouse.loadShipmentsList();
            Warehouse.editShipment(shipmentId);
        }, 250);
    },

    // ==========================================
    // FORM VIEW
    // ==========================================

    async openNewForm() {
        this.editingPurchaseId = null;
        this.itemCounter = 0;
        this.resetFormFields();
        await this.loadOrderOptions();
        document.getElementById('china-form-heading').textContent = 'Новая закупка';
        this.showView('form');
    },

    async openForm(purchaseId) {
        const p = await loadChinaPurchase(purchaseId);
        if (!p) { App.toast('Закупка не найдена'); return; }
        this.editingPurchaseId = purchaseId;
        await this.loadOrderOptions();
        this.populateForm(p);
        document.getElementById('china-form-heading').textContent = 'Редактирование';
        this.showView('form');
    },

    resetFormFields() {
        document.getElementById('china-f-name').value = '';
        document.getElementById('china-f-date').value = App.todayLocalYMD();
        document.getElementById('china-f-supplier').value = '';
        document.getElementById('china-f-url').value = '';
        document.getElementById('china-f-order').value = '';
        document.getElementById('china-f-del-cny').value = '';
        document.getElementById('china-f-notes').value = '';
        document.getElementById('china-f-items').innerHTML = '';
        document.getElementById('china-f-total').textContent = '0 \u00A5';
    },

    populateForm(p) {
        document.getElementById('china-f-name').value = p.purchase_name || '';
        document.getElementById('china-f-date').value = p.date || '';
        document.getElementById('china-f-supplier').value = p.supplier_name || '';
        document.getElementById('china-f-url').value = p.supplier_url || '';
        document.getElementById('china-f-order').value = p.order_id || '';
        document.getElementById('china-f-del-cny').value = p.delivery_cost_cny || '';
        document.getElementById('china-f-notes').value = p.notes || '';

        document.getElementById('china-f-items').innerHTML = '';
        this.itemCounter = 0;
        (p.items || []).forEach(item => this.addItemRow(item));
        this.recalcTotal();
    },

    addItemRow(data) {
        const idx = this.itemCounter++;
        const d = data || { name: '', description: '', qty: 0, price_cny: 0, photo_url: '' };
        const container = document.getElementById('china-f-items');
        container.insertAdjacentHTML('beforeend', `
        <div class="china-item-row" id="china-item-${idx}">
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:2">
                    <label>Название</label>
                    <input type="text" class="ci-name" value="${this.esc(d.name)}" oninput="ChinaPurchases.recalcTotal()">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Кол-во</label>
                    <input type="number" min="0" class="ci-qty" value="${d.qty || ''}" oninput="ChinaPurchases.recalcTotal()">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Цена (CNY/шт)</label>
                    <input type="number" min="0" step="0.01" class="ci-price" value="${d.price_cny || ''}" oninput="ChinaPurchases.recalcTotal()">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Фото URL</label>
                    <input type="text" class="ci-photo" value="${this.esc(d.photo_url || '')}" placeholder="Ссылка">
                </div>
                <div style="display:flex;align-items:flex-end;padding-bottom:4px">
                    <button class="btn btn-sm btn-outline" onclick="ChinaPurchases.removeItemRow(${idx})" style="color:var(--red);">&#10005;</button>
                </div>
            </div>
            <div class="form-group" style="margin:4px 0 0">
                <input type="text" class="ci-desc" value="${this.esc(d.description || '')}" placeholder="Описание (необязательно)" style="font-size:12px;">
            </div>
        </div>`);
    },

    removeItemRow(idx) {
        const el = document.getElementById('china-item-' + idx);
        if (el) el.remove();
        this.recalcTotal();
    },

    recalcTotal() {
        let total = 0;
        document.querySelectorAll('.china-item-row').forEach(row => {
            const qty = parseFloat(row.querySelector('.ci-qty').value) || 0;
            const price = parseFloat(row.querySelector('.ci-price').value) || 0;
            total += qty * price;
        });
        document.getElementById('china-f-total').textContent = this.formatCny(total);
    },

    gatherFormData() {
        const items = [];
        document.querySelectorAll('.china-item-row').forEach(row => {
            items.push({
                name: row.querySelector('.ci-name').value.trim(),
                description: row.querySelector('.ci-desc').value.trim(),
                qty: parseFloat(row.querySelector('.ci-qty').value) || 0,
                price_cny: parseFloat(row.querySelector('.ci-price').value) || 0,
                photo_url: row.querySelector('.ci-photo').value.trim(),
                warehouse_item_id: null,
            });
        });
        let totalCny = 0;
        items.forEach(i => totalCny += i.qty * i.price_cny);

        return {
            id: this.editingPurchaseId || undefined,
            purchase_name: document.getElementById('china-f-name').value.trim(),
            date: document.getElementById('china-f-date').value || null,
            supplier_name: document.getElementById('china-f-supplier').value.trim(),
            supplier_url: document.getElementById('china-f-url').value.trim(),
            order_id: parseInt(document.getElementById('china-f-order').value) || null,
            order_name: '',
            items,
            total_cny: Math.round(totalCny * 100) / 100,
            delivery_cost_cny: parseFloat(document.getElementById('china-f-del-cny').value) || 0,
            status: 'ordered',
            status_history: [],
            shipment_id: null,
            notes: document.getElementById('china-f-notes').value.trim(),
            created_by: '',
        };
    },

    async saveForm() {
        const data = this.gatherFormData();
        if (!data.purchase_name) { App.toast('Введите название закупки'); return; }

        // Cache order name
        if (data.order_id) {
            const orderData = await loadOrder(data.order_id);
            if (orderData) data.order_name = orderData.order.order_name || '';
        }

        // Preserve existing status/history/pdf if editing
        if (this.editingPurchaseId) {
            const existing = await loadChinaPurchase(this.editingPurchaseId);
            if (existing) {
                data.status = existing.status;
                data.status_history = existing.status_history || [];
                data.shipment_id = existing.shipment_id;
                data.created_by = existing.created_by;
                data.delivery_type = existing.delivery_type || '';
                data.delivery_cost_rub = existing.delivery_cost_rub || 0;
                data.cny_rate = existing.cny_rate || 0;
                data.estimated_days = existing.estimated_days || 0;
                data.tracking_number = existing.tracking_number || '';
            }
        }

        const id = await saveChinaPurchase(data);
        if (id) {
            App.toast('Закупка сохранена');
            this.allPurchases = await loadChinaPurchases({});
            this.openDetail(id);
        }
    },

    async loadOrderOptions() {
        const orders = await loadOrders({});
        const sel = document.getElementById('china-f-order');
        sel.innerHTML = '<option value="">— Не привязана —</option>';
        orders.forEach(o => {
            sel.innerHTML += `<option value="${o.id}">${this.esc(o.order_name || 'Без имени')}</option>`;
        });
    },

    // ==========================================
    // DETAIL VIEW
    // ==========================================

    async openDetail(purchaseId) {
        const p = await loadChinaPurchase(purchaseId);
        if (!p) { App.toast('Закупка не найдена'); return; }
        this.editingPurchaseId = purchaseId;
        this.renderDetail(p);
        this.showView('detail');
    },

    renderDetail(p) {
        document.getElementById('china-d-title').textContent = p.purchase_name;
        document.getElementById('china-d-date').textContent = App.formatDate(p.date);

        const badge = document.getElementById('china-d-badge');
        badge.className = 'china-badge china-badge-' + this.statusColor(p.status);
        badge.textContent = this.statusLabel(p.status);

        // Timeline
        const tl = document.getElementById('china-d-timeline');
        const currentIdx = this.STATUSES.findIndex(s => s.key === p.status);
        tl.innerHTML = this.STATUSES.map((s, i) => {
            const entry = (p.status_history || []).find(h => h.status === s.key);
            const passed = i <= currentIdx;
            const current = i === currentIdx;
            return `<div class="china-tl-step ${passed ? 'passed' : ''} ${current ? 'current' : ''}">
                <div class="china-tl-dot"></div>
                <div class="china-tl-info">
                    <div class="china-tl-label">${s.label}</div>
                    ${entry ? `<div class="china-tl-date">${App.formatDate(entry.date)}</div>` : ''}
                    ${entry && entry.note ? `<div class="china-tl-note">${this.esc(entry.note)}</div>` : ''}
                </div>
            </div>`;
        }).join('');

        // Info
        document.getElementById('china-d-supplier').textContent = p.supplier_name || '—';
        const urlEl = document.getElementById('china-d-url');
        urlEl.innerHTML = p.supplier_url
            ? `<a href="${this.esc(p.supplier_url)}" target="_blank" rel="noopener" style="color:var(--accent);word-break:break-all;">${this.esc(p.supplier_url.substring(0, 60))}${p.supplier_url.length > 60 ? '...' : ''}</a>`
            : '—';
        document.getElementById('china-d-order').textContent = p.order_name || '—';
        const shipment = p.shipment_id ? this._findShipment(p.shipment_id) : null;
        const shipmentEl = document.getElementById('china-d-shipment');
        shipmentEl.innerHTML = shipment
            ? `<a href="#" onclick="ChinaPurchases.openLinkedShipment(${shipment.id});return false" style="color:var(--accent);font-weight:600;text-decoration:none;">${this.esc(shipment.shipment_name || ('Коробка #' + shipment.id))}</a>`
            : '—';
        document.getElementById('china-d-del-type').textContent = this.statusLabel(p.status);
        document.getElementById('china-d-tracking').textContent = shipment ? `${shipment.shipment_name || ''}${shipment.china_tracking_number ? ' · ' + shipment.china_tracking_number : ''}` : '—';
        document.getElementById('china-d-days').textContent = shipment?.china_estimated_days ? shipment.china_estimated_days + ' дн' : '—';
        document.getElementById('china-d-rate').textContent = p.cny_rate ? p.cny_rate + ' \u20BD' : '—';

        // Financial
        document.getElementById('china-d-total-cny').textContent = this.formatCny(p.total_cny);
        document.getElementById('china-d-del-cny').textContent = this.formatCny(p.delivery_cost_cny);
        document.getElementById('china-d-del-rub').textContent = p.delivery_cost_rub ? (new Intl.NumberFormat('ru-RU').format(p.delivery_cost_rub) + ' \u20BD') : '—';
        const grandCny = (p.total_cny || 0) + (p.delivery_cost_cny || 0);
        document.getElementById('china-d-grand-cny').textContent = this.formatCny(grandCny);
        const grandRub = p.cny_rate ? Math.round((grandCny * p.cny_rate + (p.delivery_cost_rub || 0)) * 100) / 100 : 0;
        document.getElementById('china-d-grand-rub').textContent = p.cny_rate
            ? (new Intl.NumberFormat('ru-RU').format(grandRub) + ' \u20BD') : '—';

        // Items
        const itemsBody = document.getElementById('china-d-items-body');
        if (p.items && p.items.length > 0) {
            itemsBody.innerHTML = p.items.map((item, i) => {
                const photoSrc = this._resolveItemPhoto(item);
                const photoHtml = photoSrc
                    ? `<img src="${this.esc(photoSrc)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;margin-right:6px;vertical-align:middle;border:1px solid var(--border);" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">`
                    : '';
                const fallbackHtml = `<span style="width:32px;height:32px;display:${photoSrc ? 'none' : 'inline-flex'};align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;margin-right:6px;vertical-align:middle;font-size:12px;color:var(--text-muted);">📦</span>`;
                return `<tr>
                <td>${i + 1}</td>
                <td>
                    ${photoHtml}${fallbackHtml}
                    <strong>${this.esc(item.name)}</strong>
                    ${item.description ? `<div style="font-size:11px;color:var(--text-muted);">${this.esc(item.description)}</div>` : ''}
                </td>
                <td class="text-right">${item.qty}</td>
                <td class="text-right">${this.formatCny(item.price_cny)}</td>
                <td class="text-right">${this.formatCny(item.qty * item.price_cny)}</td>
            </tr>`;
            }).join('');
        } else {
            itemsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">Нет позиций</td></tr>';
        }

        // PDF
        const pdfEl = document.getElementById('china-d-pdf');
        pdfEl.innerHTML = (shipment?.waybill_pdf_name && shipment?.waybill_pdf_data)
            ? `<a href="${shipment.waybill_pdf_data}" download="${this.esc(shipment.waybill_pdf_name)}" class="btn btn-sm btn-outline">&#128196; ${this.esc(shipment.waybill_pdf_name)}</a>`
            : '<span style="color:var(--text-muted);">Нет накладной</span>';

        // Notes
        document.getElementById('china-d-notes').textContent = p.notes || '—';

        // Actions
        this.renderStatusActions(p);
    },

    renderStatusActions(p) {
        const container = document.getElementById('china-d-actions');
        const idx = this.STATUSES.findIndex(s => s.key === p.status);
        let html = '';
        if (p.status === 'in_china_warehouse' || p.shipment_id) {
            html += `<button class="btn btn-outline" onclick="ChinaPurchases.openConsolidation([${p.id}], ${p.shipment_id || 'null'})">&#128230; В коробку</button>`;
        }
        if (p.shipment_id) {
            html += `<button class="btn btn-outline" onclick="ChinaPurchases.openLinkedShipment(${p.shipment_id})">Открыть приёмку</button>`;
        }
        const canAdvanceDirectly = p.status === 'ordered' || (!!p.shipment_id && idx < this.STATUSES.length - 1);
        if (canAdvanceDirectly && idx < this.STATUSES.length - 1) {
            const next = this.STATUSES[idx + 1];
            html += `<button class="btn btn-primary" onclick="ChinaPurchases.promptStatusChange(${p.id}, '${next.key}')">&#8594; ${next.label}</button>`;
        }
        html += `<button class="btn btn-outline" onclick="ChinaPurchases.openForm(${p.id})">&#9998; Редактировать</button>`;
        html += `<button class="btn btn-outline" onclick="ChinaPurchases.confirmDelete(${p.id})" style="color:var(--red);">Удалить</button>`;
        container.innerHTML = html;
    },

    async promptStatusChange(purchaseId, newStatus) {
        const note = prompt('Комментарий к статусу (необязательно):') || '';
        const purchase = await loadChinaPurchase(purchaseId);
        if (!purchase) return;

        let targetIds = [purchaseId];
        if (purchase.shipment_id && ['in_transit', 'delivered', 'received'].includes(newStatus)) {
            const shipment = this._findShipment(purchase.shipment_id);
            if (shipment) {
                await this.updateBoxStatus(shipment.id, newStatus);
                this.openDetail(purchaseId);
                return;
            }
        }

        for (const id of targetIds) {
            await updateChinaPurchaseStatus(id, newStatus, note);
        }

        App.toast(targetIds.length > 1
            ? `Статус обновлён для всей коробки: ${this.statusLabel(newStatus)}`
            : 'Статус: ' + this.statusLabel(newStatus));
        this.allPurchases = await loadChinaPurchases({});
        this.allShipments = await loadShipments();
        this.openDetail(purchaseId);
    },

    async confirmDelete(purchaseId) {
        if (!confirm('Удалить эту закупку?')) return;
        await deleteChinaPurchase(purchaseId);
        App.toast('Закупка удалена');
        this.allPurchases = await loadChinaPurchases({});
        this.showView('dashboard');
    },
};

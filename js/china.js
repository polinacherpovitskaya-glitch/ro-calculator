// =============================================
// Recycle Object — China Purchases Page
// =============================================

const ChinaPurchases = {
    allPurchases: [],
    currentView: 'dashboard',
    editingPurchaseId: null,
    itemCounter: 0,
    _pendingPdfName: null,
    _pendingPdfData: null,

    STATUSES: [
        { key: 'ordered',            label: 'Заказано',           color: 'accent',  icon: '&#128722;' },
        { key: 'in_china_warehouse', label: 'На складе в Китае',  color: 'yellow',  icon: '&#128230;' },
        { key: 'consolidating',      label: 'Консолидация',       color: 'orange',  icon: '&#128230;' },
        { key: 'in_transit',         label: 'В пути',             color: 'blue',    icon: '&#9992;'   },
        { key: 'delivered',          label: 'Доставлено',         color: 'green',   icon: '&#10003;'  },
        { key: 'received',           label: 'Принято на склад',   color: 'green',   icon: '&#9745;'   },
    ],

    DELIVERY_TYPES: [
        { key: 'air',       label: 'Авиа',            days: '10-15' },
        { key: 'auto_fast', label: 'Авто быстро',     days: '20-30' },
        { key: 'auto_slow', label: 'Авто медленно',   days: '35-50' },
    ],

    // ==========================================
    // LIFECYCLE
    // ==========================================

    async load() {
        this.allPurchases = await loadChinaPurchases({});
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

    // ==========================================
    // DASHBOARD VIEW
    // ==========================================

    renderDashboard() {
        const all = this.allPurchases;
        const counts = {};
        this.STATUSES.forEach(s => counts[s.key] = 0);
        all.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });

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
            if (p.status === 'in_transit') inTransit++;
        });
        document.getElementById('china-stat-total').textContent = all.length;
        document.getElementById('china-stat-transit').textContent = inTransit;
        document.getElementById('china-stat-cny').textContent = this.formatCny(totalCny);
        document.getElementById('china-stat-delivery').textContent = this.formatCny(deliveryCny);

        // Recent table
        const tbody = document.getElementById('china-recent-body');
        const recent = all.slice(0, 5);
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

        let list = [...this.allPurchases];
        if (status) list = list.filter(p => p.status === status);
        if (delivery) list = list.filter(p => p.delivery_type === delivery);
        if (q) list = list.filter(p =>
            (p.purchase_name || '').toLowerCase().includes(q)
            || (p.supplier_name || '').toLowerCase().includes(q)
            || (p.order_name || '').toLowerCase().includes(q)
            || (p.tracking_number || '').toLowerCase().includes(q)
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
            <td>${this.deliveryLabel(p.delivery_type)}</td>
            <td class="text-right">${this.formatCny(p.total_cny)}</td>
            <td>${this.esc(p.tracking_number || '—')}</td>
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
    // FORM VIEW
    // ==========================================

    async openNewForm() {
        this.editingPurchaseId = null;
        this.itemCounter = 0;
        this._pendingPdfName = null;
        this._pendingPdfData = null;
        this.resetFormFields();
        await this.loadOrderOptions();
        document.getElementById('china-form-heading').textContent = 'Новая закупка';
        this.showView('form');
    },

    async openForm(purchaseId) {
        const p = await loadChinaPurchase(purchaseId);
        if (!p) { App.toast('Закупка не найдена'); return; }
        this.editingPurchaseId = purchaseId;
        this._pendingPdfName = p.waybill_pdf_name || null;
        this._pendingPdfData = p.waybill_pdf_data || null;
        await this.loadOrderOptions();
        this.populateForm(p);
        document.getElementById('china-form-heading').textContent = 'Редактирование';
        this.showView('form');
    },

    resetFormFields() {
        document.getElementById('china-f-name').value = '';
        document.getElementById('china-f-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('china-f-supplier').value = '';
        document.getElementById('china-f-url').value = '';
        document.getElementById('china-f-order').value = '';
        document.getElementById('china-f-del-type').value = '';
        document.getElementById('china-f-del-days').value = '';
        document.getElementById('china-f-tracking').value = '';
        document.getElementById('china-f-del-cny').value = '';
        document.getElementById('china-f-del-rub').value = '';
        document.getElementById('china-f-rate').value = '';
        document.getElementById('china-f-notes').value = '';
        document.getElementById('china-f-items').innerHTML = '';
        document.getElementById('china-f-total').textContent = '0 \u00A5';
        document.getElementById('china-f-pdf-info').textContent = 'Файл не выбран';
    },

    populateForm(p) {
        document.getElementById('china-f-name').value = p.purchase_name || '';
        document.getElementById('china-f-date').value = p.date || '';
        document.getElementById('china-f-supplier').value = p.supplier_name || '';
        document.getElementById('china-f-url').value = p.supplier_url || '';
        document.getElementById('china-f-order').value = p.order_id || '';
        document.getElementById('china-f-del-type').value = p.delivery_type || '';
        document.getElementById('china-f-del-days').value = p.estimated_days || '';
        document.getElementById('china-f-tracking').value = p.tracking_number || '';
        document.getElementById('china-f-del-cny').value = p.delivery_cost_cny || '';
        document.getElementById('china-f-del-rub').value = p.delivery_cost_rub || '';
        document.getElementById('china-f-rate').value = p.cny_rate || '';
        document.getElementById('china-f-notes').value = p.notes || '';

        document.getElementById('china-f-items').innerHTML = '';
        this.itemCounter = 0;
        (p.items || []).forEach(item => this.addItemRow(item));

        if (p.waybill_pdf_name) {
            document.getElementById('china-f-pdf-info').textContent = p.waybill_pdf_name;
        }
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

    handlePdfUpload(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 500 * 1024) {
            App.toast('PDF слишком большой (макс. 500 КБ)');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            this._pendingPdfName = file.name;
            this._pendingPdfData = e.target.result;
            document.getElementById('china-f-pdf-info').textContent =
                file.name + ' (' + Math.round(file.size / 1024) + ' КБ)';
        };
        reader.readAsDataURL(file);
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
            delivery_type: document.getElementById('china-f-del-type').value,
            delivery_cost_cny: parseFloat(document.getElementById('china-f-del-cny').value) || 0,
            delivery_cost_rub: parseFloat(document.getElementById('china-f-del-rub').value) || 0,
            cny_rate: parseFloat(document.getElementById('china-f-rate').value) || 0,
            estimated_days: parseInt(document.getElementById('china-f-del-days').value) || 0,
            tracking_number: document.getElementById('china-f-tracking').value.trim(),
            waybill_pdf_name: this._pendingPdfName || '',
            waybill_pdf_data: this._pendingPdfData || '',
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
                if (!data.waybill_pdf_data && existing.waybill_pdf_data) {
                    data.waybill_pdf_name = existing.waybill_pdf_name;
                    data.waybill_pdf_data = existing.waybill_pdf_data;
                }
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
        document.getElementById('china-d-del-type').textContent = this.deliveryLabel(p.delivery_type);
        document.getElementById('china-d-tracking').textContent = p.tracking_number || '—';
        document.getElementById('china-d-days').textContent = p.estimated_days ? p.estimated_days + ' дн' : '—';
        document.getElementById('china-d-rate').textContent = p.cny_rate ? p.cny_rate + ' \u20BD' : '—';

        // Financial
        document.getElementById('china-d-total-cny').textContent = this.formatCny(p.total_cny);
        document.getElementById('china-d-del-cny').textContent = this.formatCny(p.delivery_cost_cny);
        document.getElementById('china-d-del-rub').textContent = p.delivery_cost_rub ? (new Intl.NumberFormat('ru-RU').format(p.delivery_cost_rub) + ' \u20BD') : '—';
        const grandCny = (p.total_cny || 0) + (p.delivery_cost_cny || 0);
        document.getElementById('china-d-grand-cny').textContent = this.formatCny(grandCny);
        const grandRub = p.cny_rate ? Math.round(grandCny * p.cny_rate * 100) / 100 : 0;
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
        pdfEl.innerHTML = (p.waybill_pdf_name && p.waybill_pdf_data)
            ? `<a href="${p.waybill_pdf_data}" download="${this.esc(p.waybill_pdf_name)}" class="btn btn-sm btn-outline">&#128196; ${this.esc(p.waybill_pdf_name)}</a>`
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
        if (idx < this.STATUSES.length - 1) {
            const next = this.STATUSES[idx + 1];
            html += `<button class="btn btn-primary" onclick="ChinaPurchases.promptStatusChange(${p.id}, '${next.key}')">&#8594; ${next.label}</button>`;
        }
        html += `<button class="btn btn-outline" onclick="ChinaPurchases.openForm(${p.id})">&#9998; Редактировать</button>`;
        html += `<button class="btn btn-outline" onclick="ChinaPurchases.confirmDelete(${p.id})" style="color:var(--red);">Удалить</button>`;
        container.innerHTML = html;
    },

    async promptStatusChange(purchaseId, newStatus) {
        const note = prompt('Комментарий к статусу (необязательно):') || '';
        await updateChinaPurchaseStatus(purchaseId, newStatus, note);
        App.toast('Статус: ' + this.statusLabel(newStatus));
        this.allPurchases = await loadChinaPurchases({});
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

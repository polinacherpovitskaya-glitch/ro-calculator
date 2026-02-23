// =============================================
// Recycle Object — Order Detail Page
// =============================================

const PAYMENT_STATUSES = [
    { key: 'not_sent',      label: 'Не передано в оплату', color: 'gray' },
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

const PRINT_TYPES = [
    { key: '',            label: 'Не указано' },
    { key: 'uv_stepan',  label: 'УФ у Степана' },
    { key: 'uv_stickers', label: 'УФ-наклейки' },
];

const PLASTIC_TYPES = [
    { key: '',    label: 'Не указано' },
    { key: 'ABS', label: 'ABS' },
    { key: 'PP',  label: 'ПП (PP)' },
    { key: 'PND', label: 'ПНД (PND)' },
];

const OrderDetail = {
    currentOrder: null,
    currentItems: [],
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
        this.currentTab = 'info';

        this.renderHeader();
        this.renderStats();
        this.renderInfoTab();
        this.renderProductionTab();
        this.renderFilesTab();
        this.renderItemsTab();
        this.renderTasksTab();
        this.renderChinaTab();

        // Show first tab
        this.switchTab('info');
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

    renderStats() {
        const o = this.currentOrder;
        const ps = PAYMENT_STATUSES.find(s => s.key === o.payment_status) || PAYMENT_STATUSES[0];

        document.getElementById('od-stats').innerHTML = `
            <div class="stat-card">
                <div class="stat-label">Выручка</div>
                <div class="stat-value">${formatRub(o.total_revenue_plan || 0)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Маржа</div>
                <div class="stat-value ${(o.margin_percent_plan || 0) >= 30 ? 'text-green' : 'text-red'}">${formatPercent(o.margin_percent_plan || 0)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Часы</div>
                <div class="stat-value">${(o.total_hours_plan || 0).toFixed(1)} ч</div>
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
                ${this._fieldRow('owner', 'Владелец', o.owner, 'text')}
                ${this._fieldRowDateRange('deadline_start', 'deadline_end', 'Дедлайн', o.deadline_start || o.deadline, o.deadline_end)}
                ${this._fieldRow('notes', 'Заметки', o.notes, 'textarea')}
            </div>
            <div class="card">
                <div class="card-header"><h3>Контакты и ссылки</h3></div>
                ${this._fieldRow('delivery_address', 'Адрес доставки', o.delivery_address, 'textarea')}
                ${this._fieldRow('telegram_chat_url', 'Телеграм чат', o.telegram_chat_url, 'url')}
                ${this._fieldRow('crm_url', 'CRM', o.crm_url, 'url')}
                ${this._fieldRow('fintablo_deal_url', 'Финтабло', o.fintablo_deal_url, 'url')}
                ${this._fieldRow('spreadsheet_url', 'Таблица', o.spreadsheet_url, 'url')}
                ${this._fieldRow('file_storage_url', 'Хранилище файлов', o.file_storage_url, 'url')}
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
                ${this._fieldRowSelect('hardware_status', 'Статус фурнитуры', o.hardware_status || 'discussion', HARDWARE_STATUSES)}
                ${this._fieldRowSelect('plastic_type', 'Тип пластика', o.plastic_type || '', PLASTIC_TYPES)}
                ${this._fieldRowSelect('print_type', 'Тип печати', o.print_type || '', PRINT_TYPES)}
                ${this._fieldRowCheckbox('is_blank_mold', 'Бланк (форма)', o.is_blank_mold)}
                ${this._fieldRowCheckbox('packaging_from_stock', 'Упаковка из стока', o.packaging_from_stock)}
            </div>
            <div class="card">
                <div class="card-header"><h3>Производство</h3></div>
                ${this._fieldRow('color_scheme', 'Цветовое решение', o.color_scheme, 'text')}
                ${this._fieldRow('hardware_description', 'Фурнитура', o.hardware_description, 'textarea')}
                ${this._fieldRow('packaging_description', 'Упаковка', o.packaging_description, 'textarea')}
                ${this._fieldRow('production_status', 'Статус производства', o.production_status, 'text')}
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
        const hardware = this.currentItems.filter(i => i.item_type === 'hardware');
        const packaging = this.currentItems.filter(i => i.item_type === 'packaging');

        let html = '';

        if (products.length > 0) {
            html += '<h3 style="margin:0 0 12px">Изделия</h3>';
            html += products.map(item => this._renderItemCard(item, 'product')).join('');
        }
        if (hardware.length > 0) {
            html += '<h3 style="margin:16px 0 12px">Фурнитура</h3>';
            html += hardware.map(item => this._renderItemCard(item, 'hardware')).join('');
        }
        if (packaging.length > 0) {
            html += '<h3 style="margin:16px 0 12px">Упаковка</h3>';
            html += packaging.map(item => this._renderItemCard(item, 'packaging')).join('');
        }

        if (!html) {
            html = '<div class="empty-state"><div class="empty-icon">&#128230;</div><p>Нет позиций. Откройте в калькуляторе для добавления.</p></div>';
        }

        container.innerHTML = html;
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
        </div>`;
    },

    // ==========================================
    // TASKS TAB (placeholder for v33)
    // ==========================================

    renderTasksTab() {
        const container = document.getElementById('od-tab-tasks');
        container.innerHTML = `
            <div class="card">
                <div class="empty-state">
                    <div class="empty-icon">&#9745;</div>
                    <p>Связь задач с заказами — в следующем обновлении (v33)</p>
                </div>
            </div>`;
    },

    // ==========================================
    // CHINA TAB
    // ==========================================

    async renderChinaTab() {
        const container = document.getElementById('od-tab-china');
        try {
            const purchases = await loadChinaPurchases({ order_id: this.currentOrder.id });
            if (!purchases || purchases.length === 0) {
                container.innerHTML = `
                    <div class="card">
                        <div class="empty-state">
                            <div class="empty-icon">&#127464;&#127475;</div>
                            <p>Нет привязанных закупок из Китая</p>
                        </div>
                    </div>`;
                return;
            }
            container.innerHTML = `
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
                                    return `<tr style="cursor:pointer" onclick="App.navigate('china')">
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
        const managerName = prompt('Имя менеджера (для истории):') || 'Неизвестный';

        await updateOrderStatus(this.currentOrder.id, newStatus);
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
        const map = { draft: 'gray', calculated: 'blue', in_production: 'orange', completed: 'green', cancelled: 'red', deleted: 'red' };
        return map[status] || 'gray';
    },

    _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    _escAttr(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
};

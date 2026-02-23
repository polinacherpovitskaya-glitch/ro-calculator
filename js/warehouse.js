// =============================================
// Recycle Object — Warehouse (Inventory) Page
// =============================================

const WAREHOUSE_CATEGORIES = [
    { key: 'carabiners', label: 'Карабины',  icon: '🔗', color: '#dbeafe', textColor: '#1d4ed8' },
    { key: 'cables',     label: 'Тросы',     icon: '⚙',  color: '#fef3c7', textColor: '#92400e' },
    { key: 'rings',      label: 'Кольца',    icon: '⭕', color: '#d1fae5', textColor: '#065f46' },
    { key: 'chains',     label: 'Цепочки',   icon: '⛓',  color: '#e0e7ff', textColor: '#4338ca' },
    { key: 'cords',      label: 'Шнуры',     icon: '🧵', color: '#fce7f3', textColor: '#9d174d' },
    { key: 'packaging',  label: 'Упаковка',  icon: '📦', color: '#f3e8ff', textColor: '#7c3aed' },
    { key: 'other',      label: 'Разное',    icon: '🔹', color: '#f1f5f9', textColor: '#475569' },
];

const Warehouse = {
    allItems: [],
    allReservations: [],
    editingId: null,
    pendingImport: null,

    // ==========================================
    // LIFECYCLE
    // ==========================================

    async load() {
        this.allItems = await loadWarehouseItems();
        this.allReservations = await loadWarehouseReservations();
        this.recalcReservations();
        this.populateCategoryFilter();
        this.renderStats();
        this.filterAndRender();
    },

    recalcReservations() {
        this.allItems.forEach(item => {
            const activeRes = this.allReservations.filter(
                r => r.item_id === item.id && r.status === 'active'
            );
            item.reserved_qty = activeRes.reduce((s, r) => s + (r.qty || 0), 0);
            item.available_qty = Math.max(0, (item.qty || 0) - item.reserved_qty);
        });
    },

    populateCategoryFilter() {
        const sel = document.getElementById('wh-filter-category');
        if (!sel) return;
        sel.innerHTML = '<option value="">Все категории</option>' +
            WAREHOUSE_CATEGORIES.map(c =>
                `<option value="${c.key}">${c.icon} ${c.label}</option>`
            ).join('');
    },

    // ==========================================
    // STATS
    // ==========================================

    renderStats() {
        const items = this.allItems;
        const totalItems = items.length;
        const totalQty = items.reduce((s, i) => s + (i.qty || 0), 0);
        const totalReserved = items.reduce((s, i) => s + (i.reserved_qty || 0), 0);
        const lowStock = items.filter(i => i.min_qty > 0 && i.qty < i.min_qty).length;

        const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
        el('wh-total-items', totalItems);
        el('wh-total-qty', totalQty.toLocaleString('ru-RU'));
        el('wh-total-reserved', totalReserved.toLocaleString('ru-RU'));
        el('wh-low-stock', lowStock);
    },

    // ==========================================
    // FILTERING & RENDERING
    // ==========================================

    filterAndRender() {
        let items = [...this.allItems];

        // Category filter
        const cat = document.getElementById('wh-filter-category');
        if (cat && cat.value) {
            items = items.filter(i => i.category === cat.value);
        }

        // Stock filter
        const stock = document.getElementById('wh-filter-stock');
        if (stock && stock.value) {
            switch (stock.value) {
                case 'in_stock': items = items.filter(i => i.qty > 0); break;
                case 'low': items = items.filter(i => i.min_qty > 0 && i.qty > 0 && i.qty < i.min_qty); break;
                case 'out': items = items.filter(i => i.qty <= 0); break;
                case 'reserved': items = items.filter(i => i.reserved_qty > 0); break;
            }
        }

        // Search
        const search = document.getElementById('wh-search');
        if (search && search.value.trim()) {
            const q = search.value.trim().toLowerCase();
            items = items.filter(i =>
                (i.name || '').toLowerCase().includes(q)
                || (i.sku || '').toLowerCase().includes(q)
                || (i.color || '').toLowerCase().includes(q)
            );
        }

        // Sort
        const sort = document.getElementById('wh-sort');
        const sortVal = sort ? sort.value : 'name';
        switch (sortVal) {
            case 'name': items.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru')); break;
            case 'qty_desc': items.sort((a, b) => (b.qty || 0) - (a.qty || 0)); break;
            case 'qty_asc': items.sort((a, b) => (a.qty || 0) - (b.qty || 0)); break;
            case 'category': items.sort((a, b) => (a.category || '').localeCompare(b.category || '')); break;
        }

        this.renderTable(items);
    },

    renderTable(items) {
        const container = document.getElementById('wh-content');
        if (!container) return;

        if (items.length === 0) {
            container.innerHTML = `<div class="card"><div class="empty-state">
                <div class="empty-icon">📦</div>
                <p>Нет позиций</p>
                <p style="font-size:12px;color:var(--text-muted);">Добавьте вручную или импортируйте из Excel</p>
            </div></div>`;
            return;
        }

        const rows = items.map(item => {
            const cat = WAREHOUSE_CATEGORIES.find(c => c.key === item.category) || WAREHOUSE_CATEGORIES[6];
            const isLow = item.min_qty > 0 && item.qty < item.min_qty;
            const isOut = item.qty <= 0;

            // Photo or placeholder
            const photo = item.photo_url
                ? `<img src="${this.esc(item.photo_url)}" class="wh-photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"><span class="wh-placeholder" style="display:none;background:${cat.color};color:${cat.textColor};">${cat.icon}</span>`
                : `<span class="wh-placeholder" style="background:${cat.color};color:${cat.textColor};">${cat.icon}</span>`;

            // Qty badge
            const qtyClass = isOut ? 'wh-qty-out' : (isLow ? 'wh-qty-low' : 'wh-qty-ok');

            // Category badge
            const catBadge = `<span class="wh-cat-badge" style="background:${cat.color};color:${cat.textColor};">${cat.label}</span>`;

            // Reservations info
            const resInfo = item.reserved_qty > 0
                ? `<span style="color:var(--yellow);font-weight:600;">${item.reserved_qty}</span>`
                : `<span style="color:var(--text-muted);">—</span>`;

            const availInfo = item.reserved_qty > 0
                ? `<span style="font-weight:600;">${item.available_qty}</span>`
                : `<span style="color:var(--text-muted);">—</span>`;

            return `<tr style="${isOut ? 'opacity:0.5;' : (isLow ? 'background:rgba(220,38,38,0.04);' : '')}">
                <td style="width:48px;">${photo}</td>
                <td>
                    <div style="font-weight:600;">${this.esc(item.name)}</div>
                    <div style="font-size:11px;color:var(--text-muted);">${this.esc(item.sku || '')}</div>
                </td>
                <td>${catBadge}</td>
                <td>${this.esc(item.size || '—')}</td>
                <td>${this.esc(item.color || '—')}</td>
                <td class="text-right"><span class="${qtyClass}">${item.qty || 0}</span></td>
                <td class="text-right">${resInfo}</td>
                <td class="text-right">${availInfo}</td>
                <td>
                    <div class="flex gap-4" style="justify-content:flex-end;">
                        <button class="btn btn-sm btn-outline" onclick="Warehouse.quickAdjust(${item.id}, 1)" title="+1" style="min-width:28px;padding:2px;">+</button>
                        <button class="btn btn-sm btn-outline" onclick="Warehouse.quickAdjust(${item.id}, -1)" title="-1" style="min-width:28px;padding:2px;">−</button>
                        <button class="btn btn-sm btn-outline" onclick="Warehouse.promptAdjust(${item.id})" title="Корректировка" style="min-width:28px;padding:2px;">±</button>
                        <button class="btn btn-sm btn-outline" onclick="Warehouse.addReservation(${item.id})" title="Резервировать" style="min-width:28px;padding:2px;">📋</button>
                        <button class="btn btn-sm btn-outline" onclick="Warehouse.editItem(${item.id})" title="Редактировать">✎</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        container.innerHTML = `<div class="card"><div class="table-wrap"><table>
            <thead><tr>
                <th style="width:48px;"></th>
                <th>Название / Артикул</th>
                <th>Категория</th>
                <th>Размер</th>
                <th>Цвет</th>
                <th class="text-right">Кол-во</th>
                <th class="text-right">Резерв</th>
                <th class="text-right">Доступно</th>
                <th style="width:180px;"></th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table></div></div>`;
    },

    // ==========================================
    // ADD / EDIT FORM
    // ==========================================

    showAddForm() {
        this.editingId = null;
        this.clearForm();
        document.getElementById('wh-form-title').textContent = 'Новая позиция';
        document.getElementById('wh-delete-btn').style.display = 'none';
        document.getElementById('wh-reservations-section').innerHTML = '';
        document.getElementById('wh-edit-form').style.display = '';
        document.getElementById('wh-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editItem(id) {
        const item = this.allItems.find(i => i.id === id);
        if (!item) return;
        this.editingId = id;
        document.getElementById('wh-form-title').textContent = 'Редактирование';

        document.getElementById('wh-f-category').value = item.category || 'other';
        document.getElementById('wh-f-name').value = item.name || '';
        document.getElementById('wh-f-sku').value = item.sku || '';
        document.getElementById('wh-f-size').value = item.size || '';
        document.getElementById('wh-f-color').value = item.color || '';
        document.getElementById('wh-f-unit').value = item.unit || 'шт';
        document.getElementById('wh-f-photo-url').value = item.photo_url || '';
        document.getElementById('wh-f-qty').value = item.qty || 0;
        document.getElementById('wh-f-min-qty').value = item.min_qty || 0;
        document.getElementById('wh-f-price').value = item.price_per_unit || 0;
        document.getElementById('wh-f-notes').value = item.notes || '';

        document.getElementById('wh-delete-btn').style.display = '';
        this.renderItemReservations(id);
        document.getElementById('wh-edit-form').style.display = '';
        document.getElementById('wh-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideForm() {
        document.getElementById('wh-edit-form').style.display = 'none';
    },

    clearForm() {
        ['wh-f-name', 'wh-f-sku', 'wh-f-size', 'wh-f-color', 'wh-f-photo-url', 'wh-f-notes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('wh-f-category').value = 'carabiners';
        document.getElementById('wh-f-unit').value = 'шт';
        document.getElementById('wh-f-qty').value = 0;
        document.getElementById('wh-f-min-qty').value = 0;
        document.getElementById('wh-f-price').value = 0;
    },

    async saveItem() {
        const name = document.getElementById('wh-f-name').value.trim();
        if (!name) { App.toast('Укажите название'); return; }

        const item = {
            id: this.editingId || undefined,
            category: document.getElementById('wh-f-category').value,
            name: name,
            sku: document.getElementById('wh-f-sku').value.trim(),
            size: document.getElementById('wh-f-size').value.trim(),
            color: document.getElementById('wh-f-color').value.trim(),
            unit: document.getElementById('wh-f-unit').value || 'шт',
            photo_url: document.getElementById('wh-f-photo-url').value.trim(),
            qty: parseFloat(document.getElementById('wh-f-qty').value) || 0,
            min_qty: parseFloat(document.getElementById('wh-f-min-qty').value) || 0,
            price_per_unit: parseFloat(document.getElementById('wh-f-price').value) || 0,
            notes: document.getElementById('wh-f-notes').value.trim(),
        };

        await saveWarehouseItem(item);
        App.toast(this.editingId ? 'Позиция обновлена' : 'Позиция добавлена');
        this.hideForm();
        await this.load();
    },

    async deleteFromForm() {
        if (!this.editingId) return;
        const item = this.allItems.find(i => i.id === this.editingId);
        if (!confirm(`Удалить "${item ? item.name : ''}"?`)) return;
        await deleteWarehouseItem(this.editingId);
        App.toast('Позиция удалена');
        this.hideForm();
        await this.load();
    },

    // ==========================================
    // STOCK ADJUSTMENTS
    // ==========================================

    async adjustStock(itemId, qtyChange, reason, orderName, notes, manager) {
        const items = await loadWarehouseItems();
        const idx = items.findIndex(i => i.id === itemId);
        if (idx < 0) return false;

        const item = items[idx];
        const qtyBefore = item.qty || 0;
        item.qty = Math.max(0, qtyBefore + qtyChange);
        item.updated_at = new Date().toISOString();
        items[idx] = item;
        await saveWarehouseItems(items);

        // Record in history
        const history = await loadWarehouseHistory();
        history.push({
            id: Date.now(),
            item_id: itemId,
            item_name: item.name || '',
            item_sku: item.sku || '',
            type: reason || 'adjustment',
            qty_change: qtyChange,
            qty_before: qtyBefore,
            qty_after: item.qty,
            order_name: orderName || '',
            notes: notes || '',
            created_at: new Date().toISOString(),
            created_by: manager || '',
        });
        await saveWarehouseHistory(history);
        return true;
    },

    async quickAdjust(itemId, delta) {
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', 'Быстрая корректировка', '');
        await this.load();
    },

    async promptAdjust(itemId) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;
        const input = prompt(`Корректировка "${item.name}" (текущее: ${item.qty})\nВведите изменение (+10 или -5):`);
        if (input === null) return;
        const delta = parseInt(input);
        if (isNaN(delta) || delta === 0) { App.toast('Неверное значение'); return; }

        const reason = prompt('Причина корректировки:') || '';
        await this.adjustStock(itemId, delta, delta > 0 ? 'addition' : 'deduction', '', reason, '');
        App.toast(`${item.name}: ${delta > 0 ? '+' : ''}${delta}`);
        await this.load();
    },

    // ==========================================
    // RESERVATIONS
    // ==========================================

    async addReservation(itemId) {
        const item = this.allItems.find(i => i.id === itemId);
        if (!item) return;

        const available = this.getAvailableQty(item);
        const orderName = prompt(`Резерв "${item.name}" (доступно: ${available})\nДля какого проекта/заказа?`);
        if (!orderName) return;

        const qtyStr = prompt(`Количество для резерва (макс: ${available}):`);
        const qty = parseInt(qtyStr);
        if (!qty || qty <= 0) { App.toast('Неверное количество'); return; }
        if (qty > available) { App.toast(`Недостаточно! Доступно: ${available}`); return; }

        const reservations = await loadWarehouseReservations();
        reservations.push({
            id: Date.now(),
            item_id: itemId,
            order_name: orderName,
            qty: qty,
            status: 'active',
            created_at: new Date().toISOString(),
            created_by: '',
        });
        await saveWarehouseReservations(reservations);
        App.toast(`Зарезервировано: ${qty} шт для "${orderName}"`);
        await this.load();
    },

    async cancelReservation(resId) {
        const reservations = await loadWarehouseReservations();
        const idx = reservations.findIndex(r => r.id === resId);
        if (idx < 0) return;
        reservations[idx].status = 'cancelled';
        await saveWarehouseReservations(reservations);
        App.toast('Резерв отменён');
        await this.load();
        // Re-render reservations if editing
        if (this.editingId) this.renderItemReservations(this.editingId);
    },

    getAvailableQty(item) {
        const activeRes = this.allReservations.filter(
            r => r.item_id === item.id && r.status === 'active'
        );
        const reserved = activeRes.reduce((s, r) => s + (r.qty || 0), 0);
        return Math.max(0, (item.qty || 0) - reserved);
    },

    renderItemReservations(itemId) {
        const container = document.getElementById('wh-reservations-section');
        if (!container) return;
        const activeRes = this.allReservations.filter(r => r.item_id === itemId && r.status === 'active');
        if (activeRes.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);font-size:12px;">Нет активных резервов</p>';
            return;
        }
        container.innerHTML = '<h4 style="margin:0 0 8px;font-size:13px;">Активные резервы:</h4>' +
            activeRes.map(r => `<div style="display:flex;gap:8px;align-items:center;padding:4px 0;border-bottom:1px solid var(--border);font-size:12px;">
                <span style="font-weight:600;">${this.esc(r.order_name)}</span>
                <span>${r.qty} шт</span>
                <span style="color:var(--text-muted);">${App.formatDate(r.created_at)}</span>
                <button class="btn btn-sm btn-outline" onclick="Warehouse.cancelReservation(${r.id})" style="margin-left:auto;font-size:10px;padding:1px 6px;">Отменить</button>
            </div>`).join('');
    },

    // ==========================================
    // IMPORT FROM CSV
    // ==========================================

    showImport() {
        document.getElementById('wh-import-form').style.display = '';
        document.getElementById('wh-import-preview').innerHTML = '';
        document.getElementById('wh-import-file').value = '';
        document.getElementById('wh-import-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideImport() {
        document.getElementById('wh-import-form').style.display = 'none';
        this.pendingImport = null;
    },

    processImport() {
        const fileInput = document.getElementById('wh-import-file');
        const category = document.getElementById('wh-import-category').value;
        if (!fileInput.files.length) { App.toast('Выберите файл'); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target.result;
                const items = this.parseCSV(text, category);
                if (items.length === 0) {
                    App.toast('Не удалось распознать данные');
                    return;
                }
                this.pendingImport = { items, category };
                this.showImportPreview(items);
            } catch (err) {
                App.toast('Ошибка чтения файла: ' + err.message);
            }
        };
        reader.readAsText(fileInput.files[0], 'utf-8');
    },

    parseCSV(text, category) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return [];

        const items = [];
        // Try to detect separator: tab or semicolon
        const sep = lines[0].includes('\t') ? '\t' : ';';

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.trim().replace(/^"|"$/g, ''));
            // Skip section headers (rows where only col A has text), empty rows, date rows
            if (cols.length < 2) continue;
            if (cols[0] && !cols[1] && !cols[2]) continue; // Section header
            if (cols[0] && cols[0].toLowerCase().includes('дата обновления')) continue;
            if (!cols[0]) continue; // Empty name

            const name = cols[0] || '';
            const sku = cols[1] || '';
            // Determine qty column (varies by sheet structure)
            // Standard: A=name, B=sku, C=size, D=color, E=photo, F=qty
            // Rings/Packaging: A=name, B=sku, C=size, D=color, E=qty
            // Try to find the qty (first numeric column after column 3)
            let qty = 0;
            let size = cols[2] || '';
            let color = cols[3] || '';

            for (let c = 4; c < cols.length; c++) {
                const val = parseFloat(cols[c]);
                if (!isNaN(val) && val >= 0) {
                    qty = val;
                    break;
                }
            }

            // Skip if name looks like a header or section divider
            if (name.toLowerCase() === 'наименование') continue;

            items.push({
                category: category,
                name: name,
                sku: sku,
                size: size,
                color: color,
                unit: 'шт',
                photo_url: '',
                qty: qty,
                min_qty: 0,
                price_per_unit: 0,
                notes: '',
            });
        }

        return items;
    },

    showImportPreview(items) {
        const container = document.getElementById('wh-import-preview');
        const cat = WAREHOUSE_CATEGORIES.find(c => c.key === items[0]?.category);
        container.innerHTML = `
            <div style="margin:12px 0;">
                <p style="font-weight:600;">Найдено позиций: ${items.length} ${cat ? '(' + cat.label + ')' : ''}</p>
                <div class="table-wrap" style="max-height:300px;overflow-y:auto;">
                    <table>
                        <thead><tr><th>Название</th><th>Артикул</th><th>Размер</th><th>Цвет</th><th class="text-right">Кол-во</th></tr></thead>
                        <tbody>${items.map(it => `<tr>
                            <td>${this.esc(it.name)}</td>
                            <td>${this.esc(it.sku)}</td>
                            <td>${this.esc(it.size)}</td>
                            <td>${this.esc(it.color)}</td>
                            <td class="text-right">${it.qty}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
                <div style="margin-top:12px; display:flex; gap:8px;">
                    <button class="btn btn-success" onclick="Warehouse.confirmImport()">Импортировать ${items.length} позиций</button>
                    <button class="btn btn-outline" onclick="Warehouse.hideImport()">Отмена</button>
                </div>
            </div>`;
    },

    async confirmImport() {
        if (!this.pendingImport) return;
        const { items } = this.pendingImport;

        for (const item of items) {
            await saveWarehouseItem(item);
            // Small delay to get unique IDs
            await new Promise(r => setTimeout(r, 2));
        }

        // Record in history
        const history = await loadWarehouseHistory();
        history.push({
            id: Date.now(),
            item_id: 0,
            item_name: `Импорт (${items.length} позиций)`,
            item_sku: '',
            type: 'import',
            qty_change: items.reduce((s, i) => s + (i.qty || 0), 0),
            qty_before: 0,
            qty_after: 0,
            order_name: '',
            notes: `Импортировано ${items.length} позиций из CSV`,
            created_at: new Date().toISOString(),
            created_by: '',
        });
        await saveWarehouseHistory(history);

        App.toast(`Импортировано: ${items.length} позиций`);
        this.hideImport();
        await this.load();
    },

    // ==========================================
    // INVENTORY AUDIT (Инвентаризация)
    // ==========================================

    showAudit() {
        document.getElementById('wh-audit-form').style.display = '';
        this.renderAuditTable('');
        document.getElementById('wh-audit-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideAudit() {
        document.getElementById('wh-audit-form').style.display = 'none';
    },

    renderAuditTable(category) {
        let items = [...this.allItems];
        if (category) items = items.filter(i => i.category === category);

        // Sort by category then name
        items.sort((a, b) => {
            if (a.category !== b.category) return (a.category || '').localeCompare(b.category || '');
            return (a.name || '').localeCompare(b.name || '', 'ru');
        });

        const container = document.getElementById('wh-audit-table');
        if (!container) return;

        container.innerHTML = `<div class="table-wrap" style="max-height:500px;overflow-y:auto;">
            <table>
                <thead><tr>
                    <th>Категория</th>
                    <th>Название</th>
                    <th>Артикул</th>
                    <th class="text-right">В системе</th>
                    <th style="width:100px;">Факт</th>
                    <th class="text-right">Разница</th>
                </tr></thead>
                <tbody>${items.map(item => {
                    const cat = WAREHOUSE_CATEGORIES.find(c => c.key === item.category);
                    return `<tr>
                        <td><span class="wh-cat-badge" style="background:${cat?.color || '#f1f5f9'};color:${cat?.textColor || '#475569'};">${cat?.label || '?'}</span></td>
                        <td style="font-weight:600;">${this.esc(item.name)}</td>
                        <td style="color:var(--text-muted);font-size:11px;">${this.esc(item.sku || '')}</td>
                        <td class="text-right" style="font-weight:600;">${item.qty || 0}</td>
                        <td><input type="number" class="audit-input" data-id="${item.id}" data-system="${item.qty || 0}" value="" placeholder="${item.qty || 0}" style="width:80px;padding:4px;text-align:right;" oninput="Warehouse.onAuditInput(this)"></td>
                        <td class="text-right audit-diff" id="audit-diff-${item.id}">—</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div>`;
    },

    onAuditInput(el) {
        const systemQty = parseInt(el.dataset.system) || 0;
        const actualQty = parseInt(el.value);
        const diffEl = document.getElementById('audit-diff-' + el.dataset.id);
        if (!diffEl) return;

        if (isNaN(actualQty) || el.value === '') {
            diffEl.textContent = '—';
            diffEl.className = 'text-right audit-diff';
            return;
        }

        const diff = actualQty - systemQty;
        if (diff === 0) {
            diffEl.textContent = '0';
            diffEl.className = 'text-right audit-diff audit-zero';
        } else if (diff > 0) {
            diffEl.textContent = '+' + diff;
            diffEl.className = 'text-right audit-diff audit-positive';
        } else {
            diffEl.textContent = String(diff);
            diffEl.className = 'text-right audit-diff audit-negative';
        }
    },

    async saveAuditResults() {
        const inputs = document.querySelectorAll('.audit-input');
        let adjusted = 0;

        for (const input of inputs) {
            if (input.value === '') continue;
            const itemId = parseInt(input.dataset.id);
            const systemQty = parseInt(input.dataset.system) || 0;
            const actualQty = parseInt(input.value);
            const diff = actualQty - systemQty;

            if (diff === 0 || isNaN(diff)) continue;

            await this.adjustStock(itemId, diff, 'adjustment', '', 'Инвентаризация', '');
            adjusted++;
        }

        if (adjusted === 0) {
            App.toast('Нет изменений для сохранения');
            return;
        }

        App.toast(`Инвентаризация: скорректировано ${adjusted} позиций`);
        this.hideAudit();
        await this.load();
    },

    // ==========================================
    // HISTORY VIEW
    // ==========================================

    async renderHistory() {
        const container = document.getElementById('wh-content');
        if (!container) return;

        const history = await loadWarehouseHistory();
        const sorted = history.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 200);

        if (sorted.length === 0) {
            container.innerHTML = '<div class="card"><p class="text-center text-muted">Нет записей</p></div>';
            return;
        }

        const typeIcons = {
            deduction: '📤', addition: '📥', adjustment: '🔧',
            import: '📋', reservation: '📌', unreserve: '🔓',
        };

        container.innerHTML = `<div class="card"><div class="table-wrap" style="max-height:600px;overflow-y:auto;">
            <table>
                <thead><tr>
                    <th style="width:120px;">Дата</th>
                    <th></th>
                    <th>Позиция</th>
                    <th class="text-right">Изменение</th>
                    <th class="text-right">Остаток</th>
                    <th>Причина</th>
                </tr></thead>
                <tbody>${sorted.map(h => {
                    const icon = typeIcons[h.type] || '📋';
                    const changeClass = (h.qty_change || 0) > 0 ? 'text-green' : ((h.qty_change || 0) < 0 ? 'text-red' : '');
                    const changeStr = (h.qty_change || 0) > 0 ? '+' + h.qty_change : String(h.qty_change || 0);
                    return `<tr>
                        <td style="font-size:11px;color:var(--text-muted);">${App.formatDate(h.created_at)}</td>
                        <td>${icon}</td>
                        <td>
                            <div style="font-weight:600;">${this.esc(h.item_name || '')}</div>
                            ${h.item_sku ? `<div style="font-size:10px;color:var(--text-muted);">${this.esc(h.item_sku)}</div>` : ''}
                        </td>
                        <td class="text-right ${changeClass}" style="font-weight:700;">${changeStr}</td>
                        <td class="text-right">${h.qty_after ?? '—'}</td>
                        <td style="font-size:11px;">${this.esc(h.notes || h.order_name || '')}</td>
                    </tr>`;
                }).join('')}</tbody>
            </table>
        </div></div>`;
    },

    // ==========================================
    // VIEW SWITCHING
    // ==========================================

    setView(view) {
        this.currentView = view;
        // Update tab active states
        document.querySelectorAll('#wh-tabs .tab').forEach(t => {
            t.classList.toggle('active', t.dataset.tab === view);
        });

        if (view === 'history') {
            this.renderHistory();
        } else {
            this.filterAndRender();
        }
    },

    // ==========================================
    // UTILITIES
    // ==========================================

    esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

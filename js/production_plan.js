// =============================================
// Recycle Object — План производства
// =============================================

const ProductionPlan = {
    PRODUCTION_STATUSES: ['production_casting', 'production_hardware', 'production_packaging', 'in_production'],
    allRows: [],
    filteredRows: [],
    priority: [],
    _state: { order_ids: [] },

    async load() {
        const [orders, state] = await Promise.all([
            loadOrders(),
            loadProductionPlanState(),
        ]);

        this._state = state || { order_ids: [] };
        this.priority = Array.isArray(this._state.order_ids) ? this._state.order_ids.map(x => Number(x)) : [];

        const productionOrders = (orders || []).filter(o => this.PRODUCTION_STATUSES.includes(o.status));
        const details = await Promise.all(productionOrders.map(o => loadOrder(o.id).catch(() => null)));
        const byId = new Map(details.filter(Boolean).map(d => [Number(d.order.id), d]));

        this.allRows = productionOrders.map(order => {
            const detail = byId.get(Number(order.id));
            return this._buildRow(order, detail?.items || []);
        });

        this._syncPriority();
        this.renderFilters();
        this.applyFilters();
    },

    renderFilters() {
        const managerEl = document.getElementById('pp-filter-manager');
        if (!managerEl) return;
        const current = managerEl.value;
        const managers = [...new Set(this.allRows.map(r => r.manager).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ru'));
        managerEl.innerHTML = '<option value="">Все</option>' + managers.map(m => `<option value="${this.esc(m)}">${this.esc(m)}</option>`).join('');
        managerEl.value = managers.includes(current) ? current : '';
    },

    applyFilters() {
        const q = (document.getElementById('pp-search')?.value || '').toLowerCase().trim();
        const manager = document.getElementById('pp-filter-manager')?.value || '';
        const stage = document.getElementById('pp-filter-stage')?.value || '';

        let rows = this.allRows.slice();
        if (manager) rows = rows.filter(r => r.manager === manager);
        if (stage) rows = rows.filter(r => r.status === stage);
        if (q) {
            rows = rows.filter(r => [
                r.orderName,
                r.manager,
                r.notes,
                r.colorsPlain,
                r.hwPlain,
                r.pkgPlain,
                r.productsPlain,
            ].join(' ').toLowerCase().includes(q));
        }

        this.filteredRows = this._sortRows(rows);
        this.renderStats();
        this.renderTable();
        this.renderMobile();
    },

    renderStats() {
        const cntEl = document.getElementById('pp-stat-count');
        const qtyEl = document.getElementById('pp-stat-qty');
        const lateEl = document.getElementById('pp-stat-late');
        if (!cntEl || !qtyEl || !lateEl) return;

        const now = new Date();
        let qty = 0;
        let late = 0;
        this.filteredRows.forEach(r => {
            qty += r.qtyTotal;
            if (r.deadlineTs && r.deadlineTs < now.getTime()) late += 1;
        });
        cntEl.textContent = String(this.filteredRows.length);
        qtyEl.textContent = String(qty);
        lateEl.textContent = String(late);
    },

    renderTable() {
        const el = document.getElementById('pp-table-wrap');
        if (!el) return;
        if (!this.filteredRows.length) {
            el.innerHTML = '<div class="card"><div class="empty-state"><p>Нет заказов в производстве</p></div></div>';
            return;
        }

        let html = `<div class="card table-wrap"><table class="pp-table"><thead><tr>
            <th style="width:64px">Приоритет</th>
            <th>Заказ</th>
            <th>Менеджер</th>
            <th>Старт / дедлайн</th>
            <th>Количество</th>
            <th>Цвет / файл</th>
            <th>Фурнитура / упаковка</th>
            <th>Заметки</th>
            <th></th>
        </tr></thead><tbody>`;

        this.filteredRows.forEach((r) => {
            const late = r.deadlineTs && r.deadlineTs < Date.now();
            html += `<tr>
                <td>
                    <div class="pp-rank">
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveUp(${r.id})">&#8593;</button>
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveDown(${r.id})">&#8595;</button>
                    </div>
                </td>
                <td>
                    <div class="pp-order-name">${this.esc(r.orderName)}</div>
                    <div class="pp-sub">${this.esc(r.statusLabel)} · ${this.esc(r.productsPlain || 'Без изделий')}</div>
                </td>
                <td>${this.esc(r.manager || '—')}</td>
                <td>
                    <div class="pp-sub">Старт: ${this.esc(r.startLabel)}</div>
                    <div class="pp-sub ${late ? 'text-red' : ''}">Дедлайн: ${this.esc(r.deadlineLabel)}</div>
                </td>
                <td><strong>${r.qtyTotal}</strong></td>
                <td>${this._renderColorCell(r)}</td>
                <td>
                    <div class="pp-sub"><strong>Ф:</strong> ${this.esc(r.hwPlain || '—')}</div>
                    <div class="pp-sub"><strong>У:</strong> ${this.esc(r.pkgPlain || '—')}</div>
                </td>
                <td class="pp-sub">${this.esc(r.notes || '—')}</td>
                <td><button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${r.id})">Открыть</button></td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        el.innerHTML = html;
    },

    renderMobile() {
        const el = document.getElementById('pp-mobile-list');
        if (!el) return;
        if (!this.filteredRows.length) {
            el.innerHTML = '';
            return;
        }

        el.innerHTML = this.filteredRows.map(r => {
            const late = r.deadlineTs && r.deadlineTs < Date.now();
            return `<div class="card pp-mobile-card">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                    <div>
                        <div class="pp-order-name">${this.esc(r.orderName)}</div>
                        <div class="pp-sub">${this.esc(r.statusLabel)} · ${r.qtyTotal} шт</div>
                    </div>
                    <div class="pp-rank">
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveUp(${r.id})">&#8593;</button>
                        <button class="btn btn-sm btn-outline" onclick="ProductionPlan.moveDown(${r.id})">&#8595;</button>
                    </div>
                </div>
                <div class="pp-sub" style="margin-top:6px;"><strong>Менеджер:</strong> ${this.esc(r.manager || '—')}</div>
                <div class="pp-sub"><strong>Старт:</strong> ${this.esc(r.startLabel)}</div>
                <div class="pp-sub ${late ? 'text-red' : ''}"><strong>Дедлайн:</strong> ${this.esc(r.deadlineLabel)}</div>
                <div style="margin-top:8px;">${this._renderColorCell(r)}</div>
                <div class="pp-sub" style="margin-top:8px;"><strong>Фурнитура:</strong> ${this.esc(r.hwPlain || '—')}</div>
                <div class="pp-sub"><strong>Упаковка:</strong> ${this.esc(r.pkgPlain || '—')}</div>
                <div class="pp-sub"><strong>Заметки:</strong> ${this.esc(r.notes || '—')}</div>
                <div style="margin-top:10px;"><button class="btn btn-sm btn-outline" onclick="App.navigate('order-detail', true, ${r.id})">Открыть заказ</button></div>
            </div>`;
        }).join('');
    },

    async moveUp(orderId) {
        this._syncPriority();
        const i = this.priority.indexOf(Number(orderId));
        if (i <= 0) return;
        [this.priority[i - 1], this.priority[i]] = [this.priority[i], this.priority[i - 1]];
        await this._savePriority();
        this.applyFilters();
    },

    async moveDown(orderId) {
        this._syncPriority();
        const i = this.priority.indexOf(Number(orderId));
        if (i < 0 || i >= this.priority.length - 1) return;
        [this.priority[i], this.priority[i + 1]] = [this.priority[i + 1], this.priority[i]];
        await this._savePriority();
        this.applyFilters();
    },

    _sortRows(rows) {
        const pos = new Map(this.priority.map((id, i) => [Number(id), i]));
        return rows.slice().sort((a, b) => {
            const pa = pos.has(a.id) ? pos.get(a.id) : 999999;
            const pb = pos.has(b.id) ? pos.get(b.id) : 999999;
            if (pa !== pb) return pa - pb;
            if (a.deadlineTs && b.deadlineTs) return a.deadlineTs - b.deadlineTs;
            if (a.deadlineTs) return -1;
            if (b.deadlineTs) return 1;
            return (b.createdTs || 0) - (a.createdTs || 0);
        });
    },

    _syncPriority() {
        const ids = this.allRows.map(r => Number(r.id));
        const existing = new Set(ids);
        this.priority = this.priority.filter(id => existing.has(Number(id)));

        const missingRows = this.allRows
            .filter(r => !this.priority.includes(Number(r.id)))
            .sort((a, b) => {
                if (a.deadlineTs && b.deadlineTs) return a.deadlineTs - b.deadlineTs;
                if (a.deadlineTs) return -1;
                if (b.deadlineTs) return 1;
                return (a.createdTs || 0) - (b.createdTs || 0);
            });
        this.priority.push(...missingRows.map(r => Number(r.id)));
    },

    async _savePriority() {
        this._state = {
            order_ids: this.priority.slice(),
            updated_at: new Date().toISOString(),
            updated_by: App.getCurrentEmployeeName(),
        };
        await saveProductionPlanState(this._state);
    },

    _buildRow(order, items) {
        const productItems = (items || []).filter(i => !i.item_type || i.item_type === 'product');
        const hwItems = (items || []).filter(i => i.item_type === 'hardware');
        const pkgItems = (items || []).filter(i => i.item_type === 'packaging');

        const qtyTotal = productItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
        const productsPlain = productItems.map(i => i.product_name).filter(Boolean).join(', ');

        const colorLines = [];
        const attachments = [];
        const printingLines = [];
        productItems.forEach(item => {
            const colors = this._extractColorNames(item);
            if (colors.length) {
                colorLines.push(`${item.product_name || 'Изделие'}: ${colors.join(' + ')}`);
            }
            const att = this._extractAttachment(item);
            if (att) attachments.push(att);
            const printings = this._extractPrintings(item);
            if (printings.length) printingLines.push(`${item.product_name || 'Изделие'}: ${printings.join(', ')}`);
        });

        const hwPlain = hwItems.map(i => `${i.product_name || 'Фурнитура'} × ${(parseFloat(i.quantity) || 0)}`).join(', ');
        const pkgPlain = pkgItems.map(i => `${i.product_name || 'Упаковка'} × ${(parseFloat(i.quantity) || 0)}`).join(', ');

        const startIso = order.created_at || order.deadline_start || order.deadline || null;
        const endIso = order.deadline_end || order.deadline || null;
        const startLabel = startIso ? App.formatDate(startIso) : '—';
        let deadlineLabel = '—';
        if (endIso && startIso && endIso !== startIso) deadlineLabel = `${App.formatDate(startIso)} → ${App.formatDate(endIso)}`;
        else if (endIso || startIso) deadlineLabel = App.formatDate(endIso || startIso);

        return {
            id: Number(order.id),
            orderName: order.order_name || 'Заказ',
            manager: order.manager_name || '',
            notes: [order.notes || '', printingLines.length ? ('Печать: ' + printingLines.join(' · ')) : ''].filter(Boolean).join(' · '),
            status: order.status,
            statusLabel: App.statusLabel(order.status),
            qtyTotal,
            productsPlain,
            hwPlain,
            pkgPlain,
            colorLines,
            colorsPlain: colorLines.join(' · '),
            attachments,
            startLabel,
            deadlineLabel,
            deadlineTs: endIso ? new Date(endIso).getTime() : (startIso ? new Date(startIso).getTime() : null),
            createdTs: order.created_at ? new Date(order.created_at).getTime() : 0,
        };
    },

    _extractColorNames(item) {
        let colors = item.colors;
        if (typeof colors === 'string') {
            try { colors = JSON.parse(colors); } catch (e) { colors = []; }
        }
        if (!Array.isArray(colors)) colors = [];
        const names = colors.map(c => (typeof c === 'string' ? c : c?.name)).filter(Boolean);
        if (!names.length && item.color_name) names.push(item.color_name);
        return names;
    },

    _extractAttachment(item) {
        let att = item.color_solution_attachment || null;
        if (typeof att === 'string') {
            try { att = JSON.parse(att); } catch (e) { att = null; }
        }
        if (!att || !att.data_url) return null;
        return {
            name: att.name || 'Файл',
            type: att.type || '',
            data_url: att.data_url,
        };
    },

    _extractPrintings(item) {
        let printings = item.printings;
        if (typeof printings === 'string') {
            try { printings = JSON.parse(printings); } catch (e) { printings = []; }
        }
        if (!Array.isArray(printings)) return [];
        return printings
            .filter(p => (parseFloat(p.qty) || 0) > 0 || (parseFloat(p.price) || 0) > 0 || p.name)
            .map(p => p.name || 'нанесение');
    },

    _renderColorCell(row) {
        const lines = row.colorLines.length
            ? row.colorLines.map(x => `<div class="pp-sub">${this.esc(x)}</div>`).join('')
            : '<div class="pp-sub">—</div>';
        const files = row.attachments.map(att => {
            const isImg = (att.type || '').startsWith('image/');
            if (isImg) {
                return `<a href="${att.data_url}" target="_blank" class="pp-attachment">
                    <img src="${att.data_url}" alt="${this.esc(att.name)}">
                    <span>${this.esc(att.name)}</span>
                </a>`;
            }
            return `<a href="${att.data_url}" target="_blank" class="pp-file-link">&#128206; ${this.esc(att.name)}</a>`;
        }).join('');
        return lines + (files ? `<div class="pp-files">${files}</div>` : '');
    },

    esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
};

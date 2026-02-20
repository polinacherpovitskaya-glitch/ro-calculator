// =============================================
// Recycle Object — Molds (Справочник молдов)
// Full analysis: cost, target price, margin,
// production load, payback, order history
// =============================================

const Molds = {
    allMolds: [],
    editingId: null,

    async load() {
        this.allMolds = await loadMolds();
        this.enrichMolds();
        this.renderStats();
        this.filterAndRender();
        this.bindFormEvents();
    },

    // === Enrich each mold with calculated data ===
    enrichMolds() {
        const params = App.params;
        if (!params) return;

        this.allMolds.forEach(m => {
            const pph = m.pph_actual || m.pph_min || 1;
            const weight = m.weight_grams || 0;

            // Calculate cost per unit at different quantities
            [100, 500, 1000].forEach(qty => {
                const item = {
                    quantity: qty,
                    pieces_per_hour: pph,
                    weight_grams: weight,
                    extra_molds: 0,
                    complex_design: false,
                    is_nfc: m.category === 'nfc',
                    nfc_programming: m.category === 'nfc',
                    hardware_qty: 0,
                    packaging_qty: 0,
                    printing_qty: 0,
                    delivery_included: false,
                };

                // Override mold amortization with real cost
                const result = calculateItemCost(item, params);
                // Recalculate mold amortization with real cost
                const realMoldCost = m.cost_rub || (m.cost_cny * (m.cny_rate || 14) + (m.delivery_cost || 0));
                const realMoldAmort = realMoldCost / qty;
                const adjustedTotal = result.costTotal - result.costMoldAmortization + realMoldAmort;

                m['cost_' + qty] = round2(adjustedTotal);
                m['mold_amort_' + qty] = round2(realMoldAmort);
                m['target_' + qty] = calculateTargetPrice(adjustedTotal, params);
            });

            // Real mold total cost
            m.cost_rub_calc = m.cost_rub || (m.cost_cny * (m.cny_rate || 14) + (m.delivery_cost || 0));

            // Margin at target price for 500 units
            const margin500 = calculateActualMargin(m.target_500, m.cost_500);
            m.margin_500_pct = margin500.percent;
            m.margin_500_rub = margin500.earned;

            // Payback: how many units needed to pay back the mold
            // payback = mold_cost / margin_per_unit
            m.payback_units = m.margin_500_rub > 0
                ? Math.ceil(m.cost_rub_calc / m.margin_500_rub)
                : Infinity;

            // Payback progress
            m.payback_progress = m.total_units_produced && m.payback_units < Infinity
                ? round2(m.total_units_produced / m.payback_units * 100)
                : 0;

            // Revenue generated (estimate)
            m.total_revenue_est = round2((m.total_units_produced || 0) * (m.target_500 || 0));

            // Hours per 100 units
            m.hours_per_100 = pph > 0 ? round2(100 / pph * (params.wasteFactor || 1.1)) : 0;

            // Complexity label
            const complexityLabels = {
                simple: 'Простой (800¥)',
                complex: 'Сложный (1000¥)',
                nfc_triple: 'NFC 3-част. (1200¥)',
            };
            m.complexity_label = complexityLabels[m.complexity] || m.complexity;

            // Status label
            const statusLabels = {
                active: 'Активный',
                client: 'Клиентский',
                retired: 'Неактивный',
            };
            m.status_label = statusLabels[m.status] || m.status;

            // Category label
            const catLabels = {
                blank: 'Бланк',
                nfc: 'NFC',
                custom: 'Кастомный',
                client_custom: 'Клиентский',
            };
            m.category_label = catLabels[m.category] || m.category;
        });
    },

    // === Stats ===
    renderStats() {
        const total = this.allMolds.length;
        const active = this.allMolds.filter(m => m.status === 'active').length;
        const avgCost = total > 0
            ? round2(this.allMolds.reduce((s, m) => s + (m.cost_100 || 0), 0) / total)
            : 0;
        const totalValue = this.allMolds.reduce((s, m) => s + (m.cost_rub_calc || 0), 0);

        document.getElementById('molds-total').textContent = total;
        document.getElementById('molds-active').textContent = active;
        document.getElementById('molds-avg-cost').textContent = formatRub(avgCost);
        document.getElementById('molds-total-value').textContent = formatRub(totalValue);
    },

    // === Filtering & Sorting ===
    filterAndRender() {
        const status = document.getElementById('molds-filter-status').value;
        const category = document.getElementById('molds-filter-category').value;
        const sort = document.getElementById('molds-sort').value;
        const search = (document.getElementById('molds-search').value || '').toLowerCase().trim();

        let filtered = [...this.allMolds];

        if (status) filtered = filtered.filter(m => m.status === status);
        if (category) filtered = filtered.filter(m => m.category === category);
        if (search) filtered = filtered.filter(m => (m.name || '').toLowerCase().includes(search));

        // Sort
        switch (sort) {
            case 'name': filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
            case 'cost_asc': filtered.sort((a, b) => (a.cost_500 || 0) - (b.cost_500 || 0)); break;
            case 'cost_desc': filtered.sort((a, b) => (b.cost_500 || 0) - (a.cost_500 || 0)); break;
            case 'margin_desc': filtered.sort((a, b) => (b.margin_500_pct || 0) - (a.margin_500_pct || 0)); break;
            case 'orders_desc': filtered.sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0)); break;
            case 'payback': filtered.sort((a, b) => (a.payback_units || Infinity) - (b.payback_units || Infinity)); break;
        }

        this.renderCards(filtered);
    },

    // === Render mold cards ===
    renderCards(molds) {
        const container = document.getElementById('molds-cards-container');

        if (molds.length === 0) {
            container.innerHTML = `<div class="empty-state">
                <div class="empty-icon">&#9670;</div>
                <p>Нет молдов по заданным фильтрам</p>
            </div>`;
            return;
        }

        container.innerHTML = molds.map(m => {
            const statusClass = m.status === 'active' ? 'badge-green' : m.status === 'client' ? 'badge-yellow' : 'badge-red';
            const marginClass = (m.margin_500_pct || 0) >= 30 ? 'text-green' : 'text-red';
            const paybackClass = m.payback_progress >= 100 ? 'green' : m.payback_progress >= 50 ? 'yellow' : 'red';
            const paybackPct = Math.min(m.payback_progress, 100);

            return `
            <div class="card" style="margin-bottom: 12px;">
                <div class="card-header">
                    <h3>${this.esc(m.name)}</h3>
                    <div class="flex gap-8">
                        <span class="badge ${statusClass}">${m.status_label}</span>
                        <span class="badge badge-blue">${m.category_label}</span>
                        <button class="btn btn-sm btn-outline" onclick="Molds.editMold(${m.id})">&#9998;</button>
                    </div>
                </div>

                <div class="form-row" style="margin-bottom: 12px;">
                    <div class="stat-card">
                        <div class="stat-label">Молд</div>
                        <div class="stat-value" style="font-size:16px">${m.complexity_label}</div>
                        <div class="stat-sub">${formatRub(m.cost_rub_calc)}</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Скорость</div>
                        <div class="stat-value" style="font-size:16px">${m.pph_actual ? m.pph_actual + ' <small style="font-size:11px;color:var(--green)">(факт)</small>' : m.pph_min + (m.pph_max !== m.pph_min ? '-' + m.pph_max : '') + ' <small style="font-size:11px;color:var(--text-muted)">(план)</small>'} шт/ч</div>
                        <div class="stat-sub">${m.weight_grams}г / ${m.hours_per_100} ч на 100шт</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Заказов</div>
                        <div class="stat-value" style="font-size:16px">${m.total_orders || 0}</div>
                        <div class="stat-sub">${(m.total_units_produced || 0).toLocaleString('ru-RU')} шт выпущено</div>
                    </div>
                </div>

                <!-- Cost breakdown by quantity -->
                <div class="cost-breakdown">
                    <div class="section-title" style="margin-top:0">Себестоимость (без фурнитуры/упаковки)</div>
                    <div class="cost-row">
                        <span class="cost-label">100 шт</span>
                        <span class="cost-value">${formatRub(m.cost_100)} <small class="text-muted">(амортизация ${formatRub(m.mold_amort_100)})</small></span>
                    </div>
                    <div class="cost-row">
                        <span class="cost-label">500 шт</span>
                        <span class="cost-value">${formatRub(m.cost_500)} <small class="text-muted">(амортизация ${formatRub(m.mold_amort_500)})</small></span>
                    </div>
                    <div class="cost-row">
                        <span class="cost-label">1000 шт</span>
                        <span class="cost-value">${formatRub(m.cost_1000)} <small class="text-muted">(амортизация ${formatRub(m.mold_amort_1000)})</small></span>
                    </div>
                </div>

                <!-- Target prices -->
                <div class="target-block" style="margin-top: 8px;">
                    <h4>Таргет цена (70/30)</h4>
                    <div class="cost-row">
                        <span class="cost-label">100 шт</span>
                        <span class="cost-value">${formatRub(m.target_100)}</span>
                    </div>
                    <div class="cost-row">
                        <span class="cost-label">500 шт</span>
                        <span class="cost-value">${formatRub(m.target_500)}</span>
                    </div>
                    <div class="cost-row">
                        <span class="cost-label">1000 шт</span>
                        <span class="cost-value">${formatRub(m.target_1000)}</span>
                    </div>
                </div>

                <!-- Margin & Payback -->
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px;">
                    <div class="stat-card">
                        <div class="stat-label">Маржа (500 шт)</div>
                        <div class="stat-value ${marginClass}" style="font-size:18px">${formatPercent(m.margin_500_pct)}</div>
                        <div class="stat-sub">${formatRub(m.margin_500_rub)} / шт</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-label">Окупаемость молда</div>
                        <div class="stat-value" style="font-size:18px">${m.payback_units < Infinity ? m.payback_units + ' шт' : '—'}</div>
                        <div class="load-bar"><div class="load-bar-fill ${paybackClass}" style="width:${paybackPct}%"></div></div>
                        <div class="stat-sub">${m.payback_progress >= 100 ? '&#10003; Окупился' : formatPercent(m.payback_progress) + ' окупленности'}</div>
                    </div>
                </div>

                ${m.hw_speed ? `<div style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);">Скорость сборки фурнитуры: <strong>${m.hw_speed} шт/ч</strong></div>` : ''}
                ${m.client ? `<div style="margin-top: 4px; font-size: 12px; color: var(--text-secondary);">Клиент: <strong>${this.esc(m.client)}</strong></div>` : ''}
                ${m.notes ? `<div style="margin-top: 4px; font-size: 12px; color: var(--text-muted);">${this.esc(m.notes)}</div>` : ''}
            </div>`;
        }).join('');
    },

    // === Form logic ===
    bindFormEvents() {
        // Auto-calculate mold cost in RUB when CNY fields change
        ['mold-cost-cny', 'mold-cny-rate', 'mold-delivery-cost', 'mold-complexity'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => this.recalcMoldCost());
            if (el) el.addEventListener('input', () => this.recalcMoldCost());
        });
    },

    recalcMoldCost() {
        const complexity = document.getElementById('mold-complexity').value;
        let costCny = parseFloat(document.getElementById('mold-cost-cny').value) || 0;

        // Auto-fill if empty based on complexity
        if (costCny === 0) {
            const defaults = { simple: 800, complex: 1000, nfc_triple: 1200 };
            costCny = defaults[complexity] || 800;
            document.getElementById('mold-cost-cny').value = costCny;
        }

        const rate = parseFloat(document.getElementById('mold-cny-rate').value) || 14;
        const delivery = parseFloat(document.getElementById('mold-delivery-cost').value) || 0;
        const totalRub = round2(costCny * rate + delivery);
        document.getElementById('mold-cost-rub').value = totalRub;
    },

    showAddForm() {
        this.editingId = null;
        document.getElementById('mold-form-title').textContent = 'Новый молд';
        this.clearForm();
        document.getElementById('mold-edit-form').style.display = '';
        document.getElementById('mold-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editMold(id) {
        const m = this.allMolds.find(x => x.id === id);
        if (!m) return;

        this.editingId = id;
        document.getElementById('mold-form-title').textContent = 'Редактировать: ' + m.name;

        document.getElementById('mold-name').value = m.name || '';
        document.getElementById('mold-category').value = m.category || 'blank';
        document.getElementById('mold-status').value = m.status || 'active';
        document.getElementById('mold-pph-min').value = m.pph_min || '';
        document.getElementById('mold-pph-max').value = m.pph_max || '';
        document.getElementById('mold-pph-actual').value = m.pph_actual || '';
        document.getElementById('mold-weight').value = m.weight_grams || '';
        document.getElementById('mold-complexity').value = m.complexity || 'simple';
        document.getElementById('mold-cost-cny').value = m.cost_cny || '';
        document.getElementById('mold-cny-rate').value = m.cny_rate || 14;
        document.getElementById('mold-delivery-cost').value = m.delivery_cost || 2000;
        document.getElementById('mold-cost-rub').value = m.cost_rub_calc || '';
        document.getElementById('mold-client').value = m.client || '';
        document.getElementById('mold-hw-speed').value = m.hw_speed || '';
        document.getElementById('mold-notes').value = m.notes || '';

        document.getElementById('mold-edit-form').style.display = '';
        document.getElementById('mold-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    clearForm() {
        ['mold-name', 'mold-pph-min', 'mold-pph-max', 'mold-pph-actual',
         'mold-weight', 'mold-cost-cny', 'mold-client', 'mold-hw-speed', 'mold-notes'
        ].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('mold-category').value = 'blank';
        document.getElementById('mold-status').value = 'active';
        document.getElementById('mold-complexity').value = 'simple';
        document.getElementById('mold-cny-rate').value = 14;
        document.getElementById('mold-delivery-cost').value = 2000;
        document.getElementById('mold-cost-rub').value = '';
    },

    hideForm() {
        document.getElementById('mold-edit-form').style.display = 'none';
        this.editingId = null;
    },

    async saveMold() {
        const name = document.getElementById('mold-name').value.trim();
        if (!name) {
            App.toast('Введите название молда');
            return;
        }

        this.recalcMoldCost();

        const mold = {
            id: this.editingId || undefined,
            name,
            category: document.getElementById('mold-category').value,
            status: document.getElementById('mold-status').value,
            pph_min: parseFloat(document.getElementById('mold-pph-min').value) || 0,
            pph_max: parseFloat(document.getElementById('mold-pph-max').value) || 0,
            pph_actual: parseFloat(document.getElementById('mold-pph-actual').value) || null,
            weight_grams: parseFloat(document.getElementById('mold-weight').value) || 0,
            complexity: document.getElementById('mold-complexity').value,
            cost_cny: parseFloat(document.getElementById('mold-cost-cny').value) || 0,
            cny_rate: parseFloat(document.getElementById('mold-cny-rate').value) || 14,
            delivery_cost: parseFloat(document.getElementById('mold-delivery-cost').value) || 0,
            cost_rub: parseFloat(document.getElementById('mold-cost-rub').value) || 0,
            client: document.getElementById('mold-client').value.trim(),
            hw_speed: parseFloat(document.getElementById('mold-hw-speed').value) || null,
            notes: document.getElementById('mold-notes').value.trim(),
            // Preserve existing stats if editing
            total_orders: 0,
            total_units_produced: 0,
        };

        // If editing, preserve stats
        if (this.editingId) {
            const existing = this.allMolds.find(m => m.id === this.editingId);
            if (existing) {
                mold.total_orders = existing.total_orders || 0;
                mold.total_units_produced = existing.total_units_produced || 0;
            }
        }

        await saveMold(mold);
        App.toast('Молд сохранен');
        this.hideForm();
        await this.load();
    },

    // === Export CSV ===
    exportCSV() {
        const headers = ['Название', 'Категория', 'Статус', 'Тип молда', 'Стоимость молда (₽)',
            'Шт/ч (план)', 'Шт/ч (факт)', 'Вес (г)',
            'Себест. 100шт', 'Себест. 500шт', 'Себест. 1000шт',
            'Таргет 100шт', 'Таргет 500шт', 'Таргет 1000шт',
            'Маржа 500шт %', 'Окупаемость (шт)', 'Заказов', 'Выпущено шт'];

        const rows = this.allMolds.map(m => [
            m.name, m.category_label, m.status_label, m.complexity_label, m.cost_rub_calc,
            m.pph_min + (m.pph_max !== m.pph_min ? '-' + m.pph_max : ''), m.pph_actual || '',
            m.weight_grams, m.cost_100, m.cost_500, m.cost_1000,
            m.target_100, m.target_500, m.target_1000,
            m.margin_500_pct, m.payback_units < Infinity ? m.payback_units : '', m.total_orders || 0, m.total_units_produced || 0,
        ]);

        let csv = '\uFEFF'; // BOM for Excel
        csv += headers.join(';') + '\n';
        rows.forEach(r => {
            csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\n';
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'molds_analysis_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
        App.toast('CSV экспортирован');
    },

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

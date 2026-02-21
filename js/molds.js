// =============================================
// Recycle Object — Blanks (Справочник бланков)
// Compact table view with pricing
// =============================================

// Pricing formula for blanks page:
// 1. Себестоимость рассчитывается как для любых изделий (молд / 4500)
// 2. Маржа зависит от тиража: чем больше заказ, тем ниже маржа
// 3. Цена = (себест + НДС) * (1 + маржа) / (1 - налог - 6.5%), округлено до 5₽

// Молд НЕ делим на тираж заказа — делим на макс. производительность молда
// Макс. производительность = 5000 шт * 0.9 = 4500 шт
const MOLD_MAX_LIFETIME = 4500; // максимальный ресурс молда (шт)

const MOLD_TIERS = [50, 100, 300, 500, 1000, 3000];

// Тиражные маржи бланков — мотивируют заказывать больше
// Совпадают с CALC_TIER_MARGINS из calculator.js для единообразия
const BLANKS_TIER_MARGINS = [
    { min: 0,    max: 75,       margin: 0.65 },  // 50 шт  → 65%
    { min: 75,   max: 200,      margin: 0.55 },  // 100 шт → 55%
    { min: 200,  max: 400,      margin: 0.48 },  // 300 шт → 48%
    { min: 400,  max: 750,      margin: 0.43 },  // 500 шт → 43%
    { min: 750,  max: 2500,     margin: 0.40 },  // 1K шт  → 40%
    { min: 2500, max: Infinity, margin: 0.35 },  // 3K шт  → 35%
];

/**
 * Округление цены вверх до ближайшего кратного 5₽
 * 517₽ → 520₽, 531₽ → 535₽, 100₽ → 100₽
 */
function roundTo5(n) {
    return Math.ceil(n / 5) * 5;
}

function getBlankMargin(qty) {
    const tier = BLANKS_TIER_MARGINS.find(t => qty >= t.min && qty < t.max);
    return tier ? tier.margin : 0.40;
}

/**
 * Таргет цена бланка = (себест + НДС) * (1 + маржа) / (1 - налог - НДС_выход)
 * Маржа зависит от тиража: 65% при 50 шт → 35% при 3K шт
 */
function calcBlankTargetPrice(cost, qty, params) {
    if (cost <= 0 || qty <= 0) return 0;
    const margin = getBlankMargin(qty);
    const vatOnCost = cost * (params.vatRate || 0.05);
    return round2((cost + vatOnCost) * (1 + margin) / (1 - (params.taxRate || 0.06) - 0.065));
}

/**
 * Цена продажи бланка = таргет цена, округлённая до 5₽ вверх
 * Маржа уже заложена в таргет через тиражные множители
 */
function calcBlankSellPrice(cost, qty, params) {
    if (cost <= 0 || qty <= 0) return 0;
    const target = calcBlankTargetPrice(cost, qty, params);
    return roundTo5(target);
}

const Molds = {
    allMolds: [],
    editingId: null,

    async load() {
        this.allMolds = await loadMolds();
        this.enrichMolds();
        this.populateCollectionDropdowns();
        this.renderStats();
        this.filterAndRender();
        this.bindFormEvents();
    },

    // Build unique collections list from all molds
    getCollections() {
        const set = new Set();
        this.allMolds.forEach(m => { if (m.collection) set.add(m.collection); });
        return [...set].sort();
    },

    populateCollectionDropdowns() {
        const collections = this.getCollections();

        // Filter dropdown
        const filterEl = document.getElementById('molds-filter-collection');
        if (filterEl) {
            const currentVal = filterEl.value;
            filterEl.innerHTML = '<option value="">Все</option>' +
                collections.map(c => `<option value="${c}"${c === currentVal ? ' selected' : ''}>${c}</option>`).join('');
        }

        // Form dropdown
        const formEl = document.getElementById('mold-collection');
        if (formEl) {
            const currentVal = formEl.value;
            formEl.innerHTML = '<option value="">— Без коллекции —</option>' +
                collections.map(c => `<option value="${c}"${c === currentVal ? ' selected' : ''}>${c}</option>`).join('');
        }
    },

    addNewCollection() {
        const name = prompt('Название новой коллекции:');
        if (!name || !name.trim()) return;
        const trimmed = name.trim();
        // Add to form dropdown and select it
        const formEl = document.getElementById('mold-collection');
        if (formEl) {
            // Check if already exists
            const exists = [...formEl.options].some(o => o.value === trimmed);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed;
                formEl.appendChild(opt);
            }
            formEl.value = trimmed;
        }
    },

    enrichMolds() {
        const params = App.params;
        if (!params) return;

        this.allMolds.forEach(m => {
            const pph = m.pph_actual || m.pph_min || 1;
            const weight = m.weight_grams || 0;
            const moldCount = m.mold_count || 1;

            // Real mold total cost (including delivery)
            const singleMoldCost = (m.cost_cny || 800) * (m.cny_rate || 12.5) + (m.delivery_cost || 8000);
            m.cost_rub_calc = round2(singleMoldCost * moldCount);

            // Амортизация молда = стоимость / макс. ресурс (4500 шт), одинаковая для всех тиражей
            const moldAmortPerUnit = m.cost_rub_calc / MOLD_MAX_LIFETIME;

            // Calculate cost per unit at each tier
            m.tiers = {};
            MOLD_TIERS.forEach(qty => {
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

                const result = calculateItemCost(item, params);
                // Replace default mold amortization with real cost / MOLD_MAX_LIFETIME
                let adjustedCost = result.costTotal - result.costMoldAmortization + moldAmortPerUnit;

                // Add built-in hardware cost if present
                let hwCostPerUnit = 0;
                if (m.hw_name && m.hw_price_per_unit > 0) {
                    hwCostPerUnit = m.hw_price_per_unit + (m.hw_delivery_total ? m.hw_delivery_total / qty : 0);
                    // Add assembly labor if hw_speed is set
                    if (m.hw_speed > 0) {
                        const hwHours = qty / m.hw_speed * (params.wasteFactor || 1.1);
                        hwCostPerUnit += hwHours * params.fotPerHour / qty;
                    }
                    adjustedCost += hwCostPerUnit;
                }

                // Таргет = формула 70/30 с тиражной маржой (65%@50 → 35%@3K)
                // Продажа = таргет, округлённый до 5₽
                const targetPrice = calcBlankTargetPrice(adjustedCost, qty, params);
                const sellPrice = calcBlankSellPrice(adjustedCost, qty, params);
                const margin = getBlankMargin(qty);

                m.tiers[qty] = {
                    cost: round2(adjustedCost),
                    targetPrice: targetPrice,
                    sellPrice: sellPrice,
                    margin: margin,
                    moldAmort: round2(moldAmortPerUnit),
                    hwCost: round2(hwCostPerUnit),
                };
            });

            // Margin info at 500 units (based on sell price vs cost)
            const t500 = m.tiers[500];
            if (t500) {
                const marginAbs = t500.sellPrice - t500.cost;
                m.margin_500_pct = t500.sellPrice > 0 ? round2(marginAbs / t500.sellPrice * 100) : 0;
            }

            // Labels
            m.complexity_label = { simple: '2ч 800¥', complex: '2ч 1000¥', nfc_triple: '3ч 1200¥' }[m.complexity] || m.complexity;
            m.status_label = { active: 'Активный', client: 'Клиентский', retired: 'Неактив.' }[m.status] || m.status;
            m.category_label = { blank: 'Бланк', nfc: 'NFC', custom: 'Кастом', client_custom: 'Клиент.' }[m.category] || m.category;
        });
    },

    renderStats() {
        const total = this.allMolds.length;
        const active = this.allMolds.filter(m => m.status === 'active').length;
        const avgCost = total > 0
            ? round2(this.allMolds.reduce((s, m) => s + (m.tiers?.[100]?.cost || 0), 0) / total) : 0;
        const totalValue = this.allMolds.reduce((s, m) => s + (m.cost_rub_calc || 0), 0);

        document.getElementById('molds-total').textContent = total;
        document.getElementById('molds-active').textContent = active;
        document.getElementById('molds-avg-cost').textContent = formatRub(avgCost);
        document.getElementById('molds-total-value').textContent = formatRub(totalValue);
    },

    filterAndRender() {
        const status = document.getElementById('molds-filter-status').value;
        const collectionFilter = document.getElementById('molds-filter-collection')?.value || '';
        const sort = document.getElementById('molds-sort').value;
        const search = (document.getElementById('molds-search').value || '').toLowerCase().trim();

        let filtered = [...this.allMolds];
        if (status) filtered = filtered.filter(m => m.status === status);
        if (collectionFilter) filtered = filtered.filter(m => m.collection === collectionFilter);
        if (search) filtered = filtered.filter(m => (m.name || '').toLowerCase().includes(search));

        switch (sort) {
            case 'name': filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break;
            case 'cost_asc': filtered.sort((a, b) => (a.tiers?.[500]?.cost || 0) - (b.tiers?.[500]?.cost || 0)); break;
            case 'cost_desc': filtered.sort((a, b) => (b.tiers?.[500]?.cost || 0) - (a.tiers?.[500]?.cost || 0)); break;
            case 'margin_desc': filtered.sort((a, b) => (b.margin_500_pct || 0) - (a.margin_500_pct || 0)); break;
            case 'orders_desc': filtered.sort((a, b) => (b.total_orders || 0) - (a.total_orders || 0)); break;
        }

        this.renderTable(filtered);
    },

    // === COMPACT TABLE VIEW — 2 rows: себес (gray) + цена (green) ===
    renderTable(molds) {
        const container = document.getElementById('molds-cards-container');

        if (molds.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Нет бланков по фильтрам</p></div>';
            return;
        }

        // Build tier headers with qty labels
        const tierHeaders = MOLD_TIERS.map(q => {
            const label = q >= 1000 ? (q/1000) + 'K' : q;
            return `<th class="text-right" style="font-size:11px;padding:4px 6px;">${label} шт</th>`;
        }).join('');

        let html = `
        <div class="card" style="padding:12px; overflow-x:auto;">
            <table style="font-size:12px; white-space:nowrap; border-collapse:collapse;">
                <thead>
                    <tr>
                        <th style="min-width:180px; padding:6px 8px;">Бланк</th>
                        <th style="width:50px;padding:4px 6px;"></th>
                        ${tierHeaders}
                        <th style="width:30px"></th>
                    </tr>
                </thead>
                <tbody>`;

        molds.forEach(m => {
            const statusDot = m.status === 'active' ? 'calculated' : m.status === 'client' ? 'in_production' : 'cancelled';
            const pphDisplay = m.pph_actual
                ? `<strong>${m.pph_actual}</strong><sup style="color:var(--green);font-size:9px">✓</sup>`
                : (m.pph_min > 0 ? `${m.pph_min}${m.pph_max !== m.pph_min ? '-' + m.pph_max : ''}` : '—');
            const moldCountBadge = (m.mold_count || 1) > 1 ? ` <sup style="color:var(--orange);font-weight:700">x${m.mold_count}</sup>` : '';
            const collectionLabel = m.collection ? `<span style="font-size:9px;color:var(--accent);margin-left:4px;">${this.esc(m.collection)}</span>` : '';

            // Row 1: Себестоимость (gray, small)
            const costCells = MOLD_TIERS.map(q => {
                const t = m.tiers?.[q];
                return `<td class="text-right" style="font-size:10px;color:var(--text-secondary);padding:3px 6px;">${t ? Math.round(t.cost) : '—'}</td>`;
            }).join('');

            // Row 2: Цена продажи (green, bold)
            const sellCells = MOLD_TIERS.map(q => {
                const t = m.tiers?.[q];
                return `<td class="text-right" style="font-size:13px;font-weight:700;color:var(--green);padding:3px 6px;">${t ? Math.round(t.sellPrice) : '—'}</td>`;
            }).join('');

            html += `
                <tr>
                    <td rowspan="2" style="vertical-align:top; padding:6px 8px; border-bottom:2px solid var(--border);">
                        <div style="font-weight:700; font-size:13px;"><span class="status-dot ${statusDot}"></span>${this.esc(m.name)}${moldCountBadge}${collectionLabel}</div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${pphDisplay} шт/ч · ${m.weight_grams}г</div>
                        ${m.hw_name ? `<div style="font-size:10px; color:var(--accent); margin-top:1px;">+ ${this.esc(m.hw_name)}</div>` : ''}
                        ${m.notes ? `<div style="font-size:10px; color:var(--text-muted); font-style:italic;">${this.esc(m.notes)}</div>` : ''}
                    </td>
                    <td style="font-size:9px;color:var(--text-secondary);padding:3px 4px;white-space:nowrap;">себес</td>
                    ${costCells}
                    <td rowspan="2" style="vertical-align:top; border-bottom:2px solid var(--border);">
                        <div style="display:flex;flex-direction:column;gap:2px;">
                            <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Molds.editMold(${m.id})">&#9998;</button>
                            <button class="btn-remove" style="font-size:9px;width:24px;height:24px;" title="Удалить" onclick="Molds.confirmDelete(${m.id}, '${this.esc(m.name)}')">&#10005;</button>
                        </div>
                    </td>
                </tr>
                <tr style="border-bottom:2px solid var(--border);">
                    <td style="font-size:9px;color:var(--green);font-weight:600;padding:3px 4px;white-space:nowrap;">цена</td>
                    ${sellCells}
                </tr>`;
        });

        html += '</tbody></table>';

        // Legend with tier margins
        const marginLabels = MOLD_TIERS.map(q => {
            const label = q >= 1000 ? (q/1000) + 'K' : q;
            return `${label}=${Math.round(getBlankMargin(q)*100)}%`;
        }).join(', ');
        html += `
            <div style="margin-top:10px; font-size:11px; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
                <span><span style="color:var(--text-secondary);">себес</span> — себестоимость</span>
                <span><span style="color:var(--green);font-weight:700;">цена</span> — цена продажи</span>
                <span>Маржа по тиражу: ${marginLabels}</span>
                <span>Округление до 5₽</span>
            </div>
        </div>`;

        container.innerHTML = html;
    },

    // === Form logic ===
    bindFormEvents() {
        ['mold-cost-cny', 'mold-cny-rate', 'mold-delivery-cost', 'mold-complexity', 'mold-count'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.recalcMoldCost());
                el.addEventListener('input', () => this.recalcMoldCost());
            }
        });
    },

    recalcMoldCost() {
        const complexity = document.getElementById('mold-complexity').value;
        let costCny = parseFloat(document.getElementById('mold-cost-cny').value) || 0;
        const moldCount = parseInt(document.getElementById('mold-count').value) || 1;

        if (costCny === 0) {
            const defaults = { simple: 800, complex: 1000, nfc_triple: 1200 };
            costCny = defaults[complexity] || 800;
            document.getElementById('mold-cost-cny').value = costCny;
        }

        const rate = parseFloat(document.getElementById('mold-cny-rate').value) || 12.5;
        const delivery = parseFloat(document.getElementById('mold-delivery-cost').value) || 0;
        const totalRub = round2((costCny * rate + delivery) * moldCount);
        document.getElementById('mold-cost-rub').value = totalRub;
    },

    showAddForm() {
        this.editingId = null;
        document.getElementById('mold-form-title').textContent = 'Новый бланк';
        this.clearForm();
        document.getElementById('mold-delete-btn').style.display = 'none';
        document.getElementById('mold-edit-form').style.display = '';
        document.getElementById('mold-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editMold(id) {
        const m = this.allMolds.find(x => x.id === id);
        if (!m) return;
        this.editingId = id;
        document.getElementById('mold-form-title').textContent = 'Редактировать: ' + (m.name || '');

        document.getElementById('mold-name').value = m.name || '';
        document.getElementById('mold-category').value = m.category || 'blank';
        // Set collection — add option if it doesn't exist yet
        const collEl = document.getElementById('mold-collection');
        if (collEl && m.collection) {
            const exists = [...collEl.options].some(o => o.value === m.collection);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = m.collection;
                opt.textContent = m.collection;
                collEl.appendChild(opt);
            }
            collEl.value = m.collection;
        } else if (collEl) {
            collEl.value = '';
        }
        document.getElementById('mold-status').value = m.status || 'active';
        document.getElementById('mold-pph-min').value = m.pph_min || '';
        document.getElementById('mold-pph-max').value = m.pph_max || '';
        document.getElementById('mold-pph-actual').value = m.pph_actual || '';
        document.getElementById('mold-weight').value = m.weight_grams || '';
        document.getElementById('mold-complexity').value = m.complexity || 'simple';
        document.getElementById('mold-cost-cny').value = m.cost_cny || '';
        document.getElementById('mold-cny-rate').value = m.cny_rate || 12.5;
        document.getElementById('mold-delivery-cost').value = m.delivery_cost || 8000;
        document.getElementById('mold-cost-rub').value = m.cost_rub_calc || '';
        document.getElementById('mold-count').value = m.mold_count || 1;
        document.getElementById('mold-client').value = m.client || '';
        document.getElementById('mold-hw-name').value = m.hw_name || '';
        document.getElementById('mold-hw-price').value = m.hw_price_per_unit || '';
        document.getElementById('mold-hw-delivery-total').value = m.hw_delivery_total || '';
        document.getElementById('mold-hw-speed').value = m.hw_speed || '';
        document.getElementById('mold-notes').value = m.notes || '';

        document.getElementById('mold-delete-btn').style.display = '';
        document.getElementById('mold-edit-form').style.display = '';
        document.getElementById('mold-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    async deleteFromForm() {
        if (!this.editingId) return;
        const m = this.allMolds.find(x => x.id === this.editingId);
        const name = m ? m.name : '';
        if (confirm(`Удалить бланк "${name}"?`)) {
            await deleteMold(this.editingId);
            App.toast('Бланк удален');
            this.hideForm();
            await this.load();
        }
    },

    clearForm() {
        ['mold-name', 'mold-pph-min', 'mold-pph-max', 'mold-pph-actual',
         'mold-weight', 'mold-cost-cny', 'mold-client',
         'mold-hw-name', 'mold-hw-price', 'mold-hw-speed', 'mold-notes'
        ].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('mold-category').value = 'blank';
        const collEl = document.getElementById('mold-collection');
        if (collEl) collEl.value = '';
        document.getElementById('mold-status').value = 'active';
        document.getElementById('mold-complexity').value = 'simple';
        document.getElementById('mold-cny-rate').value = 12.5;
        document.getElementById('mold-delivery-cost').value = 8000;
        document.getElementById('mold-count').value = 1;
        document.getElementById('mold-cost-rub').value = '';
        document.getElementById('mold-hw-delivery-total').value = 0;
    },

    hideForm() {
        document.getElementById('mold-edit-form').style.display = 'none';
        this.editingId = null;
    },

    async saveMold() {
        const name = document.getElementById('mold-name').value.trim();
        if (!name) { App.toast('Введите название бланка'); return; }

        this.recalcMoldCost();

        const mold = {
            id: this.editingId || undefined,
            name,
            category: document.getElementById('mold-category').value,
            collection: (document.getElementById('mold-collection')?.value || '').trim(),
            status: document.getElementById('mold-status').value,
            pph_min: parseFloat(document.getElementById('mold-pph-min').value) || 0,
            pph_max: parseFloat(document.getElementById('mold-pph-max').value) || 0,
            pph_actual: parseFloat(document.getElementById('mold-pph-actual').value) || null,
            weight_grams: parseFloat(document.getElementById('mold-weight').value) || 0,
            complexity: document.getElementById('mold-complexity').value,
            cost_cny: parseFloat(document.getElementById('mold-cost-cny').value) || 0,
            cny_rate: parseFloat(document.getElementById('mold-cny-rate').value) || 12.5,
            delivery_cost: parseFloat(document.getElementById('mold-delivery-cost').value) || 8000,
            cost_rub: parseFloat(document.getElementById('mold-cost-rub').value) || 0,
            mold_count: parseInt(document.getElementById('mold-count').value) || 1,
            client: document.getElementById('mold-client').value.trim(),
            hw_name: document.getElementById('mold-hw-name').value.trim(),
            hw_price_per_unit: parseFloat(document.getElementById('mold-hw-price').value) || 0,
            hw_delivery_total: parseFloat(document.getElementById('mold-hw-delivery-total').value) || 0,
            hw_speed: parseFloat(document.getElementById('mold-hw-speed').value) || null,
            notes: document.getElementById('mold-notes').value.trim(),
            total_orders: 0,
            total_units_produced: 0,
        };

        if (this.editingId) {
            const existing = this.allMolds.find(m => m.id === this.editingId);
            if (existing) {
                mold.total_orders = existing.total_orders || 0;
                mold.total_units_produced = existing.total_units_produced || 0;
            }
        }

        await saveMold(mold);
        App.toast('Бланк сохранен');
        this.hideForm();
        await this.load();
    },

    async confirmDelete(id, name) {
        if (confirm(`Удалить бланк "${name}"?`)) {
            await deleteMold(id);
            App.toast('Бланк удален');
            await this.load();
        }
    },

    exportCSV() {
        const tierCols = MOLD_TIERS.flatMap(q => [`Себест. ${q}шт`, `Цена ${q}шт`, `Маржа ${q}шт`]);
        const headers = ['Название', 'Категория', 'Коллекция', 'Статус', 'Кол-во молдов',
            'Шт/ч план', 'Шт/ч факт', 'Вес г', ...tierCols,
            'Заказов', 'Выпущено'];

        const rows = this.allMolds.map(m => {
            const tierData = MOLD_TIERS.flatMap(q => {
                const t = m.tiers?.[q];
                const marginPct = t ? Math.round(getBlankMargin(q) * 100) : 0;
                return [t?.cost || 0, t?.sellPrice || 0, marginPct + '%'];
            });
            return [
                m.name, m.category_label, m.collection || '', m.status_label, m.mold_count || 1,
                m.pph_min + (m.pph_max !== m.pph_min ? '-' + m.pph_max : ''), m.pph_actual || '',
                m.weight_grams, ...tierData,
                m.total_orders || 0, m.total_units_produced || 0,
            ];
        });

        let csv = '\uFEFF';
        csv += headers.join(';') + '\n';
        rows.forEach(r => { csv += r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';') + '\n'; });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'molds_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        App.toast('CSV экспортирован');
    },

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

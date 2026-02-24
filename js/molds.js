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

// Тиражные маржи бланков
// margin — наценка на себестоимость, mult = 1.00 (маржа уже включает всё)
// Совпадают с CALC_TIER_MARGINS из calculator.js для единообразия
// Округление до 5₽ (roundTo5)
const BLANKS_TIER_MARGINS = [
    { min: 0,    max: 75,       margin: 0.70, mult: 1.00 },  // 50 шт  → 70%
    { min: 75,   max: 200,      margin: 0.65, mult: 1.00 },  // 100 шт → 65%
    { min: 200,  max: 400,      margin: 0.60, mult: 1.00 },  // 300 шт → 60%
    { min: 400,  max: 750,      margin: 0.55, mult: 1.00 },  // 500 шт → 55%
    { min: 750,  max: 2500,     margin: 0.50, mult: 1.00 },  // 1K шт  → 50%
    { min: 2500, max: Infinity, margin: 0.45, mult: 1.00 },  // 3K шт  → 45%
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

function getBlankMultiplier(qty) {
    const tier = BLANKS_TIER_MARGINS.find(t => qty >= t.min && qty < t.max);
    return tier ? tier.mult : 1.00;
}

/**
 * Таргет цена бланка = (себест + НДС) * (1 + маржа) * множитель / (1 - налог - НДС_выход)
 * Маржа зависит от тиража: 65% при 50 шт → 35% при 3K шт
 * Множитель делает кривую крутой: 1.45× для 50 шт → 0.85× для 3K шт
 * 500 шт — точка опоры (mult = 1.00)
 */
function calcBlankTargetPrice(cost, qty, params) {
    if (cost <= 0 || qty <= 0) return 0;
    const margin = getBlankMargin(qty);
    const mult = getBlankMultiplier(qty);
    const vatOnCost = cost * (params.vatRate || 0.05);
    return round2((cost + vatOnCost) * (1 + margin) * mult / (1 - (params.taxRate || 0.06) - 0.065));
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
        // Keep App.templates in sync with molds (photo_url, collection etc.)
        refreshTemplatesFromMolds(this.allMolds);
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
            // Приоритет: факт → среднее(min,max) → min → 1
            // Среднее = единая цена для заказчика, независимо от цвета пластика
            const pMin = m.pph_min || 0;
            const pMax = m.pph_max || 0;
            const pAvg = (pMin > 0 && pMax > 0) ? Math.round((pMin + pMax) / 2) : (pMin || pMax || 0);
            const pph = m.pph_actual || pAvg || 1;
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
                const mult = getBlankMultiplier(qty);

                m.tiers[qty] = {
                    cost: round2(adjustedCost),
                    targetPrice: targetPrice,
                    sellPrice: sellPrice,
                    margin: margin,
                    mult: mult,
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
                        <div style="display:flex;gap:8px;align-items:flex-start;">
                            ${this.getPhotoThumb(m)}
                            <div style="min-width:0">
                                <div style="font-weight:700; font-size:13px;"><span class="status-dot ${statusDot}"></span>${this.esc(m.name)}${moldCountBadge}${collectionLabel}</div>
                                <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${pphDisplay} шт/ч · ${m.weight_grams}г</div>
                                ${m.hw_name ? `<div style="font-size:10px; color:var(--accent); margin-top:1px;">+ ${this.esc(m.hw_name)}</div>` : ''}
                                ${m.notes ? `<div style="font-size:10px; color:var(--text-muted); font-style:italic;">${this.esc(m.notes)}</div>` : ''}
                            </div>
                        </div>
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

        // Legend with tier margins + multipliers
        const marginLabels = MOLD_TIERS.map(q => {
            const label = q >= 1000 ? (q/1000) + 'K' : q;
            const m = getBlankMargin(q);
            const x = getBlankMultiplier(q);
            return `${label}=${Math.round(m*100)}%×${x}`;
        }).join(', ');
        html += `
            <div style="margin-top:10px; font-size:11px; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
                <span><span style="color:var(--text-secondary);">себес</span> — себестоимость</span>
                <span><span style="color:var(--green);font-weight:700;">цена</span> — цена продажи</span>
                <span>Маржа×множитель: ${marginLabels}</span>
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
        // Photo
        this._pendingPhoto = m.photo_url || '';
        this.updatePhotoPreview(m.photo_url);
        document.getElementById('mold-photo-url').value = (m.photo_url && !m.photo_url.startsWith('data:')) ? m.photo_url : '';
        document.getElementById('mold-photo-file').value = '';
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

        // Hardware source
        this._hwSource = m.hw_source || 'custom';
        this._hwWarehouseItemId = m.hw_warehouse_item_id || null;
        this._hwWarehouseSku = m.hw_warehouse_sku || '';
        this.renderHwSourceToggle();
        if (this._hwSource === 'warehouse') {
            this.loadWarehouseForHw().then(() => this.renderWarehouseHwPicker());
        }

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
         'mold-hw-name', 'mold-hw-price', 'mold-hw-speed', 'mold-notes',
         'mold-photo-url'
        ].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('mold-photo-file').value = '';
        this._pendingPhoto = '';
        this.updatePhotoPreview('');
        this._hwSource = 'custom';
        this.renderHwSourceToggle();
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
            category: 'blank', // always blank
            photo_url: this._pendingPhoto || '',
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
            hw_source: this._hwSource || 'custom',
            hw_name: document.getElementById('mold-hw-name').value.trim(),
            hw_price_per_unit: parseFloat(document.getElementById('mold-hw-price').value) || 0,
            hw_delivery_total: parseFloat(document.getElementById('mold-hw-delivery-total').value) || 0,
            hw_speed: parseFloat(document.getElementById('mold-hw-speed').value) || null,
            hw_warehouse_item_id: this._hwWarehouseItemId || null,
            hw_warehouse_sku: this._hwWarehouseSku || '',
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
        // Sync templates so calculator sees updated photo_url, collection etc.
        refreshTemplatesFromMolds(this.allMolds);
    },

    async confirmDelete(id, name) {
        if (confirm(`Удалить бланк "${name}"?`)) {
            await deleteMold(id);
            App.toast('Бланк удален');
            await this.load();
        }
    },

    exportCSV() {
        const tierCols = MOLD_TIERS.flatMap(q => [`Себест. ${q}шт`, `Цена ${q}шт`, `Маржа ${q}шт`, `Множ. ${q}шт`]);
        const headers = ['Название', 'Категория', 'Коллекция', 'Статус', 'Кол-во молдов',
            'Шт/ч план', 'Шт/ч факт', 'Вес г', ...tierCols,
            'Заказов', 'Выпущено'];

        const rows = this.allMolds.map(m => {
            const tierData = MOLD_TIERS.flatMap(q => {
                const t = m.tiers?.[q];
                const marginPct = t ? Math.round(getBlankMargin(q) * 100) : 0;
                const mult = getBlankMultiplier(q);
                return [t?.cost || 0, t?.sellPrice || 0, marginPct + '%', '×' + mult];
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

    // ==========================================
    // PHOTO HANDLING
    // ==========================================

    _pendingPhoto: '',

    onPhotoFileChange(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            App.toast('Файл слишком большой (макс 2MB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            // Resize to thumbnail
            this.resizeImage(e.target.result, 200, (thumb) => {
                this._pendingPhoto = thumb;
                this.updatePhotoPreview(thumb);
                document.getElementById('mold-photo-url').value = '';
            });
        };
        reader.readAsDataURL(file);
    },

    onPhotoUrlChange(url) {
        if (url && url.trim()) {
            this._pendingPhoto = url.trim();
            this.updatePhotoPreview(url.trim());
        } else {
            this._pendingPhoto = '';
            this.updatePhotoPreview('');
        }
    },

    resizeImage(dataUrl, maxSize, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    },

    updatePhotoPreview(url) {
        const el = document.getElementById('mold-photo-preview');
        if (!el) return;
        if (url) {
            el.innerHTML = `<img src="${this.esc(url)}" style="width:60px;height:60px;object-fit:cover;" onerror="this.parentNode.innerHTML='<span style=\\'font-size:24px;color:var(--red)\\'>!</span>'">`;
        } else {
            el.innerHTML = '<span style="font-size:24px;color:var(--text-muted)">&#128247;</span>';
        }
    },

    getPhotoThumb(m) {
        if (m.photo_url) {
            return `<img src="${this.esc(m.photo_url)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0" onerror="this.style.display='none'">`;
        }
        const letter = (m.name || '?')[0].toUpperCase();
        return `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:16px;font-weight:700;color:var(--accent);flex-shrink:0">${letter}</span>`;
    },

    // ==========================================
    // HARDWARE SOURCE (custom / warehouse)
    // ==========================================

    _hwSource: 'custom',
    _hwWarehouseItemId: null,
    _hwWarehouseSku: '',
    _warehouseItems: [],

    async loadWarehouseForHw() {
        if (this._warehouseItems && this._warehouseItems.length > 0) return;
        try {
            this._warehouseItems = await loadWarehouseItems();
            // All categories except packaging (packaging = only bags/boxes)
            this._warehouseItems = this._warehouseItems.filter(i =>
                i.category !== 'packaging'
            );
        } catch (e) { console.warn('loadWarehouseForHw error:', e); this._warehouseItems = []; }
    },

    setHwSource(source) {
        this._hwSource = source;
        this.renderHwSourceToggle();
        if (source === 'warehouse') {
            this.loadWarehouseForHw().then(() => this.renderWarehouseHwPicker());
        }
    },

    renderHwSourceToggle() {
        const container = document.getElementById('mold-hw-source-toggle');
        if (!container) return;
        const isW = this._hwSource === 'warehouse';
        const isC = this._hwSource === 'custom';
        container.innerHTML = `
            <div class="hw-source-toggle" style="margin-bottom:8px">
                <label class="${isC ? 'src-active' : ''}" onclick="Molds.setHwSource('custom')">
                    &#9998; Кастомная
                </label>
                <label class="${isW ? 'src-active' : ''}" onclick="Molds.setHwSource('warehouse')">
                    &#128230; Со склада
                </label>
            </div>`;

        // Show/hide warehouse picker
        const pickerEl = document.getElementById('mold-hw-warehouse-picker');
        if (pickerEl) pickerEl.style.display = isW ? '' : 'none';

        // Show/hide custom fields
        const customEl = document.getElementById('mold-hw-custom-fields');
        if (customEl) customEl.style.display = isC ? '' : 'none';
    },

    renderWarehouseHwPicker() {
        const container = document.getElementById('mold-hw-warehouse-list');
        if (!container) return;
        if (this._warehouseItems.length === 0) {
            container.innerHTML = '<p class="text-muted" style="font-size:12px">Нет фурнитуры на складе</p>';
            return;
        }
        container.innerHTML = this._warehouseItems.map(item => {
            const photo = item.photo_thumbnail
                ? `<img src="${item.photo_thumbnail}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border)">`
                : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;font-size:14px;">&#128295;</span>`;
            const selected = this._hwWarehouseItemId === item.id ? 'border-color:var(--accent);background:var(--accent-light)' : '';
            return `<div onclick="Molds.selectWarehouseHw(${item.id})" style="display:flex;gap:8px;align-items:center;padding:6px 8px;cursor:pointer;border:1px solid var(--border);border-radius:6px;${selected}">
                ${photo}
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this.esc(item.name)}</div>
                    <div style="font-size:10px;color:var(--text-muted)">${formatRub(item.price_per_unit || 0)}/шт</div>
                </div>
            </div>`;
        }).join('');
    },

    selectWarehouseHw(itemId) {
        const item = this._warehouseItems.find(i => i.id === itemId);
        if (!item) return;
        this._hwWarehouseItemId = item.id;
        this._hwWarehouseSku = item.sku || '';
        // Fill the custom fields with warehouse data
        document.getElementById('mold-hw-name').value = item.name || '';
        document.getElementById('mold-hw-price').value = item.price_per_unit || 0;
        document.getElementById('mold-hw-delivery-total').value = 0;
        this.renderWarehouseHwPicker(); // re-render to show selected
        App.toast('Фурнитура выбрана: ' + (item.name || ''));
    },

    esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
};

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
    { min: 0,    max: 75,       margin: 0.75, mult: 1.00 },  // 50 шт  → 75%
    { min: 75,   max: 200,      margin: 0.70, mult: 1.00 },  // 100 шт → 70%
    { min: 200,  max: 400,      margin: 0.60, mult: 1.00 },  // 300 шт → 60%
    { min: 400,  max: 750,      margin: 0.50, mult: 1.00 },  // 500 шт → 50%
    { min: 750,  max: 2500,     margin: 0.45, mult: 1.00 },  // 1K шт  → 45%
    { min: 2500, max: Infinity, margin: 0.40, mult: 1.00 },  // 3K шт  → 40%
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
 * Таргет цена бланка
 * Формула: себест / (1 - маржа) / (1 - налоги)
 *
 * Маржа — «в сухом остатке» после вычета налогов:
 *   50=75%, 100=70%, 300=60%, 500=50%, 1K=45%, 3K=40%
 *
 * Налоги сверху: 6% ОСН + 6.5% коммерческий = 12.5%
 */
function calcBlankTargetPrice(cost, qty, params) {
    if (cost <= 0 || qty <= 0) return 0;
    const margin = getBlankMargin(qty);
    const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.06;
    const commercialRate = 0.065;
    return round2(cost / (1 - margin) / (1 - taxRate - commercialRate));
}

/**
 * Цена продажи при целевой чистой марже:
 * себестоимость + НДС сверху, затем 40% чистой маржи
 * с учётом 6% ОСН и 6.5% коммерческого отдела.
 */
function calcSellByNetMargin40(cost, params) {
    if (!Number.isFinite(cost) || cost <= 0) return 0;
    const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.06;
    const vatRate = Number.isFinite(params?.vatRate) ? params.vatRate : 0.05;
    const commercialRate = 0.065;
    const margin = 0.40;
    const costWithVat = cost * (1 + vatRate);
    return round2((costWithVat * (1 + margin)) / (1 - taxRate - commercialRate));
}

/**
 * Цена продажи бланка = таргет, округлённая до 5₽ вверх
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
        try {
            this.allMolds = await loadMolds();
            this.enrichMolds();
            this.populateCollectionDropdowns();
            this.renderStats();
            this.filterAndRender();
            this.bindFormEvents();
            // Keep App.templates in sync with molds (photo_url, collection etc.)
            refreshTemplatesFromMolds(this.allMolds);
        } catch (err) {
            console.error('Molds.load() error:', err);
            const container = document.getElementById('molds-cards-container');
            if (container) container.innerHTML = '<div class="card" style="padding:20px;color:var(--red)">Ошибка загрузки бланков: ' + (err.message || err) + '</div>';
        }
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
            try {
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
                // Check for custom price override first, then custom margin, then standard
                const customPrice = m.custom_prices && m.custom_prices[qty];
                const customMargin = m.custom_margins && m.custom_margins[qty];
                const margin = (customMargin !== null && customMargin !== undefined) ? customMargin : getBlankMargin(qty);
                const mult = getBlankMultiplier(qty);

                let targetPrice, sellPrice, isCustom = false;
                if (customPrice !== null && customPrice !== undefined && customPrice > 0) {
                    // Absolute price override — use directly
                    sellPrice = customPrice;
                    targetPrice = customPrice;
                    isCustom = true;
                } else if (customMargin !== null && customMargin !== undefined) {
                    // Custom margin percentage override
                    targetPrice = round2(adjustedCost / (1 - margin) / (1 - (params.taxRate || 0.06) - 0.065));
                    sellPrice = roundTo5(targetPrice);
                    isCustom = true;
                } else {
                    // Standard tier margin
                    targetPrice = calcBlankTargetPrice(adjustedCost, qty, params);
                    sellPrice = calcBlankSellPrice(adjustedCost, qty, params);
                }

                // Calculate actual margin from sell price vs cost
                const actualMargin = sellPrice > 0 ? round2((sellPrice - adjustedCost) / sellPrice) : margin;

                m.tiers[qty] = {
                    cost: round2(adjustedCost),
                    targetPrice: targetPrice,
                    sellPrice: sellPrice,
                    margin: actualMargin,
                    mult: mult,
                    moldAmort: round2(moldAmortPerUnit),
                    hwCost: round2(hwCostPerUnit),
                    isCustom: isCustom,
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
            } catch (err) {
                console.error('enrichMolds error for mold', m.id, m.name, ':', err);
                m.tiers = {};
            }
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

            // Row 2: Цена продажи (green, bold; orange if custom price)
            const sellCells = MOLD_TIERS.map(q => {
                const t = m.tiers?.[q];
                const color = t?.isCustom ? 'var(--orange)' : 'var(--green)';
                const marginPct = t ? Math.round(t.margin * 100) : 0;
                const title = t?.isCustom ? `title="Своя цена · маржа ${marginPct}%"` : `title="Маржа ${marginPct}%"`;
                return `<td class="text-right" ${title} style="font-size:13px;font-weight:700;color:${color};padding:3px 6px;">${t ? Math.round(t.sellPrice) : '—'}</td>`;
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

        // Custom prices per tier
        const cp = m.custom_prices || {};
        [50, 100, 300, 500, 1000, 3000].forEach(q => {
            const el = document.getElementById('mold-price-' + q);
            if (el) el.value = (cp[q] !== null && cp[q] !== undefined && cp[q] > 0) ? cp[q] : '';
        });
        // Show margin hints for custom prices
        this._editingMoldId = m.id;
        setTimeout(() => this.onCustomPriceInput(), 50);

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

    _collectCustomPrices() {
        const prices = {};
        [50, 100, 300, 500, 1000, 3000].forEach(q => {
            const el = document.getElementById('mold-price-' + q);
            if (el && el.value !== '') {
                const price = parseFloat(el.value);
                if (!isNaN(price) && price > 0) {
                    prices[q] = price;
                }
            }
        });
        return prices;
    },

    onCustomPriceInput() {
        // Show margin % hint under each price input
        // We need the current mold's enriched cost data
        const mId = this._editingMoldId;
        const mold = mId ? App.molds.find(m => m.id === mId) : null;
        [50, 100, 300, 500, 1000, 3000].forEach(q => {
            const priceEl = document.getElementById('mold-price-' + q);
            const hintEl = document.getElementById('mold-price-margin-' + q);
            if (!priceEl || !hintEl) return;
            const price = parseFloat(priceEl.value);
            const cost = mold?.tiers?.[q]?.cost;
            if (price > 0 && cost > 0) {
                const marginPct = Math.round((price - cost) / price * 100);
                const color = marginPct >= 40 ? 'var(--green)' : marginPct >= 30 ? 'var(--orange)' : 'var(--red)';
                hintEl.innerHTML = `<span style="color:${color};font-weight:600;">маржа ${marginPct}%</span>`;
            } else if (price > 0) {
                hintEl.textContent = '';
            } else {
                // No custom price — show what standard price would be
                const stdPrice = mold?.tiers?.[q]?.sellPrice;
                hintEl.innerHTML = stdPrice ? `<span style="color:var(--text-muted);">стд: ${Math.round(stdPrice)}₽</span>` : '';
            }
        });
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
        // Clear custom price fields and hints
        [50, 100, 300, 500, 1000, 3000].forEach(q => {
            const el = document.getElementById('mold-price-' + q);
            if (el) el.value = '';
            const hint = document.getElementById('mold-price-margin-' + q);
            if (hint) hint.textContent = '';
        });
        this._editingMoldId = null;
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
            custom_margins: {},
            custom_prices: this._collectCustomPrices(),
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

    // ==========================================
    // TABS: Пластик | Фурнитура | Упаковка
    // ==========================================

    _currentTab: 'plastic',
    _hwBlanks: [],
    _pkgBlanks: [],
    _editingHwId: null,
    _editingPkgId: null,

    // Hardware tier margins (different from plastic!)
    HW_TIERS: [50, 100, 200, 300, 400, 500, 1000],
    HW_TIER_MARGINS: {
        50: 0.55, 100: 0.40, 200: 0.52, 300: 0.50, 400: 0.47, 500: 0.47, 1000: 0.40,
    },

    switchTab(tab) {
        this._currentTab = tab;
        ['plastic', 'hardware', 'packaging', 'china_catalog'].forEach(t => {
            const el = document.getElementById('molds-tab-' + t);
            if (el) el.style.display = (t === tab) ? '' : 'none';
        });
        document.querySelectorAll('.molds-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        if (tab === 'hardware') this.loadHwTab();
        if (tab === 'packaging') this.loadPkgTab();
        if (tab === 'china_catalog') ChinaCatalog.load();
    },

    // ==========================================
    // HARDWARE BLANKS TAB
    // Фурнитура из склада + сборка
    // Себестоимость = цена_склада + (ФОТ + косвенные) / скорость
    // ==========================================

    _warehouseHwItems: [], // warehouse items for dropdown

    async loadHwTab() {
        try {
            this._hwBlanks = await loadHwBlanks();
            // Load warehouse items for dropdown
            const whItems = await loadWarehouseItems();
            this._warehouseHwItems = (whItems || []).filter(i => i.category !== 'packaging');
            // Ensure ChinaCatalog has rates loaded (for enrichHwBlanks recalc)
            if (ChinaCatalog._items.length === 0) {
                ChinaCatalog._items = await ChinaCatalog._loadItems();
            }
            // Make sure ChinaCatalog rates are from settings
            const params = App.params || {};
            ChinaCatalog._cnyRate = params.china_cny_rate || ChinaCatalog._cnyRate || 12.5;
            ChinaCatalog._usdRate = params.china_usd_rate || ChinaCatalog._usdRate || 90;
            if (params.china_delivery_avia_fast) ChinaCatalog.DELIVERY_METHODS.avia_fast.rate_usd = params.china_delivery_avia_fast;
            if (params.china_delivery_avia) ChinaCatalog.DELIVERY_METHODS.avia.rate_usd = params.china_delivery_avia;
            if (params.china_delivery_auto) ChinaCatalog.DELIVERY_METHODS.auto.rate_usd = params.china_delivery_auto;
            if (params.china_item_surcharge !== undefined) ChinaCatalog.ITEM_SURCHARGE = params.china_item_surcharge;
            if (params.china_delivery_surcharge !== undefined) ChinaCatalog.DELIVERY_SURCHARGE = params.china_delivery_surcharge;

            this.enrichHwBlanks();
            this.renderHwTable();
        } catch(e) {
            console.error('loadHwTab error:', e);
            document.getElementById('hw-blanks-container').innerHTML = '<div class="card" style="padding:16px;color:var(--red)">Ошибка: ' + e.message + '</div>';
        }
    },

    enrichHwBlanks() {
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;

        this._hwBlanks.forEach(b => {
            let priceRub = b.price_rub || 0;
            const src = b.hw_form_source || 'warehouse';

            // Legacy fallback: old records could store CNY + delivery_per_unit without price_rub.
            if (priceRub <= 0 && (b.price_cny || 0) > 0) {
                priceRub = round2((b.price_cny || 0) * (ChinaCatalog._cnyRate || 12.5) + (b.delivery_per_unit || 0));
            }

            // For china/custom_cny sources: recalculate price from current CNY rates
            if ((src === 'china' || src === 'custom_cny') && b.price_cny > 0) {
                const virtualItem = { price_cny: b.price_cny, weight_grams: b.weight_grams || 0 };
                const method = b.delivery_method || 'auto';
                const calc = ChinaCatalog.calcDelivery(virtualItem, method, 1);
                priceRub = calc.totalPerUnit;
                b.price_rub = round2(priceRub); // update with fresh rates
            }

            const speed = b.assembly_speed || 0;
            const assemblyCost = speed > 0 ? round2((fotPerHour + indirectPerHour) / speed) : 0;
            b._cost = round2(priceRub + assemblyCost);
            b._assemblyCost = assemblyCost;
            b._priceRubCalc = round2(priceRub);
            // Fixed sell price from blank form (fallback to old 40% formula for legacy records).
            const fixedSell = parseFloat(b.sell_price) || 0;
            b._sellPrice = fixedSell > 0 ? fixedSell : (b._cost > 0 ? Math.ceil(b._cost / (1 - 0.40)) : 0);

            // Source badge
            b._srcBadge = src === 'china' ? '🇨🇳' : src === 'custom_cny' ? '¥' : '📦';

            // Try to get photo from warehouse if not on blank itself
            if (!b.photo_url && b.warehouse_item_id) {
                const whItem = this._warehouseHwItems.find(w => w.id === b.warehouse_item_id);
                if (whItem) b._whPhoto = whItem.photo_thumbnail || whItem.photo_url || '';
            }
        });
    },

    renderHwTable() {
        const container = document.getElementById('hw-blanks-container');
        if (!this._hwBlanks.length) {
            container.innerHTML = '<div class="empty-state"><p>Нет фурнитуры. Нажмите «+ Новый бланк».</p></div>';
            return;
        }

        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;

        let html = `<div class="card" style="padding:12px;overflow-x:auto;">
            <table style="font-size:12px;white-space:nowrap;border-collapse:collapse;width:100%;">
            <thead><tr>
                <th style="width:48px;padding:6px;"></th>
                <th style="min-width:180px;padding:6px 8px;text-align:left;">Фурнитура</th>
                <th style="padding:6px 8px;text-align:right;">Цена/шт</th>
                <th style="padding:6px 8px;text-align:right;">Сборка</th>
                <th style="padding:6px 8px;text-align:right;font-weight:700;">Себестоимость</th>
                <th style="padding:6px 8px;text-align:right;">Цена продажи</th>
                <th style="width:60px;"></th>
            </tr></thead><tbody>`;

        this._hwBlanks.forEach(b => {
            const priceRub = b._priceRubCalc || b.price_rub || 0;
            const photoSrc = b.photo_url || b._whPhoto || '';
            const photo = photoSrc
                ? `<img src="${photoSrc.startsWith('data:') ? photoSrc : this.esc(photoSrc)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none'">`
                : `<span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:16px;">🔩</span>`;

            const speedPcsMin = b.assembly_speed ? round2(b.assembly_speed / 60) : 0;
            const speedLabel = speedPcsMin > 0 ? (speedPcsMin + ' шт/мин') : '—';
            const src = b.hw_form_source || 'warehouse';
            const srcBadge = b._srcBadge || '📦';
            // Extra info line for china/custom
            let extraInfo = '';
            if (src === 'china' || src === 'custom_cny') {
                const methodInfo = ChinaCatalog.DELIVERY_METHODS[b.delivery_method];
                const deliveryLabel = methodInfo ? methodInfo.label : (b.delivery_method || '');
                extraInfo = ` · ${b.price_cny || 0}¥ · ${deliveryLabel}`;
            }

            html += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px;">${photo}</td>
                <td style="padding:6px 8px;">
                    <div style="font-weight:700;font-size:13px;">${srcBadge} ${this.esc(b.name)}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${speedLabel}${extraInfo}${b.notes ? ' · ' + this.esc(b.notes) : ''}</div>
                </td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(priceRub)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(b._assemblyCost)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:15px;font-weight:700;">${formatRub(b._cost)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:15px;font-weight:700;color:var(--green);">${formatRub(b._sellPrice)}</td>
                <td style="padding:6px;">
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Molds.editHwBlank(${b.id})">&#9998;</button>
                        <button class="btn-remove" style="font-size:9px;width:24px;height:24px;" onclick="Molds.confirmDeleteHw(${b.id}, '${this.esc(b.name)}')">&#10005;</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        html += `<div style="margin-top:10px;font-size:11px;color:var(--text-muted);">ФОТ: ${formatRub(fotPerHour)}/ч · Косвенные: ${formatRub(round2(indirectPerHour))}/ч · Себестоимость = цена/шт + (ФОТ + косвенные) ÷ скорость · Цена продажи берётся фиксированно из поля бланка · 📦 склад · 🇨🇳 каталог · ¥ кастом</div></div>`;

        container.innerHTML = html;
    },

    _hwFormSource: 'warehouse', // 'warehouse' | 'china' | 'custom_cny'

    setHwFormSource(src) {
        this._hwFormSource = src;
        // Toggle visibility
        ['warehouse', 'china', 'custom_cny'].forEach(s => {
            const el = document.getElementById('hw-src-' + s);
            if (el) el.style.display = (s === src) ? '' : 'none';
        });
        // Toggle button styles
        document.querySelectorAll('#hw-source-toggle button').forEach(btn => {
            const isCurrent = btn.dataset.hwSrc === src;
            btn.className = isCurrent ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-outline';
        });
        // Populate delivery dropdowns for china/custom_cny
        if (src === 'china' || src === 'custom_cny') {
            this._populateDeliveryDropdown(src === 'china' ? 'hw-china-delivery' : 'hw-custom-delivery');
        }
        // Load china catalog items if needed
        if (src === 'china' && ChinaCatalog._items.length === 0) {
            ChinaCatalog._loadItems().then(items => { ChinaCatalog._items = items; });
        }
        // Reset selection
        document.getElementById('hw-blank-selected').style.display = 'none';
        this.recalcHwCost();
    },

    _populateDeliveryDropdown(selectId) {
        const sel = document.getElementById(selectId);
        if (!sel || sel.options.length > 0) return;
        Object.entries(ChinaCatalog.DELIVERY_METHODS).forEach(([k, m]) => {
            const opt = document.createElement('option');
            opt.value = k;
            opt.textContent = `${m.label} $${m.rate_usd}/кг (${m.days})`;
            sel.appendChild(opt);
        });
    },

    showHwForm() {
        this._editingHwId = null;
        this._hwFormSource = 'warehouse';
        document.getElementById('hw-form-title').textContent = 'Новая фурнитура';
        document.getElementById('hw-blank-wh-search').value = '';
        document.getElementById('hw-blank-speed').value = '';
        document.getElementById('hw-blank-notes').value = '';
        document.getElementById('hw-blank-name').value = '';
        document.getElementById('hw-blank-price-rub').value = '0';
        document.getElementById('hw-blank-sell').value = '';
        document.getElementById('hw-blank-photo').value = '';
        document.getElementById('hw-blank-wh-id').value = '';
        document.getElementById('hw-blank-china-id').value = '';
        document.getElementById('hw-blank-selected').style.display = 'none';
        document.getElementById('hw-blank-wh-dropdown').style.display = 'none';
        document.getElementById('hw-delete-btn').style.display = 'none';
        // Reset custom fields
        const customName = document.getElementById('hw-custom-name');
        if (customName) customName.value = '';
        const customCny = document.getElementById('hw-custom-price-cny');
        if (customCny) customCny.value = '';
        const customWeight = document.getElementById('hw-custom-weight');
        if (customWeight) customWeight.value = '';
        const chinaSearch = document.getElementById('hw-china-search');
        if (chinaSearch) chinaSearch.value = '';
        // Clear delivery dropdowns so they get re-populated with latest rates
        ['hw-china-delivery', 'hw-custom-delivery'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });
        this.setHwFormSource('warehouse');
        document.getElementById('hw-edit-form').style.display = '';
        this.recalcHwCost();
        document.getElementById('hw-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editHwBlank(id) {
        const b = this._hwBlanks.find(x => x.id === id);
        if (!b) return;
        this._editingHwId = id;
        document.getElementById('hw-form-title').textContent = 'Редактировать: ' + (b.name || '');
        document.getElementById('hw-blank-speed').value = b.assembly_speed ? round2(b.assembly_speed / 60) : '';
        document.getElementById('hw-blank-notes').value = b.notes || '';
        document.getElementById('hw-blank-name').value = b.name || '';
        document.getElementById('hw-blank-price-rub').value = b.price_rub || 0;
        document.getElementById('hw-blank-sell').value = b.sell_price || '';
        document.getElementById('hw-blank-photo').value = b.photo_url || '';
        document.getElementById('hw-blank-wh-id').value = b.warehouse_item_id || '';
        document.getElementById('hw-blank-china-id').value = b.china_catalog_id || '';

        // Clear delivery dropdowns so they get re-populated
        ['hw-china-delivery', 'hw-custom-delivery'].forEach(ddId => {
            const el = document.getElementById(ddId);
            if (el) el.innerHTML = '';
        });

        // Determine source
        const src = b.hw_form_source || (b.warehouse_item_id ? 'warehouse' : (b.price_cny > 0 ? 'custom_cny' : 'warehouse'));
        this.setHwFormSource(src);

        if (src === 'warehouse') {
            document.getElementById('hw-blank-wh-search').value = b.name || '';
        } else if (src === 'china') {
            const chinaSearch = document.getElementById('hw-china-search');
            if (chinaSearch) chinaSearch.value = b.name || '';
            // Set delivery method
            const dd = document.getElementById('hw-china-delivery');
            if (dd && b.delivery_method) dd.value = b.delivery_method;
        } else if (src === 'custom_cny') {
            const customName = document.getElementById('hw-custom-name');
            if (customName) customName.value = b.name || '';
            const customCny = document.getElementById('hw-custom-price-cny');
            if (customCny) customCny.value = b.price_cny || '';
            const customWeight = document.getElementById('hw-custom-weight');
            if (customWeight) customWeight.value = b.weight_grams || '';
            const dd = document.getElementById('hw-custom-delivery');
            if (dd && b.delivery_method) dd.value = b.delivery_method;
        }

        // Show selected item preview
        const photoSrc = b.photo_url || b._whPhoto || '';
        this._showHwSelectedItem(b.name, b.price_rub || 0, photoSrc);

        document.getElementById('hw-delete-btn').style.display = '';
        document.getElementById('hw-edit-form').style.display = '';
        this.recalcHwCost();
        document.getElementById('hw-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    _showHwSelectedItem(name, priceRub, photoUrl) {
        const block = document.getElementById('hw-blank-selected');
        const nameEl = document.getElementById('hw-blank-selected-name');
        const infoEl = document.getElementById('hw-blank-selected-info');
        const photoEl = document.getElementById('hw-blank-photo-preview');

        nameEl.textContent = name || '';
        infoEl.textContent = `Цена: ${formatRub(priceRub)} (доставка включена)`;

        if (photoUrl) {
            photoEl.src = photoUrl;
            photoEl.style.display = '';
        } else {
            photoEl.style.display = 'none';
        }
        block.style.display = '';
    },

    searchHwWarehouse() {
        const query = (document.getElementById('hw-blank-wh-search').value || '').toLowerCase().trim();
        const dropdown = document.getElementById('hw-blank-wh-dropdown');

        if (!query || query.length < 1) {
            dropdown.style.display = 'none';
            return;
        }

        const filtered = this._warehouseHwItems.filter(item => {
            const searchStr = [item.name, item.sku, item.color, item.size, item.category].filter(Boolean).join(' ').toLowerCase();
            return searchStr.includes(query);
        }).slice(0, 20);

        if (!filtered.length) {
            dropdown.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Ничего не найдено</div>';
            dropdown.style.display = '';
            return;
        }

        let html = '';
        filtered.forEach(item => {
            const photoSrc = item.photo_thumbnail || item.photo_url || '';
            const photo = photoSrc
                ? `<img src="${photoSrc.startsWith('data:') ? photoSrc : this.esc(photoSrc)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;">`
                : `<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;font-size:12px;">🔩</span>`;
            const price = item.price_per_unit || 0;
            const details = [item.size, item.color].filter(Boolean).join(' · ');

            html += `<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);"
                      onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
                      onclick="Molds.selectHwWarehouseItem(${item.id})">
                ${photo}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(item.name)}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${details ? details + ' · ' : ''}${formatRub(price)}</div>
                </div>
            </div>`;
        });

        dropdown.innerHTML = html;
        dropdown.style.display = '';
    },

    // ---- China catalog search & select ----

    searchHwChina() {
        const query = (document.getElementById('hw-china-search').value || '').toLowerCase().trim();
        const dropdown = document.getElementById('hw-china-dropdown');

        if (!query || query.length < 1) {
            dropdown.style.display = 'none';
            return;
        }

        // Search through ChinaCatalog items
        const filtered = ChinaCatalog._items.filter(item => {
            const searchStr = [item.name, item.category_ru, item.size, item.notes].filter(Boolean).join(' ').toLowerCase();
            return searchStr.includes(query);
        }).slice(0, 20);

        if (!filtered.length) {
            dropdown.innerHTML = '<div style="padding:10px;color:var(--text-muted);font-size:12px;">Ничего не найдено</div>';
            dropdown.style.display = '';
            return;
        }

        let html = '';
        filtered.forEach(item => {
            const priceRub = round2(item.price_cny * ChinaCatalog._cnyRate);
            const isRussia = item.category === 'russia';
            const priceLabel = isRussia
                ? `${formatRub(item.price_rub || 0)} (РФ)`
                : `${item.price_cny}¥ ≈ ${formatRub(priceRub)}`;

            const photoUrl = item.photo_url || '';
            const proxiedPhoto = photoUrl && (photoUrl.includes('alicdn.com') || photoUrl.includes('1688.com'))
                ? 'https://images.weserv.nl/?url=' + encodeURIComponent(photoUrl) + '&w=72&h=72&fit=cover&default=1'
                : photoUrl;
            const photoHtml = proxiedPhoto
                ? `<img src="${Molds.esc(proxiedPhoto)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border);" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy">`
                  + `<span style="width:36px;height:36px;display:none;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;font-size:12px;">🇨🇳</span>`
                : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;font-size:12px;">🇨🇳</span>`;

            html += `<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);"
                      onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
                      onclick="Molds.selectHwChinaItem(${item.id})">
                ${photoHtml}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Molds.esc(item.name)}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${Molds.esc(item.category_ru)} · ${item.weight_grams || 0}г · ${priceLabel}</div>
                </div>
            </div>`;
        });

        dropdown.innerHTML = html;
        dropdown.style.display = '';
    },

    selectHwChinaItem(chinaId) {
        const item = ChinaCatalog._items.find(i => i.id === chinaId);
        if (!item) return;

        // Get selected delivery method
        const deliverySel = document.getElementById('hw-china-delivery');
        const method = deliverySel ? deliverySel.value : 'auto';

        // Use calcDelivery to compute price (with qty=1 for per-unit)
        const isRussia = item.category === 'russia';
        let priceRub, totalPerUnit;
        if (isRussia) {
            priceRub = item.price_rub || 0;
            totalPerUnit = priceRub;
        } else {
            const calc = ChinaCatalog.calcDelivery(item, method, 1);
            priceRub = calc.totalPerUnit;
            totalPerUnit = calc.totalPerUnit;
        }

        const name = item.name + (item.size ? ' ' + item.size : '');

        const photoUrl = item.photo_url || '';

        // Fill hidden fields
        document.getElementById('hw-blank-name').value = name;
        document.getElementById('hw-blank-price-rub').value = round2(totalPerUnit);
        document.getElementById('hw-blank-china-id').value = chinaId;
        document.getElementById('hw-blank-photo').value = photoUrl;
        document.getElementById('hw-blank-wh-id').value = '';
        document.getElementById('hw-china-search').value = name;
        document.getElementById('hw-china-dropdown').style.display = 'none';

        // Show preview
        const infoText = isRussia
            ? `Цена: ${formatRub(priceRub)} (Россия)`
            : `Цена: ${item.price_cny}¥ → ${formatRub(totalPerUnit)} (вкл. доставку + наценки)`;
        this._showHwSelectedItem(name, totalPerUnit, photoUrl);
        document.getElementById('hw-blank-selected-info').textContent = infoText;

        this.recalcHwCost();
    },

    selectHwWarehouseItem(whId) {
        const item = this._warehouseHwItems.find(w => w.id === whId);
        if (!item) return;

        const priceRub = item.price_per_unit || 0;
        const photoUrl = item.photo_thumbnail || item.photo_url || '';
        const name = item.name + (item.color ? ' ' + item.color : '') + (item.size ? ' ' + item.size : '');

        document.getElementById('hw-blank-wh-search').value = name;
        document.getElementById('hw-blank-name').value = name;
        document.getElementById('hw-blank-price-rub').value = priceRub;
        document.getElementById('hw-blank-photo').value = photoUrl;
        document.getElementById('hw-blank-wh-id').value = whId;
        document.getElementById('hw-blank-wh-dropdown').style.display = 'none';

        this._showHwSelectedItem(name, priceRub, photoUrl);
        this.recalcHwCost();
    },

    recalcHwCost() {
        const el = document.getElementById('hw-cost-breakdown');
        if (!el) return;
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;
        const pcsPerMin = parseFloat(document.getElementById('hw-blank-speed').value) || 0;
        const speed = round2(pcsPerMin * 60); // шт/мин → шт/час для расчёта

        let priceRub = 0;
        let priceLabel = '';
        let detailLines = [];

        const src = this._hwFormSource;

        if (src === 'china') {
            // --- China catalog source ---
            const chinaId = parseInt(document.getElementById('hw-blank-china-id').value) || 0;
            const item = chinaId ? ChinaCatalog._items.find(i => i.id === chinaId) : null;
            if (!item) { el.style.display = 'none'; return; }

            const isRussia = item.category === 'russia';
            const deliverySel = document.getElementById('hw-china-delivery');
            const method = deliverySel ? deliverySel.value : 'auto';

            if (isRussia) {
                priceRub = item.price_rub || 0;
                priceLabel = `Цена (Россия): <b>${formatRub(priceRub)}</b>`;
            } else {
                const calc = ChinaCatalog.calcDelivery(item, method, 1);
                priceRub = calc.totalPerUnit;
                // Update hidden price field
                document.getElementById('hw-blank-price-rub').value = round2(priceRub);
                const methodInfo = ChinaCatalog.DELIVERY_METHODS[method];
                priceLabel = `Товар: ${item.price_cny}¥ × ${ChinaCatalog._cnyRate}₽ = ${formatRub(calc.priceRub)} → +${Math.round(ChinaCatalog.ITEM_SURCHARGE*100)}% = <b>${formatRub(calc.priceWithSurcharge)}</b>`;
                detailLines.push(`Доставка: ${item.weight_grams}г × $${methodInfo?.rate_usd || '?'}/кг × ${ChinaCatalog._usdRate}₽ = ${formatRub(calc.deliveryPerUnit)} → +${Math.round(ChinaCatalog.DELIVERY_SURCHARGE*100)}% = <b>${formatRub(calc.deliveryWithSurcharge)}</b>`);
                detailLines.push(`Итого товар: <b>${formatRub(priceRub)}</b>/шт (${methodInfo?.label || method}, ${methodInfo?.days || ''})`);
            }

        } else if (src === 'custom_cny') {
            // --- Custom CNY source ---
            const priceCny = parseFloat(document.getElementById('hw-custom-price-cny').value) || 0;
            const weightG = parseFloat(document.getElementById('hw-custom-weight').value) || 0;
            const deliverySel = document.getElementById('hw-custom-delivery');
            const method = deliverySel ? deliverySel.value : 'auto';

            if (priceCny <= 0) { el.style.display = 'none'; return; }

            // Build a virtual item for calcDelivery
            const virtualItem = { price_cny: priceCny, weight_grams: weightG };
            const calc = ChinaCatalog.calcDelivery(virtualItem, method, 1);
            priceRub = calc.totalPerUnit;

            // Update hidden fields
            document.getElementById('hw-blank-price-rub').value = round2(priceRub);
            const customName = document.getElementById('hw-custom-name').value.trim();
            if (customName) document.getElementById('hw-blank-name').value = customName;

            const methodInfo = ChinaCatalog.DELIVERY_METHODS[method];
            priceLabel = `Товар: ${priceCny}¥ × ${ChinaCatalog._cnyRate}₽ = ${formatRub(calc.priceRub)} → +${Math.round(ChinaCatalog.ITEM_SURCHARGE*100)}% = <b>${formatRub(calc.priceWithSurcharge)}</b>`;
            if (weightG > 0) {
                detailLines.push(`Доставка: ${weightG}г × $${methodInfo?.rate_usd || '?'}/кг × ${ChinaCatalog._usdRate}₽ = ${formatRub(calc.deliveryPerUnit)} → +${Math.round(ChinaCatalog.DELIVERY_SURCHARGE*100)}% = <b>${formatRub(calc.deliveryWithSurcharge)}</b>`);
            }
            detailLines.push(`Итого товар: <b>${formatRub(priceRub)}</b>/шт (${methodInfo?.label || method})`);

            // Show preview if name entered
            if (customName) {
                this._showHwSelectedItem(customName, priceRub, '');
                document.getElementById('hw-blank-selected-info').textContent = `Цена: ${priceCny}¥ → ${formatRub(priceRub)} (вкл. доставку + наценки)`;
            }

        } else {
            // --- Warehouse source (original logic) ---
            priceRub = parseFloat(document.getElementById('hw-blank-price-rub').value) || 0;
            if (priceRub <= 0) { el.style.display = 'none'; return; }
            priceLabel = `Цена со склада: <b>${formatRub(priceRub)}</b> (вкл. доставку)`;
        }

        const fotCost = speed > 0 ? round2(fotPerHour / speed) : 0;
        const indirectCost = speed > 0 ? round2(indirectPerHour / speed) : 0;
        const assemblyCost = round2(fotCost + indirectCost);
        const totalCost = round2(priceRub + assemblyCost);

        const fixedSellPrice = parseFloat(document.getElementById('hw-blank-sell').value) || 0;
        const formulaSellPrice = calcSellByNetMargin40(totalCost, params);

        let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;">Себестоимость: ${formatRub(totalCost)}</div>`;
        html += `<div style="color:var(--text-secondary);font-size:11px;line-height:1.7;">`;
        html += priceLabel + '<br>';
        detailLines.forEach(line => { html += line + '<br>'; });
        if (speed > 0) {
            html += `ФОТ сборки: ${formatRub(fotPerHour)}/ч ÷ ${speed} шт/ч (${pcsPerMin} шт/мин) = <b>${formatRub(fotCost)}</b>/шт<br>`;
            if (indirectPerHour > 0) {
                html += `Косвенные: ${formatRub(round2(indirectPerHour))}/ч ÷ ${speed} шт/ч = <b>${formatRub(indirectCost)}</b>/шт<br>`;
            }
            html += `Сборка итого: <b>${formatRub(assemblyCost)}</b>/шт`;
        } else {
            html += `Сборка: <span style="color:var(--text-muted)">укажите скорость (шт/мин)</span>`;
        }
        if (formulaSellPrice > 0) {
            html += `<br><span style="color:var(--green);font-weight:700;">Цена продажи по формуле (40% чистой маржи, −6% ОСН, −6,5% коммерч., +НДС сверху): ${formatRub(formulaSellPrice)}</span>`;
        }
        if (fixedSellPrice > 0) {
            html += `<br><span style="color:var(--text-muted);">Ручная цена в поле: ${formatRub(fixedSellPrice)}</span>`;
        }
        html += `</div>`;

        el.innerHTML = html;
        el.style.display = '';
    },

    hideHwForm() {
        document.getElementById('hw-edit-form').style.display = 'none';
        document.getElementById('hw-blank-wh-dropdown').style.display = 'none';
        this._editingHwId = null;
    },

    async saveHwBlank() {
        const src = this._hwFormSource;
        let name = document.getElementById('hw-blank-name').value.trim();

        // For custom_cny, name comes from custom-name field
        if (src === 'custom_cny') {
            const customName = document.getElementById('hw-custom-name').value.trim();
            if (customName) name = customName;
        }

        if (!name) {
            const hint = src === 'warehouse' ? 'Выберите позицию со склада' : src === 'china' ? 'Выберите позицию из каталога' : 'Введите название';
            App.toast(hint);
            return;
        }

        const blank = {
            id: this._editingHwId || undefined,
            name,
            price_rub: parseFloat(document.getElementById('hw-blank-price-rub').value) || 0,
            sell_price: parseFloat(document.getElementById('hw-blank-sell').value) || 0,
            warehouse_item_id: parseInt(document.getElementById('hw-blank-wh-id').value) || null,
            china_catalog_id: parseInt(document.getElementById('hw-blank-china-id').value) || null,
            assembly_speed: round2((parseFloat(document.getElementById('hw-blank-speed').value) || 0) * 60),
            notes: document.getElementById('hw-blank-notes').value.trim(),
            photo_url: document.getElementById('hw-blank-photo').value.trim(),
            hw_form_source: src,
            // China/Custom CNY fields
            price_cny: 0,
            weight_grams: 0,
            delivery_method: '',
            delivery_per_unit: 0,
        };

        if (src === 'china') {
            const chinaItem = blank.china_catalog_id ? ChinaCatalog._items.find(i => i.id === blank.china_catalog_id) : null;
            if (chinaItem) {
                blank.price_cny = chinaItem.price_cny || 0;
                blank.weight_grams = chinaItem.weight_grams || 0;
            }
            const dd = document.getElementById('hw-china-delivery');
            blank.delivery_method = dd ? dd.value : 'auto';
        } else if (src === 'custom_cny') {
            blank.price_cny = parseFloat(document.getElementById('hw-custom-price-cny').value) || 0;
            blank.weight_grams = parseFloat(document.getElementById('hw-custom-weight').value) || 0;
            const dd = document.getElementById('hw-custom-delivery');
            blank.delivery_method = dd ? dd.value : 'auto';
        }

        await saveHwBlank(blank);
        App.toast('Фурнитура сохранена');
        this.hideHwForm();
        await this.loadHwTab();
    },

    async deleteHwBlank() {
        if (!this._editingHwId) return;
        if (confirm('Удалить эту фурнитуру?')) {
            await deleteHwBlank(this._editingHwId);
            App.toast('Удалено');
            this.hideHwForm();
            await this.loadHwTab();
        }
    },

    async confirmDeleteHw(id, name) {
        if (confirm(`Удалить "${name}"?`)) {
            await deleteHwBlank(id);
            App.toast('Удалено');
            await this.loadHwTab();
        }
    },

    // ==========================================
    // PACKAGING BLANKS TAB
    // ==========================================

    async loadPkgTab() {
        try {
            this._pkgBlanks = await loadPkgBlanks();
            this.enrichPkgBlanks();
            this.renderPkgTable();
        } catch(e) {
            console.error('loadPkgTab error:', e);
            document.getElementById('pkg-blanks-container').innerHTML = '<div class="card" style="padding:16px;color:var(--red)">Ошибка: ' + e.message + '</div>';
        }
    },

    enrichPkgBlanks() {
        this._pkgBlanks.forEach(b => {
            const totalCost = round2((b.price_per_unit || 0) + (b.delivery_per_unit || 0));
            b._cost = totalCost;
            // Fixed sell price from blank form (fallback to old 40% formula for legacy records).
            const fixedSell = parseFloat(b.sell_price) || 0;
            b._sellPrice = fixedSell > 0 ? fixedSell : (totalCost > 0 ? Math.ceil(totalCost / (1 - 0.40)) : 0);
        });
    },

    renderPkgTable() {
        const container = document.getElementById('pkg-blanks-container');
        if (!this._pkgBlanks.length) {
            container.innerHTML = '<div class="empty-state"><p>Нет упаковки. Нажмите «+ Новый бланк».</p></div>';
            return;
        }

        let html = `<div class="card" style="padding:12px;overflow-x:auto;">
            <table style="font-size:12px;white-space:nowrap;border-collapse:collapse;width:100%;">
            <thead><tr>
                <th style="min-width:180px;padding:6px 8px;text-align:left;">Упаковка</th>
                <th style="padding:6px 8px;text-align:right;">Цена</th>
                <th style="padding:6px 8px;text-align:right;">Доставка</th>
                <th style="padding:6px 8px;text-align:right;font-weight:700;">Себестоимость</th>
                <th style="padding:6px 8px;text-align:right;">Цена продажи</th>
                <th style="width:60px;"></th>
            </tr></thead><tbody>`;

        this._pkgBlanks.forEach(b => {
            const price = b.price_per_unit || 0;
            const delivery = b.delivery_per_unit || 0;

            html += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px 8px;">
                    <div style="font-weight:700;font-size:13px;">${this.esc(b.name)}</div>
                    ${b.notes ? `<div style="font-size:10px;color:var(--text-muted);font-style:italic;">${this.esc(b.notes)}</div>` : ''}
                </td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(price)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(delivery)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:15px;font-weight:700;">${formatRub(b._cost)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:15px;font-weight:700;color:var(--green);">${formatRub(b._sellPrice)}</td>
                <td style="padding:6px;">
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Molds.editPkgBlank(${b.id})">&#9998;</button>
                        <button class="btn-remove" style="font-size:9px;width:24px;height:24px;" onclick="Molds.confirmDeletePkg(${b.id}, '${this.esc(b.name)}')">&#10005;</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        html += `<div style="margin-top:10px;font-size:11px;color:var(--text-muted);">Себестоимость = цена + доставка · Без ФОТ, без косвенных · Цена продажи берётся фиксированно из поля бланка</div></div>`;

        container.innerHTML = html;
    },

    showPkgForm() {
        this._editingPkgId = null;
        document.getElementById('pkg-form-title').textContent = 'Новая упаковка';
        ['pkg-blank-name','pkg-blank-price','pkg-blank-delivery','pkg-blank-sell','pkg-blank-notes','pkg-blank-photo'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('pkg-delete-btn').style.display = 'none';
        document.getElementById('pkg-edit-form').style.display = '';
        this.recalcPkgCost();
        document.getElementById('pkg-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editPkgBlank(id) {
        const b = this._pkgBlanks.find(x => x.id === id);
        if (!b) return;
        this._editingPkgId = id;
        document.getElementById('pkg-form-title').textContent = 'Редактировать: ' + (b.name || '');
        document.getElementById('pkg-blank-name').value = b.name || '';
        document.getElementById('pkg-blank-price').value = b.price_per_unit || '';
        document.getElementById('pkg-blank-delivery').value = b.delivery_per_unit || '';
        document.getElementById('pkg-blank-sell').value = b.sell_price || '';
        document.getElementById('pkg-blank-notes').value = b.notes || '';
        document.getElementById('pkg-blank-photo').value = b.photo_url || '';
        document.getElementById('pkg-delete-btn').style.display = '';
        document.getElementById('pkg-edit-form').style.display = '';
        this.recalcPkgCost();
        document.getElementById('pkg-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    recalcPkgCost() {
        const el = document.getElementById('pkg-cost-breakdown');
        if (!el) return;

        const price = parseFloat(document.getElementById('pkg-blank-price').value) || 0;
        const delivery = parseFloat(document.getElementById('pkg-blank-delivery').value) || 0;

        if (price <= 0 && delivery <= 0) { el.style.display = 'none'; return; }

        const totalCost = round2(price + delivery);
        const fixedSellPrice = parseFloat(document.getElementById('pkg-blank-sell').value) || 0;
        const formulaSellPrice = calcSellByNetMargin40(totalCost, App.params || {});

        let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;">Себестоимость: ${formatRub(totalCost)}</div>`;
        html += `<div style="color:var(--text-secondary);font-size:11px;line-height:1.7;">`;
        html += `Стоимость: <b>${formatRub(price)}</b> + Доставка: <b>${formatRub(delivery)}</b> = <b>${formatRub(totalCost)}</b>`;
        if (formulaSellPrice > 0) {
            html += `<br><span style="color:var(--green);font-weight:700;">Цена продажи по формуле (40% чистой маржи, −6% ОСН, −6,5% коммерч., +НДС сверху): ${formatRub(formulaSellPrice)}</span>`;
        }
        if (fixedSellPrice > 0) {
            html += `<br><span style="color:var(--text-muted);">Ручная цена в поле: ${formatRub(fixedSellPrice)}</span>`;
        }
        html += `</div>`;

        el.innerHTML = html;
        el.style.display = '';
    },

    hidePkgForm() {
        document.getElementById('pkg-edit-form').style.display = 'none';
        this._editingPkgId = null;
    },

    async savePkgBlank() {
        const name = document.getElementById('pkg-blank-name').value.trim();
        if (!name) { App.toast('Введите название'); return; }

        const blank = {
            id: this._editingPkgId || undefined,
            name,
            price_per_unit: parseFloat(document.getElementById('pkg-blank-price').value) || 0,
            delivery_per_unit: parseFloat(document.getElementById('pkg-blank-delivery').value) || 0,
            sell_price: parseFloat(document.getElementById('pkg-blank-sell').value) || 0,
            notes: document.getElementById('pkg-blank-notes').value.trim(),
            photo_url: document.getElementById('pkg-blank-photo').value.trim(),
        };

        await savePkgBlank(blank);
        App.toast('Упаковка сохранена');
        this.hidePkgForm();
        await this.loadPkgTab();
    },

    async deletePkgBlank() {
        if (!this._editingPkgId) return;
        if (confirm('Удалить эту упаковку?')) {
            await deletePkgBlank(this._editingPkgId);
            App.toast('Удалено');
            this.hidePkgForm();
            await this.loadPkgTab();
        }
    },

    async confirmDeletePkg(id, name) {
        if (confirm(`Удалить "${name}"?`)) {
            await deletePkgBlank(id);
            App.toast('Удалено');
            await this.loadPkgTab();
        }
    },
};

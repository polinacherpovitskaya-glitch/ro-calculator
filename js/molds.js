// =============================================
// Recycle Object — Blanks (Справочник бланков)
// Compact table view with pricing
// =============================================

// Pricing formula for blanks page:
// 1. Себестоимость рассчитывается как для любых изделий (молд / 4500)
// 2. НДС 5% добавляется сверху и НЕ входит в базовую цену.
// 3. Из цены без НДС удерживаются:
//    - налоги 7% от базы без НДС
//    - коммерческий отдел 6.5% от суммы с НДС
//    - благотворительность 1% от суммы с НДС
// 4. Цена без НДС = себест / (1 - налоги - коммерческий(с НДС) - благотворительность(с НДС) - target_net_margin), округление до 5₽

// Молд НЕ делим на тираж заказа — делим на макс. производительность молда
// Макс. производительность = 5000 шт * 0.9 = 4500 шт
const MOLD_MAX_LIFETIME = 4500; // максимальный ресурс молда (шт)

const MOLD_TIERS = [10, 50, 100, 300, 500, 1000, 3000];

function formatDimensionValue(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '';
    return Number.isInteger(num) ? String(num) : String(Math.round(num * 10) / 10);
}

// Тиражные чистые маржи бланков после всех удержаний.
const BLANKS_TIER_MARGINS = [
    { max: 10, margin: 0.65, mult: 1.00 },
    { max: 50, margin: 0.60, mult: 1.00 },
    { max: 100, margin: 0.55, mult: 1.00 },
    { max: 300, margin: 0.50, mult: 1.00 },
    { max: 500, margin: 0.45, mult: 1.00 },
    { max: 1000, margin: 0.40, mult: 1.00 },
    { max: Infinity, margin: 0.35, mult: 1.00 },
];

/**
 * Округление цены до ближайшего кратного 5₽
 * 1162₽ → 1160₽, 1163₽ → 1165₽, 100₽ → 100₽
 */
function roundTo5(n) {
    return Math.round(n / 5) * 5;
}

function getBlankKeepRate(params, margin = 0) {
    if (typeof getKeepRateForTargetMargin === 'function') {
        return getKeepRateForTargetMargin(params, margin);
    }
    const vatRate = Number.isFinite(params?.vatRate) ? params.vatRate : 0.05;
    const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.07;
    const charityRate = Number.isFinite(params?.charityRate) ? params.charityRate : 0.01;
    const commercialRate = 0.065;
    return 1 - taxRate - (commercialRate * (1 + vatRate)) - (charityRate * (1 + vatRate)) - (Number(margin) || 0);
}

function getBlankRetentionRate(params) {
    return getBlankKeepRate(params, 0);
}

function getBlankMargin(qty) {
    const normalizedQty = Number(qty) || 0;
    const tier = BLANKS_TIER_MARGINS.find(t => normalizedQty <= t.max);
    return tier ? tier.margin : 0.35;
}

function getBlankMultiplier(qty) {
    const normalizedQty = Number(qty) || 0;
    const tier = BLANKS_TIER_MARGINS.find(t => normalizedQty <= t.max);
    return tier ? tier.mult : 1.00;
}

function hasManualBlankPriceOverride(mold) {
    if (!mold || mold.disable_historical_blank_price_recovery) return false;
    return !!mold.use_manual_prices;
}

function calcBlankTargetPrice(cost, qty, params) {
    if (cost <= 0 || qty <= 0) return 0;
    const margin = getBlankMargin(qty);
    const keepRate = getBlankKeepRate(params, margin);
    if (keepRate <= 0) return 0;
    return round2(cost / keepRate);
}

function calcSellByNetMargin40(cost, params) {
    if (!Number.isFinite(cost) || cost <= 0) return 0;
    const margin = 0.40;
    const keepRate = getBlankKeepRate(params, margin);
    if (keepRate <= 0) return 0;
    return round2(cost / keepRate);
}

function calcBlankSellPrice(cost, qty, params) {
    if (cost <= 0 || qty <= 0) return 0;
    const target = calcBlankTargetPrice(cost, qty, params);
    return roundTo5(target);
}

const Molds = {
    allMolds: [],
    editingId: null,

    _speedPerMinute(speedPerHour) {
        const perHour = Number(speedPerHour || 0);
        return perHour > 0 ? round2(perHour / 60) : 0;
    },

    _speedPerHour(speedPerMinute) {
        const perMinute = Number(speedPerMinute || 0);
        return perMinute > 0 ? round2(perMinute * 60) : null;
    },

    _formatSpeedPerMinute(speedPerHour) {
        const perMinute = this._speedPerMinute(speedPerHour);
        if (!(perMinute > 0)) return '';
        return Number.isInteger(perMinute) ? String(perMinute) : String(perMinute);
    },

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
            const singleMoldCost = (m.cost_cny ?? 800) * (m.cny_rate ?? 12.5) + (m.delivery_cost ?? 3000);
            m.cost_rub_calc = round2(singleMoldCost * moldCount);

            // Амортизация молда = стоимость / макс. ресурс (4500 шт), одинаковая для всех тиражей
            const moldAmortPerUnit = m.cost_rub_calc / MOLD_MAX_LIFETIME;

            // Себестоимость для всех тиражей привязана к модели 50 шт.
            const baseQtyForCost = 50;
            const baseItem = {
                quantity: baseQtyForCost,
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
                builtin_assembly_name: m.builtin_assembly_name || '',
                builtin_assembly_speed: Number(m.builtin_assembly_speed || 0),
            };

            const baseResult = calculateItemCost(baseItem, params);
            let baseAdjustedCost = baseResult.costTotal - baseResult.costMoldAmortization + moldAmortPerUnit;
            let baseHwCostPerUnit = 0;
            if (m.hw_name && (m.hw_price_per_unit > 0 || m.hw_speed > 0)) {
                baseHwCostPerUnit = m.hw_price_per_unit + (m.hw_delivery_total ? m.hw_delivery_total / baseQtyForCost : 0);
                if (m.hw_speed > 0) {
                    const hwHours = baseQtyForCost / m.hw_speed * (params.wasteFactor || 1.1);
                    baseHwCostPerUnit += hwHours * params.fotPerHour / baseQtyForCost;
                    if (params.indirectCostMode === 'all') {
                        baseHwCostPerUnit += params.indirectPerHour * hwHours / baseQtyForCost;
                    }
                }
                baseAdjustedCost += baseHwCostPerUnit;
            }

            const baseAssemblyCostPerUnit = round2((baseResult.costBuiltinAssembly || 0) + (baseResult.costBuiltinAssemblyIndirect || 0));
            const hasExplicitNfcHardware = this._hasInlineNfcChip(m) && baseHwCostPerUnit > 0;
            const baseNfcCostPerUnit = round2(
                (baseResult.costNfcTag || 0)
                + (baseResult.costNfcProgramming || 0)
                + (baseResult.costNfcIndirect || 0)
                + (hasExplicitNfcHardware ? baseHwCostPerUnit : 0)
            );
            const baseCuttingCostPerUnit = round2((baseResult.costCutting || 0) + (baseResult.costCuttingIndirect || 0));
            m.cost_breakdown = {
                total: round2(baseAdjustedCost),
                fot: round2(baseResult.costFot || 0),
                indirect: round2(baseResult.costIndirect || 0),
                plastic: round2(baseResult.costPlastic || 0),
                mold: round2(moldAmortPerUnit),
                design: round2(baseResult.costDesign || 0),
                cutting: baseCuttingCostPerUnit,
                nfc: baseNfcCostPerUnit,
                builtin_hw: hasExplicitNfcHardware ? 0 : round2(baseHwCostPerUnit),
                builtin_assembly: baseAssemblyCostPerUnit,
            };

            // Calculate cost per unit at each tier
            m.tiers = {};
            MOLD_TIERS.forEach(qty => {
                const adjustedCost = round2(baseAdjustedCost);
                const hwCostPerUnit = round2(baseHwCostPerUnit);

                // Расчётная цена всегда идёт от текущей себестоимости.
                // Ручные цены/маржи применяются только при явном ручном override.
                const allowManualOverride = hasManualBlankPriceOverride(m);
                const customPrice = allowManualOverride ? m.custom_prices && m.custom_prices[qty] : null;
                const customMargin = allowManualOverride ? m.custom_margins && m.custom_margins[qty] : null;
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
                    const keepRate = getBlankKeepRate(params, margin);
                    targetPrice = keepRate > 0 ? round2(adjustedCost / keepRate) : 0;
                    sellPrice = roundTo5(targetPrice);
                    isCustom = true;
                } else {
                    // Standard tier margin
                    targetPrice = calcBlankTargetPrice(adjustedCost, qty, params);
                    sellPrice = calcBlankSellPrice(adjustedCost, qty, params);
                }

                // Calculate actual net margin on the price without VAT.
                const keepNetRate = getBlankRetentionRate(params);
                const actualMargin = sellPrice > 0
                    ? round2(((sellPrice * keepNetRate) - adjustedCost) / sellPrice)
                    : margin;

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

        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        el('molds-total', total);
        el('molds-active', active);
        el('molds-avg-cost', formatRub(avgCost));
        el('molds-total-value', formatRub(totalValue));
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

    // === COMPACT TABLE — collapsed inline controls ===
    renderTable(molds) {
        const container = document.getElementById('molds-cards-container');
        const vatRate = Number.isFinite(App?.params?.vatRate) ? App.params.vatRate : 0.05;

        if (molds.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Нет бланков по фильтрам</p></div>';
            return;
        }

        // Show 5 key tiers: 50, 100, 300, 500, 1K
        const DISPLAY_TIERS = [50, 100, 300, 500, 1000];

        let html = `
        <div class="card" style="padding:0; overflow-x:auto;">
            <table style="width:100%; font-size:12px; white-space:nowrap; border-collapse:collapse;">
                <thead>
                    <tr style="border-bottom:2px solid var(--border);">
                        <th style="min-width:200px; padding:10px 12px; text-align:left;">Бланк</th>
                        <th style="text-align:center;padding:8px 4px;width:48px;font-size:11px;color:var(--text-muted);font-weight:500;">Шт/ч</th>
                        <th style="text-align:center;padding:8px 4px;width:42px;font-size:11px;color:var(--text-muted);font-weight:500;">Вес</th>`;
                        html += `<th style="text-align:center;padding:8px 6px;width:92px;font-size:11px;color:var(--text-muted);font-weight:500;">Размер</th>`;

        DISPLAY_TIERS.forEach(q => {
            const label = q >= 1000 ? (q/1000) + 'K' : q;
            html += `
                        <th style="text-align:center;padding:8px 2px;font-size:11px;border-left:1px solid var(--border);" colspan="2">${label} шт</th>`;
        });

        html += `
                        <th style="width:36px;padding:8px 4px;"></th>
                    </tr>
                    <tr style="border-bottom:1px solid var(--border);background:var(--bg);">
                        <th></th><th></th><th></th><th></th>`;

        DISPLAY_TIERS.forEach(() => {
            html += `<th style="text-align:right;padding:2px 4px;font-size:9px;color:var(--text-muted);font-weight:400;border-left:1px solid var(--border);">себест</th>
                     <th style="text-align:right;padding:2px 6px;font-size:9px;color:var(--green);font-weight:600;">без НДС</th>`;
        });
        html += `<th></th></tr>
                </thead>
                <tbody>`;

        molds.forEach(m => {
            const statusDot = m.status === 'active' ? 'calculated' : m.status === 'client' ? 'in_production' : 'cancelled';
            const pph = m.pph_actual || ((m.pph_min && m.pph_max) ? Math.round((m.pph_min + m.pph_max) / 2) : m.pph_min) || 0;
            const pphText = m.pph_actual ? `<b>${pph}</b>` : (pph > 0 ? `${pph}` : '—');
            const dimensionsText = this._formatDimensions(m);
            const collectionBadge = m.collection
                ? ` <span style="color:var(--accent);font-size:10px;font-weight:600;">${this.esc(m.collection)}</span>`
                : '';
            const nfcBadge = this._hasInlineNfcChip(m) ? '<span style="background:rgba(69,125,255,.1);color:var(--accent);font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;">NFC</span>' : '';
            const priceBadge = hasManualBlankPriceOverride(m)
                ? '<span style="color:var(--orange);font-size:9px;font-weight:600;">ручная</span>'
                : '';

            // Build tier cells (cost + sell pairs)
            let tierCells = '';
            DISPLAY_TIERS.forEach(q => {
                const t = m.tiers?.[q];
                const sellColor = t?.isCustom ? 'var(--orange)' : 'var(--green)';
                const marginPct = t ? Math.round(t.margin * 100) : 0;
                const sellWithVat = t ? round2(t.sellPrice * (1 + vatRate)) : 0;
                tierCells += `<td style="text-align:right;padding:6px 4px;font-size:10px;color:var(--text-muted);border-left:1px solid var(--border);" title="${this.esc(this._getCostBreakdownTitle(m))}">${t ? Math.round(t.cost) : '—'}</td>`;
                tierCells += `<td style="text-align:right;padding:6px 6px;font-size:13px;font-weight:700;color:${sellColor};" title="Цена в колонке указана без НДС: ${t ? formatRub(t.sellPrice) : '—'}. С НДС: ${t ? formatRub(sellWithVat) : '—'}. Чистая маржа ${marginPct}% считается после налогов 7% от базы, 1% благотворительности с НДС и 6.5% коммерческого отдела с НДС.">${t ? Math.round(t.sellPrice) : '—'}</td>`;
            });

            html += `
                <tr style="border-bottom:1px solid var(--border);cursor:pointer;" onclick="Molds.toggleInline(${m.id}, event)">
                    <td style="padding:8px 12px;">
                        <div style="display:flex;gap:8px;align-items:center;">
                            ${this.getPhotoThumb(m)}
                            <div style="min-width:0;">
                                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                                    <span class="status-dot ${statusDot}"></span>
                                    <span style="font-weight:700;font-size:13px;">${this.esc(m.name)}</span>
                                    ${collectionBadge} ${nfcBadge} ${priceBadge}
                                </div>
                                ${m.hw_name ? `<div style="font-size:10px;color:var(--text-muted);">+ ${this.esc(m.hw_name)}</div>` : ''}
                                ${Number(m.builtin_assembly_speed || 0) > 0 ? `<div style="font-size:10px;color:var(--orange);">🛠 ${this.esc(m.builtin_assembly_name || 'Сборка')} · ${this._formatSpeedPerMinute(m.builtin_assembly_speed)} шт/мин</div>` : ''}
                            </div>
                        </div>
                    </td>
                    <td style="text-align:center;padding:6px 4px;font-size:12px;">${pphText}</td>
                    <td style="text-align:center;padding:6px 4px;font-size:11px;color:var(--text-muted);">${m.weight_grams || '—'}г</td>
                    <td style="text-align:center;padding:6px 6px;font-size:11px;color:var(--text-secondary);">${this.esc(dimensionsText)}${dimensionsText !== '—' ? '<span style="color:var(--text-muted);font-size:10px;"> мм</span>' : ''}</td>
                    ${tierCells}
                    <td style="padding:6px 4px;text-align:center;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="event.stopPropagation();Molds.editMold(${m.id})" title="Редактировать">&#9998;</button>
                    </td>
                </tr>
                <tr id="mold-inline-row-${m.id}" style="display:none;border-bottom:2px solid var(--border);background:var(--bg);">
                    <td colspan="${DISPLAY_TIERS.length * 2 + 5}" style="padding:12px 16px;">
                        ${this._renderInlineControls(m)}
                    </td>
                </tr>`;
        });

        html += '</tbody></table>';

        // Compact legend
        html += `
            <div style="padding:10px 12px;font-size:10px;color:var(--text-muted);display:flex;gap:12px;flex-wrap:wrap;border-top:1px solid var(--border);">
                <span><span style="color:var(--text-secondary);">себест</span> — себестоимость · <span style="color:var(--green);font-weight:700;">без НДС</span> — базовая цена без НДС</span>
                <span>Проценты под ценой — чистая маржа на базе без НДС; сверху потом добавляется НДС 5%, а из базы вычитаются налоги 7%, 1% благотворительности с НДС и 6.5% коммерческого отдела с НДС</span>
                <span>Нажмите на строку для быстрых настроек</span>
            </div>
        </div>`;

        container.innerHTML = html;
    },

    toggleInline(id, event) {
        if (event && (event.target.tagName === 'INPUT' || event.target.tagName === 'SELECT' || event.target.tagName === 'BUTTON' || event.target.closest('button'))) return;
        const row = document.getElementById('mold-inline-row-' + id);
        if (!row) return;
        const isVisible = row.style.display !== 'none';
        // Close all other inline rows
        document.querySelectorAll('[id^="mold-inline-row-"]').forEach(r => { r.style.display = 'none'; });
        if (!isVisible) row.style.display = '';
    },

    _getCostBreakdownParts(mold) {
        const breakdown = mold?.cost_breakdown || {};
        const parts = [];
        if ((breakdown.indirect || 0) > 0) parts.push(`косвенные ${formatRub(breakdown.indirect)}`);
        if ((breakdown.fot || 0) > 0) parts.push(`ФОТ ${formatRub(breakdown.fot)}`);
        if ((breakdown.nfc || 0) > 0) parts.push(`NFC ${formatRub(breakdown.nfc)}`);
        if ((breakdown.builtin_hw || 0) > 0) parts.push(`встроенная фурнитура ${formatRub(breakdown.builtin_hw)}`);
        if ((breakdown.builtin_assembly || 0) > 0) parts.push(`сборка ${formatRub(breakdown.builtin_assembly)}`);
        if ((breakdown.plastic || 0) > 0) parts.push(`пластик ${formatRub(breakdown.plastic)}`);
        if ((breakdown.mold || 0) > 0) parts.push(`молд ${formatRub(breakdown.mold)}`);
        if ((breakdown.cutting || 0) > 0) parts.push(`срезка ${formatRub(breakdown.cutting)}`);
        if ((breakdown.design || 0) > 0) parts.push(`дизайн ${formatRub(breakdown.design)}`);
        return parts;
    },

    _getCostBreakdownTitle(mold) {
        const total = mold?.cost_breakdown?.total || 0;
        const parts = this._getCostBreakdownParts(mold);
        if (!parts.length) return '';
        return `Себестоимость ${formatRub(total)} = ${parts.join(' • ')}`;
    },

    _getInlineMoldTypeLabel(mold) {
        switch (String(mold?.complexity || '')) {
            case 'simple':
                return 'простой молд';
            case 'complex':
                return 'сложный молд';
            case 'nfc_triple':
                return 'NFC-молд';
            default:
                return '';
        }
    },

    _formatDimensions(mold) {
        const width = formatDimensionValue(mold?.width_mm);
        const height = formatDimensionValue(mold?.height_mm);
        const depth = formatDimensionValue(mold?.depth_mm);
        if (!width && !height && !depth) return '—';
        const base = [width || '—', height || '—'].join('×');
        return depth ? `${base}×${depth}` : base;
    },

    _renderInlineControls(mold) {
        const inlinePph = Number(mold.pph_actual || mold.pph_max || mold.pph_min || 0) || '';
        const inlineWeight = Number(mold.weight_grams || 0) || '';
        const inlineWidth = Number(mold.width_mm || 0) || '';
        const inlineHeight = Number(mold.height_mm || 0) || '';
        const inlineDepth = Number(mold.depth_mm || 0) || '';
        const inlineComplexity = String(mold.complexity || 'simple');
        const nfcChecked = this._hasInlineNfcChip(mold);
        const nfcCost = Number(mold?.hw_price_per_unit || App?.params?.nfcTagCost || App?.settings?.nfc_tag_cost || 0) || 0;
        const vatRate = Number.isFinite(App?.params?.vatRate) ? App.params.vatRate : 0.05;
        const costBreakdownSummary = this._getCostBreakdownParts(mold);

        // Full tier breakdown (all 7 tiers)
        const allTiersHtml = MOLD_TIERS.map(q => {
            const label = q >= 1000 ? (q/1000) + 'K' : q;
            const t = mold.tiers?.[q];
            const sellColor = t?.isCustom ? 'var(--orange)' : 'var(--green)';
            const marginPct = t ? Math.round(t.margin * 100) : 0;
            const sellWithVat = t ? round2(t.sellPrice * (1 + vatRate)) : 0;
            return `<div style="text-align:center;min-width:64px;">
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:2px;">${label} шт</div>
                <div style="font-size:10px;color:var(--text-secondary);">${t ? Math.round(t.cost) + '₽' : '—'}</div>
                <div style="font-size:14px;font-weight:700;color:${sellColor};">${t ? Math.round(t.sellPrice) + '₽' : '—'}</div>
                <div style="font-size:9px;color:var(--text-muted);">${t ? 'с НДС ' + Math.round(sellWithVat) + '₽' : ''}</div>
                <div style="font-size:9px;color:var(--text-muted);" title="Чистая маржа на базе без НДС; сверху добавляется НДС 5%, затем вычитаются налоги 7% от базы, 1% благотворительности с НДС и 6.5% коммерческого отдела с НДС">${marginPct}%</div>
            </div>`;
        }).join('');

        return `
            <div style="display:flex;flex-direction:column;gap:12px;" onclick="event.stopPropagation()">
                <div style="display:flex;gap:4px;overflow-x:auto;padding:4px 0;">
                    ${allTiersHtml}
                </div>
                ${costBreakdownSummary.length ? `<div style="font-size:11px;color:var(--text-secondary);line-height:1.5;"><span style="font-weight:700;color:var(--text-primary);">Себест ${formatRub(mold?.cost_breakdown?.total || 0)}</span> = ${costBreakdownSummary.join(' • ')}</div>` : ''}
                <div style="border-top:1px solid var(--border);padding-top:10px;display:flex;gap:10px;align-items:end;flex-wrap:wrap;">
                    <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary);">
                        <span>Шт/ч</span>
                        <input id="mold-inline-pph-${mold.id}" type="number" min="0" step="1" class="input" style="width:80px;height:32px;font-size:12px;" value="${inlinePph}">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary);">
                        <span>Вес, г</span>
                        <input id="mold-inline-weight-${mold.id}" type="number" min="0" step="0.01" class="input" style="width:80px;height:32px;font-size:12px;" value="${inlineWeight}">
                    </label>
                    <div style="display:flex;gap:6px;align-items:end;padding:0 6px 0 0;">
                        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary);">
                            <span>Ш, мм</span>
                            <input id="mold-inline-width-${mold.id}" type="number" min="0" step="0.1" class="input" style="width:70px;height:32px;font-size:12px;" value="${inlineWidth}">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary);">
                            <span>В, мм</span>
                            <input id="mold-inline-height-${mold.id}" type="number" min="0" step="0.1" class="input" style="width:70px;height:32px;font-size:12px;" value="${inlineHeight}">
                        </label>
                        <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary);">
                            <span>Г, мм</span>
                            <input id="mold-inline-depth-${mold.id}" type="number" min="0" step="0.1" class="input" style="width:70px;height:32px;font-size:12px;" value="${inlineDepth}">
                        </label>
                    </div>
                    <label style="display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--text-secondary);">
                        <span>Тип молда</span>
                        <select id="mold-inline-complexity-${mold.id}" class="input" style="height:32px;font-size:12px;">
                            <option value="simple" ${inlineComplexity === 'simple' ? 'selected' : ''}>Простой 800¥</option>
                            <option value="complex" ${inlineComplexity === 'complex' ? 'selected' : ''}>Сложный 1000¥</option>
                            <option value="nfc_triple" ${inlineComplexity === 'nfc_triple' ? 'selected' : ''}>NFC 1200¥</option>
                        </select>
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:1px solid var(--border);border-radius:8px;background:#fff;font-size:12px;cursor:pointer;">
                        <input id="mold-inline-nfc-${mold.id}" type="checkbox" ${nfcChecked ? 'checked' : ''}>
                        <span style="font-weight:600;">NFC</span>
                        ${nfcCost > 0 ? `<span style="color:var(--text-muted);font-size:10px;">${formatRub(nfcCost)}</span>` : ''}
                    </label>
                    <div style="display:flex;gap:6px;margin-left:auto;">
                        <button class="btn btn-sm btn-primary" onclick="Molds.saveInlineMold(${mold.id})">Сохранить</button>
                        <button class="btn btn-sm btn-outline" onclick="Molds.editMold(${mold.id})">Карточка</button>
                        <button class="btn btn-sm btn-danger" style="font-size:10px;" onclick="Molds.confirmDelete(${mold.id}, '${this.esc(mold.name)}')">Удалить</button>
                    </div>
                </div>
                ${mold.notes ? `<div style="font-size:10px;color:var(--text-muted);font-style:italic;border-top:1px solid var(--border);padding-top:6px;">${this.esc(mold.notes)}</div>` : ''}
            </div>`;
    },

    _hasInlineNfcChip(mold) {
        const name = String(mold?.hw_name || '').trim().toLowerCase();
        return name === 'nfc метка' || name === 'nfc метка / чип' || name === 'nfc chip' || name === 'nfc';
    },

    _findWarehouseNfcSnapshot() {
        const items = [
            ...(Array.isArray(this._warehouseHwItems) ? this._warehouseHwItems : []),
            ...(Array.isArray(this._warehouseItems) ? this._warehouseItems : []),
        ].filter((item, index, arr) => arr.findIndex(other => Number(other?.id) === Number(item?.id)) === index);
        const match = items.find(item => {
            const sku = String(item?.sku || '').trim().toUpperCase();
            const name = String(item?.name || '').trim().toLowerCase();
            return sku === 'NFC'
                || name === 'nfc'
                || name === 'nfc метка'
                || name === 'nfc метка / чип'
                || name.includes('nfc');
        });
        return match ? this._getWarehouseHwSnapshot(match.id, '') : null;
    },

    async saveInlineMold(id) {
        const mold = this.allMolds.find(x => x.id === id);
        if (!mold) return;

        const pphRaw = document.getElementById(`mold-inline-pph-${id}`)?.value;
        const weightRaw = document.getElementById(`mold-inline-weight-${id}`)?.value;
        const widthRaw = document.getElementById(`mold-inline-width-${id}`)?.value;
        const heightRaw = document.getElementById(`mold-inline-height-${id}`)?.value;
        const depthRaw = document.getElementById(`mold-inline-depth-${id}`)?.value;
        const complexity = document.getElementById(`mold-inline-complexity-${id}`)?.value || mold.complexity || 'simple';
        const wantsNfc = !!document.getElementById(`mold-inline-nfc-${id}`)?.checked;
        const hadNfc = this._hasInlineNfcChip(mold);
        const nfcCost = Number(App?.params?.nfcTagCost || App?.settings?.nfc_tag_cost || 0) || 0;
        if (wantsNfc) {
            await this.loadWarehouseForHw();
        }
        const nfcSnapshot = wantsNfc ? this._findWarehouseNfcSnapshot() : null;

        const next = {
            ...mold,
            pph_actual: (() => {
                const value = Number(pphRaw);
                return Number.isFinite(value) && value > 0 ? value : null;
            })(),
            weight_grams: (() => {
                const value = Number(weightRaw);
                return Number.isFinite(value) && value > 0 ? value : 0;
            })(),
            width_mm: (() => {
                const value = Number(widthRaw);
                return Number.isFinite(value) && value > 0 ? value : 0;
            })(),
            height_mm: (() => {
                const value = Number(heightRaw);
                return Number.isFinite(value) && value > 0 ? value : 0;
            })(),
            depth_mm: (() => {
                const value = Number(depthRaw);
                return Number.isFinite(value) && value > 0 ? value : 0;
            })(),
            complexity,
            mold_count: Math.max(1, Number.parseInt(mold.mold_count, 10) || 1),
            // Inline save changes only tech params and must not silently reset pricing strategy.
            use_manual_prices: !!mold.use_manual_prices,
            custom_prices: { ...(mold.custom_prices || {}) },
            custom_margins: { ...(mold.custom_margins || {}) },
            disable_historical_blank_price_recovery: !!mold.disable_historical_blank_price_recovery,
        };

        if (wantsNfc) {
            next.hw_source = nfcSnapshot ? 'warehouse' : 'custom';
            next.hw_name = nfcSnapshot?.name || 'NFC метка';
            next.hw_price_per_unit = nfcSnapshot?.priceRub || nfcCost;
            next.hw_delivery_total = 0;
            next.hw_speed = null;
            next.hw_warehouse_item_id = nfcSnapshot?.warehouseItemId || null;
            next.hw_warehouse_sku = nfcSnapshot?.sku || '';
            if (!nfcSnapshot) {
                App.toast('NFC на складе не найдена: сохранили как кастомную метку без резерва');
            }
        } else if (hadNfc) {
            next.hw_source = 'custom';
            next.hw_name = '';
            next.hw_price_per_unit = 0;
            next.hw_delivery_total = 0;
            next.hw_speed = null;
            next.hw_warehouse_item_id = null;
            next.hw_warehouse_sku = '';
        }

        const saveResult = await saveMold(next);
        App.toast(saveResult?.remoteOk === false
            ? 'Сохранили локально. Общая база пока не подтвердила обновление'
            : 'Бланк обновлён');
        await this.load();
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
        const singlePph = m.pph_actual || m.pph_max || m.pph_min || '';
        document.getElementById('mold-pph-min').value = singlePph;
        document.getElementById('mold-pph-max').value = singlePph;
        document.getElementById('mold-pph-actual').value = singlePph;
        document.getElementById('mold-weight').value = m.weight_grams || '';
        document.getElementById('mold-width').value = m.width_mm || '';
        document.getElementById('mold-height').value = m.height_mm || '';
        document.getElementById('mold-depth').value = m.depth_mm || '';
        document.getElementById('mold-complexity').value = m.complexity || 'simple';
        document.getElementById('mold-cost-cny').value = m.cost_cny || '';
        document.getElementById('mold-cny-rate').value = m.cny_rate || 12.5;
        document.getElementById('mold-delivery-cost').value = m.delivery_cost ?? 3000;
        document.getElementById('mold-cost-rub').value = m.cost_rub_calc || '';
        document.getElementById('mold-count').value = m.mold_count || 1;
        document.getElementById('mold-client').value = m.client || '';
        document.getElementById('mold-hw-name').value = m.hw_name || '';
        document.getElementById('mold-hw-price').value = m.hw_price_per_unit || '';
        document.getElementById('mold-hw-delivery-total').value = m.hw_delivery_total || '';
        document.getElementById('mold-hw-speed').value = this._speedPerMinute(m.hw_speed) || '';
        document.getElementById('mold-assembly-name').value = m.builtin_assembly_name || '';
        document.getElementById('mold-assembly-speed').value = this._speedPerMinute(m.builtin_assembly_speed) || '';
        document.getElementById('mold-notes').value = m.notes || '';

        // Custom prices per tier
        const cp = hasManualBlankPriceOverride(m) ? (m.custom_prices || {}) : {};
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
         'mold-weight', 'mold-width', 'mold-height', 'mold-depth', 'mold-cost-cny', 'mold-client',
         'mold-hw-name', 'mold-hw-price', 'mold-hw-speed',
         'mold-assembly-name', 'mold-assembly-speed',
         'mold-notes',
         'mold-photo-url'
        ].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
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
        document.getElementById('mold-delivery-cost').value = 3000;
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

        const customPrices = this._collectCustomPrices();
        const useManualPrices = Object.keys(customPrices).length > 0;

        const pphValue = parseFloat(document.getElementById('mold-pph-actual').value) || 0;

        const mold = {
            id: this.editingId || undefined,
            name,
            category: 'blank', // always blank
            photo_url: this._pendingPhoto || '',
            collection: (document.getElementById('mold-collection')?.value || '').trim(),
            status: document.getElementById('mold-status').value,
            pph_min: pphValue,
            pph_max: pphValue,
            pph_actual: pphValue || null,
            weight_grams: parseFloat(document.getElementById('mold-weight').value) || 0,
            width_mm: parseFloat(document.getElementById('mold-width').value) || 0,
            height_mm: parseFloat(document.getElementById('mold-height').value) || 0,
            depth_mm: parseFloat(document.getElementById('mold-depth').value) || 0,
            complexity: document.getElementById('mold-complexity').value,
            cost_cny: parseFloat(document.getElementById('mold-cost-cny').value) || 0,
            cny_rate: parseFloat(document.getElementById('mold-cny-rate').value) || 12.5,
            delivery_cost: (() => {
                const raw = document.getElementById('mold-delivery-cost').value;
                if (String(raw).trim() === '') return 3000;
                const value = parseFloat(raw);
                return Number.isFinite(value) ? value : 3000;
            })(),
            cost_rub: parseFloat(document.getElementById('mold-cost-rub').value) || 0,
            mold_count: parseInt(document.getElementById('mold-count').value) || 1,
            client: document.getElementById('mold-client').value.trim(),
            hw_source: this._hwSource || 'custom',
            hw_name: document.getElementById('mold-hw-name').value.trim(),
            hw_price_per_unit: parseFloat(document.getElementById('mold-hw-price').value) || 0,
            hw_delivery_total: parseFloat(document.getElementById('mold-hw-delivery-total').value) || 0,
            hw_speed: this._speedPerHour(document.getElementById('mold-hw-speed').value),
            hw_warehouse_item_id: this._hwWarehouseItemId || null,
            hw_warehouse_sku: this._hwWarehouseSku || '',
            builtin_assembly_name: document.getElementById('mold-assembly-name').value.trim(),
            builtin_assembly_speed: this._speedPerHour(document.getElementById('mold-assembly-speed').value),
            notes: document.getElementById('mold-notes').value.trim(),
            total_orders: 0,
            total_units_produced: 0,
            custom_margins: {},
            custom_prices: customPrices,
            use_manual_prices: useManualPrices,
            disable_historical_blank_price_recovery: !useManualPrices,
        };

        if (this.editingId) {
            const existing = this.allMolds.find(m => m.id === this.editingId);
            if (existing) {
                mold.total_orders = existing.total_orders || 0;
                mold.total_units_produced = existing.total_units_produced || 0;
                if (existing.disable_historical_blank_price_recovery && useManualPrices) {
                    mold.disable_historical_blank_price_recovery = false;
                }
            }
        }

        const saveResult = await saveMold(mold);
        App.toast(saveResult?.remoteOk === false
            ? 'Сохранили локально. Общая база пока не подтвердила обновление'
            : 'Бланк сохранен');
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

    /**
     * Публикация каталога: для каждого активного молда сохраняет в mold_data
     * посчитанные тиры (tiers_prices), размеры (width_mm, height_mm, depth_mm),
     * вес и коллекцию. Плагин Figma читает эти поля и подставляет в слайды.
     */
    async publishCatalog() {
        if (!isSupabaseReady()) {
            App.toast('Supabase не подключён');
            return;
        }
        const activeMolds = this.allMolds.filter(m => m.status === 'active');
        if (activeMolds.length === 0) {
            App.toast('Нет активных молдов для публикации');
            return;
        }
        if (!confirm(`Опубликовать ${activeMolds.length} молдов в каталог Figma-плагина?`)) return;

        const TIERS = [50, 100, 300, 500, 1000, 3000];
        let updated = 0, errors = 0, noTiers = 0;

        for (const m of activeMolds) {
            try {
                const tiers_prices = {};
                TIERS.forEach(qty => {
                    const t = m.tiers?.[qty];
                    if (t?.sellPrice > 0) tiers_prices[qty] = Math.round(t.sellPrice);
                });

                const { data: existing, error: fetchErr } = await supabaseClient
                    .from('molds')
                    .select('mold_data')
                    .eq('id', m.id)
                    .single();
                if (fetchErr) { errors++; continue; }

                let moldData = existing.mold_data;
                if (Array.isArray(moldData) && moldData.length > 0) moldData = moldData[0];
                if (typeof moldData === 'string') {
                    try { moldData = JSON.parse(moldData); } catch (e) { moldData = {}; }
                }
                if (!moldData || typeof moldData !== 'object') moldData = {};

                if (Object.keys(tiers_prices).length > 0) {
                    moldData.tiers_prices = tiers_prices;
                    moldData.tiers_published_at = new Date().toISOString();
                } else {
                    noTiers++;
                }
                // Always sync these fields
                moldData.weight_grams = m.weight_grams;
                moldData.collection = m.collection || '';
                if (m.width_mm !== undefined) moldData.width_mm = m.width_mm;
                if (m.height_mm !== undefined) moldData.height_mm = m.height_mm;
                if (m.depth_mm !== undefined) moldData.depth_mm = m.depth_mm;

                const { error: updErr } = await supabaseClient
                    .from('molds')
                    .update({ mold_data: moldData })
                    .eq('id', m.id);
                if (updErr) { errors++; continue; }
                updated++;
            } catch (e) {
                console.error('publishCatalog error for mold', m.id, e);
                errors++;
            }
        }

        const message = `Опубликовано: ${updated}/${activeMolds.length}` +
            (noTiers > 0 ? ` (без цен: ${noTiers})` : '') +
            (errors > 0 ? ` (ошибок: ${errors})` : '');
        App.toast(message);
        console.log('publishCatalog summary:', { updated, errors, noTiers, total: activeMolds.length });
    },

    exportCSV() {
        const tierCols = MOLD_TIERS.flatMap(q => [`Себест. ${q}шт`, `Цена ${q}шт`, `Маржа ${q}шт`, `Множ. ${q}шт`]);
        const headers = ['Название', 'Категория', 'Коллекция', 'Статус', 'Кол-во молдов',
            'Ширина мм', 'Высота мм', 'Глубина мм',
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
                m.width_mm || '', m.height_mm || '', m.depth_mm || '',
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
        if (file.size > 10 * 1024 * 1024) {
            App.toast('Файл слишком большой (макс 10MB)');
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            // Resize to 800px max and upload to Supabase Storage
            this.resizeImageToBlob(e.target.result, 800, async (blob) => {
                // Show local preview immediately
                const localPreview = URL.createObjectURL(blob);
                this.updatePhotoPreview(localPreview);
                document.getElementById('mold-photo-url').value = '';

                // Upload to Supabase Storage
                const url = await this.uploadPhotoToStorage(blob);
                if (url) {
                    this._pendingPhoto = url;
                    this.updatePhotoPreview(url);
                    App.toast('Фото загружено', 'success');
                } else {
                    // Fallback to data URI if upload fails
                    this._pendingPhoto = e.target.result;
                    App.toast('Не удалось загрузить в облако, сохранено локально', 'warning');
                }
                URL.revokeObjectURL(localPreview);
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
            callback(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = dataUrl;
    },

    resizeImageToBlob(dataUrl, maxSize, callback) {
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
            canvas.toBlob((blob) => callback(blob), 'image/jpeg', 0.85);
        };
        img.src = dataUrl;
    },

    async uploadPhotoToStorage(blob) {
        if (!isSupabaseReady()) return null;
        try {
            const fileName = `mold_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
            const { data, error } = await supabaseClient.storage
                .from('mold-photos')
                .upload(fileName, blob, {
                    contentType: 'image/jpeg',
                    upsert: false,
                });
            if (error) {
                console.error('[Molds] Storage upload error:', error);
                return null;
            }
            // Build public URL
            const { data: urlData } = supabaseClient.storage
                .from('mold-photos')
                .getPublicUrl(data.path);
            return urlData?.publicUrl || null;
        } catch (err) {
            console.error('[Molds] Storage upload failed:', err);
            return null;
        }
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
        if (this._warehouseHwItems && this._warehouseHwItems.length > 0) {
            this._warehouseItems = this._warehouseHwItems;
            return;
        }
        try {
            const whItems = await loadWarehouseItems();
            const filtered = (whItems || []).filter(i =>
                i.category !== 'packaging'
            );
            this._warehouseItems = filtered;
            this._warehouseHwItems = filtered;
        } catch (e) {
            console.warn('loadWarehouseForHw error:', e);
            this._warehouseItems = [];
            this._warehouseHwItems = [];
        }
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
        const container = document.getElementById('mold-builtin-hw-warehouse-picker-host')
            || document.getElementById('mold-hw-warehouse-picker-host')
            || document.getElementById('mold-hw-warehouse-list');
        if (!container) return;
        if (!this._warehouseHwItems.length) {
            container.innerHTML = '<p class="text-muted" style="font-size:12px">Нет фурнитуры на складе</p>';
            return;
        }
        const grouped = this._buildWarehouseHwPickerData();
        const selectedId = document.getElementById('hw-blank-wh-id')?.value || '';
        container.innerHTML = Warehouse.buildImagePicker(
            'moldhw-picker-0',
            grouped,
            selectedId,
            'Molds.selectWarehouseHwPicker',
            'hardware',
            { searchPlaceholder: 'Поиск по названию или артикулу...' }
        );
    },

    selectWarehouseHw(itemId) {
        const item = (this._warehouseHwItems || this._warehouseItems || []).find(i => Number(i.id) === Number(itemId));
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

    selectWarehouseHwPicker(_idx, itemId) {
        this.selectWarehouseHw(itemId);
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
            const src = b.hw_form_source || 'warehouse';
            const warehouseSnapshot = src === 'warehouse'
                ? this._getWarehouseHwSnapshot(b.warehouse_item_id, b.notes || '')
                : null;
            let priceRub = warehouseSnapshot ? warehouseSnapshot.priceRub : (b.price_rub || 0);

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
            // Fixed sell price from blank form (fallback to the same 40% net formula used in the card).
            b._targetSellPrice = b._cost > 0 ? calcSellByNetMargin40(b._cost, params) : 0;
            const fixedSell = parseFloat(b.sell_price) || 0;
            b._sellPrice = fixedSell > 0 ? fixedSell : b._targetSellPrice;

            // Source badge
            b._srcBadge = src === 'china' ? '🇨🇳' : src === 'custom_cny' ? '¥' : '📦';

            if (warehouseSnapshot) {
                b._warehouseName = warehouseSnapshot.name;
                b._warehouseSku = warehouseSnapshot.sku;
                b._displayNotes = warehouseSnapshot.notes;
                b._whPhoto = warehouseSnapshot.photoUrl;
            } else {
                b._warehouseName = '';
                b._warehouseSku = '';
                b._displayNotes = b.notes || '';
                b._whPhoto = '';
                if (!b.photo_url && b.warehouse_item_id) {
                    const whItem = this._warehouseHwItems.find(w => w.id === b.warehouse_item_id);
                    if (whItem) b._whPhoto = whItem.photo_thumbnail || whItem.photo_url || '';
                }
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

        let html = `<div class="card" style="padding:0;overflow-x:auto;">
            <table style="font-size:12px;white-space:nowrap;border-collapse:collapse;width:100%;">
            <thead><tr style="border-bottom:2px solid var(--border);">
                <th style="width:44px;padding:10px 8px;"></th>
                <th style="min-width:180px;padding:10px 8px;text-align:left;">Фурнитура</th>
                <th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:500;">Цена/шт</th>
                <th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:500;">Сборка</th>
                <th style="padding:10px 8px;text-align:right;">Себестоимость</th>
                <th style="padding:10px 8px;text-align:right;">Цена продажи</th>
                <th style="width:52px;padding:10px 4px;"></th>
            </tr></thead><tbody>`;

        this._hwBlanks.forEach(b => {
            const src = b.hw_form_source || 'warehouse';
            const priceRub = b._priceRubCalc || b.price_rub || 0;
            const displayName = b._warehouseName || b.name;
            const displayNotes = b._displayNotes || b.notes || '';
            const displaySku = b._warehouseSku || '';
            const photoSrc = src === 'warehouse'
                ? (b._whPhoto || b.photo_url || '')
                : (b.photo_url || b._whPhoto || '');
            const photo = photoSrc
                ? `<img src="${photoSrc.startsWith('data:') ? photoSrc : this.esc(photoSrc)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none'">`
                : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:14px;">🔩</span>`;

            const speedPcsMin = b.assembly_speed ? round2(b.assembly_speed / 60) : 0;
            const srcBadge = b._srcBadge || '📦';
            const inlineSellValue = (parseFloat(b.sell_price) || 0) > 0 ? round2(b.sell_price) : '';
            const targetSell = b._targetSellPrice || 0;
            const sellDisplay = inlineSellValue ? formatRub(inlineSellValue) : (targetSell > 0 ? formatRub(targetSell) : '—');
            const sellIsCustom = inlineSellValue > 0;

            // Subtitle details
            const detailBits = [];
            if (speedPcsMin > 0) detailBits.push(speedPcsMin + ' шт/мин');
            if (src === 'warehouse' && displaySku) detailBits.push(displaySku);
            if (src === 'china' || src === 'custom_cny') {
                detailBits.push(`${b.price_cny || 0}¥`);
                const methodInfo = ChinaCatalog.DELIVERY_METHODS[b.delivery_method];
                if (methodInfo) detailBits.push(methodInfo.label);
            }
            if (displayNotes) detailBits.push(displayNotes);

            html += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px;">${photo}</td>
                <td style="padding:8px;">
                    <div style="font-weight:700;font-size:13px;">${srcBadge} ${this.esc(displayName)}</div>
                    ${detailBits.length ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">${this.esc(detailBits.join(' · '))}</div>` : ''}
                </td>
                <td style="padding:8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(priceRub)}</td>
                <td style="padding:8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(b._assemblyCost)}</td>
                <td style="padding:8px;text-align:right;font-size:14px;font-weight:700;">${formatRub(b._cost)}</td>
                <td style="padding:8px;text-align:right;font-size:14px;font-weight:700;color:${sellIsCustom ? 'var(--green)' : 'var(--text-secondary)'};">
                    ${sellDisplay}
                    ${!sellIsCustom && targetSell > 0 ? '<div style="font-size:9px;color:var(--text-muted);font-weight:400;">авто 40%</div>' : ''}
                </td>
                <td style="padding:8px 4px;">
                    <div style="display:flex;gap:3px;align-items:center;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Molds.editHwBlank(${b.id})" title="Редактировать">&#9998;</button>
                        <button class="btn-remove" style="font-size:9px;width:22px;height:22px;" onclick="Molds.confirmDeleteHw(${b.id}, '${this.esc(displayName)}')" title="Удалить">&#10005;</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        html += `<div style="padding:10px 12px;font-size:10px;color:var(--text-muted);border-top:1px solid var(--border);">
            Себестоимость = цена/шт + (ФОТ ${formatRub(fotPerHour)}/ч + косвенные ${formatRub(round2(indirectPerHour))}/ч) ÷ скорость сборки &nbsp;·&nbsp; 📦 склад &nbsp;·&nbsp; 🇨🇳 каталог &nbsp;·&nbsp; ¥ кастом
        </div></div>`;

        container.innerHTML = html;
    },

    updateInlineHwSellHint(id) {
        const blank = this._hwBlanks.find(x => x.id === id);
        const input = document.getElementById(`hw-inline-sell-${id}`);
        const hint = document.getElementById(`hw-inline-hint-${id}`);
        if (!blank || !input || !hint) return;
        const entered = parseFloat(input.value) || 0;
        const targetSell = blank._targetSellPrice || 0;
        if (entered > 0) {
            hint.textContent = `Таргет: ${formatRub(targetSell)}`;
            hint.style.color = 'var(--text-muted)';
        } else {
            hint.textContent = targetSell > 0 ? `По формуле 40%: ${formatRub(targetSell)}` : 'Цена по формуле появится после расчёта себестоимости';
            hint.style.color = 'var(--text-muted)';
        }
    },

    async saveInlineHwBlank(id) {
        const blank = this._hwBlanks.find(x => x.id === id);
        if (!blank) return;
        const input = document.getElementById(`hw-inline-sell-${id}`);
        const rawValue = input ? String(input.value || '').trim() : '';
        const sellPrice = rawValue === '' ? 0 : (parseFloat(rawValue) || 0);

        const payload = {
            id: blank.id,
            name: blank.name,
            price_rub: blank.price_rub || 0,
            sell_price: sellPrice,
            warehouse_item_id: blank.warehouse_item_id || null,
            china_catalog_id: blank.china_catalog_id || null,
            assembly_speed: blank.assembly_speed || 0,
            notes: blank.notes || '',
            photo_url: blank.photo_url || '',
            hw_form_source: blank.hw_form_source || 'warehouse',
            price_cny: blank.price_cny || 0,
            weight_grams: blank.weight_grams || 0,
            delivery_method: blank.delivery_method || '',
            delivery_per_unit: blank.delivery_per_unit || 0,
        };

        await saveHwBlank(payload);
        App.toast(sellPrice > 0 ? 'Цена продажи сохранена' : 'Ручная цена очищена, включён таргет');
        await this.loadHwTab();
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
        if (src === 'warehouse') {
            this.renderWarehouseHwPicker();
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

    _formatWarehouseHwName(item) {
        if (!item) return '';
        return [item.name, item.color, item.size].filter(Boolean).join(' ').trim();
    },

    _looksLikeWarehouseSku(text) {
        const value = String(text || '').trim();
        return /^[A-Z0-9][A-Z0-9+-]*(?:-[A-Z0-9+]+)*$/i.test(value);
    },

    _normalizeHwNotesForWarehouseItem(item, notes) {
        const sku = String(item?.sku || '').trim();
        const raw = String(notes || '').trim();
        if (!sku || !raw) return raw;
        if (raw === sku) return '';
        const parts = raw.split(' + ').map(part => String(part || '').trim()).filter(Boolean);
        if (!parts.length) return '';
        const prefix = parts[0];
        if (prefix === sku) return parts.slice(1).join(' + ').trim();
        if (this._looksLikeWarehouseSku(prefix)) {
            return parts.slice(1).join(' + ').trim();
        }
        return raw;
    },

    _getWarehouseHwSnapshot(warehouseItemId, notes) {
        const itemId = Number(warehouseItemId || 0);
        if (!itemId) return null;
        const item = this._warehouseHwItems.find(w => Number(w.id) === itemId);
        if (!item) return null;
        return {
            item,
            name: this._formatWarehouseHwName(item),
            sku: String(item.sku || '').trim(),
            priceRub: round2(item.price_per_unit || 0),
            photoUrl: item.photo_thumbnail || item.photo_url || '',
            warehouseItemId: item.id,
            notes: this._normalizeHwNotesForWarehouseItem(item, notes),
        };
    },

    _formatWarehouseHwInfo(snapshot) {
        if (!snapshot) return '';
        const parts = [];
        if (snapshot.sku) parts.push(`Артикул: ${snapshot.sku}`);
        parts.push(`Цена: ${formatRub(snapshot.priceRub)} (доставка включена)`);
        return parts.join(' · ');
    },

    _getWarehouseCategoryMeta(catKey) {
        if (typeof WAREHOUSE_CATEGORIES !== 'undefined' && Array.isArray(WAREHOUSE_CATEGORIES)) {
            return WAREHOUSE_CATEGORIES.find(cat => cat.key === catKey) || null;
        }
        return null;
    },

    _buildWarehouseHwPickerData() {
        const grouped = {};
        const sortedItems = [...(this._warehouseHwItems || [])].sort((a, b) =>
            String(a.name || '').localeCompare(String(b.name || ''), 'ru')
        );

        sortedItems.forEach(item => {
            const catKey = String(item.category || 'other');
            if (!grouped[catKey]) {
                const meta = this._getWarehouseCategoryMeta(catKey);
                grouped[catKey] = {
                    label: meta?.label || catKey,
                    icon: meta?.icon || '📦',
                    items: [],
                };
            }

            grouped[catKey].items.push({
                id: item.id,
                category: item.category || catKey,
                name: item.name || '',
                sku: item.sku || '',
                size: item.size || '',
                color: item.color || '',
                qty: item.qty || 0,
                available_qty: item.available_qty ?? item.qty ?? 0,
                price_per_unit: item.price_per_unit || 0,
                unit: item.unit || 'шт',
                photo_thumbnail: item.photo_thumbnail || item.photo_url || '',
                photo_url: item.photo_url || item.photo_thumbnail || '',
            });
        });

        return grouped;
    },

    showHwForm() {
        this._editingHwId = null;
        this._hwFormSource = 'warehouse';
        document.getElementById('hw-form-title').textContent = 'Новая фурнитура';
        document.getElementById('hw-blank-speed').value = '';
        document.getElementById('hw-blank-notes').value = '';
        document.getElementById('hw-blank-name').value = '';
        document.getElementById('hw-blank-price-rub').value = '0';
        document.getElementById('hw-blank-sell').value = '';
        document.getElementById('hw-blank-photo').value = '';
        document.getElementById('hw-blank-wh-id').value = '';
        document.getElementById('hw-blank-china-id').value = '';
        document.getElementById('hw-blank-selected').style.display = 'none';
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
        const src = b.hw_form_source || (b.warehouse_item_id ? 'warehouse' : (b.price_cny > 0 ? 'custom_cny' : 'warehouse'));
        const warehouseSnapshot = src === 'warehouse'
            ? this._getWarehouseHwSnapshot(b.warehouse_item_id, b.notes || '')
            : null;
        const titleName = warehouseSnapshot?.name || b._warehouseName || b.name || '';
        document.getElementById('hw-form-title').textContent = 'Редактировать: ' + titleName;
        document.getElementById('hw-blank-speed').value = b.assembly_speed ? round2(b.assembly_speed / 60) : '';
        document.getElementById('hw-blank-notes').value = warehouseSnapshot?.notes || b.notes || '';
        document.getElementById('hw-blank-name').value = warehouseSnapshot?.name || b.name || '';
        document.getElementById('hw-blank-price-rub').value = warehouseSnapshot?.priceRub ?? (b.price_rub || 0);
        document.getElementById('hw-blank-sell').value = b.sell_price || '';
        document.getElementById('hw-blank-photo').value = src === 'warehouse' ? '' : (b.photo_url || '');
        document.getElementById('hw-blank-wh-id').value = warehouseSnapshot?.warehouseItemId || b.warehouse_item_id || '';
        document.getElementById('hw-blank-china-id').value = b.china_catalog_id || '';

        // Clear delivery dropdowns so they get re-populated
        ['hw-china-delivery', 'hw-custom-delivery'].forEach(ddId => {
            const el = document.getElementById(ddId);
            if (el) el.innerHTML = '';
        });

        this.setHwFormSource(src);

        if (src === 'china') {
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
        const previewName = warehouseSnapshot?.name || b._warehouseName || b.name;
        const previewPrice = warehouseSnapshot?.priceRub ?? (b.price_rub || 0);
        const photoSrc = src === 'warehouse'
            ? (warehouseSnapshot?.photoUrl || b._whPhoto || b.photo_url || '')
            : (b.photo_url || b._whPhoto || '');
        this._showHwSelectedItem(
            previewName,
            previewPrice,
            photoSrc,
            src === 'warehouse' ? this._formatWarehouseHwInfo(warehouseSnapshot) : ''
        );

        document.getElementById('hw-delete-btn').style.display = '';
        document.getElementById('hw-edit-form').style.display = '';
        this.recalcHwCost();
        document.getElementById('hw-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    _showHwSelectedItem(name, priceRub, photoUrl, infoText = '') {
        const block = document.getElementById('hw-blank-selected');
        const nameEl = document.getElementById('hw-blank-selected-name');
        const infoEl = document.getElementById('hw-blank-selected-info');
        const photoEl = document.getElementById('hw-blank-photo-preview');

        nameEl.textContent = name || '';
        infoEl.textContent = infoText || `Цена: ${formatRub(priceRub)} (доставка включена)`;

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
            const details = [
                String(item.sku || '').trim() || 'без артикула',
                item.size,
                item.color,
                formatRub(price),
            ].filter(Boolean).join(' · ');

            html += `<div style="display:flex;gap:8px;align-items:center;padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);"
                      onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
                      onclick="Molds.selectHwWarehouseItem(${item.id})">
                ${photo}
                <div style="flex:1;min-width:0;">
                    <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${this.esc(item.name)}</div>
                    <div style="font-size:10px;color:var(--text-muted);">${details}</div>
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
        const snapshot = this._getWarehouseHwSnapshot(whId, document.getElementById('hw-blank-notes').value);
        if (!snapshot) return;

        document.getElementById('hw-blank-name').value = snapshot.name;
        document.getElementById('hw-blank-price-rub').value = snapshot.priceRub;
        document.getElementById('hw-blank-photo').value = '';
        document.getElementById('hw-blank-wh-id').value = whId;
        document.getElementById('hw-blank-china-id').value = '';
        document.getElementById('hw-blank-notes').value = snapshot.notes;

        this.renderWarehouseHwPicker();
        this._showHwSelectedItem(snapshot.name, snapshot.priceRub, snapshot.photoUrl, this._formatWarehouseHwInfo(snapshot));
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
            html += `<br><span style="color:var(--green);font-weight:700;">Цена без НДС по формуле (40% чистой маржи, −7% налоги от базы, −1% благотворительность с НДС, −6,5% коммерческий с НДС): ${formatRub(formulaSellPrice)}</span>`;
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
        const pickerHost = document.getElementById('mold-hw-warehouse-picker-host');
        if (pickerHost) pickerHost.innerHTML = '';
        this._editingHwId = null;
    },

    async saveHwBlank() {
        const src = this._hwFormSource;
        let name = document.getElementById('hw-blank-name').value.trim();
        let notes = document.getElementById('hw-blank-notes').value.trim();

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
            notes,
            photo_url: document.getElementById('hw-blank-photo').value.trim(),
            hw_form_source: src,
            // China/Custom CNY fields
            price_cny: 0,
            weight_grams: 0,
            delivery_method: '',
            delivery_per_unit: 0,
        };

        if (src === 'warehouse') {
            const snapshot = this._getWarehouseHwSnapshot(blank.warehouse_item_id, notes);
            if (!snapshot) {
                App.toast('Выберите позицию со склада');
                return;
            }
            blank.name = snapshot.name;
            blank.price_rub = snapshot.priceRub;
            blank.photo_url = '';
            blank.notes = snapshot.notes;
            blank.china_catalog_id = null;
        } else if (src === 'china') {
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
            const whItems = await loadWarehouseItems();
            this._warehousePkgItems = (whItems || []).filter(i => i.category === 'packaging');
            this.enrichPkgBlanks();
            this.renderPkgTable();
        } catch(e) {
            console.error('loadPkgTab error:', e);
            document.getElementById('pkg-blanks-container').innerHTML = '<div class="card" style="padding:16px;color:var(--red)">Ошибка: ' + e.message + '</div>';
        }
    },

    enrichPkgBlanks() {
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;

        this._pkgBlanks.forEach(b => {
            const warehouseSnapshot = b.warehouse_item_id
                ? this._getWarehousePkgSnapshot(b.warehouse_item_id, b.notes || '')
                : null;
            const price = warehouseSnapshot ? warehouseSnapshot.priceRub : (b.price_per_unit || 0);
            const delivery = warehouseSnapshot ? 0 : (b.delivery_per_unit || 0);
            const speed = b.assembly_speed || 0;
            const assemblyCost = speed > 0 ? round2((fotPerHour + indirectPerHour) / speed) : 0;
            const totalCost = round2(price + delivery + assemblyCost);
            b._assemblyCost = assemblyCost;
            b._cost = totalCost;
            // Fixed sell price from blank form (fallback to old 40% formula for legacy records).
            const fixedSell = parseFloat(b.sell_price) || 0;
            b._sellPrice = fixedSell > 0 ? fixedSell : (totalCost > 0 ? Math.ceil(totalCost / (1 - 0.40)) : 0);
            b._priceCalc = round2(price);
            b._deliveryCalc = round2(delivery);
            if (warehouseSnapshot) {
                b._warehouseName = warehouseSnapshot.name;
                b._warehouseSku = warehouseSnapshot.sku;
                b._displayNotes = warehouseSnapshot.notes;
                b._whPhoto = warehouseSnapshot.photoUrl;
            } else {
                b._warehouseName = '';
                b._warehouseSku = '';
                b._displayNotes = b.notes || '';
                b._whPhoto = b.photo_url || '';
            }
        });
    },

    renderPkgTable() {
        const container = document.getElementById('pkg-blanks-container');
        if (!this._pkgBlanks.length) {
            container.innerHTML = '<div class="empty-state"><p>Нет упаковки. Нажмите «+ Новый бланк».</p></div>';
            return;
        }

        let html = `<div class="card" style="padding:0;overflow-x:auto;">
            <table style="font-size:12px;white-space:nowrap;border-collapse:collapse;width:100%;">
            <thead><tr style="border-bottom:2px solid var(--border);">
                <th style="width:44px;padding:10px 8px;"></th>
                <th style="min-width:180px;padding:10px 8px;text-align:left;">Упаковка</th>
                <th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:500;">Цена</th>
                <th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:500;">Доставка</th>
                <th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--text-muted);font-weight:500;">Сборка</th>
                <th style="padding:10px 8px;text-align:right;">Себестоимость</th>
                <th style="padding:10px 8px;text-align:right;">Цена продажи</th>
                <th style="width:52px;padding:10px 4px;"></th>
            </tr></thead><tbody>`;

        this._pkgBlanks.forEach(b => {
            const price = b._priceCalc != null ? b._priceCalc : (b.price_per_unit || 0);
            const delivery = b._deliveryCalc != null ? b._deliveryCalc : (b.delivery_per_unit || 0);
            const speedPcsMin = b.assembly_speed ? round2(b.assembly_speed / 60) : 0;
            const displayName = b._warehouseName || b.name;
            const displayNotes = b._displayNotes || b.notes || '';
            const displaySku = b._warehouseSku || '';
            const photoSrc = b._whPhoto || b.photo_url || '';
            const photo = photoSrc
                ? `<img src="${photoSrc.startsWith('data:') ? photoSrc : this.esc(photoSrc)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none'">`
                : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:14px;">📦</span>`;
            const detailBits = [];
            if (speedPcsMin > 0) detailBits.push(speedPcsMin + ' шт/мин');
            if (displaySku) detailBits.push(displaySku);
            if (displayNotes) detailBits.push(displayNotes);

            html += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px;">${photo}</td>
                <td style="padding:8px;">
                    <div style="font-weight:700;font-size:13px;">${this.esc(displayName)}</div>
                    ${detailBits.length ? `<div style="font-size:10px;color:var(--text-muted);margin-top:1px;">${this.esc(detailBits.join(' · '))}</div>` : ''}
                </td>
                <td style="padding:8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(price)}</td>
                <td style="padding:8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(delivery)}</td>
                <td style="padding:8px;text-align:right;font-size:12px;color:var(--text-secondary);">${formatRub(b._assemblyCost)}</td>
                <td style="padding:8px;text-align:right;font-size:14px;font-weight:700;">${formatRub(b._cost)}</td>
                <td style="padding:8px;text-align:right;font-size:14px;font-weight:700;color:var(--green);">${formatRub(b._sellPrice)}</td>
                <td style="padding:8px 4px;">
                    <div style="display:flex;gap:3px;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Molds.editPkgBlank(${b.id})" title="Редактировать">&#9998;</button>
                        <button class="btn-remove" style="font-size:9px;width:22px;height:22px;" onclick="Molds.confirmDeletePkg(${b.id}, '${this.esc(b.name)}')" title="Удалить">&#10005;</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table>';
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;
        html += `<div style="padding:10px 12px;font-size:10px;color:var(--text-muted);border-top:1px solid var(--border);">
            Себестоимость = цена + доставка + (ФОТ ${formatRub(fotPerHour)}/ч + косвенные ${formatRub(round2(indirectPerHour))}/ч) ÷ скорость сборки
        </div></div>`;

        container.innerHTML = html;
    },

    showPkgForm() {
        this._editingPkgId = null;
        document.getElementById('pkg-form-title').textContent = 'Новая упаковка';
        ['pkg-blank-name','pkg-blank-price','pkg-blank-delivery','pkg-blank-speed','pkg-blank-sell','pkg-blank-notes','pkg-blank-photo','pkg-blank-wh-id'].forEach(id => {
            document.getElementById(id).value = '';
        });
        document.getElementById('pkg-blank-selected').style.display = 'none';
        document.getElementById('pkg-blank-selected-name').textContent = '';
        document.getElementById('pkg-blank-selected-info').textContent = '';
        document.getElementById('pkg-blank-photo-preview').style.display = 'none';
        this.renderWarehousePkgPicker();
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
        const warehouseSnapshot = b.warehouse_item_id
            ? this._getWarehousePkgSnapshot(b.warehouse_item_id, b.notes || '')
            : null;
        document.getElementById('pkg-blank-name').value = warehouseSnapshot?.name || b.name || '';
        document.getElementById('pkg-blank-price').value = warehouseSnapshot ? warehouseSnapshot.priceRub : (b.price_per_unit || '');
        document.getElementById('pkg-blank-delivery').value = warehouseSnapshot ? 0 : (b.delivery_per_unit || '');
        document.getElementById('pkg-blank-speed').value = b.assembly_speed ? round2(b.assembly_speed / 60) : '';
        document.getElementById('pkg-blank-sell').value = b.sell_price || '';
        document.getElementById('pkg-blank-notes').value = warehouseSnapshot?.notes || b.notes || '';
        document.getElementById('pkg-blank-photo').value = warehouseSnapshot?.photoUrl || b.photo_url || '';
        document.getElementById('pkg-blank-wh-id').value = warehouseSnapshot?.warehouseItemId || b.warehouse_item_id || '';
        this.renderWarehousePkgPicker();
        if (warehouseSnapshot) {
            document.getElementById('pkg-blank-selected-name').textContent = warehouseSnapshot.name;
            document.getElementById('pkg-blank-selected-info').textContent = this._formatWarehousePkgInfo(warehouseSnapshot);
            const preview = document.getElementById('pkg-blank-photo-preview');
            if (warehouseSnapshot.photoUrl) {
                preview.src = warehouseSnapshot.photoUrl;
                preview.style.display = '';
            } else {
                preview.style.display = 'none';
            }
            document.getElementById('pkg-blank-selected').style.display = '';
        } else {
            this.clearPkgWarehouseSelection();
        }
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
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;
        const pcsPerMin = parseFloat(document.getElementById('pkg-blank-speed').value) || 0;
        const speed = round2(pcsPerMin * 60); // шт/мин -> шт/ч

        if (price <= 0 && delivery <= 0 && speed <= 0) { el.style.display = 'none'; return; }

        const assemblyCost = speed > 0 ? round2((fotPerHour + indirectPerHour) / speed) : 0;
        const totalCost = round2(price + delivery + assemblyCost);
        const fixedSellPrice = parseFloat(document.getElementById('pkg-blank-sell').value) || 0;
        const formulaSellPrice = calcSellByNetMargin40(totalCost, params);

        let html = `<div style="font-weight:700;font-size:13px;margin-bottom:6px;">Себестоимость: ${formatRub(totalCost)}</div>`;
        html += `<div style="color:var(--text-secondary);font-size:11px;line-height:1.7;">`;
        html += `Цена: <b>${formatRub(price)}</b> + Доставка: <b>${formatRub(delivery)}</b><br>`;
        if (speed > 0) {
            html += `Сборка: (ФОТ ${formatRub(fotPerHour)} + Косвенные ${formatRub(round2(indirectPerHour))}) ÷ ${speed} шт/ч (${pcsPerMin} шт/мин) = <b>${formatRub(assemblyCost)}</b><br>`;
        } else {
            html += `Сборка: <span style="color:var(--text-muted)">укажите скорость (шт/мин)</span><br>`;
        }
        html += `Итого себестоимость: <b>${formatRub(totalCost)}</b>`;
        if (formulaSellPrice > 0) {
            html += `<br><span style="color:var(--green);font-weight:700;">Цена без НДС по формуле (40% чистой маржи, −7% налоги от базы, −1% благотворительность с НДС, −6,5% коммерческий с НДС): ${formatRub(formulaSellPrice)}</span>`;
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
        const host = document.getElementById('mold-pkg-warehouse-picker-host');
        if (host) host.innerHTML = '';
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
            assembly_speed: round2((parseFloat(document.getElementById('pkg-blank-speed').value) || 0) * 60),
            sell_price: parseFloat(document.getElementById('pkg-blank-sell').value) || 0,
            notes: document.getElementById('pkg-blank-notes').value.trim(),
            photo_url: document.getElementById('pkg-blank-photo').value.trim(),
            warehouse_item_id: parseInt(document.getElementById('pkg-blank-wh-id').value) || null,
        };

        await savePkgBlank(blank);
        App.toast('Упаковка сохранена');
        this.hidePkgForm();
        await this.loadPkgTab();
    },

    _formatWarehousePkgName(item) {
        if (!item) return '';
        return [item.name, item.size, item.color].filter(Boolean).join(' · ').trim();
    },

    _normalizePkgNotesForWarehouseItem(item, notes) {
        const sku = String(item?.sku || '').trim();
        const raw = String(notes || '').trim();
        if (!sku || !raw) return raw;
        if (raw === sku) return '';
        const parts = raw.split(' + ').map(part => String(part || '').trim()).filter(Boolean);
        if (!parts.length) return '';
        const prefix = parts[0];
        if (prefix === sku) return parts.slice(1).join(' + ').trim();
        if (this._looksLikeWarehouseSku(prefix)) return parts.slice(1).join(' + ').trim();
        return raw;
    },

    _getWarehousePkgSnapshot(warehouseItemId, notes) {
        const itemId = Number(warehouseItemId || 0);
        if (!itemId) return null;
        const item = (this._warehousePkgItems || []).find(w => Number(w.id) === itemId);
        if (!item) return null;
        return {
            item,
            name: this._formatWarehousePkgName(item),
            sku: String(item.sku || '').trim(),
            priceRub: round2(item.price_per_unit || 0),
            photoUrl: item.photo_thumbnail || item.photo_url || '',
            warehouseItemId: item.id,
            notes: this._normalizePkgNotesForWarehouseItem(item, notes),
        };
    },

    _formatWarehousePkgInfo(snapshot) {
        if (!snapshot) return '';
        const parts = [];
        if (snapshot.sku) parts.push(`Артикул: ${snapshot.sku}`);
        parts.push(`Цена: ${formatRub(snapshot.priceRub)} (доставка включена)`);
        return parts.join(' · ');
    },

    async renderWarehousePkgPicker() {
        const container = document.getElementById('mold-pkg-warehouse-picker-host');
        if (!container || typeof Warehouse === 'undefined' || !Warehouse || typeof Warehouse.buildImagePicker !== 'function') return;
        const grouped = await Warehouse.getItemsForPicker();
        const selectedId = document.getElementById('pkg-blank-wh-id')?.value || '';
        container.innerHTML = Warehouse.buildImagePicker(
            'moldpkg-picker-0',
            grouped,
            selectedId,
            'Molds.selectPkgWarehouseItem',
            'packaging',
            { searchPlaceholder: 'Поиск по названию или артикулу...' }
        );
    },

    selectPkgWarehouseItem(_idx, itemId) {
        const normalizedId = Number(itemId || 0);
        if (!normalizedId) return;
        const snapshot = this._getWarehousePkgSnapshot(normalizedId, document.getElementById('pkg-blank-notes').value);
        if (!snapshot) return;
        document.getElementById('pkg-blank-wh-id').value = snapshot.warehouseItemId;
        document.getElementById('pkg-blank-name').value = snapshot.name;
        document.getElementById('pkg-blank-price').value = snapshot.priceRub;
        document.getElementById('pkg-blank-delivery').value = 0;
        document.getElementById('pkg-blank-photo').value = snapshot.photoUrl || '';
        document.getElementById('pkg-blank-notes').value = snapshot.notes;
        document.getElementById('pkg-blank-selected-name').textContent = snapshot.name;
        document.getElementById('pkg-blank-selected-info').textContent = this._formatWarehousePkgInfo(snapshot);
        const preview = document.getElementById('pkg-blank-photo-preview');
        if (snapshot.photoUrl) {
            preview.src = snapshot.photoUrl;
            preview.style.display = '';
        } else {
            preview.style.display = 'none';
        }
        document.getElementById('pkg-blank-selected').style.display = '';
        this.renderWarehousePkgPicker();
        this.recalcPkgCost();
    },

    clearPkgWarehouseSelection() {
        const hidden = document.getElementById('pkg-blank-wh-id');
        if (hidden) hidden.value = '';
        const selected = document.getElementById('pkg-blank-selected');
        if (selected) selected.style.display = 'none';
        const preview = document.getElementById('pkg-blank-photo-preview');
        if (preview) {
            preview.src = '';
            preview.style.display = 'none';
        }
        const info = document.getElementById('pkg-blank-selected-info');
        if (info) info.textContent = '';
        const name = document.getElementById('pkg-blank-selected-name');
        if (name) name.textContent = '';
        this.renderWarehousePkgPicker();
        this.recalcPkgCost();
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

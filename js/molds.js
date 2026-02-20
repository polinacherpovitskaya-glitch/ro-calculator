// =============================================
// Recycle Object — Molds (Справочник молдов)
// Compact table view with full pricing
// =============================================

// Pricing formula for molds page:
// себестоимость → цена = себест / (1 - 0.40 - 0.06 - 0.06) = себест / 0.48
// НДС 5% сверху: цена_с_НДС = цена * 1.05
// 40% чистая прибыль, 6% ОСН, 6% коммерческий отдел

// Молд НЕ делим на тираж заказа — делим на макс. производительность молда
// Макс. производительность = 5000 шт * 0.9 = 4500 шт
const MOLD_MAX_LIFETIME = 4500; // максимальный ресурс молда (шт)

const MOLD_TIERS = [50, 100, 300, 500, 1000, 5000];

function calcMoldTargetPrice(cost) {
    // price = cost / (1 - margin - osn - commercial)
    // margin=0.40, osn=0.06, commercial=0.06
    if (cost <= 0) return { priceNoVat: 0, priceVat: 0 };
    const priceNoVat = round2(cost / (1 - 0.40 - 0.06 - 0.06));
    const priceVat = round2(priceNoVat * 1.05);
    return { priceNoVat, priceVat };
}

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
                const adjustedCost = result.costTotal - result.costMoldAmortization + moldAmortPerUnit;

                const pricing = calcMoldTargetPrice(adjustedCost);

                m.tiers[qty] = {
                    cost: round2(adjustedCost),
                    priceNoVat: pricing.priceNoVat,
                    priceVat: pricing.priceVat,
                    moldAmort: round2(moldAmortPerUnit),
                };
            });

            // Margin at 500 units
            const t500 = m.tiers[500];
            if (t500) {
                const margin = t500.priceNoVat - t500.cost;
                m.margin_500_pct = t500.priceNoVat > 0 ? round2(margin / t500.priceNoVat * 100) : 0;
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
        const category = document.getElementById('molds-filter-category').value;
        const sort = document.getElementById('molds-sort').value;
        const search = (document.getElementById('molds-search').value || '').toLowerCase().trim();

        let filtered = [...this.allMolds];
        if (status) filtered = filtered.filter(m => m.status === status);
        if (category) filtered = filtered.filter(m => m.category === category);
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

    // === COMPACT TABLE VIEW ===
    renderTable(molds) {
        const container = document.getElementById('molds-cards-container');

        if (molds.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>Нет молдов по фильтрам</p></div>';
            return;
        }

        // Build tier headers
        const tierHeaders = MOLD_TIERS.map(q => `<th class="text-right" style="font-size:11px">${q >= 1000 ? (q/1000) + 'K' : q}</th>`).join('');

        let html = `
        <div class="card" style="padding:12px; overflow-x:auto;">
            <table style="font-size:12px; white-space:nowrap;">
                <thead>
                    <tr>
                        <th style="min-width:160px">Молд</th>
                        <th style="width:60px">шт/ч</th>
                        <th style="width:40px">г</th>
                        <th style="width:70px">Молд ₽</th>
                        ${tierHeaders}
                        <th style="width:30px"></th>
                    </tr>
                </thead>
                <tbody>`;

        molds.forEach(m => {
            const statusDot = m.status === 'active' ? 'calculated' : m.status === 'client' ? 'in_production' : 'cancelled';
            const pphDisplay = m.pph_actual
                ? `<strong>${m.pph_actual}</strong><sup style="color:var(--green);font-size:9px">&#10003;</sup>`
                : `${m.pph_min}${m.pph_max !== m.pph_min ? '-' + m.pph_max : ''}`;
            const moldCountBadge = (m.mold_count || 1) > 1 ? ` <sup style="color:var(--orange);font-weight:700">x${m.mold_count}</sup>` : '';

            // Cost row cells
            const costCells = MOLD_TIERS.map(q => {
                const t = m.tiers?.[q];
                return `<td class="text-right" style="font-size:11px;color:var(--text-secondary)">${t ? Math.round(t.cost) : '—'}</td>`;
            }).join('');

            // Price row cells (without VAT)
            const priceCells = MOLD_TIERS.map(q => {
                const t = m.tiers?.[q];
                return `<td class="text-right" style="font-size:12px;font-weight:600">${t ? Math.round(t.priceNoVat) : '—'}</td>`;
            }).join('');

            // Price with VAT row cells
            const priceVatCells = MOLD_TIERS.map(q => {
                const t = m.tiers?.[q];
                return `<td class="text-right" style="font-size:11px;color:var(--green)">${t ? Math.round(t.priceVat) : '—'}</td>`;
            }).join('');

            html += `
                <tr style="border-bottom:2px solid var(--border)">
                    <td rowspan="3" style="vertical-align:top; padding:6px 8px;">
                        <div style="font-weight:700; font-size:13px;"><span class="status-dot ${statusDot}"></span>${this.esc(m.name)}${moldCountBadge}</div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">
                            ${m.category_label} &middot; ${m.complexity_label}
                            ${m.client ? ' &middot; ' + this.esc(m.client) : ''}
                        </div>
                        ${m.notes ? `<div style="font-size:10px; color:var(--text-muted); font-style:italic">${this.esc(m.notes)}</div>` : ''}
                    </td>
                    <td rowspan="3" style="vertical-align:top; font-size:12px; text-align:center">${pphDisplay}</td>
                    <td rowspan="3" style="vertical-align:top; font-size:12px; text-align:center">${m.weight_grams}</td>
                    <td rowspan="3" style="vertical-align:top; font-size:11px; text-align:right">${Math.round(m.cost_rub_calc).toLocaleString('ru-RU')}</td>
                    ${costCells}
                    <td rowspan="3" style="vertical-align:top"><button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px" onclick="Molds.editMold(${m.id})">&#9998;</button></td>
                </tr>
                <tr style="background:var(--bg)">
                    ${priceCells}
                </tr>
                <tr>
                    ${priceVatCells}
                </tr>`;
        });

        html += '</tbody></table>';

        // Legend
        html += `
            <div style="margin-top:10px; font-size:11px; color:var(--text-muted); display:flex; gap:16px; flex-wrap:wrap;">
                <span><span style="color:var(--text-secondary)">&#9644;</span> Себестоимость</span>
                <span><strong>&#9644;</strong> Цена (без НДС)</span>
                <span><span style="color:var(--green)">&#9644;</span> Цена + НДС 5%</span>
                <span>Формула: 40% прибыль + 6% ОСН + 6% коммерч.</span>
                <span>Аморт. молда: на ${MOLD_MAX_LIFETIME} шт (макс. ресурс)</span>
                <span><sup style="color:var(--green)">&#10003;</sup> = факт. скорость</span>
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
        document.getElementById('mold-cny-rate').value = m.cny_rate || 12.5;
        document.getElementById('mold-delivery-cost').value = m.delivery_cost || 8000;
        document.getElementById('mold-cost-rub').value = m.cost_rub_calc || '';
        document.getElementById('mold-count').value = m.mold_count || 1;
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
        document.getElementById('mold-cny-rate').value = 12.5;
        document.getElementById('mold-delivery-cost').value = 8000;
        document.getElementById('mold-count').value = 1;
        document.getElementById('mold-cost-rub').value = '';
    },

    hideForm() {
        document.getElementById('mold-edit-form').style.display = 'none';
        this.editingId = null;
    },

    async saveMold() {
        const name = document.getElementById('mold-name').value.trim();
        if (!name) { App.toast('Введите название молда'); return; }

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
            cny_rate: parseFloat(document.getElementById('mold-cny-rate').value) || 12.5,
            delivery_cost: parseFloat(document.getElementById('mold-delivery-cost').value) || 8000,
            cost_rub: parseFloat(document.getElementById('mold-cost-rub').value) || 0,
            mold_count: parseInt(document.getElementById('mold-count').value) || 1,
            client: document.getElementById('mold-client').value.trim(),
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
        App.toast('Молд сохранен');
        this.hideForm();
        await this.load();
    },

    exportCSV() {
        const tierCols = MOLD_TIERS.flatMap(q => [`Себест. ${q}шт`, `Цена ${q}шт`, `+НДС ${q}шт`]);
        const headers = ['Название', 'Категория', 'Статус', 'Тип', 'Кол-во молдов', 'Молд ₽',
            'Шт/ч план', 'Шт/ч факт', 'Вес г', ...tierCols,
            'Заказов', 'Выпущено'];

        const rows = this.allMolds.map(m => {
            const tierData = MOLD_TIERS.flatMap(q => {
                const t = m.tiers?.[q];
                return [t?.cost || 0, t?.priceNoVat || 0, t?.priceVat || 0];
            });
            return [
                m.name, m.category_label, m.status_label, m.complexity_label, m.mold_count || 1, m.cost_rub_calc,
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

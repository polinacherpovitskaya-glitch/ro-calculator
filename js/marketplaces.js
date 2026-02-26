// =============================================
// Recycle Object — Маркетплейсы
// Сборка наборов и расчёт цены продажи
// =============================================

const Marketplaces = {
    allSets: [],
    editingSetId: null,
    _plasticBlanks: [],
    _hwBlanks: [],
    _pkgBlanks: [],

    // Current set items being edited
    _plasticItems: [],
    _hwItems: [],
    _pkgItems: [],

    async load() {
        try {
            // Load all data in parallel
            const [sets, plasticBlanks, hwBlanks, pkgBlanks] = await Promise.all([
                loadMarketplaceSets(),
                loadMolds(),
                loadHwBlanks(),
                loadPkgBlanks(),
            ]);
            this.allSets = sets;
            this._plasticBlanks = plasticBlanks.filter(m => m.status === 'active');
            this._hwBlanks = hwBlanks;
            this._pkgBlanks = pkgBlanks;

            // Enrich plastic blanks with tier pricing (same as Molds.enrichMolds)
            this._enrichPlasticBlanks();

            this.renderStats();
            this.renderSets();
        } catch(e) {
            console.error('Marketplaces.load error:', e);
        }
    },

    renderStats() {
        const total = this.allSets.length;
        const costs = this.allSets.map(s => s.total_cost || 0).filter(c => c > 0);
        const prices = this.allSets.map(s => s.selling_price || 0).filter(p => p > 0);
        const margins = this.allSets.map(s => s.actual_margin || 0).filter(m => m > 0);

        document.getElementById('mp-total-sets').textContent = total;
        document.getElementById('mp-avg-cost').textContent = costs.length ? formatRub(round2(costs.reduce((a,b) => a+b, 0) / costs.length)) : '0 ₽';
        document.getElementById('mp-avg-price').textContent = prices.length ? formatRub(round2(prices.reduce((a,b) => a+b, 0) / prices.length)) : '0 ₽';
        document.getElementById('mp-avg-margin').textContent = margins.length ? Math.round(margins.reduce((a,b) => a+b, 0) / margins.length) + '%' : '0%';
    },

    renderSets() {
        const container = document.getElementById('mp-sets-container');
        if (!this.allSets.length) {
            container.innerHTML = '<div class="empty-state"><p>Нет наборов. Нажмите «+ Новый набор» чтобы создать.</p></div>';
            return;
        }

        const html = this.allSets.map(s => {
            const cost = s.total_cost || 0;
            const price = s.selling_price || 0;
            const margin = s.actual_margin || 0;
            const qty = s.qty || 500;

            // Summarize items
            const itemNames = [];
            (s.plastic_items || []).forEach(i => itemNames.push(i.name || 'Пластик'));
            (s.hw_items || []).forEach(i => itemNames.push(i.name || 'Фурнитура'));
            const pkgNames = (s.pkg_items || []).map(i => i.name || 'Упаковка');

            return `<div class="card" style="padding:16px;margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                    <div style="flex:1;min-width:200px;">
                        <div style="font-weight:700;font-size:16px;">${this._esc(s.name || 'Набор')}</div>
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">
                            ${itemNames.join(' + ')}${pkgNames.length ? ' · ' + pkgNames.join(', ') : ''} · ${qty} шт
                        </div>
                        <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">
                            Себес: ${formatRub(cost)} · Маржа: ${Math.round(margin)}%
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:11px;color:var(--text-muted);">Цена МП</div>
                        <div style="font-size:24px;font-weight:800;color:var(--green);">${formatRub(price)}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;">
                        <button class="btn btn-sm btn-outline" onclick="Marketplaces.editSet(${s.id})">&#9998;</button>
                        <button class="btn-remove" style="font-size:9px;width:24px;height:24px;" onclick="Marketplaces.confirmDelete(${s.id}, '${this._esc(s.name)}')">&#10005;</button>
                    </div>
                </div>
            </div>`;
        }).join('');

        container.innerHTML = html;
    },

    // ==========================================
    // SET FORM
    // ==========================================

    showSetForm() {
        this.editingSetId = null;
        document.getElementById('mp-form-title').textContent = 'Новый набор';
        document.getElementById('mp-set-name').value = '';
        document.getElementById('mp-set-qty').value = 500;
        document.getElementById('mp-set-commission').value = 46;
        document.getElementById('mp-set-vat').value = 5;
        document.getElementById('mp-set-osn').value = 6;
        document.getElementById('mp-set-commercial').value = 6.5;
        document.getElementById('mp-set-margin').value = 40;
        this._plasticItems = [];
        this._hwItems = [];
        this._pkgItems = [];
        document.getElementById('mp-delete-btn').style.display = 'none';
        document.getElementById('mp-set-form').style.display = '';
        this.renderFormItems();
        this.recalcSet();
    },

    editSet(id) {
        const s = this.allSets.find(x => x.id === id);
        if (!s) return;
        this.editingSetId = id;
        document.getElementById('mp-form-title').textContent = 'Редактировать: ' + (s.name || '');
        document.getElementById('mp-set-name').value = s.name || '';
        document.getElementById('mp-set-qty').value = s.qty || 500;
        document.getElementById('mp-set-commission').value = s.commission || 46;
        document.getElementById('mp-set-vat').value = s.vat || 5;
        document.getElementById('mp-set-osn').value = s.osn || 6;
        document.getElementById('mp-set-commercial').value = s.commercial || 6.5;
        document.getElementById('mp-set-margin').value = s.target_margin || 40;
        this._plasticItems = (s.plastic_items || []).map(i => ({ ...i }));
        this._hwItems = (s.hw_items || []).map(i => ({ ...i }));
        this._pkgItems = (s.pkg_items || []).map(i => ({ ...i }));
        document.getElementById('mp-delete-btn').style.display = '';
        document.getElementById('mp-set-form').style.display = '';
        this.renderFormItems();
        this.recalcSet();
    },

    hideSetForm() {
        document.getElementById('mp-set-form').style.display = 'none';
        this.editingSetId = null;
    },

    // Item management
    addPlasticItem() {
        this._plasticItems.push({ blank_id: null, qty: 1, name: '' });
        this.renderFormItems();
    },

    addHwItem() {
        this._hwItems.push({ blank_id: null, qty: 1, name: '' });
        this.renderFormItems();
    },

    addPkgItem() {
        this._pkgItems.push({ blank_id: null, qty: 1, name: '' });
        this.renderFormItems();
    },

    removePlasticItem(idx) { this._plasticItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },
    removeHwItem(idx) { this._hwItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },
    removePkgItem(idx) { this._pkgItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },

    onPlasticChange(idx, blankId) {
        const b = this._plasticBlanks.find(m => m.id === Number(blankId));
        this._plasticItems[idx].blank_id = Number(blankId);
        this._plasticItems[idx].name = b ? b.name : '';
        this.recalcSet();
    },

    onHwChange(idx, blankId) {
        const b = this._hwBlanks.find(m => m.id === Number(blankId));
        this._hwItems[idx].blank_id = Number(blankId);
        this._hwItems[idx].name = b ? b.name : '';
        this.recalcSet();
    },

    onPkgChange(idx, blankId) {
        const b = this._pkgBlanks.find(m => m.id === Number(blankId));
        this._pkgItems[idx].blank_id = Number(blankId);
        this._pkgItems[idx].name = b ? b.name : '';
        this.recalcSet();
    },

    onItemQtyChange(type, idx, qty) {
        if (type === 'plastic') this._plasticItems[idx].qty = Number(qty) || 1;
        else if (type === 'hw') this._hwItems[idx].qty = Number(qty) || 1;
        else if (type === 'pkg') this._pkgItems[idx].qty = Number(qty) || 1;
        this.recalcSet();
    },

    renderFormItems() {
        // Plastic
        const plasticOpts = this._plasticBlanks.map(b => `<option value="${b.id}">${this._esc(b.name)}</option>`).join('');
        document.getElementById('mp-plastic-items').innerHTML = this._plasticItems.map((item, i) => `
            <div class="form-row" style="margin-bottom:4px;align-items:end;">
                <div class="form-group" style="flex:2;margin:0">
                    <select onchange="Marketplaces.onPlasticChange(${i}, this.value)">
                        <option value="">— Выберите бланк —</option>${plasticOpts}
                    </select>
                </div>
                <div class="form-group" style="flex:0 0 70px;margin:0">
                    <input type="number" min="1" value="${item.qty || 1}" oninput="Marketplaces.onItemQtyChange('plastic',${i},this.value)" placeholder="Кол">
                </div>
                <button class="btn-remove" style="margin-bottom:6px;" onclick="Marketplaces.removePlasticItem(${i})">&#10005;</button>
            </div>
        `).join('');
        // Set selected values
        this._plasticItems.forEach((item, i) => {
            if (item.blank_id) {
                const sel = document.getElementById('mp-plastic-items').querySelectorAll('select')[i];
                if (sel) sel.value = item.blank_id;
            }
        });

        // Hardware
        const hwOpts = this._hwBlanks.map(b => `<option value="${b.id}">${this._esc(b.name)}</option>`).join('');
        document.getElementById('mp-hw-items').innerHTML = this._hwItems.map((item, i) => `
            <div class="form-row" style="margin-bottom:4px;align-items:end;">
                <div class="form-group" style="flex:2;margin:0">
                    <select onchange="Marketplaces.onHwChange(${i}, this.value)">
                        <option value="">— Выберите фурнитуру —</option>${hwOpts}
                    </select>
                </div>
                <div class="form-group" style="flex:0 0 70px;margin:0">
                    <input type="number" min="1" value="${item.qty || 1}" oninput="Marketplaces.onItemQtyChange('hw',${i},this.value)" placeholder="Кол">
                </div>
                <button class="btn-remove" style="margin-bottom:6px;" onclick="Marketplaces.removeHwItem(${i})">&#10005;</button>
            </div>
        `).join('');
        this._hwItems.forEach((item, i) => {
            if (item.blank_id) {
                const sel = document.getElementById('mp-hw-items').querySelectorAll('select')[i];
                if (sel) sel.value = item.blank_id;
            }
        });

        // Packaging
        const pkgOpts = this._pkgBlanks.map(b => `<option value="${b.id}">${this._esc(b.name)}</option>`).join('');
        document.getElementById('mp-pkg-items').innerHTML = this._pkgItems.map((item, i) => `
            <div class="form-row" style="margin-bottom:4px;align-items:end;">
                <div class="form-group" style="flex:2;margin:0">
                    <select onchange="Marketplaces.onPkgChange(${i}, this.value)">
                        <option value="">— Выберите упаковку —</option>${pkgOpts}
                    </select>
                </div>
                <div class="form-group" style="flex:0 0 70px;margin:0">
                    <input type="number" min="1" value="${item.qty || 1}" oninput="Marketplaces.onItemQtyChange('pkg',${i},this.value)" placeholder="Кол">
                </div>
                <button class="btn-remove" style="margin-bottom:6px;" onclick="Marketplaces.removePkgItem(${i})">&#10005;</button>
            </div>
        `).join('');
        this._pkgItems.forEach((item, i) => {
            if (item.blank_id) {
                const sel = document.getElementById('mp-pkg-items').querySelectorAll('select')[i];
                if (sel) sel.value = item.blank_id;
            }
        });
    },

    // ==========================================
    // CALCULATION
    // ==========================================

    recalcSet() {
        const qty = parseInt(document.getElementById('mp-set-qty').value) || 500;
        const commissionPct = parseFloat(document.getElementById('mp-set-commission').value) || 46;
        const vatPct = parseFloat(document.getElementById('mp-set-vat').value) || 5;
        const osnPct = parseFloat(document.getElementById('mp-set-osn').value) || 6;
        const commercialPct = parseFloat(document.getElementById('mp-set-commercial').value) || 6.5;
        const targetMarginPct = parseFloat(document.getElementById('mp-set-margin').value) || 40;

        const params = App.params || {};
        const cnyRate = params.cnyRate || 12.5;
        const fotPerHour = params.fotPerHour || 400;

        let totalCost = 0;

        // Plastic: use enriched mold tiers at qty
        this._plasticItems.forEach(item => {
            if (!item.blank_id) return;
            const mold = this._plasticBlanks.find(m => m.id === item.blank_id);
            if (!mold) return;
            // Enrich if needed
            if (!mold.tiers) {
                // Call Molds.enrichMolds but we can't rely on that here
                // Just approximate cost from basic params
                const pph = mold.pph_actual || ((mold.pph_min || 0) + (mold.pph_max || 0)) / 2 || 20;
                const weight = mold.weight_grams || 10;
                const plasticCostPerHour = (params.plasticPricePerKg || 600) * weight / 1000;
                const costPerUnit = (fotPerHour / pph) + plasticCostPerHour;
                totalCost += costPerUnit * (item.qty || 1);
            } else {
                // Find closest tier
                const tierQty = this._findClosestTier(qty, MOLD_TIERS);
                const tier = mold.tiers[tierQty];
                if (tier) {
                    totalCost += tier.cost * (item.qty || 1);
                }
            }
        });

        // Hardware: material + delivery + assembly FOT
        this._hwItems.forEach(item => {
            if (!item.blank_id) return;
            const hw = this._hwBlanks.find(b => b.id === item.blank_id);
            if (!hw) return;
            const materialCost = (hw.price_cny || 0) * cnyRate + (hw.delivery_per_unit || 0);
            const assemblyCost = (hw.assembly_speed > 0) ? (fotPerHour / hw.assembly_speed) : 0;
            totalCost += (materialCost + assemblyCost) * (item.qty || 1);
        });

        // Packaging: just cost + delivery (no FOT)
        this._pkgItems.forEach(item => {
            if (!item.blank_id) return;
            const pkg = this._pkgBlanks.find(b => b.id === item.blank_id);
            if (!pkg) return;
            totalCost += ((pkg.price_per_unit || 0) + (pkg.delivery_per_unit || 0)) * (item.qty || 1);
        });

        totalCost = round2(totalCost);

        // Selling price formula:
        // sellingPrice = totalCost / ((1 - commission) * (1 - vat) * (1 - osn) * (1 - commercial) * (1 - margin))
        const keepFactor = (1 - commissionPct/100) * (1 - vatPct/100) * (1 - osnPct/100) * (1 - commercialPct/100) * (1 - targetMarginPct/100);
        const sellingPrice = keepFactor > 0 ? Math.ceil(totalCost / keepFactor) : 0;
        const actualMargin = sellingPrice > 0 ? Math.round((sellingPrice * keepFactor / (1 - targetMarginPct/100) * (targetMarginPct/100)) / sellingPrice * 100) : 0;

        // Show result
        const resultBlock = document.getElementById('mp-result-block');
        if (totalCost > 0) {
            resultBlock.style.display = '';
            document.getElementById('mp-calc-cost').textContent = formatRub(totalCost);
            document.getElementById('mp-calc-price').textContent = formatRub(sellingPrice);

            // Details
            const afterCommission = round2(sellingPrice * (1 - commissionPct/100));
            const afterVat = round2(afterCommission * (1 - vatPct/100));
            const afterOsn = round2(afterVat * (1 - osnPct/100));
            const afterCommercial = round2(afterOsn * (1 - commercialPct/100));
            const profit = round2(afterCommercial - totalCost);
            const profitMarginPct = afterCommercial > 0 ? Math.round(profit / afterCommercial * 100) : 0;

            document.getElementById('mp-calc-details').innerHTML = `
                Цена МП: ${formatRub(sellingPrice)}
                → минус комиссия ${commissionPct}%: ${formatRub(afterCommission)}
                → минус НДС ${vatPct}%: ${formatRub(afterVat)}
                → минус ОСН ${osnPct}%: ${formatRub(afterOsn)}
                → минус коммерч. ${commercialPct}%: ${formatRub(afterCommercial)}
                → минус себестоимость: <strong style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'}">прибыль ${formatRub(profit)} (${profitMarginPct}%)</strong>
                · Множитель: ×${round2(sellingPrice / totalCost)}
            `;
        } else {
            resultBlock.style.display = 'none';
        }

        // Store calculated values for saving
        this._lastCalc = { totalCost, sellingPrice, actualMargin: targetMarginPct, qty };
    },

    _findClosestTier(qty, tiers) {
        // Find the tier that's closest to qty
        let closest = tiers[0];
        let minDiff = Math.abs(qty - closest);
        for (const t of tiers) {
            const diff = Math.abs(qty - t);
            if (diff < minDiff) { minDiff = diff; closest = t; }
        }
        return closest;
    },

    // ==========================================
    // SAVE / DELETE
    // ==========================================

    async saveSet() {
        const name = document.getElementById('mp-set-name').value.trim();
        if (!name) { App.toast('Введите название набора'); return; }

        this.recalcSet();

        const mset = {
            id: this.editingSetId || undefined,
            name,
            qty: parseInt(document.getElementById('mp-set-qty').value) || 500,
            commission: parseFloat(document.getElementById('mp-set-commission').value) || 46,
            vat: parseFloat(document.getElementById('mp-set-vat').value) || 5,
            osn: parseFloat(document.getElementById('mp-set-osn').value) || 6,
            commercial: parseFloat(document.getElementById('mp-set-commercial').value) || 6.5,
            target_margin: parseFloat(document.getElementById('mp-set-margin').value) || 40,
            plastic_items: this._plasticItems.filter(i => i.blank_id),
            hw_items: this._hwItems.filter(i => i.blank_id),
            pkg_items: this._pkgItems.filter(i => i.blank_id),
            total_cost: this._lastCalc?.totalCost || 0,
            selling_price: this._lastCalc?.sellingPrice || 0,
            actual_margin: this._lastCalc?.actualMargin || 0,
        };

        await saveMarketplaceSet(mset);
        App.toast('Набор сохранён');
        this.hideSetForm();
        await this.load();
    },

    async deleteSet() {
        if (!this.editingSetId) return;
        if (confirm('Удалить этот набор?')) {
            await deleteMarketplaceSet(this.editingSetId);
            App.toast('Набор удалён');
            this.hideSetForm();
            await this.load();
        }
    },

    async confirmDelete(id, name) {
        if (confirm(`Удалить набор "${name}"?`)) {
            await deleteMarketplaceSet(id);
            App.toast('Удалён');
            await this.load();
        }
    },

    _enrichPlasticBlanks() {
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;

        this._plasticBlanks.forEach(m => {
            if (m.tiers && Object.keys(m.tiers).length > 0) return; // already enriched
            const pMin = m.pph_min || 0;
            const pMax = m.pph_max || 0;
            const pAvg = (pMin > 0 && pMax > 0) ? Math.round((pMin + pMax) / 2) : (pMin || pMax || 0);
            const pph = m.pph_actual || pAvg || 1;
            const weight = m.weight_grams || 0;
            const moldCount = m.mold_count || 1;
            const singleMoldCost = (m.cost_cny || 800) * (m.cny_rate || 12.5) + (m.delivery_cost || 8000);
            const moldAmortPerUnit = (singleMoldCost * moldCount) / MOLD_MAX_LIFETIME;

            m.tiers = {};
            MOLD_TIERS.forEach(qty => {
                const item = {
                    quantity: qty, pieces_per_hour: pph, weight_grams: weight,
                    extra_molds: 0, complex_design: false,
                    is_nfc: m.category === 'nfc', nfc_programming: m.category === 'nfc',
                    hardware_qty: 0, packaging_qty: 0, printing_qty: 0, delivery_included: false,
                };
                const result = calculateItemCost(item, params);
                let adjustedCost = result.costTotal - result.costMoldAmortization + moldAmortPerUnit;

                // Built-in hardware
                if (m.hw_name && m.hw_price_per_unit > 0) {
                    let hwCostPerUnit = m.hw_price_per_unit + (m.hw_delivery_total ? m.hw_delivery_total / qty : 0);
                    if (m.hw_speed > 0) {
                        hwCostPerUnit += (qty / m.hw_speed * (params.wasteFactor || 1.1)) * fotPerHour / qty;
                    }
                    adjustedCost += hwCostPerUnit;
                }

                m.tiers[qty] = { cost: round2(adjustedCost) };
            });
        });
    },

    _esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
    },
};

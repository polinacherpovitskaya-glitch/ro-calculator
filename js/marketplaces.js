// =============================================
// Recycle Object — Маркетплейсы
// Сборка наборов и расчёт цены продажи (1 шт)
// =============================================

const Marketplaces = {
    allSets: [],
    editingSetId: null,
    _plasticBlanks: [],   // enriched molds
    _allWarehouseHw: [],  // warehouse items (all except packaging)
    _allWarehousePkg: [], // warehouse items (packaging only)
    _hwCatalog: [],       // hw_blanks catalog
    _pkgCatalog: [],      // pkg_blanks catalog

    // Current set items being edited
    _plasticItems: [],
    _hwItems: [],
    _pkgItems: [],
    _pendingPhoto: '',

    async load() {
        try {
            const [sets, plasticBlanks, hwCatalog, pkgCatalog, warehouseItems] = await Promise.all([
                loadMarketplaceSets(),
                loadMolds(),
                loadHwBlanks(),
                loadPkgBlanks(),
                loadWarehouseItems(),
            ]);
            this.allSets = sets;
            this._plasticBlanks = plasticBlanks.filter(m => m.status === 'active');
            this._hwCatalog = hwCatalog;
            this._pkgCatalog = pkgCatalog;
            // Split warehouse by category
            this._allWarehouseHw = (warehouseItems || []).filter(i => i.category !== 'packaging');
            this._allWarehousePkg = (warehouseItems || []).filter(i => i.category === 'packaging');

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

    // ==========================================
    // TABLE VIEW — photo, name, cost, MP price
    // ==========================================

    renderSets() {
        const container = document.getElementById('mp-sets-container');
        if (!this.allSets.length) {
            container.innerHTML = '<div class="empty-state"><p>Нет наборов. Нажмите «+ Новый набор» чтобы создать.</p></div>';
            return;
        }

        let html = `<div class="card" style="padding:12px;overflow-x:auto;">
            <table style="font-size:12px;white-space:nowrap;border-collapse:collapse;width:100%;">
            <thead><tr>
                <th style="width:50px;padding:6px;"></th>
                <th style="min-width:200px;padding:6px 8px;text-align:left;">Набор</th>
                <th style="padding:6px 8px;text-align:right;">Себестоимость</th>
                <th style="padding:6px 8px;text-align:right;">Цена МП</th>
                <th style="padding:6px 8px;text-align:right;">Маржа</th>
                <th style="padding:6px 8px;text-align:right;">×</th>
                <th style="width:60px;"></th>
            </tr></thead><tbody>`;

        this.allSets.forEach(s => {
            const cost = s.total_cost || 0;
            const price = s.selling_price || 0;
            const margin = s.actual_margin || 0;
            const mult = cost > 0 ? round2(price / cost) : 0;

            // Summarize composition
            const parts = [];
            (s.plastic_items || []).forEach(i => parts.push(i.name || 'Пластик'));
            (s.hw_items || []).forEach(i => parts.push(i.name || 'Фурнитура'));
            (s.pkg_items || []).forEach(i => parts.push(i.name || 'Упаковка'));

            const photo = s.photo_url
                ? `<img src="${this._esc(s.photo_url)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);" onerror="this.style.display='none'">`
                : `<span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:18px;font-weight:700;color:var(--accent);">${(s.name||'?')[0].toUpperCase()}</span>`;

            html += `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:6px;">${photo}</td>
                <td style="padding:6px 8px;">
                    <div style="font-weight:700;font-size:13px;">${this._esc(s.name || 'Набор')}</div>
                    <div style="font-size:10px;color:var(--text-muted);white-space:normal;max-width:300px;line-height:1.3;">${parts.join(' + ')}</div>
                </td>
                <td style="padding:6px 8px;text-align:right;font-size:13px;color:var(--text-secondary);">${formatRub(cost)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:16px;font-weight:800;color:var(--green);">${formatRub(price)}</td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;">${Math.round(margin)}%</td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;color:var(--text-muted);">×${mult}</td>
                <td style="padding:6px;">
                    <div style="display:flex;gap:4px;">
                        <button class="btn btn-sm btn-outline" style="padding:2px 6px;font-size:10px;" onclick="Marketplaces.editSet(${s.id})">&#9998;</button>
                        <button class="btn-remove" style="font-size:9px;width:24px;height:24px;" onclick="Marketplaces.confirmDelete(${s.id}, '${this._esc(s.name)}')">&#10005;</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        container.innerHTML = html;
    },

    // ==========================================
    // SET FORM
    // ==========================================

    showSetForm() {
        this.editingSetId = null;
        this._pendingPhoto = '';
        document.getElementById('mp-form-title').textContent = 'Новый набор';
        document.getElementById('mp-set-name').value = '';
        document.getElementById('mp-set-commission').value = 46;
        document.getElementById('mp-set-vat').value = 5;
        document.getElementById('mp-set-osn').value = 6;
        document.getElementById('mp-set-commercial').value = 6.5;
        document.getElementById('mp-set-margin').value = 40;
        this._plasticItems = [];
        this._hwItems = [];
        this._pkgItems = [];
        this._updatePhotoPreview('');
        document.getElementById('mp-photo-file').value = '';
        document.getElementById('mp-delete-btn').style.display = 'none';
        document.getElementById('mp-set-form').style.display = '';
        this.renderFormItems();
        this.recalcSet();
        document.getElementById('mp-set-form').scrollIntoView({ behavior: 'smooth' });
    },

    editSet(id) {
        const s = this.allSets.find(x => x.id === id);
        if (!s) return;
        this.editingSetId = id;
        this._pendingPhoto = s.photo_url || '';
        document.getElementById('mp-form-title').textContent = 'Редактировать: ' + (s.name || '');
        document.getElementById('mp-set-name').value = s.name || '';
        document.getElementById('mp-set-commission').value = s.commission || 46;
        document.getElementById('mp-set-vat').value = s.vat || 5;
        document.getElementById('mp-set-osn').value = s.osn || 6;
        document.getElementById('mp-set-commercial').value = s.commercial || 6.5;
        document.getElementById('mp-set-margin').value = s.target_margin || 40;
        this._plasticItems = (s.plastic_items || []).map(i => ({ ...i }));
        this._hwItems = (s.hw_items || []).map(i => ({ ...i }));
        this._pkgItems = (s.pkg_items || []).map(i => ({ ...i }));
        this._updatePhotoPreview(s.photo_url || '');
        document.getElementById('mp-photo-file').value = '';
        document.getElementById('mp-delete-btn').style.display = '';
        document.getElementById('mp-set-form').style.display = '';
        this.renderFormItems();
        this.recalcSet();
        document.getElementById('mp-set-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideSetForm() {
        document.getElementById('mp-set-form').style.display = 'none';
        this.editingSetId = null;
    },

    // ==========================================
    // PHOTO
    // ==========================================

    onPhotoFileChange(input) {
        if (!input.files || !input.files[0]) return;
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) { App.toast('Макс 2MB'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            this._resizeImage(e.target.result, 200, (thumb) => {
                this._pendingPhoto = thumb;
                this._updatePhotoPreview(thumb);
            });
        };
        reader.readAsDataURL(file);
    },

    _resizeImage(dataUrl, maxSize, callback) {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let w = img.width, h = img.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            canvas.width = w; canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            callback(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = dataUrl;
    },

    _updatePhotoPreview(url) {
        const el = document.getElementById('mp-photo-preview');
        if (!el) return;
        if (url) {
            el.innerHTML = `<img src="${this._esc(url)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;" onerror="this.parentNode.innerHTML='&#128247;'">`;
        } else {
            el.innerHTML = '<span style="font-size:24px;color:var(--text-muted)">&#128247;</span>';
        }
    },

    // ==========================================
    // ITEM MANAGEMENT
    // ==========================================

    addPlasticItem() {
        this._plasticItems.push({ blank_id: null, qty: 1, name: '', cost: 0 });
        this.renderFormItems();
    },

    addHwItem() {
        this._hwItems.push({ source: 'catalog', blank_id: null, wh_id: null, qty: 1, name: '', cost_per_unit: 0 });
        this.renderFormItems();
    },

    addPkgItem() {
        this._pkgItems.push({ source: 'catalog', blank_id: null, wh_id: null, qty: 1, name: '', cost_per_unit: 0 });
        this.renderFormItems();
    },

    removePlasticItem(idx) { this._plasticItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },
    removeHwItem(idx) { this._hwItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },
    removePkgItem(idx) { this._pkgItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },

    // ==========================================
    // SEARCHABLE DROPDOWNS
    // ==========================================

    _renderSearchableSelect(containerId, items, selectedId, placeholder, onSelectFn) {
        // items = [{id, name, detail}]
        const uid = containerId + '_' + Math.random().toString(36).slice(2, 6);
        const selected = items.find(i => i.id === selectedId);
        return `
            <div class="mp-searchable" style="position:relative;">
                <input type="text" class="mp-search-input" id="${uid}"
                    value="${selected ? this._esc(selected.name) : ''}"
                    placeholder="${placeholder}"
                    onfocus="Marketplaces._openDropdown('${uid}')"
                    oninput="Marketplaces._filterDropdown('${uid}')">
                <div class="mp-dropdown" id="${uid}_dd" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:200px;overflow-y:auto;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                    ${items.map(i => `<div class="mp-dd-item" data-id="${i.id}" data-name="${this._esc(i.name)}"
                        onclick="${onSelectFn}${i.id}); Marketplaces._closeDropdown('${uid}')"
                        style="padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);"
                        onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background=''">
                        <div style="font-weight:600;">${this._esc(i.name)}</div>
                        ${i.detail ? `<div style="font-size:10px;color:var(--text-muted);">${this._esc(i.detail)}</div>` : ''}
                    </div>`).join('')}
                </div>
            </div>`;
    },

    _openDropdown(uid) {
        const dd = document.getElementById(uid + '_dd');
        if (dd) { dd.style.display = ''; this._filterDropdown(uid); }
        // Close on outside click
        setTimeout(() => {
            const handler = (e) => {
                if (!e.target.closest('.mp-searchable')) {
                    this._closeDropdown(uid);
                    document.removeEventListener('click', handler);
                }
            };
            document.addEventListener('click', handler);
        }, 50);
    },

    _closeDropdown(uid) {
        const dd = document.getElementById(uid + '_dd');
        if (dd) dd.style.display = 'none';
    },

    _filterDropdown(uid) {
        const input = document.getElementById(uid);
        const dd = document.getElementById(uid + '_dd');
        if (!input || !dd) return;
        const search = input.value.toLowerCase().trim();
        dd.querySelectorAll('.mp-dd-item').forEach(el => {
            const name = (el.dataset.name || '').toLowerCase();
            el.style.display = (!search || name.includes(search)) ? '' : 'none';
        });
    },

    // ==========================================
    // RENDER FORM ITEMS
    // ==========================================

    renderFormItems() {
        // Plastic — searchable dropdown from molds
        const plasticList = this._plasticBlanks.map(b => ({
            id: b.id,
            name: b.name,
            detail: b.collection ? b.collection + ' · ' + (b.weight_grams || 0) + 'г' : (b.weight_grams || 0) + 'г',
        }));

        document.getElementById('mp-plastic-items').innerHTML = this._plasticItems.map((item, i) => `
            <div class="form-row" style="margin-bottom:4px;align-items:end;gap:6px;">
                <div class="form-group" style="flex:2;margin:0">
                    ${this._renderSearchableSelect('mp-pl-'+i, plasticList, item.blank_id, 'Поиск бланка...', 'Marketplaces._selectPlastic('+i+',')}
                </div>
                <div class="form-group" style="flex:0 0 55px;margin:0">
                    <input type="number" min="1" value="${item.qty || 1}" oninput="Marketplaces._onQtyChange('plastic',${i},this.value)" style="text-align:center;" title="Кол-во">
                </div>
                <button class="btn-remove" style="margin-bottom:6px;" onclick="Marketplaces.removePlasticItem(${i})">&#10005;</button>
            </div>
        `).join('');

        // Hardware — all warehouse hw + catalog + custom option
        const hwList = [];
        // Catalog items
        this._hwCatalog.forEach(b => hwList.push({ id: b.id, name: b.name, detail: '¥' + (b.price_cny||0) + ' · каталог', _type: 'catalog' }));
        // Warehouse items
        this._allWarehouseHw.forEach(w => hwList.push({ id: 10000 + w.id, name: w.name + (w.size ? ' ' + w.size : '') + (w.color ? ' ' + w.color : ''), detail: formatRub(w.price_per_unit || 0) + '/шт · склад', _type: 'warehouse', _whId: w.id }));

        document.getElementById('mp-hw-items').innerHTML = this._hwItems.map((item, i) => {
            const isCustom = item.source === 'custom';
            return `
            <div style="margin-bottom:6px;padding:6px;background:var(--bg);border-radius:6px;">
                <div class="form-row" style="margin-bottom:2px;align-items:end;gap:6px;">
                    <div class="form-group" style="flex:2;margin:0">
                        ${isCustom
                            ? `<input type="text" value="${this._esc(item.name)}" placeholder="Название" oninput="Marketplaces._hwItems[${i}].name=this.value; Marketplaces.recalcSet()">`
                            : this._renderSearchableSelect('mp-hw-'+i, hwList, item.source === 'warehouse' ? 10000 + (item.wh_id||0) : item.blank_id, 'Поиск фурнитуры...', 'Marketplaces._selectHw('+i+',')
                        }
                    </div>
                    ${isCustom ? `
                    <div class="form-group" style="flex:0 0 80px;margin:0">
                        <input type="number" min="0" step="0.1" value="${item.cost_per_unit || ''}" placeholder="₽/шт" oninput="Marketplaces._hwItems[${i}].cost_per_unit=parseFloat(this.value)||0; Marketplaces.recalcSet()">
                    </div>` : ''}
                    <div class="form-group" style="flex:0 0 55px;margin:0">
                        <input type="number" min="1" value="${item.qty || 1}" oninput="Marketplaces._onQtyChange('hw',${i},this.value)" style="text-align:center;" title="Кол-во">
                    </div>
                    <button class="btn-remove" style="margin-bottom:6px;" onclick="Marketplaces.removeHwItem(${i})">&#10005;</button>
                </div>
                <div style="display:flex;gap:6px;font-size:10px;">
                    <label style="cursor:pointer;color:${!isCustom ? 'var(--accent)' : 'var(--text-muted)'};" onclick="Marketplaces._setHwSource(${i},'catalog')">Каталог/Склад</label>
                    <label style="cursor:pointer;color:${isCustom ? 'var(--accent)' : 'var(--text-muted)'};" onclick="Marketplaces._setHwSource(${i},'custom')">Кастомная</label>
                </div>
            </div>`;
        }).join('');

        // Packaging — all warehouse pkg + catalog + custom
        const pkgList = [];
        this._pkgCatalog.forEach(b => pkgList.push({ id: b.id, name: b.name, detail: formatRub(b.price_per_unit || 0) + '/шт · каталог', _type: 'catalog' }));
        this._allWarehousePkg.forEach(w => pkgList.push({ id: 10000 + w.id, name: w.name + (w.size ? ' ' + w.size : ''), detail: formatRub(w.price_per_unit || 0) + '/шт · склад', _type: 'warehouse', _whId: w.id }));

        document.getElementById('mp-pkg-items').innerHTML = this._pkgItems.map((item, i) => {
            const isCustom = item.source === 'custom';
            return `
            <div style="margin-bottom:6px;padding:6px;background:var(--bg);border-radius:6px;">
                <div class="form-row" style="margin-bottom:2px;align-items:end;gap:6px;">
                    <div class="form-group" style="flex:2;margin:0">
                        ${isCustom
                            ? `<input type="text" value="${this._esc(item.name)}" placeholder="Название" oninput="Marketplaces._pkgItems[${i}].name=this.value; Marketplaces.recalcSet()">`
                            : this._renderSearchableSelect('mp-pkg-'+i, pkgList, item.source === 'warehouse' ? 10000 + (item.wh_id||0) : item.blank_id, 'Поиск упаковки...', 'Marketplaces._selectPkg('+i+',')
                        }
                    </div>
                    ${isCustom ? `
                    <div class="form-group" style="flex:0 0 80px;margin:0">
                        <input type="number" min="0" step="0.1" value="${item.cost_per_unit || ''}" placeholder="₽/шт" oninput="Marketplaces._pkgItems[${i}].cost_per_unit=parseFloat(this.value)||0; Marketplaces.recalcSet()">
                    </div>` : ''}
                    <div class="form-group" style="flex:0 0 55px;margin:0">
                        <input type="number" min="1" value="${item.qty || 1}" oninput="Marketplaces._onQtyChange('pkg',${i},this.value)" style="text-align:center;" title="Кол-во">
                    </div>
                    <button class="btn-remove" style="margin-bottom:6px;" onclick="Marketplaces.removePkgItem(${i})">&#10005;</button>
                </div>
                <div style="display:flex;gap:6px;font-size:10px;">
                    <label style="cursor:pointer;color:${!isCustom ? 'var(--accent)' : 'var(--text-muted)'};" onclick="Marketplaces._setPkgSource(${i},'catalog')">Каталог/Склад</label>
                    <label style="cursor:pointer;color:${isCustom ? 'var(--accent)' : 'var(--text-muted)'};" onclick="Marketplaces._setPkgSource(${i},'custom')">Кастомная</label>
                </div>
            </div>`;
        }).join('');
    },

    // Selection callbacks
    _selectPlastic(idx, blankId) {
        const b = this._plasticBlanks.find(m => m.id === Number(blankId));
        this._plasticItems[idx].blank_id = Number(blankId);
        this._plasticItems[idx].name = b ? b.name : '';
        this.recalcSet();
    },

    _selectHw(idx, listId) {
        const item = this._hwItems[idx];
        if (listId >= 10000) {
            // Warehouse item
            const wh = this._allWarehouseHw.find(w => w.id === (listId - 10000));
            if (wh) {
                item.source = 'warehouse';
                item.wh_id = wh.id;
                item.blank_id = null;
                item.name = wh.name + (wh.size ? ' ' + wh.size : '') + (wh.color ? ' ' + wh.color : '');
                item.cost_per_unit = wh.price_per_unit || 0;
            }
        } else {
            // Catalog item
            const hw = this._hwCatalog.find(b => b.id === listId);
            if (hw) {
                item.source = 'catalog';
                item.blank_id = hw.id;
                item.wh_id = null;
                item.name = hw.name;
                item.cost_per_unit = 0; // will be calculated
            }
        }
        this.recalcSet();
    },

    _selectPkg(idx, listId) {
        const item = this._pkgItems[idx];
        if (listId >= 10000) {
            const wh = this._allWarehousePkg.find(w => w.id === (listId - 10000));
            if (wh) {
                item.source = 'warehouse';
                item.wh_id = wh.id;
                item.blank_id = null;
                item.name = wh.name + (wh.size ? ' ' + wh.size : '');
                item.cost_per_unit = wh.price_per_unit || 0;
            }
        } else {
            const pkg = this._pkgCatalog.find(b => b.id === listId);
            if (pkg) {
                item.source = 'catalog';
                item.blank_id = pkg.id;
                item.wh_id = null;
                item.name = pkg.name;
                item.cost_per_unit = (pkg.price_per_unit || 0) + (pkg.delivery_per_unit || 0);
            }
        }
        this.recalcSet();
    },

    _setHwSource(idx, source) {
        this._hwItems[idx].source = source;
        if (source === 'custom') { this._hwItems[idx].blank_id = null; this._hwItems[idx].wh_id = null; }
        this.renderFormItems();
    },

    _setPkgSource(idx, source) {
        this._pkgItems[idx].source = source;
        if (source === 'custom') { this._pkgItems[idx].blank_id = null; this._pkgItems[idx].wh_id = null; }
        this.renderFormItems();
    },

    _onQtyChange(type, idx, val) {
        const q = Number(val) || 1;
        if (type === 'plastic') this._plasticItems[idx].qty = q;
        else if (type === 'hw') this._hwItems[idx].qty = q;
        else if (type === 'pkg') this._pkgItems[idx].qty = q;
        this.recalcSet();
    },

    // ==========================================
    // CALCULATION (per 1 unit of set)
    // ==========================================

    recalcSet() {
        const commissionPct = parseFloat(document.getElementById('mp-set-commission')?.value) || 46;
        const vatPct = parseFloat(document.getElementById('mp-set-vat')?.value) || 5;
        const osnPct = parseFloat(document.getElementById('mp-set-osn')?.value) || 6;
        const commercialPct = parseFloat(document.getElementById('mp-set-commercial')?.value) || 6.5;
        const targetMarginPct = parseFloat(document.getElementById('mp-set-margin')?.value) || 40;

        const params = App.params || {};
        const cnyRate = params.cnyRate || 12.5;
        const fotPerHour = params.fotPerHour || 400;

        let totalCost = 0;

        // Plastic: use enriched tier cost at 500 (standard production batch)
        this._plasticItems.forEach(item => {
            if (!item.blank_id) return;
            const mold = this._plasticBlanks.find(m => m.id === item.blank_id);
            if (!mold || !mold.tiers) return;
            const tier = mold.tiers[500] || mold.tiers[300] || mold.tiers[1000];
            if (tier) totalCost += tier.cost * (item.qty || 1);
        });

        // Hardware
        this._hwItems.forEach(item => {
            if (item.source === 'custom') {
                totalCost += (item.cost_per_unit || 0) * (item.qty || 1);
            } else if (item.source === 'warehouse' && item.wh_id) {
                totalCost += (item.cost_per_unit || 0) * (item.qty || 1);
            } else if (item.blank_id) {
                const hw = this._hwCatalog.find(b => b.id === item.blank_id);
                if (hw) {
                    const materialCost = (hw.price_cny || 0) * cnyRate + (hw.delivery_per_unit || 0);
                    const assemblyCost = (hw.assembly_speed > 0) ? (fotPerHour / hw.assembly_speed) : 0;
                    totalCost += (materialCost + assemblyCost) * (item.qty || 1);
                }
            }
        });

        // Packaging
        this._pkgItems.forEach(item => {
            if (item.source === 'custom') {
                totalCost += (item.cost_per_unit || 0) * (item.qty || 1);
            } else if (item.source === 'warehouse' && item.wh_id) {
                totalCost += (item.cost_per_unit || 0) * (item.qty || 1);
            } else if (item.blank_id) {
                const pkg = this._pkgCatalog.find(b => b.id === item.blank_id);
                if (pkg) {
                    totalCost += ((pkg.price_per_unit || 0) + (pkg.delivery_per_unit || 0)) * (item.qty || 1);
                }
            }
        });

        totalCost = round2(totalCost);

        // Selling price: cost / ((1-mp) * (1-vat) * (1-osn) * (1-comm) * (1-margin))
        const keepFactor = (1 - commissionPct/100) * (1 - vatPct/100) * (1 - osnPct/100) * (1 - commercialPct/100) * (1 - targetMarginPct/100);
        const sellingPrice = keepFactor > 0 ? Math.ceil(totalCost / keepFactor) : 0;

        // Show result
        const resultBlock = document.getElementById('mp-result-block');
        if (totalCost > 0) {
            resultBlock.style.display = '';
            document.getElementById('mp-calc-cost').textContent = formatRub(totalCost);
            document.getElementById('mp-calc-price').textContent = formatRub(sellingPrice);

            const afterCommission = round2(sellingPrice * (1 - commissionPct/100));
            const afterVat = round2(afterCommission * (1 - vatPct/100));
            const afterOsn = round2(afterVat * (1 - osnPct/100));
            const afterCommercial = round2(afterOsn * (1 - commercialPct/100));
            const profit = round2(afterCommercial - totalCost);
            const profitPct = afterCommercial > 0 ? Math.round(profit / afterCommercial * 100) : 0;

            document.getElementById('mp-calc-details').innerHTML = `
                ${formatRub(sellingPrice)}
                → −МП ${commissionPct}%: ${formatRub(afterCommission)}
                → −НДС ${vatPct}%: ${formatRub(afterVat)}
                → −ОСН ${osnPct}%: ${formatRub(afterOsn)}
                → −коммерч. ${commercialPct}%: ${formatRub(afterCommercial)}
                → −себес: <strong style="color:${profit >= 0 ? 'var(--green)' : 'var(--red)'}">чистыми ${formatRub(profit)} (${profitPct}%)</strong>
                · ×${round2(sellingPrice / totalCost)}
            `;
        } else {
            resultBlock.style.display = 'none';
        }

        this._lastCalc = { totalCost, sellingPrice, actualMargin: targetMarginPct };
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
            photo_url: this._pendingPhoto || '',
            commission: parseFloat(document.getElementById('mp-set-commission').value) || 46,
            vat: parseFloat(document.getElementById('mp-set-vat').value) || 5,
            osn: parseFloat(document.getElementById('mp-set-osn').value) || 6,
            commercial: parseFloat(document.getElementById('mp-set-commercial').value) || 6.5,
            target_margin: parseFloat(document.getElementById('mp-set-margin').value) || 40,
            plastic_items: this._plasticItems.filter(i => i.blank_id),
            hw_items: this._hwItems.filter(i => i.blank_id || i.wh_id || (i.source === 'custom' && i.name)),
            pkg_items: this._pkgItems.filter(i => i.blank_id || i.wh_id || (i.source === 'custom' && i.name)),
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

    // ==========================================
    // HELPERS
    // ==========================================

    _enrichPlasticBlanks() {
        const params = App.params || {};
        const fotPerHour = params.fotPerHour || 400;

        this._plasticBlanks.forEach(m => {
            if (m.tiers && Object.keys(m.tiers).length > 0) return;
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
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
};

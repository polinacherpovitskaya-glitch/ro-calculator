// =============================================
// Recycle Object — B2C продажи
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
    _colors: [],          // colors directory

    // Current set items being edited
    _plasticItems: [],
    _hwItems: [],
    _pkgItems: [],
    _productionSelection: [],
    _pendingPhoto: '',

    async load() {
        try {
            const [sets, plasticBlanks, hwCatalog, pkgCatalog, warehouseItems, colors] = await Promise.all([
                loadMarketplaceSets(),
                loadMolds(),
                loadHwBlanks(),
                loadPkgBlanks(),
                loadWarehouseItems(),
                loadColors(),
            ]);
            this.allSets = sets;
            this._plasticBlanks = plasticBlanks.filter(m => m.status === 'active');
            this._hwCatalog = hwCatalog;
            this._pkgCatalog = pkgCatalog;
            this._colors = colors || [];
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
        const prices = this.allSets.map(s => (s.mp_actual_price || s.selling_price || 0)).filter(p => p > 0);
        const shopPrices = this.allSets.map(s => (s.shop_actual_price || s.shop_suggested_price || 0)).filter(p => p > 0);

        document.getElementById('mp-total-sets').textContent = total;
        document.getElementById('mp-avg-cost').textContent = costs.length ? formatRub(round2(costs.reduce((a,b) => a+b, 0) / costs.length)) : '0 ₽';
        document.getElementById('mp-avg-price').textContent = prices.length ? formatRub(round2(prices.reduce((a,b) => a+b, 0) / prices.length)) : '0 ₽';
        const shopEl = document.getElementById('mp-avg-shop-price');
        if (shopEl) shopEl.textContent = shopPrices.length ? formatRub(round2(shopPrices.reduce((a,b) => a+b, 0) / shopPrices.length)) : '0 ₽';
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

        let html = '';
        this.allSets.forEach(s => {
            const bd = this._calcSetBreakdown(s);
            const cost = bd.totalCost;
            const mpPrice = s.mp_actual_price || s.selling_price || 0;
            const shopPrice = s.shop_actual_price || s.shop_suggested_price || 0;
            const mpMargin = parseFloat(s.mp_margin_actual) || 0;
            const shopMargin = parseFloat(s.shop_margin_actual) || 0;

            // Composition
            const parts = [];
            (s.plastic_items || []).forEach(i => parts.push(i.name || 'Пластик'));
            (s.hw_items || []).forEach(i => parts.push(i.name || 'Фурнитура'));
            (s.pkg_items || []).forEach(i => parts.push(i.name || 'Упаковка'));

            const photo = s.photo_url
                ? `<img src="${this._esc(s.photo_url)}" style="width:80px;height:80px;object-fit:cover;border-radius:10px;border:1px solid var(--border);" onerror="this.style.display='none'">`
                : `<span style="width:80px;height:80px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:10px;font-size:28px;font-weight:700;color:var(--accent);">${(s.name||'?')[0].toUpperCase()}</span>`;

            // Cost breakdown lines
            const breakdownParts = [];
            if (bd.castingCost > 0) breakdownParts.push('Выливание (материал+молд) ' + formatRub(bd.castingCost));
            if (bd.hwMaterialCost > 0) breakdownParts.push('Фурнитура (материалы) ' + formatRub(bd.hwMaterialCost));
            if (bd.pkgMaterialCost > 0) breakdownParts.push('Упаковка (материалы) ' + formatRub(bd.pkgMaterialCost));
            if (bd.fotCost > 0) breakdownParts.push('ФОТ выливания ' + formatRub(bd.fotCost));
            if (bd.assemblyCost > 0) breakdownParts.push('ФОТ сборки ' + formatRub(bd.assemblyCost));
            if (bd.indirectCastingCost > 0) breakdownParts.push('Косвенные выливания ' + formatRub(bd.indirectCastingCost));
            if (bd.indirectAssemblyCost > 0) breakdownParts.push('Косвенные сборки ' + formatRub(bd.indirectAssemblyCost));

            html += `<div class="card" style="padding:14px;margin-bottom:8px;display:flex;align-items:center;gap:14px;">
                <div style="flex-shrink:0;">${photo}</div>
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;font-size:15px;margin-bottom:2px;">${this._esc(s.name || 'Набор')}</div>
                    <div style="font-size:11px;color:var(--text-muted);line-height:1.3;margin-bottom:6px;">${parts.join(' + ')}</div>
                    <div style="font-size:12px;color:var(--text-secondary);">
                        <span style="font-weight:600;">Себестоимость: ${formatRub(cost)}</span>
                    </div>
                    ${(s.plastic_items || []).some(i => Array.isArray(i.colors) && i.colors.length) ? `
                        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.4;">
                            Цвета: ${(s.plastic_items || []).map(i => {
                                const cs = Array.isArray(i.colors) ? i.colors : [];
                                if (!cs.length) return '';
                                const label = cs.map(c => `${c.number || ''} ${c.name || ''}`.trim()).filter(Boolean).join(' + ');
                                return `${this._esc(i.name || 'Элемент')}: ${this._esc(label)}`;
                            }).filter(Boolean).join(' · ')}
                        </div>
                    ` : ''}
                    ${breakdownParts.length > 0 ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;line-height:1.4;">${breakdownParts.join(' · ')}</div>` : ''}
                </div>
                <div style="text-align:right;flex-shrink:0;min-width:170px;">
                    <div style="font-size:11px;color:var(--text-muted);">Маркетплейс</div>
                    <div style="font-size:22px;font-weight:800;color:var(--green);line-height:1.1;">${formatRub(mpPrice)}</div>
                    <div style="font-size:10px;color:${mpMargin >= 40 ? 'var(--green)' : mpMargin >= 20 ? 'var(--yellow)' : 'var(--red)'};margin-top:2px;">чистая маржа ${Math.round(mpMargin)}%</div>
                    <div style="font-size:11px;color:var(--text-muted);margin-top:6px;">Интернет-магазин</div>
                    <div style="font-size:20px;font-weight:800;color:var(--accent);line-height:1.1;">${formatRub(shopPrice)}</div>
                    <div style="font-size:10px;color:${shopMargin >= 40 ? 'var(--green)' : shopMargin >= 20 ? 'var(--yellow)' : 'var(--red)'};margin-top:2px;">чистая маржа ${Math.round(shopMargin)}%</div>
                </div>
                <div style="flex-shrink:0;display:flex;flex-direction:column;gap:4px;">
                    <button class="btn btn-sm btn-outline" style="padding:4px 8px;font-size:11px;" onclick="Marketplaces.editSet(${s.id})">&#9998;</button>
                    <button class="btn-remove" style="font-size:10px;width:26px;height:26px;" onclick="Marketplaces.confirmDelete(${s.id}, '${this._esc(s.name)}')">&#10005;</button>
                </div>
            </div>`;
        });

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
        document.getElementById('mp-set-acquiring').value = 4;
        document.getElementById('mp-set-shop-multiplier').value = 3;
        document.getElementById('mp-set-margin').value = 40;
        document.getElementById('mp-set-price-manual').value = '';
        document.getElementById('mp-set-shop-price-manual').value = '';
        this._plasticItems = [];
        this._hwItems = [];
        this._pkgItems = [];
        this.hideProductionBuilder();
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
        document.getElementById('mp-set-acquiring').value = s.acquiring || 4;
        document.getElementById('mp-set-shop-multiplier').value = s.shop_multiplier || 3;
        document.getElementById('mp-set-margin').value = s.target_margin || 40;
        document.getElementById('mp-set-price-manual').value = s.mp_actual_price || s.selling_price || '';
        document.getElementById('mp-set-shop-price-manual').value = s.shop_actual_price || s.shop_suggested_price || '';
        this._plasticItems = (s.plastic_items || []).map(i => ({ ...i, colors: Array.isArray(i.colors) ? i.colors : [] }));
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
        this._plasticItems.push({ blank_id: null, qty: 1, name: '', cost: 0, color_notes: '', colors: [] });
        this.renderFormItems();
    },

    addHwItem() {
        this._hwItems.push({ source: 'catalog', blank_id: null, wh_id: null, qty: 1, name: '', cost_per_unit: 0, assembly_speed: 0 });
        this.renderFormItems();
    },

    addPkgItem() {
        this._pkgItems.push({ source: 'catalog', blank_id: null, wh_id: null, qty: 1, name: '', cost_per_unit: 0, assembly_speed: 0 });
        this.renderFormItems();
    },

    removePlasticItem(idx) { this._plasticItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },
    removeHwItem(idx) { this._hwItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },
    removePkgItem(idx) { this._pkgItems.splice(idx, 1); this.renderFormItems(); this.recalcSet(); },

    // ==========================================
    // SEARCHABLE DROPDOWNS
    // ==========================================

    _renderSearchableSelect(containerId, items, selectedId, placeholder, onSelectFn) {
        // items = [{id, name, detail, photo?}]
        const uid = containerId + '_' + Math.random().toString(36).slice(2, 6);
        const selected = items.find(i => i.id === selectedId);
        return `
            <div class="mp-searchable" style="position:relative;">
                <input type="text" class="mp-search-input" id="${uid}"
                    value="${selected ? this._esc(selected.name) : ''}"
                    placeholder="${placeholder}"
                    onfocus="Marketplaces._openDropdown('${uid}')"
                    oninput="Marketplaces._filterDropdown('${uid}')">
                <div class="mp-dropdown" id="${uid}_dd" style="display:none;position:absolute;top:100%;left:0;right:0;max-height:260px;overflow-y:auto;background:var(--card-bg);border:1px solid var(--border);border-radius:8px;z-index:100;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
                    ${items.map(i => {
                        const photoHtml = i.photo
                            ? `<img src="${this._esc(i.photo)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;flex-shrink:0;border:1px solid var(--border);" onerror="this.style.display='none'">`
                            : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;flex-shrink:0;font-size:12px;color:var(--text-muted);">?</span>`;
                        return `<div class="mp-dd-item" data-id="${i.id}" data-name="${this._esc(i.name)}"
                        onclick="${onSelectFn}${i.id}); Marketplaces._closeDropdown('${uid}')"
                        style="padding:6px 10px;cursor:pointer;font-size:12px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:8px;"
                        onmouseover="this.style.background='var(--accent-light)'" onmouseout="this.style.background=''">
                        ${photoHtml}
                        <div style="min-width:0;">
                            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(i.name)}</div>
                            ${i.detail ? `<div style="font-size:10px;color:var(--text-muted);">${this._esc(i.detail)}</div>` : ''}
                        </div>
                    </div>`;
                    }).join('')}
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
            photo: b.photo_url || '',
        }));

        document.getElementById('mp-plastic-items').innerHTML = this._plasticItems.map((item, i) => `
            <div class="form-row" style="margin-bottom:4px;align-items:end;gap:6px;">
                <div class="form-group" style="flex:2;margin:0">
                    ${this._renderSearchableSelect('mp-pl-'+i, plasticList, item.blank_id, 'Поиск бланка...', 'Marketplaces._selectPlastic('+i+',')}
                </div>
                <div class="form-group" style="flex:1.15;margin:0">
                    <input type="text" value="${this._esc(item.color_notes || '')}" placeholder="Цвет/микс (напр. белый+синий)"
                        oninput="Marketplaces._plasticItems[${i}].color_notes=this.value">
                </div>
                <div class="form-group" style="flex:1.25;margin:0">
                    ${this._renderPlasticColorsPicker(i, item)}
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
        this._hwCatalog.forEach(b => {
            const sell = parseFloat(b.sell_price) || 0;
            const detail = sell > 0
                ? `прайс ${formatRub(sell)} · каталог`
                : `${formatRub(b.price_rub || 0)} себес · каталог`;
            hwList.push({ id: b.id, name: b.name, detail, photo: b.photo_url || b._whPhoto || '', _type: 'catalog' });
        });
        // Warehouse items
        this._allWarehouseHw.forEach(w => hwList.push({ id: 10000 + w.id, name: w.name + (w.size ? ' ' + w.size : '') + (w.color ? ' ' + w.color : ''), detail: formatRub(w.price_per_unit || 0) + '/шт · склад', photo: w.photo_thumbnail || w.photo_url || '', _type: 'warehouse', _whId: w.id }));

        document.getElementById('mp-hw-items').innerHTML = this._hwItems.map((item, i) => {
            const isCustom = item.source === 'custom';
            const speedMin = item.assembly_speed > 0 ? round2(item.assembly_speed / 60) : '';
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
                    <div class="form-group" style="flex:0 0 88px;margin:0">
                        <input type="number" min="0" step="0.1" value="${speedMin}" placeholder="шт/мин" title="Сборка, шт/мин"
                            oninput="Marketplaces._hwItems[${i}].assembly_speed=round2((parseFloat(this.value)||0)*60); Marketplaces.recalcSet()">
                    </div>
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
        this._pkgCatalog.forEach(b => {
            const sell = parseFloat(b.sell_price) || 0;
            const detail = sell > 0
                ? `прайс ${formatRub(sell)} · каталог`
                : `${formatRub((b.price_per_unit || 0) + (b.delivery_per_unit || 0))} себес · каталог`;
            pkgList.push({ id: b.id, name: b.name, detail, photo: b.photo_url || '', _type: 'catalog' });
        });
        this._allWarehousePkg.forEach(w => pkgList.push({ id: 10000 + w.id, name: w.name + (w.size ? ' ' + w.size : ''), detail: formatRub(w.price_per_unit || 0) + '/шт · склад', photo: w.photo_thumbnail || w.photo_url || '', _type: 'warehouse', _whId: w.id }));

        document.getElementById('mp-pkg-items').innerHTML = this._pkgItems.map((item, i) => {
            const isCustom = item.source === 'custom';
            const speedMin = item.assembly_speed > 0 ? round2(item.assembly_speed / 60) : '';
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
                    <div class="form-group" style="flex:0 0 88px;margin:0">
                        <input type="number" min="0" step="0.1" value="${speedMin}" placeholder="шт/мин" title="Сборка, шт/мин"
                            oninput="Marketplaces._pkgItems[${i}].assembly_speed=round2((parseFloat(this.value)||0)*60); Marketplaces.recalcSet()">
                    </div>
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
        if (!Array.isArray(this._plasticItems[idx].colors)) this._plasticItems[idx].colors = [];
        this.recalcSet();
    },

    _renderPlasticColorsPicker(idx, item) {
        const selected = Array.isArray(item.colors) ? item.colors : [];
        const options = (this._colors || []).map(c => {
            const sel = selected.some(sc => Number(sc.id) === Number(c.id));
            const label = `${c.number || ''} ${c.name || ''}`.trim();
            return `<option value="${c.id}" ${sel ? 'selected' : ''}>${this._esc(label)}</option>`;
        }).join('');
        const chips = selected.length
            ? selected.map(sc => this._esc(`${sc.number || ''} ${sc.name || ''}`.trim())).join(' · ')
            : 'не выбрано';
        return `
            <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:2px;">Цвета</label>
            <select multiple size="3" onchange="Marketplaces._onPlasticColorsChange(${idx}, this)" style="width:100%;padding:4px;border:1px solid var(--border);border-radius:6px;font-size:11px;background:var(--card-bg);">
                ${options}
            </select>
            <div style="margin-top:2px;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${chips}</div>
        `;
    },

    _onPlasticColorsChange(idx, selectEl) {
        const selectedIds = Array.from(selectEl.selectedOptions || []).map(o => Number(o.value));
        this._plasticItems[idx].colors = selectedIds.map(id => {
            const c = (this._colors || []).find(x => Number(x.id) === Number(id));
            return c ? { id: c.id, number: c.number || '', name: c.name || '' } : null;
        }).filter(Boolean);
        this.renderFormItems();
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
                const linkedBlank = this._hwCatalog.find(b => Number(b.warehouse_item_id) === Number(wh.id));
                item.assembly_speed = linkedBlank?.assembly_speed || 0;
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
                item.assembly_speed = hw.assembly_speed || 0;
            }
        }
        this.renderFormItems();
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
                const linkedBlank = this._pkgCatalog.find(b => Number(b.warehouse_item_id) === Number(wh.id));
                item.assembly_speed = linkedBlank?.assembly_speed || 0;
            }
        } else {
            const pkg = this._pkgCatalog.find(b => b.id === listId);
            if (pkg) {
                item.source = 'catalog';
                item.blank_id = pkg.id;
                item.wh_id = null;
                item.name = pkg.name;
                item.cost_per_unit = (pkg.price_per_unit || 0) + (pkg.delivery_per_unit || 0);
                item.assembly_speed = pkg.assembly_speed || 0;
            }
        }
        this.renderFormItems();
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

    _assemblyCostPerUnit(assemblySpeed, fotPerHour, indirectPerHour) {
        const speed = parseFloat(assemblySpeed) || 0;
        if (speed <= 0) return 0;
        return round2((fotPerHour + indirectPerHour) / speed);
    },

    _calcHwUnitComponents(item, params) {
        const cnyRate = params.cnyRate || 12.5;
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;
        const wasteFactor = params.wasteFactor || 1.1;
        const indirectModeAll = params.indirectCostMode === 'all';
        let materialCost = 0;
        let assemblySpeed = parseFloat(item.assembly_speed) || 0;

        if (item.source === 'custom' || (item.source === 'warehouse' && item.wh_id)) {
            materialCost = parseFloat(item.cost_per_unit) || 0;
            if (!assemblySpeed && item.wh_id) {
                const linkedBlank = this._hwCatalog.find(b => Number(b.warehouse_item_id) === Number(item.wh_id));
                assemblySpeed = parseFloat(linkedBlank?.assembly_speed) || 0;
            }
        } else if (item.blank_id) {
            const hw = this._hwCatalog.find(b => b.id === item.blank_id);
            if (!hw) return { materialCost: 0, assemblyFot: 0, assemblyIndirect: 0, total: 0 };
            materialCost = (hw.price_rub || 0) > 0
                ? (hw.price_rub || 0)
                : ((hw.price_cny || 0) * cnyRate + (hw.delivery_per_unit || 0));
            if (!assemblySpeed) assemblySpeed = parseFloat(hw.assembly_speed) || 0;
        }

        let assemblyFot = 0;
        let assemblyIndirect = 0;
        if (assemblySpeed > 0) {
            assemblyFot = fotPerHour / assemblySpeed * wasteFactor;
            assemblyIndirect = indirectModeAll ? (indirectPerHour / assemblySpeed * wasteFactor) : 0;
        }

        const total = round2(materialCost + assemblyFot + assemblyIndirect);
        return {
            materialCost: round2(materialCost),
            assemblyFot: round2(assemblyFot),
            assemblyIndirect: round2(assemblyIndirect),
            total,
        };
    },

    _calcHwUnitCost(item, params) {
        return this._calcHwUnitComponents(item, params).total;
    },

    _calcPkgUnitComponents(item, params) {
        const fotPerHour = params.fotPerHour || 400;
        const indirectPerHour = params.indirectPerHour || 0;
        const wasteFactor = params.wasteFactor || 1.1;
        const indirectModeAll = params.indirectCostMode === 'all';
        let materialCost = 0;
        let assemblySpeed = parseFloat(item.assembly_speed) || 0;

        if (item.source === 'custom' || (item.source === 'warehouse' && item.wh_id)) {
            materialCost = parseFloat(item.cost_per_unit) || 0;
            if (!assemblySpeed && item.wh_id) {
                const linkedBlank = this._pkgCatalog.find(b => Number(b.warehouse_item_id) === Number(item.wh_id));
                assemblySpeed = parseFloat(linkedBlank?.assembly_speed) || 0;
            }
        } else if (item.blank_id) {
            const pkg = this._pkgCatalog.find(b => b.id === item.blank_id);
            if (!pkg) return { materialCost: 0, assemblyFot: 0, assemblyIndirect: 0, total: 0 };
            materialCost = (pkg.price_per_unit || 0) + (pkg.delivery_per_unit || 0);
            if (!assemblySpeed) assemblySpeed = parseFloat(pkg.assembly_speed) || 0;
        }

        let assemblyFot = 0;
        let assemblyIndirect = 0;
        if (assemblySpeed > 0) {
            assemblyFot = fotPerHour / assemblySpeed * wasteFactor;
            assemblyIndirect = indirectModeAll ? (indirectPerHour / assemblySpeed * wasteFactor) : 0;
        }

        const total = round2(materialCost + assemblyFot + assemblyIndirect);
        return {
            materialCost: round2(materialCost),
            assemblyFot: round2(assemblyFot),
            assemblyIndirect: round2(assemblyIndirect),
            total,
        };
    },

    _calcPkgUnitCost(item, params) {
        return this._calcPkgUnitComponents(item, params).total;
    },

    // ==========================================
    // CALCULATION (per 1 unit of set)
    // ==========================================

    recalcSet() {
        const commissionPct = parseFloat(document.getElementById('mp-set-commission')?.value) || 46;
        const vatPct = parseFloat(document.getElementById('mp-set-vat')?.value) || 5;
        const osnPct = parseFloat(document.getElementById('mp-set-osn')?.value) || 6;
        const commercialPct = parseFloat(document.getElementById('mp-set-commercial')?.value) || 6.5;
        const acquiringPct = parseFloat(document.getElementById('mp-set-acquiring')?.value) || 4;
        const shopMultiplier = parseFloat(document.getElementById('mp-set-shop-multiplier')?.value) || 3;
        const targetMarginPct = parseFloat(document.getElementById('mp-set-margin')?.value) || 40;

        const params = App.params || {};
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
            totalCost += this._calcHwUnitCost(item, params) * (item.qty || 1);
        });

        // Packaging
        this._pkgItems.forEach(item => {
            totalCost += this._calcPkgUnitCost(item, params) * (item.qty || 1);
        });

        totalCost = round2(totalCost);

        // MP suggested price by target net margin.
        const keepFactorMp = (1 - commissionPct/100) * (1 - vatPct/100) * (1 - osnPct/100) * (1 - commercialPct/100) * (1 - targetMarginPct/100);
        const suggestedMpPrice = keepFactorMp > 0 ? Math.ceil(totalCost / keepFactorMp) : 0;
        const suggestedShopPrice = totalCost > 0 ? Math.round(totalCost * Math.max(shopMultiplier, 0)) : 0;

        // Show result
        const resultBlock = document.getElementById('mp-result-block');
        if (totalCost > 0) {
            resultBlock.style.display = '';
            document.getElementById('mp-calc-cost').textContent = formatRub(totalCost);
            document.getElementById('mp-calc-price').textContent = formatRub(suggestedMpPrice);
            document.getElementById('mp-calc-shop-price').textContent = formatRub(suggestedShopPrice);

            const mpManualEl = document.getElementById('mp-set-price-manual');
            const shopManualEl = document.getElementById('mp-set-shop-price-manual');
            if (mpManualEl && !mpManualEl.matches(':focus') && !mpManualEl.value) mpManualEl.value = String(suggestedMpPrice);
            if (shopManualEl && !shopManualEl.matches(':focus') && !shopManualEl.value) shopManualEl.value = String(suggestedShopPrice);

            const mpActualPrice = parseFloat(mpManualEl?.value) || suggestedMpPrice || 0;
            const shopActualPrice = parseFloat(shopManualEl?.value) || suggestedShopPrice || 0;

            const mpNetFactor = (1 - commissionPct/100) * (1 - vatPct/100) * (1 - osnPct/100) * (1 - commercialPct/100);
            const mpNet = round2(mpActualPrice * Math.max(mpNetFactor, 0));
            const mpProfit = round2(mpNet - totalCost);
            const mpMargin = mpNet > 0 ? round2(mpProfit * 100 / mpNet) : 0;

            const shopNetFactor = (1 - vatPct/100) * (1 - osnPct/100) * (1 - commercialPct/100) * (1 - acquiringPct/100);
            const shopNet = round2(shopActualPrice * Math.max(shopNetFactor, 0));
            const shopProfit = round2(shopNet - totalCost);
            const shopMargin = shopNet > 0 ? round2(shopProfit * 100 / shopNet) : 0;

            const mpMarginEl = document.getElementById('mp-calc-manual-margin');
            const shopMarginEl = document.getElementById('mp-calc-shop-margin');
            const marginColor = (m) => m >= 40 ? 'var(--green)' : m >= 20 ? 'var(--yellow)' : 'var(--red)';
            if (mpMarginEl) {
                mpMarginEl.innerHTML = `Чистыми: <b style="color:${mpProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${formatRub(mpProfit)}</b> · Маржа <b style="color:${marginColor(mpMargin)}">${mpMargin}%</b>`;
            }
            if (shopMarginEl) {
                shopMarginEl.innerHTML = `Чистыми: <b style="color:${shopProfit >= 0 ? 'var(--green)' : 'var(--red)'}">${formatRub(shopProfit)}</b> · Маржа <b style="color:${marginColor(shopMargin)}">${shopMargin}%</b>`;
            }

            const bd = this._calcSetBreakdown({
                plastic_items: this._plasticItems,
                hw_items: this._hwItems,
                pkg_items: this._pkgItems,
            });
            const stageParts = [];
            if (bd.castingCost > 0) stageParts.push(`Выливание (пластик + амортизация молда + тех. добавки): ${formatRub(bd.castingCost)}`);
            if (bd.fotCost > 0) stageParts.push(`ФОТ выливания/срезки/NFC: ${formatRub(bd.fotCost)}`);
            if (bd.indirectCastingCost > 0) stageParts.push(`Косвенные выливания: ${formatRub(bd.indirectCastingCost)}`);
            if (bd.hwMaterialCost > 0) stageParts.push(`Фурнитура (материалы, включая встроенную): ${formatRub(bd.hwMaterialCost)}`);
            if (bd.pkgMaterialCost > 0) stageParts.push(`Упаковка (материалы): ${formatRub(bd.pkgMaterialCost)}`);
            if (bd.assemblyCost > 0) stageParts.push(`Сборка фурнитуры/упаковки (ФОТ): ${formatRub(bd.assemblyCost)}`);
            if (bd.indirectAssemblyCost > 0) stageParts.push(`Косвенные сборки фурнитуры/упаковки: ${formatRub(bd.indirectAssemblyCost)}`);

            document.getElementById('mp-calc-details').innerHTML = `
                ${stageParts.length ? `<div style="margin-bottom:6px;line-height:1.5;">${stageParts.join('<br>')}</div>` : ''}
                МП (факт ${formatRub(mpActualPrice)}): −комиссия ${commissionPct}% · −НДС ${vatPct}% · −ОСН ${osnPct}% · −коммерч. ${commercialPct}% → чистый вход ${formatRub(mpNet)}<br>
                ИМ (факт ${formatRub(shopActualPrice)}): −НДС ${vatPct}% · −ОСН ${osnPct}% · −коммерч. ${commercialPct}% · −эквайринг ${acquiringPct}% → чистый вход ${formatRub(shopNet)}
            `;

            this._lastCalc = {
                totalCost,
                suggestedMpPrice,
                suggestedShopPrice,
                mpActualPrice,
                shopActualPrice,
                mpMargin,
                shopMargin,
                actualMargin: mpMargin,
            };
        } else {
            resultBlock.style.display = 'none';
            this._lastCalc = { totalCost: 0, suggestedMpPrice: 0, suggestedShopPrice: 0, mpActualPrice: 0, shopActualPrice: 0, mpMargin: 0, shopMargin: 0, actualMargin: 0 };
        }
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
            acquiring: parseFloat(document.getElementById('mp-set-acquiring').value) || 4,
            shop_multiplier: parseFloat(document.getElementById('mp-set-shop-multiplier').value) || 3,
            target_margin: parseFloat(document.getElementById('mp-set-margin').value) || 40,
            plastic_items: this._plasticItems.filter(i => i.blank_id),
            hw_items: this._hwItems.filter(i => i.blank_id || i.wh_id || (i.source === 'custom' && i.name)),
            pkg_items: this._pkgItems.filter(i => i.blank_id || i.wh_id || (i.source === 'custom' && i.name)),
            total_cost: this._lastCalc?.totalCost || 0,
            selling_price: this._lastCalc?.mpActualPrice || this._lastCalc?.suggestedMpPrice || 0,
            mp_suggested_price: this._lastCalc?.suggestedMpPrice || 0,
            mp_actual_price: this._lastCalc?.mpActualPrice || 0,
            shop_suggested_price: this._lastCalc?.suggestedShopPrice || 0,
            shop_actual_price: this._lastCalc?.shopActualPrice || 0,
            mp_margin_actual: this._lastCalc?.mpMargin || 0,
            shop_margin_actual: this._lastCalc?.shopMargin || 0,
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

    showProductionBuilder() {
        const panel = document.getElementById('mp-production-builder');
        const list = document.getElementById('mp-production-list');
        if (!panel || !list) return;
        this.hideSetForm();
        if (!this.allSets.length) {
            App.toast('Нет наборов для производства');
            return;
        }
        this._productionSelection = this.allSets.map(s => ({ id: s.id, qty: 0, selected: false }));
        list.innerHTML = this.allSets.map(s => `
            <div style="display:grid;grid-template-columns:auto 1fr 110px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                <input type="checkbox" id="mp-prod-sel-${s.id}" onchange="Marketplaces._toggleProductionSet(${s.id}, this.checked)">
                <label for="mp-prod-sel-${s.id}" style="cursor:pointer;">
                    <div style="font-weight:600;">${this._esc(s.name || 'Набор')}</div>
                    <div style="font-size:11px;color:var(--text-muted);">Себестоимость ${formatRub(s.total_cost || 0)} · МП ${formatRub(s.mp_actual_price || s.selling_price || 0)}</div>
                </label>
                <input type="number" min="1" placeholder="Тираж" disabled id="mp-prod-qty-${s.id}" oninput="Marketplaces._setProductionQty(${s.id}, this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px;">
            </div>
        `).join('');
        panel.style.display = '';
        panel.scrollIntoView({ behavior: 'smooth' });
    },

    hideProductionBuilder() {
        const panel = document.getElementById('mp-production-builder');
        if (panel) panel.style.display = 'none';
    },

    _toggleProductionSet(setId, checked) {
        const row = this._productionSelection.find(r => Number(r.id) === Number(setId));
        const qtyEl = document.getElementById(`mp-prod-qty-${setId}`);
        if (!row) return;
        row.selected = !!checked;
        if (qtyEl) {
            qtyEl.disabled = !checked;
            if (checked && (!row.qty || row.qty < 1)) {
                row.qty = 50;
                qtyEl.value = '50';
            }
            if (!checked) qtyEl.value = '';
        }
    },

    _setProductionQty(setId, value) {
        const row = this._productionSelection.find(r => Number(r.id) === Number(setId));
        if (!row) return;
        row.qty = Math.max(1, parseInt(value, 10) || 0);
    },

    async createProductionOrderFromSelection() {
        const selected = (this._productionSelection || []).filter(r => r.selected && r.qty > 0);
        if (!selected.length) {
            App.toast('Выберите хотя бы один набор и тираж');
            return;
        }
        const orderNameRaw = prompt('Название заказа', `B2C партия ${new Date().toLocaleDateString('ru-RU')}`);
        if (orderNameRaw === null) return;
        const orderName = (orderNameRaw || '').trim();
        if (!orderName) {
            App.toast('Нужно название заказа');
            return;
        }
        await this._createProductionOrderFromSets(selected, orderName);
    },

    _pphForMold(mold) {
        const pMin = mold?.pph_min || 0;
        const pMax = mold?.pph_max || 0;
        const pAvg = (pMin > 0 && pMax > 0) ? Math.round((pMin + pMax) / 2) : (pMin || pMax || 0);
        return mold?.pph_actual || pAvg || 1;
    },

    async _createProductionOrderFromSets(selectedRows, orderName) {
        const selectedSets = selectedRows.map(r => ({
            set: this.allSets.find(s => Number(s.id) === Number(r.id)),
            qty: r.qty,
        })).filter(x => x.set && x.qty > 0);

        if (!selectedSets.length) {
            App.toast('Наборы не найдены');
            return;
        }

        const nowIso = new Date().toISOString();
        const today = nowIso.slice(0, 10);
        const params = App.params || getProductionParams(App.settings || {});
        const currentEmployee = App.getCurrentEmployeeName() || '';
        const items = [];
        let itemNumber = 1;
        let totalRevenue = 0;
        let totalCosts = 0;
        let totalHoursPlastic = 0;
        let totalHoursHardware = 0;
        let totalHoursPackaging = 0;

        selectedSets.forEach(({ set: s, qty: setQty }) => {
            // Plastic products
            (s.plastic_items || []).forEach(pi => {
                if (!pi.blank_id) return;
                const mold = this._plasticBlanks.find(m => Number(m.id) === Number(pi.blank_id));
                if (!mold) return;
                const qty = setQty * (parseFloat(pi.qty) || 1);
                const calcItem = {
                    quantity: qty,
                    pieces_per_hour: this._pphForMold(mold),
                    weight_grams: mold.weight_grams || 0,
                    extra_molds: 0,
                    complex_design: false,
                    is_blank_mold: true,
                    is_nfc: mold.category === 'nfc',
                    nfc_programming: mold.category === 'nfc',
                    delivery_included: false,
                    printings: [],
                };
                const r = calculateItemCost(calcItem, params);
                const colors = Array.isArray(pi.colors) ? pi.colors : [];
                const colorLabel = colors.length
                    ? colors.map(c => `${c.number || ''} ${c.name || ''}`.trim()).filter(Boolean).join(' + ')
                    : String(pi.color_notes || '').trim();
                const productName = colorLabel ? `${mold.name} [цвет: ${colorLabel}]` : mold.name;
                items.push({
                    item_number: itemNumber++,
                    item_type: 'product',
                    product_name: productName,
                    quantity: qty,
                    pieces_per_hour: calcItem.pieces_per_hour,
                    weight_grams: calcItem.weight_grams,
                    extra_molds: 0,
                    complex_design: false,
                    is_blank_mold: true,
                    is_nfc: calcItem.is_nfc,
                    nfc_programming: calcItem.nfc_programming,
                    delivery_included: false,
                    printings: JSON.stringify([]),
                    cost_fot: r.costFot,
                    cost_indirect: r.costIndirect,
                    cost_plastic: r.costPlastic,
                    cost_mold_amortization: r.costMoldAmortization,
                    cost_design: 0,
                    cost_cutting: r.costCutting,
                    cost_cutting_indirect: r.costCuttingIndirect,
                    cost_nfc_tag: r.costNfcTag,
                    cost_nfc_programming: r.costNfcProgramming,
                    cost_nfc_indirect: r.costNfcIndirect,
                    cost_printing: 0,
                    cost_delivery: 0,
                    cost_total: r.costTotal,
                    sell_price_item: 0,
                    sell_price_printing: 0,
                    target_price_item: 0,
                    hours_plastic: r.hoursPlastic,
                    hours_cutting: r.hoursCutting,
                    hours_nfc: r.hoursNfc,
                    template_id: mold.id,
                    color_id: colors[0]?.id || null,
                    color_name: colors[0]?.name || colorLabel || '',
                    colors: JSON.stringify(colors),
                    color_solution_attachment: null,
                });
                totalCosts += r.costTotal * qty;
                totalHoursPlastic += (r.hoursPlastic || 0) + (r.hoursCutting || 0) + (r.hoursNfc || 0);
            });

            // Hardware
            (s.hw_items || []).forEach((hw, i) => {
                const qty = setQty * (parseFloat(hw.qty) || 1);
                if (qty <= 0) return;
                const base = this._calcHwUnitComponents(hw, params);
                const hwItem = {
                    name: hw.name || `Фурнитура ${i + 1}`,
                    qty,
                    assembly_speed: parseFloat(hw.assembly_speed) || 0,
                    price: base.materialCost,
                    delivery_price: 0,
                    delivery_total: 0,
                    sell_price: 0,
                };
                const res = calculateHardwareCost(hwItem, params);
                items.push({
                    item_number: itemNumber++,
                    item_type: 'hardware',
                    product_name: hwItem.name,
                    quantity: qty,
                    hardware_assembly_speed: hwItem.assembly_speed,
                    hardware_price_per_unit: hwItem.price,
                    hardware_delivery_per_unit: hwItem.delivery_price,
                    hardware_delivery_total: hwItem.delivery_total,
                    sell_price_hardware: 0,
                    target_price_hardware: 0,
                    cost_total: res.costPerUnit,
                    hours_hardware: res.hoursHardware,
                    hardware_source: hw.source === 'warehouse' ? 'warehouse' : 'custom',
                    custom_country: hw.custom_country || 'china',
                    hardware_warehouse_item_id: hw.source === 'warehouse' ? (hw.wh_id || null) : null,
                    hardware_warehouse_sku: hw.warehouse_sku || '',
                    hardware_parent_item_index: null,
                    hardware_from_template: false,
                });
                totalCosts += res.costPerUnit * qty;
                totalHoursHardware += res.hoursHardware || 0;
            });

            // Packaging
            (s.pkg_items || []).forEach((pkg, i) => {
                const qty = setQty * (parseFloat(pkg.qty) || 1);
                if (qty <= 0) return;
                const base = this._calcPkgUnitComponents(pkg, params);
                const pkgItem = {
                    name: pkg.name || `Упаковка ${i + 1}`,
                    qty,
                    assembly_speed: parseFloat(pkg.assembly_speed) || 0,
                    price: base.materialCost,
                    delivery_price: 0,
                    delivery_total: 0,
                    sell_price: 0,
                };
                const res = calculatePackagingCost(pkgItem, params);
                items.push({
                    item_number: itemNumber++,
                    item_type: 'packaging',
                    product_name: pkgItem.name,
                    quantity: qty,
                    packaging_assembly_speed: pkgItem.assembly_speed,
                    packaging_price_per_unit: pkgItem.price,
                    packaging_delivery_per_unit: pkgItem.delivery_price,
                    packaging_delivery_total: pkgItem.delivery_total,
                    sell_price_packaging: 0,
                    target_price_packaging: 0,
                    cost_total: res.costPerUnit,
                    hours_packaging: res.hoursPackaging,
                    packaging_source: pkg.source === 'warehouse' ? 'warehouse' : 'custom',
                    custom_country: pkg.custom_country || 'china',
                    packaging_warehouse_item_id: pkg.source === 'warehouse' ? (pkg.wh_id || null) : null,
                    packaging_warehouse_sku: pkg.warehouse_sku || '',
                    packaging_parent_item_index: null,
                });
                totalCosts += res.costPerUnit * qty;
                totalHoursPackaging += res.hoursPackaging || 0;
            });

            totalRevenue += round2((parseFloat(s.mp_actual_price || s.selling_price || 0) || 0) * setQty);
        });

        totalCosts = round2(totalCosts);
        totalRevenue = round2(totalRevenue);
        const totalMargin = round2(totalRevenue - totalCosts);
        const marginPercent = totalRevenue > 0 ? round2(totalMargin * 100 / totalRevenue) : 0;

        const notesParts = selectedSets.map(({ set: s, qty }) => `${s.name} × ${qty}`);
        const order = {
            id: undefined,
            order_name: orderName,
            client_name: 'B2C',
            manager_name: currentEmployee,
            owner_name: currentEmployee,
            status: 'production_casting',
            deadline: today,
            deadline_start: today,
            deadline_end: null,
            notes: `Автосоздано из B2C: ${notesParts.join('; ')}`,
            total_hours_plan: round2(totalHoursPlastic + totalHoursHardware + totalHoursPackaging),
            production_hours_plastic: round2(totalHoursPlastic),
            production_hours_packaging: round2(totalHoursPackaging),
            production_hours_hardware: round2(totalHoursHardware),
            total_revenue_plan: totalRevenue,
            total_cost_plan: totalCosts,
            total_margin_plan: totalMargin,
            margin_percent_plan: marginPercent,
            payment_status: 'not_paid',
            items_snapshot: JSON.stringify({
                source: 'b2c',
                sets: selectedSets.map(({ set: s, qty }) => ({ set_id: s.id || null, set_name: s.name, set_qty: qty })),
            }),
            hardware_snapshot: JSON.stringify([]),
            packaging_snapshot: JSON.stringify([]),
        };

        const savedOrderId = await saveOrder(order, items);
        if (!savedOrderId) {
            App.toast('Не удалось создать заказ');
            return;
        }
        try {
            if (typeof Orders !== 'undefined' && Orders && typeof Orders._syncWarehouseByStatus === 'function') {
                await Orders._syncWarehouseByStatus(savedOrderId, 'draft', 'production_casting', orderName, currentEmployee || 'B2C');
            }
        } catch (e) {
            console.warn('B2C order stock sync warning:', e);
        }
        this.hideProductionBuilder();
        App.toast('Заказ в производство создан');
        App.navigate('order-detail', true, savedOrderId);
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

    _calcSetBreakdown(s) {
        const params = App.params || {};
        let plasticCost = 0, hwCost = 0, pkgCost = 0;
        let castingCost = 0;
        let hwMaterialCost = 0;
        let pkgMaterialCost = 0;
        let fotCost = 0;
        let assemblyCost = 0;
        let indirectCost = 0;
        let indirectCastingCost = 0;
        let indirectAssemblyCost = 0;

        (s.plastic_items || []).forEach(item => {
            if (!item.blank_id) return;
            const mold = this._plasticBlanks.find(m => m.id === item.blank_id);
            if (!mold || !mold.tiers) return;
            const tier = mold.tiers[500] || mold.tiers[300] || mold.tiers[1000];
            const qtyMult = item.qty || 1;
            if (tier) plasticCost += tier.cost * qtyMult;

            // Detailed split for plastic part (as in _enrichPlasticBlanks)
            const pMin = mold.pph_min || 0;
            const pMax = mold.pph_max || 0;
            const pAvg = (pMin > 0 && pMax > 0) ? Math.round((pMin + pMax) / 2) : (pMin || pMax || 0);
            const pph = mold.pph_actual || pAvg || 1;
            const weight = mold.weight_grams || 0;
            const moldCount = mold.mold_count || 1;
            const singleMoldCost = (mold.cost_cny || 800) * (mold.cny_rate || 12.5) + (mold.delivery_cost || 8000);
            const moldAmortPerUnit = (singleMoldCost * moldCount) / MOLD_MAX_LIFETIME;
            const baseItem = {
                quantity: 500,
                pieces_per_hour: pph,
                weight_grams: weight,
                extra_molds: 0,
                complex_design: false,
                is_nfc: mold.category === 'nfc',
                nfc_programming: mold.category === 'nfc',
                hardware_qty: 0,
                packaging_qty: 0,
                printing_qty: 0,
                delivery_included: false,
            };
            const res = calculateItemCost(baseItem, params);
            const castingPerUnit = round2(
                (res.costPlastic || 0)
                + moldAmortPerUnit
                + (res.costDesign || 0)
                + (res.costNfcTag || 0)
                + (res.costPrinting || 0)
                + (res.costDelivery || 0)
            );
            const fotPerUnit = round2((res.costFot || 0) + (res.costCutting || 0) + (res.costNfcProgramming || 0));
            const indirectPerUnit = round2((res.costIndirect || 0) + (res.costCuttingIndirect || 0) + (res.costNfcIndirect || 0));

            castingCost += castingPerUnit * qtyMult;
            fotCost += fotPerUnit * qtyMult;
            indirectCost += indirectPerUnit * qtyMult;
            indirectCastingCost += indirectPerUnit * qtyMult;

            // Built-in hardware of plastic blank (if exists)
            if (mold.hw_name && mold.hw_price_per_unit > 0) {
                const hwMaterialPerUnit = round2((mold.hw_price_per_unit || 0) + ((mold.hw_delivery_total || 0) / 500));
                let hwAssemblyFotPerUnit = 0;
                if (mold.hw_speed > 0) {
                    hwAssemblyFotPerUnit = round2((params.fotPerHour || 400) / mold.hw_speed * (params.wasteFactor || 1.1));
                }
                hwMaterialCost += hwMaterialPerUnit * qtyMult;
                assemblyCost += hwAssemblyFotPerUnit * qtyMult;
            }
        });

        (s.hw_items || []).forEach(item => {
            const qtyMult = item.qty || 1;
            const c = this._calcHwUnitComponents(item, params);
            hwCost += c.total * qtyMult;
            hwMaterialCost += c.materialCost * qtyMult;
            assemblyCost += c.assemblyFot * qtyMult;
            indirectCost += c.assemblyIndirect * qtyMult;
            indirectAssemblyCost += c.assemblyIndirect * qtyMult;
        });

        (s.pkg_items || []).forEach(item => {
            const qtyMult = item.qty || 1;
            const c = this._calcPkgUnitComponents(item, params);
            pkgCost += c.total * qtyMult;
            pkgMaterialCost += c.materialCost * qtyMult;
            assemblyCost += c.assemblyFot * qtyMult;
            indirectCost += c.assemblyIndirect * qtyMult;
            indirectAssemblyCost += c.assemblyIndirect * qtyMult;
        });

        // fallback: if detailed split couldn't be reconstructed, keep at least basic categories
        if (castingCost === 0 && plasticCost > 0) castingCost = plasticCost;
        if (hwMaterialCost === 0 && hwCost > 0) hwMaterialCost = hwCost;
        if (pkgMaterialCost === 0 && pkgCost > 0) pkgMaterialCost = pkgCost;

        return {
            plasticCost: round2(plasticCost),
            hwCost: round2(hwCost),
            pkgCost: round2(pkgCost),
            castingCost: round2(castingCost),
            hwMaterialCost: round2(hwMaterialCost),
            pkgMaterialCost: round2(pkgMaterialCost),
            fotCost: round2(fotCost),
            assemblyCost: round2(assemblyCost),
            indirectCastingCost: round2(indirectCastingCost),
            indirectAssemblyCost: round2(indirectAssemblyCost),
            indirectCost: round2(indirectCost),
            totalCost: round2(plasticCost + hwCost + pkgCost)
        };
    },

    _esc(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
};

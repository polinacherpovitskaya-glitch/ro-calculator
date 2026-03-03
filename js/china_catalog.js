// =============================================
// Recycle Object — Каталог фурнитуры из Китая
// Catalog of hardware/packaging from China
// with delivery cost calculator
// =============================================

const ChinaCatalog = {
    _items: [],
    _filter: '',
    _search: '',

    // Delivery rates (USD per kg)
    DELIVERY_METHODS: {
        avia_fast: { label: 'Авиа быстрая',  rate_usd: 38,   days: '3 дн' },
        avia:      { label: 'Авиа',           rate_usd: 33,   days: '5-7 дн' },
        auto:      { label: 'Авто',           rate_usd: 4.8,  days: '18-25 дн' },
    },

    // Surcharges: withdrawal + crypto card + unfavorable rates
    ITEM_SURCHARGE: 0.035,     // +3.5% на товар (1.5% вывод + 2% крипта)
    DELIVERY_SURCHARGE: 0.10,  // +10% на доставку (вывод + невыгодный курс)

    // Default exchange rates (overridden from settings)
    _cnyRate: 12.5,
    _usdRate: 90,

    async load() {
        try {
            // Load rates from settings
            const params = App.params || {};
            this._cnyRate = params.china_cny_rate || 12.5;
            this._usdRate = params.china_usd_rate || 90;

            // Override delivery rates from settings if available
            if (params.china_delivery_avia_fast) this.DELIVERY_METHODS.avia_fast.rate_usd = params.china_delivery_avia_fast;
            if (params.china_delivery_avia) this.DELIVERY_METHODS.avia.rate_usd = params.china_delivery_avia;
            if (params.china_delivery_auto) this.DELIVERY_METHODS.auto.rate_usd = params.china_delivery_auto;
            // Surcharges
            if (params.china_item_surcharge !== undefined) this.ITEM_SURCHARGE = params.china_item_surcharge;
            if (params.china_delivery_surcharge !== undefined) this.DELIVERY_SURCHARGE = params.china_delivery_surcharge;

            // Load catalog: from localStorage first, then seed from JSON
            this._items = await this._loadItems();
            this.render();
        } catch (err) {
            console.error('ChinaCatalog.load() error:', err);
            const el = document.getElementById('china-catalog-container');
            if (el) el.innerHTML = '<div class="card" style="padding:20px;color:var(--red)">Ошибка загрузки каталога: ' + (err.message || err) + '</div>';
        }
    },

    async _loadItems() {
        // Try localStorage first
        let items = getLocal('ro_calc_china_catalog');

        // Always load seed JSON to merge missing fields (photos, links)
        let seedItems = [];
        try {
            const resp = await fetch('data/china_catalog.json');
            if (resp.ok) seedItems = await resp.json();
        } catch (e) {
            console.warn('Failed to load china_catalog.json:', e);
        }

        if (items && items.length > 0) {
            // Build lookup by ID from seed JSON
            const seedMap = new Map();
            seedItems.forEach(si => seedMap.set(si.id, si));

            // Merge missing photo_url and link_1688 from JSON
            let migrated = false;
            items.forEach(item => {
                const seed = seedMap.get(item.id);
                if (!item.photo_url && seed && seed.photo_url) {
                    item.photo_url = seed.photo_url;
                    migrated = true;
                }
                if (!item.link_1688 && seed && seed.link_1688) {
                    item.link_1688 = seed.link_1688;
                    migrated = true;
                }
            });
            if (migrated) setLocal('ro_calc_china_catalog', items);
            return items;
        }

        // No localStorage — seed from JSON
        if (seedItems.length > 0) {
            setLocal('ro_calc_china_catalog', seedItems);
            return seedItems;
        }
        return [];
    },

    _saveItems() {
        setLocal('ro_calc_china_catalog', this._items);
    },

    // ==========================================
    // CATEGORIES
    // ==========================================

    getCategories() {
        const cats = new Map();
        this._items.forEach(item => {
            if (!cats.has(item.category)) {
                cats.set(item.category, item.category_ru || item.category);
            }
        });
        return cats; // Map: key -> label_ru
    },

    // ==========================================
    // RENDERING
    // ==========================================

    render() {
        const container = document.getElementById('china-catalog-container');
        if (!container) return;

        const categories = this.getCategories();

        // Rates bar
        const itemPct = Math.round(this.ITEM_SURCHARGE * 100);
        const delPct = Math.round(this.DELIVERY_SURCHARGE * 100);
        let html = `
        <div class="card" style="padding:12px 16px;margin-bottom:12px;">
            <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;font-size:12px;">
                <span style="font-weight:700;">Курсы:</span>
                <span>&#165; = <b>${this._cnyRate}</b> &#8381;</span>
                <span>$ = <b>${this._usdRate}</b> &#8381;</span>
                <span style="color:var(--text-muted)">|</span>
                ${Object.entries(this.DELIVERY_METHODS).map(([k, m]) =>
                    `<span>${m.label}: <b>$${m.rate_usd}/кг</b> <span style="color:var(--text-muted)">(${m.days})</span></span>`
                ).join('')}
                <span style="color:var(--text-muted)">|</span>
                <span style="color:var(--orange);">Товар +${itemPct}% · Дост. +${delPct}%</span>
                <button class="btn btn-sm btn-outline" style="margin-left:auto;font-size:10px;" onclick="ChinaCatalog.openRatesModal()">&#9881; Курсы</button>
            </div>
        </div>`;

        // Category filter + search
        html += `
        <div class="card" style="padding:12px 16px;margin-bottom:12px;">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <button class="btn btn-sm ${!this._filter ? 'btn-primary' : 'btn-outline'}" onclick="ChinaCatalog.setFilter('')">Все (${this._items.length})</button>`;

        categories.forEach((label, key) => {
            const count = this._items.filter(i => i.category === key).length;
            html += `<button class="btn btn-sm ${this._filter === key ? 'btn-primary' : 'btn-outline'}" onclick="ChinaCatalog.setFilter('${key}')">${this._esc(label)} (${count})</button>`;
        });

        html += `
                <div style="margin-left:auto;">
                    <input type="text" id="china-cat-search" placeholder="Поиск..." value="${this._esc(this._search)}" oninput="ChinaCatalog.onSearch(this.value)" style="width:180px;padding:6px 10px;font-size:12px;">
                </div>
            </div>
        </div>`;

        // Items table
        const filtered = this._getFiltered();
        if (filtered.length === 0) {
            html += '<div class="empty-state"><p>Нет позиций по фильтру</p></div>';
        } else {
            html += this._renderTable(filtered);
        }

        container.innerHTML = html;
    },

    _getFiltered() {
        let items = [...this._items];
        if (this._filter) items = items.filter(i => i.category === this._filter);
        if (this._search) {
            const q = this._search.toLowerCase();
            items = items.filter(i =>
                (i.name || '').toLowerCase().includes(q) ||
                (i.category_ru || '').toLowerCase().includes(q) ||
                (i.size || '').toLowerCase().includes(q) ||
                (i.notes || '').toLowerCase().includes(q)
            );
        }
        return items;
    },

    _renderTable(items) {
        let html = `<div class="card" style="padding:12px;">
            <table style="font-size:12px;border-collapse:collapse;width:100%;table-layout:fixed;">
            <colgroup>
                <col style="width:auto;">
                <col style="width:68px;">
                <col style="width:108px;">
                <col style="width:46px;">
                <col style="width:80px;">
                <col style="width:68px;">
            </colgroup>
            <thead><tr>
                <th style="padding:6px 8px;text-align:left;">Позиция</th>
                <th style="padding:6px 8px;text-align:right;">Цена</th>
                <th style="padding:6px 8px;text-align:center;">Доставка</th>
                <th style="padding:6px 8px;text-align:center;">Кол</th>
                <th style="padding:6px 8px;text-align:right;">Итого/шт</th>
                <th style="padding:6px 4px;"></th>
            </tr></thead><tbody>`;

        items.forEach(item => {
            const priceRub = round2(item.price_cny * this._cnyRate);
            const isRussia = item.category === 'russia';

            // Price column
            const priceHtml = isRussia
                ? `<div style="font-weight:600;">${formatRub(item.price_rub || 0)}</div>`
                : `<div style="font-weight:600;">${item.price_cny}&#165;</div>
                   <div style="font-size:10px;color:var(--text-muted);">${formatRub(priceRub)}</div>`;

            // Delivery (short labels for compact table)
            const shortLabels = { avia_fast: 'Быстр', avia: 'Авиа', auto: 'Авто' };
            const deliverySelect = isRussia
                ? `<span style="color:var(--text-muted);font-size:10px;">Россия</span>`
                : `<select id="cc-delivery-${item.id}" onchange="ChinaCatalog.recalcRow(${item.id})" style="font-size:10px;padding:1px 2px;width:100%;">
                    ${Object.entries(this.DELIVERY_METHODS).map(([k, m]) =>
                        `<option value="${k}">${shortLabels[k] || m.label} $${m.rate_usd}</option>`
                    ).join('')}
                   </select>`;

            // Photo
            const photoSrc = this._proxyPhoto(item.photo_url || '');
            const photoHtml = photoSrc
                ? `<img src="${this._esc(photoSrc)}" style="width:36px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy"><span style="width:36px;height:36px;display:none;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;font-size:12px;flex-shrink:0;">📦</span>`
                : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:4px;font-size:12px;flex-shrink:0;">📦</span>`;

            // Link icon
            const linkIcon = item.link_1688
                ? `<a href="${this._esc(item.link_1688)}" target="_blank" rel="noopener" title="1688" style="font-size:12px;text-decoration:none;">🔗</a>`
                : '';

            // Size + weight subtitle
            const details = [item.category_ru, item.size, item.weight_grams ? item.weight_grams + 'г' : ''].filter(Boolean).join(' · ');

            html += `<tr style="border-bottom:1px solid var(--border);" id="cc-row-${item.id}">
                <td style="padding:6px 8px;">
                    <div style="display:flex;gap:8px;align-items:center;">
                        ${photoHtml}
                        <div style="min-width:0;overflow:hidden;">
                            <div style="font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(item.name)}</div>
                            <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(details)}</div>
                            ${item.notes ? `<div style="font-size:9px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(item.notes)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td style="padding:6px 8px;text-align:right;vertical-align:middle;">${priceHtml}</td>
                <td style="padding:6px 4px;text-align:center;vertical-align:middle;">${deliverySelect}</td>
                <td style="padding:6px 2px;text-align:center;vertical-align:middle;">
                    <input type="number" min="1" value="1" id="cc-qty-${item.id}" onchange="ChinaCatalog.recalcRow(${item.id})" oninput="ChinaCatalog.recalcRow(${item.id})" style="width:42px;text-align:center;font-size:11px;padding:2px;">
                </td>
                <td style="padding:6px 8px;text-align:right;vertical-align:middle;" id="cc-total-${item.id}">
                    <span style="font-weight:700;font-size:13px;color:var(--green);">${isRussia ? formatRub(item.price_rub || 0) : formatRub(round2(priceRub * (1 + this.ITEM_SURCHARGE)))}</span>
                    <div style="font-size:9px;color:var(--text-muted);" id="cc-detail-${item.id}">${isRussia ? '' : 'без дост.'}</div>
                </td>
                <td style="padding:4px 2px;vertical-align:middle;">
                    <div style="display:flex;gap:2px;align-items:center;justify-content:center;">
                        ${linkIcon}
                        <button class="btn btn-sm btn-outline" style="padding:2px 5px;font-size:9px;" onclick="ChinaCatalog.editItem(${item.id})">&#9998;</button>
                        <button class="btn-remove" style="font-size:8px;width:20px;height:20px;" onclick="ChinaCatalog.deleteItem(${item.id})">&#10005;</button>
                    </div>
                </td>
            </tr>`;
        });

        html += '</tbody></table></div>';
        return html;
    },

    // ==========================================
    // DELIVERY CALCULATOR
    // ==========================================

    recalcRow(id) {
        const item = this._items.find(i => i.id === id);
        if (!item) return;

        const isRussia = item.category === 'russia';
        const totalEl = document.getElementById('cc-total-' + id);
        const detailEl = document.getElementById('cc-detail-' + id);
        if (!totalEl) return;

        if (isRussia) {
            // Russian items — no delivery calc, price is already in RUB
            const price = item.price_rub || 0;
            totalEl.innerHTML = `<span style="font-weight:700;font-size:13px;color:var(--green);">${formatRub(price)}</span>`;
            if (detailEl) detailEl.textContent = 'Россия';
            return;
        }

        const deliveryEl = document.getElementById('cc-delivery-' + id);
        const qtyEl = document.getElementById('cc-qty-' + id);
        const method = deliveryEl ? deliveryEl.value : 'auto';
        const qty = parseInt(qtyEl?.value) || 1;

        const result = this.calcDelivery(item, method, qty);

        totalEl.innerHTML = `<span style="font-weight:700;font-size:13px;color:var(--green);">${formatRub(result.totalPerUnit)}</span>`;
        if (detailEl) {
            detailEl.innerHTML = `${formatRub(result.priceWithSurcharge)} + дост. ${formatRub(result.deliveryWithSurcharge)}`;
        }
    },

    /**
     * Calculate delivery cost per unit with surcharges
     * @param {Object} item - catalog item
     * @param {string} method - delivery method key (avia_fast/avia/auto)
     * @param {number} qty - quantity
     * @returns {{ priceRub, priceWithSurcharge, deliveryPerUnit, deliveryWithSurcharge, totalPerUnit, deliveryTotal }}
     */
    calcDelivery(item, method, qty) {
        // Item price + 3.5% surcharge (withdrawal + crypto)
        const priceRub = round2(item.price_cny * this._cnyRate);
        const priceWithSurcharge = round2(priceRub * (1 + this.ITEM_SURCHARGE));

        // Delivery + 10% surcharge (withdrawal + unfavorable rate)
        const weightKg = (item.weight_grams || 0) / 1000;
        const rate = this.DELIVERY_METHODS[method]?.rate_usd || 4.8;
        const deliveryTotal = round2(weightKg * qty * rate * this._usdRate);
        const deliveryPerUnit = qty > 0 ? round2(deliveryTotal / qty) : 0;
        const deliveryWithSurcharge = round2(deliveryPerUnit * (1 + this.DELIVERY_SURCHARGE));

        const totalPerUnit = round2(priceWithSurcharge + deliveryWithSurcharge);

        return { priceRub, priceWithSurcharge, deliveryPerUnit, deliveryWithSurcharge, totalPerUnit, deliveryTotal };
    },

    // ==========================================
    // FILTERS
    // ==========================================

    setFilter(cat) {
        this._filter = cat;
        this.render();
    },

    onSearch(val) {
        this._search = val;
        this.render();
    },

    // ==========================================
    // RATES MODAL
    // ==========================================

    openRatesModal() {
        const html = `
        <div id="cc-rates-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:1000;display:flex;align-items:center;justify-content:center;" onclick="if(event.target===this)ChinaCatalog.closeRatesModal()">
            <div class="card" style="width:380px;padding:24px;" onclick="event.stopPropagation()">
                <h3 style="margin-bottom:16px;">Курсы и ставки доставки</h3>
                <div class="form-row">
                    <div class="form-group"><label>Курс &#165; (юань)</label><input type="number" step="0.1" id="cc-rate-cny" value="${this._cnyRate}"><span class="form-hint">&#8381; за 1 &#165;</span></div>
                    <div class="form-group"><label>Курс $ (доллар)</label><input type="number" step="0.1" id="cc-rate-usd" value="${this._usdRate}"><span class="form-hint">&#8381; за 1 $</span></div>
                </div>
                <h4 style="margin:16px 0 8px;">Ставки доставки ($/кг)</h4>
                <div class="form-row">
                    <div class="form-group"><label>Авиа быстрая (3 дн)</label><input type="number" step="0.1" id="cc-rate-avia-fast" value="${this.DELIVERY_METHODS.avia_fast.rate_usd}"></div>
                    <div class="form-group"><label>Авиа (5-7 дн)</label><input type="number" step="0.1" id="cc-rate-avia" value="${this.DELIVERY_METHODS.avia.rate_usd}"></div>
                    <div class="form-group"><label>Авто (18-25 дн)</label><input type="number" step="0.1" id="cc-rate-auto" value="${this.DELIVERY_METHODS.auto.rate_usd}"></div>
                </div>
                <h4 style="margin:16px 0 8px;">Наценки (%)</h4>
                <div class="form-row">
                    <div class="form-group"><label>На товар</label><input type="number" step="0.5" id="cc-surcharge-item" value="${this.ITEM_SURCHARGE * 100}"><span class="form-hint">% (вывод + крипта)</span></div>
                    <div class="form-group"><label>На доставку</label><input type="number" step="0.5" id="cc-surcharge-delivery" value="${this.DELIVERY_SURCHARGE * 100}"><span class="form-hint">% (вывод + курс)</span></div>
                </div>
                <div style="display:flex;gap:8px;margin-top:16px;">
                    <button class="btn btn-success btn-sm" onclick="ChinaCatalog.saveRates()">Сохранить</button>
                    <button class="btn btn-outline btn-sm" onclick="ChinaCatalog.closeRatesModal()">Отмена</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    closeRatesModal() {
        const el = document.getElementById('cc-rates-overlay');
        if (el) el.remove();
    },

    async saveRates() {
        this._cnyRate = parseFloat(document.getElementById('cc-rate-cny').value) || 12.5;
        this._usdRate = parseFloat(document.getElementById('cc-rate-usd').value) || 90;
        this.DELIVERY_METHODS.avia_fast.rate_usd = parseFloat(document.getElementById('cc-rate-avia-fast').value) || 38;
        this.DELIVERY_METHODS.avia.rate_usd = parseFloat(document.getElementById('cc-rate-avia').value) || 33;
        this.DELIVERY_METHODS.auto.rate_usd = parseFloat(document.getElementById('cc-rate-auto').value) || 4.8;
        this.ITEM_SURCHARGE = (parseFloat(document.getElementById('cc-surcharge-item').value) || 3.5) / 100;
        this.DELIVERY_SURCHARGE = (parseFloat(document.getElementById('cc-surcharge-delivery').value) || 10) / 100;

        // Save to settings
        await saveSetting('china_cny_rate', this._cnyRate);
        await saveSetting('china_usd_rate', this._usdRate);
        await saveSetting('china_delivery_avia_fast', this.DELIVERY_METHODS.avia_fast.rate_usd);
        await saveSetting('china_delivery_avia', this.DELIVERY_METHODS.avia.rate_usd);
        await saveSetting('china_delivery_auto', this.DELIVERY_METHODS.auto.rate_usd);
        await saveSetting('china_item_surcharge', this.ITEM_SURCHARGE);
        await saveSetting('china_delivery_surcharge', this.DELIVERY_SURCHARGE);

        // Update App.params
        if (App.params) {
            App.params.china_cny_rate = this._cnyRate;
            App.params.china_usd_rate = this._usdRate;
            App.params.china_delivery_avia_fast = this.DELIVERY_METHODS.avia_fast.rate_usd;
            App.params.china_delivery_avia = this.DELIVERY_METHODS.avia.rate_usd;
            App.params.china_delivery_auto = this.DELIVERY_METHODS.auto.rate_usd;
            App.params.china_item_surcharge = this.ITEM_SURCHARGE;
            App.params.china_delivery_surcharge = this.DELIVERY_SURCHARGE;
        }

        this.closeRatesModal();
        this.render();
        App.toast('Курсы сохранены');
    },

    // ==========================================
    // CRUD
    // ==========================================

    _editingId: null,

    showAddForm() {
        this._editingId = null;
        document.getElementById('cc-form-title').textContent = 'Новая позиция';
        document.getElementById('cc-item-name').value = '';
        document.getElementById('cc-item-category').value = '';
        document.getElementById('cc-item-size').value = '';
        document.getElementById('cc-item-weight').value = '';
        document.getElementById('cc-item-price-cny').value = '';
        document.getElementById('cc-item-price-rub').value = '';
        document.getElementById('cc-item-link').value = '';
        document.getElementById('cc-item-photo').value = '';
        document.getElementById('cc-item-notes').value = '';
        this._updatePhotoPreview('');
        document.getElementById('cc-delete-btn').style.display = 'none';
        document.getElementById('cc-edit-form').style.display = '';
        document.getElementById('cc-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    editItem(id) {
        const item = this._items.find(i => i.id === id);
        if (!item) return;
        this._editingId = id;
        document.getElementById('cc-form-title').textContent = 'Редактировать: ' + (item.name || '');
        document.getElementById('cc-item-name').value = item.name || '';
        document.getElementById('cc-item-category').value = item.category || '';
        document.getElementById('cc-item-size').value = item.size || '';
        document.getElementById('cc-item-weight').value = item.weight_grams || '';
        document.getElementById('cc-item-price-cny').value = item.price_cny || '';
        document.getElementById('cc-item-price-rub').value = item.price_rub || '';
        document.getElementById('cc-item-link').value = item.link_1688 || '';
        document.getElementById('cc-item-photo').value = item.photo_url || '';
        document.getElementById('cc-item-notes').value = item.notes || '';
        this._updatePhotoPreview(item.photo_url || '');
        document.getElementById('cc-delete-btn').style.display = '';
        document.getElementById('cc-edit-form').style.display = '';
        document.getElementById('cc-edit-form').scrollIntoView({ behavior: 'smooth' });
    },

    hideForm() {
        document.getElementById('cc-edit-form').style.display = 'none';
        this._editingId = null;
    },

    saveItem() {
        const name = document.getElementById('cc-item-name').value.trim();
        if (!name) { App.toast('Введите название'); return; }

        const category = document.getElementById('cc-item-category').value.trim() || 'misc';
        // Determine category_ru from existing items or use category as-is
        const existingCat = this._items.find(i => i.category === category);
        const category_ru = existingCat?.category_ru || category;

        const data = {
            name,
            category,
            category_ru,
            size: document.getElementById('cc-item-size').value.trim(),
            weight_grams: parseFloat(document.getElementById('cc-item-weight').value) || 0,
            price_cny: parseFloat(document.getElementById('cc-item-price-cny').value) || 0,
            price_rub: parseFloat(document.getElementById('cc-item-price-rub').value) || 0,
            link_1688: document.getElementById('cc-item-link').value.trim(),
            photo_url: document.getElementById('cc-item-photo').value.trim(),
            notes: document.getElementById('cc-item-notes').value.trim(),
        };

        if (this._editingId) {
            const idx = this._items.findIndex(i => i.id === this._editingId);
            if (idx >= 0) {
                this._items[idx] = { ...this._items[idx], ...data };
            }
        } else {
            const maxId = this._items.reduce((max, i) => Math.max(max, i.id || 0), 0);
            data.id = maxId + 1;
            this._items.push(data);
        }

        this._saveItems();
        this.hideForm();
        this.render();
        App.toast('Позиция сохранена');
    },

    deleteItem(id) {
        const item = this._items.find(i => i.id === id);
        if (!item) return;
        if (!confirm(`Удалить "${item.name}"?`)) return;
        this._items = this._items.filter(i => i.id !== id);
        this._saveItems();
        this.render();
        App.toast('Удалено');
    },

    deleteFromForm() {
        if (!this._editingId) return;
        this.deleteItem(this._editingId);
        this.hideForm();
    },

    // ==========================================
    // UTILS
    // ==========================================

    // Proxy alicdn images to bypass hotlink protection
    _proxyPhoto(url) {
        if (!url) return '';
        // alicdn/1688 images need proxy
        if (url.includes('alicdn.com') || url.includes('1688.com')) {
            return 'https://images.weserv.nl/?url=' + encodeURIComponent(url) + '&w=80&h=80&fit=cover&default=1';
        }
        return url;
    },

    _updatePhotoPreview(url) {
        const preview = document.getElementById('cc-item-photo-preview');
        if (!preview) return;
        if (url) {
            preview.src = this._proxyPhoto(url);
            preview.style.display = '';
            preview.onerror = () => { preview.style.display = 'none'; };
        } else {
            preview.style.display = 'none';
        }
    },

    _esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
};

// =============================================
// Recycle Object — App Core (Routing, Auth, Init)
// =============================================

const APP_VERSION = 'v39';

const App = {
    currentPage: 'dashboard',
    settings: null,
    templates: null,
    params: null,
    editingOrderId: null,

    async init() {
        // Check auth
        if (this.isAuthenticated()) {
            this.showApp();
        }

        // Bind enter on password
        document.getElementById('auth-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Hash routing
        window.addEventListener('hashchange', () => this.handleRoute());
    },

    // === AUTH ===

    login() {
        const pwd = document.getElementById('auth-password').value;
        const hash = this.simpleHash(pwd);
        if (pwd === 'recycle2026' || pwd === 'demo') {
            localStorage.setItem('ro_calc_auth', hash);
            localStorage.setItem('ro_calc_auth_ts', Date.now().toString());
            this.showApp();
        } else {
            document.getElementById('auth-error').style.display = 'block';
        }
    },

    isAuthenticated() {
        const auth = localStorage.getItem('ro_calc_auth');
        const ts = parseInt(localStorage.getItem('ro_calc_auth_ts') || '0');
        if (auth && (Date.now() - ts) < 86400000) return true;
        return false;
    },

    logout() {
        localStorage.removeItem('ro_calc_auth');
        localStorage.removeItem('ro_calc_auth_ts');
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-layout').classList.remove('active');
    },

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString();
    },

    async showApp() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-layout').classList.add('active');

        // Show version in sidebar
        const verEl = document.getElementById('app-version');
        if (verEl) verEl.textContent = APP_VERSION;

        initSupabase();

        this.settings = await loadSettings();
        this.templates = await loadTemplates();
        this.params = getProductionParams(this.settings);

        this.handleRoute();
    },

    // === ROUTING ===

    handleRoute() {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        const parts = hash.split('/');
        const page = parts[0];
        const subId = parts[1] || null;
        this.navigate(page, false, subId);
    },

    navigate(page, pushHash = true, subId = null) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        const target = document.getElementById('page-' + page);
        if (target) {
            target.classList.add('active');
            this.currentPage = page;
        } else {
            document.getElementById('page-dashboard').classList.add('active');
            this.currentPage = 'dashboard';
        }

        // Highlight sidebar (order-detail highlights 'orders')
        const navPage = page === 'order-detail' ? 'orders' : this.currentPage;
        document.querySelectorAll('.sidebar-nav a').forEach(a => {
            a.classList.toggle('active', a.dataset.page === navPage);
        });

        if (pushHash) {
            window.location.hash = subId ? this.currentPage + '/' + subId : this.currentPage;
        }

        this.onPageEnter(this.currentPage, subId);
    },

    onPageEnter(page, subId) {
        switch (page) {
            case 'dashboard': Dashboard.load(); break;
            case 'calculator': Calculator.init(); break;
            case 'orders': Orders.loadList(); break;
            case 'order-detail': if (subId) OrderDetail.load(parseInt(subId)); break;
            case 'factual': Factual.load(); break;
            case 'analytics': Analytics.load(); break;
            case 'molds': Molds.load(); break;
            case 'colors': Colors.load(); break;
            case 'timetrack': TimeTrack.load(); break;
            case 'tasks': Tasks.load(); Tasks.populateFilters(); break;
            case 'gantt': Gantt.load(); break;
            case 'import': Import.load(); break;
            case 'warehouse': Warehouse.load(); break;
            case 'china': ChinaPurchases.load(); break;
            case 'settings': Settings.load(); break;
        }
    },

    // === TOAST ===

    toast(message, duration = 3000) {
        const el = document.getElementById('toast');
        el.textContent = message;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), duration);
    },

    // === UTILS ===

    formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    statusLabel(status) {
        const map = {
            draft: 'Черновик',
            calculated: 'Рассчитан',
            in_production: 'В производстве',
            completed: 'Выполнен',
            cancelled: 'Отменен',
            deleted: 'Удалён',
        };
        return map[status] || status;
    },
};

// =============================================
// Calculator UI (form logic, live recalculation)
// Restructured: printings[] in items,
// hardware[] and packaging[] as separate order-level arrays
// =============================================

const Calculator = {
    items: [],          // Product items (max 6)
    hardwareItems: [],  // Hardware items (unlimited)
    packagingItems: [], // Packaging items (unlimited)
    maxItems: 6,

    async init() {
        // Ensure colors are loaded for color picker
        try {
            if (!Colors.data || Colors.data.length === 0) {
                Colors.data = await loadColors();
            }
        } catch (e) { console.error('[Calculator.init] loadColors error:', e); }

        if (this.items.length === 0 && !App.editingOrderId) {
            this.resetForm();
            this.addItem();
        }
        // Close mold picker & color picker on outside click
        if (!this._moldPickerBound) {
            this._moldPickerBound = true;
            document.addEventListener('click', (e) => {
                if (!e.target.closest('.mold-picker')) {
                    document.querySelectorAll('.mold-picker-dropdown').forEach(d => d.style.display = 'none');
                }
                if (!e.target.closest('.color-picker')) {
                    document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
                }
            });
        }
    },

    resetForm() {
        App.editingOrderId = null;
        document.getElementById('calc-order-name').value = '';
        document.getElementById('calc-client-name').value = '';
        document.getElementById('calc-manager-name').value = '';
        document.getElementById('calc-deadline-start').value = '';
        document.getElementById('calc-deadline-end').value = '';
        document.getElementById('calc-notes').value = '';
        this.items = [];
        this.hardwareItems = [];
        this.packagingItems = [];
        document.getElementById('calc-items-container').innerHTML = '';
        document.getElementById('calc-hardware-list').innerHTML = '';
        document.getElementById('calc-packaging-list').innerHTML = '';
        document.getElementById('calc-production-load').style.display = 'none';
        document.getElementById('calc-findirector').style.display = 'none';
        document.getElementById('calc-summary-footer').style.display = 'none';
        const pricingEl = document.getElementById('calc-pricing');
        if (pricingEl) pricingEl.style.display = 'none';
        document.getElementById('calc-add-item-btn').style.display = '';
        const historyEl = document.getElementById('calc-history');
        if (historyEl) historyEl.style.display = 'none';
    },

    // ==========================================
    // PRODUCT ITEMS
    // ==========================================

    addItem() {
        if (this.items.length >= this.maxItems) {
            App.toast('Максимум 6 изделий в заказе');
            return;
        }

        const idx = this.items.length;
        this.items.push(this.getEmptyItem(idx + 1));
        this.renderItemBlock(idx);

        if (this.items.length >= this.maxItems) {
            document.getElementById('calc-add-item-btn').style.display = 'none';
        }
    },

    getEmptyItem(num) {
        return {
            item_number: num,
            product_name: '',
            quantity: 0,
            pieces_per_hour: 0,
            weight_grams: 0,
            extra_molds: 0,
            complex_design: false,
            is_blank_mold: false,
            is_nfc: false,
            nfc_programming: false,
            delivery_included: false,
            // Multiple printings
            printings: [],
            // Built-in hardware from blank template
            builtin_hw_name: '',
            builtin_hw_price: 0,
            builtin_hw_delivery_total: 0,
            builtin_hw_speed: 0,
            // Color
            color_id: null,
            color_name: '',
            // Sell prices
            sell_price_item: 0,
            sell_price_printing: 0,
            result: null,
            template_id: null,
        };
    },

    renderItemBlock(idx) {
        const item = this.items[idx];
        const num = idx + 1;
        const container = document.getElementById('calc-items-container');

        // Build visual mold picker (with photos)
        let moldPickerHtml = '';
        try { if (App.templates) {
            const blanks = App.templates.filter(t => t.category === 'blank');
            const selectedMold = blanks.find(t => t.id == item.template_id);
            const selectedHtml = selectedMold
                ? `<div style="display:flex;gap:8px;align-items:center;">
                    ${selectedMold.photo_url ? `<img src="${this._escAttr(selectedMold.photo_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">` : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:14px;font-weight:700;color:var(--accent)">${(selectedMold.name || '?')[0]}</span>`}
                    <div><div style="font-weight:600;font-size:13px">${this._esc(selectedMold.name)}</div><div style="font-size:10px;color:var(--text-muted)">${selectedMold.pieces_per_hour_display} шт/ч · ${selectedMold.weight_grams || 0}г${selectedMold.hw_name ? ' · <span style="color:var(--accent)">+ ' + this._esc(selectedMold.hw_name) + '</span>' : ''}</div></div>
                   </div>`
                : '<span style="color:var(--text-muted);font-size:13px">-- Выбрать бланк --</span>';

            const itemsHtml = blanks.map(t => {
                const photo = t.photo_url
                    ? `<img src="${this._escAttr(t.photo_url)}" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0">`
                    : `<span style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:16px;font-weight:700;color:var(--accent);flex-shrink:0">${(t.name || '?')[0]}</span>`;
                const isSelected = item.template_id == t.id;
                return `<div class="mold-picker-item ${isSelected ? 'selected' : ''}" onclick="Calculator.onTemplatePickerSelect(${idx}, ${t.id})" style="display:flex;gap:8px;align-items:center;padding:6px 8px;cursor:pointer;border-radius:6px;${isSelected ? 'background:var(--accent-light)' : ''}">
                    ${photo}
                    <div style="flex:1;min-width:0">
                        <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._esc(t.name)}</div>
                        <div style="font-size:10px;color:var(--text-muted)">${t.pieces_per_hour_display} шт/ч · ${t.weight_grams || 0}г${t.hw_name ? ' · <span style="color:var(--accent)">+ ' + this._esc(t.hw_name) + '</span>' : ''}${t.collection ? ' · ' + this._esc(t.collection) : ''}</div>
                    </div>
                </div>`;
            }).join('');

            moldPickerHtml = `
            <div class="mold-picker" id="mold-picker-${idx}">
                <div class="mold-picker-selected" onclick="Calculator.toggleMoldPicker(${idx})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;background:var(--card-bg)">
                    ${selectedHtml}
                    <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;margin-left:8px">&#9662;</span>
                </div>
                <div class="mold-picker-dropdown" id="mold-picker-dd-${idx}" style="display:none;position:absolute;z-index:100;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-lg);max-height:300px;overflow:hidden;width:100%">
                    <div style="padding:6px 8px;border-bottom:1px solid var(--border)">
                        <input type="text" placeholder="Поиск бланка..." oninput="Calculator.filterMoldPicker(${idx}, this.value)" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                    </div>
                    <div class="mold-picker-list" id="mold-picker-list-${idx}" style="max-height:250px;overflow-y:auto;padding:4px">${itemsHtml}</div>
                </div>
            </div>`;
        }
        } catch (err) { console.error('[renderItemBlock] Mold picker error:', err); moldPickerHtml = '<p style="color:var(--red);font-size:11px">Ошибка загрузки справочника</p>'; }

        // Render printings
        let printingsHtml = '';
        (item.printings || []).forEach((pr, pi) => {
            printingsHtml += this.renderPrintingRow(idx, pi, pr);
        });

        // Build color picker
        let colorPickerHtml = '';
        try {
            const colors = Colors.data || [];
            if (colors.length > 0) {
                const selectedColor = colors.find(c => c.id == item.color_id);
                const selectedColorHtml = selectedColor
                    ? `<div style="display:flex;gap:8px;align-items:center;">
                        ${selectedColor.photo_url ? `<img src="${this._escAttr(selectedColor.photo_url)}" style="width:32px;height:32px;object-fit:cover;border-radius:50%;border:1px solid var(--border)">` : `<span style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:50%;font-size:12px;font-weight:700;color:var(--accent)">${(selectedColor.name || '?')[0]}</span>`}
                        <div><span style="font-size:11px;color:var(--text-muted)">${this._esc(selectedColor.number)}</span> <span style="font-weight:600;font-size:13px">${this._esc(selectedColor.name)}</span></div>
                       </div>`
                    : '<span style="color:var(--text-muted);font-size:13px">-- Выбрать цвет --</span>';

                const colorItemsHtml = colors.map(c => {
                    const photo = c.photo_url
                        ? `<img src="${this._escAttr(c.photo_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:50%;border:1px solid var(--border);flex-shrink:0">`
                        : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:50%;font-size:14px;font-weight:700;color:var(--accent);flex-shrink:0">${(c.name || '?')[0]}</span>`;
                    const isSelected = item.color_id == c.id;
                    return `<div class="color-picker-item ${isSelected ? 'selected' : ''}" onclick="Calculator.onColorSelect(${idx}, ${c.id})" style="display:flex;gap:8px;align-items:center;padding:5px 8px;cursor:pointer;border-radius:6px;${isSelected ? 'background:var(--accent-light)' : ''}">
                        ${photo}
                        <div style="flex:1;min-width:0">
                            <span style="font-size:11px;color:var(--text-muted)">${this._esc(c.number)}</span>
                            <span style="font-size:12px;font-weight:600">${this._esc(c.name)}</span>
                        </div>
                    </div>`;
                }).join('');

                colorPickerHtml = `
                <div class="form-group" style="position:relative">
                    <label>Цветовое решение</label>
                    <div class="color-picker" id="color-picker-${idx}">
                        <div class="color-picker-selected" onclick="Calculator.toggleColorPicker(${idx})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;background:var(--card-bg)">
                            ${selectedColorHtml}
                            <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;margin-left:8px">&#9662;</span>
                        </div>
                        <div class="color-picker-dropdown" id="color-picker-dd-${idx}" style="display:none;position:absolute;z-index:100;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-lg);max-height:280px;overflow:hidden;width:100%">
                            <div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;gap:4px">
                                <input type="text" placeholder="Поиск цвета..." oninput="Calculator.filterColorPicker(${idx}, this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                                <button class="btn btn-sm btn-outline" onclick="Calculator.clearColor(${idx})" title="Убрать цвет" style="padding:4px 8px;font-size:10px;">&#10005;</button>
                            </div>
                            <div class="color-picker-list" id="color-picker-list-${idx}" style="max-height:220px;overflow-y:auto;padding:4px">${colorItemsHtml}</div>
                        </div>
                    </div>
                </div>`;
            }
        } catch (e) { console.error('[renderItemBlock] Color picker error:', e); }

        const html = `
        <div class="item-block" id="item-block-${idx}">
            <div class="item-block-header">
                <div class="item-num">${num}</div>
                <div class="item-title" id="item-title-${idx}">${item.product_name || 'Изделие ' + num}</div>
                <button class="btn btn-sm btn-outline" onclick="Calculator.removeItem(${idx})">Удалить</button>
            </div>

            <!-- Step 1: Тип формы -->
            <div class="form-group">
                <label>Тип формы</label>
                <div class="mold-type-toggle" id="mold-type-${idx}">
                    <button class="mold-type-btn ${item.is_blank_mold ? 'active' : ''}" data-type="blank" onclick="Calculator.setMoldType(${idx}, true)">Бланковая</button>
                    <button class="mold-type-btn ${!item.is_blank_mold ? 'active' : ''}" data-type="custom" onclick="Calculator.setMoldType(${idx}, false)">Кастомная</button>
                </div>
                <span class="form-hint" id="mold-type-hint-${idx}">${item.is_blank_mold ? 'Амортизация на 4500 шт (макс. ресурс)' : 'Амортизация на тираж заказа'}</span>
            </div>

            <!-- Step 2: Справочник бланков (только для бланковой формы) -->
            <div class="form-group template-select" id="template-wrap-${idx}" style="${item.is_blank_mold ? '' : 'display:none'};position:relative">
                <label>Бланк из справочника</label>
                ${moldPickerHtml}
                <span id="item-hw-badge-${idx}" style="display:${item.builtin_hw_name ? '' : 'none'};font-size:11px;color:var(--accent);margin-top:4px;font-weight:600;">+ ${item.builtin_hw_name || ''}</span>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Название изделия</label>
                    <input type="text" value="${item.product_name}" id="item-name-${idx}" onchange="Calculator.onFieldChange(${idx}, 'product_name', this.value)">
                </div>
                <div class="form-group">
                    <label>Количество (шт)</label>
                    <input type="number" min="0" value="${item.quantity || ''}" oninput="Calculator.onNumChange(${idx}, 'quantity', this.value)">
                </div>
                <div class="form-group">
                    <label>Шт/час</label>
                    <input type="number" min="0" value="${item.pieces_per_hour || ''}" id="item-pph-${idx}" oninput="Calculator.onNumChange(${idx}, 'pieces_per_hour', this.value)">
                </div>
                <div class="form-group">
                    <label>Вес (г)</label>
                    <input type="number" min="0" value="${item.weight_grams || ''}" id="item-weight-${idx}" oninput="Calculator.onNumChange(${idx}, 'weight_grams', this.value)">
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Доп. молды</label>
                    <input type="number" min="0" value="${item.extra_molds || 0}" oninput="Calculator.onNumChange(${idx}, 'extra_molds', this.value)">
                </div>
            </div>

            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-complex-${idx}" ${item.complex_design ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'complex_design', this.checked)">
                <label for="item-complex-${idx}">Сложное проектирование (+${formatRub(App.settings.design_cost)})</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-nfc-${idx}" ${item.is_nfc ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'is_nfc', this.checked)">
                <label for="item-nfc-${idx}">NFC метка (+${formatRub(App.settings.nfc_tag_cost)}/шт)</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-nfcprog-${idx}" ${item.nfc_programming ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'nfc_programming', this.checked)">
                <label for="item-nfcprog-${idx}">Программирование NFC</label>
            </div>
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-delivery-${idx}" ${item.delivery_included ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'delivery_included', this.checked)">
                <label for="item-delivery-${idx}">Доставка за наш счет (+${formatRub(App.settings.delivery_cost_moscow)})</label>
            </div>

            <!-- Нанесение (multiple) -->
            <div class="section-title">Нанесение</div>
            <div id="printings-list-${idx}">${printingsHtml}</div>
            <button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="Calculator.addPrinting(${idx})">+ Нанесение</button>

            <!-- Цветовое решение (per item) -->
            ${colorPickerHtml}

            <!-- Cost breakdown (calculated) -->
            <div class="cost-breakdown" id="item-cost-${idx}" style="display:none">
                <div class="section-title" style="margin-top:0">Себестоимость изделия (за 1 шт)</div>
                <div class="cost-row"><span class="cost-label">ФОТ производство</span><span class="cost-value" id="c-${idx}-fot">0</span></div>
                <div class="cost-row"><span class="cost-label">Косвенные расходы</span><span class="cost-value" id="c-${idx}-indirect">0</span></div>
                <div class="cost-row"><span class="cost-label">Пластик</span><span class="cost-value" id="c-${idx}-plastic">0</span></div>
                <div class="cost-row"><span class="cost-label">Амортизация молда</span><span class="cost-value" id="c-${idx}-mold">0</span></div>
                <div class="cost-row"><span class="cost-label">Проектирование</span><span class="cost-value" id="c-${idx}-design">0</span></div>
                <div class="cost-row"><span class="cost-label">Срезка лейника (ФОТ)</span><span class="cost-value" id="c-${idx}-cutting">0</span></div>
                <div class="cost-row"><span class="cost-label">NFC метка</span><span class="cost-value" id="c-${idx}-nfc-tag">0</span></div>
                <div class="cost-row"><span class="cost-label">NFC программирование</span><span class="cost-value" id="c-${idx}-nfc-prog">0</span></div>
                <div class="cost-row"><span class="cost-label">NFC (косв.)</span><span class="cost-value" id="c-${idx}-nfc-ind">0</span></div>
                <div class="cost-row"><span class="cost-label">Встроенная фурнитура</span><span class="cost-value" id="c-${idx}-builtin-hw">0</span></div>
                <div class="cost-row"><span class="cost-label">Нанесение</span><span class="cost-value" id="c-${idx}-printing">0</span></div>
                <div class="cost-row"><span class="cost-label">Доставка</span><span class="cost-value" id="c-${idx}-delivery">0</span></div>
                <div class="cost-row cost-total"><span class="cost-label">ИТОГО себестоимость</span><span class="cost-value" id="c-${idx}-total">0</span></div>
            </div>

        </div>`;

        // Replace existing block if re-rendering, otherwise append
        const existingBlock = document.getElementById('item-block-' + idx);
        if (existingBlock) {
            existingBlock.outerHTML = html;
        } else {
            container.insertAdjacentHTML('beforeend', html);
        }
    },

    // ==========================================
    // PRINTINGS (inside items)
    // ==========================================

    PRINTING_TYPES: ['УФ', 'Тампо', 'Шелкография', 'По DXF наклейка'],

    renderPrintingRow(itemIdx, printIdx, pr) {
        const opts = this.PRINTING_TYPES.map(t => {
            const sel = (pr.name === t) ? ' selected' : '';
            return `<option value="${t}"${sel}>${t}</option>`;
        }).join('');
        return `
        <div class="printing-row form-row" id="printing-${itemIdx}-${printIdx}" style="align-items:end">
            <div class="form-group" style="margin:0">
                <label>Тип нанесения</label>
                <select onchange="Calculator.onPrintingChange(${itemIdx}, ${printIdx}, 'name', this.value)">
                    <option value="">-- Выбрать --</option>
                    ${opts}
                </select>
            </div>
            <div class="form-group" style="margin:0">
                <label>Кол-во</label>
                <input type="number" min="0" value="${pr.qty || ''}" oninput="Calculator.onPrintingChange(${itemIdx}, ${printIdx}, 'qty', this.value)">
            </div>
            <div class="form-group" style="margin:0">
                <label>Цена за шт</label>
                <input type="number" min="0" step="0.01" value="${pr.price || ''}" oninput="Calculator.onPrintingChange(${itemIdx}, ${printIdx}, 'price', this.value)">
            </div>
            <button class="btn-remove" title="Удалить нанесение" onclick="Calculator.removePrinting(${itemIdx}, ${printIdx})">&#10005;</button>
        </div>`;
    },

    addPrinting(itemIdx) {
        this.items[itemIdx].printings.push({ name: '', qty: 0, price: 0, sell_price: 0 });
        const pi = this.items[itemIdx].printings.length - 1;
        const list = document.getElementById('printings-list-' + itemIdx);
        list.insertAdjacentHTML('beforeend', this.renderPrintingRow(itemIdx, pi, this.items[itemIdx].printings[pi]));
    },

    removePrinting(itemIdx, printIdx) {
        this.items[itemIdx].printings.splice(printIdx, 1);
        this.rerenderPrintings(itemIdx);
        this.recalculate();
    },

    rerenderPrintings(itemIdx) {
        const list = document.getElementById('printings-list-' + itemIdx);
        list.innerHTML = '';
        this.items[itemIdx].printings.forEach((pr, pi) => {
            list.insertAdjacentHTML('beforeend', this.renderPrintingRow(itemIdx, pi, pr));
        });
    },

    onPrintingChange(itemIdx, printIdx, field, value) {
        if (field === 'name') {
            this.items[itemIdx].printings[printIdx].name = value;
        } else {
            this.items[itemIdx].printings[printIdx][field] = parseFloat(value) || 0;
            this.recalculate();
        }
    },

    // ==========================================
    // HARDWARE ITEMS (order-level, separate section)
    // ==========================================

    getEmptyHardware() {
        return {
            source: 'warehouse',        // 'warehouse' | 'custom'
            warehouse_item_id: null,    // id позиции со склада
            warehouse_sku: '',          // артикул (для истории)
            name: '',
            qty: 0,
            assembly_speed: 0,      // шт/ч (calculated from minutes)
            assembly_minutes: 0,    // мин/шт (user input)
            price: 0,
            delivery_total: 0,    // Total delivery cost (not per unit)
            delivery_price: 0,    // Calculated: delivery_total / qty
            sell_price: 0,
            result: null,
        };
    },

    // Cached warehouse items for picker (loaded once per session)
    _whPickerData: null,
    _whPickerLoading: false,

    async _ensureWhPickerData() {
        if (this._whPickerData) return this._whPickerData;
        if (this._whPickerLoading) {
            // Wait for loading to finish
            while (this._whPickerLoading) await new Promise(r => setTimeout(r, 50));
            return this._whPickerData;
        }
        this._whPickerLoading = true;
        try {
            this._whPickerData = await Warehouse.getItemsForPicker();
        } catch (e) {
            console.error('[Calculator] Failed to load warehouse items:', e);
            this._whPickerData = {};
        }
        this._whPickerLoading = false;
        return this._whPickerData;
    },

    // Find a warehouse item by id across all categories
    _findWhItem(id) {
        if (!this._whPickerData) return null;
        for (const catKey of Object.keys(this._whPickerData)) {
            const found = this._whPickerData[catKey].items.find(i => i.id === id);
            if (found) return found;
        }
        return null;
    },

    async addHardware() {
        try {
            const idx = this.hardwareItems.length;
            this.hardwareItems.push(this.getEmptyHardware());
            await this._ensureWhPickerData();
            this.renderHardwareRow(idx);
        } catch (err) {
            console.error('[addHardware] error:', err);
            App.toast('Ошибка добавления фурнитуры: ' + err.message);
        }
    },

    renderHardwareRow(idx) {
        const hw = this.hardwareItems[idx];
        const minsDisplay = hw.assembly_minutes || '';
        const isWarehouse = hw.source === 'warehouse';
        const isCustom = hw.source === 'custom';
        const list = document.getElementById('calc-hardware-list');

        // Build warehouse picker (hardware only — exclude packaging)
        let pickerHtml = '';
        if (this._whPickerData) {
            pickerHtml = Warehouse.buildImagePicker(`hw-picker-${idx}`, this._whPickerData, hw.warehouse_item_id, 'Calculator.onHwWarehouseSelect', 'hardware');
        }

        // Max qty from warehouse
        const whItem = (isWarehouse && hw.warehouse_item_id) ? this._findWhItem(hw.warehouse_item_id) : null;
        const maxQty = whItem ? whItem.available_qty : '';
        const maxAttr = whItem ? ` max="${whItem.available_qty}"` : '';

        const html = `
        <div class="hw-row" id="hw-row-${idx}" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="hw-source-toggle">
                    <label class="${isWarehouse ? 'src-active' : ''}">
                        <input type="radio" name="hw-src-${idx}" value="warehouse" ${isWarehouse ? 'checked' : ''} onchange="Calculator.onHwSourceChange(${idx}, 'warehouse')" style="display:none;">
                        &#128230; Со склада
                    </label>
                    <label class="${isCustom ? 'src-active' : ''}">
                        <input type="radio" name="hw-src-${idx}" value="custom" ${isCustom ? 'checked' : ''} onchange="Calculator.onHwSourceChange(${idx}, 'custom')" style="display:none;">
                        &#9998; Кастомная
                    </label>
                </div>
                <button class="btn-remove" title="Удалить фурнитуру" onclick="Calculator.removeHardware(${idx})">&#10005;</button>
            </div>

            ${isWarehouse ? `
            <!-- WAREHOUSE MODE -->
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:2;">
                    <label>Позиция со склада</label>
                    ${pickerHtml}
                </div>
                <div class="form-group" style="margin:0">
                    <label>Кол-во${maxQty !== '' ? ` <span style="font-size:10px;color:var(--text-muted);">(макс: ${maxQty})</span>` : ''}</label>
                    <input type="number" min="0"${maxAttr} value="${hw.qty || ''}" oninput="Calculator.onHwNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Сборка (мин/шт)</label>
                    <input type="number" min="0" step="0.1" value="${minsDisplay}" oninput="Calculator.onHwMinutes(${idx}, this.value)" placeholder="напр. 0.5">
                </div>
            </div>
            ` : `
            <!-- CUSTOM MODE -->
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0">
                    <label>Название</label>
                    <input type="text" value="${hw.name || ''}" placeholder="Карабин, кольцо, магнит..." onchange="Calculator.onHwField(${idx}, 'name', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Кол-во</label>
                    <input type="number" min="0" value="${hw.qty || ''}" oninput="Calculator.onHwNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Сборка (мин/шт)</label>
                    <input type="number" min="0" step="0.1" value="${minsDisplay}" oninput="Calculator.onHwMinutes(${idx}, this.value)" placeholder="напр. 0.5">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Закупка (&#8381;/шт)</label>
                    <input type="number" min="0" step="0.01" value="${hw.price || ''}" oninput="Calculator.onHwNum(${idx}, 'price', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Доставка (&#8381; всего)</label>
                    <input type="number" min="0" step="0.01" value="${hw.delivery_total || ''}" oninput="Calculator.onHwNum(${idx}, 'delivery_total', this.value)">
                </div>
            </div>
            `}

            <div class="cost-breakdown" id="hw-cost-${idx}" style="display:none">
                <div class="section-title" style="margin-top:0">Себестоимость фурнитуры (за 1 шт)</div>
                <div class="cost-row"><span class="cost-label">ФОТ сборка</span><span class="cost-value" id="hw-${idx}-fot">0</span></div>
                <div class="cost-row"><span class="cost-label">Закупка</span><span class="cost-value" id="hw-${idx}-purchase">0</span></div>
                <div class="cost-row"><span class="cost-label">Доставка (на шт)</span><span class="cost-value" id="hw-${idx}-delivery">0</span></div>
                <div class="cost-row cost-total"><span class="cost-label">ИТОГО себестоимость</span><span class="cost-value" id="hw-${idx}-total">0</span></div>
            </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    },

    removeHardware(idx) {
        this.hardwareItems.splice(idx, 1);
        this.rerenderAllHardware();
        this.recalculate();
    },

    rerenderAllHardware() {
        const list = document.getElementById('calc-hardware-list');
        list.innerHTML = '';
        this.hardwareItems.forEach((_, i) => this.renderHardwareRow(i));
    },

    onHwSourceChange(idx, source) {
        const hw = this.hardwareItems[idx];
        hw.source = source;
        if (source === 'custom') {
            // Clear warehouse link, keep name
            hw.warehouse_item_id = null;
            hw.warehouse_sku = '';
        } else {
            // Clear custom fields when switching to warehouse
            hw.name = '';
            hw.price = 0;
            hw.delivery_total = 0;
            hw.delivery_price = 0;
            hw.warehouse_item_id = null;
            hw.warehouse_sku = '';
        }
        this.rerenderAllHardware();
        this.recalculate();
    },

    onHwWarehouseSelect(idx, itemIdStr) {
        const hw = this.hardwareItems[idx];
        // Close any open picker dropdowns
        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');

        const itemId = parseInt(itemIdStr) || null;

        if (!itemId) {
            hw.warehouse_item_id = null;
            hw.warehouse_sku = '';
            hw.name = '';
            hw.price = 0;
            hw.delivery_total = 0;
            hw.delivery_price = 0;
            this.rerenderAllHardware();
            this.recalculate();
            return;
        }

        const whItem = this._findWhItem(itemId);
        if (!whItem) return;

        // Populate from warehouse item
        hw.warehouse_item_id = whItem.id;
        hw.warehouse_sku = whItem.sku || '';
        const parts = [whItem.name];
        if (whItem.size) parts.push(whItem.size);
        if (whItem.color) parts.push(whItem.color);
        hw.name = parts.join(' · ');
        hw.price = whItem.price_per_unit || 0;  // Закупка + доставка уже включена
        hw.delivery_total = 0;
        hw.delivery_price = 0;

        this.rerenderAllHardware();
        this.recalculate();
    },

    onHwField(idx, field, value) {
        this.hardwareItems[idx][field] = value;
    },

    onHwNum(idx, field, value) {
        this.hardwareItems[idx][field] = parseFloat(value) || 0;
        const hw = this.hardwareItems[idx];
        // Enforce max qty for warehouse items
        if (field === 'qty' && hw.source === 'warehouse' && hw.warehouse_item_id) {
            const whItem = this._findWhItem(hw.warehouse_item_id);
            if (whItem && hw.qty > whItem.available_qty) {
                hw.qty = whItem.available_qty;
                App.toast(`Максимум на складе: ${whItem.available_qty} ${whItem.unit}`);
            }
        }
        // Auto-calculate per-unit delivery from total
        hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : 0;
        this.recalculate();
    },

    onHwMinutes(idx, value) {
        const mins = parseFloat(value) || 0;
        this.hardwareItems[idx].assembly_minutes = mins;
        // Convert minutes per unit → pieces per hour
        this.hardwareItems[idx].assembly_speed = mins > 0 ? round2(60 / mins) : 0;
        this.recalculate();
    },

    // ==========================================
    // PACKAGING ITEMS (order-level, separate section)
    // ==========================================

    getEmptyPackaging() {
        return {
            source: 'warehouse',        // 'warehouse' | 'custom'
            warehouse_item_id: null,
            warehouse_sku: '',
            name: '',
            qty: 0,
            assembly_speed: 0,      // шт/ч (calculated from minutes)
            assembly_minutes: 0,    // мин/шт (user input)
            price: 0,
            delivery_total: 0,    // Total delivery cost
            delivery_price: 0,    // Calculated: delivery_total / qty
            sell_price: 0,
            result: null,
        };
    },

    async addPackaging() {
        try {
            const idx = this.packagingItems.length;
            this.packagingItems.push(this.getEmptyPackaging());
            await this._ensureWhPickerData();
            this.renderPackagingRow(idx);
        } catch (err) {
            console.error('[addPackaging] error:', err);
            App.toast('Ошибка добавления упаковки: ' + err.message);
        }
    },

    renderPackagingRow(idx) {
        const pkg = this.packagingItems[idx];
        const minsDisplay = pkg.assembly_minutes || '';
        const isWarehouse = pkg.source === 'warehouse';
        const isCustom = pkg.source === 'custom';
        const list = document.getElementById('calc-packaging-list');

        // Build warehouse picker (packaging only)
        let pickerHtml = '';
        if (this._whPickerData) {
            pickerHtml = Warehouse.buildImagePicker(`pkg-picker-${idx}`, this._whPickerData, pkg.warehouse_item_id, 'Calculator.onPkgWarehouseSelect', 'packaging');
        }

        // Max qty from warehouse
        const whItem = (isWarehouse && pkg.warehouse_item_id) ? this._findWhItem(pkg.warehouse_item_id) : null;
        const maxQty = whItem ? whItem.available_qty : '';
        const maxAttr = whItem ? ` max="${whItem.available_qty}"` : '';

        const html = `
        <div class="pkg-row" id="pkg-row-${idx}" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="pkg-source-toggle">
                    <label class="${isWarehouse ? 'src-active' : ''}">
                        <input type="radio" name="pkg-src-${idx}" value="warehouse" ${isWarehouse ? 'checked' : ''} onchange="Calculator.onPkgSourceChange(${idx}, 'warehouse')" style="display:none;">
                        &#128230; Со склада
                    </label>
                    <label class="${isCustom ? 'src-active' : ''}">
                        <input type="radio" name="pkg-src-${idx}" value="custom" ${isCustom ? 'checked' : ''} onchange="Calculator.onPkgSourceChange(${idx}, 'custom')" style="display:none;">
                        &#9998; Кастомная
                    </label>
                </div>
                <button class="btn-remove" title="Удалить упаковку" onclick="Calculator.removePackaging(${idx})">&#10005;</button>
            </div>

            ${isWarehouse ? `
            <!-- WAREHOUSE MODE -->
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:2;">
                    <label>Позиция со склада</label>
                    ${pickerHtml}
                </div>
                <div class="form-group" style="margin:0">
                    <label>Кол-во${maxQty !== '' ? ` <span style="font-size:10px;color:var(--text-muted);">(макс: ${maxQty})</span>` : ''}</label>
                    <input type="number" min="0"${maxAttr} value="${pkg.qty || ''}" oninput="Calculator.onPkgNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Сборка (мин/шт)</label>
                    <input type="number" min="0" step="0.1" value="${minsDisplay}" oninput="Calculator.onPkgMinutes(${idx}, this.value)" placeholder="напр. 0.5">
                </div>
            </div>
            ` : `
            <!-- CUSTOM MODE -->
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0">
                    <label>Название</label>
                    <input type="text" value="${pkg.name || ''}" placeholder="Мешочек, пакетик, коробка..." onchange="Calculator.onPkgField(${idx}, 'name', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Кол-во</label>
                    <input type="number" min="0" value="${pkg.qty || ''}" oninput="Calculator.onPkgNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Сборка (мин/шт)</label>
                    <input type="number" min="0" step="0.1" value="${minsDisplay}" oninput="Calculator.onPkgMinutes(${idx}, this.value)" placeholder="напр. 0.5">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Закупка (&#8381;/шт)</label>
                    <input type="number" min="0" step="0.01" value="${pkg.price || ''}" oninput="Calculator.onPkgNum(${idx}, 'price', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Доставка (&#8381; всего)</label>
                    <input type="number" min="0" step="0.01" value="${pkg.delivery_total || ''}" oninput="Calculator.onPkgNum(${idx}, 'delivery_total', this.value)">
                </div>
            </div>
            `}

            <div class="cost-breakdown" id="pkg-cost-${idx}" style="display:none">
                <div class="section-title" style="margin-top:0">Себестоимость упаковки (за 1 шт)</div>
                <div class="cost-row"><span class="cost-label">ФОТ сборка</span><span class="cost-value" id="pkg-${idx}-fot">0</span></div>
                <div class="cost-row"><span class="cost-label">Закупка</span><span class="cost-value" id="pkg-${idx}-purchase">0</span></div>
                <div class="cost-row"><span class="cost-label">Доставка (на шт)</span><span class="cost-value" id="pkg-${idx}-delivery">0</span></div>
                <div class="cost-row cost-total"><span class="cost-label">ИТОГО себестоимость</span><span class="cost-value" id="pkg-${idx}-total">0</span></div>
            </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    },

    removePackaging(idx) {
        this.packagingItems.splice(idx, 1);
        this.rerenderAllPackaging();
        this.recalculate();
    },

    rerenderAllPackaging() {
        const list = document.getElementById('calc-packaging-list');
        list.innerHTML = '';
        this.packagingItems.forEach((_, i) => this.renderPackagingRow(i));
    },

    onPkgSourceChange(idx, source) {
        const pkg = this.packagingItems[idx];
        pkg.source = source;
        if (source === 'custom') {
            pkg.warehouse_item_id = null;
            pkg.warehouse_sku = '';
        } else {
            pkg.name = '';
            pkg.price = 0;
            pkg.delivery_total = 0;
            pkg.delivery_price = 0;
            pkg.warehouse_item_id = null;
            pkg.warehouse_sku = '';
        }
        this.rerenderAllPackaging();
        this.recalculate();
    },

    onPkgWarehouseSelect(idx, itemIdStr) {
        const pkg = this.packagingItems[idx];
        document.querySelectorAll('.wh-picker-dropdown').forEach(d => d.style.display = 'none');
        const itemId = parseInt(itemIdStr) || null;
        if (!itemId) {
            pkg.warehouse_item_id = null;
            pkg.warehouse_sku = '';
            pkg.name = '';
            pkg.price = 0;
            pkg.delivery_total = 0;
            pkg.delivery_price = 0;
            this.rerenderAllPackaging();
            this.recalculate();
            return;
        }
        const whItem = this._findWhItem(itemId);
        if (!whItem) return;
        pkg.warehouse_item_id = whItem.id;
        pkg.warehouse_sku = whItem.sku || '';
        const parts = [whItem.name];
        if (whItem.size) parts.push(whItem.size);
        if (whItem.color) parts.push(whItem.color);
        pkg.name = parts.join(' · ');
        pkg.price = whItem.price_per_unit || 0;
        pkg.delivery_total = 0;
        pkg.delivery_price = 0;
        this.rerenderAllPackaging();
        this.recalculate();
    },

    onPkgField(idx, field, value) {
        this.packagingItems[idx][field] = value;
    },

    onPkgNum(idx, field, value) {
        this.packagingItems[idx][field] = parseFloat(value) || 0;
        const pkg = this.packagingItems[idx];
        // Enforce max qty for warehouse items
        if (field === 'qty' && pkg.source === 'warehouse' && pkg.warehouse_item_id) {
            const whItem = this._findWhItem(pkg.warehouse_item_id);
            if (whItem && pkg.qty > whItem.available_qty) {
                pkg.qty = whItem.available_qty;
                App.toast(`Максимум на складе: ${whItem.available_qty} ${whItem.unit}`);
            }
        }
        // Auto-calculate per-unit delivery from total
        pkg.delivery_price = pkg.qty > 0 ? round2(pkg.delivery_total / pkg.qty) : 0;
        this.recalculate();
    },

    onPkgMinutes(idx, value) {
        const mins = parseFloat(value) || 0;
        this.packagingItems[idx].assembly_minutes = mins;
        // Convert minutes per unit → pieces per hour
        this.packagingItems[idx].assembly_speed = mins > 0 ? round2(60 / mins) : 0;
        this.recalculate();
    },

    // ==========================================
    // ITEM EVENTS
    // ==========================================

    // Legacy: kept for backward compat if <select> still used somewhere
    onTemplateSelect(idx, selectEl) {
        const opt = selectEl.selectedOptions[0];
        if (!opt || !opt.value) return;
        this.onTemplatePickerSelect(idx, parseInt(opt.value));
    },

    // New visual picker
    onTemplatePickerSelect(idx, tplId) {
        const tpl = App.templates.find(t => t.id == tplId);
        if (!tpl) return;

        this.items[idx].template_id = tpl.id;
        this.items[idx].product_name = tpl.name;
        // Используем среднее между min и max — единая цена для заказчика
        // независимо от цвета/качества пластика
        const pphAvg = tpl.pieces_per_hour_avg || tpl.pieces_per_hour_min;
        this.items[idx].pieces_per_hour = pphAvg;
        this.items[idx].weight_grams = tpl.weight_grams || 0;
        this.items[idx].is_blank_mold = true;

        // Встроенная фурнитура бланка (зеркало, магнит и т.д.)
        this.items[idx].builtin_hw_name = tpl.hw_name || '';
        this.items[idx].builtin_hw_price = tpl.hw_price_per_unit || 0;
        this.items[idx].builtin_hw_delivery_total = tpl.hw_delivery_total || 0;
        this.items[idx].builtin_hw_speed = tpl.hw_speed || 0;

        document.getElementById('item-name-' + idx).value = tpl.name;
        document.getElementById('item-pph-' + idx).value = pphAvg;
        document.getElementById('item-weight-' + idx).value = tpl.weight_grams || '';
        document.getElementById('item-title-' + idx).textContent = tpl.name;

        // Show built-in hw badge
        const hwBadge = document.getElementById('item-hw-badge-' + idx);
        if (hwBadge) {
            if (tpl.hw_name) {
                hwBadge.style.display = '';
                hwBadge.textContent = '+ ' + tpl.hw_name;
            } else {
                hwBadge.style.display = 'none';
            }
        }

        // Close picker & re-render selected display
        this.closeMoldPicker(idx);
        this.rerenderItem(idx);
        this.recalculate();
    },

    toggleMoldPicker(idx) {
        const dd = document.getElementById('mold-picker-dd-' + idx);
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        // Close all pickers first
        document.querySelectorAll('.mold-picker-dropdown').forEach(d => d.style.display = 'none');
        document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
        if (!isOpen) {
            dd.style.display = '';
            // Focus search
            const input = dd.querySelector('input[type="text"]');
            if (input) input.focus();
        }
    },

    closeMoldPicker(idx) {
        const dd = document.getElementById('mold-picker-dd-' + idx);
        if (dd) dd.style.display = 'none';
    },

    filterMoldPicker(idx, query) {
        const list = document.getElementById('mold-picker-list-' + idx);
        if (!list) return;
        const q = (query || '').toLowerCase().trim();
        list.querySelectorAll('.mold-picker-item').forEach(el => {
            const text = el.textContent.toLowerCase();
            el.style.display = !q || text.includes(q) ? '' : 'none';
        });
    },

    // === COLOR PICKER ===

    toggleColorPicker(idx) {
        const dd = document.getElementById('color-picker-dd-' + idx);
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        // Close all color pickers first
        document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
        // Also close mold pickers
        document.querySelectorAll('.mold-picker-dropdown').forEach(d => d.style.display = 'none');
        if (!isOpen) {
            dd.style.display = '';
            const input = dd.querySelector('input[type="text"]');
            if (input) input.focus();
        }
    },

    onColorSelect(idx, colorId) {
        const colors = Colors.data || [];
        const color = colors.find(c => c.id === colorId);
        if (color) {
            this.items[idx].color_id = color.id;
            this.items[idx].color_name = color.name;
        }
        // Close dropdown and re-render
        document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
        this.renderItemBlock(idx);
    },

    clearColor(idx) {
        this.items[idx].color_id = null;
        this.items[idx].color_name = '';
        document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
        this.renderItemBlock(idx);
    },

    filterColorPicker(idx, query) {
        const list = document.getElementById('color-picker-list-' + idx);
        if (!list) return;
        const q = (query || '').toLowerCase().trim();
        list.querySelectorAll('.color-picker-item').forEach(el => {
            const text = el.textContent.toLowerCase();
            el.style.display = !q || text.includes(q) ? '' : 'none';
        });
    },

    setMoldType(idx, isBlank) {
        this.items[idx].is_blank_mold = isBlank;
        this.updateMoldTypeUI(idx, isBlank);
        // Clear template and built-in hw if switching to custom
        if (!isBlank) {
            this.items[idx].template_id = null;
            this.items[idx].builtin_hw_name = '';
            this.items[idx].builtin_hw_price = 0;
            this.items[idx].builtin_hw_delivery_total = 0;
            this.items[idx].builtin_hw_speed = 0;
            const hwBadge = document.getElementById('item-hw-badge-' + idx);
            if (hwBadge) hwBadge.style.display = 'none';
        }
        this.recalculate();
    },

    updateMoldTypeUI(idx, isBlank) {
        const toggle = document.getElementById('mold-type-' + idx);
        if (toggle) {
            toggle.querySelectorAll('.mold-type-btn').forEach(btn => {
                const isBtnBlank = btn.dataset.type === 'blank';
                btn.classList.toggle('active', isBtnBlank === isBlank);
            });
        }
        const hint = document.getElementById('mold-type-hint-' + idx);
        if (hint) {
            hint.textContent = isBlank ? 'Амортизация на 4500 шт (макс. ресурс)' : 'Амортизация на тираж заказа';
        }
        // Show/hide template dropdown
        const tplWrap = document.getElementById('template-wrap-' + idx);
        if (tplWrap) {
            tplWrap.style.display = isBlank ? '' : 'none';
        }
    },

    onFieldChange(idx, field, value) {
        this.items[idx][field] = value;
        if (field === 'product_name') {
            document.getElementById('item-title-' + idx).textContent = value || 'Изделие ' + (idx + 1);
        }
    },

    onNumChange(idx, field, value) {
        this.items[idx][field] = parseFloat(value) || 0;
        this.recalculate();
    },

    onToggle(idx, field, checked) {
        this.items[idx][field] = checked;
        this.recalculate();
    },

    removeItem(idx) {
        this.items.splice(idx, 1);
        this.items.forEach((item, i) => item.item_number = i + 1);
        const container = document.getElementById('calc-items-container');
        container.innerHTML = '';
        this.items.forEach((_, i) => this.renderItemBlock(i));
        document.getElementById('calc-add-item-btn').style.display = '';
        this.recalculate();
    },

    // ==========================================
    // RECALCULATE
    // ==========================================

    recalculate() {
        const params = App.params;
        if (!params) {
            console.warn('[recalculate] App.params is null, skipping');
            return;
        }

        try { this._doRecalculate(params); } catch (err) {
            console.error('[recalculate] CRASH:', err);
            App.toast('Ошибка расчёта: ' + err.message);
        }
    },

    _doRecalculate(params) {
        let hasData = false;

        // === Calculate product items ===
        this.items.forEach((item, idx) => {
            const result = calculateItemCost(item, params);
            item.result = result;

            const hasResult = isFinite(result.costTotal) && result.costTotal > 0;
            if (hasResult) hasData = true;

            const costEl = document.getElementById('item-cost-' + idx);
            if (costEl) costEl.style.display = hasResult ? '' : 'none';

            if (hasResult) {
                this.setText('c-' + idx + '-fot', formatRub(result.costFot));
                this.setText('c-' + idx + '-indirect', formatRub(result.costIndirect));
                this.setText('c-' + idx + '-plastic', formatRub(result.costPlastic));
                this.setText('c-' + idx + '-mold', formatRub(result.costMoldAmortization));
                this.setText('c-' + idx + '-design', formatRub(result.costDesign));
                this.setText('c-' + idx + '-cutting', formatRub(result.costCutting));
                this.setText('c-' + idx + '-nfc-tag', formatRub(result.costNfcTag));
                this.setText('c-' + idx + '-nfc-prog', formatRub(result.costNfcProgramming));
                this.setText('c-' + idx + '-nfc-ind', formatRub(result.costNfcIndirect));
                this.setText('c-' + idx + '-builtin-hw', formatRub(result.costBuiltinHw || 0));
                this.setText('c-' + idx + '-printing', formatRub(result.costPrinting));
                this.setText('c-' + idx + '-delivery', formatRub(result.costDelivery));
                this.setText('c-' + idx + '-total', formatRub(result.costTotal));

                // Store target at 40% for reference
                const costItemOnly = round2(result.costTotal - (result.costPrinting || 0));
                const calcTarget = (marginPct) => {
                    if (costItemOnly === 0) return 0;
                    const vatOnCost = costItemOnly * params.vatRate;
                    return round2((costItemOnly + vatOnCost) * (1 + marginPct) / (1 - params.taxRate - 0.065));
                };
                item.target_price_item = calcTarget(0.40);
            }
        });

        // === Calculate hardware items ===
        this.hardwareItems.forEach((hw, idx) => {
            const result = calculateHardwareCost(hw, params);
            hw.result = result;

            const hwCostEl = document.getElementById('hw-cost-' + idx);
            if (result.costPerUnit > 0) {
                hasData = true;
                const hwQty = hw.qty || 0;
                hw.target_price = calculateTargetPrice(result.costPerUnit, params, hwQty);

                // Show cost breakdown
                if (hwCostEl) hwCostEl.style.display = '';
                this.setText('hw-' + idx + '-fot', formatRub(result.fotPerUnit));
                this.setText('hw-' + idx + '-purchase', formatRub(hw.price || 0));
                this.setText('hw-' + idx + '-delivery', formatRub(hw.delivery_price || 0));
                this.setText('hw-' + idx + '-total', formatRub(result.costPerUnit));
            } else {
                if (hwCostEl) hwCostEl.style.display = 'none';
            }
        });

        // === Calculate packaging items ===
        this.packagingItems.forEach((pkg, idx) => {
            const result = calculatePackagingCost(pkg, params);
            pkg.result = result;

            const pkgCostEl = document.getElementById('pkg-cost-' + idx);
            if (result.costPerUnit > 0) {
                hasData = true;
                const pkgQty = pkg.qty || 0;
                pkg.target_price = calculateTargetPrice(result.costPerUnit, params, pkgQty);

                // Show cost breakdown
                if (pkgCostEl) pkgCostEl.style.display = '';
                this.setText('pkg-' + idx + '-fot', formatRub(result.fotPerUnit));
                this.setText('pkg-' + idx + '-purchase', formatRub(pkg.price || 0));
                this.setText('pkg-' + idx + '-delivery', formatRub(pkg.delivery_price || 0));
                this.setText('pkg-' + idx + '-total', formatRub(result.costPerUnit));
            } else {
                if (pkgCostEl) pkgCostEl.style.display = 'none';
            }
        });

        // === Unified pricing card ===
        this.renderPricingCard(params);

        // === Production load, FinDirector, Summary ===
        const loadEl = document.getElementById('calc-production-load');
        const finEl = document.getElementById('calc-findirector');
        const sumEl = document.getElementById('calc-summary-footer');

        if (hasData) {
            loadEl.style.display = '';
            finEl.style.display = '';
            sumEl.style.display = '';

            const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, params);
            this.setText('calc-hours-plastic', formatHours(load.hoursPlasticTotal));
            this.setText('calc-hours-packaging', formatHours(load.hoursPackagingTotal + load.hoursHardwareTotal));
            this.setText('calc-hours-total', formatHours(load.totalHours));
            this.setText('calc-load-plastic-pct', formatPercent(load.plasticLoadPercent) + ' от мощности');
            this.setText('calc-load-packaging-pct', formatPercent(load.packagingLoadPercent) + ' от мощности');
            this.setText('calc-days-1w', load.days1worker + ' дн');
            this.setText('calc-days-2w', load.days2workers + ' дн');
            this.setText('calc-days-3w', load.days3workers + ' дн');

            this.setLoadBar('calc-load-plastic-bar', load.plasticLoadPercent);
            this.setLoadBar('calc-load-packaging-bar', load.packagingLoadPercent);

            // FinDirector
            const fin = calculateFinDirectorData(this.items, this.hardwareItems, this.packagingItems, params);
            this.setText('fin-salary', formatRub(fin.salary));
            this.setText('fin-hardware', formatRub(fin.hardwarePurchase));
            this.setText('fin-hw-delivery', formatRub(fin.hardwareDelivery));
            this.setText('fin-packaging', formatRub(fin.packagingPurchase));
            this.setText('fin-pkg-delivery', formatRub(fin.packagingDelivery));
            this.setText('fin-design', formatRub(fin.design));
            this.setText('fin-printing', formatRub(fin.printing));
            this.setText('fin-plastic', formatRub(fin.plastic));
            this.setText('fin-molds', formatRub(fin.molds));
            this.setText('fin-delivery', formatRub(fin.delivery));
            this.setText('fin-taxes', formatRub(fin.taxes));
            this.setText('fin-total-costs', formatRub(fin.totalCosts));
            this.setText('fin-revenue', formatRub(fin.revenue));

            // Summary footer
            const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems);
            this.setText('sum-revenue', formatRub(summary.totalRevenue));
            this.setText('sum-earned', formatRub(summary.totalEarned));
            this.setText('sum-margin', formatPercent(summary.marginPercent));
            this.setText('sum-hours', formatHours(load.totalHours));
        } else {
            loadEl.style.display = 'none';
            finEl.style.display = 'none';
            sumEl.style.display = 'none';
            // Debug: why no data?
            if (this.items.some(i => i.quantity > 0)) {
                console.warn('[recalculate] hasData=false but items have qty>0. Params:', JSON.stringify({
                    fotPerHour: params.fotPerHour,
                    indirectPerHour: params.indirectPerHour,
                    plasticHours: params.plasticHours,
                    cuttingSpeed: params.cuttingSpeed,
                    workers: params.totalHoursAll,
                }));
                this.items.forEach((item, i) => {
                    if (item.quantity > 0) {
                        console.warn('  Item', i, ':', {
                            qty: item.quantity, pph: item.pieces_per_hour,
                            costTotal: item.result ? item.result.costTotal : 'no result',
                        });
                    }
                });
            }
        }
    },

    setLoadBar(barId, percent) {
        const bar = document.getElementById(barId);
        if (!bar) return;
        const clamped = Math.min(percent, 100);
        bar.style.width = clamped + '%';
        bar.className = 'load-bar-fill ' + (percent > 90 ? 'red' : percent > 70 ? 'yellow' : 'green');
    },

    setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    },

    // ==========================================
    // UNIFIED PRICING CARD
    // ==========================================

    renderPricingCard(params) {
        const pricingEl = document.getElementById('calc-pricing');
        const contentEl = document.getElementById('calc-pricing-content');
        if (!pricingEl || !contentEl) {
            console.warn('[renderPricingCard] DOM elements not found', { pricingEl: !!pricingEl, contentEl: !!contentEl });
            return;
        }

        // Collect all priced entities (with NaN/Infinity guard)
        const pricedItems = this.items.filter(it => it.result && isFinite(it.result.costTotal) && it.result.costTotal > 0);
        const pricedHw = this.hardwareItems.filter(hw => hw.result && isFinite(hw.result.costPerUnit) && hw.result.costPerUnit > 0);
        const pricedPkg = this.packagingItems.filter(pkg => pkg.result && isFinite(pkg.result.costPerUnit) && pkg.result.costPerUnit > 0);

        // Debug: log what's being filtered
        console.log('[renderPricingCard]', {
            items: this.items.length, pricedItems: pricedItems.length,
            hw: this.hardwareItems.length, pricedHw: pricedHw.length,
            pkg: this.packagingItems.length, pricedPkg: pricedPkg.length,
            itemCosts: this.items.map(i => i.result ? i.result.costTotal : 'no result'),
        });

        if (pricedItems.length === 0 && pricedHw.length === 0 && pricedPkg.length === 0) {
            pricingEl.style.display = 'none';
            return;
        }
        pricingEl.style.display = '';

        const calcTarget = (cost, marginPct) => {
            if (cost === 0) return 0;
            const vatOnCost = cost * params.vatRate;
            return round2((cost + vatOnCost) * (1 + marginPct) / (1 - params.taxRate - 0.065));
        };

        // Build columns: item, printing (per item), hw, pkg
        const columns = [];

        pricedItems.forEach((item, i) => {
            const globalIdx = this.items.indexOf(item);
            // Item cost WITHOUT printing (for separate pricing)
            const costWithPrinting = item.result.costTotal;
            const costPrintingPart = item.result.costPrinting || 0;
            const costItemOnly = round2(costWithPrinting - costPrintingPart);

            if (item.is_blank_mold) {
                // Blank mold: формула бланков с наценкой
                // цена = себест / (1 - маржа) / (1 - 0.11)
                const blankMargin = getBlankMargin(item.quantity || 500);
                const blankTarget = round2(costItemOnly / (1 - blankMargin) / (1 - 0.06 - 0.05));
                const blankSellPrice = roundTo5(blankTarget);
                // Auto-set sell_price_item for blanks if user hasn't entered a custom price
                if (!item.sell_price_item) {
                    item.sell_price_item = blankSellPrice;
                }
                columns.push({
                    label: item.product_name || 'Изделие ' + (i + 1),
                    type: 'item',
                    globalIdx,
                    isBlank: true,
                    cost: costItemOnly,
                    blankPrice: blankSellPrice,
                    sellPrice: item.sell_price_item || blankSellPrice,
                });
            } else {
                // Custom mold: show margin targets
                columns.push({
                    label: item.product_name || 'Изделие ' + (i + 1),
                    type: 'item',
                    globalIdx,
                    isBlank: false,
                    cost: costItemOnly,
                    t50: calcTarget(costItemOnly, 0.50),
                    t40: calcTarget(costItemOnly, 0.40),
                    t30: calcTarget(costItemOnly, 0.30),
                    t20: calcTarget(costItemOnly, 0.20),
                    sellPrice: item.sell_price_item || 0,
                });
            }

            // Printing columns — one per printing
            const printingDetails = item.result.costPrintingDetails || [];
            (item.printings || []).forEach((pr, pi) => {
                const prCost = printingDetails[pi] || 0;
                if (prCost > 0) {
                    const prName = pr.name || ('Нанесение ' + (pi + 1));
                    const suffix = pricedItems.length > 1 ? ' (' + (item.product_name || (i + 1)) + ')' : '';
                    columns.push({
                        label: prName + suffix,
                        type: 'printing',
                        globalIdx,
                        printingIdx: pi,
                        isBlank: false,
                        cost: prCost,
                        t50: calcTarget(prCost, 0.50),
                        t40: calcTarget(prCost, 0.40),
                        t30: calcTarget(prCost, 0.30),
                        t20: calcTarget(prCost, 0.20),
                        sellPrice: pr.sell_price || 0,
                    });
                }
            });
        });

        pricedHw.forEach((hw, i) => {
            const cost = hw.result.costPerUnit;
            const globalIdx = this.hardwareItems.indexOf(hw);
            columns.push({
                label: hw.name || 'Фурнитура ' + (i + 1),
                type: 'hw',
                globalIdx,
                isBlank: false,
                cost,
                t50: calcTarget(cost, 0.50),
                t40: calcTarget(cost, 0.40),
                t30: calcTarget(cost, 0.30),
                t20: calcTarget(cost, 0.20),
                sellPrice: hw.sell_price || 0,
            });
        });

        pricedPkg.forEach((pkg, i) => {
            const cost = pkg.result.costPerUnit;
            const globalIdx = this.packagingItems.indexOf(pkg);
            columns.push({
                label: pkg.name || 'Упаковка ' + (i + 1),
                type: 'pkg',
                globalIdx,
                isBlank: false,
                cost,
                t50: calcTarget(cost, 0.50),
                t40: calcTarget(cost, 0.40),
                t30: calcTarget(cost, 0.30),
                t20: calcTarget(cost, 0.20),
                sellPrice: pkg.sell_price || 0,
            });
        });

        // Render as a compact table-like grid
        const cellBorder = 'border-bottom:1px solid var(--border);';
        const leftCell = `padding:6px 8px;border-right:1px solid var(--border);${cellBorder}`;
        let html = '<div class="pricing-grid" style="display:grid; grid-template-columns: 140px ' + columns.map(() => '1fr').join(' ') + '; gap:0; font-size:12px; border:1px solid var(--border); border-radius:8px; overflow:hidden;">';

        // Header row
        html += `<div style="background:var(--bg);padding:8px;font-weight:600;${cellBorder}border-right:1px solid var(--border);"></div>`;
        columns.forEach(col => {
            const icon = col.type === 'item' ? '&#9670;' : col.type === 'printing' ? '&#9998;' : col.type === 'hw' ? '&#9881;' : '&#9744;';
            html += `<div style="background:var(--bg);padding:8px;font-weight:600;${cellBorder}text-align:center;font-size:11px;">${icon} ${col.label}</div>`;
        });

        // Себестоимость row
        html += `<div style="${leftCell}color:var(--text-secondary);">Себестоимость</div>`;
        columns.forEach(col => {
            html += `<div style="padding:6px 8px;text-align:center;${cellBorder}font-weight:600;">${formatRub(col.cost)}</div>`;
        });

        // Check if any column needs target spread (non-blank)
        const hasCustom = columns.some(c => !c.isBlank);

        if (hasCustom) {
            // Target rows for custom items
            const targets = [
                { pct: 50, label: 'Маржа 50%', key: 't50', style: 'color:var(--text-muted);' },
                { pct: 40, label: 'Маржа 40%', key: 't40', style: 'color:var(--green);font-weight:700;', suffix: ' ← цель' },
                { pct: 30, label: 'Маржа 30%', key: 't30', style: 'color:var(--text-muted);' },
                { pct: 20, label: 'Маржа 20%', key: 't20', style: 'color:var(--red);', suffix: ' ← мин.' },
            ];

            targets.forEach(t => {
                html += `<div style="padding:4px 8px;border-right:1px solid var(--border);${cellBorder}font-size:11px;${t.style}">${t.label}${t.suffix ? `<span style="font-size:9px;font-weight:400">${t.suffix}</span>` : ''}</div>`;
                columns.forEach(col => {
                    if (col.isBlank) {
                        // Blank: show fixed price from blanks page formula in the 40% row
                        if (t.pct === 40) {
                            html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--green);font-weight:700;">${formatRub(col.blankPrice)}<div style="font-size:9px;font-weight:400;color:var(--text-muted)">прайс бланков</div></div>`;
                        } else {
                            html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--text-muted);">—</div>`;
                        }
                    } else {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;${t.style}">${formatRub(col[t.key])}</div>`;
                    }
                });
            });
        } else {
            // All blanks — show just the fixed price row
            html += `<div style="padding:4px 8px;border-right:1px solid var(--border);${cellBorder}font-size:11px;color:var(--green);font-weight:700;">Прайс бланков</div>`;
            columns.forEach(col => {
                if (col.isBlank) {
                    html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--green);font-weight:700;">${formatRub(col.blankPrice)}</div>`;
                } else {
                    html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;">${formatRub(col.t40 || 0)}</div>`;
                }
            });
        }

        // Sell price row (editable, no spinners)
        html += `<div style="${leftCell}font-weight:600;background:var(--green-light);">Цена продажи</div>`;
        columns.forEach((col, ci) => {
            const inputId = `sell-${col.type}-${col.globalIdx}${col.printingIdx !== undefined ? '-p' + col.printingIdx : ''}`;
            const piArg = col.printingIdx !== undefined ? `, ${col.printingIdx}` : '';
            html += `<div style="padding:4px;text-align:center;${cellBorder}background:var(--green-light);">
                <input type="text" inputmode="decimal" id="${inputId}" value="${col.sellPrice || ''}"
                    style="width:100%;text-align:center;font-weight:600;font-size:13px;border:1px solid var(--border);border-radius:4px;padding:4px;"
                    oninput="Calculator.onPricingSellChange('${col.type}', ${col.globalIdx}, this.value${piArg})">
            </div>`;
        });

        // Margin row (% only)
        html += `<div style="padding:6px 8px;border-right:1px solid var(--border);font-weight:600;">Маржа</div>`;
        columns.forEach(col => {
            let marginHtml = '—';
            let warnHtml = '';
            if (col.sellPrice > 0) {
                const m = calculateActualMargin(col.sellPrice, col.cost);
                const color = m.percent >= 40 ? 'var(--green)' : m.percent >= 30 ? 'var(--yellow)' : 'var(--red)';
                marginHtml = `<span style="color:${color};font-weight:700;">${formatPercent(m.percent)}</span>`;
                if (m.percent < 30) {
                    warnHtml = '<div style="font-size:9px;color:var(--red);margin-top:2px;">Согласовать с директором</div>';
                }
            }
            html += `<div style="padding:6px 8px;text-align:center;">${marginHtml}${warnHtml}</div>`;
        });

        html += '</div>';

        // === Final order summary: item × qty, printing × qty, hw × qty, pkg × qty + НДС ===
        this.renderOrderInvoice(params, html, contentEl);
    },

    /**
     * Render the final order invoice summary below pricing grid.
     * Shows: item, printing, hw, pkg lines with qty × price + НДС 5%
     */
    renderOrderInvoice(params, pricingHtml, contentEl) {
        let invoiceRows = [];

        this.items.forEach((item, i) => {
            if (!item.result || !item.quantity) return;
            const qty = item.quantity;
            // For blank molds, use auto-calculated price as fallback
            let itemPrice = item.sell_price_item;
            if ((!itemPrice || itemPrice <= 0) && item.is_blank_mold && item.result.costTotal > 0) {
                const costPrintingPart = item.result.costPrinting || 0;
                const costItemOnly = round2(item.result.costTotal - costPrintingPart);
                const blankMargin = getBlankMargin(qty || 500);
                itemPrice = roundTo5(round2(costItemOnly / (1 - blankMargin) / (1 - 0.06 - 0.05)));
                item.sell_price_item = itemPrice; // persist for KP generation
            }
            if (itemPrice > 0) {
                invoiceRows.push({
                    name: item.product_name || 'Изделие ' + (i + 1),
                    qty: qty,
                    price: itemPrice,
                    total: round2(itemPrice * qty),
                    type: 'item',
                });
            }
            // Each printing as separate invoice row
            const multiItems = this.items.filter(it => it.result && it.quantity).length > 1;
            (item.printings || []).forEach((pr, pi) => {
                if (pr.sell_price > 0) {
                    const prName = pr.name || ('Нанесение ' + (pi + 1));
                    const suffix = multiItems ? ' — ' + (item.product_name || (i + 1)) : '';
                    invoiceRows.push({
                        name: prName + suffix,
                        qty: qty,
                        price: pr.sell_price,
                        total: round2(pr.sell_price * qty),
                        type: 'printing',
                    });
                }
            });
            // Backwards compat: if no per-printing sell_price but aggregate exists
            if (!(item.printings || []).some(pr => pr.sell_price > 0) && item.sell_price_printing > 0) {
                invoiceRows.push({
                    name: 'Нанесение' + (multiItems ? ' — ' + (item.product_name || (i + 1)) : ''),
                    qty: qty,
                    price: item.sell_price_printing,
                    total: round2(item.sell_price_printing * qty),
                    type: 'printing',
                });
            }
        });

        this.hardwareItems.forEach((hw, i) => {
            if (hw.qty > 0 && hw.sell_price > 0) {
                invoiceRows.push({
                    name: hw.name || 'Фурнитура ' + (i + 1),
                    qty: hw.qty,
                    price: hw.sell_price,
                    total: round2(hw.sell_price * hw.qty),
                    type: 'hw',
                });
            }
        });

        this.packagingItems.forEach((pkg, i) => {
            if (pkg.qty > 0 && pkg.sell_price > 0) {
                invoiceRows.push({
                    name: pkg.name || 'Упаковка ' + (i + 1),
                    qty: pkg.qty,
                    price: pkg.sell_price,
                    total: round2(pkg.sell_price * pkg.qty),
                    type: 'pkg',
                });
            }
        });

        let invoiceHtml = '';
        if (invoiceRows.length > 0) {
            const subtotal = invoiceRows.reduce((s, r) => s + r.total, 0);
            const vat = round2(subtotal * 0.05);
            const grandTotal = round2(subtotal + vat);

            invoiceHtml = `
            <div style="margin-top:16px; border:1px solid var(--border); border-radius:8px; overflow:hidden; font-size:12px;">
                <div style="background:var(--bg);padding:8px 12px;font-weight:700;font-size:13px;border-bottom:1px solid var(--border);">Итоговая смета для заказчика</div>
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:var(--bg);font-size:11px;color:var(--text-secondary);">
                            <th style="text-align:left;padding:6px 12px">Наименование</th>
                            <th style="text-align:right;padding:6px 8px;width:80px">Кол-во</th>
                            <th style="text-align:right;padding:6px 8px;width:100px">Цена/шт</th>
                            <th style="text-align:right;padding:6px 12px;width:110px">Сумма</th>
                        </tr>
                    </thead>
                    <tbody>`;

            invoiceRows.forEach((r, i) => {
                const bg = i % 2 === 0 ? '' : 'background:var(--bg);';
                const icon = r.type === 'item' ? '&#9670;' : r.type === 'printing' ? '&#9998;' : r.type === 'hw' ? '&#9881;' : '&#9744;';
                invoiceHtml += `
                        <tr style="${bg}">
                            <td style="padding:6px 12px;">${icon} ${r.name}</td>
                            <td style="text-align:right;padding:6px 8px;">${r.qty} шт</td>
                            <td style="text-align:right;padding:6px 8px;">${formatRub(r.price)}</td>
                            <td style="text-align:right;padding:6px 12px;font-weight:600;">${formatRub(r.total)}</td>
                        </tr>`;
            });

            invoiceHtml += `
                    </tbody>
                    <tfoot>
                        <tr style="border-top:1px solid var(--border);">
                            <td colspan="3" style="text-align:right;padding:6px 8px;color:var(--text-secondary);">Итого без НДС</td>
                            <td style="text-align:right;padding:6px 12px;font-weight:600;">${formatRub(subtotal)}</td>
                        </tr>
                        <tr>
                            <td colspan="3" style="text-align:right;padding:4px 8px;color:var(--text-secondary);font-size:11px;">НДС 5%</td>
                            <td style="text-align:right;padding:4px 12px;font-size:11px;color:var(--text-muted);">${formatRub(vat)}</td>
                        </tr>
                        <tr style="background:var(--bg);">
                            <td colspan="3" style="text-align:right;padding:8px;font-weight:700;font-size:14px;">ИТОГО с НДС</td>
                            <td style="text-align:right;padding:8px 12px;font-weight:700;font-size:14px;color:var(--green);">${formatRub(grandTotal)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>`;
        }

        contentEl.innerHTML = pricingHtml + invoiceHtml;
    },

    // ==========================================
    // HTML ESCAPE HELPERS
    // ==========================================

    _esc(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    _escAttr(s) {
        if (!s) return '';
        return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    // Re-render just the mold picker selected display after picking a mold
    rerenderItem(idx) {
        const item = this.items[idx];
        const pickerSelected = document.querySelector('#mold-picker-' + idx + ' .mold-picker-selected');
        if (!pickerSelected) return;

        const blanks = (App.templates || []).filter(t => t.category === 'blank');
        const selectedMold = blanks.find(t => t.id == item.template_id);

        if (selectedMold) {
            const photoHtml = selectedMold.photo_url
                ? `<img src="${this._escAttr(selectedMold.photo_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:6px;border:1px solid var(--border)">`
                : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:14px;font-weight:700;color:var(--accent)">${(selectedMold.name || '?')[0]}</span>`;
            pickerSelected.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;">
                    ${photoHtml}
                    <div><div style="font-weight:600;font-size:13px">${this._esc(selectedMold.name)}</div><div style="font-size:10px;color:var(--text-muted)">${selectedMold.pieces_per_hour_display} шт/ч · ${selectedMold.weight_grams || 0}г${selectedMold.hw_name ? ' · <span style="color:var(--accent)">+ ' + this._esc(selectedMold.hw_name) + '</span>' : ''}</div></div>
                </div>
                <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;margin-left:8px">&#9662;</span>`;
        } else {
            pickerSelected.innerHTML = `
                <span style="color:var(--text-muted);font-size:13px">-- Выбрать бланк --</span>
                <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;margin-left:8px">&#9662;</span>`;
        }

        // Also update selected state in dropdown items
        const list = document.getElementById('mold-picker-list-' + idx);
        if (list) {
            list.querySelectorAll('.mold-picker-item').forEach(el => {
                el.classList.remove('selected');
                el.style.background = '';
            });
            // The dropdown will be rebuilt on next open if needed
        }
    },

    _sellPriceTimer: null,

    onPricingSellChange(type, globalIdx, value, printingIdx) {
        const price = parseFloat(value) || 0;
        if (type === 'item') {
            this.items[globalIdx].sell_price_item = price;
        } else if (type === 'printing') {
            // Per-printing sell price
            if (printingIdx !== undefined && this.items[globalIdx].printings[printingIdx]) {
                this.items[globalIdx].printings[printingIdx].sell_price = price;
            }
            // Also keep backwards-compat aggregate
            let totalPrintSell = 0;
            (this.items[globalIdx].printings || []).forEach(pr => totalPrintSell += (pr.sell_price || 0));
            this.items[globalIdx].sell_price_printing = totalPrintSell;
        } else if (type === 'hw') {
            this.hardwareItems[globalIdx].sell_price = price;
        } else if (type === 'pkg') {
            this.packagingItems[globalIdx].sell_price = price;
        }
        // Debounce: wait 800ms after user stops typing before recalculating
        clearTimeout(this._sellPriceTimer);
        this._sellPriceTimer = setTimeout(() => this.recalculate(), 800);
    },

    // ==========================================
    // SAVE / LOAD ORDER
    // ==========================================

    async saveOrder() {
        const orderName = document.getElementById('calc-order-name').value.trim();
        if (!orderName) {
            App.toast('Введите название заказа');
            return;
        }

        const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, App.params);
        const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems);

        const order = {
            id: App.editingOrderId || undefined,
            order_name: orderName,
            client_name: document.getElementById('calc-client-name').value.trim(),
            manager_name: document.getElementById('calc-manager-name').value.trim(),
            deadline: document.getElementById('calc-deadline-start').value || null,
            deadline_start: document.getElementById('calc-deadline-start').value || null,
            deadline_end: document.getElementById('calc-deadline-end').value || null,
            notes: document.getElementById('calc-notes').value.trim(),
            plastic_type: 'PP', // always PP
            print_type: null, // determined at printing level
            status: 'calculated',
            total_revenue_plan: summary.totalRevenue,
            total_cost_plan: summary.totalRevenue - summary.totalEarned,
            total_margin_plan: summary.totalEarned,
            margin_percent_plan: summary.marginPercent,
            total_hours_plan: load.totalHours,
            production_hours_plastic: load.hoursPlasticTotal,
            production_hours_packaging: load.hoursPackagingTotal,
            production_hours_hardware: load.hoursHardwareTotal,
            production_load_percent: load.plasticLoadPercent,
        };

        // Gather product items for DB
        const items = this.items.filter(i => i.quantity > 0).map(item => {
            const r = item.result || getEmptyCostResult();
            return {
                item_number: item.item_number,
                item_type: 'product',
                product_name: item.product_name,
                quantity: item.quantity,
                pieces_per_hour: item.pieces_per_hour,
                weight_grams: item.weight_grams,
                extra_molds: item.extra_molds,
                complex_design: item.complex_design,
                is_blank_mold: item.is_blank_mold,
                is_nfc: item.is_nfc,
                nfc_programming: item.nfc_programming,
                delivery_included: item.delivery_included,
                printings: JSON.stringify(item.printings || []),
                cost_fot: r.costFot,
                cost_indirect: r.costIndirect,
                cost_plastic: r.costPlastic,
                cost_mold_amortization: r.costMoldAmortization,
                cost_design: r.costDesign,
                cost_cutting: r.costCutting,
                cost_cutting_indirect: r.costCuttingIndirect,
                cost_nfc_tag: r.costNfcTag,
                cost_nfc_programming: r.costNfcProgramming,
                cost_nfc_indirect: r.costNfcIndirect,
                cost_printing: r.costPrinting,
                cost_delivery: r.costDelivery,
                cost_total: r.costTotal,
                sell_price_item: item.sell_price_item,
                sell_price_printing: item.sell_price_printing || 0,
                target_price_item: item.target_price_item || 0,
                hours_plastic: r.hoursPlastic,
                hours_cutting: r.hoursCutting,
                hours_nfc: r.hoursNfc,
                template_id: item.template_id,
                color_id: item.color_id || null,
                color_name: item.color_name || '',
            };
        });

        // Add hardware items
        this.hardwareItems.filter(hw => hw.qty > 0).forEach((hw, i) => {
            items.push({
                item_number: 100 + i,
                item_type: 'hardware',
                product_name: hw.name,
                quantity: hw.qty,
                hardware_assembly_speed: hw.assembly_speed,
                hardware_price_per_unit: hw.price,
                hardware_delivery_per_unit: hw.delivery_price,
                hardware_delivery_total: hw.delivery_total,
                sell_price_hardware: hw.sell_price,
                target_price_hardware: hw.target_price || 0,
                cost_total: hw.result ? hw.result.costPerUnit : 0,
                hours_hardware: hw.result ? hw.result.hoursHardware : 0,
                // Warehouse integration fields
                hardware_source: hw.source || 'custom',
                hardware_warehouse_item_id: hw.warehouse_item_id || null,
                hardware_warehouse_sku: hw.warehouse_sku || '',
            });
        });

        // Add packaging items
        this.packagingItems.filter(pkg => pkg.qty > 0).forEach((pkg, i) => {
            items.push({
                item_number: 200 + i,
                item_type: 'packaging',
                product_name: pkg.name,
                quantity: pkg.qty,
                packaging_assembly_speed: pkg.assembly_speed,
                packaging_price_per_unit: pkg.price,
                packaging_delivery_per_unit: pkg.delivery_price,
                packaging_delivery_total: pkg.delivery_total,
                sell_price_packaging: pkg.sell_price,
                target_price_packaging: pkg.target_price || 0,
                cost_total: pkg.result ? pkg.result.costPerUnit : 0,
                hours_packaging: pkg.result ? pkg.result.hoursPackaging : 0,
                // Warehouse integration fields
                packaging_source: pkg.source || 'custom',
                packaging_warehouse_item_id: pkg.warehouse_item_id || null,
                packaging_warehouse_sku: pkg.warehouse_sku || '',
            });
        });

        const isEdit = !!App.editingOrderId;
        const managerName = document.getElementById('calc-manager-name').value.trim() || 'Неизвестный';

        // === Detailed change tracking ===
        let oldData = null;
        if (isEdit) {
            oldData = await loadOrder(App.editingOrderId);
        }

        const orderId = await saveOrder(order, items);
        if (orderId) {
            App.editingOrderId = orderId;

            if (isEdit && oldData) {
                // Diff order header fields
                const headerChanges = this._diffOrderHeader(oldData.order, order);
                for (const ch of headerChanges) {
                    await Orders.addChangeRecord(orderId, {
                        field: 'field_change',
                        old_value: ch.label + ': ' + (ch.old_value || '(пусто)'),
                        new_value: ch.label + ': ' + (ch.new_value || '(пусто)'),
                        manager: managerName,
                    });
                }

                // Diff items (products, hardware, packaging)
                const itemChanges = this._diffOrderItems(oldData.items, items);
                for (const ch of itemChanges) {
                    await Orders.addChangeRecord(orderId, {
                        field: ch.type,
                        old_value: ch.old_value || '',
                        new_value: ch.new_value || '',
                        manager: managerName,
                        description: ch.description || '',
                    });
                }

                // If no field-level changes detected, record a generic edit
                if (headerChanges.length === 0 && itemChanges.length === 0) {
                    await Orders.addChangeRecord(orderId, {
                        field: 'order_edit',
                        old_value: '',
                        new_value: 'Заказ пересохранён',
                        manager: managerName,
                        description: `Выручка: ${formatRub(summary.totalRevenue)}, Маржа: ${formatPercent(summary.marginPercent)}`,
                    });
                }
            } else {
                // New order
                await Orders.addChangeRecord(orderId, {
                    field: 'order_create',
                    old_value: '',
                    new_value: 'Заказ создан',
                    manager: managerName,
                    description: `Выручка: ${formatRub(summary.totalRevenue)}, Маржа: ${formatPercent(summary.marginPercent)}`,
                });
            }

            // === Warehouse deduction for "from warehouse" hardware ===
            await this._deductWarehouseOnSave(isEdit, order.order_name, managerName);

            App.toast('Заказ сохранен');
        } else {
            App.toast('Ошибка сохранения');
        }
    },

    /**
     * Deduct (or adjust) warehouse stock when saving an order.
     * - New order: deduct full qty for each warehouse hardware item
     * - Edit order: deduct only the difference (new qty - original qty)
     */
    async _deductWarehouseOnSave(isEdit, orderName, managerName) {
        const warehouseHw = this.hardwareItems.filter(
            hw => hw.source === 'warehouse' && hw.warehouse_item_id && hw.qty > 0
        );

        for (const hw of warehouseHw) {
            let deductQty = hw.qty;

            if (isEdit) {
                // Only deduct the difference since last save
                const origQty = hw._original_qty || 0;
                const origItemId = hw._original_warehouse_item_id;

                if (origItemId === hw.warehouse_item_id) {
                    // Same warehouse item — deduct only the delta
                    deductQty = hw.qty - origQty;
                } else if (origItemId) {
                    // Changed warehouse item — return old, deduct new
                    await Warehouse.adjustStock(
                        origItemId,
                        origQty,       // positive = return
                        'addition',
                        orderName,
                        `Возврат при замене фурнитуры в заказе`,
                        managerName
                    );
                    deductQty = hw.qty; // deduct full new qty
                }
            }

            if (deductQty !== 0) {
                const reason = deductQty > 0 ? 'deduction' : 'addition';
                const note = deductQty > 0
                    ? `Списание для заказа: ${hw.name} × ${deductQty}`
                    : `Возврат из заказа: ${hw.name} × ${Math.abs(deductQty)}`;
                await Warehouse.adjustStock(
                    hw.warehouse_item_id,
                    -deductQty,     // negative = deduct from stock
                    reason,
                    orderName,
                    note,
                    managerName
                );
            }

            // Update originals for next save
            hw._original_qty = hw.qty;
            hw._original_warehouse_item_id = hw.warehouse_item_id;
        }

        // Handle removed warehouse items: if an old item was warehouse-sourced
        // and is no longer in hardwareItems, return its stock
        if (isEdit) {
            // Items that were warehouse-sourced but removed
            // We check _original_ data stored during loadOrder
            // This is handled by the diff in _diffOrderItems already detecting removed items
            // For stock return, we need to check original hardware items
            // This will be covered when the user completely removes a hw row
        }

        // Invalidate picker cache so next add sees updated stock
        this._whPickerData = null;
    },

    async loadOrder(orderId) {
        const data = await loadOrder(orderId);
        if (!data) {
            App.toast('Заказ не найден');
            return;
        }

        this.resetForm();
        App.editingOrderId = orderId;

        const { order, items: dbItems } = data;
        document.getElementById('calc-order-name').value = order.order_name || '';
        document.getElementById('calc-client-name').value = order.client_name || '';
        document.getElementById('calc-manager-name').value = order.manager_name || '';
        document.getElementById('calc-deadline-start').value = order.deadline_start || order.deadline || '';
        document.getElementById('calc-deadline-end').value = order.deadline_end || '';
        document.getElementById('calc-notes').value = order.notes || '';

        // Restore product items
        const productItems = dbItems.filter(i => !i.item_type || i.item_type === 'product');
        productItems.forEach((dbItem, i) => {
            const item = this.getEmptyItem(i + 1);
            Object.keys(item).forEach(key => {
                if (dbItem[key] !== undefined && dbItem[key] !== null) {
                    item[key] = dbItem[key];
                }
            });
            // Parse printings from JSON
            if (typeof item.printings === 'string') {
                try { item.printings = JSON.parse(item.printings); } catch (e) { item.printings = []; }
            }
            if (!Array.isArray(item.printings)) item.printings = [];
            // Migrate old single-printing to new format
            if (item.printings.length === 0 && dbItem.printing_qty > 0) {
                item.printings = [{ name: '', qty: dbItem.printing_qty, price: dbItem.printing_price_per_unit || 0 }];
            }
            // Re-derive built-in hardware from template (not stored in DB)
            if (item.template_id && App.templates) {
                const tpl = App.templates.find(t => t.id == item.template_id);
                if (tpl) {
                    item.builtin_hw_name = tpl.hw_name || '';
                    item.builtin_hw_price = tpl.hw_price_per_unit || 0;
                    item.builtin_hw_delivery_total = tpl.hw_delivery_total || 0;
                    item.builtin_hw_speed = tpl.hw_speed || 0;
                }
            }
            this.items.push(item);
            this.renderItemBlock(i);
        });

        // Restore hardware items (load picker data first for warehouse mode)
        const hwItems = dbItems.filter(i => i.item_type === 'hardware');
        if (hwItems.length > 0) {
            await this._ensureWhPickerData();
        }
        hwItems.forEach((dbHw) => {
            const hw = this.getEmptyHardware();
            hw.name = dbHw.product_name || '';
            hw.qty = dbHw.quantity || 0;
            hw.assembly_speed = dbHw.hardware_assembly_speed || 0;
            // Convert шт/ч → мин/шт for display
            hw.assembly_minutes = hw.assembly_speed > 0 ? round2(60 / hw.assembly_speed) : 0;
            hw.price = dbHw.hardware_price_per_unit || 0;
            // Support both old per-unit and new total delivery
            const perUnit = dbHw.hardware_delivery_per_unit || 0;
            hw.delivery_total = dbHw.hardware_delivery_total || (perUnit * hw.qty);
            hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : perUnit;
            hw.sell_price = dbHw.sell_price_hardware || 0;
            // Warehouse integration fields
            hw.source = dbHw.hardware_source || 'custom';  // backward compat: old orders = custom
            hw.warehouse_item_id = dbHw.hardware_warehouse_item_id || null;
            hw.warehouse_sku = dbHw.hardware_warehouse_sku || '';
            // Save originals for diff on next save
            hw._original_qty = hw.qty;
            hw._original_warehouse_item_id = hw.warehouse_item_id;
            this.hardwareItems.push(hw);
            this.renderHardwareRow(this.hardwareItems.length - 1);
        });

        // Restore packaging items
        const pkgItems = dbItems.filter(i => i.item_type === 'packaging');
        if (pkgItems.some(p => p.packaging_source === 'warehouse')) {
            await this._ensureWhPickerData();
        }
        pkgItems.forEach((dbPkg) => {
            const pkg = this.getEmptyPackaging();
            pkg.source = dbPkg.packaging_source || 'custom';
            pkg.warehouse_item_id = dbPkg.packaging_warehouse_item_id || null;
            pkg.warehouse_sku = dbPkg.packaging_warehouse_sku || '';
            pkg.name = dbPkg.product_name || '';
            pkg.qty = dbPkg.quantity || 0;
            pkg.assembly_speed = dbPkg.packaging_assembly_speed || 0;
            // Convert шт/ч → мин/шт for display
            pkg.assembly_minutes = pkg.assembly_speed > 0 ? round2(60 / pkg.assembly_speed) : 0;
            pkg.price = dbPkg.packaging_price_per_unit || 0;
            const perUnit = dbPkg.packaging_delivery_per_unit || 0;
            pkg.delivery_total = dbPkg.packaging_delivery_total || (perUnit * pkg.qty);
            pkg.delivery_price = pkg.qty > 0 ? round2(pkg.delivery_total / pkg.qty) : perUnit;
            pkg.sell_price = dbPkg.sell_price_packaging || 0;
            this.packagingItems.push(pkg);
            this.renderPackagingRow(this.packagingItems.length - 1);
        });

        if (this.items.length === 0) this.addItem();
        this.recalculate();

        // Show change history
        this.showOrderHistory(orderId);

        App.navigate('calculator');
    },

    // ==========================================
    // ORDER DIFF HELPERS
    // ==========================================

    _diffOrderHeader(oldOrder, newOrder) {
        const changes = [];
        const fields = [
            { key: 'order_name', label: 'Название' },
            { key: 'client_name', label: 'Клиент' },
            { key: 'manager_name', label: 'Менеджер' },
            { key: 'deadline', label: 'Дедлайн' },
            { key: 'notes', label: 'Примечания' },
        ];
        fields.forEach(f => {
            const oldVal = (oldOrder[f.key] || '').toString().trim();
            const newVal = (newOrder[f.key] || '').toString().trim();
            if (oldVal !== newVal) {
                changes.push({ field: f.key, label: f.label, old_value: oldVal, new_value: newVal });
            }
        });
        return changes;
    },

    _diffOrderItems(oldItems, newItems) {
        const changes = [];

        // Build lookup maps by item_type + item_number
        const oldMap = {};
        (oldItems || []).forEach(it => {
            const key = (it.item_type || 'product') + '_' + it.item_number;
            oldMap[key] = it;
        });

        const newMap = {};
        (newItems || []).forEach(it => {
            const key = (it.item_type || 'product') + '_' + it.item_number;
            newMap[key] = it;
        });

        // Detect added and changed items
        for (const key in newMap) {
            const nItem = newMap[key];
            const oItem = oldMap[key];
            const itemName = nItem.product_name || key;
            const itemType = nItem.item_type || 'product';

            if (!oItem) {
                // New item added
                changes.push({
                    type: 'item_added',
                    new_value: `Добавлена позиция: ${itemName} (${nItem.quantity || 0} шт)`,
                });
            } else {
                // Compare key fields
                const compareFields = [
                    { key: 'quantity', label: 'кол-во' },
                    { key: 'product_name', label: 'название' },
                ];

                if (itemType === 'product') {
                    compareFields.push(
                        { key: 'sell_price_item', label: 'цена изделия' },
                        { key: 'sell_price_printing', label: 'цена нанесения' },
                        { key: 'pieces_per_hour', label: 'шт/час' },
                        { key: 'weight_grams', label: 'вес (г)' },
                        { key: 'extra_molds', label: 'доп. молды' },
                    );
                } else if (itemType === 'hardware') {
                    compareFields.push(
                        { key: 'sell_price_hardware', label: 'цена фурнитуры' },
                        { key: 'hardware_price_per_unit', label: 'закупка/шт' },
                        { key: 'hardware_delivery_total', label: 'доставка фурн.' },
                    );
                } else if (itemType === 'packaging') {
                    compareFields.push(
                        { key: 'sell_price_packaging', label: 'цена упаковки' },
                        { key: 'packaging_price_per_unit', label: 'закупка/шт' },
                        { key: 'packaging_delivery_total', label: 'доставка упак.' },
                    );
                }

                compareFields.forEach(f => {
                    const oldVal = oItem[f.key];
                    const newVal = nItem[f.key];
                    // Compare as numbers for numeric fields, strings for text
                    const oStr = (oldVal === null || oldVal === undefined) ? '' : String(oldVal);
                    const nStr = (newVal === null || newVal === undefined) ? '' : String(newVal);
                    if (oStr !== nStr) {
                        changes.push({
                            type: 'item_changed',
                            old_value: `${itemName}: ${f.label} ${oStr || '(пусто)'}`,
                            new_value: `${itemName}: ${f.label} ${nStr || '(пусто)'}`,
                            description: '',
                        });
                    }
                });
            }
        }

        // Detect removed items
        for (const key in oldMap) {
            if (!newMap[key]) {
                const oItem = oldMap[key];
                changes.push({
                    type: 'item_removed',
                    old_value: `Удалена позиция: ${oItem.product_name || key} (${oItem.quantity || 0} шт)`,
                    new_value: '',
                });
            }
        }

        return changes;
    },

    async showOrderHistory(orderId) {
        const historyEl = document.getElementById('calc-history');
        const listEl = document.getElementById('calc-history-list');
        if (!historyEl || !listEl) return;

        const history = await Orders.loadHistory(orderId);
        if (history.length === 0) {
            historyEl.style.display = 'none';
            return;
        }

        historyEl.style.display = '';
        listEl.innerHTML = history.slice().reverse().map(h => {
            const d = new Date(h.date);
            const dateStr = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
            const desc = h.description ? ` <span style="color:var(--text-muted);font-size:11px;">${h.description}</span>` : '';

            let action = '';
            let icon = '';

            if (h.field === 'status') {
                icon = '🔄';
                action = `${h.old_value} → ${h.new_value}`;
            } else if (h.field === 'order_create') {
                icon = '✨';
                action = 'Заказ создан';
            } else if (h.field === 'order_edit') {
                icon = '📝';
                action = h.new_value || 'Заказ отредактирован';
            } else if (h.field === 'field_change') {
                icon = '✏️';
                action = `${h.old_value} → ${h.new_value}`;
            } else if (h.field === 'item_added') {
                icon = '➕';
                action = `<span style="color:var(--green);">${h.new_value}</span>`;
            } else if (h.field === 'item_removed') {
                icon = '➖';
                action = `<span style="color:var(--red);">${h.old_value}</span>`;
            } else if (h.field === 'item_changed') {
                icon = '🔧';
                action = `${h.old_value} → ${h.new_value}`;
            } else {
                icon = '📋';
                action = h.new_value || h.description || h.old_value;
            }

            return `<div style="padding:4px 0; border-bottom:1px solid var(--border); display:flex; gap:8px; align-items:baseline; font-size:12px;">
                <span style="color:var(--text-muted); min-width:110px; font-size:11px;">${dateStr}</span>
                <span style="font-weight:600; min-width:80px;">${h.manager || '—'}</span>
                <span>${icon} ${action}${desc}</span>
            </div>`;
        }).join('');
    },

    // ==========================================
    // КП (Commercial Proposal) PDF
    // ==========================================

    async generateKP() {
        const orderName = document.getElementById('calc-order-name').value.trim();
        const clientName = document.getElementById('calc-client-name').value.trim();

        if (!orderName) {
            App.toast('Сначала заполните название заказа');
            return;
        }

        // Auto-fill ALL sell prices before validation using target pricing
        const params = App.params || {};
        const calcTarget = (cost, marginPct) => {
            if (cost === 0) return 0;
            const vatOnCost = cost * (params.vatRate || 0.05);
            return round2((cost + vatOnCost) * (1 + marginPct) / (1 - (params.taxRate || 0.06) - 0.065));
        };

        this.items.forEach(item => {
            if (!item.result || !item.quantity) return;
            const costPrintingPart = item.result.costPrinting || 0;
            const costItemOnly = round2(item.result.costTotal - costPrintingPart);

            // Auto-fill item sell price if not set
            if ((!item.sell_price_item || item.sell_price_item <= 0) && costItemOnly > 0) {
                if (item.is_blank_mold) {
                    const blankMargin = getBlankMargin(item.quantity || 500);
                    item.sell_price_item = roundTo5(round2(costItemOnly / (1 - blankMargin) / (1 - 0.06 - 0.05)));
                } else {
                    // Default to 40% margin for custom molds
                    item.sell_price_item = roundTo5(calcTarget(costItemOnly, 0.40));
                }
            }

            // Auto-fill per-printing sell prices if not set
            const printingDetails = item.result.costPrintingDetails || [];
            (item.printings || []).forEach((pr, pi) => {
                const prCost = printingDetails[pi] || 0;
                if (prCost > 0 && (!pr.sell_price || pr.sell_price <= 0)) {
                    pr.sell_price = roundTo5(calcTarget(prCost, 0.40));
                }
            });
            // Keep aggregate for backwards compat
            let totalPrintSell = 0;
            (item.printings || []).forEach(pr => totalPrintSell += (pr.sell_price || 0));
            if (totalPrintSell > 0) item.sell_price_printing = totalPrintSell;
        });

        // Auto-fill hardware sell prices
        this.hardwareItems.forEach(hw => {
            if (hw.result && hw.qty > 0 && (!hw.sell_price || hw.sell_price <= 0)) {
                hw.sell_price = roundTo5(calcTarget(hw.result.costPerUnit, 0.40));
            }
        });

        // Auto-fill packaging sell prices
        this.packagingItems.forEach(pkg => {
            if (pkg.result && pkg.qty > 0 && (!pkg.sell_price || pkg.sell_price <= 0)) {
                pkg.sell_price = roundTo5(calcTarget(pkg.result.costPerUnit, 0.40));
            }
        });

        // After auto-fill, update the pricing card inputs to show the values
        this.renderPricingCard(params);

        // Collect data for КП — 4 entities: item, printing, hw, pkg
        const kpItems = [];

        this.items.forEach(item => {
            if (!item.result || !item.quantity) return;
            // Item (without printing)
            kpItems.push({
                type: 'product',
                name: item.product_name || 'Изделие',
                qty: item.quantity,
                price: item.sell_price_item,
            });
            // Printing (separate line per printing)
            (item.printings || []).forEach((pr, pi) => {
                if (pr.sell_price > 0) {
                    kpItems.push({
                        type: 'printing',
                        name: pr.name || ('Нанесение ' + (pi + 1)),
                        qty: item.quantity,
                        price: pr.sell_price,
                    });
                }
            });
            // Backwards compat: if no per-printing sell_price
            if (!(item.printings || []).some(pr => pr.sell_price > 0) && item.sell_price_printing > 0) {
                kpItems.push({
                    type: 'printing',
                    name: 'Нанесение',
                    qty: item.quantity,
                    price: item.sell_price_printing,
                });
            }
        });

        this.hardwareItems.forEach(hw => {
            if (hw.qty > 0) {
                kpItems.push({
                    type: 'hardware',
                    name: hw.name || 'Фурнитура',
                    qty: hw.qty,
                    price: hw.sell_price,
                });
            }
        });

        this.packagingItems.forEach(pkg => {
            if (pkg.qty > 0) {
                kpItems.push({
                    type: 'packaging',
                    name: pkg.name || 'Упаковка',
                    qty: pkg.qty,
                    price: pkg.sell_price,
                });
            }
        });

        if (kpItems.length === 0) {
            App.toast('Нет данных для КП');
            return;
        }

        try {
            App.toast('Генерация КП...');
            await KPGenerator.generate(orderName, clientName, kpItems);
        } catch (err) {
            console.error('KP generation error:', err);
            App.toast('Ошибка генерации КП: ' + err.message);
        }
    },
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());

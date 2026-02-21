// =============================================
// Recycle Object — App Core (Routing, Auth, Init)
// =============================================

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

        initSupabase();

        this.settings = await loadSettings();
        this.templates = await loadTemplates();
        this.params = getProductionParams(this.settings);

        this.handleRoute();
    },

    // === ROUTING ===

    handleRoute() {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        const page = hash.split('/')[0];
        this.navigate(page, false);
    },

    navigate(page, pushHash = true) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        const target = document.getElementById('page-' + page);
        if (target) {
            target.classList.add('active');
            this.currentPage = page;
        } else {
            document.getElementById('page-dashboard').classList.add('active');
            this.currentPage = 'dashboard';
        }

        document.querySelectorAll('.sidebar-nav a').forEach(a => {
            a.classList.toggle('active', a.dataset.page === this.currentPage);
        });

        if (pushHash) {
            window.location.hash = this.currentPage;
        }

        this.onPageEnter(this.currentPage);
    },

    onPageEnter(page) {
        switch (page) {
            case 'dashboard': Dashboard.load(); break;
            case 'calculator': Calculator.init(); break;
            case 'orders': Orders.loadList(); break;
            case 'analytics': Analytics.load(); break;
            case 'molds': Molds.load(); break;
            case 'timetrack': TimeTrack.load(); break;
            case 'tasks': Tasks.load(); Tasks.populateFilters(); break;
            case 'import': Import.load(); break;
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

    init() {
        if (this.items.length === 0 && !App.editingOrderId) {
            this.resetForm();
            this.addItem();
        }
    },

    resetForm() {
        App.editingOrderId = null;
        document.getElementById('calc-order-name').value = '';
        document.getElementById('calc-client-name').value = '';
        document.getElementById('calc-manager-name').value = '';
        document.getElementById('calc-deadline').value = '';
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
            // Sell price for product only (hw/pkg have their own)
            sell_price_item: 0,
            result: null,
            template_id: null,
        };
    },

    renderItemBlock(idx) {
        const item = this.items[idx];
        const num = idx + 1;
        const container = document.getElementById('calc-items-container');

        // Build template options (only blanks shown when blank selected)
        let templateOpts = '<option value="">-- Выбрать бланк --</option>';
        if (App.templates) {
            App.templates.filter(t => t.category === 'blank').forEach(t => {
                const sel = item.template_id == t.id ? ' selected' : '';
                templateOpts += `<option value="${t.id}"${sel}>${t.name} (${t.pieces_per_hour_display} шт/ч)</option>`;
            });
        }

        // Render printings
        let printingsHtml = '';
        (item.printings || []).forEach((pr, pi) => {
            printingsHtml += this.renderPrintingRow(idx, pi, pr);
        });

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
            <div class="form-group template-select" id="template-wrap-${idx}" style="${item.is_blank_mold ? '' : 'display:none'}">
                <label>Бланк из справочника</label>
                <select id="template-select-${idx}" onchange="Calculator.onTemplateSelect(${idx}, this)">
                    ${templateOpts}
                </select>
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

            <!-- Cost breakdown (calculated) -->
            <div class="cost-breakdown" id="item-cost-${idx}" style="display:none">
                <div class="section-title" style="margin-top:0">Себестоимость изделия (за 1 шт)</div>
                <div class="cost-row"><span class="cost-label">ФОТ производство</span><span class="cost-value" id="c-${idx}-fot">0</span></div>
                <div class="cost-row"><span class="cost-label">Косвенные расходы</span><span class="cost-value" id="c-${idx}-indirect">0</span></div>
                <div class="cost-row"><span class="cost-label">Пластик</span><span class="cost-value" id="c-${idx}-plastic">0</span></div>
                <div class="cost-row"><span class="cost-label">Амортизация молда</span><span class="cost-value" id="c-${idx}-mold">0</span></div>
                <div class="cost-row"><span class="cost-label">Проектирование</span><span class="cost-value" id="c-${idx}-design">0</span></div>
                <div class="cost-row"><span class="cost-label">Срезка лейника (ФОТ)</span><span class="cost-value" id="c-${idx}-cutting">0</span></div>
                <div class="cost-row"><span class="cost-label">Срезка лейника (косв.)</span><span class="cost-value" id="c-${idx}-cutting-ind">0</span></div>
                <div class="cost-row"><span class="cost-label">NFC метка</span><span class="cost-value" id="c-${idx}-nfc-tag">0</span></div>
                <div class="cost-row"><span class="cost-label">NFC программирование</span><span class="cost-value" id="c-${idx}-nfc-prog">0</span></div>
                <div class="cost-row"><span class="cost-label">NFC (косв.)</span><span class="cost-value" id="c-${idx}-nfc-ind">0</span></div>
                <div class="cost-row"><span class="cost-label">Нанесение</span><span class="cost-value" id="c-${idx}-printing">0</span></div>
                <div class="cost-row"><span class="cost-label">Доставка</span><span class="cost-value" id="c-${idx}-delivery">0</span></div>
                <div class="cost-row cost-total"><span class="cost-label">ИТОГО себестоимость</span><span class="cost-value" id="c-${idx}-total">0</span></div>
            </div>

            <!-- Target prices (multiple margin levels) -->
            <div class="target-block" id="item-target-${idx}" style="display:none">
                <h4>Таргет-цены для менеджера</h4>
                <div class="cost-row" style="color:var(--text-muted)"><span class="cost-label">При марже 50%</span><span class="cost-value" id="t-${idx}-m50" style="color:var(--text-muted)">0</span></div>
                <div class="cost-row" style="font-weight:700"><span class="cost-label">При марже 40% <span style="font-size:10px;font-weight:400;color:var(--green)">&larr; цель</span></span><span class="cost-value" style="color:var(--green)" id="t-${idx}-m40">0</span></div>
                <div class="cost-row" style="color:var(--text-muted)"><span class="cost-label">При марже 30%</span><span class="cost-value" id="t-${idx}-m30" style="color:var(--text-muted)">0</span></div>
                <div class="cost-row" style="color:var(--red)"><span class="cost-label">При марже 20% <span style="font-size:10px;font-weight:400">&larr; минимум</span></span><span class="cost-value" id="t-${idx}-m20" style="color:var(--red)">0</span></div>
                <div style="font-size:10px; color:var(--text-muted); margin-top:4px">+ 6% ОСН + 6.5% коммерч. уже заложены в цену</div>
            </div>

            <!-- Sell price -->
            <div class="section-title" id="item-sell-label-${idx}" style="display:none">Фактическая цена продажи</div>
            <div class="form-row" id="item-sell-${idx}" style="display:none">
                <div class="form-group">
                    <label>Цена изделия (за шт)</label>
                    <input type="number" min="0" step="0.01" value="${item.sell_price_item || ''}" oninput="Calculator.onNumChange(${idx}, 'sell_price_item', this.value)">
                </div>
            </div>

            <!-- Margin display -->
            <div id="item-margin-${idx}" style="display:none; margin-top: 8px;">
                <div class="cost-row"><span class="cost-label">Маржа изделия</span><span class="cost-value" id="m-${idx}-item">—</span></div>
            </div>
        </div>`;

        container.insertAdjacentHTML('beforeend', html);
    },

    // ==========================================
    // PRINTINGS (inside items)
    // ==========================================

    renderPrintingRow(itemIdx, printIdx, pr) {
        return `
        <div class="printing-row form-row" id="printing-${itemIdx}-${printIdx}" style="align-items:end">
            <div class="form-group" style="margin:0">
                <label>Название</label>
                <input type="text" value="${pr.name || ''}" placeholder="Тампо, UV, шелкография..." onchange="Calculator.onPrintingChange(${itemIdx}, ${printIdx}, 'name', this.value)">
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
        this.items[itemIdx].printings.push({ name: '', qty: 0, price: 0 });
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
            name: '',
            qty: 0,
            assembly_speed: 0,
            price: 0,
            delivery_total: 0,    // Total delivery cost (not per unit)
            delivery_price: 0,    // Calculated: delivery_total / qty
            sell_price: 0,
            result: null,
        };
    },

    addHardware() {
        const idx = this.hardwareItems.length;
        this.hardwareItems.push(this.getEmptyHardware());
        this.renderHardwareRow(idx);
    },

    renderHardwareRow(idx) {
        const hw = this.hardwareItems[idx];
        const list = document.getElementById('calc-hardware-list');
        const html = `
        <div class="hw-row" id="hw-row-${idx}">
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
                    <label>Сборка (шт/ч)</label>
                    <input type="number" min="0" value="${hw.assembly_speed || ''}" oninput="Calculator.onHwNum(${idx}, 'assembly_speed', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Цена закупки (шт)</label>
                    <input type="number" min="0" step="0.01" value="${hw.price || ''}" oninput="Calculator.onHwNum(${idx}, 'price', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Доставка (всего)</label>
                    <input type="number" min="0" step="0.01" value="${hw.delivery_total || ''}" oninput="Calculator.onHwNum(${idx}, 'delivery_total', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Цена продажи (шт)</label>
                    <input type="number" min="0" step="0.01" value="${hw.sell_price || ''}" oninput="Calculator.onHwNum(${idx}, 'sell_price', this.value)">
                </div>
                <button class="btn-remove" title="Удалить фурнитуру" onclick="Calculator.removeHardware(${idx})">&#10005;</button>
            </div>
            <div class="hw-result" id="hw-result-${idx}" style="display:none; margin-top:4px; font-size:12px; color:var(--text-secondary)">
                <span>Себестоимость: <b id="hw-cost-${idx}">—</b></span>
                <span style="margin-left:12px">Таргет: <b id="hw-target-${idx}">—</b></span>
                <span style="margin-left:12px" id="hw-margin-wrap-${idx}">Маржа: <b id="hw-margin-${idx}">—</b></span>
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

    onHwField(idx, field, value) {
        this.hardwareItems[idx][field] = value;
    },

    onHwNum(idx, field, value) {
        this.hardwareItems[idx][field] = parseFloat(value) || 0;
        // Auto-calculate per-unit delivery from total
        const hw = this.hardwareItems[idx];
        hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : 0;
        this.recalculate();
    },

    // ==========================================
    // PACKAGING ITEMS (order-level, separate section)
    // ==========================================

    getEmptyPackaging() {
        return {
            name: '',
            qty: 0,
            assembly_speed: 0,
            price: 0,
            delivery_total: 0,    // Total delivery cost
            delivery_price: 0,    // Calculated: delivery_total / qty
            sell_price: 0,
            result: null,
        };
    },

    addPackaging() {
        const idx = this.packagingItems.length;
        this.packagingItems.push(this.getEmptyPackaging());
        this.renderPackagingRow(idx);
    },

    renderPackagingRow(idx) {
        const pkg = this.packagingItems[idx];
        const list = document.getElementById('calc-packaging-list');
        const html = `
        <div class="pkg-row" id="pkg-row-${idx}">
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
                    <label>Сборка (шт/ч)</label>
                    <input type="number" min="0" value="${pkg.assembly_speed || ''}" oninput="Calculator.onPkgNum(${idx}, 'assembly_speed', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Цена закупки (шт)</label>
                    <input type="number" min="0" step="0.01" value="${pkg.price || ''}" oninput="Calculator.onPkgNum(${idx}, 'price', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Доставка (всего)</label>
                    <input type="number" min="0" step="0.01" value="${pkg.delivery_total || ''}" oninput="Calculator.onPkgNum(${idx}, 'delivery_total', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>Цена продажи (шт)</label>
                    <input type="number" min="0" step="0.01" value="${pkg.sell_price || ''}" oninput="Calculator.onPkgNum(${idx}, 'sell_price', this.value)">
                </div>
                <button class="btn-remove" title="Удалить упаковку" onclick="Calculator.removePackaging(${idx})">&#10005;</button>
            </div>
            <div class="pkg-result" id="pkg-result-${idx}" style="display:none; margin-top:4px; font-size:12px; color:var(--text-secondary)">
                <span>Себестоимость: <b id="pkg-cost-${idx}">—</b></span>
                <span style="margin-left:12px">Таргет: <b id="pkg-target-${idx}">—</b></span>
                <span style="margin-left:12px" id="pkg-margin-wrap-${idx}">Маржа: <b id="pkg-margin-${idx}">—</b></span>
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

    onPkgField(idx, field, value) {
        this.packagingItems[idx][field] = value;
    },

    onPkgNum(idx, field, value) {
        this.packagingItems[idx][field] = parseFloat(value) || 0;
        // Auto-calculate per-unit delivery from total
        const pkg = this.packagingItems[idx];
        pkg.delivery_price = pkg.qty > 0 ? round2(pkg.delivery_total / pkg.qty) : 0;
        this.recalculate();
    },

    // ==========================================
    // ITEM EVENTS
    // ==========================================

    onTemplateSelect(idx, selectEl) {
        const opt = selectEl.selectedOptions[0];
        if (!opt || !opt.value) return;

        const tpl = App.templates.find(t => t.id == opt.value);
        if (!tpl) return;

        this.items[idx].template_id = tpl.id;
        this.items[idx].product_name = tpl.name;
        this.items[idx].pieces_per_hour = tpl.pieces_per_hour_min;
        this.items[idx].weight_grams = tpl.weight_grams || 0;
        this.items[idx].is_blank_mold = true; // From template = always blank

        document.getElementById('item-name-' + idx).value = tpl.name;
        document.getElementById('item-pph-' + idx).value = tpl.pieces_per_hour_min;
        document.getElementById('item-weight-' + idx).value = tpl.weight_grams || '';
        document.getElementById('item-title-' + idx).textContent = tpl.name;

        this.recalculate();
    },

    setMoldType(idx, isBlank) {
        this.items[idx].is_blank_mold = isBlank;
        this.updateMoldTypeUI(idx, isBlank);
        // Clear template if switching to custom
        if (!isBlank) {
            this.items[idx].template_id = null;
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
        if (!params) return;

        let hasData = false;

        // === Calculate product items ===
        this.items.forEach((item, idx) => {
            const result = calculateItemCost(item, params);
            item.result = result;

            const hasResult = result.costTotal > 0;
            if (hasResult) hasData = true;

            const costEl = document.getElementById('item-cost-' + idx);
            const targetEl = document.getElementById('item-target-' + idx);
            const sellLabelEl = document.getElementById('item-sell-label-' + idx);
            const sellEl = document.getElementById('item-sell-' + idx);
            const marginEl = document.getElementById('item-margin-' + idx);

            if (costEl) costEl.style.display = hasResult ? '' : 'none';
            if (targetEl) targetEl.style.display = hasResult ? '' : 'none';
            if (sellLabelEl) sellLabelEl.style.display = hasResult ? '' : 'none';
            if (sellEl) sellEl.style.display = hasResult ? 'grid' : 'none';
            if (marginEl) marginEl.style.display = (hasResult && item.sell_price_item > 0) ? '' : 'none';

            if (hasResult) {
                this.setText('c-' + idx + '-fot', formatRub(result.costFot));
                this.setText('c-' + idx + '-indirect', formatRub(result.costIndirect));
                this.setText('c-' + idx + '-plastic', formatRub(result.costPlastic));
                this.setText('c-' + idx + '-mold', formatRub(result.costMoldAmortization));
                this.setText('c-' + idx + '-design', formatRub(result.costDesign));
                this.setText('c-' + idx + '-cutting', formatRub(result.costCutting));
                this.setText('c-' + idx + '-cutting-ind', formatRub(result.costCuttingIndirect));
                this.setText('c-' + idx + '-nfc-tag', formatRub(result.costNfcTag));
                this.setText('c-' + idx + '-nfc-prog', formatRub(result.costNfcProgramming));
                this.setText('c-' + idx + '-nfc-ind', formatRub(result.costNfcIndirect));
                this.setText('c-' + idx + '-printing', formatRub(result.costPrinting));
                this.setText('c-' + idx + '-delivery', formatRub(result.costDelivery));
                this.setText('c-' + idx + '-total', formatRub(result.costTotal));

                // Target prices at different margin levels
                const cost = result.costTotal;
                const calcTarget = (marginPct) => {
                    if (cost === 0) return 0;
                    const vatOnCost = cost * params.vatRate;
                    return round2((cost + vatOnCost) * (1 + marginPct) / (1 - params.taxRate - 0.065));
                };
                const t40 = calcTarget(0.40);
                const t50 = calcTarget(0.50);
                const t30 = calcTarget(0.30);
                const t20 = calcTarget(0.20);
                item.target_price_item = t40;
                this.setText('t-' + idx + '-m50', formatRub(t50));
                this.setText('t-' + idx + '-m40', formatRub(t40));
                this.setText('t-' + idx + '-m30', formatRub(t30));
                this.setText('t-' + idx + '-m20', formatRub(t20));

                if (item.sell_price_item > 0) {
                    const mi = calculateActualMargin(item.sell_price_item, result.costTotal);
                    this.setText('m-' + idx + '-item', `${formatRub(mi.earned)} (${formatPercent(mi.percent)})`);
                    const mEl = document.getElementById('m-' + idx + '-item');
                    if (mEl) mEl.className = 'cost-value ' + (mi.percent >= 30 ? 'text-green' : 'text-red');
                }
            }
        });

        // === Calculate hardware items ===
        this.hardwareItems.forEach((hw, idx) => {
            const result = calculateHardwareCost(hw, params);
            hw.result = result;

            const resEl = document.getElementById('hw-result-' + idx);
            if (result.costPerUnit > 0) {
                hasData = true;
                if (resEl) resEl.style.display = '';
                this.setText('hw-cost-' + idx, formatRub(result.costPerUnit));
                const hwQty = hw.qty || 0;
                const targetHw = calculateTargetPrice(result.costPerUnit, params, hwQty);
                hw.target_price = targetHw;
                this.setText('hw-target-' + idx, formatRub(targetHw));
                if (hw.sell_price > 0) {
                    const m = calculateActualMargin(hw.sell_price, result.costPerUnit);
                    const mEl = document.getElementById('hw-margin-' + idx);
                    if (mEl) mEl.innerHTML = `${formatRub(m.earned)} (<span class="${m.percent >= 30 ? 'text-green' : 'text-red'}">${formatPercent(m.percent)}</span>)`;
                }
            } else {
                if (resEl) resEl.style.display = 'none';
            }
        });

        // === Calculate packaging items ===
        this.packagingItems.forEach((pkg, idx) => {
            const result = calculatePackagingCost(pkg, params);
            pkg.result = result;

            const resEl = document.getElementById('pkg-result-' + idx);
            if (result.costPerUnit > 0) {
                hasData = true;
                if (resEl) resEl.style.display = '';
                this.setText('pkg-cost-' + idx, formatRub(result.costPerUnit));
                const pkgQty = pkg.qty || 0;
                const targetPkg = calculateTargetPrice(result.costPerUnit, params, pkgQty);
                pkg.target_price = targetPkg;
                this.setText('pkg-target-' + idx, formatRub(targetPkg));
                if (pkg.sell_price > 0) {
                    const m = calculateActualMargin(pkg.sell_price, result.costPerUnit);
                    const mEl = document.getElementById('pkg-margin-' + idx);
                    if (mEl) mEl.innerHTML = `${formatRub(m.earned)} (<span class="${m.percent >= 30 ? 'text-green' : 'text-red'}">${formatPercent(m.percent)}</span>)`;
                }
            } else {
                if (resEl) resEl.style.display = 'none';
            }
        });

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
            deadline: document.getElementById('calc-deadline').value || null,
            notes: document.getElementById('calc-notes').value.trim(),
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
                target_price_item: item.target_price_item || 0,
                hours_plastic: r.hoursPlastic,
                hours_cutting: r.hoursCutting,
                hours_nfc: r.hoursNfc,
                template_id: item.template_id,
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
            });
        });

        const isEdit = !!App.editingOrderId;
        const orderId = await saveOrder(order, items);
        if (orderId) {
            App.editingOrderId = orderId;
            // Record change history
            const managerName = document.getElementById('calc-manager-name').value.trim() || 'Неизвестный';
            await Orders.addChangeRecord(orderId, {
                field: isEdit ? 'order_edit' : 'order_create',
                old_value: '',
                new_value: isEdit ? 'Заказ отредактирован' : 'Заказ создан',
                manager: managerName,
                description: `Выручка: ${formatRub(summary.totalRevenue)}, Маржа: ${formatPercent(summary.marginPercent)}`,
            });
            App.toast('Заказ сохранен');
        } else {
            App.toast('Ошибка сохранения');
        }
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
        document.getElementById('calc-deadline').value = order.deadline || '';
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
                try { item.printings = JSON.parse(item.printings); } catch { item.printings = []; }
            }
            if (!Array.isArray(item.printings)) item.printings = [];
            // Migrate old single-printing to new format
            if (item.printings.length === 0 && dbItem.printing_qty > 0) {
                item.printings = [{ name: '', qty: dbItem.printing_qty, price: dbItem.printing_price_per_unit || 0 }];
            }
            this.items.push(item);
            this.renderItemBlock(i);
        });

        // Restore hardware items
        const hwItems = dbItems.filter(i => i.item_type === 'hardware');
        hwItems.forEach((dbHw) => {
            const hw = this.getEmptyHardware();
            hw.name = dbHw.product_name || '';
            hw.qty = dbHw.quantity || 0;
            hw.assembly_speed = dbHw.hardware_assembly_speed || 0;
            hw.price = dbHw.hardware_price_per_unit || 0;
            // Support both old per-unit and new total delivery
            const perUnit = dbHw.hardware_delivery_per_unit || 0;
            hw.delivery_total = dbHw.hardware_delivery_total || (perUnit * hw.qty);
            hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : perUnit;
            hw.sell_price = dbHw.sell_price_hardware || 0;
            this.hardwareItems.push(hw);
            this.renderHardwareRow(this.hardwareItems.length - 1);
        });

        // Restore packaging items
        const pkgItems = dbItems.filter(i => i.item_type === 'packaging');
        pkgItems.forEach((dbPkg) => {
            const pkg = this.getEmptyPackaging();
            pkg.name = dbPkg.product_name || '';
            pkg.qty = dbPkg.quantity || 0;
            pkg.assembly_speed = dbPkg.packaging_assembly_speed || 0;
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
            const desc = h.description ? ` — ${h.description}` : '';
            let action = '';
            if (h.field === 'status') {
                action = `${h.old_value} → ${h.new_value}`;
            } else if (h.field === 'order_create') {
                action = 'Заказ создан';
            } else if (h.field === 'order_edit') {
                action = 'Заказ отредактирован';
            } else {
                action = h.new_value || h.description;
            }
            return `<div style="padding:4px 0; border-bottom:1px solid var(--border); display:flex; gap:12px; align-items:baseline;">
                <span style="color:var(--text-muted); min-width:110px;">${dateStr}</span>
                <span style="font-weight:600; min-width:100px;">${h.manager || '—'}</span>
                <span>${action}${desc}</span>
            </div>`;
        }).join('');
    },

    // ==========================================
    // КП (Commercial Proposal) PDF
    // ==========================================

    generateKP() {
        const orderName = document.getElementById('calc-order-name').value.trim();
        const clientName = document.getElementById('calc-client-name').value.trim();

        if (!orderName) {
            App.toast('Сначала заполните название заказа');
            return;
        }

        // Validate: all sell prices must be filled
        let missingPrices = [];
        this.items.forEach((item, i) => {
            if (!item.result || !item.quantity) return;
            if (!item.sell_price_item || item.sell_price_item <= 0) {
                missingPrices.push(`Изделие "${item.product_name || (i+1)}": цена продажи`);
            }
        });
        this.hardwareItems.forEach((hw, i) => {
            if (hw.qty > 0 && (!hw.sell_price || hw.sell_price <= 0)) {
                missingPrices.push(`Фурнитура "${hw.name || (i+1)}": цена продажи`);
            }
        });
        this.packagingItems.forEach((pkg, i) => {
            if (pkg.qty > 0 && (!pkg.sell_price || pkg.sell_price <= 0)) {
                missingPrices.push(`Упаковка "${pkg.name || (i+1)}": цена продажи`);
            }
        });

        if (missingPrices.length > 0) {
            App.toast('Заполните цены продажи: ' + missingPrices.join(', '), 5000);
            return;
        }

        // Collect data for КП — only actual sell prices
        const kpItems = [];

        this.items.forEach(item => {
            if (!item.result || !item.quantity) return;
            // Item price includes printing cost — no separate printing lines in KP
            kpItems.push({
                type: 'product',
                name: item.product_name || 'Изделие',
                qty: item.quantity,
                price: item.sell_price_item,
            });
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

        KPGenerator.generate(orderName, clientName, kpItems);
    },
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());

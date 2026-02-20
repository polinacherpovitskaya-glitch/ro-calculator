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
        // Simple hash check — "recycle2026" or any non-empty
        const hash = this.simpleHash(pwd);
        // For demo: accept "recycle2026" or if in local mode, accept any password
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
        // Session expires after 24 hours
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

        // Init Supabase
        initSupabase();

        // Load settings and templates
        this.settings = await loadSettings();
        this.templates = await loadTemplates();
        this.params = getProductionParams(this.settings);

        // Route
        this.handleRoute();
    },

    // === ROUTING ===

    handleRoute() {
        const hash = window.location.hash.replace('#', '') || 'dashboard';
        const page = hash.split('/')[0];
        this.navigate(page, false);
    },

    navigate(page, pushHash = true) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        // Show target page
        const target = document.getElementById('page-' + page);
        if (target) {
            target.classList.add('active');
            this.currentPage = page;
        } else {
            document.getElementById('page-dashboard').classList.add('active');
            this.currentPage = 'dashboard';
        }

        // Update nav
        document.querySelectorAll('.sidebar-nav a').forEach(a => {
            a.classList.toggle('active', a.dataset.page === this.currentPage);
        });

        if (pushHash) {
            window.location.hash = this.currentPage;
        }

        // Page-specific init
        this.onPageEnter(this.currentPage);
    },

    onPageEnter(page) {
        switch (page) {
            case 'dashboard': Dashboard.load(); break;
            case 'calculator': Calculator.init(); break;
            case 'orders': Orders.loadList(); break;
            case 'analytics': Analytics.load(); break;
            case 'molds': Molds.load(); break;
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
// =============================================

const Calculator = {
    items: [],
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
        document.getElementById('calc-items-container').innerHTML = '';
        document.getElementById('calc-production-load').style.display = 'none';
        document.getElementById('calc-findirector').style.display = 'none';
        document.getElementById('calc-summary-footer').style.display = 'none';
        document.getElementById('calc-add-item-btn').style.display = '';
    },

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
            is_nfc: false,
            nfc_programming: false,
            hardware_qty: 0,
            hardware_assembly_speed: 0,
            hardware_price_per_unit: 0,
            hardware_delivery_per_unit: 0,
            packaging_qty: 0,
            packaging_assembly_speed: 0,
            packaging_price_per_unit: 0,
            packaging_delivery_per_unit: 0,
            printing_qty: 0,
            printing_price_per_unit: 0,
            delivery_included: false,
            sell_price_item: 0,
            sell_price_hardware: 0,
            sell_price_packaging: 0,
            result: null,
            template_id: null,
        };
    },

    renderItemBlock(idx) {
        const item = this.items[idx];
        const num = idx + 1;
        const container = document.getElementById('calc-items-container');

        // Build template options
        let templateOpts = '<option value="">-- Выбрать из справочника --</option>';
        if (App.templates) {
            const blanks = App.templates.filter(t => t.category === 'blank');
            const customs = App.templates.filter(t => t.category === 'custom_old');

            if (blanks.length) {
                templateOpts += '<optgroup label="Бланки">';
                blanks.forEach(t => {
                    templateOpts += `<option value="${t.id}" data-pph-min="${t.pieces_per_hour_min}" data-pph-max="${t.pieces_per_hour_max}" data-weight="${t.weight_grams || 0}">${t.name} (${t.pieces_per_hour_display} шт/ч)</option>`;
                });
                templateOpts += '</optgroup>';
            }
            if (customs.length) {
                templateOpts += '<optgroup label="Кастомные формы">';
                customs.forEach(t => {
                    templateOpts += `<option value="${t.id}" data-pph-min="${t.pieces_per_hour_min}" data-pph-max="${t.pieces_per_hour_max}" data-weight="${t.weight_grams || 0}">${t.name} (${t.pieces_per_hour_display} шт/ч)</option>`;
                });
                templateOpts += '</optgroup>';
            }
        }

        const html = `
        <div class="item-block" id="item-block-${idx}">
            <div class="item-block-header">
                <div class="item-num">${num}</div>
                <div class="item-title" id="item-title-${idx}">${item.product_name || 'Изделие ' + num}</div>
                <button class="btn btn-sm btn-outline" onclick="Calculator.removeItem(${idx})">Удалить</button>
            </div>

            <div class="form-group template-select">
                <label>Форма из справочника</label>
                <select onchange="Calculator.onTemplateSelect(${idx}, this)">
                    ${templateOpts}
                </select>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Название изделия</label>
                    <input type="text" value="${item.product_name}" onchange="Calculator.onFieldChange(${idx}, 'product_name', this.value)">
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

            <!-- Фурнитура -->
            <div class="section-title">Фурнитура</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Кол-во</label>
                    <input type="number" min="0" value="${item.hardware_qty || ''}" oninput="Calculator.onNumChange(${idx}, 'hardware_qty', this.value)">
                </div>
                <div class="form-group">
                    <label>Скорость сборки (шт/ч)</label>
                    <input type="number" min="0" value="${item.hardware_assembly_speed || ''}" oninput="Calculator.onNumChange(${idx}, 'hardware_assembly_speed', this.value)">
                </div>
                <div class="form-group">
                    <label>Цена закупки (шт)</label>
                    <input type="number" min="0" step="0.01" value="${item.hardware_price_per_unit || ''}" oninput="Calculator.onNumChange(${idx}, 'hardware_price_per_unit', this.value)">
                </div>
                <div class="form-group">
                    <label>Доставка (шт)</label>
                    <input type="number" min="0" step="0.01" value="${item.hardware_delivery_per_unit || ''}" oninput="Calculator.onNumChange(${idx}, 'hardware_delivery_per_unit', this.value)">
                </div>
            </div>

            <!-- Упаковка -->
            <div class="section-title">Упаковка</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Кол-во</label>
                    <input type="number" min="0" value="${item.packaging_qty || ''}" oninput="Calculator.onNumChange(${idx}, 'packaging_qty', this.value)">
                </div>
                <div class="form-group">
                    <label>Скорость сборки (шт/ч)</label>
                    <input type="number" min="0" value="${item.packaging_assembly_speed || ''}" oninput="Calculator.onNumChange(${idx}, 'packaging_assembly_speed', this.value)">
                </div>
                <div class="form-group">
                    <label>Цена закупки (шт)</label>
                    <input type="number" min="0" step="0.01" value="${item.packaging_price_per_unit || ''}" oninput="Calculator.onNumChange(${idx}, 'packaging_price_per_unit', this.value)">
                </div>
                <div class="form-group">
                    <label>Доставка (шт)</label>
                    <input type="number" min="0" step="0.01" value="${item.packaging_delivery_per_unit || ''}" oninput="Calculator.onNumChange(${idx}, 'packaging_delivery_per_unit', this.value)">
                </div>
            </div>

            <!-- Нанесение -->
            <div class="section-title">Нанесение (печать/UV)</div>
            <div class="form-row">
                <div class="form-group">
                    <label>Кол-во</label>
                    <input type="number" min="0" value="${item.printing_qty || ''}" oninput="Calculator.onNumChange(${idx}, 'printing_qty', this.value)">
                </div>
                <div class="form-group">
                    <label>Цена нанесения (шт)</label>
                    <input type="number" min="0" step="0.01" value="${item.printing_price_per_unit || ''}" oninput="Calculator.onNumChange(${idx}, 'printing_price_per_unit', this.value)">
                </div>
            </div>

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

                <div class="section-title">Фурнитура / Упаковка (за 1 шт)</div>
                <div class="cost-row"><span class="cost-label">Фурнитура</span><span class="cost-value" id="c-${idx}-hw">0</span></div>
                <div class="cost-row"><span class="cost-label">Упаковка</span><span class="cost-value" id="c-${idx}-pkg">0</span></div>
            </div>

            <!-- Target prices -->
            <div class="target-block" id="item-target-${idx}" style="display:none">
                <h4>Таргет цена (70/30)</h4>
                <div class="cost-row"><span class="cost-label">Изделие</span><span class="cost-value" id="t-${idx}-item">0</span></div>
                <div class="cost-row"><span class="cost-label">Фурнитура</span><span class="cost-value" id="t-${idx}-hw">0</span></div>
                <div class="cost-row"><span class="cost-label">Упаковка</span><span class="cost-value" id="t-${idx}-pkg">0</span></div>
            </div>

            <!-- Sell prices -->
            <div class="section-title" id="item-sell-label-${idx}" style="display:none">Фактическая цена продажи</div>
            <div class="form-row" id="item-sell-${idx}" style="display:none">
                <div class="form-group">
                    <label>Цена изделия</label>
                    <input type="number" min="0" step="0.01" value="${item.sell_price_item || ''}" oninput="Calculator.onNumChange(${idx}, 'sell_price_item', this.value)">
                </div>
                <div class="form-group">
                    <label>Цена фурнитуры</label>
                    <input type="number" min="0" step="0.01" value="${item.sell_price_hardware || ''}" oninput="Calculator.onNumChange(${idx}, 'sell_price_hardware', this.value)">
                </div>
                <div class="form-group">
                    <label>Цена упаковки</label>
                    <input type="number" min="0" step="0.01" value="${item.sell_price_packaging || ''}" oninput="Calculator.onNumChange(${idx}, 'sell_price_packaging', this.value)">
                </div>
            </div>

            <!-- Margin display -->
            <div id="item-margin-${idx}" style="display:none; margin-top: 8px;">
                <div class="cost-row"><span class="cost-label">Маржа изделия</span><span class="cost-value" id="m-${idx}-item">—</span></div>
                <div class="cost-row"><span class="cost-label">Маржа фурнитуры</span><span class="cost-value" id="m-${idx}-hw">—</span></div>
                <div class="cost-row"><span class="cost-label">Маржа упаковки</span><span class="cost-value" id="m-${idx}-pkg">—</span></div>
            </div>
        </div>`;

        container.insertAdjacentHTML('beforeend', html);
    },

    onTemplateSelect(idx, selectEl) {
        const opt = selectEl.selectedOptions[0];
        if (!opt || !opt.value) return;

        const tpl = App.templates.find(t => t.id == opt.value);
        if (!tpl) return;

        this.items[idx].template_id = tpl.id;
        this.items[idx].product_name = tpl.name;

        // Use min speed as default (conservative)
        this.items[idx].pieces_per_hour = tpl.pieces_per_hour_min;
        this.items[idx].weight_grams = tpl.weight_grams || 0;

        // Update input fields
        const block = document.getElementById('item-block-' + idx);
        const inputs = block.querySelectorAll('input[type="text"], input[type="number"]');
        // product_name is the first text input
        inputs[0].value = tpl.name;
        // pieces_per_hour
        document.getElementById('item-pph-' + idx).value = tpl.pieces_per_hour_min;
        // weight
        document.getElementById('item-weight-' + idx).value = tpl.weight_grams || '';

        // Update title
        document.getElementById('item-title-' + idx).textContent = tpl.name;

        this.recalculate();
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
        // Re-number
        this.items.forEach((item, i) => item.item_number = i + 1);
        // Re-render all
        const container = document.getElementById('calc-items-container');
        container.innerHTML = '';
        this.items.forEach((_, i) => this.renderItemBlock(i));
        document.getElementById('calc-add-item-btn').style.display = '';
        this.recalculate();
    },

    recalculate() {
        const params = App.params;
        if (!params) return;

        let hasData = false;

        this.items.forEach((item, idx) => {
            const result = calculateItemCost(item, params);
            item.result = result;

            const hasResult = result.costTotal > 0;
            if (hasResult) hasData = true;

            // Update cost breakdown
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
                // Cost breakdown
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
                this.setText('c-' + idx + '-hw', formatRub(result.costHardware));
                this.setText('c-' + idx + '-pkg', formatRub(result.costPackaging));

                // Target prices
                const targetItem = calculateTargetPrice(result.costTotal, params);
                const targetHw = calculateTargetPrice(result.costHardware, params);
                const targetPkg = calculateTargetPrice(result.costPackaging, params);

                item.target_price_item = targetItem;
                item.target_price_hardware = targetHw;
                item.target_price_packaging = targetPkg;

                this.setText('t-' + idx + '-item', formatRub(targetItem));
                this.setText('t-' + idx + '-hw', formatRub(targetHw));
                this.setText('t-' + idx + '-pkg', formatRub(targetPkg));

                // Margins
                if (item.sell_price_item > 0) {
                    const mi = calculateActualMargin(item.sell_price_item, result.costTotal);
                    this.setText('m-' + idx + '-item', `${formatRub(mi.earned)} (${formatPercent(mi.percent)})`);
                    const mEl = document.getElementById('m-' + idx + '-item');
                    if (mEl) mEl.className = 'cost-value ' + (mi.percent >= 30 ? 'text-green' : mi.percent >= 0 ? 'text-red' : 'text-red');
                }
                if (item.sell_price_hardware > 0) {
                    const mh = calculateActualMargin(item.sell_price_hardware, result.costHardware);
                    this.setText('m-' + idx + '-hw', `${formatRub(mh.earned)} (${formatPercent(mh.percent)})`);
                }
                if (item.sell_price_packaging > 0) {
                    const mp = calculateActualMargin(item.sell_price_packaging, result.costPackaging);
                    this.setText('m-' + idx + '-pkg', `${formatRub(mp.earned)} (${formatPercent(mp.percent)})`);
                }
            }
        });

        // Production load
        const loadEl = document.getElementById('calc-production-load');
        const finEl = document.getElementById('calc-findirector');
        const sumEl = document.getElementById('calc-summary-footer');

        if (hasData) {
            loadEl.style.display = '';
            finEl.style.display = '';
            sumEl.style.display = '';

            const load = calculateProductionLoad(this.items, params);
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
            const fin = calculateFinDirectorData(this.items, params);
            this.setText('fin-salary', formatRub(fin.salary));
            this.setText('fin-hardware', formatRub(fin.hardwarePurchase));
            this.setText('fin-hw-delivery', formatRub(fin.hardwareDelivery));
            this.setText('fin-design', formatRub(fin.design));
            this.setText('fin-printing', formatRub(fin.printing));
            this.setText('fin-plastic', formatRub(fin.plastic));
            this.setText('fin-molds', formatRub(fin.molds));
            this.setText('fin-delivery', formatRub(fin.delivery));
            this.setText('fin-taxes', formatRub(fin.taxes));
            this.setText('fin-total-costs', formatRub(fin.totalCosts));
            this.setText('fin-revenue', formatRub(fin.revenue));

            // Summary footer
            const summary = calculateOrderSummary(this.items);
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

    async saveOrder() {
        const orderName = document.getElementById('calc-order-name').value.trim();
        if (!orderName) {
            App.toast('Введите название заказа');
            return;
        }

        // Gather order data
        const load = calculateProductionLoad(this.items, App.params);
        const summary = calculateOrderSummary(this.items);

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

        // Gather items for DB
        const items = this.items.filter(i => i.quantity > 0).map(item => {
            const r = item.result || getEmptyCostResult();
            return {
                item_number: item.item_number,
                product_name: item.product_name,
                quantity: item.quantity,
                pieces_per_hour: item.pieces_per_hour,
                weight_grams: item.weight_grams,
                extra_molds: item.extra_molds,
                complex_design: item.complex_design,
                is_nfc: item.is_nfc,
                nfc_programming: item.nfc_programming,
                hardware_qty: item.hardware_qty,
                hardware_assembly_speed: item.hardware_assembly_speed,
                hardware_price_per_unit: item.hardware_price_per_unit,
                hardware_delivery_per_unit: item.hardware_delivery_per_unit,
                packaging_qty: item.packaging_qty,
                packaging_assembly_speed: item.packaging_assembly_speed,
                packaging_price_per_unit: item.packaging_price_per_unit,
                packaging_delivery_per_unit: item.packaging_delivery_per_unit,
                printing_qty: item.printing_qty,
                printing_price_per_unit: item.printing_price_per_unit,
                delivery_included: item.delivery_included,
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
                cost_hardware: r.costHardware,
                cost_packaging: r.costPackaging,
                sell_price_item: item.sell_price_item,
                sell_price_hardware: item.sell_price_hardware,
                sell_price_packaging: item.sell_price_packaging,
                target_price_item: item.target_price_item || 0,
                target_price_hardware: item.target_price_hardware || 0,
                target_price_packaging: item.target_price_packaging || 0,
                hours_plastic: r.hoursPlastic,
                hours_cutting: r.hoursCutting,
                hours_nfc: r.hoursNfc,
                hours_hardware: r.hoursHardware,
                hours_packaging: r.hoursPackaging,
                template_id: item.template_id,
            };
        });

        const orderId = await saveOrder(order, items);
        if (orderId) {
            App.editingOrderId = orderId;
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

        const { order, items } = data;
        document.getElementById('calc-order-name').value = order.order_name || '';
        document.getElementById('calc-client-name').value = order.client_name || '';
        document.getElementById('calc-manager-name').value = order.manager_name || '';
        document.getElementById('calc-deadline').value = order.deadline || '';
        document.getElementById('calc-notes').value = order.notes || '';

        // Restore items
        items.forEach((dbItem, i) => {
            const item = this.getEmptyItem(i + 1);
            Object.keys(item).forEach(key => {
                if (dbItem[key] !== undefined && dbItem[key] !== null) {
                    item[key] = dbItem[key];
                }
            });
            this.items.push(item);
            this.renderItemBlock(i);
        });

        if (this.items.length === 0) this.addItem();
        this.recalculate();

        App.navigate('calculator');
    },
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());

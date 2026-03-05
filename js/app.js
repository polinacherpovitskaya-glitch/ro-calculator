// =============================================
// Recycle Object — App Core (Routing, Auth, Init)
// =============================================

const APP_VERSION = 'v56';

const App = {
    currentPage: 'dashboard',
    settings: null,
    templates: null,
    params: null,
    editingOrderId: null,
    _updateCheckTimer: null,
    _updateCheckMs: 120000,
    _onWindowFocus: null,
    employees: [],
    authAccounts: [],
    currentEmployeeId: null,
    currentUser: null,
    _sessionStartedAt: null,

    async init() {
        initSupabase();
        await this.prepareAuthUI();

        // Check auth
        if (this.isAuthenticated()) {
            await this.restoreAuthenticatedUser();
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

    async login() {
        const selectedUserId = (document.getElementById('auth-user-select')?.value || '__admin').trim();
        const pwd = document.getElementById('auth-password').value;
        const nowTs = Date.now().toString();
        let ok = false;
        let errorText = 'Неверный пароль';

        if (selectedUserId === '__admin') {
            const hash = this.simpleHash(pwd);
            if (this.isAllowedAuthHash(hash)) {
                localStorage.setItem('ro_calc_auth', hash);
                localStorage.setItem('ro_calc_auth_method', 'admin');
                localStorage.setItem('ro_calc_auth_ts', nowTs);
                localStorage.removeItem('ro_calc_auth_user_id');
                this.currentUser = { id: '__admin', name: 'Администратор', role: 'admin', employee_id: null };
                ok = true;
            }
        } else {
            const account = this.authAccounts.find(a => String(a.id) === String(selectedUserId) && a.is_active !== false);
            if (!account) {
                errorText = 'Пользователь не найден';
            } else {
                const hash = this.hashUserPassword(account.username || '', pwd);
                if (hash === account.password_hash) {
                    localStorage.setItem('ro_calc_auth_method', 'user');
                    localStorage.setItem('ro_calc_auth_ts', nowTs);
                    localStorage.setItem('ro_calc_auth_user_id', String(account.id));
                    localStorage.removeItem('ro_calc_auth');
                    this.currentUser = {
                        id: account.id,
                        employee_id: account.employee_id ?? null,
                        username: account.username || '',
                        name: account.employee_name || account.username || 'Сотрудник',
                        role: account.role || 'employee',
                    };
                    ok = true;
                    account.last_login_at = new Date().toISOString();
                    await saveAuthAccounts(this.authAccounts);
                    appendAuthActivity({
                        type: 'login',
                        actor: this.currentUser.name,
                        actor_user_id: this.currentUser.id,
                        method: 'user',
                    });
                }
            }
        }

        if (ok) {
            document.getElementById('auth-error').style.display = 'none';
            document.getElementById('auth-password').value = '';
            this.showApp();
            return;
        }
        const err = document.getElementById('auth-error');
        err.textContent = errorText;
        err.style.display = 'block';
    },

    isAuthenticated() {
        const method = localStorage.getItem('ro_calc_auth_method') || 'admin';
        const ts = parseInt(localStorage.getItem('ro_calc_auth_ts') || '0');
        if (!ts || (Date.now() - ts) >= 86400000) return false;

        if (method === 'user') {
            const userId = localStorage.getItem('ro_calc_auth_user_id');
            return !!userId;
        }

        const auth = localStorage.getItem('ro_calc_auth');
        if (auth && this.isAllowedAuthHash(auth)) return true;
        if (auth && !this.isAllowedAuthHash(auth)) {
            localStorage.removeItem('ro_calc_auth');
            localStorage.removeItem('ro_calc_auth_ts');
            localStorage.removeItem('ro_calc_auth_method');
        }
        return false;
    },

    async restoreAuthenticatedUser() {
        const method = localStorage.getItem('ro_calc_auth_method') || 'admin';
        if (method === 'admin') {
            this.currentUser = { id: '__admin', name: 'Администратор', role: 'admin', employee_id: null };
            return;
        }
        this.authAccounts = await loadAuthAccounts();
        const userId = localStorage.getItem('ro_calc_auth_user_id');
        const account = this.authAccounts.find(a => String(a.id) === String(userId));
        if (account) {
            this.currentUser = {
                id: account.id,
                employee_id: account.employee_id ?? null,
                username: account.username || '',
                name: account.employee_name || account.username || 'Сотрудник',
                role: account.role || 'employee',
            };
            return;
        }
        this.currentUser = { id: '__admin', name: 'Администратор', role: 'admin', employee_id: null };
        localStorage.setItem('ro_calc_auth_method', 'admin');
        localStorage.removeItem('ro_calc_auth_user_id');
    },

    logout() {
        this.trackAuthEvent('logout');
        localStorage.removeItem('ro_calc_auth');
        localStorage.removeItem('ro_calc_auth_ts');
        localStorage.removeItem('ro_calc_auth_method');
        localStorage.removeItem('ro_calc_auth_user_id');
        this.currentUser = null;
        this._sessionStartedAt = null;
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-layout').classList.remove('active');
        this.hideUpdateBanner();
        if (this._updateCheckTimer) {
            clearInterval(this._updateCheckTimer);
            this._updateCheckTimer = null;
        }
        if (this._onWindowFocus) {
            window.removeEventListener('focus', this._onWindowFocus);
            this._onWindowFocus = null;
        }
    },

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString();
    },

    isAllowedAuthHash(hash) {
        return hash === this.simpleHash('recycle2026') || hash === this.simpleHash('demo');
    },

    hashUserPassword(username, password) {
        return this.simpleHash(`ro:${String(username || '').trim().toLowerCase()}::${String(password || '')}`);
    },

    async prepareAuthUI() {
        try {
            const employees = await loadEmployees();
            this.employees = (employees || []).filter(e => e && e.name && e.is_active !== false);
        } catch (e) {
            this.employees = [];
        }
        try {
            this.authAccounts = await loadAuthAccounts();
        } catch (e) {
            this.authAccounts = [];
        }
        this.renderAuthUserSelect();
    },

    renderAuthUserSelect() {
        const select = document.getElementById('auth-user-select');
        if (!select) return;

        const accounts = (this.authAccounts || [])
            .filter(a => a && a.is_active !== false)
            .sort((a, b) => String(a.employee_name || a.username || '').localeCompare(String(b.employee_name || b.username || ''), 'ru'));

        let html = '<option value="__admin">Администратор</option>';
        html += accounts.map(a => {
            const name = this.escHtml(a.employee_name || a.username || 'Сотрудник');
            const login = this.escHtml(a.username || '');
            return `<option value="${this.escHtml(String(a.id))}">${name}${login ? ` (${login})` : ''}</option>`;
        }).join('');
        select.innerHTML = html;
    },

    async refreshAuthUsers() {
        this.authAccounts = await loadAuthAccounts();
        this.renderAuthUserSelect();
    },

    async showApp() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-layout').classList.add('active');

        // Show version in sidebar
        const verEl = document.getElementById('app-version');
        if (verEl) verEl.textContent = APP_VERSION;

        // Auto-backup on version change
        const lastVersion = localStorage.getItem('ro_calc_last_version');
        if (lastVersion && lastVersion !== APP_VERSION) {
            try {
                Settings.autoBackup('upgrade-' + lastVersion + '-to-' + APP_VERSION);
                console.log('Auto-backup created before upgrade from', lastVersion, 'to', APP_VERSION);
            } catch (e) { console.warn('Auto-backup failed:', e); }
        }
        localStorage.setItem('ro_calc_last_version', APP_VERSION);

        this.settings = await loadSettings();
        this.templates = await loadTemplates();
        this.params = getProductionParams(this.settings);
        await this.initEmployeeContext();
        this._sessionStartedAt = Date.now();
        this.trackAuthEvent('session_start');

        this.handleRoute();
        this.startUpdateChecker();
    },

    // === EMPLOYEE IDENTITY ===

    async initEmployeeContext() {
        await this.refreshEmployees();
        this.applyCurrentEmployeeToCalculator(true);
    },

    async refreshEmployees() {
        let all = [];
        try {
            all = await loadEmployees();
        } catch (e) {
            console.error('[App] Failed to load employees:', e);
        }

        this.employees = (all || []).filter(e => e && e.name && e.is_active !== false);
        const selectEl = document.getElementById('app-current-employee');
        const calcManagerEl = document.getElementById('calc-manager-name');
        const userEmployeeId = this.currentUser && this.currentUser.employee_id != null
            ? String(this.currentUser.employee_id)
            : null;
        const savedId = userEmployeeId || localStorage.getItem('ro_calc_current_employee_id');
        const calcCurrentName = calcManagerEl ? (calcManagerEl.value || '').trim() : '';
        const fallbackByName = calcCurrentName
            ? this.employees.find(e => (e.name || '').trim() === calcCurrentName)
            : null;
        const fallback = fallbackByName || null;
        const selected = this.employees.find(e => String(e.id) === String(savedId)) || fallback;

        this.currentEmployeeId = selected ? selected.id : null;
        if (selected) localStorage.setItem('ro_calc_current_employee_id', String(selected.id));
        else localStorage.removeItem('ro_calc_current_employee_id');

        if (selectEl) {
            let html = '<option value="">Не выбран</option>';
            html += this.employees.map(e => `<option value="${this.escHtml(String(e.id))}">${this.escHtml(e.name || '')}</option>`).join('');
            selectEl.innerHTML = html;
            selectEl.value = this.currentEmployeeId != null ? String(this.currentEmployeeId) : '';
            selectEl.disabled = !!userEmployeeId;
        }

        if (calcManagerEl) {
            const previousValue = (calcManagerEl.value || '').trim();
            let html = '<option value="">-- Выбрать --</option>';
            html += this.employees.map(e => `<option value="${this.escHtml(e.name || '')}">${this.escHtml(e.name || '')}</option>`).join('');
            calcManagerEl.innerHTML = html;

            const preferred = previousValue || this.getCurrentEmployeeName();
            if (preferred) calcManagerEl.value = preferred;
        }
    },

    onCurrentEmployeeChange(employeeId) {
        if (this.currentUser && this.currentUser.employee_id != null) {
            return;
        }
        const selected = this.employees.find(e => String(e.id) === String(employeeId));
        if (!selected) {
            this.currentEmployeeId = null;
            localStorage.removeItem('ro_calc_current_employee_id');
            return;
        }
        this.currentEmployeeId = selected.id;
        localStorage.setItem('ro_calc_current_employee_id', String(selected.id));
        this.applyCurrentEmployeeToCalculator(true);
    },

    getCurrentEmployee() {
        return this.employees.find(e => String(e.id) === String(this.currentEmployeeId)) || null;
    },

    getCurrentEmployeeName() {
        if (this.currentUser && this.currentUser.name) return this.currentUser.name;
        const e = this.getCurrentEmployee();
        return (e && e.name) ? e.name : 'Неизвестный';
    },

    trackAuthEvent(type, extra = {}) {
        const actor = this.getCurrentEmployeeName();
        const payload = {
            type,
            actor,
            actor_user_id: this.currentUser ? this.currentUser.id : null,
            page: this.currentPage || '',
            session_started_at: this._sessionStartedAt ? new Date(this._sessionStartedAt).toISOString() : null,
            ...extra,
        };
        appendAuthActivity(payload);
    },

    applyCurrentEmployeeToCalculator(force = false) {
        const calcManagerEl = document.getElementById('calc-manager-name');
        if (!calcManagerEl) return;
        if (force || !calcManagerEl.value) {
            const name = this.getCurrentEmployeeName();
            if (name && name !== 'Неизвестный') {
                calcManagerEl.value = name;
            }
        }
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
        this.trackAuthEvent('navigate', { to_page: this.currentPage });
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
            case 'marketplaces': Marketplaces.load(); break;
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

    // === UPDATE CHECKER ===

    startUpdateChecker() {
        if (this._updateCheckTimer) return;
        this.checkForUpdate();
        this._updateCheckTimer = setInterval(() => this.checkForUpdate(), this._updateCheckMs);
        if (!this._onWindowFocus) {
            this._onWindowFocus = () => this.checkForUpdate();
            window.addEventListener('focus', this._onWindowFocus);
        }
    },

    async checkForUpdate() {
        try {
            const resp = await fetch('js/version.json?t=' + Date.now(), { cache: 'no-store' });
            if (!resp.ok) return;
            const payload = await resp.json();
            const remoteVersion = payload && payload.version ? String(payload.version) : null;
            if (!remoteVersion) return;

            if (remoteVersion !== APP_VERSION) this.showUpdateBanner(remoteVersion);
            else this.hideUpdateBanner();
        } catch (e) {
            // Silently ignore: no internet or temporary network issues.
        }
    },

    showUpdateBanner(remoteVersion) {
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        banner.textContent = '⟳ Обновление ' + remoteVersion;
        banner.style.display = 'inline-flex';
    },

    hideUpdateBanner() {
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        banner.style.display = 'none';
    },

    reloadForUpdate() {
        window.location.reload();
    },

    // === UTILS ===

    formatDate(dateStr) {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    statusLabel(status) {
        const map = {
            draft:                'Черновик',
            calculated:           'Черновик',          // backward compat
            sample:               'Заказ образца',
            production_casting:   'Производство: Выливание',
            production_hardware:  'Производство: Сборка',
            production_packaging: 'Производство: Упаковка',
            in_production:        'Производство',      // backward compat
            delivery:             'Доставка',
            completed:            'Готово',
            cancelled:            'Отменён',
            deleted:              'Удалён',
        };
        return map[status] || status;
    },

    escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
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
    extraCosts: [],     // Extra costs [{name, amount}]
    maxItems: 6,
    _autosaveTimer: null,
    _isDirty: false,
    _autosaving: false,
    _currentOrderStatus: 'draft', // Track current order status to preserve on autosave

    async init() {
        // Ensure colors are loaded for color picker
        try {
            if (!Colors.data || Colors.data.length === 0) {
                Colors.data = await loadColors();
            }
        } catch (e) { console.error('[Calculator.init] loadColors error:', e); }

        if (this.items.length === 0 && !App.editingOrderId) {
            // Try to restore last editing session after page refresh
            const savedId = localStorage.getItem('ro_calc_editing_order_id');
            if (savedId) {
                try {
                    await this.loadOrder(parseInt(savedId));
                    console.log('[Calculator.init] Restored draft order #' + savedId);
                } catch (e) {
                    console.warn('[Calculator.init] Could not restore draft:', e);
                    localStorage.removeItem('ro_calc_editing_order_id');
                    this.resetForm();
                    this.addItem();
                }
            } else {
                this.resetForm();
                this.addItem();
            }
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
                if (!e.target.closest('.china-picker')) {
                    document.querySelectorAll('.china-picker-dropdown').forEach(d => d.style.display = 'none');
                }
            });
            // Force-save on page unload if dirty
            window.addEventListener('beforeunload', (e) => {
                if (this._isDirty && this._autosaveTimer) {
                    // Try to save synchronously before page closes
                    clearTimeout(this._autosaveTimer);
                    // beforeunload can't run async, but editingOrderId is already persisted
                    // The autosave will have already saved the data within 2 seconds of last change
                }
            });
            // Save immediately on page visibility change (tab switch, minimize)
            document.addEventListener('visibilitychange', () => {
                if (document.hidden && this._isDirty) {
                    clearTimeout(this._autosaveTimer);
                    this._doAutosave();
                }
            });
        }
    },

    resetForm() {
        // Cancel any pending autosave
        clearTimeout(this._autosaveTimer);
        this._isDirty = false;
        this._autosaving = false;

        App.editingOrderId = null;
        this._currentOrderStatus = 'draft';
        localStorage.removeItem('ro_calc_editing_order_id');
        document.getElementById('calc-order-name').value = '';
        document.getElementById('calc-client-name').value = '';
        App.applyCurrentEmployeeToCalculator(true);
        // Auto-fill "Начало" with today's date for new orders
        document.getElementById('calc-deadline-start').value = new Date().toISOString().slice(0, 10);
        document.getElementById('calc-deadline-end').value = '';
        document.getElementById('calc-notes').value = '';
        document.getElementById('calc-delivery-address').value = '';
        document.getElementById('calc-telegram').value = '';
        document.getElementById('calc-crm-link').value = '';
        document.getElementById('calc-fintablo-link').value = '';
        document.getElementById('calc-client-legal-name').value = '';
        document.getElementById('calc-client-inn').value = '';
        document.getElementById('calc-client-legal-address').value = '';
        document.getElementById('calc-client-bank-name').value = '';
        document.getElementById('calc-client-bank-account').value = '';
        document.getElementById('calc-client-bank-bik').value = '';
        this.items = [];
        this.hardwareItems = [];
        this.packagingItems = [];
        this.extraCosts = [];
        document.getElementById('calc-items-container').innerHTML = '';
        document.getElementById('calc-hardware-list').innerHTML = '';
        document.getElementById('calc-packaging-list').innerHTML = '';
        document.getElementById('extra-costs-list').innerHTML = '';
        document.getElementById('calc-production-load').style.display = 'none';
        document.getElementById('calc-findirector').style.display = 'none';
        document.getElementById('calc-summary-footer').style.display = 'none';
        const pricingEl = document.getElementById('calc-pricing');
        if (pricingEl) pricingEl.style.display = 'none';
        document.getElementById('calc-add-item-btn').style.display = '';
        const historyEl = document.getElementById('calc-history');
        if (historyEl) historyEl.style.display = 'none';
        // Clear autosave indicator
        const statusEl = document.getElementById('calc-autosave-status');
        if (statusEl) statusEl.textContent = '';
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
        this.scheduleAutosave();
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
            // Colors (multiple per item)
            colors: [],  // [{id, name}, ...]
            color_id: null,   // backward compat (first color)
            color_name: '',   // backward compat (first color)
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

        // Build multi-color picker
        let colorPickerHtml = '';
        try {
            const allColors = Colors.data || [];
            if (allColors.length > 0) {
                // Migrate old single color_id to colors array
                if (!item.colors) item.colors = [];
                if (item.colors.length === 0 && item.color_id) {
                    const oldC = allColors.find(c => c.id == item.color_id);
                    if (oldC) item.colors = [{ id: oldC.id, name: oldC.name }];
                }

                // Render selected color chips
                const selectedIds = new Set(item.colors.map(c => c.id));
                let chipsHtml = '';
                if (item.colors.length > 0) {
                    chipsHtml = item.colors.map(sc => {
                        const full = allColors.find(c => c.id === sc.id);
                        const photo = full?.photo_url
                            ? `<img src="${this._escAttr(full.photo_url)}" style="width:24px;height:24px;object-fit:cover;border-radius:50%;border:1px solid var(--border)">`
                            : `<span style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:50%;font-size:10px;font-weight:700;color:var(--accent)">${(sc.name||'?')[0]}</span>`;
                        return `<span class="color-chip" style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px 3px 4px;background:var(--accent-light);border-radius:16px;font-size:11px;font-weight:600;white-space:nowrap">
                            ${photo}
                            <span>${this._esc(full?.number || '')} ${this._esc(sc.name)}</span>
                            <span onclick="event.stopPropagation();Calculator.removeColor(${idx},${sc.id})" style="cursor:pointer;color:var(--text-muted);font-size:13px;margin-left:2px;line-height:1" title="Убрать">&times;</span>
                        </span>`;
                    }).join('');
                }

                // Color dropdown items (mark already-selected)
                const colorItemsHtml = allColors.map(c => {
                    const photo = c.photo_url
                        ? `<img src="${this._escAttr(c.photo_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:50%;border:1px solid var(--border);flex-shrink:0">`
                        : `<span style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:50%;font-size:14px;font-weight:700;color:var(--accent);flex-shrink:0">${(c.name || '?')[0]}</span>`;
                    const isSel = selectedIds.has(c.id);
                    return `<div class="color-picker-item ${isSel ? 'selected' : ''}" onclick="Calculator.onColorSelect(${idx}, ${c.id})" style="display:flex;gap:8px;align-items:center;padding:5px 8px;cursor:pointer;border-radius:6px;${isSel ? 'background:var(--accent-light)' : ''}">
                        ${photo}
                        <div style="flex:1;min-width:0">
                            <span style="font-size:11px;color:var(--text-muted)">${this._esc(c.number)}</span>
                            <span style="font-size:12px;font-weight:600">${this._esc(c.name)}</span>
                        </div>
                        ${isSel ? '<span style="color:var(--accent);font-size:14px;flex-shrink:0">&#10003;</span>' : ''}
                    </div>`;
                }).join('');

                colorPickerHtml = `
                <div class="form-group" style="position:relative">
                    <label>Цветовое решение</label>
                    <div id="color-chips-${idx}" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">${chipsHtml}</div>
                    <div class="color-picker" id="color-picker-${idx}">
                        <div class="color-picker-selected" onclick="Calculator.toggleColorPicker(${idx})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;background:var(--card-bg)">
                            <span style="color:var(--accent);font-size:13px;font-weight:600">+ Добавить цвет</span>
                            <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;margin-left:8px">&#9662;</span>
                        </div>
                        <div class="color-picker-dropdown" id="color-picker-dd-${idx}" style="display:none;position:absolute;z-index:100;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-lg);max-height:280px;overflow:hidden;width:100%">
                            <div style="padding:6px 8px;border-bottom:1px solid var(--border);display:flex;gap:4px">
                                <input type="text" placeholder="Поиск цвета..." oninput="Calculator.filterColorPicker(${idx}, this.value)" style="flex:1;padding:5px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                                <button class="btn btn-sm btn-outline" onclick="Calculator.clearColors(${idx})" title="Убрать все" style="padding:4px 8px;font-size:10px;">&#10005; Все</button>
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
                <span id="item-hw-badge-${idx}" style="display:none;font-size:11px;color:var(--accent);margin-top:4px;font-weight:600;">+ ${item.builtin_hw_name || ''}</span>
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

            <!-- Фурнитура изделия (per-item) -->
            <div class="section-title" style="margin-top:12px">🔩 Фурнитура</div>
            <div id="item-hw-list-${idx}"></div>
            <button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="Calculator.addItemHardware(${idx})">+ Фурнитура</button>

            <!-- Упаковка изделия (per-item) -->
            <div class="section-title" style="margin-top:12px">📦 Упаковка</div>
            <div id="item-pkg-list-${idx}"></div>
            <button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="Calculator.addItemPackaging(${idx})">+ Упаковка</button>

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
                <div class="cost-row"><span class="cost-label">Встроенная фурнитура</span><span class="cost-value" id="c-${idx}-builtin-hw">0</span></div>
                <div class="cost-row" style="display:none"><span class="cost-label">Фурнитура (косв.)</span><span class="cost-value" id="c-${idx}-builtin-hw-ind">0</span></div>
                <div class="cost-row"><span class="cost-label">Нанесение</span><span class="cost-value" id="c-${idx}-printing">0</span></div>
                <div class="cost-row"><span class="cost-label">Доставка</span><span class="cost-value" id="c-${idx}-delivery">0</span></div>
                <div class="cost-row" style="border-top:1px dashed var(--border);padding-top:4px"><span class="cost-label">Себестоимость изделия</span><span class="cost-value" id="c-${idx}-subtotal">0</span></div>
                <div id="c-${idx}-peritem-hw-rows"></div>
                <div id="c-${idx}-peritem-pkg-rows"></div>
                <div class="cost-row cost-total"><span class="cost-label">ИТОГО с фурнитурой/упаковкой</span><span class="cost-value" id="c-${idx}-total">0</span></div>
            </div>

        </div>`;

        // Replace existing block if re-rendering, otherwise append
        const existingBlock = document.getElementById('item-block-' + idx);
        if (existingBlock) {
            existingBlock.outerHTML = html;
        } else {
            container.insertAdjacentHTML('beforeend', html);
        }

        // Render per-item hardware and packaging
        this._renderPerItemHwPkg(idx);
    },

    /**
     * Render all per-item hardware/packaging rows for a given item index
     */
    _renderPerItemHwPkg(itemIdx) {
        const hwList = document.getElementById('item-hw-list-' + itemIdx);
        const pkgList = document.getElementById('item-pkg-list-' + itemIdx);
        if (hwList) {
            hwList.innerHTML = '';
            this.hardwareItems.forEach((hw, hwIdx) => {
                if (hw.parent_item_index === itemIdx) {
                    this.renderHardwareRow(hwIdx, 'item-hw-list-' + itemIdx);
                }
            });
        }
        if (pkgList) {
            pkgList.innerHTML = '';
            this.packagingItems.forEach((pkg, pkgIdx) => {
                if (pkg.parent_item_index === itemIdx) {
                    this.renderPackagingRow(pkgIdx, 'item-pkg-list-' + itemIdx);
                }
            });
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
            <div class="form-group" style="margin:0">
                <label>Доставка (общая)</label>
                <input type="number" min="0" step="1" value="${pr.delivery_total || ''}" oninput="Calculator.onPrintingChange(${itemIdx}, ${printIdx}, 'delivery_total', this.value)" placeholder="0">
            </div>
            <button class="btn-remove" title="Удалить нанесение" onclick="Calculator.removePrinting(${itemIdx}, ${printIdx})">&#10005;</button>
        </div>`;
    },

    addPrinting(itemIdx) {
        this.items[itemIdx].printings.push({ name: '', qty: 0, price: 0, sell_price: 0, delivery_total: 0 });
        const pi = this.items[itemIdx].printings.length - 1;
        const list = document.getElementById('printings-list-' + itemIdx);
        list.insertAdjacentHTML('beforeend', this.renderPrintingRow(itemIdx, pi, this.items[itemIdx].printings[pi]));
        this.scheduleAutosave();
    },

    removePrinting(itemIdx, printIdx) {
        this.items[itemIdx].printings.splice(printIdx, 1);
        this.rerenderPrintings(itemIdx);
        this.recalculate();
        this.scheduleAutosave();
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
        this.scheduleAutosave();
    },

    // ==========================================
    // HARDWARE ITEMS (order-level, separate section)
    // ==========================================

    getEmptyHardware(parentItemIndex) {
        return {
            parent_item_index: parentItemIndex ?? null,  // null = order-level, number = per-item
            _from_template: false,  // true = auto-created from blank template
            source: 'warehouse',        // 'warehouse' | 'china' | 'custom'
            warehouse_item_id: null,    // id позиции со склада
            warehouse_sku: '',          // артикул (для истории)
            china_item_id: null,        // id from ChinaCatalog
            china_delivery_method: 'avia', // 'avia_fast' | 'avia' | 'auto'
            name: '',
            qty: 0,
            assembly_speed: 0,      // шт/ч (for calculator.js)
            assembly_minutes: 0,    // шт/мин (user input, display field)
            price_cny: 0,           // Price in CNY (china/custom)
            weight_grams: 0,        // Weight in grams (china/custom)
            price: 0,               // Price in RUB per unit
            delivery_total: 0,    // Total delivery cost
            delivery_price: 0,    // Per-unit delivery cost
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
            this.hardwareItems.push(this.getEmptyHardware(null));  // order-level
            await this._ensureWhPickerData();
            this.renderHardwareRow(idx);
            this.scheduleAutosave();
        } catch (err) {
            console.error('[addHardware] error:', err);
            App.toast('Ошибка добавления фурнитуры: ' + err.message);
        }
    },

    async addItemHardware(itemIdx) {
        try {
            const idx = this.hardwareItems.length;
            this.hardwareItems.push(this.getEmptyHardware(itemIdx));  // per-item
            await this._ensureWhPickerData();
            this.renderHardwareRow(idx, 'item-hw-list-' + itemIdx);
            this.scheduleAutosave();
        } catch (err) {
            console.error('[addItemHardware] error:', err);
            App.toast('Ошибка добавления фурнитуры: ' + err.message);
        }
    },

    renderHardwareRow(idx, targetListId) {
        const hw = this.hardwareItems[idx];
        const minsDisplay = hw.assembly_minutes || '';
        const isWarehouse = hw.source === 'warehouse';
        const isChina = hw.source === 'china';
        const isCustom = hw.source === 'custom';
        const list = document.getElementById(targetListId || 'calc-hardware-list');

        // Build warehouse picker (hardware only — exclude packaging)
        let pickerHtml = '';
        if (this._whPickerData) {
            pickerHtml = Warehouse.buildImagePicker(`hw-picker-${idx}`, this._whPickerData, hw.warehouse_item_id, 'Calculator.onHwWarehouseSelect', 'hardware');
        }

        // Max qty from warehouse
        const whItem = (isWarehouse && hw.warehouse_item_id) ? this._findWhItem(hw.warehouse_item_id) : null;
        const maxQty = whItem ? whItem.available_qty : '';
        const maxAttr = whItem ? ` max="${whItem.available_qty}"` : '';

        // Delivery method options for china/custom
        const deliveryOpts = Object.entries(ChinaCatalog.DELIVERY_METHODS || {}).map(([key, m]) => {
            const sel = (hw.china_delivery_method || 'avia') === key ? ' selected' : '';
            return `<option value="${key}"${sel}>${m.label} ($${m.rate_usd}/\u043a\u0433)</option>`;
        }).join('');

        // China pricing info line
        const chinaInfo = (isChina || isCustom) && hw.price_cny > 0
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:4px 8px;background:var(--bg);border-radius:4px;">
                \ud83d\udcb0 ${hw.price_cny}\u00a5 = <b>${formatRub(hw.price)}</b>/\u0448\u0442 \u00b7 \ud83d\udce6 \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430: <b>${formatRub(hw.delivery_price)}</b>/\u0448\u0442 (${hw.weight_grams || 0}\u0433)
               </div>` : '';

        let modeHtml = '';
        if (isWarehouse) {
            modeHtml = `
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:2;">
                    <label>\u041f\u043e\u0437\u0438\u0446\u0438\u044f \u0441\u043e \u0441\u043a\u043b\u0430\u0434\u0430</label>
                    ${pickerHtml}
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u041a\u043e\u043b-\u0432\u043e${maxQty !== '' ? ` <span style="font-size:10px;color:var(--text-muted);">(\u043c\u0430\u043a\u0441: ${maxQty})</span>` : ''}</label>
                    <input type="number" min="0"${maxAttr} value="${hw.qty || ''}" oninput="Calculator.onHwNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>${this._assemblyTimingLabel()}</label>
                    <input type="number" min="0" step="1" value="${minsDisplay}" oninput="Calculator.onHwMinutes(${idx}, this.value)" placeholder="\u043d\u0430\u043f\u0440. 9">
                </div>
            </div>`;
        } else if (isChina) {
            const chinaPickerHtml = this._buildChinaPickerHtml('hw', idx, hw);
            modeHtml = `
            <div class="form-group" style="margin:0 0 8px">
                <label>\u041f\u043e\u0437\u0438\u0446\u0438\u044f \u0438\u0437 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430 \u041a\u0438\u0442\u0430\u0439</label>
                ${chinaPickerHtml}
            </div>
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0">
                    <label>\u041a\u043e\u043b-\u0432\u043e</label>
                    <input type="number" min="0" value="${hw.qty || ''}" oninput="Calculator.onHwNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>${this._assemblyTimingLabel()}</label>
                    <input type="number" min="0" step="1" value="${minsDisplay}" oninput="Calculator.onHwMinutes(${idx}, this.value)" placeholder="\u043d\u0430\u043f\u0440. 9">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</label>
                    <select onchange="Calculator.onChinaDeliveryMethod('hw', ${idx}, this.value)">${deliveryOpts}</select>
                </div>
            </div>
            ${chinaInfo}`;
        } else {
            modeHtml = `
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:1.5">
                    <label>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</label>
                    <input type="text" value="${this._esc(hw.name || '')}" placeholder="\u041a\u0430\u0440\u0430\u0431\u0438\u043d, \u043a\u043e\u043b\u044c\u0446\u043e, \u043c\u0430\u0433\u043d\u0438\u0442..." onchange="Calculator.onHwField(${idx}, 'name', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u041a\u043e\u043b-\u0432\u043e</label>
                    <input type="number" min="0" value="${hw.qty || ''}" oninput="Calculator.onHwNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>${this._assemblyTimingLabel()}</label>
                    <input type="number" min="0" step="1" value="${minsDisplay}" oninput="Calculator.onHwMinutes(${idx}, this.value)" placeholder="\u043d\u0430\u043f\u0440. 9">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0426\u0435\u043d\u0430 (\u00a5/\u0448\u0442)</label>
                    <input type="number" min="0" step="0.01" value="${hw.price_cny || ''}" oninput="Calculator.onChinaNum('hw', ${idx}, 'price_cny', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0412\u0435\u0441 (\u0433)</label>
                    <input type="number" min="0" step="0.1" value="${hw.weight_grams || ''}" oninput="Calculator.onChinaNum('hw', ${idx}, 'weight_grams', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</label>
                    <select onchange="Calculator.onChinaDeliveryMethod('hw', ${idx}, this.value)">${deliveryOpts}</select>
                </div>
            </div>
            ${chinaInfo}`;
        }

        const html = `
        <div class="hw-row" id="hw-row-${idx}" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="hw-source-toggle">
                    <label class="${isWarehouse ? 'src-active' : ''}">
                        <input type="radio" name="hw-src-${idx}" value="warehouse" ${isWarehouse ? 'checked' : ''} onchange="Calculator.onHwSourceChange(${idx}, 'warehouse')" style="display:none;">
                        &#128230; \u0421\u043e \u0441\u043a\u043b\u0430\u0434\u0430
                    </label>
                    <label class="${isChina ? 'src-active' : ''}">
                        <input type="radio" name="hw-src-${idx}" value="china" ${isChina ? 'checked' : ''} onchange="Calculator.onHwSourceChange(${idx}, 'china')" style="display:none;">
                        \ud83c\udde8\ud83c\uddf3 \u0418\u0437 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430
                    </label>
                    <label class="${isCustom ? 'src-active' : ''}">
                        <input type="radio" name="hw-src-${idx}" value="custom" ${isCustom ? 'checked' : ''} onchange="Calculator.onHwSourceChange(${idx}, 'custom')" style="display:none;">
                        &#9998; \u041a\u0430\u0441\u0442\u043e\u043c\u043d\u0430\u044f
                    </label>
                </div>
                <button class="btn-remove" title="\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u0443" onclick="Calculator.removeHardware(${idx})">&#10005;</button>
            </div>
            ${modeHtml}
            <div class="cost-breakdown" id="hw-cost-${idx}" style="display:none">
                <div class="section-title" style="margin-top:0">\u0421\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0444\u0443\u0440\u043d\u0438\u0442\u0443\u0440\u044b (\u0437\u0430 1 \u0448\u0442)</div>
                <div class="cost-row"><span class="cost-label">\u0424\u041e\u0422 \u0441\u0431\u043e\u0440\u043a\u0430</span><span class="cost-value" id="hw-${idx}-fot">0</span></div>
                <div class="cost-row" style="display:none"><span class="cost-label">\u041a\u043e\u0441\u0432\u0435\u043d\u043d\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b</span><span class="cost-value" id="hw-${idx}-indirect">0</span></div>
                <div class="cost-row"><span class="cost-label">\u0417\u0430\u043a\u0443\u043f\u043a\u0430</span><span class="cost-value" id="hw-${idx}-purchase">0</span></div>
                <div class="cost-row"><span class="cost-label">\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 (\u043d\u0430 \u0448\u0442)</span><span class="cost-value" id="hw-${idx}-delivery">0</span></div>
                <div class="cost-row cost-total"><span class="cost-label">\u0418\u0422\u041e\u0413\u041e \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c</span><span class="cost-value" id="hw-${idx}-total">0</span></div>
            </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    },

    removeHardware(idx) {
        const hw = this.hardwareItems[idx];
        const parentIdx = hw ? hw.parent_item_index : null;
        this.hardwareItems.splice(idx, 1);
        this.rerenderAllHardware();
        // Also re-render per-item hw for all items (indices shifted)
        this.items.forEach((_, i) => this._renderPerItemHwPkg(i));
        this.recalculate();
        this.scheduleAutosave();
    },

    rerenderAllHardware() {
        const list = document.getElementById('calc-hardware-list');
        if (list) {
            list.innerHTML = '';
            this.hardwareItems.forEach((hw, i) => {
                if (hw.parent_item_index === null || hw.parent_item_index === undefined) {
                    this.renderHardwareRow(i);
                }
            });
        }
    },

    _rerenderHwItem(idx) {
        const hw = this.hardwareItems[idx];
        // Remove old row
        const oldRow = document.getElementById('hw-row-' + idx);
        if (oldRow) oldRow.remove();
        // Re-render in appropriate container
        if (hw.parent_item_index !== null && hw.parent_item_index !== undefined) {
            this.renderHardwareRow(idx, 'item-hw-list-' + hw.parent_item_index);
        } else {
            this.renderHardwareRow(idx);
        }
    },

    onHwSourceChange(idx, source) {
        const hw = this.hardwareItems[idx];
        hw.source = source;
        if (source === 'china') {
            hw.warehouse_item_id = null;
            hw.warehouse_sku = '';
            if (!hw.china_delivery_method) hw.china_delivery_method = 'avia';
            this._recalcChinaPricing(hw);
        } else if (source === 'custom') {
            hw.warehouse_item_id = null;
            hw.warehouse_sku = '';
            hw.china_item_id = null;
            if (!hw.china_delivery_method) hw.china_delivery_method = 'avia';
            this._recalcChinaPricing(hw);
        } else {
            hw.name = '';
            hw.price = 0;
            hw.price_cny = 0;
            hw.weight_grams = 0;
            hw.delivery_total = 0;
            hw.delivery_price = 0;
            hw.warehouse_item_id = null;
            hw.warehouse_sku = '';
            hw.china_item_id = null;
        }
        // Smart re-render: only affected hw, not all
        this.rerenderAllHardware();
        this.items.forEach((_, i) => this._renderPerItemHwPkg(i));
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
            this._rerenderHwItem(idx);
            this.recalculate();
            return;
        }

        const whItem = this._findWhItem(itemId);
        if (!whItem) return;
        if ((whItem.available_qty || 0) <= 0) {
            App.toast(`На складе нет "${whItem.name}". Закажите из Китая.`);
        }

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

        this._rerenderHwItem(idx);
        this.recalculate();
    },

    onHwField(idx, field, value) {
        this.hardwareItems[idx][field] = value;
        this.scheduleAutosave();
    },

    onHwNum(idx, field, value) {
        this.hardwareItems[idx][field] = parseFloat(value) || 0;
        const hw = this.hardwareItems[idx];
        // Enforce max qty for warehouse items
        if (field === 'qty' && hw.source === 'warehouse' && hw.warehouse_item_id) {
            const whItem = this._findWhItem(hw.warehouse_item_id);
            if (whItem && hw.qty > whItem.available_qty) {
                hw.qty = whItem.available_qty;
                App.toast(`Максимум на складе: ${whItem.available_qty} ${whItem.unit}. Остальное — из Китая.`);
            }
        }
        // For china/custom sources, recalc from CNY pricing
        if (hw.source === 'china' || hw.source === 'custom') {
            this._recalcChinaPricing(hw);
        } else {
            // Auto-calculate per-unit delivery from total (warehouse)
            hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : 0;
        }
        this.recalculate();
        this.scheduleAutosave();
    },

    onHwMinutes(idx, value) {
        const pcsPerMin = parseFloat(value) || 0;
        this.hardwareItems[idx].assembly_minutes = pcsPerMin;
        // Convert шт/мин → шт/час for calculator
        this.hardwareItems[idx].assembly_speed = round2(pcsPerMin * 60);
        this.recalculate();
        this.scheduleAutosave();
    },

    // ==========================================
    // ASSEMBLY TIMING REFERENCE
    // ==========================================

    _assemblyTimingLabel() {
        return `Сборка (шт/мин) <span onclick="Calculator.showAssemblyTiming()" style="cursor:pointer;color:var(--accent);font-weight:700;font-size:13px;margin-left:2px;" title="Справочник тайминга">ⓘ</span>`;
    },

    showAssemblyTiming() {
        // Remove existing popup if any
        const existing = document.getElementById('assembly-timing-popup');
        if (existing) { existing.remove(); return; }

        // Read from stored data (editable in Settings → Тайминг)
        const data = Settings.getTimingData();

        let html = `<div id="assembly-timing-popup" onclick="if(event.target===this)this.remove()" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.35);z-index:1000;display:flex;align-items:center;justify-content:center;">
            <div class="card" style="width:420px;max-height:80vh;overflow-y:auto;padding:20px;" onclick="event.stopPropagation()">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                    <h3 style="margin:0;">⏱ Тайминг сборки</h3>
                    <button class="btn-remove" style="font-size:10px;width:24px;height:24px;" onclick="document.getElementById('assembly-timing-popup').remove()">✕</button>
                </div>
                <p style="font-size:11px;color:var(--text-muted);margin-bottom:12px;">Нажмите на строку, чтобы скопировать шт/мин (+30%). <a href="#" onclick="event.preventDefault();document.getElementById('assembly-timing-popup').remove();App.navigate('settings');setTimeout(()=>Settings.switchTab('timing'),200);" style="color:var(--accent);">Редактировать ⚙</a></p>`;

        data.forEach(group => {
            if (!group.items || group.items.length === 0) return;
            html += `<div style="font-weight:700;font-size:11px;color:var(--text-muted);text-transform:uppercase;margin:12px 0 6px;letter-spacing:0.5px;">${group.section}</div>`;
            group.items.forEach(([name, sec]) => {
                const raw = 60 / (sec * 1.3);
                const pcsPerMin = raw >= 1 ? Math.floor(raw) : Math.round(raw * 10) / 10;
                html += `<div onclick="navigator.clipboard.writeText('${pcsPerMin}');App.toast('Скопировано: ${pcsPerMin} шт/мин');document.getElementById('assembly-timing-popup').remove();" style="display:flex;justify-content:space-between;padding:6px 8px;border-bottom:1px solid var(--border);cursor:pointer;font-size:12px;border-radius:4px;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
                    <span>${name}</span>
                    <span style="font-weight:600;white-space:nowrap;margin-left:8px;">${sec}с → <span style="color:var(--accent);">${pcsPerMin} шт/мин</span></span>
                </div>`;
            });
        });

        html += '</div></div>';
        document.body.insertAdjacentHTML('beforeend', html);
    },

    // ==========================================
    // CHINA CATALOG — visual picker + shared methods
    // ==========================================

    /**
     * Build the visual China catalog picker HTML (mold-picker style)
     */
    _buildChinaPickerHtml(type, idx, item) {
        const chinaItem = item.china_item_id ? (ChinaCatalog._items || []).find(i => i.id === item.china_item_id) : null;
        const cnyRate = ChinaCatalog._cnyRate || 12.5;

        // Selected display
        let selectedHtml;
        if (chinaItem) {
            const photoUrl = chinaItem.photo_url || '';
            const proxied = typeof ChinaCatalog._proxyPhoto === 'function' ? ChinaCatalog._proxyPhoto(photoUrl) : photoUrl;
            const photoEl = proxied
                ? `<img src="${this._escAttr(proxied)}" style="width:40px;height:40px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0" onerror="this.style.display='none'" loading="lazy">`
                : `<span style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:14px;flex-shrink:0">🇨🇳</span>`;
            const priceRub = round2(chinaItem.price_cny * cnyRate);
            selectedHtml = `<div style="display:flex;gap:8px;align-items:center;flex:1;min-width:0">
                ${photoEl}
                <div style="min-width:0"><div style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._esc(chinaItem.name)}${chinaItem.size ? ' ' + this._esc(chinaItem.size) : ''}</div>
                <div style="font-size:10px;color:var(--text-muted)">${this._esc(chinaItem.category_ru)} · ${chinaItem.weight_grams || 0}г · ${chinaItem.price_cny}¥ ≈ ${formatRub(priceRub)}</div></div>
            </div>`;
        } else {
            selectedHtml = '<span style="color:var(--text-muted);font-size:13px">-- Выбрать из каталога Китай --</span>';
        }

        return `<div class="china-picker" id="${type}-china-picker-${idx}" style="position:relative">
            <div class="china-picker-selected" onclick="Calculator.toggleChinaPicker('${type}', ${idx})" style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;background:var(--card-bg)">
                ${selectedHtml}
                <span style="flex-shrink:0;color:var(--text-muted);font-size:10px;margin-left:8px">&#9662;</span>
            </div>
            <div class="china-picker-dropdown" id="${type}-china-dd-${idx}" style="display:none;position:absolute;z-index:100;background:var(--card-bg);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow-lg);width:100%;max-width:480px;overflow:hidden;">
                <div style="padding:6px 8px;border-bottom:1px solid var(--border)">
                    <input type="text" id="${type}-china-filter-${idx}" placeholder="Поиск по каталогу..." oninput="Calculator.filterChinaPicker('${type}', ${idx})" style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:4px;font-size:12px">
                </div>
                <div id="${type}-china-cats-${idx}" style="padding:4px 8px;display:flex;flex-wrap:wrap;gap:4px;border-bottom:1px solid var(--border)"></div>
                <div id="${type}-china-list-${idx}" class="china-picker-list" style="max-height:320px;overflow-y:auto;padding:4px"></div>
            </div>
        </div>`;
    },

    /**
     * Render picker list items with filtering
     */
    _renderChinaPickerList(type, idx) {
        const listEl = document.getElementById(type + '-china-list-' + idx);
        if (!listEl) return;

        const searchEl = document.getElementById(type + '-china-filter-' + idx);
        const query = (searchEl?.value || '').toLowerCase().trim();

        // Get active category
        const catsEl = document.getElementById(type + '-china-cats-' + idx);
        const activePill = catsEl?.querySelector('.cat-pill.active');
        const activeCat = activePill?.dataset.cat || 'all';

        const items = (ChinaCatalog._items || []).filter(item => {
            if (activeCat !== 'all' && item.category !== activeCat) return false;
            if (query) {
                const s = [item.name, item.category_ru, item.size, item.notes].filter(Boolean).join(' ').toLowerCase();
                if (!s.includes(query)) return false;
            }
            return true;
        });

        const cnyRate = ChinaCatalog._cnyRate || 12.5;
        if (!items.length) {
            listEl.innerHTML = '<div style="padding:12px;color:var(--text-muted);font-size:12px;text-align:center;">Ничего не найдено</div>';
            return;
        }

        listEl.innerHTML = items.map(item => {
            const photoUrl = item.photo_url || '';
            const proxied = typeof ChinaCatalog._proxyPhoto === 'function' ? ChinaCatalog._proxyPhoto(photoUrl) : photoUrl;
            const photoHtml = proxied
                ? `<img src="${this._escAttr(proxied)}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" loading="lazy"><span style="width:48px;height:48px;display:none;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:16px;flex-shrink:0">📦</span>`
                : `<span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:var(--accent-light);border-radius:6px;font-size:16px;flex-shrink:0">📦</span>`;
            const priceRub = round2(item.price_cny * cnyRate);
            return `<div class="china-picker-item" style="display:flex;gap:8px;align-items:center;padding:6px 8px;cursor:pointer;border-radius:6px;"
                      onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''"
                      onclick="Calculator.selectChinaCatalogItem('${type}', ${idx}, ${item.id})">
                ${photoHtml}
                <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${this._esc(item.name)}${item.size ? ' <span style="color:var(--text-muted);font-weight:400">' + this._esc(item.size) + '</span>' : ''}</div>
                    <div style="font-size:10px;color:var(--text-muted)">${this._esc(item.category_ru)} · ${item.weight_grams || 0}г · ${item.price_cny}¥ ≈ ${formatRub(priceRub)}</div>
                </div>
            </div>`;
        }).join('');
    },

    /**
     * Render category pills
     */
    _renderChinaPickerCats(type, idx) {
        const catsEl = document.getElementById(type + '-china-cats-' + idx);
        if (!catsEl) return;
        const categories = ChinaCatalog.getCategories();
        let html = `<span class="cat-pill active" data-cat="all" onclick="Calculator.filterChinaPickerCat('${type}', ${idx}, this)" style="padding:3px 8px;border-radius:12px;font-size:11px;cursor:pointer;background:var(--accent);color:#fff;white-space:nowrap">Все</span>`;
        categories.forEach((label, key) => {
            html += `<span class="cat-pill" data-cat="${this._escAttr(key)}" onclick="Calculator.filterChinaPickerCat('${type}', ${idx}, this)" style="padding:3px 8px;border-radius:12px;font-size:11px;cursor:pointer;background:var(--bg);color:var(--text-secondary);white-space:nowrap">${this._esc(label)}</span>`;
        });
        catsEl.innerHTML = html;
    },

    async toggleChinaPicker(type, idx) {
        const dd = document.getElementById(type + '-china-dd-' + idx);
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        // Close all pickers first
        document.querySelectorAll('.china-picker-dropdown').forEach(d => d.style.display = 'none');
        document.querySelectorAll('.mold-picker-dropdown').forEach(d => d.style.display = 'none');
        document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
        if (!isOpen) {
            // Lazy-load catalog
            if ((ChinaCatalog._items || []).length === 0) {
                ChinaCatalog._items = await ChinaCatalog._loadItems();
            }
            dd.style.display = '';
            this._renderChinaPickerCats(type, idx);
            this._renderChinaPickerList(type, idx);
            // Focus search
            const input = dd.querySelector('input[type="text"]');
            if (input) input.focus();
        }
    },

    closeChinaPicker(type, idx) {
        const dd = document.getElementById(type + '-china-dd-' + idx);
        if (dd) dd.style.display = 'none';
    },

    filterChinaPicker(type, idx) {
        this._renderChinaPickerList(type, idx);
    },

    filterChinaPickerCat(type, idx, pillEl) {
        // Update active pill style
        const catsEl = document.getElementById(type + '-china-cats-' + idx);
        if (catsEl) {
            catsEl.querySelectorAll('.cat-pill').forEach(p => {
                p.style.background = 'var(--bg)';
                p.style.color = 'var(--text-secondary)';
                p.classList.remove('active');
            });
        }
        pillEl.style.background = 'var(--accent)';
        pillEl.style.color = '#fff';
        pillEl.classList.add('active');
        this._renderChinaPickerList(type, idx);
    },

    _recalcChinaPricing(item) {
        if (item.source !== 'china' && item.source !== 'custom') return;
        const cnyRate = ChinaCatalog._cnyRate || 12.5;
        const usdRate = ChinaCatalog._usdRate || 90;
        const itemSurcharge = ChinaCatalog.ITEM_SURCHARGE || 0.035;
        const deliverySurcharge = ChinaCatalog.DELIVERY_SURCHARGE || 0.10;
        const priceCny = item.price_cny || 0;
        item.price = round2(priceCny * cnyRate * (1 + itemSurcharge));
        const method = (ChinaCatalog.DELIVERY_METHODS || {})[item.china_delivery_method || 'avia'];
        const rateUsd = method ? method.rate_usd : 33;
        const weightKg = (item.weight_grams || 0) / 1000;
        item.delivery_price = round2(weightKg * rateUsd * usdRate * (1 + deliverySurcharge));
        item.delivery_total = round2(item.delivery_price * (item.qty || 0));
    },

    selectChinaCatalogItem(type, idx, itemId) {
        const arr = type === 'hw' ? this.hardwareItems : this.packagingItems;
        const item = arr[idx];
        const catItem = ChinaCatalog._items.find(i => i.id === itemId);
        if (!catItem) return;
        item.china_item_id = catItem.id;
        item.name = catItem.name + (catItem.size ? ' ' + catItem.size : '');
        item.price_cny = catItem.price_cny || 0;
        item.weight_grams = catItem.weight_grams || 0;
        this._recalcChinaPricing(item);
        if (type === 'hw') { this._rerenderHwItem(idx); } else { this._rerenderPkgItem(idx); }
        this.recalculate();
        this.scheduleAutosave();
    },

    onChinaDeliveryMethod(type, idx, method) {
        const arr = type === 'hw' ? this.hardwareItems : this.packagingItems;
        arr[idx].china_delivery_method = method;
        this._recalcChinaPricing(arr[idx]);
        if (type === 'hw') { this._rerenderHwItem(idx); } else { this._rerenderPkgItem(idx); }
        this.recalculate();
        this.scheduleAutosave();
    },

    onChinaNum(type, idx, field, value) {
        const arr = type === 'hw' ? this.hardwareItems : this.packagingItems;
        arr[idx][field] = parseFloat(value) || 0;
        this._recalcChinaPricing(arr[idx]);
        this.recalculate();
        this.scheduleAutosave();
    },

    // ==========================================
    // PACKAGING ITEMS (order-level, separate section)
    // ==========================================

    getEmptyPackaging(parentItemIndex) {
        return {
            parent_item_index: parentItemIndex ?? null,  // null = order-level, number = per-item
            source: 'warehouse',        // 'warehouse' | 'china' | 'custom'
            warehouse_item_id: null,
            warehouse_sku: '',
            china_item_id: null,
            china_delivery_method: 'avia',
            name: '',
            qty: 0,
            assembly_speed: 0,
            assembly_minutes: 0,
            price_cny: 0,
            weight_grams: 0,
            price: 0,
            delivery_total: 0,
            delivery_price: 0,
            sell_price: 0,
            result: null,
        };
    },

    async addPackaging() {
        try {
            const idx = this.packagingItems.length;
            this.packagingItems.push(this.getEmptyPackaging(null));  // order-level
            await this._ensureWhPickerData();
            this.renderPackagingRow(idx);
            this.scheduleAutosave();
        } catch (err) {
            console.error('[addPackaging] error:', err);
            App.toast('Ошибка добавления упаковки: ' + err.message);
        }
    },

    async addItemPackaging(itemIdx) {
        try {
            const idx = this.packagingItems.length;
            this.packagingItems.push(this.getEmptyPackaging(itemIdx));  // per-item
            await this._ensureWhPickerData();
            this.renderPackagingRow(idx, 'item-pkg-list-' + itemIdx);
            this.scheduleAutosave();
        } catch (err) {
            console.error('[addItemPackaging] error:', err);
            App.toast('Ошибка добавления упаковки: ' + err.message);
        }
    },

    renderPackagingRow(idx, targetListId) {
        const pkg = this.packagingItems[idx];
        const minsDisplay = pkg.assembly_minutes || '';
        const isWarehouse = pkg.source === 'warehouse';
        const isChina = pkg.source === 'china';
        const isCustom = pkg.source === 'custom';
        const list = document.getElementById(targetListId || 'calc-packaging-list');

        let pickerHtml = '';
        if (this._whPickerData) {
            pickerHtml = Warehouse.buildImagePicker(`pkg-picker-${idx}`, this._whPickerData, pkg.warehouse_item_id, 'Calculator.onPkgWarehouseSelect', 'packaging');
        }

        const whItem = (isWarehouse && pkg.warehouse_item_id) ? this._findWhItem(pkg.warehouse_item_id) : null;
        const maxQty = whItem ? whItem.available_qty : '';
        const maxAttr = whItem ? ` max="${whItem.available_qty}"` : '';

        const deliveryOpts = Object.entries(ChinaCatalog.DELIVERY_METHODS || {}).map(([key, m]) => {
            const sel = (pkg.china_delivery_method || 'avia') === key ? ' selected' : '';
            return `<option value="${key}"${sel}>${m.label} ($${m.rate_usd}/\u043a\u0433)</option>`;
        }).join('');

        const chinaInfo = (isChina || isCustom) && pkg.price_cny > 0
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:4px 8px;background:var(--bg);border-radius:4px;">
                \ud83d\udcb0 ${pkg.price_cny}\u00a5 = <b>${formatRub(pkg.price)}</b>/\u0448\u0442 \u00b7 \ud83d\udce6 \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430: <b>${formatRub(pkg.delivery_price)}</b>/\u0448\u0442 (${pkg.weight_grams || 0}\u0433)
               </div>` : '';

        let modeHtml = '';
        if (isWarehouse) {
            modeHtml = `
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:2;">
                    <label>\u041f\u043e\u0437\u0438\u0446\u0438\u044f \u0441\u043e \u0441\u043a\u043b\u0430\u0434\u0430</label>
                    ${pickerHtml}
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u041a\u043e\u043b-\u0432\u043e${maxQty !== '' ? ` <span style="font-size:10px;color:var(--text-muted);">(\u043c\u0430\u043a\u0441: ${maxQty})</span>` : ''}</label>
                    <input type="number" min="0"${maxAttr} value="${pkg.qty || ''}" oninput="Calculator.onPkgNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>${this._assemblyTimingLabel()}</label>
                    <input type="number" min="0" step="1" value="${minsDisplay}" oninput="Calculator.onPkgMinutes(${idx}, this.value)" placeholder="\u043d\u0430\u043f\u0440. 9">
                </div>
            </div>`;
        } else if (isChina) {
            const chinaPickerHtml = this._buildChinaPickerHtml('pkg', idx, pkg);
            modeHtml = `
            <div class="form-group" style="margin:0 0 8px">
                <label>\u041f\u043e\u0437\u0438\u0446\u0438\u044f \u0438\u0437 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430 \u041a\u0438\u0442\u0430\u0439</label>
                ${chinaPickerHtml}
            </div>
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0">
                    <label>\u041a\u043e\u043b-\u0432\u043e</label>
                    <input type="number" min="0" value="${pkg.qty || ''}" oninput="Calculator.onPkgNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>${this._assemblyTimingLabel()}</label>
                    <input type="number" min="0" step="1" value="${minsDisplay}" oninput="Calculator.onPkgMinutes(${idx}, this.value)" placeholder="\u043d\u0430\u043f\u0440. 9">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</label>
                    <select onchange="Calculator.onChinaDeliveryMethod('pkg', ${idx}, this.value)">${deliveryOpts}</select>
                </div>
            </div>
            ${chinaInfo}`;
        } else {
            modeHtml = `
            <div class="form-row" style="align-items:end">
                <div class="form-group" style="margin:0;flex:1.5">
                    <label>\u041d\u0430\u0437\u0432\u0430\u043d\u0438\u0435</label>
                    <input type="text" value="${this._esc(pkg.name || '')}" placeholder="\u041c\u0435\u0448\u043e\u0447\u0435\u043a, \u043f\u0430\u043a\u0435\u0442\u0438\u043a, \u043a\u043e\u0440\u043e\u0431\u043a\u0430..." onchange="Calculator.onPkgField(${idx}, 'name', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u041a\u043e\u043b-\u0432\u043e</label>
                    <input type="number" min="0" value="${pkg.qty || ''}" oninput="Calculator.onPkgNum(${idx}, 'qty', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>${this._assemblyTimingLabel()}</label>
                    <input type="number" min="0" step="1" value="${minsDisplay}" oninput="Calculator.onPkgMinutes(${idx}, this.value)" placeholder="\u043d\u0430\u043f\u0440. 9">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0426\u0435\u043d\u0430 (\u00a5/\u0448\u0442)</label>
                    <input type="number" min="0" step="0.01" value="${pkg.price_cny || ''}" oninput="Calculator.onChinaNum('pkg', ${idx}, 'price_cny', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0412\u0435\u0441 (\u0433)</label>
                    <input type="number" min="0" step="0.1" value="${pkg.weight_grams || ''}" oninput="Calculator.onChinaNum('pkg', ${idx}, 'weight_grams', this.value)">
                </div>
                <div class="form-group" style="margin:0">
                    <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</label>
                    <select onchange="Calculator.onChinaDeliveryMethod('pkg', ${idx}, this.value)">${deliveryOpts}</select>
                </div>
            </div>
            ${chinaInfo}`;
        }

        const html = `
        <div class="pkg-row" id="pkg-row-${idx}" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:#ffffff;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <div class="pkg-source-toggle">
                    <label class="${isWarehouse ? 'src-active' : ''}">
                        <input type="radio" name="pkg-src-${idx}" value="warehouse" ${isWarehouse ? 'checked' : ''} onchange="Calculator.onPkgSourceChange(${idx}, 'warehouse')" style="display:none;">
                        &#128230; \u0421\u043e \u0441\u043a\u043b\u0430\u0434\u0430
                    </label>
                    <label class="${isChina ? 'src-active' : ''}">
                        <input type="radio" name="pkg-src-${idx}" value="china" ${isChina ? 'checked' : ''} onchange="Calculator.onPkgSourceChange(${idx}, 'china')" style="display:none;">
                        \ud83c\udde8\ud83c\uddf3 \u0418\u0437 \u043a\u0430\u0442\u0430\u043b\u043e\u0433\u0430
                    </label>
                    <label class="${isCustom ? 'src-active' : ''}">
                        <input type="radio" name="pkg-src-${idx}" value="custom" ${isCustom ? 'checked' : ''} onchange="Calculator.onPkgSourceChange(${idx}, 'custom')" style="display:none;">
                        &#9998; \u041a\u0430\u0441\u0442\u043e\u043c\u043d\u0430\u044f
                    </label>
                </div>
                <button class="btn-remove" title="\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0443" onclick="Calculator.removePackaging(${idx})">&#10005;</button>
            </div>
            ${modeHtml}
            <div class="cost-breakdown" id="pkg-cost-${idx}" style="display:none">
                <div class="section-title" style="margin-top:0">\u0421\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c \u0443\u043f\u0430\u043a\u043e\u0432\u043a\u0438 (\u0437\u0430 1 \u0448\u0442)</div>
                <div class="cost-row"><span class="cost-label">\u0424\u041e\u0422 \u0441\u0431\u043e\u0440\u043a\u0430</span><span class="cost-value" id="pkg-${idx}-fot">0</span></div>
                <div class="cost-row" style="display:none"><span class="cost-label">\u041a\u043e\u0441\u0432\u0435\u043d\u043d\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b</span><span class="cost-value" id="pkg-${idx}-indirect">0</span></div>
                <div class="cost-row"><span class="cost-label">\u0417\u0430\u043a\u0443\u043f\u043a\u0430</span><span class="cost-value" id="pkg-${idx}-purchase">0</span></div>
                <div class="cost-row"><span class="cost-label">\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 (\u043d\u0430 \u0448\u0442)</span><span class="cost-value" id="pkg-${idx}-delivery">0</span></div>
                <div class="cost-row cost-total"><span class="cost-label">\u0418\u0422\u041e\u0413\u041e \u0441\u0435\u0431\u0435\u0441\u0442\u043e\u0438\u043c\u043e\u0441\u0442\u044c</span><span class="cost-value" id="pkg-${idx}-total">0</span></div>
            </div>
        </div>`;
        list.insertAdjacentHTML('beforeend', html);
    },

    removePackaging(idx) {
        this.packagingItems.splice(idx, 1);
        this.rerenderAllPackaging();
        this.items.forEach((_, i) => this._renderPerItemHwPkg(i));
        this.recalculate();
        this.scheduleAutosave();
    },

    rerenderAllPackaging() {
        const list = document.getElementById('calc-packaging-list');
        if (list) {
            list.innerHTML = '';
            this.packagingItems.forEach((pkg, i) => {
                if (pkg.parent_item_index === null || pkg.parent_item_index === undefined) {
                    this.renderPackagingRow(i);
                }
            });
        }
    },

    _rerenderPkgItem(idx) {
        const pkg = this.packagingItems[idx];
        const oldRow = document.getElementById('pkg-row-' + idx);
        if (oldRow) oldRow.remove();
        if (pkg.parent_item_index !== null && pkg.parent_item_index !== undefined) {
            this.renderPackagingRow(idx, 'item-pkg-list-' + pkg.parent_item_index);
        } else {
            this.renderPackagingRow(idx);
        }
    },

    onPkgSourceChange(idx, source) {
        const pkg = this.packagingItems[idx];
        pkg.source = source;
        if (source === 'china') {
            pkg.warehouse_item_id = null;
            pkg.warehouse_sku = '';
            if (!pkg.china_delivery_method) pkg.china_delivery_method = 'avia';
            this._recalcChinaPricing(pkg);
        } else if (source === 'custom') {
            pkg.warehouse_item_id = null;
            pkg.warehouse_sku = '';
            pkg.china_item_id = null;
            if (!pkg.china_delivery_method) pkg.china_delivery_method = 'avia';
            this._recalcChinaPricing(pkg);
        } else {
            pkg.name = '';
            pkg.price = 0;
            pkg.price_cny = 0;
            pkg.weight_grams = 0;
            pkg.delivery_total = 0;
            pkg.delivery_price = 0;
            pkg.warehouse_item_id = null;
            pkg.warehouse_sku = '';
            pkg.china_item_id = null;
        }
        this.rerenderAllPackaging();
        this.items.forEach((_, i) => this._renderPerItemHwPkg(i));
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
            this._rerenderPkgItem(idx);
            this.recalculate();
            return;
        }
        const whItem = this._findWhItem(itemId);
        if (!whItem) return;
        if ((whItem.available_qty || 0) <= 0) {
            App.toast(`На складе нет "${whItem.name}". Закажите из Китая.`);
        }
        pkg.warehouse_item_id = whItem.id;
        pkg.warehouse_sku = whItem.sku || '';
        const parts = [whItem.name];
        if (whItem.size) parts.push(whItem.size);
        if (whItem.color) parts.push(whItem.color);
        pkg.name = parts.join(' · ');
        pkg.price = whItem.price_per_unit || 0;
        pkg.delivery_total = 0;
        pkg.delivery_price = 0;
        this._rerenderPkgItem(idx);
        this.recalculate();
    },

    onPkgField(idx, field, value) {
        this.packagingItems[idx][field] = value;
        this.scheduleAutosave();
    },

    onPkgNum(idx, field, value) {
        this.packagingItems[idx][field] = parseFloat(value) || 0;
        const pkg = this.packagingItems[idx];
        if (field === 'qty' && pkg.source === 'warehouse' && pkg.warehouse_item_id) {
            const whItem = this._findWhItem(pkg.warehouse_item_id);
            if (whItem && pkg.qty > whItem.available_qty) {
                pkg.qty = whItem.available_qty;
                App.toast(`Максимум на складе: ${whItem.available_qty} ${whItem.unit}. Остальное — из Китая.`);
            }
        }
        if (pkg.source === 'china' || pkg.source === 'custom') {
            this._recalcChinaPricing(pkg);
        } else {
            pkg.delivery_price = pkg.qty > 0 ? round2(pkg.delivery_total / pkg.qty) : 0;
        }
        this.recalculate();
        this.scheduleAutosave();
    },

    onPkgMinutes(idx, value) {
        const pcsPerMin = parseFloat(value) || 0;
        this.packagingItems[idx].assembly_minutes = pcsPerMin;
        // Convert шт/мин → шт/час for calculator
        this.packagingItems[idx].assembly_speed = round2(pcsPerMin * 60);
        this.recalculate();
        this.scheduleAutosave();
    },

    // ==========================================
    // EXTRA COSTS (Доп. расходы)
    // ==========================================

    addExtraCost() {
        this.extraCosts.push({ name: '', amount: 0 });
        this.renderExtraCosts();
        this.scheduleAutosave();
    },

    removeExtraCost(idx) {
        this.extraCosts.splice(idx, 1);
        this.renderExtraCosts();
        this.recalculate();
        this.scheduleAutosave();
    },

    onExtraCostChange(idx, field, value) {
        if (field === 'name') {
            this.extraCosts[idx].name = value;
        } else {
            this.extraCosts[idx][field] = parseFloat(value) || 0;
            this.recalculate();
        }
        this.scheduleAutosave();
    },

    renderExtraCosts() {
        const list = document.getElementById('extra-costs-list');
        if (!list) return;
        list.innerHTML = this.extraCosts.map((ec, i) => `
            <div class="form-row" style="align-items:end;margin-bottom:8px;">
                <div class="form-group" style="margin:0;flex:2">
                    <label>Название</label>
                    <input type="text" value="${this._esc(ec.name)}" placeholder="Доп. расход"
                        oninput="Calculator.onExtraCostChange(${i}, 'name', this.value)">
                </div>
                <div class="form-group" style="margin:0;flex:1">
                    <label>Сумма (₽)</label>
                    <input type="number" min="0" step="1" value="${ec.amount || ''}" placeholder="0"
                        oninput="Calculator.onExtraCostChange(${i}, 'amount', this.value)">
                </div>
                <button class="btn-remove" title="Удалить" onclick="Calculator.removeExtraCost(${i})">&#10005;</button>
            </div>
        `).join('');
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

        // Clear builtin_hw fields — now handled by real per-item hardware
        this.items[idx].builtin_hw_name = '';
        this.items[idx].builtin_hw_price = 0;
        this.items[idx].builtin_hw_delivery_total = 0;
        this.items[idx].builtin_hw_speed = 0;

        // Auto-create per-item hardware from template
        this._syncTemplateHardware(idx, tpl);

        document.getElementById('item-name-' + idx).value = tpl.name;
        document.getElementById('item-pph-' + idx).value = pphAvg;
        document.getElementById('item-weight-' + idx).value = tpl.weight_grams || '';
        document.getElementById('item-title-' + idx).textContent = tpl.name;

        // Close picker & re-render selected display
        this.closeMoldPicker(idx);
        this.rerenderItem(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    /**
     * Auto-create/update hardware from blank template
     * Removes old template hw for this item, creates new if template has hw
     */
    _syncTemplateHardware(itemIdx, tpl) {
        // Remove existing template-created hw for this item
        this.hardwareItems = this.hardwareItems.filter(hw =>
            !(hw._from_template && hw.parent_item_index === itemIdx)
        );

        // Create new hw from template if it has hardware
        if (tpl && tpl.hw_name) {
            const hw = this.getEmptyHardware(itemIdx);
            hw._from_template = true;
            hw.source = 'custom';
            hw.name = tpl.hw_name;
            hw.price = tpl.hw_price_per_unit || 0;
            hw.delivery_total = tpl.hw_delivery_total || 0;
            hw.qty = this.items[itemIdx].quantity || 0;
            hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : 0;
            hw.assembly_speed = tpl.hw_speed || 0;
            hw.assembly_minutes = hw.assembly_speed > 0 ? round2(hw.assembly_speed / 60) : 0;
            this.hardwareItems.push(hw);
        }

        // Re-render per-item hw
        this._renderPerItemHwPkg(itemIdx);
        // Re-render order-level hw (indices may have shifted)
        this.rerenderAllHardware();
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
        const allColors = Colors.data || [];
        const color = allColors.find(c => c.id === colorId);
        if (!color) return;
        if (!this.items[idx].colors) this.items[idx].colors = [];

        // Toggle: if already selected, remove it; otherwise add it
        const existing = this.items[idx].colors.findIndex(c => c.id === colorId);
        if (existing >= 0) {
            this.items[idx].colors.splice(existing, 1);
        } else {
            this.items[idx].colors.push({ id: color.id, name: color.name });
        }
        // Sync backward-compat fields (first color)
        this._syncColorCompat(idx);
        this.renderItemBlock(idx);
        this.scheduleAutosave();
    },

    removeColor(idx, colorId) {
        if (!this.items[idx].colors) return;
        this.items[idx].colors = this.items[idx].colors.filter(c => c.id !== colorId);
        this._syncColorCompat(idx);
        this.renderItemBlock(idx);
        this.scheduleAutosave();
    },

    clearColors(idx) {
        this.items[idx].colors = [];
        this._syncColorCompat(idx);
        document.querySelectorAll('.color-picker-dropdown').forEach(d => d.style.display = 'none');
        this.renderItemBlock(idx);
        this.scheduleAutosave();
    },

    _syncColorCompat(idx) {
        // Keep color_id/color_name in sync with first color for backward compat
        const item = this.items[idx];
        if (item.colors && item.colors.length > 0) {
            item.color_id = item.colors[0].id;
            item.color_name = item.colors[0].name;
        } else {
            item.color_id = null;
            item.color_name = '';
        }
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
            // Remove template-created per-item hardware
            this._syncTemplateHardware(idx, null);
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
        this.scheduleAutosave();
    },

    onNumChange(idx, field, value) {
        this.items[idx][field] = parseFloat(value) || 0;
        // Sync quantity to template-created hardware
        if (field === 'quantity') {
            const newQty = parseFloat(value) || 0;
            this.hardwareItems.forEach(hw => {
                if (hw._from_template && hw.parent_item_index === idx) {
                    hw.qty = newQty;
                    hw.delivery_price = newQty > 0 ? round2(hw.delivery_total / newQty) : 0;
                }
            });
        }
        this.recalculate();
        this.scheduleAutosave();
    },

    onToggle(idx, field, checked) {
        this.items[idx][field] = checked;
        this.recalculate();
        this.scheduleAutosave();
    },

    removeItem(idx) {
        // Cascade: remove all per-item hw/pkg for this item
        this.hardwareItems = this.hardwareItems.filter(hw => hw.parent_item_index !== idx);
        this.packagingItems = this.packagingItems.filter(pkg => pkg.parent_item_index !== idx);
        // Reindex parent_item_index for items after the removed one
        this.hardwareItems.forEach(hw => {
            if (hw.parent_item_index !== null && hw.parent_item_index > idx) {
                hw.parent_item_index--;
            }
        });
        this.packagingItems.forEach(pkg => {
            if (pkg.parent_item_index !== null && pkg.parent_item_index > idx) {
                pkg.parent_item_index--;
            }
        });

        this.items.splice(idx, 1);
        this.items.forEach((item, i) => item.item_number = i + 1);
        const container = document.getElementById('calc-items-container');
        container.innerHTML = '';
        this.items.forEach((_, i) => this.renderItemBlock(i));
        document.getElementById('calc-add-item-btn').style.display = '';
        // Re-render order-level hw/pkg (indices may have shifted)
        this.rerenderAllHardware();
        this.rerenderAllPackaging();
        this.recalculate();
        this.scheduleAutosave();
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

        // === Pre-calculate hw/pkg results (needed for per-item cost aggregation) ===
        this.hardwareItems.forEach(hw => {
            hw.result = calculateHardwareCost(hw, params);
        });
        this.packagingItems.forEach(pkg => {
            pkg.result = calculatePackagingCost(pkg, params);
        });

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
                this.setText('c-' + idx + '-cutting-ind', formatRub(result.costCuttingIndirect));
                this.setText('c-' + idx + '-nfc-tag', formatRub(result.costNfcTag));
                this.setText('c-' + idx + '-nfc-prog', formatRub(result.costNfcProgramming));
                this.setText('c-' + idx + '-nfc-ind', formatRub(result.costNfcIndirect));
                this.setText('c-' + idx + '-builtin-hw', formatRub(result.costBuiltinHw || 0));
                this.setText('c-' + idx + '-builtin-hw-ind', formatRub(result.costBuiltinHwIndirect || 0));
                // Hide builtin hw rows when 0 (new orders use per-item hw instead)
                const builtinHwEl = document.getElementById('c-' + idx + '-builtin-hw');
                if (builtinHwEl) builtinHwEl.parentElement.style.display = (result.costBuiltinHw || 0) > 0 ? '' : 'none';
                const hwIndEl = document.getElementById('c-' + idx + '-builtin-hw-ind');
                if (hwIndEl) hwIndEl.parentElement.style.display = (result.costBuiltinHwIndirect || 0) > 0 ? '' : 'none';
                this.setText('c-' + idx + '-printing', formatRub(result.costPrinting));
                this.setText('c-' + idx + '-delivery', formatRub(result.costDelivery));

                // Subtotal = item cost without per-item hw/pkg
                this.setText('c-' + idx + '-subtotal', formatRub(result.costTotal));

                // Calculate per-item hw/pkg costs
                let perItemHwCost = 0;
                let perItemPkgCost = 0;
                const hwRowsEl = document.getElementById('c-' + idx + '-peritem-hw-rows');
                const pkgRowsEl = document.getElementById('c-' + idx + '-peritem-pkg-rows');

                if (hwRowsEl) {
                    let hwHtml = '';
                    this.hardwareItems.forEach(hw => {
                        if (hw.parent_item_index === idx && hw.result && hw.result.costPerUnit > 0) {
                            perItemHwCost += hw.result.costPerUnit;
                            hwHtml += `<div class="cost-row"><span class="cost-label">🔩 ${this._esc(hw.name || 'Фурнитура')}</span><span class="cost-value">${formatRub(hw.result.costPerUnit)}</span></div>`;
                        }
                    });
                    hwRowsEl.innerHTML = hwHtml;
                }
                if (pkgRowsEl) {
                    let pkgHtml = '';
                    this.packagingItems.forEach(pkg => {
                        if (pkg.parent_item_index === idx && pkg.result && pkg.result.costPerUnit > 0) {
                            perItemPkgCost += pkg.result.costPerUnit;
                            pkgHtml += `<div class="cost-row"><span class="cost-label">📦 ${this._esc(pkg.name || 'Упаковка')}</span><span class="cost-value">${formatRub(pkg.result.costPerUnit)}</span></div>`;
                        }
                    });
                    pkgRowsEl.innerHTML = pkgHtml;
                }

                // Total including per-item hw/pkg
                const totalWithHwPkg = round2(result.costTotal + perItemHwCost + perItemPkgCost);
                item.totalCostWithHwPkg = totalWithHwPkg;
                this.setText('c-' + idx + '-total', formatRub(totalWithHwPkg));

                // Show/hide subtotal row (only if there are per-item hw/pkg)
                const subtotalEl = document.getElementById('c-' + idx + '-subtotal');
                if (subtotalEl) {
                    subtotalEl.parentElement.style.display = (perItemHwCost + perItemPkgCost > 0) ? '' : 'none';
                }

                // Store target at 40% for reference (including per-item hw/pkg)
                const costItemOnly = round2(totalWithHwPkg - (result.costPrinting || 0));
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
                this.setText('hw-' + idx + '-indirect', formatRub(result.indirectPerUnit || 0));
                const hwIndEl = document.getElementById('hw-' + idx + '-indirect');
                if (hwIndEl) hwIndEl.parentElement.style.display = (result.indirectPerUnit || 0) > 0 ? '' : 'none';
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
                this.setText('pkg-' + idx + '-indirect', formatRub(result.indirectPerUnit || 0));
                const pkgIndEl = document.getElementById('pkg-' + idx + '-indirect');
                if (pkgIndEl) pkgIndEl.parentElement.style.display = (result.indirectPerUnit || 0) > 0 ? '' : 'none';
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
            const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems, this.extraCosts);
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
        // Only order-level hw/pkg appear as separate pricing columns
        const pricedHw = this.hardwareItems.filter(hw => hw.parent_item_index === null && hw.result && isFinite(hw.result.costPerUnit) && hw.result.costPerUnit > 0);
        const pricedPkg = this.packagingItems.filter(pkg => pkg.parent_item_index === null && pkg.result && isFinite(pkg.result.costPerUnit) && pkg.result.costPerUnit > 0);

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
            // Use totalCostWithHwPkg which includes per-item hardware/packaging
            const costWithPrinting = item.totalCostWithHwPkg || item.result.costTotal;
            const costPrintingPart = item.result.costPrinting || 0;
            const costItemOnly = round2(costWithPrinting - costPrintingPart);

            if (item.is_blank_mold) {
                // Blank mold: show recommended price from blanks table
                const tpl = App.templates.find(t => t.id == item.template_id);
                // Check custom_prices first, then custom_margins, then standard formula
                const customPrice = tpl?.custom_prices?.[item.quantity];
                let blankSellPrice;
                if (customPrice > 0) {
                    blankSellPrice = customPrice;
                } else {
                    const customMargin = tpl?.custom_margins?.[item.quantity];
                    const blankMargin = (customMargin !== null && customMargin !== undefined) ? customMargin : getBlankMargin(item.quantity || 500);
                    blankSellPrice = roundTo5(round2(costItemOnly / (1 - blankMargin) / (1 - 0.06 - 0.05)));
                }
                // Do NOT auto-fill sell_price_item — manager enters manually
                columns.push({
                    label: item.product_name || 'Изделие ' + (i + 1),
                    type: 'item',
                    globalIdx,
                    isBlank: true,
                    cost: costItemOnly,
                    blankPrice: blankSellPrice,
                    sellPrice: item.sell_price_item || 0,
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
            // Show recommended price as placeholder for blanks
            const placeholder = col.isBlank && col.blankPrice ? col.blankPrice : '';
            html += `<div style="padding:4px;text-align:center;${cellBorder}background:var(--green-light);">
                <input type="text" inputmode="decimal" id="${inputId}" value="${col.sellPrice || ''}"
                    placeholder="${placeholder}"
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
            // Use only manually entered sell price (no auto-fill)
            let itemPrice = item.sell_price_item;
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

        // Only order-level hw/pkg as separate invoice lines (per-item included in item price)
        this.hardwareItems.forEach((hw, i) => {
            if (hw.parent_item_index !== null) return;  // per-item — included in item price
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
            if (pkg.parent_item_index !== null) return;  // per-item — included in item price
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

        // Extra costs
        (this.extraCosts || []).forEach(ec => {
            if (ec.amount > 0) {
                invoiceRows.push({
                    name: ec.name || 'Доп. расход',
                    qty: 1,
                    price: ec.amount,
                    total: ec.amount,
                    type: 'extra',
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
                const icon = r.type === 'item' ? '&#9670;' : r.type === 'printing' ? '&#9998;' : r.type === 'hw' ? '&#9881;' : r.type === 'extra' ? '&#10010;' : '&#9744;';
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
        this.scheduleAutosave();
    },

    // ==========================================
    // SAVE / LOAD ORDER
    // ==========================================

    // ==========================================
    // AUTOSAVE (draft)
    // ==========================================

    scheduleAutosave() {
        this._isDirty = true;
        clearTimeout(this._autosaveTimer);
        this._autosaveTimer = setTimeout(() => this._doAutosave(), 1500);
    },

    async _doAutosave() {
        if (this._autosaving) return;
        // Don't autosave if no items or all items are empty
        const hasAnyData = this.items.some(i => i.product_name || i.quantity > 0 || i.template_id);
        if (!hasAnyData) return;

        this._autosaving = true;
        try {
            const orderName = document.getElementById('calc-order-name').value.trim();
            const now = new Date();
            const autoName = orderName || ('Черновик ' + String(now.getDate()).padStart(2,'0') + '.' + String(now.getMonth()+1).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'));

            // Recalculate before saving
            try { this._doRecalculate(App.params); } catch (e) { /* ignore */ }

            const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, App.params);
            const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems, this.extraCosts);

            const order = {
                id: App.editingOrderId || undefined,
                order_name: autoName,
                client_name: document.getElementById('calc-client-name').value.trim(),
                manager_name: document.getElementById('calc-manager-name').value.trim(),
                deadline: document.getElementById('calc-deadline-start').value || null,
                deadline_start: document.getElementById('calc-deadline-start').value || null,
                deadline_end: document.getElementById('calc-deadline-end').value || null,
                notes: document.getElementById('calc-notes').value.trim(),
                delivery_address: document.getElementById('calc-delivery-address').value.trim(),
                telegram: document.getElementById('calc-telegram').value.trim(),
                crm_link: document.getElementById('calc-crm-link').value.trim(),
                fintablo_link: document.getElementById('calc-fintablo-link').value.trim(),
                client_legal_name: document.getElementById('calc-client-legal-name').value.trim(),
                client_inn: document.getElementById('calc-client-inn').value.trim(),
                client_legal_address: document.getElementById('calc-client-legal-address').value.trim(),
                client_bank_name: document.getElementById('calc-client-bank-name').value.trim(),
                client_bank_account: document.getElementById('calc-client-bank-account').value.trim(),
                client_bank_bik: document.getElementById('calc-client-bank-bik').value.trim(),
                plastic_type: 'PP',
                print_type: null,
                status: 'draft', // autosave always writes 'draft' for new; existing orders get their status preserved below
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

            // If editing existing order, preserve its current status (don't overwrite 'calculated'/'in_production' etc.)
            if (App.editingOrderId) {
                // Read current status from stored orders to preserve it
                order.status = this._currentOrderStatus || 'draft';
            }

            // Collect items (same logic as saveOrder but without qty filter for drafts)
            const items = this._collectItemsForSave();

            const orderId = await saveOrder(order, items);
            if (orderId) {
                App.editingOrderId = orderId;
                // Persist editing ID so it survives page refresh
                localStorage.setItem('ro_calc_editing_order_id', String(orderId));
                this._isDirty = false;
                // Update autosave indicator
                const timeStr = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
                const statusEl = document.getElementById('calc-autosave-status');
                if (statusEl) statusEl.textContent = 'Черновик сохранён • ' + timeStr;
            }
        } catch (e) {
            console.error('[autosave] error:', e);
        }
        this._autosaving = false;
    },

    _collectItemsForSave() {
        const items = [];

        // Product items
        this.items.forEach(item => {
            const r = item.result || getEmptyCostResult();
            items.push({
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
                colors: JSON.stringify(item.colors || []),
            });
        });

        // Hardware items
        this.hardwareItems.filter(hw => hw.qty > 0 || hw._from_template).forEach((hw, i) => {
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
                hardware_source: hw.source || 'custom',
                hardware_warehouse_item_id: hw.warehouse_item_id || null,
                hardware_warehouse_sku: hw.warehouse_sku || '',
                hardware_parent_item_index: hw.parent_item_index ?? null,
                hardware_from_template: hw._from_template || false,
            });
        });

        // Packaging items
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
                packaging_source: pkg.source || 'custom',
                packaging_warehouse_item_id: pkg.warehouse_item_id || null,
                packaging_warehouse_sku: pkg.warehouse_sku || '',
                packaging_parent_item_index: pkg.parent_item_index ?? null,
            });
        });

        // Extra costs
        (this.extraCosts || []).filter(ec => ec.amount > 0 || ec.name).forEach((ec, i) => {
            items.push({
                item_number: 300 + i,
                item_type: 'extra_cost',
                product_name: ec.name || 'Доп. расход',
                quantity: 1,
                cost_total: ec.amount || 0,
                sell_price_item: ec.amount || 0,
            });
        });

        return items;
    },

    async saveOrder() {
        // Cancel any pending autosave — we're doing a full save
        clearTimeout(this._autosaveTimer);

        // Recalculate before saving to ensure fresh results
        try { this._doRecalculate(App.params); } catch (e) { /* ignore */ }

        let orderName = document.getElementById('calc-order-name').value.trim();
        if (!orderName) {
            // Auto-generate name if empty
            const now = new Date();
            orderName = 'Заказ ' + String(now.getDate()).padStart(2,'0') + '.' + String(now.getMonth()+1).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
            document.getElementById('calc-order-name').value = orderName;
        }

        const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, App.params);
        const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems, this.extraCosts);

        const order = {
            id: App.editingOrderId || undefined,
            order_name: orderName,
            client_name: document.getElementById('calc-client-name').value.trim(),
            manager_name: '',
            deadline: document.getElementById('calc-deadline-start').value || null,
            deadline_start: document.getElementById('calc-deadline-start').value || null,
            deadline_end: document.getElementById('calc-deadline-end').value || null,
            notes: document.getElementById('calc-notes').value.trim(),
            delivery_address: document.getElementById('calc-delivery-address').value.trim(),
            telegram: document.getElementById('calc-telegram').value.trim(),
            crm_link: document.getElementById('calc-crm-link').value.trim(),
            fintablo_link: document.getElementById('calc-fintablo-link').value.trim(),
            client_legal_name: document.getElementById('calc-client-legal-name').value.trim(),
            client_inn: document.getElementById('calc-client-inn').value.trim(),
            client_legal_address: document.getElementById('calc-client-legal-address').value.trim(),
            client_bank_name: document.getElementById('calc-client-bank-name').value.trim(),
            client_bank_account: document.getElementById('calc-client-bank-account').value.trim(),
            client_bank_bik: document.getElementById('calc-client-bank-bik').value.trim(),
            plastic_type: 'PP', // always PP
            print_type: null, // determined at printing level
            status: 'draft',
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

        const items = this._collectItemsForSave();

        const isEdit = !!App.editingOrderId;
        const assignedManagerName = document.getElementById('calc-manager-name').value.trim() || App.getCurrentEmployeeName();
        if (assignedManagerName && assignedManagerName !== 'Неизвестный') {
            document.getElementById('calc-manager-name').value = assignedManagerName;
        }
        order.manager_name = assignedManagerName;
        const actorName = App.getCurrentEmployeeName();

        // === Detailed change tracking ===
        let oldData = null;
        if (isEdit) {
            oldData = await loadOrder(App.editingOrderId);
        }

        // Preserve workflow status for existing orders (sample/production/etc.)
        if (isEdit) {
            order.status = (oldData && oldData.order && oldData.order.status)
                || this._currentOrderStatus
                || 'draft';
        }

        const orderId = await saveOrder(order, items);
        if (orderId) {
            App.editingOrderId = orderId;
            localStorage.setItem('ro_calc_editing_order_id', String(orderId));

            if (isEdit && oldData) {
                // Diff order header fields
                const headerChanges = this._diffOrderHeader(oldData.order, order);
                for (const ch of headerChanges) {
                    await Orders.addChangeRecord(orderId, {
                        field: 'field_change',
                        old_value: ch.label + ': ' + (ch.old_value || '(пусто)'),
                        new_value: ch.label + ': ' + (ch.new_value || '(пусто)'),
                        manager: actorName,
                    });
                }

                // Diff items (products, hardware, packaging)
                const itemChanges = this._diffOrderItems(oldData.items, items);
                for (const ch of itemChanges) {
                    await Orders.addChangeRecord(orderId, {
                        field: ch.type,
                        old_value: ch.old_value || '',
                        new_value: ch.new_value || '',
                        manager: actorName,
                        description: ch.description || '',
                    });
                }

                // If no field-level changes detected, record a generic edit
                if (headerChanges.length === 0 && itemChanges.length === 0) {
                    await Orders.addChangeRecord(orderId, {
                        field: 'order_edit',
                        old_value: '',
                        new_value: 'Заказ пересохранён',
                        manager: actorName,
                        description: `Выручка: ${formatRub(summary.totalRevenue)}, Маржа: ${formatPercent(summary.marginPercent)}`,
                    });
                }
            } else {
                // New order
                await Orders.addChangeRecord(orderId, {
                    field: 'order_create',
                    old_value: '',
                    new_value: 'Заказ создан',
                    manager: actorName,
                    description: `Выручка: ${formatRub(summary.totalRevenue)}, Маржа: ${formatPercent(summary.marginPercent)}`,
                });
            }

            // === Warehouse sync ===
            // sample -> reserve only
            // production/delivery/completed -> release reserve + deduct stock
            // draft/cancelled/etc -> release reserve only
            const consumeStatuses = new Set([
                'production_casting',
                'production_hardware',
                'production_packaging',
                'in_production',
                'delivery',
                'completed',
            ]);
            if (order.status === 'sample') {
                await this._syncWarehouseReservationsOnSave(orderId, order.order_name, actorName, true);
            } else if (consumeStatuses.has(order.status)) {
                await this._syncWarehouseReservationsOnSave(orderId, order.order_name, actorName, false);
                await this._deductWarehouseOnSave(isEdit, order.order_name, actorName);
            } else {
                await this._syncWarehouseReservationsOnSave(orderId, order.order_name, actorName, false);
            }

            App.toast('Заказ сохранен');
        } else {
            App.toast('Ошибка сохранения');
        }
    },

    _collectWarehouseReservationDemand() {
        const demand = new Map();
        const addQty = (itemId, qty) => {
            if (!itemId || qty <= 0) return;
            demand.set(itemId, (demand.get(itemId) || 0) + qty);
        };

        (this.hardwareItems || []).forEach(hw => {
            if (hw.source === 'warehouse' && hw.warehouse_item_id) {
                addQty(hw.warehouse_item_id, parseFloat(hw.qty) || 0);
            }
        });
        (this.packagingItems || []).forEach(pkg => {
            if (pkg.source === 'warehouse' && pkg.warehouse_item_id) {
                addQty(pkg.warehouse_item_id, parseFloat(pkg.qty) || 0);
            }
        });

        return demand;
    },

    async _syncWarehouseReservationsOnSave(orderId, orderName, managerName, shouldReserve) {
        const reservations = await loadWarehouseReservations();
        const nowIso = new Date().toISOString();

        // Release existing auto reservations for this order
        reservations.forEach(r => {
            if (r.status === 'active' && r.source === 'order_calc' && r.order_id === orderId) {
                r.status = 'released';
                r.released_at = nowIso;
            }
        });

        if (shouldReserve) {
            const demand = this._collectWarehouseReservationDemand();
            if (demand.size > 0) {
                const items = await loadWarehouseItems();
                const activeByItem = new Map();
                reservations.forEach(r => {
                    if (r.status !== 'active') return;
                    activeByItem.set(r.item_id, (activeByItem.get(r.item_id) || 0) + (parseFloat(r.qty) || 0));
                });

                let hasShortage = false;
                demand.forEach((requestedQty, itemId) => {
                    const whItem = items.find(i => i.id === itemId);
                    if (!whItem) return;
                    const stockQty = parseFloat(whItem.qty) || 0;
                    const alreadyReserved = activeByItem.get(itemId) || 0;
                    const available = Math.max(0, stockQty - alreadyReserved);
                    const reserveQty = Math.min(requestedQty, available);

                    if (reserveQty > 0) {
                        reservations.push({
                            id: Date.now() + Math.floor(Math.random() * 1000),
                            item_id: itemId,
                            order_id: orderId,
                            order_name: orderName || 'Заказ',
                            qty: reserveQty,
                            status: 'active',
                            source: 'order_calc',
                            created_at: nowIso,
                            created_by: managerName || '',
                        });
                        activeByItem.set(itemId, alreadyReserved + reserveQty);
                    }

                    if (reserveQty < requestedQty) {
                        hasShortage = true;
                    }
                });

                if (hasShortage) {
                    App.toast('Часть позиций не встала в полный резерв: недостаточно остатка');
                } else {
                    App.toast('Резервы для заказа образца обновлены');
                }
            }
        }

        await saveWarehouseReservations(reservations);
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
        this._currentOrderStatus = data.order.status || 'draft'; // Preserve order status for autosave
        localStorage.setItem('ro_calc_editing_order_id', String(orderId));

        const { order, items: dbItems } = data;
        document.getElementById('calc-order-name').value = order.order_name || '';
        document.getElementById('calc-client-name').value = order.client_name || '';
        document.getElementById('calc-manager-name').value = order.manager_name || App.getCurrentEmployeeName() || '';
        document.getElementById('calc-deadline-start').value = order.deadline_start || order.deadline || '';
        document.getElementById('calc-deadline-end').value = order.deadline_end || '';
        document.getElementById('calc-notes').value = order.notes || '';
        document.getElementById('calc-delivery-address').value = order.delivery_address || '';
        document.getElementById('calc-telegram').value = order.telegram || '';
        document.getElementById('calc-crm-link').value = order.crm_link || '';
        document.getElementById('calc-fintablo-link').value = order.fintablo_link || '';
        document.getElementById('calc-client-legal-name').value = order.client_legal_name || '';
        document.getElementById('calc-client-inn').value = order.client_inn || '';
        document.getElementById('calc-client-legal-address').value = order.client_legal_address || '';
        document.getElementById('calc-client-bank-name').value = order.client_bank_name || '';
        document.getElementById('calc-client-bank-account').value = order.client_bank_account || '';
        document.getElementById('calc-client-bank-bik').value = order.client_bank_bik || '';

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
            // Parse colors from JSON
            if (typeof item.colors === 'string') {
                try { item.colors = JSON.parse(item.colors); } catch (e) { item.colors = []; }
            }
            if (!Array.isArray(item.colors)) item.colors = [];
            // Migrate old single color_id to colors array
            if (item.colors.length === 0 && item.color_id) {
                const allC = Colors.data || [];
                const oldC = allC.find(c => c.id == item.color_id);
                if (oldC) item.colors = [{ id: oldC.id, name: oldC.name }];
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
            // Convert шт/ч → шт/мин for display
            hw.assembly_minutes = hw.assembly_speed > 0 ? round2(hw.assembly_speed / 60) : 0;
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
            hw.parent_item_index = dbHw.hardware_parent_item_index ?? null;
            hw._from_template = dbHw.hardware_from_template || false;
            // Save originals for diff on next save
            hw._original_qty = hw.qty;
            hw._original_warehouse_item_id = hw.warehouse_item_id;
            this.hardwareItems.push(hw);
            const hwIdx = this.hardwareItems.length - 1;
            if (hw.parent_item_index === null || hw.parent_item_index === undefined) {
                this.renderHardwareRow(hwIdx);
            }
            // per-item hw will be rendered when the item block is created
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
            pkg.parent_item_index = dbPkg.packaging_parent_item_index ?? null;
            pkg.name = dbPkg.product_name || '';
            pkg.qty = dbPkg.quantity || 0;
            pkg.assembly_speed = dbPkg.packaging_assembly_speed || 0;
            // Convert шт/ч → шт/мин for display
            pkg.assembly_minutes = pkg.assembly_speed > 0 ? round2(pkg.assembly_speed / 60) : 0;
            pkg.price = dbPkg.packaging_price_per_unit || 0;
            const perUnit = dbPkg.packaging_delivery_per_unit || 0;
            pkg.delivery_total = dbPkg.packaging_delivery_total || (perUnit * pkg.qty);
            pkg.delivery_price = pkg.qty > 0 ? round2(pkg.delivery_total / pkg.qty) : perUnit;
            pkg.sell_price = dbPkg.sell_price_packaging || 0;
            this.packagingItems.push(pkg);
            const pkgIdx = this.packagingItems.length - 1;
            if (pkg.parent_item_index === null || pkg.parent_item_index === undefined) {
                this.renderPackagingRow(pkgIdx);
            }
            // per-item pkg will be rendered when the item block is created
        });

        // Restore extra costs
        const extraItems = dbItems.filter(i => i.item_type === 'extra_cost');
        this.extraCosts = extraItems.map(ec => ({
            name: ec.product_name || '',
            amount: ec.cost_total || ec.sell_price_item || 0,
        }));
        this.renderExtraCosts();

        if (this.items.length === 0) this.addItem();

        // Render per-item hw/pkg (loaded after items, so re-render now)
        // Also clear builtin_hw fields if real per-item hw exists (prevent double-counting)
        this.items.forEach((item, i) => {
            const hasTemplateHw = this.hardwareItems.some(hw => hw._from_template && hw.parent_item_index === i);
            if (hasTemplateHw) {
                item.builtin_hw_name = '';
                item.builtin_hw_price = 0;
                item.builtin_hw_delivery_total = 0;
                item.builtin_hw_speed = 0;
            }
            this._renderPerItemHwPkg(i);
        });

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
            // Use totalCostWithHwPkg which includes per-item hardware/packaging
            const costItemOnly = round2((item.totalCostWithHwPkg || item.result.costTotal) - costPrintingPart);

            // No auto-fill for item sell price — manager enters manually

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

        // Auto-fill hardware sell prices (only order-level; per-item included in item price)
        this.hardwareItems.forEach(hw => {
            if (hw.parent_item_index !== null) return;  // per-item hw — skip
            if (hw.result && hw.qty > 0 && (!hw.sell_price || hw.sell_price <= 0)) {
                hw.sell_price = roundTo5(calcTarget(hw.result.costPerUnit, 0.40));
            }
        });

        // Auto-fill packaging sell prices (only order-level)
        this.packagingItems.forEach(pkg => {
            if (pkg.parent_item_index !== null) return;  // per-item pkg — skip
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
                colors: (item.colors || []).map(c => c.name).filter(Boolean),
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

        // Only order-level hw/pkg as separate KP lines (per-item included in item price)
        this.hardwareItems.forEach(hw => {
            if (hw.parent_item_index !== null) return;  // per-item — included in item price
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
            if (pkg.parent_item_index !== null) return;  // per-item — included in item price
            if (pkg.qty > 0) {
                kpItems.push({
                    type: 'packaging',
                    name: pkg.name || 'Упаковка',
                    qty: pkg.qty,
                    price: pkg.sell_price,
                });
            }
        });

        // Extra costs
        (this.extraCosts || []).forEach(ec => {
            if (ec.amount > 0) {
                kpItems.push({
                    type: 'extra',
                    name: ec.name || 'Доп. расход',
                    qty: 1,
                    price: ec.amount,
                });
            }
        });

        if (kpItems.length === 0) {
            App.toast('Нет данных для КП');
            return;
        }

        // Collect client legal details from calculator
        const clientLegal = {
            name: document.getElementById('calc-client-legal-name')?.value?.trim() || '',
            inn: document.getElementById('calc-client-inn')?.value?.trim() || '',
            address: document.getElementById('calc-client-legal-address')?.value?.trim() || '',
            bank: document.getElementById('calc-client-bank-name')?.value?.trim() || '',
            account: document.getElementById('calc-client-bank-account')?.value?.trim() || '',
            bik: document.getElementById('calc-client-bank-bik')?.value?.trim() || '',
        };

        // Collect company legal details from settings
        const s = App.settings || {};
        const companyLegal = {
            name: s.company_legal_name || '',
            inn: s.company_inn || '',
            ogrn: s.company_ogrn || '',
            address: s.company_legal_address || '',
            bank: s.company_bank_name || '',
            account: s.company_bank_account || '',
            bik: s.company_bank_bik || '',
            corr: s.company_corr_account || '',
            phone: s.company_phone || '',
            email: s.company_email || '',
        };

        try {
            App.toast('Генерация КП...');
            await KPGenerator.generate(orderName, clientName, kpItems, clientLegal, companyLegal);
        } catch (err) {
            console.error('KP generation error:', err);
            App.toast('Ошибка генерации КП: ' + err.message);
        }
    },
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());

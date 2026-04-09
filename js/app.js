// =============================================
// Recycle Object — App Core (Routing, Auth, Init)
// =============================================

const APP_VERSION = 'v234';

const App = {
    currentPage: 'orders',
    settings: null,
    templates: null,
    params: null,
    editingOrderId: null,
    _updateCheckTimer: null,
    _updateCheckMs: 120000,
    _onWindowFocus: null,
    _toastTimer: null,
    employees: [],
    authAccounts: [],
    currentEmployeeId: null,
    currentUser: null,

    syncQuickBugButton() {
        const api = (typeof BugReports !== 'undefined' ? BugReports : null) || (typeof window !== 'undefined' ? window.BugReports : null);
        if (api && typeof api.syncQuickButton === 'function') {
            api.syncQuickButton();
        }
    },

    // All pages in the app
    ALL_PAGES: [
        'calculator', 'orders', 'factual',
        'analytics', 'molds', 'colors', 'timetrack', 'tasks', 'bugs', 'projects', 'wiki', 'gantt',
        'import', 'warehouse', 'marketplaces', 'china', 'monitoring', 'settings',
    ],

    // Pages visible to everyone by default (if no custom config)
    DEFAULT_PAGES: ['orders', 'timetrack', 'tasks', 'bugs', 'projects', 'wiki'],

    normalizePageAlias(page) {
        if (page === 'dashboard') return 'orders';
        if (page === 'production-plan' || page === 'calendar') return 'gantt';
        return page;
    },

    // Check if current user has access to a specific page
    canAccess(page) {
        if (!this.currentUser) return false;
        page = this.normalizePageAlias(page);
        if (page === 'bugs') return true;
        if (page === 'wiki') return true;
        if (page === 'monitoring') return true;
        // order-detail is part of orders
        if (page === 'order-detail') page = 'orders';
        if ((this.currentUser.id === '__admin' || this.currentUser.role === 'admin') && this.currentUser.employee_id == null) {
            return true;
        }
        const allowed = this.getCurrentAllowedPages();
        if (!allowed) return this.DEFAULT_PAGES.includes(page);
        if (allowed.includes(page)) return true;
        if (page === 'orders' && allowed.includes('dashboard')) return true;
        if (page === 'projects' && allowed.includes('tasks')) return true;
        return false;
    },

    // Backward-compat: isAdmin = canAccess('settings')
    isAdmin() {
        return this.canAccess('settings');
    },

    // Get page permissions for an employee
    getEmployeePages(empId) {
        const perms = JSON.parse(localStorage.getItem('ro_employee_pages') || '{}');
        return this.normalizePageList(perms[String(empId)] || null); // null = use DEFAULT_PAGES
    },

    // Save page permissions for an employee
    setEmployeePages(empId, pages) {
        const perms = JSON.parse(localStorage.getItem('ro_employee_pages') || '{}');
        perms[String(empId)] = this.normalizePageList(pages);
        localStorage.setItem('ro_employee_pages', JSON.stringify(perms));
    },

    getCurrentAllowedPages() {
        if (!this.currentUser) return null;
        const currentPages = this.normalizePageList(this.currentUser.pages);
        if (Array.isArray(currentPages)) return currentPages;
        const empId = this.currentUser.employee_id;
        if (empId == null || empId === '') return null;
        const perms = JSON.parse(localStorage.getItem('ro_employee_pages') || '{}');
        return this.normalizePageList(perms[String(empId)] || null);
    },

    normalizePageList(pages) {
        if (!Array.isArray(pages)) return pages;
        const mapped = pages
            .map(page => this.normalizePageAlias(page))
            .filter(page => this.ALL_PAGES.includes(page));
        return [...new Set(mapped)];
    },

    // Initialize default permissions if not set (Полина gets all pages)
    // One-time: copy page perms from localStorage into auth account objects (Supabase-synced)
    async _migratePagePermsToAuthAccounts() {
        if (localStorage.getItem('ro_pages_to_auth_migrated')) return;
        try {
            const accounts = await loadAuthAccounts();
            if (!accounts || !accounts.length) return;
            const perms = JSON.parse(localStorage.getItem('ro_employee_pages') || '{}');
            let changed = false;
            accounts.forEach(acc => {
                const empId = String(acc.employee_id || '');
                if (empId && perms[empId] && !acc.pages) {
                    acc.pages = this.normalizePageList(perms[empId]);
                    perms[empId] = acc.pages;
                    changed = true;
                }
            });
            if (changed) {
                localStorage.setItem('ro_employee_pages', JSON.stringify(perms));
                await saveAuthAccounts(accounts);
                console.log('Migrated page perms into auth accounts');
            }
            localStorage.setItem('ro_pages_to_auth_migrated', '1');
        } catch (e) {
            console.error('Page perm migration error:', e);
        }
    },

    initDefaultPermissions() {
        const perms = JSON.parse(localStorage.getItem('ro_employee_pages') || '{}');
        Object.keys(perms).forEach(empId => {
            perms[empId] = this.normalizePageList(perms[empId]);
        });
        // Полина (id=5) always gets all pages, including newly added screens.
        perms['5'] = [...this.ALL_PAGES];
        localStorage.setItem('ro_employee_pages', JSON.stringify(perms));
        // Default production shares for employees with non-standard split
        const shares = JSON.parse(localStorage.getItem('ro_production_shares') || '{}');
        if (!shares['1772827635013']) {
            shares['1772827635013'] = 50; // Леша: 50% производство / 50% управление
            localStorage.setItem('ro_production_shares', JSON.stringify(shares));
        }
    },

    _sessionStartedAt: null,
    _sessionId: null,
    _sessionHeartbeatTimer: null,
    AUTH_PASSWORD_HASH_VERSION: 2,
    AUTH_PASSWORD_HASH_ROUNDS: 2048,

    async init() {
        initSupabase();
        this.initDefaultPermissions();
        await this.prepareAuthUI();
        await this._migratePagePermsToAuthAccounts();

        // Check auth
        if (this.isAuthenticated()) {
            await this.restoreAuthenticatedUser();
            if (this.currentUser) {
                await this.showApp();
            }
        }

        // Bind enter on password
        document.getElementById('auth-password').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.login();
        });

        // Hash routing
        window.addEventListener('hashchange', () => this.handleRoute());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.endSessionTracking('hidden');
            } else if (this.isAuthenticated() && !this._sessionId) {
                this.startSessionTracking();
            }
        });
        window.addEventListener('beforeunload', () => this.endSessionTracking('unload'));
    },

    // === AUTH ===

    async login() {
        const selectedUserId = (document.getElementById('auth-user-select')?.value || '').trim();
        const pwd = document.getElementById('auth-password').value;
        const nowTs = Date.now().toString();
        let ok = false;
        let errorText = 'Неверный пароль';
        let upgradedLegacyHash = false;

        // Employee login only (no admin mode)
        const account = this.authAccounts.find(a => String(a.id) === String(selectedUserId) && a.is_active !== false);
        if (!account) {
            errorText = 'Пользователь не найден';
        } else {
            if (this.verifyUserPassword(account, pwd)) {
                const currentVersion = Number(this.AUTH_PASSWORD_HASH_VERSION) || 2;
                if (this.getAccountPasswordHashVersion(account) < currentVersion) {
                    account.password_hash = this.hashUserPassword(account.username || '', pwd, currentVersion);
                    account.password_hash_version = currentVersion;
                    account.password_rotated_at = new Date().toISOString();
                    delete account.password_plain;
                    upgradedLegacyHash = true;
                }
                localStorage.setItem('ro_calc_auth_method', 'user');
                localStorage.setItem('ro_calc_auth_ts', nowTs);
                localStorage.setItem('ro_calc_auth_user_id', String(account.id));
                localStorage.setItem('ro_calc_last_user_id', String(account.id));
                localStorage.setItem('ro_calc_last_user_name', account.employee_name || account.username || 'Сотрудник');
                localStorage.removeItem('ro_calc_auth');
                this.currentUser = this.buildCurrentUserFromAccount(account);
                ok = true;
                // Sync page permissions from auth account to localStorage
                if (account.employee_id != null && account.pages && Array.isArray(account.pages)) {
                    this.setEmployeePages(account.employee_id, account.pages);
                }
                account.last_login_at = new Date().toISOString();
                await saveAuthAccounts(this.authAccounts);
                appendAuthActivity({
                    type: 'login',
                    actor: this.currentUser.name,
                    actor_user_id: this.currentUser.id,
                    method: 'user',
                });
                if (upgradedLegacyHash) {
                    appendAuthActivity({
                        type: 'password_hash_upgrade',
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
        const ts = parseInt(localStorage.getItem('ro_calc_auth_ts') || '0');
        // Session lasts 30 days (was 24h — too aggressive, kept logging users out)
        if (!ts || (Date.now() - ts) >= 30 * 86400000) return false;
        const userId = localStorage.getItem('ro_calc_auth_user_id');
        return !!userId;
    },

    async restoreAuthenticatedUser() {
        this.authAccounts = (await loadAuthAccounts()).map(account => ({
            ...account,
            pages: this.normalizePageList(account.pages),
        }));
        const userId = localStorage.getItem('ro_calc_auth_user_id');
        const account = this.authAccounts.find(a => String(a.id) === String(userId) && a.is_active !== false);
        if (account) {
            this.currentUser = this.buildCurrentUserFromAccount(account);
            // Refresh session timestamp on active usage (extends 30-day window)
            localStorage.setItem('ro_calc_auth_ts', Date.now().toString());
            // Sync page permissions from auth account to localStorage
            if (account.employee_id != null && account.pages && Array.isArray(account.pages)) {
                this.setEmployeePages(account.employee_id, account.pages);
            }
            return;
        }
        // Auth data must be available to restore a session safely.
        if (userId) {
            console.warn('Auth restore failed: account not found or auth accounts unavailable');
            const err = document.getElementById('auth-error');
            if (err) {
                err.textContent = 'Не удалось подтвердить вход: логин отключен или данные обновились. Войдите заново.';
                err.style.display = 'block';
            }
        }
        // No valid account — force logout
        this.logout();
    },

    logout() {
        this.endSessionTracking('logout');
        this.trackAuthEvent('logout');
        localStorage.removeItem('ro_calc_auth');
        localStorage.removeItem('ro_calc_auth_ts');
        localStorage.removeItem('ro_calc_auth_method');
        localStorage.removeItem('ro_calc_auth_user_id');
        localStorage.removeItem('ro_calc_editing_order_id');
        this.currentUser = null;
        this.currentPage = 'orders';
        this._sessionStartedAt = null;
        this._sessionId = null;
        this.clearToast();
        if (typeof Calculator !== 'undefined' && Calculator._autosaveTimer) {
            clearTimeout(Calculator._autosaveTimer);
            Calculator._autosaveTimer = null;
        }
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('app-layout').classList.remove('active');
        const userInfo = document.getElementById('sidebar-user-info');
        if (userInfo) userInfo.textContent = '';
        this.syncQuickBugButton();
        this.hideUpdateBanner();
        if (this._updateCheckTimer) {
            clearInterval(this._updateCheckTimer);
            this._updateCheckTimer = null;
        }
        if (this._onWindowFocus) {
            window.removeEventListener('focus', this._onWindowFocus);
            this._onWindowFocus = null;
        }
        const pathname = window.location?.pathname || '';
        const search = window.location?.search || '';
        if (window.history && typeof window.history.replaceState === 'function') {
            window.history.replaceState(null, '', `${pathname}${search}`);
        } else if (window.location) {
            window.location.hash = '';
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

    legacyHashUserPassword(username, password) {
        return this.simpleHash(`ro:${String(username || '').trim().toLowerCase()}::${String(password || '')}`);
    },

    getAccountPasswordHashVersion(account) {
        const explicit = parseInt(account?.password_hash_version, 10);
        if (Number.isFinite(explicit) && explicit > 0) return explicit;
        const hash = String(account?.password_hash || '');
        const prefixMatch = hash.match(/^v(\d+):/);
        if (prefixMatch) return parseInt(prefixMatch[1], 10) || 1;
        return 1;
    },

    hashUserPassword(username, password, version = null) {
        const normalizedUsername = String(username || '').trim().toLowerCase();
        const normalizedPassword = String(password || '');
        const targetVersion = Number(version) || this.AUTH_PASSWORD_HASH_VERSION;
        if (targetVersion <= 1) {
            return this.legacyHashUserPassword(normalizedUsername, normalizedPassword);
        }

        let digest = `ro:v${targetVersion}:${normalizedUsername}::${normalizedPassword}`;
        const rounds = Math.max(32, Number(this.AUTH_PASSWORD_HASH_ROUNDS) || 2048);
        for (let i = 0; i < rounds; i++) {
            digest = this.simpleHash(`${targetVersion}|${i}|${digest}|recycle-object`);
        }
        return `v${targetVersion}:${digest}`;
    },

    verifyUserPassword(account, password) {
        if (!account || !account.password_hash) return false;
        const version = this.getAccountPasswordHashVersion(account);
        return this.hashUserPassword(account.username || '', password, version) === account.password_hash;
    },

    buildCurrentUserFromAccount(account) {
        return {
            id: account.id,
            employee_id: account.employee_id ?? null,
            username: account.username || '',
            name: account.employee_name || account.username || 'Сотрудник',
            role: account.role || 'employee',
            pages: this.normalizePageList(account.pages),
        };
    },

    async prepareAuthUI() {
        try {
            const employees = await loadEmployees();
            this.employees = (employees || []).filter(e => e && e.name && e.is_active !== false);
        } catch (e) {
            this.employees = [];
        }
        try {
            this.authAccounts = (await loadAuthAccounts()).map(account => ({
                ...account,
                pages: this.normalizePageList(account.pages),
            }));
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

        // Remember last logged-in user to pre-select
        const lastUserId = localStorage.getItem('ro_calc_last_user_id') || localStorage.getItem('ro_calc_auth_user_id') || '';

        let html = accounts.map(a => {
            const name = this.escHtml(a.employee_name || a.username || 'Сотрудник');
            const login = this.escHtml(a.username || '');
            const sel = String(a.id) === String(lastUserId) ? ' selected' : '';
            return `<option value="${this.escHtml(String(a.id))}"${sel}>${name}${login ? ` (${login})` : ''}</option>`;
        }).join('');
        select.innerHTML = html;
    },

    async refreshAuthUsers() {
        this.authAccounts = (await loadAuthAccounts()).map(account => ({
            ...account,
            pages: this.normalizePageList(account.pages),
        }));
        this.renderAuthUserSelect();
    },

    async showApp() {
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-layout').classList.add('active');

        // Show logged-in user name in sidebar
        const userInfo = document.getElementById('sidebar-user-info');
        if (userInfo && this.currentUser) {
            userInfo.textContent = this.currentUser.name || this.currentUser.username || '';
        }

        // Show version in sidebar
        const verEl = document.getElementById('app-version');
        if (verEl) verEl.textContent = APP_VERSION;

        // Auto-backup only when this build is actually newer than the previous one.
        const lastVersion = localStorage.getItem('ro_calc_last_version');
        const maxSeenVersion = this.getMaxSeenVersion();
        if (lastVersion && this.isRemoteVersionNewer(APP_VERSION, lastVersion)) {
            try {
                Settings.autoBackup('upgrade-' + lastVersion + '-to-' + APP_VERSION);
                console.log('Auto-backup created before upgrade from', lastVersion, 'to', APP_VERSION);
            } catch (e) { console.warn('Auto-backup failed:', e); }
        }
        if (maxSeenVersion && this.isRemoteVersionNewer(maxSeenVersion, APP_VERSION)) {
            this.showUpdateBanner(maxSeenVersion, 'stale');
            setTimeout(() => {
                this.toast(`Эта вкладка устарела: здесь ${APP_VERSION}, а вы уже открывали ${maxSeenVersion}. Обновите страницу.`);
            }, 250);
        }
        if (!maxSeenVersion || this.isRemoteVersionNewer(APP_VERSION, maxSeenVersion)) {
            localStorage.setItem('ro_calc_max_seen_version', APP_VERSION);
        }
        localStorage.setItem('ro_calc_last_version', APP_VERSION);

        this.settings = await loadSettings();
        this.templates = await loadTemplates();
        this.params = getProductionParams(this.settings);
        if (typeof window !== 'undefined' && window.__roSupabaseAccessProblem) {
            setTimeout(() => {
                this.toast('Нет доступа к общей базе данных. Приложение использует локальные данные браузера, поэтому значения у сотрудников могут отличаться.');
            }, 300);
        }
        await this.initEmployeeContext();
        this._sessionStartedAt = Date.now();
        this.startSessionTracking();
        this.trackAuthEvent('session_start');

        this.applyNavVisibility();
        this.handleRoute();
        this.startUpdateChecker();
        this.syncQuickBugButton();
    },

    // Hide sidebar links for pages the user has no access to
    applyNavVisibility() {
        document.querySelectorAll('.sidebar-nav a[data-page]').forEach(a => {
            const page = a.dataset.page;
            a.style.display = this.canAccess(page) ? '' : 'none';
        });
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

    getCurrentActorId() {
        if (this.currentUser && this.currentUser.id && this.currentUser.id !== '__admin') {
            return String(this.currentUser.id);
        }
        if (this.currentEmployeeId != null) return String(this.currentEmployeeId);
        return '__admin';
    },

    startSessionTracking() {
        if (this._sessionId) return;
        const now = new Date().toISOString();
        const sessionId = Date.now() + '-' + Math.floor(Math.random() * 10000);
        this._sessionId = sessionId;
        this._sessionStartedAt = this._sessionStartedAt || Date.now();

        appendAuthSession({
            id: sessionId,
            actor: this.getCurrentEmployeeName(),
            actor_id: this.getCurrentActorId(),
            user_id: this.currentUser ? String(this.currentUser.id) : null,
            started_at: now,
            last_seen_at: now,
            ended_at: null,
            duration_sec: 0,
            status: 'active',
        });

        if (this._sessionHeartbeatTimer) clearInterval(this._sessionHeartbeatTimer);
        this._sessionHeartbeatTimer = setInterval(() => this.touchSession(), 60000);
    },

    touchSession() {
        if (!this._sessionId || !this._sessionStartedAt) return;
        const nowIso = new Date().toISOString();
        const durationSec = Math.max(0, Math.round((Date.now() - this._sessionStartedAt) / 1000));
        updateAuthSession(this._sessionId, {
            last_seen_at: nowIso,
            duration_sec: durationSec,
            actor: this.getCurrentEmployeeName(),
            actor_id: this.getCurrentActorId(),
        });
    },

    endSessionTracking(reason = 'unknown') {
        if (!this._sessionId || !this._sessionStartedAt) return;
        const nowIso = new Date().toISOString();
        const durationSec = Math.max(0, Math.round((Date.now() - this._sessionStartedAt) / 1000));
        updateAuthSession(this._sessionId, {
            ended_at: nowIso,
            last_seen_at: nowIso,
            duration_sec: durationSec,
            status: 'closed',
            end_reason: reason,
            actor: this.getCurrentEmployeeName(),
            actor_id: this.getCurrentActorId(),
        });

        if (this._sessionHeartbeatTimer) {
            clearInterval(this._sessionHeartbeatTimer);
            this._sessionHeartbeatTimer = null;
        }
        this._sessionId = null;
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
        const hash = window.location.hash.replace('#', '') || 'orders';
        const parts = hash.split('/');
        const page = this.normalizePageAlias(parts[0]);
        const subId = parts[1] || null;
        this.navigate(page, false, subId);
    },

    navigate(page, pushHash = true, subId = null) {
        page = this.normalizePageAlias(page);

        // Access control: redirect to orders if not allowed
        if (!this.canAccess(page)) {
            const fallback = this.canAccess('orders') ? 'orders' : (this.ALL_PAGES.find(p => this.canAccess(p)) || 'orders');
            page = fallback;
            subId = null;
            App.toast('Нет доступа к этой странице');
        }

        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

        const target = document.getElementById('page-' + page);
        if (target) {
            target.classList.add('active');
            this.currentPage = page;
        } else {
            document.getElementById('page-orders').classList.add('active');
            this.currentPage = 'orders';
        }

        // Highlight sidebar (order-detail highlights 'orders')
        const navPage = page === 'order-detail' ? 'orders' : this.currentPage;
        document.querySelectorAll('.sidebar-nav a').forEach(a => {
            a.classList.toggle('active', a.dataset.page === navPage);
        });

        if (pushHash) {
            window.location.hash = subId ? this.currentPage + '/' + subId : this.currentPage;
        }

        this.syncQuickBugButton();
        this.onPageEnter(this.currentPage, subId);
        this.trackAuthEvent('navigate', { to_page: this.currentPage });
    },

    onPageEnter(page, subId) {
        switch (page) {
            case 'calculator': Calculator.init(); break;
            case 'orders': Orders.loadList(); break;
            case 'production-plan':
            case 'gantt': Gantt.load(); break;
            case 'order-detail': if (subId) OrderDetail.load(parseInt(subId)); break;
            case 'factual': Factual.load(); break;
            case 'analytics': this.navigate('factual'); break;
            case 'molds': Molds.load(); break;
            case 'colors': Colors.load(); break;
            case 'timetrack': TimeTrack.load(); break;
            case 'tasks': Tasks.load(subId ? parseInt(subId, 10) : null); break;
            case 'bugs': BugReports.load(); break;
            case 'projects': Projects.load(subId ? parseInt(subId, 10) : null); break;
            case 'wiki': Wiki.load(); break;
            case 'import': FinTablo.load(); break;
            case 'indirect-costs': App.navigate('settings'); setTimeout(() => Settings.switchTab('indirect'), 100); break;
            case 'warehouse': Warehouse.load(); break;
            case 'marketplaces': Marketplaces.load(); break;
            case 'china': ChinaPurchases.load(); break;
            case 'monitoring': Monitoring.load(); break;
            case 'settings': Settings.load(); break;
        }
    },

    // === TOAST ===

    toast(message, duration = 3000) {
        const el = document.getElementById('toast');
        if (!el) return;
        if (this._toastTimer) {
            clearTimeout(this._toastTimer);
            this._toastTimer = null;
        }
        el.textContent = message;
        el.classList.add('show');
        this._toastTimer = setTimeout(() => {
            el.classList.remove('show');
            el.textContent = '';
            this._toastTimer = null;
        }, duration);
    },

    clearToast() {
        const el = document.getElementById('toast');
        if (!el) return;
        if (this._toastTimer) {
            clearTimeout(this._toastTimer);
            this._toastTimer = null;
        }
        el.classList.remove('show');
        el.textContent = '';
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

            if (this.isRemoteVersionNewer(remoteVersion, APP_VERSION)) {
                this.showUpdateBanner(remoteVersion, 'update');
                return;
            }

            const maxSeenVersion = this.getMaxSeenVersion();
            if (maxSeenVersion && this.isRemoteVersionNewer(maxSeenVersion, APP_VERSION)) {
                this.showUpdateBanner(maxSeenVersion, 'stale');
                return;
            }

            this.hideUpdateBanner();
        } catch (e) {
            // Silently ignore: no internet or temporary network issues.
        }
    },

    parseVersion(versionStr) {
        // Supports v61, 61, v61.2.3 etc.
        const clean = String(versionStr || '').trim().toLowerCase().replace(/^v/, '');
        if (!clean) return [0];
        return clean.split('.').map(part => {
            const n = parseInt(part, 10);
            return Number.isFinite(n) ? n : 0;
        });
    },

    isRemoteVersionNewer(remoteVersion, currentVersion) {
        const remoteParts = this.parseVersion(remoteVersion);
        const currentParts = this.parseVersion(currentVersion);
        const len = Math.max(remoteParts.length, currentParts.length);
        for (let i = 0; i < len; i++) {
            const r = remoteParts[i] || 0;
            const c = currentParts[i] || 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    },

    getMaxSeenVersion() {
        const remembered = localStorage.getItem('ro_calc_max_seen_version') || localStorage.getItem('ro_calc_last_version') || '';
        return remembered ? String(remembered) : null;
    },

    showUpdateBanner(remoteVersion, mode = 'update') {
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        const resolvedVersion = String(remoteVersion || '').trim() || APP_VERSION;
        banner.dataset.targetVersion = resolvedVersion;
        if (mode === 'stale') {
            banner.textContent = `⟳ Обновиться до ${resolvedVersion} (сейчас ${APP_VERSION})`;
        } else {
            banner.textContent = '⟳ Обновиться до ' + resolvedVersion;
        }
        const maxSeenVersion = this.getMaxSeenVersion();
        if (!maxSeenVersion || this.isRemoteVersionNewer(resolvedVersion, maxSeenVersion)) {
            localStorage.setItem('ro_calc_max_seen_version', resolvedVersion);
        }
        banner.style.display = 'inline-flex';
    },

    hideUpdateBanner() {
        const banner = document.getElementById('update-banner');
        if (!banner) return;
        banner.textContent = '⟳ Доступно обновление';
        delete banner.dataset.targetVersion;
        banner.style.display = 'none';
    },

    reloadForUpdate() {
        try {
            const banner = document.getElementById('update-banner');
            const targetVersion = (banner && banner.dataset && banner.dataset.targetVersion) || this.getMaxSeenVersion() || APP_VERSION;
            const url = new URL(window.location.href);
            url.searchParams.set('reload', Date.now().toString());
            url.searchParams.set('targetVersion', String(targetVersion));
            window.location.replace(url.toString());
        } catch (e) {
            window.location.reload();
        }
    },

    // === UTILS ===

    formatDate(dateStr) {
        if (!dateStr) return '—';
        const raw = String(dateStr).trim();
        const plainDateMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (plainDateMatch) {
            const [, year, month, day] = plainDateMatch;
            return `${day}.${month}.${year}`;
        }
        const isoLikeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T/);
        if (isoLikeMatch) {
            const [, year, month, day] = isoLikeMatch;
            return `${day}.${month}.${year}`;
        }
        const d = new Date(dateStr);
        if (Number.isNaN(d.getTime())) return raw;
        return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
    },

    todayLocalYMD() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    getItemOriginLabel(item) {
        return item && item.is_blank_mold ? 'бланк' : 'кастом';
    },

    statusLabel(status) {
        const map = {
            draft:                'Черновик',
            calculated:           'Черновик',          // backward compat
            sample:               'Заказ образца',
            production_casting:   'Производство: Выливание',
            production_printing:  'Производство: Печать',
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
    pendants: [],       // Pendant items (unlimited)
    extraCosts: [],     // Extra costs [{name, amount}]
    discountMode: 'none',
    discountValue: 0,
    maxItems: 6,
    _autosaveTimer: null,
    _isDirty: false,
    _autosaving: false,
    _currentOrderStatus: 'draft', // Track current order status to preserve on autosave
    _hwBlanksCatalog: [],
    _pkgBlanksCatalog: [],
    _blanksCatalogLoaded: false,
    _preserveStateOnNextInit: false,

    async init() {
        // Ensure colors are loaded for color picker
        try {
            if (!Colors.data || Colors.data.length === 0) {
                Colors.data = await loadColors();
            }
        } catch (e) { console.error('[Calculator.init] loadColors error:', e); }

        try {
            await this._ensureBlanksCatalog();
        } catch (e) {
            console.error('[Calculator.init] load blanks catalog error:', e);
        }

        if (this._preserveStateOnNextInit) {
            this._preserveStateOnNextInit = false;
        } else {
            this.resetForm();
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
            window.addEventListener('beforeunload', (e) => {
                if (this._isDirty && this._autosaveTimer) {
                    clearTimeout(this._autosaveTimer);
                }
            });
        }
    },

    resetForm() {
        // Cancel any pending autosave
        clearTimeout(this._autosaveTimer);
        this._isDirty = false;
        this._autosaving = false;
        this._invalidateWhPickerContext();
        this._clearCommittedWhDemandSnapshot();

        App.editingOrderId = null;
        this._currentOrderStatus = 'draft';
        localStorage.removeItem('ro_calc_editing_order_id');
        document.getElementById('calc-order-name').value = '';
        document.getElementById('calc-client-name').value = '';
        App.applyCurrentEmployeeToCalculator(true);
        // Auto-fill "Начало" with today's date for new orders
        document.getElementById('calc-deadline-start').value = App.todayLocalYMD();
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
        this.pendants = [];
        this.discountMode = 'none';
        this.discountValue = 0;
        document.getElementById('calc-items-container').innerHTML = '';
        document.getElementById('calc-hardware-list').innerHTML = '';
        document.getElementById('calc-packaging-list').innerHTML = '';
        const pendantList = document.getElementById('calc-pendants-container');
        if (pendantList) pendantList.innerHTML = '';
        document.getElementById('extra-costs-list').innerHTML = '';
        document.getElementById('calc-production-load').style.display = 'none';
        document.getElementById('calc-findirector').style.display = 'none';
        document.getElementById('calc-summary-footer').style.display = 'none';
        const pricingEl = document.getElementById('calc-pricing');
        if (pricingEl) pricingEl.style.display = 'none';
        document.getElementById('calc-add-item-btn').style.display = '';
        this._updateItemsEmptyState();
        const historyEl = document.getElementById('calc-history');
        if (historyEl) historyEl.style.display = 'none';
        // Clear save indicator
        const statusEl = document.getElementById('calc-autosave-status');
        if (statusEl) statusEl.textContent = '';
        this._syncDiscountUi();
    },

    _parseDiscountValue(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        const normalized = String(value || '')
            .replace(/\s+/g, '')
            .replace(',', '.')
            .replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    },

    getOrderAdjustments() {
        return normalizeOrderDiscount(this.discountMode, this.discountValue);
    },

    onDiscountModeChange(mode) {
        this.discountMode = (mode === 'amount' || mode === 'percent') ? mode : 'none';
        this._syncDiscountUi();
        this.recalculate();
        this.scheduleAutosave();
    },

    onDiscountValueChange(value) {
        this.discountValue = this._parseDiscountValue(value);
        this._syncDiscountUi();
        this.recalculate();
        this.scheduleAutosave();
    },

    _syncDiscountUi(summary = null) {
        const modeEl = document.getElementById('calc-discount-mode');
        const valueEl = document.getElementById('calc-discount-value');
        const summaryEl = document.getElementById('calc-discount-summary');
        const adjustments = this.getOrderAdjustments();

        if (modeEl) modeEl.value = adjustments.mode;
        if (valueEl) {
            valueEl.disabled = adjustments.mode === 'none';
            valueEl.placeholder = adjustments.mode === 'percent' ? '10' : '0';
            valueEl.value = adjustments.mode === 'none'
                ? ''
                : (this.discountValue > 0 ? String(this.discountValue) : '');
        }

        if (!summaryEl) return;
        if (adjustments.mode === 'none' || !(summary && summary.discountAmount > 0)) {
            summaryEl.innerHTML = 'Без скидки';
            return;
        }

        const modeLabel = adjustments.mode === 'percent'
            ? `Скидка ${formatPercent(summary.discountPercent)}`
            : `Скидка ${formatRub(summary.discountAmount)}`;
        summaryEl.innerHTML = `${modeLabel} · выручка после скидки <strong>${formatRub(summary.totalRevenue)}</strong><div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Скидка применяется к сумме без НДС и влияет на маржу</div>`;
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
        this._updateItemsEmptyState();

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
            base_mold_in_stock: false,
            complex_design: false,
            is_blank_mold: false,
            is_nfc: false,
            nfc_programming: false,
            nfc_warehouse_item_id: null,
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
            color_solution_attachment: null, // {name, type, data_url, size}
            color_id: null,   // backward compat (first color)
            color_name: '',   // backward compat (first color)
            // Sell prices
            sell_price_item: 0,
            sell_price_printing: 0,
            result: null,
            template_id: null,
        };
    },

    _isMeaningfulProductItem(item) {
        if (!item || typeof item !== 'object') return false;

        const hasPrintings = Array.isArray(item.printings) && item.printings.some(pr => {
            if (!pr || typeof pr !== 'object') return false;
            return !!String(pr.name || '').trim()
                || (parseFloat(pr.qty) || 0) > 0
                || (parseFloat(pr.price) || 0) > 0
                || (parseFloat(pr.sell_price) || 0) > 0
                || (parseFloat(pr.delivery_total) || 0) > 0;
        });
        const hasColors = Array.isArray(item.colors) && item.colors.length > 0;

        return !!String(item.product_name || '').trim()
            || (parseFloat(item.quantity) || 0) > 0
            || (parseFloat(item.pieces_per_hour) || 0) > 0
            || (parseFloat(item.weight_grams) || 0) > 0
            || (parseFloat(item.extra_molds) || 0) > 0
            || !!item.base_mold_in_stock
            || !!item.complex_design
            || !!item.is_blank_mold
            || !!item.is_nfc
            || !!item.nfc_programming
            || !!item.nfc_warehouse_item_id
            || !!item.delivery_included
            || !!item.template_id
            || !!item.color_id
            || hasColors
            || !!(item.color_solution_attachment && (item.color_solution_attachment.data_url || item.color_solution_attachment.name))
            || hasPrintings
            || (parseFloat(item.sell_price_item) || 0) > 0
            || (parseFloat(item.sell_price_printing) || 0) > 0
            || !!String(item.builtin_hw_name || '').trim()
            || (parseFloat(item.builtin_hw_price) || 0) > 0
            || (parseFloat(item.builtin_hw_delivery_total) || 0) > 0
            || (parseFloat(item.builtin_hw_speed) || 0) > 0;
    },

    renderItemBlock(idx) {
        const item = this.items[idx];
        const num = idx + 1;
        const container = document.getElementById('calc-items-container');
        const showCustomOnly = !item.is_blank_mold;

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

        // File attachment for color mix reference (photo/PDF/etc.)
        let colorAttachmentHtml = '';
        try {
            const att = item.color_solution_attachment;
            if (att && att.data_url) {
                const isImage = String(att.type || '').startsWith('image/');
                const sizeKb = att.size ? Math.round(att.size / 1024) : 0;
                colorAttachmentHtml = `
                <div class="form-group" style="margin-top:8px;">
                    <label>Файл цветового решения</label>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        ${isImage ? `<img src="${this._escAttr(att.data_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--border)">` : `<span style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:18px;">📎</span>`}
                        <div style="min-width:0;flex:1;">
                            <div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this._esc(att.name || 'Файл')}</div>
                            <div style="font-size:10px;color:var(--text-muted);">${this._esc(att.type || 'file')} ${sizeKb ? `· ${sizeKb} KB` : ''}</div>
                        </div>
                        <button class="btn btn-sm btn-outline" onclick="Calculator.openColorAttachment(${idx})">Открыть</button>
                        <button class="btn btn-sm btn-outline" onclick="Calculator.removeColorAttachment(${idx})">Удалить</button>
                    </div>
                </div>`;
            } else {
                colorAttachmentHtml = `
                <div class="form-group" style="margin-top:8px;">
                    <label>Файл цветового решения</label>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <input type="file" id="item-color-file-${idx}" accept="image/*,.pdf,.ai,.psd,.svg,.zip,.rar,.7z,.doc,.docx,.xls,.xlsx,.txt"
                            onchange="Calculator.onColorAttachmentChange(${idx}, this)" style="max-width:300px;font-size:12px;">
                        <span style="font-size:10px;color:var(--text-muted);">До 3 МБ</span>
                    </div>
                </div>`;
            }
        } catch (e) { console.error('[renderItemBlock] attachment block error:', e); }

        // Preserve collapse state when re-rendering an existing card
        const existingBlock = document.getElementById('item-block-' + idx);
        const wasCollapsed = existingBlock ? existingBlock.classList.contains('is-collapsed') : false;

        // Build summary values for collapsed view
        const summaryQty = item.quantity ? item.quantity.toLocaleString('ru') + ' шт' : '—';
        const firstColor = (item.colors && item.colors[0]) ? item.colors[0].name : '';
        const summaryColor = firstColor || '—';
        const summaryPrintQty = (item.printings || []).reduce((s, p) => s + (p.qty || 0), 0);
        const summaryPrint = summaryPrintQty > 0 ? summaryPrintQty.toLocaleString('ru') + ' шт' : '';
        const summaryPrice = item.sell_price_item > 0 ? item.sell_price_item + ' ₽/шт' : '';

        const html = `
        <div class="item-block${wasCollapsed ? ' is-collapsed' : ''}" id="item-block-${idx}">
            <div class="item-block-header">
                <div class="item-num">${num}</div>
                <div class="item-title" id="item-title-${idx}">${item.product_name || 'Изделие ' + num}</div>
                <button class="btn btn-sm btn-outline item-collapse-btn" onclick="Calculator.toggleItemCollapse(${idx})">${wasCollapsed ? '▼ Показать' : '▲ Свернуть'}</button>
                <button class="btn btn-sm btn-outline" onclick="Calculator.cloneItem(${idx})">Клонировать</button>
                <button class="btn-danger-sm" onclick="Calculator.removeItem(${idx})">✕</button>
            </div>
            <div class="item-card-summary">
                <div class="item-summary-stat">
                    <span class="item-summary-label">Кол-во</span>
                    <span class="item-summary-value">${summaryQty}</span>
                </div>
                <div class="item-summary-stat">
                    <span class="item-summary-label">Цвет</span>
                    <span class="item-summary-value">${summaryColor}</span>
                </div>
                ${summaryPrint ? `<div class="item-summary-stat">
                    <span class="item-summary-label">Печать</span>
                    <span class="item-summary-value">${summaryPrint}</span>
                </div>` : ''}
                ${summaryPrice ? `<div class="item-summary-stat">
                    <span class="item-summary-label">Цена/шт</span>
                    <span class="item-summary-value" style="color:var(--green)">${summaryPrice}</span>
                </div>` : ''}
            </div>
            <div class="item-body">

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

            <details class="item-advanced-details" ${(item.base_mold_in_stock || item.complex_design || item.is_nfc || item.nfc_programming || item.delivery_included || !item.is_blank_mold) ? 'open' : ''}>
                <summary class="item-advanced-summary">Дополнительно</summary>
            ${showCustomOnly ? `
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-stock-mold-${idx}" ${item.base_mold_in_stock ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'base_mold_in_stock', this.checked)">
                <label for="item-stock-mold-${idx}">Молд уже лежит на складе и не идет в стоимость заказа</label>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label>Доп. молды</label>
                    <input type="number" min="0" value="${item.extra_molds || 0}" oninput="Calculator.onNumChange(${idx}, 'extra_molds', this.value)">
                    <span class="form-hint">${item.base_mold_in_stock ? 'В стоимость попадут только дополнительные молды сверх складского.' : 'Если нужен ещё один новый молд, укажите его здесь.'}</span>
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
            ` : ''}
            <div class="toggle-row">
                <input type="checkbox" class="toggle" id="item-delivery-${idx}" ${item.delivery_included ? 'checked' : ''} onchange="Calculator.onToggle(${idx}, 'delivery_included', this.checked)">
                <label for="item-delivery-${idx}">Доставка за наш счет (+${formatRub(App.settings.delivery_cost_moscow)})</label>
            </div>
            </details>

            <!-- Нанесение (multiple) -->
            <div class="section-title">Нанесение</div>
            <div id="printings-list-${idx}">${printingsHtml}</div>
            <button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="Calculator.addPrinting(${idx})">+ Нанесение</button>

            <!-- Цветовое решение (per item) -->
            ${colorPickerHtml}
            ${colorAttachmentHtml}

            <!-- Фурнитура изделия (per-item) -->
            <div class="section-title" style="margin-top:12px">🔩 Фурнитура внутри изделия</div>
            <div id="item-hw-list-${idx}"></div>
            <button class="btn btn-sm btn-outline" style="margin-top:4px" onclick="Calculator.addItemHardware(${idx})">+ Фурнитура</button>

            <!-- Упаковка изделия (per-item) -->
            <div class="section-title" style="margin-top:12px">📦 Упаковка внутри изделия</div>
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

            </div><!-- /.item-body -->
        </div>`;

        // Replace existing block if re-rendering, otherwise append
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
            custom_country: 'china',    // for source='custom': 'china' | 'russia'
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
    _whCurrentOrderReservationMap: null,
    _whReservationOrderId: null,
    _whReservationLoading: false,
    _whCommittedOrderDemandMap: null,
    _whCommittedDemandOrderId: null,

    _invalidateWhPickerContext() {
        this._whPickerData = null;
        this._whPickerLoading = false;
        this._whCurrentOrderReservationMap = null;
        this._whReservationOrderId = null;
        this._whReservationLoading = false;
    },

    _clearCommittedWhDemandSnapshot() {
        this._whCommittedOrderDemandMap = null;
        this._whCommittedDemandOrderId = null;
    },

    _captureCommittedWhDemandSnapshot(orderId = App.editingOrderId || null) {
        const normalizedOrderId = Number(orderId || 0) || null;
        if (!normalizedOrderId) {
            this._clearCommittedWhDemandSnapshot();
            return new Map();
        }

        const snapshot = this._collectWarehouseReservationDemand({ hardware: true, packaging: true });
        this._whCommittedOrderDemandMap = new Map(snapshot);
        this._whCommittedDemandOrderId = normalizedOrderId;
        return this._whCommittedOrderDemandMap;
    },

    _getCommittedOrderWarehouseDemandQty(itemId) {
        const normalizedOrderId = Number(App.editingOrderId || 0) || null;
        if (!normalizedOrderId) return 0;
        if (!this._whCommittedOrderDemandMap) return 0;
        if (Number(this._whCommittedDemandOrderId || 0) !== normalizedOrderId) return 0;
        return this._whCommittedOrderDemandMap.get(Number(itemId) || 0) || 0;
    },

    async _ensureWhReservationContext(force = false) {
        const orderId = App.editingOrderId || null;
        if (!force && this._whCurrentOrderReservationMap && this._whReservationOrderId === orderId) {
            return this._whCurrentOrderReservationMap;
        }
        if (this._whReservationLoading) {
            while (this._whReservationLoading) await new Promise(r => setTimeout(r, 50));
            return this._whCurrentOrderReservationMap || new Map();
        }

        this._whReservationLoading = true;
        try {
            const reservations = await loadWarehouseReservations();
            const reservationMap = new Map();
            reservations.forEach(r => {
                if (r.status !== 'active') return;
                if (Number(r.order_id || 0) !== Number(orderId || 0)) return;
                const itemId = Number(r.item_id) || 0;
                const qty = parseFloat(r.qty) || 0;
                if (!itemId || qty <= 0) return;
                reservationMap.set(itemId, (reservationMap.get(itemId) || 0) + qty);
            });
            this._whCurrentOrderReservationMap = reservationMap;
            this._whReservationOrderId = orderId;
        } catch (e) {
            console.error('[Calculator] Failed to load warehouse reservations:', e);
            this._whCurrentOrderReservationMap = new Map();
            this._whReservationOrderId = orderId;
        }
        this._whReservationLoading = false;
        return this._whCurrentOrderReservationMap;
    },

    async _ensureWhPickerData() {
        await this._ensureWhReservationContext();
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

    _getWhPickerItemsFlat() {
        if (!this._whPickerData) return [];
        return Object.values(this._whPickerData).flatMap(group => Array.isArray(group?.items) ? group.items : []);
    },

    _getCurrentOrderReservedQty(itemId) {
        const targetId = Number(itemId) || 0;
        if (!targetId) return 0;
        const activeReserved = this._whCurrentOrderReservationMap
            ? (this._whCurrentOrderReservationMap.get(targetId) || 0)
            : 0;
        if (activeReserved > 0) return activeReserved;
        return this._getCommittedOrderWarehouseDemandQty(targetId);
    },

    _getCurrentWarehouseDraftDemand(itemId, exclude = null) {
        const targetId = Number(itemId) || 0;
        if (!targetId) return 0;

        const shouldSkip = (kind, idx) => exclude && exclude.kind === kind && Number(exclude.idx) === Number(idx);
        const hasExplicitHardwareDemand = (this.hardwareItems || []).some((hw, idx) =>
            !shouldSkip('hardware', idx)
            && hw.source === 'warehouse'
            && Number(hw.warehouse_item_id) === targetId
            && (parseFloat(hw.qty) || 0) > 0
        );
        let demand = 0;

        (this.hardwareItems || []).forEach((hw, idx) => {
            if (shouldSkip('hardware', idx)) return;
            if (hw.source !== 'warehouse') return;
            if (Number(hw.warehouse_item_id) !== targetId) return;
            demand += parseFloat(hw.qty) || 0;
        });

        (this.packagingItems || []).forEach((pkg, idx) => {
            if (shouldSkip('packaging', idx)) return;
            if (pkg.source !== 'warehouse') return;
            if (Number(pkg.warehouse_item_id) !== targetId) return;
            demand += parseFloat(pkg.qty) || 0;
        });

        if (typeof getPendantWarehouseDemandRows === 'function') {
            (this.pendants || []).forEach(pnd => {
                getPendantWarehouseDemandRows(pnd).forEach(row => {
                    if (Number(row.warehouse_item_id) !== targetId) return;
                    demand += parseFloat(row.qty) || 0;
                });
            });
        }

        if (typeof getProductWarehouseDemandRows === 'function') {
            const pickerItems = this._getWhPickerItemsFlat();
            (this.items || []).forEach((item, idx) => {
                if (shouldSkip('product', idx)) return;
                getProductWarehouseDemandRows(item, pickerItems).forEach(row => {
                    if (Number(row.warehouse_item_id) !== targetId) return;
                    if (hasExplicitHardwareDemand) return;
                    demand += parseFloat(row.qty) || 0;
                });
            });
        }

        return demand;
    },

    _getWhEffectiveAvailableQty(itemId, exclude = null) {
        const whItem = this._findWhItem(itemId);
        if (!whItem) return 0;
        const baseAvailable = parseFloat(whItem.available_qty) || 0;
        const ownReserved = this._getCurrentOrderReservedQty(itemId);
        const otherDraftDemand = this._getCurrentWarehouseDraftDemand(itemId, exclude);
        return Math.max(0, baseAvailable + ownReserved - otherDraftDemand);
    },

    _getWhItemForCurrentOrder(itemId, exclude = null) {
        const whItem = this._findWhItem(itemId);
        if (!whItem) return null;
        return {
            ...whItem,
            available_qty: this._getWhEffectiveAvailableQty(itemId, exclude),
        };
    },

    _hydrateWarehouseBackedLineFromCurrentWarehouse(line) {
        if (!line || line.source !== 'warehouse' || !line.warehouse_item_id) return line;
        const whItem = this._findWhItem(line.warehouse_item_id);
        if (!whItem) return line;

        if (!(parseFloat(line.price) > 0)) {
            const warehousePrice = parseFloat(whItem.price_per_unit) || 0;
            if (warehousePrice > 0) {
                line.price = warehousePrice;
            }
        }

        if (!String(line.warehouse_sku || '').trim() && whItem.sku) {
            line.warehouse_sku = whItem.sku;
        }

        if (!String(line.name || '').trim()) {
            const parts = [whItem.name];
            if (whItem.size) parts.push(whItem.size);
            if (whItem.color) parts.push(whItem.color);
            line.name = parts.filter(Boolean).join(' · ');
        }

        return line;
    },

    _getWhPickerDataForCurrentOrder() {
        if (!this._whPickerData) return null;
        const hasActiveReservations = !!(this._whCurrentOrderReservationMap && this._whCurrentOrderReservationMap.size > 0);
        const hasCommittedDemand = !!(
            this._whCommittedOrderDemandMap
            && this._whCommittedOrderDemandMap.size > 0
            && Number(this._whCommittedDemandOrderId || 0) === Number(App.editingOrderId || 0)
        );
        if (!hasActiveReservations && !hasCommittedDemand) return this._whPickerData;

        const grouped = {};
        Object.keys(this._whPickerData).forEach(catKey => {
            const group = this._whPickerData[catKey];
            grouped[catKey] = {
                ...group,
                items: (group.items || []).map(item => ({
                    ...item,
                    available_qty: Math.max(0, (parseFloat(item.available_qty) || 0) + this._getCurrentOrderReservedQty(item.id)),
                })),
            };
        });
        return grouped;
    },

    async _ensureBlanksCatalog(force = false) {
        if (this._blanksCatalogLoaded && !force) return;
        try {
            const [hwBlanks, pkgBlanks] = await Promise.all([
                loadHwBlanks(),
                loadPkgBlanks(),
            ]);
            this._hwBlanksCatalog = Array.isArray(hwBlanks) ? hwBlanks : [];
            this._pkgBlanksCatalog = Array.isArray(pkgBlanks) ? pkgBlanks : [];
            this._blanksCatalogLoaded = true;
        } catch (e) {
            console.error('[Calculator] Failed to load blanks catalog:', e);
            this._hwBlanksCatalog = [];
            this._pkgBlanksCatalog = [];
            this._blanksCatalogLoaded = false;
        }
    },

    _findHwBlankByWarehouseItemId(warehouseItemId) {
        if (!warehouseItemId || !Array.isArray(this._hwBlanksCatalog)) return null;
        const matches = this._hwBlanksCatalog.filter(b => Number(b.warehouse_item_id) === Number(warehouseItemId));
        if (!matches.length) return null;
        matches.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        return matches[0];
    },

    _findPkgBlankByWarehouseItemId(warehouseItemId) {
        if (!warehouseItemId || !Array.isArray(this._pkgBlanksCatalog)) return null;
        const matches = this._pkgBlanksCatalog.filter(b => Number(b.warehouse_item_id) === Number(warehouseItemId));
        if (!matches.length) return null;
        matches.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        return matches[0];
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
        const isCustomChina = isCustom && (hw.custom_country || 'china') === 'china';
        const isCustomRussia = isCustom && (hw.custom_country || 'china') === 'russia';
        const list = document.getElementById(targetListId || 'calc-hardware-list');

        // Build warehouse picker (hardware only — exclude packaging)
        const pickerData = this._getWhPickerDataForCurrentOrder();
        let pickerHtml = '';
        if (pickerData) {
            pickerHtml = Warehouse.buildImagePicker(`hw-picker-${idx}`, pickerData, hw.warehouse_item_id, 'Calculator.onHwWarehouseSelect', 'hardware');
        }

        // Max qty from warehouse, including current order reservation and excluding sibling rows
        const whItem = (isWarehouse && hw.warehouse_item_id)
            ? this._getWhItemForCurrentOrder(hw.warehouse_item_id, { kind: 'hardware', idx })
            : null;
        const maxQty = whItem ? whItem.available_qty : '';
        const maxAttr = whItem ? ` max="${whItem.available_qty}"` : '';

        // Delivery method options for china/custom
        const deliveryOpts = Object.entries(ChinaCatalog.DELIVERY_METHODS || {}).map(([key, m]) => {
            const sel = (hw.china_delivery_method || 'avia') === key ? ' selected' : '';
            return `<option value="${key}"${sel}>${m.label} ($${m.rate_usd}/\u043a\u0433)</option>`;
        }).join('');

        // China pricing info line
        const chinaInfo = (isChina || isCustomChina) && hw.price_cny > 0
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:4px 8px;background:var(--bg);border-radius:4px;">
                \ud83d\udcb0 ${hw.price_cny}\u00a5 = <b>${formatRub(hw.price)}</b>/\u0448\u0442 \u00b7 \ud83d\udce6 \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430: <b>${formatRub(hw.delivery_price)}</b>/\u0448\u0442 (${hw.weight_grams || 0}\u0433)
               </div>` : '';
        const russiaInfo = isCustomRussia
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:4px 8px;background:var(--bg);border-radius:4px;">
                Цена: <b>${formatRub(hw.price || 0)}</b>/шт · Доставка: <b>${formatRub(hw.delivery_total || 0)}</b> всего = <b>${formatRub(hw.delivery_price || 0)}</b>/шт
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
            <div style="display:flex;gap:6px;margin-bottom:8px;">
                <label class="${isCustomChina ? 'src-active' : ''}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:16px;cursor:pointer;">
                    <input type="radio" name="hw-custom-country-${idx}" value="china" ${isCustomChina ? 'checked' : ''} onchange="Calculator.onHwCustomCountryChange(${idx}, 'china')" style="display:none;">
                    🇨🇳 Китай
                </label>
                <label class="${isCustomRussia ? 'src-active' : ''}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:16px;cursor:pointer;">
                    <input type="radio" name="hw-custom-country-${idx}" value="russia" ${isCustomRussia ? 'checked' : ''} onchange="Calculator.onHwCustomCountryChange(${idx}, 'russia')" style="display:none;">
                    🇷🇺 Россия
                </label>
            </div>
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
                ${isCustomChina ? `
                    <div class="form-group" style="margin:0">
                        <label>\u0426\u0435\u043d\u0430 (\u00a5/\u0448\u0442)</label>
                        <input type="number" min="0" step="0.01" value="${hw.price_cny || ''}" oninput="Calculator.onChinaNum('hw', ${idx}, 'price_cny', this.value)">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>\u0412\u0435\u0441 (\u0433)</label>
                        <input type="number" min="0" step="0.1" value="${hw.weight_grams || ''}" oninput="Calculator.onChinaNum('hw', ${idx}, 'weight_grams', this.value)">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 (\u0437\u0430 \u043a\u0433)</label>
                        <select onchange="Calculator.onChinaDeliveryMethod('hw', ${idx}, this.value)">${deliveryOpts}</select>
                    </div>
                ` : `
                    <div class="form-group" style="margin:0">
                        <label>\u0426\u0435\u043d\u0430 (\u20BD/\u0448\u0442)</label>
                        <input type="number" min="0" step="0.01" value="${hw.price || ''}" oninput="Calculator.onHwNum(${idx}, 'price', this.value)">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 (\u20BD, \u043e\u0431\u0449\u0430\u044f)</label>
                        <input type="number" min="0" step="0.01" value="${hw.delivery_total || ''}" oninput="Calculator.onHwNum(${idx}, 'delivery_total', this.value)">
                    </div>
                `}
            </div>
            ${isCustomChina ? chinaInfo : russiaInfo}`;
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
            if (!hw.custom_country) hw.custom_country = 'china';
            if (!hw.china_delivery_method) hw.china_delivery_method = 'avia';
            if (hw.custom_country === 'china') {
                this._recalcChinaPricing(hw);
            } else {
                hw.delivery_price = hw.qty > 0 ? round2(hw.delivery_total / hw.qty) : 0;
            }
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

    onHwCustomCountryChange(idx, country) {
        const hw = this.hardwareItems[idx];
        if (!hw || hw.source !== 'custom') return;
        hw.custom_country = country;
        hw.china_item_id = null;
        if (country === 'china') {
            this._recalcChinaPricing(hw);
        } else {
            hw.price_cny = 0;
            hw.weight_grams = 0;
            hw.delivery_price = hw.qty > 0 ? round2((hw.delivery_total || 0) / hw.qty) : 0;
        }
        this._rerenderHwItem(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    async onHwWarehouseSelect(idx, itemIdStr) {
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

        const whItem = this._getWhItemForCurrentOrder(itemId, { kind: 'hardware', idx });
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

        // Apply blanks defaults (assembly timing + fixed sell price) by linked warehouse item.
        await this._ensureBlanksCatalog(true);
        const linkedBlank = this._findHwBlankByWarehouseItemId(whItem.id);
        if (linkedBlank) {
            const speed = parseFloat(linkedBlank.assembly_speed) || 0;
            if (speed > 0) {
                hw.assembly_speed = round2(speed);
                hw.assembly_minutes = round2(speed / 60);
            }
            const fixedSellPrice = parseFloat(linkedBlank.sell_price) || 0;
            if (fixedSellPrice > 0) {
                hw.sell_price = fixedSellPrice;
            }
        }

        this._rerenderHwItem(idx);
        this.recalculate();
        this.scheduleAutosave();
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
            const whItem = this._getWhItemForCurrentOrder(hw.warehouse_item_id, { kind: 'hardware', idx });
            if (whItem && hw.qty > whItem.available_qty) {
                hw.qty = whItem.available_qty;
                App.toast(`Максимум на складе: ${whItem.available_qty} ${whItem.unit}. Остальное — из Китая.`);
            }
        }
        // For china/custom(china) sources, recalc from CNY pricing
        if (hw.source === 'china' || (hw.source === 'custom' && (hw.custom_country || 'china') === 'china')) {
            this._recalcChinaPricing(hw);
        } else {
            // Auto-calculate per-unit delivery from total (warehouse/custom-russia)
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
        const chinaMode = item.source === 'china' || (item.source === 'custom' && (item.custom_country || 'china') === 'china');
        if (!chinaMode) return;
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
            custom_country: 'china',    // for source='custom': 'china' | 'russia'
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
        const isCustomChina = isCustom && (pkg.custom_country || 'china') === 'china';
        const isCustomRussia = isCustom && (pkg.custom_country || 'china') === 'russia';
        const list = document.getElementById(targetListId || 'calc-packaging-list');

        const pickerData = this._getWhPickerDataForCurrentOrder();
        let pickerHtml = '';
        if (pickerData) {
            pickerHtml = Warehouse.buildImagePicker(`pkg-picker-${idx}`, pickerData, pkg.warehouse_item_id, 'Calculator.onPkgWarehouseSelect', 'packaging');
        }

        const whItem = (isWarehouse && pkg.warehouse_item_id)
            ? this._getWhItemForCurrentOrder(pkg.warehouse_item_id, { kind: 'packaging', idx })
            : null;
        const maxQty = whItem ? whItem.available_qty : '';
        const maxAttr = whItem ? ` max="${whItem.available_qty}"` : '';

        const deliveryOpts = Object.entries(ChinaCatalog.DELIVERY_METHODS || {}).map(([key, m]) => {
            const sel = (pkg.china_delivery_method || 'avia') === key ? ' selected' : '';
            return `<option value="${key}"${sel}>${m.label} ($${m.rate_usd}/\u043a\u0433)</option>`;
        }).join('');

        const chinaInfo = (isChina || isCustomChina) && pkg.price_cny > 0
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:4px 8px;background:var(--bg);border-radius:4px;">
                \ud83d\udcb0 ${pkg.price_cny}\u00a5 = <b>${formatRub(pkg.price)}</b>/\u0448\u0442 \u00b7 \ud83d\udce6 \u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430: <b>${formatRub(pkg.delivery_price)}</b>/\u0448\u0442 (${pkg.weight_grams || 0}\u0433)
               </div>` : '';
        const russiaInfo = isCustomRussia
            ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;padding:4px 8px;background:var(--bg);border-radius:4px;">
                Цена: <b>${formatRub(pkg.price || 0)}</b>/шт · Доставка: <b>${formatRub(pkg.delivery_total || 0)}</b> всего = <b>${formatRub(pkg.delivery_price || 0)}</b>/шт
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
            <div style="display:flex;gap:6px;margin-bottom:8px;">
                <label class="${isCustomChina ? 'src-active' : ''}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:16px;cursor:pointer;">
                    <input type="radio" name="pkg-custom-country-${idx}" value="china" ${isCustomChina ? 'checked' : ''} onchange="Calculator.onPkgCustomCountryChange(${idx}, 'china')" style="display:none;">
                    🇨🇳 Китай
                </label>
                <label class="${isCustomRussia ? 'src-active' : ''}" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border);border-radius:16px;cursor:pointer;">
                    <input type="radio" name="pkg-custom-country-${idx}" value="russia" ${isCustomRussia ? 'checked' : ''} onchange="Calculator.onPkgCustomCountryChange(${idx}, 'russia')" style="display:none;">
                    🇷🇺 Россия
                </label>
            </div>
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
                ${isCustomChina ? `
                    <div class="form-group" style="margin:0">
                        <label>\u0426\u0435\u043d\u0430 (\u00a5/\u0448\u0442)</label>
                        <input type="number" min="0" step="0.01" value="${pkg.price_cny || ''}" oninput="Calculator.onChinaNum('pkg', ${idx}, 'price_cny', this.value)">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>\u0412\u0435\u0441 (\u0433)</label>
                        <input type="number" min="0" step="0.1" value="${pkg.weight_grams || ''}" oninput="Calculator.onChinaNum('pkg', ${idx}, 'weight_grams', this.value)">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 (\u0437\u0430 \u043a\u0433)</label>
                        <select onchange="Calculator.onChinaDeliveryMethod('pkg', ${idx}, this.value)">${deliveryOpts}</select>
                    </div>
                ` : `
                    <div class="form-group" style="margin:0">
                        <label>\u0426\u0435\u043d\u0430 (\u20BD/\u0448\u0442)</label>
                        <input type="number" min="0" step="0.01" value="${pkg.price || ''}" oninput="Calculator.onPkgNum(${idx}, 'price', this.value)">
                    </div>
                    <div class="form-group" style="margin:0">
                        <label>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430 (\u20BD, \u043e\u0431\u0449\u0430\u044f)</label>
                        <input type="number" min="0" step="0.01" value="${pkg.delivery_total || ''}" oninput="Calculator.onPkgNum(${idx}, 'delivery_total', this.value)">
                    </div>
                `}
            </div>
            ${isCustomChina ? chinaInfo : russiaInfo}`;
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
            if (!pkg.custom_country) pkg.custom_country = 'china';
            if (!pkg.china_delivery_method) pkg.china_delivery_method = 'avia';
            if ((pkg.custom_country || 'china') === 'china') {
                this._recalcChinaPricing(pkg);
            } else {
                pkg.delivery_price = pkg.qty > 0 ? round2(pkg.delivery_total / pkg.qty) : 0;
            }
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

    onPkgCustomCountryChange(idx, country) {
        const pkg = this.packagingItems[idx];
        if (!pkg || pkg.source !== 'custom') return;
        pkg.custom_country = country;
        pkg.china_item_id = null;
        if (country === 'china') {
            this._recalcChinaPricing(pkg);
        } else {
            pkg.price_cny = 0;
            pkg.weight_grams = 0;
            pkg.delivery_price = pkg.qty > 0 ? round2((pkg.delivery_total || 0) / pkg.qty) : 0;
        }
        this._rerenderPkgItem(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    async onPkgWarehouseSelect(idx, itemIdStr) {
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
        const whItem = this._getWhItemForCurrentOrder(itemId, { kind: 'packaging', idx });
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

        // Optional link: if packaging blank is linked to this warehouse position, apply fixed sell price.
        await this._ensureBlanksCatalog(true);
        const linkedBlank = this._findPkgBlankByWarehouseItemId(whItem.id);
        if (linkedBlank) {
            const speed = parseFloat(linkedBlank.assembly_speed) || 0;
            if (speed > 0) {
                pkg.assembly_speed = round2(speed);
                pkg.assembly_minutes = round2(speed / 60);
            }
            const fixedSellPrice = parseFloat(linkedBlank.sell_price) || 0;
            if (fixedSellPrice > 0) {
                pkg.sell_price = fixedSellPrice;
            }
        }

        this._rerenderPkgItem(idx);
        this.recalculate();
        this.scheduleAutosave();
    },

    onPkgField(idx, field, value) {
        this.packagingItems[idx][field] = value;
        this.scheduleAutosave();
    },

    onPkgNum(idx, field, value) {
        this.packagingItems[idx][field] = parseFloat(value) || 0;
        const pkg = this.packagingItems[idx];
        if (field === 'qty' && pkg.source === 'warehouse' && pkg.warehouse_item_id) {
            const whItem = this._getWhItemForCurrentOrder(pkg.warehouse_item_id, { kind: 'packaging', idx });
            if (whItem && pkg.qty > whItem.available_qty) {
                pkg.qty = whItem.available_qty;
                App.toast(`Максимум на складе: ${whItem.available_qty} ${whItem.unit}. Остальное — из Китая.`);
            }
        }
        if (pkg.source === 'china' || (pkg.source === 'custom' && (pkg.custom_country || 'china') === 'china')) {
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
    // EXTRA INCOME (Доп. доходы)
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
                    <input type="text" value="${this._esc(ec.name)}" placeholder="Доп. доход"
                        oninput="Calculator.onExtraCostChange(${i}, 'name', this.value)">
                </div>
                <div class="form-group" style="margin:0;flex:1">
                    <label>Сумма дохода (₽)</label>
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
            hw.custom_country = 'russia';
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
        if (isBlank) {
            // For blank molds these options are not used.
            this.items[idx].extra_molds = 0;
            this.items[idx].base_mold_in_stock = false;
            this.items[idx].complex_design = false;
            this.items[idx].is_nfc = false;
            this.items[idx].nfc_programming = false;
        }
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
        this.renderItemBlock(idx);
        this.recalculate();
        this.scheduleAutosave();
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
        if (field === 'base_mold_in_stock') {
            this.renderItemBlock(idx);
        }
        this.recalculate();
        this.scheduleAutosave();
    },

    onColorAttachmentChange(idx, input) {
        const file = input?.files?.[0];
        if (!file) return;
        const maxBytes = 3 * 1024 * 1024; // 3 MB
        if (file.size > maxBytes) {
            App.toast('Файл слишком большой. Максимум 3 МБ');
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            this.items[idx].color_solution_attachment = {
                name: file.name || 'file',
                type: file.type || '',
                size: file.size || 0,
                data_url: e.target?.result || '',
            };
            this.renderItemBlock(idx);
            this.scheduleAutosave();
        };
        reader.onerror = () => App.toast('Не удалось прочитать файл');
        reader.readAsDataURL(file);
    },

    removeColorAttachment(idx) {
        this.items[idx].color_solution_attachment = null;
        this.renderItemBlock(idx);
        this.scheduleAutosave();
    },

    openColorAttachment(idx) {
        const att = this.items[idx]?.color_solution_attachment;
        if (!att?.data_url) return;
        const win = window.open(att.data_url, '_blank');
        if (!win) {
            App.toast('Браузер заблокировал открытие файла');
        }
    },

    toggleItemCollapse(idx) {
        const block = document.getElementById('item-block-' + idx);
        if (!block) return;
        const isNowCollapsed = !block.classList.contains('is-collapsed');
        block.classList.toggle('is-collapsed', isNowCollapsed);
        const btn = block.querySelector('.item-collapse-btn');
        if (btn) btn.textContent = isNowCollapsed ? '▼ Показать' : '▲ Свернуть';
    },

    _updateItemsEmptyState() {
        const emptyEl = document.getElementById('calc-items-empty');
        const addRowEl = document.getElementById('calc-items-add-row');
        const hasItems = this.items.length > 0 || (this.pendants && this.pendants.length > 0);
        if (emptyEl) emptyEl.style.display = hasItems ? 'none' : '';
        if (addRowEl) addRowEl.style.display = hasItems ? '' : 'none';
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
        this._updateItemsEmptyState();
    },

    cloneItem(idx) {
        const source = this.items[idx];
        if (!source) return;

        const cloned = JSON.parse(JSON.stringify(source));
        cloned.result = null;
        cloned.totalCostWithHwPkg = 0;
        cloned.target_price_item = 0;

        // Insert cloned item right after source
        this.items.splice(idx + 1, 0, cloned);
        this.items.forEach((item, i) => item.item_number = i + 1);

        // Shift per-item bindings for existing rows after insertion point
        this.hardwareItems.forEach(hw => {
            if (hw.parent_item_index !== null && hw.parent_item_index > idx) hw.parent_item_index++;
        });
        this.packagingItems.forEach(pkg => {
            if (pkg.parent_item_index !== null && pkg.parent_item_index > idx) pkg.parent_item_index++;
        });

        // Clone per-item hardware/packaging attached to source item
        const hwClones = this.hardwareItems
            .filter(hw => hw.parent_item_index === idx)
            .map(hw => {
                const copy = JSON.parse(JSON.stringify(hw));
                copy.parent_item_index = idx + 1;
                copy.result = null;
                return copy;
            });
        const pkgClones = this.packagingItems
            .filter(pkg => pkg.parent_item_index === idx)
            .map(pkg => {
                const copy = JSON.parse(JSON.stringify(pkg));
                copy.parent_item_index = idx + 1;
                copy.result = null;
                return copy;
            });
        this.hardwareItems.push(...hwClones);
        this.packagingItems.push(...pkgClones);

        const container = document.getElementById('calc-items-container');
        container.innerHTML = '';
        this.items.forEach((_, i) => this.renderItemBlock(i));
        this.rerenderAllHardware();
        this.rerenderAllPackaging();
        this.recalculate();
        this._updateItemsEmptyState();
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
            this._hydrateWarehouseBackedLineFromCurrentWarehouse(hw);
            hw.result = calculateHardwareCost(hw, params);
        });
        this.packagingItems.forEach(pkg => {
            this._hydrateWarehouseBackedLineFromCurrentWarehouse(pkg);
            pkg.result = calculatePackagingCost(pkg, params);
        });

        // === Calculate product items ===
        this.items.forEach((item, idx) => {
            if (item.is_blank_mold) {
                item.extra_molds = 0;
                item.base_mold_in_stock = false;
                item.complex_design = false;
                item.is_nfc = false;
                item.nfc_programming = false;
            }
            const result = calculateItemCost(item, params);
            item.result = result;

            const hasResult = isFinite(result.costTotal) && result.costTotal > 0;
            if (hasResult) hasData = true;

            const costEl = document.getElementById('item-cost-' + idx);
            if (costEl) costEl.style.display = hasResult ? '' : 'none';

            if (hasResult) {
                this._setCostValueAndVisibility('c-' + idx + '-fot', result.costFot);
                this._setCostValueAndVisibility('c-' + idx + '-indirect', result.costIndirect);
                this._setCostValueAndVisibility('c-' + idx + '-plastic', result.costPlastic);
                this._setCostValueAndVisibility('c-' + idx + '-mold', result.costMoldAmortization);
                this._setCostValueAndVisibility('c-' + idx + '-design', result.costDesign);
                this._setCostValueAndVisibility('c-' + idx + '-cutting', result.costCutting);
                this._setCostValueAndVisibility('c-' + idx + '-cutting-ind', result.costCuttingIndirect);
                this._setCostValueAndVisibility('c-' + idx + '-nfc-tag', result.costNfcTag);
                this._setCostValueAndVisibility('c-' + idx + '-nfc-prog', result.costNfcProgramming);
                this._setCostValueAndVisibility('c-' + idx + '-nfc-ind', result.costNfcIndirect);
                this._setCostValueAndVisibility('c-' + idx + '-builtin-hw', result.costBuiltinHw || 0);
                this._setCostValueAndVisibility('c-' + idx + '-builtin-hw-ind', result.costBuiltinHwIndirect || 0);
                this._setCostValueAndVisibility('c-' + idx + '-printing', result.costPrinting);
                this._setCostValueAndVisibility('c-' + idx + '-delivery', result.costDelivery);

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

                // Store target at 40% for reference (item itself, without per-item hw/pkg)
                const costItemOnly = round2(result.costTotal - (result.costPrinting || 0));
                const calcTarget = (marginPct) => {
                    if (costItemOnly === 0) return 0;
                    const keepRate = 1 - (params.taxRate || 0.06) - (Number.isFinite(params?.charityRate) ? params.charityRate : 0.01) - 0.065 - marginPct;
                    if (keepRate <= 0) return 0;
                    return round2(costItemOnly / keepRate);
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
                this._setCostValueAndVisibility('hw-' + idx + '-fot', result.fotPerUnit);
                this._setCostValueAndVisibility('hw-' + idx + '-indirect', result.indirectPerUnit || 0);
                this._setCostValueAndVisibility('hw-' + idx + '-purchase', hw.price || 0);
                this._setCostValueAndVisibility('hw-' + idx + '-delivery', hw.delivery_price || 0);
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
                this._setCostValueAndVisibility('pkg-' + idx + '-fot', result.fotPerUnit);
                this._setCostValueAndVisibility('pkg-' + idx + '-indirect', result.indirectPerUnit || 0);
                this._setCostValueAndVisibility('pkg-' + idx + '-purchase', pkg.price || 0);
                this._setCostValueAndVisibility('pkg-' + idx + '-delivery', pkg.delivery_price || 0);
                this.setText('pkg-' + idx + '-total', formatRub(result.costPerUnit));
            } else {
                if (pkgCostEl) pkgCostEl.style.display = 'none';
            }
        });

        // Calculate pendants
        this.pendants.forEach(pnd => {
            pnd.result = calculatePendantCost(pnd, params);
            if (pnd.result && pnd.result.totalRevenue > 0) hasData = true;
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
            const orderAdjustments = this.getOrderAdjustments();

            const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, params, this.pendants);
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
            const fin = calculateFinDirectorData(this.items, this.hardwareItems, this.packagingItems, params, this.pendants, orderAdjustments);
            const finSalaryRow = document.getElementById('fin-salary')?.closest('.cost-row');
            const finDiscountRow = document.getElementById('fin-discount-row');
            if (App.isAdmin()) {
                this.setText('fin-salary', formatRub(fin.salary));
                if (finSalaryRow) finSalaryRow.style.display = '';
            } else {
                if (finSalaryRow) finSalaryRow.style.display = 'none';
            }
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
            this.setText('fin-discount', '−' + formatRub(fin.discountAmount || 0));
            if (finDiscountRow) finDiscountRow.style.display = (fin.discountAmount || 0) > 0 ? '' : 'none';

            // Summary footer
            const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems, this.extraCosts, params, this.pendants, orderAdjustments);
            this.setText('sum-revenue', formatRub(summary.totalRevenue));
            this.setText('sum-earned', formatRub(summary.totalEarned));
            this.setText('sum-margin', formatPercent(summary.marginPercent));
            this.setText('sum-hours', formatHours(load.totalHours));
            this._syncDiscountUi(summary);

            // Re-render pendant cards with updated results
            if (typeof Pendant !== 'undefined') {
                Pendant.renderAllCards();
            }
        } else {
            loadEl.style.display = 'none';
            finEl.style.display = 'none';
            sumEl.style.display = 'none';
            this._syncDiscountUi();
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

    _setCostValueAndVisibility(id, value, alwaysShow = false) {
        const el = document.getElementById(id);
        if (!el) return;
        const num = parseFloat(value) || 0;
        el.textContent = formatRub(num);
        const row = el.parentElement;
        if (row && !alwaysShow) {
            row.style.display = Math.abs(num) > 0.0001 ? '' : 'none';
        } else if (row) {
            row.style.display = '';
        }
    },

    /**
     * Blank base cost per unit (without printing and client delivery),
     * aligned with "Бланки" calculation logic.
     */
    _calcBlankBaseCostFromTemplate(item, qty, params) {
        if (!item || !item.template_id || !qty || qty <= 0) return 0;
        const tpl = (App.templates || []).find(t => t.id == item.template_id);
        if (!tpl) return 0;

        const pph = Number(tpl.pieces_per_hour_avg || tpl.pieces_per_hour_min || item.pieces_per_hour || 0);
        const weight = Number(tpl.weight_grams || item.weight_grams || 0);
        if (!pph || pph <= 0) return 0;

        const baseQtyForCost = 50;
        const calcItem = {
            quantity: baseQtyForCost,
            pieces_per_hour: pph,
            weight_grams: weight,
            extra_molds: 0,
            complex_design: false,
            is_blank_mold: false,
            is_nfc: false,
            nfc_programming: false,
            delivery_included: false,
            printings: [],
            builtin_hw_name: '',
            builtin_hw_price: 0,
            builtin_hw_delivery_total: 0,
            builtin_hw_speed: 0,
        };

        const base = calculateItemCost(calcItem, params);
        const moldCount = Number(tpl.mold_count || 1);
        const singleMoldCost = Number(tpl.cost_cny || 800) * Number(tpl.cny_rate || 12.5) + Number(tpl.delivery_cost || 8000);
        const moldAmortPerUnit = (singleMoldCost * moldCount) / 4500;

        let adjusted = Number(base.costTotal || 0) - Number(base.costMoldAmortization || 0) + moldAmortPerUnit;

        if (tpl.hw_name && (Number(tpl.hw_price_per_unit || 0) > 0 || Number(tpl.hw_speed || 0) > 0)) {
            let hwCost = Number(tpl.hw_price_per_unit || 0) + (Number(tpl.hw_delivery_total || 0) > 0 ? Number(tpl.hw_delivery_total || 0) / baseQtyForCost : 0);
            const hwSpeed = Number(tpl.hw_speed || 0);
            if (hwSpeed > 0) {
                const hwHours = baseQtyForCost / hwSpeed * (params.wasteFactor || 1.1);
                hwCost += hwHours * params.fotPerHour / baseQtyForCost;
                if (params.indirectCostMode === 'all') {
                    hwCost += params.indirectPerHour * hwHours / baseQtyForCost;
                }
            }
            adjusted += hwCost;
        }

        return round2(Math.max(0, adjusted));
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

        // Collect all billable entities (with NaN/Infinity guard).
        // Zero-cost hardware/packaging still needs a pricing row so managers can set a sell price.
        const pricedItems = this.items.filter(it => it.result && isFinite(it.result.costTotal) && it.result.costTotal > 0);
        const pricingHw = this.hardwareItems.filter(hw => this._isPricingLineVisible(hw));
        const pricingPkg = this.packagingItems.filter(pkg => this._isPricingLineVisible(pkg));

        // Debug: log what's being filtered
        console.log('[renderPricingCard]', {
            items: this.items.length, pricedItems: pricedItems.length,
            hw: this.hardwareItems.length, pricingHw: pricingHw.length,
            pkg: this.packagingItems.length, pricingPkg: pricingPkg.length,
            itemCosts: this.items.map(i => i.result ? i.result.costTotal : 'no result'),
        });

        const pricedPendants = this.pendants.filter(pnd => pnd.result && pnd.result.sellPerUnit > 0);

        if (pricedItems.length === 0 && pricingHw.length === 0 && pricingPkg.length === 0 && pricedPendants.length === 0) {
            pricingEl.style.display = 'none';
            return;
        }
        pricingEl.style.display = '';

        const calcTarget = (cost, marginPct) => {
            if (cost === 0) return 0;
            const keepRate = 1
                - (Number.isFinite(params?.vatRate) ? params.vatRate : 0.05)
                - (params.taxRate || 0.06)
                - (Number.isFinite(params?.charityRate) ? params.charityRate : 0.01)
                - 0.065
                - marginPct;
            if (keepRate <= 0) return 0;
            return round2(cost / keepRate);
        };

        const roundTo5Safe = (value) => {
            if (!Number.isFinite(value) || value <= 0) return 0;
            if (typeof roundTo5 === 'function') return roundTo5(value);
            return Math.round(value / 5) * 5;
        };

        const getBlankTierMarginLocal = (qty) => {
            const normalizedQty = Number(qty) || 0;
            if (normalizedQty <= 10) return 0.65;
            if (normalizedQty <= 50) return 0.60;
            if (normalizedQty <= 100) return 0.55;
            if (normalizedQty <= 300) return 0.50;
            if (normalizedQty <= 500) return 0.45;
            if (normalizedQty <= 1000) return 0.40;
            return 0.35;
        };

        const getBlankCatalogPricing = (cost, qty, tpl) => {
            if (!Number.isFinite(cost) || cost <= 0) {
                return { price: 0, note: 'прайс бланков', source: 'empty' };
            }
            const customPrice = Number(tpl?.custom_prices?.[qty]);
            if (Number.isFinite(customPrice) && customPrice > 0) {
                return { price: customPrice, note: 'вручную в бланке', source: 'custom_price' };
            }

            const customMarginRaw = tpl?.custom_margins?.[qty];
            const hasCustomMargin = customMarginRaw !== null && customMarginRaw !== undefined && customMarginRaw !== '';
            const margin = hasCustomMargin ? Number(customMarginRaw) : getBlankTierMarginLocal(qty);
            if (!Number.isFinite(margin)) {
                return { price: 0, note: 'прайс бланков', source: 'empty' };
            }

            const taxRate = Number.isFinite(params?.taxRate) ? params.taxRate : 0.06;
            const vatRate = Number.isFinite(params?.vatRate) ? params.vatRate : 0.05;
            const charityRate = Number.isFinite(params?.charityRate) ? params.charityRate : 0.01;
            const commercialRate = 0.065;
            const keepRate = 1 - vatRate - taxRate - charityRate - commercialRate - margin;
            if (keepRate <= 0) {
                return { price: 0, note: 'прайс бланков', source: 'empty' };
            }
            return {
                price: roundTo5Safe(round2(cost / keepRate)),
                note: hasCustomMargin ? `маржа ${Math.round(margin * 100)}% в бланке` : 'тиражный прайс бланков',
                source: hasCustomMargin ? 'custom_margin' : 'tier',
            };
        };

        // Build columns: item, printing (per item), hw, pkg
        const columns = [];

        pricedItems.forEach((item, i) => {
            const globalIdx = this.items.indexOf(item);
            // Item cost WITHOUT printing and WITHOUT per-item hw/pkg
            const costPrintingPart = item.result.costPrinting || 0;
            const costItemOnlyRaw = round2(item.result.costTotal - costPrintingPart);
            // For blanks, use base себестоимость from the same model as "Бланки" page.
            const blankBaseCost = item.is_blank_mold
                ? this._calcBlankBaseCostFromTemplate(item, item.quantity || 0, params)
                : 0;
            const costItemOnly = item.is_blank_mold ? (blankBaseCost || costItemOnlyRaw) : costItemOnlyRaw;
            const costItemOnlySafe = Math.max(0, costItemOnly);

            if (item.is_blank_mold) {
                // Blank mold: show recommended price from blanks table
                const tpl = App.templates.find(t => t.id == item.template_id);
                const blankPricing = getBlankCatalogPricing(costItemOnlySafe, item.quantity || 0, tpl);
                // Do NOT auto-fill sell_price_item — manager enters manually
                columns.push({
                    label: (item.product_name || 'Изделие ' + (i + 1)) + ` (${App.getItemOriginLabel(item)})`,
                    type: 'item',
                    globalIdx,
                    isBlank: true,
                    cost: costItemOnlySafe,
                    blankPrice: blankPricing.price,
                    blankPriceNote: blankPricing.note,
                    sellPrice: item.sell_price_item || 0,
                });
            } else {
                // Custom mold: show margin targets
                columns.push({
                    label: (item.product_name || 'Изделие ' + (i + 1)) + ` (${App.getItemOriginLabel(item)})`,
                    type: 'item',
                    globalIdx,
                    isBlank: false,
                    cost: costItemOnlySafe,
                    t50: calcTarget(costItemOnlySafe, 0.50),
                    t40: calcTarget(costItemOnlySafe, 0.40),
                    t30: calcTarget(costItemOnlySafe, 0.30),
                    t20: calcTarget(costItemOnlySafe, 0.20),
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

        pricingHw.forEach((hw, i) => {
            const cost = hw.result.costPerUnit;
            const globalIdx = this.hardwareItems.indexOf(hw);
            const parentIdx = hw.parent_item_index;
            const parentName = (parentIdx !== null && parentIdx !== undefined)
                ? (this.items[parentIdx]?.product_name || ('Изделие ' + (parentIdx + 1)))
                : '';
            columns.push({
                label: (parentName ? `↳ 🔩 ${parentName}` : '🔩 Общая фурнитура') + ' · ' + (hw.name || ('Фурнитура ' + (i + 1))),
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

        pricingPkg.forEach((pkg, i) => {
            const cost = pkg.result.costPerUnit;
            const globalIdx = this.packagingItems.indexOf(pkg);
            const parentIdx = pkg.parent_item_index;
            const parentName = (parentIdx !== null && parentIdx !== undefined)
                ? (this.items[parentIdx]?.product_name || ('Изделие ' + (parentIdx + 1)))
                : '';
            columns.push({
                label: (parentName ? `↳ 📦 ${parentName}` : '📦 Общая упаковка') + ' · ' + (pkg.name || ('Упаковка ' + (i + 1))),
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

        // Pendant columns (read-only — edit inside wizard)
        pricedPendants.forEach((pnd, i) => {
            const r = pnd.result;
            columns.push({
                label: `🔤 Подвес "${App.escHtml(pnd.name || '...')}"`,
                type: 'pendant',
                globalIdx: i,
                isBlank: false,
                isPendant: true,
                cost: r.costPerUnit,
                sellPrice: r.sellPerUnit,
                t50: 0, t40: 0, t30: 0, t20: 0,
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
        const hasCustom = columns.some(c => !c.isBlank && !c.isPendant);
        const hasBlank = columns.some(c => c.isBlank);
        const hasPendant = columns.some(c => c.isPendant);

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
                    if (col.isPendant) {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--text-muted);">—</div>`;
                    } else if (col.isBlank) {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--text-muted);">—</div>`;
                    } else {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;${t.style}">${formatRub(col[t.key])}</div>`;
                    }
                });
            });

            if (hasBlank || hasPendant) {
                html += `<div style="padding:4px 8px;border-right:1px solid var(--border);${cellBorder}font-size:11px;color:var(--green);font-weight:700;">Рекоменд. цена<span style="font-size:9px;font-weight:400;color:var(--text-muted)"> бланки / подвесы</span></div>`;
                columns.forEach(col => {
                    if (col.isPendant) {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--green);font-weight:700;">${formatRub(col.sellPrice)}<div style="font-size:9px;font-weight:400;color:var(--text-muted)">из подвеса</div></div>`;
                    } else if (col.isBlank) {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--green);font-weight:700;">${formatRub(col.blankPrice)}<div style="font-size:9px;font-weight:400;color:var(--text-muted)">${App.escHtml(col.blankPriceNote || 'прайс бланков')}</div></div>`;
                    } else {
                        html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--text-muted);">—</div>`;
                    }
                });
            }
        } else {
            // All blanks — show just the fixed price row
            html += `<div style="padding:4px 8px;border-right:1px solid var(--border);${cellBorder}font-size:11px;color:var(--green);font-weight:700;">Прайс бланков</div>`;
            columns.forEach(col => {
                if (col.isPendant) {
                    html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--green);font-weight:700;">${formatRub(col.sellPrice)}<div style="font-size:9px;font-weight:400;color:var(--text-muted)">из подвеса</div></div>`;
                } else if (col.isBlank) {
                    html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;color:var(--green);font-weight:700;">${formatRub(col.blankPrice)}<div style="font-size:9px;font-weight:400;color:var(--text-muted)">${App.escHtml(col.blankPriceNote || 'прайс бланков')}</div></div>`;
                } else {
                    html += `<div style="padding:4px 8px;text-align:center;${cellBorder}font-size:11px;">${formatRub(col.t40 || 0)}</div>`;
                }
            });
        }

        // Sell price row (editable, no spinners; pendants are read-only)
        html += `<div style="${leftCell}font-weight:600;background:var(--green-light);">Цена продажи</div>`;
        columns.forEach((col, ci) => {
            if (col.isPendant) {
                // Pendant: read-only, edit inside wizard
                html += `<div style="padding:6px 8px;text-align:center;${cellBorder}background:var(--green-light);font-weight:600;font-size:13px;">${formatRub(col.sellPrice)}</div>`;
            } else {
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
            }
        });

        // Margin row (% only)
        html += `<div style="padding:6px 8px;border-right:1px solid var(--border);font-weight:600;">Чистая маржа<div style="font-size:9px;color:var(--text-muted);font-weight:400;">после ОСН и коммерч.</div></div>`;
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
            } else if (col.cost > 0) {
                marginHtml = '<span style="color:var(--red);font-weight:700;">В минусе</span>';
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
                    name: (item.product_name || 'Изделие ' + (i + 1)) + ` (${App.getItemOriginLabel(item)})`,
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

        // Hardware rows (both per-item and order-level)
        this.hardwareItems.forEach((hw, i) => {
            if (hw.qty > 0 && hw.sell_price > 0) {
                const parentName = (hw.parent_item_index !== null && hw.parent_item_index !== undefined)
                    ? (this.items[hw.parent_item_index]?.product_name || ('Изделие ' + (hw.parent_item_index + 1)))
                    : '';
                invoiceRows.push({
                    name: (parentName ? `Фурнитура (${parentName})` : 'Общая фурнитура') + ' · ' + (hw.name || ('Фурнитура ' + (i + 1))),
                    qty: hw.qty,
                    price: hw.sell_price,
                    total: round2(hw.sell_price * hw.qty),
                    type: 'hw',
                });
            }
        });

        // Packaging rows (both per-item and order-level)
        this.packagingItems.forEach((pkg, i) => {
            if (pkg.qty > 0 && pkg.sell_price > 0) {
                const parentName = (pkg.parent_item_index !== null && pkg.parent_item_index !== undefined)
                    ? (this.items[pkg.parent_item_index]?.product_name || ('Изделие ' + (pkg.parent_item_index + 1)))
                    : '';
                invoiceRows.push({
                    name: (parentName ? `Упаковка (${parentName})` : 'Общая упаковка') + ' · ' + (pkg.name || ('Упаковка ' + (i + 1))),
                    qty: pkg.qty,
                    price: pkg.sell_price,
                    total: round2(pkg.sell_price * pkg.qty),
                    type: 'pkg',
                });
            }
        });

        // Pendant rows (one line per pendant)
        this.pendants.forEach((pnd) => {
            if (pnd.result && pnd.quantity > 0 && pnd.result.sellPerUnit > 0) {
                invoiceRows.push({
                    name: `🔤 Подвес "${pnd.name || '...'}"`,
                    qty: pnd.quantity,
                    price: pnd.result.sellPerUnit,
                    total: pnd.result.totalRevenue,
                    type: 'pendant',
                });
            }
        });

        // Extra costs
        (this.extraCosts || []).forEach(ec => {
            if (ec.amount > 0) {
                invoiceRows.push({
                    name: ec.name || 'Доп. доход',
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
            const discount = calculateOrderDiscount(subtotal, this.getOrderAdjustments(), params);
            const discountedSubtotal = round2(discount.revenueAfterDiscount);
            const vat = round2(discountedSubtotal * 0.05);
            const grandTotal = round2(discountedSubtotal + vat);
            const discountLabel = discount.percent > 0
                ? `Скидка ${formatPercent(discount.percent)}`
                : 'Скидка';

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
                        ${discount.amount > 0 ? `
                        <tr>
                            <td colspan="3" style="text-align:right;padding:4px 8px;color:var(--text-secondary);font-size:11px;">${discountLabel}</td>
                            <td style="text-align:right;padding:4px 12px;font-size:11px;color:var(--red);">−${formatRub(discount.amount)}</td>
                        </tr>
                        <tr>
                            <td colspan="3" style="text-align:right;padding:4px 8px;color:var(--text-secondary);font-size:11px;">Итого после скидки</td>
                            <td style="text-align:right;padding:4px 12px;font-size:11px;font-weight:600;">${formatRub(discountedSubtotal)}</td>
                        </tr>` : ''}
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

        contentEl.innerHTML = `<div class="pricing-grid-scroll">${pricingHtml}</div>` + invoiceHtml;
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

    _isPricingLineVisible(entry) {
        if (!entry) return false;
        const qty = parseFloat(entry.qty) || 0;
        if (!(qty > 0)) return false;
        const hasIdentity = !!(entry.name || entry.warehouse_item_id || entry.china_item_id);
        if (!hasIdentity) return false;
        const cost = Number(entry.result?.costPerUnit);
        return Number.isFinite(cost) && cost >= 0;
    },

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
        this._autosaveTimer = setTimeout(() => {
            this._doAutosave().catch(e => console.error('[autosave] timer error:', e));
        }, 1500);
        const statusEl = document.getElementById('calc-autosave-status');
        if (statusEl) statusEl.textContent = 'Есть несохраненные изменения';
    },

    async _doAutosave() {
        if (this._autosaving) return;
        // Don't autosave if the draft is completely empty.
        const hasAnyData = this.items.some(i => i.product_name || i.quantity > 0 || i.template_id)
            || this.hardwareItems.some(hw => hw._from_template || hw.name || hw.warehouse_item_id || hw.china_item_id || (parseFloat(hw.qty) || 0) > 0)
            || this.packagingItems.some(pkg => pkg.name || pkg.warehouse_item_id || pkg.china_item_id || (parseFloat(pkg.qty) || 0) > 0)
            || this.pendants.some(pnd => pnd.name || pnd.template_id || (parseFloat(pnd.quantity) || 0) > 0)
            || (this.extraCosts || []).some(ec => ec.name || (parseFloat(ec.amount) || 0) > 0)
            || !!App.editingOrderId;
        if (!hasAnyData) return;

        this._autosaving = true;
        try {
            const orderName = document.getElementById('calc-order-name').value.trim();
            const now = new Date();
            const autoName = orderName || ('Черновик ' + String(now.getDate()).padStart(2,'0') + '.' + String(now.getMonth()+1).padStart(2,'0') + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0'));

            // Recalculate before saving
            try { this._doRecalculate(App.params); } catch (e) { /* ignore */ }

            const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, App.params, this.pendants);
            const orderAdjustments = this.getOrderAdjustments();
            const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems, this.extraCosts, App.params || {}, this.pendants, orderAdjustments);

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
                discount_mode: orderAdjustments.mode,
                discount_value: orderAdjustments.value,
                gross_revenue_plan: summary.grossRevenue,
                discount_amount_plan: summary.discountAmount,
                discount_percent_plan: summary.discountPercent,
                total_revenue_plan: summary.totalRevenue,
                total_cost_plan: summary.totalRevenue - summary.totalEarned,
                total_margin_plan: summary.totalEarned,
                margin_percent_plan: summary.marginPercent,
                total_with_vat_plan: summary.totalWithVat,
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
            if (!this._isMeaningfulProductItem(item)) return;
            const r = item.result || getEmptyCostResult();
            const nfcWarehouseItemId = item.is_nfc && typeof getProductWarehouseDemandRows === 'function'
                ? Number((getProductWarehouseDemandRows(item, this._getWhPickerItemsFlat())[0] || {}).warehouse_item_id || 0) || null
                : null;
            items.push({
                item_number: item.item_number,
                item_type: 'product',
                product_name: item.product_name,
                quantity: item.quantity,
                pieces_per_hour: item.pieces_per_hour,
                weight_grams: item.weight_grams,
                extra_molds: item.extra_molds,
                base_mold_in_stock: item.base_mold_in_stock,
                complex_design: item.complex_design,
                is_blank_mold: item.is_blank_mold,
                is_nfc: item.is_nfc,
                nfc_programming: item.nfc_programming,
                nfc_warehouse_item_id: nfcWarehouseItemId,
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
                color_solution_attachment: item.color_solution_attachment ? JSON.stringify(item.color_solution_attachment) : null,
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
                custom_country: hw.custom_country || 'china',
                hardware_warehouse_item_id: hw.warehouse_item_id || null,
                hardware_warehouse_sku: hw.warehouse_sku || '',
                china_item_id: hw.china_item_id || null,
                china_delivery_method: hw.china_delivery_method || 'avia',
                price_cny: hw.price_cny || 0,
                weight_grams: hw.weight_grams || 0,
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
                custom_country: pkg.custom_country || 'china',
                packaging_warehouse_item_id: pkg.warehouse_item_id || null,
                packaging_warehouse_sku: pkg.warehouse_sku || '',
                china_item_id: pkg.china_item_id || null,
                china_delivery_method: pkg.china_delivery_method || 'avia',
                price_cny: pkg.price_cny || 0,
                weight_grams: pkg.weight_grams || 0,
                packaging_parent_item_index: pkg.parent_item_index ?? null,
            });
        });

        // Extra costs
        (this.extraCosts || []).filter(ec => ec.amount > 0 || ec.name).forEach((ec, i) => {
            items.push({
                item_number: 300 + i,
                item_type: 'extra_cost',
                product_name: ec.name || 'Доп. доход',
                quantity: 1,
                cost_total: ec.amount || 0,
                sell_price_item: ec.amount || 0,
            });
        });

        // Pendant items
        this.pendants.forEach((pnd, i) => {
            items.push({
                ...pnd,
                item_number: 400 + i,
                item_type: 'pendant',
                product_name: 'Подвес "' + (pnd.name || '') + '"',
                quantity: pnd.quantity || 0,
                cost_total: pnd.result ? pnd.result.costPerUnit : 0,
                sell_price_item: pnd.result ? pnd.result.sellPerUnit : 0,
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

        const load = calculateProductionLoad(this.items, this.hardwareItems, this.packagingItems, App.params, this.pendants);
        const orderAdjustments = this.getOrderAdjustments();
        const summary = calculateOrderSummary(this.items, this.hardwareItems, this.packagingItems, this.extraCosts, App.params || {}, this.pendants, orderAdjustments);

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
            discount_mode: orderAdjustments.mode,
            discount_value: orderAdjustments.value,
            gross_revenue_plan: summary.grossRevenue,
            discount_amount_plan: summary.discountAmount,
            discount_percent_plan: summary.discountPercent,
            total_revenue_plan: summary.totalRevenue,
            total_cost_plan: summary.totalRevenue - summary.totalEarned,
            total_margin_plan: summary.totalEarned,
            margin_percent_plan: summary.marginPercent,
            total_with_vat_plan: summary.totalWithVat,
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
            this._isDirty = false;
            const statusEl = document.getElementById('calc-autosave-status');
            if (statusEl) statusEl.textContent = 'Сохранено';

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
            // Warehouse project sync now covers both hardware and packaging from stock:
            // reserve by order status, actual write-off only after warehouse marks the row as collected.
            let warehouseSyncResult = null;
            let warehouseSyncError = null;
            try {
                if (typeof Warehouse !== 'undefined' && Warehouse.syncProjectHardwareOrderState) {
                    warehouseSyncResult = await Warehouse.syncProjectHardwareOrderState({
                        orderId,
                        orderName: order.order_name,
                        managerName: actorName,
                        status: order.status,
                        currentItems: items,
                        previousItems: (oldData && oldData.items) || [],
                    });
                } else {
                    // Legacy fallback if project warehouse sync is unavailable.
                    await this._syncWarehouseReservationsOnSave(
                        orderId,
                        order.order_name,
                        actorName,
                        order.status === 'sample',
                        { hardware: false, packaging: true }
                    );
                }
            } catch (error) {
                warehouseSyncError = error;
                console.error('[Calculator.saveOrder] warehouse sync failed:', error);
            }

            this._invalidateWhPickerContext();
            this._captureCommittedWhDemandSnapshot(orderId);

            if (warehouseSyncError) {
                App.toast('Заказ сохранён, но склад не синхронизировался');
            } else if (!warehouseSyncResult || !warehouseSyncResult.shortage) {
                App.toast('Заказ сохранен');
            }
        } else {
            App.toast('Ошибка сохранения');
        }
    },

    _collectWarehouseReservationDemand(options) {
        const includeHardware = !options || options.hardware !== false;
        const includePackaging = !options || options.packaging !== false;
        const demand = new Map();
        const addQty = (itemId, qty) => {
            if (!itemId || qty <= 0) return;
            demand.set(itemId, (demand.get(itemId) || 0) + qty);
        };

        if (includeHardware) {
            const explicitHardwareIds = new Set();
            (this.hardwareItems || []).forEach(hw => {
                if (hw.source === 'warehouse' && hw.warehouse_item_id) {
                    addQty(hw.warehouse_item_id, parseFloat(hw.qty) || 0);
                    if ((parseFloat(hw.qty) || 0) > 0) explicitHardwareIds.add(Number(hw.warehouse_item_id));
                }
            });
            if (typeof getProductWarehouseDemandRows === 'function') {
                const pickerItems = this._getWhPickerItemsFlat();
                (this.items || []).forEach(item => {
                    getProductWarehouseDemandRows(item, pickerItems).forEach(row => {
                        if (explicitHardwareIds.has(Number(row.warehouse_item_id || 0))) return;
                        addQty(row.warehouse_item_id, parseFloat(row.qty) || 0);
                    });
                });
            }
        }
        if (includePackaging) {
            (this.packagingItems || []).forEach(pkg => {
                if (pkg.source === 'warehouse' && pkg.warehouse_item_id) {
                    addQty(pkg.warehouse_item_id, parseFloat(pkg.qty) || 0);
                }
            });
        }
        if (includeHardware && typeof getPendantWarehouseDemandRows === 'function') {
            (this.pendants || []).forEach(pnd => {
                getPendantWarehouseDemandRows(pnd).forEach(row => {
                    addQty(row.warehouse_item_id, parseFloat(row.qty) || 0);
                });
            });
        }

        return demand;
    },

    async _syncWarehouseReservationsOnSave(orderId, orderName, managerName, shouldReserve, options) {
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
            const demand = this._collectWarehouseReservationDemand(options);
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
                    App.toast('Резервы склада обновлены');
                }
            }
        }

        await saveWarehouseReservations(reservations);
        this._invalidateWhPickerContext();
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
                        managerName,
                        { order_id: App.editingOrderId || null }
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
                    managerName,
                    { order_id: App.editingOrderId || null }
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
        this._invalidateWhPickerContext();
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
        this.discountMode = (order.discount_mode === 'amount' || order.discount_mode === 'percent') ? order.discount_mode : 'none';
        this.discountValue = this._parseDiscountValue(order.discount_value || 0);
        this._syncDiscountUi();

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
            if (typeof item.color_solution_attachment === 'string') {
                try { item.color_solution_attachment = JSON.parse(item.color_solution_attachment); } catch (e) { item.color_solution_attachment = null; }
            }
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
        this._updateItemsEmptyState();

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
            hw.custom_country = dbHw.custom_country || 'china';
            hw.warehouse_item_id = dbHw.hardware_warehouse_item_id || null;
            hw.warehouse_sku = dbHw.hardware_warehouse_sku || '';
            hw.china_item_id = dbHw.china_item_id || null;
            hw.china_delivery_method = dbHw.china_delivery_method || 'avia';
            hw.price_cny = dbHw.price_cny || 0;
            hw.weight_grams = dbHw.weight_grams || 0;
            hw.parent_item_index = dbHw.hardware_parent_item_index ?? null;
            hw._from_template = dbHw.hardware_from_template || false;
            this._hydrateWarehouseBackedLineFromCurrentWarehouse(hw);
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
            pkg.custom_country = dbPkg.custom_country || 'china';
            pkg.warehouse_item_id = dbPkg.packaging_warehouse_item_id || null;
            pkg.warehouse_sku = dbPkg.packaging_warehouse_sku || '';
            pkg.china_item_id = dbPkg.china_item_id || null;
            pkg.china_delivery_method = dbPkg.china_delivery_method || 'avia';
            pkg.price_cny = dbPkg.price_cny || 0;
            pkg.weight_grams = dbPkg.weight_grams || 0;
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
            this._hydrateWarehouseBackedLineFromCurrentWarehouse(pkg);
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

        // Restore pendant items
        const pendantDbItems = dbItems.filter(i => i.item_type === 'pendant');
        pendantDbItems.forEach(dbPnd => {
            let pnd = { ...dbPnd };
            if (dbPnd.item_data) {
                try {
                    const outer = typeof dbPnd.item_data === 'string' ? JSON.parse(dbPnd.item_data) : dbPnd.item_data;
                    if (outer && typeof outer === 'object') {
                        pnd = { ...outer, ...pnd };
                        if (outer.item_data) {
                            const nested = typeof outer.item_data === 'string' ? JSON.parse(outer.item_data) : outer.item_data;
                            if (nested && typeof nested === 'object') {
                                pnd = { ...pnd, ...nested };
                            }
                        }
                    }
                } catch (e) { /* ignore malformed legacy pendant payloads */ }
            }
            if (pnd && pnd.item_type === 'pendant') {
                this.pendants.push(pnd);
            }
        });
        this._captureCommittedWhDemandSnapshot(orderId);
        this.rerenderAllHardware();
        this.rerenderAllPackaging();
        // Render pendant cards (Pendant module handles this)
        if (typeof Pendant !== 'undefined') {
            Pendant.renderAllCards();
        }

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
        this._isDirty = false;
        const statusEl = document.getElementById('calc-autosave-status');
        if (statusEl) statusEl.textContent = 'Загружен сохраненный заказ';
        if (data.repaired_duplicates) {
            App.toast('Дубли позиций в заказе были автоматически исправлены');
        }

        // Show change history
        this.showOrderHistory(orderId);

        this._preserveStateOnNextInit = true;
        // Navigate WITHOUT setting hash (pushHash=false) to avoid hashchange
        // firing a second Calculator.init() that would reset the form.
        App.navigate('calculator', false);
        // Silently update URL so browser address bar shows #calculator
        window.history.replaceState(null, '', '#calculator');
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
                        { key: 'base_mold_in_stock', label: 'молд на складе' },
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
            const keepRate = 1 - (params.taxRate || 0.06) - (Number.isFinite(params?.charityRate) ? params.charityRate : 0.01) - 0.065 - marginPct;
            if (keepRate <= 0) return 0;
            return round2(cost / keepRate);
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
            if ((item.sell_price_item || 0) > 0) {
                kpItems.push({
                    type: 'product',
                    name: item.product_name || 'Изделие',
                    qty: item.quantity,
                    price: item.sell_price_item,
                    colors: (item.colors || []).map(c => c.name).filter(Boolean),
                });
            }
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
            if (hw.qty > 0 && (hw.sell_price || 0) > 0) {
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
            if (pkg.qty > 0 && (pkg.sell_price || 0) > 0) {
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
                    name: ec.name || 'Доп. доход',
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
            await KPGenerator.generate(orderName, clientName, kpItems, clientLegal, companyLegal, {
                discount: this.getOrderAdjustments(),
                params,
            });
        } catch (err) {
            console.error('KP generation error:', err);
            App.toast('Ошибка генерации КП: ' + err.message);
        }
    },
};

// Init on load
document.addEventListener('DOMContentLoaded', () => App.init());

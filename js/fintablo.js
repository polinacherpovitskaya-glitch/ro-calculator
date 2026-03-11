// =============================================
// Recycle Object — FinTablo Integration Page
// =============================================

const FinTablo = {
    API_BASE: 'https://api.fintablo.ru',
    _deals: [],
    _orders: [],
    _categories: {},   // id → { name, parentId, group }
    _matchMap: {},      // dealId → orderId
    _currentFilter: 'matched',
    _openDealId: null,

    // =============================================
    // Category mapping (FinTablo category name → our fact field)
    // =============================================
    CATEGORY_KEYWORDS: {
        'зарплата': 'fact_salary', 'зп': 'fact_salary', 'фот': 'fact_salary',
        'материал': 'fact_materials', 'пластик': 'fact_materials', 'сырье': 'fact_materials',
        'фурнитура': 'fact_hardware',
        'доставка': 'fact_delivery', 'логистика': 'fact_delivery',
        'печат': 'fact_printing', 'нанесение': 'fact_printing',
        'молд': 'fact_molds', 'форма': 'fact_molds',
        'налог': 'fact_taxes', 'ндс': 'fact_taxes',
        'выручка': 'fact_revenue', 'доход': 'fact_revenue',
    },

    FACT_LABELS: {
        fact_salary: 'Зарплата',
        fact_materials: 'Материалы',
        fact_hardware: 'Фурнитура',
        fact_delivery: 'Доставка',
        fact_printing: 'Нанесение',
        fact_molds: 'Молды',
        fact_taxes: 'Налоги',
        fact_other: 'Прочее',
        fact_revenue: 'Выручка',
    },

    // =============================================
    // API helpers
    // =============================================
    _getApiKey() {
        return localStorage.getItem('ro_fintablo_api_key') || '';
    },

    async _apiGet(path, params = {}) {
        const key = this._getApiKey();
        if (!key) throw new Error('API-ключ не настроен');

        const url = new URL(this.API_BASE + path);
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
        }

        const resp = await fetch(url.toString(), {
            headers: { 'Authorization': 'Bearer ' + key }
        });

        if (resp.status === 401) throw new Error('Неверный API-ключ');
        if (resp.status === 429) throw new Error('Превышен лимит запросов (300/мин)');
        if (!resp.ok) throw new Error('Ошибка API: ' + resp.status);

        const data = await resp.json();
        if (data.status !== 200) throw new Error(data.statusText || 'API error');
        return data;
    },

    // =============================================
    // Load page
    // =============================================
    async load() {
        const key = this._getApiKey();
        if (!key) {
            this._showSetup();
            return;
        }
        await this.refresh();
    },

    _showSetup() {
        document.getElementById('ft-setup').style.display = '';
        document.getElementById('ft-deals-card').style.display = 'none';
        document.getElementById('ft-loading').style.display = 'none';
        document.getElementById('ft-error').style.display = 'none';
        document.getElementById('ft-detail').style.display = 'none';
        document.getElementById('ft-refresh-btn').style.display = 'none';
    },

    saveApiKey() {
        const key = document.getElementById('ft-api-key').value.trim();
        if (!key) { App.toast('Введите API-ключ'); return; }
        localStorage.setItem('ro_fintablo_api_key', key);
        App.toast('Ключ сохранен');
        this.load();
    },

    async refresh() {
        document.getElementById('ft-setup').style.display = 'none';
        document.getElementById('ft-deals-card').style.display = 'none';
        document.getElementById('ft-error').style.display = 'none';
        document.getElementById('ft-detail').style.display = 'none';
        document.getElementById('ft-loading').style.display = '';
        document.getElementById('ft-refresh-btn').style.display = '';

        try {
            // Load in parallel: deals (all pages), categories, our orders
            const [deals, categories, orders] = await Promise.all([
                this._loadAllDeals(),
                this._loadCategories(),
                loadOrders({}),
            ]);

            this._deals = deals;
            this._orders = orders || [];

            // Build category map
            this._categories = {};
            (categories || []).forEach(c => {
                this._categories[c.id] = c;
            });

            // Match deals to orders by name
            this._matchDeals();

            // Render
            document.getElementById('ft-loading').style.display = 'none';
            document.getElementById('ft-deals-card').style.display = '';
            this.applyFilter();

        } catch (err) {
            document.getElementById('ft-loading').style.display = 'none';
            document.getElementById('ft-error').style.display = '';
            document.getElementById('ft-error-text').textContent = err.message;
            console.error('FinTablo load error:', err);
        }
    },

    async _loadAllDeals() {
        // FinTablo returns up to 500 deals per page
        let all = [];
        let page = 1;
        while (true) {
            const data = await this._apiGet('/v1/deal', { page });
            const items = data.items || [];
            all = all.concat(items);
            if (items.length < 500) break;
            page++;
        }
        return all;
    },

    async _loadCategories() {
        // Load both income and outcome categories
        const [inc, out] = await Promise.all([
            this._apiGet('/v1/category', { group: 'income' }),
            this._apiGet('/v1/category', { group: 'outcome' }),
        ]);
        return [...(inc.items || []), ...(out.items || [])];
    },

    // =============================================
    // Match deals to orders by name
    // =============================================
    _matchDeals() {
        this._matchMap = {};
        const ordersByName = {};
        this._orders.forEach(o => {
            const name = (o.order_name || '').trim().toLowerCase();
            if (name) ordersByName[name] = o;
        });

        this._deals.forEach(d => {
            const dealName = (d.name || '').trim().toLowerCase();
            if (ordersByName[dealName]) {
                this._matchMap[d.id] = ordersByName[dealName];
            }
        });
    },

    // =============================================
    // Render deals table
    // =============================================
    applyFilter() {
        this._currentFilter = document.getElementById('ft-filter').value;
        this._renderDeals();
    },

    _renderDeals() {
        const filter = this._currentFilter;
        let deals = this._deals;

        if (filter === 'matched') {
            deals = deals.filter(d => this._matchMap[d.id]);
        } else if (filter === 'unmatched') {
            deals = deals.filter(d => !this._matchMap[d.id]);
        }

        // Sort: matched first, then by amount desc
        deals.sort((a, b) => {
            const am = this._matchMap[a.id] ? 1 : 0;
            const bm = this._matchMap[b.id] ? 1 : 0;
            if (am !== bm) return bm - am;
            return (b.amount || 0) - (a.amount || 0);
        });

        const tbody = document.getElementById('ft-deals-body');
        document.getElementById('ft-deals-count').textContent =
            `(${deals.length} из ${this._deals.length})`;

        if (deals.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Нет сделок</td></tr>';
            return;
        }

        tbody.innerHTML = deals.map(d => {
            const order = this._matchMap[d.id];
            const orderName = order ? this._esc(order.order_name) : '<span class="text-muted">—</span>';
            const status = order
                ? '<span style="color:var(--success)">&#10003;</span>'
                : '<span class="text-muted">&#8212;</span>';

            return `<tr class="ft-deal-row ${order ? '' : 'ft-unmatched'}"
                        onclick="FinTablo.openDeal(${d.id})"
                        style="cursor:pointer">
                <td><strong>${this._esc(d.name)}</strong></td>
                <td>${orderName}</td>
                <td class="text-right">${formatRub(d.amount || 0)}</td>
                <td class="text-right" id="ft-deal-out-${d.id}"><span class="text-muted">...</span></td>
                <td class="text-right" id="ft-deal-inc-${d.id}"><span class="text-muted">...</span></td>
                <td class="text-center">${status}</td>
            </tr>`;
        }).join('');

        // Load transaction totals in background (batched)
        this._loadDealTotals(deals);
    },

    async _loadDealTotals(deals) {
        // Load transactions for visible deals in small batches to get totals
        // Use batch of 5 concurrent requests to respect rate limits
        const BATCH = 5;
        for (let i = 0; i < deals.length; i += BATCH) {
            const batch = deals.slice(i, i + BATCH);
            await Promise.all(batch.map(async d => {
                try {
                    const data = await this._apiGet('/v1/transaction', {
                        dealId: d.id, pageSize: 1000
                    });
                    const txns = data.items || [];
                    const income = txns.filter(t => t.group === 'income').reduce((s, t) => s + (t.value || 0), 0);
                    const outcome = txns.filter(t => t.group === 'outcome').reduce((s, t) => s + (t.value || 0), 0);

                    const outEl = document.getElementById('ft-deal-out-' + d.id);
                    const incEl = document.getElementById('ft-deal-inc-' + d.id);
                    if (outEl) outEl.innerHTML = outcome > 0
                        ? `<span style="color:var(--danger)">${formatRub(outcome)}</span>` : '<span class="text-muted">0</span>';
                    if (incEl) incEl.innerHTML = income > 0
                        ? `<span style="color:var(--success)">${formatRub(income)}</span>` : '<span class="text-muted">0</span>';
                } catch (e) {
                    console.warn('Failed to load totals for deal', d.id, e);
                }
            }));
        }
    },

    // =============================================
    // Deal detail (transactions)
    // =============================================
    async openDeal(dealId) {
        this._openDealId = dealId;
        const deal = this._deals.find(d => d.id === dealId);
        if (!deal) return;

        const detailEl = document.getElementById('ft-detail');
        detailEl.style.display = '';
        document.getElementById('ft-detail-title').textContent = 'Транзакции: ' + deal.name;
        document.getElementById('ft-detail-loading').style.display = '';
        document.getElementById('ft-detail-content').innerHTML = '';

        // Scroll to detail
        detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

        try {
            const data = await this._apiGet('/v1/transaction', {
                dealId: dealId, pageSize: 1000
            });
            const txns = data.items || [];
            document.getElementById('ft-detail-loading').style.display = 'none';
            this._renderDetail(deal, txns);
        } catch (err) {
            document.getElementById('ft-detail-loading').style.display = 'none';
            document.getElementById('ft-detail-content').innerHTML =
                `<p style="color:var(--danger);padding:16px 0">${this._esc(err.message)}</p>`;
        }
    },

    closeDetail() {
        document.getElementById('ft-detail').style.display = 'none';
        this._openDealId = null;
    },

    _renderDetail(deal, txns) {
        const content = document.getElementById('ft-detail-content');
        const order = this._matchMap[deal.id];

        // Split by group
        const outcomes = txns.filter(t => t.group === 'outcome');
        const incomes = txns.filter(t => t.group === 'income');
        const transfers = txns.filter(t => t.group === 'transfer');

        // Map expenses to our fact fields
        const factSums = this._mapToFactFields(outcomes);
        const totalIncome = incomes.reduce((s, t) => s + (t.value || 0), 0);
        const totalOutcome = outcomes.reduce((s, t) => s + (t.value || 0), 0);

        let html = '';

        // Summary card
        html += `<div style="display:flex;gap:16px;margin-bottom:16px;flex-wrap:wrap">
            <div style="flex:1;min-width:150px;padding:12px;background:var(--bg);border-radius:8px;text-align:center">
                <div class="text-muted" style="font-size:12px">Доходы</div>
                <div style="font-size:18px;font-weight:600;color:var(--success)">${formatRub(totalIncome)}</div>
            </div>
            <div style="flex:1;min-width:150px;padding:12px;background:var(--bg);border-radius:8px;text-align:center">
                <div class="text-muted" style="font-size:12px">Расходы</div>
                <div style="font-size:18px;font-weight:600;color:var(--danger)">${formatRub(totalOutcome)}</div>
            </div>
            <div style="flex:1;min-width:150px;padding:12px;background:var(--bg);border-radius:8px;text-align:center">
                <div class="text-muted" style="font-size:12px">Маржа</div>
                <div style="font-size:18px;font-weight:600">${formatRub(totalIncome - totalOutcome)}</div>
            </div>
        </div>`;

        // Fact breakdown
        html += `<h4 style="margin:16px 0 8px">Разбивка расходов по категориям</h4>`;
        html += `<div class="cost-breakdown">`;
        for (const [field, label] of Object.entries(this.FACT_LABELS)) {
            if (field === 'fact_revenue') continue; // shown separately
            const val = factSums[field] || 0;
            const cls = val > 0 ? '' : 'text-muted';
            html += `<div class="cost-row"><span class="cost-label">${label}</span>
                <span class="cost-value ${cls}">${formatRub(val)}</span></div>`;
        }
        html += `<div class="cost-row cost-total"><span class="cost-label">ИТОГО расходы</span>
            <span class="cost-value">${formatRub(totalOutcome)}</span></div>`;
        html += `<div class="cost-row" style="margin-top:8px"><span class="cost-label">Выручка</span>
            <span class="cost-value text-green">${formatRub(totalIncome)}</span></div>`;
        html += `</div>`;

        // Apply button (only if matched to an order)
        if (order) {
            html += `<div style="margin-top:16px">
                <button class="btn btn-success" onclick="FinTablo.applyToOrder(${deal.id})">
                    Применить к заказу &laquo;${this._esc(order.order_name)}&raquo;
                </button>
            </div>`;
        }

        // Transaction list
        if (txns.length > 0) {
            html += `<h4 style="margin:24px 0 8px">Все транзакции (${txns.length})</h4>`;
            html += `<div class="table-wrap"><table><thead><tr>
                <th>Дата</th><th>Описание</th><th>Статья</th>
                <th class="text-right">Сумма</th><th>Тип</th>
            </tr></thead><tbody>`;

            // Sort by date desc
            const sorted = [...txns].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            sorted.forEach(t => {
                const cat = this._categories[t.categoryId];
                const catName = cat ? cat.name : '';
                const typeLabel = t.group === 'income' ? '<span style="color:var(--success)">Доход</span>'
                    : t.group === 'outcome' ? '<span style="color:var(--danger)">Расход</span>'
                    : '<span class="text-muted">Перевод</span>';
                const valueColor = t.group === 'income' ? 'color:var(--success)' :
                    t.group === 'outcome' ? 'color:var(--danger)' : '';

                html += `<tr>
                    <td style="white-space:nowrap">${t.date || ''}</td>
                    <td>${this._esc(t.description || '')}</td>
                    <td><span class="text-muted" style="font-size:12px">${this._esc(catName)}</span></td>
                    <td class="text-right" style="${valueColor}">${formatRub(t.value || 0)}</td>
                    <td>${typeLabel}</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }

        content.innerHTML = html;
    },

    // =============================================
    // Map FinTablo transactions to our fact fields
    // =============================================
    _mapToFactFields(outcomes) {
        const result = {
            fact_salary: 0, fact_materials: 0, fact_hardware: 0,
            fact_delivery: 0, fact_printing: 0, fact_molds: 0,
            fact_taxes: 0, fact_other: 0, fact_revenue: 0,
        };

        outcomes.forEach(t => {
            const cat = this._categories[t.categoryId];
            const catName = (cat ? cat.name : '').toLowerCase();
            // Also check parent category name
            const parentCat = cat && cat.parentId ? this._categories[cat.parentId] : null;
            const parentName = (parentCat ? parentCat.name : '').toLowerCase();

            let matched = false;
            for (const [keyword, field] of Object.entries(this.CATEGORY_KEYWORDS)) {
                if (catName.includes(keyword) || parentName.includes(keyword)) {
                    result[field] += (t.value || 0);
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                result.fact_other += (t.value || 0);
            }
        });

        return result;
    },

    // =============================================
    // Apply data to order (save to fintablo_imports)
    // =============================================
    async applyToOrder(dealId) {
        const deal = this._deals.find(d => d.id === dealId);
        const order = this._matchMap[dealId];
        if (!deal || !order) {
            App.toast('Заказ не найден');
            return;
        }

        try {
            // Fetch transactions again (fresh)
            const data = await this._apiGet('/v1/transaction', {
                dealId: dealId, pageSize: 1000
            });
            const txns = data.items || [];
            const outcomes = txns.filter(t => t.group === 'outcome');
            const incomes = txns.filter(t => t.group === 'income');

            const factSums = this._mapToFactFields(outcomes);
            const totalIncome = incomes.reduce((s, t) => s + (t.value || 0), 0);
            const totalOutcome = outcomes.reduce((s, t) => s + (t.value || 0), 0);

            const importData = {
                order_id: order.id,
                period_start: null,
                period_end: null,
                fact_salary: factSums.fact_salary,
                fact_materials: factSums.fact_materials,
                fact_hardware: factSums.fact_hardware,
                fact_delivery: factSums.fact_delivery,
                fact_printing: factSums.fact_printing,
                fact_molds: factSums.fact_molds,
                fact_taxes: factSums.fact_taxes,
                fact_other: factSums.fact_other,
                fact_total: totalOutcome,
                fact_revenue: totalIncome,
                raw_data: { source: 'fintablo_api', dealId: deal.id, dealName: deal.name, txnCount: txns.length },
                source: 'api',
            };

            const id = await saveFintabloImport(importData);
            if (id) {
                App.toast('Данные применены к заказу "' + order.order_name + '"');
            } else {
                App.toast('Ошибка сохранения');
            }
        } catch (err) {
            App.toast('Ошибка: ' + err.message);
            console.error('applyToOrder error:', err);
        }
    },

    // =============================================
    // Utils
    // =============================================
    _esc(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },
};

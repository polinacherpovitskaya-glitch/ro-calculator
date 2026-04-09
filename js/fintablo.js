// =============================================
// Recycle Object — FinTablo Integration Page
// =============================================

const FinTablo = {
    API_BASE: 'https://api.fintablo.ru',
    AUTO_SYNC_STORAGE_KEY: 'ro_fintablo_last_auto_sync_at',
    AUTO_SYNC_INTERVAL_MS: 24 * 60 * 60 * 1000,
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
        'упаков': 'fact_packaging',
        'доставка': 'fact_delivery', 'логистика': 'fact_delivery',
        'печат': 'fact_printing', 'нанесение': 'fact_printing',
        'молд': 'fact_molds', 'форма': 'fact_molds',
        'благотвор': 'fact_charity', 'благотв': 'fact_charity',
        'налог': 'fact_taxes', 'ндс': 'fact_taxes',
        'выручка': 'fact_revenue', 'доход': 'fact_revenue',
    },

    FACT_LABELS: {
        fact_salary: 'Зарплата',
        fact_materials: 'Материалы',
        fact_hardware: 'Фурнитура',
        fact_packaging: 'Упаковка',
        fact_delivery: 'Доставка',
        fact_printing: 'Нанесение',
        fact_molds: 'Молды',
        fact_taxes: 'Налоги',
        fact_charity: 'Благотворительность',
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
        localStorage.removeItem(this.AUTO_SYNC_STORAGE_KEY);
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
        this._matchMap = this._buildMatchMap(this._deals, this._orders);
    },

    _buildMatchMap(deals, orders) {
        const matchMap = {};
        const ordersByName = {};
        (orders || []).forEach(o => {
            const name = (o.order_name || '').trim().toLowerCase();
            if (name) ordersByName[name] = o;
        });

        (deals || []).forEach(d => {
            const dealName = (d.name || '').trim().toLowerCase();
            if (ordersByName[dealName]) {
                matchMap[d.id] = ordersByName[dealName];
            }
        });
        return matchMap;
    },

    _getLastAutoSyncAt() {
        const ts = parseInt(localStorage.getItem(this.AUTO_SYNC_STORAGE_KEY) || '0', 10);
        return Number.isFinite(ts) ? ts : 0;
    },

    async autoSyncMatchedImports(opts = {}) {
        const key = this._getApiKey();
        if (!key) return { synced: 0, skipped: 'no_key' };

        const force = !!opts.force;
        const lastSyncAt = this._getLastAutoSyncAt();
        if (!force && lastSyncAt > 0 && (Date.now() - lastSyncAt) < this.AUTO_SYNC_INTERVAL_MS) {
            return { synced: 0, skipped: 'fresh' };
        }

        const targetOrderIds = Array.isArray(opts.orderIds)
            ? new Set(opts.orderIds.map(id => Number(id)).filter(Number.isFinite))
            : null;

        try {
            const [deals, categories, orders] = await Promise.all([
                this._loadAllDeals(),
                this._loadCategories(),
                Array.isArray(opts.orders) ? Promise.resolve(opts.orders) : loadOrders({}),
            ]);

            const categoriesMap = {};
            (categories || []).forEach(c => {
                categoriesMap[c.id] = c;
            });
            const matchMap = this._buildMatchMap(deals, orders || []);
            const matchedDeals = (deals || []).filter(deal => {
                const matchedOrder = matchMap[deal.id];
                if (!matchedOrder) return false;
                return !targetOrderIds || targetOrderIds.has(Number(matchedOrder.id));
            });
            if (!matchedDeals.length) {
                localStorage.setItem(this.AUTO_SYNC_STORAGE_KEY, String(Date.now()));
                return { synced: 0, matched: 0 };
            }

            this._deals = deals || [];
            this._orders = orders || [];
            this._categories = categoriesMap;
            this._matchMap = matchMap;

            const BATCH = 5;
            let synced = 0;
            for (let i = 0; i < matchedDeals.length; i += BATCH) {
                const batch = matchedDeals.slice(i, i + BATCH);
                const results = await Promise.all(batch.map(async deal => {
                    const matchedOrder = matchMap[deal.id];
                    if (!matchedOrder) return false;
                    const data = await this._apiGet('/v1/transaction', {
                        dealId: deal.id, pageSize: 1000,
                    });
                    const txns = data.items || [];
                    const id = await this._syncDealImport(deal, matchedOrder, txns, { silent: true });
                    return !!id;
                }));
                synced += results.filter(Boolean).length;
            }

            localStorage.setItem(this.AUTO_SYNC_STORAGE_KEY, String(Date.now()));
            return { synced, matched: matchedDeals.length };
        } catch (err) {
            console.error('FinTablo autoSyncMatchedImports error:', err);
            if (!opts.silent && typeof App?.toast === 'function') {
                App.toast('Не удалось обновить ФинТабло: ' + err.message);
            }
            return { synced: 0, error: err.message };
        }
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

                    const matchedOrder = this._matchMap[d.id];
                    if (matchedOrder) {
                        await this._syncDealImport(d, matchedOrder, txns, { silent: true });
                    }
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
        const scopedTxns = this._scopeTransactionsToOrder(txns, order);

        // Split by group
        const outcomes = scopedTxns.filter(t => t.group === 'outcome');
        const incomes = scopedTxns.filter(t => t.group === 'income');
        const transfers = scopedTxns.filter(t => t.group === 'transfer');

        // Map expenses to our fact fields
        const factSums = this._mapToFactFields(outcomes);
        const totalIncome = incomes.reduce((s, t) => s + this._effectiveTransactionValue(t), 0);
        const totalOutcome = outcomes.reduce((s, t) => s + this._effectiveTransactionValue(t), 0);

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
            const sorted = [...scopedTxns].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            sorted.forEach(t => {
                const cat = this._categories[t.categoryId];
                const catName = cat ? cat.name : '';
                const typeLabel = t.group === 'income' ? '<span style="color:var(--success)">Доход</span>'
                    : t.group === 'outcome' ? '<span style="color:var(--danger)">Расход</span>'
                    : '<span class="text-muted">Перевод</span>';
                const valueColor = t.group === 'income' ? 'color:var(--success)' :
                    t.group === 'outcome' ? 'color:var(--danger)' : '';
                const effectiveValue = this._effectiveTransactionValue(t);
                const originalValue = this._num(t.value);
                let valueHtml = formatRub(effectiveValue);
                if (order && t._scoped_mode === 'split' && Math.abs(effectiveValue - originalValue) > 0.001) {
                    valueHtml = `${formatRub(effectiveValue)}<div class="text-muted" style="font-size:11px">из ${formatRub(originalValue)}</div>`;
                } else if (order && t._scoped_mode === 'split_zero') {
                    valueHtml = `<span class="text-muted">не относится</span><div class="text-muted" style="font-size:11px">из ${formatRub(originalValue)}</div>`;
                }

                html += `<tr>
                    <td style="white-space:nowrap">${t.date || ''}</td>
                    <td>${this._esc(t.description || '')}</td>
                    <td><span class="text-muted" style="font-size:12px">${this._esc(catName)}</span></td>
                    <td class="text-right" style="${valueColor}">${valueHtml}</td>
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
            fact_packaging: 0, fact_delivery: 0, fact_printing: 0, fact_molds: 0,
            fact_taxes: 0, fact_charity: 0, fact_other: 0, fact_revenue: 0,
        };

        outcomes.forEach(t => {
            const amount = this._effectiveTransactionValue(t);
            if (amount <= 0) return;
            const cat = this._categories[t.categoryId];
            const catName = (cat ? cat.name : '').toLowerCase();
            // Also check parent category name
            const parentCat = cat && cat.parentId ? this._categories[cat.parentId] : null;
            const parentName = (parentCat ? parentCat.name : '').toLowerCase();

            let matched = false;
            for (const [keyword, field] of Object.entries(this.CATEGORY_KEYWORDS)) {
                if (catName.includes(keyword) || parentName.includes(keyword)) {
                    result[field] += amount;
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                result.fact_other += amount;
            }
        });

        return result;
    },

    _buildImportData(order, deal, txns) {
        const scopedTxns = this._scopeTransactionsToOrder(txns, order);
        const outcomes = scopedTxns.filter(t => t.group === 'outcome');
        const incomes = scopedTxns.filter(t => t.group === 'income');
        const factSums = this._mapToFactFields(outcomes);
        const totalIncome = incomes.reduce((s, t) => s + this._effectiveTransactionValue(t), 0);
        const totalOutcome = outcomes.reduce((s, t) => s + this._effectiveTransactionValue(t), 0);
        const splitApplied = scopedTxns.some(t => t._scoped_mode === 'split' || t._scoped_mode === 'split_zero');

        return {
            order_id: order.id,
            period_start: null,
            period_end: null,
            fact_salary: factSums.fact_salary,
            fact_materials: factSums.fact_materials,
            fact_hardware: factSums.fact_hardware,
            fact_packaging: factSums.fact_packaging,
            fact_delivery: factSums.fact_delivery,
            fact_printing: factSums.fact_printing,
            fact_molds: factSums.fact_molds,
            fact_taxes: factSums.fact_taxes,
            fact_charity: factSums.fact_charity,
            fact_other: factSums.fact_other,
            fact_total: totalOutcome,
            fact_revenue: totalIncome,
            raw_data: {
                source: 'fintablo_api',
                dealId: deal.id,
                dealName: deal.name,
                txnCount: txns.length,
                splitApplied,
            },
            source: 'api',
        };
    },

    _scopeTransactionsToOrder(txns, order) {
        return (txns || []).map(txn => {
            const scoped = this._resolveTransactionScope(txn, order);
            return {
                ...txn,
                _scoped_value: scoped.value,
                _scoped_mode: scoped.mode,
                _scoped_original_value: scoped.originalValue,
                _scoped_label: scoped.label || '',
            };
        });
    },

    _resolveTransactionScope(txn, order) {
        const originalValue = this._num(txn && txn.value);
        if (!order || originalValue <= 0) {
            return { value: originalValue, mode: 'full', originalValue };
        }

        // Income belongs to the attached deal as a whole. Split parsing is only
        // reliable for shared expenses; applying it to income can zero out the
        // deal revenue even when the money is attached correctly in FinTablo.
        if (String(txn?.group || '') === 'income') {
            return { value: originalValue, mode: 'full', originalValue };
        }

        const allocations = this._extractSplitAllocations(txn && txn.description);
        if (!allocations.length) {
            return { value: originalValue, mode: 'full', originalValue };
        }

        const matched = this._findAllocationForOrder(order.order_name, allocations);
        if (matched) {
            return {
                value: matched.amount,
                mode: 'split',
                originalValue,
                label: matched.label,
            };
        }

        return { value: 0, mode: 'split_zero', originalValue };
    },

    _extractSplitAllocations(description) {
        const text = String(description || '');
        const regex = /(\d[\d\s]*(?:[.,]\d+)?)\s*(?:\([^)]*\))?\s*[-–—]\s*(.*?)(?=(?:\s+\d[\d\s]*(?:[.,]\d+)?\s*(?:\([^)]*\))?\s*[-–—])|$)/g;
        const allocations = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const amount = this._parseMoney(match[1]);
            const label = String(match[2] || '').trim();
            if (amount > 0 && label) {
                allocations.push({ amount, label });
            }
        }
        return allocations.length >= 2 ? allocations : [];
    },

    _findAllocationForOrder(orderName, allocations) {
        const orderTokens = this._tokenizeMatchText(orderName);
        const orderNorm = this._normalizeMatchText(orderName);
        if (!orderTokens.length || !orderNorm) return null;

        let best = null;
        allocations.forEach(allocation => {
            const labelNorm = this._normalizeMatchText(allocation.label);
            const labelTokens = this._tokenizeMatchText(allocation.label);
            if (!labelNorm || !labelTokens.length) return;

            let overlap = 0;
            orderTokens.forEach(orderToken => {
                const hasToken = labelTokens.some(labelToken =>
                    labelToken === orderToken
                    || labelToken.startsWith(orderToken)
                    || orderToken.startsWith(labelToken)
                );
                if (hasToken) overlap += 1;
            });

            const phraseMatch = labelNorm.includes(orderNorm) || orderNorm.includes(labelNorm);
            const minOverlap = orderTokens.length >= 2 ? 2 : 1;
            if (!phraseMatch && overlap < minOverlap) return;

            const score = overlap + (phraseMatch ? 1 : 0);
            if (!best || score > best.score || (score === best.score && allocation.amount > best.amount)) {
                best = { ...allocation, score };
            }
        });

        return best;
    },

    _normalizeMatchText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[^a-zа-я0-9]+/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    },

    _tokenizeMatchText(value) {
        const stopWords = new Set(['и', 'в', 'во', 'на', 'по', 'для', 'без', 'от', 'из', 'с', 'со', 'над', 'под']);
        const tokens = this._normalizeMatchText(value)
            .split(' ')
            .map(token => this._stemMatchToken(token))
            .filter(token => token && token.length >= 2 && !stopWords.has(token));
        return Array.from(new Set(tokens));
    },

    _stemMatchToken(token) {
        let stem = String(token || '');
        const suffixes = ['иями', 'ями', 'ами', 'ов', 'ев', 'ей', 'ий', 'ый', 'ой', 'ам', 'ям', 'ах', 'ях', 'ом', 'ем', 'ы', 'и', 'а', 'я', 'о', 'е', 'у', 'ю'];
        for (const suffix of suffixes) {
            if (stem.length > suffix.length + 2 && stem.endsWith(suffix)) {
                stem = stem.slice(0, -suffix.length);
                break;
            }
        }
        return stem;
    },

    _parseMoney(value) {
        return parseFloat(String(value || '').replace(/\s+/g, '').replace(',', '.')) || 0;
    },

    _effectiveTransactionValue(txn) {
        if (txn && Object.prototype.hasOwnProperty.call(txn, '_scoped_value')) {
            return this._num(txn._scoped_value);
        }
        return this._num(txn && txn.value);
    },

    async _syncDealImport(deal, order, txns, opts = {}) {
        if (!deal || !order) return null;
        const importData = this._buildImportData(order, deal, txns);
        const hasAnyMoney = [
            importData.fact_salary, importData.fact_materials, importData.fact_hardware, importData.fact_packaging,
            importData.fact_delivery, importData.fact_printing, importData.fact_molds, importData.fact_taxes,
            importData.fact_charity,
            importData.fact_other, importData.fact_revenue,
        ].some(v => (parseFloat(v) || 0) > 0);
        if (!hasAnyMoney) return null;

        const id = await saveFintabloImport(importData);
        if (id && !opts.silent) {
            App.toast('Данные применены к заказу "' + order.order_name + '"');
        }
        return id;
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
            const id = await this._syncDealImport(deal, order, txns);
            if (id) {
                return;
            }
            App.toast('Нет данных для сохранения');
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

    _num(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    },
};

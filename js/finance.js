// =============================================
// Recycle Object — Internal Finance Workspace
// =============================================

const Finance = {
    WORKSPACE_VERSION: 7,
    currentTab: 'operations',
    workspace: null,
    summary: null,
    data: {
        orders: [],
        imports: [],
        employees: [],
        timeEntries: [],
        indirectMonths: {},
        tochkaSnapshot: null,
        fintabloSnapshot: null,
    },
    ui: {
        operations: {
            search: '',
            account: '',
            category: '',
            direction: '',
            queue: 'review',
            period: 'all',
            start_date: '',
            end_date: '',
            limit: 200,
            selected_keys: [],
            focus_tx_key: '',
            show_hidden_accounts: false,
            batch_category_id: '__keep__',
            batch_project_id: '__keep__',
            batch_project_label: '',
            batch_note: '',
            batch_template_name: '',
            template_name: '',
        },
        report: {
            month: '',
        },
        composeKind: '',
    },
    _loadingPromise: null,

    GROUP_LABELS: {
        income: 'Доход',
        direct: 'Прямые расходы',
        payroll: 'Зарплата',
        taxes: 'Налоги',
        commercial: 'Коммерция',
        overhead: 'Косвенные',
        investment: 'Инвестиции',
        finance: 'Финансовый контур',
        other: 'Прочее',
    },
    ACCOUNT_TYPE_LABELS: {
        bank: 'Банк',
        cash: 'Наличные',
        settlement: 'Расчеты',
        reserve: 'Резерв',
    },
    ACCOUNT_STATUS_LABELS: {
        active: 'Активен',
        planned: 'План',
        archived: 'Архив',
    },
    SOURCE_KIND_LABELS: {
        legacy_import: 'Legacy import',
        bank_api: 'Bank API',
        manual: 'Ручной ввод',
        internal: 'Внутренний модуль',
        monthly_snapshot: 'Помесячный срез',
        research: 'Исследование',
    },
    SOURCE_STATUS_LABELS: {
        active: 'Работает',
        planned: 'План',
        archived: 'Архив',
    },
    PROJECT_TYPE_LABELS: {
        core: 'Основное направление',
        channel: 'Канал продаж',
        site: 'Площадка',
        support: 'Внутренний контур',
        archived: 'Архив',
    },
    COUNTERPARTY_ROLE_LABELS: {
        vendor: 'Поставщик',
        client: 'Клиент',
        employee: 'Сотрудник',
        tax: 'Налоги / фонды',
        bank: 'Банк',
        channel: 'Канал продаж',
        logistics: 'Логистика',
        other: 'Другое',
    },
    RESEARCH_MODE_LABELS: {
        system: 'Системный шаблон',
        history: 'История операций',
        hybrid: 'История + web',
        manual: 'Только вручную',
    },
    RULE_TRIGGER_LABELS: {
        description: 'По описанию',
        counterparty: 'По контрагенту',
        counterparty_account: 'Контрагент + счет',
        keyword_bundle: 'Набор ключевых слов',
        inn: 'По ИНН',
    },
    TRANSACTION_KIND_LABELS: {
        expense: 'Расход',
        income: 'Доход',
        transfer: 'Перевод',
        payroll: 'ЗП',
        tax: 'Налог',
        owner_money: 'Собственник',
        ignore: 'Не учитывать',
    },
    TRANSACTION_ROUTE_LABELS: {
        manual: 'Подтверждено',
        draft: 'Черновик',
        auto: 'Авторазнос',
        review: 'На проверку',
        unmatched: 'Нужен разбор',
        ignored: 'Скрыто',
    },
    FIXED_ASSET_TYPE_LABELS: {
        equipment: 'Оборудование',
        tool: 'Инструмент',
        furniture: 'Мебель',
        vehicle: 'Транспорт',
        software: 'НМА / софт',
        other: 'Другое',
    },
    FACT_FIELD_LABELS: {
        fact_revenue: 'Выручка',
        fact_total: 'Расходы',
        fact_salary: 'Зарплата',
        fact_materials: 'Материалы',
        fact_hardware: 'Фурнитура',
        fact_packaging: 'Упаковка',
        fact_delivery: 'Доставка',
        fact_printing: 'Нанесение',
        fact_molds: 'Молды',
        fact_taxes: 'Налоги',
        fact_commercial: 'Коммерческий',
        fact_charity: 'Благотворительность',
        fact_other: 'Прочее',
    },
    IMPORTANT_IMPORT_FIELDS: [
        'fact_materials', 'fact_hardware', 'fact_packaging',
        'fact_printing', 'fact_molds', 'fact_commercial', 'fact_charity',
    ],

    async load() {
        return this.reload();
    },

    async reload() {
        if (this._loadingPromise) return this._loadingPromise;
        this._showLoading('Собираю текущий финансовый контур...');
        this._loadingPromise = (async () => {
            try {
                const [workspaceRaw, orders, imports, employees, timeEntries, tochkaSnapshot, fintabloSnapshot] = await Promise.all([
                    (typeof loadFinanceWorkspace === 'function') ? loadFinanceWorkspace() : null,
                    (typeof loadOrders === 'function') ? loadOrders({}) : [],
                    (typeof loadAllFintabloImports === 'function') ? loadAllFintabloImports() : [],
                    (typeof loadEmployees === 'function') ? loadEmployees() : [],
                    (typeof loadTimeEntries === 'function') ? loadTimeEntries() : [],
                    (typeof loadTochkaSnapshot === 'function') ? loadTochkaSnapshot() : null,
                    (typeof loadFintabloSnapshot === 'function') ? loadFintabloSnapshot() : null,
                ]);

                const normalizedSnapshot = (tochkaSnapshot && typeof tochkaSnapshot === 'object') ? tochkaSnapshot : null;
                const normalizedFintabloSnapshot = (fintabloSnapshot && typeof fintabloSnapshot === 'object') ? fintabloSnapshot : null;
                const normalizedWorkspace = this._normalizeWorkspace(workspaceRaw, App.settings || {});
                this.data = {
                    orders: Array.isArray(orders) ? orders : [],
                    imports: Array.isArray(imports) ? imports : [],
                    employees: Array.isArray(employees) ? employees : [],
                    timeEntries: Array.isArray(timeEntries) ? timeEntries : [],
                    indirectMonths: (typeof loadIndirectCostsData === 'function') ? (loadIndirectCostsData() || {}) : {},
                    tochkaSnapshot: normalizedSnapshot,
                    fintabloSnapshot: normalizedFintabloSnapshot,
                };
                this.workspace = this._hydrateWorkspaceFromFintablo(
                    this._hydrateWorkspaceFromTochka(normalizedWorkspace, normalizedSnapshot),
                    normalizedFintabloSnapshot,
                );
                if (!this.ui?.report?.month) {
                    this.ui.report = {
                        ...(this.ui.report || {}),
                        month: this._businessMonthFromDate(this._todayDateLocal()),
                    };
                }
                this.summary = this._buildSummary({
                    workspace: this.workspace,
                    orders: this.data.orders,
                    imports: this.data.imports,
                    employees: this.data.employees,
                    timeEntries: this.data.timeEntries,
                    indirectMonths: this.data.indirectMonths,
                    tochkaSnapshot: this.data.tochkaSnapshot,
                    fintabloSnapshot: this.data.fintabloSnapshot,
                });
                this.render();
                if (this.currentTab === 'legacy' && typeof FinTablo !== 'undefined' && typeof FinTablo.load === 'function') {
                    await FinTablo.load();
                }
            } catch (err) {
                console.error('Finance.load error:', err);
                this._showError(err?.message || 'Не удалось загрузить финансы');
            } finally {
                this._loadingPromise = null;
            }
        })();
        return this._loadingPromise;
    },

    render() {
        const loading = document.getElementById('finance-loading');
        const error = document.getElementById('finance-error');
        const content = document.getElementById('finance-content');
        if (loading) loading.style.display = 'none';
        if (error) error.style.display = 'none';
        if (content) content.style.display = '';
        this._renderStats();
        this._renderTabs();
        this._renderCurrentTab();
    },

    _renderStats() {
        const root = document.getElementById('finance-stats');
        if (!root || !this.summary) return;
        const stats = [
            {
                label: 'Источники',
                value: `${this.summary.sources.active}/${this.summary.sources.total}`,
                note: this.summary.sources.planned > 0 ? `${this.summary.sources.planned} в плане` : 'без висящих подключений',
            },
            {
                label: 'Счета',
                value: String(this.summary.accounts.total),
                note: `${this.summary.accounts.bank} банк · ${this.summary.accounts.cash} наличные`,
            },
            {
                label: 'Проекты',
                value: String(this.summary.projects.active),
                note: `${this.summary.projects.total} всего направлений`,
            },
            {
                label: 'Статьи',
                value: String(this.summary.categories.active),
                note: `${this.summary.categories.total} всего`,
            },
            {
                label: 'Авторазнос',
                value: `${this.summary.automation.autoCount}/${this.summary.rules.enabled}`,
                note: `${this.summary.transactions.reviewCount} на проверке`,
            },
            {
                label: 'Правила',
                value: `${this.summary.rules.enabled}/${this.summary.rules.total}`,
                note: `${this.summary.rules.autoApply} авто-применяются`,
            },
            {
                label: 'Точка',
                value: this.summary.tochka.accounts > 0 ? String(this.summary.tochka.accounts) : '—',
                note: this.summary.tochka.syncedAt
                    ? `${this.summary.tochka.transactions} движений · sync ${this.summary.tochka.syncedAt.slice(0, 10)}`
                    : 'снапшот банка еще не загружен',
            },
            {
                label: 'Разнесено',
                value: `${this.summary.transactions.confirmedCount}/${this.summary.transactions.total}`,
                note: `${this.summary.transactions.transferCount} переводов · ${this.summary.transactions.payrollCount} выплат ЗП`,
            },
        ];
        root.innerHTML = stats.map(stat => `
            <div class="stat-card finance-stat-card">
                <div class="stat-label">${this._esc(stat.label)}</div>
                <div class="stat-value">${this._esc(stat.value)}</div>
                <div class="stat-sub">${this._esc(stat.note)}</div>
            </div>
        `).join('');
    },

    _renderTabs() {
        document.querySelectorAll('#page-import .finance-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === this.currentTab);
        });
    },

    _renderCurrentTab() {
        const tabs = ['overview', 'operations', 'payroll', 'tools', 'legacy', 'accounts', 'categories', 'projects', 'automation'];
        tabs.forEach(tab => {
            const pane = document.getElementById(`finance-tab-${tab}`);
            if (!pane) return;
            pane.style.display = (tab === this.currentTab) ? '' : 'none';
        });
        const statsRoot = document.getElementById('finance-stats');
        if (statsRoot) {
            statsRoot.style.display = (this.currentTab === 'overview') ? '' : 'none';
        }
        if (this.currentTab === 'overview') this._renderOverviewTab();
        if (this.currentTab === 'operations') this._renderOperationsTab();
        if (this.currentTab === 'payroll') this._renderPayrollTab();
        if (this.currentTab === 'tools') this._renderToolsTab();
        if (this.currentTab === 'legacy' && typeof FinTablo !== 'undefined' && typeof FinTablo.load === 'function') {
            FinTablo.load();
        }
    },

    _renderOverviewTab() {
        const root = document.getElementById('finance-tab-overview');
        if (!root || !this.summary || !this.workspace) return;
        const accounts = this.summary.accounts.rows || [];
        const usedAccounts = accounts.filter(item => item.transactionCount > 0);
        const unusedAccounts = accounts.filter(item => item.transactionCount === 0);
        const queuePreview = this.summary.automation.queuePreview || [];
        const fixedAssets = this.summary.fixedAssets || { rows: [] };
        const reports = this.summary.reports || {};
        const reportMonth = reports.month || this._businessMonthFromDate(this._todayDateLocal());
        const reportMonthLabel = reports.monthLabel || this._formatBusinessMonth(reportMonth);
        const opiu = reports.opiu || {};
        const profitability = reports.profitability || { rows: [] };
        const obligations = reports.obligations || {};
        const balance = reports.balance || {};
        const reportPayroll = reports.payroll || { rows: [] };

        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Покрытие истории</h3>
                </div>
                <div class="finance-coverage-grid">
                    ${this._coverageItem('Банк Точка', this._formatRange(this.summary.tochka.range), `${this.summary.tochka.transactions} движений · ${this.summary.tochka.accounts} счетов`)}
                    ${this._coverageItem('FinTablo', this._formatRange(this.summary.coverage.importRange), `${this.summary.imports.total} импортов · ${this.summary.imports.distinctDeals} сделок`)}
                    ${this._coverageItem('FinTablo деньги', this._formatRange(this.summary.fintablo.range), `${this.summary.fintablo.transactions} операций · ${this.summary.fintablo.accounts} счетов`)}
                    ${this._coverageItem('Часы', this._formatRange(this.summary.coverage.timeRange), `${this.summary.timeEntries.total} записей`)}
                    ${this._coverageItem('Косвенные', this._formatMonthRange(this.summary.indirect.range), `${this.summary.indirect.months} мес.`)}
                </div>
            </div>

            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="finance-toolbar">
                    <div>
                        <h3 style="margin-bottom:4px">Отчетный каркас</h3>
                        <div class="finance-hint" style="margin-top:0">
                            Для ${this._esc(reportMonthLabel)} здесь уже собираются Деньги, ОПиУ, Рентабельность, Обязательства и Баланс без отдельной финтабловской вселенной.
                        </div>
                    </div>
                    <div style="min-width:240px">
                        <select class="input" onchange="Finance.setReportMonth(this.value)">
                            ${this._reportMonthOptions(reportMonth)}
                        </select>
                    </div>
                </div>
                <div class="finance-coverage-grid" style="margin-top:12px">
                    ${this._coverageItem('ОПиУ: выручка', this.fmtRub(opiu.revenue || 0), `EBITDA ${this.fmtRub(opiu.ebitda || 0)}`)}
                    ${this._coverageItem('ФОТ начислено', this.fmtRub(reportPayroll.totalAccrued || 0), `выплачено ${this.fmtRub(reportPayroll.paidConfirmed || 0)}`)}
                    ${this._coverageItem('Обязательства', this.fmtRub((obligations.payrollPayable || 0) + (obligations.fixedAssetPayable || 0)), `${obligations.unassignedPayrollCount || 0} неразмеченных выплат`)}
                    ${this._coverageItem('Баланс активов', this.fmtRub(balance.assetsTotal || 0), balance.syncLabel || 'операционный срез')}
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Какие счета реально используются</h3>
                    </div>
                    <div class="finance-list">
                        ${usedAccounts.length > 0
                            ? usedAccounts.slice(0, 8).map(item => `
                                <div class="finance-list-row">
                                    <strong>${this._esc(item.name)}</strong><br>
                                    ${this._esc(`${item.transactionCount} движений · последнее ${item.lastTransactionDate || '—'}`)}
                                </div>
                            `).join('')
                            : '<div class="finance-list-row">В текущем срезе нет использованных счетов.</div>'}
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Что пока не используется</h3>
                    </div>
                    <div class="finance-list">
                        ${unusedAccounts.length > 0
                            ? unusedAccounts.map(item => `
                                <div class="finance-list-row">
                                    <strong>${this._esc(item.name)}</strong><br>
                                    <span class="text-muted">${this._esc(item.note || 'Без движений в текущем окне истории')}</span>
                                </div>
                            `).join('')
                            : '<div class="finance-list-row">Все видимые счета уже попали в историю.</div>'}
                    </div>
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Основные направления</h3>
                    </div>
                    <div class="finance-pill-wrap">
                        ${(this.workspace.projects || [])
                            .filter(item => item.active !== false)
                            .map(item => this._pill(item.name))
                            .join('') || '<span class="text-muted">Направления ещё не настроены</span>'}
                    </div>
                    <div class="finance-divider"></div>
                    <div class="finance-hint">
                        На новой странице это будет главным бизнес-измерением операций вместо перегруженного набора технических полей.
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Что уже можно авторазнести</h3>
                    </div>
                    <div class="finance-list">
                        ${queuePreview.length > 0
                            ? queuePreview.slice(0, 5).map(item => `
                                <div class="finance-list-row">
                                    <strong>${this._esc(item.counterpartyName || 'Без контрагента')}</strong> · ${this._esc(item.amountLabel)}<br>
                                    ${this._esc(item.categoryName || 'Без статьи')} · ${this._esc(item.directionName || item.projectName || 'Без направления')}<br>
                                    <span class="text-muted">${this._esc(item.reasonSummary)}</span>
                                </div>
                            `).join('')
                            : '<div class="finance-list-row">После обновления снапшота здесь будут свежие предложения по разнесению.</div>'}
                    </div>
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>ОПиУ</h3>
                    </div>
                    <div class="finance-hint" style="margin-top:0">
                        Денежные операции, начисленный payroll и амортизация уже собраны в управленческую структуру месяца.
                    </div>
                    <div class="table-wrap" style="margin-top:10px">
                        <table>
                            <tbody>
                                ${this._reportMetricRow('Выручка', opiu.revenue || 0)}
                                ${this._reportMetricRow('Прямые расходы', -(opiu.direct || 0))}
                                ${this._reportMetricRow('Валовая прибыль', opiu.grossProfit || 0, true)}
                                ${this._reportMetricRow('ФОТ производство', -(opiu.payrollProduction || 0))}
                                ${this._reportMetricRow('ФОТ фикс', -(opiu.payrollFixed || 0))}
                                ${this._reportMetricRow('Коммерческие', -(opiu.commercial || 0))}
                                ${this._reportMetricRow('Косвенные', -(opiu.overhead || 0))}
                                ${this._reportMetricRow('EBITDA', opiu.ebitda || 0, true)}
                                ${this._reportMetricRow('Амортизация', -(opiu.amortization || 0))}
                                ${this._reportMetricRow('Налоги', -(opiu.taxes || 0))}
                                ${this._reportMetricRow('Операционная прибыль', opiu.operatingProfit || 0, true)}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Обязательства</h3>
                    </div>
                    <div class="finance-hint" style="margin-top:0">
                        Здесь уже видно, кому бизнес должен, где есть переплата и какие payroll-операции пока не подвязаны к человеку.
                    </div>
                    <div class="table-wrap" style="margin-top:10px">
                        <table>
                            <thead>
                                <tr>
                                    <th>Контур</th>
                                    <th>Кому / что</th>
                                    <th>Сумма</th>
                                    <th>Комментарий</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${obligations.payrollRows.length > 0
                                    ? obligations.payrollRows.map(item => `
                                        <tr>
                                            <td>Зарплата</td>
                                            <td>${this._esc(item.employeeName || 'Сотрудник')}</td>
                                            <td class="text-right">${this._esc(item.payable > 0 ? this.fmtRub(item.payable) : `переплата ${this.fmtRub(item.overpaid || 0)}`)}</td>
                                            <td>${this._esc(item.payable > 0 ? 'Начислено больше, чем подтверждено выплатами' : 'Подтверждено выплат больше, чем начислено')}</td>
                                        </tr>
                                    `).join('')
                                    : ''}
                                ${obligations.assetRows.length > 0
                                    ? obligations.assetRows.map(item => `
                                        <tr>
                                            <td>Имущество</td>
                                            <td>${this._esc(item.name || 'Объект')}</td>
                                            <td class="text-right">${this._esc(item.payable_amount > 0 ? this.fmtRub(item.payable_amount) : `переплата ${this.fmtRub(item.overpaid_amount || 0)}`)}</td>
                                            <td>${this._esc(item.vendor_name || item.project_name || 'Поставщик не указан')}</td>
                                        </tr>
                                    `).join('')
                                    : ''}
                                ${obligations.unassignedPayrollCount > 0 ? `
                                    <tr>
                                        <td>Payroll</td>
                                        <td>Без сотрудника</td>
                                        <td class="text-right">${this._esc(this.fmtRub(obligations.unassignedPayrollAmount || 0))}</td>
                                        <td>${this._esc(`${obligations.unassignedPayrollCount} операций ждут ручной привязки`)}</td>
                                    </tr>
                                ` : ''}
                                ${(obligations.payrollRows.length || obligations.assetRows.length || obligations.unassignedPayrollCount)
                                    ? ''
                                    : '<tr><td colspan="4" class="text-muted">За выбранный месяц нет открытых обязательств и переплат.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Баланс оборудования</h3>
                    </div>
                    <div class="finance-coverage-grid">
                        ${this._coverageItem('Объекты', String(fixedAssets.active || 0), `${fixedAssets.total || 0} карточек в реестре`)}
                        ${this._coverageItem('Стоимость покупки', this.fmtRub(fixedAssets.historicalCost || 0), 'что было поставлено на баланс имущества')}
                        ${this._coverageItem('Остаточная стоимость', this.fmtRub(fixedAssets.residualValue || 0), 'сколько еще живет в активе')}
                        ${this._coverageItem(`Амортизация за ${fixedAssets.reportMonthLabel || 'текущий месяц'}`, this.fmtRub(fixedAssets.currentMonthAmortization || 0), 'что должно лечь в ОПиУ')}
                        ${this._coverageItem('Долг поставщикам', this.fmtRub(fixedAssets.payableAmount || 0), fixedAssets.overpaidAmount > 0 ? `переплата ${this.fmtRub(fixedAssets.overpaidAmount || 0)}` : 'если объект оплачен не полностью')}
                    </div>
                    <div class="finance-hint">
                        Здесь логика ровно финтабловская: покупка оборудования не падает целиком в расход, а живет как актив; в расход идет только ежемесячная амортизация.
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Как это читается</h3>
                    </div>
                    <div class="finance-list">
                        <div class="finance-list-row">Покупка ОС это инвестиционное движение денег, а не расход месяца.</div>
                        <div class="finance-list-row">Амортизация это ежемесячный расход, который ровно размазывает стоимость объекта по сроку службы.</div>
                        <div class="finance-list-row">Остаточная стоимость показывает, сколько оборудования еще сидит в балансе бизнеса.</div>
                        <div class="finance-list-row">Долг поставщику нужен, если объект уже принят к учету, но оплачен не полностью.</div>
                    </div>
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Рентабельность</h3>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Направление / сделка</th>
                                    <th>Выручка</th>
                                    <th>Расходы</th>
                                    <th>Маржа</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${profitability.displayRows?.length > 0
                                    ? profitability.displayRows.map(item => `
                                        <tr>
                                            <td>${this._esc(item.label || 'Без направления')}${item.isSystem ? '<br><span class="text-muted">общий контур бизнеса</span>' : ''}</td>
                                            <td class="text-right">${this._esc(this.fmtRub(item.revenue || 0))}</td>
                                            <td class="text-right">${this._esc(this.fmtRub((item.direct || 0) + (item.commercial || 0) + (item.payroll || 0) + (item.taxes || 0) + (item.other || 0)))}</td>
                                            <td class="text-right" style="font-weight:700">${this._esc(this.fmtRub(item.margin || 0))}</td>
                                        </tr>
                                    `).join('')
                                    : '<tr><td colspan="4" class="text-muted">Пока не хватает размеченных проектных операций, чтобы честно собрать рентабельность.</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                    <div class="finance-coverage-grid" style="margin-top:10px">
                        ${this._coverageItem('Payroll в заказах', this.fmtRub(profitability.allocatedPayroll || 0), `${profitability.businessRowsCount || 0} строк рентабельности`)}
                        ${this._coverageItem('Общий фикс ФОТ', this.fmtRub(profitability.sharedPayroll || 0), 'пока без аллокации по сделкам')}
                        ${this._coverageItem('Production без заказа', this.fmtRub(profitability.unassignedPayroll || 0), `${profitability.unassignedCount || 0} операций без проектной привязки`)}
                    </div>
                    <div class="finance-hint">
                        Здесь уже учитывается начисленный production payroll, разложенный по заказам и часам. Fixed payroll пока показывается отдельным shared-контуром, чтобы рентабельность проектов не выглядела лучше реальности.
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Баланс</h3>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Строка</th>
                                    <th>Сумма</th>
                                    <th>Комментарий</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>Деньги в банке</td>
                                    <td class="text-right">${this._esc(this.fmtRub(balance.bankMoney || 0))}</td>
                                    <td>${this._esc(balance.syncLabel || 'живой срез')}</td>
                                </tr>
                                <tr>
                                    <td>Деньги вне банка</td>
                                    <td class="text-right">${this._esc(this.fmtRub(balance.nonBankMoney || 0))}</td>
                                    <td>Наличные, карты, moneybags и внешние карманы</td>
                                </tr>
                                <tr>
                                    <td>Остаток оборудования</td>
                                    <td class="text-right">${this._esc(this.fmtRub(balance.fixedAssetsResidual || 0))}</td>
                                    <td>То, что еще живет в активе и не доамортизировано</td>
                                </tr>
                                <tr>
                                    <td>Переплаты / дебиторка</td>
                                    <td class="text-right">${this._esc(this.fmtRub(balance.receivables || 0))}</td>
                                    <td>Сейчас в основном это переплата сотрудникам</td>
                                </tr>
                                <tr>
                                    <td><strong>Активы всего</strong></td>
                                    <td class="text-right"><strong>${this._esc(this.fmtRub(balance.assetsTotal || 0))}</strong></td>
                                    <td>Операционный контур на текущую дату</td>
                                </tr>
                                <tr>
                                    <td>Обязательства</td>
                                    <td class="text-right">${this._esc(this.fmtRub(balance.liabilities || 0))}</td>
                                    <td>Зарплаты к выплате + долг по имуществу</td>
                                </tr>
                                <tr>
                                    <td><strong>Собственный капитал контура</strong></td>
                                    <td class="text-right"><strong>${this._esc(this.fmtRub(balance.equity || 0))}</strong></td>
                                    <td>Активы минус обязательства</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="finance-hint">
                        Это пока операционный баланс на базе живых банковых и moneybag-снапшотов. Исторический баланс по любой дате доберем следующим отдельным слоем.
                    </div>
                </div>
            </div>

            <div class="card finance-section-card" style="margin-top:12px">
                <div class="card-header">
                    <h3>Зарплаты: начислено vs выплачено</h3>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Сотрудник</th>
                                <th>Начислено</th>
                                <th>Выплачено</th>
                                <th>Долг / переплата</th>
                                <th>Что ушло в работу</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${reportPayroll.rows.length > 0
                                ? reportPayroll.rows.slice(0, 10).map(item => `
                                    <tr>
                                        <td>
                                            <strong>${this._esc(item.employeeName)}</strong><br>
                                            <span class="text-muted">${this._esc(item.isProduction ? 'Производство' : 'Фикс')}</span>
                                        </td>
                                        <td class="text-right">${this._esc(this.fmtRub(item.accrued || 0))}</td>
                                        <td class="text-right">${this._esc(this.fmtRub(item.paid || 0))}</td>
                                        <td class="text-right">${this._esc(item.payable > 0 ? this.fmtRub(item.payable) : `переплата ${this.fmtRub(item.overpaid || 0)}`)}</td>
                                        <td>${this._esc(item.focusLabel || 'Без привязки к заказам')}</td>
                                    </tr>
                                `).join('')
                                : '<tr><td colspan="5" class="text-muted">Пока нет payroll-данных за выбранный месяц.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="card-header">
                    <h3>Реестр имущества и амортизации</h3>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Объект</th>
                                <th>Направление</th>
                                <th>Стоимость</th>
                                <th>В месяц</th>
                                <th>Накоплено</th>
                                <th>Остаток</th>
                                <th>К оплате</th>
                                <th>Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${fixedAssets.rows.length > 0
                                ? fixedAssets.rows.map(item => this._renderFixedAssetReportRow(item)).join('')
                                : '<tr><td colspan="8" class="text-muted">Пока нет карточек имущества. Их можно завести в Инструментах учета и сразу получить баланс оборудования и месячную амортизацию.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    _renderOperationsTab() {
        if (typeof document === 'undefined') return;
        const root = document.getElementById('finance-tab-operations');
        if (!root || !this.summary || !this.workspace) return;
        const filters = this.ui.operations || {};
        const composeKind = this.ui.composeKind || '';
        const dateWindow = this._resolveOperationsDateWindow(filters);
        const filteredRows = this._filterOperationRows(this.summary.transactions.rows || []);
        const visibleRows = filteredRows.slice(0, filters.limit || 200);
        const selectedSet = this._selectedOperationKeySet();
        const focusedKey = this._resolveFocusedOperationKey(visibleRows);
        const focusedItem = visibleRows.find(item => String(item.txKey || '') === focusedKey) || null;
        const selectedVisibleCount = visibleRows.filter(item => selectedSet.has(String(item.txKey || ''))).length;
        const allVisibleSelected = visibleRows.length > 0 && selectedVisibleCount === visibleRows.length;
        const selectedCount = selectedSet.size;
        const selectedKeys = Array.from(selectedSet);
        const selectedSuggestedCount = this._countSuggestedOperationKeys(selectedKeys);
        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="finance-toolbar">
                    <div>
                        <h3 style="margin-bottom:4px">Операции</h3>
                        <div class="finance-hint" style="margin-top:0">
                            Ежедневный экран: быстро посмотреть, что требует разбора, и подтвердить без лишней бухгалтерской мишуры.
                        </div>
                    </div>
                    <div class="finance-toolbar-actions">
                        <button class="btn btn-outline btn-sm ${composeKind === 'income' ? 'is-active' : ''}" onclick="Finance.markAllVisibleAs('income')">+ Поступление</button>
                        <button class="btn btn-outline btn-sm ${composeKind === 'expense' ? 'is-active' : ''}" onclick="Finance.markAllVisibleAs('expense')">+ Списание</button>
                        <button class="btn btn-outline btn-sm ${composeKind === 'transfer' ? 'is-active' : ''}" onclick="Finance.markAllVisibleAs('transfer')">+ Перевод</button>
                        <button class="btn btn-primary btn-sm" onclick="Finance.setTab('tools')">Автоправила</button>
                    </div>
                </div>
                ${composeKind ? this._renderManualComposer(composeKind) : ''}
                <div class="finance-quick-tabs">
                    ${this._renderOperationQueueTab('all', 'Все', this.summary.transactions.rows || [], filters.queue)}
                    ${this._renderOperationQueueTab('review', 'На проверке', this.summary.transactions.rows || [], filters.queue)}
                    ${this._renderOperationQueueTab('manual', 'Ручные', this.summary.transactions.rows || [], filters.queue)}
                    ${this._renderOperationQueueTab('auto', 'Авто', this.summary.transactions.rows || [], filters.queue)}
                    ${this._renderOperationQueueTab('transfers', 'Переводы', this.summary.transactions.rows || [], filters.queue)}
                    ${this._renderOperationQueueTab('payroll', 'ЗП', this.summary.transactions.rows || [], filters.queue)}
                </div>
                <div class="finance-filterbar">
                    <input class="input" placeholder="Поиск по контрагенту, описанию, счету" value="${this._escAttr(filters.search || '')}" oninput="Finance.setOperationsFilter('search', this.value)">
                    <select class="input" onchange="Finance.setOperationsFilter('account', this.value)">
                        ${this._accountFilterOptions(filters.account)}
                    </select>
                    <select class="input" onchange="Finance.setOperationsFilter('category', this.value)">
                        ${this._categoryFilterOptions(filters.category)}
                    </select>
                    <select class="input" onchange="Finance.setOperationsFilter('direction', this.value)">
                        ${this._directionFilterOptions(filters.direction)}
                    </select>
                    <button class="btn btn-outline btn-sm ${filters.show_hidden_accounts ? 'is-active' : ''}" onclick="Finance.toggleHiddenAccountsFilter()">Скрытые счета</button>
                    <button class="btn btn-outline btn-sm" onclick="Finance.resetOperationsFilters()">Сбросить фильтры</button>
                </div>
                <div class="finance-periodbar">
                    <div class="finance-periodbar__label">Период</div>
                    <div class="finance-quick-tabs finance-quick-tabs--period">
                        ${this._renderOperationsPeriodPresets(filters.period)}
                    </div>
                </div>
                ${filters.period === 'custom' ? `
                    <div class="finance-datebar">
                        <input class="input" type="date" value="${this._escAttr(filters.start_date || '')}" onchange="Finance.setOperationsFilter('start_date', this.value)">
                        <input class="input" type="date" value="${this._escAttr(filters.end_date || '')}" onchange="Finance.setOperationsFilter('end_date', this.value)">
                    </div>
                ` : ''}
                ${this._renderOperationsContextBar({
                    filters,
                    visibleRows,
                    filteredRows,
                    dateWindow,
                })}
                <div class="finance-ops-toolbarline">
                    <div class="finance-ops-toolbarline-copy">
                        ${selectedCount > 0
                            ? `Выбрано ${this._esc(String(selectedCount))} операций`
                            : `На экране ${this._esc(String(visibleRows.length))} операций`}
                    </div>
                    <div class="finance-ops-toolbarline-actions">
                        <button class="btn btn-outline btn-sm" onclick="Finance.toggleAllVisibleOperations()">${allVisibleSelected ? 'Снять выбор на экране' : 'Выбрать все на экране'}</button>
                        ${selectedCount > 0 ? '<button class="btn btn-outline btn-sm" onclick="Finance.clearOperationSelection()">Очистить выбор</button>' : ''}
                    </div>
                </div>
                ${selectedCount > 0 ? `
                    <div class="finance-batchbar">
                        <div class="finance-batchbar-copy">
                            <span>Пакетный разнос</span>
                            <strong>Выбрано ${this._esc(String(selectedCount))} операций · подсказка есть для ${this._esc(String(selectedSuggestedCount))}</strong>
                        </div>
                        <div class="finance-batchbar__section">
                            <div class="finance-batchbar__label-row">
                                <div class="finance-batchbar__label">Поля для пачки</div>
                                <button class="btn btn-outline btn-sm" onclick="Finance.resetBatchDraft()">Сбросить форму</button>
                            </div>
                            <div class="finance-batchbar-fields">
                                <select class="input" onchange="Finance.setBatchField('batch_category_id', this.value)">
                                    ${this._batchCategoryOptions(filters.batch_category_id)}
                                </select>
                                <select class="input" onchange="Finance.setBatchField('batch_project_id', this.value)">
                                    ${this._batchProjectOptions(filters.batch_project_id)}
                                </select>
                                <input class="input" list="finance-order-datalist" placeholder="Заказ / сделка" value="${this._escAttr(filters.batch_project_label || '')}" oninput="Finance.setBatchField('batch_project_label', this.value)">
                                <input class="input" placeholder="Заметка" value="${this._escAttr(filters.batch_note || '')}" oninput="Finance.setBatchField('batch_note', this.value)">
                            </div>
                        </div>
                        <div class="finance-batchbar__section">
                            <div class="finance-batchbar__label">Быстрые действия</div>
                            <div class="finance-batchbar-actions">
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchSuggestions(false)">Подсказки</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchSuggestions(true)">Подсказки + подтвердить</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchFields(false)">Применить поля</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchFields(true)">Поля + подтвердить</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchAction('confirm')">Подтвердить</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchAction('transfer')">В перевод</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchAction('payroll')">В ЗП</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchAction('ignore')">Скрыть</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchAction('reset')">Сбросить</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.clearOperationSelection()">Очистить выбор</button>
                            </div>
                        </div>
                        <div class="finance-batchbar__section finance-batchbar__section--compact">
                            <div class="finance-batchbar__label">Быстрые очистки</div>
                            <div class="finance-batchbar-actions finance-batchbar-actions--reset">
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchClear('category')">Без статьи</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchClear('project')">Без направления</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchClear('project_label')">Без сделки</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchClear('note')">Без заметки</button>
                                <button class="btn btn-outline btn-sm" onclick="Finance.applyBatchClear('all')">Очистить поля</button>
                            </div>
                        </div>
                        ${this._renderOperationQuickPresets('batch')}
                    </div>
                ` : ''}
            </div>

            <div class="card finance-section-card finance-ops-layout-card">
                <div class="finance-ops-workspace">
                    <div class="finance-ops-listpane">
                        <div class="finance-ops-listhead">
                            <div>
                                <div class="finance-ops-listtitle">Лента операций</div>
                                <div class="finance-ops-listsub">Сначала день и итог дня, внутри компактный реестр операций без лишней бухгалтерской мишуры.</div>
                            </div>
                            <div class="finance-ops-listmeta">${this._esc(filters.queue === 'review' ? 'Фокус: на проверке · по дням' : `${dateWindow.label} · по дням`)}</div>
                        </div>
                        <div class="finance-ops-list">
                            ${visibleRows.length > 0
                                ? this._groupOperationsByDay(visibleRows).map(group => this._renderOperationDayGroup(group, selectedSet, focusedKey)).join('')
                                : '<div class="finance-empty-state">Нет операций под текущий фильтр.</div>'}
                        </div>
                        ${filteredRows.length > visibleRows.length
                            ? `<div class="finance-footer-actions"><button class="btn btn-outline" onclick="Finance.showMoreOperations()">Показать ещё ${Math.min(200, filteredRows.length - visibleRows.length)}</button></div>`
                            : ''}
                    </div>
                    <div class="finance-ops-detailpane">
                        ${focusedItem
                            ? this._renderOperationInspector(focusedItem, {
                                isSelected: selectedSet.has(String(focusedItem.txKey || '')),
                                index: visibleRows.findIndex(row => String(row.txKey || '') === String(focusedItem.txKey || '')),
                                total: visibleRows.length,
                            })
                            : '<div class="finance-empty-state">Выбери операцию слева, и здесь откроется карточка разнесения.</div>'}
                    </div>
                </div>
            </div>
            <datalist id="finance-order-datalist">
                ${this._orderDatalistOptions()}
            </datalist>
        `;
    },

    _renderPayrollTab() {
        const root = document.getElementById('finance-tab-payroll');
        if (!root || !this.summary || !this.workspace) return;
        const reportPayroll = this.summary.reports?.payroll || { rows: [] };
        const rows = reportPayroll.rows || [];
        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="finance-toolbar">
                    <div>
                        <h3 style="margin-bottom:4px">Зарплаты</h3>
                        <div class="finance-hint" style="margin-top:0">
                            Начисление считаем из часов и payroll-config сотрудников, а операции читаем как факт выплаты.
                        </div>
                    </div>
                    <div style="min-width:240px">
                        <select class="input" onchange="Finance.setReportMonth(this.value)">
                            ${this._reportMonthOptions(this.summary.reports?.month || '')}
                        </select>
                    </div>
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Контур зарплаты</h3>
                    </div>
                    <div class="finance-coverage-grid">
                        ${this._coverageItem('Начислено всего', this.fmtRub(reportPayroll.totalAccrued || 0), `${reportPayroll.employeeCount || 0} сотрудников в срезе`)}
                        ${this._coverageItem('Производство / фикс', `${this.fmtRub(reportPayroll.productionAccrued || 0)} / ${this.fmtRub(reportPayroll.nonProductionAccrued || 0)}`, 'начисления за месяц')}
                        ${this._coverageItem('Подтверждено выплат', this.fmtRub(reportPayroll.paidConfirmed || 0), `всего помечено ${this.fmtRub(reportPayroll.paidMarked || 0)}`)}
                        ${this._coverageItem('К выплате / переплата', `${this.fmtRub(reportPayroll.payableAmount || 0)} / ${this.fmtRub(reportPayroll.overpaidAmount || 0)}`, 'обязательство по сотрудникам')}
                    </div>
                    <div class="finance-hint">
                        Здесь видно не только списания, а связка начислено → выплачено → долг / переплата. Это уже ближе к настоящей зарплатной ведомости, а не к простому списку банковских операций.
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Что требует внимания</h3>
                    </div>
                    <div class="finance-list">
                        <div class="finance-list-row">К выплате: <strong>${this._esc(this.fmtRub(reportPayroll.payableAmount || 0))}</strong></div>
                        <div class="finance-list-row">Переплата: <strong>${this._esc(this.fmtRub(reportPayroll.overpaidAmount || 0))}</strong></div>
                        <div class="finance-list-row">Без сотрудника: <strong>${this._esc(`${reportPayroll.unassignedPaymentsCount || 0} шт. · ${this.fmtRub(reportPayroll.unassignedPaymentsAmount || 0)}`)}</strong></div>
                        <div class="finance-list-row">Если выплата на самом деле была переводом или налогом, это можно прямо здесь перевести в другой тип операции.</div>
                    </div>
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="card-header">
                    <h3>Начисления и факты выплат по сотрудникам</h3>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Сотрудник</th>
                                <th>Часы</th>
                                <th>Начислено</th>
                                <th>Выплачено</th>
                                <th>Долг / переплата</th>
                                <th>Что ушло в работу</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.length > 0
                                ? rows.map(item => `
                                    <tr>
                                        <td>
                                            <strong>${this._esc(item.employeeName)}</strong><br>
                                            <span class="text-muted">${this._esc(item.isProduction ? 'Производство' : 'Фикс')} · ${this._esc(item.payrollProfile || '—')}</span>
                                        </td>
                                        <td class="text-right">${this._esc(String(this._roundMoney(item.totalHours || 0)))}</td>
                                        <td class="text-right">${this._esc(this.fmtRub(item.accrued || 0))}</td>
                                        <td class="text-right">${this._esc(this.fmtRub(item.paid || 0))}</td>
                                        <td class="text-right">${this._esc(item.payable > 0 ? this.fmtRub(item.payable) : `переплата ${this.fmtRub(item.overpaid || 0)}`)}</td>
                                        <td>${this._esc(item.focusLabel || 'Без привязки к заказам')}</td>
                                    </tr>
                                `).join('')
                                : '<tr><td colspan="6" class="text-muted">Пока нет payroll-данных за выбранный месяц.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="card-header">
                    <h3>Неразмеченные payroll-выплаты</h3>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Контрагент</th>
                                <th>Счет</th>
                                <th>Сумма</th>
                                <th>Статус</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(reportPayroll.unassignedPayments || []).length > 0
                                ? (reportPayroll.unassignedPayments || []).map(item => `
                                    <tr>
                                        <td>${this._esc(item.date || '—')}</td>
                                        <td>${this._esc(item.counterpartyName || 'Без контрагента')}</td>
                                        <td>${this._esc(item.accountLabel || '—')}</td>
                                        <td class="text-right">${this._esc(item.amountLabel || this.fmtRub(item.amount || 0))}</td>
                                        <td>${this._esc(item.routeLabel || '—')}</td>
                                    </tr>
                                `).join('')
                                : '<tr><td colspan="5" class="text-muted">За этот месяц нет payroll-операций без сотрудника.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    _renderToolsTab() {
        const root = document.getElementById('finance-tab-tools');
        if (!root || !this.summary || !this.workspace) return;
        const used = (this.summary.accounts.rows || []).filter(item => item.transactionCount > 0);
        const fixedAssetRows = this.summary.fixedAssets?.rows || [];
        const fixedAssetMap = new Map(fixedAssetRows.map(item => [String(item.id || ''), item]));
        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Инструменты учета</h3>
                </div>
                <div class="finance-hint">
                    Здесь осталась служебная настройка: счета, статьи, направления и автоправила. Ежедневная работа по операциям теперь вынесена отдельно.
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Счета</h3>
                        <button class="btn btn-outline btn-sm" onclick="Finance.addAccount()">+ Счёт</button>
                    </div>
                    <div class="finance-hint" style="margin-top:0;margin-bottom:10px">
                        Здесь теперь можно не только архивировать счета, но и решать, показывать ли их в ежедневном экране &laquo;Деньги&raquo;. Это особенно важно для налоговых, благотворительных и скрытых карманов из FinTablo.
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Счет</th>
                                    <th>Тип</th>
                                    <th>Ответственный</th>
                                    <th>В деньгах</th>
                                    <th>Скрыт в total</th>
                                    <th>Статус</th>
                                    <th>Движения</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(this.workspace.accounts || []).map(account => this._renderAccountToolRow(account, used)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Направления бизнеса</h3>
                        <button class="btn btn-outline btn-sm" onclick="Finance.addProject()">+ Направление</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Активно</th>
                                    <th>Название</th>
                                    <th>Тип</th>
                                    <th>Комментарий</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(this.workspace.projects || []).map(project => this._renderProjectToolRow(project)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Имущество и амортизация</h3>
                    <button class="btn btn-outline btn-sm" onclick="Finance.addFixedAsset()">+ Объект</button>
                </div>
                <div class="finance-hint" style="margin-top:0;margin-bottom:10px">
                    Здесь живут станки, техника, мебель, инструменты и софт, которые не надо списывать одним махом. Для каждого объекта считаем стоимость, ежемесячную амортизацию, остаток и долг поставщику, если оплата была частичной.
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Актив</th>
                                <th>Объект</th>
                                <th>Тип</th>
                                <th>Стоимость</th>
                                <th>Оплачено</th>
                                <th>Старт ОПиУ</th>
                                <th>Срок, мес</th>
                                <th>Направление</th>
                                <th>Куплено ранее</th>
                                <th>Остаток / долг</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(this.workspace.fixedAssets || []).length > 0
                                ? (this.workspace.fixedAssets || []).map(item => this._renderFixedAssetToolRow(item, fixedAssetMap.get(String(item.id || '')))).join('')
                                : '<tr><td colspan="11" class="text-muted">Пока нет объектов имущества. Добавь оборудование, и в Отчетах сразу появятся остаточная стоимость, амортизация и долг поставщику.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Статьи</h3>
                        <button class="btn btn-outline btn-sm" onclick="Finance.addCategory()">+ Статья</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Активна</th>
                                    <th>Название</th>
                                    <th>Группа</th>
                                    <th>Связь</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(this.workspace.categories || []).map(category => this._renderCategoryToolRow(category)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Автоправила</h3>
                        <button class="btn btn-outline btn-sm" onclick="Finance.addRule()">+ Правило</button>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Вкл</th>
                                    <th>Название</th>
                                    <th>Триггер</th>
                                    <th>Статья</th>
                                    <th>Направление</th>
                                    <th>Авто</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(this.workspace.rules || []).map(rule => this._renderRuleToolRow(rule)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="card-header">
                    <h3>Постоянные списания и пополнения</h3>
                    <button class="btn btn-outline btn-sm" onclick="Finance.addRecurringTransaction()">+ Автосписание</button>
                </div>
                <div class="finance-hint" style="margin-top:0;margin-bottom:10px">
                    Здесь живут ежемесячные траты вне Точки: зарубежные подписки, внешние карты и любые регулярные движения, которые должны автоматически появляться в &laquo;Деньги&raquo;.
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Вкл</th>
                                <th>Название</th>
                                <th>Счет</th>
                                <th>Тип</th>
                                <th>Сумма</th>
                                <th>Старт</th>
                                <th>День</th>
                                <th>Статья</th>
                                <th>Направление</th>
                                <th>Комментарий</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(this.workspace.recurringTransactions || []).length > 0
                                ? (this.workspace.recurringTransactions || []).map(item => this._renderRecurringRow(item)).join('')
                                : '<tr><td colspan="11" class="text-muted">Пока нет автосписаний. Сюда удобно вынести Полину карту, зарубежные сервисы, нал и любые регулярные внебанковские платежи.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    _renderAccountsTab() {
        const root = document.getElementById('finance-tab-accounts');
        if (!root || !this.workspace) return;
        root.innerHTML = `
            <div class="finance-grid-2">
                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Источники</h3>
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Источник</th>
                                    <th>Тип</th>
                                    <th>Статус</th>
                                    <th>Что закрывает</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(this.workspace.sources || []).map(source => `
                                    <tr>
                                        <td>${this._esc(source.name)}</td>
                                        <td>${this._esc(this.SOURCE_KIND_LABELS[source.kind] || source.kind || '—')}</td>
                                        <td>${this._statusChip(source.status, 'source')}</td>
                                        <td>${this._esc(source.note || '—')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="card finance-section-card">
                    <div class="card-header">
                        <h3>Счета и карманы</h3>
                        <div class="flex gap-8">
                            <button class="btn btn-outline btn-sm" onclick="Finance.addAccount()">+ Счёт</button>
                            <button class="btn btn-outline btn-sm" onclick="Finance.resetWorkspace()">Сбросить к рекомендованной схеме</button>
                        </div>
                    </div>
                    <div class="finance-hint">
                        Здесь лучше хранить не только реальные банковские счета, но и наличные у людей, Китай, депозиты, налоговые резервы и любые отдельные карманы движения денег.
                    </div>
                    <div class="table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Название</th>
                                    <th>Тип</th>
                                    <th>Ответственный</th>
                                    <th>Источник</th>
                                    <th>В деньгах</th>
                                    <th>Скрыт в total</th>
                                    <th>Статус</th>
                                    <th>Заметка</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                ${(this.workspace.accounts || []).map(account => this._renderAccountRow(account)).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    },

    _renderCategoriesTab() {
        const root = document.getElementById('finance-tab-categories');
        if (!root || !this.workspace || !this.summary) return;
        const groupPills = Object.entries(this.summary.categories.byGroup || {})
            .sort((a, b) => b[1] - a[1])
            .map(([group, count]) => this._pill(`${this.GROUP_LABELS[group] || group}: ${count}`))
            .join('');
        const optimizationNotes = [
            'Доходы разделены по каналам: корп, интернет-магазин, маркетплейсы, музеи, воркшопы.',
            'Налоги разведены отдельно: по заказам, по сотрудникам, УСН / ЕНП, НДС.',
            'Прямые расходы выделены в производственный контур: материалы, упаковка, нанесение, молды, подрядчики, логистика.',
            'Финансовые движения вроде депозитов, вкладов и переводов не смешиваются с операционными затратами.',
        ];

        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Как я предлагаю разложить статьи</h3>
                    <div class="flex gap-8">
                        <button class="btn btn-outline btn-sm" onclick="Finance.addCategory()">+ Статья</button>
                    </div>
                </div>
                <div class="finance-pill-wrap">${groupPills}</div>
                <div class="finance-divider"></div>
                <div class="finance-list">
                    ${optimizationNotes.map(line => `<div class="finance-list-row">${this._esc(line)}</div>`).join('')}
                </div>
                <div class="finance-hint">
                    Логика статей здесь уже ближе к тому, как вы реально пользуетесь системой: сначала проект и тип расхода, потом уже детализация внутри направления.
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Активна</th>
                                <th>Название</th>
                                <th>Группа</th>
                                <th>Контур</th>
                                <th>Источник</th>
                                <th>Связь с калькулятором</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(this.workspace.categories || []).map(category => this._renderCategoryRow(category)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    _renderProjectsTab() {
        const root = document.getElementById('finance-tab-projects');
        if (!root || !this.workspace) return;
        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Направления и каналы</h3>
                    <div class="flex gap-8">
                        <button class="btn btn-outline btn-sm" onclick="Finance.addProject()">+ Проект</button>
                    </div>
                </div>
                <div class="finance-hint">
                    Проект здесь - это не только “заказ”, а любое устойчивое направление: основное производство, воркшопы, интернет-магазин, маркетплейсы, музейный контур, отдельная площадка вроде Дмитрова.
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Активен</th>
                                <th>Название</th>
                                <th>Тип</th>
                                <th>Доходная статья по умолчанию</th>
                                <th>Комментарий</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(this.workspace.projects || []).map(project => this._renderProjectRow(project)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    _renderAutomationTab() {
        const root = document.getElementById('finance-tab-automation');
        if (!root || !this.workspace || !this.summary) return;
        const queue = this.workspace.queueConfig || this._defaultQueueConfig();
        const queuePreview = this.summary.automation.queuePreview || [];
        root.innerHTML = `
            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Контур ежедневного авторазноса</h3>
                </div>
                <div class="finance-settings-grid" data-finance-queue-config>
                    <label class="finance-setting-card">
                        <span class="finance-setting-label">Ежедневный прогон</span>
                        <span class="finance-setting-note">Система раз в день проходит по новым оплатам и обновляет предложения.</span>
                        <input type="checkbox" data-field="dailySyncEnabled" ${queue.dailySyncEnabled ? 'checked' : ''}>
                    </label>
                    <label class="finance-setting-card">
                        <span class="finance-setting-label">Порог авто-применения</span>
                        <span class="finance-setting-note">Выше этого порога движение можно раскладывать без ручного подтверждения.</span>
                        <input class="input" type="number" min="0" max="1" step="0.01" data-field="autoApplyThreshold" value="${this._escAttr(String(queue.autoApplyThreshold))}">
                    </label>
                    <label class="finance-setting-card">
                        <span class="finance-setting-label">Порог review queue</span>
                        <span class="finance-setting-note">Все, что ниже, обязательно отправляем на проверку.</span>
                        <input class="input" type="number" min="0" max="1" step="0.01" data-field="reviewThreshold" value="${this._escAttr(String(queue.reviewThreshold))}">
                    </label>
                    <label class="finance-setting-card">
                        <span class="finance-setting-label">Research по контрагентам</span>
                        <span class="finance-setting-note">Поиск по истории и внешним источникам для новых ООО и ИП.</span>
                        <input type="checkbox" data-field="researchEnabled" ${queue.researchEnabled ? 'checked' : ''}>
                    </label>
                    <label class="finance-setting-card">
                        <span class="finance-setting-label">Ритм прохода</span>
                        <span class="finance-setting-note">Текстовое описание рабочего ритма.</span>
                        <input class="input" data-field="cadenceLabel" value="${this._escAttr(queue.cadenceLabel || '')}">
                    </label>
                    <label class="finance-setting-card">
                        <span class="finance-setting-label">Источники подсказок</span>
                        <span class="finance-setting-note">Через запятую: history, keywords, web, order_match и т.п.</span>
                        <input class="input" data-field="researchSources" value="${this._escAttr((queue.researchSources || []).join(', '))}">
                    </label>
                    <label class="finance-setting-card finance-setting-card--wide">
                        <span class="finance-setting-label">Замечание к очереди</span>
                        <span class="finance-setting-note">Что система должна объяснять перед авто-применением.</span>
                        <input class="input" data-field="note" value="${this._escAttr(queue.note || '')}">
                    </label>
                </div>
            </div>

            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Последний срез Точки</h3>
                </div>
                <div class="finance-hint">
                    Прямой browser-fetch в Точку может упираться в CORS, поэтому рабочий путь здесь такой: локальный sync-скрипт или автоматизация обновляют снапшот, а страница уже строит по нему review queue.
                </div>
                <div class="finance-coverage-grid" style="margin-top:12px">
                    ${this._coverageItem('Sync', this.summary.tochka.syncedAt ? this.summary.tochka.syncedAt.slice(0, 10) : 'Нет', this.summary.tochka.syncedAt ? 'данные банка доступны' : 'нужно обновить снапшот')}
                    ${this._coverageItem('Счета', String(this.summary.tochka.accounts || 0), this.summary.tochka.accounts > 0 ? 'получены из Точки' : 'нет данных')}
                    ${this._coverageItem('Движения', String(this.summary.tochka.transactions || 0), this.summary.tochka.latestTransactionDate ? `последнее ${this.summary.tochka.latestTransactionDate}` : 'нет транзакций')}
                    ${this._coverageItem('Авто / review', `${this.summary.automation.autoCount || 0} / ${this.summary.automation.reviewCount || 0}`, `${this.summary.automation.unmatchedCount || 0} без матча`)}
                </div>
            </div>

            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Review queue по последним движениям</h3>
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Счет</th>
                                <th>Контрагент / описание</th>
                                <th>Сумма</th>
                                <th>Предложение</th>
                                <th>Уверенность</th>
                                <th>Почему</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${queuePreview.length > 0
                                ? queuePreview.map(item => `
                                    <tr>
                                        <td>${this._esc(item.date || '—')}</td>
                                        <td>${this._esc(item.accountLabel || '—')}</td>
                                        <td>
                                            <strong>${this._esc(item.counterpartyName || 'Без контрагента')}</strong><br>
                                            <span class="text-muted">${this._esc(item.descriptionShort || 'Без описания')}</span>
                                        </td>
                                        <td>${this._esc(item.amountLabel)}</td>
                                        <td>${this._esc(item.categoryName || 'Без статьи')} → ${this._esc(item.projectName || 'Без проекта')}<br><span class="text-muted">${this._esc(item.routeLabel)}</span></td>
                                        <td>${this._esc(this._formatPercent(item.confidence))}</td>
                                        <td>${this._esc(item.reasonSummary)}</td>
                                    </tr>
                                `).join('')
                                : '<tr><td colspan="7" class="text-muted">Снапшот Точки еще не загружен или в нем пока нет движений за выбранный период.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card finance-section-card" style="margin-bottom:12px">
                <div class="card-header">
                    <h3>Профили контрагентов</h3>
                    <button class="btn btn-outline btn-sm" onclick="Finance.addCounterparty()">+ Профиль</button>
                </div>
                <div class="finance-hint">
                    Здесь живет не просто список названий, а знание о контрагенте: кто это, что он обычно продает, к какому проекту тяготеет и какой статьей закрывается по умолчанию.
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Активен</th>
                                <th>Профиль / контрагент</th>
                                <th>Роль</th>
                                <th>ИНН</th>
                                <th>Что может продавать / делать</th>
                                <th>Проект по умолчанию</th>
                                <th>Статья по умолчанию</th>
                                <th>Research</th>
                                <th>Ключи матчинга</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(this.workspace.counterparties || []).map(item => this._renderCounterpartyRow(item)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card finance-section-card">
                <div class="card-header">
                    <h3>Правила матчинга</h3>
                    <button class="btn btn-outline btn-sm" onclick="Finance.addRule()">+ Правило</button>
                </div>
                <div class="finance-hint">
                    Приоритет правил простой: сначала точные системные совпадения (налоги / банки / каналы), потом контрагент + счет, потом описание и ключевые слова, и только потом web-угадывание для новых случаев.
                </div>
                <div class="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>Вкл</th>
                                <th>Название</th>
                                <th>Триггер</th>
                                <th>Что ищем</th>
                                <th>Счет</th>
                                <th>Профиль</th>
                                <th>Проект</th>
                                <th>Статья</th>
                                <th>Уверенность</th>
                                <th>Авто</th>
                                <th>Комментарий</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${(this.workspace.rules || []).map(rule => this._renderRuleRow(rule)).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    setTab(tab) {
        this._syncWorkspaceFromDom();
        this.summary = this._buildSummary({
            workspace: this.workspace,
            orders: this.data.orders,
            imports: this.data.imports,
            employees: this.data.employees,
            timeEntries: this.data.timeEntries,
            indirectMonths: this.data.indirectMonths,
            tochkaSnapshot: this.data.tochkaSnapshot,
            fintabloSnapshot: this.data.fintabloSnapshot,
        });
        this.currentTab = tab || 'overview';
        this._renderTabs();
        this._renderCurrentTab();
    },

    setOperationsFilter(field, value) {
        this._syncWorkspaceFromDom();
        const nextValue = String(value || '').trim();
        this.ui.operations = {
            ...this.ui.operations,
            [field]: nextValue,
            limit: field === 'limit' ? Number(value) || 200 : 200,
        };
        if (field === 'period' && nextValue !== 'custom') {
            this.ui.operations.start_date = '';
            this.ui.operations.end_date = '';
        }
        this._renderOperationsTab();
    },

    setReportMonth(value) {
        this.ui.report = {
            ...(this.ui.report || {}),
            month: this._parseBusinessMonth(value) || this._businessMonthFromDate(this._todayDateLocal()),
        };
        this.summary = this._buildSummary({
            workspace: this.workspace,
            orders: this.data.orders,
            imports: this.data.imports,
            employees: this.data.employees,
            timeEntries: this.data.timeEntries,
            indirectMonths: this.data.indirectMonths,
            tochkaSnapshot: this.data.tochkaSnapshot,
            fintabloSnapshot: this.data.fintabloSnapshot,
        });
        if (this.currentTab === 'payroll') this._renderPayrollTab();
        else this._renderOverviewTab();
    },

    toggleHiddenAccountsFilter() {
        this._syncWorkspaceFromDom();
        this.ui.operations = {
            ...this.ui.operations,
            show_hidden_accounts: !this.ui?.operations?.show_hidden_accounts,
            limit: 200,
        };
        this._renderOperationsTab();
    },

    resetOperationsFilters() {
        this._syncWorkspaceFromDom();
        this.ui.operations = {
            search: '',
            account: '',
            category: '',
            direction: '',
            queue: 'review',
            period: 'all',
            start_date: '',
            end_date: '',
            limit: 200,
            show_hidden_accounts: false,
            selected_keys: this.ui?.operations?.selected_keys || [],
            focus_tx_key: this.ui?.operations?.focus_tx_key || '',
            batch_category_id: this.ui?.operations?.batch_category_id || '__keep__',
            batch_project_id: this.ui?.operations?.batch_project_id || '__keep__',
            batch_project_label: this.ui?.operations?.batch_project_label || '',
            batch_note: this.ui?.operations?.batch_note || '',
            batch_template_name: this.ui?.operations?.batch_template_name || '',
            template_name: this.ui?.operations?.template_name || '',
        };
        this._renderOperationsTab();
    },

    clearOperationsFilter(field) {
        this._syncWorkspaceFromDom();
        const current = { ...(this.ui.operations || {}) };
        if (field === 'period') {
            current.period = 'all';
            current.start_date = '';
            current.end_date = '';
        } else if (field === 'show_hidden_accounts') {
            current.show_hidden_accounts = false;
        } else if (Object.prototype.hasOwnProperty.call(current, field)) {
            current[field] = '';
        }
        this.ui.operations = {
            ...current,
            limit: 200,
        };
        this._renderOperationsTab();
    },

    showMoreOperations() {
        this._syncWorkspaceFromDom();
        this.ui.operations.limit = (this.ui.operations.limit || 200) + 200;
        this._renderOperationsTab();
    },

    setBatchField(field, value) {
        this.ui.operations = {
            ...this.ui.operations,
            [field]: String(value ?? ''),
        };
    },

    setOperationUiField(field, value) {
        this.ui.operations = {
            ...this.ui.operations,
            [field]: String(value ?? ''),
        };
    },

    toggleOperationSelection(txKey) {
        const key = String(txKey || '');
        if (!key) return;
        const next = new Set(this._selectedOperationKeySet());
        if (next.has(key)) next.delete(key);
        else next.add(key);
        this.ui.operations.selected_keys = Array.from(next);
        this._renderOperationsTab();
    },

    toggleAllVisibleOperations() {
        const visibleKeys = this._visibleOperationKeys();
        if (visibleKeys.length === 0) return;
        const next = new Set(this._selectedOperationKeySet());
        const allSelected = visibleKeys.every(key => next.has(key));
        visibleKeys.forEach(key => {
            if (allSelected) next.delete(key);
            else next.add(key);
        });
        this.ui.operations.selected_keys = Array.from(next);
        this._renderOperationsTab();
    },

    toggleDayOperationSelection(dateKey) {
        const keys = this._visibleDayOperationKeys(dateKey);
        if (keys.length === 0) return;
        const next = new Set(this._selectedOperationKeySet());
        const allSelected = keys.every(key => next.has(key));
        keys.forEach(key => {
            if (allSelected) next.delete(key);
            else next.add(key);
        });
        this.ui.operations.selected_keys = Array.from(next);
        this._renderOperationsTab();
    },

    clearOperationSelection() {
        this.ui.operations.selected_keys = [];
        this._renderOperationsTab();
    },

    focusOperation(txKey) {
        this._syncWorkspaceFromDom();
        this.ui.operations = {
            ...this.ui.operations,
            focus_tx_key: String(txKey || '').trim(),
        };
        this._renderOperationsTab();
    },

    focusRelativeOperation(offset = 1) {
        this._syncWorkspaceFromDom();
        const keys = this._visibleOperationKeys();
        const currentKey = String(this.ui?.operations?.focus_tx_key || '').trim();
        const nextKey = this._pickNeighborOperationKey(keys, currentKey, Number(offset) || 1);
        if (!nextKey || nextKey === currentKey) return;
        this.ui.operations = {
            ...this.ui.operations,
            focus_tx_key: nextKey,
        };
        this._renderOperationsTab();
    },

    async applyBatchAction(action) {
        this._syncWorkspaceFromDom();
        const keys = Array.from(this._selectedOperationKeySet());
        if (keys.length === 0) {
            App.toast('Сначала выберите операции');
            return;
        }
        keys.forEach(txKey => {
            if (action === 'confirm') {
                this._confirmTransactionDecisionLocally(txKey);
                return;
            }
            if (action === 'reset') {
                this.workspace.transactionDecisions = (this.workspace.transactionDecisions || []).filter(item => String(item?.tx_key || '') !== String(txKey || ''));
                return;
            }
            this._markTransactionKindLocally(txKey, action);
        });
        this.ui.operations.selected_keys = [];
        const toastMap = {
            confirm: 'Пачка операций подтверждена',
            transfer: 'Пачка операций переведена в переводы',
            payroll: 'Пачка операций переведена в зарплаты',
            ignore: 'Пачка операций скрыта',
            reset: 'Ручная разметка по выбранным операциям сброшена',
        };
        await this._persistWorkspace(toastMap[action] || 'Пакетная операция выполнена');
    },

    async applyBatchFields(confirmAfter = false) {
        this._syncWorkspaceFromDom();
        const keys = Array.from(this._selectedOperationKeySet());
        if (keys.length === 0) {
            App.toast('Сначала выберите операции');
            return;
        }
        const batch = this._currentBatchDraft();
        const hasFields = batch.categoryId !== '__keep__'
            || batch.projectId !== '__keep__'
            || !!batch.projectLabel
            || !!batch.note;
        if (!hasFields && !confirmAfter) {
            App.toast('Выберите хотя бы одно поле для пакетного применения');
            return;
        }
        keys.forEach(txKey => {
            const tx = this._findTransactionByKey(txKey);
            const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
            this._applyBatchFieldsToDecision(decision, tx, batch);
            if (confirmAfter) decision.confirmed = true;
            decision.updated_at = new Date().toISOString();
            this._upsertTransactionDecision(decision);
        });
        this.ui.operations.selected_keys = [];
        const toastMessage = confirmAfter
            ? (hasFields ? 'Поля применены и операции подтверждены' : 'Выбранные операции подтверждены')
            : 'Поля применены к выбранным операциям';
        await this._persistWorkspace(toastMessage);
    },

    resetBatchDraft() {
        this.ui.operations = {
            ...this.ui.operations,
            batch_category_id: '__keep__',
            batch_project_id: '__keep__',
            batch_project_label: '',
            batch_note: '',
            batch_template_name: '',
        };
        this._renderOperationsTab();
    },

    async applyBatchClear(mode = 'all') {
        this._syncWorkspaceFromDom();
        const keys = Array.from(this._selectedOperationKeySet());
        if (keys.length === 0) {
            App.toast('Сначала выберите операции');
            return;
        }
        const clearMode = String(mode || 'all').trim() || 'all';
        keys.forEach(txKey => {
            const tx = this._findTransactionByKey(txKey);
            const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
            this._applyBatchClearToDecision(decision, tx, clearMode);
            decision.updated_at = new Date().toISOString();
            this._upsertTransactionDecision(decision);
        });
        this.ui.operations.selected_keys = [];
        const toastMap = {
            category: 'Статья снята у выбранных операций',
            project: 'Направление снято у выбранных операций',
            project_label: 'Сделка снята у выбранных операций',
            note: 'Заметка стерта у выбранных операций',
            all: 'Поля очищены у выбранных операций',
        };
        await this._persistWorkspace(toastMap[clearMode] || 'Поля очищены у выбранных операций');
    },

    async applyBatchSuggestions(confirmAfter = false) {
        this._syncWorkspaceFromDom();
        const keys = Array.from(this._selectedOperationKeySet());
        if (keys.length === 0) {
            App.toast('Сначала выберите операции');
            return;
        }
        const result = this._applySuggestionsToKeys(keys, confirmAfter);
        if (result.appliedKeys.length === 0) {
            App.toast('Для выбранных операций пока нет полезных подсказок');
            return;
        }
        this.ui.operations.selected_keys = result.skippedKeys;
        const toastMessage = confirmAfter
            ? `Подсказки применены и подтверждены: ${result.appliedKeys.length}`
            : `Подсказки применены: ${result.appliedKeys.length}`;
        await this._persistWorkspace(toastMessage);
    },

    async applyBatchPreset(presetId, confirmAfter = true) {
        this._syncWorkspaceFromDom();
        const keys = Array.from(this._selectedOperationKeySet());
        if (keys.length === 0) {
            App.toast('Сначала выберите операции');
            return;
        }
        const preset = this._findOperationPreset(presetId);
        if (!preset) {
            App.toast('Не нашли готовый набор');
            return;
        }
        const result = this._applyPresetToKeys(keys, preset, confirmAfter);
        if (result.appliedKeys.length === 0) {
            App.toast('Не удалось применить готовый набор к выбранным операциям');
            return;
        }
        this.ui.operations.selected_keys = result.skippedKeys;
        const toastMessage = confirmAfter
            ? `Набор «${preset.label}» применен и подтвержден: ${result.appliedKeys.length}`
            : `Набор «${preset.label}» применен: ${result.appliedKeys.length}`;
        await this._persistWorkspace(toastMessage);
    },

    async saveBatchTemplate() {
        this._syncWorkspaceFromDom();
        if (!this.workspace) return;
        const selectedCount = this._selectedOperationKeySet().size;
        if (selectedCount === 0) {
            App.toast('Сначала выберите хотя бы одну операцию');
            return;
        }
        const batch = this._currentBatchDraft();
        const template = this._prepareOperationTemplate({
            label: this._currentOperationTemplateDraftName('batch'),
            kind: batch.categoryId && batch.categoryId !== '__keep__'
                ? this._kindFromCategoryId(batch.categoryId, this.workspace, null)
                : '',
            category_id: batch.categoryId === '__keep__' ? '' : batch.categoryId,
            project_id: batch.projectId === '__keep__' ? '' : batch.projectId,
            project_label: batch.projectLabel,
            note: batch.note,
        }, 'Шаблон пачки');
        if (!template) {
            App.toast('Сначала задай статью, направление или заметку для шаблона');
            return;
        }
        const saved = this._upsertOperationTemplate(template);
        if (!saved) {
            App.toast('Не удалось сохранить шаблон');
            return;
        }
        this.ui.operations = {
            ...this.ui.operations,
            batch_template_name: '',
        };
        await this._persistWorkspace(`Шаблон «${saved.label}» сохранен для пачки`);
    },

    markAllVisibleAs(kind) {
        this.ui.composeKind = String(kind || '').trim();
        this._renderOperationsTab();
    },

    closeOperationComposer() {
        this.ui.composeKind = '';
        this._renderOperationsTab();
    },

    async createManualOperation() {
        this._syncWorkspaceFromDom();
        const root = document.querySelector('[data-finance-compose]');
        if (!root || !this.workspace) return;
        const mode = String(root.dataset.mode || this.ui.composeKind || '').trim();
        const date = this._rowValue(root, 'date') || new Date().toISOString().slice(0, 10);
        const accountId = this._rowValue(root, 'account_id');
        const amount = Math.abs(this._num(this._rowValue(root, 'amount')));
        const counterpartyName = this._rowValue(root, 'counterparty_name');
        const description = this._rowValue(root, 'description');
        const categoryId = this._rowValue(root, 'category_id');
        const projectId = this._rowValue(root, 'project_id');
        const projectLabel = this._rowValue(root, 'project_label');
        const note = this._rowValue(root, 'note');
        const transferAccountId = this._rowValue(root, 'transfer_account_id');

        if (!mode) {
            App.toast('Не выбрали тип операции');
            return;
        }
        if (!accountId) {
            App.toast('Нужно выбрать счет');
            return;
        }
        if (amount <= 0) {
            App.toast('Укажите сумму операции');
            return;
        }
        if (mode === 'transfer' && !transferAccountId) {
            App.toast('Для перевода нужен второй счет');
            return;
        }

        const manualId = this._uid('manual_tx');
        const direction = mode === 'income' ? 'in' : 'out';
        const rawTx = {
            manualId,
            transactionId: `manual:${manualId}`,
            accountId,
            accountLabel: this._findById(this.workspace.accounts, accountId)?.name || accountId,
            date,
            direction,
            amount,
            counterpartyName: counterpartyName || (mode === 'transfer' ? 'Внутренний перевод' : 'Ручная операция'),
            description,
            sourceKind: 'manual',
        };

        this.workspace.manualTransactions = this._normalizeManualTransactions([
            ...(this.workspace.manualTransactions || []),
            {
                id: manualId,
                date,
                account_id: accountId,
                direction,
                amount,
                counterparty_name: rawTx.counterpartyName,
                description,
                created_at: new Date().toISOString(),
            },
        ]);

        const txKey = this._transactionKey(rawTx);
        const decision = this._normalizeTransactionDecisions([{
            tx_key: txKey,
            kind: mode === 'transfer' ? 'transfer' : (mode === 'income' ? 'income' : 'expense'),
            project_id: mode === 'transfer' ? '' : projectId,
            project_label: mode === 'transfer' ? '' : projectLabel,
            category_id: mode === 'transfer' ? 'finance_transfers' : categoryId,
            counterparty_id: '',
            payroll_employee_id: '',
            transfer_account_id: mode === 'transfer' ? transferAccountId : '',
            note,
            confirmed: true,
            counterparty_name: rawTx.counterpartyName,
            counterparty_inn: '',
            updated_at: new Date().toISOString(),
        }])[0];
        this._upsertTransactionDecision(decision);
        this.ui.composeKind = '';
        await this._persistWorkspace('Ручная операция добавлена');
    },

    async updateManualTransaction(txKey) {
        this._syncWorkspaceFromDom();
        const root = this._findTransactionRowRoot(txKey);
        if (!root || !this.workspace) return;
        const date = this._rowValue(root, 'manual_date') || new Date().toISOString().slice(0, 10);
        const accountId = this._rowValue(root, 'manual_account_id');
        const amount = Math.abs(this._num(this._rowValue(root, 'manual_amount')));
        const direction = this._rowValue(root, 'manual_direction') === 'in' ? 'in' : 'out';
        const counterpartyName = this._rowValue(root, 'manual_counterparty_name');
        const description = this._rowValue(root, 'manual_description');

        if (!accountId) {
            App.toast('Нужно выбрать счет');
            return;
        }
        if (amount <= 0) {
            App.toast('Укажите сумму операции');
            return;
        }

        this._updateManualTransactionRecord(txKey, {
            date,
            account_id: accountId,
            direction,
            amount,
            counterparty_name: counterpartyName,
            description,
        });
        await this._persistWorkspace('Ручная операция обновлена');
    },

    async removeManualTransaction(txKey) {
        if (!this.workspace) return;
        this._focusNeighborBeforeMutation(txKey);
        const manualRows = this._manualTransactionsToBankRows(this.workspace);
        const matched = manualRows.find(item => this._transactionKey(item) === String(txKey || ''));
        if (!matched?.manualId) return;
        this.workspace.manualTransactions = (this.workspace.manualTransactions || []).filter(item => String(item?.id || '') !== String(matched.manualId));
        this.workspace.transactionDecisions = (this.workspace.transactionDecisions || []).filter(item => String(item?.tx_key || '') !== String(txKey || ''));
        this.ui.operations.selected_keys = (this.ui.operations.selected_keys || []).filter(item => String(item) !== String(txKey || ''));
        await this._persistWorkspace('Ручная операция удалена');
    },

    async confirmTransactionDecision(txKey) {
        this._syncWorkspaceFromDom();
        this._focusNeighborBeforeMutation(txKey);
        this._confirmTransactionDecisionLocally(txKey);
        this.ui.operations.selected_keys = (this.ui.operations.selected_keys || []).filter(item => String(item) !== String(txKey || ''));
        await this._persistWorkspace('Разноска по операции сохранена');
    },

    async applySuggestedDecision(txKey, confirmAfter = false) {
        this._syncWorkspaceFromDom();
        const row = this._findTransactionRowByKey(txKey);
        const tx = row || this._findTransactionByKey(txKey);
        if (!tx || !this._hasMeaningfulSuggestion(row?.suggestion)) {
            App.toast('По этой операции пока нет полезной подсказки');
            return;
        }
        if (confirmAfter) this._focusNeighborBeforeMutation(txKey);
        const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
        this._applySuggestionToDecision(decision, row, tx);
        if (confirmAfter) decision.confirmed = true;
        decision.updated_at = new Date().toISOString();
        this._upsertTransactionDecision(decision);
        if (confirmAfter) {
            this.ui.operations.selected_keys = (this.ui.operations.selected_keys || []).filter(item => String(item) !== String(txKey || ''));
        }
        await this._persistWorkspace(confirmAfter ? 'Подсказка применена и операция подтверждена' : 'Подсказка применена к операции');
    },

    async applyOperationPreset(txKey, presetId, confirmAfter = true) {
        this._syncWorkspaceFromDom();
        const tx = this._findTransactionByKey(txKey);
        const preset = this._findOperationPreset(presetId);
        if (!tx) {
            App.toast('Не нашли операцию для готового набора');
            return;
        }
        if (!preset) {
            App.toast('Не нашли готовый набор');
            return;
        }
        if (confirmAfter) this._focusNeighborBeforeMutation(txKey);
        const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
        this._applyPresetToDecision(decision, tx, preset);
        if (confirmAfter) decision.confirmed = true;
        decision.updated_at = new Date().toISOString();
        this._upsertTransactionDecision(decision);
        if (confirmAfter) {
            this.ui.operations.selected_keys = (this.ui.operations.selected_keys || []).filter(item => String(item) !== String(txKey || ''));
        }
        const toastMessage = confirmAfter
            ? `Набор «${preset.label}» применен и операция подтверждена`
            : `Набор «${preset.label}» применен к операции`;
        await this._persistWorkspace(toastMessage);
    },

    async saveOperationTemplate(txKey) {
        this._syncWorkspaceFromDom();
        if (!this.workspace) return;
        const decision = this._findTransactionDecision(txKey);
        if (!decision) {
            App.toast('Сначала разметьте операцию: статья, направление или тип');
            return;
        }
        const template = this._prepareOperationTemplate({
            label: this._currentOperationTemplateDraftName('single'),
            kind: decision.kind,
            category_id: decision.category_id,
            project_id: decision.project_id,
            project_label: decision.project_label,
            counterparty_id: decision.counterparty_id,
            payroll_employee_id: decision.payroll_employee_id,
            transfer_account_id: decision.transfer_account_id,
            note: decision.note,
        }, 'Мой шаблон');
        if (!template) {
            App.toast('В этой операции пока нечего сохранять в шаблон');
            return;
        }
        const saved = this._upsertOperationTemplate(template);
        if (!saved) {
            App.toast('Не удалось сохранить шаблон');
            return;
        }
        this.ui.operations = {
            ...this.ui.operations,
            template_name: '',
        };
        await this._persistWorkspace(`Шаблон «${saved.label}» сохранен`);
    },

    async removeOperationTemplate(templateId) {
        if (!this.workspace) return;
        const current = this._normalizeOperationTemplates(this.workspace.operationTemplates || []);
        const matched = current.find(item => String(item.id || '') === String(templateId || ''));
        if (!matched) {
            App.toast('Не нашли шаблон для удаления');
            return;
        }
        this.workspace.operationTemplates = current.filter(item => String(item.id || '') !== String(templateId || ''));
        await this._persistWorkspace(`Шаблон «${matched.label}» удален`);
    },

    async markTransactionKind(txKey, kind) {
        this._syncWorkspaceFromDom();
        this._focusNeighborBeforeMutation(txKey);
        this._markTransactionKindLocally(txKey, kind);
        this.ui.operations.selected_keys = (this.ui.operations.selected_keys || []).filter(item => String(item) !== String(txKey || ''));
        await this._persistWorkspace('Тип операции обновлен');
    },

    async resetTransactionDecision(txKey) {
        this._syncWorkspaceFromDom();
        this._focusNeighborBeforeMutation(txKey);
        this.workspace.transactionDecisions = (this.workspace.transactionDecisions || []).filter(item => String(item?.tx_key || '') !== String(txKey || ''));
        this.ui.operations.selected_keys = (this.ui.operations.selected_keys || []).filter(item => String(item) !== String(txKey || ''));
        await this._persistWorkspace('Ручная разметка по операции сброшена');
    },

    addAccount() {
        this._syncWorkspaceFromDom();
        this.workspace.accounts.push({
            id: this._uid('account'),
            name: 'Новый счёт',
            type: 'cash',
            owner: '',
            source_id: 'cash_manual',
            status: 'planned',
            note: '',
            show_in_money: true,
            legacy_hide_in_total: false,
            external_ref: '',
        });
        this.currentTab = 'tools';
        this._renderTabs();
        this._renderCurrentTab();
    },

    addCategory() {
        this._syncWorkspaceFromDom();
        this.workspace.categories.push({
            id: this._uid('category'),
            name: 'Новая статья',
            group: 'other',
            bucket: 'manual',
            source_id: 'cash_manual',
            mapping: '',
            active: true,
        });
        this.currentTab = 'tools';
        this._renderTabs();
        this._renderCurrentTab();
    },

    addProject() {
        this._syncWorkspaceFromDom();
        this.workspace.projects.push({
            id: this._uid('project'),
            name: 'Новый проект',
            type: 'core',
            default_income_category_id: '',
            note: '',
            active: true,
        });
        this.currentTab = 'tools';
        this._renderTabs();
        this._renderCurrentTab();
    },

    addFixedAsset() {
        this._syncWorkspaceFromDom();
        this.workspace.fixedAssets = this._normalizeFixedAssets([
            ...(this.workspace.fixedAssets || []),
            {
                id: this._uid('asset'),
                active: true,
                name: 'Новый объект',
                asset_type: 'equipment',
                purchase_cost: 100000,
                paid_amount: 100000,
                accepted_date: '',
                opiu_start_month: this._businessMonthFromDate(this._todayDateLocal()),
                useful_life_months: 36,
                project_id: '',
                purchased_earlier: false,
                vendor_name: '',
                note: '',
            },
        ]);
        this.currentTab = 'tools';
        this._renderTabs();
        this._renderCurrentTab();
    },

    addCounterparty() {
        this._syncWorkspaceFromDom();
        this.workspace.counterparties.push({
            id: this._uid('counterparty'),
            name: 'Новый профиль',
            role: 'vendor',
            inn: '',
            what_they_sell: '',
            default_project_id: '',
            default_category_id: '',
            research_mode: 'hybrid',
            match_hint: '',
            note: '',
            active: true,
        });
        this.currentTab = 'automation';
        this._renderTabs();
        this._renderAutomationTab();
    },

    addRule() {
        this._syncWorkspaceFromDom();
        this.workspace.rules.push({
            id: this._uid('rule'),
            name: 'Новое правило',
            trigger_type: 'description',
            trigger: '',
            account_scope: 'any',
            counterparty_id: '',
            project_id: '',
            category_id: '',
            confidence: 0.7,
            auto_apply: false,
            note: '',
            active: true,
        });
        this.currentTab = 'tools';
        this._renderTabs();
        this._renderCurrentTab();
    },

    addRecurringTransaction() {
        this._syncWorkspaceFromDom();
        this.workspace.recurringTransactions = this._normalizeRecurringTransactions([
            ...(this.workspace.recurringTransactions || []),
            {
                id: this._uid('recurring'),
                active: true,
                name: 'Новое автосписание',
                account_id: (this.workspace.accounts || []).find(item => item.show_in_money !== false)?.id || '',
                kind: 'expense',
                amount: 0,
                cadence: 'monthly',
                start_date: this._businessDateFromDate(this._todayDateLocal()),
                day_of_month: Number(this._businessDateFromDate(this._todayDateLocal()).slice(8, 10)) || 1,
                category_id: 'commercial_site',
                project_id: '',
                counterparty_name: '',
                description: '',
                note: '',
            },
        ]);
        this.currentTab = 'tools';
        this._renderTabs();
        this._renderCurrentTab();
    },

    removeAccount(id) {
        this._syncWorkspaceFromDom();
        this.workspace.accounts = (this.workspace.accounts || []).filter(item => item.id !== id);
        this._renderToolsTab();
    },

    removeCategory(id) {
        this._syncWorkspaceFromDom();
        this.workspace.categories = (this.workspace.categories || []).filter(item => item.id !== id);
        this._renderToolsTab();
    },

    removeProject(id) {
        this._syncWorkspaceFromDom();
        this.workspace.projects = (this.workspace.projects || []).filter(item => item.id !== id);
        this._renderToolsTab();
    },

    removeFixedAsset(id) {
        this._syncWorkspaceFromDom();
        this.workspace.fixedAssets = (this.workspace.fixedAssets || []).filter(item => item.id !== id);
        this._renderToolsTab();
    },

    removeCounterparty(id) {
        this._syncWorkspaceFromDom();
        this.workspace.counterparties = (this.workspace.counterparties || []).filter(item => item.id !== id);
        this._renderAutomationTab();
    },

    removeRule(id) {
        this._syncWorkspaceFromDom();
        this.workspace.rules = (this.workspace.rules || []).filter(item => item.id !== id);
        this._renderToolsTab();
    },

    removeRecurringTransaction(id) {
        this._syncWorkspaceFromDom();
        this.workspace.recurringTransactions = (this.workspace.recurringTransactions || []).filter(item => item.id !== id);
        this._renderToolsTab();
    },

    async saveWorkspace() {
        this._syncWorkspaceFromDom();
        await this._persistWorkspace('Финансовая структура и ручная разноска сохранены');
    },

    resetWorkspace() {
        if (typeof confirm === 'function' && !confirm('Сбросить счета, статьи, проекты и авторазнос к рекомендованной схеме?')) return;
        this.workspace = this._defaultWorkspace(App.settings || {});
        this.summary = this._buildSummary({
            workspace: this.workspace,
            orders: this.data.orders,
            imports: this.data.imports,
            employees: this.data.employees,
            timeEntries: this.data.timeEntries,
            indirectMonths: this.data.indirectMonths,
            tochkaSnapshot: this.data.tochkaSnapshot,
            fintabloSnapshot: this.data.fintabloSnapshot,
        });
        this.render();
        App.toast('Подставил рекомендованную финансовую схему');
    },

    async _persistWorkspace(toastMessage) {
        if (!this.workspace) return;
        this.workspace.updated_at = new Date().toISOString();
        if (typeof saveFinanceWorkspace === 'function') {
            await saveFinanceWorkspace(this.workspace);
        }
        this.summary = this._buildSummary({
            workspace: this.workspace,
            orders: this.data.orders,
            imports: this.data.imports,
            employees: this.data.employees,
            timeEntries: this.data.timeEntries,
            indirectMonths: this.data.indirectMonths,
            tochkaSnapshot: this.data.tochkaSnapshot,
            fintabloSnapshot: this.data.fintabloSnapshot,
        });
        this.render();
        if (toastMessage) App.toast(toastMessage);
    },

    _syncWorkspaceFromDom() {
        if (!this.workspace) return;
        const accountRows = Array.from(document.querySelectorAll('[data-finance-account-row]'));
        if (accountRows.length > 0) {
            this.workspace.accounts = this._normalizeAccounts(accountRows.map(row => ({
                id: row.dataset.financeAccountRow,
                name: this._rowValue(row, 'name'),
                type: this._rowValue(row, 'type'),
                owner: this._rowValue(row, 'owner'),
                source_id: this._rowValue(row, 'source_id'),
                status: this._rowValue(row, 'status'),
                note: this._rowValue(row, 'note'),
                show_in_money: this._rowChecked(row, 'show_in_money'),
                legacy_hide_in_total: this._rowChecked(row, 'legacy_hide_in_total'),
                external_ref: this._rowValue(row, 'external_ref'),
            })));
        }

        const categoryRows = Array.from(document.querySelectorAll('[data-finance-category-row]'));
        if (categoryRows.length > 0) {
            this.workspace.categories = categoryRows.map(row => ({
                id: row.dataset.financeCategoryRow,
                name: this._rowValue(row, 'name'),
                group: this._rowValue(row, 'group'),
                bucket: this._rowValue(row, 'bucket'),
                source_id: this._rowValue(row, 'source_id'),
                mapping: this._rowValue(row, 'mapping'),
                active: this._rowChecked(row, 'active'),
            }));
        }

        const projectRows = Array.from(document.querySelectorAll('[data-finance-project-row]'));
        if (projectRows.length > 0) {
            this.workspace.projects = projectRows.map(row => ({
                id: row.dataset.financeProjectRow,
                name: this._rowValue(row, 'name'),
                type: this._rowValue(row, 'type'),
                default_income_category_id: this._rowValue(row, 'default_income_category_id'),
                note: this._rowValue(row, 'note'),
                active: this._rowChecked(row, 'active'),
            }));
        }

        const fixedAssetRows = Array.from(document.querySelectorAll('[data-finance-fixed-asset-row]'));
        if (fixedAssetRows.length > 0) {
            this.workspace.fixedAssets = this._normalizeFixedAssets(fixedAssetRows.map(row => ({
                id: row.dataset.financeFixedAssetRow,
                active: this._rowChecked(row, 'active'),
                name: this._rowValue(row, 'name'),
                asset_type: this._rowValue(row, 'asset_type'),
                purchase_cost: this._rowValue(row, 'purchase_cost'),
                paid_amount: this._rowValue(row, 'paid_amount'),
                accepted_date: this._rowValue(row, 'accepted_date'),
                opiu_start_month: this._rowValue(row, 'opiu_start_month'),
                useful_life_months: this._rowValue(row, 'useful_life_months'),
                project_id: this._rowValue(row, 'project_id'),
                purchased_earlier: this._rowChecked(row, 'purchased_earlier'),
                vendor_name: this._rowValue(row, 'vendor_name'),
                note: this._rowValue(row, 'note'),
            })));
        }

        const counterpartyRows = Array.from(document.querySelectorAll('[data-finance-counterparty-row]'));
        if (counterpartyRows.length > 0) {
            this.workspace.counterparties = counterpartyRows.map(row => ({
                id: row.dataset.financeCounterpartyRow,
                name: this._rowValue(row, 'name'),
                role: this._rowValue(row, 'role'),
                inn: this._rowValue(row, 'inn'),
                what_they_sell: this._rowValue(row, 'what_they_sell'),
                default_project_id: this._rowValue(row, 'default_project_id'),
                default_category_id: this._rowValue(row, 'default_category_id'),
                research_mode: this._rowValue(row, 'research_mode'),
                match_hint: this._rowValue(row, 'match_hint'),
                note: this._rowValue(row, 'note'),
                active: this._rowChecked(row, 'active'),
            }));
        }

        const ruleRows = Array.from(document.querySelectorAll('[data-finance-rule-row]'));
        if (ruleRows.length > 0) {
            this.workspace.rules = ruleRows.map(row => ({
                id: row.dataset.financeRuleRow,
                name: this._rowValue(row, 'name'),
                trigger_type: this._rowValue(row, 'trigger_type'),
                trigger: this._rowValue(row, 'trigger'),
                account_scope: this._rowValue(row, 'account_scope'),
                counterparty_id: this._rowValue(row, 'counterparty_id'),
                project_id: this._rowValue(row, 'project_id'),
                category_id: this._rowValue(row, 'category_id'),
                confidence: this._clamp01(this._rowValue(row, 'confidence'), 0.7),
                auto_apply: this._rowChecked(row, 'auto_apply'),
                note: this._rowValue(row, 'note'),
                active: this._rowChecked(row, 'active'),
            }));
        }

        const recurringRows = Array.from(document.querySelectorAll('[data-finance-recurring-row]'));
        if (recurringRows.length > 0) {
            this.workspace.recurringTransactions = this._normalizeRecurringTransactions(recurringRows.map(row => ({
                id: row.dataset.financeRecurringRow,
                active: this._rowChecked(row, 'active'),
                name: this._rowValue(row, 'name'),
                account_id: this._rowValue(row, 'account_id'),
                kind: this._rowValue(row, 'kind'),
                amount: this._rowValue(row, 'amount'),
                cadence: this._rowValue(row, 'cadence'),
                start_date: this._rowValue(row, 'start_date'),
                day_of_month: this._rowValue(row, 'day_of_month'),
                category_id: this._rowValue(row, 'category_id'),
                project_id: this._rowValue(row, 'project_id'),
                counterparty_name: this._rowValue(row, 'counterparty_name'),
                description: this._rowValue(row, 'description'),
                note: this._rowValue(row, 'note'),
            })));
        }

        const queueRoot = document.querySelector('[data-finance-queue-config]');
        if (queueRoot) {
            this.workspace.queueConfig = {
                dailySyncEnabled: this._rowChecked(queueRoot, 'dailySyncEnabled'),
                autoApplyThreshold: this._clamp01(this._rowValue(queueRoot, 'autoApplyThreshold'), 0.85),
                reviewThreshold: this._clamp01(this._rowValue(queueRoot, 'reviewThreshold'), 0.55),
                researchEnabled: this._rowChecked(queueRoot, 'researchEnabled'),
                cadenceLabel: this._rowValue(queueRoot, 'cadenceLabel') || 'раз в день',
                researchSources: this._splitList(this._rowValue(queueRoot, 'researchSources')),
                note: this._rowValue(queueRoot, 'note'),
            };
        }

        const txSelector = this.currentTab === 'payroll'
            ? '#finance-tab-payroll [data-finance-payroll-row]'
            : '#finance-tab-operations [data-finance-tx-row]';
        const txRows = Array.from(document.querySelectorAll(txSelector));
        if (txRows.length > 0) {
            const nextMap = new Map((this.workspace.transactionDecisions || []).map(item => [String(item.tx_key || ''), item]));
            txRows.forEach(row => {
                const txKey = row.dataset.financeTxRow || row.dataset.financePayrollRow || '';
                if (!txKey) return;
                const decision = this._decisionFromRow(row, txKey);
                if (decision) nextMap.set(String(txKey), decision);
                else nextMap.delete(String(txKey));
            });
            this.workspace.transactionDecisions = this._normalizeTransactionDecisions(Array.from(nextMap.values()));
        }
    },

    _rowValue(root, field) {
        const input = root.querySelector(`[data-field="${field}"]`);
        return String(input?.value || '').trim();
    },

    _rowChecked(root, field) {
        return !!root.querySelector(`[data-field="${field}"]`)?.checked;
    },

    _normalizeWorkspace(raw, settings = {}) {
        const defaults = this._defaultWorkspace(settings);
        const sourceRaw = (raw && typeof raw === 'object') ? raw : {};
        return {
            version: this.WORKSPACE_VERSION,
            updated_at: sourceRaw.updated_at || null,
            sources: this._mergeById(defaults.sources, sourceRaw.sources),
            accounts: this._normalizeAccounts(this._mergeById(defaults.accounts, sourceRaw.accounts)),
            categories: this._mergeById(defaults.categories, sourceRaw.categories),
            projects: this._mergeById(defaults.projects, sourceRaw.projects),
            fixedAssets: this._normalizeFixedAssets(this._mergeById(defaults.fixedAssets, sourceRaw.fixedAssets)),
            counterparties: this._mergeById(defaults.counterparties, sourceRaw.counterparties),
            rules: this._mergeById(defaults.rules, sourceRaw.rules),
            manualTransactions: this._normalizeManualTransactions(sourceRaw.manualTransactions),
            recurringTransactions: this._normalizeRecurringTransactions(sourceRaw.recurringTransactions),
            operationTemplates: this._normalizeOperationTemplates(sourceRaw.operationTemplates),
            transactionDecisions: this._normalizeTransactionDecisions(sourceRaw.transactionDecisions),
            queueConfig: {
                ...defaults.queueConfig,
                ...(sourceRaw.queueConfig && typeof sourceRaw.queueConfig === 'object' ? sourceRaw.queueConfig : {}),
            },
        };
    },

    _mergeById(defaultRows = [], incomingRows = []) {
        const incoming = Array.isArray(incomingRows) ? incomingRows : [];
        const map = new Map();
        incoming.forEach(row => {
            if (!row || typeof row !== 'object') return;
            if (!row.id) row.id = this._uid('row');
            map.set(String(row.id), row);
        });
        const merged = (defaultRows || []).map(def => {
            const incomingRow = map.get(String(def.id));
            if (incomingRow) {
                map.delete(String(def.id));
                return { ...def, ...incomingRow };
            }
            return { ...def };
        });
        map.forEach(row => merged.push({ ...row }));
        return merged;
    },

    _defaultWorkspace(settings = {}) {
        return {
            version: this.WORKSPACE_VERSION,
            updated_at: null,
            sources: this._defaultSources(),
            accounts: this._normalizeAccounts(this._defaultAccounts(settings)),
            categories: this._defaultCategories(),
            projects: this._defaultProjects(),
            fixedAssets: this._defaultFixedAssets(),
            counterparties: this._defaultCounterparties(),
            rules: this._defaultRules(),
            manualTransactions: [],
            recurringTransactions: [],
            operationTemplates: [],
            transactionDecisions: [],
            queueConfig: this._defaultQueueConfig(),
        };
    },

    _defaultFixedAssets() {
        return [];
    },

    _normalizeManualTransactions(list) {
        return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object')
            .map(item => ({
                id: String(item.id || this._uid('manual_tx')).trim(),
                date: this._parseBusinessDate(item.date) || new Date().toISOString().slice(0, 10),
                account_id: String(item.account_id || '').trim(),
                direction: String(item.direction || 'out') === 'in' ? 'in' : 'out',
                amount: Math.abs(this._num(item.amount)),
                counterparty_name: String(item.counterparty_name || '').trim(),
                description: String(item.description || '').trim(),
                created_at: String(item.created_at || '').trim() || null,
            }))
            .filter(item => item.account_id && item.amount > 0);
    },

    _normalizeAccounts(list) {
        return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object')
            .map(item => ({
                id: String(item.id || this._uid('account')).trim(),
                name: String(item.name || 'Счёт').trim(),
                type: String(item.type || 'cash').trim() || 'cash',
                owner: String(item.owner || '').trim(),
                source_id: String(item.source_id || 'cash_manual').trim() || 'cash_manual',
                status: String(item.status || 'active').trim() || 'active',
                note: String(item.note || '').trim(),
                show_in_money: item.show_in_money !== false,
                legacy_hide_in_total: !!item.legacy_hide_in_total,
                external_ref: String(item.external_ref || '').trim(),
            }));
    },

    _normalizeRecurringTransactions(list) {
        return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object')
            .map(item => {
                const startDate = this._parseBusinessDate(item.start_date) || this._businessDateFromDate(this._todayDateLocal());
                const defaultDay = Number(startDate.slice(8, 10)) || 1;
                const cadence = String(item.cadence || 'monthly').trim() || 'monthly';
                return {
                    id: String(item.id || this._uid('recurring')).trim(),
                    active: item.active !== false,
                    name: String(item.name || 'Автосписание').trim() || 'Автосписание',
                    account_id: String(item.account_id || '').trim(),
                    kind: String(item.kind || 'expense') === 'income' ? 'income' : 'expense',
                    amount: Math.abs(this._num(item.amount)),
                    cadence,
                    start_date: startDate,
                    day_of_month: Math.min(31, Math.max(1, Number(item.day_of_month) || defaultDay)),
                    category_id: String(item.category_id || '').trim(),
                    project_id: String(item.project_id || '').trim(),
                    counterparty_name: String(item.counterparty_name || '').trim(),
                    description: String(item.description || '').trim(),
                    note: String(item.note || '').trim(),
                };
            })
            .filter(item => item.account_id && item.amount > 0);
    },

    _normalizeOperationTemplates(list) {
        const allowedKinds = new Set(Object.keys(this.TRANSACTION_KIND_LABELS));
        return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object')
            .map(item => ({
                id: String(item.id || this._uid('op_template')).trim(),
                label: String(item.label || item.name || 'Мой шаблон').trim() || 'Мой шаблон',
                kind: allowedKinds.has(String(item.kind || '').trim()) ? String(item.kind || '').trim() : '',
                category_id: String(item.category_id || item.categoryId || '').trim(),
                project_id: String(item.project_id || item.projectId || '').trim(),
                project_label: String(item.project_label || item.projectLabel || '').trim(),
                counterparty_id: String(item.counterparty_id || item.counterpartyId || '').trim(),
                payroll_employee_id: item.payroll_employee_id == null ? String(item.payrollEmployeeId || '').trim() : String(item.payroll_employee_id).trim(),
                transfer_account_id: String(item.transfer_account_id || item.transferAccountId || '').trim(),
                note: String(item.note || '').trim(),
                updated_at: String(item.updated_at || '').trim() || null,
            }))
            .filter(item => item.label && this._hasMeaningfulOperationTemplate(item));
    },

    _normalizeFixedAssets(list) {
        const fallbackMonth = this._businessMonthFromDate(this._todayDateLocal());
        return (Array.isArray(list) ? list : [])
            .filter(item => item && typeof item === 'object')
            .map(item => {
                const acceptedDate = this._parseBusinessDate(item.accepted_date) || '';
                const startMonth = this._parseBusinessMonth(item.opiu_start_month)
                    || this._parseBusinessMonth(acceptedDate)
                    || fallbackMonth;
                return {
                    id: String(item.id || this._uid('asset')).trim(),
                    active: item.active !== false,
                    name: String(item.name || 'Новое имущество').trim() || 'Новое имущество',
                    asset_type: String(item.asset_type || 'equipment').trim() || 'equipment',
                    purchase_cost: Math.abs(this._num(item.purchase_cost)),
                    paid_amount: Math.abs(this._num(item.paid_amount)),
                    accepted_date: acceptedDate,
                    opiu_start_month: startMonth,
                    useful_life_months: Math.min(240, Math.max(1, Number(item.useful_life_months) || 36)),
                    project_id: String(item.project_id || '').trim(),
                    purchased_earlier: !!item.purchased_earlier,
                    vendor_name: String(item.vendor_name || '').trim(),
                    note: String(item.note || '').trim(),
                };
            })
            .filter(item => item.purchase_cost > 0);
    },

    _hydrateWorkspaceFromTochka(workspace, tochkaSnapshot) {
        const next = {
            ...(workspace || {}),
            accounts: this._normalizeAccounts(Array.isArray(workspace?.accounts) ? workspace.accounts.map(item => ({ ...item })) : []),
        };
        const bankAccounts = Array.isArray(tochkaSnapshot?.accounts) ? tochkaSnapshot.accounts : [];
        bankAccounts.forEach(account => {
            const accountId = String(account?.accountId || '').trim();
            if (!accountId) return;
            const bankNumber = this._extractBankAccountNumber(accountId);
            const tail = bankNumber.slice(-4);
            const displayName = String(account?.displayName || '').trim() || `Точка ••••${tail || accountId.slice(-4)}`;
            const existing = next.accounts.find(item => this._workspaceAccountMatchesBank(item, account));
            if (existing) {
                existing.type = existing.type || 'bank';
                existing.source_id = 'tochka_api';
                if (!existing.status || existing.status === 'planned') existing.status = 'active';
                const digits = this._digitsOnly(`${existing.name || ''} ${existing.note || ''}`);
                if (tail && !digits.includes(tail)) {
                    existing.note = [existing.note, `Точка ••••${tail}`].filter(Boolean).join(' · ');
                }
                return;
            }
            next.accounts.push({
                id: `tochka_${(bankNumber || accountId).slice(-8)}`,
                name: displayName,
                type: 'bank',
                owner: 'Компания',
                source_id: 'tochka_api',
                status: 'active',
                note: `Счет Точка ••••${tail || accountId.slice(-4)}`,
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: bankNumber || accountId,
            });
        });
        return next;
    },

    _hydrateWorkspaceFromFintablo(workspace, fintabloSnapshot) {
        const next = {
            ...(workspace || {}),
            accounts: this._normalizeAccounts(Array.isArray(workspace?.accounts) ? workspace.accounts.map(item => ({ ...item })) : []),
        };
        const canonicalMoneybags = this._canonicalFintabloMoneybags(fintabloSnapshot);
        canonicalMoneybags.forEach(moneybag => {
            const existing = next.accounts.find(item => this._workspaceAccountMatchesFintablo(item, moneybag));
            const defaultVisible = this._defaultMoneyVisibilityForFintablo(moneybag);
            if (existing) {
                existing.source_id = existing.source_id || 'orders_fintablo';
                if (!existing.external_ref) existing.external_ref = moneybag.number || String(moneybag.moneybagId || '');
                if (moneybag.hideInTotal) existing.legacy_hide_in_total = true;
                if (existing.show_in_money == null) existing.show_in_money = defaultVisible;
                if (!existing.note && moneybag.hideInTotal) existing.note = 'Скрыт в totals в FinTablo';
                return;
            }
            next.accounts.push({
                id: String(moneybag.id || this._uid('account')),
                name: moneybag.displayName || 'FinTablo счёт',
                type: moneybag.sourceKind === 'bank' ? 'bank' : (moneybag.sourceKind === 'cash' ? 'cash' : 'settlement'),
                owner: '',
                source_id: 'orders_fintablo',
                status: moneybag.archived ? 'archived' : 'active',
                note: moneybag.hideInTotal ? 'Скрыт в totals в FinTablo' : '',
                show_in_money: defaultVisible,
                legacy_hide_in_total: !!moneybag.hideInTotal,
                external_ref: moneybag.number || String(moneybag.moneybagId || ''),
            });
        });
        next.accounts = this._normalizeAccounts(next.accounts);
        return next;
    },

    _workspaceAccountMatchesBank(account, bankAccount) {
        const accountId = String(bankAccount?.accountId || '').trim();
        const bankNumber = this._extractBankAccountNumber(accountId);
        const last4 = bankNumber.slice(-4);
        const accountText = `${account?.id || ''} ${account?.name || ''} ${account?.note || ''}`;
        const accountDigits = this._digitsOnly(accountText);
        if (bankNumber && accountDigits.includes(bankNumber)) return true;
        if (last4 && accountDigits.includes(last4)) return true;
        return this._normalizeText(account?.name || '') === this._normalizeText(bankAccount?.displayName || '');
    },

    _workspaceAccountMatchesFintablo(account, moneybag) {
        const legacyId = String(moneybag?.id || '').trim();
        if (legacyId && String(account?.id || '') === legacyId) return true;
        const externalRef = String(account?.external_ref || '').trim();
        const moneybagNumber = this._digitsOnly(moneybag?.number || '');
        const accountDigits = this._digitsOnly(`${account?.id || ''} ${account?.name || ''} ${account?.note || ''} ${externalRef}`);
        if (moneybagNumber && accountDigits.includes(moneybagNumber)) return true;
        if (moneybagNumber && moneybagNumber.slice(-4) && accountDigits.includes(moneybagNumber.slice(-4))) return true;
        return this._normalizeText(account?.name || '') === this._normalizeText(moneybag?.displayName || '');
    },

    _canonicalFintabloMoneybags(snapshot) {
        const rows = Array.isArray(snapshot?.accounts) ? snapshot.accounts : [];
        const grouped = new Map();
        rows.forEach(item => {
            const rawType = String(item?.type || '').trim().toLowerCase();
            const sourceKind = String(item?.sourceKind || (rawType === 'bank' ? 'bank' : (['nal', 'card'].includes(rawType) ? 'cash' : 'settlement'))).trim();
            const numberKey = this._digitsOnly(item?.number || '');
            const key = numberKey || `bag:${String(item?.moneybagId || item?.id || '')}`;
            const candidate = {
                ...item,
                moneybagId: String(item?.moneybagId || '').trim(),
                id: String(item?.id || '').trim(),
                displayName: String(item?.displayName || item?.name || '').trim(),
                sourceKind: sourceKind || (String(item?.type || '') === 'bank' ? 'bank' : 'cash'),
                number: String(item?.number || '').trim(),
                archived: !!item?.archived,
                hideInTotal: !!item?.hideInTotal,
            };
            const current = grouped.get(key);
            if (!current || this._fintabloMoneybagRank(candidate) > this._fintabloMoneybagRank(current)) {
                grouped.set(key, candidate);
            }
        });
        return Array.from(grouped.values());
    },

    _fintabloMoneybagRank(item) {
        const visibleScore = item?.hideInTotal ? 0 : 10;
        const activeScore = item?.archived ? 0 : 5;
        const namedScore = String(item?.displayName || '').length / 100;
        return visibleScore + activeScore + namedScore;
    },

    _defaultMoneyVisibilityForFintablo(moneybag) {
        if (!moneybag) return true;
        if (moneybag.archived || moneybag.hideInTotal) return false;
        const text = this._normalizeText([moneybag.displayName, moneybag.number].filter(Boolean).join(' '));
        if (['благотвор', 'налог', 'копил', 'амортиз', 'депозит', 'резерв'].some(word => text.includes(word))) return false;
        return true;
    },

    _extractBankAccountNumber(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';
        const head = raw.split('/')[0] || raw;
        return this._digitsOnly(head);
    },

    _manualTransactionsToBankRows(workspace) {
        return this._normalizeManualTransactions(workspace?.manualTransactions).map(item => {
            const account = this._findById(workspace?.accounts, item.account_id);
            return {
                manualId: item.id,
                transactionId: `manual:${item.id}`,
                accountId: item.account_id,
                accountLabel: account?.name || item.account_id,
                date: item.date,
                direction: item.direction,
                amount: item.amount,
                counterpartyName: item.counterparty_name,
                description: item.description,
                sourceKind: 'manual',
            };
        });
    },

    _recurringTransactionsToBankRows(workspace) {
        const today = this._businessDateFromDate(this._todayDateLocal());
        return this._normalizeRecurringTransactions(workspace?.recurringTransactions).flatMap(item => {
            if (item.active === false) return [];
            if (String(item.cadence || 'monthly') !== 'monthly') return [];
            const account = this._findById(workspace?.accounts, item.account_id);
            const occurrences = [];
            let cursor = this._dateFromBusinessDate(item.start_date);
            const hardStop = this._dateFromBusinessDate(today);
            let guard = 0;
            while (cursor && hardStop && cursor <= hardStop && guard < 72) {
                const year = cursor.getFullYear();
                const month = cursor.getMonth();
                const monthLastDay = new Date(year, month + 1, 0).getDate();
                const day = Math.min(item.day_of_month || Number(item.start_date.slice(8, 10)) || 1, monthLastDay);
                const occurrenceDate = this._businessDateFromDate(new Date(year, month, day, 12, 0, 0, 0));
                if (occurrenceDate >= item.start_date && occurrenceDate <= today) {
                    occurrences.push({
                        recurringTemplateId: item.id,
                        recurringTemplateName: item.name,
                        transactionId: `recurring:${item.id}:${occurrenceDate}`,
                        accountId: item.account_id,
                        accountLabel: account?.name || item.account_id,
                        date: occurrenceDate,
                        direction: item.kind === 'income' ? 'in' : 'out',
                        amount: item.amount,
                        counterpartyName: item.counterparty_name || item.name,
                        description: item.description || item.name,
                        sourceKind: 'manual',
                        categoryHint: item.category_id,
                        projectHint: item.project_id,
                        noteHint: item.note,
                    });
                }
                cursor = new Date(year, month + 1, 1, 12, 0, 0, 0);
                guard += 1;
            }
            return occurrences;
        });
    },

    _fintabloTransactionsToRows(snapshot, tochkaAccounts = []) {
        const txRows = Array.isArray(snapshot?.transactions) ? snapshot.transactions : [];
        const moneybagMap = new Map(this._canonicalFintabloMoneybags(snapshot).map(item => [String(item.id || ''), item]));
        return txRows
            .filter(item => item && typeof item === 'object')
            .map(item => {
                const accountId = String(item.accountId || item.moneybagId || '').trim();
                const moneybag = moneybagMap.get(accountId) || null;
                if (!this._shouldIncludeFintabloMoneybagInOperations(moneybag, tochkaAccounts)) return null;
                return {
                    source: 'fintablo',
                    sourceKind: String(item.sourceKind || moneybag?.sourceKind || 'cash'),
                    transactionId: String(item.transactionId || item.legacyTransactionId || '').trim(),
                    legacyTransactionId: String(item.legacyTransactionId || '').trim(),
                    accountId,
                    accountLabel: String(item.accountLabel || moneybag?.displayName || accountId).trim(),
                    bankNumber: String(item.bankNumber || moneybag?.number || '').trim(),
                    date: this._parseBusinessDate(item.date),
                    direction: String(item.direction || '') === 'in' ? 'in' : 'out',
                    amount: Math.abs(this._num(item.amount)),
                    currency: String(item.currency || moneybag?.currency || 'RUB').trim() || 'RUB',
                    counterpartyName: String(item.counterpartyName || '').trim(),
                    counterpartyInn: String(item.counterpartyInn || '').trim(),
                    description: String(item.description || '').trim(),
                    paymentId: '',
                    documentNumber: '',
                    group: String(item.group || '').trim(),
                    legacyMoneybagId: String(item.legacyMoneybagId || moneybag?.moneybagId || '').trim(),
                    partnerId: String(item.partnerId || '').trim(),
                    dealId: String(item.dealId || '').trim(),
                    categoryId: String(item.categoryId || '').trim(),
                    directionId: String(item.directionId || '').trim(),
                };
            })
            .filter(item => item && item.date && item.amount > 0);
    },

    _shouldIncludeFintabloMoneybagInOperations(moneybag, tochkaAccounts = []) {
        if (!moneybag) return false;
        const sourceKind = String(moneybag.sourceKind || '').trim();
        if (sourceKind === 'bank') return !this._moneybagMatchesTochkaAccount(moneybag, tochkaAccounts);
        return true;
    },

    _moneybagMatchesTochkaAccount(moneybag, tochkaAccounts = []) {
        const bagNumber = this._digitsOnly(moneybag?.number || '');
        const bagText = this._normalizeText(moneybag?.displayName || '');
        return (tochkaAccounts || []).some(account => {
            const accountNumber = this._extractBankAccountNumber(account?.accountId);
            if (bagNumber && accountNumber && bagNumber === accountNumber) return true;
            if (bagNumber && accountNumber && bagNumber.slice(-4) && accountNumber.endsWith(bagNumber.slice(-4))) return true;
            return bagText && bagText === this._normalizeText(account?.displayName || '');
        });
    },

    _defaultSources() {
        return [
            {
                id: 'orders_fintablo',
                name: 'FinTablo import',
                kind: 'legacy_import',
                status: 'active',
                note: 'Исторический импорт денег по сделкам и заказам.',
            },
            {
                id: 'tochka_api',
                name: 'Точка API',
                kind: 'bank_api',
                status: 'planned',
                note: 'Расчётные счета, балансы и банковские выписки.',
            },
            {
                id: 'cash_manual',
                name: 'Ручные счета и наличные',
                kind: 'manual',
                status: 'active',
                note: 'Наличные у людей, ручные переводы и операционные карманы.',
            },
            {
                id: 'payroll_internal',
                name: 'Сотрудники и табель',
                kind: 'internal',
                status: 'active',
                note: 'Часы, зарплата, распределение по производству и управлению.',
            },
            {
                id: 'indirect_monthly',
                name: 'Косвенные расходы',
                kind: 'monthly_snapshot',
                status: 'active',
                note: 'Помесячные косвенные расходы и ставка на час.',
            },
            {
                id: 'counterparty_research',
                name: 'Research по контрагентам',
                kind: 'research',
                status: 'planned',
                note: 'История оплат + внешний поиск по названию / ИНН для новых ООО и ИП.',
            },
        ];
    },

    _defaultAccounts(settings = {}) {
        const bankName = String(settings.company_bank_name || 'Точка — основной р/с').trim();
        const bankAccount = String(settings.company_bank_account || '').trim();
        const last4 = bankAccount ? bankAccount.slice(-4) : '';
        const bankLabel = last4 ? `${bankName} ••••${last4}` : bankName;
        return [
            {
                id: 'bank_tochka_main',
                name: bankLabel,
                type: 'bank',
                owner: 'Компания',
                source_id: 'tochka_api',
                status: 'active',
                note: bankAccount ? `Основной расчётный счёт (${last4})` : 'Основной расчётный счёт компании',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: bankAccount,
            },
            {
                id: 'bank_tax_reserve',
                name: 'Налоговый резерв / отдельный р/с',
                type: 'reserve',
                owner: 'Компания',
                source_id: 'tochka_api',
                status: 'planned',
                note: 'Для налогов, фондов и переводов в отдельный карман.',
                show_in_money: false,
                legacy_hide_in_total: true,
                external_ref: '',
            },
            {
                id: 'bank_secondary_ops',
                name: 'Второй операционный р/с',
                type: 'bank',
                owner: 'Компания',
                source_id: 'tochka_api',
                status: 'planned',
                note: 'Под отдельные юридические лица или спец-контур.',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '',
            },
            {
                id: 'cash_katya_china',
                name: 'Наличные / Китай — Катя',
                type: 'cash',
                owner: 'Катя',
                source_id: 'cash_manual',
                status: 'active',
                note: 'Китайские оплаты, быстрые закупки и ручные расчеты.',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '',
            },
            {
                id: 'cash_lesha',
                name: 'Наличные — Леша',
                type: 'cash',
                owner: 'Леша',
                source_id: 'cash_manual',
                status: 'active',
                note: 'Хоз. расходы, ЗП наличными и оперативные траты.',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '',
            },
            {
                id: 'cash_dmitrov',
                name: 'Наличные — Дмитров',
                type: 'cash',
                owner: 'Площадка Дмитров',
                source_id: 'cash_manual',
                status: 'active',
                note: 'Отдельный наличный контур площадки / производства.',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '',
            },
            {
                id: 'settlement_china_bybit',
                name: 'Китай / расчеты / bybit',
                type: 'settlement',
                owner: 'Закупки',
                source_id: 'cash_manual',
                status: 'planned',
                note: 'Отдельный карман под Китай, трансграничные оплаты и курсовые риски.',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '',
            },
            {
                id: 'reserve_deposit',
                name: 'Депозит / резерв',
                type: 'reserve',
                owner: 'Компания',
                source_id: 'cash_manual',
                status: 'active',
                note: 'Деньги, которые не должны смешиваться с операционным cashflow.',
                show_in_money: false,
                legacy_hide_in_total: true,
                external_ref: '',
            },
        ];
    },

    _defaultCategories() {
        return [
            { id: 'income_corporate_orders', name: 'Корпоративные заказы', group: 'income', bucket: 'project', source_id: 'orders_fintablo', mapping: 'корп / кастом', active: true },
            { id: 'income_workshops', name: 'Воркшопы', group: 'income', bucket: 'channel', source_id: 'orders_fintablo', mapping: 'воркшопы', active: true },
            { id: 'income_online_store', name: 'Интернет-магазин', group: 'income', bucket: 'channel', source_id: 'orders_fintablo', mapping: 'эквайринг / D2C', active: true },
            { id: 'income_marketplaces', name: 'Маркетплейсы', group: 'income', bucket: 'channel', source_id: 'orders_fintablo', mapping: 'Ozon / WB / платформы', active: true },
            { id: 'income_museum_sales', name: 'Музейные продажи', group: 'income', bucket: 'channel', source_id: 'orders_fintablo', mapping: 'музеи и госучреждения', active: true },
            { id: 'income_buyout', name: 'Выкуп / реализация', group: 'income', bucket: 'channel', source_id: 'orders_fintablo', mapping: 'выкуп и реализация', active: true },

            { id: 'direct_materials', name: 'Пластик и материалы', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_materials', active: true },
            { id: 'direct_hardware', name: 'Фурнитура', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_hardware', active: true },
            { id: 'direct_packaging', name: 'Упаковка', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_packaging', active: true },
            { id: 'direct_printing', name: 'Нанесение / типография', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_printing', active: true },
            { id: 'direct_molds', name: 'Молды и оснастка', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_molds', active: true },
            { id: 'direct_delivery', name: 'Доставка и логистика', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_delivery', active: true },
            { id: 'direct_subcontractors', name: 'Подрядчики производства', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'типография / уф / шитье / монтаж', active: true },
            { id: 'direct_prototyping', name: 'Прототипы и сэмплы', group: 'direct', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'прототипы / образцы', active: true },

            { id: 'payroll_production', name: 'ЗП производство', group: 'payroll', bucket: 'production', source_id: 'payroll_internal', mapping: 'табель / production', active: true },
            { id: 'payroll_office', name: 'ЗП офис и управление', group: 'payroll', bucket: 'overhead', source_id: 'payroll_internal', mapping: 'табель / office', active: true },
            { id: 'payroll_marketplaces', name: 'ЗП по каналу продаж', group: 'payroll', bucket: 'channel', source_id: 'payroll_internal', mapping: 'маркетплейсы / ecom', active: true },

            { id: 'taxes_orders', name: 'Налоги по заказам', group: 'taxes', bucket: 'orders', source_id: 'orders_fintablo', mapping: 'fact_taxes', active: true },
            { id: 'taxes_payroll', name: 'Налоги на сотрудников', group: 'taxes', bucket: 'payroll', source_id: 'payroll_internal', mapping: 'НДФЛ / взносы', active: true },
            { id: 'taxes_usn', name: 'УСН / ЕНП', group: 'taxes', bucket: 'finance', source_id: 'cash_manual', mapping: 'налоги компании', active: true },
            { id: 'taxes_vat', name: 'НДС / спецналоги', group: 'taxes', bucket: 'finance', source_id: 'cash_manual', mapping: 'НДС и спецслучаи', active: true },

            { id: 'commercial_marketing', name: 'Маркетинг и реклама', group: 'commercial', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'marketing', active: true },
            { id: 'commercial_marketplace_fees', name: 'Комиссии каналов продаж', group: 'commercial', bucket: 'channel', source_id: 'orders_fintablo', mapping: 'эквайринг / комиссии', active: true },
            { id: 'commercial_site', name: 'Сайт и digital', group: 'commercial', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'site / services', active: true },
            { id: 'commercial_photo', name: 'Фото / контент / съемки', group: 'commercial', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'photo / content', active: true },

            { id: 'overhead_rent', name: 'Аренда и обслуживание пространства', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'rent / office', active: true },
            { id: 'overhead_workshop', name: 'Обслуживание цеха', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'workshop', active: true },
            { id: 'overhead_software', name: 'Программы и сервисы', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'subscriptions', active: true },
            { id: 'overhead_bank', name: 'Банковское обслуживание', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'bank', active: true },
            { id: 'overhead_internet', name: 'Интернет и связь', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'internet', active: true },
            { id: 'overhead_household', name: 'Хоз. товары и расходники', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'household', active: true },
            { id: 'overhead_fuel', name: 'Бензин и локальная логистика', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'fuel', active: true },
            { id: 'overhead_certification', name: 'Сертификация и испытания', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'certification', active: true },
            { id: 'overhead_tools', name: 'Инструменты и ремонт', group: 'overhead', bucket: 'monthly', source_id: 'indirect_monthly', mapping: 'tools / repair', active: true },
            { id: 'overhead_amortization', name: 'Амортизация', group: 'overhead', bucket: 'monthly', source_id: 'cash_manual', mapping: 'manual amortization', active: true },

            { id: 'investment_fixed_assets', name: 'Покупка ОС / оборудования', group: 'investment', bucket: 'balance', source_id: 'cash_manual', mapping: 'fixed assets purchase', active: true },

            { id: 'finance_transfers', name: 'Переводы между счетами', group: 'finance', bucket: 'finance', source_id: 'cash_manual', mapping: 'internal transfer', active: true },
            { id: 'finance_owner_money', name: 'Вклады / вывод собственника', group: 'finance', bucket: 'finance', source_id: 'cash_manual', mapping: 'owner money', active: true },

            { id: 'other_charity', name: 'Благотворительность', group: 'other', bucket: 'other', source_id: 'orders_fintablo', mapping: 'fact_charity', active: true },
            { id: 'other_misc', name: 'Прочее', group: 'other', bucket: 'other', source_id: 'orders_fintablo', mapping: 'fact_other', active: true },
        ];
    },

    _defaultProjects() {
        return [
            {
                id: 'project_recycle_object',
                name: 'Recycle Object',
                type: 'core',
                default_income_category_id: 'income_corporate_orders',
                note: 'Основное производство и кастомные / корп заказы.',
                active: true,
            },
            {
                id: 'project_workshops',
                name: 'Воркшопы',
                type: 'channel',
                default_income_category_id: 'income_workshops',
                note: 'Отдельный контур выездных и внутренних воркшопов.',
                active: true,
            },
            {
                id: 'project_online_store',
                name: 'Интернет-магазин',
                type: 'channel',
                default_income_category_id: 'income_online_store',
                note: 'D2C, эквайринг и онлайн-продажи.',
                active: true,
            },
            {
                id: 'project_marketplaces',
                name: 'Маркетплейсы',
                type: 'channel',
                default_income_category_id: 'income_marketplaces',
                note: 'Поступления и расходы по платформам вроде Ozon / WB.',
                active: true,
            },
            {
                id: 'project_museum_sales',
                name: 'Музейные магазины',
                type: 'channel',
                default_income_category_id: 'income_museum_sales',
                note: 'Продажи и выкуп через музеи, фонды и госучреждения.',
                active: true,
            },
            {
                id: 'project_dmitrov',
                name: 'Дмитров',
                type: 'site',
                default_income_category_id: 'income_corporate_orders',
                note: 'Отдельная площадка / производственный контур.',
                active: true,
            },
        ];
    },

    _defaultCounterparties() {
        return [
            {
                id: 'cp_tax_treasury',
                name: 'Налоговая / казначейство',
                role: 'tax',
                inn: '',
                what_they_sell: 'ЕНП, налоги, госплатежи',
                default_project_id: '',
                default_category_id: 'taxes_usn',
                research_mode: 'system',
                match_hint: 'ифнс; уфк; казначейство; енп; налог',
                note: 'Почти всегда это не проектная закупка, а налоговый контур.',
                active: true,
            },
            {
                id: 'cp_social_funds',
                name: 'Соцфонды / ОСФР',
                role: 'tax',
                inn: '',
                what_they_sell: 'Страховые взносы и обязательные выплаты за сотрудников',
                default_project_id: '',
                default_category_id: 'taxes_payroll',
                research_mode: 'system',
                match_hint: 'осфр; сфр; страховые взносы; несчастных случаев',
                note: 'Налоговый слой по сотрудникам.',
                active: true,
            },
            {
                id: 'cp_online_acquiring',
                name: 'Интернет-эквайринг / ЮMoney',
                role: 'channel',
                inn: '',
                what_they_sell: 'Эквайринг, онлайн-оплаты, выплаты интернет-магазина',
                default_project_id: 'project_online_store',
                default_category_id: 'income_online_store',
                research_mode: 'hybrid',
                match_hint: 'юмани; эквайринг; yookassa; online payment',
                note: 'Поступления чаще всего относятся к интернет-магазину; списания - к комиссиям канала.',
                active: true,
            },
            {
                id: 'cp_marketplaces',
                name: 'Маркетплейсы / платформы',
                role: 'channel',
                inn: '',
                what_they_sell: 'Выплаты и комиссии маркетплейсов',
                default_project_id: 'project_marketplaces',
                default_category_id: 'income_marketplaces',
                research_mode: 'hybrid',
                match_hint: 'ozon; вайлдберриз; интернет решения; marketplace',
                note: 'Использовать для Ozon, WB и похожих платформ.',
                active: true,
            },
            {
                id: 'cp_museums',
                name: 'Музеи / фонды / госучреждения',
                role: 'client',
                inn: '',
                what_they_sell: 'Выкуп или реализация музейной продукции',
                default_project_id: 'project_museum_sales',
                default_category_id: 'income_museum_sales',
                research_mode: 'hybrid',
                match_hint: 'музей; уфк; фонд; галерея; эрмитаж; пушкин',
                note: 'Часто определяется по названию учреждения и типу договора.',
                active: true,
            },
            {
                id: 'cp_production_contractors',
                name: 'Производственные подрядчики',
                role: 'vendor',
                inn: '',
                what_they_sell: 'Печать, типография, шитье, фрезеровка, монтаж, производственные услуги',
                default_project_id: 'project_recycle_object',
                default_category_id: 'direct_subcontractors',
                research_mode: 'hybrid',
                match_hint: 'типография; уф печать; шитье; фрезеровка; монтаж',
                note: 'Если новый контрагент выглядит как производственный подрядчик, сначала смотреть сюда.',
                active: true,
            },
            {
                id: 'cp_china_logistics',
                name: 'Китай / логистика',
                role: 'logistics',
                inn: '',
                what_they_sell: 'Закупка из Китая, логистика, трансграничные расчеты',
                default_project_id: 'project_recycle_object',
                default_category_id: 'direct_delivery',
                research_mode: 'hybrid',
                match_hint: 'china; taobao; bybit; cargo; логистика',
                note: 'Полезно для оплат в Китай и связанных с ними логистических цепочек.',
                active: true,
            },
        ];
    },

    _defaultRules() {
        return [
            {
                id: 'rule_salary_cash',
                name: 'Наличные + "зп" -> зарплата',
                trigger_type: 'keyword_bundle',
                trigger: 'зп; зарплата',
                account_scope: 'cash_any',
                counterparty_id: '',
                project_id: 'project_recycle_object',
                category_id: 'payroll_production',
                confidence: 0.86,
                auto_apply: true,
                note: 'Основано на реальном legacy-паттерне с выплатами из наличных.',
                active: true,
            },
            {
                id: 'rule_tax_keywords',
                name: 'Казначейство / налог -> УСН / ЕНП',
                trigger_type: 'keyword_bundle',
                trigger: 'ифнс; казначейство; енп; налог',
                account_scope: 'any',
                counterparty_id: 'cp_tax_treasury',
                project_id: '',
                category_id: 'taxes_usn',
                confidence: 0.95,
                auto_apply: true,
                note: 'Системное правило для налогового контура.',
                active: true,
            },
            {
                id: 'rule_social_fund',
                name: 'ОСФР / страховые взносы',
                trigger_type: 'keyword_bundle',
                trigger: 'осфр; страховые взносы; сфр',
                account_scope: 'any',
                counterparty_id: 'cp_social_funds',
                project_id: '',
                category_id: 'taxes_payroll',
                confidence: 0.96,
                auto_apply: true,
                note: 'Налоги на сотрудников и фонды.',
                active: true,
            },
            {
                id: 'rule_online_store',
                name: 'ЮMoney / эквайринг -> интернет-магазин',
                trigger_type: 'counterparty',
                trigger: 'ЮМани; YooMoney; эквайринг',
                account_scope: 'bank_any',
                counterparty_id: 'cp_online_acquiring',
                project_id: 'project_online_store',
                category_id: 'income_online_store',
                confidence: 0.88,
                auto_apply: true,
                note: 'Поступления канала D2C и сопутствующие движения.',
                active: true,
            },
            {
                id: 'rule_marketplaces',
                name: 'Маркетплейсы -> канал продаж',
                trigger_type: 'keyword_bundle',
                trigger: 'ozon; wildberries; marketplace; интернет решения',
                account_scope: 'bank_any',
                counterparty_id: 'cp_marketplaces',
                project_id: 'project_marketplaces',
                category_id: 'income_marketplaces',
                confidence: 0.9,
                auto_apply: true,
                note: 'Срабатывает на поступления и помогает не путать с корп-заказами.',
                active: true,
            },
            {
                id: 'rule_production_vendor',
                name: 'Подрядчик + основной счет -> прямые расходы',
                trigger_type: 'counterparty_account',
                trigger: 'типография; печать; шитье; монтаж',
                account_scope: 'bank_tochka_main',
                counterparty_id: 'cp_production_contractors',
                project_id: 'project_recycle_object',
                category_id: 'direct_subcontractors',
                confidence: 0.74,
                auto_apply: false,
                note: 'Лучше сначала показать на проверку, если поставщик новый.',
                active: true,
            },
        ];
    },

    _defaultQueueConfig() {
        return {
            dailySyncEnabled: true,
            autoApplyThreshold: 0.85,
            reviewThreshold: 0.55,
            researchEnabled: true,
            cadenceLabel: 'раз в день',
            researchSources: ['history', 'keywords', 'web', 'order_match'],
            note: 'Показывать, почему выбран проект, статья и профиль контрагента.',
        };
    },

    _selectedOperationKeySet() {
        return new Set((this.ui?.operations?.selected_keys || []).map(item => String(item || '')).filter(Boolean));
    },

    _findTransactionRowRoot(txKey) {
        if (typeof document === 'undefined') return null;
        const key = String(txKey || '');
        return Array.from(document.querySelectorAll('[data-finance-tx-row], [data-finance-payroll-row]'))
            .find(node => String(node.dataset.financeTxRow || node.dataset.financePayrollRow || '') === key) || null;
    },

    _replaceOperationKeyInUi(oldTxKey, nextTxKey) {
        const prevKey = String(oldTxKey || '');
        const nextKey = String(nextTxKey || '');
        const selected = new Set((this.ui?.operations?.selected_keys || []).map(item => String(item || '')).filter(Boolean));
        const hadSelected = selected.delete(prevKey);
        if (hadSelected && nextKey) selected.add(nextKey);
        this.ui.operations = {
            ...this.ui.operations,
            selected_keys: Array.from(selected),
            focus_tx_key: String(this.ui?.operations?.focus_tx_key || '') === prevKey ? nextKey : (this.ui?.operations?.focus_tx_key || ''),
        };
    },

    _visibleOperationKeys() {
        return this._visibleOperationRows().map(item => String(item.txKey || '')).filter(Boolean);
    },

    _visibleOperationRows() {
        const filteredRows = this._filterOperationRows(this.summary?.transactions?.rows || []);
        return filteredRows.slice(0, this.ui?.operations?.limit || 200);
    },

    _visibleDayOperationKeys(dateKey) {
        const day = this._parseBusinessDate(dateKey) || '__no_date__';
        return this._visibleOperationRows()
            .filter(item => (this._parseBusinessDate(item?.date) || '__no_date__') === day)
            .map(item => String(item.txKey || ''))
            .filter(Boolean);
    },

    _currentBatchDraft() {
        return {
            categoryId: String(this.ui?.operations?.batch_category_id || '__keep__'),
            projectId: String(this.ui?.operations?.batch_project_id || '__keep__'),
            projectLabel: String(this.ui?.operations?.batch_project_label || '').trim(),
            note: String(this.ui?.operations?.batch_note || '').trim(),
        };
    },

    _currentOperationTemplateDraftName(scope = 'single') {
        if (scope === 'batch') return String(this.ui?.operations?.batch_template_name || '').trim();
        return String(this.ui?.operations?.template_name || '').trim();
    },

    _countSuggestedOperationKeys(keys = []) {
        return (Array.isArray(keys) ? keys : [])
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .filter(txKey => this._hasMeaningfulSuggestion(this._findTransactionRowByKey(txKey)?.suggestion))
            .length;
    },

    _builtinOperationPresets() {
        return [
            {
                id: 'materials',
                label: 'Материалы',
                categoryId: 'direct_materials',
                projectId: 'project_recycle_object',
            },
            {
                id: 'site_digital',
                label: 'Сайт / digital',
                categoryId: 'commercial_site',
                projectId: '__clear__',
                projectLabel: '__clear__',
            },
            {
                id: 'tax_orders',
                label: 'Налоги заказа',
                kind: 'tax',
                categoryId: 'taxes_orders',
                projectId: '__clear__',
                projectLabel: '__clear__',
            },
            {
                id: 'charity',
                label: 'Благотворительность',
                categoryId: 'other_charity',
                projectId: '__clear__',
                projectLabel: '__clear__',
            },
            {
                id: 'internal_transfer',
                label: 'Перевод',
                kind: 'transfer',
                categoryId: 'finance_transfers',
                projectId: '__clear__',
                projectLabel: '__clear__',
            },
            {
                id: 'production_payroll',
                label: 'ЗП производство',
                kind: 'payroll',
                categoryId: 'payroll_production',
                projectId: 'project_recycle_object',
            },
        ];
    },

    _customOperationPresets() {
        return this._normalizeOperationTemplates(this.workspace?.operationTemplates || []).map(item => ({
            id: item.id,
            label: item.label,
            kind: item.kind,
            categoryId: item.category_id,
            projectId: item.project_id,
            projectLabel: item.project_label,
            counterpartyId: item.counterparty_id,
            payrollEmployeeId: item.payroll_employee_id,
            transferAccountId: item.transfer_account_id,
            note: item.note,
            custom: true,
        }));
    },

    _operationQuickPresets() {
        return [
            ...this._builtinOperationPresets(),
            ...this._customOperationPresets(),
        ];
    },

    _findOperationPreset(presetId) {
        return this._operationQuickPresets().find(item => String(item?.id || '') === String(presetId || '')) || null;
    },

    _renderOperationPresetButtons(presets = [], scope = 'single', txKey = '') {
        const mode = scope === 'batch' ? 'batch' : 'single';
        return (Array.isArray(presets) ? presets : [])
            .map(preset => {
                const applyClick = mode === 'batch'
                    ? `Finance.applyBatchPreset('${this._escJs(preset.id)}', true)`
                    : `Finance.applyOperationPreset('${this._escJs(txKey)}', '${this._escJs(preset.id)}', true)`;
                const removeButton = preset.custom
                    ? `<button class="btn btn-outline btn-sm finance-template-chip__remove" onclick="Finance.removeOperationTemplate('${this._escJs(preset.id)}')" title="Удалить шаблон">×</button>`
                    : '';
                return `
                    <div class="finance-template-chip${preset.custom ? ' finance-template-chip--custom' : ''}">
                        <button class="btn btn-outline btn-sm" onclick="${applyClick}">${this._esc(preset.label)}</button>
                        ${removeButton}
                    </div>
                `;
            })
            .join('');
    },

    _renderOperationQuickPresets(scope = 'single', txKey = '') {
        const mode = scope === 'batch' ? 'batch' : 'single';
        const builtinPresets = this._builtinOperationPresets();
        const customPresets = this._customOperationPresets();
        const copyTitle = mode === 'batch' ? 'Готовые наборы' : 'Готовые сценарии';
        const copyText = mode === 'batch'
            ? 'Один клик: применить сценарий и подтвердить выбранную пачку.'
            : 'Один клик: применить сценарий, подтвердить и пойти дальше.';
        const customCopyText = mode === 'batch'
            ? 'Твои собственные пачки для повторяемых сценариев.'
            : 'Твои собственные сценарии рядом со встроенными пресетами.';
        const builderField = mode === 'batch' ? 'batch_template_name' : 'template_name';
        const builderValue = this._currentOperationTemplateDraftName(mode);
        const builderPlaceholder = mode === 'batch'
            ? 'Название шаблона для пачки'
            : 'Название шаблона для операции';
        const builderAction = mode === 'batch'
            ? 'Finance.saveBatchTemplate()'
            : `Finance.saveOperationTemplate('${this._escJs(txKey)}')`;
        return `
            <div class="finance-quick-presets finance-quick-presets--${this._escAttr(mode)}">
                <div class="finance-quick-presets__section">
                    <div class="finance-quick-presets__copy">
                        <span>${this._esc(copyTitle)}</span>
                        <strong>${this._esc(copyText)}</strong>
                    </div>
                    <div class="finance-quick-presets__actions">
                        ${this._renderOperationPresetButtons(builtinPresets, mode, txKey)}
                    </div>
                </div>

                ${customPresets.length > 0 ? `
                    <div class="finance-quick-presets__section finance-quick-presets__section--custom">
                        <div class="finance-quick-presets__copy">
                            <span>Мои шаблоны</span>
                            <strong>${this._esc(customCopyText)}</strong>
                        </div>
                        <div class="finance-quick-presets__actions finance-quick-presets__actions--templates">
                            ${this._renderOperationPresetButtons(customPresets, mode, txKey)}
                        </div>
                    </div>
                ` : ''}

                <div class="finance-quick-presets__builder">
                    <input
                        class="input"
                        value="${this._escAttr(builderValue)}"
                        placeholder="${this._escAttr(builderPlaceholder)}"
                        oninput="Finance.setOperationUiField('${this._escJs(builderField)}', this.value)"
                    >
                    <button class="btn btn-outline btn-sm" onclick="${builderAction}">Сохранить как шаблон</button>
                </div>
            </div>
        `;
    },

    _hasMeaningfulOperationTemplate(template) {
        if (!template || typeof template !== 'object') return false;
        return !!(
            template.kind
            || template.category_id
            || template.project_id
            || template.project_label
            || template.counterparty_id
            || template.payroll_employee_id
            || template.transfer_account_id
            || template.note
        );
    },

    _suggestOperationTemplateLabel(template) {
        if (!template || typeof template !== 'object') return 'Мой шаблон';
        const categoryName = template.category_id ? this._findById(this.workspace?.categories, template.category_id)?.name || '' : '';
        const projectName = template.project_id ? this._findById(this.workspace?.projects, template.project_id)?.name || '' : '';
        const explicitProject = String(template.project_label || '').trim();
        const kindLabel = this.TRANSACTION_KIND_LABELS[String(template.kind || '').trim()] || '';
        return [
            categoryName,
            projectName || explicitProject,
            !categoryName && !projectName && !explicitProject ? kindLabel : '',
            !categoryName && !projectName && !explicitProject && !kindLabel ? String(template.note || '').trim().slice(0, 28) : '',
        ].filter(Boolean).join(' · ') || 'Мой шаблон';
    },

    _prepareOperationTemplate(raw = {}, fallbackLabel = '') {
        const template = this._normalizeOperationTemplates([{
            ...raw,
            label: String(raw.label || fallbackLabel || '').trim() || this._suggestOperationTemplateLabel(raw),
            updated_at: new Date().toISOString(),
        }])[0];
        return template && this._hasMeaningfulOperationTemplate(template) ? template : null;
    },

    _upsertOperationTemplate(template) {
        if (!this.workspace) return null;
        const normalized = this._prepareOperationTemplate(template);
        if (!normalized) return null;
        const current = this._normalizeOperationTemplates(this.workspace.operationTemplates || []);
        const byId = current.find(item => String(item.id || '') === String(normalized.id || ''));
        const byLabel = !byId
            ? current.find(item => this._normalizeText(item.label || '') === this._normalizeText(normalized.label || ''))
            : null;
        const targetId = String(byId?.id || byLabel?.id || normalized.id || this._uid('op_template'));
        const nextTemplate = {
            ...(byId || byLabel || {}),
            ...normalized,
            id: targetId,
        };
        const nextMap = new Map(current.map(item => [String(item.id || ''), item]));
        nextMap.set(targetId, nextTemplate);
        this.workspace.operationTemplates = this._normalizeOperationTemplates(Array.from(nextMap.values()));
        return nextTemplate;
    },

    _pickNeighborOperationKey(keys = [], currentKey = '', offset = 1) {
        const normalizedKeys = (Array.isArray(keys) ? keys : []).map(item => String(item || '')).filter(Boolean);
        if (normalizedKeys.length === 0) return '';
        const key = String(currentKey || '').trim();
        const step = Number(offset) || 1;
        const index = normalizedKeys.indexOf(key);
        if (index === -1) return normalizedKeys[0] || '';
        return normalizedKeys[index + step]
            || normalizedKeys[index - 1]
            || normalizedKeys[index]
            || '';
    },

    _focusNeighborBeforeMutation(txKey, offset = 1) {
        const keys = this._visibleOperationKeys();
        const nextKey = this._pickNeighborOperationKey(keys, txKey, offset);
        this.ui.operations = {
            ...this.ui.operations,
            focus_tx_key: nextKey,
        };
    },

    _resolveFocusedOperationKey(visibleRows = []) {
        const rows = Array.isArray(visibleRows) ? visibleRows : [];
        const current = String(this.ui?.operations?.focus_tx_key || '').trim();
        if (current && rows.some(item => String(item?.txKey || '') === current)) return current;
        const fallback = String(rows[0]?.txKey || '').trim();
        if (fallback !== current) {
            this.ui.operations = {
                ...this.ui.operations,
                focus_tx_key: fallback,
            };
        }
        return fallback;
    },

    _normalizeTransactionDecisions(list) {
        const allowedKinds = new Set(Object.keys(this.TRANSACTION_KIND_LABELS));
        const map = new Map();
        (Array.isArray(list) ? list : []).forEach(item => {
            if (!item || typeof item !== 'object') return;
            const txKey = String(item.tx_key || item.id || '').trim();
            if (!txKey) return;
            const kind = String(item.kind || '').trim();
            map.set(txKey, {
                id: txKey,
                tx_key: txKey,
                kind: allowedKinds.has(kind) ? kind : '',
                project_id: String(item.project_id || '').trim(),
                project_label: String(item.project_label || '').trim(),
                category_id: String(item.category_id || '').trim(),
                counterparty_id: String(item.counterparty_id || '').trim(),
                payroll_employee_id: item.payroll_employee_id == null ? '' : String(item.payroll_employee_id).trim(),
                transfer_account_id: String(item.transfer_account_id || '').trim(),
                note: String(item.note || '').trim(),
                confirmed: !!item.confirmed,
                tx_date: this._parseBusinessDate(item.tx_date) || '',
                tx_amount: this._num(item.tx_amount),
                tx_direction: String(item.tx_direction || '').trim(),
                account_id: String(item.account_id || '').trim(),
                account_label: String(item.account_label || '').trim(),
                counterparty_name: String(item.counterparty_name || '').trim(),
                counterparty_inn: String(item.counterparty_inn || '').trim(),
                description: String(item.description || '').trim(),
                updated_at: item.updated_at || null,
            });
        });
        return Array.from(map.values());
    },

    _findTransactionDecision(txKey) {
        return this._findById(this.workspace?.transactionDecisions, txKey) || null;
    },

    _findTransactionRowByKey(txKey) {
        return (this.summary?.transactions?.rows || []).find(item => String(item?.txKey || '') === String(txKey || '')) || null;
    },

    _hasMeaningfulSuggestion(suggestion) {
        if (!suggestion || typeof suggestion !== 'object') return false;
        return !!(
            suggestion.categoryId
            || suggestion.projectId
            || suggestion.counterpartyProfileId
            || ['transfer', 'owner_money', 'payroll', 'tax', 'ignore'].includes(String(suggestion.kind || ''))
        );
    },

    _describeSuggestion(suggestion) {
        if (!this._hasMeaningfulSuggestion(suggestion)) return 'Нового контрагента нужно дообучить';
        const parts = [
            suggestion?.categoryName || '',
            suggestion?.projectName || '',
            suggestion?.counterpartyProfileName || '',
        ].filter(Boolean);
        return parts.join(' → ') || 'Подсказка системы готова';
    },

    _confirmTransactionDecisionLocally(txKey) {
        const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
        decision.confirmed = true;
        decision.updated_at = new Date().toISOString();
        this._upsertTransactionDecision(decision);
    },

    _applySuggestionToDecision(decision, row, tx) {
        if (!decision) return decision;
        const suggestion = row?.suggestion || null;
        if (!this._hasMeaningfulSuggestion(suggestion)) return decision;

        const inferredKind = suggestion.kind
            || this._inferTransactionKind(tx, suggestion, this.workspace, this._guessEmployeeForTransaction(tx, this.data.employees));
        this._applyKindToDecision(decision, tx, inferredKind);

        decision.category_id = String(suggestion.categoryId || '').trim();
        decision.project_id = String(suggestion.projectId || '').trim();
        decision.counterparty_id = String(suggestion.counterpartyProfileId || '').trim();

        if (decision.category_id) {
            const derivedKind = this._kindFromCategoryId(decision.category_id, this.workspace, tx);
            if (!suggestion.kind && ['transfer', 'owner_money', 'payroll', 'tax'].includes(derivedKind)) {
                this._applyKindToDecision(decision, tx, derivedKind);
            } else if (!suggestion.kind) {
                decision.kind = derivedKind;
            }
        }

        if (decision.kind === 'transfer') {
            decision.project_id = '';
            decision.counterparty_id = decision.counterparty_id || '';
        } else if (decision.kind === 'owner_money' || decision.kind === 'ignore') {
            decision.project_id = '';
            decision.counterparty_id = '';
        }
        return decision;
    },

    _applyPresetToDecision(decision, tx, preset) {
        if (!decision || !preset) return decision;

        if (preset.kind) {
            this._applyKindToDecision(decision, tx, preset.kind);
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'categoryId')) {
            decision.category_id = preset.categoryId === '__clear__'
                ? ''
                : String(preset.categoryId || '').trim();
            if (decision.category_id) {
                const derivedKind = this._kindFromCategoryId(decision.category_id, this.workspace, tx);
                if (!preset.kind && ['transfer', 'owner_money', 'payroll', 'tax'].includes(derivedKind)) {
                    this._applyKindToDecision(decision, tx, derivedKind);
                } else if (!preset.kind) {
                    decision.kind = derivedKind;
                    if (derivedKind !== 'payroll') decision.payroll_employee_id = '';
                    if (derivedKind !== 'transfer') decision.transfer_account_id = '';
                }
            }
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'projectId')) {
            if (preset.projectId === '__clear__') {
                decision.project_id = '';
                decision.project_label = '';
            } else {
                decision.project_id = String(preset.projectId || '').trim();
            }
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'projectLabel')) {
            decision.project_label = preset.projectLabel === '__clear__'
                ? ''
                : String(preset.projectLabel || '').trim();
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'counterpartyId')) {
            decision.counterparty_id = preset.counterpartyId === '__clear__'
                ? ''
                : String(preset.counterpartyId || '').trim();
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'payrollEmployeeId')) {
            decision.payroll_employee_id = preset.payrollEmployeeId === '__clear__'
                ? ''
                : String(preset.payrollEmployeeId || '').trim();
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'transferAccountId')) {
            decision.transfer_account_id = preset.transferAccountId === '__clear__'
                ? ''
                : String(preset.transferAccountId || '').trim();
        }

        if (Object.prototype.hasOwnProperty.call(preset, 'note')) {
            decision.note = preset.note === '__clear__'
                ? ''
                : String(preset.note || '').trim();
        }

        if (decision.kind === 'transfer') {
            decision.project_id = '';
            decision.project_label = '';
        } else if (decision.kind === 'owner_money' || decision.kind === 'ignore') {
            decision.project_id = '';
            decision.project_label = '';
            decision.counterparty_id = '';
        }
        return decision;
    },

    _applyPresetToKeys(keys = [], preset, confirmAfter = false) {
        const normalizedKeys = (Array.isArray(keys) ? keys : []).map(item => String(item || '').trim()).filter(Boolean);
        const appliedKeys = [];
        normalizedKeys.forEach(txKey => {
            const tx = this._findTransactionByKey(txKey);
            if (!tx) return;
            const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
            this._applyPresetToDecision(decision, tx, preset);
            if (confirmAfter) decision.confirmed = true;
            decision.updated_at = new Date().toISOString();
            this._upsertTransactionDecision(decision);
            appliedKeys.push(txKey);
        });
        return {
            appliedKeys,
            skippedKeys: normalizedKeys.filter(txKey => !appliedKeys.includes(txKey)),
        };
    },

    _applySuggestionsToKeys(keys = [], confirmAfter = false) {
        const normalizedKeys = (Array.isArray(keys) ? keys : []).map(item => String(item || '').trim()).filter(Boolean);
        const appliedKeys = [];
        normalizedKeys.forEach(txKey => {
            const row = this._findTransactionRowByKey(txKey);
            const tx = row || this._findTransactionByKey(txKey);
            if (!tx || !this._hasMeaningfulSuggestion(row?.suggestion)) return;
            const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
            this._applySuggestionToDecision(decision, row, tx);
            if (confirmAfter) decision.confirmed = true;
            decision.updated_at = new Date().toISOString();
            this._upsertTransactionDecision(decision);
            appliedKeys.push(txKey);
        });
        return {
            appliedKeys,
            skippedKeys: normalizedKeys.filter(txKey => !appliedKeys.includes(txKey)),
        };
    },

    _applyBatchFieldsToDecision(decision, tx, batch) {
        if (!decision || !batch) return decision;
        if (batch.categoryId !== '__keep__') {
            decision.category_id = String(batch.categoryId || '').trim();
            if (decision.category_id) {
                const derivedKind = this._kindFromCategoryId(decision.category_id, this.workspace, tx);
                if (['transfer', 'owner_money', 'payroll', 'tax'].includes(derivedKind)) {
                    this._applyKindToDecision(decision, tx, derivedKind);
                } else {
                    decision.kind = derivedKind;
                }
            }
        }
        if (batch.projectId !== '__keep__') {
            decision.project_id = String(batch.projectId || '').trim();
        }
        if (batch.projectLabel) {
            decision.project_label = batch.projectLabel;
        }
        if (batch.note) {
            decision.note = batch.note;
        }
        return decision;
    },

    _applyBatchClearToDecision(decision, tx, clearMode = 'all') {
        if (!decision) return decision;
        const mode = String(clearMode || 'all').trim() || 'all';
        if (mode === 'category' || mode === 'all') {
            decision.category_id = '';
            if (['tax', 'payroll'].includes(String(decision.kind || ''))) {
                decision.kind = tx?.direction === 'in' ? 'income' : 'expense';
                if (decision.kind !== 'payroll') decision.payroll_employee_id = '';
            }
        }
        if (mode === 'project' || mode === 'all') {
            decision.project_id = '';
        }
        if (mode === 'project_label' || mode === 'all') {
            decision.project_label = '';
        }
        if (mode === 'note' || mode === 'all') {
            decision.note = '';
        }
        return decision;
    },

    _applyKindToDecision(decision, tx, kind) {
        decision.kind = String(kind || '').trim();
        if (decision.kind === 'transfer') {
            decision.category_id = decision.category_id || 'finance_transfers';
            decision.project_id = '';
            decision.project_label = '';
            decision.payroll_employee_id = '';
        } else if (decision.kind === 'owner_money') {
            decision.category_id = decision.category_id || 'finance_owner_money';
            decision.project_id = '';
            decision.project_label = '';
            decision.payroll_employee_id = '';
            decision.transfer_account_id = '';
        } else if (decision.kind === 'tax') {
            decision.category_id = decision.category_id || 'taxes_usn';
            decision.payroll_employee_id = '';
        } else if (decision.kind === 'payroll') {
            const guessedEmployee = decision.payroll_employee_id
                ? this._findById(this.data.employees, decision.payroll_employee_id)
                : this._guessEmployeeForTransaction(tx, this.data.employees);
            if (guessedEmployee && !decision.payroll_employee_id) decision.payroll_employee_id = String(guessedEmployee.id || '');
            decision.category_id = decision.category_id || this._employeePayrollCategoryId(guessedEmployee) || 'payroll_production';
            decision.project_id = decision.project_id || 'project_recycle_object';
            decision.transfer_account_id = '';
        } else if (decision.kind === 'ignore') {
            decision.project_id = '';
            decision.project_label = '';
            decision.category_id = '';
            decision.counterparty_id = '';
            decision.payroll_employee_id = '';
            decision.transfer_account_id = '';
        }
        return decision;
    },

    _markTransactionKindLocally(txKey, kind) {
        const tx = this._findTransactionByKey(txKey);
        const decision = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
        this._applyKindToDecision(decision, tx, kind);
        decision.updated_at = new Date().toISOString();
        this._upsertTransactionDecision(decision);
    },

    _seedTransactionDecision(txKey) {
        const tx = this._findTransactionByKey(txKey);
        const seeded = this._normalizeTransactionDecisions([{
            tx_key: txKey,
            tx_date: tx?.date || '',
            tx_amount: this._num(tx?.amount),
            tx_direction: tx?.direction || '',
            account_id: tx?.accountId || '',
            account_label: tx?.accountLabel || '',
            counterparty_name: tx?.counterpartyName || '',
            counterparty_inn: tx?.counterpartyInn || '',
            description: tx?.description || '',
        }])[0];
        return seeded || {
            id: txKey,
            tx_key: txKey,
            kind: '',
            project_id: '',
            project_label: '',
            category_id: '',
            counterparty_id: '',
            payroll_employee_id: '',
            transfer_account_id: '',
            note: '',
            confirmed: false,
            tx_date: '',
            tx_amount: 0,
            tx_direction: '',
            account_id: '',
            account_label: '',
            counterparty_name: '',
            counterparty_inn: '',
            description: '',
            updated_at: null,
        };
    },

    _upsertTransactionDecision(decision) {
        const normalized = this._normalizeTransactionDecisions([decision])[0];
        if (!normalized) return;
        const map = new Map((this.workspace?.transactionDecisions || []).map(item => [String(item.tx_key || ''), item]));
        map.set(String(normalized.tx_key), normalized);
        this.workspace.transactionDecisions = this._normalizeTransactionDecisions(Array.from(map.values()));
    },

    _hasMeaningfulDecision(decision) {
        if (!decision) return false;
        return !!(
            decision.confirmed
            || decision.kind
            || decision.project_id
            || decision.project_label
            || decision.category_id
            || decision.counterparty_id
            || decision.payroll_employee_id
            || decision.transfer_account_id
            || decision.note
        );
    },

    _decisionFromRow(row, txKey) {
        const tx = this._findTransactionByKey(txKey);
        const existing = this._findTransactionDecision(txKey) || this._seedTransactionDecision(txKey);
        const normalized = this._normalizeTransactionDecisions([{
            ...existing,
            tx_key: txKey,
            kind: this._rowValue(row, 'kind'),
            project_id: this._rowValue(row, 'project_id'),
            project_label: this._rowValue(row, 'project_label'),
            category_id: this._rowValue(row, 'category_id'),
            counterparty_id: this._rowValue(row, 'counterparty_id'),
            payroll_employee_id: this._rowValue(row, 'payroll_employee_id'),
            transfer_account_id: this._rowValue(row, 'transfer_account_id'),
            note: this._rowValue(row, 'note'),
            confirmed: this._rowChecked(row, 'confirmed'),
            tx_date: tx?.date || existing.tx_date || '',
            tx_amount: this._num(tx?.amount ?? existing.tx_amount),
            tx_direction: tx?.direction || existing.tx_direction || '',
            account_id: tx?.accountId || existing.account_id || '',
            account_label: tx?.accountLabel || existing.account_label || '',
            counterparty_name: tx?.counterpartyName || existing.counterparty_name || '',
            counterparty_inn: tx?.counterpartyInn || existing.counterparty_inn || '',
            description: tx?.description || existing.description || '',
            updated_at: new Date().toISOString(),
        }])[0];
        return this._hasMeaningfulDecision(normalized) ? normalized : null;
    },

    _findTransactionByKey(txKey) {
        const normalizedKey = String(txKey || '');
        const manualRows = this._manualTransactionsToBankRows(this.workspace);
        const recurringRows = this._recurringTransactionsToBankRows(this.workspace);
        const tochkaAccounts = Array.isArray(this.data?.tochkaSnapshot?.accounts) ? this.data.tochkaSnapshot.accounts : [];
        const fintabloRows = this._fintabloTransactionsToRows(this.data?.fintabloSnapshot, tochkaAccounts);
        return [
            ...((this.summary?.transactions?.rows || []).filter(item => item && typeof item === 'object')),
            ...manualRows,
            ...recurringRows,
            ...((this.data?.tochkaSnapshot?.transactions || []).filter(item => item && typeof item === 'object')),
            ...fintabloRows,
        ].find(item => String(item?.txKey || this._transactionKey(item)) === normalizedKey) || null;
    },

    _findManualTransactionByTxKey(txKey) {
        const matched = this._manualTransactionsToBankRows(this.workspace)
            .find(item => this._transactionKey(item) === String(txKey || ''));
        if (!matched?.manualId) return null;
        return this._findById(this.workspace?.manualTransactions, matched.manualId) || null;
    },

    _manualTransactionToRawRow(item, workspace = this.workspace) {
        if (!item) return null;
        const account = this._findById(workspace?.accounts, item.account_id);
        return {
            manualId: item.id,
            transactionId: `manual:${item.id}`,
            accountId: item.account_id,
            accountLabel: account?.name || item.account_id,
            date: item.date,
            direction: item.direction,
            amount: item.amount,
            counterpartyName: item.counterparty_name,
            description: item.description,
            sourceKind: 'manual',
        };
    },

    _updateManualTransactionRecord(txKey, patch = {}) {
        if (!this.workspace) return { oldTxKey: String(txKey || ''), newTxKey: '' };
        const current = this._findManualTransactionByTxKey(txKey);
        if (!current) return { oldTxKey: String(txKey || ''), newTxKey: '' };

        const nextManual = this._normalizeManualTransactions([{
            ...current,
            ...patch,
            id: current.id,
        }])[0];
        if (!nextManual) return { oldTxKey: String(txKey || ''), newTxKey: '' };

        this.workspace.manualTransactions = this._normalizeManualTransactions(
            (this.workspace.manualTransactions || []).map(item => String(item?.id || '') === String(current.id || '') ? nextManual : item)
        );

        const oldKey = String(txKey || '');
        const nextRawTx = this._manualTransactionToRawRow(nextManual, this.workspace);
        const newTxKey = String(this._transactionKey(nextRawTx) || '');
        const existingDecision = this._findTransactionDecision(oldKey);
        if (existingDecision) {
            const nextDecision = this._normalizeTransactionDecisions([{
                ...existingDecision,
                id: newTxKey,
                tx_key: newTxKey,
                tx_date: nextManual.date,
                tx_amount: nextManual.amount,
                tx_direction: nextManual.direction,
                account_id: nextManual.account_id,
                account_label: nextRawTx?.accountLabel || nextManual.account_id,
                counterparty_name: nextManual.counterparty_name,
                description: nextManual.description,
                updated_at: new Date().toISOString(),
            }])[0];
            const map = new Map((this.workspace.transactionDecisions || []).map(item => [String(item?.tx_key || ''), item]));
            map.delete(oldKey);
            if (nextDecision) map.set(newTxKey, nextDecision);
            this.workspace.transactionDecisions = this._normalizeTransactionDecisions(Array.from(map.values()));
        }

        this._replaceOperationKeyInUi(oldKey, newTxKey);
        return {
            manualId: String(current.id || ''),
            oldTxKey: oldKey,
            newTxKey,
        };
    },

    _transactionKey(tx) {
        if (!tx || typeof tx !== 'object') return '';
        const accountId = String(tx.accountId || '');
        const explicitId = String(tx.transactionId || tx.paymentId || tx.documentNumber || '').trim();
        if (explicitId) return `${accountId}::${explicitId}`;
        const amountKey = Math.round(this._num(tx.amount) * 100);
        return [
            accountId,
            String(tx.date || ''),
            String(tx.direction || ''),
            String(amountKey),
            this._normalizeText(tx.counterpartyName || '').slice(0, 48),
            this._normalizeText(tx.description || '').slice(0, 72),
        ].join('::');
    },

    _buildDecisionMap(workspace) {
        return new Map(this._normalizeTransactionDecisions(workspace?.transactionDecisions || []).map(item => [String(item.tx_key || ''), item]));
    },

    _employeePayrollCategoryId(employee) {
        const role = String(employee?.role || '').toLowerCase();
        if (['management', 'office', 'sales', 'admin'].includes(role)) return 'payroll_office';
        if (['marketplaces', 'ecom', 'shop'].includes(role)) return 'payroll_marketplaces';
        return employee ? 'payroll_production' : '';
    },

    _guessEmployeeForTransaction(tx, employees = []) {
        const txText = this._transactionText(tx);
        let best = null;
        (employees || []).filter(item => item && item.is_active !== false).forEach(employee => {
            const fullName = this._normalizeText(employee.name || '');
            if (!fullName) return;
            let score = 0;
            let reason = '';
            if (txText.includes(fullName)) {
                score = 0.92;
                reason = `имя "${employee.name}"`;
            } else {
                const shortName = fullName.split(' ')[0] || '';
                if (shortName.length >= 3 && txText.includes(shortName)) {
                    score = 0.76;
                    reason = `короткое имя "${shortName}"`;
                }
            }
            if (!score) return;
            const candidate = { ...employee, matchScore: score, matchReason: reason };
            if (!best || candidate.matchScore > best.matchScore) best = candidate;
        });
        return best;
    },

    _kindFromCategoryId(categoryId, workspace, tx) {
        const category = this._findById(workspace?.categories, categoryId);
        if (String(categoryId || '') === 'finance_transfers') return 'transfer';
        if (String(categoryId || '') === 'finance_owner_money') return 'owner_money';
        if (category?.group === 'payroll') return 'payroll';
        if (category?.group === 'taxes') return 'tax';
        return String(tx?.direction || '') === 'in' ? 'income' : 'expense';
    },

    _looksLikeTransferTransaction(tx, suggestion) {
        const text = this._transactionText(tx);
        return String(suggestion?.categoryId || '') === 'finance_transfers'
            || text.includes('перевод')
            || text.includes('между счетами')
            || text.includes('собственных средств');
    },

    _looksLikePayrollTransaction(tx, suggestion, employeeGuess = null) {
        const text = this._transactionText(tx);
        const categoryId = String(suggestion?.categoryId || '');
        return categoryId.startsWith('payroll_')
            || text.includes('зарплат')
            || text.includes('зп')
            || text.includes('аванс')
            || !!employeeGuess;
    },

    _inferTransactionKind(tx, suggestion, workspace, employeeGuess = null) {
        if (suggestion?.kind) return String(suggestion.kind);
        const categoryKind = this._kindFromCategoryId(suggestion?.categoryId, workspace, tx);
        if (suggestion?.categoryId) return categoryKind;
        if (this._looksLikeTransferTransaction(tx, suggestion)) return 'transfer';
        if (this._looksLikePayrollTransaction(tx, suggestion, employeeGuess)) return 'payroll';
        return String(tx?.direction || '') === 'in' ? 'income' : 'expense';
    },

    _buildFixedAssetRows(workspace, asOfMonth = this._businessMonthFromDate(this._todayDateLocal())) {
        return this._normalizeFixedAssets(workspace?.fixedAssets).map(item => {
            const plan = this._buildAmortizationPlan(item.purchase_cost, item.useful_life_months);
            const monthOffset = this._businessMonthDistance(item.opiu_start_month, asOfMonth);
            const scheduleIndex = monthOffset == null ? -1 : monthOffset + 1;
            const monthsElapsed = Math.max(0, Math.min(item.useful_life_months, scheduleIndex));
            const accumulated = this._roundMoney(plan.slice(0, monthsElapsed).reduce((sum, value) => sum + this._num(value), 0));
            const residual = this._roundMoney(Math.max(0, this._num(item.purchase_cost) - accumulated));
            const currentMonthAmortization = (scheduleIndex >= 1 && scheduleIndex <= item.useful_life_months)
                ? this._roundMoney(plan[scheduleIndex - 1] || 0)
                : 0;
            const payableAmount = item.purchased_earlier
                ? 0
                : this._roundMoney(Math.max(0, this._num(item.purchase_cost) - this._num(item.paid_amount)));
            const overpaidAmount = item.purchased_earlier
                ? 0
                : this._roundMoney(Math.max(0, this._num(item.paid_amount) - this._num(item.purchase_cost)));
            const status = residual <= 0
                ? 'amortized'
                : scheduleIndex < 1
                    ? 'planned'
                    : 'active';
            return {
                ...item,
                monthly_amortization: this._roundMoney(plan[0] || 0),
                current_month_amortization: currentMonthAmortization,
                accumulated_amortization: accumulated,
                residual_value: residual,
                payable_amount: payableAmount,
                overpaid_amount: overpaidAmount,
                months_elapsed: monthsElapsed,
                months_remaining: Math.max(0, item.useful_life_months - monthsElapsed),
                status,
                project_name: this._resolveProjectName(item.project_id, workspace),
                type_label: this.FIXED_ASSET_TYPE_LABELS[item.asset_type] || item.asset_type || 'Другое',
            };
        });
    },

    _buildAmortizationPlan(cost, months) {
        const safeCost = this._roundMoney(cost);
        const safeMonths = Math.min(240, Math.max(1, Number(months) || 1));
        const base = this._roundMoney(safeCost / safeMonths);
        const plan = [];
        let remaining = safeCost;
        for (let index = 0; index < safeMonths; index += 1) {
            const slice = index === safeMonths - 1 ? remaining : Math.min(remaining, base);
            const normalized = this._roundMoney(slice);
            plan.push(normalized);
            remaining = this._roundMoney(remaining - normalized);
        }
        return plan;
    },

    _buildManagementReports({ workspace, employees, timeEntries, transactionsRows, orders, tochkaSnapshot, fintabloSnapshot }) {
        const availableMonths = this._collectAvailableReportMonths({
            transactionsRows,
            timeEntries,
            fixedAssets: workspace?.fixedAssets || [],
        });
        const selectedMonth = this._parseBusinessMonth(this.ui?.report?.month)
            || availableMonths[0]?.value
            || this._businessMonthFromDate(this._todayDateLocal());
        const monthRows = (transactionsRows || []).filter(item => String(item?.date || '').startsWith(`${selectedMonth}-`));
        const fixedAssetRows = this._buildFixedAssetRows(workspace, selectedMonth);
        const payroll = this._buildPayrollManagementReport({
            employees,
            timeEntries,
            orders,
            monthRows,
            selectedMonth,
        });
        const opiu = this._buildOpiuReport({
            workspace,
            monthRows,
            fixedAssetRows,
            payroll,
        });
        const profitability = this._buildProfitabilityReport({
            monthRows,
            payroll,
        });
        const obligations = this._buildObligationsReport({
            payroll,
            fixedAssetRows,
        });
        const balance = this._buildBalanceReport({
            workspace,
            payroll,
            fixedAssetRows,
            tochkaSnapshot,
            fintabloSnapshot,
        });
        return {
            month: selectedMonth,
            monthLabel: this._formatBusinessMonth(selectedMonth),
            availableMonths,
            payroll,
            opiu,
            profitability,
            obligations,
            balance,
        };
    },

    _collectAvailableReportMonths({ transactionsRows, timeEntries, fixedAssets }) {
        const monthSet = new Set();
        (transactionsRows || []).forEach(item => {
            const month = this._parseBusinessMonth(item?.date);
            if (month) monthSet.add(month);
        });
        (timeEntries || []).forEach(item => {
            const month = this._parseBusinessMonth(item?.date);
            if (month) monthSet.add(month);
        });
        this._normalizeFixedAssets(fixedAssets).forEach(item => {
            const month = this._parseBusinessMonth(item?.opiu_start_month);
            if (month) monthSet.add(month);
        });
        const fallback = this._businessMonthFromDate(this._todayDateLocal());
        if (fallback) monthSet.add(fallback);
        return Array.from(monthSet)
            .sort((a, b) => String(b).localeCompare(String(a)))
            .slice(0, 24)
            .map(value => ({ value, label: this._formatBusinessMonth(value) }));
    },

    _employeeActiveInMonth(employee, month) {
        if (!employee) return false;
        const firedMonth = this._parseBusinessMonth(employee.fired_date);
        if (firedMonth && String(firedMonth) < String(month)) return false;
        return employee.is_active !== false || firedMonth === String(month);
    },

    _allocateAmountByWeights(entries = [], amount = 0, weightField = 'weight') {
        const normalizedEntries = (Array.isArray(entries) ? entries : [])
            .map(item => ({
                ...item,
                [weightField]: this._num(item?.[weightField]),
            }))
            .filter(item => this._num(item?.[weightField]) > 0);
        const totalAmount = this._roundMoney(amount);
        if (normalizedEntries.length === 0 || totalAmount <= 0) return [];
        const totalWeight = normalizedEntries.reduce((sum, item) => sum + this._num(item?.[weightField]), 0);
        if (totalWeight <= 0) return [];
        let remaining = totalAmount;
        return normalizedEntries.map((item, index) => {
            const isLast = index === normalizedEntries.length - 1;
            const slice = isLast
                ? remaining
                : this._roundMoney(totalAmount * (this._num(item?.[weightField]) / totalWeight));
            const amountSlice = this._roundMoney(Math.min(remaining, Math.max(0, slice)));
            remaining = this._roundMoney(remaining - amountSlice);
            return {
                ...item,
                amount: amountSlice,
            };
        });
    },

    _findEmployeeForTimeEntry(entry, employees = []) {
        const employeeId = entry?.employee_id != null ? String(entry.employee_id) : '';
        if (employeeId) {
            const direct = (employees || []).find(item => String(item?.id || '') === employeeId);
            if (direct) return direct;
        }
        const worker = this._normalizeText(entry?.employee_name || entry?.worker_name || '');
        if (!worker) return null;
        return (employees || []).find(item => {
            const candidate = this._normalizeText(item?.name || '');
            return candidate && (candidate === worker || candidate.startsWith(worker) || worker.startsWith(candidate));
        }) || null;
    },

    _isWeekendDate(value) {
        const date = this._dateFromBusinessDate(value);
        if (!date) return false;
        const day = date.getDay();
        return day === 0 || day === 6;
    },

    _normalizePayrollEmployeeConfig(employee) {
        const role = String(employee?.role || '').trim().toLowerCase();
        const payrollProfile = String(employee?.payroll_profile || '').trim()
            || ((this._num(employee?.pay_base_salary_month) > 0 && role !== 'production') ? 'salary_monthly' : 'hourly');
        const baseSalary = this._roundMoney(employee?.pay_base_salary_month || (this._num(employee?.pay_white_salary) + this._num(employee?.pay_black_salary)));
        const baseHours = Math.max(1, this._num(employee?.pay_base_hours_month) || 176);
        const baseRate = baseSalary > 0 ? this._roundMoney(baseSalary / baseHours) : 0;
        const hourlyRate = this._roundMoney(
            this._num(employee?.hourly_rate)
            || this._num(employee?.hourly_cost)
            || this._num(employee?.cost_per_hour)
            || this._num(employee?.fot_per_hour)
            || this._num(employee?.pay_overtime_hour_rate)
            || baseRate
        );
        const weekendRate = this._roundMoney(this._num(employee?.pay_weekend_hour_rate) || hourlyRate || baseRate);
        const holidayRate = this._roundMoney(this._num(employee?.pay_holiday_hour_rate) || weekendRate || hourlyRate || baseRate);
        return {
            role,
            payrollProfile,
            baseSalary,
            baseHours,
            baseRate: this._roundMoney(baseRate || hourlyRate),
            hourlyRate: this._roundMoney(hourlyRate || baseRate),
            weekendRate,
            holidayRate,
            isProduction: role === 'production',
        };
    },

    _buildPayrollManagementReport({ employees, timeEntries, orders, monthRows, selectedMonth }) {
        const ordersById = new Map((orders || []).map(item => [String(item?.id || ''), item]));
        const productionStats = new Map();
        (timeEntries || []).forEach(entry => {
            const date = this._parseBusinessDate(entry?.date);
            if (!date || !String(date).startsWith(`${selectedMonth}-`)) return;
            const employee = this._findEmployeeForTimeEntry(entry, employees);
            if (!employee || String(employee?.role || '').toLowerCase() !== 'production') return;
            const key = String(employee.id || '');
            if (!productionStats.has(key)) {
                productionStats.set(key, {
                    regularHours: 0,
                    weekendHours: 0,
                    holidayHours: 0,
                    topOrders: {},
                });
            }
            const stats = productionStats.get(key);
            const hours = this._num(entry?.hours);
            if (this._isWeekendDate(date)) stats.weekendHours += hours;
            else stats.regularHours += hours;
            const explicitName = String(entry?.order_name || '').trim();
            const orderId = entry?.order_id != null ? String(entry.order_id) : '';
            const orderName = explicitName || ordersById.get(orderId)?.order_name || ordersById.get(orderId)?.name || '';
            if (orderName) stats.topOrders[orderName] = (stats.topOrders[orderName] || 0) + hours;
        });

        const payments = new Map();
        const marked = new Map();
        const unassignedPayments = [];
        (monthRows || []).forEach(row => {
            if (String(row?.kind || '') !== 'payroll') return;
            const employeeId = String(row?.payrollEmployeeId || '');
            const amount = this._roundMoney(Math.abs(this._num(row?.amount)));
            if (!employeeId) {
                unassignedPayments.push({
                    date: row?.date || '',
                    amount,
                    amountLabel: row?.amountLabel || this.fmtRub(amount),
                    counterpartyName: row?.counterpartyName || '',
                    accountLabel: row?.accountLabel || '',
                    routeLabel: row?.routeLabel || '',
                });
                return;
            }
            marked.set(employeeId, this._roundMoney((marked.get(employeeId) || 0) + amount));
            if (row?.confirmed) payments.set(employeeId, this._roundMoney((payments.get(employeeId) || 0) + amount));
        });

        const rows = (employees || [])
            .filter(employee => this._employeeActiveInMonth(employee, selectedMonth))
            .map(employee => {
                const config = this._normalizePayrollEmployeeConfig(employee);
                const stats = productionStats.get(String(employee.id || '')) || {
                    regularHours: 0,
                    weekendHours: 0,
                    holidayHours: 0,
                    topOrders: {},
                };
                let accrued = 0;
                if (config.isProduction) {
                    if (config.payrollProfile === 'hourly') {
                        accrued = this._roundMoney(
                            stats.regularHours * config.hourlyRate
                            + stats.weekendHours * config.weekendRate
                            + stats.holidayHours * config.holidayRate
                        );
                    } else {
                        const overtimeHours = Math.max(0, stats.regularHours - config.baseHours);
                        accrued = this._roundMoney(
                            config.baseSalary
                            + overtimeHours * config.hourlyRate
                            + stats.weekendHours * config.weekendRate
                            + stats.holidayHours * config.holidayRate
                        );
                    }
                } else {
                    accrued = this._roundMoney(config.baseSalary);
                }
                const paid = this._roundMoney(payments.get(String(employee.id || '')) || 0);
                const markedPaid = this._roundMoney(marked.get(String(employee.id || '')) || 0);
                const payable = this._roundMoney(Math.max(0, accrued - paid));
                const overpaid = this._roundMoney(Math.max(0, paid - accrued));
                const topTargets = this._topEntries(stats.topOrders, 3).map(([name, hours]) => `${name} · ${this._roundMoney(hours)}ч`);
                const payrollAllocations = config.isProduction
                    ? this._allocateAmountByWeights(
                        Object.entries(stats.topOrders || {}).map(([label, hours]) => ({ label, hours })),
                        accrued,
                        'hours'
                    )
                    : [];
                const allocatedAccrued = this._roundMoney(payrollAllocations.reduce((sum, item) => sum + this._num(item.amount), 0));
                const unassignedAccrued = config.isProduction
                    ? this._roundMoney(Math.max(0, accrued - allocatedAccrued))
                    : 0;
                return {
                    employeeId: String(employee.id || ''),
                    employeeName: employee.name || `Сотрудник ${employee.id}`,
                    role: config.role || 'other',
                    payrollProfile: config.payrollProfile,
                    isProduction: config.isProduction,
                    regularHours: this._roundMoney(stats.regularHours),
                    weekendHours: this._roundMoney(stats.weekendHours),
                    holidayHours: this._roundMoney(stats.holidayHours),
                    totalHours: this._roundMoney(stats.regularHours + stats.weekendHours + stats.holidayHours),
                    accrued,
                    paid,
                    markedPaid,
                    payable,
                    overpaid,
                    payrollAllocations,
                    allocatedAccrued,
                    unassignedAccrued,
                    focusLabel: topTargets.join(' · '),
                };
            })
            .filter(item => item.accrued > 0 || item.paid > 0 || item.markedPaid > 0 || item.totalHours > 0)
            .sort((a, b) => {
                const debtDiff = this._num(b.payable) - this._num(a.payable);
                if (Math.abs(debtDiff) > 0.009) return debtDiff;
                return String(a.employeeName || '').localeCompare(String(b.employeeName || ''), 'ru');
            });

        return {
            month: selectedMonth,
            monthLabel: this._formatBusinessMonth(selectedMonth),
            rows,
            employeeCount: rows.length,
            productionAccrued: this._roundMoney(rows.filter(item => item.isProduction).reduce((sum, item) => sum + this._num(item.accrued), 0)),
            nonProductionAccrued: this._roundMoney(rows.filter(item => !item.isProduction).reduce((sum, item) => sum + this._num(item.accrued), 0)),
            totalAccrued: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.accrued), 0)),
            paidConfirmed: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.paid), 0)),
            paidMarked: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.markedPaid), 0)),
            payableAmount: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.payable), 0)),
            overpaidAmount: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.overpaid), 0)),
            allocatedProductionAccrued: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.allocatedAccrued), 0)),
            unassignedProductionAccrued: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.unassignedAccrued), 0)),
            unassignedPayments,
            unassignedPaymentsAmount: this._roundMoney(unassignedPayments.reduce((sum, item) => sum + this._num(item.amount), 0)),
            unassignedPaymentsCount: unassignedPayments.length,
        };
    },

    _buildOpiuReport({ workspace, monthRows, fixedAssetRows, payroll }) {
        const totals = {
            revenue: 0,
            direct: 0,
            commercial: 0,
            overhead: 0,
            taxes: 0,
            other: 0,
            investment: 0,
        };
        (monthRows || []).forEach(row => {
            if (['transfer', 'owner_money', 'ignore'].includes(String(row?.kind || ''))) return;
            const group = String(row?.categoryGroup || '').trim();
            const amount = this._roundMoney(Math.abs(this._num(row?.amount)));
            if (!group || amount <= 0) return;
            if (group === 'income' && String(row?.direction || '') === 'in') totals.revenue += amount;
            else if (String(row?.direction || '') === 'out') {
                if (group === 'direct') totals.direct += amount;
                else if (group === 'commercial') totals.commercial += amount;
                else if (group === 'overhead' && String(row?.categoryId || '') !== 'overhead_amortization') totals.overhead += amount;
                else if (group === 'taxes') totals.taxes += amount;
                else if (group === 'investment') totals.investment += amount;
                else if (!['finance', 'payroll', 'income'].includes(group)) totals.other += amount;
            }
        });
        Object.keys(totals).forEach(key => { totals[key] = this._roundMoney(totals[key]); });
        const amortization = this._roundMoney((fixedAssetRows || []).reduce((sum, item) => sum + this._num(item.current_month_amortization), 0));
        const payrollProduction = this._roundMoney(payroll?.productionAccrued || 0);
        const payrollFixed = this._roundMoney(payroll?.nonProductionAccrued || 0);
        const grossProfit = this._roundMoney(totals.revenue - totals.direct);
        const ebitda = this._roundMoney(grossProfit - payrollProduction - payrollFixed - totals.commercial - totals.overhead - totals.other);
        const operatingProfit = this._roundMoney(ebitda - amortization - totals.taxes);
        return {
            ...totals,
            payrollProduction,
            payrollFixed,
            amortization,
            grossProfit,
            ebitda,
            operatingProfit,
        };
    },

    _buildProfitabilityReport({ monthRows, payroll }) {
        const map = new Map();
        const ensureEntry = (key, label = '') => {
            const safeKey = String(key || '').trim();
            if (!safeKey) return null;
            if (!map.has(safeKey)) {
                map.set(safeKey, {
                    label: label || safeKey,
                    revenue: 0,
                    direct: 0,
                    commercial: 0,
                    payroll: 0,
                    taxes: 0,
                    other: 0,
                });
            }
            return map.get(safeKey);
        };
        (monthRows || []).forEach(row => {
            if (['transfer', 'owner_money', 'ignore', 'payroll'].includes(String(row?.kind || ''))) return;
            const directionName = String(row?.projectName || '').trim();
            const projectLabel = String(row?.projectLabel || '').trim();
            const key = projectLabel || directionName;
            if (!key) return;
            const item = ensureEntry(key, projectLabel ? `${directionName || 'Без направления'} · ${projectLabel}` : directionName);
            if (!item) return;
            const amount = this._roundMoney(Math.abs(this._num(row?.amount)));
            if (String(row?.direction || '') === 'in' && row?.categoryGroup === 'income') item.revenue += amount;
            if (String(row?.direction || '') === 'out') {
                if (row?.categoryGroup === 'direct') item.direct += amount;
                else if (row?.categoryGroup === 'commercial') item.commercial += amount;
                else if (row?.categoryGroup === 'taxes') item.taxes += amount;
                else if (!['finance', 'investment', 'overhead'].includes(String(row?.categoryGroup || ''))) item.other += amount;
            }
        });

        (payroll?.rows || []).forEach(row => {
            (row?.payrollAllocations || []).forEach(allocation => {
                const key = String(allocation?.label || '').trim();
                const item = ensureEntry(key, key);
                if (!item) return;
                item.payroll = this._roundMoney(this._num(item.payroll) + this._num(allocation?.amount));
            });
        });

        const businessRows = Array.from(map.values())
            .map(item => ({
                ...item,
                margin: this._roundMoney(item.revenue - item.direct - item.commercial - item.payroll - item.taxes - item.other),
            }))
            .sort((a, b) => this._num(b.margin) - this._num(a.margin));
        const systemRows = [];
        const sharedPayroll = this._roundMoney(payroll?.nonProductionAccrued || 0);
        const unassignedPayroll = this._roundMoney(payroll?.unassignedProductionAccrued || 0);
        if (sharedPayroll > 0) {
            systemRows.push({
                label: 'Общий фикс ФОТ',
                revenue: 0,
                direct: 0,
                commercial: 0,
                payroll: sharedPayroll,
                taxes: 0,
                other: 0,
                margin: this._roundMoney(-sharedPayroll),
                isSystem: true,
            });
        }
        if (unassignedPayroll > 0) {
            systemRows.push({
                label: 'Неразнесенный production ФОТ',
                revenue: 0,
                direct: 0,
                commercial: 0,
                payroll: unassignedPayroll,
                taxes: 0,
                other: 0,
                margin: this._roundMoney(-unassignedPayroll),
                isSystem: true,
            });
        }
        const rows = businessRows.concat(systemRows);
        const displayRows = businessRows
            .slice(0, Math.max(0, 6 - systemRows.length))
            .concat(systemRows);
        return {
            rows,
            displayRows,
            totalRevenue: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.revenue), 0)),
            totalMargin: this._roundMoney(rows.reduce((sum, item) => sum + this._num(item.margin), 0)),
            allocatedPayroll: this._roundMoney(businessRows.reduce((sum, item) => sum + this._num(item.payroll), 0)),
            businessRowsCount: businessRows.length,
            sharedPayroll,
            unassignedPayroll,
            unassignedCount: (monthRows || []).filter(item => !item?.projectId && !item?.projectLabel && !['transfer', 'owner_money', 'ignore', 'payroll'].includes(String(item?.kind || ''))).length,
        };
    },

    _buildObligationsReport({ payroll, fixedAssetRows }) {
        const payrollRows = (payroll?.rows || []).filter(item => item.payable > 0 || item.overpaid > 0 || item.markedPaid > 0);
        const assetRows = (fixedAssetRows || []).filter(item => item.payable_amount > 0 || item.overpaid_amount > 0);
        return {
            payrollRows,
            assetRows,
            payrollPayable: this._roundMoney(payroll?.payableAmount || 0),
            payrollOverpaid: this._roundMoney(payroll?.overpaidAmount || 0),
            fixedAssetPayable: this._roundMoney(assetRows.reduce((sum, item) => sum + this._num(item.payable_amount), 0)),
            fixedAssetOverpaid: this._roundMoney(assetRows.reduce((sum, item) => sum + this._num(item.overpaid_amount), 0)),
            unassignedPayrollAmount: this._roundMoney(payroll?.unassignedPaymentsAmount || 0),
            unassignedPayrollCount: payroll?.unassignedPaymentsCount || 0,
        };
    },

    _buildBalanceReport({ workspace, payroll, fixedAssetRows, tochkaSnapshot, fintabloSnapshot }) {
        const tochkaAccounts = Array.isArray(tochkaSnapshot?.accounts) ? tochkaSnapshot.accounts : [];
        const fintabloAccounts = this._canonicalFintabloMoneybags(fintabloSnapshot);
        const bankMoney = this._roundMoney(tochkaAccounts.reduce((sum, item) => sum + this._num(item?.currentBalance), 0));
        const nonBankMoney = this._roundMoney(fintabloAccounts
            .filter(item => !this._moneybagMatchesTochkaAccount(item, tochkaAccounts))
            .filter(item => {
                const account = (workspace?.accounts || []).find(candidate => this._workspaceAccountMatchesFintablo(candidate, item));
                if (!account) return !item.hideInTotal && !item.archived;
                return account.status !== 'archived' && account.show_in_money !== false;
            })
            .reduce((sum, item) => sum + this._num(item?.balance), 0));
        const fixedAssetsResidual = this._roundMoney((fixedAssetRows || []).reduce((sum, item) => sum + this._num(item.residual_value), 0));
        const receivables = this._roundMoney(this._num(payroll?.overpaidAmount));
        const liabilities = this._roundMoney(
            this._num(payroll?.payableAmount)
            + (fixedAssetRows || []).reduce((sum, item) => sum + this._num(item.payable_amount), 0)
        );
        const assetsTotal = this._roundMoney(bankMoney + nonBankMoney + fixedAssetsResidual + receivables);
        return {
            bankMoney,
            nonBankMoney,
            fixedAssetsResidual,
            receivables,
            liabilities,
            equity: this._roundMoney(assetsTotal - liabilities),
            assetsTotal,
            syncLabel: tochkaSnapshot?.synced_at
                ? `банк на ${String(tochkaSnapshot.synced_at).slice(0, 10)}`
                : (fintabloSnapshot?.synced_at ? `moneybags на ${String(fintabloSnapshot.synced_at).slice(0, 10)}` : 'без свежего снапшота'),
        };
    },

    _buildSummary({ workspace, orders, imports, employees, timeEntries, indirectMonths, tochkaSnapshot, fintabloSnapshot }) {
        const validOrderDates = [];
        const invalidOrderDates = [];
        const statusCounts = {};
        (orders || []).forEach(order => {
            const status = String(order?.status || 'unknown');
            statusCounts[status] = (statusCounts[status] || 0) + 1;
            const candidate = this._parseBusinessDate(order?.deadline_end)
                || this._parseBusinessDate(order?.deadline_start)
                || this._parseBusinessDate(order?.created_at);
            if (candidate) {
                validOrderDates.push(candidate);
            } else {
                const raw = String(order?.deadline_end || order?.deadline_start || order?.created_at || '').slice(0, 10);
                if (raw) {
                    invalidOrderDates.push({
                        orderId: order.id,
                        orderName: order.order_name || `Заказ ${order.id}`,
                        value: raw,
                    });
                }
            }
        });

        const importFieldCounts = {};
        const importFieldSums = {};
        const categoryCounts = {};
        const importDates = [];
        const distinctDeals = new Set();
        (imports || []).forEach(row => {
            const data = row?.import_data || row || {};
            const raw = data.raw_data || {};
            const importDate = this._parseBusinessDate(row?.import_date) || this._parseBusinessDate(row?.updated_at);
            if (importDate) importDates.push(importDate);
            if (raw.dealId != null) distinctDeals.add(String(raw.dealId));
            Object.entries(data).forEach(([key, value]) => {
                if (!/^fact_/.test(key)) return;
                const amount = this._num(value);
                if (amount === 0) return;
                importFieldCounts[key] = (importFieldCounts[key] || 0) + 1;
                importFieldSums[key] = (importFieldSums[key] || 0) + amount;
            });
            Object.entries(raw.field_breakdown || {}).forEach(([, items]) => {
                (items || []).forEach(item => {
                    const name = String(item?.category || 'Без категории').trim() || 'Без категории';
                    categoryCounts[name] = (categoryCounts[name] || 0) + 1;
                });
            });
        });

        const roles = {};
        const payrollProfiles = {};
        let monthlyWhite = 0;
        let monthlyBlack = 0;
        let payrollEmployees = 0;
        (employees || []).forEach(employee => {
            const role = String(employee?.role || 'unknown');
            roles[role] = (roles[role] || 0) + 1;
            const profile = String(employee?.payroll_profile || 'unspecified');
            payrollProfiles[profile] = (payrollProfiles[profile] || 0) + 1;
            const white = this._num(employee?.pay_white_salary);
            const black = this._num(employee?.pay_black_salary);
            const base = this._num(employee?.pay_base_salary_month);
            if (white > 0 || black > 0 || base > 0 || !['hourly', 'unspecified'].includes(profile)) payrollEmployees += 1;
            monthlyWhite += white;
            monthlyBlack += black || Math.max(0, base - white);
        });

        const timeDates = [];
        const topWorkers = {};
        const topStages = {};
        let withOrderHours = 0;
        let withoutOrderHours = 0;
        (timeEntries || []).forEach(entry => {
            const date = this._parseBusinessDate(entry?.date);
            if (date) timeDates.push(date);
            const hours = this._num(entry?.hours);
            const worker = String(entry?.employee_name || entry?.worker_name || entry?.employee_id || 'unknown');
            topWorkers[worker] = (topWorkers[worker] || 0) + hours;
            const stage = this._extractStageLabel(entry?.task_description);
            topStages[stage] = (topStages[stage] || 0) + hours;
            if (entry?.order_id != null || String(entry?.order_name || '').trim()) withOrderHours += hours;
            else withoutOrderHours += hours;
        });

        const categoryByGroup = {};
        (workspace?.categories || []).forEach(category => {
            const key = String(category?.group || 'other');
            categoryByGroup[key] = (categoryByGroup[key] || 0) + 1;
        });

        const projectByType = {};
        let activeProjects = 0;
        (workspace?.projects || []).forEach(project => {
            const type = String(project?.type || 'core');
            projectByType[type] = (projectByType[type] || 0) + 1;
            if (project?.active !== false) activeProjects += 1;
        });

        const fixedAssetRows = this._buildFixedAssetRows(workspace);
        const activeFixedAssetRows = fixedAssetRows.filter(item => item.active !== false);

        const counterpartiesByRole = {};
        const counterpartiesByResearch = {};
        let activeCounterparties = 0;
        (workspace?.counterparties || []).forEach(item => {
            const role = String(item?.role || 'other');
            counterpartiesByRole[role] = (counterpartiesByRole[role] || 0) + 1;
            const research = String(item?.research_mode || 'manual');
            counterpartiesByResearch[research] = (counterpartiesByResearch[research] || 0) + 1;
            if (item?.active !== false) activeCounterparties += 1;
        });

        const rulesByTrigger = {};
        let enabledRules = 0;
        let autoApplyRules = 0;
        (workspace?.rules || []).forEach(rule => {
            const trigger = String(rule?.trigger_type || 'description');
            rulesByTrigger[trigger] = (rulesByTrigger[trigger] || 0) + 1;
            if (rule?.active !== false) enabledRules += 1;
            if (rule?.active !== false && rule?.auto_apply) autoApplyRules += 1;
        });

        const missingImportantFields = this.IMPORTANT_IMPORT_FIELDS
            .filter(field => !importFieldCounts[field])
            .map(field => this.FACT_FIELD_LABELS[field] || field);

        const queueConfig = workspace?.queueConfig || this._defaultQueueConfig();
        const tochkaAccounts = Array.isArray(tochkaSnapshot?.accounts) ? tochkaSnapshot.accounts : [];
        const tochkaTransactions = Array.isArray(tochkaSnapshot?.transactions) ? tochkaSnapshot.transactions : [];
        const fintabloAccounts = this._canonicalFintabloMoneybags(fintabloSnapshot);
        const fintabloTransactions = this._fintabloTransactionsToRows(fintabloSnapshot, tochkaAccounts);
        const manualTransactions = this._manualTransactionsToBankRows(workspace);
        const recurringTransactions = this._recurringTransactionsToBankRows(workspace);
        const allTransactions = [...manualTransactions, ...recurringTransactions, ...tochkaTransactions, ...fintabloTransactions];
        const txRows = this._buildTransactionRows(allTransactions, workspace, queueConfig, employees);
        const bankAccountActivity = new Map();
        txRows.forEach(item => {
            const key = String(item.accountId || '');
            if (!key) return;
            const current = bankAccountActivity.get(key) || {
                id: key,
                accountId: key,
                name: item.accountLabel || key,
                transactionCount: 0,
                lastTransactionDate: '',
            };
            current.transactionCount += 1;
            if (!current.lastTransactionDate || String(item.date || '') > current.lastTransactionDate) current.lastTransactionDate = String(item.date || '');
            bankAccountActivity.set(key, current);
        });
        const activityRows = Array.from(bankAccountActivity.values());
        const workspaceAccountRows = (workspace?.accounts || []).map(account => {
            const activity = this._matchWorkspaceAccountUsage(account, activityRows);
            return {
                id: String(account.id || ''),
                name: account.name || String(account.id || ''),
                type: account.type || '',
                transactionCount: activity?.transactionCount || 0,
                lastTransactionDate: activity?.lastTransactionDate || '',
                note: account.note || '',
            };
        });
        const bankAccountRows = tochkaAccounts.map(account => {
            const activity = bankAccountActivity.get(String(account.accountId || '')) || null;
            return {
                id: String(account.accountId || ''),
                name: account.displayName || String(account.accountId || ''),
                transactionCount: activity?.transactionCount || 0,
                lastTransactionDate: activity?.lastTransactionDate || '',
                note: account.currentBalance != null ? `Баланс ${this.fmtRub(account.currentBalance)}` : '',
            };
        });
        const fintabloAccountRows = fintabloAccounts.map(account => {
            const activity = bankAccountActivity.get(String(account.id || '')) || null;
            return {
                id: String(account.id || ''),
                name: account.displayName || String(account.id || ''),
                transactionCount: activity?.transactionCount || 0,
                lastTransactionDate: activity?.lastTransactionDate || '',
                note: account.hideInTotal ? 'Скрыт в totals в FinTablo' : '',
            };
        });
        const queuePreview = txRows.filter(item => !['manual', 'ignored'].includes(item.route)).slice(0, 18);
        const autoCount = queuePreview.filter(item => item.route === 'auto').length;
        const reviewCount = queuePreview.filter(item => ['review', 'draft'].includes(item.route)).length;
        const unmatchedCount = queuePreview.filter(item => item.route === 'unmatched').length;
        const confirmedCount = txRows.filter(item => item.route === 'manual').length;
        const draftCount = txRows.filter(item => item.route === 'draft').length;
        const transferCount = txRows.filter(item => item.kind === 'transfer').length;
        const payrollMarkedRows = txRows.filter(item => item.kind === 'payroll');
        const payrollCandidateRows = txRows.filter(item => item.isPayrollCandidate || item.kind === 'payroll');
        const reports = this._buildManagementReports({
            workspace,
            employees,
            timeEntries,
            transactionsRows: txRows,
            orders,
            tochkaSnapshot,
            fintabloSnapshot,
        });

        return {
            coverage: {
                ordersRange: this._range(validOrderDates),
                importRange: this._range(importDates),
                timeRange: this._range(timeDates),
                invalidOrderDates,
            },
            orders: {
                total: (orders || []).length,
                active: (orders || []).filter(order => !['deleted', 'cancelled'].includes(String(order?.status || ''))).length,
                byStatus: this._topEntries(statusCounts, 20),
            },
            imports: {
                total: (imports || []).length,
                distinctDeals: distinctDeals.size,
                totalRevenue: this._num(importFieldSums.fact_revenue),
                totalCost: this._num(importFieldSums.fact_total),
                topFields: this._topEntries(importFieldCounts, 10).map(([field, count]) => ({
                    key: field,
                    count,
                    label: this.FACT_FIELD_LABELS[field] || field,
                })),
                topCategories: this._topEntries(categoryCounts, 10).map(([name, count]) => ({ name, count })),
                missingImportantFields,
            },
            employees: {
                total: (employees || []).length,
                byRole: this._topEntries(roles, 20),
                payrollProfiles: this._topEntries(payrollProfiles, 20),
            },
            timeEntries: {
                total: (timeEntries || []).length,
                withOrderHours: Math.round(withOrderHours * 100) / 100,
                withoutOrderHours: Math.round(withoutOrderHours * 100) / 100,
                topWorkers: this._topEntries(topWorkers, 8),
                topStages: this._topEntries(topStages, 8),
            },
            indirect: {
                months: Object.keys(indirectMonths || {}).length,
                range: this._monthRange(Object.keys(indirectMonths || {})),
            },
            sources: {
                total: (workspace?.sources || []).length,
                active: (workspace?.sources || []).filter(item => item.status === 'active').length,
                planned: (workspace?.sources || []).filter(item => item.status === 'planned').length,
            },
            accounts: {
                total: (workspace?.accounts || []).length,
                bank: (workspace?.accounts || []).filter(item => item.type === 'bank').length,
                cash: (workspace?.accounts || []).filter(item => item.type === 'cash').length,
                rows: workspaceAccountRows,
            },
            categories: {
                total: (workspace?.categories || []).length,
                active: (workspace?.categories || []).filter(item => item.active !== false).length,
                byGroup: categoryByGroup,
            },
            projects: {
                total: (workspace?.projects || []).length,
                active: activeProjects,
                byType: this._topEntries(projectByType, 20),
            },
            fixedAssets: {
                reportMonth: this._businessMonthFromDate(this._todayDateLocal()),
                reportMonthLabel: this._formatBusinessMonth(this._businessMonthFromDate(this._todayDateLocal())),
                total: fixedAssetRows.length,
                active: activeFixedAssetRows.length,
                historicalCost: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.purchase_cost), 0)),
                paidAmount: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.paid_amount), 0)),
                accumulatedAmortization: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.accumulated_amortization), 0)),
                residualValue: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.residual_value), 0)),
                currentMonthAmortization: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.current_month_amortization), 0)),
                payableAmount: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.payable_amount), 0)),
                overpaidAmount: this._roundMoney(activeFixedAssetRows.reduce((sum, item) => sum + this._num(item.overpaid_amount), 0)),
                rows: fixedAssetRows,
            },
            counterparties: {
                total: (workspace?.counterparties || []).length,
                active: activeCounterparties,
                byRole: this._topEntries(counterpartiesByRole, 20),
                byResearch: this._topEntries(counterpartiesByResearch, 20),
            },
            rules: {
                total: (workspace?.rules || []).length,
                enabled: enabledRules,
                autoApply: autoApplyRules,
                byTrigger: this._topEntries(rulesByTrigger, 20),
            },
            tochka: {
                syncedAt: tochkaSnapshot?.synced_at || null,
                accounts: tochkaAccounts.length,
                transactions: tochkaTransactions.length,
                range: this._range((tochkaTransactions || []).map(item => item.date || null)),
                latestTransactionDate: this._range((tochkaTransactions || []).map(item => item.date || null))[1],
                accountRows: bankAccountRows,
            },
            fintablo: {
                syncedAt: fintabloSnapshot?.synced_at || null,
                accounts: fintabloAccounts.length,
                transactions: fintabloTransactions.length,
                range: this._range((fintabloTransactions || []).map(item => item.date || null)),
                latestTransactionDate: this._range((fintabloTransactions || []).map(item => item.date || null))[1],
                accountRows: fintabloAccountRows,
            },
            automation: {
                queuePreview,
                autoCount,
                reviewCount,
                unmatchedCount,
            },
            transactions: {
                total: txRows.length,
                rows: txRows,
                recentRows: txRows.slice(0, Math.min(120, txRows.length)),
                confirmedCount,
                draftCount,
                reviewCount: txRows.filter(item => item.route === 'review').length,
                unmatchedCount: txRows.filter(item => item.route === 'unmatched').length,
                transferCount,
                payrollCount: payrollMarkedRows.length,
                manualCount: manualTransactions.length + recurringTransactions.length,
            },
            payroll: {
                employeeCount: payrollEmployees,
                salaryProfilesCount: this._topEntries(payrollProfiles, 20).length,
                monthlyWhite: Math.round(monthlyWhite * 100) / 100,
                monthlyBlack: Math.round(monthlyBlack * 100) / 100,
                monthlyTotal: Math.round((monthlyWhite + monthlyBlack) * 100) / 100,
                markedPaymentsCount: payrollMarkedRows.length,
                markedPaymentsAmount: Math.round(payrollMarkedRows.reduce((sum, item) => sum + Math.abs(this._num(item.amount)), 0) * 100) / 100,
                assignedPaymentsCount: payrollMarkedRows.filter(item => item.payrollEmployeeId).length,
                unassignedPaymentsCount: payrollCandidateRows.filter(item => !item.payrollEmployeeId).length,
                confirmedPaymentsCount: payrollMarkedRows.filter(item => item.route === 'manual').length,
                rows: payrollCandidateRows.slice(0, 24),
            },
            queue: {
                dailySyncEnabled: !!queueConfig.dailySyncEnabled,
                autoApplyThreshold: this._clamp01(queueConfig.autoApplyThreshold, 0.85),
                reviewThreshold: this._clamp01(queueConfig.reviewThreshold, 0.55),
                researchEnabled: !!queueConfig.researchEnabled,
            },
            reports,
        };
    },

    _buildTransactionRows(transactions, workspace, queueConfig, employees = []) {
        const autoApplyThreshold = this._clamp01(queueConfig?.autoApplyThreshold, 0.85);
        const reviewThreshold = this._clamp01(queueConfig?.reviewThreshold, 0.55);
        const decisionMap = this._buildDecisionMap(workspace);
        const rows = [...(transactions || [])]
            .filter(item => item && typeof item === 'object')
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
            .map(tx => {
                const txKey = this._transactionKey(tx);
                const suggestion = this._normalizeSuggestionForTransaction(tx, this._suggestTransaction(tx, workspace), workspace);
                const decision = decisionMap.get(txKey) || null;
                const employeeGuess = this._guessEmployeeForTransaction(tx, employees);
                let kind = decision?.kind || (String(tx?.group || '') === 'transfer' ? 'transfer' : this._inferTransactionKind(tx, suggestion, workspace, employeeGuess));
                let projectId = decision?.project_id || tx.projectHint || suggestion.projectId || '';
                let projectLabel = decision?.project_label || '';
                let categoryId = decision?.category_id || tx.categoryHint || suggestion.categoryId || '';
                let counterpartyId = decision?.counterparty_id || suggestion.counterpartyProfileId || '';
                let payrollEmployeeId = decision?.payroll_employee_id || (employeeGuess?.id != null ? String(employeeGuess.id) : '');
                let transferAccountId = decision?.transfer_account_id || '';

                if (kind === 'transfer') {
                    categoryId = categoryId || 'finance_transfers';
                    projectId = '';
                } else if (kind === 'owner_money') {
                    categoryId = categoryId || 'finance_owner_money';
                    projectId = '';
                } else if (kind === 'tax') {
                    categoryId = categoryId || suggestion.categoryId || 'taxes_usn';
                } else if (kind === 'payroll') {
                    const payrollEmployee = payrollEmployeeId ? this._findById(employees, payrollEmployeeId) : employeeGuess;
                    categoryId = categoryId || this._employeePayrollCategoryId(payrollEmployee) || suggestion.categoryId || 'payroll_production';
                    projectId = projectId || suggestion.projectId || 'project_recycle_object';
                }

                const isManual = !!decision;
                const hasAssignment = !!(categoryId || projectId || counterpartyId || kind);
                let route = 'unmatched';
                if (kind === 'ignore') {
                    route = 'ignored';
                } else if (decision?.confirmed) {
                    route = 'manual';
                } else if (isManual && hasAssignment) {
                    route = 'draft';
                } else if (hasAssignment) {
                    route = (suggestion.autoApply && suggestion.confidence >= autoApplyThreshold) ? 'auto' : 'review';
                    if (suggestion.confidence < reviewThreshold) route = 'unmatched';
                }

                const selectedEmployee = payrollEmployeeId ? this._findById(employees, payrollEmployeeId) : null;
                const isPayrollCandidate = this._looksLikePayrollTransaction(tx, suggestion, employeeGuess);
                if (kind === 'payroll' && !payrollEmployeeId && route !== 'manual') route = 'review';
                if (kind === 'transfer' && !transferAccountId && route === 'auto') route = 'review';

                const reasons = [];
                if (decision?.confirmed) reasons.push('подтверждено вручную');
                else if (isManual) reasons.push('черновик ручной разноски');
                if (tx.recurringTemplateName && !decision?.confirmed) reasons.push(`автосписание "${tx.recurringTemplateName}"`);
                if (decision?.note) reasons.push(decision.note);
                else if (tx.noteHint) reasons.push(tx.noteHint);
                if (suggestion.reasons?.length && !decision?.confirmed) reasons.push(...suggestion.reasons);
                if (kind === 'transfer' && !transferAccountId) reasons.push('укажите второй счет');
                if (kind === 'payroll' && !payrollEmployeeId) reasons.push('назначьте сотрудника');

                return {
                    ...tx,
                    txKey,
                    suggestion,
                    decision,
                    kind,
                    kindLabel: this.TRANSACTION_KIND_LABELS[kind] || 'Операция',
                    projectId,
                    projectName: this._resolveProjectName(projectId, workspace),
                    directionName: this._resolveProjectName(projectId, workspace),
                    projectLabel,
                    categoryId,
                    categoryName: this._resolveCategoryName(categoryId, workspace),
                    categoryGroup: this._findById(workspace?.categories, categoryId)?.group || '',
                    counterpartyId,
                    counterpartyProfileName: this._findById(workspace?.counterparties, counterpartyId)?.name || suggestion.counterpartyProfileName || '',
                    payrollEmployeeId,
                    payrollEmployeeName: selectedEmployee?.name || '',
                    transferAccountId,
                    transferAccountName: this._findById(workspace?.accounts, transferAccountId)?.name || '',
                    confirmed: !!decision?.confirmed,
                    confidence: this._clamp01(decision?.confirmed ? 1 : suggestion.confidence, 0),
                    route,
                    routeLabel: this.TRANSACTION_ROUTE_LABELS[route] || 'Нужен разбор',
                    statusTone: this._routeTone(route),
                    amountLabel: `${tx.direction === 'out' ? '−' : '+'}${this.fmtRub(tx.amount)}`,
                    descriptionShort: this._shorten(tx.description || '', 110),
                    reasonSummary: reasons.length > 0 ? reasons.join(' · ') : 'Нового контрагента нужно дообучить',
                    isPayrollCandidate,
                    isTransferCandidate: this._looksLikeTransferTransaction(tx, suggestion),
                    linkedItems: [],
                    linkedToTxKey: '',
                    derivedCharges: [],
                    txBaseAmount: this._extractOperationBaseAmount(tx),
                    txCommissionAmount: this._extractOperationCommissionAmount(tx),
                };
            });
        return this._attachLinkedAdjustments(rows, workspace);
    },

    _routeTone(route) {
        if (['manual', 'auto'].includes(route)) return 'ok';
        if (['draft', 'review'].includes(route)) return 'warn';
        return 'muted';
    },

    _normalizeSuggestionForTransaction(tx, suggestion, workspace) {
        const next = suggestion ? { ...suggestion, reasons: [...(suggestion.reasons || [])] } : {
            projectId: '',
            projectName: '',
            categoryId: '',
            categoryName: '',
            counterpartyProfileId: '',
            counterpartyProfileName: '',
            confidence: 0.35,
            autoApply: false,
            reasons: [],
        };
        const category = this._findById(workspace?.categories, next.categoryId);
        const text = this._transactionText(tx);
        if (text.includes('фонд благотворитель')) {
            next.categoryId = 'other_charity';
            next.projectId = next.projectId || '';
            next.categoryName = this._resolveCategoryName(next.categoryId, workspace);
            next.projectName = this._resolveProjectName(next.projectId, workspace);
            next.confidence = Math.max(next.confidence || 0, 0.9);
            next.autoApply = false;
            next.reasons.push('благотворительный фонд связан с конкретным приходом');
            return next;
        }
        if (text.includes('фонд налоги')) {
            next.categoryId = 'taxes_orders';
            next.projectId = next.projectId || '';
            next.categoryName = this._resolveCategoryName(next.categoryId, workspace);
            next.projectName = this._resolveProjectName(next.projectId, workspace);
            next.confidence = Math.max(next.confidence || 0, 0.9);
            next.autoApply = false;
            next.kind = 'tax';
            next.reasons.push('налоговый фонд связан с конкретным приходом');
            return next;
        }
        if (String(tx?.direction || '') === 'out' && category?.group === 'income') {
            if (text.includes('комис') || text.includes('эквайр')) {
                next.categoryId = 'commercial_marketplace_fees';
                next.projectId = next.projectId || 'project_online_store';
                next.categoryName = this._resolveCategoryName(next.categoryId, workspace);
                next.projectName = this._resolveProjectName(next.projectId, workspace);
                next.confidence = Math.min(next.confidence || 0.6, 0.68);
                next.autoApply = false;
                next.reasons.push('канал продаж упомянут в расходе, трактую как комиссию');
            } else if (text.includes('покупка товара') || text.includes('ozon') || text.includes('озон')) {
                next.categoryId = 'direct_materials';
                next.projectId = 'project_recycle_object';
                next.categoryName = this._resolveCategoryName(next.categoryId, workspace);
                next.projectName = this._resolveProjectName(next.projectId, workspace);
                next.counterpartyProfileId = '';
                next.counterpartyProfileName = '';
                next.confidence = 0.58;
                next.autoApply = false;
                next.reasons.push('расход с Ozon похож на закупку, а не на выручку маркетплейса');
            } else {
                next.categoryId = '';
                next.projectId = '';
                next.categoryName = '';
                next.projectName = '';
                next.confidence = Math.min(next.confidence || 0.5, 0.49);
                next.autoApply = false;
                next.reasons.push('упоминание канала в расходе не считаю доходом автоматически');
            }
        }
        return next;
    },

    _attachLinkedAdjustments(rows, workspace) {
        const byAmount = new Map();
        const rowsByKey = new Map();
        rows.forEach(row => {
            rowsByKey.set(String(row.txKey || ''), row);
            if (String(row.direction || '') !== 'in') return;
            const key = `${row.date || ''}::${this._moneyKey(row.amount)}`;
            if (!byAmount.has(key)) byAmount.set(key, []);
            byAmount.get(key).push(row);
        });

        rows.forEach(row => {
            if (!row) return;
            const baseAmount = this._extractOperationBaseAmount(row);
            if (!baseAmount || !row.date || row.direction === 'in') return;
            const candidates = byAmount.get(`${row.date}::${this._moneyKey(baseAmount)}`) || [];
            const linked = candidates.find(candidate => {
                if (candidate.txKey === row.txKey) return false;
                if (row.dealId && candidate.dealId) return String(row.dealId) === String(candidate.dealId);
                return true;
            }) || null;
            if (!linked) return;
            row.linkedToTxKey = linked.txKey;
            if (!row.projectId && linked.projectId) {
                row.projectId = linked.projectId;
                row.projectName = linked.projectName;
                row.directionName = linked.directionName;
            }
            if (!row.projectLabel && linked.projectLabel) {
                row.projectLabel = linked.projectLabel;
            }
            row.reasonSummary = [row.reasonSummary, `связано с приходом ${linked.amountLabel}`].filter(Boolean).join(' · ');
            linked.linkedItems.push({
                txKey: row.txKey,
                categoryName: row.categoryName || row.kindLabel,
                amountLabel: row.amountLabel,
                description: row.descriptionShort || row.description || '',
            });
        });

        rows.forEach(row => {
            if (!row || row.direction !== 'in') return;
            const embeddedCommission = this._extractOperationCommissionAmount(row);
            if (embeddedCommission > 0) {
                row.derivedCharges.push({
                    label: 'Комиссия канала',
                    amountLabel: `−${this.fmtRub(embeddedCommission)}`,
                });
            }
        });

        return rows;
    },

    _extractOperationBaseAmount(tx) {
        const text = String(tx?.description || '').replace(/\u00a0/g, ' ');
        const rubMatch = text.match(/с операции на сумму\s+([\d\s]+(?:[.,]\d+)?)\s*rub/i);
        if (rubMatch) return this._num(String(rubMatch[1]).replace(/\s+/g, '').replace(',', '.'));
        return 0;
    },

    _extractOperationCommissionAmount(tx) {
        const text = String(tx?.description || '').replace(/\u00a0/g, ' ');
        const match = text.match(/сумма комиссии\s+([\d\s]+(?:[.,]\d+)?)/i);
        if (!match) return 0;
        return this._num(String(match[1]).replace(/\s+/g, '').replace(',', '.'));
    },

    _moneyKey(value) {
        return Math.round(this._num(value) * 100);
    },

    _suggestTransaction(tx, workspace) {
        const activeRules = (workspace?.rules || []).filter(item => item && item.active !== false);
        let best = null;
        activeRules.forEach(rule => {
            const match = this._matchRuleToTransaction(rule, tx, workspace);
            if (!match) return;
            if (!best || match.confidence > best.confidence) best = match;
        });
        if (best) return best;

        const recurringFallback = this._matchRecurringTemplate(tx, workspace);
        if (recurringFallback) return recurringFallback;

        const historyFallback = this._matchHistoryDecision(tx, workspace);
        if (historyFallback) return historyFallback;

        const profileFallback = this._matchCounterpartyProfile(tx, workspace);
        if (profileFallback) return profileFallback;

        return this._systemFallbackSuggestion(tx, workspace);
    },

    _matchHistoryDecision(tx, workspace) {
        const txKey = this._transactionKey(tx);
        const txText = this._transactionText(tx);
        const txInn = this._digitsOnly(tx.counterpartyInn);
        let best = null;
        (workspace?.transactionDecisions || []).forEach(item => {
            if (!item || item.confirmed !== true || String(item.tx_key || '') === txKey) return;
            if (!item.category_id && !item.project_id && !item.counterparty_id) return;
            let score = 0;
            let reason = '';
            const knownInn = this._digitsOnly(item.counterparty_inn);
            if (knownInn && txInn && knownInn === txInn) {
                score = 0.9;
                reason = `история по ИНН ${knownInn}`;
            } else {
                const knownName = this._normalizeText(item.counterparty_name || '');
                if (knownName && txText.includes(knownName)) {
                    score = 0.8;
                    reason = `история по контрагенту "${item.counterparty_name}"`;
                }
            }
            if (!score) return;
            const candidate = {
                projectId: item.project_id || '',
                projectName: this._resolveProjectName(item.project_id, workspace),
                categoryId: item.category_id || '',
                categoryName: this._resolveCategoryName(item.category_id, workspace),
                counterpartyProfileId: item.counterparty_id || '',
                counterpartyProfileName: this._findById(workspace?.counterparties, item.counterparty_id)?.name || '',
                kind: item.kind || '',
                confidence: score,
                autoApply: false,
                reasons: ['история ручного подтверждения', reason].filter(Boolean),
            };
            if (!best || candidate.confidence > best.confidence) best = candidate;
        });
        return best;
    },

    _matchRecurringTemplate(tx, workspace) {
        const targetKind = String(tx?.direction || '') === 'in' ? 'income' : 'expense';
        const txText = this._transactionText(tx);
        let best = null;
        this._normalizeRecurringTransactions(workspace?.recurringTransactions).forEach(item => {
            if (!item || item.active === false || item.kind !== targetKind) return;
            if (!item.category_id && !item.project_id && !item.note) return;

            const accountMatched = this._accountScopeMatches(item.account_id, tx, workspace);
            const amountDelta = Math.abs(this._moneyKey(item.amount) - this._moneyKey(tx.amount));
            const amountBase = Math.max(this._moneyKey(item.amount), this._moneyKey(tx.amount), 1);
            let score = 0;
            let amountMatched = false;
            let exactAmount = false;
            const reasons = [`шаблон автосписания "${item.name}"`];

            if (amountDelta === 0) {
                score += 0.2;
                amountMatched = true;
                exactAmount = true;
                reasons.push('та же сумма');
            } else if (amountDelta <= 100) {
                score += 0.14;
                amountMatched = true;
                reasons.push('сумма почти совпадает');
            } else if ((amountDelta / amountBase) <= 0.03) {
                score += 0.1;
                amountMatched = true;
                reasons.push('схожая сумма');
            }

            if (accountMatched) {
                score += 0.16;
                reasons.push('тот же счет');
            }

            const textMatch = this._recurringTemplateTextMatch(item, txText);
            if (textMatch.exact) {
                score += 0.54;
                reasons.push(textMatch.reason);
            } else if (textMatch.tokenCount >= 2) {
                score += 0.34;
                reasons.push(textMatch.reason);
            } else if (textMatch.tokenCount === 1 && (accountMatched || amountMatched)) {
                score += 0.18;
                reasons.push(textMatch.reason);
            }

            if (!textMatch.matched) return;
            if (!amountMatched && !accountMatched) return;

            const confidence = this._clamp01(score, 0);
            if (confidence < 0.62) return;

            const candidate = {
                projectId: item.project_id || '',
                projectName: this._resolveProjectName(item.project_id, workspace),
                categoryId: item.category_id || '',
                categoryName: this._resolveCategoryName(item.category_id, workspace),
                counterpartyProfileId: '',
                counterpartyProfileName: '',
                kind: item.kind === 'income' ? 'income' : 'expense',
                confidence,
                autoApply: !!(textMatch.exact && exactAmount && accountMatched),
                reasons,
            };
            if (!best || candidate.confidence > best.confidence) best = candidate;
        });
        return best;
    },

    _recurringTemplateTextMatch(template, txText) {
        const candidates = [
            { value: template?.counterparty_name, label: 'контрагент' },
            { value: template?.name, label: 'шаблон' },
            { value: template?.description, label: 'описание' },
        ].map(item => ({
            raw: String(item.value || '').trim(),
            normalized: this._normalizeText(item.value || ''),
            label: item.label,
        })).filter(item => item.normalized.length >= 4);

        for (const item of candidates) {
            if (txText.includes(item.normalized)) {
                return {
                    matched: true,
                    exact: true,
                    tokenCount: this._matchableTokens(item.normalized).length,
                    reason: `${item.label}: "${item.raw}"`,
                };
            }
        }

        let best = { matched: false, exact: false, tokenCount: 0, reason: '' };
        candidates.forEach(item => {
            const matchedTokens = this._matchableTokens(item.normalized).filter(token => txText.includes(token));
            if (matchedTokens.length > best.tokenCount) {
                best = {
                    matched: matchedTokens.length > 0,
                    exact: false,
                    tokenCount: matchedTokens.length,
                    reason: `слова: ${matchedTokens.slice(0, 3).join(', ')}`,
                };
            }
        });
        return best;
    },

    _matchRuleToTransaction(rule, tx, workspace) {
        if (!rule || rule.active === false) return null;
        if (!this._accountScopeMatches(rule.account_scope, tx, workspace)) return null;

        const text = this._transactionText(tx);
        const triggerWords = this._splitList(rule.trigger);
        const matchedWords = triggerWords.filter(word => text.includes(this._normalizeText(word)));
        const linkedProfile = this._findById(workspace?.counterparties, rule.counterparty_id);
        const profileMatch = linkedProfile ? this._profileMatchDetails(linkedProfile, tx) : null;
        const ruleTrigger = String(rule.trigger_type || 'description');

        let matched = false;
        if (ruleTrigger === 'description' || ruleTrigger === 'keyword_bundle') {
            matched = matchedWords.length > 0;
        } else if (ruleTrigger === 'counterparty') {
            matched = !!(profileMatch?.matched || matchedWords.length > 0);
        } else if (ruleTrigger === 'counterparty_account') {
            matched = !!(profileMatch?.matched || matchedWords.length > 0);
        } else if (ruleTrigger === 'inn') {
            const ruleInn = this._digitsOnly(rule.trigger);
            const txInn = this._digitsOnly(tx.counterpartyInn);
            matched = !!(ruleInn && txInn && ruleInn === txInn);
            if (!matched && profileMatch?.matched && profileMatch.exactInn) matched = true;
        }
        if (!matched) return null;

        const projectId = rule.project_id || linkedProfile?.default_project_id || '';
        const categoryId = rule.category_id || linkedProfile?.default_category_id || '';
        return {
            projectId,
            projectName: this._resolveProjectName(projectId, workspace),
            categoryId,
            categoryName: this._resolveCategoryName(categoryId, workspace),
            counterpartyProfileId: linkedProfile?.id || '',
            counterpartyProfileName: linkedProfile?.name || '',
            confidence: this._clamp01(rule.confidence, 0.7),
            autoApply: !!rule.auto_apply,
            reasons: [
                `правило "${rule.name}"`,
                profileMatch?.reason || (matchedWords.length > 0 ? `ключи: ${matchedWords.slice(0, 2).join(', ')}` : 'точное совпадение'),
            ].filter(Boolean),
        };
    },

    _matchCounterpartyProfile(tx, workspace) {
        const profiles = (workspace?.counterparties || []).filter(item => item && item.active !== false);
        let best = null;
        profiles.forEach(profile => {
            const match = this._profileMatchDetails(profile, tx);
            if (!match?.matched) return;
            const categoryId = profile.default_category_id || '';
            const projectId = profile.default_project_id || '';
            const candidate = {
                projectId,
                projectName: this._resolveProjectName(projectId, workspace),
                categoryId,
                categoryName: this._resolveCategoryName(categoryId, workspace),
                counterpartyProfileId: profile.id,
                counterpartyProfileName: profile.name,
                confidence: this._clamp01(match.score, 0.64),
                autoApply: false,
                reasons: [match.reason || `профиль "${profile.name}"`],
            };
            if (!best || candidate.confidence > best.confidence) best = candidate;
        });
        return best;
    },

    _systemFallbackSuggestion(tx, workspace) {
        const text = this._transactionText(tx);
        const direction = String(tx.direction || '');

        if (text.includes('фонд благотворитель')) {
            return {
                projectId: '',
                projectName: 'Благотворительность',
                categoryId: 'other_charity',
                categoryName: this._resolveCategoryName('other_charity', workspace),
                counterpartyProfileId: '',
                counterpartyProfileName: '',
                confidence: 0.92,
                autoApply: false,
                reasons: ['1% уходит в благотворительность от каждого прихода'],
            };
        }

        if (text.includes('фонд налоги')) {
            return {
                projectId: '',
                projectName: 'Налоги по оплатам',
                categoryId: 'taxes_orders',
                categoryName: this._resolveCategoryName('taxes_orders', workspace),
                counterpartyProfileId: 'cp_tax_treasury',
                counterpartyProfileName: 'Налоговая / казначейство',
                kind: 'tax',
                confidence: 0.91,
                autoApply: false,
                reasons: ['налоговый фонд, привязанный к конкретному приходу'],
            };
        }

        if (text.includes('держател') && text.includes('платежных карт') && text.includes('терминал')) {
            return {
                projectId: 'project_online_store',
                projectName: this._resolveProjectName('project_online_store', workspace),
                categoryId: 'income_online_store',
                categoryName: this._resolveCategoryName('income_online_store', workspace),
                counterpartyProfileId: 'cp_online_acquiring',
                counterpartyProfileName: 'Интернет-эквайринг / ЮMoney',
                confidence: 0.88,
                autoApply: false,
                reasons: ['эквайринг / терминал интернет-магазина'],
            };
        }

        if (text.includes('точка чеки') || text.includes('касса') || text.includes('чеки')) {
            return {
                projectId: 'project_online_store',
                projectName: this._resolveProjectName('project_online_store', workspace),
                categoryId: 'commercial_marketplace_fees',
                categoryName: this._resolveCategoryName('commercial_marketplace_fees', workspace),
                counterpartyProfileId: '',
                counterpartyProfileName: '',
                confidence: 0.81,
                autoApply: false,
                reasons: ['расход на чеки / кассу онлайн-канала'],
            };
        }

        if (text.includes('перевод собственных средств')) {
            return {
                projectId: '',
                projectName: 'Вне проекта',
                categoryId: 'finance_owner_money',
                categoryName: this._resolveCategoryName('finance_owner_money', workspace),
                counterpartyProfileId: '',
                counterpartyProfileName: '',
                confidence: 0.72,
                autoApply: false,
                reasons: ['перевод собственных средств'],
            };
        }

        if (text.includes('осфр') || text.includes('страховые взносы') || text.includes('сфр')) {
            return {
                projectId: '',
                projectName: 'Налоговый контур',
                categoryId: 'taxes_payroll',
                categoryName: this._resolveCategoryName('taxes_payroll', workspace),
                counterpartyProfileId: 'cp_social_funds',
                counterpartyProfileName: 'Соцфонды / ОСФР',
                confidence: 0.84,
                autoApply: false,
                reasons: ['системный шаблон по фондам'],
            };
        }

        if (text.includes('ифнс') || text.includes('казначейств') || text.includes('енп') || (text.includes('налог') && direction === 'out')) {
            return {
                projectId: '',
                projectName: 'Налоговый контур',
                categoryId: 'taxes_usn',
                categoryName: this._resolveCategoryName('taxes_usn', workspace),
                counterpartyProfileId: 'cp_tax_treasury',
                counterpartyProfileName: 'Налоговая / казначейство',
                confidence: 0.82,
                autoApply: false,
                reasons: ['системный шаблон по налогам'],
            };
        }

        if (text.includes('зп') || text.includes('зарплат')) {
            return {
                projectId: 'project_recycle_object',
                projectName: this._resolveProjectName('project_recycle_object', workspace),
                categoryId: 'payroll_production',
                categoryName: this._resolveCategoryName('payroll_production', workspace),
                counterpartyProfileId: '',
                counterpartyProfileName: '',
                confidence: tx.sourceKind === 'cash' ? 0.76 : 0.62,
                autoApply: false,
                reasons: ['системный шаблон по зарплате'],
            };
        }

        if ((text.includes('ozon') || text.includes('wildberries') || text.includes('маркетплейс')) && direction === 'in') {
            return {
                projectId: 'project_marketplaces',
                projectName: this._resolveProjectName('project_marketplaces', workspace),
                categoryId: 'income_marketplaces',
                categoryName: this._resolveCategoryName('income_marketplaces', workspace),
                counterpartyProfileId: 'cp_marketplaces',
                counterpartyProfileName: 'Маркетплейсы / платформы',
                confidence: 0.78,
                autoApply: false,
                reasons: ['системный шаблон по каналу маркетплейсов'],
            };
        }

        if ((text.includes('ozon') || text.includes('озон')) && direction === 'out' && text.includes('покупка товара')) {
            return {
                projectId: 'project_recycle_object',
                projectName: this._resolveProjectName('project_recycle_object', workspace),
                categoryId: 'direct_materials',
                categoryName: this._resolveCategoryName('direct_materials', workspace),
                counterpartyProfileId: '',
                counterpartyProfileName: '',
                confidence: 0.62,
                autoApply: false,
                reasons: ['Ozon в расходе читаю как закупку товара'],
            };
        }

        return {
            projectId: '',
            projectName: '',
            categoryId: '',
            categoryName: '',
            counterpartyProfileId: '',
            counterpartyProfileName: '',
            confidence: 0.35,
            autoApply: false,
            reasons: ['новый или неразмеченный сценарий'],
        };
    },

    _profileMatchDetails(profile, tx) {
        if (!profile) return null;
        const txText = this._transactionText(tx);
        const profileName = this._normalizeText(profile.name);
        const txInn = this._digitsOnly(tx.counterpartyInn);
        const profileInn = this._digitsOnly(profile.inn);
        if (profileInn && txInn && profileInn === txInn) {
            return { matched: true, score: 0.92, exactInn: true, reason: `ИНН ${profileInn}` };
        }
        if (profileName && txText.includes(profileName)) {
            return { matched: true, score: 0.8, exactInn: false, reason: `название "${profile.name}"` };
        }
        const hints = this._splitList(profile.match_hint);
        const matchedHints = hints.filter(hint => txText.includes(this._normalizeText(hint)));
        if (matchedHints.length > 0) {
            return {
                matched: true,
                score: matchedHints.length > 1 ? 0.76 : 0.68,
                exactInn: false,
                reason: `подсказки: ${matchedHints.slice(0, 2).join(', ')}`,
            };
        }
        return { matched: false, score: 0, exactInn: false, reason: '' };
    },

    _accountScopeMatches(scope, tx, workspace) {
        const value = String(scope || 'any');
        if (!value || value === 'any') return true;
        if (value === 'bank_any') return String(tx.sourceKind || '') === 'bank';
        if (value === 'cash_any') return String(tx.sourceKind || '') === 'cash';
        const account = this._findById(workspace?.accounts, value);
        if (!account) return false;
        if (String(account.id || '') && String(account.id || '') === String(tx.accountId || '')) return true;
        if (this._normalizeText(account?.name || '') && this._normalizeText(account?.name || '') === this._normalizeText(tx.accountLabel || '')) return true;
        const txDigits = this._digitsOnly(tx.accountId);
        const workspaceDigits = this._digitsOnly(`${account.id || ''} ${account.name || ''} ${account.note || ''} ${account.external_ref || ''}`);
        if (!txDigits || !workspaceDigits) return false;
        return txDigits.includes(workspaceDigits.slice(-4)) || workspaceDigits.includes(txDigits.slice(-4));
    },

    _resolveProjectName(projectId, workspace) {
        if (!projectId) return '';
        return this._findById(workspace?.projects, projectId)?.name || '';
    },

    _resolveCategoryName(categoryId, workspace) {
        if (!categoryId) return '';
        return this._findById(workspace?.categories, categoryId)?.name || '';
    },

    _findById(list, id) {
        return (Array.isArray(list) ? list : []).find(item => String(item?.id || '') === String(id || '')) || null;
    },

    _transactionText(tx) {
        return this._normalizeText([
            tx.counterpartyName,
            tx.counterpartyInn,
            tx.description,
            tx.accountLabel,
            tx.accountId,
        ].filter(Boolean).join(' '));
    },

    _normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/[«»"'`]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    },

    _matchableTokens(value) {
        return Array.from(new Set(
            this._normalizeText(value)
                .split(/[^a-zа-я0-9]+/g)
                .map(item => item.trim())
                .filter(item => item.length >= 4 || /^\d{3,}$/.test(item))
        ));
    },

    _digitsOnly(value) {
        return String(value || '').replace(/\D+/g, '');
    },

    _shorten(value, max = 80) {
        const text = String(value || '').trim();
        if (text.length <= max) return text;
        return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
    },

    _renderAccountRow(account) {
        return `
            <tr data-finance-account-row="${this._esc(account.id)}">
                <td><input class="input" data-field="name" value="${this._escAttr(account.name)}"></td>
                <td>
                    <select class="input" data-field="type">
                        ${this._accountTypeOptions(account.type)}
                    </select>
                </td>
                <td><input class="input" data-field="owner" value="${this._escAttr(account.owner)}"></td>
                <td>
                    <select class="input" data-field="source_id">
                        ${this._sourceOptions(account.source_id)}
                    </select>
                </td>
                <td class="text-center"><input type="checkbox" data-field="show_in_money" ${account.show_in_money !== false ? 'checked' : ''}></td>
                <td class="text-center"><input type="checkbox" data-field="legacy_hide_in_total" ${account.legacy_hide_in_total ? 'checked' : ''}></td>
                <td>
                    <select class="input" data-field="status">
                        ${this._accountStatusOptions(account.status)}
                    </select>
                </td>
                <td>
                    <input class="input" data-field="note" value="${this._escAttr(account.note)}">
                    <input class="input" data-field="external_ref" value="${this._escAttr(account.external_ref || '')}" placeholder="Номер / внешний id" style="margin-top:6px">
                </td>
                <td class="text-right">
                    <button class="btn btn-outline btn-sm" onclick="Finance.removeAccount('${this._escJs(account.id)}')">✕</button>
                </td>
            </tr>
        `;
    },

    _renderCategoryRow(category) {
        return `
            <tr data-finance-category-row="${this._esc(category.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${category.active !== false ? 'checked' : ''}></td>
                <td><input class="input" data-field="name" value="${this._escAttr(category.name)}"></td>
                <td>
                    <select class="input" data-field="group">
                        ${this._categoryGroupOptions(category.group)}
                    </select>
                </td>
                <td><input class="input" data-field="bucket" value="${this._escAttr(category.bucket)}"></td>
                <td>
                    <select class="input" data-field="source_id">
                        ${this._sourceOptions(category.source_id)}
                    </select>
                </td>
                <td><input class="input" data-field="mapping" value="${this._escAttr(category.mapping)}"></td>
                <td class="text-right">
                    <button class="btn btn-outline btn-sm" onclick="Finance.removeCategory('${this._escJs(category.id)}')">✕</button>
                </td>
            </tr>
        `;
    },

    _renderProjectRow(project) {
        return `
            <tr data-finance-project-row="${this._esc(project.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${project.active !== false ? 'checked' : ''}></td>
                <td><input class="input" data-field="name" value="${this._escAttr(project.name)}"></td>
                <td>
                    <select class="input" data-field="type">
                        ${this._projectTypeOptions(project.type)}
                    </select>
                </td>
                <td>
                    <select class="input" data-field="default_income_category_id">
                        ${this._categoryOptions(project.default_income_category_id, true, '—')}
                    </select>
                </td>
                <td><input class="input" data-field="note" value="${this._escAttr(project.note)}"></td>
                <td class="text-right">
                    <button class="btn btn-outline btn-sm" onclick="Finance.removeProject('${this._escJs(project.id)}')">✕</button>
                </td>
            </tr>
        `;
    },

    _renderCounterpartyRow(item) {
        return `
            <tr data-finance-counterparty-row="${this._esc(item.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${item.active !== false ? 'checked' : ''}></td>
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(item.name)}">
                    <input class="input" data-field="note" value="${this._escAttr(item.note || '')}" placeholder="Комментарий" style="margin-top:6px">
                </td>
                <td>
                    <select class="input" data-field="role">
                        ${this._counterpartyRoleOptions(item.role)}
                    </select>
                </td>
                <td><input class="input" data-field="inn" value="${this._escAttr(item.inn)}"></td>
                <td><input class="input" data-field="what_they_sell" value="${this._escAttr(item.what_they_sell)}"></td>
                <td>
                    <select class="input" data-field="default_project_id">
                        ${this._projectOptions(item.default_project_id, true, '—')}
                    </select>
                </td>
                <td>
                    <select class="input" data-field="default_category_id">
                        ${this._categoryOptions(item.default_category_id, true, '—')}
                    </select>
                </td>
                <td>
                    <select class="input" data-field="research_mode">
                        ${this._researchModeOptions(item.research_mode)}
                    </select>
                </td>
                <td><input class="input" data-field="match_hint" value="${this._escAttr(item.match_hint)}"></td>
                <td class="text-right">
                    <button class="btn btn-outline btn-sm" onclick="Finance.removeCounterparty('${this._escJs(item.id)}')">✕</button>
                </td>
            </tr>
        `;
    },

    _renderRuleRow(rule) {
        return `
            <tr data-finance-rule-row="${this._esc(rule.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${rule.active !== false ? 'checked' : ''}></td>
                <td><input class="input" data-field="name" value="${this._escAttr(rule.name)}"></td>
                <td>
                    <select class="input" data-field="trigger_type">
                        ${this._ruleTriggerOptions(rule.trigger_type)}
                    </select>
                </td>
                <td><input class="input" data-field="trigger" value="${this._escAttr(rule.trigger)}"></td>
                <td>
                    <select class="input" data-field="account_scope">
                        ${this._ruleAccountScopeOptions(rule.account_scope)}
                    </select>
                </td>
                <td>
                    <select class="input" data-field="counterparty_id">
                        ${this._counterpartyOptions(rule.counterparty_id, true, '—')}
                    </select>
                </td>
                <td>
                    <select class="input" data-field="project_id">
                        ${this._projectOptions(rule.project_id, true, '—')}
                    </select>
                </td>
                <td>
                    <select class="input" data-field="category_id">
                        ${this._categoryOptions(rule.category_id, true, '—')}
                    </select>
                </td>
                <td><input class="input" type="number" min="0" max="1" step="0.01" data-field="confidence" value="${this._escAttr(String(this._clamp01(rule.confidence, 0.7)))}"></td>
                <td class="text-center"><input type="checkbox" data-field="auto_apply" ${rule.auto_apply ? 'checked' : ''}></td>
                <td><input class="input" data-field="note" value="${this._escAttr(rule.note || '')}"></td>
                <td class="text-right">
                    <button class="btn btn-outline btn-sm" onclick="Finance.removeRule('${this._escJs(rule.id)}')">✕</button>
                </td>
            </tr>
        `;
    },

    _renderManualComposer(mode) {
        const isTransfer = mode === 'transfer';
        const today = new Date().toISOString().slice(0, 10);
        const heading = mode === 'income' ? 'Новое поступление' : (isTransfer ? 'Новый перевод' : 'Новое списание');
        const helper = isTransfer
            ? 'Добавьте внутренний перевод между счетами, чтобы он не смешивался с расходами.'
            : 'Быстрый ручной ввод для наличных, корректировок и операций вне банковской выписки.';
        return `
            <div class="finance-compose-card" data-finance-compose data-mode="${this._escAttr(mode)}">
                <div class="finance-compose-head">
                    <div>
                        <div class="finance-compose-title">${this._esc(heading)}</div>
                        <div class="finance-compose-sub">${this._esc(helper)}</div>
                    </div>
                    <button class="btn btn-outline btn-sm" onclick="Finance.closeOperationComposer()">Закрыть</button>
                </div>
                <div class="finance-compose-grid">
                    <input class="input" type="date" data-field="date" value="${this._escAttr(today)}">
                    <select class="input" data-field="account_id">${this._accountOptions('', true, 'Счет списания / поступления')}</select>
                    <input class="input" type="number" min="0" step="0.01" data-field="amount" placeholder="Сумма">
                    <input class="input" data-field="counterparty_name" placeholder="${this._escAttr(isTransfer ? 'Например: Перевод между своими счетами' : 'Контрагент / кто платил')}">
                    <select class="input" data-field="category_id">${this._categoryOptions(isTransfer ? 'finance_transfers' : '', true, isTransfer ? 'Переводы между счетами' : 'Статья')}</select>
                    <select class="input" data-field="project_id">${this._projectOptions('', true, 'Направление бизнеса')}</select>
                    <input class="input" list="finance-order-datalist" data-field="project_label" placeholder="Заказ / сделка (необязательно)">
                    <input class="input" data-field="description" placeholder="Описание операции">
                    ${isTransfer
                        ? `<select class="input" data-field="transfer_account_id">${this._accountOptions('', true, 'Куда переводим')}</select>`
                        : '<input type="hidden" data-field="transfer_account_id" value="">'}
                    <input class="input" data-field="note" placeholder="Заметка для себя">
                </div>
                <div class="finance-compose-actions">
                    <button class="btn btn-primary btn-sm" onclick="Finance.createManualOperation()">Добавить</button>
                    <button class="btn btn-outline btn-sm" onclick="Finance.closeOperationComposer()">Отмена</button>
                </div>
            </div>
        `;
    },

    _groupOperationsByDay(rows = []) {
        const groups = [];
        const map = new Map();
        (Array.isArray(rows) ? rows : []).forEach(item => {
            const dateKey = this._parseBusinessDate(item?.date) || '__no_date__';
            let group = map.get(dateKey);
            if (!group) {
                const labels = this._describeOperationDay(dateKey);
                group = {
                    dateKey,
                    title: labels.title,
                    subtitle: labels.subtitle,
                    count: 0,
                    income: 0,
                    expense: 0,
                    net: 0,
                    items: [],
                };
                map.set(dateKey, group);
                groups.push(group);
            }
            const amount = this._roundMoney(item?.amount);
            const direction = String(item?.direction || '');
            if (direction === 'in') group.income += amount;
            if (direction === 'out') group.expense += amount;
            group.net += direction === 'in' ? amount : (direction === 'out' ? -amount : 0);
            group.items.push(item);
            group.count += 1;
        });
        return groups.map(group => ({
            ...group,
            countLabel: `${group.count} ${this._ruPlural(group.count, 'операция', 'операции', 'операций')}`,
            incomeLabel: `+${this.fmtRub(group.income)}`,
            expenseLabel: `−${this.fmtRub(group.expense)}`,
            netLabel: this._formatSignedRub(group.net),
            netTone: group.net > 0 ? 'in' : (group.net < 0 ? 'out' : 'neutral'),
        }));
    },

    _describeOperationDay(dateValue) {
        const raw = this._parseBusinessDate(dateValue);
        if (!raw) {
            return {
                title: 'Без даты',
                subtitle: 'Дата не указана',
            };
        }
        const date = this._dateFromBusinessDate(raw);
        if (!date) {
            return {
                title: raw,
                subtitle: 'Нераспознанная дата',
            };
        }
        const today = this._todayDateLocal();
        const todayRaw = this._businessDateFromDate(today);
        const yesterdayRaw = this._businessDateFromDate(this._shiftLocalDays(today, -1));
        const fullDate = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        if (raw === todayRaw) {
            return {
                title: 'Сегодня',
                subtitle: fullDate,
            };
        }
        if (raw === yesterdayRaw) {
            return {
                title: 'Вчера',
                subtitle: fullDate,
            };
        }
        return {
            title: date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }),
            subtitle: `${date.toLocaleDateString('ru-RU', { weekday: 'long' })} · ${fullDate}`,
        };
    },

    _renderOperationDayGroup(group, selectedSet = new Set(), focusedKey = '') {
        if (!group) return '';
        const dayKeys = (Array.isArray(group.items) ? group.items : []).map(item => String(item?.txKey || '')).filter(Boolean);
        const selectedCount = dayKeys.filter(key => selectedSet.has(key)).length;
        const allSelected = dayKeys.length > 0 && selectedCount === dayKeys.length;
        const daySelectionLabel = allSelected
            ? 'Снять день'
            : (selectedCount > 0 ? `Добрать день (${selectedCount}/${dayKeys.length})` : 'Выбрать день');
        return `
            <section class="finance-op-day" data-finance-op-day="${this._escAttr(group.dateKey || '')}">
                <div class="finance-op-day__head">
                    <div class="finance-op-day__copy">
                        <div class="finance-op-day__title-row">
                            <div class="finance-op-day__title">${this._esc(group.title || 'Без даты')}</div>
                            <div class="finance-op-day__count">${this._esc(group.countLabel || '')}</div>
                            ${selectedCount > 0 ? `<div class="finance-op-day__selection">${this._esc(`В пачке ${selectedCount}/${dayKeys.length}`)}</div>` : ''}
                        </div>
                        <div class="finance-op-day__sub">${this._esc(group.subtitle || '')}</div>
                    </div>
                    <div class="finance-op-day__aside">
                        <div class="finance-op-day__totals">
                            <div class="finance-op-day__metric finance-op-day__metric--in">
                                <em>Вход</em>
                                <strong>${this._esc(group.incomeLabel || `+${this.fmtRub(0)}`)}</strong>
                            </div>
                            <div class="finance-op-day__metric finance-op-day__metric--out">
                                <em>Выход</em>
                                <strong>${this._esc(group.expenseLabel || `−${this.fmtRub(0)}`)}</strong>
                            </div>
                            <div class="finance-op-day__metric finance-op-day__metric--${this._escAttr(group.netTone || 'neutral')}">
                                <em>Итог</em>
                                <strong>${this._esc(group.netLabel || this.fmtRub(0))}</strong>
                            </div>
                        </div>
                        <button class="btn btn-outline btn-sm finance-op-day__toggle" onclick="event.stopPropagation(); Finance.toggleDayOperationSelection('${this._escJs(group.dateKey || '')}')">${this._esc(daySelectionLabel)}</button>
                    </div>
                </div>
                <div class="finance-op-day__items">
                    ${(Array.isArray(group.items) ? group.items : []).map(item => this._renderOperationListItem(item, selectedSet, focusedKey)).join('')}
                </div>
            </section>
        `;
    },

    _renderOperationListItem(item, selectedSet = new Set(), focusedKey = '') {
        const txKey = String(item.txKey || '');
        const isSelected = selectedSet.has(txKey);
        const isFocused = txKey && txKey === String(focusedKey || '');
        const routeChipTone = item.statusTone === 'ok' ? 'ok' : (item.statusTone === 'warn' ? 'warn' : 'muted');
        const directionLabel = item.kind === 'transfer'
            ? 'Перевод'
            : item.kind === 'owner_money'
                ? 'Собственник'
                : (item.direction === 'in' ? 'Поступление' : 'Списание');
        const amountTone = item.direction === 'in' ? 'finance-op-item__amount--in' : 'finance-op-item__amount--out';
        const hasProject = !!(item.projectName || item.projectLabel);
        const hasCategory = !!item.categoryName;
        const projectLabel = hasProject ? (item.projectName || item.projectLabel) : 'Нужно направление';
        const categoryLabel = hasCategory ? item.categoryName : 'Нужна статья';
        const missingLabel = this._operationNeedsLabel(item);
        const accountShort = this._shorten(item.accountLabel || 'Без счета', 32);
        const linkedCount = (item.derivedCharges || []).length + (item.linkedItems || []).length;
        const itemClasses = [
            'finance-op-item',
            isFocused ? 'finance-op-item--active' : '',
            isSelected ? 'finance-op-item--selected' : '',
            `finance-op-item--${this._escAttr(item.statusTone || 'muted')}`,
        ].filter(Boolean).join(' ');
        return `
            <div class="${itemClasses}" onclick="Finance.focusOperation('${this._escJs(txKey)}')">
                <div class="finance-op-item__check" onclick="event.stopPropagation()">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="Finance.toggleOperationSelection('${this._escJs(txKey)}')">
                </div>
                <div class="finance-op-item__main">
                    <div class="finance-op-item__top">
                        <span class="finance-chip finance-chip--${this._escAttr(routeChipTone)}">${this._esc(item.routeLabel || 'Без маршрута')}</span>
                        <span class="finance-op-item__date">${this._esc(item.date || '—')}</span>
                        <span class="finance-op-item__account">${this._esc(accountShort)}</span>
                    </div>
                    <div class="finance-op-item__body">
                        <div class="finance-op-item__summary">
                            <div class="finance-op-item__title">${this._esc(item.counterpartyName || 'Без контрагента')}</div>
                            <div class="finance-op-item__desc">${this._esc(item.descriptionShort || 'Без описания')}</div>
                        </div>
                        <div class="finance-op-item__side">
                            <div class="finance-op-item__amount ${amountTone}">${this._esc(item.amountLabel)}</div>
                            <div class="finance-op-item__side-sub">${this._esc(directionLabel)}</div>
                        </div>
                    </div>
                    <div class="finance-op-item__facts">
                        <div class="finance-op-item__fact">
                            <span>Статья</span>
                            <strong class="${hasCategory ? '' : 'is-missing'}">${this._esc(categoryLabel)}</strong>
                        </div>
                        <div class="finance-op-item__fact">
                            <span>Направление</span>
                            <strong class="${hasProject ? '' : 'is-missing'}">${this._esc(projectLabel)}</strong>
                        </div>
                        <div class="finance-op-item__fact">
                            <span>Что осталось</span>
                            <strong class="${missingLabel === 'Можно подтверждать' ? '' : 'is-missing'}">${this._esc(missingLabel)}</strong>
                        </div>
                        <div class="finance-op-item__fact">
                            <span>Связки</span>
                            <strong>${linkedCount > 0 ? this._esc(`Связано ${String(linkedCount)}`) : 'Нет'}</strong>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    _renderOperationInspector(item, context = {}) {
        const txKey = String(item.txKey || '');
        const isSelected = !!context?.isSelected;
        const focusIndex = Math.max(0, Number(context?.index) || 0);
        const focusTotal = Math.max(0, Number(context?.total) || 0);
        const hasPrev = focusIndex > 0;
        const hasNext = focusIndex < Math.max(0, focusTotal - 1);
        const directionLabel = item.kind === 'transfer'
            ? 'Перевод'
            : item.kind === 'owner_money'
                ? 'Собственник'
                : (item.direction === 'in' ? 'Поступление' : 'Списание');
        const routeChipTone = item.statusTone === 'ok' ? 'ok' : (item.statusTone === 'warn' ? 'warn' : 'muted');
        const detailTone = item.statusTone === 'ok' ? 'ok' : (item.statusTone === 'warn' ? 'warn' : 'muted');
        const linkedMarkup = [
            ...(item.derivedCharges || []).map(charge => `<span class="finance-link-pill">${this._esc(charge.label)} ${this._esc(charge.amountLabel)}</span>`),
            ...(item.linkedItems || []).map(linked => `<span class="finance-link-pill">${this._esc(linked.categoryName || 'Связанный расход')} ${this._esc(linked.amountLabel || '')}</span>`),
        ].join('');
        const amountTone = item.direction === 'in' ? 'finance-op-panel__amount--in' : 'finance-op-panel__amount--out';
        const reasonSummary = item.reasonSummary || 'Без подсказки';
        const projectLabel = item.projectName || item.projectLabel || 'Без направления';
        const currentKindLabel = this.TRANSACTION_KIND_LABELS[item.kind] || directionLabel;
        const currentCategoryLabel = item.categoryName || 'Нужна статья';
        const currentProjectLabel = item.projectName || item.projectLabel || 'Нужно направление';
        const reviewStatus = item.confirmed ? 'Уже подтверждено' : this._operationNeedsLabel(item);
        const noteValue = item.decision?.note || '';
        const suggestionLabel = this._describeSuggestion(item.suggestion);
        const hasSuggestion = this._hasMeaningfulSuggestion(item.suggestion);
        const manualDirection = String(item.direction || 'out') === 'in' ? 'in' : 'out';
        return `
            <div class="finance-op-panel finance-op-panel--${this._escAttr(detailTone)}" data-finance-tx-row="${this._esc(txKey)}">
                <div class="finance-op-panel__head">
                    <div class="finance-op-panel__intro">
                        <div class="finance-op-panel__eyebrow">
                            <span class="finance-chip finance-chip--${this._escAttr(routeChipTone)}">${this._esc(item.routeLabel || 'Без маршрута')}</span>
                            ${isSelected ? '<span class="finance-chip finance-chip--accent">В пачке</span>' : ''}
                            <span>${this._esc(item.date || '—')}</span>
                            <span>${this._esc(item.accountLabel || 'Без счета')}</span>
                        </div>
                        <div class="finance-op-panel__title">${this._esc(item.counterpartyName || 'Без контрагента')}</div>
                        <div class="finance-op-panel__desc">${this._esc(item.descriptionShort || 'Без описания')}</div>
                    </div>
                    <div class="finance-op-panel__money">
                        <div class="finance-op-panel__amount ${amountTone}">${this._esc(item.amountLabel)}</div>
                        <div class="finance-op-panel__amount-sub">${this._esc(currentKindLabel)}</div>
                    </div>
                </div>

                <div class="finance-op-panel__summary">
                    <div class="finance-op-panel__summary-card">
                        <span>Статья сейчас</span>
                        <strong>${this._esc(currentCategoryLabel)}</strong>
                    </div>
                    <div class="finance-op-panel__summary-card">
                        <span>Направление сейчас</span>
                        <strong>${this._esc(currentProjectLabel)}</strong>
                    </div>
                    <div class="finance-op-panel__summary-card">
                        <span>Что осталось</span>
                        <strong>${this._esc(reviewStatus)}</strong>
                    </div>
                </div>

                <div class="finance-op-panel__nav">
                    <button class="btn btn-outline btn-sm" onclick="Finance.focusRelativeOperation(-1)" ${hasPrev ? '' : 'disabled'}>← Предыдущая</button>
                    <div class="finance-op-panel__nav-copy">${this._esc(String(focusIndex + 1))} из ${this._esc(String(focusTotal || 0))} на экране</div>
                    <button class="btn btn-outline btn-sm" onclick="Finance.focusRelativeOperation(1)" ${hasNext ? '' : 'disabled'}>Следующая →</button>
                </div>

                <div class="finance-op-panel__assist ${hasSuggestion ? '' : 'finance-op-panel__assist--muted'}">
                    <div class="finance-op-panel__assist-copy">
                        <span>Подсказка системы</span>
                        <strong>${this._esc(suggestionLabel)}</strong>
                        <em>${this._esc(reasonSummary)}</em>
                    </div>
                    <div class="finance-op-panel__assist-actions">
                        <button class="btn btn-outline btn-sm" onclick="Finance.applySuggestedDecision('${this._escJs(txKey)}', false)" ${hasSuggestion ? '' : 'disabled'}>Применить подсказку</button>
                        <button class="btn btn-outline btn-sm" onclick="Finance.applySuggestedDecision('${this._escJs(txKey)}', true)" ${hasSuggestion ? '' : 'disabled'}>Подсказку + дальше</button>
                    </div>
                </div>

                ${this._renderOperationQuickPresets('single', txKey)}

                ${linkedMarkup ? `<div class="finance-link-pills finance-op-panel__links">${linkedMarkup}</div>` : ''}

                ${item.manualId ? `
                    <details class="finance-op-panel__manual">
                        <summary class="finance-op-panel__manual-summary">
                            <div>
                                <span>Ручная операция</span>
                                <strong>Сырые реквизиты. Открывай только если нужно поправить источник.</strong>
                            </div>
                            <button class="btn btn-outline btn-sm" type="button" onclick="event.preventDefault(); event.stopPropagation(); Finance.updateManualTransaction('${this._escJs(txKey)}')">Сохранить ручную</button>
                        </summary>
                        <div class="finance-op-panel__manual-grid">
                            <div class="finance-mini-field">
                                <span>Дата</span>
                                <input class="input" type="date" data-field="manual_date" value="${this._escAttr(item.date || '')}">
                            </div>
                            <div class="finance-mini-field">
                                <span>Счет</span>
                                <select class="input" data-field="manual_account_id">${this._accountOptions(item.accountId, true, 'Счет')}</select>
                            </div>
                            <div class="finance-mini-field">
                                <span>Тип движения</span>
                                <select class="input" data-field="manual_direction">
                                    <option value="out" ${manualDirection === 'out' ? 'selected' : ''}>Списание</option>
                                    <option value="in" ${manualDirection === 'in' ? 'selected' : ''}>Поступление</option>
                                </select>
                            </div>
                            <div class="finance-mini-field">
                                <span>Сумма</span>
                                <input class="input" type="number" min="0" step="0.01" data-field="manual_amount" value="${this._escAttr(String(this._num(item.amount) || ''))}">
                            </div>
                            <div class="finance-mini-field finance-mini-field--wide">
                                <span>Контрагент</span>
                                <input class="input" data-field="manual_counterparty_name" value="${this._escAttr(item.counterpartyName || '')}" placeholder="Кто платил или кому платили">
                            </div>
                            <div class="finance-mini-field finance-mini-field--wide">
                                <span>Описание</span>
                                <input class="input" data-field="manual_description" value="${this._escAttr(item.description || '')}" placeholder="Краткое описание ручной операции">
                            </div>
                        </div>
                    </details>
                ` : ''}

                <div class="finance-op-panel__section-head">
                    <span>Разнести вручную</span>
                    <strong>Статья, направление, заказ и заметка. Только то, что реально нужно на каждый день.</strong>
                </div>

                <div class="finance-op-panel__form">
                    <div class="finance-mini-field">
                        <span>Статья</span>
                        <select class="input" data-field="category_id">${this._categoryOptions(item.categoryId, true, 'Без статьи')}</select>
                    </div>
                    <div class="finance-mini-field">
                        <span>Направление бизнеса</span>
                        <select class="input" data-field="project_id">${this._projectOptions(item.projectId, true, 'Без направления')}</select>
                    </div>
                    <div class="finance-mini-field finance-mini-field--wide">
                        <span>Заказ / сделка</span>
                        <input class="input" list="finance-order-datalist" data-field="project_label" value="${this._escAttr(item.projectLabel || '')}" placeholder="Например: заказ, Китай, производство, конкретная поставка">
                    </div>
                    <div class="finance-mini-field finance-mini-field--wide">
                        <span>Заметка</span>
                        <input class="input" data-field="note" value="${this._escAttr(noteValue)}" placeholder="Что важно зафиксировать по операции">
                    </div>
                    ${item.kind === 'transfer'
                        ? `
                            <div class="finance-mini-field finance-mini-field--wide">
                                <span>Счет перевода</span>
                                <select class="input" data-field="transfer_account_id">${this._accountOptions(item.transferAccountId, true, 'Счет перевода')}</select>
                            </div>
                        `
                        : `<input type="hidden" data-field="transfer_account_id" value="${this._escAttr(item.transferAccountId || '')}">`}
                    <input type="hidden" data-field="counterparty_id" value="${this._escAttr(item.counterpartyId || '')}">
                    <input type="hidden" data-field="payroll_employee_id" value="${this._escAttr(item.payrollEmployeeId || '')}">
                    <input type="hidden" data-field="kind" value="${this._escAttr(item.kind || '')}">
                </div>

                <div class="finance-op-panel__section-head">
                    <span>Быстрые действия</span>
                    <strong>Подтвердить, превратить в перевод, зарплату или скрыть без лишних шагов.</strong>
                </div>

                <div class="finance-op-panel__actions">
                    <label class="finance-inline-check">
                        <input type="checkbox" data-field="confirmed" ${item.confirmed ? 'checked' : ''}>
                        <span>Подтверждено</span>
                    </label>
                    <button class="btn btn-primary btn-sm" onclick="Finance.confirmTransactionDecision('${this._escJs(txKey)}')">Сохранить и дальше</button>
                    <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(txKey)}', 'transfer')">Сделать переводом</button>
                    <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(txKey)}', 'payroll')">Сделать ЗП</button>
                    <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(txKey)}', 'ignore')">Скрыть</button>
                    ${item.manualId
                        ? `<button class="btn btn-outline btn-sm" onclick="Finance.removeManualTransaction('${this._escJs(txKey)}')">Удалить ручную</button>`
                        : `<button class="btn btn-outline btn-sm" onclick="Finance.resetTransactionDecision('${this._escJs(txKey)}')">Сбросить разметку</button>`}
                </div>
            </div>
        `;
    },

    _renderTransactionRow(item, selectedSet = new Set()) {
        const directionLabel = item.kind === 'transfer'
            ? 'Перевод'
            : item.kind === 'owner_money'
                ? 'Собственник'
                : (item.direction === 'in' ? 'Поступление' : 'Списание');
        const routeChipTone = item.statusTone === 'ok' ? 'ok' : (item.statusTone === 'warn' ? 'warn' : 'muted');
        const linkedMarkup = [
            ...(item.derivedCharges || []).map(charge => `<span class="finance-link-pill">${this._esc(charge.label)} ${this._esc(charge.amountLabel)}</span>`),
            ...(item.linkedItems || []).map(linked => `<span class="finance-link-pill">${this._esc(linked.categoryName || 'Связанный расход')} ${this._esc(linked.amountLabel || '')}</span>`),
        ].join('');
        const isSelected = selectedSet.has(String(item.txKey || ''));
        const rowClasses = [
            'finance-op-card',
            `finance-op-card--${this._escAttr(item.statusTone || 'muted')}`,
            isSelected ? 'finance-op-card--selected' : '',
        ].filter(Boolean).join(' ');
        const accountLabel = item.accountLabel || 'Без счета';
        const projectLabel = item.projectName || item.projectLabel || 'Без направления';
        const reasonSummary = item.reasonSummary || 'Без подсказки';
        const noteValue = item.decision?.note || '';
        const amountTone = item.direction === 'in' ? 'finance-op-card__amount--in' : 'finance-op-card__amount--out';
        return `
            <div class="${rowClasses}" data-finance-tx-row="${this._esc(item.txKey)}">
                <div class="finance-op-card__head">
                    <div class="finance-op-card__head-left">
                        <label class="finance-op-card__select">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="Finance.toggleOperationSelection('${this._escJs(item.txKey)}')">
                            <span></span>
                        </label>
                        <span class="finance-chip finance-chip--${this._escAttr(routeChipTone)}">${this._esc(item.routeLabel || 'Без маршрута')}</span>
                        <span class="finance-op-card__date">${this._esc(item.date || '—')}</span>
                    </div>
                    <div class="finance-op-card__head-right">
                        <span class="finance-op-card__kind">${this._esc(directionLabel)}</span>
                        <span class="finance-op-card__account">${this._esc(accountLabel)}</span>
                    </div>
                </div>

                <div class="finance-op-card__body">
                    <div class="finance-op-card__summary">
                        <div class="finance-op-card__title">${this._esc(item.counterpartyName || 'Без контрагента')}</div>
                        <div class="finance-op-card__desc">${this._esc(item.descriptionShort || 'Без описания')}</div>
                        <div class="finance-op-card__meta">${this._esc(reasonSummary)}</div>
                        ${linkedMarkup ? `<div class="finance-link-pills">${linkedMarkup}</div>` : ''}
                    </div>
                    <div class="finance-op-card__amount ${amountTone}">${this._esc(item.amountLabel)}</div>
                </div>

                <div class="finance-op-card__editor">
                    <div class="finance-mini-field">
                        <span>Статья</span>
                        <select class="input" data-field="category_id">${this._categoryOptions(item.categoryId, true, 'Без статьи')}</select>
                    </div>
                    <div class="finance-mini-field">
                        <span>Направление</span>
                        <select class="input" data-field="project_id">${this._projectOptions(item.projectId, true, 'Без направления')}</select>
                    </div>
                    <div class="finance-mini-field">
                        <span>Заказ / сделка</span>
                        <input class="input" list="finance-order-datalist" data-field="project_label" value="${this._escAttr(item.projectLabel || '')}" placeholder="Если нужно привязать к заказу">
                    </div>
                    <div class="finance-mini-field">
                        <span>Заметка</span>
                        <input class="input" data-field="note" value="${this._escAttr(noteValue)}" placeholder="Что важно запомнить по операции">
                    </div>
                    ${item.kind === 'transfer'
                        ? `
                            <div class="finance-mini-field finance-mini-field--wide">
                                <span>Счет перевода</span>
                                <select class="input" data-field="transfer_account_id">${this._accountOptions(item.transferAccountId, true, 'Счет перевода')}</select>
                            </div>
                        `
                        : `<input type="hidden" data-field="transfer_account_id" value="${this._escAttr(item.transferAccountId || '')}">`}
                    <input type="hidden" data-field="counterparty_id" value="${this._escAttr(item.counterpartyId || '')}">
                    <input type="hidden" data-field="payroll_employee_id" value="${this._escAttr(item.payrollEmployeeId || '')}">
                    <input type="hidden" data-field="kind" value="${this._escAttr(item.kind || '')}">
                </div>

                <div class="finance-op-card__footer">
                    <div class="finance-op-card__signals">
                        <span class="finance-op-card__signal"><strong>Направление:</strong> ${this._esc(projectLabel)}</span>
                        <span class="finance-op-card__signal"><strong>Уверенность:</strong> ${this._esc(reasonSummary)}</span>
                    </div>
                    <div class="finance-op-card__actions">
                        <label class="finance-inline-check">
                            <input type="checkbox" data-field="confirmed" ${item.confirmed ? 'checked' : ''}>
                            <span>Подтверждено</span>
                        </label>
                        <button class="btn btn-outline btn-sm" onclick="Finance.confirmTransactionDecision('${this._escJs(item.txKey)}')">Подтвердить</button>
                        <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(item.txKey)}', 'transfer')">В перевод</button>
                        <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(item.txKey)}', 'payroll')">В ЗП</button>
                        <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(item.txKey)}', 'ignore')">Скрыть</button>
                        ${item.manualId
                            ? `<button class="btn btn-outline btn-sm" onclick="Finance.removeManualTransaction('${this._escJs(item.txKey)}')">Удалить</button>`
                            : `<button class="btn btn-outline btn-sm" onclick="Finance.resetTransactionDecision('${this._escJs(item.txKey)}')">Сброс</button>`}
                    </div>
                </div>
            </div>
        `;
    },

    _renderPayrollRow(item) {
        return `
            <tr data-finance-payroll-row="${this._esc(item.txKey)}">
                <td style="min-width:280px">
                    <div class="finance-tx-head">
                        <span class="finance-chip finance-chip--${this._escAttr(item.statusTone)}">${this._esc(item.routeLabel)}</span>
                        <span class="text-muted">${this._esc(item.date || '—')}</span>
                    </div>
                    <div class="finance-tx-title">${this._esc(item.counterpartyName || 'Без контрагента')}</div>
                    <div class="finance-tx-sub">${this._esc(item.descriptionShort || 'Без описания')}</div>
                    <div class="finance-tx-sub">Счёт: ${this._esc(item.accountLabel || '—')}</div>
                </td>
                <td class="text-right" style="white-space:nowrap;font-weight:700">${this._esc(item.amountLabel)}</td>
                <td style="min-width:220px">
                    <select class="input" data-field="category_id">${this._categoryOptions(item.categoryId, true, 'Без статьи')}</select>
                </td>
                <td style="min-width:200px">
                    <select class="input" data-field="project_id">${this._projectOptions(item.projectId, true, 'Без направления')}</select>
                </td>
                <td style="min-width:220px">
                    <input class="input" data-field="note" value="${this._escAttr(item.decision?.note || '')}" placeholder="Например: аванс / остаток">
                    <input type="hidden" data-field="counterparty_id" value="${this._escAttr(item.counterpartyId || '')}">
                    <input type="hidden" data-field="transfer_account_id" value="${this._escAttr(item.transferAccountId || '')}">
                    <input type="hidden" data-field="kind" value="${this._escAttr(item.kind || '')}">
                    <input type="hidden" data-field="project_label" value="${this._escAttr(item.projectLabel || '')}">
                    <input type="hidden" data-field="payroll_employee_id" value="${this._escAttr(item.payrollEmployeeId || '')}">
                </td>
                <td style="min-width:250px">
                    <div class="finance-tx-sub">${this._esc(item.payrollEmployeeName || 'Без сотрудника')}</div>
                    <div class="finance-tx-sub">${this._esc(item.reasonSummary)}</div>
                    <label class="finance-inline-check">
                        <input type="checkbox" data-field="confirmed" ${item.confirmed ? 'checked' : ''}>
                        <span>Подтверждено</span>
                    </label>
                    <div class="finance-action-row">
                        <button class="btn btn-outline btn-sm" onclick="Finance.confirmTransactionDecision('${this._escJs(item.txKey)}')">Подтвердить</button>
                        <button class="btn btn-outline btn-sm" onclick="Finance.markTransactionKind('${this._escJs(item.txKey)}', 'transfer')">Это перевод</button>
                        <button class="btn btn-outline btn-sm" onclick="Finance.resetTransactionDecision('${this._escJs(item.txKey)}')">Сброс</button>
                    </div>
                </td>
            </tr>
        `;
    },

    _renderAccountToolRow(account, usedRows) {
        const activity = this._matchWorkspaceAccountUsage(account, usedRows);
        return `
            <tr data-finance-account-row="${this._esc(account.id)}">
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(account.name)}">
                    <input type="hidden" data-field="source_id" value="${this._escAttr(account.source_id || '')}">
                    <input type="hidden" data-field="note" value="${this._escAttr(account.note || '')}">
                    <input type="hidden" data-field="external_ref" value="${this._escAttr(account.external_ref || '')}">
                </td>
                <td><select class="input" data-field="type">${this._accountTypeOptions(account.type)}</select></td>
                <td><input class="input" data-field="owner" value="${this._escAttr(account.owner)}"></td>
                <td class="text-center"><input type="checkbox" data-field="show_in_money" ${account.show_in_money !== false ? 'checked' : ''}></td>
                <td class="text-center"><input type="checkbox" data-field="legacy_hide_in_total" ${account.legacy_hide_in_total ? 'checked' : ''}></td>
                <td><select class="input" data-field="status">${this._accountStatusOptions(account.status)}</select></td>
                <td>${this._esc(activity ? `${activity.transactionCount} · ${activity.lastTransactionDate || '—'}` : '—')}</td>
                <td class="text-right"><button class="btn btn-outline btn-sm" onclick="Finance.removeAccount('${this._escJs(account.id)}')">✕</button></td>
            </tr>
        `;
    },

    _renderProjectToolRow(project) {
        return `
            <tr data-finance-project-row="${this._esc(project.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${project.active !== false ? 'checked' : ''}></td>
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(project.name)}">
                    <input type="hidden" data-field="default_income_category_id" value="${this._escAttr(project.default_income_category_id || '')}">
                </td>
                <td><select class="input" data-field="type">${this._projectTypeOptions(project.type)}</select></td>
                <td><input class="input" data-field="note" value="${this._escAttr(project.note || '')}"></td>
                <td class="text-right"><button class="btn btn-outline btn-sm" onclick="Finance.removeProject('${this._escJs(project.id)}')">✕</button></td>
            </tr>
        `;
    },

    _renderFixedAssetReportRow(item) {
        const statusMarkup = this._fixedAssetStatusChip(item.status);
        const assetLabel = item.vendor_name
            ? `${item.name} · ${item.vendor_name}`
            : item.name;
        return `
            <tr>
                <td>
                    <strong>${this._esc(assetLabel)}</strong><br>
                    <span class="text-muted">${this._esc(item.note || item.type_label || 'Без комментария')}</span>
                </td>
                <td>${this._esc(item.project_name || 'Без направления')}</td>
                <td class="text-right">${this._esc(this.fmtRub(item.purchase_cost || 0))}</td>
                <td class="text-right">${this._esc(this.fmtRub(item.current_month_amortization || 0))}</td>
                <td class="text-right">${this._esc(this.fmtRub(item.accumulated_amortization || 0))}</td>
                <td class="text-right">${this._esc(this.fmtRub(item.residual_value || 0))}</td>
                <td class="text-right">${this._esc(this.fmtRub(item.payable_amount || 0))}</td>
                <td>${statusMarkup}</td>
            </tr>
        `;
    },

    _renderFixedAssetToolRow(item, computed = null) {
        const statusMarkup = computed ? this._fixedAssetStatusChip(computed.status) : this._fixedAssetStatusChip('planned');
        const restText = computed
            ? `${this.fmtRub(computed.residual_value || 0)} · долг ${this.fmtRub(computed.payable_amount || 0)}`
            : '—';
        return `
            <tr data-finance-fixed-asset-row="${this._esc(item.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${item.active !== false ? 'checked' : ''}></td>
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(item.name)}">
                    <input class="input" data-field="vendor_name" value="${this._escAttr(item.vendor_name || '')}" placeholder="Поставщик" style="margin-top:6px">
                    <input class="input" data-field="note" value="${this._escAttr(item.note || '')}" placeholder="Комментарий" style="margin-top:6px">
                </td>
                <td><select class="input" data-field="asset_type">${this._fixedAssetTypeOptions(item.asset_type)}</select></td>
                <td><input class="input" type="number" min="0" step="0.01" data-field="purchase_cost" value="${this._escAttr(String(this._num(item.purchase_cost)))}"></td>
                <td><input class="input" type="number" min="0" step="0.01" data-field="paid_amount" value="${this._escAttr(String(this._num(item.paid_amount)))}"></td>
                <td>
                    <input class="input" type="month" data-field="opiu_start_month" value="${this._escAttr(item.opiu_start_month || '')}">
                    <input type="hidden" data-field="accepted_date" value="${this._escAttr(item.accepted_date || '')}">
                </td>
                <td><input class="input" type="number" min="1" max="240" step="1" data-field="useful_life_months" value="${this._escAttr(String(item.useful_life_months || 36))}"></td>
                <td><select class="input" data-field="project_id">${this._projectOptions(item.project_id, true, 'Без направления')}</select></td>
                <td class="text-center"><input type="checkbox" data-field="purchased_earlier" ${item.purchased_earlier ? 'checked' : ''}></td>
                <td>
                    <div class="finance-tx-sub" style="margin-top:0">${this._esc(restText)}</div>
                    <div style="margin-top:6px">${statusMarkup}</div>
                </td>
                <td class="text-right"><button class="btn btn-outline btn-sm" onclick="Finance.removeFixedAsset('${this._escJs(item.id)}')">✕</button></td>
            </tr>
        `;
    },

    _renderCategoryToolRow(category) {
        return `
            <tr data-finance-category-row="${this._esc(category.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${category.active !== false ? 'checked' : ''}></td>
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(category.name)}">
                    <input type="hidden" data-field="bucket" value="${this._escAttr(category.bucket || '')}">
                    <input type="hidden" data-field="source_id" value="${this._escAttr(category.source_id || '')}">
                </td>
                <td><select class="input" data-field="group">${this._categoryGroupOptions(category.group)}</select></td>
                <td><input class="input" data-field="mapping" value="${this._escAttr(category.mapping || '')}"></td>
                <td class="text-right"><button class="btn btn-outline btn-sm" onclick="Finance.removeCategory('${this._escJs(category.id)}')">✕</button></td>
            </tr>
        `;
    },

    _renderRuleToolRow(rule) {
        return `
            <tr data-finance-rule-row="${this._esc(rule.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${rule.active !== false ? 'checked' : ''}></td>
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(rule.name)}">
                    <input type="hidden" data-field="trigger_type" value="${this._escAttr(rule.trigger_type || '')}">
                    <input type="hidden" data-field="account_scope" value="${this._escAttr(rule.account_scope || '')}">
                    <input type="hidden" data-field="counterparty_id" value="${this._escAttr(rule.counterparty_id || '')}">
                    <input type="hidden" data-field="confidence" value="${this._escAttr(String(this._clamp01(rule.confidence, 0.7)))}">
                    <input type="hidden" data-field="note" value="${this._escAttr(rule.note || '')}">
                </td>
                <td><input class="input" data-field="trigger" value="${this._escAttr(rule.trigger || '')}"></td>
                <td><select class="input" data-field="category_id">${this._categoryOptions(rule.category_id, true, '—')}</select></td>
                <td><select class="input" data-field="project_id">${this._projectOptions(rule.project_id, true, '—')}</select></td>
                <td class="text-center"><input type="checkbox" data-field="auto_apply" ${rule.auto_apply ? 'checked' : ''}></td>
                <td class="text-right"><button class="btn btn-outline btn-sm" onclick="Finance.removeRule('${this._escJs(rule.id)}')">✕</button></td>
            </tr>
        `;
    },

    _renderRecurringRow(item) {
        return `
            <tr data-finance-recurring-row="${this._esc(item.id)}">
                <td class="text-center"><input type="checkbox" data-field="active" ${item.active !== false ? 'checked' : ''}></td>
                <td>
                    <input class="input" data-field="name" value="${this._escAttr(item.name)}">
                    <input class="input" data-field="counterparty_name" value="${this._escAttr(item.counterparty_name || '')}" placeholder="Контрагент" style="margin-top:6px">
                    <input class="input" data-field="description" value="${this._escAttr(item.description || '')}" placeholder="Описание" style="margin-top:6px">
                </td>
                <td><select class="input" data-field="account_id">${this._accountOptions(item.account_id, true, 'Счет')}</select></td>
                <td>
                    <select class="input" data-field="kind">
                        <option value="expense" ${String(item.kind) === 'expense' ? 'selected' : ''}>Списание</option>
                        <option value="income" ${String(item.kind) === 'income' ? 'selected' : ''}>Пополнение</option>
                    </select>
                    <input type="hidden" data-field="cadence" value="${this._escAttr(item.cadence || 'monthly')}">
                </td>
                <td><input class="input" type="number" min="0" step="0.01" data-field="amount" value="${this._escAttr(String(this._num(item.amount)))}"></td>
                <td><input class="input" type="date" data-field="start_date" value="${this._escAttr(item.start_date || '')}"></td>
                <td><input class="input" type="number" min="1" max="31" step="1" data-field="day_of_month" value="${this._escAttr(String(item.day_of_month || ''))}"></td>
                <td><select class="input" data-field="category_id">${this._categoryOptions(item.category_id, true, 'Статья')}</select></td>
                <td><select class="input" data-field="project_id">${this._projectOptions(item.project_id, true, 'Без направления')}</select></td>
                <td><input class="input" data-field="note" value="${this._escAttr(item.note || '')}" placeholder="Например: курс 90 RUB/USD"></td>
                <td class="text-right"><button class="btn btn-outline btn-sm" onclick="Finance.removeRecurringTransaction('${this._escJs(item.id)}')">✕</button></td>
            </tr>
        `;
    },

    _filterOperationRows(rows) {
        const filters = this.ui.operations || {};
        const search = this._normalizeText(filters.search || '');
        const dateWindow = this._resolveOperationsDateWindow(filters);
        return (rows || []).filter(item => {
            if (!this._operationQueueMatches(item, filters.queue || 'all')) return false;
            if (!filters.show_hidden_accounts && !this._isOperationAccountVisible(item)) return false;
            if (filters.account && String(item.accountId || '') !== String(filters.account)) return false;
            if (filters.category && String(item.categoryId || '') !== String(filters.category)) return false;
            if (filters.direction && String(item.projectId || '') !== String(filters.direction)) return false;
            if (dateWindow.startDate && String(item.date || '') < dateWindow.startDate) return false;
            if (dateWindow.endDate && String(item.date || '') > dateWindow.endDate) return false;
            if (search) {
                const hay = this._normalizeText([
                    item.counterpartyName,
                    item.description,
                    item.accountLabel,
                    item.categoryName,
                    item.projectName,
                    item.projectLabel,
                    item.reasonSummary,
                ].filter(Boolean).join(' '));
                if (!hay.includes(search)) return false;
            }
            return true;
        });
    },

    _operationQueueMatches(item, queue) {
        const value = String(queue || 'all');
        if (!value || value === 'all') return true;
        if (value === 'review') return ['review', 'unmatched', 'draft'].includes(String(item?.route || ''));
        if (value === 'manual') return String(item?.route || '') === 'manual' || !!item?.manualId;
        if (value === 'auto') return String(item?.route || '') === 'auto';
        if (value === 'transfers') return String(item?.kind || '') === 'transfer';
        if (value === 'payroll') return String(item?.kind || '') === 'payroll';
        return true;
    },

    _operationQueueCount(queue, rows) {
        return (rows || []).filter(item => this._operationQueueMatches(item, queue)).length;
    },

    _renderOperationQueueTab(queue, label, rows, selected) {
        const count = this._operationQueueCount(queue, rows);
        return `
            <button class="finance-quick-tab ${String(queue) === String(selected || 'all') ? 'active' : ''}" onclick="Finance.setOperationsFilter('queue', '${this._escJs(queue)}')">
                <span>${this._esc(label)}</span>
                <strong>${this._esc(String(count))}</strong>
            </button>
        `;
    },

    _renderOperationsPeriodPresets(selected) {
        return this._periodPresetItems().map(item => `
            <button class="finance-quick-tab finance-quick-tab--period ${String(item.value) === String(selected || 'all') ? 'active' : ''}" onclick="Finance.setOperationsFilter('period', '${this._escJs(item.value)}')">
                <span>${this._esc(item.shortLabel || item.label)}</span>
            </button>
        `).join('');
    },

    _operationsQueueLabel(queue) {
        const labels = {
            all: 'Все операции',
            review: 'На проверке',
            manual: 'Ручные',
            auto: 'Авторазнос',
            transfers: 'Переводы',
            payroll: 'Зарплаты',
        };
        return labels[String(queue || 'all')] || 'Все операции';
    },

    _operationNeedsLabel(item) {
        const missingParts = [
            !item?.categoryName ? 'статья' : '',
            !(item?.projectName || item?.projectLabel) ? 'направление' : '',
        ].filter(Boolean);
        return missingParts.length > 0 ? `Нужно: ${missingParts.join(' + ')}` : 'Можно подтверждать';
    },

    _renderOperationsContextBar({ filters = {}, visibleRows = [], filteredRows = [], dateWindow = {} } = {}) {
        const pills = [];
        pills.push(`<span class="finance-context-pill finance-context-pill--strong">${this._esc(this._operationsQueueLabel(filters.queue || 'all'))}</span>`);
        if (String(filters.period || 'all') !== 'all') {
            pills.push(this._renderOperationsFilterChip(dateWindow.label || 'Период', 'period'));
        }
        if (filters.account) {
            const accountLabel = (this.summary?.transactions?.rows || []).find(item => String(item?.accountId || '') === String(filters.account || ''))?.accountLabel || filters.account;
            pills.push(this._renderOperationsFilterChip(accountLabel, 'account'));
        }
        if (filters.category) {
            const categoryLabel = this._findById(this.workspace?.categories, filters.category)?.name || 'Статья';
            pills.push(this._renderOperationsFilterChip(categoryLabel, 'category'));
        }
        if (filters.direction) {
            const directionLabel = filters.direction === 'in' ? 'Поступления' : (filters.direction === 'out' ? 'Списания' : filters.direction);
            pills.push(this._renderOperationsFilterChip(directionLabel, 'direction'));
        }
        if (filters.show_hidden_accounts) {
            pills.push(this._renderOperationsFilterChip('Скрытые счета', 'show_hidden_accounts'));
        }
        if (filters.search) {
            pills.push(this._renderOperationsFilterChip(`Поиск: ${this._shorten(filters.search, 26)}`, 'search', 'finance-context-pill--search'));
        }
        const hasActiveFilters = pills.length > 1;

        return `
            <div class="finance-ops-context">
                <div class="finance-inline-stats">
                    <span class="finance-inline-stat"><strong>${this._esc(String(visibleRows.length))}</strong> на экране</span>
                    <span class="finance-inline-stat"><strong>${this._esc(String(filteredRows.length))}</strong> в текущем срезе</span>
                    <span class="finance-inline-stat"><strong>${this._esc(String(this.summary?.transactions?.reviewCount || 0))}</strong> на проверке</span>
                    <span class="finance-inline-stat"><strong>${this._esc(String(this.summary?.transactions?.manualCount || 0))}</strong> ручных</span>
                    <span class="finance-inline-stat">история: ${this._esc(this._formatRange(this.summary?.tochka?.range))}</span>
                </div>
                <div class="finance-context-pills">
                    ${pills.join('')}
                    ${hasActiveFilters ? '<button class="finance-context-reset" onclick="Finance.resetOperationsFilters()">Сбросить все фильтры</button>' : ''}
                </div>
            </div>
        `;
    },

    _renderOperationsFilterChip(label, field, extraClass = '') {
        return `
            <span class="finance-context-pill finance-context-pill--action ${this._escAttr(extraClass)}">
                <span>${this._esc(label)}</span>
                <button class="finance-context-pill__clear" onclick="event.stopPropagation(); Finance.clearOperationsFilter('${this._escJs(field)}')" title="Убрать фильтр">×</button>
            </span>
        `;
    },

    _resolveOperationsDateWindow(filters = {}) {
        const preset = String(filters.period || 'all').trim() || 'all';
        const today = this._todayDateLocal();
        let startDate = '';
        let endDate = '';
        let label = 'Вся история';

        if (preset === 'today') {
            startDate = this._businessDateFromDate(today);
            endDate = startDate;
            label = 'Сегодня';
        } else if (preset === 'yesterday') {
            startDate = this._businessDateFromDate(this._shiftLocalDays(today, -1));
            endDate = startDate;
            label = 'Вчера';
        } else if (preset === 'last7') {
            startDate = this._businessDateFromDate(this._shiftLocalDays(today, -6));
            endDate = this._businessDateFromDate(today);
            label = 'Последние 7 дней';
        } else if (preset === 'week') {
            startDate = this._businessDateFromDate(this._startOfWeek(today));
            endDate = this._businessDateFromDate(today);
            label = 'Эта неделя';
        } else if (preset === 'month') {
            startDate = this._businessDateFromDate(this._startOfMonth(today));
            endDate = this._businessDateFromDate(today);
            label = 'Этот месяц';
        } else if (preset === 'quarter') {
            startDate = this._businessDateFromDate(this._startOfQuarter(today));
            endDate = this._businessDateFromDate(today);
            label = 'Этот квартал';
        } else if (preset === 'year') {
            startDate = this._businessDateFromDate(this._startOfYear(today));
            endDate = this._businessDateFromDate(today);
            label = 'Этот год';
        } else if (preset === 'custom') {
            startDate = this._parseBusinessDate(filters.start_date) || '';
            endDate = this._parseBusinessDate(filters.end_date) || '';
            if (startDate && endDate && startDate > endDate) {
                [startDate, endDate] = [endDate, startDate];
            }
            if (startDate && endDate) label = startDate === endDate ? startDate : `${startDate} → ${endDate}`;
            else if (startDate) label = `с ${startDate}`;
            else if (endDate) label = `до ${endDate}`;
            else label = 'Свой период';
        }

        return { preset, startDate, endDate, label };
    },

    _todayDateLocal() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    },

    _businessDateFromDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    _businessMonthFromDate(date) {
        const raw = this._businessDateFromDate(date);
        return raw ? raw.slice(0, 7) : '';
    },

    _dateFromBusinessDate(value) {
        const raw = this._parseBusinessDate(value);
        if (!raw) return null;
        return new Date(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, Number(raw.slice(8, 10)), 12, 0, 0, 0);
    },

    _businessMonthDistance(startMonth, endMonth) {
        const start = this._parseBusinessMonth(startMonth);
        const end = this._parseBusinessMonth(endMonth);
        if (!start || !end) return null;
        const startIndex = Number(start.slice(0, 4)) * 12 + Number(start.slice(5, 7)) - 1;
        const endIndex = Number(end.slice(0, 4)) * 12 + Number(end.slice(5, 7)) - 1;
        return endIndex - startIndex;
    },

    _shiftLocalDays(date, days) {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
        next.setDate(next.getDate() + Number(days || 0));
        return next;
    },

    _startOfWeek(date) {
        const day = date.getDay();
        const diff = (day + 6) % 7;
        return this._shiftLocalDays(date, -diff);
    },

    _startOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0, 0);
    },

    _startOfQuarter(date) {
        const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
        return new Date(date.getFullYear(), quarterMonth, 1, 12, 0, 0, 0);
    },

    _startOfYear(date) {
        return new Date(date.getFullYear(), 0, 1, 12, 0, 0, 0);
    },

    _resolveWorkspaceAccountForOperation(item) {
        if (!item) return null;
        const direct = this._findById(this.workspace?.accounts, item.accountId);
        if (direct) return direct;
        return (this.workspace?.accounts || []).find(account => {
            const externalRef = String(account?.external_ref || '').trim();
            const txDigits = this._digitsOnly([item.accountId, item.accountLabel, item.bankNumber].filter(Boolean).join(' '));
            const accountDigits = this._digitsOnly(`${account?.id || ''} ${account?.name || ''} ${account?.note || ''} ${externalRef}`);
            if (txDigits && accountDigits && txDigits.includes(accountDigits)) return true;
            if (txDigits && accountDigits && accountDigits.slice(-4) && txDigits.includes(accountDigits.slice(-4))) return true;
            return this._normalizeText(account?.name || '') === this._normalizeText(item.accountLabel || '');
        }) || null;
    },

    _isOperationAccountVisible(item) {
        const account = this._resolveWorkspaceAccountForOperation(item);
        if (!account) return true;
        if (account.status === 'archived') return false;
        return account.show_in_money !== false;
    },

    _matchWorkspaceAccountUsage(account, usedRows) {
        const accountDigits = this._digitsOnly(`${account?.name || ''} ${account?.note || ''}`);
        return (usedRows || []).find(item => {
            const itemDigits = this._digitsOnly(`${item?.id || ''} ${item?.accountId || ''} ${item?.name || ''}`);
            if (accountDigits && itemDigits && accountDigits.slice(-4) && itemDigits.includes(accountDigits.slice(-4))) return true;
            return String(item.name || '') === String(account?.name || '');
        }) || null;
    },

    _sourceOptions(selected) {
        return (this.workspace?.sources || []).map(source => `
            <option value="${this._escAttr(source.id)}" ${String(source.id) === String(selected) ? 'selected' : ''}>${this._esc(source.name)}</option>
        `).join('');
    },

    _accountTypeOptions(selected) {
        return Object.entries(this.ACCOUNT_TYPE_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _accountStatusOptions(selected) {
        return Object.entries(this.ACCOUNT_STATUS_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _fixedAssetTypeOptions(selected) {
        return Object.entries(this.FIXED_ASSET_TYPE_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _categoryGroupOptions(selected) {
        return Object.entries(this.GROUP_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _projectTypeOptions(selected) {
        return Object.entries(this.PROJECT_TYPE_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _counterpartyRoleOptions(selected) {
        return Object.entries(this.COUNTERPARTY_ROLE_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _researchModeOptions(selected) {
        return Object.entries(this.RESEARCH_MODE_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _ruleTriggerOptions(selected) {
        return Object.entries(this.RULE_TRIGGER_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _ruleAccountScopeOptions(selected) {
        const genericOptions = [
            { value: 'any', label: 'Любой счет' },
            { value: 'bank_any', label: 'Любой банк' },
            { value: 'cash_any', label: 'Любые наличные' },
        ];
        const actualAccounts = (this.workspace?.accounts || []).map(account => ({
            value: String(account.id || ''),
            label: account.name || account.id || 'Счет',
        }));
        return [...genericOptions, ...actualAccounts].map(option => `
            <option value="${this._escAttr(option.value)}" ${String(option.value) === String(selected) ? 'selected' : ''}>${this._esc(option.label)}</option>
        `).join('');
    },

    _projectOptions(selected, allowBlank = false, blankLabel = '—') {
        const options = [];
        if (allowBlank) {
            options.push(`<option value="" ${!selected ? 'selected' : ''}>${this._esc(blankLabel)}</option>`);
        }
        (this.workspace?.projects || []).forEach(project => {
            options.push(`
                <option value="${this._escAttr(project.id)}" ${String(project.id) === String(selected) ? 'selected' : ''}>${this._esc(project.name)}</option>
            `);
        });
        return options.join('');
    },

    _batchProjectOptions(selected) {
        const value = selected == null ? '__keep__' : String(selected);
        const options = [
            `<option value="__keep__" ${value === '__keep__' ? 'selected' : ''}>Направление: не менять</option>`,
            `<option value="" ${value === '' ? 'selected' : ''}>Без направления</option>`,
        ];
        (this.workspace?.projects || []).forEach(project => {
            options.push(`
                <option value="${this._escAttr(project.id)}" ${String(project.id) === value ? 'selected' : ''}>${this._esc(project.name)}</option>
            `);
        });
        return options.join('');
    },

    _categoryOptions(selected, allowBlank = false, blankLabel = '—') {
        const options = [];
        if (allowBlank) {
            options.push(`<option value="" ${!selected ? 'selected' : ''}>${this._esc(blankLabel)}</option>`);
        }
        (this.workspace?.categories || []).forEach(category => {
            options.push(`
                <option value="${this._escAttr(category.id)}" ${String(category.id) === String(selected) ? 'selected' : ''}>${this._esc(category.name)}</option>
            `);
        });
        return options.join('');
    },

    _batchCategoryOptions(selected) {
        const value = selected == null ? '__keep__' : String(selected);
        const options = [
            `<option value="__keep__" ${value === '__keep__' ? 'selected' : ''}>Статья: не менять</option>`,
            `<option value="" ${value === '' ? 'selected' : ''}>Очистить статью</option>`,
        ];
        (this.workspace?.categories || []).forEach(category => {
            options.push(`
                <option value="${this._escAttr(category.id)}" ${String(category.id) === value ? 'selected' : ''}>${this._esc(category.name)}</option>
            `);
        });
        return options.join('');
    },

    _counterpartyOptions(selected, allowBlank = false, blankLabel = '—') {
        const options = [];
        if (allowBlank) {
            options.push(`<option value="" ${!selected ? 'selected' : ''}>${this._esc(blankLabel)}</option>`);
        }
        (this.workspace?.counterparties || []).forEach(item => {
            options.push(`
                <option value="${this._escAttr(item.id)}" ${String(item.id) === String(selected) ? 'selected' : ''}>${this._esc(item.name)}</option>
            `);
        });
        return options.join('');
    },

    _transactionKindOptions(selected) {
        return Object.entries(this.TRANSACTION_KIND_LABELS).map(([value, label]) => `
            <option value="${this._escAttr(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${this._esc(label)}</option>
        `).join('');
    },

    _employeeOptions(selected, allowBlank = false, blankLabel = '—') {
        const options = [];
        if (allowBlank) {
            options.push(`<option value="" ${!selected ? 'selected' : ''}>${this._esc(blankLabel)}</option>`);
        }
        (this.data?.employees || [])
            .filter(item => item && item.is_active !== false)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ru'))
            .forEach(employee => {
                options.push(`
                    <option value="${this._escAttr(String(employee.id))}" ${String(employee.id) === String(selected) ? 'selected' : ''}>${this._esc(employee.name || `Сотрудник ${employee.id}`)}</option>
                `);
            });
        return options.join('');
    },

    _accountOptions(selected, allowBlank = false, blankLabel = '—') {
        const options = [];
        if (allowBlank) {
            options.push(`<option value="" ${!selected ? 'selected' : ''}>${this._esc(blankLabel)}</option>`);
        }
        (this.workspace?.accounts || []).forEach(account => {
            options.push(`
                <option value="${this._escAttr(account.id)}" ${String(account.id) === String(selected) ? 'selected' : ''}>${this._esc(account.name || account.id || 'Счёт')}</option>
            `);
        });
        return options.join('');
    },

    _accountFilterOptions(selected) {
        const options = ['<option value="">Все счета</option>'];
        const seen = new Set();
        (this.summary?.transactions?.rows || []).forEach(account => {
            const key = String(account?.accountId || '');
            if (!key || seen.has(key)) return;
            if (!this.ui?.operations?.show_hidden_accounts && !this._isOperationAccountVisible(account)) return;
            seen.add(key);
            options.push(`<option value="${this._escAttr(key)}" ${String(key) === String(selected) ? 'selected' : ''}>${this._esc(account.accountLabel || key)}</option>`);
        });
        return options.join('');
    },

    _categoryFilterOptions(selected) {
        const options = ['<option value="">Все статьи</option>'];
        (this.workspace?.categories || []).forEach(category => {
            options.push(`<option value="${this._escAttr(category.id)}" ${String(category.id) === String(selected) ? 'selected' : ''}>${this._esc(category.name)}</option>`);
        });
        return options.join('');
    },

    _directionFilterOptions(selected) {
        const options = ['<option value="">Все направления</option>'];
        (this.workspace?.projects || []).forEach(project => {
            options.push(`<option value="${this._escAttr(project.id)}" ${String(project.id) === String(selected) ? 'selected' : ''}>${this._esc(project.name)}</option>`);
        });
        return options.join('');
    },

    _periodPresetItems() {
        return [
            { value: 'today', label: 'Сегодня', shortLabel: 'Сегодня' },
            { value: 'yesterday', label: 'Вчера', shortLabel: 'Вчера' },
            { value: 'last7', label: 'Последние 7 дней', shortLabel: '7 дней' },
            { value: 'week', label: 'Эта неделя', shortLabel: 'Неделя' },
            { value: 'month', label: 'Этот месяц', shortLabel: 'Месяц' },
            { value: 'quarter', label: 'Этот квартал', shortLabel: 'Квартал' },
            { value: 'year', label: 'Этот год', shortLabel: 'Год' },
            { value: 'all', label: 'Вся история', shortLabel: 'Все время' },
            { value: 'custom', label: 'Свой период', shortLabel: 'Свой период' },
        ];
    },

    _periodFilterOptions(selected) {
        const items = this._periodPresetItems();
        return items.map(item => `
            <option value="${this._escAttr(item.value)}" ${String(item.value) === String(selected || 'all') ? 'selected' : ''}>${this._esc(item.label)}</option>
        `).join('');
    },

    _reportMonthOptions(selected) {
        return (this.summary?.reports?.availableMonths || []).map(item => `
            <option value="${this._escAttr(item.value)}" ${String(item.value) === String(selected || '') ? 'selected' : ''}>${this._esc(item.label)}</option>
        `).join('');
    },

    _orderDatalistOptions() {
        return (this.data?.orders || [])
            .filter(item => item && !['deleted', 'cancelled'].includes(String(item.status || '')))
            .sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')))
            .slice(0, 300)
            .map(order => {
                const name = String(order.order_name || order.name || `Заказ ${order.id}`).trim();
                const status = String(order.status || '').trim();
                const label = status ? `${name} · ${status}` : name;
                return `<option value="${this._escAttr(name)}" label="${this._escAttr(label)}"></option>`;
            })
            .join('');
    },

    _statusChip(status, kind) {
        const tone = status === 'active' ? 'ok' : (status === 'planned' ? 'warn' : 'muted');
        const labels = kind === 'source' ? this.SOURCE_STATUS_LABELS : this.ACCOUNT_STATUS_LABELS;
        return `<span class="finance-chip finance-chip--${tone}">${this._esc(labels[status] || status || '—')}</span>`;
    },

    _coverageItem(label, range, note) {
        return `
            <div class="finance-coverage-item">
                <div class="finance-coverage-label">${this._esc(label)}</div>
                <div class="finance-coverage-range">${this._esc(range || '—')}</div>
                <div class="finance-coverage-note">${this._esc(note || '—')}</div>
            </div>
        `;
    },

    _reportMetricRow(label, value, emphasize = false) {
        const numeric = this._roundMoney(value);
        const displayValue = numeric < 0 ? `−${this.fmtRub(Math.abs(numeric))}` : this.fmtRub(numeric);
        return `
            <tr>
                <td>${emphasize ? `<strong>${this._esc(label)}</strong>` : this._esc(label)}</td>
                <td class="text-right">${emphasize ? `<strong>${this._esc(displayValue)}</strong>` : this._esc(displayValue)}</td>
            </tr>
        `;
    },

    _structureCard(title, text) {
        return `
            <div class="finance-structure-card">
                <div class="finance-structure-title">${this._esc(title)}</div>
                <div class="finance-structure-text">${this._esc(text)}</div>
            </div>
        `;
    },

    _pill(text) {
        return `<span class="finance-pill">${this._esc(text)}</span>`;
    },

    _fixedAssetStatusChip(status) {
        const tone = status === 'amortized' ? 'ok' : (status === 'active' ? 'warn' : 'muted');
        const labels = {
            active: 'Амортизируется',
            amortized: 'Погашен',
            planned: 'Еще не стартовал',
        };
        return `<span class="finance-chip finance-chip--${tone}">${this._esc(labels[status] || status || '—')}</span>`;
    },

    _showLoading(message) {
        const loading = document.getElementById('finance-loading');
        const error = document.getElementById('finance-error');
        const content = document.getElementById('finance-content');
        if (loading) {
            loading.style.display = '';
            loading.textContent = message || 'Загрузка...';
        }
        if (error) error.style.display = 'none';
        if (content) content.style.display = 'none';
    },

    _showError(message) {
        const loading = document.getElementById('finance-loading');
        const error = document.getElementById('finance-error');
        const content = document.getElementById('finance-content');
        if (loading) loading.style.display = 'none';
        if (content) content.style.display = 'none';
        if (error) {
            error.style.display = '';
            error.textContent = message || 'Ошибка';
        }
    },

    _parseBusinessDate(value) {
        const raw = String(value || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
        const year = Number(raw.slice(0, 4));
        if (!Number.isFinite(year) || year < 2020 || year > 2100) return null;
        return raw;
    },

    _parseBusinessMonth(value) {
        const raw = String(value || '').slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(raw)) {
            const date = this._parseBusinessDate(value);
            return date ? date.slice(0, 7) : null;
        }
        const year = Number(raw.slice(0, 4));
        const month = Number(raw.slice(5, 7));
        if (!Number.isFinite(year) || year < 2020 || year > 2100) return null;
        if (!Number.isFinite(month) || month < 1 || month > 12) return null;
        return raw;
    },

    _formatRange(range) {
        if (!Array.isArray(range) || !range[0] || !range[1]) return 'Нет данных';
        return range[0] === range[1] ? range[0] : `${range[0]} → ${range[1]}`;
    },

    _formatMonthRange(range) {
        if (!Array.isArray(range) || !range[0] || !range[1]) return 'Нет данных';
        return range[0] === range[1] ? range[0] : `${range[0]} → ${range[1]}`;
    },

    _formatPercent(value) {
        return `${Math.round(this._clamp01(value, 0) * 100)}%`;
    },

    _range(values = []) {
        const list = (values || []).filter(Boolean).sort();
        if (list.length === 0) return [null, null];
        return [list[0], list[list.length - 1]];
    },

    _monthRange(values = []) {
        const list = (values || []).filter(Boolean).sort();
        if (list.length === 0) return [null, null];
        return [list[0], list[list.length - 1]];
    },

    _formatBusinessMonth(value) {
        const raw = this._parseBusinessMonth(value);
        if (!raw) return 'текущий месяц';
        const date = new Date(Number(raw.slice(0, 4)), Number(raw.slice(5, 7)) - 1, 1, 12, 0, 0, 0);
        return date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    },

    _topEntries(obj, limit = 10) {
        return Object.entries(obj || {}).sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, limit);
    },

    _extractStageLabel(taskDescription = '') {
        const match = String(taskDescription || '').match(/"stage_label":"([^"]+)"/);
        return match ? match[1] : 'Без стадии';
    },

    _splitList(value) {
        return Array.from(new Set(
            String(value || '')
                .split(/[,;\n]/g)
                .map(item => item.trim())
                .filter(Boolean)
        ));
    },

    _uid(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    },

    _num(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : 0;
    },

    _roundMoney(value) {
        return Math.round(this._num(value) * 100) / 100;
    },

    _clamp01(value, fallback = 0) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        if (num < 0) return 0;
        if (num > 1) return 1;
        return Math.round(num * 100) / 100;
    },

    fmtRub(value) {
        if (typeof formatRub === 'function') return formatRub(Math.round(this._num(value) * 100) / 100);
        const num = Math.round(this._num(value) * 100) / 100;
        return `${num.toLocaleString('ru-RU')} ₽`;
    },

    _formatSignedRub(value) {
        const num = this._roundMoney(value);
        if (num > 0) return `+${this.fmtRub(num)}`;
        if (num < 0) return `−${this.fmtRub(Math.abs(num))}`;
        return this.fmtRub(0);
    },

    _ruPlural(value, one, few, many) {
        const abs = Math.abs(Math.trunc(Number(value) || 0));
        const mod10 = abs % 10;
        const mod100 = abs % 100;
        if (mod10 === 1 && mod100 !== 11) return one;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
        return many;
    },

    _esc(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    },

    _escAttr(value) {
        return this._esc(value).replace(/'/g, '&#39;');
    },

    _escJs(value) {
        return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    },
};

if (typeof window !== 'undefined') {
    window.Finance = Finance;
}

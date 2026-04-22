const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createContext() {
    const context = {
        console,
        Math,
        Date,
        JSON,
        Intl,
        App: {
            settings: {
                company_bank_name: 'ООО "Банк Точка"',
                company_bank_account: '40802810902500136756',
            },
            toast() {},
        },
        formatRub(value) {
            const num = Number(value) || 0;
            return `${num.toLocaleString('ru-RU')} ₽`;
        },
    };
    context.window = context;
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

function smokeDefaultWorkspaceSeedsAccounts(context) {
    const workspace = vm.runInContext('Finance._defaultWorkspace(App.settings)', context);
    assert.equal(workspace.sources.some(item => item.id === 'tochka_api'), true);
    assert.equal(workspace.accounts.some(item => item.id === 'bank_tochka_main'), true);
    const bank = workspace.accounts.find(item => item.id === 'bank_tochka_main');
    assert.match(bank.name, /Точка/);
    assert.match(bank.name, /6756/);
    assert.equal(workspace.categories.some(item => item.id === 'direct_hardware'), true);
    assert.equal(workspace.categories.some(item => item.id === 'investment_fixed_assets'), true);
    assert.equal(workspace.projects.some(item => item.id === 'project_recycle_object'), true);
    assert.equal(Array.isArray(workspace.fixedAssets), true);
    assert.equal(workspace.fixedAssets.length, 0);
    assert.equal(workspace.counterparties.some(item => item.id === 'cp_marketplaces'), true);
    assert.equal(workspace.rules.some(item => item.id === 'rule_marketplaces'), true);
    assert.equal(Array.isArray(workspace.operationTemplates), true);
    assert.equal(workspace.operationTemplates.length, 0);
    assert.equal(workspace.queueConfig.dailySyncEnabled, true);
}

function smokeSummaryIgnoresBrokenDatesAndShowsGaps(context) {
    const summary = vm.runInContext(`Finance._buildSummary({
        workspace: Finance._defaultWorkspace(App.settings),
        orders: [
            { id: 1, order_name: 'Нормальный заказ', status: 'completed', deadline_end: '2026-03-20' },
            { id: 2, order_name: 'Битая дата', status: 'draft', deadline_end: '0202-03-25' }
        ],
        imports: [
            {
                import_date: '2026-04-01T10:00:00.000Z',
                import_data: {
                    fact_revenue: 100000,
                    fact_total: 25000,
                    fact_taxes: 12000,
                    raw_data: {
                        dealId: 501,
                        field_breakdown: {
                            fact_taxes: [{ category: 'Налоги за корп заказы', description: 'Налог' }],
                            fact_other: [{ category: 'Без категории', description: 'Счёт без статьи' }]
                        }
                    }
                }
            }
        ],
        employees: [
            { id: 11, role: 'production', payroll_profile: 'hourly' },
            { id: 12, role: 'office', payroll_profile: 'salary_monthly' }
        ],
        timeEntries: [
            { date: '2026-03-10', employee_name: 'Тая', hours: 4, order_id: 1, task_description: '[meta]{"stage_label":"Выливание пластика"}[/meta]' },
            { date: '2026-03-11', employee_name: 'Леша', hours: 2, task_description: '' }
        ],
        indirectMonths: {
            '2026-03': { rent: 1000 }
        },
        tochkaSnapshot: {
            synced_at: '2026-04-18T12:00:00.000Z',
            accounts: [
                { accountId: '40802810902500136756', displayName: 'ИП Черповицкая Э-завод р/с Точка *6756' }
            ],
            transactions: [
                {
                    accountId: '40802810902500136756',
                    accountLabel: 'ИП Черповицкая Э-завод р/с Точка *6756',
                    sourceKind: 'bank',
                    direction: 'out',
                    amount: 82225.68,
                    currency: 'RUB',
                    date: '2026-04-17',
                    counterpartyName: 'Управление Федерального казначейства',
                    counterpartyInn: '7700000000',
                    description: 'Единый налоговый платеж. страховые. без НДС'
                },
                {
                    accountId: '40802810902500136756',
                    accountLabel: 'ИП Черповицкая Э-завод р/с Точка *6756',
                    sourceKind: 'bank',
                    direction: 'in',
                    amount: 500157.09,
                    currency: 'RUB',
                    date: '2026-04-16',
                    counterpartyName: 'ООО Интернет Решения',
                    counterpartyInn: '7700000001',
                    description: 'Выплата маркетплейса'
                }
            ]
        }
    })`, context);

    assert.deepEqual(JSON.parse(JSON.stringify(summary.coverage.ordersRange)), ['2026-03-20', '2026-03-20']);
    assert.equal(summary.coverage.invalidOrderDates.length, 1);
    assert.equal(summary.imports.total, 1);
    assert.equal(summary.imports.distinctDeals, 1);
    assert.equal(summary.imports.totalRevenue, 100000);
    assert.equal(summary.imports.totalCost, 25000);
    assert.equal(summary.timeEntries.withOrderHours, 4);
    assert.equal(summary.timeEntries.withoutOrderHours, 2);
    assert.equal(summary.indirect.months, 1);
    assert.equal(summary.imports.topCategories[0].name, 'Налоги за корп заказы');
    assert.equal(summary.imports.missingImportantFields.includes('Упаковка'), true);
    assert.equal(summary.projects.active >= 1, true);
    assert.equal(summary.counterparties.total >= 1, true);
    assert.equal(summary.rules.enabled >= 1, true);
    assert.equal(summary.queue.autoApplyThreshold, 0.85);
    assert.equal(summary.tochka.accounts, 1);
    assert.equal(summary.tochka.transactions, 2);
    assert.equal(summary.automation.queuePreview.length, 2);
    assert.equal((summary.automation.reviewCount + summary.automation.autoCount) >= 1, true);
    assert.equal(summary.automation.queuePreview[0].categoryName.length > 0, true);
}

function smokeManualDecisionsAndPayrollRollup(context) {
    const transferTx = {
        accountId: '40802810902500136756',
        accountLabel: 'ИП Черповицкая Э-завод р/с Точка *6756',
        sourceKind: 'bank',
        direction: 'out',
        amount: 150000,
        currency: 'RUB',
        date: '2026-04-18',
        counterpartyName: 'ИП Черповицкая Екатерина',
        counterpartyInn: '7700000002',
        description: 'Перевод между счетами',
    };
    const payrollTx = {
        accountId: '40802810902500136756',
        accountLabel: 'ИП Черповицкая Э-завод р/с Точка *6756',
        sourceKind: 'cash',
        direction: 'out',
        amount: 35000,
        currency: 'RUB',
        date: '2026-04-15',
        counterpartyName: 'Тая',
        counterpartyInn: '',
        description: 'зп Тая аванс',
    };
    const transferTxKey = vm.runInContext(`Finance._transactionKey(${JSON.stringify(transferTx)})`, context);
    vm.runInContext('globalThis.__manualWorkspace = Finance._defaultWorkspace(App.settings)', context);
    vm.runInContext(`__manualWorkspace.transactionDecisions = [{
        tx_key: ${JSON.stringify(transferTxKey)},
        kind: 'transfer',
        category_id: 'finance_transfers',
        transfer_account_id: 'cash_lesha',
        confirmed: true,
        account_id: '40802810902500136756',
        counterparty_name: 'ИП Черповицкая Екатерина',
        description: 'Перевод между счетами'
    }]`, context);

    const summary = vm.runInContext(`Finance._buildSummary({
        workspace: __manualWorkspace,
        orders: [],
        imports: [],
        employees: [
            {
                id: 10,
                name: 'Тая',
                role: 'production',
                payroll_profile: 'salary_semimonth_threshold',
                pay_white_salary: 40000,
                pay_black_salary: 30000,
                pay_base_salary_month: 70000,
                is_active: true
            }
        ],
        timeEntries: [],
        indirectMonths: {},
        tochkaSnapshot: {
            synced_at: '2026-04-18T13:00:00.000Z',
            accounts: [{ accountId: '40802810902500136756', displayName: 'Точка *6756' }],
            transactions: [${JSON.stringify(transferTx)}, ${JSON.stringify(payrollTx)}]
        }
    })`, context);

    assert.equal(summary.transactions.confirmedCount, 1);
    assert.equal(summary.transactions.transferCount, 1);
    assert.equal(summary.transactions.payrollCount >= 1, true);
    assert.equal(summary.payroll.employeeCount, 1);
    assert.equal(summary.payroll.monthlyTotal, 70000);
    assert.equal(summary.payroll.rows.length >= 1, true);
    assert.equal(summary.automation.queuePreview.length, 1);
}

function smokeBatchHelpers(context) {
    vm.runInContext('globalThis.__batchWorkspace = Finance._defaultWorkspace(App.settings)', context);
    vm.runInContext(`
        Finance.workspace = __batchWorkspace;
        globalThis.__batchTransfer = {
            accountId: '40802810902500136756',
            accountLabel: 'Точка *6756',
            sourceKind: 'bank',
            direction: 'out',
            amount: 5000,
            currency: 'RUB',
            date: '2026-04-18',
            counterpartyName: 'Внутренний перевод',
            description: 'Перевод между своими счетами'
        };
        globalThis.__batchDecision = Finance._seedTransactionDecision(Finance._transactionKey(__batchTransfer));
        Finance._applyKindToDecision(__batchDecision, __batchTransfer, 'transfer');
    `, context);
    const transferDecision = JSON.parse(JSON.stringify(vm.runInContext('__batchDecision', context)));
    assert.equal(transferDecision.kind, 'transfer');
    assert.equal(transferDecision.category_id, 'finance_transfers');
    assert.equal(transferDecision.project_id, '');
    assert.equal(transferDecision.project_label, '');

    vm.runInContext(`
        globalThis.__batchPayroll = {
            accountId: 'cash_lesha',
            accountLabel: 'Наличные — Леша',
            sourceKind: 'cash',
            direction: 'out',
            amount: 35000,
            currency: 'RUB',
            date: '2026-04-18',
            counterpartyName: 'Тая',
            description: 'зп Тая'
        };
        Finance.data = {
            ...Finance.data,
            employees: [{ id: 10, name: 'Тая', role: 'production', is_active: true }]
        };
        globalThis.__batchDecisionPayroll = Finance._seedTransactionDecision(Finance._transactionKey(__batchPayroll));
        Finance._applyKindToDecision(__batchDecisionPayroll, __batchPayroll, 'payroll');
    `, context);
    const payrollDecision = JSON.parse(JSON.stringify(vm.runInContext('__batchDecisionPayroll', context)));
    assert.equal(payrollDecision.kind, 'payroll');
    assert.equal(payrollDecision.category_id, 'payroll_production');
    assert.equal(payrollDecision.project_id, 'project_recycle_object');
    assert.equal(payrollDecision.transfer_account_id, '');

    vm.runInContext(`
        globalThis.__batchExpense = {
            accountId: '40802810902500136756',
            accountLabel: 'Точка *6756',
            sourceKind: 'bank',
            direction: 'out',
            amount: 12000,
            currency: 'RUB',
            date: '2026-04-18',
            counterpartyName: 'ООО Тест',
            description: 'Расход на закупку'
        };
        globalThis.__batchDecisionFields = Finance._seedTransactionDecision(Finance._transactionKey(__batchExpense));
        Finance._applyBatchFieldsToDecision(__batchDecisionFields, __batchExpense, {
            categoryId: 'direct_hardware',
            projectId: 'project_recycle_object',
            projectLabel: 'Recycle sprint',
            note: 'Пачка операций'
        });
    `, context);
    const batchFieldsDecision = JSON.parse(JSON.stringify(vm.runInContext('__batchDecisionFields', context)));
    assert.equal(batchFieldsDecision.category_id, 'direct_hardware');
    assert.equal(batchFieldsDecision.kind, 'expense');
    assert.equal(batchFieldsDecision.project_id, 'project_recycle_object');
    assert.equal(batchFieldsDecision.project_label, 'Recycle sprint');
    assert.equal(batchFieldsDecision.note, 'Пачка операций');

    vm.runInContext(`
        globalThis.__batchDecisionClear = Finance._seedTransactionDecision(Finance._transactionKey(__batchPayroll));
        Finance._applyKindToDecision(__batchDecisionClear, __batchPayroll, 'payroll');
        __batchDecisionClear.project_id = 'project_recycle_object';
        __batchDecisionClear.project_label = 'Тестовая сделка';
        __batchDecisionClear.note = 'Тестовая заметка';
        Finance._applyBatchClearToDecision(__batchDecisionClear, __batchPayroll, 'all');
    `, context);
    const batchClearDecision = JSON.parse(JSON.stringify(vm.runInContext('__batchDecisionClear', context)));
    assert.equal(batchClearDecision.category_id, '');
    assert.equal(batchClearDecision.project_id, '');
    assert.equal(batchClearDecision.project_label, '');
    assert.equal(batchClearDecision.note, '');
    assert.equal(batchClearDecision.kind, 'expense');
    assert.equal(batchClearDecision.payroll_employee_id, '');
}

function smokeCustomPeriodHiddenAccountsAndRecurring(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.workspace.accounts = Finance._normalizeAccounts([
            ...Finance.workspace.accounts,
            {
                id: 'fintablo_112021',
                name: '⭐️ карта Деньги в китае Полина Завод',
                type: 'cash',
                owner: 'Полина',
                source_id: 'orders_fintablo',
                status: 'active',
                note: '',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '112021',
            },
            {
                id: 'fintablo_85241',
                name: 'Наличные Никита К.',
                type: 'cash',
                owner: 'Никита',
                source_id: 'orders_fintablo',
                status: 'active',
                note: '',
                show_in_money: false,
                legacy_hide_in_total: true,
                external_ref: '85241',
            }
        ]);
        Finance.workspace.recurringTransactions = Finance._normalizeRecurringTransactions([{
            id: 'rec_vercel',
            active: true,
            name: 'Vercel Pro',
            account_id: 'fintablo_112021',
            kind: 'expense',
            amount: 1800,
            cadence: 'monthly',
            start_date: '2026-04-18',
            day_of_month: 18,
            category_id: 'commercial_site',
            project_id: '',
            counterparty_name: 'Vercel',
            description: 'Vercel Pro',
            note: 'Курс 90 RUB/USD'
        }]);
        Finance.ui.operations = {
            ...Finance.ui.operations,
            queue: 'all',
            search: '',
            account: '',
            category: '',
            direction: '',
            period: 'custom',
            start_date: '2026-04-18',
            end_date: '2026-04-18',
            show_hidden_accounts: false,
        };
        globalThis.__visibleRows = Finance._filterOperationRows([
            { txKey: 'a', accountId: 'fintablo_112021', accountLabel: 'Полина', categoryId: '', projectId: '', date: '2026-04-18', route: 'review' },
            { txKey: 'b', accountId: 'fintablo_85241', accountLabel: 'Никита', categoryId: '', projectId: '', date: '2026-04-18', route: 'review' },
            { txKey: 'c', accountId: 'fintablo_112021', accountLabel: 'Полина', categoryId: '', projectId: '', date: '2026-04-17', route: 'review' }
        ]);
        globalThis.__recurringRows = Finance._recurringTransactionsToBankRows(Finance.workspace);
    `, context);

    const visibleRows = JSON.parse(JSON.stringify(vm.runInContext('__visibleRows', context)));
    const recurringRows = JSON.parse(JSON.stringify(vm.runInContext('__recurringRows', context)));
    assert.equal(visibleRows.length, 1);
    assert.equal(visibleRows[0].accountId, 'fintablo_112021');
    assert.equal(recurringRows.length >= 1, true);
    assert.equal(recurringRows.some(item => item.description === 'Vercel Pro' && item.amount === 1800), true);
}

function smokeRecurringTemplateSuggestions(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.workspace.accounts = Finance._normalizeAccounts([
            ...Finance.workspace.accounts,
            {
                id: 'fintablo_112021',
                name: '⭐️ карта Деньги в китае Полина Завод',
                type: 'cash',
                owner: 'Полина',
                source_id: 'orders_fintablo',
                status: 'active',
                note: '',
                show_in_money: true,
                legacy_hide_in_total: false,
                external_ref: '112021',
            }
        ]);
        Finance.workspace.recurringTransactions = Finance._normalizeRecurringTransactions([{
            id: 'rec_vercel',
            active: true,
            name: 'Vercel Pro',
            account_id: 'fintablo_112021',
            kind: 'expense',
            amount: 1800,
            cadence: 'monthly',
            start_date: '2026-04-18',
            day_of_month: 18,
            category_id: 'commercial_site',
            project_id: 'project_online_store',
            counterparty_name: 'Vercel',
            description: 'Vercel Pro monthly subscription',
            note: 'Курс 90 RUB/USD'
        }]);
        Finance.data = { ...Finance.data, employees: [] };
        globalThis.__recurringSuggestRows = Finance._buildTransactionRows([
            {
                accountId: 'fintablo_112021',
                accountLabel: '⭐️ карта Деньги в китае Полина Завод',
                sourceKind: 'cash',
                direction: 'out',
                amount: 1800,
                currency: 'RUB',
                date: '2026-04-21',
                counterpartyName: 'Vercel',
                counterpartyInn: '',
                description: 'Vercel Pro monthly subscription'
            }
        ], Finance.workspace, Finance._defaultQueueConfig(), []);
    `, context);
    const recurringSuggestRows = JSON.parse(JSON.stringify(vm.runInContext('__recurringSuggestRows', context)));
    assert.equal(recurringSuggestRows.length, 1);
    assert.equal(recurringSuggestRows[0].categoryId, 'commercial_site');
    assert.equal(recurringSuggestRows[0].projectId, 'project_online_store');
    assert.equal(recurringSuggestRows[0].route, 'auto');
    assert.equal(recurringSuggestRows[0].suggestion.autoApply, true);
    assert.match(recurringSuggestRows[0].reasonSummary, /шаблон автосписания "Vercel Pro"/);
}

function smokeLinkedAdjustmentsAndOzonFallback(context) {
    const rows = JSON.parse(JSON.stringify(vm.runInContext(`(() => {
        const workspace = Finance._defaultWorkspace(App.settings);
        return Finance._buildTransactionRows([
            {
                accountId: '40802810902500136756',
                accountLabel: 'Точка *6756',
                sourceKind: 'bank',
                direction: 'in',
                amount: 1458,
                currency: 'RUB',
                date: '2026-04-18',
                counterpartyName: 'Точка Банк',
                description: 'Зачисление денежных средств по договору об обслуживании держателей платежных карт по терминалу TID 20035418 за 17.04.2026. Сумма комиссии 42.'
            },
            {
                accountId: '40802810902500136756',
                accountLabel: 'Точка *6756',
                sourceKind: 'bank',
                direction: 'out',
                amount: 174.96,
                currency: 'RUB',
                date: '2026-04-18',
                counterpartyName: 'Налоговый фонд',
                description: 'Перевод собственных средств в фонд Налоги с операции на сумму 1 458 RUB без НДС'
            },
            {
                accountId: '40802810902500136756',
                accountLabel: 'Точка *6756',
                sourceKind: 'bank',
                direction: 'out',
                amount: 14.58,
                currency: 'RUB',
                date: '2026-04-18',
                counterpartyName: 'Благотворительность',
                description: 'Перевод собственных средств в фонд Благотворительность с операции на сумму 1 458 RUB без НДС'
            },
            {
                accountId: '40802810902500136756',
                accountLabel: 'Точка *6756',
                sourceKind: 'bank',
                direction: 'out',
                amount: 1073,
                currency: 'RUB',
                date: '2026-04-17',
                counterpartyName: 'Ozon',
                description: 'Покупка товара Озон'
            }
        ], workspace, workspace.queueConfig, []);
    })()`, context)));

    const income = rows.find(item => item.direction === 'in');
    const tax = rows.find(item => item.amount === 174.96);
    const charity = rows.find(item => item.amount === 14.58);
    const ozon = rows.find(item => item.amount === 1073);

    assert.equal(income.derivedCharges.length, 1);
    assert.equal(income.linkedItems.length, 2);
    assert.equal(tax.categoryId, 'taxes_orders');
    assert.equal(charity.categoryId, 'other_charity');
    assert.equal(ozon.categoryId, 'direct_materials');
}

function smokeFixedAssetsAmortizationAndBalance(context) {
    const fixedAssets = JSON.parse(JSON.stringify(vm.runInContext(`(() => {
        const workspace = Finance._defaultWorkspace(App.settings);
        workspace.fixedAssets = Finance._normalizeFixedAssets([
            {
                id: 'asset_printer',
                name: '3D принтер',
                asset_type: 'equipment',
                purchase_cost: 120000,
                paid_amount: 90000,
                opiu_start_month: '2026-02',
                useful_life_months: 12,
                project_id: 'project_recycle_object',
                purchased_earlier: false,
                vendor_name: 'ООО Техника',
                note: 'Основной станок'
            },
            {
                id: 'asset_site',
                name: 'Сайт',
                asset_type: 'software',
                purchase_cost: 60000,
                paid_amount: 60000,
                opiu_start_month: '2026-04',
                useful_life_months: 24,
                project_id: 'project_online_store',
                purchased_earlier: true,
                vendor_name: 'Studio',
                note: ''
            }
        ]);
        return Finance._buildSummary({
            workspace,
            orders: [],
            imports: [],
            employees: [],
            timeEntries: [],
            indirectMonths: {},
            tochkaSnapshot: { accounts: [], transactions: [] },
            fintabloSnapshot: { accounts: [], transactions: [] }
        }).fixedAssets;
    })()`, context)));

    assert.equal(fixedAssets.total, 2);
    assert.equal(fixedAssets.active, 2);
    assert.equal(fixedAssets.historicalCost, 180000);
    assert.equal(fixedAssets.payableAmount, 30000);
    assert.equal(fixedAssets.rows.length, 2);
    const printer = fixedAssets.rows.find(item => item.id === 'asset_printer');
    const site = fixedAssets.rows.find(item => item.id === 'asset_site');
    assert.equal(printer.months_elapsed >= 3, true);
    assert.equal(printer.current_month_amortization, 10000);
    assert.equal(printer.payable_amount, 30000);
    assert.equal(site.payable_amount, 0);
    assert.equal(site.project_name, 'Интернет-магазин');
}

function smokeManagementReportsAndPayrollAccrual(context) {
    const reports = JSON.parse(JSON.stringify(vm.runInContext(`(() => {
        const workspace = Finance._defaultWorkspace(App.settings);
        workspace.fixedAssets = Finance._normalizeFixedAssets([{
            id: 'asset_laser',
            name: 'Лазерный станок',
            asset_type: 'equipment',
            purchase_cost: 60000,
            paid_amount: 40000,
            opiu_start_month: '2026-02',
            useful_life_months: 12,
            project_id: 'project_recycle_object',
            purchased_earlier: false,
            vendor_name: 'ООО Станки',
            note: ''
        }]);
        Finance.ui.report = { month: '2026-04' };
        return Finance._buildManagementReports({
            workspace,
            employees: [
                {
                    id: 1,
                    name: 'Тая',
                    role: 'production',
                    payroll_profile: 'hourly',
                    hourly_rate: 1000,
                    pay_weekend_hour_rate: 1500,
                    is_active: true
                },
                {
                    id: 2,
                    name: 'Оля',
                    role: 'office',
                    payroll_profile: 'salary_monthly',
                    pay_base_salary_month: 60000,
                    is_active: true
                }
            ],
            timeEntries: [
                { date: '2026-04-03', employee_name: 'Тая', hours: 5, order_id: 1 },
                { date: '2026-04-04', employee_name: 'Тая', hours: 4, order_id: 1 }
            ],
            orders: [
                { id: 1, order_name: 'Recycle April Batch' }
            ],
            transactionsRows: [
                {
                    date: '2026-04-10',
                    direction: 'in',
                    amount: 150000,
                    kind: 'income',
                    categoryGroup: 'income',
                    projectId: 'project_recycle_object',
                    projectName: 'Recycle Object',
                    projectLabel: 'Recycle April Batch'
                },
                {
                    date: '2026-04-11',
                    direction: 'out',
                    amount: 20000,
                    kind: 'expense',
                    categoryGroup: 'direct',
                    projectId: 'project_recycle_object',
                    projectName: 'Recycle Object',
                    projectLabel: 'Recycle April Batch'
                },
                {
                    date: '2026-04-12',
                    direction: 'out',
                    amount: 5000,
                    kind: 'expense',
                    categoryGroup: 'commercial'
                },
                {
                    date: '2026-04-13',
                    direction: 'out',
                    amount: 8000,
                    kind: 'expense',
                    categoryGroup: 'overhead'
                },
                {
                    date: '2026-04-14',
                    direction: 'out',
                    amount: 12000,
                    kind: 'expense',
                    categoryGroup: 'taxes'
                },
                {
                    date: '2026-04-15',
                    direction: 'out',
                    amount: 7000,
                    kind: 'payroll',
                    payrollEmployeeId: '1',
                    confirmed: true,
                    counterpartyName: 'Тая',
                    accountLabel: 'Наличные Леша',
                    routeLabel: 'confirmed'
                },
                {
                    date: '2026-04-16',
                    direction: 'out',
                    amount: 10000,
                    kind: 'payroll',
                    payrollEmployeeId: '2',
                    confirmed: false,
                    counterpartyName: 'Оля',
                    accountLabel: 'Точка',
                    routeLabel: 'review'
                },
                {
                    date: '2026-04-17',
                    direction: 'out',
                    amount: 3000,
                    kind: 'payroll',
                    confirmed: true,
                    counterpartyName: 'Неизвестно',
                    accountLabel: 'Точка',
                    routeLabel: 'review'
                }
            ],
            tochkaSnapshot: {
                synced_at: '2026-04-18T12:00:00.000Z',
                accounts: [
                    { accountId: '40802810902500136756', displayName: 'Точка *6756', currentBalance: 120000 }
                ],
                transactions: []
            },
            fintabloSnapshot: {
                synced_at: '2026-04-18T12:00:00.000Z',
                accounts: [
                    {
                        id: 'bag_lesha',
                        moneybagId: 'bag_lesha',
                        displayName: 'Наличные Леша',
                        sourceKind: 'cash',
                        type: 'nal',
                        balance: 50000,
                        hideInTotal: false,
                        archived: false,
                        number: '112021'
                    }
                ],
                transactions: []
            }
        });
    })()`, context)));

    assert.equal(reports.month, '2026-04');
    assert.equal(reports.payroll.productionAccrued, 11000);
    assert.equal(reports.payroll.nonProductionAccrued, 60000);
    assert.equal(reports.payroll.totalAccrued, 71000);
    assert.equal(reports.payroll.paidConfirmed, 7000);
    assert.equal(reports.payroll.paidMarked, 17000);
    assert.equal(reports.payroll.payableAmount, 64000);
    assert.equal(reports.payroll.unassignedPaymentsCount, 1);
    assert.equal(reports.payroll.allocatedProductionAccrued, 11000);
    assert.equal(reports.payroll.unassignedProductionAccrued, 0);
    assert.equal(reports.opiu.revenue, 150000);
    assert.equal(reports.opiu.direct, 20000);
    assert.equal(reports.opiu.amortization, 5000);
    assert.equal(reports.opiu.operatingProfit, 29000);
    const profitabilityRow = reports.profitability.rows.find(item => String(item.label || '').includes('Recycle April Batch'));
    assert.ok(profitabilityRow);
    assert.equal(profitabilityRow.payroll, 11000);
    assert.equal(profitabilityRow.margin, 119000);
    const sharedPayrollRow = reports.profitability.rows.find(item => String(item.label || '') === 'Общий фикс ФОТ');
    assert.ok(sharedPayrollRow);
    assert.equal(sharedPayrollRow.payroll, 60000);
    assert.equal(sharedPayrollRow.margin, -60000);
    assert.equal(reports.profitability.allocatedPayroll, 11000);
    assert.equal(reports.profitability.sharedPayroll, 60000);
    assert.equal(reports.profitability.unassignedPayroll, 0);
    assert.equal(reports.profitability.totalMargin, 59000);
    assert.equal(reports.obligations.payrollPayable, 64000);
    assert.equal(reports.obligations.fixedAssetPayable, 20000);
    assert.equal(reports.balance.bankMoney, 120000);
    assert.equal(reports.balance.nonBankMoney, 50000);
    assert.equal(reports.balance.fixedAssetsResidual, 45000);
    assert.equal(reports.balance.liabilities, 84000);
    assert.equal(reports.balance.assetsTotal, 215000);
    assert.equal(reports.balance.equity, 131000);
}

function smokeOperationNeighborNavigation(context) {
    const nextKey = vm.runInContext(`Finance._pickNeighborOperationKey(
        ['tx_1', 'tx_2', 'tx_3'],
        'tx_2',
        1
    )`, context);
    const prevFallback = vm.runInContext(`Finance._pickNeighborOperationKey(
        ['tx_1', 'tx_2', 'tx_3'],
        'tx_3',
        1
    )`, context);
    const firstFallback = vm.runInContext(`Finance._pickNeighborOperationKey(
        ['tx_1', 'tx_2', 'tx_3'],
        '',
        1
    )`, context);

    assert.equal(nextKey, 'tx_3');
    assert.equal(prevFallback, 'tx_2');
    assert.equal(firstFallback, 'tx_1');
}

function smokeOperationInspectorReviewFlowMarkup(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.data = { ...Finance.data, employees: [] };
        globalThis.__inspectorHtml = Finance._renderOperationInspector({
            txKey: 'tx_2',
            txBaseAmount: 1800,
            amount: 1800,
            kind: 'expense',
            direction: 'out',
            statusTone: 'warn',
            routeLabel: 'Нужен разбор',
            date: '2026-04-19',
            accountId: 'cash_polina_card',
            accountLabel: 'Карта Полины',
            counterpartyName: 'Vercel',
            description: 'Vercel Pro',
            descriptionShort: 'Vercel Pro',
            amountLabel: '−1 800 ₽',
            reasonSummary: 'автосписание',
            projectName: 'Recycle Object',
            projectLabel: '',
            projectId: 'project_recycle_object',
            categoryId: 'commercial_site',
            transferAccountId: '',
            counterpartyId: '',
            payrollEmployeeId: '',
            decision: { note: '' },
            confirmed: false,
            manualId: 'manual_tx_2',
            derivedCharges: [],
            linkedItems: []
        }, {
            isSelected: false,
            index: 1,
            total: 5
        });
    `, context);
    const inspectorHtml = vm.runInContext('__inspectorHtml', context);
    assert.match(inspectorHtml, /finance-op-panel__nav-copy/);
    assert.match(inspectorHtml, /2 из 5 на экране/);
    assert.match(inspectorHtml, /Сохранить и дальше/);
    assert.match(inspectorHtml, /Применить подсказку/);
    assert.match(inspectorHtml, /Подсказку \+ дальше/);
    assert.match(inspectorHtml, /Готовые сценарии/);
    assert.match(inspectorHtml, /Сайт \/ digital/);
    assert.match(inspectorHtml, /Сохранить как шаблон/);
    assert.match(inspectorHtml, /Ручная операция/);
    assert.match(inspectorHtml, /Сохранить ручную/);
}

function smokeOperationListMarkup(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        globalThis.__listHtml = Finance._renderOperationListItem({
            txKey: 'tx_list',
            amount: 5400,
            kind: 'expense',
            direction: 'out',
            statusTone: 'warn',
            routeLabel: 'Нужен разбор',
            date: '2026-04-20',
            accountId: 'cash_polina_card',
            accountLabel: 'Деньги в Китае · Полина',
            counterpartyName: '1688.com',
            descriptionShort: 'Оплата закупки в Китае',
            amountLabel: '−5 400 ₽',
            categoryName: '',
            projectName: '',
            projectLabel: '',
            derivedCharges: [],
            linkedItems: []
        }, new Set(), '');
    `, context);
    const listHtml = vm.runInContext('__listHtml', context);
    assert.match(listHtml, /finance-op-item__facts/);
    assert.match(listHtml, /Что осталось/);
    assert.match(listHtml, /Нужно: статья \+ направление/);

    vm.runInContext(`
        globalThis.__dayGroup = Finance._groupOperationsByDay([
            {
                txKey: 'tx_out',
                amount: 5400,
                kind: 'expense',
                direction: 'out',
                statusTone: 'warn',
                routeLabel: 'Нужен разбор',
                date: '2026-04-20',
                accountId: 'cash_polina_card',
                accountLabel: 'Деньги в Китае · Полина',
                counterpartyName: '1688.com',
                descriptionShort: 'Оплата закупки в Китае',
                amountLabel: '−5 400 ₽',
                categoryName: '',
                projectName: '',
                projectLabel: '',
                derivedCharges: [],
                linkedItems: []
            },
            {
                txKey: 'tx_in',
                amount: 1458,
                kind: 'income',
                direction: 'in',
                statusTone: 'ok',
                routeLabel: 'Авторазнос',
                date: '2026-04-20',
                accountId: '40802810902500136756',
                accountLabel: 'Точка *6756',
                counterpartyName: 'ООО Банк Точка',
                descriptionShort: 'Оплата на сайте',
                amountLabel: '+1 458 ₽',
                categoryName: 'Интернет-магазин',
                projectName: 'Интернет-магазин',
                projectLabel: '',
                derivedCharges: [],
                linkedItems: []
            }
        ]);
        globalThis.__dayGroupHtml = Finance._renderOperationDayGroup(__dayGroup[0], new Set(), '');
        globalThis.__dayGroupSelectedHtml = Finance._renderOperationDayGroup(__dayGroup[0], new Set(['tx_out']), '');
    `, context);
    const dayGroupHtml = vm.runInContext('__dayGroupHtml', context);
    const dayGroupSelectedHtml = vm.runInContext('__dayGroupSelectedHtml', context);
    assert.match(dayGroupHtml, /finance-op-day__head/);
    assert.match(dayGroupHtml, /2 операции/);
    assert.match(dayGroupHtml, /Вход/);
    assert.match(dayGroupHtml, /Выход/);
    assert.match(dayGroupHtml, /Итог/);
    assert.match(dayGroupHtml, /Выбрать день/);
    assert.match(dayGroupSelectedHtml, /В пачке 1\/2/);
    assert.match(dayGroupSelectedHtml, /Добрать день \(1\/2\)/);
}

function smokePeriodPresetMarkup(context) {
    vm.runInContext(`
        globalThis.__periodPresetHtml = Finance._renderOperationsPeriodPresets('yesterday');
        globalThis.__periodOptionsHtml = Finance._periodFilterOptions('custom');
    `, context);
    const presetHtml = vm.runInContext('__periodPresetHtml', context);
    const optionsHtml = vm.runInContext('__periodOptionsHtml', context);
    assert.match(presetHtml, /finance-quick-tab--period/);
    assert.match(presetHtml, />Сегодня</);
    assert.match(presetHtml, />Вчера</);
    assert.match(presetHtml, />7 дней</);
    assert.match(presetHtml, /active/);
    assert.match(optionsHtml, /Последние 7 дней/);
    assert.match(optionsHtml, /Свой период/);
}

function smokeOperationsContextFilterChips(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.summary = {
            transactions: {
                rows: [{
                    accountId: '40802810902500136756',
                    accountLabel: 'Точка *6756'
                }],
                reviewCount: 12,
                manualCount: 3
            },
            tochka: {
                range: ['2024-07-11', '2026-04-17']
            }
        };
        globalThis.__contextHtml = Finance._renderOperationsContextBar({
            filters: {
                queue: 'review',
                period: 'yesterday',
                account: '40802810902500136756',
                category: 'income_online_store',
                direction: 'out',
                search: 'supabase',
                show_hidden_accounts: true
            },
            visibleRows: [{}, {}],
            filteredRows: [{}, {}, {}],
            dateWindow: {
                label: 'Вчера'
            }
        });
    `, context);
    const contextHtml = vm.runInContext('__contextHtml', context);
    assert.match(contextHtml, /finance-context-pill--action/);
    assert.match(contextHtml, /Finance\.clearOperationsFilter\('period'\)/);
    assert.match(contextHtml, /Finance\.clearOperationsFilter\('account'\)/);
    assert.match(contextHtml, /Finance\.clearOperationsFilter\('category'\)/);
    assert.match(contextHtml, /Finance\.clearOperationsFilter\('direction'\)/);
    assert.match(contextHtml, /Finance\.clearOperationsFilter\('search'\)/);
    assert.match(contextHtml, /Finance\.clearOperationsFilter\('show_hidden_accounts'\)/);
    assert.match(contextHtml, /Сбросить все фильтры/);
}

function smokeDaySelectionHelpers(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.summary = {
            transactions: {
                rows: [
                    {
                        txKey: 'day_1',
                        date: '2026-04-20',
                        direction: 'out',
                        amount: 100,
                        accountId: 'a1',
                        description: ''
                    },
                    {
                        txKey: 'day_2',
                        date: '2026-04-20',
                        direction: 'in',
                        amount: 50,
                        accountId: 'a1',
                        description: ''
                    },
                    {
                        txKey: 'other_day',
                        date: '2026-04-19',
                        direction: 'out',
                        amount: 25,
                        accountId: 'a1',
                        description: ''
                    }
                ]
            }
        };
        Finance.ui.operations = {
            ...(Finance.ui.operations || {}),
            queue: 'all',
            period: 'all',
            search: '',
            account: '',
            category: '',
            direction: '',
            show_hidden_accounts: true,
            limit: 200,
            selected_keys: []
        };
        Finance.toggleDayOperationSelection('2026-04-20');
        globalThis.__daySelectedOnce = [...Finance.ui.operations.selected_keys];
        Finance.toggleDayOperationSelection('2026-04-20');
        globalThis.__daySelectedTwice = [...Finance.ui.operations.selected_keys];
    `, context);
    const once = JSON.parse(JSON.stringify(vm.runInContext('__daySelectedOnce', context)));
    const twice = JSON.parse(JSON.stringify(vm.runInContext('__daySelectedTwice', context)));
    assert.deepEqual(once.sort(), ['day_1', 'day_2']);
    assert.deepEqual(twice, []);
}

function smokeApplySuggestionToDecision(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.data = { ...Finance.data, employees: [] };
        globalThis.__suggestTx = {
            accountId: '40802810902500136756',
            accountLabel: 'Точка *6756',
            sourceKind: 'bank',
            direction: 'in',
            amount: 1458,
            currency: 'RUB',
            date: '2026-04-18',
            counterpartyName: 'ООО Банк Точка',
            counterpartyInn: '',
            description: 'До зачисления денежных средств по договору обслуживания держателей платежных карт по терминалу'
        };
        globalThis.__suggestRow = Finance._buildTransactionRows([__suggestTx], Finance.workspace, Finance._defaultQueueConfig(), [])[0];
        globalThis.__suggestDecision = Finance._seedTransactionDecision(Finance._transactionKey(__suggestTx));
        Finance._applySuggestionToDecision(__suggestDecision, __suggestRow, __suggestTx);
    `, context);
    const suggestDecision = JSON.parse(JSON.stringify(vm.runInContext('__suggestDecision', context)));
    assert.equal(suggestDecision.kind, 'income');
    assert.equal(suggestDecision.category_id, 'income_online_store');
    assert.equal(suggestDecision.project_id, 'project_online_store');
    assert.equal(suggestDecision.counterparty_id, 'cp_online_acquiring');
}

function smokeOperationPresets(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.data = {
            ...Finance.data,
            employees: [{ id: 10, name: 'Тая', role: 'production', is_active: true }]
        };
        globalThis.__presetTx = {
            accountId: '40802810902500136756',
            accountLabel: 'Точка *6756',
            sourceKind: 'bank',
            direction: 'out',
            amount: 12000,
            currency: 'RUB',
            date: '2026-04-18',
            counterpartyName: 'ООО Тест',
            counterpartyInn: '',
            description: 'Расход на закупку'
        };
        globalThis.__presetSiteDecision = Finance._seedTransactionDecision(Finance._transactionKey(__presetTx));
        Finance._applyPresetToDecision(__presetSiteDecision, __presetTx, Finance._findOperationPreset('site_digital'));
        globalThis.__presetTransferDecision = Finance._seedTransactionDecision(Finance._transactionKey(__presetTx));
        Finance._applyPresetToDecision(__presetTransferDecision, __presetTx, Finance._findOperationPreset('internal_transfer'));

        Finance.summary = {
            transactions: {
                rows: Finance._buildTransactionRows([
                    __presetTx,
                    {
                        accountId: '40802810902500136756',
                        accountLabel: 'Точка *6756',
                        sourceKind: 'bank',
                        direction: 'out',
                        amount: 8450,
                        currency: 'RUB',
                        date: '2026-04-18',
                        counterpartyName: 'ООО Пластик',
                        counterpartyInn: '',
                        description: 'Поставка материалов'
                    }
                ], Finance.workspace, Finance._defaultQueueConfig(), [])
            }
        };
        globalThis.__presetBatchKeys = Finance.summary.transactions.rows.map(item => item.txKey);
        globalThis.__presetBatchResult = Finance._applyPresetToKeys(__presetBatchKeys, Finance._findOperationPreset('materials'), true);
    `, context);
    const presetSiteDecision = JSON.parse(JSON.stringify(vm.runInContext('__presetSiteDecision', context)));
    const presetTransferDecision = JSON.parse(JSON.stringify(vm.runInContext('__presetTransferDecision', context)));
    const presetBatchResult = JSON.parse(JSON.stringify(vm.runInContext('__presetBatchResult', context)));
    const transactionDecisions = JSON.parse(JSON.stringify(vm.runInContext('Finance.workspace.transactionDecisions', context)));

    assert.equal(presetSiteDecision.category_id, 'commercial_site');
    assert.equal(presetSiteDecision.kind, 'expense');
    assert.equal(presetSiteDecision.project_id, '');
    assert.equal(presetSiteDecision.project_label, '');

    assert.equal(presetTransferDecision.kind, 'transfer');
    assert.equal(presetTransferDecision.category_id, 'finance_transfers');
    assert.equal(presetTransferDecision.project_id, '');

    assert.equal(presetBatchResult.appliedKeys.length, 2);
    assert.equal(presetBatchResult.skippedKeys.length, 0);
    transactionDecisions.forEach(item => {
        assert.equal(item.category_id, 'direct_materials');
        assert.equal(item.project_id, 'project_recycle_object');
        assert.equal(item.confirmed, true);
    });
}

function smokeOperationCustomTemplates(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.data = { ...Finance.data, employees: [] };
        globalThis.__customTemplate = Finance._upsertOperationTemplate({
            id: 'custom_materials_template',
            label: 'Мой Китай',
            kind: 'expense',
            category_id: 'direct_materials',
            project_id: 'project_recycle_object',
            note: 'китайская закупка'
        });
        globalThis.__customPreset = Finance._findOperationPreset('custom_materials_template');
        globalThis.__customPresetHtml = Finance._renderOperationQuickPresets('single', 'tx_custom');
        globalThis.__customTx = {
            accountId: 'cash_polina_card',
            accountLabel: 'Деньги в Китае',
            sourceKind: 'cash',
            direction: 'out',
            amount: 5400,
            currency: 'RUB',
            date: '2026-04-20',
            counterpartyName: '1688',
            counterpartyInn: '',
            description: 'Закупка в Китае'
        };
        globalThis.__customDecision = Finance._seedTransactionDecision(Finance._transactionKey(__customTx));
        Finance._applyPresetToDecision(__customDecision, __customTx, __customPreset);
    `, context);
    const customPreset = JSON.parse(JSON.stringify(vm.runInContext('__customPreset', context)));
    const customPresetHtml = vm.runInContext('__customPresetHtml', context);
    const customDecision = JSON.parse(JSON.stringify(vm.runInContext('__customDecision', context)));

    assert.equal(customPreset.label, 'Мой Китай');
    assert.match(customPresetHtml, /Мои шаблоны/);
    assert.match(customPresetHtml, /Мой Китай/);
    assert.equal(customDecision.category_id, 'direct_materials');
    assert.equal(customDecision.project_id, 'project_recycle_object');
    assert.equal(customDecision.note, 'китайская закупка');
}

function smokeUpdateManualTransactionRecord(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.workspace.manualTransactions = Finance._normalizeManualTransactions([{
            id: 'manual_tx_edit',
            date: '2026-04-18',
            account_id: 'bank_tochka_main',
            direction: 'out',
            amount: 1200,
            counterparty_name: 'Старый контрагент',
            description: 'Старое описание'
        }]);
        const __oldTx = Finance._manualTransactionsToBankRows(Finance.workspace)[0];
        globalThis.__oldManualTxKey = Finance._transactionKey(__oldTx);
        Finance.workspace.transactionDecisions = Finance._normalizeTransactionDecisions([{
            tx_key: __oldManualTxKey,
            kind: 'expense',
            category_id: 'commercial_site',
            project_id: 'project_online_store',
            note: 'важная заметка',
            confirmed: true,
            tx_date: '2026-04-18',
            tx_amount: 1200,
            tx_direction: 'out',
            account_id: 'bank_tochka_main',
            account_label: 'ООО "Банк Точка" ••••6756',
            counterparty_name: 'Старый контрагент',
            description: 'Старое описание'
        }]);
        Finance.ui.operations = {
            ...Finance.ui.operations,
            selected_keys: [__oldManualTxKey],
            focus_tx_key: __oldManualTxKey
        };
        globalThis.__manualUpdateResult = Finance._updateManualTransactionRecord(__oldManualTxKey, {
            date: '2026-04-19',
            account_id: 'cash_lesha',
            direction: 'in',
            amount: 1550,
            counterparty_name: 'Новый контрагент',
            description: 'Новое описание'
        });
    `, context);
    const manualUpdateResult = JSON.parse(JSON.stringify(vm.runInContext('__manualUpdateResult', context)));
    const manualTransactions = JSON.parse(JSON.stringify(vm.runInContext('Finance.workspace.manualTransactions', context)));
    const transactionDecisions = JSON.parse(JSON.stringify(vm.runInContext('Finance.workspace.transactionDecisions', context)));
    const uiState = JSON.parse(JSON.stringify(vm.runInContext('Finance.ui.operations', context)));

    assert.notEqual(manualUpdateResult.oldTxKey, manualUpdateResult.newTxKey);
    assert.equal(manualTransactions.length, 1);
    assert.equal(manualTransactions[0].account_id, 'cash_lesha');
    assert.equal(manualTransactions[0].direction, 'in');
    assert.equal(manualTransactions[0].amount, 1550);
    assert.equal(manualTransactions[0].counterparty_name, 'Новый контрагент');
    assert.equal(manualTransactions[0].description, 'Новое описание');
    assert.equal(transactionDecisions.length, 1);
    assert.equal(transactionDecisions[0].tx_key, manualUpdateResult.newTxKey);
    assert.equal(transactionDecisions[0].category_id, 'commercial_site');
    assert.equal(transactionDecisions[0].project_id, 'project_online_store');
    assert.equal(transactionDecisions[0].note, 'важная заметка');
    assert.equal(transactionDecisions[0].account_id, 'cash_lesha');
    assert.equal(uiState.focus_tx_key, manualUpdateResult.newTxKey);
    assert.deepEqual(uiState.selected_keys, [manualUpdateResult.newTxKey]);
}

function smokeBatchApplySuggestions(context) {
    vm.runInContext(`
        Finance.workspace = Finance._defaultWorkspace(App.settings);
        Finance.data = { ...Finance.data, employees: [] };
        Finance.summary = {
            transactions: {
                rows: Finance._buildTransactionRows([
                    {
                        accountId: '40802810902500136756',
                        accountLabel: 'Точка *6756',
                        sourceKind: 'bank',
                        direction: 'in',
                        amount: 1458,
                        currency: 'RUB',
                        date: '2026-04-18',
                        counterpartyName: 'ООО Банк Точка',
                        counterpartyInn: '',
                        description: 'До зачисления денежных средств по договору обслуживания держателей платежных карт по терминалу'
                    },
                    {
                        accountId: '40802810902500136756',
                        accountLabel: 'Точка *6756',
                        sourceKind: 'bank',
                        direction: 'out',
                        amount: 14.58,
                        currency: 'RUB',
                        date: '2026-04-18',
                        counterpartyName: 'Благотворительность',
                        counterpartyInn: '',
                        description: 'Перевод собственных средств в фонд Благотворительность с операции на сумму 1 458 RUB без НДС'
                    },
                    {
                        accountId: 'cash_polina_card',
                        accountLabel: 'Деньги в Китае Полина Завод',
                        sourceKind: 'cash',
                        direction: 'out',
                        amount: 333,
                        currency: 'RUB',
                        date: '2026-04-18',
                        counterpartyName: 'Новый контрагент',
                        counterpartyInn: '',
                        description: 'Совсем непонятный сценарий'
                    }
                ], Finance.workspace, Finance._defaultQueueConfig(), [])
            }
        };
        globalThis.__batchSuggestKeys = Finance.summary.transactions.rows.map(item => item.txKey);
        globalThis.__batchSuggestResult = Finance._applySuggestionsToKeys(__batchSuggestKeys, true);
    `, context);
    const batchSuggestResult = JSON.parse(JSON.stringify(vm.runInContext('__batchSuggestResult', context)));
    const transactionDecisions = JSON.parse(JSON.stringify(vm.runInContext('Finance.workspace.transactionDecisions', context)));
    assert.equal(batchSuggestResult.appliedKeys.length, 2);
    assert.equal(batchSuggestResult.skippedKeys.length, 1);
    const incomeDecision = transactionDecisions.find(item => item.category_id === 'income_online_store');
    const charityDecision = transactionDecisions.find(item => item.category_id === 'other_charity');
    assert.ok(incomeDecision);
    assert.ok(charityDecision);
    assert.equal(incomeDecision.confirmed, true);
    assert.equal(charityDecision.confirmed, true);
}

function run() {
    const context = createContext();
    runScript(context, 'js/finance.js');
    smokeDefaultWorkspaceSeedsAccounts(context);
    smokeSummaryIgnoresBrokenDatesAndShowsGaps(context);
    smokeManualDecisionsAndPayrollRollup(context);
    smokeBatchHelpers(context);
    smokeCustomPeriodHiddenAccountsAndRecurring(context);
    smokeRecurringTemplateSuggestions(context);
    smokeLinkedAdjustmentsAndOzonFallback(context);
    smokeFixedAssetsAmortizationAndBalance(context);
    smokeManagementReportsAndPayrollAccrual(context);
    smokeOperationNeighborNavigation(context);
    smokeOperationInspectorReviewFlowMarkup(context);
    smokeOperationListMarkup(context);
    smokePeriodPresetMarkup(context);
    smokeOperationsContextFilterChips(context);
    smokeDaySelectionHelpers(context);
    smokeApplySuggestionToDecision(context);
    smokeOperationPresets(context);
    smokeOperationCustomTemplates(context);
    smokeUpdateManualTransactionRecord(context);
    smokeBatchApplySuggestions(context);
    console.log('finance-smoke: ok');
}

run();

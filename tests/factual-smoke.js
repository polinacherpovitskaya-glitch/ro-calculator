const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id = '') {
    return {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
    };
}

function createDocument() {
    const elements = new Map();
    return {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, createElement(id));
            return elements.get(id);
        },
        querySelectorAll() {
            return [];
        },
    };
}

function createContext() {
    const document = createDocument();
    const context = {
        console,
        Math,
        Date,
        JSON,
        Intl,
        document,
        __imports: [],
        __warehouseHistory: [],
        __warehouseItems: [],
        round2(value) {
            const num = parseFloat(value) || 0;
            return Math.round(num * 100) / 100;
        },
        App: {
            isAdmin() { return false; },
            toast() {},
        },
        setTimeout(fn) { fn(); return 1; },
        clearTimeout() {},
        calculateItemCost(item) {
            return {
                hoursPlastic: Math.round(((Number(item.quantity) || 0) / ((Number(item.pieces_per_hour) || 1))) * 100) / 100,
                hoursCutting: 0,
            };
        },
        calculateHardwareCost(hw, params) {
            const speed = Number(hw.assembly_speed) || 60;
            const waste = Number(params?.wasteFactor) || 1.1;
            return { hoursHardware: Math.round(((Number(hw.qty) || 0) / speed * waste) * 100) / 100 };
        },
        calculatePackagingCost(pkg, params) {
            const speed = Number(pkg.assembly_speed) || 60;
            const waste = Number(params?.wasteFactor) || 1.1;
            return { hoursPackaging: Math.round(((Number(pkg.qty) || 0) / speed * waste) * 100) / 100 };
        },
    };
    context.loadFintabloImports = async () => context.__imports;
    context.loadWarehouseHistory = async () => context.__warehouseHistory;
    context.loadWarehouseItems = async () => context.__warehouseItems;
    context.loadProjectHardwareState = async () => ({ checks: {}, actual_qtys: {} });
    context.window = context;
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

function smokeHiddenSalaryTotals(context) {
    const container = context.document.getElementById('fact-detail-1');
    vm.runInContext(`(() => {
        const plan = {
            salaryProduction: 100,
            hardwareTotal: 50,
            totalCosts: 150,
            revenue: 300,
        };
        const planHours = {};
        const fact = {
            fact_salary_production: 100,
            fact_hardware_total: 50,
            fact_revenue: 300,
        };
        Factual._renderDetail(1, document.getElementById('fact-detail-1'), plan, planHours, fact, { order_name: 'Smoke Order' });
    })()`, context);

    const html = container.innerHTML;
    assert.ok(html.includes('План прибыль'), 'detail should show plan profit summary');
    assert.ok(html.includes('Факт прибыль'), 'detail should show fact profit summary');
    assert.ok(html.includes('Выручка и деньги по сделке'), 'detail should separate revenue from expense table');
    assert.ok(!html.includes('ЗП выливание'), 'salary row should stay hidden for non-admin');
    assert.match(html, /ИТОГО[\s\S]*?>150 ₽<\/td>[\s\S]*?>150 ₽<\/td>/);
    assert.ok(!html.includes('250 ₽'), 'total should not double count hidden salary rows');
}

function smokeRevenueManualOverride(context) {
    vm.runInContext(`(() => {
        Factual._orderCache[5] = {
            planData: { revenue: 500, totalCosts: 200 },
            planHours: {},
            factData: { fact_revenue: 300, _auto_fintablo: { fact_revenue: true } },
            order: { order_name: 'Revenue Order' },
        };
        Factual.onFactInput(5, 'revenue', '450');
    })()`, context);

    assert.equal(vm.runInContext(`Factual._orderCache[5].factData.fact_revenue`, context), 450);
    assert.equal(vm.runInContext(`!!Factual._orderCache[5].factData._manual_overrides.fact_revenue`, context), true);
}

async function smokeResetAutoFactInput(context) {
    await vm.runInContext(`(async () => {
        Factual._employees = [
            {
                id: 2,
                name: 'Женя',
                pay_base_salary_month: 0,
                pay_base_hours_month: 0,
                pay_overtime_hour_rate: 500,
            },
        ];
        Factual._entries = [
            {
                order_id: 9,
                worker_name: 'Женя',
                employee_id: 2,
                hours: 1,
                description: '[meta]{"stage":"assembly","project":"Reset Order"}[/meta]',
            },
        ];
        Factual._orderCache[9] = {
            planData: { revenue: 0, totalCosts: 0, plastic: 0, hardwareTotal: 0, packagingTotal: 0 },
            planHours: { hoursPlastic: 0, hoursTrim: 0, hoursHardware: 1, hoursPackaging: 0 },
            planMeta: {},
            factData: {
                fact_salary_assembly: 1,
                fact_hours_assembly: 0,
                _manual_overrides: { fact_salary_assembly: true },
            },
            order: { id: 9, order_name: 'Reset Order' },
        };
        Factual._renderGlobalStats = async () => {};
        await Factual.resetFactInput(9, 'salary_assembly');
    })()`, context);

    assert.equal(vm.runInContext(`Factual._orderCache[9].factData.fact_salary_assembly`, context), 500);
    assert.equal(vm.runInContext(`Factual._orderCache[9].factData.fact_hours_assembly`, context), 1);
    assert.equal(vm.runInContext(`!!(Factual._orderCache[9].factData._manual_overrides || {}).fact_salary_assembly`, context), false);
}

function smokeSavedPlanTotalWins(context) {
    const container = context.document.getElementById('fact-detail-2');
    vm.runInContext(`(() => {
        const plan = {
            salaryProduction: 100,
            hardwareTotal: 50,
            indirectProduction: 100,
            totalCosts: 150,
            revenue: 300,
        };
        const planHours = {};
        const fact = {
            fact_salary_production: 100,
            fact_hardware_total: 50,
            fact_indirect_production: 100,
            fact_revenue: 300,
        };
        Factual._renderDetail(2, document.getElementById('fact-detail-2'), plan, planHours, fact, { order_name: 'Drift Order' });
    })()`, context);

    const html = container.innerHTML;
    assert.match(html, /ИТОГО[\s\S]*?>150 ₽<\/td>[\s\S]*?>250 ₽<\/td>/);
    assert.ok(html.includes('Пересчитанные статьи дают 250 ₽, но сохраненный план заказа равен 150 ₽.'), 'drift note should explain why total uses saved plan');
}

function smokeBuildPlanUsesSavedSnapshotCostsAndDedupedHardware(context) {
    const result = vm.runInContext(`(() => {
        return Factual._buildPlan(
            {
                total_revenue_plan: 200,
                total_cost_plan: 180,
                production_hours_hardware: 1,
                production_hours_packaging: 0,
            },
            [
                {
                    item_type: 'product',
                    quantity: 10,
                    cost_fot: 2,
                    cost_cutting: 1,
                    cost_indirect: 3,
                    cost_cutting_indirect: 1,
                    cost_plastic: 4,
                    cost_mold_amortization: 0,
                    cost_design: 0,
                    cost_printing: 0,
                    cost_delivery: 0,
                    cost_nfc_tag: 0,
                    hours_plastic: 2,
                    hours_cutting: 1,
                    is_blank_mold: true,
                },
                {
                    item_type: 'hardware',
                    product_name: 'Карабин',
                    quantity: 10,
                    hardware_price_per_unit: 5,
                    hardware_delivery_per_unit: 0,
                    hardware_warehouse_sku: 'CAR-1',
                    hardware_source: 'warehouse',
                },
                {
                    item_type: 'hardware',
                    product_name: 'Карабин',
                    quantity: 10,
                    hardware_price_per_unit: 5,
                    hardware_delivery_per_unit: 0,
                    hardware_warehouse_sku: 'CAR-1',
                    hardware_source: 'warehouse',
                },
            ],
            {
                fotPerHour: 10,
                taxRate: 0.06,
                vatRate: 0.05,
                indirectPerHour: 0,
                wasteFactor: 1.1,
            }
        );
    })()`, context);

    assert.equal(result.planData.salaryProduction, 20, 'plan should reuse saved FOT from item snapshot');
    assert.equal(result.planData.salaryTrim, 10, 'plan should reuse saved cutting cost from item snapshot');
    assert.equal(result.planData.indirectProduction, 40, 'plan should reuse saved indirect costs from item snapshot');
    assert.equal(result.planData.hardwareTotal, 50, 'duplicate hardware rows should be collapsed in plan costs');
    assert.equal(result.planHours.hoursHardware, 1, 'saved order assembly hours should win over duplicated hardware norm noise');
    assert.equal(result.planData.salaryAssembly, 10, 'assembly salary should follow saved order hours');
    assert.equal(result.planData.taxes, 24, 'taxes should be recomputed from current revenue settings');
    assert.equal(result.planData.other, 0, 'no corrective residue should remain for consistent snapshot');
    assert.equal(
        result.planData.totalCosts,
        result.planData.salaryProduction +
            result.planData.salaryTrim +
            result.planData.salaryAssembly +
            result.planData.salaryPackaging +
            result.planData.indirectProduction +
            result.planData.hardwareTotal +
            result.planData.packagingTotal +
            result.planData.designPrinting +
            result.planData.plastic +
            result.planData.molds +
            result.planData.delivery +
            result.planData.taxes +
            result.planData.other,
        'plan rows should add up to current computed total cost'
    );
    assert.equal(result.planData.planEarned, 6, 'plan profit should be recomputed from current plan rows');
}

function smokeBuildPlanRendersSavedSnapshotHints(context) {
    const result = vm.runInContext(`(() => {
        const built = Factual._buildPlan(
            {
                total_revenue_plan: 200,
                total_cost_plan: 180,
                production_hours_hardware: 1.46,
                production_hours_packaging: 0,
            },
            [
                {
                    item_type: 'product',
                    quantity: 10,
                    cost_fot: 2,
                    cost_cutting: 1,
                    cost_indirect: 3,
                    cost_cutting_indirect: 1,
                    cost_plastic: 0,
                    cost_design: 0,
                    cost_printing: 0,
                    cost_delivery: 0,
                    cost_nfc_tag: 0,
                    is_blank_mold: true,
                    hours_plastic: 2,
                    hours_cutting: 1,
                },
                {
                    item_type: 'hardware',
                    product_name: 'Карабин',
                    quantity: 10,
                    hardware_price_per_unit: 5,
                    hardware_delivery_per_unit: 0,
                    hardware_warehouse_sku: 'CAR-1',
                    hardware_source: 'warehouse',
                }
            ],
            {
                fotPerHour: 10,
                taxRate: 0,
                vatRate: 0,
                indirectPerHour: 100,
                wasteFactor: 1.1,
            }
        );
        globalThis.__planForHints = built;
        return built;
    })()`, context);

    assert.equal(result.planHours.hoursPlastic, 2);
    assert.equal(result.planHours.hoursTrim, 1);
    assert.equal(result.planHours.hoursHardware, 1.46);
    assert.equal(result.planData.indirectProduction, 40, 'indirect should come from saved row snapshot, not current hour rate formula');
    assert.equal(result.planMeta.salary_assembly.source, 'saved_order');
    assert.equal(result.planMeta.salary_assembly.derivedHours, 0, 'no phantom derived assembly hours should be injected from hardware rows');
    assert.equal(result.planMeta.salary_assembly.savedHours, 1.46);
    assert.equal(result.planMeta.indirect_production.source, 'saved_items');

    context.App.isAdmin = () => true;
    const container = context.document.getElementById('fact-detail-3');
    vm.runInContext(`(() => {
        Factual._renderDetail(
            3,
            document.getElementById('fact-detail-3'),
            globalThis.__planForHints.planData,
            globalThis.__planForHints.planHours,
            {
                fact_salary_assembly: 20000,
                fact_indirect_production: 7700,
                fact_hours_assembly: 5.4,
                fact_hours_production: 40,
                fact_hours_trim: 20,
                fact_hours_packaging: 11.6,
                fact_revenue: 0,
            },
            { order_name: 'Hints Order' },
            globalThis.__planForHints.planMeta
        );
    })()`, context);

    const html = container.innerHTML;
    assert.ok(html.includes('текущее значение заказа'), 'assembly row should show that plan assembly comes from current order value');
    assert.ok(html.includes('косвенные из текущих строк заказа'), 'indirect row should explain that current order rows are used');
    assert.ok(html.includes('77ч × 100 ₽/ч'), 'indirect row should show actual hours formula for fact');
}

async function smokeWorkshopHardwareFactUsesProjectState(context) {
    context.__imports = [];
    context.__warehouseItems = [
        { id: 501, price_per_unit: 5, category: 'hardware' },
        { id: 502, price_per_unit: 2, category: 'hardware' },
        { id: 503, price_per_unit: 9, category: 'hardware' },
    ];
    context.__warehouseHistory = [
        { order_id: 88, order_name: 'МТС 3 воркшопа', type: 'deduction', item_id: 501, qty_change: -999, unit_price: 5, item_category: 'hardware' },
    ];
    context.loadProjectHardwareState = async () => ({
        checks: { '88:501': true, '88:502': true },
        actual_qtys: { '88:501': 30, '88:502': 0 },
    });

    await vm.runInContext(`(async () => {
        const factData = {};
        await Factual._applyDerivedFacts(
            factData,
            { plastic: 0, hardwareTotal: 0, packagingTotal: 0 },
            { hoursPlastic: 0, hoursTrim: 0, hoursHardware: 0, hoursPackaging: 0 },
            { fotPerHour: 0, indirectPerHour: 0 },
            88,
            'МТС 3 воркшопа',
            { id: 88, order_name: 'МТС 3 воркшопа' },
            [
                { item_type: 'hardware', product_name: 'A', quantity: 20, warehouse_item_id: 501, hardware_source: 'warehouse' },
                { item_type: 'hardware', product_name: 'B', quantity: 10, warehouse_item_id: 502, hardware_source: 'warehouse' },
                { item_type: 'hardware', product_name: 'C', quantity: 50, warehouse_item_id: 503, hardware_source: 'warehouse' }
            ]
        );
        globalThis.__workshopHardwareFact = factData;
    })()`, context);

    const fact = context.__workshopHardwareFact;
    assert.equal(fact.fact_hardware_total, 150, 'workshop hardware fact should follow current checked project hardware quantities');
    assert.equal(fact._source_hints.fact_hardware_total, 'фурнитура проекта');
}

async function smokeTaxesIncludeCharity(context) {
    const planTaxes = vm.runInContext(`(() => {
        const built = Factual._buildPlan(
            {
                total_revenue_plan: 1000,
                total_cost_plan: 0,
                production_hours_hardware: 0,
                production_hours_packaging: 0,
            },
            [],
            {
                fotPerHour: 0,
                taxRate: 0.06,
                vatRate: 0.05,
                charityRate: 0.01,
                indirectPerHour: 0,
                wasteFactor: 1.1,
            }
        );
        return built.planData.taxes;
    })()`, context);
    assert.equal(planTaxes, 120, 'plan taxes should include VAT 5%, tax 6% and charity 1%');

    context.__imports = [
        {
            import_date: '2026-04-01T12:00:00.000Z',
            fact_materials: 0,
            fact_revenue: 1000,
            fact_printing: 0,
            fact_hardware: 0,
            fact_packaging: 0,
            fact_taxes: 110,
            fact_other: 0,
            fact_delivery: 0,
            fact_molds: 0,
        },
    ];

    await vm.runInContext(`(async () => {
        const factData = {};
        await Factual._applyDerivedFacts(
            factData,
            { plastic: 0, hardwareTotal: 0, packagingTotal: 0 },
            { hoursPlastic: 0, hoursTrim: 0, hoursHardware: 0, hoursPackaging: 0 },
            { taxRate: 0.06, vatRate: 0.05, charityRate: 0.01, indirectPerHour: 0 },
            101,
            'Charity Order'
        );
        globalThis.__charityFact = factData;
    })()`, context);

    const fact = context.__charityFact;
    assert.equal(fact.fact_revenue, 1000, 'fact revenue should still come from FinTablo import');
    assert.equal(fact.fact_taxes, 120, 'fact taxes should add 1% charity on top of imported 11% taxes');
    assert.equal(fact._source_hints.fact_taxes, 'ФинТабло + 1% благотворительность');
}

async function smokeLegacyStageDistributionAndMaterials(context) {
    context.__imports = [
        {
            import_date: '2026-03-17T15:38:28.277Z',
            fact_materials: 351,
            fact_revenue: 0,
            fact_printing: 0,
            fact_hardware: 0,
            fact_packaging: 0,
            fact_taxes: 0,
            fact_other: 0,
            fact_delivery: 0,
            fact_molds: 0,
        },
    ];

    await vm.runInContext(`(async () => {
        Factual._employees = [
            {
                id: 1,
                name: 'Тая',
                pay_base_salary_month: 70000,
                pay_base_hours_month: 120,
                pay_overtime_hour_rate: 500,
            },
            {
                id: 2,
                name: 'Женя Г',
                pay_base_salary_month: 0,
                pay_base_hours_month: 0,
                pay_overtime_hour_rate: 500,
            },
        ];
        Factual._entries = [
            {
                order_id: 77,
                worker_name: 'Тая',
                employee_id: 1,
                hours: 12,
                description: '[meta]{"stage":"other","project":"Legacy Order"}[/meta] Автоматически перенесено из legacy Google-таблицы',
            },
            {
                order_id: 77,
                worker_name: 'Женя',
                employee_id: 2,
                hours: 6,
                description: '[meta]{"stage":"other","project":"Legacy Order"}[/meta] Автоматически перенесено из legacy Google-таблицы',
            },
            {
                order_id: 77,
                worker_name: 'Женя',
                employee_id: 2,
                hours: 1,
                description: '[meta]{"stage":"assembly","project":"Legacy Order"}[/meta]',
            },
        ];

        const factData = {};
        const planHours = { hoursPlastic: 20, hoursTrim: 5, hoursHardware: 5, hoursPackaging: 0 };
        const planData = { plastic: 3553, hardwareTotal: 0, packagingTotal: 0 };
        const params = { fotPerHour: 550, indirectPerHour: 100 };

        Factual._applyHoursFromEntries(factData, 77, planHours, params, { order_name: 'Legacy Order' });
        await Factual._applyDerivedFacts(factData, planData, planHours, params, 77, 'Legacy Order');
        globalThis.__legacyFact = factData;
    })()`, context);

    const fact = context.__legacyFact;
    assert.equal(fact.fact_hours_production, 12, 'legacy other hours should fill casting by plan ratio');
    assert.equal(fact.fact_hours_trim, 3, 'legacy other hours should fill trim by plan ratio');
    assert.equal(fact.fact_hours_assembly, 4, 'legacy other hours plus explicit assembly should fill assembly');
    assert.equal(fact._legacy_stage_estimate, true, 'legacy distribution marker should be present');
    assert.ok(Math.abs(fact.fact_salary_production - 6666.67) < 0.05, 'casting salary should use employee rates and legacy split');
    assert.ok(Math.abs(fact.fact_salary_trim - 1666.67) < 0.05, 'trim salary should use employee rates and legacy split');
    assert.ok(Math.abs(fact.fact_salary_assembly - 2166.67) < 0.05, 'assembly salary should include explicit hourly entry with employee_id alias match');
    assert.equal(fact.fact_indirect_production, 1900, 'indirect should use full distributed hours total');
    assert.equal(fact.fact_plastic, 3904, 'materials import should augment planned plastic cost instead of replacing it');
    assert.equal(fact._source_hints.fact_plastic, 'план + ФинТабло');
    assert.equal(fact._source_hints.fact_indirect_production, 'часы × косв./ч, legacy по плану');
}

async function smokeWorkshopLegacyLeavesAssemblyExplicit(context) {
    context.__imports = [];

    await vm.runInContext(`(async () => {
        Factual._employees = [
            {
                id: 1,
                name: 'Тая',
                pay_base_salary_month: 70000,
                pay_base_hours_month: 120,
                pay_overtime_hour_rate: 500,
            },
            {
                id: 2,
                name: 'Женя Г',
                pay_base_salary_month: 0,
                pay_base_hours_month: 0,
                pay_overtime_hour_rate: 500,
            },
        ];
        Factual._entries = [
            {
                order_id: 78,
                worker_name: 'Тая',
                employee_id: 1,
                hours: 12,
                description: '[meta]{"stage":"other","project":"МТС 3 воркшопа"}[/meta] Автоматически перенесено из legacy Google-таблицы',
            },
            {
                order_id: 78,
                worker_name: 'Женя',
                employee_id: 2,
                hours: 6,
                description: '[meta]{"stage":"other","project":"МТС 3 воркшопа"}[/meta] Автоматически перенесено из legacy Google-таблицы',
            },
            {
                order_id: 78,
                worker_name: 'Женя',
                employee_id: 2,
                hours: 1,
                description: '[meta]{"stage":"assembly","project":"МТС 3 воркшопа"}[/meta]',
            },
        ];

        const factData = {};
        const planHours = { hoursPlastic: 20, hoursTrim: 5, hoursHardware: 5, hoursPackaging: 0 };
        const planData = { plastic: 0, hardwareTotal: 0, packagingTotal: 0 };
        const params = { fotPerHour: 550, indirectPerHour: 100 };

        Factual._applyHoursFromEntries(factData, 78, planHours, params, { order_name: 'МТС 3 воркшопа' });
        await Factual._applyDerivedFacts(factData, planData, planHours, params, 78, 'МТС 3 воркшопа');
        globalThis.__workshopLegacyFact = factData;
    })()`, context);

    const fact = context.__workshopLegacyFact;
    assert.equal(fact.fact_hours_production, 14.4, 'workshop legacy other hours should fill casting by plastic/trim ratio only');
    assert.equal(fact.fact_hours_trim, 3.6, 'workshop legacy other hours should fill trim by plastic/trim ratio only');
    assert.equal(fact.fact_hours_assembly, 1, 'workshop assembly should only include explicit stage hours');
    assert.ok(Math.abs(fact.fact_salary_production - 8000) < 0.05, 'workshop casting salary should use employee rates and legacy split');
    assert.ok(Math.abs(fact.fact_salary_trim - 2000) < 0.05, 'workshop trim salary should use employee rates and legacy split');
    assert.ok(Math.abs(fact.fact_salary_assembly - 500) < 0.05, 'workshop assembly salary should include only explicit assembly entry');
    assert.equal(fact.fact_indirect_production, 1900, 'workshop indirect should still use total real hours');
    assert.equal(fact._legacy_stage_scope, 'production_only');
    assert.equal(fact._source_hints.fact_indirect_production, 'часы × косв./ч, legacy в выливание/срезание');
}

async function smokeFactualRequestsFinTabloAutoSync(context) {
    context.__autoSyncCalls = [];
    context.loadOrders = async () => [
        { id: 11, order_name: 'Карабины ту-ту', status: 'completed' },
        { id: 12, order_name: 'Тестовый заказ', status: 'sample' },
    ];
    context.loadTimeEntries = async () => [];
    context.loadEmployees = async () => [];
    context.window.FinTablo = {
        autoSyncMatchedImports: async (opts) => {
            context.__autoSyncCalls.push(opts);
            return { synced: 1 };
        },
    };
    const factual = vm.runInContext('Factual', context);
    const originalApplyFilter = factual._applyFilter;
    const originalRenderAll = factual._renderAll;
    factual._applyFilter = () => {};
    factual._renderAll = async () => {};

    await factual.load();

    assert.equal(context.__autoSyncCalls.length, 1, 'plan-fact should request one FinTablo auto-sync');
    const orderIds = JSON.parse(JSON.stringify(context.__autoSyncCalls[0].orderIds)).sort((a, b) => a - b);
    assert.deepEqual(orderIds, [11, 12], 'plan-fact should auto-sync all visible orders');

    factual._applyFilter = originalApplyFilter;
    factual._renderAll = originalRenderAll;
}

function smokePeriodFilterUsesDeadlineAndFactLoad(context) {
    vm.runInContext(`(() => {
        Factual._allOrders = [
            {
                id: 201,
                order_name: 'March Deadline',
                status: 'completed',
                created_at: '2026-01-10T12:00:00.000Z',
                deadline_end: '2026-03-25',
            },
            {
                id: 202,
                order_name: 'April Deadline',
                status: 'completed',
                created_at: '2026-03-05T12:00:00.000Z',
                deadline_end: '2026-04-02',
            },
        ];
        Factual._periodKind = 'month';
        Factual._periodAnchor = '2026-03';
        Factual._applyFilter();

        Factual._entries = [
            { date: '2026-03-01', hours: 5, description: '[meta]{"stage":"casting"}[/meta]' },
            { date: '2026-03-02', hours: 4, description: '[meta]{"stage":"other"}[/meta] Автоматически перенесено из legacy Google-таблицы' },
            { date: '2026-03-03', hours: 7, description: '[meta]{"stage":"other"}[/meta] Неэтапная запись' },
            { date: '2026-04-01', hours: 9, description: '[meta]{"stage":"assembly"}[/meta]' },
        ];

        const period = Factual._getPeriodRange();
        globalThis.__periodLabel = period.label;
        globalThis.__periodFilteredOrderIds = Factual._filteredOrders.map(o => o.id);
        globalThis.__periodFactLoad = Factual._getFactLoadHoursForPeriod(period.from, period.to);
    })()`, context);

    assert.equal(context.__periodLabel, 'март 2026 г.', 'month period should be fixed to the anchor month');
    assert.deepEqual(Array.from(context.__periodFilteredOrderIds), [201], 'orders should be filtered by deadline month, not creation month');
    assert.equal(context.__periodFactLoad, 9, 'fact load should include only in-period production or legacy production hours');
}

async function main() {
    const context = createContext();
    runScript(context, 'js/factual.js');
    smokeHiddenSalaryTotals(context);
    smokeSavedPlanTotalWins(context);
    smokeRevenueManualOverride(context);
    await smokeResetAutoFactInput(context);
    smokeBuildPlanUsesSavedSnapshotCostsAndDedupedHardware(context);
    smokeBuildPlanRendersSavedSnapshotHints(context);
    await smokeTaxesIncludeCharity(context);
    await smokeLegacyStageDistributionAndMaterials(context);
    await smokeWorkshopLegacyLeavesAssemblyExplicit(context);
    await smokeWorkshopHardwareFactUsesProjectState(context);
    await smokeFactualRequestsFinTabloAutoSync(context);
    smokePeriodFilterUsesDeadlineAndFactLoad(context);
    console.log('factual smoke checks passed');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

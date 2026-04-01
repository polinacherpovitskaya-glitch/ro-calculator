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

function smokeBuildPlanUsesTaxFormulaAndSavedAssemblyHours(context) {
    const result = vm.runInContext(`(() => {
        return Factual._buildPlan(
            {
                total_revenue_plan: 1000,
                total_cost_plan: 900,
                production_hours_hardware: 1.46,
                production_hours_packaging: 0,
            },
            [
                {
                    item_type: 'hardware',
                    product_name: 'Миланский шнур',
                    quantity: 2600,
                    hardware_price_per_unit: 1,
                    hardware_delivery_per_unit: 0,
                }
            ],
            {
                fotPerHour: 550,
                taxRate: 0.06,
                vatRate: 0.05,
                indirectPerHour: 0,
                wasteFactor: 1.1,
            }
        );
    })()`, context);

    assert.equal(result.planData.taxes, 110, 'plan taxes should follow calculator formula 5% + 6%');
    assert.equal(result.planHours.hoursHardware, 1.46, 'saved order assembly hours should win over raw default recalc');
    assert.equal(result.planData.salaryAssembly, 803, 'assembly salary should use saved order hours');
}

function smokeBuildPlanUsesHourBasedIndirectAndAssemblyHints(context) {
    const result = vm.runInContext(`(() => {
        const built = Factual._buildPlan(
            {
                total_revenue_plan: 1000,
                total_cost_plan: 0,
                production_hours_hardware: 1.46,
                production_hours_packaging: 0,
            },
            [
                {
                    item_type: 'product',
                    quantity: 10,
                    cost_indirect: 999,
                    cost_cutting_indirect: 0,
                    cost_nfc_indirect: 0,
                    cost_plastic: 0,
                    cost_design: 0,
                    cost_printing: 0,
                    cost_delivery: 0,
                    cost_nfc_tag: 0,
                    is_blank_mold: true,
                    pieces_per_hour: 10,
                    result: { hoursPlastic: 2, hoursCutting: 1 }
                },
                {
                    item_type: 'hardware',
                    product_name: 'Буква',
                    quantity: 2600,
                    hardware_price_per_unit: 1,
                    hardware_delivery_per_unit: 0,
                    hardware_assembly_speed: 300,
                }
            ],
            {
                fotPerHour: 550,
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
    assert.ok(Math.abs(result.planHours.hoursHardware - 10.99) < 0.01, 'blank orders should sum current blank assembly norms and manual saved assembly hours');
    assert.equal(result.planData.indirectProduction, 1399, 'indirect should always be recomputed from full total planned hours');
    assert.equal(result.planMeta.salary_assembly.source, 'blank_norms_plus_manual');
    assert.ok(Math.abs(result.planMeta.salary_assembly.derivedHours - 9.53) < 0.01, 'derived assembly hours should keep current line norm for diagnostics');
    assert.equal(result.planMeta.salary_assembly.savedHours, 1.46);

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
    assert.ok(html.includes('бланки + вручную'), 'assembly row should explain that blank order assembly combines blank norms and manual manager hours');
    assert.ok(html.includes('по текущим бланкам: 9,53ч'), 'assembly row should show current blank norm contribution');
    assert.ok(html.includes('вручную добавлено: 1,46ч'), 'assembly row should show manual manager contribution');
    assert.ok(html.includes('13,99ч × 100 ₽/ч'), 'indirect row should show hours formula for plan');
    assert.ok(html.includes('77ч × 100 ₽/ч'), 'indirect row should show actual hours formula for fact');
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

        Factual._applyHoursFromEntries(factData, 77, planHours, params);
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
    factual._applyFilter = () => {};
    factual._renderAll = async () => {};

    await factual.load();

    assert.equal(context.__autoSyncCalls.length, 1, 'plan-fact should request one FinTablo auto-sync');
    const orderIds = JSON.parse(JSON.stringify(context.__autoSyncCalls[0].orderIds)).sort((a, b) => a - b);
    assert.deepEqual(orderIds, [11, 12], 'plan-fact should auto-sync all visible orders');
}

async function main() {
    const context = createContext();
    runScript(context, 'js/factual.js');
    smokeHiddenSalaryTotals(context);
    smokeSavedPlanTotalWins(context);
    smokeRevenueManualOverride(context);
    await smokeResetAutoFactInput(context);
    smokeBuildPlanUsesTaxFormulaAndSavedAssemblyHours(context);
    smokeBuildPlanUsesHourBasedIndirectAndAssemblyHints(context);
    await smokeLegacyStageDistributionAndMaterials(context);
    await smokeFactualRequestsFinTabloAutoSync(context);
    console.log('factual smoke checks passed');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

// Реальная себестоимость заказа из «Факта» (js/factual.js).
// Берём строки «Факта» без налогов, коммерческого процента, благотворительности и доставки клиенту
// (они относятся к продаже). Где факт пуст (ждём ФинТабло, нет табеля) — плановое значение с пометкой.
// Её используют склад готовой продукции (себестоимость складской штуки) и шапка карточки заказа.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Объекты из vm-контекста имеют чужие прототипы: для deepEqual приводим к обычным.
const plain = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function createContext() {
    const renderingForbidden = () => {
        throw new Error('computeOrderRealCost ничего не рисует: до DOM дело доходить не должно');
    };
    const context = {
        console, Math, Date, JSON, Intl, Number, String, Array, Object, Set, Map,
        // addEventListener: js/warehouse.js subscribes to clicks when it loads
        document: { getElementById: renderingForbidden, querySelectorAll: renderingForbidden, addEventListener() {} },
        App: { params: {}, isAdmin() { return false; }, toast() {}, getCurrentEmployeeName: () => 'Smoke' },
        setTimeout(fn) { fn(); return 1; },
        clearTimeout() {},
        // то, что «Факт» читает из хранилища; сценарии подменяют содержимое
        __order: null,
        __factual: {},
        __imports: [],
        __warehouseItems: [],
        __warehouseHistory: [],
        __timeEntries: [],
        __employees: [],
        __args: [],
        __calls: {},
    };
    const counted = (name, read) => async () => {
        context.__calls[name] = (context.__calls[name] || 0) + 1;
        return read();
    };
    context.loadOrder = counted('loadOrder', () => context.__order);
    context.loadFactual = async () => context.__factual;
    context.loadFintabloImports = async () => context.__imports;
    context.loadWarehouseItems = async () => context.__warehouseItems;
    context.loadWarehouseHistory = async () => context.__warehouseHistory;
    context.loadProjectHardwareState = async () => ({ checks: {}, actual_qtys: {} });
    context.loadTimeEntries = counted('loadTimeEntries', () => context.__timeEntries);
    context.loadEmployees = counted('loadEmployees', () => context.__employees);
    // склад готовой продукции (js/warehouse.js) — три списка в памяти, общая база доступна
    context.__readyGoods = { stock: [], history: [], sales: [] };
    const copy = value => JSON.parse(JSON.stringify(value));
    context.getReadyGoodsSourceStatus = () => ({
        ready_goods: { source: 'shared-settings' },
        ready_goods_history: { source: 'shared-settings' },
        sales_records: { source: 'shared-settings' },
    });
    [['stock', 'ReadyGoods'], ['history', 'ReadyGoodsHistory'], ['sales', 'SalesRecords']].forEach(([list, name]) => {
        context[`load${name}`] = async () => copy(context.__readyGoods[list]);
        context[`save${name}`] = async rows => { context.__readyGoods[list] = copy(rows); };
    });
    context.window = context;
    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const code = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

const REAL_COST_ROW_KEYS = [
    'salary_production', 'salary_trim', 'salary_assembly', 'salary_packaging', 'indirect_production',
    'hardware_total', 'nfc_total', 'packaging_total', 'design_printing', 'plastic', 'molds', 'other',
];
const SALARY_ROW_KEYS = ['salary_production', 'salary_trim', 'salary_assembly', 'salary_packaging'];
// строки «Факта», которые к производству не относятся
const SALES_ROW_KEYS = ['delivery_client', 'taxes', 'commercial', 'charity'];

// ---------------------------------------------------------------------------
// _buildRealCostBreakdown: факт есть — факт; факта нет — план с пометкой
// ---------------------------------------------------------------------------
function smokeBreakdown(run) {
    assert.deepEqual(plain(run('Factual.REAL_COST_ROW_KEYS')), REAL_COST_ROW_KEYS);
    const breakdown = (planData, factData) => {
        run.context.__args = [planData, factData];
        return plain(run('Factual._buildRealCostBreakdown(...__args)'));
    };

    const b = breakdown(
        { salaryProduction: 2000, molds: 0, plastic: 3000, packagingTotal: 1500 },
        { fact_salary_production: 3500, fact_plastic: 0, fact_packaging_total: 1700 });
    assert.deepEqual(b.rows.find(r => r.key === 'salary_production'),
        { key: 'salary_production', label: 'ЗП выливание', plan: 2000, fact: 3500, used: 3500, source: 'fact', isSalary: true });
    assert.deepEqual(b.rows.find(r => r.key === 'plastic'),
        { key: 'plastic', label: 'Пластик / материалы', plan: 3000, fact: 0, used: 3000, source: 'plan', isSalary: false });
    assert.deepEqual(b.rows.find(r => r.key === 'packaging_total'),
        { key: 'packaging_total', label: 'Упаковка', plan: 1500, fact: 1700, used: 1700, source: 'fact', isSalary: false });
    assert.deepEqual(b.rows.find(r => r.key === 'molds'),
        { key: 'molds', label: 'Молды', plan: 0, fact: 0, used: 0, source: 'plan', isSalary: false },
        'ни плана, ни факта: ноль, помечен как плановый');
    assert.equal(b.realTotal, 3500 + 3000 + 1700);
    assert.equal(b.planTotal, 2000 + 3000 + 1500);
    assert.equal(b.salaryReal, 3500);
    assert.equal(b.rows.some(r => r.key === 'taxes'), false);
    assert.deepEqual(Object.keys(b).sort(), ['planTotal', 'realTotal', 'rows', 'salaryReal'], 'форма ответа из плана');

    // строки идут в порядке списка, подписи берутся из таблицы «Факта»
    assert.deepEqual(b.rows.map(r => r.key), REAL_COST_ROW_KEYS);
    const factRowLabels = Object.fromEntries(plain(run('Factual.ROWS.map(row => [row.key, row.label])')));
    b.rows.forEach(row => assert.equal(row.label, factRowLabels[row.key], `подпись строки ${row.key}`));
    assert.deepEqual(b.rows.filter(r => r.isSalary).map(r => r.key), SALARY_ROW_KEYS, 'зарплатные только четыре «ЗП»');

    // налоги, коммерческий, благотворительность и доставка клиенту в себестоимость не входят
    const withSales = breakdown(
        { salaryProduction: 2000, plastic: 3000, delivery: 300, taxes: 700, commercial: 650, charity: 100 },
        { fact_salary_production: 3500, fact_delivery_client: 400, fact_taxes: 800, fact_commercial: 750, fact_charity: 120 });
    SALES_ROW_KEYS.forEach(key => assert.equal(withSales.rows.some(r => r.key === key), false, `${key} не входит в себестоимость`));
    assert.equal(withSales.realTotal, 3500 + 3000);
    assert.equal(withSales.planTotal, 2000 + 3000);

    // зарплата по плану тоже зарплата: salaryReal считает использованное значение, а не только факт
    const salaryFallback = breakdown({ salaryTrim: 400, salaryProduction: 100 }, { fact_salary_production: 3500 });
    assert.equal(salaryFallback.salaryReal, 3500 + 400);
    assert.equal(salaryFallback.rows.find(r => r.key === 'salary_trim').source, 'plan');

    // «Факт» подставляет в пластик и молды плановое значение с пометкой «план»: это не факт
    const mirrored = breakdown(
        { plastic: 80, molds: 30, salaryProduction: 100, hardwareTotal: 500 },
        {
            fact_plastic: 80, fact_molds: 30, fact_salary_production: 100, fact_hardware_total: 500,
            _source_hints: {
                fact_plastic: 'план',
                fact_molds: 'план',
                fact_salary_production: 'часы × ставка, legacy по плану', // зарплата по табелю, план лишь делит часы
                fact_hardware_total: 'ФинТабло',
            },
        });
    assert.equal(mirrored.rows.find(r => r.key === 'plastic').source, 'plan');
    assert.equal(mirrored.rows.find(r => r.key === 'plastic').used, 80);
    assert.equal(mirrored.rows.find(r => r.key === 'molds').source, 'plan');
    assert.equal(mirrored.rows.find(r => r.key === 'salary_production').source, 'fact');
    assert.equal(mirrored.rows.find(r => r.key === 'hardware_total').source, 'fact');
    // вручную внесённое значение пометки «план» не несёт
    const manual = breakdown({ plastic: 80 }, { fact_plastic: 95 });
    assert.deepEqual([manual.rows.find(r => r.key === 'plastic').source, manual.rows.find(r => r.key === 'plastic').used], ['fact', 95]);
    // значение внесли руками, а старая пометка «план» ещё не стёрта (строку не пересчитали): это уже факт
    const editedByHand = breakdown({ plastic: 80 }, {
        fact_plastic: 95, _manual_overrides: { fact_plastic: true }, _source_hints: { fact_plastic: 'план' },
    });
    assert.deepEqual([editedByHand.rows.find(r => r.key === 'plastic').source, editedByHand.rows.find(r => r.key === 'plastic').used], ['fact', 95]);

    // пустые и испорченные данные
    const empty = breakdown(null, undefined);
    assert.equal(empty.rows.length, REAL_COST_ROW_KEYS.length);
    assert.deepEqual([empty.planTotal, empty.realTotal, empty.salaryReal], [0, 0, 0]);
    assert.ok(empty.rows.every(r => r.source === 'plan' && r.used === 0 && r.plan === 0 && r.fact === 0));
    const junk = breakdown(
        { salaryProduction: 'abc', plastic: '3000', molds: NaN },
        { fact_salary_production: 'abc', fact_plastic: -10, fact_molds: undefined, fact_other: '250' });
    assert.equal(junk.rows.find(r => r.key === 'salary_production').used, 0);
    assert.equal(junk.rows.find(r => r.key === 'plastic').used, 3000, 'отрицательный факт — это не факт: берём план');
    assert.equal(junk.rows.find(r => r.key === 'plastic').source, 'plan');
    assert.equal(junk.rows.find(r => r.key === 'other').used, 250, 'числа из строк читаются');
    // деньги округляются до копеек
    const cents = breakdown({ plastic: 0.1, molds: 0.2 }, {});
    assert.equal(cents.planTotal, 0.3);
    assert.equal(cents.realTotal, 0.3);
}

// ---------------------------------------------------------------------------
// computeOrderRealCost: через расчёт «Факта», сам догружает табель и ставки, ничего не рисует
// ---------------------------------------------------------------------------
// Заказ вроде «Лимона»: план 290 ₽ (ЗП 100 + 20, косвенные 60, пластик 80, молды 30), часы план 4.
const lemonLikeOrder = id => ({
    order: { id, order_name: 'Лимон', total_revenue_plan: 177000, production_hours_hardware: 0, production_hours_packaging: 0 },
    items: [{
        item_type: 'product', quantity: 10,
        cost_fot: 10, cost_cutting: 2, cost_indirect: 5, cost_cutting_indirect: 1,
        cost_plastic: 8, cost_mold_amortization: 3, cost_design: 0, cost_printing: 0, cost_delivery: 0, cost_nfc_tag: 0,
        hours_plastic: 2, hours_cutting: 1, hours_assembly: 1, is_blank_mold: true,
    }],
});
const timeEntry = (stage, hours, orderId) => ({
    order_id: orderId, worker_name: 'Женя', employee_id: 1, hours,
    description: `[meta]{"stage":"${stage}","project":"Лимон"}[/meta]`,
});
const finTabloImport = {
    import_date: '2026-10-01T12:00:00.000Z',
    fact_materials: 0, fact_hardware: 700, fact_packaging: 0, fact_delivery: 450, fact_printing: 0,
    fact_molds: 0, fact_taxes: 0, fact_commercial: 0, fact_charity: 0, fact_other: 0, fact_revenue: 5000,
};

async function smokeComputeOrderRealCost(context, run) {
    context.App.params = { fotPerHour: 500, indirectPerHour: 100, taxRate: 0.07, vatRate: 0.05, charityRate: 0.01, wasteFactor: 1.1 };
    const compute = async (...args) => {
        context.__args = args;
        const result = await run('Factual.computeOrderRealCost(...__args)');
        return result === null ? null : plain(result);
    };
    const calls = () => ({ ...context.__calls });
    // «Факт» открыт не был: списки пусты, кэша нет, и страницу рисовать нельзя
    run('Factual._entries = []; Factual._employees = []; Factual._orderCache = null;');

    context.__order = lemonLikeOrder(301);
    context.__employees = [{ id: 1, name: 'Женя', pay_base_salary_month: 0, pay_base_hours_month: 0, pay_overtime_hour_rate: 400 }];
    context.__timeEntries = [
        timeEntry('casting', 3, 301),
        timeEntry('trim', 2, 301),
        timeEntry('assembly', 1, 301),
        timeEntry('casting', 50, 999), // чужой заказ в табеле не считается
    ];
    context.__imports = [finTabloImport];

    // --- первый расчёт: догружает табель и ставки, строит кэш сам
    const first = await compute(301);
    assert.deepEqual(calls(), { loadOrder: 1, loadTimeEntries: 1, loadEmployees: 1 });
    assert.equal(run('Factual._orderCache !== null && typeof Factual._orderCache === "object"'), true, 'кэш заказов создан');
    const byKey = key => first.rows.find(r => r.key === key);
    // зарплата по табелю и ставке сотрудника: 3, 2 и 1 час по 400 ₽
    assert.deepEqual([byKey('salary_production').used, byKey('salary_trim').used, byKey('salary_assembly').used], [1200, 800, 400]);
    assert.ok(SALARY_ROW_KEYS.slice(0, 3).every(key => byKey(key).source === 'fact'));
    assert.deepEqual([byKey('salary_packaging').source, byKey('salary_packaging').used], ['plan', 0], 'упаковщиков в табеле нет — план (он нулевой)');
    // косвенные по фактическим часам: 6 ч × 100 ₽ (план 60)
    assert.deepEqual([byKey('indirect_production').plan, byKey('indirect_production').fact, byKey('indirect_production').used], [60, 600, 600]);
    // фурнитура — из ФинТабло
    assert.deepEqual([byKey('hardware_total').plan, byKey('hardware_total').fact, byKey('hardware_total').source], [0, 700, 'fact']);
    // пластик и молды «Факт» берёт из плана
    assert.deepEqual([byKey('plastic').used, byKey('plastic').source, byKey('molds').used, byKey('molds').source], [80, 'plan', 30, 'plan']);
    assert.equal(first.realTotal, 1200 + 800 + 400 + 600 + 700 + 80 + 30);
    assert.equal(first.planTotal, 100 + 20 + 60 + 80 + 30);
    assert.equal(first.salaryReal, 1200 + 800 + 400);
    // выручка, налоги и доставка клиенту в себестоимость не попадают, хотя «Факт» их считает
    SALES_ROW_KEYS.forEach(key => assert.equal(first.rows.some(r => r.key === key), false));
    assert.equal(run('Factual._orderCache[301].factData.fact_taxes') > 0, true, 'налог в «Факте» есть, в себестоимости его нет');
    assert.equal(run('Factual._orderCache[301].factData.fact_delivery_client'), 450);
    // часы: план из плана заказа, факт — сумма фактических часов по этапам
    assert.deepEqual([first.hoursPlan, first.hoursFact, first.hasTimesheet], [4, 6, true]);
    assert.deepEqual(Object.keys(first).sort(),
        ['hasTimesheet', 'hoursFact', 'hoursPlan', 'indirectPerHour', 'planTotal', 'realTotal', 'rows', 'salaryReal', 'stages'],
        'форма ответа из плана + часы по этапам и косвенные за час');

    // --- повторный расчёт и числовой id строкой: тот же кэш, лишних загрузок нет
    assert.deepEqual(plain(await compute('301')), first);
    assert.deepEqual(plain(await compute(301)), first);
    assert.deepEqual(calls(), { loadOrder: 1, loadTimeEntries: 1, loadEmployees: 1 });
    // результат — копия: правка снаружи кэш не портит
    const factDataBefore = JSON.stringify(run('Factual._orderCache[301].factData'));
    first.rows[0].used = 999999;
    first.realTotal = -1;
    assert.equal((await compute(301)).realTotal, 3810);
    assert.equal(JSON.stringify(run('Factual._orderCache[301].factData')), factDataBefore, 'расчёт кэш не меняет');

    // --- другой заказ: список табеля уже есть, догружать его не нужно
    context.__order = lemonLikeOrder(302);
    context.__imports = [];
    const noTimesheet = await compute(302);
    assert.deepEqual(calls(), { loadOrder: 2, loadTimeEntries: 1, loadEmployees: 1 });
    // табеля по заказу нет: вся зарплата и косвенные плановые, факта из ФинТабло нет — себестоимость плановая
    assert.deepEqual([noTimesheet.hasTimesheet, noTimesheet.hoursFact, noTimesheet.hoursPlan], [false, 0, 4]);
    assert.ok(noTimesheet.rows.every(r => r.source === 'plan'), 'всё плановое');
    assert.equal(noTimesheet.realTotal, noTimesheet.planTotal);
    assert.equal(noTimesheet.realTotal, 290);
    assert.equal(noTimesheet.salaryReal, 120, 'плановая зарплата: 100 + 20');

    // --- списки уже загружены «Фактом» — свои загрузки не нужны; пустой список догружается отдельно
    run('Factual._orderCache = {}');
    context.__order = lemonLikeOrder(301);
    context.__imports = [finTabloImport];
    context.__calls = {};
    assert.equal((await compute(301)).realTotal, 3810);
    assert.deepEqual(calls(), { loadOrder: 1 }, 'табель и ставки не перезагружаются, пока они есть');
    run('Factual._orderCache = {}; Factual._employees = [];');
    context.__calls = {};
    assert.equal((await compute(301)).realTotal, 3810);
    assert.deepEqual(calls(), { loadOrder: 1, loadEmployees: 1 }, 'догружается только то, чего нет');

    // --- свежий расчёт: в табеле появились новые часы, ФинТабло догнал — кэш заказа обходится
    context.__timeEntries = [...context.__timeEntries, timeEntry('casting', 2, 301)];
    context.__imports = [{ ...finTabloImport, fact_hardware: 900 }];
    context.__calls = {};
    assert.equal((await compute(301)).realTotal, 3810, 'без fresh берётся рассчитанное ранее');
    assert.deepEqual(calls(), {}, 'и ничего не загружается');
    const fresh = await compute(301, { fresh: true });
    assert.deepEqual(calls(), { loadOrder: 1, loadTimeEntries: 1, loadEmployees: 1 });
    // +2 ч выливания: ЗП 800 и косвенные 200, фурнитура +200
    assert.equal(fresh.rows.find(r => r.key === 'salary_production').used, 2000);
    assert.equal(fresh.rows.find(r => r.key === 'hardware_total').used, 900);
    assert.equal(fresh.realTotal, 3810 + 800 + 200 + 200);
    assert.deepEqual([fresh.hoursFact, fresh.hasTimesheet], [8, true]);
    // свежий расчёт лёг в кэш: следующий обычный вызов видит новые цифры
    assert.equal((await compute(301)).realTotal, fresh.realTotal);

    // --- заказа нет / id испорчен: null, и ничего не загружается зря
    context.__calls = {};
    context.__order = null;
    assert.equal(await compute(777), null);
    assert.equal(run('Object.prototype.hasOwnProperty.call(Factual._orderCache, 777)'), false, 'пустой результат в кэш не попадает');
    context.__calls = {};
    for (const badId of [undefined, null, '', 'abc', NaN]) {
        assert.equal(await compute(badId), null, `id ${String(badId)}`);
    }
    assert.deepEqual(calls(), {}, 'с испорченным id ничего не загружается');
}

// ---------------------------------------------------------------------------
// Табеля по заказу нет совсем — вся себестоимость плановая (спека), даже когда ФинТабло уже дал
// факт по фурнитуре. Разбивка по статьям показывает, что есть в «Факте»; итог — план. По этому итогу
// считают шапка карточки (себестоимость и реальная маржа) и склад: заморозка при «Готово» и пересчёт.
// ---------------------------------------------------------------------------
async function smokeNoTimesheetCostIsThePlan(context, run) {
    context.App.params = { fotPerHour: 500, indirectPerHour: 100, taxRate: 0.07, vatRate: 0.05, charityRate: 0.01, wasteFactor: 1.1 };
    run('Factual._entries = []; Factual._employees = []; Factual._orderCache = {};');
    context.__employees = [{ id: 1, name: 'Женя', pay_base_salary_month: 0, pay_base_hours_month: 0, pay_overtime_hour_rate: 400 }];
    context.__timeEntries = [timeEntry('casting', 3, 301)]; // табель есть, но у другого заказа
    context.__imports = [finTabloImport]; // фурнитура 700 ₽ — по ФинТабло
    // «Лимон» на 10 штук: 5 «на продажу», 5 в подарок — платных штук 5.
    const order = lemonLikeOrder(303);
    order.order.client_name = 'Художница';
    order.items[0] = { ...order.items[0], item_number: 1, product_name: 'Лимон', sell_price_item: 100, tirage_allocation: { stock: 5, gift: 5, stock_price: 100 } };
    context.__order = order;
    context.__readyGoods = { stock: [], history: [], sales: [] };

    const noSheet = plain(await run('Factual.computeOrderRealCost(303, { fresh: true })'));
    assert.deepEqual([noSheet.hasTimesheet, noSheet.hoursFact], [false, 0]);
    const hardware = noSheet.rows.find(r => r.key === 'hardware_total');
    assert.deepEqual([hardware.plan, hardware.fact, hardware.used, hardware.source], [0, 700, 700, 'fact'], 'по статье — факт из ФинТабло');
    assert.equal(noSheet.planTotal, 290);
    assert.equal(noSheet.realTotal, 290, 'без табеля итог — план, а не план вперемешку с фактом (990)');

    // склад: себестоимость штуки «на продажу» при «Готово» — по плану: 290 ₽ / 5 платных штук
    assert.equal(await run(`Warehouse.moveOrderToReadyGoods(303, 'Лимон')`), 1);
    assert.deepEqual(context.__readyGoods.stock.map(row => [row.qty, row.cost_per_unit]), [[5, 58]]);
    // «Пересчитать себестоимость» без табеля — тот же план, менять нечего
    assert.equal(await run('Warehouse.recalcOrderReadyGoodsCost(303)'), 0);
    assert.equal(context.__readyGoods.stock[0].cost_per_unit, 58);

    // Табель появился — себестоимость реальная, и пересчёт её берёт.
    context.__timeEntries = [...context.__timeEntries, timeEntry('casting', 3, 303)];
    const withSheet = plain(await run('Factual.computeOrderRealCost(303, { fresh: true })'));
    assert.equal(withSheet.hasTimesheet, true);
    const usedTotal = Math.round(withSheet.rows.reduce((sum, row) => sum + row.used, 0) * 100) / 100;
    assert.equal(withSheet.realTotal, usedTotal, 'с табелем итог — сумма статей');
    assert.ok(withSheet.realTotal > withSheet.planTotal, `${withSheet.realTotal} > ${withSheet.planTotal}`);
    assert.equal(await run('Warehouse.recalcOrderReadyGoodsCost(303)'), 1);
    assert.equal(context.__readyGoods.stock[0].cost_per_unit, Math.round(withSheet.realTotal / 5 * 100) / 100);
}

// ---------------------------------------------------------------------------
// Часы по этапам (stages): плановые и фактические часы, зарплата, люди и даты — для карточки заказа.
// Числа те же, что идут в строки «Факта»: stages — это детализация, а не второй расчёт.
// ---------------------------------------------------------------------------
async function smokeStages(context, run) {
    context.App.params = { fotPerHour: 500, indirectPerHour: 100, taxRate: 0.07, vatRate: 0.05, charityRate: 0.01, wasteFactor: 1.1 };
    run('Factual._entries = []; Factual._employees = []; Factual._orderCache = {};');
    context.__employees = [{ id: 1, name: 'Женя', pay_base_salary_month: 0, pay_base_hours_month: 0, pay_overtime_hour_rate: 400 }];
    const dated = (entry, date) => ({ ...entry, date });
    context.__timeEntries = [
        // выливание: Женя 3 + 0.5 ч, Аня 1.5 + 0.7 + 0.1 + 0.2 ч (в двоичной дроби это 2.5000000000000004: округляем)
        dated(timeEntry('casting', 3, 304), '2026-10-05'),
        dated(timeEntry('casting', 0.5, 304), '2026-10-07'),
        dated({ ...timeEntry('casting', 1.5, 304), employee_id: undefined, worker_name: 'Аня' }, '2026-10-07'),
        dated({ ...timeEntry('casting', 0.7, 304), employee_id: undefined, worker_name: 'Аня' }, '2026-10-06'),
        dated({ ...timeEntry('casting', 0.1, 304), employee_id: undefined, worker_name: 'Аня' }, '2026-10-06'),
        dated({ ...timeEntry('casting', 0.2, 304), employee_id: undefined, worker_name: 'Аня' }, '2026-10-06'),
        // сборка: Женя и «Оля», у которой в записи только employee_name (ставка — общая 500 ₽/ч)
        dated(timeEntry('assembly', 1, 304), '2026-10-08'),
        dated({ ...timeEntry('assembly', 2, 304), employee_id: undefined, worker_name: undefined, employee_name: 'Оля' }, '2026-10-03'),
        // срезания нет, упаковки нет; чужой заказ и пустые часы в этапы не попадают
        dated(timeEntry('casting', 50, 999), '2026-01-01'),
        dated(timeEntry('trim', 0, 304), '2026-10-09'),
    ];
    context.__order = lemonLikeOrder(304);
    context.__imports = [];

    const result = plain(await run('Factual.computeOrderRealCost(304, { fresh: true })'));
    assert.deepEqual(result.stages.map(s => s.key), ['casting', 'trim', 'assembly', 'packaging'], 'четыре этапа в порядке производства');
    assert.deepEqual(result.stages.map(s => s.label), ['Выливание', 'Срезание', 'Сборка', 'Упаковка'], 'подписи — из таблицы часов «Факта»');
    const [casting, trim, assembly, packaging] = result.stages;
    assert.deepEqual(Object.keys(casting).sort(), ['factHours', 'firstDate', 'key', 'label', 'lastDate', 'people', 'planHours', 'salary']);

    // плановые часы — те же, что делят legacy-часы: выливание 2, срезание 1, сборка 1, упаковка 0
    assert.deepEqual(result.stages.map(s => s.planHours), [2, 1, 1, 0]);
    // фактические часы и зарплата — как в строках «Факта»: 3 + 0.5 + 1.5 + 0.7 + 0.1 + 0.2 = 6 ч
    assert.deepEqual(result.stages.map(s => s.factHours), [6, 0, 3, 0]);
    assert.equal(casting.salary, 3.5 * 400 + 2.5 * 500, 'Женя по ставке сотрудника, Аня — по общей');
    assert.equal(assembly.salary, 1 * 400 + 2 * 500);
    assert.deepEqual([trim.salary, packaging.salary], [0, 0]);
    const rowUsed = key => result.rows.find(r => r.key === key).used;
    const rowFact = key => result.rows.find(r => r.key === key).fact;
    assert.deepEqual(result.stages.map(s => s.salary),
        [rowFact('salary_production'), rowFact('salary_trim'), rowFact('salary_assembly'), rowFact('salary_packaging')],
        'зарплата по этапам совпадает с фактом строк «ЗП» (где часов нет, в строке стоит план, а в этапе — 0)');
    assert.equal(result.stages.reduce((sum, s) => sum + s.factHours, 0), result.hoursFact, 'сумма этапов — это hoursFact');

    // люди: часы суммируются по имени, по убыванию, округлены до 0.01
    assert.deepEqual(casting.people, [{ name: 'Женя', hours: 3.5 }, { name: 'Аня', hours: 2.5 }]);
    assert.deepEqual(assembly.people, [{ name: 'Оля', hours: 2 }, { name: 'Женя', hours: 1 }], 'имя берётся и из employee_name');
    assert.deepEqual([trim.people, packaging.people], [[], []]);

    // даты: самая ранняя и самая поздняя запись этапа; записей нет — null
    assert.deepEqual([casting.firstDate, casting.lastDate], ['2026-10-05', '2026-10-07']);
    assert.deepEqual([assembly.firstDate, assembly.lastDate], ['2026-10-03', '2026-10-08']);
    assert.deepEqual([trim.firstDate, trim.lastDate, packaging.firstDate, packaging.lastDate], [null, null, null, null]);

    // косвенные за час — тот же параметр, что умножает часы в строке «Косвенные»
    assert.equal(result.indirectPerHour, 100);
    assert.equal(rowUsed('indirect_production'), Math.round(result.hoursFact * result.indirectPerHour * 100) / 100);

    // повторный обычный расчёт (из кэша) отдаёт то же самое
    assert.deepEqual(plain(await run('Factual.computeOrderRealCost(304)')), result);

    // нет табеля — этапы всё равно есть: плановые часы, нулевой факт, без людей и дат
    context.__order = lemonLikeOrder(305);
    const idle = plain(await run('Factual.computeOrderRealCost(305, { fresh: true })'));
    assert.equal(idle.hasTimesheet, false);
    assert.deepEqual(idle.stages.map(s => [s.key, s.planHours, s.factHours, s.salary, s.people, s.firstDate, s.lastDate]), [
        ['casting', 2, 0, 0, [], null, null],
        ['trim', 1, 0, 0, [], null, null],
        ['assembly', 1, 0, 0, [], null, null],
        ['packaging', 0, 0, 0, [], null, null],
    ]);
    assert.equal(idle.indirectPerHour, 100);

    // ставки косвенных нет в параметрах — число всё равно (0), а не undefined
    context.App.params = { fotPerHour: 500 };
    const noRate = plain(await run('Factual.computeOrderRealCost(305, { fresh: true })'));
    assert.equal(noRate.indirectPerHour, 0);
    context.App.params = { fotPerHour: 500, indirectPerHour: 100, taxRate: 0.07, vatRate: 0.05, charityRate: 0.01, wasteFactor: 1.1 };

    // legacy-часы без этапа делятся по плану, и люди с датами делятся вместе с ними
    context.__timeEntries = [
        dated({ ...timeEntry('other', 4, 306), description: 'Импорт из legacy Google-таблицы' }, '2026-03-02'),
        dated(timeEntry('casting', 1, 306), '2026-03-09'),
    ];
    context.__order = lemonLikeOrder(306);
    const legacy = plain(await run('Factual.computeOrderRealCost(306, { fresh: true })'));
    assert.deepEqual(legacy.stages.map(s => s.factHours), [2 + 1, 1, 1, 0], '4 ч legacy по плану 2:1:1 + 1 ч выливания');
    assert.deepEqual(legacy.stages[0].people, [{ name: 'Женя', hours: 3 }]);
    assert.deepEqual([legacy.stages[0].firstDate, legacy.stages[0].lastDate], ['2026-03-02', '2026-03-09']);
    assert.deepEqual([legacy.stages[1].firstDate, legacy.stages[1].lastDate], ['2026-03-02', '2026-03-02']);
    assert.equal(legacy.stages.reduce((sum, s) => sum + s.factHours, 0), legacy.hoursFact);
}

async function main() {
    const context = createContext();
    runScript(context, 'js/calculator.js');
    runScript(context, 'js/factual.js');
    runScript(context, 'js/warehouse.js');
    const run = code => vm.runInContext(code, context);
    run.context = context;
    smokeBreakdown(run);
    await smokeComputeOrderRealCost(context, run);
    await smokeNoTimesheetCostIsThePlan(context, run);
    await smokeStages(context, run);
    console.log('factual-real-cost-smoke: OK');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

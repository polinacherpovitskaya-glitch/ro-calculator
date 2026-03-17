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
    };
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

function main() {
    const context = createContext();
    runScript(context, 'js/factual.js');
    smokeHiddenSalaryTotals(context);
    smokeSavedPlanTotalWins(context);
    smokeRevenueManualOverride(context);
    console.log('factual smoke checks passed');
}

main();

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
    assert.ok(!html.includes('ЗП выливание'), 'salary row should stay hidden for non-admin');
    assert.match(html, /ИТОГО[\s\S]*?>150 ₽<\/td>[\s\S]*?>150 ₽<\/td>/);
    assert.ok(!html.includes('250 ₽'), 'total should not double count hidden salary rows');
}

function main() {
    const context = createContext();
    runScript(context, 'js/factual.js');
    smokeHiddenSalaryTotals(context);
    console.log('factual smoke checks passed');
}

main();

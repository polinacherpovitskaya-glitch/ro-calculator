const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
}

function createContext() {
    return vm.createContext({
        console,
        round2,
        App: { params: { taxRate: 0.07, vatRate: 0.05, charityRate: 0.01, commercialRate: 0.065 } },
    });
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

function main() {
    const context = createContext();
    runScript(context, 'js/calculator.js');

    const retention = vm.runInContext('Number(getNetRevenueRetentionRate(App.params).toFixed(3))', context);
    assert.equal(retention, 0.855, 'B2B keep-rate should be based on 7% tax + 6.5% commercial + 1% charity from the VAT-free base');

    assert.equal(vm.runInContext('calcTaxesAmount(1000, App.params)', context), 70);
    assert.equal(vm.runInContext('calcCommercialAmount(1000, App.params)', context), 65);
    assert.equal(vm.runInContext('calcCharityAmount(1000, App.params)', context), 10);

    const actualMargin = vm.runInContext('calculateActualMargin(635, 257.99, App.params)', context);
    assert.equal(actualMargin.earned, 284.93);
    assert.equal(actualMargin.percent, 44.87);

    const sourceChecks = [
        ['js/app.js', /(0\.065\s*\*\s*\(1\s*\+\s*[^)]+\))|благотворительности\s+с\s+НДС|коммерческ(?:ого|ий)\s+с\s+НДС/gi],
        ['js/pendant.js', /(0\.065\s*\*\s*\(1\s*\+\s*[^)]+\))|charityRate[^;\n]*\*\s*\(1\s*\+\s*[^)]+\)/g],
        ['js/tpa.js', /(0\.065\s*\*\s*\(1\s*\+\s*[^)]+\))|charityRate[^;\n]*\*\s*\(1\s*\+\s*[^)]+\)/g],
    ];

    sourceChecks.forEach(([relativePath, pattern]) => {
        const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
        assert.equal(pattern.test(source), false, `${relativePath} should not contain the stale VAT-in-retention formula`);
    });

    const schema = fs.readFileSync(path.join(__dirname, '..', 'supabase-schema.sql'), 'utf8');
    assert.match(schema, /\('indirect_costs_monthly', 1900000,/);
    assert.match(schema, /\('cutting_speed', 300,/);
    assert.match(schema, /\('tax_rate', 0\.07,/);
    assert.match(schema, /\('charity_rate', 0\.01,/);

    console.log('pricing canon smoke checks passed');
}

main();

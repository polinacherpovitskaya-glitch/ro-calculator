const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'calculator.js'), 'utf8');
const context = vm.createContext({ console, Math, Number, String, Object, Array, JSON, Set });
vm.runInContext(`${source}\nglobalThis.__leftoverAssembly = {
    normalizeProductionPurpose,
    isNonCommercialProductionPurpose,
    calculateLeftoverAssemblyLoad,
    calculateLeftoverAssemblySummary,
    getOrderLiveCalculatorSnapshot,
};`, context, { filename: 'calculator.js' });

const engine = context.__leftoverAssembly;
const params = {
    indirectPerHour: 200,
    packagingHours: 40,
    taxRate: 0.07,
    commercialRate: 0.07,
    charityRate: 0.01,
    vatRate: 0.05,
};
const leftover = { revenue: 10000, quantity: 50, assemblyHours: 3.5, details: 'готовые детали из цеха' };

assert.equal(engine.normalizeProductionPurpose('leftover_assembly'), 'leftover_assembly');
assert.equal(engine.isNonCommercialProductionPurpose('leftover_assembly'), false, 'sale from leftovers remains a commercial order');

const load = engine.calculateLeftoverAssemblyLoad(leftover, params);
assert.deepEqual(JSON.parse(JSON.stringify(load)), {
    hoursPlasticTotal: 0,
    hoursPackagingTotal: 0,
    hoursHardwareTotal: 3.5,
    totalHours: 3.5,
    plasticLoadPercent: 0,
    packagingLoadPercent: 8.75,
    days1worker: 0.44,
    days2workers: 0.22,
    days3workers: 0.15,
}, 'only manual assembly hours go to the assembly capacity');

const summary = engine.calculateLeftoverAssemblySummary(leftover, params);
assert.equal(summary.totalRevenue, 10000);
assert.equal(summary.leftoverAssemblyIndirectCost, 700, 'only the indirect share of manual hours is charged');
assert.equal(summary.totalEarned, 7800, 'sale taxes and indirect hours are included, without materials or direct payroll');
assert.equal(summary.marginPercent, 78);

const snapshot = engine.getOrderLiveCalculatorSnapshot({
    production_purpose: 'leftover_assembly',
    leftover_assembly: leftover,
}, [], params, []);
assert.equal(snapshot.revenue, 10000, 'empty order_items must not erase a leftover-assembly order from the list/card');
assert.equal(snapshot.hours, 3.5);
assert.equal(snapshot.marginPercent, 78);

console.log('leftover-assembly-smoke: OK');

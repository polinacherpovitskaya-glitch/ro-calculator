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
    calculateLeftoverAssemblyFinDirector,
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

// Пластик — из остатков, а фурнитура и упаковка — со склада: их закупка и нормы
// сборки входят в себестоимость и часы.
const liveHardware = [{ qty: 53, price: 40, delivery_price: 2, result: { hoursHardware: 2 } }];
const livePackaging = [{ qty: 53, price: 10, delivery_price: 0, result: { hoursPackaging: 0.5 } }];
const materials = { hardwareItems: liveHardware, packagingItems: livePackaging };

const loadWithHw = engine.calculateLeftoverAssemblyLoad(leftover, params, materials);
assert.equal(loadWithHw.totalHours, 6, 'manual hours plus hardware and packaging norms');
assert.equal(loadWithHw.hoursHardwareTotal, 5.5);
assert.equal(loadWithHw.hoursPackagingTotal, 0.5);
assert.equal(loadWithHw.packagingLoadPercent, 15);

const summaryWithHw = engine.calculateLeftoverAssemblySummary(leftover, params, {}, materials);
assert.equal(summaryWithHw.leftoverAssemblyHardwareCost, 2226, '53 × (40 + 2)');
assert.equal(summaryWithHw.leftoverAssemblyPackagingCost, 530);
assert.equal(summaryWithHw.leftoverAssemblyMaterialsCost, 2756);
assert.equal(summaryWithHw.leftoverAssemblyIndirectCost, 1200, 'indirect share of all 6 hours');
assert.equal(summaryWithHw.leftoverAssemblyHours, 6);
assert.equal(summaryWithHw.leftoverAssemblyManualHours, 3.5);
assert.equal(summaryWithHw.totalEarned, 4544, '10000 × 0.85 − 1200 − 2756');
assert.equal(summaryWithHw.marginPercent, 45.44);

const finWithHw = engine.calculateLeftoverAssemblyFinDirector(leftover, params, {}, materials);
assert.equal(finWithHw.hardwarePurchase, 2120);
assert.equal(finWithHw.hardwareDelivery, 106);
assert.equal(finWithHw.packagingPurchase, 530);
assert.equal(finWithHw.packagingDelivery, 0);
assert.equal(finWithHw.indirect, 1200);
assert.equal(finWithHw.totalCosts, 10000 - 4544);

// Сохранённые строки заказа (список заказов, карточка) дают те же цифры.
const savedRows = [
    { item_type: 'hardware', quantity: 53, hardware_price_per_unit: 40, hardware_delivery_per_unit: 2, hours_hardware: 2, hardware_source: 'warehouse' },
    { item_type: 'packaging', quantity: 53, packaging_price_per_unit: 10, packaging_delivery_per_unit: 0, hours_packaging: 0.5 },
];
const snapshotWithHw = engine.getOrderLiveCalculatorSnapshot({
    production_purpose: 'leftover_assembly',
    leftover_assembly: leftover,
}, savedRows, params, []);
assert.equal(snapshotWithHw.revenue, 10000);
assert.equal(snapshotWithHw.hours, 6);
assert.equal(snapshotWithHw.marginPercent, 45.44);
assert.equal(snapshotWithHw.summary.leftoverAssemblyMaterialsCost, 2756);

console.log('leftover-assembly-smoke: OK');

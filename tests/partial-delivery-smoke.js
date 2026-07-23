const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const calculatorJs = fs.readFileSync(path.join(root, 'js', 'calculator.js'), 'utf8');
const orderDetailJs = fs.readFileSync(path.join(root, 'js', 'order-detail.js'), 'utf8');
const ordersJs = fs.readFileSync(path.join(root, 'js', 'orders.js'), 'utf8');
const ganttJs = fs.readFileSync(path.join(root, 'js', 'gantt.js'), 'utf8');
const supabaseJs = fs.readFileSync(path.join(root, 'js', 'supabase.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function createFixedDate(isoTimestamp) {
    const RealDate = Date;
    class FixedDate extends RealDate {
        constructor(...args) {
            super(...(args.length ? args : [isoTimestamp]));
        }
        static now() {
            return new RealDate(isoTimestamp).getTime();
        }
    }
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    return FixedDate;
}

const context = vm.createContext({
    console,
    Math,
    Intl,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Set,
    Map,
    Date: createFixedDate('2026-03-16T09:00:00'),
});
vm.runInContext(calculatorJs, context, { filename: 'js/calculator.js' });

const quantity = vm.runInContext(`
    getOrderProductionQuantity([
        { item_type: 'product', quantity: 500 },
        { item_type: 'pendant', quantity: 1500 },
        { item_type: 'hardware', quantity: 2000 },
        { item_type: 'packaging', quantity: 2000 }
    ])
`, context);
assert.equal(quantity, 2000, 'Only produced items must contribute to the delivery total');

const valid = JSON.parse(JSON.stringify(vm.runInContext(`
    normalizeDeliverySchedule([
        { date: '2026-03-27', quantity: 1500 },
        { date: '2026-03-20', quantity: 500 }
    ], 2000)
`, context)));
assert.equal(valid.valid, true);
assert.deepEqual(valid.schedule, [
    { date: '2026-03-20', quantity: 500 },
    { date: '2026-03-27', quantity: 1500 },
]);

const invalid = JSON.parse(JSON.stringify(vm.runInContext(`
    normalizeDeliverySchedule([
        { date: '2026-03-20', quantity: 500.5 },
        { date: '2026-03-20', quantity: 1000 }
    ], 2000)
`, context)));
assert.equal(invalid.valid, false);
assert.match(invalid.errors.join(' '), /целым числом/);
assert.match(invalid.errors.join(' '), /уже есть партия/);
assert.match(invalid.errors.join(' '), /Распределено/);

const split = JSON.parse(JSON.stringify(vm.runInContext(`
    splitDeliveryPhaseHours(7, 0, [
        { date: '2026-03-20', quantity: 500 },
        { date: '2026-03-27', quantity: 1500 }
    ], 2000)
`, context)));
assert.equal(split.reduce((sum, part) => sum + part.planned, 0), 7, 'Rounding must preserve total phase hours');

const schedule = JSON.parse(JSON.stringify(vm.runInContext(`
    buildProductionSchedule([{
        id: 42,
        order_name: 'Cooper 2000',
        status: 'production_casting',
        deadline_end: '2026-03-27',
        production_quantity: 2000,
        delivery_schedule: [
            { date: '2026-03-20', quantity: 500 },
            { date: '2026-03-27', quantity: 1500 }
        ],
        production_hours_plastic: 20,
        production_hours_hardware: 0,
        production_hours_packaging: 0
    }], {
        planning_workers_count: 1,
        planning_hours_per_day: 8
    })
`, context)));
assert.equal(schedule.queue[0].deliveryMilestones.length, 2);
assert.equal(schedule.queue[0].deliveryMilestones[0].plannedHours, 5);
assert.equal(schedule.queue[0].deliveryMilestones[1].plannedHours, 15);
assert.equal(schedule.queue[0].deliveryMilestones[0].finishDate, '2026-03-16');
assert.equal(schedule.queue[0].deliveryMilestones[1].finishDate, '2026-03-18');
assert.equal(
    schedule.queue[0].phases.reduce((sum, phase) => sum + phase.total, 0),
    20,
    'Delivery batches must not change total production hours'
);

const withActual = JSON.parse(JSON.stringify(vm.runInContext(`
    buildProductionSchedule([{
        id: 43,
        order_name: 'First batch done',
        status: 'production_casting',
        deadline_end: '2026-03-27',
        production_quantity: 2000,
        delivery_schedule: [
            { date: '2026-03-20', quantity: 500 },
            { date: '2026-03-27', quantity: 1500 }
        ],
        production_hours_plastic: 20,
        actual_hours_molding: 5,
        production_hours_hardware: 0,
        production_hours_packaging: 0
    }], {
        planning_workers_count: 1,
        planning_hours_per_day: 8
    })
`, context)));
assert.equal(withActual.queue[0].deliveryMilestones[0].completed, true, 'Actual hours must close the earliest batch first');
assert.equal(withActual.queue[0].deliveryMilestones[1].remainingHours, 15);

assert.match(orderDetailJs, /График сдачи/);
assert.match(orderDetailJs, /updateOrderCalculatorData/);
assert.match(orderDetailJs, /saveDeliverySchedule/);
assert.match(ordersJs, /Ближайшая сдача/);
assert.match(ganttJs, /getDeliveryMilestoneRisk/);
assert.match(ganttJs, /deliveryMilestones/);
assert.match(supabaseJs, /function updateOrderCalculatorData/);
assert.match(supabaseJs, /\{ \.\.\.existingSnapshot, \.\.\.incomingSnapshot \}/, 'Calculator saves must preserve delivery metadata');
assert.match(indexHtml, /js\/calculator\.js/);

console.log('partial-delivery-smoke: OK');

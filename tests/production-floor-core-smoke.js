const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const calculatorJs = fs.readFileSync(path.join(root, 'js', 'calculator.js'), 'utf8');
const productionCoreJs = fs.readFileSync(path.join(root, 'js', 'production-core.js'), 'utf8');
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'tests', 'fixtures', 'production-floor-fixture.json'), 'utf8'));

// Fixed clock so scheduling / overload dates are deterministic across runs.
function createFixedDate(isoTimestamp) {
    const RealDate = Date;
    class FixedDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) {
                super(isoTimestamp);
            } else {
                super(...args);
            }
        }

        static now() {
            return new RealDate(isoTimestamp).getTime();
        }
    }
    FixedDate.parse = RealDate.parse;
    FixedDate.UTC = RealDate.UTC;
    return FixedDate;
}

// Bare vm context: only the primitives a headless publisher would have.
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
    Date: createFixedDate('2026-03-16T12:00:00Z'),
});
vm.runInContext(calculatorJs, context, { filename: 'js/calculator.js' });
vm.runInContext(productionCoreJs, context, { filename: 'js/production-core.js' });

assert.equal(
    vm.runInContext('typeof buildProductionModel', context),
    'function',
    'production-core must expose buildProductionModel as a global'
);

context.__fixture = fixture;
const model = vm.runInContext('buildProductionModel(__fixture)', context);

// ---- shape assertions ----
assert.ok(Array.isArray(model.queue), 'model.queue must be an array');
assert.ok(Array.isArray(model.blocked), 'model.blocked must be an array');
assert.ok(Array.isArray(model.review), 'model.review must be an array');
assert.ok(Array.isArray(model.days), 'model.days must be an array');
assert.ok(Number.isFinite(model.dailyCapacity), 'model.dailyCapacity must be finite');
assert.ok(model.overload && typeof model.overload === 'object', 'model.overload must be an object');
assert.ok(
    typeof model.overload.firstOverloadDate === 'string'
    && Number.isFinite(model.overload.firstOverloadHours)
    && Number.isFinite(model.overload.overloadDays),
    'model.overload must expose firstOverloadDate / firstOverloadHours / overloadDays'
);

// ---- ready / blocked / review split matches the fixture intent ----
const blockedIds = model.blocked.map(order => Number(order.id));
const reviewIds = model.review.map(order => Number(order.id));
const queueIds = model.queue.map(item => Number(item.orderId));

assert.deepEqual(blockedIds, [202], 'Order 202 (pending China purchase) must be blocked');
assert.deepEqual(reviewIds, [303], 'Order 303 (received China purchase, no in-stock mold) must need review');
assert.ok(!queueIds.includes(202), 'Blocked order must not appear in the schedulable queue');
assert.ok(!queueIds.includes(303), 'Needs-review order must not appear in the schedulable queue');
assert.ok(queueIds.includes(101) && queueIds.includes(404), 'Both ready orders must be scheduled');

// The full enriched order list keeps every schedulable order regardless of ready-state.
assert.equal(model.orders.length, 4, 'model.orders must retain all schedulable orders');

// Actuals pipeline ran: order 404 logged 3h under a casting-stage entry -> molding actuals.
const order404 = model.orders.find(order => Number(order.id) === 404);
assert.equal(order404.actual_hours_molding, 3, 'Actual hours must be attributed to the ready mold-in-stock order');

// ---- characterization values (pinned from a real run; lock behavior) ----
assert.deepEqual(queueIds, [101, 404], 'Queue order is pinned (priority: ready-blank order first)');
assert.equal(model.queue[0].orderId, 101, 'queue[0] must be order 101');
assert.equal(model.dailyCapacity, 16, 'dailyCapacity must be 2 workers x 8h = 16');
assert.equal(model.days.length, 3, 'Scheduled day count is pinned for the fixture');
assert.equal(model.days[0].date, '2026-03-16', 'First scheduled day is pinned to the fixed clock date');
assert.equal(model.overload.firstOverloadDate, '', 'Fixture load stays within capacity (no overload)');
assert.equal(model.overload.overloadDays, 0, 'Fixture load produces zero overload days');

console.log('production floor core smoke checks passed');

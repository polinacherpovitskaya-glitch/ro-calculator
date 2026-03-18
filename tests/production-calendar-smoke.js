const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const calculatorJs = fs.readFileSync(path.join(root, 'js', 'calculator.js'), 'utf8');
const ganttJs = fs.readFileSync(path.join(root, 'js', 'gantt.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');

const sidebarNav = indexHtml.match(/<nav class="sidebar-nav">([\s\S]*?)<\/nav>/);
assert.ok(sidebarNav, 'Sidebar nav not found');
assert.equal((sidebarNav[1].match(/data-page="gantt"/g) || []).length, 1, 'Sidebar must contain exactly one production calendar link');
assert.equal((sidebarNav[1].match(/data-page="production-plan"/g) || []).length, 0, 'Sidebar must not contain legacy production-plan link');
assert.match(indexHtml, /id="gantt-queue"/, 'Gantt page must include queue container');
assert.match(indexHtml, /data-zoom="week"/, 'Week zoom button missing');
assert.match(indexHtml, /data-zoom="month"/, 'Month zoom button missing');
assert.doesNotMatch(indexHtml, /data-zoom="day"/, 'Day zoom must be removed');
assert.match(indexHtml, /set-planning_workers_count/, 'Settings must expose planning worker count');
assert.match(indexHtml, /set-planning_hours_per_day/, 'Settings must expose planning hours per day');
assert.match(ganttJs, /moveUp\(orderId\)/, 'Gantt queue reorder helpers missing');
assert.match(ganttJs, /renderQueue\(queue, blockedQueue = \[\], reviewQueue = \[\]\)/, 'Gantt queue renderer must support blocked and review queue sections');
assert.match(ganttJs, /zoom: 'week'/, 'Default gantt zoom must stay week');
assert.doesNotMatch(ganttJs, /'day' \| 'week'/, 'Legacy day zoom comment should be removed');
assert.match(appJs, /normalizePageAlias\(page\)/, 'Page alias normalizer missing in app');
assert.match(appJs, /production-plan' \|\| page === 'calendar'/, 'Legacy production aliases must redirect to gantt');
assert.match(settingsJs, /Производственный календарь/, 'Settings label must show production calendar');
assert.match(settingsJs, /set-planning-capacity-summary/, 'Settings hints must explain planning capacity');
assert.match(workflow, /node tests\/production-calendar-smoke\.js/, 'CI must run production calendar smoke');
assert.match(ganttJs, /production_holidays/, 'Gantt UI must read configured production holidays');
assert.match(ganttJs, /loadOrderItemsByOrderIds\(/, 'Gantt must inspect order item snapshots to derive readiness');
assert.match(ganttJs, /loadTimeEntries\(\)/, 'Gantt must load time entries for actual-hours overlay');
assert.match(ganttJs, /loadEmployees\(\)/, 'Gantt must load employees for actual-hours overlay');
assert.match(ganttJs, /buildOrderActuals\(/, 'Gantt must aggregate actual order hours');
assert.match(ganttJs, /shiftManualStart\(orderId, direction\)/, 'Gantt must expose quick working-day shifting for manual starts');
assert.match(ganttJs, /reorderOrderSequence\(orderIds = \[\], draggedOrderId, targetOrderId\)/, 'Gantt must expose queue reorder helper');
assert.doesNotMatch(ganttJs, /toISOString\(\)\.slice\(0,\s*10\)/, 'Gantt must not derive calendar dates through timezone-drifting toISOString paths');
assert.match(calculatorJs, /notBeforeDate/, 'Scheduler must respect manual not-before dates');

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
    Date: createFixedDate('2026-03-16T12:00:00Z'),
});
vm.runInContext(calculatorJs, context, { filename: 'js/calculator.js' });

const schedule = vm.runInContext(`
    buildProductionSchedule([
        {
            id: 7,
            order_name: 'Holiday-sensitive order',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 24,
            production_hours_hardware: 0,
            production_hours_packaging: 0,
        }
    ], {
        workers_count: 3.5,
        planning_workers_count: 1,
        planning_hours_per_day: 8,
        production_holidays: '2026-03-17'
    })
`, context);

const scheduledDays = JSON.parse(JSON.stringify(schedule.days.map(day => day.date)));
const allocationDays = JSON.parse(JSON.stringify(schedule.queue[0].schedule.map(segment => segment.date)));

assert.deepEqual(
    scheduledDays,
    ['2026-03-16', '2026-03-18', '2026-03-19'],
    'Scheduler must skip configured production holidays and preserve local calendar dates'
);
assert.deepEqual(
    allocationDays,
    ['2026-03-16', '2026-03-18', '2026-03-19'],
    'Order allocations must not land on holiday dates'
);
assert.equal(
    schedule.dailyCapacity,
    8,
    'Scheduler must use planning worker capacity instead of pricing worker count'
);

const constrainedSchedule = vm.runInContext(`
    buildProductionSchedule([
        {
            id: 8,
            order_name: 'Progress-aware order',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 16,
            production_hours_hardware: 8,
            production_hours_packaging: 0,
            actual_hours_molding: 8,
            actual_hours_assembly: 0,
            actual_hours_packaging: 0,
            actual_hours_other: 4,
            production_not_before: '2026-03-18'
        }
    ], {
        planning_workers_count: 1,
        planning_hours_per_day: 8
    })
`, context);

assert.deepEqual(
    JSON.parse(JSON.stringify(constrainedSchedule.queue[0].schedule.map(segment => segment.date))),
    ['2026-03-18', '2026-03-19'],
    'Scheduler must start no earlier than the manual not-before date and plan only remaining hours'
);
assert.equal(constrainedSchedule.queue[0].plannedTotalHours, 24, 'Queue must keep the full planned total');
assert.equal(constrainedSchedule.queue[0].actualTotalHours, 8, 'Queue progress must use only stage-linked actual hours');
assert.equal(constrainedSchedule.queue[0].actualOtherHours, 4, 'Queue must keep non-stage hours separate for UI hints');
assert.equal(constrainedSchedule.queue[0].remainingTotalHours, 16, 'Queue must schedule only the remaining hours');

const ganttContext = vm.createContext({
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
    Date,
    round2: (value) => Math.round((Number(value) || 0) * 100) / 100,
    App: { settings: {} },
});
vm.runInContext(ganttJs, ganttContext, { filename: 'js/gantt.js' });

const blockedState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 1, order_name: 'Blocked mold order' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: false }]
    )
`, ganttContext)));
assert.equal(blockedState.production_ready_state, 'blocked', 'Custom order without mold in stock must be blocked');
assert.match(blockedState.production_blocked_reason, /Ждет молд/, 'Blocked state should explain mold dependency');

const readyState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 2, order_name: 'Ready custom order' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: true }]
    )
`, ganttContext)));
assert.equal(readyState.production_ready_state, 'ready', 'Custom order with mold in stock must stay ready');

const chinaBlockedState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 3, order_name: 'China blocked order' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: false }],
        [{ order_id: 3, purchase_name: 'Молд Space NFC', status: 'in_transit' }]
    )
`, ganttContext)));
assert.equal(chinaBlockedState.production_ready_state, 'blocked', 'Pending China purchase must keep custom order blocked');
assert.match(chinaBlockedState.production_blocked_reason, /Ждет Китай/, 'Blocked state should explain pending China dependency');

const needsReviewState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 4, order_name: 'Needs review order' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: false }],
        [{ order_id: 4, purchase_name: 'Молд Space NFC', status: 'received' }]
    )
`, ganttContext)));
assert.equal(needsReviewState.production_ready_state, 'needs_review', 'Received China purchase with no in-stock mold flag should surface review state');
assert.match(needsReviewState.production_blocked_reason, /Проверьте молд/, 'Review state should explain data mismatch after China receipt');

const actualMonthSummary = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.buildActualMonthSummary(
        [
            { employee_id: 10, worker_name: 'Тая', date: '2026-03-02', hours: 5 },
            { employee_id: 11, worker_name: 'Леша', date: '2026-03-03', hours: 8 },
            { worker_name: 'Женя Г', date: '2026-03-04', hours: 6 },
            { employee_id: 10, worker_name: 'Тая', date: '2026-02-28', hours: 4 }
        ],
        [
            { id: 10, name: 'Тая', role: 'production' },
            { id: 11, name: 'Леша', role: 'management' },
            { id: 12, name: 'Женя Г', role: 'production' }
        ],
        new Date('2026-03-20T12:00:00Z')
    )
`, ganttContext)));
assert.equal(actualMonthSummary.actualHours, 11, 'Actual month summary must include only current-month production hours');
assert.equal(actualMonthSummary.employeeCount, 2, 'Actual month summary must count only production employees with submitted hours');

const monthTrackingSummary = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.buildCurrentMonthTrackingSummary(
        [
            { date: '2026-03-02', totalUsed: 5 },
            { date: '2026-03-20', totalUsed: 7 },
            { date: '2026-03-25', totalUsed: 8 },
            { date: '2026-04-01', totalUsed: 4 }
        ],
        { actualHours: 9, employeeCount: 2 },
        new Date('2026-03-20T12:00:00Z')
    )
`, ganttContext)));
assert.equal(monthTrackingSummary.plannedMonthHours, 20, 'Month tracking must sum all scheduled hours inside the current month');
assert.equal(monthTrackingSummary.plannedToDateHours, 12, 'Month tracking must separate the plan up to the current date');
assert.equal(monthTrackingSummary.gapToDate, -3, 'Month tracking must expose the factual gap versus plan to date');

const actualBuckets = JSON.parse(JSON.stringify(vm.runInContext(`
    Array.from(Gantt.buildOrderActuals(
        [
            { employee_id: 10, worker_name: 'Тая', date: '2026-03-02', hours: 5, order_id: 42, project_name: 'МТС 3 воркшопа', task_description: '[meta]{"stage":"assembly"}[/meta]' },
            { employee_id: 12, worker_name: 'Женя Г', date: '2026-03-03', hours: 3, project_name: 'эндостар', task_description: '[meta]{"stage":"casting"}[/meta]' },
            { employee_id: 11, worker_name: 'Леша', date: '2026-03-03', hours: 7, order_id: 42, project_name: 'МТС 3 воркшопа', task_description: '[meta]{"stage":"assembly"}[/meta]' }
        ],
        [
            { id: 10, name: 'Тая', role: 'production' },
            { id: 11, name: 'Леша', role: 'management' },
            { id: 12, name: 'Женя Г', role: 'production' }
        ],
        [
            { id: 42, order_name: 'МТС 3 воркшопа' },
            { id: 77, order_name: 'НФС звезды ЭндоСтарс' }
        ]
    ).entries())
`, ganttContext)));
const actualBucketMap = new Map(actualBuckets);
assert.equal(actualBucketMap.get(42).assembly, 5, 'Order actuals must aggregate linked production hours by phase');
assert.equal(actualBucketMap.get(42).employeeCount, 1, 'Management hours must not affect production order progress');
assert.equal(actualBucketMap.get(77).molding, 3, 'Order actuals should resolve unique legacy project names when there is no direct order id');

const shiftedWorkingDate = vm.runInContext(`
    Gantt.shiftWorkingDate('2026-03-20', 1, new Set(['2026-03-23']))
`, ganttContext);
assert.equal(shiftedWorkingDate, '2026-03-24', 'Quick manual shifts must skip weekends and configured production holidays');

const reorderedQueue = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.reorderOrderSequence([11, 22, 33, 44], 44, 22)
`, ganttContext)));
assert.deepEqual(reorderedQueue, [11, 44, 22, 33], 'Queue reorder helper must move dragged order before the drop target');

const workingBuffer = vm.runInContext(`
    Gantt.countWorkingDaysBetween('2026-03-20', '2026-03-24', new Set(['2026-03-23']))
`, ganttContext);
assert.equal(workingBuffer, 1, 'Working-day buffer must ignore weekends and configured holidays');

const tightRisk = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getDeadlineRiskSummary({
        deadlineEnd: '2026-03-24',
        schedule: [{ date: '2026-03-20' }]
    }, new Set(['2026-03-23']))
`, ganttContext)));
assert.equal(tightRisk.status, 'tight', 'Risk summary must surface tight deadline buffers');
assert.match(tightRisk.label, /Буфер 1 раб\.дн\./, 'Tight deadline label should use working-day buffer');

const lateRisk = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getDeadlineRiskSummary({
        deadlineEnd: '2026-03-24',
        schedule: [{ date: '2026-03-25' }]
    })
`, ganttContext)));
assert.equal(lateRisk.status, 'late', 'Risk summary must surface overdue orders');
assert.match(lateRisk.label, /Опаздывает/, 'Late deadline label should explain overdue state');

console.log('production calendar smoke checks passed');

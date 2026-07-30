const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const calculatorJs = fs.readFileSync(path.join(root, 'js', 'calculator.js'), 'utf8');
const productionCoreJs = fs.readFileSync(path.join(root, 'js', 'production-core.js'), 'utf8');
const ganttJs = fs.readFileSync(path.join(root, 'js', 'gantt.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'js', 'settings.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'css', 'style.css'), 'utf8');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'deploy-pages.yml'), 'utf8');

const sidebarNav = indexHtml.match(/<nav class="sidebar-nav">([\s\S]*?)<\/nav>/);
assert.ok(sidebarNav, 'Sidebar nav not found');
assert.equal((sidebarNav[1].match(/data-page="gantt"/g) || []).length, 1, 'Sidebar must contain exactly one production calendar link');
assert.equal((sidebarNav[1].match(/data-page="production-plan"/g) || []).length, 0, 'Sidebar must not contain legacy production-plan link');
assert.match(indexHtml, /id="gantt-container"/, 'Gantt page must include the unified calendar container');
assert.match(indexHtml, /Перетащите заказы — сверху выполняются раньше/, 'Gantt page must explain how queue priority works');
assert.match(indexHtml, /Каждая горизонтальная линия — один человек/, 'Gantt page must explain the worker-lane model');
assert.match(indexHtml, /Загрузка дня/, 'Gantt legend must explain the daily utilization bar');
assert.doesNotMatch(indexHtml, /id="gantt-queue"/, 'Separate launch queue must be removed');
assert.doesNotMatch(indexHtml, /id="gantt-capacity-chart"/, 'Separate capacity chart must be removed');
assert.doesNotMatch(indexHtml, /id="gantt-stats"/, 'Separate calendar statistic cards must be removed');
assert.doesNotMatch(indexHtml, /id="gantt-toolbar"/, 'Current-workshop toolbar must be removed');
assert.match(indexHtml, /data-zoom="week"/, 'Week zoom button missing');
assert.match(indexHtml, /data-zoom="month"/, 'Month zoom button missing');
assert.match(indexHtml, /Gantt\.scrollToToday\(\)/, 'Calendar must expose a quick return to today');
assert.doesNotMatch(indexHtml, /data-zoom="day"/, 'Day zoom must be removed');
assert.doesNotMatch(indexHtml, /set-planning_workers_count/, 'Settings must not expose the fixed team size');
assert.doesNotMatch(indexHtml, /set-planning_hours_per_day/, 'Settings must not expose the fixed production shift');
assert.match(ganttJs, /moveUp\(orderId\)/, 'Gantt queue reorder helpers missing');
assert.doesNotMatch(ganttJs, /adjustActiveWorkersCount\(delta\)/, 'Legacy active-worker controls must be removed');
assert.match(ganttJs, /adjustParallelWorkers\(orderId, delta\)/, 'Gantt must expose per-order worker targeting');
assert.match(ganttJs, /parallel_workers/, 'Gantt plan state must persist per-order worker targets');
assert.match(ganttJs, /renderPriorityCard\(item, index/, 'Gantt must render compact draggable priority cards');
assert.match(ganttJs, /getOrderScheduleWindow\(item\)/, 'Priority queue must expose each order start and finish forecast');
assert.match(ganttJs, /isOrderWaitingForStart\(item\)/, 'Future orders must remain visibly marked as waiting');
assert.match(ganttJs, /Следующие уже запланированы/, 'Ready future orders must be presented as scheduled, not merely parked');
assert.match(ganttJs, /Начнут на первых освободившихся линиях/, 'Future orders must explain how they enter production');
assert.match(ganttJs, /renderWorkerLane\(workerSlot, queue/, 'Gantt must render work by person instead of by order');
assert.match(ganttJs, /getWorkerLaneAllocations\(queue = \[\], workerSlot/, 'Gantt must expose worker-lane allocations');
assert.match(ganttJs, /highlightOrder\(orderId\)/, 'Calendar must cross-highlight related order work');
assert.match(ganttJs, /clearOrderHighlight\(\)/, 'Calendar must clear cross-highlighting');
assert.match(ganttJs, /scrollToToday\(smooth = true\)/, 'Calendar must scroll back to today');
assert.match(ganttJs, /startPriorityPanelResize\(event\)/, 'Calendar must expose a draggable queue/timeline divider');
assert.match(ganttJs, /resizePriorityPanelByKey\(event\)/, 'Calendar divider must support keyboard resizing');
assert.match(ganttJs, /PRIORITY_PANEL_STORAGE_KEY/, 'Calendar must remember the selected panel width');
assert.match(ganttJs, /renderPausedOrders\(blockedQueue = \[\], reviewQueue = \[\]\)/, 'Gantt must keep blocked and review orders accessible');
assert.match(ganttJs, /onOrderDrop\(event, targetOrderId\)/, 'Unified Gantt rows must support drag reorder');
assert.match(ganttJs, /TEAM_SIZE: 4/, 'Production calendar must expose the four-person team boundary');
assert.match(ganttJs, />Открыть<\/button>/, 'Every scheduled row must expose an explicit order-open button');
assert.match(calculatorJs, /startHour/, 'Scheduler allocations must keep their start inside the shift');
assert.match(calculatorJs, /endHour/, 'Scheduler allocations must keep their end inside the shift');
assert.match(styleCss, /\.gantt-priority-panel\s*\{[\s\S]*?--gantt-priority-width,\s*220px/, 'Desktop priority panel must default to about half of the former 430px width');
assert.match(styleCss, /\.gantt-panel-resizer\s*\{/, 'Calendar must style the queue/timeline divider');
assert.match(styleCss, /\.gantt-planner\.order-focus/, 'Worker-lane focus styling must be present');
assert.match(styleCss, /\.gantt-day-load/, 'Daily load indicator styling must be present');
assert.match(ganttJs, /zoom: 'week'/, 'Default gantt zoom must stay week');
assert.doesNotMatch(ganttJs, /'day' \| 'week'/, 'Legacy day zoom comment should be removed');
assert.match(appJs, /normalizePageAlias\(page\)/, 'Page alias normalizer missing in app');
assert.match(appJs, /production-plan' \|\| page === 'calendar'/, 'Legacy production aliases must redirect to gantt');
assert.match(settingsJs, /Производственный календарь/, 'Settings label must show production calendar');
assert.doesNotMatch(settingsJs, /set-planning-capacity-summary/, 'Settings hints must not expose the retired capacity controls');
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

const parallelSchedule = vm.runInContext(`
    buildProductionSchedule([
        {
            id: 11,
            order_name: 'Order A',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 8,
            production_hours_hardware: 0,
            production_hours_packaging: 0
        },
        {
            id: 12,
            order_name: 'Order B',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 8,
            production_hours_hardware: 0,
            production_hours_packaging: 0
        },
        {
            id: 13,
            order_name: 'Order C',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 8,
            production_hours_hardware: 0,
            production_hours_packaging: 0
        }
    ], {
        planning_workers_count: 2,
        planning_hours_per_day: 8
    })
`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(parallelSchedule.queue.map(item => item.schedule[0]?.date || null))),
    ['2026-03-16', '2026-03-16', '2026-03-17'],
    'Scheduler must not launch more concurrent orders than available worker slots'
);

const rushSchedule = vm.runInContext(`
    buildProductionSchedule([
        {
            id: 21,
            order_name: 'Rush order',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 16,
            production_hours_hardware: 0,
            production_hours_packaging: 0,
            production_parallel_workers: 2
        },
        {
            id: 22,
            order_name: 'Queued order',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 8,
            production_hours_hardware: 0,
            production_hours_packaging: 0
        }
    ], {
        planning_workers_count: 2,
        planning_hours_per_day: 8
    })
`, context);
assert.equal(
    JSON.parse(JSON.stringify(rushSchedule.queue[0].schedule.filter(segment => segment.date === '2026-03-16').reduce((sum, segment) => sum + segment.hours, 0))),
    16,
    'Priority orders must be able to consume multiple worker slots on the same day'
);
assert.equal(
    JSON.parse(JSON.stringify(rushSchedule.queue[1].schedule[0]?.date || null)),
    '2026-03-17',
    'Secondary orders must wait when a rush order takes all available worker slots'
);

const fourPersonSchedule = vm.runInContext(`
    buildProductionSchedule([
        {
            id: 31,
            order_name: 'Four-person priority order',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 36,
            production_hours_hardware: 0,
            production_hours_packaging: 0,
            production_parallel_workers: 4
        },
        {
            id: 32,
            order_name: 'Following order',
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 9,
            production_hours_hardware: 0,
            production_hours_packaging: 0
        }
    ], {
        planning_workers_count: 4,
        planning_hours_per_day: 9
    })
`, context);
assert.equal(
    JSON.parse(JSON.stringify(fourPersonSchedule.queue[0].schedule.filter(segment => segment.date === '2026-03-16').reduce((sum, segment) => sum + segment.hours, 0))),
    36,
    'A four-person order must be able to consume all 36 person-hours in one working day'
);
assert.equal(
    JSON.parse(JSON.stringify(fourPersonSchedule.queue[1].schedule[0]?.date || null)),
    '2026-03-17',
    'The following order must move to the next working day when the priority order takes all four people'
);
assert.equal(fourPersonSchedule.queue[0].parallelWorkersTarget, 4, 'Schedule rows must retain the saved worker target for rendering');
assert.deepEqual(
    JSON.parse(JSON.stringify(vm.runInContext('getProductionPlanningCapacity({ planning_workers_count: 9, planning_hours_per_day: 9 })', context))),
    { workersCount: 4, hoursPerDay: 9, dailyCapacity: 36 },
    'Production capacity must never exceed the four-person team boundary'
);

const fiveShortOrders = vm.runInContext(`
    buildProductionSchedule(
        [1, 2, 3, 4, 5].map(id => ({
            id,
            order_name: 'Short order ' + id,
            client_name: 'QA',
            status: 'production_casting',
            deadline_end: '2026-03-25',
            production_hours_plastic: 4,
            production_hours_hardware: 0,
            production_hours_packaging: 0
        })),
        { planning_workers_count: 4, planning_hours_per_day: 9 }
    )
`, context);
const fiveShortFirstDay = JSON.parse(JSON.stringify(fiveShortOrders.days[0].allocations));
assert.equal(
    new Set(fiveShortFirstDay.map(allocation => allocation.orderId)).size,
    5,
    'Five short orders may be touched in one day when later work starts after an earlier order finishes'
);
assert.deepEqual(
    JSON.parse(JSON.stringify(fiveShortOrders.queue.slice(0, 4).map(order => order.schedule[0].workerSlot))),
    [1, 2, 3, 4],
    'The first four one-person orders must start on four different people'
);
assert.equal(fiveShortOrders.queue[4].schedule[0].workerSlot, 1, 'The fifth order must reuse a released worker line');
assert.equal(fiveShortOrders.queue[4].schedule[0].startHour, 4, 'The fifth order must start after the first order ends, not in parallel');

const firstWaveSizes = [2, 3, 4].map(workerTarget => {
    const schedule = vm.runInContext(`
        buildProductionSchedule([
            {
                id: 100,
                order_name: 'Priority team order',
                status: 'production_casting',
                production_hours_plastic: ${workerTarget * 9},
                production_hours_hardware: 0,
                production_hours_packaging: 0,
                production_parallel_workers: ${workerTarget}
            },
            ...[101, 102, 103].map(id => ({
                id,
                order_name: 'Following order ' + id,
                status: 'production_casting',
                production_hours_plastic: 9,
                production_hours_hardware: 0,
                production_hours_packaging: 0
            }))
        ], {
            planning_workers_count: 4,
            planning_hours_per_day: 9
        })
    `, context);
    const firstDay = JSON.parse(JSON.stringify(schedule.days[0].allocations));
    return new Set(firstDay.filter(allocation => allocation.startHour === 0).map(allocation => allocation.orderId)).size;
});
assert.deepEqual(
    firstWaveSizes,
    [3, 2, 1],
    'Two, three, or four people on the priority order must leave room for three, two, or one simultaneous order rows'
);

const allocationsByWorkerDay = new Map();
fiveShortOrders.days.forEach(day => {
    day.allocations.forEach(allocation => {
        const key = `${day.date}:${allocation.workerSlot}`;
        if (!allocationsByWorkerDay.has(key)) allocationsByWorkerDay.set(key, []);
        allocationsByWorkerDay.get(key).push(allocation);
    });
});
allocationsByWorkerDay.forEach(allocations => {
    allocations.sort((left, right) => left.startHour - right.startHour);
    allocations.forEach((allocation, index) => {
        if (index === 0) return;
        assert.ok(
            allocation.startHour >= allocations[index - 1].endHour,
            `Worker ${allocation.workerSlot} must never have overlapping tasks`
        );
    });
});

const sequentialPhaseSchedule = vm.runInContext(`
    buildProductionSchedule([{
        id: 41,
        order_name: 'One-person phased order',
        client_name: 'QA',
        status: 'production_casting',
        deadline_end: '2026-03-25',
        production_hours_plastic: 4,
        production_hours_hardware: 4,
        production_hours_packaging: 0,
        production_parallel_workers: 1
    }], {
        planning_workers_count: 4,
        planning_hours_per_day: 9
    })
`, context);
assert.deepEqual(
    JSON.parse(JSON.stringify(sequentialPhaseSchedule.queue[0].schedule.map(segment => ({
        phase: segment.phase,
        workerSlot: segment.workerSlot,
        startHour: segment.startHour,
        endHour: segment.endHour,
    })))),
    [
        { phase: 'molding', workerSlot: 1, startHour: 0, endHour: 4 },
        { phase: 'assembly', workerSlot: 1, startHour: 4, endHour: 8 },
    ],
    'One-person molding and assembly must stay sequential on the same worker line'
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
    Map,
    Date,
    App: { settings: {} },
});
// gantt.js now delegates readiness/actuals/overload to production-core.js at
// runtime (index.html loads calculator.js -> production-core.js -> gantt.js),
// so load the same dependency chain here before evaluating gantt.js. calculator.js
// provides round2/buildProductionSchedule; production-core.js provides the
// deriveReadyState/buildOrderActuals/computeOverloadSummary globals.
vm.runInContext(calculatorJs, ganttContext, { filename: 'js/calculator.js' });
vm.runInContext(productionCoreJs, ganttContext, { filename: 'js/production-core.js' });
vm.runInContext(ganttJs, ganttContext, { filename: 'js/gantt.js' });

const fixedCalendarCapacity = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.planState.active_workers_count = 1;
    Gantt.getEffectivePlanningCapacity({
        planning_workers_count: 2,
        planning_hours_per_day: 8
    })
`, ganttContext)));
assert.deepEqual(
    fixedCalendarCapacity,
    { workersCount: 4, hoursPerDay: 9, dailyCapacity: 36 },
    'Hidden legacy settings and active-worker overrides must not change the four-person calendar'
);

const normalizedWorkerTarget = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.normalizePlanState({
        order_ids: [55],
        parallel_workers: { 55: 9 }
    }).parallel_workers
`, ganttContext)));
assert.equal(normalizedWorkerTarget['55'], 4, 'Saved per-order worker targets must be capped at four');

const compactPriorityCard = vm.runInContext(`
    (() => {
        const cardStart = new Date();
        cardStart.setHours(0, 0, 0, 0);
        const cardFinish = new Date(cardStart);
        cardFinish.setDate(cardFinish.getDate() + 1);
        const toLocalIso = date => [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
        return Gantt.renderPriorityCard({
            orderId: 55,
            orderName: 'Расчёски',
            clientName: 'QA',
            status: 'production_casting',
            plannedTotalHours: 36,
            remainingTotalHours: 36,
            parallelWorkersTarget: 3,
            schedule: [
                { date: toLocalIso(cardStart), phase: 'molding', hours: 27 },
                { date: toLocalIso(cardFinish), phase: 'assembly', hours: 9 }
            ],
            deadlineEnd: '2027-08-10'
        }, 0);
    })()
`, ganttContext);
assert.match(compactPriorityCard, /draggable="true"/, 'Priority card must be draggable');
assert.match(compactPriorityCard, /data-order-id="55"/, 'Priority card must expose its order for cross-highlighting');
assert.match(compactPriorityCard, /до 3/, 'Priority card must show the maximum worker allocation');
assert.match(compactPriorityCard, /Старт сегодня/, 'Priority card must show when work starts');
assert.match(compactPriorityCard, /Готово \d{1,2} [а-я]+/, 'Priority card must show the predicted finish date');
assert.match(compactPriorityCard, />Открыть<\/button>/, 'Priority card must expose explicit order navigation');

const futureQueueCard = vm.runInContext(`
    (() => {
        const futureStart = new Date();
        futureStart.setDate(futureStart.getDate() + 5);
        const futureFinish = new Date(futureStart);
        futureFinish.setDate(futureFinish.getDate() + 2);
        const toLocalIso = date => [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
        return Gantt.renderPriorityCard({
            orderId: 56,
            orderName: 'Следующий заказ',
            plannedTotalHours: 18,
            remainingTotalHours: 18,
            done: true,
            schedule: [
                { date: toLocalIso(futureStart), phase: 'molding', hours: 9 },
                { date: toLocalIso(futureFinish), phase: 'assembly', hours: 9 }
            ]
        }, 4);
    })()
`, ganttContext);
assert.match(futureQueueCard, /waiting/, 'A fully forecast future order must still be visually marked as waiting');
assert.match(futureQueueCard, /Дальше по плану/, 'Future order must explain that it is already scheduled');

const laterTodayQueueCard = vm.runInContext(`
    (() => {
        const today = new Date();
        const toLocalIso = date => [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
        return Gantt.renderPriorityCard({
            orderId: 57,
            orderName: 'Позже в смене',
            plannedTotalHours: 4,
            remainingTotalHours: 4,
            done: true,
            schedule: [{
                date: toLocalIso(today),
                phase: 'molding',
                hours: 4,
                workerSlot: 1,
                startHour: 4,
                endHour: 8
            }]
        }, 4);
    })()
`, ganttContext);
assert.match(laterTodayQueueCard, /Дальше по плану/, 'An order starting later in the same shift must stay scheduled below the immediate wave');
assert.match(laterTodayQueueCard, /Старт сегодня \+4ч/, 'Same-day waiting order must expose its offset inside the shift');

const blockedState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 1, order_name: 'Blocked mold order', status: 'sample' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: false }]
    )
`, ganttContext)));
assert.equal(blockedState.production_ready_state, 'blocked', 'Custom order without mold in stock must be blocked');
assert.match(blockedState.production_blocked_reason, /Ждет молд/, 'Blocked state should explain mold dependency');

const readyState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 2, order_name: 'Ready custom order', status: 'sample' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: true }]
    )
`, ganttContext)));
assert.equal(readyState.production_ready_state, 'ready', 'Custom order with mold in stock must stay ready');

const chinaBlockedState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 3, order_name: 'China blocked order', status: 'sample' },
        [{ item_type: 'product', product_name: 'Space NFC', is_blank_mold: false, base_mold_in_stock: false }],
        [{ order_id: 3, purchase_name: 'Молд Space NFC', status: 'in_transit' }]
    )
`, ganttContext)));
assert.equal(chinaBlockedState.production_ready_state, 'blocked', 'Pending China purchase must keep custom order blocked');
assert.match(chinaBlockedState.production_blocked_reason, /Ждет Китай/, 'Blocked state should explain pending China dependency');

const needsReviewState = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getOrderReadiness(
        { id: 4, order_name: 'Needs review order', status: 'sample' },
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

const capacityRiskSummary = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.buildCapacityRiskSummary(
        [
            { date: '2026-03-19', totalUsed: 8 },
            { date: '2026-03-20', totalUsed: 10 },
            { date: '2026-03-24', totalUsed: 11 }
        ],
        8,
        new Date('2026-03-20T12:00:00Z')
    )
`, ganttContext)));
assert.equal(capacityRiskSummary.overloadDays, 2, 'Capacity risk summary must count all future overload days');
assert.equal(capacityRiskSummary.firstOverloadDate, '2026-03-20', 'Capacity risk summary must expose the first future overload date');
assert.equal(capacityRiskSummary.firstOverloadHours, 2, 'Capacity risk summary must expose the overload amount for the first future overload');

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

const halfShiftLane = vm.runInContext(`
    Gantt.renderWorkerLane(
        1,
        [{
            orderId: 55,
            orderName: 'Half-shift order',
            schedule: [{
                date: '2026-03-24',
                phase: 'molding',
                hours: 4.5,
                workerSlot: 1,
                startHour: 4.5,
                endHour: 9
            }]
        }],
        new Date(2026, 2, 24),
        2,
        90,
        9,
        new Set()
    )
`, ganttContext);
assert.match(halfShiftLane, /left:45px;width:45px/, 'Half-shift work must occupy half of the day cell');
assert.match(halfShiftLane, /data-worker-slot="1"/, 'Rendered lane must identify its worker slot');
assert.match(halfShiftLane, /data-order-id="55"/, 'Worker task must link back to its priority card');

const halfLoadedDayAxis = vm.runInContext(`
    Gantt.renderTimeAxis(
        new Date(2026, 2, 24),
        1,
        90,
        new Set(),
        new Map([['2026-03-24', 18]]),
        36
    )
`, ganttContext);
assert.match(halfLoadedDayAxis, /gantt-day-load light/, 'Working day must render a load indicator');
assert.match(halfLoadedDayAxis, /width:50%/, 'Daily load indicator must reflect used person-hours');
assert.match(halfLoadedDayAxis, /Занято 18ч из 36ч/, 'Daily load tooltip must explain person-hour utilization');

const mergedWorkerSegments = JSON.parse(JSON.stringify(vm.runInContext(`
    Gantt.getWorkerLaneAllocations([{
        orderId: 66,
        orderName: 'Continuous work',
        schedule: [
            { date: '2026-03-24', phase: 'molding', hours: 4, workerSlot: 1, startHour: 0, endHour: 4 },
            { date: '2026-03-24', phase: 'molding', hours: 5, workerSlot: 1, startHour: 4, endHour: 9 }
        ]
    }], 1, 9)
`, ganttContext)));
assert.equal(mergedWorkerSegments.length, 1, 'Uninterrupted work must render as one clean interval');
assert.equal(mergedWorkerSegments[0].endHour, 9, 'Merged worker interval must retain the full shift end');

const parallelPhaseQueue = [{
    orderId: 77,
    orderName: 'Pipeline order',
    schedule: [
        { date: '2026-03-24', phase: 'molding', hours: 9, workerSlot: 1, startHour: 0, endHour: 9 },
        { date: '2026-03-24', phase: 'assembly', hours: 4, workerSlot: 2, startHour: 4, endHour: 8 },
    ],
}];
ganttContext.parallelPhaseQueue = parallelPhaseQueue;
const moldingLane = vm.runInContext(`
    Gantt.renderWorkerLane(1, parallelPhaseQueue, new Date(2026, 2, 24), 2, 90, 9, new Set())
`, ganttContext);
const assemblyLane = vm.runInContext(`
    Gantt.renderWorkerLane(2, parallelPhaseQueue, new Date(2026, 2, 24), 2, 90, 9, new Set())
`, ganttContext);
assert.match(moldingLane, /Литьё/, 'Molding must appear on its assigned worker line');
assert.doesNotMatch(moldingLane, /Сборка/, 'A worker line must not render another worker’s parallel task');
assert.match(assemblyLane, /Сборка/, 'Overlapping assembly must visibly occupy another worker line');
assert.doesNotMatch(assemblyLane, /Литьё/, 'The second worker line must stay separate from molding');

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

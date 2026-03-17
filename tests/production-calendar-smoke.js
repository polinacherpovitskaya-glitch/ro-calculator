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
assert.match(ganttJs, /moveUp\(orderId\)/, 'Gantt queue reorder helpers missing');
assert.match(ganttJs, /renderQueue\(queue\)/, 'Gantt queue renderer missing');
assert.match(ganttJs, /zoom: 'week'/, 'Default gantt zoom must stay week');
assert.doesNotMatch(ganttJs, /'day' \| 'week'/, 'Legacy day zoom comment should be removed');
assert.match(appJs, /normalizePageAlias\(page\)/, 'Page alias normalizer missing in app');
assert.match(appJs, /production-plan' \|\| page === 'calendar'/, 'Legacy production aliases must redirect to gantt');
assert.match(settingsJs, /Производственный календарь/, 'Settings label must show production calendar');
assert.match(workflow, /node tests\/production-calendar-smoke\.js/, 'CI must run production calendar smoke');
assert.match(ganttJs, /production_holidays/, 'Gantt UI must read configured production holidays');

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
        workers_count: 1,
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

console.log('production calendar smoke checks passed');

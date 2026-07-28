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
        dataset: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        setAttribute() {},
        removeAttribute() {},
        querySelectorAll() { return []; },
    };
}

function createContext() {
    const elements = new Map();
    const context = {
        console,
        Date,
        Math,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Set,
        Map,
        Promise,
        setTimeout,
        clearTimeout,
        document: {
            getElementById(id) {
                if (!elements.has(id)) elements.set(id, createElement(id));
                return elements.get(id);
            },
            querySelectorAll() { return []; },
        },
        App: {
            settings: {},
            escHtml(value) { return String(value ?? ''); },
            formatDate(value) { return String(value ?? ''); },
            toast() {},
        },
        loadOrders: async () => [],
        loadTimeEntries: async () => {
            context.__timeEntryLoads += 1;
            return [];
        },
        loadProductionPlanState: async () => {
            context.__planLoads += 1;
            return {};
        },
        loadVacations: async () => {
            context.__vacationLoads += 1;
            return [];
        },
        collectQuarterLoad: () => ({ load: 0, label: '0%', breakdown: {} }),
        renderProductionLoadBar() {
            context.__loadBarRenders += 1;
        },
        getOrderProductionQuantity: () => 0,
    };
    context.__timeEntryLoads = 0;
    context.__planLoads = 0;
    context.__vacationLoads = 0;
    context.__loadBarRenders = 0;
    context.window = context;
    return vm.createContext(context);
}

function runOrders(context) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'orders.js'), 'utf8');
    vm.runInContext(source, context, { filename: 'js/orders.js' });
}

async function smokeVisibleModeMetaOnly(context) {
    vm.runInContext(`(() => {
        Orders.mode = 'active';
        Orders._loadSeq = 1;
        Orders.allOrders = [
            { id: 1, status: 'sample', created_at: '2026-07-28T01:00:00Z' },
            { id: 2, status: 'draft', created_at: '2026-07-28T02:00:00Z' },
            { id: 3, status: 'completed', created_at: '2026-07-28T03:00:00Z' },
        ];
        Orders.metaByOrderId = {};
        Orders.render = () => {};
        Orders.buildOrderMeta = order => ({ orderId: order.id });
        globalThis.__metaRequests = [];
        Orders.loadMetaBundle = async ids => {
            globalThis.__metaRequests.push(ids.slice());
            return { projects: [], tasks: [], chinaPurchases: [], orderItems: [] };
        };
    })()`, context);

    await vm.runInContext(`Orders.ensureMetaForCurrentMode()`, context);
    assert.deepEqual(
        JSON.parse(JSON.stringify(vm.runInContext(`globalThis.__metaRequests[0]`, context))),
        [1],
        'Active must request meta only for the visible active order',
    );

    vm.runInContext(`Orders.mode = 'board'`, context);
    await vm.runInContext(`Orders.ensureMetaForCurrentMode()`, context);
    assert.deepEqual(
        JSON.parse(JSON.stringify(vm.runInContext(`globalThis.__metaRequests[1]`, context))).sort(),
        [2, 3],
        'Board must fetch only meta missing from the first mode',
    );
}

async function smokeLoadBarRequestsAreCoalesced(context) {
    vm.runInContext(`(() => {
        Orders.allOrders = [];
        Orders._loadBarDataSeq = 1;
        Orders._loadBarEntries = null;
        Orders._loadBarCalendar = null;
        Orders._loadBarEntriesPromise = null;
        Orders._loadBarCalendarPromise = null;
    })()`, context);

    await Promise.all([
        vm.runInContext(`Orders.renderLoadBar()`, context),
        vm.runInContext(`Orders.renderLoadBar()`, context),
        vm.runInContext(`Orders.renderLoadBar()`, context),
    ]);

    assert.equal(context.__timeEntryLoads, 1);
    assert.equal(context.__planLoads, 1);
    assert.equal(context.__vacationLoads, 1);
    assert.equal(context.__loadBarRenders, 1, 'only the newest render should paint the load bar');
}

function smokeDailyMenuOrder() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const daily = html.match(/<div class="sidebar-group-label">Каждый день<\/div>([\s\S]*?)<div class="sidebar-group-label">Производство<\/div>/);
    assert.ok(daily, 'daily navigation group must exist');
    const pages = [...daily[1].matchAll(/data-page="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(pages.slice(0, 4), ['orders', 'calculator', 'tasks', 'leads']);
    assert.match(html, /const CURRENT_HTML_VERSION = 'v\d+'/);
}

async function main() {
    const context = createContext();
    runOrders(context);
    await smokeVisibleModeMetaOnly(context);
    await smokeLoadBarRequestsAreCoalesced(context);
    smokeDailyMenuOrder();
    console.log('orders performance smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

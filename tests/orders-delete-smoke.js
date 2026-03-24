const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createStorage() {
    const store = new Map();
    return {
        get length() {
            return store.size;
        },
        key(index) {
            return Array.from(store.keys())[index] || null;
        },
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}

function matchesFilters(row, filters) {
    return (filters || []).every(filter => {
        const actual = row ? row[filter.column] : undefined;
        if (filter.op === 'eq') return String(actual) === String(filter.value);
        if (filter.op === 'neq') return String(actual) !== String(filter.value);
        return true;
    });
}

function projectRow(row, columns) {
    if (!row) return row;
    if (!columns || columns === '*') return clone(row);
    const out = {};
    String(columns)
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .forEach(key => {
            out[key] = row[key];
        });
    return out;
}

function createQueryBuilder(context, table) {
    const state = {
        mode: 'select',
        filters: [],
        orderBy: null,
        limit: null,
        payload: null,
        selected: '*',
        expectSingle: false,
    };

    const builder = {
        select(columns = '*') {
            state.mode = 'select';
            state.selected = columns;
            return builder;
        },
        insert(payload) {
            state.mode = 'insert';
            state.payload = Array.isArray(payload) ? clone(payload) : [clone(payload)];
            context.__remoteCalls.push({ table, action: 'insert', payload: clone(payload) });
            return builder;
        },
        update(payload) {
            state.mode = 'update';
            state.payload = clone(payload);
            context.__remoteCalls.push({ table, action: 'update', payload: clone(payload) });
            return builder;
        },
        delete() {
            state.mode = 'delete';
            context.__remoteCalls.push({ table, action: 'delete' });
            return builder;
        },
        upsert(payload) {
            context.__remoteCalls.push({ table, action: 'upsert', payload: clone(payload) });
            return Promise.resolve({ error: null });
        },
        eq(column, value) {
            state.filters.push({ op: 'eq', column, value });
            return builder;
        },
        neq(column, value) {
            state.filters.push({ op: 'neq', column, value });
            return builder;
        },
        order(column, options = {}) {
            state.orderBy = { column, ascending: options.ascending !== false };
            context.__remoteCalls.push({ table, action: 'order', column, ascending: state.orderBy.ascending });
            return builder;
        },
        limit(value) {
            state.limit = Number(value);
            return builder;
        },
        maybeSingle() {
            state.expectSingle = true;
            return execute();
        },
        single() {
            state.expectSingle = true;
            return execute();
        },
        then(resolve, reject) {
            return execute().then(resolve, reject);
        },
    };

    function execute() {
        const tableRows = context.__tables[table] || [];

        if (state.mode === 'insert') {
            state.payload.forEach(row => {
                tableRows.push(clone(row));
            });
            context.__tables[table] = tableRows;
            const dataRows = state.payload.map(row => projectRow(row, state.selected));
            return Promise.resolve({
                data: state.expectSingle ? (dataRows[0] || null) : dataRows,
                error: null,
            });
        }

        if (state.mode === 'update') {
            const updated = [];
            tableRows.forEach((row, index) => {
                if (!matchesFilters(row, state.filters)) return;
                tableRows[index] = { ...row, ...clone(state.payload) };
                updated.push(projectRow(tableRows[index], state.selected));
            });
            context.__tables[table] = tableRows;
            return Promise.resolve({
                data: state.expectSingle ? (updated[0] || null) : updated,
                error: null,
            });
        }

        if (state.mode === 'delete') {
            const kept = [];
            tableRows.forEach(row => {
                if (!matchesFilters(row, state.filters)) kept.push(row);
            });
            context.__tables[table] = kept;
            return Promise.resolve({ data: null, error: null });
        }

        let rows = tableRows
            .filter(row => matchesFilters(row, state.filters))
            .map(row => projectRow(row, state.selected));

        if (state.orderBy) {
            const { column, ascending } = state.orderBy;
            rows.sort((left, right) => {
                const a = left?.[column];
                const b = right?.[column];
                if (a === b) return 0;
                if (a == null) return ascending ? -1 : 1;
                if (b == null) return ascending ? 1 : -1;
                return ascending ? (a > b ? 1 : -1) : (a < b ? 1 : -1);
            });
        }

        if (Number.isFinite(state.limit) && state.limit >= 0) {
            rows = rows.slice(0, state.limit);
        }

        return Promise.resolve({
            data: state.expectSingle ? (rows[0] || null) : rows,
            error: null,
        });
    }

    return builder;
}

function createContext() {
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    const context = {
        console,
        Math,
        Date,
        JSON,
        Array,
        Object,
        String,
        Number,
        Boolean,
        RegExp,
        Promise,
        setTimeout,
        clearTimeout,
        localStorage,
        sessionStorage,
        navigator: {},
        document: {},
        location: { href: 'http://localhost' },
        __remoteCalls: [],
        __tables: {
            orders: [],
            order_items: [],
        },
        App: {
            editingOrderId: null,
            toast() {},
        },
        Calculator: {
            resetCount: 0,
            _autosaveTimer: null,
            _isDirty: false,
            _autosaving: false,
            _currentOrderStatus: 'draft',
            resetForm() {
                this.resetCount += 1;
                this._isDirty = false;
                this._autosaving = false;
                this._currentOrderStatus = 'draft';
                context.App.editingOrderId = null;
                localStorage.removeItem('ro_calc_editing_order_id');
            },
        },
    };

    context.window = context;
    context.supabase = {
        createClient() {
            return {
                from(table) {
                    return createQueryBuilder(context, table);
                },
            };
        },
    };

    return vm.createContext(context);
}

function runScript(context, relativePath) {
    const absolutePath = path.join(__dirname, '..', relativePath);
    const code = fs.readFileSync(absolutePath, 'utf8');
    vm.runInContext(code, context, { filename: relativePath });
}

async function main() {
    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        context.__tables.orders = [{
            id: 101,
            order_name: 'Удалённый тестовый черновик',
            status: 'deleted',
            deleted_at: '2026-03-24T07:55:00.000Z',
            created_at: '2026-03-24T07:40:00.000Z',
            updated_at: '2026-03-24T07:55:00.000Z',
        }];

        const savedId = await vm.runInContext(`saveOrder({
            id: 101,
            order_name: 'Попытка пересохранить',
            status: 'draft',
            notes: 'late autosave payload'
        }, [])`, context);

        assert.equal(savedId, 101);
        assert.equal(context.__tables.orders.length, 1);
        assert.equal(context.__tables.orders[0].status, 'deleted', 'saveOrder must not revive deleted Supabase order');
        assert.equal(context.__tables.orders[0].deleted_at, '2026-03-24T07:55:00.000Z');

        const localOrders = JSON.parse(context.localStorage.getItem('ro_calc_orders') || '[]');
        assert.equal(localOrders.length, 1);
        assert.equal(localOrders[0].status, 'deleted', 'local backup must preserve deleted status too');
        assert.equal(localOrders[0].deleted_at, '2026-03-24T07:55:00.000Z');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        context.__tables.orders = [{
            id: 102,
            order_name: 'Обычный черновик',
            status: 'draft',
            deleted_at: null,
            created_at: '2026-03-24T08:00:00.000Z',
            updated_at: '2026-03-24T08:05:00.000Z',
        }];

        const savedId = await vm.runInContext(`saveOrder({
            id: 102,
            order_name: 'Обычный заказ',
            status: 'production_casting',
            notes: 'normal update'
        }, [])`, context);

        assert.equal(savedId, 102);
        assert.equal(context.__tables.orders[0].status, 'production_casting', 'non-deleted orders must still update normally');
        const localOrders = JSON.parse(context.localStorage.getItem('ro_calc_orders') || '[]');
        assert.equal(localOrders[0].status, 'production_casting');
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        context.__tables.orders = [{
            id: 201,
            order_name: 'Черновик для удаления',
            status: 'draft',
            deleted_at: null,
            updated_at: '2026-03-24T09:00:00.000Z',
        }];
        context.localStorage.setItem('ro_calc_orders', JSON.stringify(clone(context.__tables.orders)));
        context.App.editingOrderId = 201;
        context.localStorage.setItem('ro_calc_editing_order_id', '201');

        await vm.runInContext('deleteOrder(201)', context);

        const afterDeleteLocal = JSON.parse(context.localStorage.getItem('ro_calc_orders') || '[]');
        assert.equal(context.__tables.orders[0].status, 'deleted');
        assert.equal(afterDeleteLocal[0].status, 'deleted', 'soft delete must immediately update local cache');
        assert.ok(afterDeleteLocal[0].deleted_at, 'soft delete must stamp deleted_at locally');
        assert.equal(context.App.editingOrderId, null, 'deleting the currently edited order must clear editor binding');
        assert.equal(context.localStorage.getItem('ro_calc_editing_order_id'), null);
        assert.equal(context.Calculator.resetCount, 1);

        await vm.runInContext('restoreOrder(201)', context);

        const afterRestoreLocal = JSON.parse(context.localStorage.getItem('ro_calc_orders') || '[]');
        assert.equal(context.__tables.orders[0].status, 'draft');
        assert.equal(context.__tables.orders[0].deleted_at, null);
        assert.equal(afterRestoreLocal[0].status, 'draft', 'restore must also update local cache');
        assert.equal(afterRestoreLocal[0].deleted_at, null);
    }

    {
        const context = createContext();
        runScript(context, 'js/supabase.js');
        vm.runInContext('initSupabase()', context);

        context.__tables.orders = [
            { id: 301, order_name: 'На удаление навсегда', status: 'deleted' },
            { id: 302, order_name: 'Остаться', status: 'draft' },
        ];
        context.__tables.order_items = [
            { id: 301001, order_id: 301, item_number: 1 },
            { id: 302001, order_id: 302, item_number: 1 },
        ];
        context.localStorage.setItem('ro_calc_orders', JSON.stringify(clone(context.__tables.orders)));
        context.localStorage.setItem('ro_calc_order_items', JSON.stringify(clone(context.__tables.order_items)));
        context.App.editingOrderId = 301;
        context.localStorage.setItem('ro_calc_editing_order_id', '301');

        await vm.runInContext('permanentDeleteOrder(301)', context);

        const localOrders = JSON.parse(context.localStorage.getItem('ro_calc_orders') || '[]');
        const localItems = JSON.parse(context.localStorage.getItem('ro_calc_order_items') || '[]');

        assert.equal(context.__tables.orders.some(order => order.id === 301), false);
        assert.equal(context.__tables.order_items.some(item => item.order_id === 301), false);
        assert.equal(localOrders.some(order => order.id === 301), false, 'permanent delete must purge local order cache');
        assert.equal(localItems.some(item => item.order_id === 301), false, 'permanent delete must purge local item cache');
        assert.equal(localOrders.some(order => order.id === 302), true);
        assert.equal(localItems.some(item => item.order_id === 302), true);
        assert.equal(context.App.editingOrderId, null);
        assert.equal(context.localStorage.getItem('ro_calc_editing_order_id'), null);
        assert.equal(context.Calculator.resetCount, 1);
    }

    console.log('orders delete smoke checks passed');
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

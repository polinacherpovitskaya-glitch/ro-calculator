const crypto = require('node:crypto');

const ALLOWED_TABLES = new Set([
    'bot_telegram_bindings',
    'employees',
    'orders',
    'settings',
    'task_notification_events',
    'tasks',
    'time_entries',
]);

function requiredOption(value, name) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`${name} is required`);
    return normalized;
}

function normalizeError(raw, status = 0) {
    const source = raw?.error || raw || {};
    const error = new Error(source.message || `Platform API request failed (${status})`);
    error.code = source.code || 'PLATFORM_API_ERROR';
    error.status = status;
    return error;
}

class PlatformCompatQuery {
    constructor(client, table) {
        if (!ALLOWED_TABLES.has(table)) throw new Error(`Unsupported bot table: ${table}`);
        this.client = client;
        this.table = table;
        this.operation = 'select';
        this.columns = '*';
        this.payload = null;
        this.filters = [];
        this.orders = [];
        this.rowLimit = null;
        this.singleMode = null;
        this.onConflict = '';
        this.returning = false;
        this.executed = null;
    }

    select(columns = '*') {
        this.columns = columns;
        if (this.operation !== 'select') this.returning = true;
        return this;
    }

    insert(payload) {
        this.operation = 'insert';
        this.payload = payload;
        return this;
    }

    update(payload) {
        this.operation = 'update';
        this.payload = payload;
        return this;
    }

    delete() {
        this.operation = 'delete';
        return this;
    }

    upsert(payload, options = {}) {
        this.operation = 'upsert';
        this.payload = payload;
        this.onConflict = String(options.onConflict || 'id');
        return this;
    }

    addFilter(op, column, value, operator = undefined) {
        this.filters.push({ op, column, value, ...(operator ? { operator } : {}) });
        return this;
    }

    eq(column, value) { return this.addFilter('eq', column, value); }
    neq(column, value) { return this.addFilter('neq', column, value); }
    in(column, values) { return this.addFilter('in', column, values); }
    gte(column, value) { return this.addFilter('gte', column, value); }
    lte(column, value) { return this.addFilter('lte', column, value); }
    is(column, value) { return this.addFilter('is', column, value); }
    not(column, operator, value) { return this.addFilter('not', column, value, operator); }

    order(column, options = {}) {
        this.orders.push({ column, ascending: options.ascending !== false });
        return this;
    }

    limit(value) {
        const limit = Number(value);
        if (!Number.isSafeInteger(limit) || limit < 0) throw new Error(`Invalid query limit: ${value}`);
        this.rowLimit = limit;
        return this;
    }

    single() {
        this.singleMode = 'single';
        return this;
    }

    maybeSingle() {
        this.singleMode = 'maybeSingle';
        return this;
    }

    async run() {
        const mutation = this.operation !== 'select';
        const headers = {
            Authorization: `Bearer ${this.client.token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
        };
        if (mutation) headers['Idempotency-Key'] = crypto.randomUUID();
        try {
            const response = await this.client.fetch(`${this.client.baseUrl}/api/compat/query`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    table: this.table,
                    action: this.operation,
                    columns: this.columns,
                    values: this.payload,
                    filters: this.filters,
                    orders: this.orders,
                    limit: this.rowLimit,
                    cardinality: this.singleMode,
                    onConflict: this.onConflict,
                    returning: this.returning,
                }),
            });
            const text = await response.text();
            const body = text ? JSON.parse(text) : {};
            if (!response.ok) return { data: null, error: normalizeError(body, response.status) };
            return {
                data: body?.data ?? null,
                error: body?.error ? normalizeError(body.error, response.status) : null,
            };
        } catch (error) {
            return { data: null, error: normalizeError(error) };
        }
    }

    then(resolve, reject) {
        if (!this.executed) this.executed = this.run();
        return this.executed.then(resolve, reject);
    }
}

function createPlatformCompatClient(options = {}) {
    const baseUrl = requiredOption(options.baseUrl || process.env.OPS_API_URL, 'OPS_API_URL').replace(/\/+$/, '');
    const token = requiredOption(options.token || process.env.OPS_BOT_TOKEN, 'OPS_BOT_TOKEN');
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('fetch is required');
    return {
        baseUrl,
        token,
        fetch: fetchImpl,
        from(table) {
            return new PlatformCompatQuery(this, table);
        },
    };
}

module.exports = {
    ALLOWED_TABLES,
    PlatformCompatQuery,
    createPlatformCompatClient,
};

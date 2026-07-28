const { getPool } = require('./db');

const ALLOWED_TABLES = new Set([
    'bot_telegram_bindings',
    'employees',
    'orders',
    'settings',
    'task_notification_events',
    'tasks',
    'time_entries',
]);

function identifier(value) {
    const name = String(value || '').trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
        throw new Error(`Unsafe SQL identifier: ${value}`);
    }
    return `"${name.replaceAll('"', '""')}"`;
}

function selectedColumns(value) {
    if (!value || value === '*') return '*';
    return String(value)
        .split(',')
        .map((column) => identifier(column.trim()))
        .join(', ');
}

class PostgresCompatQuery {
    constructor(pool, table) {
        if (!ALLOWED_TABLES.has(table)) throw new Error(`Unsupported bot table: ${table}`);
        this.pool = pool;
        this.table = table;
        this.operation = 'select';
        this.columns = '*';
        this.payload = null;
        this.filters = [];
        this.orders = [];
        this.rowLimit = null;
        this.singleMode = null;
        this.conflictColumns = [];
        this.executed = null;
    }

    select(columns = '*') {
        this.columns = columns;
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
        this.conflictColumns = String(options.onConflict || 'id')
            .split(',')
            .map((column) => column.trim())
            .filter(Boolean);
        return this;
    }

    eq(column, value) {
        this.filters.push({ column, operator: value === null ? 'is' : 'eq', value });
        return this;
    }

    neq(column, value) {
        this.filters.push({ column, operator: value === null ? 'not-is' : 'neq', value });
        return this;
    }

    in(column, values) {
        this.filters.push({ column, operator: 'in', value: values });
        return this;
    }

    gte(column, value) {
        this.filters.push({ column, operator: 'gte', value });
        return this;
    }

    lte(column, value) {
        this.filters.push({ column, operator: 'lte', value });
        return this;
    }

    is(column, value) {
        this.filters.push({ column, operator: 'is', value });
        return this;
    }

    not(column, operator, value) {
        if (operator !== 'is') throw new Error(`Unsupported not operator: ${operator}`);
        this.filters.push({ column, operator: 'not-is', value });
        return this;
    }

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
        this.singleMode = 'maybe';
        return this;
    }

    buildFilters(values) {
        const clauses = [];
        for (const filter of this.filters) {
            const column = identifier(filter.column);
            if (filter.operator === 'is' || filter.operator === 'not-is') {
                if (filter.value !== null) throw new Error('Only NULL is supported with is/not-is');
                clauses.push(`${column} IS ${filter.operator === 'not-is' ? 'NOT ' : ''}NULL`);
                continue;
            }
            if (filter.operator === 'in') {
                const items = Array.isArray(filter.value) ? filter.value : [];
                if (!items.length) {
                    clauses.push('FALSE');
                    continue;
                }
                const placeholders = items.map((item) => {
                    values.push(item);
                    return `$${values.length}`;
                });
                clauses.push(`${column} IN (${placeholders.join(', ')})`);
                continue;
            }
            values.push(filter.value);
            const sqlOperator = {
                eq: '=',
                neq: '<>',
                gte: '>=',
                lte: '<=',
            }[filter.operator];
            if (!sqlOperator) throw new Error(`Unsupported filter operator: ${filter.operator}`);
            clauses.push(`${column} ${sqlOperator} $${values.length}`);
        }
        return clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    }

    buildSelect() {
        const values = [];
        let sql = `SELECT ${selectedColumns(this.columns)} FROM ${identifier(this.table)}`;
        sql += this.buildFilters(values);
        if (this.orders.length) {
            sql += ` ORDER BY ${this.orders
                .map((order) => `${identifier(order.column)} ${order.ascending ? 'ASC' : 'DESC'}`)
                .join(', ')}`;
        }
        if (this.rowLimit !== null) {
            values.push(this.rowLimit);
            sql += ` LIMIT $${values.length}`;
        }
        return { sql, values };
    }

    normalizePayload() {
        const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
        if (!rows.length || rows.some((row) => !row || typeof row !== 'object' || Array.isArray(row))) {
            throw new Error(`${this.operation} requires an object or array of objects`);
        }
        const columns = Object.keys(rows[0]);
        if (!columns.length) throw new Error(`${this.operation} requires at least one column`);
        for (const row of rows) {
            if (columns.some((column) => !Object.hasOwn(row, column)) || Object.keys(row).length !== columns.length) {
                throw new Error('All mutation rows must have the same columns');
            }
        }
        return { rows, columns };
    }

    buildInsert() {
        const { rows, columns } = this.normalizePayload();
        const values = [];
        const tuples = rows.map((row) => {
            const placeholders = columns.map((column) => {
                values.push(row[column]);
                return `$${values.length}`;
            });
            return `(${placeholders.join(', ')})`;
        });
        let sql = `INSERT INTO ${identifier(this.table)} (${columns.map(identifier).join(', ')}) VALUES ${tuples.join(', ')}`;
        if (this.operation === 'upsert') {
            if (!this.conflictColumns.length) throw new Error('upsert requires a conflict column');
            const conflicts = new Set(this.conflictColumns);
            const updates = columns
                .filter((column) => !conflicts.has(column))
                .map((column) => `${identifier(column)} = EXCLUDED.${identifier(column)}`);
            sql += ` ON CONFLICT (${this.conflictColumns.map(identifier).join(', ')})`;
            sql += updates.length ? ` DO UPDATE SET ${updates.join(', ')}` : ' DO NOTHING';
        }
        sql += ' RETURNING *';
        return { sql, values };
    }

    buildUpdate() {
        const payload = this.payload;
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            throw new Error('update requires an object');
        }
        const values = [];
        const updates = Object.entries(payload).map(([column, value]) => {
            values.push(value);
            return `${identifier(column)} = $${values.length}`;
        });
        if (!updates.length) throw new Error('update requires at least one column');
        let sql = `UPDATE ${identifier(this.table)} SET ${updates.join(', ')}`;
        sql += this.buildFilters(values);
        sql += ' RETURNING *';
        return { sql, values };
    }

    buildDelete() {
        const values = [];
        let sql = `DELETE FROM ${identifier(this.table)}`;
        sql += this.buildFilters(values);
        sql += ' RETURNING *';
        return { sql, values };
    }

    async run() {
        try {
            const query = this.operation === 'select'
                ? this.buildSelect()
                : this.operation === 'insert' || this.operation === 'upsert'
                    ? this.buildInsert()
                    : this.operation === 'update'
                        ? this.buildUpdate()
                        : this.buildDelete();
            const result = await this.pool.query(query.sql, query.values);
            let data = result.rows || [];
            if (this.singleMode === 'single') {
                if (data.length !== 1) throw new Error(`Expected one row, received ${data.length}`);
                [data] = data;
            } else if (this.singleMode === 'maybe') {
                if (data.length > 1) throw new Error(`Expected zero or one row, received ${data.length}`);
                data = data[0] || null;
            }
            return { data, error: null };
        } catch (error) {
            return { data: null, error };
        }
    }

    then(resolve, reject) {
        if (!this.executed) this.executed = this.run();
        return this.executed.then(resolve, reject);
    }
}

function createPostgresCompatClient(options = {}) {
    const pool = options.pool || getPool();
    return {
        from(table) {
            return new PostgresCompatQuery(pool, table);
        },
    };
}

module.exports = {
    ALLOWED_TABLES,
    PostgresCompatQuery,
    createPostgresCompatClient,
    identifier,
};

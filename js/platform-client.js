// Recycle Object — Yandex platform transport.
//
// This mirrors the small Supabase query-builder surface used by the existing
// vanilla application. UI modules keep their contracts while reads, writes,
// sessions, and files move to our API.
(function initPlatformClient(global) {
    'use strict';

    const DEFAULT_API_URL = 'https://api.recycleobject.ru';

    function requestId() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') {
            return global.crypto.randomUUID();
        }
        return `ro-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    function apiError(raw, status) {
        const error = raw && raw.error ? raw.error : raw;
        return {
            code: String(error?.code || status || 'PLATFORM_ERROR'),
            message: String(error?.message || `Platform API error ${status || ''}`).trim(),
            status: Number(status) || 0,
        };
    }

    function encodeObjectPath(path) {
        return String(path || '')
            .split('/')
            .filter(segment => segment !== '')
            .map(segment => encodeURIComponent(segment))
            .join('/');
    }

    class PlatformQuery {
        constructor(client, table) {
            this.client = client;
            this.table = table;
            this.action = 'select';
            this.columns = '*';
            this.values = null;
            this.filters = [];
            this.orders = [];
            this.limitValue = null;
            this.rangeValue = null;
            this.cardinality = null;
            this.onConflict = '';
            this.returning = false;
            this.execution = null;
        }

        select(columns = '*') {
            this.columns = columns || '*';
            if (this.action !== 'select') this.returning = true;
            return this;
        }

        insert(values) {
            this.action = 'insert';
            this.values = values;
            return this;
        }

        upsert(values, options = {}) {
            this.action = 'upsert';
            this.values = values;
            this.onConflict = options.onConflict || '';
            return this;
        }

        update(values) {
            this.action = 'update';
            this.values = values;
            return this;
        }

        delete() {
            this.action = 'delete';
            return this;
        }

        addFilter(op, column, value, operator = undefined) {
            this.filters.push({ op, column, value, ...(operator ? { operator } : {}) });
            return this;
        }

        eq(column, value) { return this.addFilter('eq', column, value); }
        neq(column, value) { return this.addFilter('neq', column, value); }
        gt(column, value) { return this.addFilter('gt', column, value); }
        gte(column, value) { return this.addFilter('gte', column, value); }
        lt(column, value) { return this.addFilter('lt', column, value); }
        lte(column, value) { return this.addFilter('lte', column, value); }
        is(column, value) { return this.addFilter('is', column, value); }
        in(column, value) { return this.addFilter('in', column, value); }
        contains(column, value) { return this.addFilter('contains', column, value); }
        not(column, operator, value) { return this.addFilter('not', column, value, operator); }

        match(values) {
            Object.entries(values || {}).forEach(([column, value]) => this.eq(column, value));
            return this;
        }

        filter(column, operator, value) {
            const raw = String(operator || '');
            const normalized = raw.replace(/^not\./, '');
            return raw.startsWith('not.')
                ? this.not(column, normalized, value)
                : this.addFilter(normalized, column, value);
        }

        order(column, options = {}) {
            this.orders.push({
                column,
                ascending: options.ascending !== false,
                nullsFirst: options.nullsFirst,
            });
            return this;
        }

        limit(value) {
            this.limitValue = Number(value);
            return this;
        }

        range(from, to) {
            this.rangeValue = { from: Number(from), to: Number(to) };
            return this;
        }

        single() {
            this.cardinality = 'single';
            return this;
        }

        maybeSingle() {
            this.cardinality = 'maybeSingle';
            return this;
        }

        async execute() {
            const mutation = this.action !== 'select';
            const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
            if (mutation) headers['Idempotency-Key'] = requestId();
            try {
                const response = await global.fetch(`${this.client.apiUrl}/api/compat/query`, {
                    method: 'POST',
                    credentials: 'include',
                    cache: 'no-store',
                    headers,
                    body: JSON.stringify({
                        table: this.table,
                        action: this.action,
                        columns: this.columns,
                        values: this.values,
                        filters: this.filters,
                        orders: this.orders,
                        limit: Number.isInteger(this.limitValue) ? this.limitValue : undefined,
                        range: this.rangeValue,
                        cardinality: this.cardinality,
                        onConflict: this.onConflict,
                        returning: this.returning,
                    }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) return { data: null, error: apiError(payload, response.status) };
                return {
                    data: payload?.data ?? null,
                    error: payload?.error ? apiError(payload.error, response.status) : null,
                };
            } catch (error) {
                return {
                    data: null,
                    error: apiError({ code: 'NETWORK_ERROR', message: error?.message || error }, 0),
                };
            }
        }

        promise() {
            if (!this.execution) this.execution = this.execute();
            return this.execution;
        }

        then(resolve, reject) { return this.promise().then(resolve, reject); }
        catch(reject) { return this.promise().catch(reject); }
        finally(handler) { return this.promise().finally(handler); }
    }

    class PlatformStorageBucket {
        constructor(client, bucket) {
            this.client = client;
            this.bucket = bucket;
        }

        async upload(path, file, options = {}) {
            try {
                const form = new FormData();
                form.append('file', file, file?.name || 'upload');
                form.append('path', String(path || ''));
                form.append('upsert', options.upsert ? 'true' : 'false');
                form.append('contentType', options.contentType || file?.type || 'application/octet-stream');
                const response = await global.fetch(
                    `${this.client.apiUrl}/api/storage/${encodeURIComponent(this.bucket)}/upload`,
                    {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Idempotency-Key': requestId() },
                        body: form,
                    },
                );
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) return { data: null, error: apiError(payload, response.status) };
                return { data: payload.data, error: null };
            } catch (error) {
                return { data: null, error: apiError({ code: 'NETWORK_ERROR', message: error?.message || error }, 0) };
            }
        }

        getPublicUrl(path) {
            return {
                data: {
                    publicUrl: `${this.client.apiUrl}/api/storage/public/${encodeURIComponent(this.bucket)}/${encodeObjectPath(path)}`,
                },
            };
        }

        async createSignedUrl(path, expiresIn = 600) {
            try {
                const response = await global.fetch(`${this.client.apiUrl}/api/storage/signed-url`, {
                    method: 'POST',
                    credentials: 'include',
                    cache: 'no-store',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bucket: this.bucket, path, expiresIn }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) return { data: null, error: apiError(payload, response.status) };
                return { data: payload.data, error: null };
            } catch (error) {
                return { data: null, error: apiError({ code: 'NETWORK_ERROR', message: error?.message || error }, 0) };
            }
        }

        async remove(paths) {
            try {
                const response = await global.fetch(
                    `${this.client.apiUrl}/api/storage/${encodeURIComponent(this.bucket)}/remove`,
                    {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json',
                            'Idempotency-Key': requestId(),
                        },
                        body: JSON.stringify({ paths: Array.isArray(paths) ? paths : [paths] }),
                    },
                );
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) return { data: null, error: apiError(payload, response.status) };
                return { data: payload.data, error: null };
            } catch (error) {
                return { data: null, error: apiError({ code: 'NETWORK_ERROR', message: error?.message || error }, 0) };
            }
        }

        async download(path) {
            try {
                const response = await global.fetch(
                    `${this.client.apiUrl}/api/storage/download/${encodeURIComponent(this.bucket)}/${encodeObjectPath(path)}`,
                    { credentials: 'include', cache: 'no-store' },
                );
                if (!response.ok) {
                    const payload = await response.json().catch(() => ({}));
                    return { data: null, error: apiError(payload, response.status) };
                }
                return { data: await response.blob(), error: null };
            } catch (error) {
                return { data: null, error: apiError({ code: 'NETWORK_ERROR', message: error?.message || error }, 0) };
            }
        }
    }

    class PlatformClient {
        constructor(apiUrl = DEFAULT_API_URL) {
            this.apiUrl = String(apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
            this.storage = { from: bucket => new PlatformStorageBucket(this, bucket) };
        }

        from(table) {
            return new PlatformQuery(this, table);
        }
    }

    global.createPlatformClient = function createPlatformClient(apiUrl) {
        return new PlatformClient(apiUrl);
    };
    global.ROPlatformClient = { PlatformClient, PlatformQuery, PlatformStorageBucket };
})(typeof window !== 'undefined' ? window : globalThis);

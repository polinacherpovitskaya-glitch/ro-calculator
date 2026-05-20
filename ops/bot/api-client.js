const crypto = require('node:crypto');

class OpsApiError extends Error {
    constructor(message, { status = 0, code = 'OPS_API_ERROR', details = undefined } = {}) {
        super(message);
        this.name = 'OpsApiError';
        this.status = status;
        this.code = code;
        this.details = details;
    }
}

function normalizeBaseUrl(baseUrl = process.env.OPS_API_URL) {
    const value = String(baseUrl || '').trim();
    if (!value) throw new OpsApiError('OPS_API_URL is required', { code: 'MISSING_OPS_API_URL' });
    return value.replace(/\/+$/, '');
}

function getToken(token = process.env.OPS_BOT_TOKEN) {
    const value = String(token || '').trim();
    if (!value) throw new OpsApiError('OPS_BOT_TOKEN is required', { code: 'MISSING_OPS_BOT_TOKEN' });
    return value;
}

function queryString(query = {}) {
    const params = new URLSearchParams();
    Object.entries(query || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        params.set(key, String(value));
    });
    const text = params.toString();
    return text ? `?${text}` : '';
}

function createOpsApiClient(options = {}) {
    const baseUrl = normalizeBaseUrl(options.baseUrl);
    const token = getToken(options.token);
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== 'function') throw new OpsApiError('fetch is not available', { code: 'MISSING_FETCH' });

    async function request(path, { method = 'GET', query, body, idempotencyKey } = {}) {
        const headers = {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
        };
        const init = { method, headers };
        if (body !== undefined) {
            headers['Content-Type'] = 'application/json';
            init.body = JSON.stringify(body);
        }
        if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
        const res = await fetchImpl(`${baseUrl}${path}${queryString(query)}`, init);
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok) {
            const apiError = json?.error || {};
            throw new OpsApiError(apiError.message || `Ops API request failed with ${res.status}`, {
                status: res.status,
                code: apiError.code || 'OPS_API_ERROR',
                details: apiError.details,
            });
        }
        return json;
    }

    function write(path, method, body, idempotencyKey = crypto.randomUUID()) {
        return request(path, { method, body, idempotencyKey });
    }

    return {
        request,
        listTasks: (query) => request('/api/tasks', { query }),
        getTask: (id) => request(`/api/tasks/${encodeURIComponent(id)}`),
        createTask: (body, idempotencyKey) => write('/api/tasks', 'POST', body, idempotencyKey),
        updateTask: (id, body, idempotencyKey) => write(`/api/tasks/${encodeURIComponent(id)}`, 'PATCH', body, idempotencyKey),
        completeTask: (id, idempotencyKey) => write(`/api/tasks/${encodeURIComponent(id)}/complete`, 'POST', {}, idempotencyKey),
        addComment: (taskId, body, idempotencyKey) => write(`/api/work/tasks/${encodeURIComponent(taskId)}/comments`, 'POST', body, idempotencyKey),
        listEmployees: (query) => request('/api/employees', { query }),
        listBotBindings: (query) => request('/api/bot/bindings', { query }),
        createBotBinding: (body, idempotencyKey) => write('/api/bot/bindings', 'POST', body, idempotencyKey),
        deleteBotBinding: (telegramChatId, idempotencyKey) => write(`/api/bot/bindings/${encodeURIComponent(telegramChatId)}`, 'DELETE', undefined, idempotencyKey),
        listNotificationEvents: (query) => request('/api/bot/notification-events', { query }),
        markNotificationProcessed: (id, idempotencyKey) => write(`/api/bot/notification-events/${encodeURIComponent(id)}/processed`, 'PATCH', undefined, idempotencyKey),
    };
}

module.exports = {
    OpsApiError,
    createOpsApiClient,
    normalizeBaseUrl,
    queryString,
};

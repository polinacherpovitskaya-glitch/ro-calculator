const assert = require('node:assert/strict');
const { test } = require('node:test');
const { OpsApiError, createOpsApiClient, normalizeBaseUrl, queryString } = require('../api-client');

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => JSON.stringify(body),
    };
}

test('normalizeBaseUrl trims trailing slashes', () => {
    assert.equal(normalizeBaseUrl('https://ops.example.test///'), 'https://ops.example.test');
});

test('normalizeBaseUrl requires a value', () => {
    assert.throws(() => normalizeBaseUrl(''), /OPS_API_URL/);
});

test('queryString skips empty values and encodes the rest', () => {
    assert.equal(queryString({ status: 'todo', empty: '', assignee_id: 123 }), '?status=todo&assignee_id=123');
});

test('client sends bearer token and idempotency key for writes', async () => {
    const calls = [];
    const client = createOpsApiClient({
        baseUrl: 'https://ops.example.test',
        token: 'secret-token',
        fetch: async (url, init) => {
            calls.push({ url, init });
            return jsonResponse({ task: { id: 1 } }, 201);
        },
    });

    const body = await client.createTask({ title: 'New task', area_id: 1 }, 'idem-1');

    assert.equal(body.task.id, 1);
    assert.equal(calls[0].url, 'https://ops.example.test/api/tasks');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer secret-token');
    assert.equal(calls[0].init.headers['Idempotency-Key'], 'idem-1');
    assert.equal(calls[0].init.body, JSON.stringify({ title: 'New task', area_id: 1 }));
});

test('client appends query params for list requests', async () => {
    let requestedUrl = '';
    const client = createOpsApiClient({
        baseUrl: 'https://ops.example.test/',
        token: 'secret-token',
        fetch: async (url) => {
            requestedUrl = url;
            return jsonResponse({ tasks: [] });
        },
    });

    await client.listTasks({ status: 'todo', assignee_id: 42 });

    assert.equal(requestedUrl, 'https://ops.example.test/api/tasks?status=todo&assignee_id=42');
});

test('client exposes task detail and comment endpoints', async () => {
    const paths = [];
    const client = createOpsApiClient({
        baseUrl: 'https://ops.example.test',
        token: 'secret-token',
        fetch: async (url, init) => {
            paths.push([url, init.method]);
            return jsonResponse({});
        },
    });

    await client.getTask(123);
    await client.updateTask(123, { status: 'review' }, 'idem-2');
    await client.completeTask(123, 'idem-3');
    await client.addComment(123, { body: 'Done' }, 'idem-4');

    assert.deepEqual(paths, [
        ['https://ops.example.test/api/tasks/123', 'GET'],
        ['https://ops.example.test/api/tasks/123', 'PATCH'],
        ['https://ops.example.test/api/tasks/123/complete', 'POST'],
        ['https://ops.example.test/api/work/tasks/123/comments', 'POST'],
    ]);
});

test('client exposes bot bindings and notification event endpoints', async () => {
    const paths = [];
    const client = createOpsApiClient({
        baseUrl: 'https://ops.example.test',
        token: 'secret-token',
        fetch: async (url, init) => {
            paths.push([url, init.method, init.body || '']);
            return jsonResponse({});
        },
    });

    await client.listBotBindings();
    await client.createBotBinding({ telegram_chat_id: '1', employee_id: 2 });
    await client.deleteBotBinding('1');
    await client.listNotificationEvents({ pending: true, limit: 50 });
    await client.markNotificationProcessed(7);

    assert.deepEqual(paths, [
        ['https://ops.example.test/api/bot/bindings', 'GET', ''],
        ['https://ops.example.test/api/bot/bindings', 'POST', JSON.stringify({ telegram_chat_id: '1', employee_id: 2 })],
        ['https://ops.example.test/api/bot/bindings/1', 'DELETE', ''],
        ['https://ops.example.test/api/bot/notification-events?pending=true&limit=50', 'GET', ''],
        ['https://ops.example.test/api/bot/notification-events/7/processed', 'PATCH', ''],
    ]);
});

test('client throws OpsApiError with API code on failed response', async () => {
    const client = createOpsApiClient({
        baseUrl: 'https://ops.example.test',
        token: 'secret-token',
        fetch: async () => jsonResponse({ error: { code: 'FORBIDDEN', message: 'Nope' } }, 403),
    });

    await assert.rejects(
        () => client.listEmployees(),
        (error) => {
            assert.equal(error instanceof OpsApiError, true);
            assert.equal(error.status, 403);
            assert.equal(error.code, 'FORBIDDEN');
            assert.equal(error.message, 'Nope');
            return true;
        }
    );
});

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createPlatformCompatClient } = require('../platform-compat');

function fakeFetch(responseBody = { data: [], error: null }, status = 200) {
    const calls = [];
    const fetch = async (url, options) => {
        calls.push({ url, options, body: JSON.parse(options.body) });
        return {
            ok: status >= 200 && status < 300,
            status,
            text: async () => JSON.stringify(responseBody),
        };
    };
    fetch.calls = calls;
    return fetch;
}

test('platform client preserves the timebot employee lookup contract', async () => {
    const fetch = fakeFetch({ data: [{ id: 42, name: 'Илья' }], error: null });
    const database = createPlatformCompatClient({
        baseUrl: 'https://api.recycleobject.ru',
        token: 'test-token',
        fetch,
    });

    const result = await database
        .from('employees')
        .select('id, name')
        .eq('telegram_id', 700042)
        .eq('is_active', true)
        .limit(1);

    assert.equal(result.error, null);
    assert.deepEqual(result.data, [{ id: 42, name: 'Илья' }]);
    assert.equal(fetch.calls[0].url, 'https://api.recycleobject.ru/api/compat/query');
    assert.equal(fetch.calls[0].options.headers.Authorization, 'Bearer test-token');
    assert.deepEqual(fetch.calls[0].body.filters, [
        { op: 'eq', column: 'telegram_id', value: 700042 },
        { op: 'eq', column: 'is_active', value: true },
    ]);
    assert.equal(fetch.calls[0].body.limit, 1);
});

test('platform client makes time entry inserts idempotent', async () => {
    const fetch = fakeFetch({ data: null, error: null });
    const database = createPlatformCompatClient({
        baseUrl: 'https://api.recycleobject.ru',
        token: 'test-token',
        fetch,
    });

    const result = await database.from('time_entries').insert({
        id: 1001,
        employee_id: 42,
        date: '2026-07-28',
        hours: 8,
        task_description: 'Сборка',
    });

    assert.equal(result.error, null);
    assert.equal(fetch.calls[0].body.action, 'insert');
    assert.equal(fetch.calls[0].options.headers['Idempotency-Key'].length > 10, true);
});

test('platform client supports binding upserts and date/null filters', async () => {
    const fetch = fakeFetch();
    const database = createPlatformCompatClient({
        baseUrl: 'https://api.recycleobject.ru',
        token: 'test-token',
        fetch,
    });

    await database
        .from('bot_telegram_bindings')
        .upsert(
            { telegram_chat_id: 700042, employee_id: 42, is_active: true },
            { onConflict: 'telegram_chat_id' },
        );
    await database
        .from('time_entries')
        .select('*')
        .gte('date', '2026-07-21')
        .lte('date', '2026-07-28')
        .not('task_id', 'is', null)
        .order('date', { ascending: false });

    assert.equal(fetch.calls[0].body.onConflict, 'telegram_chat_id');
    assert.deepEqual(fetch.calls[1].body.filters[2], {
        op: 'not',
        column: 'task_id',
        value: null,
        operator: 'is',
    });
    assert.deepEqual(fetch.calls[1].body.orders, [{ column: 'date', ascending: false }]);
});

test('platform client returns API errors with their original code', async () => {
    const fetch = fakeFetch({ error: { code: '23505', message: 'duplicate' } }, 409);
    const database = createPlatformCompatClient({
        baseUrl: 'https://api.recycleobject.ru',
        token: 'test-token',
        fetch,
    });

    const result = await database.from('time_entries').insert({ id: 1001 });
    assert.equal(result.data, null);
    assert.equal(result.error.code, '23505');
});

test('platform client rejects unsupported tables before issuing a request', () => {
    const database = createPlatformCompatClient({
        baseUrl: 'https://api.recycleobject.ru',
        token: 'test-token',
        fetch: fakeFetch(),
    });
    assert.throws(() => database.from('auth_users'), /Unsupported bot table/);
});

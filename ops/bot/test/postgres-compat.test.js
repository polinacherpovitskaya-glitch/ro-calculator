const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createPostgresCompatClient } = require('../postgres-compat');

function fakePool(rows = []) {
    const calls = [];
    return {
        calls,
        async query(sql, values) {
            calls.push({ sql, values });
            return { rows };
        },
    };
}

test('PostgreSQL client supports the timebot employee lookup contract', async () => {
    const pool = fakePool([{ id: 42, name: 'Илья' }]);
    const database = createPostgresCompatClient({ pool });

    const result = await database
        .from('employees')
        .select('id, name')
        .eq('telegram_id', 700042)
        .eq('is_active', true)
        .limit(1);

    assert.equal(result.error, null);
    assert.deepEqual(result.data, [{ id: 42, name: 'Илья' }]);
    assert.match(pool.calls[0].sql, /SELECT "id", "name" FROM "employees"/);
    assert.match(pool.calls[0].sql, /"telegram_id" = \$1 AND "is_active" = \$2 LIMIT \$3/);
    assert.deepEqual(pool.calls[0].values, [700042, true, 1]);
});

test('PostgreSQL client inserts time entries with parameterized values', async () => {
    const pool = fakePool([{ id: 1001 }]);
    const database = createPostgresCompatClient({ pool });

    const result = await database.from('time_entries').insert({
        id: 1001,
        employee_id: 42,
        date: '2026-07-28',
        hours: 8,
        task_description: 'Сборка',
    });

    assert.equal(result.error, null);
    assert.match(pool.calls[0].sql, /^INSERT INTO "time_entries"/);
    assert.match(pool.calls[0].sql, /RETURNING \*$/);
    assert.deepEqual(pool.calls[0].values, [1001, 42, '2026-07-28', 8, 'Сборка']);
});

test('PostgreSQL client supports safe binding updates and upserts', async () => {
    const pool = fakePool([]);
    const database = createPostgresCompatClient({ pool });

    await database
        .from('bot_telegram_bindings')
        .update({ is_active: false })
        .eq('employee_id', 42)
        .neq('telegram_chat_id', 700042);
    await database
        .from('bot_telegram_bindings')
        .upsert(
            { telegram_chat_id: 700042, employee_id: 42, is_active: true },
            { onConflict: 'telegram_chat_id' },
        );

    assert.match(pool.calls[0].sql, /^UPDATE "bot_telegram_bindings"/);
    assert.deepEqual(pool.calls[0].values, [false, 42, 700042]);
    assert.match(pool.calls[1].sql, /ON CONFLICT \("telegram_chat_id"\) DO UPDATE SET/);
});

test('PostgreSQL client supports NULL and range filters', async () => {
    const pool = fakePool([]);
    const database = createPostgresCompatClient({ pool });

    await database
        .from('time_entries')
        .select('*')
        .gte('date', '2026-07-21')
        .lte('date', '2026-07-28')
        .not('task_id', 'is', null)
        .order('date', { ascending: false });

    assert.match(pool.calls[0].sql, /"date" >= \$1 AND "date" <= \$2 AND "task_id" IS NOT NULL/);
    assert.match(pool.calls[0].sql, /ORDER BY "date" DESC/);
});

test('PostgreSQL client rejects unsupported tables before issuing SQL', () => {
    const database = createPostgresCompatClient({ pool: fakePool([]) });
    assert.throws(() => database.from('auth_users'), /Unsupported bot table/);
});

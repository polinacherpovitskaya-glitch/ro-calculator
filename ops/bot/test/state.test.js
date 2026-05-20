const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test, after } = require('node:test');
const { getPool, closePool } = require('../db');
const {
    clearState,
    cleanupOldMessages,
    enqueueMessage,
    loadState,
    markProcessed,
    saveState,
    takeNextMessage,
} = require('../state');

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || 'postgres://ops:ops_dev_password@127.0.0.1:5433/ops';

after(async () => {
    await closePool();
});

function id() {
    return Number(`12${Math.floor(Math.random() * 1000000000)}`);
}

async function createBinding() {
    const pool = getPool();
    const employeeId = id();
    const chatId = id();
    await pool.query(`INSERT INTO employees (id, name, email) VALUES ($1, $2, $3)`, [
        employeeId,
        `Bot Test ${employeeId}`,
        `bot-${crypto.randomUUID()}@x.test`,
    ]);
    await pool.query(
        `INSERT INTO bot_telegram_bindings (telegram_chat_id, telegram_username, employee_id)
         VALUES ($1, $2, $3)`,
        [chatId, `user_${chatId}`, employeeId]
    );
    return { employeeId, chatId };
}

test('saveState then loadState returns the saved state', async () => {
    const { chatId } = await createBinding();
    await saveState(chatId, { flow: 'time_entry', step: 'asking_hours', draft: { hours: 2 } });

    const state = await loadState(chatId);

    assert.equal(state.flow, 'time_entry');
    assert.equal(state.step, 'asking_hours');
    assert.deepEqual(state.draft, { hours: 2 });
});

test('second saveState overwrites the previous state', async () => {
    const { chatId } = await createBinding();
    await saveState(chatId, { flow: 'time_entry', step: 'asking_hours', draft: { hours: 1 } });
    await saveState(chatId, { flow: 'task_create', step: 'asking_title', draft: { title: 'Fix' } });

    const state = await loadState(chatId);

    assert.equal(state.flow, 'task_create');
    assert.equal(state.step, 'asking_title');
    assert.deepEqual(state.draft, { title: 'Fix' });
});

test('expired state loads as idle', async () => {
    const { chatId } = await createBinding();
    await saveState(chatId, { flow: 'time_entry', step: 'asking_hours', draft: { hours: 3 } });
    await getPool().query(`UPDATE bot_conversation_state SET expires_at = NOW() - INTERVAL '1 minute' WHERE chat_id = $1`, [chatId]);

    const state = await loadState(chatId);

    assert.deepEqual(state, { flow: 'idle', step: null, draft: {} });
});

test('clearState removes conversation state', async () => {
    const { chatId } = await createBinding();
    await saveState(chatId, { flow: 'task_create', step: 'asking_title', draft: { title: 'A' } });
    await clearState(chatId);

    const state = await loadState(chatId);

    assert.deepEqual(state, { flow: 'idle', step: null, draft: {} });
});

test('enqueueMessage and takeNextMessage return messages in FIFO order', async () => {
    const { chatId } = await createBinding();
    await enqueueMessage(chatId, 1, 'first', { n: 1 });
    await enqueueMessage(chatId, 2, 'second', { n: 2 });

    const first = await takeNextMessage(chatId);
    await markProcessed(first.id);
    const second = await takeNextMessage(chatId);

    assert.equal(first.text, 'first');
    assert.equal(second.text, 'second');
});

test('takeNextMessage skips messages already taken by another worker', async () => {
    const { chatId } = await createBinding();
    await enqueueMessage(chatId, 10, 'first');
    await enqueueMessage(chatId, 11, 'second');

    const [first, second] = await Promise.all([takeNextMessage(chatId), takeNextMessage(chatId)]);

    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first.id, second.id);
    assert.deepEqual([first.text, second.text].sort(), ['first', 'second']);
});

test('cleanupOldMessages removes processed stale inbox rows', async () => {
    const { chatId } = await createBinding();
    await enqueueMessage(chatId, 20, 'old');
    const message = await takeNextMessage(chatId);
    await markProcessed(message.id);
    await getPool().query(`UPDATE bot_message_inbox SET processed_at = NOW() - INTERVAL '8 days' WHERE id = $1`, [message.id]);

    await cleanupOldMessages();

    const { rows } = await getPool().query(`SELECT id FROM bot_message_inbox WHERE id = $1`, [message.id]);
    assert.equal(rows.length, 0);
});

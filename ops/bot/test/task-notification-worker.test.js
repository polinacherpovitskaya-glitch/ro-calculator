const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createTaskNotificationWorker } = require('../task-notification-worker');

test('API-backed task notification worker delivers to active telegram binding and marks processed', async () => {
    const delivered = [];
    const processed = [];
    const apiClient = {
        listNotificationEvents: async (query) => {
            assert.deepEqual(query, { pending: true, limit: 50 });
            return {
                events: [{
                    id: 1,
                    task_id: 10,
                    event_type: 'task_assigned',
                    payload: { assignee_id: 42 },
                }],
            };
        },
        listEmployees: async () => ({ employees: [{ id: 42, name: 'Ada', is_active: true }] }),
        listBotBindings: async () => ({
            bindings: [{ employee_id: 42, telegram_chat_id: '700000042', is_active: true }],
        }),
        listTasks: async () => ({
            tasks: [{ id: 10, title: 'Fix conveyor', assignee_id: 42, reporter_name: 'Polina', status: 'todo' }],
        }),
        markNotificationProcessed: async (id) => {
            processed.push(id);
            return { event: { id, processed_at: new Date().toISOString() } };
        },
    };
    const worker = createTaskNotificationWorker({
        apiClient,
        sendMessage: async (chatId, text) => {
            delivered.push({ chatId, text });
            return true;
        },
        logger: { error() {}, warn() {} },
    });

    const result = await worker.processTaskNotifications();

    assert.deepEqual(result, { processed: 1, delivered: 1 });
    assert.deepEqual(processed, [1]);
    assert.equal(delivered[0].chatId, '700000042');
    assert.match(delivered[0].text, /Fix conveyor/);
});

test('API-backed task notification worker marks undeliverable events processed', async () => {
    const processed = [];
    const apiClient = {
        listNotificationEvents: async () => ({ events: [{ id: 2, task_id: 11, event_type: 'unknown', payload: {} }] }),
        listEmployees: async () => ({ employees: [{ id: 42, name: 'Ada', is_active: true }] }),
        listBotBindings: async () => ({ bindings: [{ employee_id: 42, telegram_chat_id: '700000042', is_active: true }] }),
        listTasks: async () => ({ tasks: [{ id: 11, title: 'No recipient' }] }),
        markNotificationProcessed: async (id) => {
            processed.push(id);
            return { event: { id } };
        },
    };
    const worker = createTaskNotificationWorker({
        apiClient,
        sendMessage: async () => {
            throw new Error('sendMessage should not be called');
        },
        logger: { error() {}, warn() {} },
    });

    const result = await worker.processTaskNotifications();

    assert.deepEqual(result, { processed: 1, delivered: 0 });
    assert.deepEqual(processed, [2]);
});

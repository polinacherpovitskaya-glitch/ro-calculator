const assert = require('node:assert/strict');
const path = require('node:path');

const { createTaskNotificationWorker } = require(path.join(__dirname, '..', 'bot', 'task-notification-worker.js'));

const task = {
    id: 1001,
    title: 'Не сохраняется карточка проекта',
    assignee_id: 7,
    reporter_id: 5,
    due_date: '2026-05-11',
    status: 'todo',
};

const event = {
    id: 1778581692286,
    event_type: 'task_assigned',
    task_id: task.id,
    payload: { assignee_id: 7 },
    created_at: '2026-05-12T10:28:06.377Z',
    processed_at: null,
};

function createFakeSupabase(settings) {
    return {
        from(table) {
            if (table === 'task_notification_events') {
                return {
                    select() { return this; },
                    is() { return this; },
                    order() { return this; },
                    limit() {
                        return Promise.resolve({ data: null, error: { message: 'remote events unavailable' } });
                    },
                    update() {
                        return {
                            eq() {
                                return Promise.resolve({ error: null });
                            },
                        };
                    },
                };
            }
            if (table === 'settings') {
                return {
                    key: null,
                    select() { return this; },
                    eq(_column, key) {
                        this.key = key;
                        return this;
                    },
                    maybeSingle() {
                        return Promise.resolve({ data: { value: settings[this.key] }, error: null });
                    },
                    upsert(row) {
                        settings[row.key] = row.value;
                        return Promise.resolve({ error: null });
                    },
                };
            }
            if (table === 'tasks') {
                return {
                    select() {
                        return Promise.resolve({ data: [task], error: null });
                    },
                };
            }
            if (table === 'employees') {
                return {
                    select() { return this; },
                    eq() {
                        return Promise.resolve({
                            data: [
                                { id: 5, name: 'Полина', is_active: true, telegram_id: '555' },
                                { id: 7, name: 'Алина', is_active: true, telegram_id: '777' },
                            ],
                            error: null,
                        });
                    },
                };
            }
            throw new Error(`Unexpected table ${table}`);
        },
    };
}

(async () => {
    const settings = {
        work_task_notification_events_json: JSON.stringify([event]),
        work_tasks_json: JSON.stringify([task]),
    };
    const sent = [];
    const worker = createTaskNotificationWorker({
        supabase: createFakeSupabase(settings),
        sendMessage: async (telegramId, text) => {
            sent.push({ telegramId, text });
            return true;
        },
        logger: { warn() {}, error() {} },
    });

    const result = await worker.processTaskNotifications();
    const savedEvents = JSON.parse(settings.work_task_notification_events_json);

    assert.equal(result.processed, 1);
    assert.equal(result.delivered, 1);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].telegramId, '777');
    assert.match(sent[0].text, /Новая задача для тебя/);
    assert.ok(savedEvents[0].processed_at, 'fallback event must be marked processed even when remote update succeeds');

    console.log('task notification worker fallback smoke checks passed');
})().catch(error => {
    console.error(error);
    process.exit(1);
});

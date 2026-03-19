const assert = require('node:assert/strict');
const path = require('node:path');

const {
    buildTaskNotificationText,
    getTaskNotificationRecipientIds,
} = require(path.join(__dirname, '..', 'bot', 'task-notification-core.js'));

const employeesById = new Map([
    ['5', { id: 5, name: 'Полина' }],
    ['7', { id: 7, name: 'Женя Г' }],
    ['9', { id: 9, name: 'Тая' }],
]);

const task = {
    id: 1001,
    title: 'Проверить макет МТС',
    assignee_id: 7,
    assignee_name: 'Женя Г',
    reporter_id: 5,
    reporter_name: 'Полина',
    reviewer_id: 9,
    due_date: '2026-03-19',
    due_time: '18:00',
    project_title: 'MTC workshop',
    order_name: 'МТС 3 воркшопа',
    status: 'in_progress',
};

assert.deepEqual(
    getTaskNotificationRecipientIds({ event_type: 'task_assigned', payload: { assignee_id: 7 } }, task),
    [7],
);
assert.deepEqual(
    getTaskNotificationRecipientIds({ event_type: 'task_sent_to_review', payload: { watcher_user_ids: [9, 7, 9] } }, task),
    [9, 7],
);
assert.deepEqual(
    getTaskNotificationRecipientIds({ event_type: 'task_sent_to_review', payload: { reviewer_id: 9 } }, task),
    [9],
);
assert.deepEqual(
    getTaskNotificationRecipientIds({ event_type: 'task_mentioned', payload: { mention_user_ids: [7, 9, 7] } }, task),
    [7, 9],
);
assert.deepEqual(
    getTaskNotificationRecipientIds({ event_type: 'task_status_changed', payload: { watcher_user_ids: [9, 5, 9] } }, task),
    [7, 9, 5],
);

const assignedText = buildTaskNotificationText({ event_type: 'task_assigned', task_id: 1001, payload: { assignee_id: 7 } }, task, employeesById);
assert.match(assignedText, /Новая задача для тебя/);
assert.match(assignedText, /Проверить макет МТС/);
assert.match(assignedText, /Полина/);

const reviewText = buildTaskNotificationText({ event_type: 'task_sent_to_review', task_id: 1001, payload: { watcher_user_ids: [9] } }, task, employeesById);
assert.match(reviewText, /ждёт согласования/);
assert.match(reviewText, /Женя Г/);

const mentionText = buildTaskNotificationText({ event_type: 'task_mentioned', task_id: 1001, payload: { mention_user_ids: [7] } }, task, employeesById);
assert.match(mentionText, /Тебя упомянули/);
assert.match(mentionText, /МТС 3 воркшопа/);

const statusChangedText = buildTaskNotificationText({
    event_type: 'task_status_changed',
    task_id: 1001,
    payload: { old_status: 'planned', new_status: 'in_progress', watcher_user_ids: [9] },
}, task, employeesById);
assert.match(statusChangedText, /Статус задачи изменён/);
assert.match(statusChangedText, /Запланировано/);
assert.match(statusChangedText, /В работе/);

console.log('task notification smoke checks passed');

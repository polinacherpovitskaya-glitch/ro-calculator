const TASK_STATUS_LABELS = {
    incoming: 'Входящие',
    planned: 'Запланировано',
    in_progress: 'В работе',
    review: 'На согласовании',
    waiting: 'Ждём',
    done: 'Готово',
    cancelled: 'Отменено',
};

function formatDateRu(value) {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleDateString('ru-RU');
    } catch (error) {
        return String(value);
    }
}

function buildDueLine(task) {
    if (!task || !task.due_date) return '';
    return `\nДедлайн: ${formatDateRu(task.due_date)}${task.due_time ? ` ${task.due_time}` : ''}`;
}

function getTaskNotificationRecipientIds(event, task) {
    const payload = event?.payload || {};
    const dedupe = new Set();
    const push = value => {
        const num = Number(value);
        if (Number.isFinite(num) && num > 0) dedupe.add(num);
    };

    if (event?.event_type === 'task_assigned') {
        push(payload.assignee_id || task?.assignee_id);
    } else if (event?.event_type === 'task_sent_to_review') {
        push(payload.reviewer_id || task?.reviewer_id);
    } else if (event?.event_type === 'task_due_soon') {
        push(task?.assignee_id);
    } else if (event?.event_type === 'task_overdue_state_changed') {
        if (payload.is_overdue) {
            push(task?.assignee_id);
            push(task?.reporter_id);
        }
    } else if (event?.event_type === 'task_mentioned') {
        const ids = Array.isArray(payload.mention_user_ids) ? payload.mention_user_ids : [];
        ids.forEach(push);
    }

    return Array.from(dedupe);
}

function buildTaskNotificationText(event, task, employeesById = new Map()) {
    const payload = event?.payload || {};
    const taskTitle = task?.title || `Задача #${event?.task_id || '—'}`;
    const assigneeName = task?.assignee_name || employeesById.get(String(task?.assignee_id || ''))?.name || '—';
    const reporterName = task?.reporter_name || employeesById.get(String(task?.reporter_id || ''))?.name || '—';
    const statusLabel = TASK_STATUS_LABELS[task?.status] || 'Задача';
    const dueLine = buildDueLine(task);
    const contextLines = [
        task?.project_title ? `Проект: ${task.project_title}` : '',
        task?.order_name ? `Заказ: ${task.order_name}` : '',
    ].filter(Boolean);
    const contextBlock = contextLines.length ? `\n${contextLines.join('\n')}` : '';

    switch (event?.event_type) {
    case 'task_assigned':
        return `Новая задача для тебя\n${taskTitle}${dueLine}${contextBlock}\nПоставил: ${reporterName}`;
    case 'task_sent_to_review':
        return `Задача ждёт согласования\n${taskTitle}${dueLine}${contextBlock}\nИсполнитель: ${assigneeName}`;
    case 'task_due_soon':
        return `Скоро дедлайн по задаче\n${taskTitle}${dueLine}${contextBlock}\nСтатус: ${statusLabel}`;
    case 'task_overdue_state_changed':
        if (!payload.is_overdue) return '';
        return `Задача просрочена\n${taskTitle}${dueLine}${contextBlock}\nСтатус: ${statusLabel}`;
    case 'task_mentioned':
        return `Тебя упомянули в задаче\n${taskTitle}${dueLine}${contextBlock}`;
    default:
        return '';
    }
}

module.exports = {
    TASK_STATUS_LABELS,
    buildTaskNotificationText,
    getTaskNotificationRecipientIds,
};

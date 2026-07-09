const { buildTaskNotificationText, getTaskNotificationRecipientIds } = require('./task-notification-core');

const DEFAULT_WORK_SETTINGS_KEYS = {
    tasks: 'work_tasks_json',
    taskNotificationEvents: 'work_task_notification_events_json',
};

function buildEmployeeMap(list) {
    return new Map((list || []).map(item => [String(item.id), item]));
}

function createTaskNotificationWorker({
    supabase,
    apiClient,
    sendMessage,
    logger = console,
    messageOptions = {},
    settingsKeys = DEFAULT_WORK_SETTINGS_KEYS,
}) {
    if (!supabase && !apiClient) throw new Error('Task notification worker requires supabase or apiClient');
    if (typeof sendMessage !== 'function') throw new Error('Task notification worker requires sendMessage function');

    async function loadJsonSetting(settingKey, fallbackValue = null) {
        if (!supabase) return fallbackValue;
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('value')
                .eq('key', settingKey)
                .maybeSingle();
            if (error || !data?.value) return fallbackValue;
            return JSON.parse(data.value);
        } catch (error) {
            return fallbackValue;
        }
    }

    async function saveJsonSetting(settingKey, value) {
        if (!supabase) return;
        try {
            await supabase
                .from('settings')
                .upsert({
                    key: settingKey,
                    value: JSON.stringify(value),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'key' });
        } catch (error) {
            logger.error(`Task notifications: failed to save ${settingKey}:`, error?.message || error);
        }
    }

    async function loadPendingTaskNotificationEvents() {
        if (apiClient) {
            const { events } = await apiClient.listNotificationEvents({ pending: true, limit: 50 });
            return Array.isArray(events) ? events : [];
        }
        try {
            const { data, error } = await supabase
                .from('task_notification_events')
                .select('*')
                .is('processed_at', null)
                .order('created_at', { ascending: true })
                .limit(50);
            if (!error && Array.isArray(data)) return data;
        } catch (error) {
            logger.warn('Task notifications: remote event table unavailable, using settings fallback.');
        }
        const staged = await loadJsonSetting(settingsKeys.taskNotificationEvents, []);
        return (Array.isArray(staged) ? staged : [])
            .filter(item => !item?.processed_at)
            .sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')));
    }

    async function markFallbackTaskNotificationProcessed(eventId, processedAt) {
        const staged = await loadJsonSetting(settingsKeys.taskNotificationEvents, []);
        if (!Array.isArray(staged)) return;
        let changed = false;
        const next = staged.map(item => {
            if (String(item?.id) !== String(eventId) || item?.processed_at) return item;
            changed = true;
            return { ...item, processed_at: processedAt };
        });
        if (changed) await saveJsonSetting(settingsKeys.taskNotificationEvents, next);
    }

    async function markTaskNotificationProcessed(eventId) {
        const processedAt = new Date().toISOString();
        if (apiClient) {
            await apiClient.markNotificationProcessed(eventId);
            return;
        }
        try {
            const { error } = await supabase
                .from('task_notification_events')
                .update({ processed_at: processedAt })
                .eq('id', eventId);
            if (error) {
                logger.warn('Task notifications: failed to mark remote event processed:', error.message || error);
            }
        } catch (error) {
            logger.warn('Task notifications: remote event table unavailable while marking processed.');
        }
        await markFallbackTaskNotificationProcessed(eventId, processedAt);
    }

    async function loadWorkTasksSnapshot() {
        if (apiClient) {
            const { tasks } = await apiClient.listTasks();
            return Array.isArray(tasks) ? tasks : [];
        }
        try {
            const { data, error } = await supabase.from('tasks').select('*');
            if (!error && Array.isArray(data)) return data;
        } catch (error) {
            logger.warn('Task notifications: remote tasks table unavailable, using settings fallback.');
        }
        const staged = await loadJsonSetting(settingsKeys.tasks, []);
        return Array.isArray(staged) ? staged : [];
    }

    async function processTaskNotifications() {
        const events = await loadPendingTaskNotificationEvents();
        if (!events || events.length === 0) return { processed: 0, delivered: 0 };

        let employees = [];
        let tasks = [];
        if (apiClient) {
            const [employeesResp, bindingsResp, tasksResp] = await Promise.all([
                apiClient.listEmployees({ active: true }),
                apiClient.listBotBindings(),
                loadWorkTasksSnapshot(),
            ]);
            const activeBindings = new Map((bindingsResp.bindings || [])
                .filter(binding => binding.is_active)
                .map(binding => [String(binding.employee_id), binding.telegram_chat_id]));
            employees = (employeesResp.employees || []).map(employee => ({
                ...employee,
                telegram_id: activeBindings.get(String(employee.id)) || null,
            }));
            tasks = tasksResp;
        } else {
            const [employeesResp, tasksResp] = await Promise.all([
                supabase.from('employees').select('*').eq('is_active', true),
                loadWorkTasksSnapshot(),
            ]);

            if (employeesResp.error) {
                logger.error('Task notifications: failed to load employees:', employeesResp.error.message);
                return { processed: 0, delivered: 0 };
            }
            employees = employeesResp.data || [];
            tasks = tasksResp;
        }

        const employeesById = buildEmployeeMap(employees);
        const tasksById = new Map((tasks || []).map(task => [String(task.id), task]));
        let processed = 0;
        let delivered = 0;

        for (const event of events) {
            const task = event?.task_id ? tasksById.get(String(event.task_id)) || null : null;
            const recipientIds = getTaskNotificationRecipientIds(event, task);
            const text = buildTaskNotificationText(event, task, employeesById);

            if (!text || recipientIds.length === 0) {
                await markTaskNotificationProcessed(event.id);
                processed += 1;
                continue;
            }

            for (const recipientId of recipientIds) {
                const employee = employeesById.get(String(recipientId));
                if (!employee?.telegram_id) continue;
                const result = await sendMessage(employee.telegram_id, text, messageOptions);
                if (result) delivered += 1;
            }

            await markTaskNotificationProcessed(event.id);
            processed += 1;
        }

        return { processed, delivered };
    }

    return {
        processTaskNotifications,
    };
}

module.exports = {
    DEFAULT_WORK_SETTINGS_KEYS,
    createTaskNotificationWorker,
};

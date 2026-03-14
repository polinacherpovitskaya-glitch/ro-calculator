const TaskEvents = {
    handlers: [],

    register(handler) {
        if (typeof handler === 'function') this.handlers.push(handler);
    },

    async emit(eventType, payload) {
        const event = await appendTaskNotificationEvent({
            event_type: eventType,
            task_id: payload?.task_id || null,
            project_id: payload?.project_id || null,
            payload: payload || {},
        });

        for (const handler of this.handlers) {
            try {
                await handler(event);
            } catch (error) {
                console.error('[TaskEvents] handler error:', error);
            }
        }

        return event;
    },
};

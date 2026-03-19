// =============================================
// Recycle Object — Telegram Bot for Time Tracking
// v7: reliability fixes — error handling, polling recovery, graceful shutdown
// =============================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const { buildTaskNotificationText, getTaskNotificationRecipientIds } = require('./task-notification-core');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const ENABLE_TASK_NOTIFICATION_WORKER = String(process.env.ENABLE_TASK_NOTIFICATION_WORKER || 'false').toLowerCase() === 'true';

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
        interval: 1000,       // poll every 1s (default 300ms is aggressive)
        autoStart: true,
        params: { timeout: 30 }, // long-poll 30s
    },
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const WORK_SETTINGS_KEYS = {
    tasks: 'work_tasks_json',
    taskNotificationEvents: 'work_task_notification_events_json',
};

// =============================================
// Polling error handler — KEY for stability
// =============================================
bot.on('polling_error', (err) => {
    const code = err?.response?.statusCode || err?.code || '';
    // 409 = another instance is polling the same bot token
    if (code === 409 || String(err).includes('409')) {
        console.error('FATAL: Another bot instance is running! Conflict 409. Shutting down.');
        process.exit(1);
    }
    // ETIMEOUT / EFATAL — transient, will retry
    if (String(code).startsWith('E') || code === 502 || code === 504) {
        console.warn(`Polling transient error (${code}), will retry...`);
        return;
    }
    console.error('Polling error:', err?.message || err);
});

bot.on('error', (err) => {
    console.error('Bot general error:', err?.message || err);
});

// =============================================
// Graceful shutdown
// =============================================
function shutdown(signal) {
    console.log(`\n${signal} received. Stopping bot...`);
    bot.stopPolling().then(() => {
        console.log('Polling stopped. Exiting.');
        process.exit(0);
    }).catch(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000); // force exit after 3s
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    // Don't exit — let polling continue
});
process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason);
});

// =============================================
// User state management (with auto-cleanup)
// =============================================
const userStates = {};
const STATE_TTL = 30 * 60 * 1000; // 30 minutes

function cleanStaleStates() {
    const now = Date.now();
    for (const [key, state] of Object.entries(userStates)) {
        if (now - (state._ts || 0) > STATE_TTL) {
            delete userStates[key];
        }
    }
}
setInterval(cleanStaleStates, 5 * 60 * 1000); // every 5 min

function setState(telegramId, data) {
    userStates[telegramId] = { ...data, _ts: Date.now() };
}
function getState(telegramId) {
    const s = userStates[telegramId];
    if (s) s._ts = Date.now(); // refresh TTL on access
    return s;
}
function clearState(telegramId) {
    delete userStates[telegramId];
}

// =============================================
// Safe message sender (catches errors, retries once)
// =============================================
async function send(chatId, text, opts) {
    try {
        return await bot.sendMessage(chatId, text, opts);
    } catch (err) {
        const code = err?.response?.statusCode;
        // 429 = rate limit, retry after 1s
        if (code === 429) {
            await new Promise(r => setTimeout(r, 1500));
            try { return await bot.sendMessage(chatId, text, opts); } catch (e) { /* give up */ }
        }
        // 403 = blocked by user, ignore
        if (code === 403) {
            console.log(`User ${chatId} blocked the bot, skipping.`);
            return null;
        }
        console.error(`sendMessage error (${code}):`, err?.message || err);
        return null;
    }
}

// =============================================
// Constants
// =============================================
const ROLE_LABELS = { production: 'Производство', office: 'Офис', management: 'Руководство' };
const STAGE_LABELS = {
    casting: 'Выливание пластика',
    trim: 'Срезание литника',
    assembly: 'Сборка',
    packaging: 'Упаковка',
    other: 'Другое',
};
const PRODUCTION_STATUSES = ['production_casting', 'production_printing', 'production_hardware', 'production_packaging', 'in_production', 'delivery'];

// Persistent reply keyboard (shown after login)
const MAIN_KEYBOARD = {
    reply_markup: {
        keyboard: [
            [{ text: '📝 Записать часы' }],
            [{ text: '📊 Сегодня' }, { text: '📅 Неделя' }],
        ],
        resize_keyboard: true,
        is_persistent: true,
    },
};

// =============================================
// /start — employee linking
// =============================================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const { data: existing } = await supabase
            .from('employees')
            .select('*')
            .eq('telegram_id', telegramId)
            .single();

        if (existing) {
            send(chatId, `Привет, ${existing.name}! 👋`, MAIN_KEYBOARD);
            return;
        }

        const { data: employees } = await supabase
            .from('employees')
            .select('id, name, role')
            .eq('is_active', true)
            .is('telegram_id', null);

        if (!employees || employees.length === 0) {
            send(chatId,
                'Нет доступных профилей сотрудников.\n' +
                'Попросите администратора добавить вас через Настройки → Сотрудники.'
            );
            return;
        }

        const keyboard = employees.map(e => ([{
            text: e.name,
            callback_data: `link_${e.id}`,
        }]));

        setState(telegramId, { step: 'link_choose_name' });

        send(chatId, 'Привет! Выбери своё имя:', {
            reply_markup: { inline_keyboard: keyboard },
        });
    } catch (err) {
        console.error('/start error:', err);
        send(chatId, 'Произошла ошибка. Попробуй позже.');
    }
});

// =============================================
// /help
// =============================================

bot.onText(/\/help/, (msg) => {
    send(msg.chat.id,
        `Как пользоваться ботом:\n\n` +
        `1. Нажми «📝 Записать часы»\n` +
        `2. Выбери проект\n` +
        `3. Выбери этап работ\n` +
        `4. Выбери или введи часы\n` +
        `5. Добавь ещё или заверши\n\n` +
        `Бот записывает фактические часы по этапам.`,
        MAIN_KEYBOARD
    );
});

// =============================================
// /status
// =============================================

bot.onText(/\/status/, async (msg) => {
    try {
        const emp = await getEmployee(msg.from.id);
        if (!emp) {
            send(msg.chat.id, 'Ты не подключён. Нажми /start');
            return;
        }

        const payInfo = emp.role === 'production'
            ? `\nОплата: оклад ${fmtMoney(emp.pay_base_salary_month)}/мес, база ${num(emp.pay_base_hours_month, 176)}ч, сверх ${fmtMoney(emp.pay_overtime_hour_rate)}/ч`
            : '';
        send(msg.chat.id,
            `Профиль:\n\n` +
            `Имя: *${esc(emp.name)}*\n` +
            `Роль: ${ROLE_LABELS[emp.role] || emp.role}\n` +
            `Рабочий день: ${emp.daily_hours}ч` +
            payInfo,
            { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
        );
    } catch (err) {
        console.error('/status error:', err);
        send(msg.chat.id, 'Ошибка. Попробуй ещё раз.');
    }
});

// =============================================
// /report
// =============================================

bot.onText(/\/report/, async (msg) => {
    await startReport(msg.chat.id, msg.from.id);
});

// =============================================
// /clear
// =============================================

bot.onText(/\/clear/, async (msg) => {
    try {
        const emp = await getEmployee(msg.from.id);
        if (!emp) {
            send(msg.chat.id, 'Ты не подключён. Нажми /start');
            return;
        }

        const today = getLocalDate(emp.timezone_offset);
        const { error } = await supabase
            .from('time_entries')
            .delete()
            .eq('employee_id', emp.id)
            .eq('date', today);

        if (error) send(msg.chat.id, 'Ошибка удаления. Попробуй ещё раз.');
        else send(msg.chat.id, 'Записи за сегодня удалены.', MAIN_KEYBOARD);
    } catch (err) {
        console.error('/clear error:', err);
        send(msg.chat.id, 'Ошибка. Попробуй ещё раз.');
    }
});

// =============================================
// callback buttons
// =============================================

bot.on('callback_query', async (query) => {
    const telegramId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;
    const state = getState(telegramId);

    bot.answerCallbackQuery(query.id).catch(() => {});

    try {
        // --- Link employee ---
        if (data.startsWith('link_')) {
            if (!state || state.step !== 'link_choose_name') return;
            const empId = data.replace('link_', '');

            const { error } = await supabase
                .from('employees')
                .update({
                    telegram_id: telegramId,
                    telegram_username: query.from.username || '',
                })
                .eq('id', empId);

            if (error) {
                send(chatId, 'Ошибка привязки. Попробуй ещё раз: /start');
                clearState(telegramId);
                return;
            }

            const { data: emp } = await supabase.from('employees').select('*').eq('id', empId).single();
            clearState(telegramId);

            send(chatId,
                `Готово! Привет, ${emp.name}! 👋\n\n` +
                `Нажми «📝 Записать часы» чтобы начать.`,
                MAIN_KEYBOARD
            );
            return;
        }

        if (!state) return;

        // --- Choose project ---
        if (data.startsWith('proj_')) {
            if (state.step !== 'choose_project') return;

            if (data === 'proj_custom') {
                state.step = 'enter_custom_project';
                send(chatId, 'Введи название проекта:');
                return;
            }

            const orderId = data.replace('proj_', '');
            const project = (state.projects || []).find(p => String(p.id) === orderId);
            state.current_project = project ? project.order_name : `Проект #${orderId}`;
            state.current_order_id = orderId;
            await showStagePicker(chatId, state);
            return;
        }

        // --- Choose stage ---
        if (data.startsWith('stage_')) {
            if (state.step !== 'choose_stage') return;

            const stageKey = data.replace('stage_', '');
            if (stageKey === 'other') {
                state.step = 'enter_stage_other';
                send(chatId, 'Опиши этап работ (своими словами):');
                return;
            }

            state.current_stage = stageKey;
            state.current_stage_label = STAGE_LABELS[stageKey] || stageKey;
            askHours(chatId, state);
            return;
        }

        // --- Hours buttons ---
        if (data.startsWith('hours_')) {
            if (state.step !== 'enter_hours') return;

            if (data === 'hours_custom') {
                state.step = 'enter_hours_custom';
                send(chatId, 'Введи количество часов (например: 2.5):');
                return;
            }

            const hours = parseFloat(data.replace('hours_', ''));
            if (Number.isNaN(hours) || hours <= 0) return;
            handleHoursEntry(chatId, telegramId, state, hours);
            return;
        }

        // --- More entries / finish ---
        if (data === 'more_entries') {
            await showProjectPicker(chatId, telegramId, state.employee, state.existing_hours, state.entries);
            return;
        }

        if (data === 'finish_report') {
            await askDescription(chatId, state);
            return;
        }

        // --- Skip description ---
        if (data === 'skip_description') {
            if (state.step !== 'enter_description') return;
            await saveAllEntries(chatId, telegramId, state, '');
            return;
        }
    } catch (err) {
        console.error('Callback error:', err);
        send(chatId, 'Произошла ошибка. Попробуй ещё раз.', MAIN_KEYBOARD);
    }
});

// =============================================
// text handler
// =============================================

bot.on('message', async (msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text.startsWith('/')) return;

    try {
        // --- Reply keyboard buttons ---
        if (text === '📝 Записать часы') {
            await startReport(chatId, telegramId);
            return;
        }

        if (text === '📊 Сегодня') {
            await showToday(chatId, telegramId);
            return;
        }

        if (text === '📅 Неделя') {
            await showWeek(chatId, telegramId);
            return;
        }

        // --- State-based text input ---
        const state = getState(telegramId);
        if (!state) return;

        if (state.step === 'enter_custom_project') {
            if (!text) {
                send(chatId, 'Введи название проекта:');
                return;
            }
            state.current_project = text;
            state.current_order_id = null;
            await showStagePicker(chatId, state);
            return;
        }

        if (state.step === 'enter_stage_other') {
            if (!text) {
                send(chatId, 'Опиши этап работ:');
                return;
            }
            state.current_stage = 'other';
            state.current_stage_label = text;
            askHours(chatId, state);
            return;
        }

        if (state.step === 'enter_hours' || state.step === 'enter_hours_custom') {
            const hours = parseFloat(text.replace(',', '.'));
            if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
                send(chatId, 'Введи число от 0.25 до 24, например: 2.5');
                return;
            }
            handleHoursEntry(chatId, telegramId, state, hours);
            return;
        }

        if (state.step === 'enter_description') {
            await saveAllEntries(chatId, telegramId, state, text);
        }
    } catch (err) {
        console.error('Message handler error:', err);
        send(chatId, 'Произошла ошибка. Попробуй ещё раз.', MAIN_KEYBOARD);
    }
});

// =============================================
// /today and /week (still work as commands too)
// =============================================

bot.onText(/\/today/, async (msg) => {
    await showToday(msg.chat.id, msg.from.id);
});

bot.onText(/\/week/, async (msg) => {
    await showWeek(msg.chat.id, msg.from.id);
});

// =============================================
// helpers
// =============================================

async function getEmployee(telegramId) {
    const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();
    if (error) console.error('getEmployee error:', error.message);
    return data;
}

async function startReport(chatId, telegramId) {
    try {
        const emp = await getEmployee(telegramId);
        if (!emp) {
            send(chatId, 'Ты не подключён. Нажми /start');
            return;
        }

        const today = getLocalDate(emp.timezone_offset);
        const { data: todayEntries } = await supabase
            .from('time_entries')
            .select('hours')
            .eq('employee_id', emp.id)
            .eq('date', today);

        const existingHours = round2((todayEntries || []).reduce((s, e) => s + (parseFloat(e.hours) || 0), 0));
        await showProjectPicker(chatId, telegramId, emp, existingHours, []);
    } catch (err) {
        console.error('startReport error:', err);
        send(chatId, 'Ошибка загрузки. Попробуй ещё раз.', MAIN_KEYBOARD);
    }
}

function handleHoursEntry(chatId, telegramId, state, hours) {
    const cleanHours = round2(hours);
    state.entries.push({
        project_name: state.current_project,
        order_id: state.current_order_id,
        stage: state.current_stage,
        stage_label: state.current_stage_label,
        hours: cleanHours,
    });

    const sessionHours = round2(state.entries.reduce((s, e) => s + e.hours, 0));
    const dayTotal = round2(state.existing_hours + sessionHours);

    state.step = 'choose_more_or_done';
    send(chatId,
        `✅ ${state.current_project} / ${state.current_stage_label} — ${cleanHours}ч\n` +
        `За сегодня: ${dayTotal}ч`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '➕ Добавить ещё', callback_data: 'more_entries' }],
                    [{ text: '✔️ Завершить', callback_data: 'finish_report' }],
                ],
            },
        }
    );
}

async function showProjectPicker(chatId, telegramId, emp, existingHours, entries) {
    let projects = [];
    try {
        const { data } = await supabase
            .from('orders')
            .select('id, order_name, client_name, status')
            .in('status', PRODUCTION_STATUSES)
            .order('updated_at', { ascending: false });
        projects = data || [];
    } catch (e) {
        console.error('Failed to load production orders:', e);
    }

    const keyboard = [];

    projects.forEach(p => {
        const label = p.order_name + (p.client_name ? ` (${p.client_name})` : '');
        keyboard.push([{ text: label, callback_data: `proj_${p.id}` }]);
    });

    keyboard.push([{ text: '📎 Другое', callback_data: 'proj_custom' }]);

    setState(telegramId, {
        step: 'choose_project',
        employee: emp,
        projects,
        existing_hours: existingHours || 0,
        entries: Array.isArray(entries) ? entries : [],
    });

    const sessionHours = round2((entries || []).reduce((s, e) => s + (e.hours || 0), 0));
    const totalHours = round2((existingHours || 0) + sessionHours);

    const intro = totalHours > 0
        ? `${emp.name}, выбери проект.\nСегодня уже: ${totalHours}ч`
        : `${emp.name}, выбери проект:`;

    send(chatId, intro, {
        reply_markup: { inline_keyboard: keyboard },
    });
}

async function showStagePicker(chatId, state) {
    state.step = 'choose_stage';

    const keyboard = [
        [{ text: STAGE_LABELS.casting, callback_data: 'stage_casting' }],
        [{ text: STAGE_LABELS.trim, callback_data: 'stage_trim' }],
        [{ text: STAGE_LABELS.assembly, callback_data: 'stage_assembly' }],
        [{ text: STAGE_LABELS.packaging, callback_data: 'stage_packaging' }],
        [{ text: '📎 Другое', callback_data: 'stage_other' }],
    ];

    send(chatId,
        `Проект: *${esc(state.current_project)}*\nЧто делали?`,
        {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard },
        }
    );
}

function askHours(chatId, state) {
    state.step = 'enter_hours';

    const hourButtons = [
        [
            { text: '1ч', callback_data: 'hours_1' },
            { text: '2ч', callback_data: 'hours_2' },
            { text: '3ч', callback_data: 'hours_3' },
            { text: '4ч', callback_data: 'hours_4' },
        ],
        [
            { text: '5ч', callback_data: 'hours_5' },
            { text: '6ч', callback_data: 'hours_6' },
            { text: '7ч', callback_data: 'hours_7' },
            { text: '8ч', callback_data: 'hours_8' },
        ],
        [
            { text: '0.5ч', callback_data: 'hours_0.5' },
            { text: '1.5ч', callback_data: 'hours_1.5' },
            { text: '2.5ч', callback_data: 'hours_2.5' },
            { text: '10ч', callback_data: 'hours_10' },
        ],
        [
            { text: '📎 Другое (ввести вручную)', callback_data: 'hours_custom' },
        ],
    ];

    send(chatId,
        `Проект: *${esc(state.current_project)}*\n` +
        `Этап: *${esc(state.current_stage_label)}*\n\n` +
        `Сколько часов?`,
        {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: hourButtons },
        }
    );
}

async function askDescription(chatId, state) {
    state.step = 'enter_description';

    const summary = state.entries
        .map(e => `${e.project_name} / ${e.stage_label} — ${e.hours}ч`)
        .join('\n');

    const sessionHours = round2(state.entries.reduce((s, e) => s + e.hours, 0));
    const dayTotal = round2(state.existing_hours + sessionHours);

    const skipButton = state.employee.tasks_required
        ? []  // no skip if required
        : [[{ text: 'Пропустить', callback_data: 'skip_description' }]];

    const commentLabel = state.employee.tasks_required
        ? 'Напиши комментарий к дню:'
        : 'Комментарий к дню (или нажми Пропустить):';

    send(chatId,
        `${summary}\n\n` +
        `Итого за сегодня: *${dayTotal}ч*\n\n` +
        commentLabel,
        {
            parse_mode: 'Markdown',
            reply_markup: skipButton.length ? { inline_keyboard: skipButton } : undefined,
        }
    );
}

function buildMetaDescription(stageKey, stageLabel, projectName, comment) {
    const payload = JSON.stringify({ stage: stageKey, stage_label: stageLabel, project: projectName || '' });
    return `[meta]${payload}[/meta] ${String(comment || '').trim()}`.trim();
}

function parseMeta(taskDescription) {
    const raw = String(taskDescription || '');
    const result = { stage_label: '—', project: '' };
    const markerMatch = raw.match(/^\[meta\](\{.*?\})\[\/meta\]/);
    if (markerMatch) {
        try {
            const parsed = JSON.parse(markerMatch[1]);
            if (parsed?.stage_label) result.stage_label = parsed.stage_label;
            else if (parsed?.stage && STAGE_LABELS[parsed.stage]) result.stage_label = STAGE_LABELS[parsed.stage];
            if (parsed?.project) result.project = parsed.project;
        } catch (e) {
            // ignore
        }
    } else {
        const stageMatch = raw.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
        if (stageMatch) result.stage_label = stageMatch[1].trim();
    }
    return result;
}

async function saveAllEntries(chatId, telegramId, state, comment) {
    const today = getLocalDate(state.employee.timezone_offset);

    if (!state.entries || state.entries.length === 0) {
        send(chatId, 'Нет записей для сохранения.', MAIN_KEYBOARD);
        clearState(telegramId);
        return;
    }

    if (state.employee.tasks_required && !String(comment || '').trim()) {
        send(chatId, 'Комментарий обязателен. Опиши, что делали за день.');
        return;
    }

    try {
        for (const entry of state.entries) {
            const payload = {
                id: Date.now() + Math.floor(Math.random() * 1000),
                employee_id: state.employee.id,
                employee_name: state.employee.name,
                order_id: entry.order_id || null,
                hours: entry.hours,
                date: today,
                task_description: buildMetaDescription(entry.stage, entry.stage_label, entry.project_name, comment),
                notes: comment || null,
            };

            const { error } = await supabase.from('time_entries').insert(payload);
            if (error) throw error;
            await new Promise(r => setTimeout(r, 5));
        }

        const summary = state.entries
            .map(e => `${e.project_name} / ${e.stage_label} — ${e.hours}ч`)
            .join('\n');

        const sessionHours = round2(state.entries.reduce((s, e) => s + e.hours, 0));
        const dayTotal = round2(state.existing_hours + sessionHours);

        const emoji = dayTotal >= 8 ? '💪' : dayTotal >= 4 ? '👍' : '✅';
        send(chatId,
            `${emoji} Супер, ${state.employee.name}! Записано!\n\n` +
            `${summary}\n\n` +
            `Сегодня ты поработал(а): *${dayTotal}ч*\n\n` +
            `Отличная работа! До завтра 🙌`,
            { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
        );
    } catch (e) {
        console.error('Save error:', e);
        send(chatId, 'Ошибка сохранения. Попробуй ещё раз.', MAIN_KEYBOARD);
    }

    clearState(telegramId);
}

// =============================================
// /today and /week as functions
// =============================================

async function showToday(chatId, telegramId) {
    try {
        const emp = await getEmployee(telegramId);
        if (!emp) {
            send(chatId, 'Ты не подключён. Нажми /start');
            return;
        }

        const today = getLocalDate(emp.timezone_offset);
        const { data } = await supabase
            .from('time_entries')
            .select('*')
            .eq('employee_id', emp.id)
            .eq('date', today)
            .order('created_at');

        if (!data || data.length === 0) {
            send(chatId, 'Сегодня пока нет записей.', MAIN_KEYBOARD);
            return;
        }

        let totalHours = 0;
        let text = `Записи за *${today}*:\n\n`;

        data.forEach(e => {
            const meta = parseMeta(e.task_description);
            const project = meta.project || '—';
            text += `${project} / ${meta.stage_label} — ${e.hours}ч\n`;
            totalHours += parseFloat(e.hours) || 0;
        });

        text += `\nИтого: *${round2(totalHours)}ч*`;
        send(chatId, text, { parse_mode: 'Markdown', ...MAIN_KEYBOARD });
    } catch (err) {
        console.error('showToday error:', err);
        send(chatId, 'Ошибка загрузки. Попробуй ещё раз.', MAIN_KEYBOARD);
    }
}

async function showWeek(chatId, telegramId) {
    try {
        const emp = await getEmployee(telegramId);
        if (!emp) {
            send(chatId, 'Ты не подключён. Нажми /start');
            return;
        }

        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];

        const { data } = await supabase
            .from('time_entries')
            .select('*')
            .eq('employee_id', emp.id)
            .gte('date', weekAgoStr)
            .order('date', { ascending: false });

        if (!data || data.length === 0) {
            send(chatId, 'За последнюю неделю записей нет.', MAIN_KEYBOARD);
            return;
        }

        const byDate = {};
        let total = 0;

        data.forEach(e => {
            if (!byDate[e.date]) byDate[e.date] = [];
            byDate[e.date].push(e);
            total += parseFloat(e.hours) || 0;
        });

        let text = 'За последние 7 дней:\n\n';
        Object.entries(byDate)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .forEach(([date, entries]) => {
                const dayTotal = round2(entries.reduce((s, e) => s + (parseFloat(e.hours) || 0), 0));
                text += `*${date}* (${dayTotal}ч):\n`;
                entries.forEach(e => {
                    const meta = parseMeta(e.task_description);
                    const project = meta.project || '—';
                    text += `  ${project} / ${meta.stage_label} — ${e.hours}ч\n`;
                });
            });

        text += `\nИтого: *${round2(total)}ч* за ${Object.keys(byDate).length} дней`;
        send(chatId, text, { parse_mode: 'Markdown', ...MAIN_KEYBOARD });
    } catch (err) {
        console.error('showWeek error:', err);
        send(chatId, 'Ошибка загрузки. Попробуй ещё раз.', MAIN_KEYBOARD);
    }
}

// =============================================
// utility
// =============================================

function getLocalDate(timezoneOffset) {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const localMs = utcMs + (timezoneOffset || 3) * 3600000;
    return new Date(localMs).toISOString().split('T')[0];
}

function round2(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }
function num(v, fallback = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }
function fmtMoney(v) { return `${Math.round(num(v, 0))}₽`; }

// Escape markdown special chars in user-provided text
function esc(s) { return String(s || '').replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1'); }

// =============================================
// reminder system (with error isolation)
// =============================================

let reminderRunning = false;
setInterval(async () => {
    if (reminderRunning) return; // skip if previous run still going
    reminderRunning = true;
    try {
        await checkReminders();
    } catch (e) {
        console.error('Reminder check error:', e);
    } finally {
        reminderRunning = false;
    }
}, 60000);

let taskNotificationRunning = false;
if (ENABLE_TASK_NOTIFICATION_WORKER) {
    setInterval(async () => {
        if (taskNotificationRunning) return;
        taskNotificationRunning = true;
        try {
            await processTaskNotifications();
        } catch (e) {
            console.error('Task notification check error:', e);
        } finally {
            taskNotificationRunning = false;
        }
    }, 60000);
}

async function checkReminders() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const { data: employees, error } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .not('telegram_id', 'is', null);

    if (error) {
        console.error('Reminder: failed to load employees:', error.message);
        return;
    }
    if (!employees || employees.length === 0) return;

    for (const emp of employees) {
        const localHour = (utcHour + (emp.timezone_offset || 3) + 24) % 24;
        const localMinute = utcMinute;

        // Evening reminder — if no entries today
        if (localHour === (emp.reminder_hour || 17) && localMinute === (emp.reminder_minute || 30)) {
            const today = getLocalDate(emp.timezone_offset);
            const { data: todayEntries } = await supabase
                .from('time_entries')
                .select('id')
                .eq('employee_id', emp.id)
                .eq('date', today)
                .limit(1);

            if (!todayEntries || todayEntries.length === 0) {
                send(emp.telegram_id,
                    `${emp.name}, рабочий день подходит к концу.\nЗаполни часы 👇`,
                    MAIN_KEYBOARD
                );
            }
        }

        // Morning reminder — if yesterday (workday) was not filled
        if (localHour === 9 && localMinute === 0) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const dayOfWeek = yesterday.getDay();
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const { data: yesterdayEntries } = await supabase
                .from('time_entries')
                .select('id')
                .eq('employee_id', emp.id)
                .eq('date', yesterdayStr)
                .limit(1);

            if (!yesterdayEntries || yesterdayEntries.length === 0) {
                send(emp.telegram_id,
                    `Доброе утро, ${emp.name}! Вчера (${yesterdayStr}) отчёт не заполнен.\nЗаполни часы 👇`,
                    MAIN_KEYBOARD
                );
            }
        }
    }
}

async function loadJsonSetting(settingKey, fallbackValue = null) {
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
    try {
        await supabase
            .from('settings')
            .upsert({
                key: settingKey,
                value: JSON.stringify(value),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'key' });
    } catch (error) {
        console.error(`Task notifications: failed to save ${settingKey}:`, error?.message || error);
    }
}

async function loadPendingTaskNotificationEvents() {
    try {
        const { data, error } = await supabase
            .from('task_notification_events')
            .select('*')
            .is('processed_at', null)
            .order('created_at', { ascending: true })
            .limit(50);
        if (!error && Array.isArray(data)) return data;
    } catch (error) {
        console.warn('Task notifications: remote event table unavailable, using settings fallback.');
    }
    const staged = await loadJsonSetting(WORK_SETTINGS_KEYS.taskNotificationEvents, []);
    return (Array.isArray(staged) ? staged : [])
        .filter(item => !item?.processed_at)
        .sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')));
}

async function markTaskNotificationProcessed(eventId) {
    const processedAt = new Date().toISOString();
    try {
        const { error } = await supabase
            .from('task_notification_events')
            .update({ processed_at: processedAt })
            .eq('id', eventId);
        if (!error) return;
    } catch (error) {
        // Fall through to settings-backed update below.
    }
    const staged = await loadJsonSetting(WORK_SETTINGS_KEYS.taskNotificationEvents, []);
    if (!Array.isArray(staged)) return;
    const next = staged.map(item => String(item?.id) === String(eventId)
        ? { ...item, processed_at: processedAt }
        : item);
    await saveJsonSetting(WORK_SETTINGS_KEYS.taskNotificationEvents, next);
}

async function loadWorkTasksSnapshot() {
    try {
        const { data, error } = await supabase.from('tasks').select('*');
        if (!error && Array.isArray(data)) return data;
    } catch (error) {
        console.warn('Task notifications: remote tasks table unavailable, using settings fallback.');
    }
    const staged = await loadJsonSetting(WORK_SETTINGS_KEYS.tasks, []);
    return Array.isArray(staged) ? staged : [];
}

function buildEmployeeMap(list) {
    return new Map((list || []).map(item => [String(item.id), item]));
}

async function processTaskNotifications() {
    const events = await loadPendingTaskNotificationEvents();
    if (!events || events.length === 0) return;

    const [employeesResp, tasks] = await Promise.all([
        supabase.from('employees').select('*').eq('is_active', true),
        loadWorkTasksSnapshot(),
    ]);

    if (employeesResp.error) {
        console.error('Task notifications: failed to load employees:', employeesResp.error.message);
        return;
    }

    const employees = employeesResp.data || [];
    const employeesById = buildEmployeeMap(employees);
    const tasksById = new Map((tasks || []).map(task => [String(task.id), task]));

    for (const event of events) {
        const task = event?.task_id ? tasksById.get(String(event.task_id)) || null : null;
        const recipientIds = getTaskNotificationRecipientIds(event, task);
        const text = buildTaskNotificationText(event, task, employeesById);

        if (!text || recipientIds.length === 0) {
            await markTaskNotificationProcessed(event.id);
            continue;
        }

        for (const recipientId of recipientIds) {
            const employee = employeesById.get(String(recipientId));
            if (!employee?.telegram_id) continue;
            await send(employee.telegram_id, text, MAIN_KEYBOARD);
        }

        await markTaskNotificationProcessed(event.id);
    }
}

// =============================================
// Startup
// =============================================

console.log('=== Recycle Object TimeBot v7 ===');
console.log('Improvements: error handling, polling recovery, graceful shutdown, state cleanup');
console.log('Commands: /start, /report, /today, /week, /status, /clear, /help');
console.log(`Task notifications inside TimeBot: ${ENABLE_TASK_NOTIFICATION_WORKER ? 'enabled' : 'disabled'}`);
console.log(`Polling started at ${new Date().toISOString()}`);

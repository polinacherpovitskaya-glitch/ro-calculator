// =============================================
// Recycle Object — Telegram Bot for Time Tracking
// v6: fixed Supabase column mapping (employee_id, task_description)
// =============================================

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const userStates = {};
const ROLE_LABELS = { production: 'Производство', office: 'Офис', management: 'Руководство' };
const STAGE_LABELS = {
    casting: 'Выливание пластика',
    trim: 'Срезание литника',
    assembly: 'Сборка',
    packaging: 'Упаковка',
    other: 'Другое',
};
const PRODUCTION_STATUSES = ['production_casting', 'production_hardware', 'production_packaging', 'in_production'];

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

    const { data: existing } = await supabase
        .from('employees')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

    if (existing) {
        bot.sendMessage(chatId,
            `Привет, ${existing.name}! 👋`,
            MAIN_KEYBOARD
        );
        return;
    }

    const { data: employees } = await supabase
        .from('employees')
        .select('id, name, role')
        .eq('is_active', true)
        .is('telegram_id', null);

    if (!employees || employees.length === 0) {
        bot.sendMessage(chatId,
            'Нет доступных профилей сотрудников.\n' +
            'Попросите администратора добавить вас через Настройки → Сотрудники.'
        );
        return;
    }

    // Just names, no roles
    const keyboard = employees.map(e => ([{
        text: e.name,
        callback_data: `link_${e.id}`,
    }]));

    userStates[telegramId] = { step: 'link_choose_name' };

    bot.sendMessage(chatId, 'Привет! Выбери своё имя:', {
        reply_markup: { inline_keyboard: keyboard },
    });
});

// =============================================
// /help
// =============================================

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
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
    const emp = await getEmployee(msg.from.id);
    if (!emp) {
        bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start');
        return;
    }

    const payInfo = emp.role === 'production'
        ? `\nОплата: оклад ${fmtMoney(emp.pay_base_salary_month)}/мес, база ${num(emp.pay_base_hours_month, 176)}ч, сверх ${fmtMoney(emp.pay_overtime_hour_rate)}/ч`
        : '';
    bot.sendMessage(msg.chat.id,
        `Профиль:\n\n` +
        `Имя: *${emp.name}*\n` +
        `Роль: ${ROLE_LABELS[emp.role] || emp.role}\n` +
        `Рабочий день: ${emp.daily_hours}ч` +
        payInfo,
        { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
    );
});

// =============================================
// /report (still works, but buttons are primary)
// =============================================

bot.onText(/\/report/, async (msg) => {
    await startReport(msg.chat.id, msg.from.id);
});

// =============================================
// /clear
// =============================================

bot.onText(/\/clear/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) {
        bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start');
        return;
    }

    const today = getLocalDate(emp.timezone_offset);
    const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('employee_id', emp.id)
        .eq('date', today);

    if (error) bot.sendMessage(msg.chat.id, 'Ошибка удаления. Попробуй ещё раз.');
    else bot.sendMessage(msg.chat.id, 'Записи за сегодня удалены.', MAIN_KEYBOARD);
});

// =============================================
// callback buttons
// =============================================

bot.on('callback_query', async (query) => {
    const telegramId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;
    const state = userStates[telegramId];

    bot.answerCallbackQuery(query.id);

    // --- Link employee ---
    if (data.startsWith('link_')) {
        if (!state || state.step !== 'link_choose_name') return;
        const empId = parseInt(data.replace('link_', ''), 10);

        const { error } = await supabase
            .from('employees')
            .update({
                telegram_id: telegramId,
                telegram_username: query.from.username || '',
            })
            .eq('id', empId);

        if (error) {
            bot.sendMessage(chatId, 'Ошибка привязки. Попробуй ещё раз: /start');
            delete userStates[telegramId];
            return;
        }

        const { data: emp } = await supabase.from('employees').select('*').eq('id', empId).single();
        delete userStates[telegramId];

        bot.sendMessage(chatId,
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
            bot.sendMessage(chatId, 'Введи название проекта:');
            return;
        }

        const orderId = parseInt(data.replace('proj_', ''), 10);
        const project = (state.projects || []).find(p => Number(p.id) === orderId);
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
            bot.sendMessage(chatId, 'Опиши этап работ (своими словами):');
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
            bot.sendMessage(chatId, 'Введи количество часов (например: 2.5):');
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
});

// =============================================
// text handler
// =============================================

bot.on('message', async (msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    if (text.startsWith('/')) return;

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
    const state = userStates[telegramId];
    if (!state) return;

    if (state.step === 'enter_custom_project') {
        if (!text) {
            bot.sendMessage(chatId, 'Введи название проекта:');
            return;
        }
        state.current_project = text;
        state.current_order_id = null;
        await showStagePicker(chatId, state);
        return;
    }

    if (state.step === 'enter_stage_other') {
        if (!text) {
            bot.sendMessage(chatId, 'Опиши этап работ:');
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
            bot.sendMessage(chatId, 'Введи число от 0.25 до 24, например: 2.5');
            return;
        }
        handleHoursEntry(chatId, telegramId, state, hours);
        return;
    }

    if (state.step === 'enter_description') {
        await saveAllEntries(chatId, telegramId, state, text);
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
    const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();
    return data;
}

async function startReport(chatId, telegramId) {
    const emp = await getEmployee(telegramId);
    if (!emp) {
        bot.sendMessage(chatId, 'Ты не подключён. Нажми /start');
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
    bot.sendMessage(chatId,
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

    // Only production orders + Другое
    projects.forEach(p => {
        const label = p.order_name + (p.client_name ? ` (${p.client_name})` : '');
        keyboard.push([{ text: label, callback_data: `proj_${p.id}` }]);
    });

    keyboard.push([{ text: '📎 Другое', callback_data: 'proj_custom' }]);

    userStates[telegramId] = {
        step: 'choose_project',
        employee: emp,
        projects,
        existing_hours: existingHours || 0,
        entries: Array.isArray(entries) ? entries : [],
    };

    const sessionHours = round2((entries || []).reduce((s, e) => s + (e.hours || 0), 0));
    const totalHours = round2((existingHours || 0) + sessionHours);

    const intro = totalHours > 0
        ? `${emp.name}, выбери проект.\nСегодня уже: ${totalHours}ч`
        : `${emp.name}, выбери проект:`;

    bot.sendMessage(chatId, intro, {
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

    bot.sendMessage(chatId,
        `Проект: *${state.current_project}*\nЧто делали?`,
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

    bot.sendMessage(chatId,
        `Проект: *${state.current_project}*\n` +
        `Этап: *${state.current_stage_label}*\n\n` +
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

    bot.sendMessage(chatId,
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
        bot.sendMessage(chatId, 'Нет записей для сохранения.', MAIN_KEYBOARD);
        delete userStates[telegramId];
        return;
    }

    if (state.employee.tasks_required && !String(comment || '').trim()) {
        bot.sendMessage(chatId, 'Комментарий обязателен. Опиши, что делали за день.');
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
            // Small delay to ensure unique IDs
            await new Promise(r => setTimeout(r, 5));
        }

        const summary = state.entries
            .map(e => `${e.project_name} / ${e.stage_label} — ${e.hours}ч`)
            .join('\n');

        const sessionHours = round2(state.entries.reduce((s, e) => s + e.hours, 0));
        const dayTotal = round2(state.existing_hours + sessionHours);

        const emoji = dayTotal >= 8 ? '💪' : dayTotal >= 4 ? '👍' : '✅';
        bot.sendMessage(chatId,
            `${emoji} Супер, ${state.employee.name}! Записано!\n\n` +
            `${summary}\n\n` +
            `Сегодня ты поработал(а): *${dayTotal}ч*\n\n` +
            `Отличная работа! До завтра 🙌`,
            { parse_mode: 'Markdown', ...MAIN_KEYBOARD }
        );
    } catch (e) {
        console.error('Save error:', e);
        bot.sendMessage(chatId, 'Ошибка сохранения. Попробуй ещё раз.', MAIN_KEYBOARD);
    }

    delete userStates[telegramId];
}

// =============================================
// /today and /week as functions
// =============================================

async function showToday(chatId, telegramId) {
    const emp = await getEmployee(telegramId);
    if (!emp) {
        bot.sendMessage(chatId, 'Ты не подключён. Нажми /start');
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
        bot.sendMessage(chatId, 'Сегодня пока нет записей.', MAIN_KEYBOARD);
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
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...MAIN_KEYBOARD });
}

async function showWeek(chatId, telegramId) {
    const emp = await getEmployee(telegramId);
    if (!emp) {
        bot.sendMessage(chatId, 'Ты не подключён. Нажми /start');
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
        bot.sendMessage(chatId, 'За последнюю неделю записей нет.', MAIN_KEYBOARD);
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
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown', ...MAIN_KEYBOARD });
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
function pad(n) { return String(n || 0).padStart(2, '0'); }
function num(v, fallback = 0) { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; }
function fmtMoney(v) { return `${Math.round(num(v, 0))}₽`; }

// =============================================
// reminder system
// =============================================

setInterval(async () => {
    try {
        await checkReminders();
    } catch (e) {
        console.error('Reminder check error:', e);
    }
}, 60000);

async function checkReminders() {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const { data: employees } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .not('telegram_id', 'is', null);

    if (!employees || employees.length === 0) return;

    for (const emp of employees) {
        const localHour = (utcHour + (emp.timezone_offset || 3) + 24) % 24;
        const localMinute = utcMinute;

        if (localHour === emp.reminder_hour && localMinute === emp.reminder_minute) {
            const today = getLocalDate(emp.timezone_offset);
            const { data: todayEntries } = await supabase
                .from('time_entries')
                .select('id')
                .eq('employee_id', emp.id)
                .eq('date', today);

            if (!todayEntries || todayEntries.length === 0) {
                bot.sendMessage(emp.telegram_id,
                    `${emp.name}, рабочий день подходит к концу.\nЗаполни часы 👇`,
                    MAIN_KEYBOARD
                );
            }
        }

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
                .eq('date', yesterdayStr);

            if (!yesterdayEntries || yesterdayEntries.length === 0) {
                bot.sendMessage(emp.telegram_id,
                    `Доброе утро, ${emp.name}! Вчера (${yesterdayStr}) отчёт не заполнен.\nЗаполни часы 👇`,
                    MAIN_KEYBOARD
                );
            }
        }
    }
}

console.log('=== Recycle Object TimeBot v6 ===');
console.log('Fixed: Supabase column mapping (employee_id, task_description)');
console.log('Commands: /start, /report, /today, /week, /status, /clear, /help');

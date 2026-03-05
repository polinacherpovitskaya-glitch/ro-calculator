// =============================================
// Recycle Object — Telegram Bot for Time Tracking
// v3: проект -> этап -> часы, с поддержкой production-статусов
// =============================================

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
            `Привет, ${existing.name}! Ты уже подключён.\n\n` +
            `Команды:\n` +
            `/report — Записать фактические часы\n` +
            `/today — Мои записи за сегодня\n` +
            `/week — Мои записи за неделю\n` +
            `/status — Мой профиль\n` +
            `/help — Помощь`
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
            'Попросите администратора добавить вас через Настройки -> Сотрудники.'
        );
        return;
    }

    const keyboard = employees.map(e => ([{
        text: `${e.name} (${ROLE_LABELS[e.role] || e.role})`,
        callback_data: `link_${e.id}`,
    }]));

    userStates[telegramId] = { step: 'link_choose_name' };

    bot.sendMessage(chatId, 'Выбери своё имя из списка:', {
        reply_markup: { inline_keyboard: keyboard },
    });
});

// =============================================
// /help
// =============================================

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `Как заполнять отчет:\n\n` +
        `1. Нажми /report\n` +
        `2. Выбери проект (заказ в производстве или Другое)\n` +
        `3. Выбери этап работ\n` +
        `4. Введи часы\n` +
        `5. При необходимости добавь еще этап/проект\n\n` +
        `Бот записывает фактические часы по этапам для план-факта.`
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

    const reminderTime = `${pad(emp.reminder_hour)}:${pad(emp.reminder_minute)} UTC+${emp.timezone_offset}`;
    bot.sendMessage(msg.chat.id,
        `Профиль:\n\n` +
        `Имя: *${emp.name}*\n` +
        `Роль: ${ROLE_LABELS[emp.role] || emp.role}\n` +
        `Рабочий день: ${emp.daily_hours}ч\n` +
        `Напоминание: ${reminderTime}\n` +
        `Комментарий к отчету: ${emp.tasks_required ? 'обязательный' : 'опциональный'}`,
        { parse_mode: 'Markdown' }
    );
});

// =============================================
// /report
// =============================================

bot.onText(/\/report/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const emp = await getEmployee(telegramId);
    if (!emp) {
        bot.sendMessage(chatId, 'Ты не подключён. Нажми /start');
        return;
    }

    const today = getLocalDate(emp.timezone_offset);
    const { data: todayEntries } = await supabase
        .from('time_entries')
        .select('hours')
        .eq('telegram_id', telegramId)
        .eq('date', today);

    const existingHours = round2((todayEntries || []).reduce((s, e) => s + (parseFloat(e.hours) || 0), 0));
    await showProjectPicker(chatId, telegramId, emp, existingHours, []);
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
        .eq('telegram_id', msg.from.id)
        .eq('date', today);

    if (error) bot.sendMessage(msg.chat.id, 'Ошибка удаления. Попробуй ещё раз.');
    else bot.sendMessage(msg.chat.id, 'Записи за сегодня удалены. Нажми /report чтобы заполнить заново.');
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
            `Готово! Привет, ${emp.name}!\n\n` +
            `Твой рабочий день: ${emp.daily_hours}ч\n` +
            `Нажми /report чтобы записать фактическое время.`
        );
        return;
    }

    if (!state) return;

    if (data.startsWith('proj_')) {
        if (state.step !== 'choose_project') return;

        if (data === 'proj_general') {
            state.current_project = 'Общие работы';
            state.current_order_id = null;
            await showStagePicker(chatId, state);
            return;
        }

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

    if (data === 'more_entries') {
        await showProjectPicker(chatId, telegramId, state.employee, state.existing_hours, state.entries);
        return;
    }

    if (data === 'finish_report') {
        await askDescription(chatId, state);
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

    if (state.step === 'enter_hours') {
        const hours = parseFloat(text.replace(',', '.'));
        if (Number.isNaN(hours) || hours <= 0 || hours > 24) {
            bot.sendMessage(chatId, 'Введи корректное число часов от 0.25 до 24, например: 2.5');
            return;
        }

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
            `✓ ${state.current_project} / ${state.current_stage_label} — ${cleanHours}ч\n` +
            `За сегодня уже набрано: ${dayTotal}ч\n\n` +
            `Добавить ещё запись?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: 'Да, добавить', callback_data: 'more_entries' }],
                        [{ text: 'Завершить отчёт', callback_data: 'finish_report' }],
                    ],
                },
            }
        );
        return;
    }

    if (state.step === 'enter_description') {
        await saveAllEntries(chatId, telegramId, state, text);
    }
});

bot.onText(/\/skip/, async (msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const state = userStates[telegramId];

    if (state && state.step === 'enter_description') {
        await saveAllEntries(chatId, telegramId, state, '');
    }
});

// =============================================
// /today
// =============================================

bot.onText(/\/today/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) {
        bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start');
        return;
    }

    const today = getLocalDate(emp.timezone_offset);
    const { data } = await supabase
        .from('time_entries')
        .select('*')
        .eq('telegram_id', msg.from.id)
        .eq('date', today)
        .order('created_at');

    if (!data || data.length === 0) {
        bot.sendMessage(msg.chat.id, 'Сегодня пока нет записей. Нажми /report');
        return;
    }

    let totalHours = 0;
    let text = `Записи за *${today}*:\n\n`;

    data.forEach(e => {
        const stage = parseStageLabel(e.description);
        text += `${e.project_name} / ${stage} — ${e.hours}ч\n`;
        totalHours += parseFloat(e.hours) || 0;
    });

    text += `\nИтого: *${round2(totalHours)}ч*`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// =============================================
// /week
// =============================================

bot.onText(/\/week/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) {
        bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start');
        return;
    }

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    const { data } = await supabase
        .from('time_entries')
        .select('*')
        .eq('telegram_id', msg.from.id)
        .gte('date', weekAgoStr)
        .order('date', { ascending: false });

    if (!data || data.length === 0) {
        bot.sendMessage(msg.chat.id, 'За последнюю неделю записей нет.');
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
                const stage = parseStageLabel(e.description);
                text += `  ${e.project_name} / ${stage} — ${e.hours}ч\n`;
            });
        });

    text += `\nИтого: *${round2(total)}ч* за ${Object.keys(byDate).length} дней`;
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
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
    keyboard.push([{ text: 'Общие работы', callback_data: 'proj_general' }]);

    projects.forEach(p => {
        const label = p.order_name + (p.client_name ? ` (${p.client_name})` : '');
        keyboard.push([{ text: label, callback_data: `proj_${p.id}` }]);
    });

    keyboard.push([{ text: 'Другое (свой проект)', callback_data: 'proj_custom' }]);

    userStates[telegramId] = {
        step: 'choose_project',
        employee: emp,
        projects,
        existing_hours: existingHours || 0,
        entries: Array.isArray(entries) ? entries : [],
    };

    const sessionHours = round2((entries || []).reduce((s, e) => s + (e.hours || 0), 0));
    const totalHours = round2((existingHours || 0) + sessionHours);

    bot.sendMessage(chatId,
        `${emp.name}, выбери проект.\n` +
        `Сегодня уже зафиксировано: ${totalHours}ч`,
        { reply_markup: { inline_keyboard: keyboard } }
    );
}

async function showStagePicker(chatId, state) {
    state.step = 'choose_stage';

    const keyboard = [
        [{ text: STAGE_LABELS.casting, callback_data: 'stage_casting' }],
        [{ text: STAGE_LABELS.trim, callback_data: 'stage_trim' }],
        [{ text: STAGE_LABELS.assembly, callback_data: 'stage_assembly' }],
        [{ text: STAGE_LABELS.packaging, callback_data: 'stage_packaging' }],
        [{ text: STAGE_LABELS.other, callback_data: 'stage_other' }],
    ];

    bot.sendMessage(chatId,
        `Проект: *${state.current_project}*\nВыбери этап работ:`,
        {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: keyboard },
        }
    );
}

function askHours(chatId, state) {
    state.step = 'enter_hours';
    bot.sendMessage(chatId,
        `Проект: *${state.current_project}*\n` +
        `Этап: *${state.current_stage_label}*\n\n` +
        `Сколько часов потратили? (например: 2.5)`,
        { parse_mode: 'Markdown' }
    );
}

async function askDescription(chatId, state) {
    state.step = 'enter_description';

    const summary = state.entries
        .map(e => `${e.project_name} / ${e.stage_label} — ${e.hours}ч`)
        .join('\n');

    const sessionHours = round2(state.entries.reduce((s, e) => s + e.hours, 0));
    const dayTotal = round2(state.existing_hours + sessionHours);

    const suffix = state.employee.tasks_required
        ? '\nКомментарий к дню (обязательно):'
        : '\nКомментарий к дню (необязательно, /skip чтобы пропустить):';

    bot.sendMessage(chatId,
        `Проверка перед сохранением:\n\n${summary}\n\n` +
        `Добавляется: ${sessionHours}ч\n` +
        `Итого за сегодня будет: ${dayTotal}ч` + suffix
    );
}

function buildMetaDescription(stageKey, stageLabel, comment) {
    const payload = JSON.stringify({ stage: stageKey, stage_label: stageLabel });
    return `[meta]${payload}[/meta] ${String(comment || '').trim()}`.trim();
}

function parseStageLabel(description) {
    const raw = String(description || '');
    const markerMatch = raw.match(/^\[meta\](\{.*?\})\[\/meta\]/);
    if (markerMatch) {
        try {
            const parsed = JSON.parse(markerMatch[1]);
            if (parsed?.stage_label) return parsed.stage_label;
            if (parsed?.stage && STAGE_LABELS[parsed.stage]) return STAGE_LABELS[parsed.stage];
        } catch (e) {
            // ignore
        }
    }

    const stageMatch = raw.match(/(?:^|\n)Этап:\s*([^\n]+)/i);
    if (stageMatch) return stageMatch[1].trim();

    return '—';
}

async function saveAllEntries(chatId, telegramId, state, comment) {
    const today = getLocalDate(state.employee.timezone_offset);

    if (!state.entries || state.entries.length === 0) {
        bot.sendMessage(chatId, 'Нет записей для сохранения. Нажми /report.');
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
                worker_name: state.employee.name,
                project_name: entry.project_name,
                order_id: entry.order_id,
                hours: entry.hours,
                date: today,
                description: buildMetaDescription(entry.stage, entry.stage_label, comment),
                source: 'telegram',
                telegram_id: telegramId,
            };

            const { error } = await supabase.from('time_entries').insert(payload);
            if (error) throw error;
        }

        const summary = state.entries
            .map(e => `${e.project_name} / ${e.stage_label} — ${e.hours}ч`)
            .join('\n');

        const sessionHours = round2(state.entries.reduce((s, e) => s + e.hours, 0));
        const dayTotal = round2(state.existing_hours + sessionHours);

        bot.sendMessage(chatId,
            `Записано!\n\n${summary}\n\n` +
            `Добавлено: ${sessionHours}ч\n` +
            `Итого за сегодня: ${dayTotal}ч`
        );
    } catch (e) {
        console.error('Save error:', e);
        bot.sendMessage(chatId, 'Ошибка сохранения. Попробуй ещё раз: /report');
    }

    delete userStates[telegramId];
}

function getLocalDate(timezoneOffset) {
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const localMs = utcMs + (timezoneOffset || 3) * 3600000;
    return new Date(localMs).toISOString().split('T')[0];
}

function round2(n) { return Math.round((parseFloat(n) || 0) * 100) / 100; }
function pad(n) { return String(n || 0).padStart(2, '0'); }

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
                .eq('telegram_id', emp.telegram_id)
                .eq('date', today);

            if (!todayEntries || todayEntries.length === 0) {
                bot.sendMessage(emp.telegram_id,
                    `${emp.name}, рабочий день подходит к концу.\n` +
                    `Заполни, пожалуйста, фактические часы: /report`
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
                .eq('telegram_id', emp.telegram_id)
                .eq('date', yesterdayStr);

            if (!yesterdayEntries || yesterdayEntries.length === 0) {
                bot.sendMessage(emp.telegram_id,
                    `Доброе утро, ${emp.name}. Вчера (${yesterdayStr}) отчёт не заполнен.\n` +
                    `Пожалуйста, заполни: /report`
                );
            }
        }
    }
}

console.log('=== Recycle Object TimeBot v3 ===');
console.log('Flow: project -> stage -> hours');
console.log('Commands: /start, /report, /today, /week, /status, /clear, /help');

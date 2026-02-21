// =============================================
// Recycle Object — Telegram Bot for Time Tracking
// v2: Процентный отчёт, профили сотрудников, напоминания
// =============================================
//
// Для запуска:
// 1. npm init -y
// 2. npm install node-telegram-bot-api @supabase/supabase-js
// 3. Задать переменные окружения:
//    - BOT_TOKEN (токен Telegram бота от @BotFather)
//    - SUPABASE_URL (URL проекта Supabase)
//    - SUPABASE_KEY (service_role ключ Supabase)
// 4. node timebot.js
//
// Для деплоя:
// - Railway.app (бесплатный tier)
// - VPS с pm2
// =============================================

const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');

// === Config ===
const BOT_TOKEN = process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars: BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// User state machine for multi-step reporting
const userStates = {};

// Role labels
const ROLE_LABELS = { production: 'Производство', office: 'Офис', management: 'Руководство' };

// =============================================
// /start — Link employee to Telegram account
// =============================================

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    // Check if already linked
    const { data: existing } = await supabase
        .from('employees')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();

    if (existing) {
        bot.sendMessage(chatId,
            `Привет, ${existing.name}! Ты уже подключён.\n\n` +
            `Команды:\n` +
            `/report — Записать время за день\n` +
            `/today — Мои записи за сегодня\n` +
            `/week — Мои записи за неделю\n` +
            `/status — Мой профиль\n` +
            `/help — Помощь`
        );
        return;
    }

    // Not linked — show list of unlinked employees
    const { data: employees } = await supabase
        .from('employees')
        .select('id, name, role')
        .eq('is_active', true)
        .is('telegram_id', null);

    if (!employees || employees.length === 0) {
        bot.sendMessage(chatId,
            'Нет доступных профилей сотрудников.\n' +
            'Попросите администратора добавить вас через веб-интерфейс (Настройки → Сотрудники).'
        );
        return;
    }

    const keyboard = employees.map(e => ([{
        text: `${e.name} (${ROLE_LABELS[e.role] || e.role})`,
        callback_data: `link_${e.id}`
    }]));

    userStates[telegramId] = { step: 'link_choose_name' };

    bot.sendMessage(chatId, 'Выбери своё имя из списка:', {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// =============================================
// /help
// =============================================

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `Как пользоваться:\n\n` +
        `1. Нажми /report в конце рабочего дня\n` +
        `2. Выбери проект из кнопок\n` +
        `3. Введи % от рабочего дня (например: 60)\n` +
        `4. Если было несколько проектов — бот спросит дальше\n` +
        `5. Когда 100% заполнено — опционально описание задач\n\n` +
        `Бот сам пересчитает проценты в часы по твоему графику.\n` +
        `Напоминание приходит за 30 мин до конца рабочего дня.`
    );
});

// =============================================
// /status — Show employee profile
// =============================================

bot.onText(/\/status/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) { bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start'); return; }

    const reminderTime = `${pad(emp.reminder_hour)}:${pad(emp.reminder_minute)} UTC+${emp.timezone_offset}`;
    bot.sendMessage(msg.chat.id,
        `Профиль:\n\n` +
        `Имя: *${emp.name}*\n` +
        `Роль: ${ROLE_LABELS[emp.role] || emp.role}\n` +
        `Рабочий день: ${emp.daily_hours}ч\n` +
        `Напоминание: ${reminderTime}\n` +
        `Описание задач: ${emp.tasks_required ? 'обязательно' : 'опционально'}`,
        { parse_mode: 'Markdown' }
    );
});

// =============================================
// /report — Percentage-based daily reporting
// =============================================

bot.onText(/\/report/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    const emp = await getEmployee(telegramId);
    if (!emp) {
        bot.sendMessage(chatId, 'Ты не подключён. Нажми /start');
        return;
    }

    // Check if already reported 100% today
    const today = getLocalDate(emp.timezone_offset);
    const { data: todayEntries } = await supabase
        .from('time_entries')
        .select('hours, percentage')
        .eq('telegram_id', telegramId)
        .eq('date', today);

    const existingPct = (todayEntries || []).reduce((s, e) => s + (e.percentage || 0), 0);
    if (existingPct >= 100) {
        bot.sendMessage(chatId,
            `Ты уже отчитался за сегодня (${existingPct}%).\n` +
            `Хочешь перезаписать? Используй /clear чтобы очистить сегодняшние записи.`
        );
        return;
    }

    await showProjectPicker(chatId, telegramId, emp, existingPct);
});

// =============================================
// /clear — Clear today's entries
// =============================================

bot.onText(/\/clear/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) { bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start'); return; }

    const today = getLocalDate(emp.timezone_offset);
    const { error } = await supabase
        .from('time_entries')
        .delete()
        .eq('telegram_id', msg.from.id)
        .eq('date', today);

    if (error) {
        bot.sendMessage(msg.chat.id, 'Ошибка удаления. Попробуй ещё раз.');
    } else {
        bot.sendMessage(msg.chat.id, 'Записи за сегодня удалены. Нажми /report чтобы заполнить заново.');
    }
});

// =============================================
// Callback query handler (buttons)
// =============================================

bot.on('callback_query', async (query) => {
    const telegramId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;
    const state = userStates[telegramId];

    bot.answerCallbackQuery(query.id);

    // --- Employee linking ---
    if (data.startsWith('link_')) {
        if (!state || state.step !== 'link_choose_name') return;
        const empId = parseInt(data.replace('link_', ''));

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

        const { data: emp } = await supabase
            .from('employees').select('*').eq('id', empId).single();

        delete userStates[telegramId];

        bot.sendMessage(chatId,
            `Готово! Привет, ${emp.name}!\n\n` +
            `Твой рабочий день: ${emp.daily_hours}ч\n` +
            `Напоминание в ${pad(emp.reminder_hour)}:${pad(emp.reminder_minute)} (UTC+${emp.timezone_offset})\n\n` +
            `Нажми /report чтобы записать время.`
        );
        return;
    }

    // --- Project selection ---
    if (data.startsWith('proj_')) {
        if (!state || state.step !== 'choose_project') return;

        if (data === 'proj_general') {
            state.current_project = 'Общие работы';
            state.current_order_id = null;
        } else if (data === 'proj_custom') {
            state.step = 'enter_custom_project';
            bot.sendMessage(chatId, 'Введи название проекта:');
            return;
        } else {
            const orderId = parseInt(data.replace('proj_', ''));
            const project = state.projects.find(p => p.id === orderId);
            state.current_project = project ? project.order_name : 'Проект #' + orderId;
            state.current_order_id = orderId;
        }

        askPercentage(chatId, state);
        return;
    }

    // --- More projects or done ---
    if (data === 'more_projects') {
        if (!state) return;
        await showProjectPicker(chatId, telegramId, state.employee, state.total_pct);
        return;
    }

    if (data === 'fill_rest') {
        if (!state || !state.entries.length) return;
        // Add remaining % to last project
        const remaining = 100 - state.total_pct;
        if (remaining > 0) {
            const lastEntry = state.entries[state.entries.length - 1];
            lastEntry.percentage += remaining;
            lastEntry.hours = round2((lastEntry.percentage / 100) * state.employee.daily_hours);
            state.total_pct = 100;
        }
        await askDescription(chatId, state);
        return;
    }

    if (data === 'report_done') {
        if (!state) return;
        // Fill remaining as the current total (allow partial)
        await askDescription(chatId, state);
        return;
    }
});

// =============================================
// Message handler (text input)
// =============================================

bot.on('message', async (msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // Skip commands
    if (text.startsWith('/')) return;

    const state = userStates[telegramId];
    if (!state) return;

    // --- Custom project name ---
    if (state.step === 'enter_custom_project') {
        if (!text) { bot.sendMessage(chatId, 'Введи название проекта:'); return; }
        state.current_project = text;
        state.current_order_id = null;
        askPercentage(chatId, state);
        return;
    }

    // --- Percentage input ---
    if (state.step === 'enter_percentage') {
        const pct = parseInt(text.replace('%', '').trim());
        const remaining = 100 - state.total_pct;

        if (isNaN(pct) || pct < 1 || pct > remaining) {
            bot.sendMessage(chatId, `Введи число от 1 до ${remaining}`);
            return;
        }

        const hours = round2((pct / 100) * state.employee.daily_hours);

        state.entries.push({
            project_name: state.current_project,
            order_id: state.current_order_id,
            percentage: pct,
            hours: hours,
        });
        state.total_pct += pct;

        if (state.total_pct >= 100) {
            await askDescription(chatId, state);
        } else {
            const leftPct = 100 - state.total_pct;
            const leftHours = round2((leftPct / 100) * state.employee.daily_hours);

            bot.sendMessage(chatId,
                `✓ ${state.current_project} — ${pct}% (${hours}ч)\n` +
                `Осталось: ${leftPct}% (${leftHours}ч)\n\n` +
                `Ещё проект?`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: 'Да, ещё проект', callback_data: 'more_projects' }],
                            [{ text: `Остальное ${leftPct}% сюда же`, callback_data: 'fill_rest' }],
                            [{ text: 'Закончить (частичный)', callback_data: 'report_done' }],
                        ]
                    }
                }
            );
            state.step = 'choose_more_or_done';
        }
        return;
    }

    // --- Description input ---
    if (state.step === 'enter_description') {
        const description = text;
        await saveAllEntries(chatId, telegramId, state, description);
        return;
    }
});

// Handle /skip for description
bot.onText(/\/skip/, async (msg) => {
    const telegramId = msg.from.id;
    const chatId = msg.chat.id;
    const state = userStates[telegramId];

    if (state && state.step === 'enter_description') {
        await saveAllEntries(chatId, telegramId, state, '');
    }
});

// =============================================
// /today — Today's entries
// =============================================

bot.onText(/\/today/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) { bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start'); return; }

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
    let totalPct = 0;
    let text = `Записи за *${today}*:\n\n`;
    data.forEach(e => {
        const pctStr = e.percentage ? ` (${e.percentage}%)` : '';
        text += `${e.project_name} — ${e.hours}ч${pctStr}\n`;
        totalHours += e.hours;
        totalPct += (e.percentage || 0);
    });
    text += `\nИтого: *${totalHours}ч* (${totalPct}%)`;
    if (data[0]?.description) text += `\nОписание: ${data[0].description}`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// =============================================
// /week — Last 7 days
// =============================================

bot.onText(/\/week/, async (msg) => {
    const emp = await getEmployee(msg.from.id);
    if (!emp) { bot.sendMessage(msg.chat.id, 'Ты не подключён. Нажми /start'); return; }

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
        total += e.hours;
    });

    let text = `За последние 7 дней:\n\n`;
    Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0])).forEach(([date, entries]) => {
        const dayTotal = entries.reduce((s, e) => s + e.hours, 0);
        const dayPct = entries.reduce((s, e) => s + (e.percentage || 0), 0);
        text += `*${date}* (${dayTotal}ч, ${dayPct}%):\n`;
        entries.forEach(e => {
            text += `  ${e.project_name} — ${e.percentage || '?'}% (${e.hours}ч)\n`;
        });
    });
    text += `\nИтого: *${total}ч* за ${Object.keys(byDate).length} дней`;

    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// =============================================
// Helper functions
// =============================================

async function getEmployee(telegramId) {
    const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('telegram_id', telegramId)
        .single();
    return data;
}

async function showProjectPicker(chatId, telegramId, emp, existingPct) {
    let projects = [];
    try {
        const { data } = await supabase
            .from('orders')
            .select('id, order_name, client_name')
            .in('status', ['calculated', 'in_production'])
            .order('created_at', { ascending: false });
        if (data) projects = data;
    } catch (e) {
        console.error('Failed to load orders:', e);
    }

    const keyboard = [];
    keyboard.push([{ text: 'Общие работы', callback_data: 'proj_general' }]);
    projects.forEach(p => {
        const label = p.order_name + (p.client_name ? ` (${p.client_name})` : '');
        keyboard.push([{ text: label, callback_data: `proj_${p.id}` }]);
    });
    keyboard.push([{ text: 'Другое...', callback_data: 'proj_custom' }]);

    userStates[telegramId] = {
        step: 'choose_project',
        employee: emp,
        projects: projects,
        entries: userStates[telegramId]?.entries || [],
        total_pct: existingPct || userStates[telegramId]?.total_pct || 0,
    };

    const remaining = 100 - (userStates[telegramId].total_pct || 0);
    const msg = remaining < 100
        ? `${emp.name}, на какой проект записать оставшиеся ${remaining}%?`
        : `${emp.name}, на какой проект записать время?`;

    bot.sendMessage(chatId, msg, {
        reply_markup: { inline_keyboard: keyboard }
    });
}

function askPercentage(chatId, state) {
    state.step = 'enter_percentage';
    const remaining = 100 - state.total_pct;
    const remainHours = round2((remaining / 100) * state.employee.daily_hours);

    bot.sendMessage(chatId,
        `Проект: *${state.current_project}*\n` +
        `Осталось: ${remaining}% (${remainHours}ч из ${state.employee.daily_hours}ч)\n\n` +
        `Сколько процентов рабочего дня ушло на этот проект? (1—${remaining})`,
        { parse_mode: 'Markdown' }
    );
}

async function askDescription(chatId, state) {
    state.step = 'enter_description';

    const summary = state.entries.map(e =>
        `${e.project_name} — ${e.percentage}% (${e.hours}ч)`
    ).join('\n');

    const totalHours = state.entries.reduce((s, e) => s + e.hours, 0);

    let prompt;
    if (state.employee.tasks_required) {
        prompt = '\nОпиши, *что конкретно делал сегодня* (обязательно):';
    } else {
        prompt = '\nОписание задач (необязательно, /skip чтобы пропустить):';
    }

    bot.sendMessage(chatId,
        `Итого за день (${round2(totalHours)}ч из ${state.employee.daily_hours}ч):\n\n` +
        summary + '\n' + prompt,
        { parse_mode: 'Markdown' }
    );
}

async function saveAllEntries(chatId, telegramId, state, description) {
    const today = getLocalDate(state.employee.timezone_offset);

    try {
        for (const entry of state.entries) {
            await supabase.from('time_entries').insert({
                worker_name: state.employee.name,
                project_name: entry.project_name,
                order_id: entry.order_id,
                hours: entry.hours,
                percentage: entry.percentage,
                date: today,
                description: description,
                source: 'telegram',
                telegram_id: telegramId,
            });
        }

        const summary = state.entries.map(e =>
            `${e.project_name} — ${e.percentage}% (${e.hours}ч)`
        ).join('\n');

        const totalHours = state.entries.reduce((s, e) => s + e.hours, 0);

        bot.sendMessage(chatId,
            `Записано!\n\n${summary}\n` +
            (description ? `\nОписание: ${description}\n` : '') +
            `\nИтого: ${round2(totalHours)}ч`
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

function round2(n) { return Math.round(n * 100) / 100; }
function pad(n) { return String(n || 0).padStart(2, '0'); }

// =============================================
// REMINDER SYSTEM — Check every minute
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

        // Evening reminder — at their configured time
        if (localHour === emp.reminder_hour && localMinute === emp.reminder_minute) {
            const today = getLocalDate(emp.timezone_offset);
            const { data: todayEntries } = await supabase
                .from('time_entries')
                .select('id')
                .eq('telegram_id', emp.telegram_id)
                .eq('date', today);

            if (!todayEntries || todayEntries.length === 0) {
                bot.sendMessage(emp.telegram_id,
                    `${emp.name}, рабочий день подходит к концу!\n` +
                    `Расскажи, чем занимался сегодня: /report`
                );
                console.log(`Reminder sent to ${emp.name} (evening)`);
            }
        }

        // Morning follow-up at 9:00 local — check if yesterday was missed
        if (localHour === 9 && localMinute === 0) {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const dayOfWeek = yesterday.getDay();
            // Skip weekends (0=Sunday, 6=Saturday)
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const yesterdayStr = yesterday.toISOString().split('T')[0];
            const { data: yesterdayEntries } = await supabase
                .from('time_entries')
                .select('id')
                .eq('telegram_id', emp.telegram_id)
                .eq('date', yesterdayStr);

            if (!yesterdayEntries || yesterdayEntries.length === 0) {
                bot.sendMessage(emp.telegram_id,
                    `Доброе утро, ${emp.name}! Вчера (${yesterdayStr}) ты не заполнил отчёт.\n` +
                    `Пожалуйста, заполни: /report`
                );
                console.log(`Reminder sent to ${emp.name} (morning follow-up for ${yesterdayStr})`);
            }
        }
    }
}

// =============================================
// Startup
// =============================================

console.log('=== Recycle Object TimeBot v2 ===');
console.log('Features: % reporting, employee linking, reminders');
console.log('Commands: /start, /report, /today, /week, /status, /clear, /help');
console.log('Reminder check: every 60 seconds');

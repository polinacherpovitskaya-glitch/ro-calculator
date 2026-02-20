// =============================================
// Recycle Object — Telegram Bot for Time Tracking
// Сотрудники отчитываются о рабочем времени
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
// - Vercel Serverless Functions (с webhooks)
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

// === Commands ===

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from.first_name || 'Anonymous';

    bot.sendMessage(chatId,
        `Привет, ${name}! Я бот для учета рабочего времени Recycle Object.\n\n` +
        `Команды:\n` +
        `/report — Записать время за проект\n` +
        `/today — Мои записи за сегодня\n` +
        `/week — Мои записи за неделю\n` +
        `/help — Помощь`
    );
});

bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id,
        `Каждый день после работы нажми /report и запиши:\n` +
        `1. Выбери проект (или "Общие работы")\n` +
        `2. Введи количество часов\n` +
        `3. Добавь описание (необязательно)\n\n` +
        `Если работал на нескольких проектах — нажми /report ещё раз.`
    );
});

// === Report flow ===

bot.onText(/\/report/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const workerName = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

    // Fetch active orders from Supabase
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

    // Build keyboard
    const keyboard = [];

    // Add general work option
    keyboard.push([{ text: 'Общие работы', callback_data: 'proj_general' }]);

    // Add active orders
    projects.forEach(p => {
        const label = p.order_name + (p.client_name ? ` (${p.client_name})` : '');
        keyboard.push([{ text: label, callback_data: `proj_${p.id}` }]);
    });

    // Store state
    userStates[userId] = {
        step: 'choose_project',
        worker_name: workerName,
        telegram_id: userId,
        projects: projects,
    };

    bot.sendMessage(chatId, 'На какой проект записать время?', {
        reply_markup: { inline_keyboard: keyboard }
    });
});

// Handle project selection
bot.on('callback_query', async (query) => {
    const userId = query.from.id;
    const chatId = query.message.chat.id;
    const data = query.data;

    if (!data.startsWith('proj_')) return;

    const state = userStates[userId];
    if (!state || state.step !== 'choose_project') return;

    // Parse project selection
    if (data === 'proj_general') {
        state.project_name = 'Общие работы';
        state.order_id = null;
    } else {
        const orderId = parseInt(data.replace('proj_', ''));
        const project = state.projects.find(p => p.id === orderId);
        state.project_name = project ? project.order_name : 'Проект #' + orderId;
        state.order_id = orderId;
    }

    state.step = 'enter_hours';

    bot.answerCallbackQuery(query.id);
    bot.sendMessage(chatId, `Проект: *${state.project_name}*\n\nСколько часов? (например: 4, 2.5, 0.5)`, {
        parse_mode: 'Markdown'
    });
});

// Handle hours input
bot.on('message', async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();

    // Skip commands
    if (text.startsWith('/')) return;

    const state = userStates[userId];
    if (!state) return;

    if (state.step === 'enter_hours') {
        const hours = parseFloat(text.replace(',', '.'));
        if (isNaN(hours) || hours <= 0 || hours > 24) {
            bot.sendMessage(chatId, 'Введи число от 0.5 до 24. Например: 4');
            return;
        }

        state.hours = hours;
        state.step = 'enter_description';

        bot.sendMessage(chatId,
            `${hours}ч на "${state.project_name}"\n\n` +
            `Описание (что делали)? Или нажми /skip чтобы пропустить.`
        );
        return;
    }

    if (state.step === 'enter_description') {
        state.description = text === '/skip' ? '' : text;
        await saveReport(chatId, state);
        return;
    }
});

bot.onText(/\/skip/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const state = userStates[userId];

    if (state && state.step === 'enter_description') {
        state.description = '';
        await saveReport(chatId, state);
    }
});

async function saveReport(chatId, state) {
    const userId = state.telegram_id;
    const today = new Date().toISOString().split('T')[0];

    const entry = {
        worker_name: state.worker_name,
        project_name: state.project_name,
        order_id: state.order_id,
        hours: state.hours,
        date: today,
        description: state.description || '',
        source: 'telegram',
        telegram_id: userId,
    };

    try {
        const { error } = await supabase.from('time_entries').insert(entry);
        if (error) throw error;

        bot.sendMessage(chatId,
            `Записано!\n` +
            `${state.project_name} — ${state.hours}ч\n` +
            (state.description ? `Описание: ${state.description}\n` : '') +
            `\nЕщё проект? Нажми /report`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {
        console.error('Save error:', e);
        bot.sendMessage(chatId, 'Ошибка сохранения. Попробуй ещё раз: /report');
    }

    delete userStates[userId];
}

// === Today & Week commands ===

bot.onText(/\/today/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const today = new Date().toISOString().split('T')[0];
    const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

    try {
        const { data } = await supabase
            .from('time_entries')
            .select('*')
            .eq('date', today)
            .eq('worker_name', name)
            .order('created_at');

        if (!data || data.length === 0) {
            bot.sendMessage(chatId, 'Сегодня пока нет записей. Нажми /report');
            return;
        }

        let total = 0;
        let text = `Записи за сегодня (${today}):\n\n`;
        data.forEach(e => {
            text += `${e.project_name} — ${e.hours}ч`;
            if (e.description) text += ` (${e.description})`;
            text += '\n';
            total += e.hours;
        });
        text += `\nИтого: *${total}ч*`;

        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, 'Ошибка загрузки данных.');
    }
});

bot.onText(/\/week/, async (msg) => {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ');

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString().split('T')[0];

    try {
        const { data } = await supabase
            .from('time_entries')
            .select('*')
            .eq('worker_name', name)
            .gte('date', weekAgoStr)
            .order('date', { ascending: false });

        if (!data || data.length === 0) {
            bot.sendMessage(chatId, 'За последнюю неделю записей нет.');
            return;
        }

        // Group by date
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
            text += `*${date}* (${dayTotal}ч):\n`;
            entries.forEach(e => {
                text += `  ${e.project_name} — ${e.hours}ч\n`;
            });
        });
        text += `\nИтого за неделю: *${total}ч*`;

        bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (e) {
        bot.sendMessage(chatId, 'Ошибка загрузки данных.');
    }
});

// === Startup ===
console.log('Recycle Object TimeBot started');
console.log('Commands: /start, /report, /today, /week, /help');

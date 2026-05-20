require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
const { createTaskNotificationWorker } = require('./task-notification-worker');
const { buildTelegramRequestOptions, formatTelegramTransportError } = require('./telegram-runtime');

const BOT_TOKEN = process.env.TASK_BOT_TOKEN || process.env.BOT_TOKEN;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const POLL_INTERVAL_MS = Number(process.env.TASK_BOT_POLL_INTERVAL_MS || 15000);
const TELEGRAM_REQUEST_OPTIONS = buildTelegramRequestOptions();

if (!BOT_TOKEN || !SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars: TASK_BOT_TOKEN/BOT_TOKEN, SUPABASE_URL, SUPABASE_KEY');
    process.exit(1);
}

const bot = new TelegramBot(BOT_TOKEN, {
    polling: {
        interval: 1000,
        autoStart: true,
        params: { timeout: 30 },
    },
    request: TELEGRAM_REQUEST_OPTIONS,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

bot.on('polling_error', (err) => {
    const code = err?.response?.statusCode || err?.code || '';
    if (code === 409 || String(err).includes('409')) {
        console.error('FATAL: Another task bot instance is already polling this token. Exiting.');
        process.exit(1);
    }
    if (String(code).startsWith('E') || code === 502 || code === 504) {
        console.warn(`TaskBot polling transient error (${code}), will retry... ${formatTelegramTransportError(err)}`);
        return;
    }
    console.error('TaskBot polling error:', formatTelegramTransportError(err));
});

bot.on('error', (err) => {
    console.error('TaskBot general error:', formatTelegramTransportError(err));
});

function shutdown(signal) {
    console.log(`\n${signal} received. Stopping task bot...`);
    bot.stopPolling().then(() => {
        console.log('Task bot polling stopped. Exiting.');
        process.exit(0);
    }).catch(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

async function send(chatId, text, opts) {
    try {
        return await bot.sendMessage(chatId, text, opts);
    } catch (err) {
        const code = err?.response?.statusCode;
        if (code === 429) {
            await new Promise(resolve => setTimeout(resolve, 1500));
            try { return await bot.sendMessage(chatId, text, opts); } catch (retryError) { /* give up */ }
        }
        if (code === 403) {
            console.log(`User ${chatId} blocked the task bot, skipping.`);
            return null;
        }
        console.error(`TaskBot sendMessage error (${code}):`, formatTelegramTransportError(err));
        return null;
    }
}

async function getEmployee(telegramId) {
    const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('telegram_id', telegramId)
        .maybeSingle();
    return data || null;
}

bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id;

    try {
        const existing = await getEmployee(telegramId);
        if (existing) {
            await send(chatId, `Привет, ${existing.name}! Я буду присылать уведомления по задачам сюда.`);
            return;
        }

        const { data: employees } = await supabase
            .from('employees')
            .select('id, name, role')
            .eq('is_active', true)
            .is('telegram_id', null);

        if (!employees || employees.length === 0) {
            await send(chatId, 'Нет доступных профилей сотрудников. Попроси администратора привязать Telegram в разделе сотрудников.');
            return;
        }

        const keyboard = employees.map(employee => ([{
            text: employee.name,
            callback_data: `link_${employee.id}`,
        }]));

        await send(chatId, 'Привет! Выбери своё имя, чтобы получать уведомления по задачам:', {
            reply_markup: { inline_keyboard: keyboard },
        });
    } catch (error) {
        console.error('/start error:', error);
        await send(chatId, 'Не получилось привязать сотрудника. Попробуй чуть позже.');
    }
});

bot.onText(/\/help/, async (msg) => {
    await send(
        msg.chat.id,
        [
            'Я присылаю уведомления по задачам Recycle Object.',
            '',
            'Что я умею:',
            '• сообщаю, когда тебе назначили новую задачу;',
            '• пишу, когда меняется статус по твоим задачам;',
            '• пишу, когда меняется статус в задачах, где ты наблюдатель;',
            '• сообщаю, когда задачу отправили на согласование;',
            '• присылаю упоминания из комментариев.',
            '',
            'Команды:',
            '/start — привязать Telegram к сотруднику',
            '/status — показать, к кому я сейчас привязан',
            '/help — открыть эту справку',
            '',
            'Если уведомления не приходят, сначала проверь /status.',
        ].join('\n')
    );
});

bot.onText(/\/status/, async (msg) => {
    try {
        const employee = await getEmployee(msg.from.id);
        if (!employee) {
            await send(msg.chat.id, 'Ты пока не привязан к сотруднику. Нажми /start.');
            return;
        }
        await send(
            msg.chat.id,
            `Уведомления активны.\nСотрудник: ${employee.name}\nTelegram ID: ${employee.telegram_id}`
        );
    } catch (error) {
        console.error('/status error:', error);
        await send(msg.chat.id, 'Не получилось проверить статус привязки.');
    }
});

bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat?.id;
    const telegramId = query.from.id;
    const data = query.data || '';
    bot.answerCallbackQuery(query.id).catch(() => {});

    if (!data.startsWith('link_')) return;
    const employeeId = Number(data.replace('link_', ''));
    if (!Number.isFinite(employeeId) || employeeId <= 0) return;

    try {
        const { data: employee, error: employeeError } = await supabase
            .from('employees')
            .select('*')
            .eq('id', employeeId)
            .maybeSingle();

        if (employeeError || !employee) {
            await send(chatId, 'Не удалось найти сотрудника. Попробуй /start ещё раз.');
            return;
        }

        const { error } = await supabase
            .from('employees')
            .update({
                telegram_id: telegramId,
                telegram_username: query.from.username || '',
                updated_at: new Date().toISOString(),
            })
            .eq('id', employeeId);

        if (error) {
            console.error('TaskBot link employee error:', error);
            await send(chatId, 'Не получилось привязать сотрудника. Попробуй позже.');
            return;
        }

        await send(chatId, `Готово, ${employee.name}! Теперь уведомления по задачам будут приходить сюда.`);
    } catch (error) {
        console.error('TaskBot callback error:', error);
        await send(chatId, 'Не получилось завершить привязку.');
    }
});

const worker = createTaskNotificationWorker({
    supabase,
    sendMessage: send,
    logger: console,
});

let taskNotificationRunning = false;
setInterval(async () => {
    if (taskNotificationRunning) return;
    taskNotificationRunning = true;
    try {
        await worker.processTaskNotifications();
    } catch (error) {
        console.error('TaskBot notification loop error:', error);
    } finally {
        taskNotificationRunning = false;
    }
}, POLL_INTERVAL_MS);

console.log('=== Recycle Object TaskBot ===');
console.log('Task notifications are enabled.');
console.log(`Polling started at ${new Date().toISOString()}`);

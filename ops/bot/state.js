const { getPool } = require('./db');

const STATE_TTL_HOURS = Number(process.env.BOT_STATE_TTL_HOURS || 24);

function expiresAt() {
    return new Date(Date.now() + STATE_TTL_HOURS * 60 * 60 * 1000);
}

function asJson(value, fallback) {
    if (value === undefined || value === null) return fallback;
    return value;
}

async function loadState(chatId) {
    const { rows } = await getPool().query(
        `SELECT flow, step, draft
           FROM bot_conversation_state
          WHERE chat_id = $1 AND expires_at > NOW()`,
        [chatId]
    );
    if (rows[0]) {
        return {
            flow: rows[0].flow || 'idle',
            step: rows[0].step || null,
            draft: rows[0].draft || {},
        };
    }
    return { flow: 'idle', step: null, draft: {} };
}

async function saveState(chatId, state) {
    const next = state || {};
    await getPool().query(
        `INSERT INTO bot_conversation_state (chat_id, flow, step, draft, expires_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (chat_id) DO UPDATE SET
           flow = EXCLUDED.flow,
           step = EXCLUDED.step,
           draft = EXCLUDED.draft,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()`,
        [chatId, next.flow || 'idle', next.step || null, JSON.stringify(asJson(next.draft, {})), expiresAt()]
    );
}

async function clearState(chatId) {
    await getPool().query(`DELETE FROM bot_conversation_state WHERE chat_id = $1`, [chatId]);
}

async function enqueueMessage(chatId, telegramMessageId, text, payload = {}) {
    await getPool().query(
        `INSERT INTO bot_message_inbox (chat_id, telegram_message_id, text, payload)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (chat_id, telegram_message_id) DO NOTHING`,
        [chatId, telegramMessageId, text || null, JSON.stringify(payload || {})]
    );
}

async function takeNextMessage(chatId) {
    const { rows } = await getPool().query(
        `UPDATE bot_message_inbox
            SET processing_started_at = NOW()
          WHERE id = (
            SELECT id
              FROM bot_message_inbox
             WHERE chat_id = $1
               AND processed_at IS NULL
               AND processing_started_at IS NULL
             ORDER BY received_at, id
             LIMIT 1
             FOR UPDATE SKIP LOCKED
          )
          RETURNING *`,
        [chatId]
    );
    return rows[0] || null;
}

async function markProcessed(messageId, error = null) {
    await getPool().query(`UPDATE bot_message_inbox SET processed_at = NOW(), error = $2 WHERE id = $1`, [messageId, error]);
}

async function cleanupOldMessages() {
    await getPool().query(`DELETE FROM bot_message_inbox WHERE processed_at IS NOT NULL AND processed_at < NOW() - INTERVAL '7 days'`);
}

module.exports = {
    STATE_TTL_HOURS,
    loadState,
    saveState,
    clearState,
    enqueueMessage,
    takeNextMessage,
    markProcessed,
    cleanupOldMessages,
};

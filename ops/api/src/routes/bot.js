import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { asyncHandler, codedError, integer, text } from './work-utils.js';

const router = Router();

function chatId(value) {
  const normalized = text(value);
  return /^-?\d+$/.test(normalized) ? normalized : null;
}

function bindingRow(row) {
  return {
    telegram_chat_id: row.telegram_chat_id,
    telegram_username: row.telegram_username,
    employee_id: row.employee_id,
    employee_name: row.employee_name,
    employee_email: row.employee_email,
    is_active: row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

router.use(requireAuth, requireRole('admin'));

router.get(
  '/bindings',
  asyncHandler(async (req, res) => {
    const includeInactive = String(req.query.active || 'true') === 'false';
    const { rows } = await getPool().query(
      `SELECT b.telegram_chat_id, b.telegram_username, b.employee_id, b.is_active, b.created_at, b.updated_at,
              e.name AS employee_name, e.email AS employee_email
         FROM bot_telegram_bindings b
         JOIN employees e ON e.id = b.employee_id
        ${includeInactive ? '' : 'WHERE b.is_active = TRUE'}
        ORDER BY e.name, b.telegram_chat_id`
    );
    res.json({ bindings: rows.map(bindingRow) });
  })
);

router.post(
  '/bindings',
  asyncHandler(async (req, res) => {
    const telegramChatId = chatId(req.body?.telegram_chat_id);
    const employeeId = integer(req.body?.employee_id);
    const telegramUsername = text(req.body?.telegram_username) || null;
    if (!telegramChatId) throw codedError('INVALID_INPUT', 'telegram_chat_id должен быть числом');
    if (!employeeId) throw codedError('INVALID_INPUT', 'employee_id обязателен');

    const binding = await withTransaction(async (client) => {
      const employee = await client.query(`SELECT id, name, email FROM employees WHERE id = $1 AND is_active = TRUE`, [employeeId]);
      if (!employee.rows[0]) throw codedError('NOT_FOUND', 'Активный сотрудник не найден', 404);

      await client.query(
        `UPDATE bot_telegram_bindings
            SET is_active = FALSE, updated_at = NOW()
          WHERE employee_id = $1 AND telegram_chat_id <> $2 AND is_active = TRUE`,
        [employeeId, telegramChatId]
      );

      const { rows } = await client.query(
        `INSERT INTO bot_telegram_bindings (telegram_chat_id, telegram_username, employee_id, is_active)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (telegram_chat_id) DO UPDATE SET
           telegram_username = EXCLUDED.telegram_username,
           employee_id = EXCLUDED.employee_id,
           is_active = TRUE,
           updated_at = NOW()
         RETURNING *`,
        [telegramChatId, telegramUsername, employeeId]
      );
      return { ...rows[0], employee_name: employee.rows[0].name, employee_email: employee.rows[0].email };
    });

    res.status(201).json({ binding: bindingRow(binding) });
  })
);

router.delete(
  '/bindings/:telegram_chat_id',
  asyncHandler(async (req, res) => {
    const telegramChatId = chatId(req.params.telegram_chat_id);
    if (!telegramChatId) throw codedError('INVALID_INPUT', 'telegram_chat_id должен быть числом');
    const { rows } = await getPool().query(
      `UPDATE bot_telegram_bindings
          SET is_active = FALSE, updated_at = NOW()
        WHERE telegram_chat_id = $1
        RETURNING *`,
      [telegramChatId]
    );
    if (!rows[0]) throw codedError('NOT_FOUND', 'Привязка не найдена', 404);
    res.json({ binding: rows[0] });
  })
);

export default router;

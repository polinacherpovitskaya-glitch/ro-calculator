import { getPool } from '../db.js';

export const TASK_STATUSES = new Set(['incoming', 'todo', 'in_progress', 'waiting', 'review', 'done', 'cancelled']);
export const TASK_PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
export const PROJECT_STATUSES = new Set(['active', 'paused', 'done', 'cancelled', 'archived']);

export function error(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, details } });
}

export function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err.code === 'INVALID_INPUT' || err.code === 'NOT_FOUND') {
        return error(res, err.status || 400, err.code, err.message, err.details);
      }
      console.error(err);
      return error(res, 500, err.code || 'INTERNAL_ERROR', 'Внутренняя ошибка');
    }
  };
}

export function codedError(code, message, status = 400, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.details = details;
  return err;
}

export function integer(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

export function numeric(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function text(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

export function nullableText(value) {
  const normalized = text(value);
  return normalized || null;
}

export function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

export function dateValue(value) {
  const normalized = text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

export function timeValue(value) {
  const normalized = text(value);
  return /^\d{2}:\d{2}(:\d{2})?$/.test(normalized) ? normalized : null;
}

export function jsonObject(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value;
}

export function jsonArray(value, fallback = []) {
  if (value === undefined || value === null || value === '') return fallback;
  return Array.isArray(value) ? value : undefined;
}

export function nextId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

export async function employeeName(client, employeeId) {
  const id = integer(employeeId);
  if (!id) return '';
  const { rows } = await client.query(`SELECT name FROM employees WHERE id = $1`, [id]);
  return rows[0]?.name || '';
}

export async function activity(client, { task_id = null, project_id = null, order_id = null, author_id = null, type, message, metadata = {} }) {
  const authorName = await employeeName(client, author_id);
  const { rows } = await client.query(
    `INSERT INTO work_activity (id, task_id, project_id, order_id, author_id, author_name, activity_type, message, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [nextId(), task_id, project_id, order_id, author_id, authorName, type, message, metadata]
  );
  return rows[0];
}

export async function loadTask(clientOrPool, id) {
  const { rows } = await clientOrPool.query(`SELECT * FROM tasks WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function taskDetail(id) {
  const pool = getPool();
  const task = await loadTask(pool, id);
  if (!task) return null;
  const [comments, checklist, watchers, assets, activityRows] = await Promise.all([
    pool.query(`SELECT * FROM task_comments WHERE task_id = $1 ORDER BY created_at, id`, [id]),
    pool.query(`SELECT * FROM task_checklist_items WHERE task_id = $1 ORDER BY sort_index, id`, [id]),
    pool.query(`SELECT w.*, e.name AS employee_name FROM task_watchers w LEFT JOIN employees e ON e.id = w.user_id WHERE w.task_id = $1 ORDER BY e.name, w.user_id`, [id]),
    pool.query(`SELECT * FROM work_assets WHERE task_id = $1 ORDER BY created_at, id`, [id]),
    pool.query(`SELECT * FROM work_activity WHERE task_id = $1 ORDER BY created_at DESC, id DESC`, [id]),
  ]);
  return {
    task,
    comments: comments.rows,
    checklist: checklist.rows,
    watchers: watchers.rows,
    assets: assets.rows,
    activity: activityRows.rows,
  };
}

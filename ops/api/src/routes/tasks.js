import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  activity,
  asyncHandler,
  dateValue,
  employeeName,
  error,
  integer,
  jsonObject,
  loadTask,
  nextId,
  nullableText,
  numeric,
  taskDetail,
  text,
  timeValue,
  codedError,
} from './work-utils.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.status) {
      params.push(String(req.query.status));
      where.push(`t.status = $${params.length}`);
    }
    if (req.query.assignee_id) {
      params.push(integer(req.query.assignee_id));
      where.push(`t.assignee_id = $${params.length}`);
    }
    if (req.query.project_id) {
      params.push(integer(req.query.project_id));
      where.push(`t.project_id = $${params.length}`);
    }
    if (req.query.area_id) {
      params.push(integer(req.query.area_id));
      where.push(`t.area_id = $${params.length}`);
    }
    if (req.query.due_date) {
      const dueDate = dateValue(req.query.due_date);
      if (!dueDate) return error(res, 400, 'INVALID_INPUT', 'due_date должен быть YYYY-MM-DD');
      params.push(dueDate);
      where.push(`t.due_date = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(t.title) LIKE $${params.length} OR LOWER(COALESCE(t.description, '')) LIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
      `SELECT t.*, a.name AS area_name, a.color AS area_color, p.title AS project_name
         FROM tasks t
         LEFT JOIN areas a ON a.id = t.area_id
         LEFT JOIN projects p ON p.id = t.project_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY t.sort_index, t.due_date NULLS LAST, t.updated_at DESC, t.id DESC`,
      params
    );
    res.json({ tasks: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await taskDetail(req.params.id);
    if (!detail) return error(res, 404, 'NOT_FOUND', 'Задача не найдена');
    res.json(detail);
  })
);

async function taskPayload(client, body, user) {
  const title = text(body?.title);
  const status = body?.status || 'incoming';
  const priority = body?.priority || 'normal';
  const extras = jsonObject(body?.extras);
  if (!title) return { error: ['INVALID_INPUT', 'title обязателен'] };
  if (!TASK_STATUSES.has(status)) return { error: ['INVALID_INPUT', 'Некорректный status'] };
  if (!TASK_PRIORITIES.has(priority)) return { error: ['INVALID_INPUT', 'Некорректный priority'] };
  if (extras === undefined) return { error: ['INVALID_INPUT', 'extras должен быть JSON-объектом'] };

  const projectId = integer(body?.project_id);
  const areaId = integer(body?.area_id);
  const orderId = integer(body?.order_id);
  if (!projectId && !areaId && !orderId) return { error: ['INVALID_INPUT', 'Нужен project_id, area_id или order_id'] };

  let projectTitle = text(body?.project_title);
  if (projectId && !projectTitle) {
    const project = await client.query(`SELECT title, area_id FROM projects WHERE id = $1`, [projectId]);
    projectTitle = project.rows[0]?.title || '';
  }

  return {
    id: integer(body?.id) || nextId(),
    title,
    description: text(body?.description),
    status,
    priority,
    reporter_id: integer(body?.reporter_id) || user.employeeId,
    assignee_id: integer(body?.assignee_id),
    reviewer_id: integer(body?.reviewer_id),
    area_id: areaId,
    order_id: orderId,
    order_name: text(body?.order_name),
    project_id: projectId,
    project_title: projectTitle,
    china_purchase_id: integer(body?.china_purchase_id),
    warehouse_item_id: integer(body?.warehouse_item_id),
    primary_context_kind: nullableText(body?.primary_context_kind) || (projectId ? 'project' : orderId ? 'order' : 'area'),
    due_date: dateValue(body?.due_date),
    due_time: timeValue(body?.due_time),
    waiting_for_text: text(body?.waiting_for_text),
    sort_index: numeric(body?.sort_index, 0),
    parent_task_id: integer(body?.parent_task_id),
    extras,
  };
}

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const task = await withTransaction(async (client) => {
        const payload = await taskPayload(client, req.body, req.user);
        if (payload.error) throw Object.assign(new Error(payload.error[1]), { code: payload.error[0], status: 400 });
        const reporterName = await employeeName(client, payload.reporter_id);
        const assigneeName = await employeeName(client, payload.assignee_id);
        const reviewerName = await employeeName(client, payload.reviewer_id);
        const { rows } = await client.query(
          `INSERT INTO tasks
             (id, title, description, status, priority, reporter_id, reporter_name, assignee_id, assignee_name,
              reviewer_id, reviewer_name, area_id, order_id, order_name, project_id, project_title, china_purchase_id,
              warehouse_item_id, primary_context_kind, due_date, due_time, waiting_for_text, sort_index, parent_task_id, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
           RETURNING *`,
          [
            payload.id,
            payload.title,
            payload.description,
            payload.status,
            payload.priority,
            payload.reporter_id,
            reporterName,
            payload.assignee_id,
            assigneeName,
            payload.reviewer_id,
            reviewerName,
            payload.area_id,
            payload.order_id,
            payload.order_name,
            payload.project_id,
            payload.project_title,
            payload.china_purchase_id,
            payload.warehouse_item_id,
            payload.primary_context_kind,
            payload.due_date,
            payload.due_time,
            payload.waiting_for_text,
            payload.sort_index,
            payload.parent_task_id,
            payload.extras,
          ]
        );
        await activity(client, {
          task_id: rows[0].id,
          project_id: rows[0].project_id,
          order_id: rows[0].order_id,
          author_id: req.user.employeeId,
          type: 'task_created',
          message: `Создана задача: ${rows[0].title}`,
        });
        return rows[0];
      });
      res.status(201).json({ task });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const task = await withTransaction(async (client) => {
        const previous = await loadTask(client, req.params.id);
        if (!previous) throw Object.assign(new Error('Задача не найдена'), { code: 'NOT_FOUND', status: 404 });
        const allowed = [
          'title',
          'description',
          'status',
          'priority',
          'assignee_id',
          'reviewer_id',
          'area_id',
          'order_id',
          'order_name',
          'project_id',
          'project_title',
          'china_purchase_id',
          'warehouse_item_id',
          'primary_context_kind',
          'due_date',
          'due_time',
          'waiting_for_text',
          'sort_index',
          'parent_task_id',
          'extras',
        ];
        const updates = [];
        const values = [];
        for (const field of allowed) {
          if (req.body?.[field] === undefined) continue;
          let value = req.body[field];
          if (field === 'title') {
            value = text(value);
            if (!value) throw codedError('INVALID_INPUT', 'title обязателен');
          } else if (field === 'status') {
            if (!TASK_STATUSES.has(value)) throw codedError('INVALID_INPUT', 'Некорректный status');
          } else if (field === 'priority') {
            if (!TASK_PRIORITIES.has(value)) throw codedError('INVALID_INPUT', 'Некорректный priority');
          } else if (field.endsWith('_id') || field === 'area_id') {
            value = integer(value);
          } else if (field === 'due_date') {
            value = dateValue(value);
          } else if (field === 'due_time') {
            value = timeValue(value);
          } else if (field === 'sort_index') {
            value = numeric(value, 0);
          } else if (field === 'extras') {
            value = jsonObject(value);
            if (value === undefined) throw codedError('INVALID_INPUT', 'extras должен быть JSON-объектом');
          } else {
            value = value === null ? null : text(value);
          }
          values.push(value);
          updates.push(`${field} = $${values.length}`);
        }
        if (req.body?.assignee_id !== undefined) {
          values.push(await employeeName(client, req.body.assignee_id));
          updates.push(`assignee_name = $${values.length}`);
        }
        if (req.body?.reviewer_id !== undefined) {
          values.push(await employeeName(client, req.body.reviewer_id));
          updates.push(`reviewer_name = $${values.length}`);
        }
        if (req.body?.status === 'done') updates.push(`completed_at = NOW()`);
        if (req.body?.status === 'cancelled') updates.push(`cancelled_at = NOW()`);
        if (!updates.length) return previous;
        values.push(req.params.id);
        const { rows } = await client.query(
          `UPDATE tasks SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
          values
        );
        await activity(client, {
          task_id: rows[0].id,
          project_id: rows[0].project_id,
          order_id: rows[0].order_id,
          author_id: req.user.employeeId,
          type: 'task_updated',
          message: req.body?.status && req.body.status !== previous.status ? `Статус: ${previous.status} -> ${req.body.status}` : 'Задача обновлена',
          metadata: { changed: Object.keys(req.body || {}) },
        });
        return rows[0];
      });
      res.json({ task });
    })
  )
);

router.post(
  '/:id/assign',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      req.body = { ...req.body, assignee_id: req.body?.assignee_id };
      const assigneeName = await employeeName(getPool(), req.body.assignee_id);
      const { rows } = await getPool().query(
        `UPDATE tasks SET assignee_id = $1, assignee_name = $2, updated_at = NOW() WHERE id = $3 RETURNING *`,
        [integer(req.body.assignee_id), assigneeName, req.params.id]
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Задача не найдена');
      res.json({ task: rows[0] });
    })
  )
);

router.post(
  '/:id/complete',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(
        `UPDATE tasks SET status = 'done', completed_at = COALESCE(completed_at, NOW()), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Задача не найдена');
      res.json({ task: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(
        `UPDATE tasks SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW()), updated_at = NOW() WHERE id = $1 RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Задача не найдена');
      res.json({ task: rows[0] });
    })
  )
);

export default router;

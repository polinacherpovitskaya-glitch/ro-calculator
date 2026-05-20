import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import {
  PROJECT_STATUSES,
  activity,
  asyncHandler,
  dateValue,
  employeeName,
  error,
  integer,
  jsonObject,
  nextId,
  nullableText,
  text,
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
      where.push(`p.status = $${params.length}`);
    }
    if (req.query.area_id) {
      params.push(integer(req.query.area_id));
      where.push(`p.area_id = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(p.title) LIKE $${params.length} OR LOWER(COALESCE(p.brief, '')) LIKE $${params.length})`);
    }
    const { rows } = await getPool().query(
      `SELECT p.*, a.name AS area_name, a.color AS area_color
         FROM projects p
         LEFT JOIN areas a ON a.id = p.area_id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.updated_at DESC, p.id DESC`,
      params
    );
    res.json({ projects: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT p.*, a.name AS area_name, a.color AS area_color
         FROM projects p
         LEFT JOIN areas a ON a.id = p.area_id
        WHERE p.id = $1`,
      [req.params.id]
    );
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Проект не найден');
    const tasks = await getPool().query(`SELECT * FROM tasks WHERE project_id = $1 ORDER BY sort_index, due_date NULLS LAST, id`, [req.params.id]);
    const assets = await getPool().query(`SELECT * FROM work_assets WHERE project_id = $1 ORDER BY created_at DESC, id DESC`, [req.params.id]);
    const activityRows = await getPool().query(`SELECT * FROM work_activity WHERE project_id = $1 ORDER BY created_at DESC, id DESC`, [req.params.id]);
    res.json({ project: rows[0], tasks: tasks.rows, assets: assets.rows, activity: activityRows.rows });
  })
);

function projectPayload(body) {
  const title = text(body?.title || body?.name);
  const status = body?.status || 'active';
  const extras = jsonObject(body?.extras);
  if (!title) return { error: ['INVALID_INPUT', 'title обязателен'] };
  if (!PROJECT_STATUSES.has(status)) return { error: ['INVALID_INPUT', 'Некорректный status'] };
  if (extras === undefined) return { error: ['INVALID_INPUT', 'extras должен быть JSON-объектом'] };
  return {
    id: integer(body?.id) || nextId(),
    title,
    type: nullableText(body?.type) || 'Другое',
    owner_id: integer(body?.owner_id),
    linked_order_id: integer(body?.linked_order_id || body?.order_id),
    linked_order_name: text(body?.linked_order_name || body?.order_name),
    area_id: integer(body?.area_id),
    start_date: dateValue(body?.start_date),
    due_date: dateValue(body?.due_date || body?.end_date),
    launch_at: body?.launch_at || null,
    status,
    brief: text(body?.brief),
    goal: text(body?.goal),
    result_summary: text(body?.result_summary),
    created_by: integer(body?.created_by),
    extras,
  };
}

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const payload = projectPayload(req.body);
      if (payload.error) return error(res, 400, payload.error[0], payload.error[1]);
      const project = await withTransaction(async (client) => {
        const ownerName = await employeeName(client, payload.owner_id);
        const createdByName = await employeeName(client, payload.created_by || req.user.employeeId);
        const { rows } = await client.query(
          `INSERT INTO projects
             (id, title, type, owner_id, owner_name, linked_order_id, linked_order_name, area_id, start_date, due_date,
              launch_at, status, brief, goal, result_summary, created_by, created_by_name, extras)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           RETURNING *`,
          [
            payload.id,
            payload.title,
            payload.type,
            payload.owner_id,
            ownerName,
            payload.linked_order_id,
            payload.linked_order_name,
            payload.area_id,
            payload.start_date,
            payload.due_date,
            payload.launch_at,
            payload.status,
            payload.brief,
            payload.goal,
            payload.result_summary,
            payload.created_by || req.user.employeeId,
            createdByName,
            payload.extras,
          ]
        );
        await activity(client, {
          project_id: rows[0].id,
          author_id: req.user.employeeId,
          type: 'project_created',
          message: `Создан проект: ${rows[0].title}`,
        });
        return rows[0];
      });
      res.status(201).json({ project });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const allowed = ['title', 'type', 'owner_id', 'linked_order_id', 'linked_order_name', 'area_id', 'start_date', 'due_date', 'launch_at', 'status', 'brief', 'goal', 'result_summary', 'extras'];
      const updates = [];
      const values = [];
      for (const field of allowed) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (field === 'title') {
          value = text(value);
          if (!value) return error(res, 400, 'INVALID_INPUT', 'title обязателен');
        } else if (field === 'status') {
          if (!PROJECT_STATUSES.has(value)) return error(res, 400, 'INVALID_INPUT', 'Некорректный status');
        } else if (field.endsWith('_id') || field === 'area_id') {
          value = integer(value);
        } else if (field === 'start_date' || field === 'due_date') {
          value = dateValue(value);
        } else if (field === 'extras') {
          value = jsonObject(value);
          if (value === undefined) return error(res, 400, 'INVALID_INPUT', 'extras должен быть JSON-объектом');
        } else {
          value = value === null ? null : text(value);
        }
        values.push(value);
        updates.push(`${field} = $${values.length}`);
      }
      if (req.body?.owner_id !== undefined) {
        values.push(await employeeName(getPool(), req.body.owner_id));
        updates.push(`owner_name = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE projects SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Проект не найден');
      res.json({ project: rows[0] });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(`UPDATE projects SET status = 'archived', updated_at = NOW() WHERE id = $1 RETURNING *`, [
        req.params.id,
      ]);
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Проект не найден');
      res.json({ project: rows[0] });
    })
  )
);

export default router;

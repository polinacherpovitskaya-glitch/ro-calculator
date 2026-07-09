import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import {
  TASK_PRIORITIES,
  activity,
  asyncHandler,
  boolValue,
  employeeName,
  error,
  integer,
  jsonArray,
  jsonObject,
  nextId,
  nullableText,
  numeric,
  text,
} from './work-utils.js';

const router = Router();

router.get(
  '/templates',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.kind) {
      params.push(String(req.query.kind));
      where.push(`kind = $${params.length}`);
    }
    if (req.query.active !== undefined) {
      params.push(String(req.query.active) !== 'false');
      where.push(`is_active = $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT *
         FROM work_templates
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY is_active DESC, kind, name, id`,
      params
    );
    res.json({ templates: rows });
  })
);

router.post(
  '/templates',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const name = text(req.body?.name);
      const kind = text(req.body?.kind || 'task');
      const checklist = jsonArray(req.body?.checklist_items);
      const subtasks = jsonArray(req.body?.suggested_subtasks);
      if (!name || !kind) return error(res, 400, 'INVALID_INPUT', 'name и kind обязательны');
      if (checklist === undefined || subtasks === undefined) return error(res, 400, 'INVALID_INPUT', 'checklist_items и suggested_subtasks должны быть массивами');
      const priority = req.body?.default_priority || 'normal';
      if (!TASK_PRIORITIES.has(priority)) return error(res, 400, 'INVALID_INPUT', 'Некорректный default_priority');
      const { rows } = await getPool().query(
        `INSERT INTO work_templates
           (id, kind, name, title, project_type, description, default_priority, suggested_area_id, checklist_items, suggested_subtasks, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING *`,
        [
          integer(req.body?.id) || nextId(),
          kind,
          name,
          text(req.body?.title),
          text(req.body?.project_type),
          text(req.body?.description),
          priority,
          integer(req.body?.suggested_area_id),
          JSON.stringify(checklist),
          JSON.stringify(subtasks),
          boolValue(req.body?.is_active, true),
        ]
      );
      res.status(201).json({ template: rows[0] });
    })
  )
);

router.post(
  '/tasks/:taskId/comments',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const body = text(req.body?.body);
      const mentions = jsonArray(req.body?.mentions);
      if (!body) return error(res, 400, 'INVALID_INPUT', 'body обязателен');
      if (mentions === undefined) return error(res, 400, 'INVALID_INPUT', 'mentions должен быть массивом');
      const comment = await withTransaction(async (client) => {
        const authorId = integer(req.body?.author_id) || req.user.employeeId;
        const authorName = await employeeName(client, authorId);
        const { rows } = await client.query(
          `INSERT INTO task_comments (id, task_id, author_id, author_name, body, mentions)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING *`,
          [integer(req.body?.id) || nextId(), req.params.taskId, authorId, authorName, body, JSON.stringify(mentions)]
        );
        await activity(client, {
          task_id: req.params.taskId,
          author_id: req.user.employeeId,
          type: 'comment_added',
          message: 'Добавлен комментарий',
          metadata: { comment_id: rows[0].id },
        });
        return rows[0];
      });
      res.status(201).json({ comment });
    })
  )
);

router.patch(
  '/comments/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const body = text(req.body?.body);
      if (!body) return error(res, 400, 'INVALID_INPUT', 'body обязателен');
      const { rows } = await getPool().query(`UPDATE task_comments SET body = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [
        body,
        req.params.id,
      ]);
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Комментарий не найден');
      res.json({ comment: rows[0] });
    })
  )
);

router.delete(
  '/comments/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM task_comments WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Комментарий не найден');
      res.json({ ok: true });
    })
  )
);

router.post(
  '/tasks/:taskId/checklist',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const title = text(req.body?.title || req.body?.text);
      if (!title) return error(res, 400, 'INVALID_INPUT', 'title обязателен');
      const { rows } = await getPool().query(
        `INSERT INTO task_checklist_items (id, task_id, title, is_done, sort_index, assignee_id)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING *`,
        [integer(req.body?.id) || nextId(), req.params.taskId, title, boolValue(req.body?.is_done, false), numeric(req.body?.sort_index, 0), integer(req.body?.assignee_id)]
      );
      res.status(201).json({ item: rows[0] });
    })
  )
);

router.patch(
  '/checklist/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const updates = [];
      const values = [];
      if (req.body?.title !== undefined || req.body?.text !== undefined) {
        const title = text(req.body?.title || req.body?.text);
        if (!title) return error(res, 400, 'INVALID_INPUT', 'title обязателен');
        values.push(title);
        updates.push(`title = $${values.length}`);
      }
      if (req.body?.is_done !== undefined || req.body?.done !== undefined) {
        values.push(boolValue(req.body?.is_done ?? req.body?.done, false));
        updates.push(`is_done = $${values.length}`);
      }
      if (req.body?.sort_index !== undefined) {
        values.push(numeric(req.body.sort_index, 0));
        updates.push(`sort_index = $${values.length}`);
      }
      if (req.body?.assignee_id !== undefined) {
        values.push(integer(req.body.assignee_id));
        updates.push(`assignee_id = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE task_checklist_items SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Пункт чек-листа не найден');
      res.json({ item: rows[0] });
    })
  )
);

router.delete(
  '/checklist/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM task_checklist_items WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Пункт чек-листа не найден');
      res.json({ ok: true });
    })
  )
);

router.put(
  '/tasks/:taskId/watchers/:employeeId',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(
        `INSERT INTO task_watchers (task_id, user_id)
         VALUES ($1,$2)
         ON CONFLICT (task_id, user_id) DO UPDATE SET created_at = task_watchers.created_at
         RETURNING *`,
        [req.params.taskId, req.params.employeeId]
      );
      res.json({ watcher: rows[0] });
    })
  )
);

router.delete(
  '/tasks/:taskId/watchers/:employeeId',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      await getPool().query(`DELETE FROM task_watchers WHERE task_id = $1 AND user_id = $2`, [req.params.taskId, req.params.employeeId]);
      res.json({ ok: true });
    })
  )
);

router.post(
  '/assets',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const taskId = integer(req.body?.task_id);
      const projectId = integer(req.body?.project_id);
      const kind = text(req.body?.kind || 'link');
      const preview = jsonObject(req.body?.preview_meta);
      if (!taskId && !projectId) return error(res, 400, 'INVALID_INPUT', 'Нужен task_id или project_id');
      if (preview === undefined) return error(res, 400, 'INVALID_INPUT', 'preview_meta должен быть JSON-объектом');
      const createdBy = integer(req.body?.created_by) || req.user.employeeId;
      const createdByName = await employeeName(getPool(), createdBy);
      const { rows } = await getPool().query(
        `INSERT INTO work_assets
           (id, task_id, project_id, kind, title, url, file_name, file_type, file_size, data_url, preview_meta, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [
          integer(req.body?.id) || nextId(),
          taskId,
          projectId,
          kind,
          text(req.body?.title),
          text(req.body?.url),
          text(req.body?.file_name),
          text(req.body?.file_type),
          integer(req.body?.file_size, 0),
          text(req.body?.data_url),
          preview,
          createdBy,
          createdByName,
        ]
      );
      res.status(201).json({ asset: rows[0] });
    })
  )
);

router.get(
  '/activity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.task_id) {
      params.push(integer(req.query.task_id));
      where.push(`task_id = $${params.length}`);
    }
    if (req.query.project_id) {
      params.push(integer(req.query.project_id));
      where.push(`project_id = $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT *
         FROM work_activity
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, id DESC
        LIMIT 100`,
      params
    );
    res.json({ activity: rows });
  })
);

router.get(
  '/notification-events',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(`SELECT * FROM task_notification_events ORDER BY created_at DESC, id DESC LIMIT 100`);
    res.json({ events: rows });
  })
);

export default router;

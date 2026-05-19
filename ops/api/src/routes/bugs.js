import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { deleteObject, presignedGetUrl, uploadObject } from '../s3.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const STATUSES = new Set(['open', 'in_progress', 'fixed', 'wontfix', 'duplicate']);
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

function error(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, details } });
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      if (['INVALID_INPUT', 'INVALID_STATUS', 'INVALID_SEVERITY', 'S3_NOT_CONFIGURED', 'LIMIT_FILE_SIZE'].includes(code)) {
        return error(res, 400, code, err.message || 'Некорректные данные');
      }
      console.error(err);
      return error(res, 500, code, 'Внутренняя ошибка');
    }
  };
}

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function bugPayload(row) {
  return { ...row };
}

function validateStatus(status) {
  if (status === null || status === undefined || status === '') return null;
  if (!STATUSES.has(status)) {
    const err = new Error('Некорректный статус');
    err.code = 'INVALID_STATUS';
    throw err;
  }
  return status;
}

function validateSeverity(severity) {
  if (severity === null || severity === undefined || severity === '') return null;
  if (!SEVERITIES.has(severity)) {
    const err = new Error('Некорректная важность');
    err.code = 'INVALID_SEVERITY';
    throw err;
  }
  return severity;
}

function safeFilename(filename) {
  return path.basename(String(filename || 'attachment')).replace(/[^a-zA-Z0-9._-]+/g, '_') || 'attachment';
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.status) {
      params.push(validateStatus(String(req.query.status)));
      where.push(`status = $${params.length}`);
    }
    if (req.query.severity) {
      params.push(validateSeverity(String(req.query.severity)));
      where.push(`severity = $${params.length}`);
    }
    if (req.query.page) {
      params.push(String(req.query.page));
      where.push(`page = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(title) LIKE $${params.length} OR LOWER(COALESCE(description, '')) LIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
      `SELECT br.*, COUNT(ba.id)::int AS attachment_count
         FROM bug_reports br
         LEFT JOIN bug_attachments ba ON ba.bug_id = br.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY br.id
        ORDER BY br.created_at DESC, br.id DESC`,
      params
    );
    res.json({ bugs: rows.map(bugPayload) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = numeric(req.body?.id || Date.now());
      const title = String(req.body?.title || '').trim();
      if (!id || !title) return error(res, 400, 'INVALID_INPUT', 'id и title обязательны');
      const severity = validateSeverity(req.body?.severity || 'medium');
      const status = validateStatus(req.body?.status || 'open');
      const { rows } = await getPool().query(
        `INSERT INTO bug_reports
           (id, title, description, severity, status, page, reporter_email, reporter_name, assignee_id, extras)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          title,
          req.body?.description || null,
          severity,
          status,
          req.body?.page || null,
          req.body?.reporter_email || req.user.email || null,
          req.body?.reporter_name || null,
          numeric(req.body?.assignee_id),
          req.body?.extras || {},
        ]
      );
      res.status(201).json({ bug: bugPayload(rows[0]) });
    })
  )
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(`SELECT * FROM bug_reports WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Баг не найден');
    const attachments = await getPool().query(`SELECT * FROM bug_attachments WHERE bug_id = $1 ORDER BY uploaded_at DESC, id DESC`, [
      req.params.id,
    ]);
    const withUrls = await Promise.all(
      attachments.rows.map(async (attachment) => ({
        ...attachment,
        url: await presignedGetUrl(attachment.storage_key),
      }))
    );
    res.json({ bug: { ...bugPayload(rows[0]), attachments: withUrls } });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['title', 'description', 'severity', 'status', 'page', 'reporter_email', 'reporter_name', 'assignee_id', 'extras'];
      const values = [];
      const updates = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        let value = req.body[field];
        if (field === 'status') value = validateStatus(value);
        if (field === 'severity') value = validateSeverity(value);
        if (field === 'assignee_id') value = numeric(value);
        if (field === 'extras') value = value || {};
        values.push(value === '' ? null : value);
        updates.push(`${field} = $${values.length}`);
      }
      if (req.body?.status === 'fixed') {
        updates.push(`fixed_at = COALESCE(fixed_at, NOW())`);
      } else if (req.body?.status && req.body.status !== 'fixed') {
        updates.push(`fixed_at = NULL`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');

      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE bug_reports
            SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Баг не найден');
      res.json({ bug: bugPayload(rows[0]) });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const attachments = await getPool().query(`SELECT storage_key FROM bug_attachments WHERE bug_id = $1`, [req.params.id]);
      const { rowCount } = await getPool().query(`DELETE FROM bug_reports WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Баг не найден');
      for (const attachment of attachments.rows) {
        await deleteObject(attachment.storage_key);
      }
      res.json({ ok: true });
    })
  )
);

router.post(
  '/:id/attachments',
  requireAuth,
  upload.single('file'),
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      if (!req.file) return error(res, 400, 'INVALID_INPUT', 'Файл обязателен');
      const attachment = await withTransaction(async (client) => {
        const bug = await client.query(`SELECT id FROM bug_reports WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (!bug.rows[0]) return null;

        const filename = safeFilename(req.file.originalname);
        const key = `bug-attachments/${req.params.id}/${crypto.randomUUID()}-${filename}`;
        await uploadObject(key, req.file.buffer, req.file.mimetype);
        const { rows } = await client.query(
          `INSERT INTO bug_attachments (bug_id, filename, mime_type, size_bytes, storage_key)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [req.params.id, filename, req.file.mimetype || null, req.file.size || null, key]
        );
        return rows[0];
      });

      if (!attachment) return error(res, 404, 'NOT_FOUND', 'Баг не найден');
      res.status(201).json({ attachment });
    })
  )
);

router.delete(
  '/:id/attachments/:attId',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const attachment = await withTransaction(async (client) => {
        const { rows } = await client.query(`DELETE FROM bug_attachments WHERE id = $1 AND bug_id = $2 RETURNING *`, [
          req.params.attId,
          req.params.id,
        ]);
        return rows[0] || null;
      });
      if (!attachment) return error(res, 404, 'NOT_FOUND', 'Вложение не найдено');
      await deleteObject(attachment.storage_key);
      res.json({ ok: true });
    })
  )
);

export default router;

import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { loadShipment, receiveShipmentInTransaction, shipmentPayload } from '../shipments/receive.js';

const router = Router();

function error(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      if (
        [
          'INVALID_INPUT',
          'EMPTY_SHIPMENT',
          'NO_WAREHOUSE_LINK',
          'INSUFFICIENT_NEW_ITEM_DATA',
          'ALREADY_RECEIVED',
        ].includes(code)
      ) {
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

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.status) {
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }
    if (req.query.from) {
      params.push(req.query.from);
      where.push(`expected_date >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      where.push(`expected_date <= $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM shipments
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, id DESC`,
      params
    );
    res.json({ shipments: rows.map((row) => shipmentPayload(row)) });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const shipment = await loadShipment(getPool(), req.params.id);
    if (!shipment) return error(res, 404, 'NOT_FOUND', 'Приёмка не найдена');
    res.json({ shipment });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = Number(req.body?.id || Date.now());
      const name = String(req.body?.name || '').trim();
      if (!Number.isSafeInteger(id) || !name) return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      const shipment = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO shipments (id, name, source, status, expected_date, total_cost, currency, note, extras)
           VALUES ($1, $2, $3, COALESCE($4, 'planned'), $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            id,
            name,
            req.body?.source || null,
            req.body?.status || 'planned',
            req.body?.expected_date || null,
            numeric(req.body?.total_cost),
            req.body?.currency || null,
            req.body?.note || null,
            req.body?.extras || {},
          ]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO shipment_items (shipment_id, warehouse_item_id, name, qty, unit_price, currency, extras)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              id,
              numeric(item.warehouse_item_id),
              item.name || '',
              numeric(item.qty, 0),
              numeric(item.unit_price),
              item.currency || null,
              item.extras || {},
            ]
          );
        }
        return shipmentPayload(rows[0], items);
      });

      res.status(201).json({ shipment });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['name', 'source', 'status', 'expected_date', 'total_cost', 'currency', 'note', 'extras'];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        values.push(field === 'total_cost' ? numeric(req.body[field]) : req.body[field] || null);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE shipments SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Приёмка не найдена');
      res.json({ shipment: shipmentPayload(rows[0]) });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM shipments WHERE id = $1 AND status = 'planned'`, [req.params.id]);
      if (!rowCount) return error(res, 400, 'CANNOT_DELETE', 'Удалить можно только planned приёмку');
      res.json({ ok: true });
    })
  )
);

router.post(
  '/:id/receive',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const shipment = await withTransaction(async (client) => {
        return receiveShipmentInTransaction(client, { shipmentId: req.params.id, actorUserId: req.user.id });
      });

      if (!shipment) return error(res, 404, 'NOT_FOUND', 'Приёмка не найдена');
      res.json({ shipment });
    })
  )
);

export default router;

import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { withIdempotency } from '../idempotency.js';

const router = Router();

function error(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function requirePositiveNumber(value, field) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number) || number <= 0) {
    const err = new Error(`${field} must be positive`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return number;
}

function requireNonNegativeNumber(value, field) {
  const number = toNumber(value, NaN);
  if (!Number.isFinite(number) || number < 0) {
    const err = new Error(`${field} must be non-negative`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return number;
}

function itemPayload(row) {
  return {
    ...row,
    qty: Number(row.qty),
    min_qty: row.min_qty === null ? null : Number(row.min_qty),
    last_price: row.last_price === null ? null : Number(row.last_price),
    reserved_qty: row.reserved_qty === undefined ? undefined : Number(row.reserved_qty),
    available_qty: row.available_qty === undefined ? undefined : Number(row.available_qty),
  };
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      if (['INVALID_INPUT', 'INSUFFICIENT_STOCK', 'HAS_RESERVATIONS'].includes(code)) {
        return error(res, 400, code, err.message || 'Некорректные данные');
      }
      console.error(err);
      return error(res, 500, code, 'Внутренняя ошибка');
    }
  };
}

async function activeReservedQty(client, itemId) {
  const { rows } = await client.query(
    `SELECT COALESCE(SUM(qty), 0) AS reserved_qty
       FROM warehouse_reservations
      WHERE item_id = $1 AND status = 'active'`,
    [itemId]
  );
  return Number(rows[0].reserved_qty);
}

router.get(
  '/items',
  requireAuth,
  asyncHandler(async (req, res) => {
    const pool = getPool();
    const params = [];
    const where = [];
    if (req.query.category) {
      params.push(String(req.query.category));
      where.push(`i.category = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(i.name) LIKE $${params.length} OR LOWER(COALESCE(i.sku, '')) LIKE $${params.length})`);
    }

    const { rows } = await pool.query(
      `SELECT i.*,
              COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0) AS reserved_qty,
              i.qty - COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0) AS available_qty
         FROM warehouse_items i
         LEFT JOIN warehouse_reservations r ON r.item_id = i.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY i.id
        ORDER BY i.name`,
      params
    );

    res.json({ items: rows.map(itemPayload) });
  })
);

router.post(
  '/items',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = Number(req.body?.id);
      const name = String(req.body?.name || '').trim();
      const qty = requireNonNegativeNumber(req.body?.qty ?? 0, 'qty');
      if (!Number.isSafeInteger(id) || id <= 0 || !name) {
        return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');
      }

      const item = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO warehouse_items
             (id, sku, name, category, qty, unit, min_qty, last_price, last_currency, notes, linked_order_id, photo_url, extras)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING *`,
          [
            id,
            req.body?.sku || null,
            name,
            req.body?.category || null,
            qty,
            req.body?.unit || null,
            req.body?.min_qty ?? null,
            req.body?.last_price ?? null,
            req.body?.last_currency || null,
            req.body?.notes || null,
            req.body?.linked_order_id || null,
            req.body?.photo_url || null,
            req.body?.extras || {},
          ]
        );
        await client.query(
          `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, actor_user_id, note)
           VALUES ($1, 'manual_edit', 0, $2, $2, $3, $4)`,
          [id, qty, req.user.id, req.body?.note || 'Создание позиции']
        );
        return rows[0];
      });

      res.status(201).json({ item: itemPayload(item) });
    })
  )
);

router.patch(
  '/items/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const itemId = Number(req.params.id);
      const item = await withTransaction(async (client) => {
        const lock = await client.query(`SELECT * FROM warehouse_items WHERE id = $1 FOR UPDATE`, [itemId]);
        const current = lock.rows[0];
        if (!current) {
          return null;
        }

        const beforeQty = Number(current.qty);
        const nextQty = req.body?.qty === undefined ? beforeQty : requireNonNegativeNumber(req.body.qty, 'qty');
        const reservedQty = await activeReservedQty(client, itemId);
        if (nextQty < reservedQty) {
          const err = new Error('Недостаточно свободного остатка');
          err.code = 'INSUFFICIENT_STOCK';
          throw err;
        }

        const fields = {
          sku: req.body?.sku,
          name: req.body?.name,
          category: req.body?.category,
          qty: nextQty,
          unit: req.body?.unit,
          min_qty: req.body?.min_qty,
          last_price: req.body?.last_price,
          last_currency: req.body?.last_currency,
          notes: req.body?.notes,
          linked_order_id: req.body?.linked_order_id,
          photo_url: req.body?.photo_url,
          extras: req.body?.extras,
        };
        const updates = [];
        const values = [];
        for (const [key, value] of Object.entries(fields)) {
          if (value === undefined) continue;
          values.push(value === '' ? null : value);
          updates.push(`${key} = $${values.length}`);
        }
        values.push(itemId);
        const { rows } = await client.query(
          `UPDATE warehouse_items
              SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *`,
          values
        );

        const delta = nextQty - beforeQty;
        if (delta !== 0) {
          await client.query(
            `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, actor_user_id, note)
             VALUES ($1, 'manual_edit', $2, $3, $4, $5, $6)`,
            [itemId, beforeQty, nextQty, delta, req.user.id, req.body?.note || 'Редактирование позиции']
          );
        }
        return rows[0];
      });

      if (!item) return error(res, 404, 'NOT_FOUND', 'Позиция не найдена');
      res.json({ item: itemPayload(item) });
    })
  )
);

router.delete(
  '/items/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const itemId = Number(req.params.id);
      const deleted = await withTransaction(async (client) => {
        const reservedQty = await activeReservedQty(client, itemId);
        if (reservedQty > 0) {
          const err = new Error('У позиции есть активные резервы');
          err.code = 'HAS_RESERVATIONS';
          throw err;
        }
        const { rowCount } = await client.query(`DELETE FROM warehouse_items WHERE id = $1`, [itemId]);
        return rowCount > 0;
      });

      if (!deleted) return error(res, 404, 'NOT_FOUND', 'Позиция не найдена');
      res.json({ ok: true });
    })
  )
);

router.get(
  '/reservations',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    for (const field of ['item_id', 'order_id', 'status']) {
      if (req.query[field]) {
        params.push(req.query[field]);
        where.push(`${field} = $${params.length}`);
      }
    }
    const { rows } = await getPool().query(
      `SELECT * FROM warehouse_reservations
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, id DESC`,
      params
    );
    res.json({ reservations: rows });
  })
);

router.post(
  '/reservations',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const itemId = Number(req.body?.item_id);
      const qty = requirePositiveNumber(req.body?.qty, 'qty');
      const source = req.body?.source || 'order';
      const orderId = req.body?.order_id || null;
      if (!Number.isSafeInteger(itemId) || !['order', 'manual'].includes(source)) {
        return error(res, 400, 'INVALID_INPUT', 'Некорректный резерв');
      }
      if (source === 'order' && !orderId) {
        return error(res, 400, 'INVALID_INPUT', 'order_id обязателен для order-резерва');
      }

      const reservation = await withTransaction(async (client) => {
        const itemRes = await client.query(`SELECT id, qty FROM warehouse_items WHERE id = $1 FOR UPDATE`, [itemId]);
        const item = itemRes.rows[0];
        if (!item) return null;
        const available = Number(item.qty) - (await activeReservedQty(client, itemId));
        if (qty > available) {
          const err = new Error('Недостаточно свободного остатка');
          err.code = 'INSUFFICIENT_STOCK';
          throw err;
        }
        const { rows } = await client.query(
          `INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status, note, actor_user_id)
           VALUES ($1, $2, $3, $4, 'active', $5, $6)
           RETURNING *`,
          [itemId, orderId, qty, source, req.body?.note || null, req.user.id]
        );
        return rows[0];
      });

      if (!reservation) return error(res, 404, 'NOT_FOUND', 'Позиция не найдена');
      res.status(201).json({ reservation });
    })
  )
);

router.patch(
  '/reservations/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(`SELECT status FROM warehouse_reservations WHERE id = $1`, [req.params.id]);
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Резерв не найден');
      if (rows[0].status !== 'active') {
        return error(res, 400, 'IMMUTABLE_RESERVATION', 'Финальный резерв нельзя менять');
      }
      return error(res, 400, 'UNSUPPORTED_OPERATION', 'Измени резерв через release + create new');
    })
  )
);

router.post(
  '/reservations/:id/release',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rows } = await getPool().query(
        `UPDATE warehouse_reservations
            SET status = 'released', released_at = NOW()
          WHERE id = $1 AND status = 'active'
          RETURNING *`,
        [req.params.id]
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Активный резерв не найден');
      res.json({ reservation: rows[0] });
    })
  )
);

router.post(
  '/reservations/:id/consume',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const result = await withTransaction(async (client) => {
        const reservationRes = await client.query(
          `SELECT * FROM warehouse_reservations WHERE id = $1 FOR UPDATE`,
          [req.params.id]
        );
        const reservation = reservationRes.rows[0];
        if (!reservation || reservation.status !== 'active') return null;

        const itemRes = await client.query(`SELECT id, qty FROM warehouse_items WHERE id = $1 FOR UPDATE`, [
          reservation.item_id,
        ]);
        const item = itemRes.rows[0];
        const before = Number(item.qty);
        const qty = Number(reservation.qty);
        const after = before - qty;
        if (after < 0) {
          const err = new Error('Недостаточно остатка');
          err.code = 'INSUFFICIENT_STOCK';
          throw err;
        }

        await client.query(`UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [
          after,
          reservation.item_id,
        ]);
        const updatedReservation = await client.query(
          `UPDATE warehouse_reservations
              SET status = 'consumed', consumed_at = NOW()
            WHERE id = $1
            RETURNING *`,
          [reservation.id]
        );
        await client.query(
          `INSERT INTO warehouse_history
             (item_id, type, qty_before, qty_after, qty_change, order_id, actor_user_id, note)
           VALUES ($1, 'consume', $2, $3, $4, $5, $6, $7)`,
          [reservation.item_id, before, after, -qty, reservation.order_id, req.user.id, req.body?.note || null]
        );
        return { reservation: updatedReservation.rows[0], qty: after };
      });

      if (!result) return error(res, 404, 'NOT_FOUND', 'Активный резерв не найден');
      res.json(result);
    })
  )
);

router.get(
  '/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.item_id) {
      params.push(req.query.item_id);
      where.push(`item_id = $${params.length}`);
    }
    if (req.query.from) {
      params.push(req.query.from);
      where.push(`created_at >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(req.query.to);
      where.push(`created_at <= $${params.length}`);
    }
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    params.push(limit);
    const { rows } = await getPool().query(
      `SELECT * FROM warehouse_history
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, id DESC
        LIMIT $${params.length}`,
      params
    );
    res.json({ history: rows });
  })
);

router.post(
  '/inventory-audit',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const changes = Array.isArray(req.body?.changes) ? req.body.changes : [];
      const auditId = Date.now();
      const result = await withTransaction(async (client) => {
        const applied = [];
        for (const change of changes) {
          const itemId = Number(change.item_id);
          const factualQty = requireNonNegativeNumber(change.factual_qty, 'factual_qty');
          const itemRes = await client.query(`SELECT id, qty FROM warehouse_items WHERE id = $1 FOR UPDATE`, [itemId]);
          const item = itemRes.rows[0];
          if (!item) continue;
          const before = Number(item.qty);
          const delta = factualQty - before;
          if (delta === 0) continue;
          await client.query(`UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [factualQty, itemId]);
          await client.query(
            `INSERT INTO warehouse_history
               (item_id, type, qty_before, qty_after, qty_change, audit_id, actor_user_id, note)
             VALUES ($1, 'inventory_audit', $2, $3, $4, $5, $6, $7)`,
            [itemId, before, factualQty, delta, auditId, req.user.id, change.note || null]
          );
          applied.push({ item_id: itemId, qty_before: before, qty_after: factualQty, qty_change: delta });
        }
        return applied;
      });
      res.json({ auditId, changes: result });
    })
  )
);

export default router;

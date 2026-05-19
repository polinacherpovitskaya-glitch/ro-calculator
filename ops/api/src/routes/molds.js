import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function error(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, details } });
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      if (['INVALID_INPUT', 'INVALID_WAREHOUSE_ITEM', 'INSUFFICIENT_STOCK'].includes(code)) {
        return error(res, 400, code, err.message || 'Некорректные данные', err.details);
      }
      console.error(err);
      return error(res, 500, code, 'Внутренняя ошибка');
    }
  };
}

function codedError(code, message, details = undefined) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  return err;
}

function numeric(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = null) {
  const number = numeric(value, fallback);
  return number === null ? null : Math.trunc(number);
}

function moldPayload(row) {
  return {
    ...row,
    capacity: row.capacity === null ? null : Number(row.capacity),
    usage_count: Number(row.usage_count),
    usage_limit: row.usage_limit === null ? null : Number(row.usage_limit),
  };
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
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`LOWER(name) LIKE $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM molds
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, id DESC`,
      params
    );
    res.json({ molds: rows.map(moldPayload) });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(`SELECT * FROM molds WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Молд не найден');
    res.json({ mold: moldPayload(rows[0]) });
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
      const { rows } = await getPool().query(
        `INSERT INTO molds (id, name, type, status, capacity, usage_count, usage_limit, photo_url, note, extras)
         VALUES ($1, $2, $3, COALESCE($4, 'active'), $5, COALESCE($6, 0), $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          name,
          req.body?.type || null,
          req.body?.status || 'active',
          integer(req.body?.capacity),
          integer(req.body?.usage_count, 0),
          integer(req.body?.usage_limit),
          req.body?.photo_url || null,
          req.body?.note || null,
          req.body?.extras || {},
        ]
      );
      res.status(201).json({ mold: moldPayload(rows[0]) });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['name', 'type', 'status', 'capacity', 'usage_count', 'usage_limit', 'photo_url', 'note', 'extras'];
      const values = [];
      const updates = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        const isInteger = field === 'capacity' || field === 'usage_count' || field === 'usage_limit';
        values.push(isInteger ? integer(req.body[field]) : req.body[field] || null);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE molds SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Молд не найден');
      res.json({ mold: moldPayload(rows[0]) });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM molds WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Молд не найден');
      res.json({ ok: true });
    })
  )
);

router.get(
  '/:id/hardware',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(
      `SELECT mh.*, wi.name AS warehouse_item_name, wi.qty AS warehouse_qty
         FROM mold_hardware mh
         LEFT JOIN warehouse_items wi ON wi.id = mh.warehouse_item_id
        WHERE mh.mold_id = $1
        ORDER BY mh.id`,
      [req.params.id]
    );
    res.json({ hardware: rows });
  })
);

router.put(
  '/:id/hardware',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const hardware = await withTransaction(async (client) => {
        const moldRes = await client.query(`SELECT id FROM molds WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (!moldRes.rows[0]) return null;

        const ids = [...new Set(items.map((item) => numeric(item.warehouse_item_id)).filter(Boolean))].sort((a, b) => a - b);
        if (ids.length) {
          const found = await client.query(`SELECT id FROM warehouse_items WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids]);
          if (found.rows.length !== ids.length) {
            throw codedError('INVALID_WAREHOUSE_ITEM', 'Фурнитура должна существовать на складе');
          }
        }

        await client.query(`DELETE FROM mold_hardware WHERE mold_id = $1`, [req.params.id]);
        for (const item of items) {
          const warehouseItemId = numeric(item.warehouse_item_id);
          const qtyPerUse = numeric(item.qty_per_use);
          if (!warehouseItemId || !qtyPerUse || qtyPerUse <= 0) {
            throw codedError('INVALID_INPUT', 'warehouse_item_id и qty_per_use обязательны');
          }
          await client.query(
            `INSERT INTO mold_hardware (mold_id, warehouse_item_id, qty_per_use, note, extras)
             VALUES ($1, $2, $3, $4, $5)`,
            [req.params.id, warehouseItemId, qtyPerUse, item.note || null, item.extras || {}]
          );
        }

        const { rows } = await client.query(`SELECT * FROM mold_hardware WHERE mold_id = $1 ORDER BY id`, [req.params.id]);
        return rows;
      });

      if (!hardware) return error(res, 404, 'NOT_FOUND', 'Молд не найден');
      res.json({ hardware });
    })
  )
);

router.post(
  '/:id/use',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const units = integer(req.body?.units);
      if (!units || units <= 0) return error(res, 400, 'INVALID_INPUT', 'units должен быть больше 0');

      const mold = await withTransaction(async (client) => {
        const moldRes = await client.query(`SELECT * FROM molds WHERE id = $1 FOR UPDATE`, [req.params.id]);
        const current = moldRes.rows[0];
        if (!current) return null;

        const hardwareRes = await client.query(`SELECT * FROM mold_hardware WHERE mold_id = $1 ORDER BY warehouse_item_id`, [current.id]);
        const hardware = hardwareRes.rows;
        const ids = hardware.map((item) => Number(item.warehouse_item_id)).filter(Boolean).sort((a, b) => a - b);
        const itemRows = ids.length
          ? await client.query(`SELECT id, qty FROM warehouse_items WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [ids])
          : { rows: [] };
        const byId = new Map(itemRows.rows.map((item) => [String(item.id), item]));
        const shortages = [];

        for (const link of hardware) {
          const warehouseItem = byId.get(String(link.warehouse_item_id));
          const needed = Number(link.qty_per_use) * units;
          if (!warehouseItem || Number(warehouseItem.qty) < needed) {
            shortages.push({
              warehouse_item_id: link.warehouse_item_id,
              needed,
              available: warehouseItem ? Number(warehouseItem.qty) : 0,
            });
          }
        }
        if (shortages.length) {
          throw codedError('INSUFFICIENT_STOCK', 'Недостаточно фурнитуры для молда', shortages);
        }

        for (const link of hardware) {
          const warehouseItem = byId.get(String(link.warehouse_item_id));
          const needed = Number(link.qty_per_use) * units;
          const before = Number(warehouseItem.qty);
          const after = before - needed;
          await client.query(`UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [
            after,
            link.warehouse_item_id,
          ]);
          await client.query(
            `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, mold_id, order_id, actor_user_id, actor_name, note)
             VALUES ($1, 'consume', $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              link.warehouse_item_id,
              before,
              after,
              -needed,
              current.id,
              numeric(req.body?.order_id),
              req.user.id,
              req.body?.operator_name || null,
              req.body?.note || null,
            ]
          );
        }

        await client.query(
          `INSERT INTO mold_usage_log (mold_id, units, order_id, operator_name, note)
           VALUES ($1, $2, $3, $4, $5)`,
          [current.id, units, numeric(req.body?.order_id), req.body?.operator_name || null, req.body?.note || null]
        );
        const updated = await client.query(
          `UPDATE molds SET usage_count = usage_count + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
          [units, current.id]
        );
        return moldPayload(updated.rows[0]);
      });

      if (!mold) return error(res, 404, 'NOT_FOUND', 'Молд не найден');
      res.json({ mold });
    })
  )
);

export default router;

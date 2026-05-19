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

function marketplaceSetId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function boolValue(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') return value !== 'false';
  return Boolean(value);
}

function setPayload(row) {
  return {
    ...row,
    price: row.price === null ? null : Number(row.price),
    composition: Array.isArray(row.composition) ? row.composition.map((item) => ({ ...item, qty: Number(item.qty) })) : [],
  };
}

async function validateComposition(client, composition) {
  if (composition === undefined) return undefined;
  if (!Array.isArray(composition)) {
    throw codedError('INVALID_INPUT', 'composition должен быть массивом');
  }

  const byItem = new Map();
  for (const entry of composition) {
    const warehouseItemId = marketplaceSetId(entry?.warehouse_item_id);
    const qty = numeric(entry?.qty);
    if (!warehouseItemId || !qty || qty <= 0) {
      throw codedError('INVALID_INPUT', 'composition требует warehouse_item_id и qty > 0');
    }
    byItem.set(warehouseItemId, (byItem.get(warehouseItemId) || 0) + qty);
  }

  const ids = [...byItem.keys()].sort((a, b) => a - b);
  if (ids.length) {
    const found = await client.query(`SELECT id FROM warehouse_items WHERE id = ANY($1::bigint[]) ORDER BY id`, [ids]);
    if (found.rows.length !== ids.length) {
      throw codedError('INVALID_WAREHOUSE_ITEM', 'Все позиции набора должны существовать на складе');
    }
  }

  return ids.map((warehouseItemId) => ({ warehouse_item_id: warehouseItemId, qty: byItem.get(warehouseItemId) }));
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.marketplace) {
      params.push(req.query.marketplace);
      where.push(`marketplace = $${params.length}`);
    }
    if (req.query.active !== undefined) {
      params.push(String(req.query.active) !== 'false');
      where.push(`is_active = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(sku, '')) LIKE $${params.length})`);
    }

    const { rows } = await getPool().query(
      `SELECT * FROM marketplace_sets
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, id DESC`,
      params
    );
    res.json({ marketplace_sets: rows.map(setPayload) });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await getPool().query(`SELECT * FROM marketplace_sets WHERE id = $1`, [req.params.id]);
    if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Набор не найден');
    res.json({ marketplace_set: setPayload(rows[0]) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = marketplaceSetId(req.body?.id || Date.now());
      const name = String(req.body?.name || '').trim();
      if (!id || !name) return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');

      const set = await withTransaction(async (client) => {
        const composition = await validateComposition(client, req.body?.composition || []);
        const { rows } = await client.query(
          `INSERT INTO marketplace_sets (id, name, marketplace, sku, price, currency, composition, is_active, extras)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            id,
            name,
            req.body?.marketplace || null,
            req.body?.sku || null,
            numeric(req.body?.price),
            req.body?.currency || null,
            JSON.stringify(composition),
            boolValue(req.body?.is_active, true),
            req.body?.extras || {},
          ]
        );
        return setPayload(rows[0]);
      });

      res.status(201).json({ marketplace_set: set });
    })
  )
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const set = await withTransaction(async (client) => {
        const fields = ['name', 'marketplace', 'sku', 'price', 'currency', 'composition', 'is_active', 'extras'];
        const values = [];
        const updates = [];
        for (const field of fields) {
          if (req.body?.[field] === undefined) continue;
          if (field === 'composition') {
            values.push(JSON.stringify(await validateComposition(client, req.body[field])));
          } else if (field === 'price') {
            values.push(numeric(req.body[field]));
          } else if (field === 'is_active') {
            values.push(boolValue(req.body[field]));
          } else if (field === 'extras') {
            values.push(req.body[field] || {});
          } else {
            values.push(req.body[field] || null);
          }
          updates.push(`${field} = $${values.length}`);
        }
        if (!updates.length) throw codedError('INVALID_INPUT', 'Нет изменений');

        values.push(req.params.id);
        const { rows } = await client.query(
          `UPDATE marketplace_sets
              SET ${updates.join(', ')}, updated_at = NOW()
            WHERE id = $${values.length}
            RETURNING *`,
          values
        );
        return rows[0] ? setPayload(rows[0]) : null;
      });

      if (!set) return error(res, 404, 'NOT_FOUND', 'Набор не найден');
      res.json({ marketplace_set: set });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM marketplace_sets WHERE id = $1`, [req.params.id]);
      if (!rowCount) return error(res, 404, 'NOT_FOUND', 'Набор не найден');
      res.json({ ok: true });
    })
  )
);

router.post(
  '/:id/sell',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const qty = integer(req.body?.qty);
      if (!qty || qty <= 0) return error(res, 400, 'INVALID_INPUT', 'qty должен быть больше 0');

      const set = await withTransaction(async (client) => {
        const setRes = await client.query(`SELECT * FROM marketplace_sets WHERE id = $1 FOR UPDATE`, [req.params.id]);
        const current = setRes.rows[0];
        if (!current) return null;

        const composition = await validateComposition(client, current.composition || []);
        const ids = composition.map((item) => Number(item.warehouse_item_id)).sort((a, b) => a - b);
        const itemRows = ids.length
          ? await client.query(`SELECT id, qty FROM warehouse_items WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [ids])
          : { rows: [] };
        const byId = new Map(itemRows.rows.map((item) => [String(item.id), item]));
        const shortages = [];

        for (const entry of composition) {
          const warehouseItem = byId.get(String(entry.warehouse_item_id));
          const needed = Number(entry.qty) * qty;
          if (!warehouseItem || Number(warehouseItem.qty) < needed) {
            shortages.push({
              warehouse_item_id: entry.warehouse_item_id,
              needed,
              available: warehouseItem ? Number(warehouseItem.qty) : 0,
            });
          }
        }
        if (shortages.length) {
          throw codedError('INSUFFICIENT_STOCK', 'Недостаточно остатков для набора', shortages);
        }

        for (const entry of composition) {
          const warehouseItem = byId.get(String(entry.warehouse_item_id));
          const needed = Number(entry.qty) * qty;
          const before = Number(warehouseItem.qty);
          const after = before - needed;
          await client.query(`UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [
            after,
            entry.warehouse_item_id,
          ]);
          await client.query(
            `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, marketplace_set_id, actor_user_id, actor_name, note)
             VALUES ($1, 'consume', $2, $3, $4, $5, $6, $7, $8)`,
            [
              entry.warehouse_item_id,
              before,
              after,
              -needed,
              current.id,
              req.user.id,
              req.body?.operator_name || null,
              req.body?.note || null,
            ]
          );
        }

        return setPayload(current);
      });

      if (!set) return error(res, 404, 'NOT_FOUND', 'Набор не найден');
      res.json({ marketplace_set: set });
    })
  )
);

export default router;

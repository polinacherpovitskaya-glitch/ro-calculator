import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth } from '../middleware/auth.js';
import { receiveShipmentInTransaction } from '../shipments/receive.js';

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
          'EMPTY_PURCHASE',
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

function newId() {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
}

function purchasePayload(row, items = undefined) {
  return {
    ...row,
    paid_amount: row.paid_amount === null ? null : Number(row.paid_amount),
    items,
  };
}

function catalogPayload(row) {
  return {
    ...row,
    last_price: row.last_price === null ? null : Number(row.last_price),
  };
}

async function loadPurchase(client, id) {
  const purchaseRes = await client.query(`SELECT * FROM china_purchases WHERE id = $1`, [id]);
  const purchase = purchaseRes.rows[0];
  if (!purchase) return null;
  const itemsRes = await client.query(`SELECT * FROM china_purchase_items WHERE purchase_id = $1 ORDER BY id`, [id]);
  return purchasePayload(purchase, itemsRes.rows);
}

router.get(
  '/purchases',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.status) {
      params.push(req.query.status);
      where.push(`status = $${params.length}`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM china_purchases
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, id DESC`,
      params
    );
    res.json({ purchases: rows.map((row) => purchasePayload(row)) });
  })
);

router.post(
  '/purchases',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = Number(req.body?.id || newId());
      if (!Number.isSafeInteger(id)) return error(res, 400, 'INVALID_INPUT', 'id обязателен');
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      const purchase = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO china_purchases
             (id, title, supplier, order_url, status, paid_amount, paid_currency, paid_at, arrived_at, shipment_id, note, extras)
           VALUES ($1, $2, $3, $4, COALESCE($5, 'draft'), $6, $7, $8, $9, $10, $11, $12)
           RETURNING *`,
          [
            id,
            req.body?.title || null,
            req.body?.supplier || null,
            req.body?.order_url || null,
            req.body?.status || 'draft',
            numeric(req.body?.paid_amount),
            req.body?.paid_currency || null,
            req.body?.paid_at || null,
            req.body?.arrived_at || null,
            numeric(req.body?.shipment_id),
            req.body?.note || null,
            req.body?.extras || {},
          ]
        );
        for (const item of items) {
          await client.query(
            `INSERT INTO china_purchase_items (purchase_id, warehouse_item_id, name, qty, unit_price, currency, extras)
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
        return purchasePayload(rows[0], items);
      });

      res.status(201).json({ purchase });
    })
  )
);

router.get(
  '/purchases/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const purchase = await loadPurchase(getPool(), req.params.id);
    if (!purchase) return error(res, 404, 'NOT_FOUND', 'Закупка не найдена');
    res.json({ purchase });
  })
);

router.patch(
  '/purchases/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = [
        'title',
        'supplier',
        'order_url',
        'status',
        'paid_amount',
        'paid_currency',
        'paid_at',
        'arrived_at',
        'shipment_id',
        'note',
        'extras',
      ];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        const isNumeric = field === 'paid_amount' || field === 'shipment_id';
        values.push(isNumeric ? numeric(req.body[field]) : req.body[field] || null);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE china_purchases SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Закупка не найдена');
      res.json({ purchase: purchasePayload(rows[0]) });
    })
  )
);

router.delete(
  '/purchases/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const { rowCount } = await getPool().query(`DELETE FROM china_purchases WHERE id = $1 AND status = 'draft'`, [
        req.params.id,
      ]);
      if (!rowCount) return error(res, 400, 'CANNOT_DELETE', 'Удалить можно только draft закупку');
      res.json({ ok: true });
    })
  )
);

router.post(
  '/purchases/:id/receive',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const result = await withTransaction(async (client) => {
        const purchaseRes = await client.query(`SELECT * FROM china_purchases WHERE id = $1 FOR UPDATE`, [req.params.id]);
        const purchase = purchaseRes.rows[0];
        if (!purchase) return null;
        if (purchase.status === 'received') {
          const err = new Error('Закупка уже принята');
          err.code = 'ALREADY_RECEIVED';
          throw err;
        }

        const itemsRes = await client.query(`SELECT * FROM china_purchase_items WHERE purchase_id = $1 ORDER BY id`, [
          purchase.id,
        ]);
        const items = itemsRes.rows;
        if (items.length === 0) {
          const err = new Error('В закупке нет позиций');
          err.code = 'EMPTY_PURCHASE';
          throw err;
        }

        let shipmentId = purchase.shipment_id;
        if (!shipmentId) {
          shipmentId = numeric(req.body?.shipment_id) || newId();
          const name = purchase.title || `China purchase ${purchase.id}`;
          await client.query(
            `INSERT INTO shipments (id, name, source, status, total_cost, currency, note, extras)
             VALUES ($1, $2, 'china', 'planned', $3, $4, $5, $6)`,
            [
              shipmentId,
              name,
              purchase.paid_amount,
              purchase.paid_currency,
              purchase.note,
              { china_purchase_id: purchase.id },
            ]
          );
          for (const item of items) {
            await client.query(
              `INSERT INTO shipment_items (shipment_id, warehouse_item_id, name, qty, unit_price, currency, extras)
               VALUES ($1, $2, $3, $4, $5, $6, $7)`,
              [shipmentId, item.warehouse_item_id, item.name, item.qty, item.unit_price, item.currency, item.extras || {}]
            );
          }
          await client.query(`UPDATE china_purchases SET shipment_id = $1, updated_at = NOW() WHERE id = $2`, [
            shipmentId,
            purchase.id,
          ]);
        }

        const shipment = await receiveShipmentInTransaction(client, {
          shipmentId,
          actorUserId: req.user.id,
        });
        const updatedPurchase = await loadPurchase(client, purchase.id);
        return { shipment, purchase: updatedPurchase };
      });

      if (!result) return error(res, 404, 'NOT_FOUND', 'Закупка не найдена');
      res.json(result);
    })
  )
);

router.get(
  '/catalog',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(COALESCE(sku, '')) LIKE $${params.length})`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM china_catalog
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, id DESC`,
      params
    );
    res.json({ items: rows.map(catalogPayload) });
  })
);

router.post(
  '/catalog',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = Number(req.body?.id || newId());
      const name = String(req.body?.name || '').trim();
      if (!Number.isSafeInteger(id) || !name) return error(res, 400, 'INVALID_INPUT', 'id и name обязательны');
      const { rows } = await getPool().query(
        `INSERT INTO china_catalog
           (id, name, sku, description, photo_url, last_price, last_currency, supplier, extras)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          id,
          name,
          req.body?.sku || null,
          req.body?.description || null,
          req.body?.photo_url || null,
          numeric(req.body?.last_price),
          req.body?.last_currency || null,
          req.body?.supplier || null,
          req.body?.extras || {},
        ]
      );
      res.status(201).json({ item: catalogPayload(rows[0]) });
    })
  )
);

router.patch(
  '/catalog/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const fields = ['name', 'sku', 'description', 'photo_url', 'last_price', 'last_currency', 'supplier', 'extras'];
      const updates = [];
      const values = [];
      for (const field of fields) {
        if (req.body?.[field] === undefined) continue;
        values.push(field === 'last_price' ? numeric(req.body[field]) : req.body[field] || null);
        updates.push(`${field} = $${values.length}`);
      }
      if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
      values.push(req.params.id);
      const { rows } = await getPool().query(
        `UPDATE china_catalog SET ${updates.join(', ')}, updated_at = NOW()
          WHERE id = $${values.length}
          RETURNING *`,
        values
      );
      if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Позиция каталога не найдена');
      res.json({ item: catalogPayload(rows[0]) });
    })
  )
);

export default router;

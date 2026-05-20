import { Router } from 'express';
import { getPool, withTransaction } from '../db.js';
import { withIdempotency } from '../idempotency.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { calcOrder } from '../calc-dist/index.js';
import { calcFactual } from '../calc-dist/factual.js';
import { releaseOrphanReservations } from '../cron/reservation-cleanup.js';

const router = Router();
const ORDER_FIELDS = [
  'order_name',
  'client_name',
  'client_email',
  'client_phone',
  'status',
  'deadline',
  'deadline_start',
  'manager_id',
  'quantity',
  'total_revenue',
  'total_cost',
  'total_margin',
  'margin_percent',
  'total_hours_plan',
  'production_hours_plastic',
  'production_hours_packaging',
  'production_hours_hardware',
  'calculator_data',
  'extras',
];
const ITEM_FIELDS = ['type', 'name', 'qty', 'unit_price', 'line_total', 'item_data', 'position'];
const STATUSES = new Set(['draft', 'quoted', 'approved', 'in_production', 'ready', 'shipped', 'closed', 'cancelled']);
const TRANSITIONS = {
  draft: new Set(['quoted', 'in_production', 'cancelled']),
  quoted: new Set(['approved', 'draft', 'cancelled']),
  approved: new Set(['in_production', 'draft', 'cancelled']),
  in_production: new Set(['ready', 'cancelled']),
  ready: new Set(['shipped', 'in_production']),
  shipped: new Set(['closed']),
  closed: new Set(),
  cancelled: new Set(),
};

function error(res, status, code, message, details = undefined) {
  return res.status(status).json({ error: { code, message, details } });
}

function codedError(code, message, details = undefined, status = 400) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  err.status = status;
  return err;
}

function asyncHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const code = err.code || 'INTERNAL_ERROR';
      const status = err.status || (['INVALID_INPUT', 'INVALID_TRANSITION', 'INSUFFICIENT_STOCK', 'ORDER_FINAL', 'BAD_QTY', 'NOT_DELETABLE'].includes(code) ? 400 : 500);
      if (status >= 500) console.error(err);
      return error(res, status, code, status >= 500 ? 'Внутренняя ошибка' : err.message, err.details);
    }
  };
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

function dateValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw codedError('INVALID_INPUT', 'Дата должна быть YYYY-MM-DD');
  return text;
}

function jsonObject(value, fallback = {}) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    } catch {
      // Handled below.
    }
  }
  throw codedError('INVALID_INPUT', 'JSON поле должно быть объектом');
}

function normalizeStatus(value, fallback = 'draft') {
  const status = String(value || fallback);
  if (!STATUSES.has(status)) throw codedError('INVALID_INPUT', 'Некорректный статус');
  return status;
}

function etag(row) {
  return `"${new Date(row.updated_at).toISOString()}"`;
}

function assertMatch(req, row) {
  const expected = req.get('if-match');
  if (expected && expected !== etag(row)) {
    throw codedError('ETAG_MISMATCH', 'Заказ был изменён другим запросом', { current: etag(row) }, 412);
  }
}

function orderPayload(row) {
  if (!row) return null;
  return {
    ...row,
    quantity: row.quantity === null ? null : Number(row.quantity),
    total_revenue: row.total_revenue === null ? null : Number(row.total_revenue),
    total_cost: row.total_cost === null ? null : Number(row.total_cost),
    total_margin: row.total_margin === null ? null : Number(row.total_margin),
    margin_percent: row.margin_percent === null ? null : Number(row.margin_percent),
    total_hours_plan: row.total_hours_plan === null ? null : Number(row.total_hours_plan),
    production_hours_plastic: row.production_hours_plastic === null ? null : Number(row.production_hours_plastic),
    production_hours_packaging: row.production_hours_packaging === null ? null : Number(row.production_hours_packaging),
    production_hours_hardware: row.production_hours_hardware === null ? null : Number(row.production_hours_hardware),
  };
}

function itemPayload(row) {
  return {
    ...row,
    qty: row.qty === null ? null : Number(row.qty),
    unit_price: row.unit_price === null ? null : Number(row.unit_price),
    line_total: row.line_total === null ? null : Number(row.line_total),
  };
}

function normalizeOrderInput(body, partial = false) {
  const values = {};
  for (const field of ORDER_FIELDS) {
    if (body?.[field] === undefined) continue;
    if (['deadline', 'deadline_start'].includes(field)) values[field] = dateValue(body[field]);
    else if (field === 'status') values[field] = normalizeStatus(body[field]);
    else if (field === 'manager_id' || field === 'quantity') values[field] = integer(body[field]);
    else if (['total_revenue', 'total_cost', 'total_margin', 'margin_percent', 'total_hours_plan', 'production_hours_plastic', 'production_hours_packaging', 'production_hours_hardware'].includes(field)) values[field] = numeric(body[field]);
    else if (field === 'calculator_data') values[field] = body[field] === null ? null : jsonObject(body[field]);
    else if (field === 'extras') values[field] = jsonObject(body[field]);
    else values[field] = body[field] || null;
  }
  if (!partial && values.status === undefined) values.status = 'draft';
  if (!partial && values.extras === undefined) values.extras = {};
  return values;
}

function normalizeItemInput(body, partial = false) {
  const values = {};
  for (const field of ITEM_FIELDS) {
    if (body?.[field] === undefined) continue;
    if (field === 'qty' || field === 'unit_price' || field === 'line_total') values[field] = numeric(body[field]);
    else if (field === 'position') values[field] = integer(body[field]);
    else if (field === 'item_data') values[field] = jsonObject(body[field]);
    else values[field] = body[field] || null;
  }
  if (!partial && values.item_data === undefined) values.item_data = {};
  return values;
}

async function loadOrderDetail(client, orderId) {
  const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  const order = orderRes.rows[0];
  if (!order) return null;
  const items = await client.query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY position NULLS LAST, id`, [orderId]);
  const factual = await client.query(`SELECT * FROM order_factuals WHERE order_id = $1`, [orderId]);
  const history = await client.query(`SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY created_at DESC`, [orderId]);
  return {
    order: orderPayload(order),
    items: items.rows.map(itemPayload),
    factual: factual.rows[0] || null,
    status_history: history.rows,
  };
}

async function rebuildOrderReservations(client, orderId) {
  const items = await client.query(`SELECT item_data FROM order_items WHERE order_id = $1`, [orderId]);
  const byItem = new Map();
  for (const row of items.rows) {
    const data = row.item_data || {};
    const candidates = [
      data.warehouse_item_id,
      data.hardware_warehouse_item_id,
      data.packaging_warehouse_item_id,
      data.nfc_warehouse_item_id,
    ];
    const itemId = candidates.map((candidate) => integer(candidate)).find(Boolean);
    const qty = numeric(data.reserve_qty, numeric(data.qty, data.quantity));
    if (itemId && qty && qty > 0) byItem.set(itemId, (byItem.get(itemId) || 0) + qty);
  }
  await client.query(`DELETE FROM warehouse_reservations WHERE order_id = $1 AND source = 'order' AND status = 'active'`, [orderId]);
  for (const [itemId, qty] of byItem.entries()) {
    await client.query(
      `INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status, note)
       VALUES ($1, $2, $3, 'order', 'active', $4)`,
      [itemId, orderId, qty, 'Order items reservation rebuild']
    );
  }
}

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.query.status) {
      const statuses = String(req.query.status).split(',').map((item) => item.trim()).filter(Boolean);
      params.push(statuses);
      where.push(`status = ANY($${params.length}::text[])`);
    }
    if (req.query.from) {
      params.push(dateValue(req.query.from));
      where.push(`deadline >= $${params.length}`);
    }
    if (req.query.to) {
      params.push(dateValue(req.query.to));
      where.push(`deadline <= $${params.length}`);
    }
    if (req.query.manager_id) {
      params.push(integer(req.query.manager_id));
      where.push(`manager_id = $${params.length}`);
    }
    if (req.query.search) {
      params.push(`%${String(req.query.search).toLowerCase()}%`);
      where.push(`(LOWER(COALESCE(order_name, '')) LIKE $${params.length} OR LOWER(COALESCE(client_name, '')) LIKE $${params.length})`);
    }
    const { rows } = await getPool().query(
      `SELECT * FROM orders
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC, id DESC
        LIMIT 500`,
      params
    );
    res.json({ orders: rows.map(orderPayload) });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const id = integer(req.body?.id || Date.now());
      if (!id) return error(res, 400, 'INVALID_INPUT', 'id обязателен');
      const values = normalizeOrderInput(req.body);
      const fields = ['id', ...Object.keys(values)];
      const params = [id, ...Object.values(values)];
      const placeholders = fields.map((_, index) => `$${index + 1}`);
      const { rows } = await getPool().query(
        `INSERT INTO orders (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        params
      );
      res.status(201).set('ETag', etag(rows[0])).json({ order: orderPayload(rows[0]) });
    })
  )
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const detail = await loadOrderDetail(getPool(), req.params.id);
    if (!detail) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
    res.set('ETag', etag(detail.order)).json(detail);
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const order = await withTransaction(async (client) => {
        const current = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (!current.rows[0]) return null;
        assertMatch(req, current.rows[0]);
        const values = normalizeOrderInput(req.body, true);
        const updates = [];
        const params = [];
        for (const [field, value] of Object.entries(values)) {
          params.push(value);
          updates.push(`${field} = $${params.length}`);
        }
        if (!updates.length) throw codedError('INVALID_INPUT', 'Нет изменений');
        params.push(req.params.id);
        const { rows } = await client.query(
          `UPDATE orders SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
          params
        );
        if (['closed', 'cancelled'].includes(rows[0].status)) await releaseOrphanReservations(client);
        return rows[0];
      });
      if (!order) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.set('ETag', etag(order)).json({ order: orderPayload(order) });
    })
  )
);

router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const deleted = await withTransaction(async (client) => {
        const current = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (!current.rows[0]) return null;
        if (current.rows[0].status !== 'draft') throw codedError('NOT_DELETABLE', 'Удалять можно только draft-заказы');
        const result = await client.query(`DELETE FROM orders WHERE id = $1`, [req.params.id]);
        return result.rowCount > 0;
      });
      if (!deleted) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.json({ ok: true });
    })
  )
);

router.post(
  '/:id/clone',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const cloned = await withTransaction(async (client) => {
        const source = await loadOrderDetail(client, req.params.id);
        if (!source) return null;
        const newId = integer(req.body?.id || Date.now());
        const newName = req.body?.order_name || `${source.order.order_name || `Заказ ${source.order.id}`} (копия)`;
        const order = await client.query(
          `INSERT INTO orders (
              id, order_name, client_name, client_phone, client_email, manager_id, status, deadline,
              total_revenue, total_cost, total_margin, margin_percent, total_hours_plan,
              production_hours_plastic, production_hours_packaging, production_hours_hardware,
              calculator_data, extras
            )
            SELECT
              $1, $2, client_name, client_phone, client_email, manager_id, 'draft', deadline,
              total_revenue, total_cost, total_margin, margin_percent, total_hours_plan,
              production_hours_plastic, production_hours_packaging, production_hours_hardware,
              calculator_data, extras
            FROM orders WHERE id = $3
            RETURNING *`,
          [newId, newName, req.params.id]
        );
        for (const item of source.items) {
          await client.query(
            `INSERT INTO order_items (id, order_id, type, name, qty, unit_price, line_total, position, item_data)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              Date.now() + Math.floor(Math.random() * 100000),
              newId,
              item.type,
              item.name,
              item.qty,
              item.unit_price,
              item.line_total,
              item.position,
              item.item_data || {},
            ]
          );
        }
        await rebuildOrderReservations(client, newId);
        return order.rows[0];
      });
      if (!cloned) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.status(201).json({ order: orderPayload(cloned) });
    })
  )
);

router.post(
  '/:id/items',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const item = await withTransaction(async (client) => {
        const order = await client.query(`SELECT id FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
        if (!order.rows[0]) return null;
        const id = integer(req.body?.id || Date.now());
        const values = normalizeItemInput(req.body);
        const fields = ['id', 'order_id', ...Object.keys(values)];
        const params = [id, req.params.id, ...Object.values(values)];
        const placeholders = fields.map((_, index) => `$${index + 1}`);
        const { rows } = await client.query(`INSERT INTO order_items (${fields.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`, params);
        await client.query(`UPDATE orders SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
        await rebuildOrderReservations(client, req.params.id);
        return rows[0];
      });
      if (!item) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.status(201).json({ item: itemPayload(item) });
    })
  )
);

router.patch(
  '/:id/items/:itemId',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const item = await withTransaction(async (client) => {
        const current = await client.query(`SELECT i.*, o.updated_at AS order_updated_at FROM order_items i JOIN orders o ON o.id = i.order_id WHERE i.id = $1 AND i.order_id = $2 FOR UPDATE`, [req.params.itemId, req.params.id]);
        if (!current.rows[0]) return null;
        if (req.get('if-match') && req.get('if-match') !== `"${new Date(current.rows[0].updated_at).toISOString()}"`) {
          throw codedError('ETAG_MISMATCH', 'Позиция была изменена другим запросом', undefined, 412);
        }
        const values = normalizeItemInput(req.body, true);
        const updates = [];
        const params = [];
        for (const [field, value] of Object.entries(values)) {
          params.push(value);
          updates.push(`${field} = $${params.length}`);
        }
        if (!updates.length) throw codedError('INVALID_INPUT', 'Нет изменений');
        params.push(req.params.itemId, req.params.id);
        const { rows } = await client.query(
          `UPDATE order_items SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length - 1} AND order_id = $${params.length} RETURNING *`,
          params
        );
        await client.query(`UPDATE orders SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
        await rebuildOrderReservations(client, req.params.id);
        return rows[0];
      });
      if (!item) return error(res, 404, 'NOT_FOUND', 'Позиция не найдена');
      res.json({ item: itemPayload(item) });
    })
  )
);

router.delete(
  '/:id/items/:itemId',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const deleted = await withTransaction(async (client) => {
        const result = await client.query(`DELETE FROM order_items WHERE id = $1 AND order_id = $2`, [req.params.itemId, req.params.id]);
        if (!result.rowCount) return false;
        await client.query(`UPDATE orders SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
        await rebuildOrderReservations(client, req.params.id);
        return true;
      });
      if (!deleted) return error(res, 404, 'NOT_FOUND', 'Позиция не найдена');
      res.json({ ok: true });
    })
  )
);

router.post(
  '/:id/status',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const order = await withTransaction(async (client) => {
        const current = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
        const row = current.rows[0];
        if (!row) return null;
        const next = normalizeStatus(req.body?.new_status);
        if (!TRANSITIONS[row.status]?.has(next)) {
          throw codedError('INVALID_TRANSITION', `Нельзя перейти из ${row.status} в ${next}`, { from: row.status, to: next });
        }
        const updated = await client.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`, [next, req.params.id]);
        await client.query(
          `INSERT INTO order_status_history (order_id, from_status, to_status, actor_user_id, actor_name, note)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.params.id, row.status, next, req.user.id, req.user.email, req.body?.note || null]
        );
        if (['closed', 'cancelled'].includes(next)) await releaseOrphanReservations(client);
        return updated.rows[0];
      });
      if (!order) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.json({ order: orderPayload(order) });
    })
  )
);

router.post(
  '/:id/recalc',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const order = await withTransaction(async (client) => {
        const detail = await loadOrderDetail(client, req.params.id);
        if (!detail) return null;
        const result = calcOrder({ order: detail.order, items: detail.items });
        const calculatorData = { ...(detail.order.calculator_data || {}), ...result, recalculated_at: new Date().toISOString() };
        const { rows } = await client.query(
          `UPDATE orders
              SET calculator_data = $1,
                  total_revenue = $2,
                  total_cost = $3,
                  total_margin = $4,
                  margin_percent = $5,
                  total_hours_plan = $6,
                  production_hours_plastic = $7,
                  production_hours_packaging = $8,
                  production_hours_hardware = $9,
                  updated_at = NOW()
            WHERE id = $10
            RETURNING *`,
          [
            calculatorData,
            result.total_revenue,
            result.total_cost,
            result.total_margin,
            result.margin_percent,
            result.total_hours_plan,
            result.production_hours_plastic,
            result.production_hours_packaging,
            result.production_hours_hardware,
            req.params.id,
          ]
        );
        return rows[0];
      });
      if (!order) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.json({ order: orderPayload(order) });
    })
  )
);

router.post(
  '/:id/consume-hardware',
  requireAuth,
  asyncHandler((req, res) =>
    withIdempotency(req, res, async () => {
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!items.length) throw codedError('NO_ITEMS', 'Нет позиций для списания');
      const result = await withTransaction(async (client) => {
        const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1 FOR UPDATE`, [req.params.id]);
        const order = orderRes.rows[0];
        if (!order) return null;
        if (['closed', 'cancelled'].includes(order.status)) throw codedError('ORDER_FINAL', 'Нельзя списывать в закрытый/отменённый заказ');
        const normalized = items.map((item) => {
          const warehouseItemId = integer(item?.warehouse_item_id);
          const qty = numeric(item?.qty);
          if (!warehouseItemId || !qty || qty <= 0) throw codedError('BAD_QTY', 'qty должен быть больше 0');
          return { warehouseItemId, qty, note: item?.note || req.body?.note || null };
        });
        const ids = [...new Set(normalized.map((item) => item.warehouseItemId))].sort((a, b) => a - b);
        const locked = await client.query(`SELECT * FROM warehouse_items WHERE id = ANY($1::bigint[]) ORDER BY id FOR UPDATE`, [ids]);
        const byId = new Map(locked.rows.map((row) => [Number(row.id), row]));
        for (const item of normalized) {
          const current = byId.get(item.warehouseItemId);
          if (!current) throw codedError('INVALID_INPUT', 'Складская позиция не найдена', { item_id: item.warehouseItemId });
          const before = Number(current.qty);
          const after = before - item.qty;
          if (after < 0) {
            throw codedError('INSUFFICIENT_STOCK', `На складе ${before}, запрошено ${item.qty}`, {
              item_id: item.warehouseItemId,
              available: before,
              requested: item.qty,
            });
          }
          await client.query(`UPDATE warehouse_items SET qty = $1, updated_at = NOW() WHERE id = $2`, [after, item.warehouseItemId]);
          await client.query(
            `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, order_id, actor_user_id, actor_name, note)
             VALUES ($1, 'consume', $2, $3, $4, $5, $6, $7, $8)`,
            [item.warehouseItemId, before, after, -item.qty, req.params.id, req.user.id, req.user.email, item.note]
          );
          let remaining = item.qty;
          const reservations = await client.query(
            `SELECT * FROM warehouse_reservations
              WHERE order_id = $1 AND item_id = $2 AND status = 'active' AND source = 'order'
              ORDER BY created_at, id
              FOR UPDATE`,
            [req.params.id, item.warehouseItemId]
          );
          for (const reservation of reservations.rows) {
            if (remaining <= 0) break;
            const reservationQty = Number(reservation.qty);
            if (reservationQty <= remaining) {
              await client.query(`UPDATE warehouse_reservations SET status = 'consumed', consumed_at = NOW() WHERE id = $1`, [reservation.id]);
              remaining -= reservationQty;
            } else {
              await client.query(`UPDATE warehouse_reservations SET qty = $1, status = 'consumed', consumed_at = NOW() WHERE id = $2`, [remaining, reservation.id]);
              await client.query(
                `INSERT INTO warehouse_reservations (item_id, order_id, qty, source, status, note, actor_user_id)
                 VALUES ($1,$2,$3,'order','active',$4,$5)`,
                [item.warehouseItemId, req.params.id, reservationQty - remaining, `Split from consumed reservation #${reservation.id}`, req.user.id]
              );
              remaining = 0;
            }
          }
        }
        await client.query(`UPDATE orders SET updated_at = NOW() WHERE id = $1`, [req.params.id]);
        return { ok: true };
      });
      if (!result) return error(res, 404, 'NOT_FOUND', 'Заказ не найден');
      res.json(result);
    })
  )
);

router.get('/:id/factual', requireAuth, asyncHandler(async (req, res) => {
  const { rows } = await getPool().query(`SELECT * FROM order_factuals WHERE order_id = $1`, [req.params.id]);
  res.json({ factual: rows[0] || null });
}));

router.post('/:id/factual', requireAuth, asyncHandler((req, res) => withIdempotency(req, res, async () => {
  const data = jsonObject(req.body?.factual_data || req.body || {});
  const id = integer(req.body?.id || Date.now());
  const actualRevenue = numeric(req.body?.actual_revenue ?? data.fact_revenue);
  const actualCost = numeric(req.body?.actual_cost ?? data.fact_total);
  const actualMargin = actualRevenue !== null && actualCost !== null ? actualRevenue - actualCost : numeric(req.body?.actual_margin);
  const { rows } = await getPool().query(
    `INSERT INTO order_factuals (id, order_id, factual_data, actual_revenue, actual_cost, actual_margin, actual_margin_percent, closed_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (order_id) DO UPDATE SET
       factual_data = EXCLUDED.factual_data,
       actual_revenue = EXCLUDED.actual_revenue,
       actual_cost = EXCLUDED.actual_cost,
       actual_margin = EXCLUDED.actual_margin,
       actual_margin_percent = EXCLUDED.actual_margin_percent,
       closed_at = EXCLUDED.closed_at,
       updated_at = NOW()
     RETURNING *`,
    [
      id,
      req.params.id,
      data,
      actualRevenue,
      actualCost,
      actualMargin,
      actualRevenue > 0 && actualMargin !== null ? (actualMargin * 100) / actualRevenue : null,
      req.body?.closed_at || null,
    ]
  );
  res.status(201).json({ factual: rows[0] });
})));

router.patch('/:id/factual', requireAuth, asyncHandler((req, res) => withIdempotency(req, res, async () => {
  const fields = ['factual_data', 'actual_revenue', 'actual_cost', 'actual_margin', 'actual_margin_percent', 'closed_at'];
  const values = [];
  const updates = [];
  for (const field of fields) {
    if (req.body?.[field] === undefined) continue;
    values.push(field === 'factual_data' ? jsonObject(req.body[field]) : req.body[field]);
    updates.push(`${field} = $${values.length}`);
  }
  if (!updates.length) return error(res, 400, 'INVALID_INPUT', 'Нет изменений');
  values.push(req.params.id);
  const { rows } = await getPool().query(`UPDATE order_factuals SET ${updates.join(', ')}, updated_at = NOW() WHERE order_id = $${values.length} RETURNING *`, values);
  if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Факт не найден');
  res.json({ factual: rows[0] });
})));

router.post('/:id/factual/recalc', requireAuth, asyncHandler((req, res) => withIdempotency(req, res, async () => {
  const { rows } = await getPool().query(`SELECT * FROM order_factuals WHERE order_id = $1`, [req.params.id]);
  if (!rows[0]) return error(res, 404, 'NOT_FOUND', 'Факт не найден');
  const result = calcFactual({ ...rows[0].factual_data, order_id: req.params.id });
  const updated = await getPool().query(
    `UPDATE order_factuals
        SET actual_revenue = $1, actual_cost = $2, actual_margin = $3, actual_margin_percent = $4, updated_at = NOW()
      WHERE order_id = $5
      RETURNING *`,
    [result.revenue, result.cost, result.profit, result.margin, req.params.id]
  );
  res.json({ factual: updated.rows[0] });
})));

export default router;

export function shipmentPayload(row, items = undefined) {
  return {
    ...row,
    total_cost: row.total_cost === null ? null : Number(row.total_cost),
    items,
  };
}

export async function loadShipment(client, id) {
  const shipmentRes = await client.query(`SELECT * FROM shipments WHERE id = $1`, [id]);
  const shipment = shipmentRes.rows[0];
  if (!shipment) return null;
  const itemsRes = await client.query(`SELECT * FROM shipment_items WHERE shipment_id = $1 ORDER BY id`, [id]);
  return shipmentPayload(shipment, itemsRes.rows);
}

function codedError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export async function receiveShipmentInTransaction(client, { shipmentId, actorUserId }) {
  const shipmentRes = await client.query(`SELECT * FROM shipments WHERE id = $1 FOR UPDATE`, [shipmentId]);
  const current = shipmentRes.rows[0];
  if (!current) return null;
  if (current.status === 'received') {
    throw codedError('ALREADY_RECEIVED', 'Приёмка уже принята');
  }

  const itemsRes = await client.query(`SELECT * FROM shipment_items WHERE shipment_id = $1 ORDER BY id`, [current.id]);
  const items = itemsRes.rows;
  if (items.length === 0) {
    throw codedError('EMPTY_SHIPMENT', 'В приёмке нет позиций');
  }

  const receivedItems = [];
  for (const item of items) {
    const qty = Number(item.received_qty ?? item.qty);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw codedError('INVALID_INPUT', 'Некорректное количество');
    }

    let warehouseItemId = item.warehouse_item_id;
    const createNew = item.extras?.create_new === true;
    if (!warehouseItemId && !createNew) {
      throw codedError('NO_WAREHOUSE_LINK', 'Позиция должна быть связана со складом');
    }
    if (!warehouseItemId && createNew) {
      const sku = item.extras?.sku;
      if (!item.name || !sku) {
        throw codedError('INSUFFICIENT_NEW_ITEM_DATA', 'Для новой позиции нужны name и sku');
      }
      warehouseItemId = Number(item.extras?.warehouse_item_id || Date.now() + receivedItems.length);
      await client.query(
        `INSERT INTO warehouse_items (id, sku, name, category, qty, unit, last_price, last_currency, extras)
         VALUES ($1, $2, $3, $4, 0, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [
          warehouseItemId,
          sku,
          item.name,
          item.extras?.category || null,
          item.extras?.unit || null,
          item.unit_price,
          item.currency,
          { created_from_shipment_id: current.id },
        ]
      );
      await client.query(`UPDATE shipment_items SET warehouse_item_id = $1 WHERE id = $2`, [warehouseItemId, item.id]);
    }

    const lockRes = await client.query(`SELECT id, qty FROM warehouse_items WHERE id = $1 FOR UPDATE`, [warehouseItemId]);
    const warehouseItem = lockRes.rows[0];
    if (!warehouseItem) {
      throw codedError('NO_WAREHOUSE_LINK', 'Складская позиция не найдена');
    }
    const before = Number(warehouseItem.qty);
    const after = before + qty;
    await client.query(
      `UPDATE warehouse_items
          SET qty = $1, last_price = COALESCE($2, last_price), last_currency = COALESCE($3, last_currency), updated_at = NOW()
        WHERE id = $4`,
      [after, item.unit_price, item.currency, warehouseItemId]
    );
    await client.query(
      `INSERT INTO warehouse_history (item_id, type, qty_before, qty_after, qty_change, shipment_id, actor_user_id, note)
       VALUES ($1, 'receipt', $2, $3, $4, $5, $6, $7)`,
      [warehouseItemId, before, after, qty, current.id, actorUserId, item.name]
    );
    receivedItems.push({ ...item, warehouse_item_id: warehouseItemId, received_qty: qty });
  }

  const updated = await client.query(
    `UPDATE shipments SET status = 'received', received_at = NOW(), updated_at = NOW() WHERE id = $1 RETURNING *`,
    [current.id]
  );
  await client.query(
    `UPDATE china_purchases SET status = 'received', arrived_at = COALESCE(arrived_at, NOW()), updated_at = NOW()
      WHERE shipment_id = $1`,
    [current.id]
  );
  return shipmentPayload(updated.rows[0], receivedItems);
}

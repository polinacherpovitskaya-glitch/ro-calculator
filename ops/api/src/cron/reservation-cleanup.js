import { getPool } from '../db.js';

export async function releaseOrphanReservations(client = getPool()) {
  const { rows } = await client.query(`
    UPDATE warehouse_reservations r
       SET status = 'released', released_at = NOW()
      FROM orders o
     WHERE r.order_id = o.id
       AND r.source = 'order'
       AND r.status = 'active'
       AND o.status IN ('closed', 'cancelled')
    RETURNING r.id, r.item_id, r.order_id, r.qty
  `);
  return rows;
}

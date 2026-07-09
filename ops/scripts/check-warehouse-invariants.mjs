// Check warehouse invariants I1-I4 against a live database.
//
// Required environment:
//   DATABASE_URL

import pg from 'pg';

const { Pool } = pg;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

const pool = new Pool({ connectionString: requireEnv('DATABASE_URL') });

const checks = [
  {
    id: 'I1',
    name: 'sum of active reservations vs qty',
    sql: `
      SELECT i.id, i.qty, COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0) AS reserved
      FROM warehouse_items i
      LEFT JOIN warehouse_reservations r ON r.item_id = i.id
      GROUP BY i.id
      HAVING i.qty < COALESCE(SUM(r.qty) FILTER (WHERE r.status = 'active'), 0)
    `,
  },
  {
    id: 'I2',
    name: 'history sum vs current qty',
    sql: `
      SELECT i.id, i.qty AS current_qty, COALESCE(SUM(h.qty_change), 0) AS history_sum
      FROM warehouse_items i
      LEFT JOIN warehouse_history h ON h.item_id = i.id
      GROUP BY i.id, i.qty
      HAVING i.qty != COALESCE(SUM(h.qty_change), 0)
    `,
  },
  {
    id: 'I3',
    name: 'actor missing on non-audit history',
    sql: `
      SELECT *
      FROM warehouse_history
      WHERE actor_user_id IS NULL AND type != 'inventory_audit'
    `,
  },
  {
    id: 'I4',
    name: 'orphan reservations',
    sql: `
      SELECT r.*
      FROM warehouse_reservations r
      LEFT JOIN orders o ON o.id = r.order_id
      WHERE r.source = 'order'
        AND r.status = 'active'
        AND (o.id IS NULL OR o.status IN ('closed','cancelled'))
    `,
  },
];

async function main() {
  let hasViolations = false;
  for (const check of checks) {
    const { rows } = await pool.query(check.sql);
    const count = rows.length;
    console.log(`${check.id}: ${check.name}: ${count} violations`);
    if (count > 0) {
      hasViolations = true;
      console.log(JSON.stringify(rows.slice(0, 10), null, 2));
    }
  }

  console.log('I5: atomic consume is covered by API integration tests');
  console.log('I6: idempotency is covered by API integration tests');
  console.log('I7: no localStorage write path is covered by architecture and E2E checks');

  if (hasViolations) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

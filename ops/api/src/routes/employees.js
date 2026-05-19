import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  const pool = getPool();
  const onlyActive = String(req.query.active || 'true') !== 'false';
  const sql = onlyActive
    ? `SELECT id, name, email, role, hourly_rate, is_active FROM employees WHERE is_active = TRUE ORDER BY name`
    : `SELECT id, name, email, role, hourly_rate, is_active FROM employees ORDER BY name`;
  const { rows } = await pool.query(sql);

  res.json({ employees: rows });
});

export default router;

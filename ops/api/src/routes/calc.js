import { Router } from 'express';
import { getPool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { calcOrder } from '../calc-dist/index.js';
import { getIndirectAllocation } from '../calc-dist/indirect.js';

const router = Router();

function integer(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

router.post('/preview', requireAuth, async (req, res) => {
  try {
    const output = calcOrder(req.body);
    const year = integer(req.body?.indirect_period?.year || req.body?.indirect_year);
    const month = integer(req.body?.indirect_period?.month || req.body?.indirect_month);
    if (year && month) {
      output.indirect_allocation = await getIndirectAllocation(
        getPool(),
        year,
        month,
        output.total_hours_plan
      );
    }
    res.json(output);
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'CALC_ERROR',
        message: String(error?.message || error),
      },
    });
  }
});

export default router;

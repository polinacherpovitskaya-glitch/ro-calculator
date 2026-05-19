import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { calcOrder } from '../calc-dist/index.js';

const router = Router();

router.post('/preview', requireAuth, (req, res) => {
  try {
    const output = calcOrder(req.body);
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

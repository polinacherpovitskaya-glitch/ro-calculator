import { Router } from 'express';
import { releaseOrphanReservations } from '../cron/reservation-cleanup.js';

const router = Router();

function error(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

router.post('/cleanup-reservations', async (req, res) => {
  const token = process.env.INTERNAL_TOKEN;
  if (!token || req.get('authorization') !== `Bearer ${token}`) {
    return error(res, 401, 'UNAUTHORIZED', 'Нет доступа');
  }
  const released = await releaseOrphanReservations();
  res.json({ released });
});

export default router;

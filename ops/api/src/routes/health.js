import { Router } from 'express';
import { pingDatabase } from '../db.js';

const router = Router();
const VERSION = process.env.APP_VERSION || 'dev';

router.get('/health', async (req, res) => {
  let db;
  try {
    db = await pingDatabase();
  } catch (error) {
    db = { ok: false, error: String(error?.message || error) };
  }

  res.json({
    status: db.ok ? 'ok' : 'degraded',
    version: VERSION,
    uptime_seconds: Math.round(process.uptime()),
    db,
  });
});

export default router;

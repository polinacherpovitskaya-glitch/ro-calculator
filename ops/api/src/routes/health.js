import { Router } from 'express';

const router = Router();
const VERSION = process.env.APP_VERSION || 'dev';

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    uptime_seconds: Math.round(process.uptime()),
  });
});

export default router;

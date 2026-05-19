import express from 'express';
import healthRoute from './routes/health.js';

export function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', healthRoute);
  return app;
}

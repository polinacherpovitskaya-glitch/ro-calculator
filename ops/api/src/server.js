import express from 'express';
import cookieParser from 'cookie-parser';
import healthRoute from './routes/health.js';
import authRoute from './routes/auth.js';

export function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', healthRoute);
  app.use('/api/auth', authRoute);
  return app;
}

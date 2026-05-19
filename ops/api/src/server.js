import express from 'express';
import cookieParser from 'cookie-parser';
import healthRoute from './routes/health.js';
import authRoute from './routes/auth.js';
import employeesRoute from './routes/employees.js';

export function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', healthRoute);
  app.use('/api/auth', authRoute);
  app.use('/api/employees', employeesRoute);
  return app;
}

import express from 'express';
import cookieParser from 'cookie-parser';
import healthRoute from './routes/health.js';
import authRoute from './routes/auth.js';
import employeesRoute from './routes/employees.js';
import warehouseRoute from './routes/warehouse.js';
import shipmentsRoute from './routes/shipments.js';
import chinaRoute from './routes/china.js';
import moldsRoute from './routes/molds.js';

export function createServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', healthRoute);
  app.use('/api/auth', authRoute);
  app.use('/api/employees', employeesRoute);
  app.use('/api/warehouse', warehouseRoute);
  app.use('/api/shipments', shipmentsRoute);
  app.use('/api/china', chinaRoute);
  app.use('/api/molds', moldsRoute);
  return app;
}

import express from 'express';
import morgan from 'morgan';
import { router } from './routes/index.js';
import { errorHandler, requireApiKey, securityMiddleware } from './middleware/security.js';

export function createApp() {
  const app = express();
  app.use(securityMiddleware);
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan('combined'));
  app.use(requireApiKey);
  app.use(router);
  app.use(errorHandler);
  return app;
}

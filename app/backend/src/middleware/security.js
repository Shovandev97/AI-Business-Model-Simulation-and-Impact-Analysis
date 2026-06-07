import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

export const securityMiddleware = [
  helmet(),
  cors({ origin: env.corsOrigin, credentials: true }),
  rateLimit({ windowMs: 60_000, max: 180, standardHeaders: true, legacyHeaders: false })
];

export function requireApiKey(req, res, next) {
  if (req.method === 'OPTIONS') return next();
  if (req.path === '/api/health') return next();
  const key = req.get('x-api-key');
  if (key !== env.apiKey) {
    return res.status(401).json({ success: false, errorCode: 'UNAUTHORIZED', error: 'Unauthorized', message: 'Missing or invalid x-api-key.' });
  }
  next();
}

export function errorHandler(error, req, res, next) {
  const status = error.status || 500;
  const errorCode = error.errorCode || (status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  res.status(status).json({
    success: false,
    errorCode,
    error: status >= 500 ? 'InternalServerError' : 'RequestError',
    message: error.message,
    details: error.details || undefined
  });
}

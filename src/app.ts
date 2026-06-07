import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { env } from './config/env';
import { globalLimiter } from './middleware/rateLimit';
import { errorHandler, notFound } from './middleware/errorHandler';
import { logger } from './utils/logger';
import mongoose from 'mongoose';
import { getRedis } from './config/redis';

import { setupSwagger } from './config/swagger';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import cartRoutes from './routes/cart.routes';
import orderRoutes from './routes/order.routes';
import categoryRoutes from './routes/category.routes';
import reviewRoutes from './routes/review.routes';
import analyticsRoutes from './routes/analytics.routes';
import userRoutes from './routes/user.routes';

const app = express();

// ── Swagger UI (before helmet so CSP doesn't block assets) ────────────────
setupSwagger(app);

// ── Security ───────────────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'", "'unsafe-inline'"],
        styleSrc:   ["'self'", "'unsafe-inline'"],
        imgSrc:     ["'self'", 'data:', 'https:'],
      },
    },
  })
);
app.use(cors({
  origin: env.CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

// ── Parsing & utilities ────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── Logging ────────────────────────────────────────────────────────────────
app.use(
  morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

// ── Rate limiting ──────────────────────────────────────────────────────────
app.use('/api', globalLimiter);

// ── Health check ───────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const mongoReady = mongoose.connection.readyState === 1;
  let redisReady = false;
  try {
    redisReady = (await getRedis().ping()) === 'PONG';
  } catch {
    redisReady = false;
  }

  const healthy = mongoReady && redisReady;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    env: env.NODE_ENV,
    dependencies: { mongodb: mongoReady, redis: redisReady },
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/products/:productId/reviews', reviewRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/users', userRoutes);

// ── Error handling ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;

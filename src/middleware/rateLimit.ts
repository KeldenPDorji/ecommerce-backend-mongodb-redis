import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis';
import { env } from '../config/env';

export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args as [string, ...string[]]) as Promise<number>,
  }),
  message: { success: false, message: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args as [string, ...string[]]) as Promise<number>,
    prefix: 'auth_rl:',
  }),
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});

// Tight limiter for checkout — prevents cart-stuffing / order-spam
export const checkoutLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => getRedis().call(...args as [string, ...string[]]) as Promise<number>,
    prefix: 'checkout_rl:',
  }),
  message: { success: false, message: 'Too many checkout attempts, please try again later.' },
});

import { getRedis } from '../config/redis';

const DEFAULT_TTL = 60 * 5; // 5 minutes

// Jitter helper — spreads TTL by ±20% to prevent cache stampedes
function jitter(ttl: number): number {
  const spread = Math.floor(ttl * 0.2);
  return ttl - spread + Math.floor(Math.random() * spread * 2);
}

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await getRedis().get(key);
    return data ? (JSON.parse(data) as T) : null;
  },

  async set(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
    await getRedis().setex(key, jitter(ttlSeconds), JSON.stringify(value));
  },

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await getRedis().del(...keys);
  },

  async delPattern(pattern: string): Promise<void> {
    const keys = await getRedis().keys(pattern);
    if (keys.length) await getRedis().del(...keys);
  },

  // ── Key conventions ──────────────────────────────────────────────────────
  productKey: (id: string) => `product:${id}`,
  productListKey: (query: string) => `products:list:${query}`,
  categoryKey: (id: string) => `category:${id}`,
  categoryListKey: () => 'categories:list',
  reviewListKey: (productId: string) => `reviews:product:${productId}`,
  analyticsKey: (name: string) => `analytics:${name}`,
};

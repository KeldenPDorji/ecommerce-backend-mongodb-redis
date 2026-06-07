import { getRedis } from '../config/redis';

const DEFAULT_TTL = 60 * 5; // 5 minutes
const LOCK_TTL_MS = 5_000;
const LOCK_WAIT_MS = 50;
const LOCK_RETRIES = 20;

// Jitter helper — spreads TTL by ±20% to prevent cache stampedes
export function jitter(ttl: number): number {
  const spread = Math.floor(ttl * 0.2);
  return ttl - spread + Math.floor(Math.random() * spread * 2);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    const redis = getRedis();
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  },

  async invalidate(...keys: string[]): Promise<void> {
    await this.del(...keys);
    await sleep(100);
    await this.del(...keys);
  },

  async invalidatePattern(pattern: string): Promise<void> {
    await this.delPattern(pattern);
    await sleep(100);
    await this.delPattern(pattern);
  },

  async getOrSet<T>(key: string, loader: () => Promise<T>, ttlSeconds = DEFAULT_TTL): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) return cached;

    const redis = getRedis();
    const lockKey = `lock:${key}`;
    const lockToken = `${process.pid}:${Date.now()}:${Math.random()}`;
    const acquired = await redis.set(lockKey, lockToken, 'PX', LOCK_TTL_MS, 'NX');

    if (acquired) {
      try {
        const value = await loader();
        await this.set(key, value, ttlSeconds);
        return value;
      } finally {
        await redis.eval(
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
          1,
          lockKey,
          lockToken
        );
      }
    }

    for (let attempt = 0; attempt < LOCK_RETRIES; attempt += 1) {
      await sleep(LOCK_WAIT_MS);
      const populated = await this.get<T>(key);
      if (populated) return populated;
    }

    return loader();
  },

  // ── Key conventions ──────────────────────────────────────────────────────
  productKey: (id: string) => `product:${id}`,
  productListKey: (query: string) => `products:list:${query}`,
  categoryKey: (id: string) => `category:${id}`,
  categoryListKey: () => 'categories:list',
  reviewListKey: (productId: string) => `reviews:product:${productId}`,
  analyticsKey: (name: string) => `analytics:${name}`,
};

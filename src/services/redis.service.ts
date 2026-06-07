import { getRedis } from '../config/redis';

const TRENDING_KEY = 'trending:products';
const LEADERBOARD_PREFIX = 'leaderboard:buyers';
const RECENTLY_VIEWED_PREFIX = 'user:recently_viewed';
const UNIQUE_VIEWS_PREFIX = 'product:views:unique';
const SESSION_PREFIX = 'session';
const GUEST_CART_PREFIX = 'guest:cart';

const RECENTLY_VIEWED_MAX = 20;
const GUEST_CART_TTL = 60 * 60 * 24; // 24 hours
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const redisService = {
  // ── Sorted Set: Trending Products ────────────────────────────────────────
  async incrementTrendingScore(productId: string, increment = 1): Promise<void> {
    await getRedis().zincrby(TRENDING_KEY, increment, productId);
  },

  async getTrending(limit = 10): Promise<Array<{ productId: string; score: number }>> {
    const raw = await getRedis().zrevrangebyscore(
      TRENDING_KEY,
      '+inf',
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      limit
    );
    const result: Array<{ productId: string; score: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ productId: raw[i], score: parseFloat(raw[i + 1]) });
    }
    return result;
  },

  async resetTrendingScores(): Promise<void> {
    await getRedis().del(TRENDING_KEY);
  },

  // ── Sorted Set: Top Buyers Leaderboard ───────────────────────────────────
  async recordPurchase(userId: string, amount: number): Promise<void> {
    const key = `${LEADERBOARD_PREFIX}:${monthKey()}`;
    await getRedis().zincrby(key, amount, userId);
    await getRedis().expire(key, 60 * 60 * 24 * 60); // keep for 60 days
  },

  async getTopBuyers(limit = 10, month?: string): Promise<Array<{ userId: string; amount: number }>> {
    const key = `${LEADERBOARD_PREFIX}:${month ?? monthKey()}`;
    const raw = await getRedis().zrevrangebyscore(
      key,
      '+inf',
      '-inf',
      'WITHSCORES',
      'LIMIT',
      0,
      limit
    );
    const result: Array<{ userId: string; amount: number }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      result.push({ userId: raw[i], amount: parseFloat(raw[i + 1]) });
    }
    return result;
  },

  // ── List: Recently Viewed Products ───────────────────────────────────────
  async addRecentlyViewed(userId: string, productId: string): Promise<void> {
    const key = `${RECENTLY_VIEWED_PREFIX}:${userId}`;
    const r = getRedis();
    await r.lrem(key, 0, productId); // remove duplicates
    await r.lpush(key, productId);
    await r.ltrim(key, 0, RECENTLY_VIEWED_MAX - 1);
    await r.expire(key, 60 * 60 * 24 * 30); // 30-day TTL
  },

  async getRecentlyViewed(userId: string): Promise<string[]> {
    return getRedis().lrange(`${RECENTLY_VIEWED_PREFIX}:${userId}`, 0, -1);
  },

  // ── HyperLogLog: Unique Product Page Visitors ────────────────────────────
  async trackUniqueVisitor(productId: string, identifier: string): Promise<void> {
    const key = `${UNIQUE_VIEWS_PREFIX}:${productId}`;
    await getRedis().pfadd(key, identifier);
    await getRedis().expire(key, 60 * 60 * 24 * 30);
  },

  async countUniqueVisitors(productId: string): Promise<number> {
    return getRedis().pfcount(`${UNIQUE_VIEWS_PREFIX}:${productId}`);
  },

  // ── Hash: Session Management ─────────────────────────────────────────────
  async setSession(
    sessionId: string,
    data: Record<string, string>,
    ttl = SESSION_TTL
  ): Promise<void> {
    const key = `${SESSION_PREFIX}:${sessionId}`;
    await getRedis().hset(key, data);
    await getRedis().expire(key, ttl);
  },

  async getSession(sessionId: string): Promise<Record<string, string> | null> {
    const key = `${SESSION_PREFIX}:${sessionId}`;
    const data = await getRedis().hgetall(key);
    return Object.keys(data).length ? data : null;
  },

  async touchSession(sessionId: string, ttl = SESSION_TTL): Promise<void> {
    await getRedis().expire(`${SESSION_PREFIX}:${sessionId}`, ttl);
  },

  async deleteSession(sessionId: string): Promise<void> {
    await getRedis().del(`${SESSION_PREFIX}:${sessionId}`);
  },

  // ── String: Guest Cart ───────────────────────────────────────────────────
  async setGuestCart(guestId: string, cart: unknown, ttl = GUEST_CART_TTL): Promise<void> {
    const key = `${GUEST_CART_PREFIX}:${guestId}`;
    await getRedis().set(key, JSON.stringify(cart), 'EX', ttl);
  },

  async getGuestCart(guestId: string): Promise<unknown> {
    const raw = await getRedis().get(`${GUEST_CART_PREFIX}:${guestId}`);
    return raw ? JSON.parse(raw) : null;
  },

  async deleteGuestCart(guestId: string): Promise<void> {
    await getRedis().del(`${GUEST_CART_PREFIX}:${guestId}`);
  },

  async refreshGuestCartTTL(guestId: string, ttl = GUEST_CART_TTL): Promise<void> {
    await getRedis().expire(`${GUEST_CART_PREFIX}:${guestId}`, ttl);
  },
};

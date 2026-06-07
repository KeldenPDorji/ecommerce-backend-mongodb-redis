import Redis from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

let client: Redis | null = null;

function sentinelNodes(): Array<{ host: string; port: number }> {
  if (!env.REDIS_SENTINELS) return [];

  return env.REDIS_SENTINELS.split(',').map((node) => {
    const [host, port = '26379'] = node.trim().split(':');
    return { host, port: Number(port) };
  });
}

export function getRedis(): Redis {
  if (!client) {
    const sentinels = sentinelNodes();
    const commonOptions = {
      password: env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
    };

    client = sentinels.length
      ? new Redis({
          ...commonOptions,
          sentinels,
          name: env.REDIS_MASTER_NAME ?? 'mymaster',
          sentinelPassword: env.REDIS_PASSWORD || undefined,
        })
      : new Redis({
          ...commonOptions,
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
        });

    client.on('connect', () => logger.info('Redis connected'));
    client.on('error', (err) => logger.error('Redis error', { err }));
    client.on('close', () => logger.warn('Redis connection closed'));
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}

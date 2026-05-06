import 'dotenv/config';
import app from './app';
import { connectDB, disconnectDB } from './config/database';
import { getRedis, closeRedis } from './config/redis';
import { env } from './config/env';
import { logger } from './utils/logger';

async function start(): Promise<void> {
  await connectDB();
  getRedis(); // initialise connection

  const server = app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDB();
      await closeRedis();
      logger.info('Shutdown complete');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason });
    process.exit(1);
  });
}

start().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});

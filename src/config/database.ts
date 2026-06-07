import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

export async function connectDB(): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () =>
    logger.info('MongoDB connected')
  );
  mongoose.connection.on('error', (err) =>
    logger.error('MongoDB error', { err })
  );
  mongoose.connection.on('disconnected', () =>
    logger.warn('MongoDB disconnected')
  );

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000,
    readPreference: 'primary',
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority', j: true },
  });
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

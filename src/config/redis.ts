import { createClient, RedisClientType } from 'redis';
import logger from '@/config/logger';

let redisClient: RedisClientType | null = null;

const connectRedis = async (): Promise<RedisClientType> => {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 10) {
            return new Error('Retry time exhausted');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    redisClient.on('error', (err: Error) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });

    redisClient.on('ready', () => {
      logger.info('Redis Client Ready');
    });

    redisClient.on('end', () => {
      logger.warn('Redis connection ended');
    });

    await redisClient.connect();
    
    return redisClient;
  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
};

export { connectRedis, getRedisClient };
export default connectRedis;
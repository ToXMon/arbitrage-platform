import Redis from 'ioredis';

// Redis configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Publisher client for publishing events
export const redisPublisher = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Subscriber client for listening to events
export const redisSubscriber = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Unlimited retries for subscriber
  lazyConnect: true,
});

// General purpose client for caching and other operations
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

// Channels for pub/sub
export const CHANNELS = {
  OPPORTUNITIES: 'arbitrage:opportunities',
  TRADES: 'arbitrage:trades',
  BOT_STATUS: 'arbitrage:bot_status',
  PRICE_UPDATES: 'arbitrage:prices',
  SYSTEM: 'arbitrage:system',
} as const;

// Test Redis connection
export const testRedisConnection = async (): Promise<boolean> => {
  try {
    await redis.ping();
    return true;
  } catch (error) {
    console.error('Redis connection error:', error);
    return false;
  }
};

// Publish helper with JSON serialization
export const publish = async (channel: string, data: unknown): Promise<void> => {
  await redisPublisher.publish(channel, JSON.stringify(data));
};

// Subscribe helper with JSON parsing
export const subscribe = async (
  channel: string,
  callback: (data: unknown) => void
): Promise<void> => {
  await redisSubscriber.subscribe(channel);
  redisSubscriber.on('message', (ch, message) => {
    if (ch === channel) {
      try {
        callback(JSON.parse(message));
      } catch (error) {
        console.error(`Error parsing message on ${channel}:`, error);
      }
    }
  });
};

// Cache helpers with TTL
export const cacheSet = async (
  key: string,
  value: unknown,
  ttlSeconds: number = 60
): Promise<void> => {
  await redis.setex(key, ttlSeconds, JSON.stringify(value));
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  const value = await redis.get(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

// Graceful shutdown
export const closeRedis = async (): Promise<void> => {
  await Promise.all([
    redisPublisher.quit(),
    redisSubscriber.quit(),
    redis.quit(),
  ]);
};

// Handle connection errors
redisPublisher.on('error', (err) => console.error('Redis Publisher Error:', err));
redisSubscriber.on('error', (err) => console.error('Redis Subscriber Error:', err));
redis.on('error', (err) => console.error('Redis Error:', err));


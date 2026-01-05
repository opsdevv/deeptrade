// Redis Client - Singleton connection manager

import { createClient, RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let isConnecting = false;
let connectionPromise: Promise<void> | null = null;

/**
 * Get or create Redis client instance
 */
export async function getRedisClient(): Promise<RedisClientType | null> {
  // Return existing client if connected
  if (client?.isOpen) {
    return client;
  }

  // If already connecting, wait for that connection
  if (isConnecting && connectionPromise) {
    await connectionPromise;
    return client;
  }

  // Start new connection
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      // Redis configuration - fail gracefully if not configured (optional service)
      const redisHost = process.env.REDIS_HOST;
      const redisPort = process.env.REDIS_PORT;
      const redisPassword = process.env.REDIS_PASSWORD;
      const redisUsername = process.env.REDIS_USERNAME || 'default';

      // If Redis is not configured, return null (graceful degradation)
      if (!redisHost || !redisPort) {
        console.warn('[Redis] Redis not configured. Caching will be disabled.');
        isConnecting = false;
        client = null;
        return;
      }

      client = createClient({
        username: redisUsername,
        password: redisPassword,
        socket: {
          host: redisHost,
          port: parseInt(redisPort),
          connectTimeout: 5000, // 5 second timeout for serverless
          reconnectStrategy: (retries) => {
            if (retries > 5) { // Reduced retries for serverless
              console.error('[Redis] Max reconnection attempts reached');
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 2000); // Faster retries for serverless
          },
        },
      });

      client.on('error', (err) => {
        console.error('[Redis] Client Error:', err);
      });

      client.on('connect', () => {
        console.log('[Redis] Connecting...');
      });

      client.on('ready', () => {
        console.log('[Redis] Client ready');
        isConnecting = false;
      });

      client.on('reconnecting', () => {
        console.log('[Redis] Reconnecting...');
      });

      await client.connect();
    } catch (error) {
      console.error('[Redis] Connection failed:', error);
      isConnecting = false;
      client = null;
    }
  })();

  await connectionPromise;
  return client;
}

/**
 * Close Redis connection
 */
export async function closeRedisClient(): Promise<void> {
  if (client?.isOpen) {
    await client.quit();
    client = null;
  }
  isConnecting = false;
  connectionPromise = null;
}

/**
 * Cache helper functions
 */
export class RedisCache {
  private client: RedisClientType | null = null;

  private async ensureClient(): Promise<RedisClientType | null> {
    if (!this.client || !this.client.isOpen) {
      this.client = await getRedisClient();
    }
    return this.client;
  }

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.ensureClient();
      if (!client) return null;

      const value = await client.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[Redis] Error getting key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL (time to live in seconds)
   */
  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      if (!client) return false;

      const serialized = JSON.stringify(value);
      if (ttl) {
        await client.setEx(key, ttl, serialized);
      } else {
        await client.set(key, serialized);
      }
      return true;
    } catch (error) {
      console.error(`[Redis] Error setting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      if (!client) return false;

      await client.del(key);
      return true;
    } catch (error) {
      console.error(`[Redis] Error deleting key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.ensureClient();
      if (!client) return false;

      const result = await client.exists(key);
      return result > 0;
    } catch (error) {
      console.error(`[Redis] Error checking key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment a counter (useful for rate limiting)
   */
  async increment(key: string, ttl?: number): Promise<number> {
    try {
      const client = await this.ensureClient();
      if (!client) return 0;

      const value = await client.incr(key);
      if (ttl && value === 1) {
        // Set TTL only on first increment
        await client.expire(key, ttl);
      }
      return value;
    } catch (error) {
      console.error(`[Redis] Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      const client = await this.ensureClient();
      if (!client) return -1;

      return await client.ttl(key);
    } catch (error) {
      console.error(`[Redis] Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }
}

// Export singleton instance
export const redisCache = new RedisCache();

// Cache key prefixes
export const CacheKeys = {
  analysis: (runId: string) => `analysis:${runId}`,
  marketData: (symbol: string, timeframe: string) => `market:${symbol}:${timeframe}`,
  currentPrice: (symbol: string) => `price:${symbol}`,
  rateLimit: (identifier: string, endpoint: string) => `ratelimit:${identifier}:${endpoint}`,
  session: (sessionId: string) => `session:${sessionId}`,
  trade: (tradeId: string) => `trade:${tradeId}`,
};

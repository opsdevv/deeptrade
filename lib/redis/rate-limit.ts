// Rate Limiting using Redis

import { redisCache, CacheKeys } from './client';

export interface RateLimitOptions {
  maxRequests: number;
  windowSeconds: number;
  identifier?: string; // Optional identifier (user ID, IP, etc.)
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request is within rate limits
 * @param endpoint - The endpoint being accessed
 * @param options - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  endpoint: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { maxRequests, windowSeconds, identifier = 'global' } = options;
  
  const key = CacheKeys.rateLimit(identifier, endpoint);
  const current = await redisCache.increment(key, windowSeconds);
  
  const remaining = Math.max(0, maxRequests - current);
  const resetAt = Date.now() + (windowSeconds * 1000);
  
  return {
    allowed: current <= maxRequests,
    remaining,
    resetAt,
  };
}

/**
 * Get current rate limit status without incrementing
 */
export async function getRateLimitStatus(
  endpoint: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  const { maxRequests, windowSeconds, identifier = 'global' } = options;
  
  const key = CacheKeys.rateLimit(identifier, endpoint);
  const current = await redisCache.get<number>(key) || 0;
  const ttl = await redisCache.getTTL(key);
  
  const remaining = Math.max(0, maxRequests - current);
  const resetAt = ttl > 0 ? Date.now() + (ttl * 1000) : Date.now();
  
  return {
    allowed: current < maxRequests,
    remaining,
    resetAt,
  };
}

/**
 * Reset rate limit for an endpoint
 */
export async function resetRateLimit(
  endpoint: string,
  identifier: string = 'global'
): Promise<void> {
  const key = CacheKeys.rateLimit(identifier, endpoint);
  await redisCache.delete(key);
}

/**
 * Predefined rate limit configurations
 */
export const RateLimits = {
  // API endpoints
  analysis: { maxRequests: 10, windowSeconds: 60 }, // 10 requests per minute
  marketData: { maxRequests: 30, windowSeconds: 60 }, // 30 requests per minute
  chat: { maxRequests: 20, windowSeconds: 60 }, // 20 requests per minute
  deepseek: { maxRequests: 5, windowSeconds: 60 }, // 5 requests per minute (API cost)
  
  // Per-user limits
  userAnalysis: { maxRequests: 50, windowSeconds: 3600 }, // 50 requests per hour
  userChat: { maxRequests: 100, windowSeconds: 3600 }, // 100 requests per hour
};

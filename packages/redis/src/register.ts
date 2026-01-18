/**
 * Redis adapter registration module
 *
 * Note: RedisAdapter implements CacheAdapter, not DatabaseAdapter.
 * It should be used with CacheManager or CachedAdapter, not with
 * the database adapter factory.
 *
 * Usage:
 *   import { RedisAdapter } from '@db-bridge/redis';
 *   import { CacheManager } from '@db-bridge/core';
 *
 *   const redis = new RedisAdapter({ ... });
 *   const cache = new CacheManager(redis);
 */

export { RedisAdapter } from './adapter/redis-adapter';
export { RedisCacheAdapter } from './adapter/redis-cache-adapter';
export { ModularRedisAdapter } from './adapter/modular-redis-adapter';

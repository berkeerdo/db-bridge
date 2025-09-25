/**
 * Caching Strategies with Redis
 * 
 * This example demonstrates various caching patterns
 * using DB Bridge with Redis.
 */

import { DBBridge } from '@db-bridge/core';

interface CacheableQuery {
  key: string;
  ttl: number;
  query: () => Promise<any>;
}

class CacheManager {
  constructor(
    private db: DBBridge,
    private cache: DBBridge
  ) {}

  /**
   * Cache-aside pattern (Lazy Loading)
   * Most common caching pattern
   */
  async getWithCache<T>(
    key: string,
    ttl: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const redis = this.cache.getAdapter() as any;

    // Try to get from cache
    const cached = await redis.get(key);
    if (cached) {
      console.log(`Cache HIT: ${key}`);
      return JSON.parse(cached);
    }

    // Cache miss - fetch from database
    console.log(`Cache MISS: ${key}`);
    const data = await fetchFn();

    // Store in cache
    await redis.set(key, JSON.stringify(data), ttl);
    
    return data;
  }

  /**
   * Write-through cache pattern
   * Update cache whenever database is updated
   */
  async updateWithCache<T>(
    key: string,
    ttl: number,
    updateFn: () => Promise<T>
  ): Promise<T> {
    const redis = this.cache.getAdapter() as any;

    // Update database
    const result = await updateFn();

    // Update cache
    await redis.set(key, JSON.stringify(result), ttl);
    console.log(`Cache UPDATED: ${key}`);

    return result;
  }

  /**
   * Cache invalidation
   * Remove from cache when data changes
   */
  async invalidate(pattern: string): Promise<void> {
    const redis = this.cache.getAdapter() as any;
    
    // Get all matching keys
    const keys = await redis.keys(pattern);
    
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`Invalidated ${keys.length} cache entries matching: ${pattern}`);
    }
  }

  /**
   * Refresh-ahead pattern
   * Proactively refresh cache before expiry
   */
  async refreshAhead<T>(
    key: string,
    ttl: number,
    refreshThreshold: number,
    fetchFn: () => Promise<T>
  ): Promise<T> {
    const redis = this.cache.getAdapter() as any;

    // Get from cache with TTL check
    const cached = await redis.get(key);
    const remainingTtl = await redis.ttl(key);

    if (cached && remainingTtl > refreshThreshold) {
      console.log(`Cache HIT (TTL: ${remainingTtl}s): ${key}`);
      return JSON.parse(cached);
    }

    // Refresh cache if close to expiry or missing
    console.log(`Cache REFRESH: ${key}`);
    const data = await fetchFn();
    await redis.set(key, JSON.stringify(data), ttl);

    return data;
  }
}

async function basicCaching() {
  console.log('\n=== Basic Caching Example ===');

  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  const cache = DBBridge.redis({
    host: 'localhost',
    port: 6379
  });

  try {
    await db.connect();
    await cache.connect();
    
    const cacheManager = new CacheManager(db, cache);

    // Example 1: Cache user data
    const userId = 1;
    const user = await cacheManager.getWithCache(
      `user:${userId}`,
      3600, // 1 hour TTL
      async () => {
        const [userData] = await db.table('users')
          .where('id', userId)
          .get();
        return userData;
      }
    );
    console.log('User:', user);

    // Second call will hit cache
    const cachedUser = await cacheManager.getWithCache(
      `user:${userId}`,
      3600,
      async () => {
        throw new Error('Should not be called!');
      }
    );
    console.log('Cached user:', cachedUser);

  } finally {
    await db.disconnect();
    await cache.disconnect();
  }
}

async function cacheInvalidation() {
  console.log('\n=== Cache Invalidation Example ===');

  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  const cache = DBBridge.redis();

  try {
    await db.connect();
    await cache.connect();
    
    const cacheManager = new CacheManager(db, cache);

    // Cache some product data
    for (let i = 1; i <= 5; i++) {
      await cacheManager.getWithCache(
        `product:${i}`,
        3600,
        async () => {
          const [product] = await db.table('products')
            .where('id', i)
            .get();
          return product;
        }
      );
    }
    console.log('Cached 5 products');

    // Update a product
    await db.table('products')
      .where('id', 1)
      .update({ price: 99.99 });

    // Invalidate specific product
    await cacheManager.invalidate('product:1');

    // Invalidate all products
    await cacheManager.invalidate('product:*');

  } finally {
    await db.disconnect();
    await cache.disconnect();
  }
}

async function queryResultCaching() {
  console.log('\n=== Query Result Caching ===');

  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  const cache = DBBridge.redis();

  try {
    await db.connect();
    await cache.connect();
    
    const cacheManager = new CacheManager(db, cache);

    // Cache complex query results
    const topProducts = await cacheManager.getWithCache(
      'products:top:electronics',
      300, // 5 minutes
      async () => {
        return await db.table('products')
          .where('category', 'electronics')
          .where('in_stock', true)
          .orderBy('rating', 'desc')
          .orderBy('sales_count', 'desc')
          .limit(10)
          .get();
      }
    );
    console.log(`Found ${topProducts.length} top electronics products`);

    // Cache aggregated data
    const stats = await cacheManager.getWithCache(
      'stats:sales:daily',
      3600, // 1 hour
      async () => {
        const result = await db.table('orders')
          .whereRaw('DATE(created_at) = CURDATE()')
          .select([
            db.raw('COUNT(*) as order_count'),
            db.raw('SUM(total) as revenue'),
            db.raw('AVG(total) as avg_order_value')
          ])
          .first();
        return result;
      }
    );
    console.log('Daily sales stats:', stats);

  } finally {
    await db.disconnect();
    await cache.disconnect();
  }
}

async function tagBasedCaching() {
  console.log('\n=== Tag-Based Caching ===');

  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  const cache = DBBridge.redis();

  try {
    await db.connect();
    await cache.connect();
    
    const redis = cache.getAdapter() as any;

    // Helper to cache with tags
    async function cacheWithTags(
      key: string,
      data: any,
      ttl: number,
      tags: string[]
    ) {
      // Store the data
      await redis.set(key, JSON.stringify(data), ttl);

      // Store tags
      for (const tag of tags) {
        await redis.commands.sadd(`tag:${tag}`, key);
        await redis.commands.expire(`tag:${tag}`, ttl);
      }
      console.log(`Cached ${key} with tags:`, tags);
    }

    // Helper to invalidate by tag
    async function invalidateByTag(tag: string) {
      const keys = await redis.commands.smembers(`tag:${tag}`);
      
      if (keys.length > 0) {
        await redis.del(...keys);
        await redis.del(`tag:${tag}`);
        console.log(`Invalidated ${keys.length} entries with tag: ${tag}`);
      }
    }

    // Cache user-related data with tags
    const user = await db.table('users').where('id', 1).first();
    await cacheWithTags('user:1', user, 3600, ['users', 'user:1']);

    const userOrders = await db.table('orders').where('user_id', 1).get();
    await cacheWithTags('user:1:orders', userOrders, 3600, ['orders', 'user:1']);

    const userProfile = await db.table('profiles').where('user_id', 1).first();
    await cacheWithTags('user:1:profile', userProfile, 3600, ['profiles', 'user:1']);

    // Invalidate all user:1 related caches
    await invalidateByTag('user:1');

  } finally {
    await db.disconnect();
    await cache.disconnect();
  }
}

async function distributedCaching() {
  console.log('\n=== Distributed Caching Pattern ===');

  // Configuration for distributed caching
  const cacheConfig = {
    keyPrefix: process.env.CACHE_PREFIX || 'app1:',
    ttl: {
      short: 60,      // 1 minute
      medium: 300,    // 5 minutes
      long: 3600,     // 1 hour
      day: 86400      // 1 day
    }
  };

  const db = DBBridge.mysql({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'test_db'
  });

  const cache = DBBridge.redis({
    host: 'localhost',
    port: 6379
  });

  try {
    await db.connect();
    await cache.connect();

    const redis = cache.getAdapter() as any;

    // Distributed lock for cache stampede prevention
    async function getWithLock<T>(
      key: string,
      ttl: number,
      fetchFn: () => Promise<T>
    ): Promise<T> {
      const lockKey = `lock:${key}`;
      const fullKey = `${cacheConfig.keyPrefix}${key}`;

      // Try cache first
      const cached = await redis.get(fullKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Try to acquire lock
      const lockAcquired = await redis.set(
        lockKey,
        '1',
        'NX',
        'EX',
        30 // 30 second lock timeout
      );

      if (!lockAcquired) {
        // Another process is fetching, wait and retry
        await new Promise(resolve => setTimeout(resolve, 100));
        return getWithLock(key, ttl, fetchFn);
      }

      try {
        // Fetch data
        const data = await fetchFn();
        
        // Store in cache
        await redis.set(fullKey, JSON.stringify(data), ttl);
        
        return data;
      } finally {
        // Release lock
        await redis.del(lockKey);
      }
    }

    // Use distributed caching
    const popularProducts = await getWithLock(
      'products:popular',
      cacheConfig.ttl.medium,
      async () => {
        console.log('Fetching popular products...');
        return await db.table('products')
          .orderBy('view_count', 'desc')
          .limit(20)
          .get();
      }
    );

    console.log(`Cached ${popularProducts.length} popular products`);

  } finally {
    await db.disconnect();
    await cache.disconnect();
  }
}

// Main function
async function main() {
  console.log('=== Caching Strategies Examples ===');
  console.log('\nCaching Patterns:');
  console.log('1. Cache-aside (Lazy Loading) - Most common');
  console.log('2. Write-through - Update cache on writes');
  console.log('3. Write-behind - Async database updates');
  console.log('4. Refresh-ahead - Proactive refresh');
  console.log('5. Tag-based - Invalidate related data');

  // Run examples
  // await basicCaching();
  // await cacheInvalidation();
  // await queryResultCaching();
  // await tagBasedCaching();
  // await distributedCaching();

  console.log('\nUncomment examples in main() to run them.');
}

main().catch(console.error);
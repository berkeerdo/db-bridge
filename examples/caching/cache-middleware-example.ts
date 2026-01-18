/**
 * db-bridge Cache Middleware Example
 *
 * This example demonstrates the industry-level cache system:
 * 1. CachedAdapter - Automatic query caching wrapper
 * 2. CacheKeyGenerator - Fluent API for cache key management
 * 3. CacheManager - Tag-based cache invalidation
 * 4. SmartCacheStrategy - Intelligent caching based on query patterns
 */

import { MySQLAdapter } from '@db-bridge/mysql';
import { RedisAdapter } from '@db-bridge/redis';
import {
  CachedAdapter,
  CacheManager,
  CacheKeyGenerator,
  SmartCacheStrategy,
  DefaultCacheStrategy,
} from '@db-bridge/core';

async function main() {
  // ============================================
  // 1. SETUP: Create adapters
  // ============================================

  const mysql = new MySQLAdapter();
  await mysql.connect({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'myapp',
  });

  const redis = new RedisAdapter();
  await redis.connect({
    connectionString: 'redis://localhost:6379',
  });

  // ============================================
  // 2. CACHED ADAPTER: Automatic query caching
  // ============================================

  // Wrap MySQL adapter with automatic caching
  const cachedDb = new CachedAdapter({
    adapter: mysql,
    cache: redis,

    // Smart caching strategy (learns from query patterns)
    strategy: new SmartCacheStrategy(),

    // Enable caching
    enabled: true,

    // Default TTL: 1 hour
    defaultTTL: 3600,

    // Only cache SELECT, SHOW, DESCRIBE commands
    cacheableCommands: ['SELECT', 'SHOW', 'DESCRIBE'],

    // Cache warmup queries (preload on connect)
    warmupQueries: [
      { sql: 'SELECT * FROM settings', ttl: 86400 }, // 1 day
      { sql: 'SELECT * FROM categories', ttl: 3600 }, // 1 hour
    ],
  });

  // Listen for cache events
  cachedDb.on('cacheHit', ({ key, sql, duration }) => {
    console.log(`Cache HIT: ${key} (${duration}ms)`);
  });

  cachedDb.on('cacheMiss', ({ key, sql, duration }) => {
    console.log(`Cache MISS: ${key} (${duration}ms)`);
  });

  // ============================================
  // 3. AUTOMATIC CACHING: Just use normally
  // ============================================

  // First query: MISS - goes to database
  const users1 = await cachedDb.query('SELECT * FROM users WHERE status = ?', ['active']);
  console.log('First query:', users1.rowCount, 'rows');

  // Second query: HIT - from cache
  const users2 = await cachedDb.query('SELECT * FROM users WHERE status = ?', ['active']);
  console.log('Second query:', users2.rowCount, 'rows (from cache)');

  // ============================================
  // 4. CONTROLLED CACHING: Custom options
  // ============================================

  // Disable caching for specific query
  const freshData = await cachedDb.query(
    'SELECT * FROM users WHERE id = ?',
    [123],
    { cache: false }, // Skip cache
  );

  // Custom TTL and tags
  const products = await cachedDb.query('SELECT * FROM products WHERE category_id = ?', [5], {
    cache: {
      ttl: 600, // 10 minutes
      tags: ['products', 'catalog'], // For bulk invalidation
      key: 'products:category:5', // Custom cache key
    },
  });

  // ============================================
  // 5. CACHE KEY GENERATOR: Fluent API
  // ============================================

  const keyGen = new CacheKeyGenerator({ namespace: 'myapp' });

  // Table-based keys
  const userKey = keyGen.forTable('users').withId(123).build();
  // => 'myapp:table:users:id:123'

  // Query-based keys (auto-hashed)
  const queryKey = keyGen.forQuery('SELECT * FROM users WHERE age > ?', [18]).build();
  // => 'myapp:query:a1b2c3d4'

  // Field-based keys
  const emailKey = keyGen.forTable('users').withField('email', 'test@example.com').build();
  // => 'myapp:table:users:field:email:098f6bcd'

  // Custom keys
  const customKey = keyGen.forCustom('api', 'v2', 'users', 'list').build();
  // => 'myapp:api:v2:users:list'

  // Keys with tags (for bulk invalidation)
  const { key, tags } = keyGen
    .forTable('orders')
    .withId(456)
    .withTags('user:123', 'pending-orders')
    .buildWithTags();
  // => { key: 'myapp:table:orders:id:456', tags: ['user:123', 'pending-orders', 'table:orders'] }

  console.log('Generated keys:', { userKey, queryKey, emailKey, customKey, key, tags });

  // ============================================
  // 6. CACHE MANAGER: Direct cache control
  // ============================================

  const cacheManager = cachedDb.getCacheManager();

  // Get cache statistics
  const stats = cacheManager.getStatistics();
  console.log('Cache stats:', stats);

  // Get all cached queries (sorted by hits)
  const cachedQueries = cacheManager.getCachedQueries();
  console.log('Top cached queries:', cachedQueries.slice(0, 5));

  // ============================================
  // 7. CACHE INVALIDATION: Multiple strategies
  // ============================================

  // Invalidate by pattern
  await cacheManager.invalidate(['*users*']);

  // Invalidate by table
  await cacheManager.invalidateByTable('orders');

  // Invalidate all cache
  await cacheManager.invalidateAll();

  // ============================================
  // 8. SIMPLE CACHE MANAGER: Without adapter
  // ============================================

  const simpleCache = new CacheManager({
    adapter: redis,
    namespace: 'myapp',
    defaultTTL: 300, // 5 minutes
    enableStats: true,
  });

  // Set with tags
  await simpleCache.set(
    'user:123',
    { id: 123, name: 'John' },
    {
      ttl: 600,
      tags: ['users', 'active-users'],
    },
  );

  // Get
  const user = await simpleCache.get('user:123');
  console.log('Cached user:', user);

  // Get or Set (cache-aside pattern)
  const profile = await simpleCache.getOrSet(
    'profile:123',
    async () => {
      // This runs only on cache miss
      return mysql.query('SELECT * FROM profiles WHERE user_id = ?', [123]);
    },
    { ttl: 300 },
  );

  // Invalidate by tag
  await simpleCache.invalidateByTag('users'); // Clears all user-related cache

  // Invalidate specific table
  await simpleCache.invalidateTable('users');

  // Invalidate specific record
  await simpleCache.invalidateRecord('users', 123);

  // Check stats
  const cacheStats = simpleCache.getStats();
  console.log('Cache stats:', cacheStats);
  // => { hits: 5, misses: 2, sets: 3, deletes: 1, invalidations: 10, hitRate: 0.71 }

  // ============================================
  // 9. SCOPED CACHE: Namespace isolation
  // ============================================

  // Create scoped cache for specific module
  const userCache = simpleCache.scope('users');
  const orderCache = simpleCache.scope('orders');

  await userCache.set('123', { id: 123, name: 'John' });
  // Key: 'users:123'

  await orderCache.set('456', { id: 456, total: 100 });
  // Key: 'orders:456'

  // ============================================
  // 10. CLEANUP
  // ============================================

  await cachedDb.disconnect();
  await redis.disconnect();

  console.log('Example completed successfully!');
}

main().catch(console.error);

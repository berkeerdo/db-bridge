# DB Bridge Caching System

DB Bridge provides a powerful and flexible caching system that works with any database adapter (MySQL, PostgreSQL, MongoDB, etc.). The caching layer automatically caches query results and handles cache invalidation on write operations.

## Features

- **Universal Compatibility**: Works with any database adapter
- **Automatic Caching**: Transparently caches SELECT queries
- **Smart Invalidation**: Automatically invalidates cache on INSERT/UPDATE/DELETE
- **Flexible Strategies**: Choose between default or smart caching strategies
- **Cache Warmup**: Pre-cache frequently accessed queries
- **Transaction Support**: Cache disabled during transactions
- **Performance Monitoring**: Track cache hits, misses, and performance metrics
- **Tag-based Invalidation**: Organize cache entries with tags

## Installation

```bash
# Install core and adapters
npm install @db-bridge/core @db-bridge/mysql @db-bridge/redis
```

## Basic Usage

```typescript
import { MySQLAdapter, RedisAdapter, CachedAdapter } from '@db-bridge/core';

// Create database adapter
const mysqlAdapter = new MySQLAdapter();

// Create cache adapter (Redis)
const cacheAdapter = new RedisAdapter({
  keyPrefix: 'myapp:',
  ttl: 3600, // 1 hour default
});

// Create cached adapter
const db = new CachedAdapter({
  adapter: mysqlAdapter,
  cache: cacheAdapter,
});

// Connect
await cacheAdapter.connect({ host: 'localhost', port: 6379 });
await db.connect({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'myapp',
});

// Queries are automatically cached
const users = await db.query('SELECT * FROM users'); // From DB
const cachedUsers = await db.query('SELECT * FROM users'); // From cache

// Write operations invalidate cache
await db.query('UPDATE users SET active = ? WHERE id = ?', [false, 123]);
// Cache for users table is automatically invalidated
```

## Configuration Options

```typescript
const cachedAdapter = new CachedAdapter({
  // Required
  adapter: databaseAdapter,      // Any DatabaseAdapter instance
  cache: cacheAdapter,          // Any CacheAdapter instance
  
  // Optional
  strategy: new SmartCacheStrategy(), // Caching strategy
  logger: logger,                     // Logger instance
  enabled: true,                      // Enable/disable caching
  cacheableCommands: ['SELECT'],      // Commands to cache
  defaultTTL: 3600,                   // Default TTL in seconds
  cacheEmptyResults: false,           // Cache empty result sets
  cacheErrors: false,                 // Cache query errors
  warmupQueries: [                    // Queries to pre-cache
    { 
      sql: 'SELECT * FROM config', 
      ttl: 7200 
    }
  ],
});
```

## Caching Strategies

### Default Strategy

Basic caching with configurable TTL per query type:

```typescript
import { DefaultCacheStrategy } from '@db-bridge/core';

const strategy = new DefaultCacheStrategy();
```

### Smart Strategy

Learns from query patterns and adjusts caching behavior:

```typescript
import { SmartCacheStrategy } from '@db-bridge/core';

const strategy = new SmartCacheStrategy();
// - Longer TTL for frequently accessed queries
// - Shorter TTL for rarely accessed queries
// - Caches slow queries automatically
```

### Custom Strategy

Create your own caching strategy:

```typescript
import { CacheStrategy, CacheOptions } from '@db-bridge/core';

class CustomStrategy implements CacheStrategy {
  shouldCache(sql: string, result: QueryResult): boolean {
    // Your logic
    return true;
  }
  
  getCacheTTL(sql: string, options?: CacheOptions): number {
    // Your logic
    return 3600;
  }
  
  getCacheKey(sql: string, params?: unknown[]): string {
    // Your logic
    return generateCacheKey(sql, params);
  }
  
  getInvalidationPatterns(sql: string): string[] {
    // Your logic
    return ['table:*'];
  }
}
```

## Query-level Cache Control

Control caching behavior per query:

```typescript
// Enable caching with custom TTL
await db.query(
  'SELECT * FROM products WHERE price > ?',
  [100],
  { cache: { ttl: 300 } } // Cache for 5 minutes
);

// Disable caching for specific query
await db.query(
  'SELECT * FROM realtime_data',
  [],
  { cache: false }
);

// Cache with tags
await db.query(
  'SELECT * FROM orders WHERE user_id = ?',
  [userId],
  { 
    cache: { 
      ttl: 600,
      tags: ['orders', `user:${userId}`]
    } 
  }
);
```

## Cache Invalidation

### Automatic Invalidation

Write operations automatically invalidate related cache:

```typescript
// These operations invalidate cache
await db.query('INSERT INTO users (name) VALUES (?)', ['John']);
await db.query('UPDATE users SET active = ? WHERE id = ?', [false, 1]);
await db.query('DELETE FROM users WHERE id = ?', [1]);
```

### Manual Invalidation

```typescript
const cacheManager = db.getCacheManager();

// Invalidate by pattern
await cacheManager.invalidate(['*users*', '*orders*']);

// Invalidate by table
await cacheManager.invalidateByTable('products');

// Invalidate by tags
await cacheManager.invalidate(['user:123']);

// Clear all cache
await cacheManager.invalidateAll();
```

## Cache Warmup

Pre-cache frequently accessed queries on startup:

```typescript
const db = new CachedAdapter({
  adapter: mysqlAdapter,
  cache: redisAdapter,
  warmupQueries: [
    { 
      sql: 'SELECT * FROM settings',
      ttl: 86400 // 24 hours
    },
    { 
      sql: 'SELECT * FROM categories WHERE active = ?',
      params: [true],
      ttl: 3600
    }
  ]
});

// Manual warmup
await db.warmupCache();
```

## Monitoring & Statistics

Track cache performance:

```typescript
const stats = db.getCacheManager().getStatistics();
console.log(stats);
// {
//   hits: 1523,
//   misses: 234,
//   hitRate: 0.867,
//   totalCached: 1757,
//   totalEvicted: 89,
//   avgHitTime: 2.3,
//   avgMissTime: 45.7
// }

// Listen to cache events
db.on('cacheHit', ({ key, sql, duration }) => {
  console.log(`Cache hit: ${sql} (${duration}ms)`);
});

db.on('cacheMiss', ({ key, sql, duration }) => {
  console.log(`Cache miss: ${sql} (${duration}ms)`);
});
```

## Transaction Support

Cache is automatically disabled during transactions:

```typescript
const tx = await db.beginTransaction();
try {
  // These queries are not cached
  await tx.query('SELECT * FROM inventory WHERE id = ?', [1]);
  await tx.query('UPDATE inventory SET quantity = ? WHERE id = ?', [5, 1]);
  
  await tx.commit();
  // Cache is cleared after commit
} catch (error) {
  await tx.rollback();
  // Cache remains unchanged on rollback
}
```

## Best Practices

1. **Choose appropriate TTLs**: Shorter for frequently changing data, longer for static data
2. **Use tags**: Organize cache entries with tags for granular invalidation
3. **Monitor hit rates**: Aim for >80% hit rate for optimal performance
4. **Warmup critical queries**: Pre-cache important queries on startup
5. **Handle errors gracefully**: Enable error caching for resilience
6. **Size your cache**: Monitor memory usage and set appropriate limits

## Advanced Example

```typescript
import { 
  MySQLAdapter, 
  RedisAdapter, 
  CachedAdapter, 
  SmartCacheStrategy,
  ConsoleLogger 
} from '@db-bridge/core';

// Setup with all features
const logger = new ConsoleLogger();

const db = new CachedAdapter({
  adapter: new MySQLAdapter({ logger }),
  cache: new RedisAdapter({ 
    keyPrefix: 'app:',
    logger,
    enableCompression: true 
  }),
  strategy: new SmartCacheStrategy(),
  logger,
  cacheableCommands: ['SELECT', 'SHOW', 'DESCRIBE'],
  defaultTTL: 3600,
  cacheEmptyResults: false,
  cacheErrors: true,
  warmupQueries: [
    { sql: 'SELECT * FROM config' },
    { sql: 'SELECT COUNT(*) FROM users' },
  ]
});

// Connect
await db.connect({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'myapp'
});

// Use with monitoring
db.on('cacheHit', ({ sql, duration }) => {
  logger.info('Cache hit', { sql, duration });
});

// Periodic stats logging
setInterval(() => {
  const stats = db.getCacheManager().getStatistics();
  logger.info('Cache stats', stats);
}, 60000);
```
# @db-bridge/redis

Redis adapter and caching layer for DB Bridge - A comprehensive database management library.

## Installation

```bash
npm install @db-bridge/redis @db-bridge/core
```

## Features

- Full Redis command support via ioredis
- Caching layer for database adapters
- Automatic cache invalidation
- Pub/Sub support
- Batch operations
- TTL management
- Key pattern matching
- TypeScript support

## Quick Start

### As a Cache Adapter

```typescript
import { RedisAdapter } from '@db-bridge/redis';

const cache = new RedisAdapter({
  keyPrefix: 'myapp:',
  ttl: 3600 // Default TTL: 1 hour
});

// Connect
await cache.connect({
  host: 'localhost',
  port: 6379,
  password: 'your-password'
});

// Basic operations
await cache.set('user:123', { id: 123, name: 'John Doe' });
const user = await cache.get('user:123');

// Disconnect
await cache.disconnect();
```

### As a Database Cache Layer

```typescript
import { MySQLAdapter } from '@db-bridge/mysql';
import { RedisAdapter, CachedAdapter } from '@db-bridge/redis';

// Setup adapters
const mysql = new MySQLAdapter();
const redis = new RedisAdapter({ keyPrefix: 'cache:' });

// Create cached adapter
const db = new CachedAdapter({
  adapter: mysql,
  cache: redis,
  defaultTTL: 300 // 5 minutes
});

// Queries are automatically cached
const users = await db.query(
  'SELECT * FROM users WHERE role = ?',
  ['admin'],
  { cache: { key: 'admin-users', ttl: 600 } }
);
```

## Configuration

### Redis Connection Options

```typescript
interface RedisConnectionConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  username?: string;
  sentinels?: Array<{ host: string; port: number }>;
  name?: string; // Sentinel master name
  family?: 4 | 6;
  path?: string; // Unix socket
  keepAlive?: number;
  connectionName?: string;
  enableReadyCheck?: boolean;
  enableOfflineQueue?: boolean;
  connectTimeout?: number;
  autoResubscribe?: boolean;
  autoResendUnfulfilledCommands?: boolean;
  lazyConnect?: boolean;
  tls?: ConnectionOptions;
  keyPrefix?: string;
  retryStrategy?: (times: number) => number | void | null;
}
```

### Adapter Options

```typescript
const redis = new RedisAdapter({
  // Key prefix for all operations
  keyPrefix: 'myapp:cache:',
  
  // Default TTL in seconds
  ttl: 3600,
  
  // Logger instance
  logger: console,
  
  // Connection timeout
  connectionTimeout: 5000,
  
  // Command timeout
  commandTimeout: 2500,
  
  // Enable compression for large values
  enableCompression: true,
  
  // ioredis specific options
  redis: {
    maxRetriesPerRequest: 3,
    enableAutoPipelining: true,
    retryStrategy: (times) => Math.min(times * 50, 2000)
  }
});
```

## Usage

### Basic Cache Operations

```typescript
// Set with TTL
await redis.set('session:abc123', { userId: 123, role: 'admin' }, 1800); // 30 minutes

// Get
const session = await redis.get('session:abc123');

// Check existence
const exists = await redis.exists('session:abc123');

// Delete
const deleted = await redis.delete('session:abc123');

// Get TTL
const ttl = await redis.ttl('session:abc123');

// Extend TTL
await redis.expire('session:abc123', 3600);

// Clear all with pattern
const keys = await redis.keys('session:*');
for (const key of keys) {
  await redis.delete(key);
}
```

### Batch Operations

```typescript
// Batch set
await redis.mset([
  { key: 'user:1', value: { name: 'Alice' }, ttl: 3600 },
  { key: 'user:2', value: { name: 'Bob' }, ttl: 3600 },
  { key: 'user:3', value: { name: 'Charlie' }, ttl: 3600 }
]);

// Batch get
const users = await redis.mget(['user:1', 'user:2', 'user:3']);

// Batch delete
await redis.mdel(['user:1', 'user:2', 'user:3']);
```

### Atomic Operations

```typescript
// Increment/Decrement
const count = await redis.increment('page:views', 1);
const remaining = await redis.decrement('api:quota', 1);

// Atomic compare and swap
const key = 'resource:lock';
const token = 'unique-token';
const acquired = await redis.setnx(key, token, 30); // Lock for 30 seconds

if (acquired) {
  try {
    // Do work
  } finally {
    // Release lock only if we own it
    const current = await redis.get(key);
    if (current === token) {
      await redis.delete(key);
    }
  }
}
```

### Database Caching

```typescript
// Create cached database adapter
const cachedDb = new CachedAdapter({
  adapter: mysql,
  cache: redis,
  defaultTTL: 300,
  strategy: 'lazy', // 'lazy' | 'eager' | 'refresh'
  cacheableCommands: ['SELECT'], // Only cache SELECT queries
  logger: console
});

// Automatic caching with custom key
const products = await cachedDb.query(
  'SELECT * FROM products WHERE category = ?',
  ['electronics'],
  {
    cache: {
      key: 'products:electronics',
      ttl: 600,
      tags: ['products', 'electronics']
    }
  }
);

// Disable cache for specific query
const realtimeData = await cachedDb.query(
  'SELECT * FROM active_sessions',
  [],
  { cache: false }
);

// Manual cache invalidation
const cacheManager = cachedDb.getCacheManager();
await cacheManager.invalidate(['products:electronics']);
await cacheManager.invalidateByTags(['products']);
await cacheManager.invalidateAll();
```

### Redis Commands

Access all Redis commands through the `commands` property:

```typescript
const redis = new RedisAdapter();
const commands = redis.commands;

// Strings
await commands.set('key', 'value');
await commands.get('key');
await commands.mget('key1', 'key2');
await commands.incr('counter');
await commands.incrby('counter', 5);

// Hashes
await commands.hset('user:123', 'name', 'John');
await commands.hget('user:123', 'name');
await commands.hgetall('user:123');
await commands.hmset('user:123', { name: 'John', age: 30 });

// Lists
await commands.lpush('queue', 'task1', 'task2');
await commands.rpop('queue');
await commands.lrange('queue', 0, -1);
await commands.llen('queue');

// Sets
await commands.sadd('tags', 'nodejs', 'redis');
await commands.srem('tags', 'redis');
await commands.smembers('tags');
await commands.sismember('tags', 'nodejs');
await commands.scard('tags');

// Sorted Sets
await commands.zadd('leaderboard', 100, 'player1', 200, 'player2');
await commands.zrange('leaderboard', 0, -1);
await commands.zrevrange('leaderboard', 0, 9, 'WITHSCORES');
await commands.zscore('leaderboard', 'player1');
await commands.zrank('leaderboard', 'player1');

// Pub/Sub
await commands.subscribe('channel1', 'channel2');
await commands.publish('channel1', 'Hello World');
commands.on('message', (channel, message) => {
  console.log(`Received ${message} from ${channel}`);
});

// Transactions
const multi = commands.multi();
multi.set('key1', 'value1');
multi.set('key2', 'value2');
multi.get('key1');
const results = await multi.exec();

// Lua Scripts
const script = `
  local current = redis.call('get', KEYS[1])
  if current == ARGV[1] then
    redis.call('set', KEYS[1], ARGV[2])
    return 1
  else
    return 0
  end
`;
const result = await commands.eval(script, 1, 'key', 'oldValue', 'newValue');
```

## Advanced Features

### Cache Invalidation Strategies

```typescript
// Tag-based invalidation
await cachedDb.query(
  'SELECT * FROM products WHERE category = ?',
  ['electronics'],
  { cache: { tags: ['products', 'electronics'] } }
);

// Invalidate by tag
await cacheManager.invalidateByTags(['electronics']);

// Pattern-based invalidation
await cacheManager.invalidatePattern('products:*');

// Automatic invalidation on mutations
const result = await cachedDb.execute(
  'UPDATE products SET price = ? WHERE id = ?',
  [99.99, 123]
); // Automatically invalidates related cache
```

### Cache Warming

```typescript
// Pre-warm cache on startup
const warmupQueries = [
  { sql: 'SELECT * FROM config', key: 'app:config', ttl: 86400 },
  { sql: 'SELECT * FROM categories', key: 'categories:all', ttl: 3600 }
];

for (const query of warmupQueries) {
  const result = await mysql.query(query.sql);
  await redis.set(query.key, result.rows, query.ttl);
}
```

### Monitoring and Statistics

```typescript
// Cache statistics
const stats = cacheManager.getStatistics();
console.log('Cache hit rate:', stats.hitRate);
console.log('Total hits:', stats.hits);
console.log('Total misses:', stats.misses);
console.log('Total cached:', stats.totalCached);

// Redis info
const info = await redis.info();
console.log('Memory usage:', info.memory.used_memory_human);
console.log('Connected clients:', info.clients.connected_clients);

// Monitor slow queries
redis.on('slowlog', (log) => {
  console.warn('Slow Redis command:', log);
});
```

### Clustering Support

```typescript
// Redis Cluster
const redis = new RedisAdapter({
  cluster: [
    { host: 'redis1', port: 6379 },
    { host: 'redis2', port: 6379 },
    { host: 'redis3', port: 6379 }
  ],
  clusterOptions: {
    enableReadyCheck: true,
    maxRedirections: 16,
    retryDelayOnFailover: 100,
    retryDelayOnClusterDown: 300
  }
});

// Sentinel
const redis = new RedisAdapter({
  sentinels: [
    { host: 'sentinel1', port: 26379 },
    { host: 'sentinel2', port: 26379 },
    { host: 'sentinel3', port: 26379 }
  ],
  name: 'mymaster',
  sentinelPassword: 'sentinel-password'
});
```

## Error Handling

```typescript
import { ConnectionError, CacheError } from '@db-bridge/redis';

try {
  await redis.connect(config);
} catch (error) {
  if (error instanceof ConnectionError) {
    console.error('Redis connection failed:', error.message);
    // Fallback to database-only mode
  }
}

// Handle cache misses gracefully
try {
  const data = await redis.get('key');
  if (!data) {
    // Cache miss - fetch from database
    const dbData = await fetchFromDatabase();
    await redis.set('key', dbData, 300);
    return dbData;
  }
  return data;
} catch (error) {
  if (error instanceof CacheError) {
    // Log error but continue with database
    console.error('Cache error:', error);
    return fetchFromDatabase();
  }
}
```

## Best Practices

1. **Use Key Prefixes**: Namespace your keys to avoid collisions
2. **Set TTLs**: Always set appropriate TTLs to prevent memory bloat
3. **Handle Cache Misses**: Implement fallback to database
4. **Monitor Memory**: Keep track of Redis memory usage
5. **Use Pipelining**: Batch operations when possible
6. **Implement Circuit Breaker**: Protect against Redis failures

## TypeScript Support

```typescript
interface CachedUser {
  id: number;
  name: string;
  email: string;
  preferences: {
    theme: 'light' | 'dark';
    notifications: boolean;
  };
}

// Type-safe cache operations
await redis.set<CachedUser>('user:123', {
  id: 123,
  name: 'John Doe',
  email: 'john@example.com',
  preferences: {
    theme: 'dark',
    notifications: true
  }
});

const user = await redis.get<CachedUser>('user:123');
if (user) {
  console.log(user.preferences.theme); // TypeScript knows the type
}
```

## License

MIT © Berke Erdoğan
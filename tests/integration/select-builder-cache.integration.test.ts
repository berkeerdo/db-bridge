/**
 * SelectBuilder Cache Integration Tests
 *
 * Tests cache functionality with real Redis and MySQL/PostgreSQL databases.
 * Verifies that query results are properly cached and retrieved.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { DBBridge, createModularQueryBuilder } from '@db-bridge/core';
import { RedisAdapter } from '@db-bridge/redis';
import { MySQLDialect, PostgreSQLDialect } from '@db-bridge/core';

// Test data
const testUsers = [
  { name: 'Cache Test User 1', email: 'cache1@example.com', age: 25 },
  { name: 'Cache Test User 2', email: 'cache2@example.com', age: 30 },
  { name: 'Cache Test User 3', email: 'cache3@example.com', age: 35 },
];

describe.each([
  {
    name: 'MySQL',
    config: {
      host: process.env.MYSQL_HOST || 'localhost',
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || 'test',
      database: process.env.MYSQL_DATABASE || 'test_db',
    },
    createFn: DBBridge.createMySQL.bind(DBBridge),
    dialectClass: MySQLDialect,
    createTable: `
      CREATE TABLE IF NOT EXISTS cache_test_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        age INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    insertSql: 'INSERT INTO cache_test_users (name, email, age) VALUES (?, ?, ?)',
  },
  {
    name: 'PostgreSQL',
    config: {
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'test',
      database: process.env.POSTGRES_DATABASE || 'test_db',
    },
    createFn: DBBridge.createPostgreSQL.bind(DBBridge),
    dialectClass: PostgreSQLDialect,
    createTable: `
      CREATE TABLE IF NOT EXISTS cache_test_users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(255),
        age INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
    insertSql: 'INSERT INTO cache_test_users (name, email, age) VALUES ($1, $2, $3)',
  },
])(
  'SelectBuilder Cache Integration Tests - $name',
  ({ name, config, createFn, dialectClass, createTable, insertSql }) => {
    let db: DBBridge;
    let redis: RedisAdapter;
    let isConnected = false;
    let queryCount = 0;

    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    };

    beforeAll(async () => {
      try {
        // Connect to database
        db = await createFn(config);

        // Connect to Redis
        redis = new RedisAdapter({ keyPrefix: 'test:cache:' });
        await redis.connect(redisConfig);

        // Create test table
        await db.execute(createTable);

        // Clear and insert test data
        await db.execute('DELETE FROM cache_test_users');
        for (const user of testUsers) {
          await db.execute(insertSql, [user.name, user.email, user.age]);
        }

        isConnected = true;
      } catch (error) {
        console.warn(`${name} cache integration test setup failed:`, error);
        console.warn(`Skipping ${name} cache integration tests.`);
      }
    });

    beforeEach(async () => {
      if (isConnected) {
        // Clear Redis cache before each test
        await redis.flushdb();
        queryCount = 0;
      }
    });

    afterAll(async () => {
      if (isConnected) {
        try {
          await db.execute('DROP TABLE IF EXISTS cache_test_users');
          await db.disconnect();
          await redis.flushdb();
          await redis.disconnect();
        } catch (error) {
          console.warn(`${name} cache cleanup failed:`, error);
        }
      }
    });

    // Helper to create query builder with cache
    function createCachedQB() {
      const dialect = new dialectClass();
      const adapter = db.getAdapter()!;

      return createModularQueryBuilder({
        dialect,
        executor: {
          async query(sql, params) {
            queryCount++;
            const result = await adapter.query(sql, params as any);
            return {
              rows: result.rows,
              rowCount: result.rows.length,
              fields: result.fields,
            };
          },
          async execute(sql, params) {
            const result = await adapter.execute(sql, params as any);
            return {
              affectedRows: result.affectedRows ?? 0,
              insertId: result.insertId,
            };
          },
        },
        cache: {
          adapter: redis,
          defaultTTL: 60,
          maxTTL: 300,
          prefix: 'qb:',
          warnOnLargeResult: 1000,
          maxCacheableRows: 10000,
        },
      });
    }

    describe('Basic caching', () => {
      it('should cache query results on first call', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // First call - should hit database
        const result1 = await qb
          .select('id', 'name', 'email', 'age') // Avoid created_at date serialization issues
          .from('cache_test_users')
          .cache(60)
          .get();

        expect(result1).toHaveLength(3);
        expect(queryCount).toBe(1);

        // Second call with same query - should hit cache
        const result2 = await qb
          .select('id', 'name', 'email', 'age')
          .from('cache_test_users')
          .cache(60)
          .get();

        expect(result2).toHaveLength(3);
        expect(queryCount).toBe(1); // Still 1 - cache hit!
        expect(result2).toEqual(result1);
      });

      it('should use custom cache key', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // Use custom cache key
        const result1 = await qb
          .select('*')
          .from('cache_test_users')
          .cache({ key: 'my-custom-key', ttl: 60 })
          .get();

        expect(result1).toHaveLength(3);
        expect(queryCount).toBe(1);

        // Verify custom key was used
        const cached = await redis.get('my-custom-key');
        expect(cached).not.toBeNull();
      });

      it('should bypass cache with noCache()', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // First call with cache
        await qb.select('*').from('cache_test_users').cache(60).get();

        expect(queryCount).toBe(1);

        // Second call with noCache() - should hit database
        const result = await qb.select('*').from('cache_test_users').cache(60).noCache().get();

        expect(result).toHaveLength(3);
        expect(queryCount).toBe(2); // Hit database again
      });

      it('should not cache when cache() is not called', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // First call without cache
        await qb.select('*').from('cache_test_users').get();

        expect(queryCount).toBe(1);

        // Second call without cache - should hit database again
        await qb.select('*').from('cache_test_users').get();

        expect(queryCount).toBe(2);
      });
    });

    describe('Cache with different queries', () => {
      it('should cache different queries separately', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // Query 1: All users
        const all = await qb.select('*').from('cache_test_users').cache(60).get();

        expect(all).toHaveLength(3);
        expect(queryCount).toBe(1);

        // Query 2: Users with age > 28
        const older = await qb
          .select('*')
          .from('cache_test_users')
          .where('age', '>', 28)
          .cache(60)
          .get();

        expect(older).toHaveLength(2);
        expect(queryCount).toBe(2); // Different query, new cache entry

        // Query 1 again - should hit cache
        await qb.select('*').from('cache_test_users').cache(60).get();

        expect(queryCount).toBe(2); // Cache hit for first query
      });

      it('should cache with WHERE conditions', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // Query with WHERE
        const result1 = await qb
          .select('name', 'age')
          .from('cache_test_users')
          .where('age', '>=', 30)
          .cache(60)
          .get();

        expect(result1).toHaveLength(2);
        expect(queryCount).toBe(1);

        // Same query again
        const result2 = await qb
          .select('name', 'age')
          .from('cache_test_users')
          .where('age', '>=', 30)
          .cache(60)
          .get();

        expect(result2).toEqual(result1);
        expect(queryCount).toBe(1); // Cache hit
      });
    });

    describe('Cache TTL', () => {
      it('should respect cache TTL', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // Cache with 1 second TTL
        await qb.select('*').from('cache_test_users').cache(1).get();

        expect(queryCount).toBe(1);

        // Immediate second call - should hit cache
        await qb.select('*').from('cache_test_users').cache(1).get();

        expect(queryCount).toBe(1);

        // Wait for cache to expire
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Third call after TTL - should hit database
        await qb.select('*').from('cache_test_users').cache(1).get();

        expect(queryCount).toBe(2);
      });
    });

    describe('Cache with aggregates', () => {
      it('count() should bypass cache (uses executeQuery directly)', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // count() uses executeQuery directly, not executeCachedQuery
        // This is by design - aggregate queries are fast and don't need caching
        const count1 = await qb.select('*').from('cache_test_users').cache(60).count();

        expect(count1).toBe(3);
        expect(queryCount).toBe(1);

        // Second count - hits database (no cache for count())
        const count2 = await qb.select('*').from('cache_test_users').cache(60).count();

        expect(count2).toBe(3);
        expect(queryCount).toBe(2); // No cache for count()
      });

      it('should cache first() results with custom key', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // First call with custom cache key (avoid date serialization)
        const user1 = await qb
          .select('id', 'name', 'email', 'age')
          .from('cache_test_users')
          .orderBy('id', 'ASC')
          .cache({ key: 'first-user', ttl: 60 })
          .first();

        expect(user1).not.toBeNull();
        expect(queryCount).toBe(1);

        // Second call with same custom key - should hit cache
        const user2 = await qb
          .select('id', 'name', 'email', 'age')
          .from('cache_test_users')
          .orderBy('id', 'ASC')
          .cache({ key: 'first-user', ttl: 60 })
          .first();

        expect(user2).toEqual(user1);
        expect(queryCount).toBe(1); // Cache hit with custom key
      });
    });

    describe('Cache key generation', () => {
      it('should generate different keys for different ORDER BY', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // Query with ASC order
        await qb.select('*').from('cache_test_users').orderBy('age', 'ASC').cache(60).get();

        expect(queryCount).toBe(1);

        // Query with DESC order - different cache key
        await qb.select('*').from('cache_test_users').orderBy('age', 'DESC').cache(60).get();

        expect(queryCount).toBe(2); // Different query
      });

      it('should generate different keys for different LIMIT', async () => {
        if (!isConnected) return;

        const qb = createCachedQB();

        // Query with LIMIT 2
        await qb.select('*').from('cache_test_users').limit(2).cache(60).get();

        expect(queryCount).toBe(1);

        // Query with LIMIT 1 - different cache key
        await qb.select('*').from('cache_test_users').limit(1).cache(60).get();

        expect(queryCount).toBe(2);
      });
    });
  },
);

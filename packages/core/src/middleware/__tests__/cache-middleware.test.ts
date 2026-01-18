import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createCacheMiddleware, createCacheInvalidationMiddleware } from '../cache-middleware';

import type { QueryMiddlewareContext, MiddlewareCacheAdapter } from '../types';

describe('cache-middleware', () => {
  let context: QueryMiddlewareContext;
  let cacheAdapter: MiddlewareCacheAdapter;

  beforeEach(() => {
    context = {
      sql: 'SELECT * FROM users WHERE id = $1',
      params: [1],
      startTime: Date.now(),
      metadata: {},
    };

    cacheAdapter = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('createCacheMiddleware', () => {
    it('should cache SELECT query results', async () => {
      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1, name: 'John' }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('should return cached result on cache hit', async () => {
      const cachedResult = {
        result: { rows: [{ id: 1, name: 'John' }], rowCount: 1, fields: [] },
        duration: 10,
      };
      cacheAdapter.get = vi.fn().mockResolvedValue(cachedResult);

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn();

      const result = await middleware(context, next);

      expect(result.cached).toBe(true);
      expect(next).not.toHaveBeenCalled();
    });

    it('should not cache when cache option is false', async () => {
      context.options = { cache: false };

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.get).not.toHaveBeenCalled();
      expect(cacheAdapter.set).not.toHaveBeenCalled();
    });

    it('should not cache non-SELECT queries', async () => {
      context.sql = 'INSERT INTO users (name) VALUES ($1)';

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.get).not.toHaveBeenCalled();
      expect(cacheAdapter.set).not.toHaveBeenCalled();
    });

    it('should cache SHOW queries', async () => {
      context.sql = 'SHOW TABLES';
      context.params = [];

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ table: 'users' }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalled();
    });

    it('should cache DESCRIBE queries', async () => {
      context.sql = 'DESCRIBE users';
      context.params = [];

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ column: 'id' }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalled();
    });

    it('should cache EXPLAIN queries', async () => {
      context.sql = 'EXPLAIN SELECT * FROM users';
      context.params = [];

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ plan: 'Seq Scan' }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalled();
    });

    it('should not cache empty results', async () => {
      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).not.toHaveBeenCalled();
    });

    it('should use custom cache key from options', async () => {
      context.options = { cache: { key: 'custom-key' } };

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalledWith(
        'custom-key',
        expect.anything(),
        expect.any(Number),
      );
    });

    it('should use custom TTL from options', async () => {
      context.options = { cache: { ttl: 30000 } };

      const middleware = createCacheMiddleware({ adapter: cacheAdapter, defaultTTL: 60000 });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalledWith(expect.any(String), expect.anything(), 30000);
    });

    it('should use key prefix', async () => {
      const middleware = createCacheMiddleware({
        adapter: cacheAdapter,
        keyPrefix: 'myapp:',
      });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(cacheAdapter.set).toHaveBeenCalledWith(
        expect.stringMatching(/^myapp:/),
        expect.anything(),
        expect.any(Number),
      );
    });

    it('should handle cache get errors gracefully', async () => {
      cacheAdapter.get = vi.fn().mockRejectedValue(new Error('Cache error'));

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      const result = await middleware(context, next);

      expect(next).toHaveBeenCalled();
      expect(result.result.rows).toHaveLength(1);
    });

    it('should handle cache set errors gracefully', async () => {
      cacheAdapter.set = vi.fn().mockRejectedValue(new Error('Cache error'));

      const middleware = createCacheMiddleware({ adapter: cacheAdapter });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      const result = await middleware(context, next);

      expect(result.result.rows).toHaveLength(1);
      expect(result.cached).toBe(false);
    });

    it('should use custom shouldCache function', async () => {
      const middleware = createCacheMiddleware({
        adapter: cacheAdapter,
        shouldCache: (sql) => sql.includes('cacheable'),
      });

      context.sql = 'SELECT * FROM users WHERE cacheable = true';
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);
      expect(cacheAdapter.set).toHaveBeenCalled();

      // Reset and try non-cacheable query
      cacheAdapter.set = vi.fn();
      context.sql = 'SELECT * FROM users';
      await middleware(context, next);
      expect(cacheAdapter.set).not.toHaveBeenCalled();
    });
  });

  describe('createCacheInvalidationMiddleware', () => {
    it('should mark INSERT queries for invalidation', async () => {
      context.sql = 'INSERT INTO users (name) VALUES ($1)';

      const middleware = createCacheInvalidationMiddleware(cacheAdapter);
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['invalidatedTable']).toBe('USERS');
      expect(context.metadata['cacheInvalidated']).toBe(true);
    });

    it('should mark UPDATE queries for invalidation', async () => {
      context.sql = 'UPDATE users SET name = $1 WHERE id = $2';

      const middleware = createCacheInvalidationMiddleware(cacheAdapter);
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['invalidatedTable']).toBe('USERS');
      expect(context.metadata['cacheInvalidated']).toBe(true);
    });

    it('should mark DELETE queries for invalidation', async () => {
      context.sql = 'DELETE FROM users WHERE id = $1';

      const middleware = createCacheInvalidationMiddleware(cacheAdapter);
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['invalidatedTable']).toBe('USERS');
      expect(context.metadata['cacheInvalidated']).toBe(true);
    });

    it('should mark TRUNCATE queries for invalidation', async () => {
      context.sql = 'TRUNCATE TABLE users';

      const middleware = createCacheInvalidationMiddleware(cacheAdapter);
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['invalidatedTable']).toBe('USERS');
      expect(context.metadata['cacheInvalidated']).toBe(true);
    });

    it('should not mark SELECT queries for invalidation', async () => {
      context.sql = 'SELECT * FROM users';

      const middleware = createCacheInvalidationMiddleware(cacheAdapter);
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['cacheInvalidated']).toBeUndefined();
    });

    it('should handle quoted table names', async () => {
      context.sql = 'INSERT INTO "users" (name) VALUES ($1)';

      const middleware = createCacheInvalidationMiddleware(cacheAdapter);
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['invalidatedTable']).toBe('USERS');
    });
  });
});

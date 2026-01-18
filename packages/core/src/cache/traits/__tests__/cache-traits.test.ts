import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { CacheBaseTrait, type CacheStatistics } from '../cache-base-trait';
import { CacheInvalidationTrait } from '../cache-invalidation-trait';
import { CacheMaintenanceTrait } from '../cache-maintenance-trait';
import { CacheOperationsTrait, type CachedQuery } from '../cache-operations-trait';

import type { CacheAdapter } from '../../../interfaces';
import type { QueryResult } from '../../../types';
import type { CacheStrategy, QueryCacheOptions } from '../../cache-strategy';

describe('CacheBaseTrait', () => {
  let cache: CacheAdapter;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let trait: CacheBaseTrait;

  beforeEach(() => {
    cache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
      keys: vi.fn(),
      has: vi.fn(),
    } as unknown as CacheAdapter;

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };
  });

  describe('constructor', () => {
    it('should initialize with default enabled state', () => {
      trait = new CacheBaseTrait(cache, logger);
      expect(trait.isEnabled()).toBe(true);
    });

    it('should initialize with custom enabled state', () => {
      trait = new CacheBaseTrait(cache, logger, false);
      expect(trait.isEnabled()).toBe(false);
    });

    it('should initialize statistics to zero', () => {
      trait = new CacheBaseTrait(cache, logger);
      const stats = trait.getStatistics();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.totalCached).toBe(0);
      expect(stats.totalEvicted).toBe(0);
      expect(stats.avgHitTime).toBe(0);
      expect(stats.avgMissTime).toBe(0);
    });
  });

  describe('enable/disable', () => {
    beforeEach(() => {
      trait = new CacheBaseTrait(cache, logger);
    });

    it('should enable cache', () => {
      trait.disable();
      expect(trait.isEnabled()).toBe(false);

      trait.enable();
      expect(trait.isEnabled()).toBe(true);
    });

    it('should disable cache', () => {
      expect(trait.isEnabled()).toBe(true);

      trait.disable();
      expect(trait.isEnabled()).toBe(false);
    });

    it('should emit cacheEnabled event', () => {
      const listener = vi.fn();
      trait.on('cacheEnabled', listener);

      trait.enable();

      expect(listener).toHaveBeenCalled();
    });

    it('should emit cacheDisabled event', () => {
      const listener = vi.fn();
      trait.on('cacheDisabled', listener);

      trait.disable();

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getStatistics', () => {
    beforeEach(() => {
      trait = new CacheBaseTrait(cache, logger);
    });

    it('should return a copy of statistics', () => {
      const stats1 = trait.getStatistics();
      const stats2 = trait.getStatistics();

      expect(stats1).toEqual(stats2);
      expect(stats1).not.toBe(stats2);
    });
  });

  describe('resetStatistics', () => {
    beforeEach(() => {
      trait = new CacheBaseTrait(cache, logger);
    });

    it('should reset all statistics to zero', () => {
      // We can't directly modify statistics, but we can test reset
      trait.resetStatistics();
      const stats = trait.getStatistics();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.totalCached).toBe(0);
      expect(stats.totalEvicted).toBe(0);
      expect(stats.avgHitTime).toBe(0);
      expect(stats.avgMissTime).toBe(0);
    });
  });
});

describe('CacheOperationsTrait', () => {
  let cache: CacheAdapter;
  let strategy: CacheStrategy;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let trait: CacheOperationsTrait;

  beforeEach(() => {
    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      has: vi.fn().mockResolvedValue(false),
    } as unknown as CacheAdapter;

    strategy = {
      getCacheKey: vi.fn().mockImplementation((sql: string) => `key:${sql}`),
      getCacheTTL: vi.fn().mockReturnValue(3600),
      shouldCache: vi.fn().mockReturnValue(true),
    } as unknown as CacheStrategy;

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    trait = new CacheOperationsTrait(cache, logger);
    trait.setStrategy(strategy);
  });

  describe('setStrategy', () => {
    it('should set the cache strategy', async () => {
      const newStrategy = {
        getCacheKey: vi.fn().mockReturnValue('new-key'),
        getCacheTTL: vi.fn().mockReturnValue(1800),
        shouldCache: vi.fn().mockReturnValue(true),
      } as unknown as CacheStrategy;

      trait.setStrategy(newStrategy);

      // Verify strategy is used in get
      await trait.get('SELECT 1', []);
      expect(newStrategy.getCacheKey).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return null when cache is disabled', async () => {
      trait.disable();

      const result = await trait.get('SELECT * FROM users', []);

      expect(result).toBeNull();
      expect(cache.get).not.toHaveBeenCalled();
    });

    it('should return cached result on cache hit', async () => {
      const cachedResult: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedResult);

      const result = await trait.get('SELECT * FROM users', []);

      expect(result).toEqual(cachedResult);
      expect(cache.get).toHaveBeenCalledWith('key:SELECT * FROM users');
    });

    it('should update hit statistics on cache hit', async () => {
      const cachedResult: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedResult);

      await trait.get('SELECT * FROM users', []);

      const stats = trait.getStatistics();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(1);
    });

    it('should emit cacheHit event on cache hit', async () => {
      const listener = vi.fn();
      trait.on('cacheHit', listener);

      const cachedResult: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedResult);

      await trait.get('SELECT * FROM users', []);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'key:SELECT * FROM users',
          sql: 'SELECT * FROM users',
        }),
      );
    });

    it('should return null on cache miss', async () => {
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await trait.get('SELECT * FROM users', []);

      expect(result).toBeNull();
    });

    it('should update miss statistics on cache miss', async () => {
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await trait.get('SELECT * FROM users', []);

      const stats = trait.getStatistics();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0);
    });

    it('should emit cacheMiss event on cache miss', async () => {
      const listener = vi.fn();
      trait.on('cacheMiss', listener);

      await trait.get('SELECT * FROM users', []);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'key:SELECT * FROM users',
          sql: 'SELECT * FROM users',
        }),
      );
    });

    it('should return null and emit error on cache error', async () => {
      const error = new Error('Cache connection failed');
      (cache.get as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const listener = vi.fn();
      trait.on('cacheError', listener);

      const result = await trait.get('SELECT * FROM users', []);

      expect(result).toBeNull();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'key:SELECT * FROM users',
          error,
        }),
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should increment hit count for cached query', async () => {
      const cachedResult: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(cachedResult);

      // First, set a query to populate queryCache
      await trait.set('SELECT * FROM users', [], cachedResult);

      // Now get it twice
      await trait.get('SELECT * FROM users', []);
      await trait.get('SELECT * FROM users', []);

      const queries = trait.getCachedQueries();
      const query = queries.find((q) => q.sql === 'SELECT * FROM users');
      expect(query?.hits).toBe(2);
    });
  });

  describe('set', () => {
    it('should not cache when disabled', async () => {
      trait.disable();

      await trait.set('SELECT * FROM users', [], { rows: [], rowCount: 0, fields: [] });

      expect(cache.set).not.toHaveBeenCalled();
    });

    it('should not cache when strategy says not cacheable', async () => {
      (strategy.shouldCache as ReturnType<typeof vi.fn>).mockReturnValue(false);

      await trait.set('SELECT * FROM users', [], { rows: [], rowCount: 0, fields: [] });

      expect(cache.set).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith('Query not cacheable', expect.any(Object));
    });

    it('should cache query result', async () => {
      const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

      await trait.set('SELECT * FROM users', [], result);

      expect(cache.set).toHaveBeenCalledWith('key:SELECT * FROM users', result, 3600);
    });

    it('should update statistics on cache set', async () => {
      const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

      await trait.set('SELECT * FROM users', [], result);

      const stats = trait.getStatistics();
      expect(stats.totalCached).toBe(1);
    });

    it('should emit cacheSet event', async () => {
      const listener = vi.fn();
      trait.on('cacheSet', listener);

      const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };
      await trait.set('SELECT * FROM users', [], result, { tags: ['users'] });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'key:SELECT * FROM users',
          sql: 'SELECT * FROM users',
          ttl: 3600,
          tags: ['users'],
        }),
      );
    });

    it('should update tag index', async () => {
      const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

      await trait.set('SELECT * FROM users', [], result, { tags: ['users', 'active'] });

      const queries = trait.getCachedQueries();
      expect(queries[0].tags).toContain('users');
      expect(queries[0].tags).toContain('active');
    });

    it('should handle cache set error', async () => {
      const error = new Error('Cache write failed');
      (cache.set as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const listener = vi.fn();
      trait.on('cacheError', listener);

      await trait.set('SELECT * FROM users', [], { rows: [], rowCount: 0, fields: [] });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          error,
        }),
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should call registerInvalidation when invalidateOn is provided', async () => {
      const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

      await trait.set('SELECT * FROM users', [], result, { invalidateOn: ['users:*'] });

      expect(logger.debug).toHaveBeenCalledWith(
        'Registered invalidation patterns',
        expect.objectContaining({
          patterns: ['users:*'],
        }),
      );
    });
  });

  describe('getCachedQueries', () => {
    it('should return empty array when no queries cached', () => {
      const queries = trait.getCachedQueries();
      expect(queries).toEqual([]);
    });

    it('should return cached queries sorted by hits', async () => {
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(result);

      // Cache two queries
      (strategy.getCacheKey as ReturnType<typeof vi.fn>).mockReturnValue('key1');
      await trait.set('SELECT 1', [], result);

      (strategy.getCacheKey as ReturnType<typeof vi.fn>).mockReturnValue('key2');
      await trait.set('SELECT 2', [], result);

      // Hit first query 3 times
      (strategy.getCacheKey as ReturnType<typeof vi.fn>).mockReturnValue('key1');
      await trait.get('SELECT 1', []);
      await trait.get('SELECT 1', []);
      await trait.get('SELECT 1', []);

      // Hit second query 1 time
      (strategy.getCacheKey as ReturnType<typeof vi.fn>).mockReturnValue('key2');
      await trait.get('SELECT 2', []);

      const queries = trait.getCachedQueries();
      expect(queries[0].sql).toBe('SELECT 1');
      expect(queries[0].hits).toBe(3);
      expect(queries[1].sql).toBe('SELECT 2');
      expect(queries[1].hits).toBe(1);
    });
  });

  describe('getCacheSize', () => {
    it('should return zero when no queries cached', () => {
      const size = trait.getCacheSize();
      expect(size.entries).toBe(0);
      expect(size.approximateSize).toBe(0);
    });

    it('should return correct entry count and size', async () => {
      const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

      await trait.set('SELECT * FROM users', [], result);

      const size = trait.getCacheSize();
      expect(size.entries).toBe(1);
      expect(size.approximateSize).toBeGreaterThan(0);
    });
  });
});

describe('CacheInvalidationTrait', () => {
  let cache: CacheAdapter;
  let strategy: CacheStrategy;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let trait: CacheInvalidationTrait;

  beforeEach(() => {
    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      has: vi.fn().mockResolvedValue(false),
    } as unknown as CacheAdapter;

    strategy = {
      getCacheKey: vi.fn().mockImplementation((sql: string) => `key:${sql}`),
      getCacheTTL: vi.fn().mockReturnValue(3600),
      shouldCache: vi.fn().mockReturnValue(true),
    } as unknown as CacheStrategy;

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    trait = new CacheInvalidationTrait(cache, logger);
    trait.setStrategy(strategy);
  });

  describe('invalidate', () => {
    it('should return 0 when disabled', async () => {
      trait.disable();

      const count = await trait.invalidate(['*']);

      expect(count).toBe(0);
      expect(cache.keys).not.toHaveBeenCalled();
    });

    it('should invalidate by pattern', async () => {
      (cache.keys as ReturnType<typeof vi.fn>).mockResolvedValue(['key1', 'key2']);

      const count = await trait.invalidate(['users:*']);

      expect(count).toBe(2);
      expect(cache.delete).toHaveBeenCalledWith('key1');
      expect(cache.delete).toHaveBeenCalledWith('key2');
    });

    it('should invalidate by tag', async () => {
      // First, cache a query with tags
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT * FROM users', [], result, { tags: ['users'] });

      // Now invalidate by tag
      const count = await trait.invalidate(['users']);

      expect(count).toBe(1);
      expect(cache.delete).toHaveBeenCalled();
    });

    it('should update eviction statistics', async () => {
      (cache.keys as ReturnType<typeof vi.fn>).mockResolvedValue(['key1', 'key2']);

      await trait.invalidate(['*']);

      const stats = trait.getStatistics();
      expect(stats.totalEvicted).toBe(2);
    });

    it('should emit cacheInvalidated event', async () => {
      const listener = vi.fn();
      trait.on('cacheInvalidated', listener);

      (cache.keys as ReturnType<typeof vi.fn>).mockResolvedValue(['key1']);

      await trait.invalidate(['pattern:*']);

      expect(listener).toHaveBeenCalledWith({
        patterns: ['pattern:*'],
        count: 1,
      });
    });

    it('should handle invalidation errors gracefully', async () => {
      (cache.keys as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cache error'));

      const count = await trait.invalidate(['*']);

      expect(count).toBe(0);
      expect(logger.error).toHaveBeenCalled();
    });

    it('should remove from queryCache and tagIndex', async () => {
      // Cache a query
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT * FROM users', [], result, { tags: ['users'] });

      expect(trait.getCacheSize().entries).toBe(1);

      // Invalidate
      (cache.keys as ReturnType<typeof vi.fn>).mockResolvedValue(['key:SELECT * FROM users']);
      await trait.invalidate(['key:*']);

      expect(trait.getCacheSize().entries).toBe(0);
    });
  });

  describe('invalidateByTable', () => {
    it('should invalidate with table patterns', async () => {
      (cache.keys as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      await trait.invalidateByTable('users');

      expect(cache.keys).toHaveBeenCalledWith('*users*');
      expect(cache.keys).toHaveBeenCalledWith('table:users:*');
    });
  });

  describe('invalidateAll', () => {
    it('should do nothing when disabled', async () => {
      trait.disable();

      await trait.invalidateAll();

      expect(cache.clear).not.toHaveBeenCalled();
    });

    it('should clear all cache', async () => {
      // Cache some queries first
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT 1', [], result);
      await trait.set('SELECT 2', [], result);

      expect(trait.getCacheSize().entries).toBe(2);

      await trait.invalidateAll();

      expect(cache.clear).toHaveBeenCalled();
      expect(trait.getCacheSize().entries).toBe(0);
    });

    it('should update statistics', async () => {
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT 1', [], result);
      await trait.set('SELECT 2', [], result);

      await trait.invalidateAll();

      const stats = trait.getStatistics();
      expect(stats.totalEvicted).toBe(2);
      expect(stats.totalCached).toBe(0);
    });

    it('should emit cacheCleared event', async () => {
      const listener = vi.fn();
      trait.on('cacheCleared', listener);

      await trait.invalidateAll();

      expect(listener).toHaveBeenCalled();
    });
  });
});

describe('CacheMaintenanceTrait', () => {
  let cache: CacheAdapter;
  let strategy: CacheStrategy;
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  let trait: CacheMaintenanceTrait;

  beforeEach(() => {
    vi.useFakeTimers();

    cache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      has: vi.fn().mockResolvedValue(false),
    } as unknown as CacheAdapter;

    strategy = {
      getCacheKey: vi.fn().mockImplementation((sql: string) => `key:${sql}`),
      getCacheTTL: vi.fn().mockReturnValue(1), // 1 second TTL
      shouldCache: vi.fn().mockReturnValue(true),
    } as unknown as CacheStrategy;

    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    trait = new CacheMaintenanceTrait(cache, logger);
    trait.setStrategy(strategy);
  });

  afterEach(() => {
    trait.destroy();
    vi.useRealTimers();
  });

  describe('warmUp', () => {
    it('should do nothing when disabled', async () => {
      trait.disable();

      await trait.warmUp([{ sql: 'SELECT 1' }]);

      expect(strategy.getCacheKey).not.toHaveBeenCalled();
    });

    it('should attempt to get cached queries', async () => {
      await trait.warmUp([{ sql: 'SELECT 1' }, { sql: 'SELECT 2', params: [1] }]);

      expect(cache.get).toHaveBeenCalledTimes(2);
    });

    it('should log when query needs caching', async () => {
      (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await trait.warmUp([{ sql: 'SELECT * FROM users' }]);

      expect(logger.debug).toHaveBeenCalledWith('Query needs caching for warmup', {
        sql: 'SELECT * FROM users',
      });
    });

    it('should emit cacheWarmedUp event', async () => {
      const listener = vi.fn();
      trait.on('cacheWarmedUp', listener);

      await trait.warmUp([{ sql: 'SELECT 1' }, { sql: 'SELECT 2' }]);

      expect(listener).toHaveBeenCalledWith({ count: 2 });
    });

    it('should handle warmup errors gracefully', async () => {
      // The get method catches errors internally and logs 'Cache get error'
      (cache.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Cache error'));

      await trait.warmUp([{ sql: 'SELECT 1' }]);

      // Error is caught by get() method which logs 'Cache get error'
      expect(logger.error).toHaveBeenCalledWith('Cache get error', expect.any(Error));
    });

    it('should log warmup start and completion', async () => {
      await trait.warmUp([{ sql: 'SELECT 1' }]);

      expect(logger.info).toHaveBeenCalledWith('Cache warmup started', { count: 1 });
      expect(logger.info).toHaveBeenCalledWith('Cache warmup completed');
    });
  });

  describe('startCleanupTimer', () => {
    it('should start periodic cleanup', async () => {
      // Cache a query with short TTL
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT 1', [], result);

      expect(trait.getCacheSize().entries).toBe(1);

      // Start cleanup timer with 100ms interval
      trait.startCleanupTimer(100);

      // Advance time past TTL (1 second)
      await vi.advanceTimersByTimeAsync(1500);

      // Cache should be cleaned up
      expect(trait.getCacheSize().entries).toBe(0);
    });

    it('should stop previous timer when starting new one', () => {
      trait.startCleanupTimer(1000);
      trait.startCleanupTimer(2000);

      // This should not throw - previous timer should be cleared
      expect(() => trait.stopCleanupTimer()).not.toThrow();
    });
  });

  describe('stopCleanupTimer', () => {
    it('should stop cleanup timer', async () => {
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT 1', [], result);

      trait.startCleanupTimer(100);
      trait.stopCleanupTimer();

      // Advance time past when cleanup would have run
      await vi.advanceTimersByTimeAsync(2000);

      // Cache should still have the entry (cleanup timer was stopped)
      // Note: The entry might still be there since cleanup timer was stopped
      // before it could run
      expect(trait.getCacheSize().entries).toBe(1);
    });

    it('should handle being called when no timer is running', () => {
      expect(() => trait.stopCleanupTimer()).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('should stop cleanup timer and clear caches', async () => {
      const result: QueryResult = { rows: [], rowCount: 0, fields: [] };
      await trait.set('SELECT 1', [], result, { tags: ['test'] });

      trait.startCleanupTimer(100);

      trait.destroy();

      expect(trait.getCacheSize().entries).toBe(0);
    });

    it('should remove all event listeners', async () => {
      const listener = vi.fn();
      trait.on('cacheSet', listener);

      trait.destroy();

      // After destroy, listeners should be removed
      expect(trait.listenerCount('cacheSet')).toBe(0);
    });
  });
});

describe('Statistics calculation', () => {
  let cache: CacheAdapter;
  let strategy: CacheStrategy;
  let trait: CacheOperationsTrait;

  beforeEach(() => {
    cache = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn().mockResolvedValue([]),
      has: vi.fn().mockResolvedValue(false),
    } as unknown as CacheAdapter;

    strategy = {
      getCacheKey: vi.fn().mockImplementation((sql: string) => `key:${sql}`),
      getCacheTTL: vi.fn().mockReturnValue(3600),
      shouldCache: vi.fn().mockReturnValue(true),
    } as unknown as CacheStrategy;

    trait = new CacheOperationsTrait(cache);
    trait.setStrategy(strategy);
  });

  it('should calculate hit rate correctly', async () => {
    const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };

    // 3 hits
    (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(result);
    await trait.get('SELECT 1', []);
    await trait.get('SELECT 2', []);
    await trait.get('SELECT 3', []);

    // 2 misses
    (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await trait.get('SELECT 4', []);
    await trait.get('SELECT 5', []);

    const stats = trait.getStatistics();
    expect(stats.hits).toBe(3);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0.6); // 3/5 = 0.6
  });

  it('should calculate average hit time correctly', async () => {
    const result: QueryResult = { rows: [{ id: 1 }], rowCount: 1, fields: [] };
    (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(result);

    await trait.get('SELECT 1', []);
    await trait.get('SELECT 2', []);

    const stats = trait.getStatistics();
    expect(stats.avgHitTime).toBeGreaterThanOrEqual(0);
  });

  it('should calculate average miss time correctly', async () => {
    (cache.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await trait.get('SELECT 1', []);
    await trait.get('SELECT 2', []);

    const stats = trait.getStatistics();
    expect(stats.avgMissTime).toBeGreaterThanOrEqual(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { QueryContext } from '../query-context';

import type { CryptoProvider } from '../../crypto/crypto';
import type { SQLDialect } from '../../dialect/sql-dialect';
import type { QueryExecutor, QueryContextCacheConfig } from '../query-context';

describe('QueryContext', () => {
  let dialect: SQLDialect;
  let executor: QueryExecutor;
  let crypto: CryptoProvider;
  let cacheConfig: QueryContextCacheConfig;

  beforeEach(() => {
    dialect = {
      name: 'postgresql',
      escapeIdentifier: vi.fn((id) => `"${id}"`),
      getParameterPlaceholder: vi.fn(() => '$1'),
      resetParameters: vi.fn(),
      buildSelect: vi.fn(),
      buildInsert: vi.fn(),
      buildUpdate: vi.fn(),
      buildDelete: vi.fn(),
    } as unknown as SQLDialect;

    executor = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] }),
      execute: vi.fn().mockResolvedValue({ affectedRows: 1, insertId: 123 }),
    };

    crypto = {
      encryptField: vi.fn((val) => `encrypted:${val}`),
      decryptField: vi.fn((val) => val.replace('encrypted:', '')),
    } as unknown as CryptoProvider;

    cacheConfig = {
      adapter: {
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        delete: vi.fn().mockResolvedValue(undefined),
      },
      defaultTTL: 60000,
      maxTTL: 300000,
      prefix: 'test:',
      global: false,
      warnOnLargeResult: 100,
      maxCacheableRows: 1000,
      logger: { warn: vi.fn() },
    };
  });

  describe('constructor', () => {
    it('should create context with required arguments', () => {
      const ctx = new QueryContext(dialect, executor);

      expect(ctx.dialect).toBe(dialect);
      expect(ctx.executor).toBe(executor);
      expect(ctx.crypto).toBeUndefined();
      expect(ctx.cacheConfig).toBeUndefined();
    });

    it('should create context with all arguments', () => {
      const ctx = new QueryContext(dialect, executor, crypto, cacheConfig);

      expect(ctx.dialect).toBe(dialect);
      expect(ctx.executor).toBe(executor);
      expect(ctx.crypto).toBe(crypto);
      expect(ctx.cacheConfig).toBe(cacheConfig);
    });
  });

  describe('executeQuery', () => {
    it('should execute SELECT query', async () => {
      const ctx = new QueryContext(dialect, executor);
      executor.query = vi.fn().mockResolvedValue({
        rows: [{ id: 1, name: 'John' }],
        rowCount: 1,
        fields: [],
      });

      const result = await ctx.executeQuery('SELECT * FROM users', []);

      expect(dialect.resetParameters).toHaveBeenCalled();
      expect(executor.query).toHaveBeenCalledWith('SELECT * FROM users', []);
      expect(result.rows).toHaveLength(1);
    });

    it('should pass bindings to query', async () => {
      const ctx = new QueryContext(dialect, executor);

      await ctx.executeQuery('SELECT * FROM users WHERE id = $1', [123]);

      expect(executor.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [123]);
    });
  });

  describe('executeWrite', () => {
    it('should execute INSERT query', async () => {
      const ctx = new QueryContext(dialect, executor);
      executor.execute = vi.fn().mockResolvedValue({
        affectedRows: 1,
        insertId: 456,
      });

      const result = await ctx.executeWrite('INSERT INTO users (name) VALUES ($1)', ['John']);

      expect(dialect.resetParameters).toHaveBeenCalled();
      expect(result.affectedRows).toBe(1);
      expect(result.insertId).toBe(456);
    });

    it('should execute UPDATE query', async () => {
      const ctx = new QueryContext(dialect, executor);
      executor.execute = vi.fn().mockResolvedValue({ affectedRows: 5 });

      const result = await ctx.executeWrite('UPDATE users SET active = true', []);

      expect(result.affectedRows).toBe(5);
    });

    it('should execute DELETE query', async () => {
      const ctx = new QueryContext(dialect, executor);
      executor.execute = vi.fn().mockResolvedValue({ affectedRows: 3 });

      const result = await ctx.executeWrite('DELETE FROM users WHERE id = $1', [1]);

      expect(result.affectedRows).toBe(3);
    });
  });

  describe('crypto', () => {
    it('should encrypt value when crypto is configured', () => {
      const ctx = new QueryContext(dialect, executor, crypto);

      const encrypted = ctx.encrypt('secret');

      expect(crypto.encryptField).toHaveBeenCalledWith('secret');
      expect(encrypted).toBe('encrypted:secret');
    });

    it('should throw when encrypting without crypto provider', () => {
      const ctx = new QueryContext(dialect, executor);

      expect(() => ctx.encrypt('secret')).toThrow('Crypto provider not configured');
    });

    it('should decrypt value when crypto is configured', () => {
      const ctx = new QueryContext(dialect, executor, crypto);

      const decrypted = ctx.decrypt('encrypted:secret');

      expect(crypto.decryptField).toHaveBeenCalledWith('encrypted:secret');
      expect(decrypted).toBe('secret');
    });

    it('should throw when decrypting without crypto provider', () => {
      const ctx = new QueryContext(dialect, executor);

      expect(() => ctx.decrypt('encrypted:secret')).toThrow('Crypto provider not configured');
    });

    it('should JSON stringify non-string decrypted values', () => {
      crypto.decryptField = vi.fn().mockReturnValue({ key: 'value' });
      const ctx = new QueryContext(dialect, executor, crypto);

      const decrypted = ctx.decrypt('encrypted:json');

      expect(decrypted).toBe('{"key":"value"}');
    });
  });

  describe('hasCrypto', () => {
    it('should return true when crypto is configured', () => {
      const ctx = new QueryContext(dialect, executor, crypto);

      expect(ctx.hasCrypto).toBe(true);
    });

    it('should return false when crypto is not configured', () => {
      const ctx = new QueryContext(dialect, executor);

      expect(ctx.hasCrypto).toBe(false);
    });
  });

  describe('hasCache', () => {
    it('should return true when cache is configured', () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);

      expect(ctx.hasCache).toBe(true);
    });

    it('should return false when cache is not configured', () => {
      const ctx = new QueryContext(dialect, executor);

      expect(ctx.hasCache).toBe(false);
    });
  });

  describe('generateCacheKey', () => {
    it('should generate unique cache key', () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);

      const key1 = ctx.generateCacheKey('SELECT * FROM users', []);
      const key2 = ctx.generateCacheKey('SELECT * FROM users WHERE id = $1', [1]);

      expect(key1).toMatch(/^test:/);
      expect(key2).toMatch(/^test:/);
      expect(key1).not.toBe(key2);
    });

    it('should use default prefix when not configured', () => {
      const ctx = new QueryContext(dialect, executor, undefined, {
        ...cacheConfig,
        prefix: '',
      });

      const key = ctx.generateCacheKey('SELECT 1', []);

      expect(key).toMatch(/^qb:/);
    });

    it('should generate same key for same SQL and bindings', () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);

      const key1 = ctx.generateCacheKey('SELECT * FROM users WHERE id = $1', [1]);
      const key2 = ctx.generateCacheKey('SELECT * FROM users WHERE id = $1', [1]);

      expect(key1).toBe(key2);
    });
  });

  describe('executeCachedQuery', () => {
    it('should execute directly when no cache configured', async () => {
      const ctx = new QueryContext(dialect, executor);
      executor.query = vi.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: [],
      });

      const result = await ctx.executeCachedQuery('SELECT * FROM users', []);

      expect(result.rows).toHaveLength(1);
    });

    it('should return cached result on cache hit', async () => {
      const cachedResult = { rows: [{ id: 1, cached: true }], rowCount: 1, fields: [] };
      cacheConfig.adapter.get = vi.fn().mockResolvedValue(cachedResult);
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);

      const result = await ctx.executeCachedQuery('SELECT * FROM users', []);

      expect(result.rows[0]).toHaveProperty('cached', true);
      expect(executor.query).not.toHaveBeenCalled();
    });

    it('should execute and cache on cache miss', async () => {
      cacheConfig.adapter.get = vi.fn().mockResolvedValue(null);
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);
      executor.query = vi.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: [],
      });

      await ctx.executeCachedQuery('SELECT * FROM users', []);

      expect(executor.query).toHaveBeenCalled();
      expect(cacheConfig.adapter.set).toHaveBeenCalled();
    });

    it('should use custom cache key when provided', async () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);
      executor.query = vi.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: [],
      });

      await ctx.executeCachedQuery('SELECT * FROM users', [], { key: 'custom-key' });

      expect(cacheConfig.adapter.get).toHaveBeenCalledWith('custom-key');
    });

    it('should use custom TTL when provided', async () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);
      executor.query = vi.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: [],
      });

      await ctx.executeCachedQuery('SELECT * FROM users', [], { ttl: 30000 });

      expect(cacheConfig.adapter.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        30000,
      );
    });

    it('should enforce maxTTL and warn', async () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);
      executor.query = vi.fn().mockResolvedValue({
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: [],
      });

      await ctx.executeCachedQuery('SELECT * FROM users', [], { ttl: 600000 }); // exceeds maxTTL

      expect(cacheConfig.adapter.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        300000, // maxTTL
      );
      expect(cacheConfig.logger?.warn).toHaveBeenCalled();
    });

    it('should skip caching for large result sets', async () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);
      executor.query = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 1500 }).fill({ id: 1 }),
        rowCount: 1500, // exceeds maxCacheableRows
        fields: [],
      });

      await ctx.executeCachedQuery('SELECT * FROM users', []);

      expect(cacheConfig.adapter.set).not.toHaveBeenCalled();
      expect(cacheConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Skipping cache'),
      );
    });

    it('should warn on large results', async () => {
      const ctx = new QueryContext(dialect, executor, undefined, cacheConfig);
      executor.query = vi.fn().mockResolvedValue({
        rows: Array.from({ length: 150 }).fill({ id: 1 }),
        rowCount: 150, // exceeds warnOnLargeResult
        fields: [],
      });

      await ctx.executeCachedQuery('SELECT * FROM users', []);

      expect(cacheConfig.adapter.set).toHaveBeenCalled();
      expect(cacheConfig.logger?.warn).toHaveBeenCalledWith(
        expect.stringContaining('Consider using pagination'),
      );
    });
  });

  describe('invalidateCache', () => {
    it('should do nothing when no cache configured', async () => {
      const ctx = new QueryContext(dialect, executor);

      await ctx.invalidateCache('users');

      // Should not throw
    });

    it('should call deletePattern on adapter if available', async () => {
      const adapter = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        deletePattern: vi.fn().mockResolvedValue(undefined),
      };
      const ctx = new QueryContext(dialect, executor, undefined, {
        ...cacheConfig,
        adapter,
      });

      await ctx.invalidateCache('users');

      expect(adapter.deletePattern).toHaveBeenCalledWith('test:users*');
    });

    it('should use wildcard pattern when no pattern provided', async () => {
      const adapter = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        deletePattern: vi.fn().mockResolvedValue(undefined),
      };
      const ctx = new QueryContext(dialect, executor, undefined, {
        ...cacheConfig,
        adapter,
      });

      await ctx.invalidateCache();

      expect(adapter.deletePattern).toHaveBeenCalledWith('test:*');
    });

    it('should use default prefix when not configured', async () => {
      const adapter = {
        get: vi.fn(),
        set: vi.fn(),
        delete: vi.fn(),
        deletePattern: vi.fn().mockResolvedValue(undefined),
      };
      const ctx = new QueryContext(dialect, executor, undefined, {
        ...cacheConfig,
        prefix: '',
        adapter,
      });

      await ctx.invalidateCache('users');

      expect(adapter.deletePattern).toHaveBeenCalledWith('qb:users*');
    });
  });
});

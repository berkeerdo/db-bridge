import { describe, it, expect, vi, beforeEach } from 'vitest';

import { createLoggingMiddleware, createMetricsMiddleware } from '../logging-middleware';

import type { QueryMiddlewareContext, MiddlewareLogger } from '../types';

describe('logging-middleware', () => {
  let context: QueryMiddlewareContext;
  let logger: MiddlewareLogger;

  beforeEach(() => {
    context = {
      sql: 'SELECT * FROM users WHERE id = $1',
      params: [1],
      startTime: Date.now(),
      metadata: {},
    };

    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
  });

  describe('createLoggingMiddleware', () => {
    it('should log query execution at debug level by default', async () => {
      const middleware = createLoggingMiddleware({ logger });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Executing query:'));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Query completed in'));
    });

    it('should use specified log level', async () => {
      const middleware = createLoggingMiddleware({ logger, logLevel: 'info' });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(logger.info).toHaveBeenCalled();
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('should log params when logParams is true', async () => {
      const middleware = createLoggingMiddleware({ logger, logParams: true });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Executing query:'),
        expect.stringContaining('[1]'),
      );
    });

    it('should log results when logResults is true', async () => {
      const middleware = createLoggingMiddleware({ logger, logResults: true });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1, name: 'John' }], rowCount: 1, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Query completed'),
        expect.objectContaining({ rows: expect.any(Array) }),
      );
    });

    it('should warn on slow queries', async () => {
      const middleware = createLoggingMiddleware({
        logger,
        slowQueryThreshold: 100,
      });
      const next = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return {
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 150, // Simulate slow query
        };
      });

      // Force the duration check to see the "slow" query
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = () => {
        callCount++;
        if (callCount === 1) {
          return 1000;
        } // startTime
        return 1150; // 150ms later
      };

      await middleware(context, next);

      Date.now = originalDateNow;

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Slow query detected'),
        expect.objectContaining({ duration: expect.any(Number) }),
      );
    });

    it('should log cache hit', async () => {
      const middleware = createLoggingMiddleware({ logger });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 1,
        cached: true,
      });

      await middleware(context, next);

      expect(logger.debug).toHaveBeenCalledWith('Query served from cache');
    });

    it('should log errors', async () => {
      const middleware = createLoggingMiddleware({ logger });
      const next = vi.fn().mockRejectedValue(new Error('Query failed'));

      await expect(middleware(context, next)).rejects.toThrow('Query failed');

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Query failed after'),
        expect.objectContaining({ error: expect.any(Error) }),
      );
    });

    it('should truncate long SQL', async () => {
      context.sql = `SELECT ${'a'.repeat(300)} FROM users`;
      const middleware = createLoggingMiddleware({ logger });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('...'));
    });

    it('should truncate long params', async () => {
      context.params = Array.from({ length: 100 }).fill('long_value_here');
      const middleware = createLoggingMiddleware({ logger, logParams: true });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      // Params should be truncated
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should use default console logger when none provided', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const middleware = createLoggingMiddleware();
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createMetricsMiddleware', () => {
    it('should collect query metrics', async () => {
      const onQuery = vi.fn();
      const middleware = createMetricsMiddleware({ onQuery });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 50,
      });

      await middleware(context, next);

      expect(onQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          sql: context.sql,
          success: true,
          rowCount: 1,
        }),
      );
    });

    it('should track failed queries', async () => {
      const onQuery = vi.fn();
      const middleware = createMetricsMiddleware({ onQuery });
      const next = vi.fn().mockRejectedValue(new Error('Failed'));

      await expect(middleware(context, next)).rejects.toThrow('Failed');

      expect(onQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
        }),
      );
    });

    it('should assign correct histogram bucket', async () => {
      const onQuery = vi.fn();
      const middleware = createMetricsMiddleware({
        onQuery,
        buckets: [10, 50, 100],
      });

      // Simulate 25ms query
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = () => {
        callCount++;
        if (callCount === 1) {
          return 1000;
        }
        return 1025; // 25ms later
      };

      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 25,
      });

      await middleware(context, next);

      Date.now = originalDateNow;

      expect(onQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 50, // 25ms falls in 50ms bucket
        }),
      );
    });

    it('should assign infinity bucket for very slow queries', async () => {
      const onQuery = vi.fn();
      const middleware = createMetricsMiddleware({
        onQuery,
        buckets: [10, 50],
      });

      // Simulate 100ms query
      const originalDateNow = Date.now;
      let callCount = 0;
      Date.now = () => {
        callCount++;
        if (callCount === 1) {
          return 1000;
        }
        return 1100; // 100ms later
      };

      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 100,
      });

      await middleware(context, next);

      Date.now = originalDateNow;

      expect(onQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: Number.POSITIVE_INFINITY,
        }),
      );
    });

    it('should handle cached results', async () => {
      const onQuery = vi.fn();
      const middleware = createMetricsMiddleware({ onQuery });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 1,
        cached: true,
      });

      await middleware(context, next);

      expect(onQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          cached: true,
        }),
      );
    });

    it('should track retry count', async () => {
      const onQuery = vi.fn();
      const middleware = createMetricsMiddleware({ onQuery });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 50,
        retries: 2,
      });

      await middleware(context, next);

      expect(onQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          retries: 2,
        }),
      );
    });

    it('should store metrics in context metadata', async () => {
      const middleware = createMetricsMiddleware();
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      await middleware(context, next);

      expect(context.metadata['metrics']).toBeDefined();
      expect(context.metadata['metrics']).toHaveProperty('sql');
      expect(context.metadata['metrics']).toHaveProperty('duration');
      expect(context.metadata['metrics']).toHaveProperty('timestamp');
    });

    it('should handle onQuery callback errors gracefully', async () => {
      const onQuery = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });
      const middleware = createMetricsMiddleware({ onQuery });
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      // Should not throw
      await expect(middleware(context, next)).resolves.toBeDefined();
    });

    it('should work without onQuery callback', async () => {
      const middleware = createMetricsMiddleware();
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      const result = await middleware(context, next);

      expect(result.result.rows).toEqual([]);
    });
  });
});

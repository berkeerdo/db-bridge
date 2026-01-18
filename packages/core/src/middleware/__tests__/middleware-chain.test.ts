import { describe, it, expect, vi } from 'vitest';

import { MiddlewareChain, composeMiddleware } from '../middleware-chain';

import type { QueryMiddleware, QueryMiddlewareContext, QueryMiddlewareResult } from '../types';

describe('MiddlewareChain', () => {
  const createMockContext = (sql = 'SELECT * FROM users'): QueryMiddlewareContext => ({
    sql,
    params: [],
    startTime: Date.now(),
    metadata: {},
  });

  const createMockResult = <T>(rows: T[] = []): QueryMiddlewareResult<T> => ({
    result: { rows, rowCount: rows.length, fields: [] },
    duration: 10,
  });

  describe('use', () => {
    it('should add middleware to the chain', () => {
      const chain = new MiddlewareChain();
      const middleware: QueryMiddleware = vi.fn();

      chain.use(middleware);

      expect(chain.length).toBe(1);
    });

    it('should return this for chaining', () => {
      const chain = new MiddlewareChain();
      const middleware: QueryMiddleware = vi.fn();

      const result = chain.use(middleware);

      expect(result).toBe(chain);
    });

    it('should add multiple middleware in order', () => {
      const chain = new MiddlewareChain();
      const m1: QueryMiddleware = vi.fn();
      const m2: QueryMiddleware = vi.fn();
      const m3: QueryMiddleware = vi.fn();

      chain.use(m1).use(m2).use(m3);

      expect(chain.length).toBe(3);
    });
  });

  describe('remove', () => {
    it('should remove middleware from the chain', () => {
      const chain = new MiddlewareChain();
      const middleware: QueryMiddleware = vi.fn();

      chain.use(middleware);
      chain.remove(middleware);

      expect(chain.length).toBe(0);
    });

    it('should do nothing if middleware not found', () => {
      const chain = new MiddlewareChain();
      const m1: QueryMiddleware = vi.fn();
      const m2: QueryMiddleware = vi.fn();

      chain.use(m1);
      chain.remove(m2);

      expect(chain.length).toBe(1);
    });
  });

  describe('clear', () => {
    it('should remove all middleware', () => {
      const chain = new MiddlewareChain();
      chain.use(vi.fn()).use(vi.fn()).use(vi.fn());

      chain.clear();

      expect(chain.length).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute final handler when no middleware', async () => {
      const chain = new MiddlewareChain();
      const context = createMockContext();
      const finalHandler = vi.fn().mockResolvedValue(createMockResult([{ id: 1 }]));

      const result = await chain.execute(context, finalHandler);

      expect(finalHandler).toHaveBeenCalledWith(context);
      expect(result.result.rows).toHaveLength(1);
    });

    it('should execute middleware in order', async () => {
      const chain = new MiddlewareChain();
      const executionOrder: number[] = [];

      const m1: QueryMiddleware = async (ctx, next) => {
        executionOrder.push(1);
        const result = await next(ctx);
        executionOrder.push(4);
        return result;
      };

      const m2: QueryMiddleware = async (ctx, next) => {
        executionOrder.push(2);
        const result = await next(ctx);
        executionOrder.push(3);
        return result;
      };

      chain.use(m1).use(m2);

      const context = createMockContext();
      const finalHandler = vi.fn().mockResolvedValue(createMockResult());

      await chain.execute(context, finalHandler);

      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });

    it('should allow middleware to modify context', async () => {
      const chain = new MiddlewareChain();

      const m1: QueryMiddleware = async (ctx, next) => {
        ctx.metadata['modified'] = true;
        return next(ctx);
      };

      chain.use(m1);

      const context = createMockContext();
      const finalHandler = vi.fn().mockImplementation((ctx) => {
        expect(ctx.metadata['modified']).toBe(true);
        return createMockResult();
      });

      await chain.execute(context, finalHandler);
    });

    it('should allow middleware to modify result', async () => {
      const chain = new MiddlewareChain();

      const m1: QueryMiddleware = async (ctx, next) => {
        const result = await next(ctx);
        return { ...result, cached: true };
      };

      chain.use(m1);

      const context = createMockContext();
      const finalHandler = vi.fn().mockResolvedValue(createMockResult());

      const result = await chain.execute(context, finalHandler);

      expect(result.cached).toBe(true);
    });

    it('should allow middleware to short-circuit', async () => {
      const chain = new MiddlewareChain();

      const m1: QueryMiddleware = async () => ({
        result: { rows: [{ cached: true }], rowCount: 1, fields: [] },
        duration: 0,
      });

      const m2: QueryMiddleware = vi.fn();

      chain.use(m1).use(m2);

      const context = createMockContext();
      const finalHandler = vi.fn();

      await chain.execute(context, finalHandler);

      expect(m2).not.toHaveBeenCalled();
      expect(finalHandler).not.toHaveBeenCalled();
    });

    it('should propagate errors', async () => {
      const chain = new MiddlewareChain();

      const m1: QueryMiddleware = async () => {
        throw new Error('Middleware error');
      };

      chain.use(m1);

      const context = createMockContext();
      const finalHandler = vi.fn();

      await expect(chain.execute(context, finalHandler)).rejects.toThrow('Middleware error');
    });
  });

  describe('createContext', () => {
    it('should create context with required fields', () => {
      const context = MiddlewareChain.createContext('SELECT 1', []);

      expect(context.sql).toBe('SELECT 1');
      expect(context.params).toEqual([]);
      expect(context.startTime).toBeDefined();
      expect(context.metadata).toEqual({});
    });

    it('should create context with options', () => {
      const options = { timeout: 5000 };
      const context = MiddlewareChain.createContext('SELECT 1', [], options);

      expect(context.options).toBe(options);
    });
  });
});

describe('composeMiddleware', () => {
  it('should compose multiple middleware into one', async () => {
    const executionOrder: number[] = [];

    const m1: QueryMiddleware = async (ctx, next) => {
      executionOrder.push(1);
      return next(ctx);
    };

    const m2: QueryMiddleware = async (ctx, next) => {
      executionOrder.push(2);
      return next(ctx);
    };

    const composed = composeMiddleware(m1, m2);
    const context: QueryMiddlewareContext = {
      sql: 'SELECT 1',
      params: [],
      startTime: Date.now(),
      metadata: {},
    };

    const finalHandler = vi.fn().mockResolvedValue({
      result: { rows: [], rowCount: 0, fields: [] },
      duration: 10,
    });

    await composed(context, finalHandler);

    expect(executionOrder).toEqual([1, 2]);
    expect(finalHandler).toHaveBeenCalled();
  });
});

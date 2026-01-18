import { describe, it, expect, vi, beforeEach } from 'vitest';

import { TimeoutError } from '../../errors';
import { createTimeoutMiddleware, createDeadlineMiddleware } from '../timeout-middleware';

import type { QueryMiddlewareContext } from '../types';

describe('createTimeoutMiddleware', () => {
  let context: QueryMiddlewareContext;

  beforeEach(() => {
    context = {
      sql: 'SELECT * FROM users',
      params: [],
      startTime: Date.now(),
      metadata: {},
    };
  });

  it('should return result when query completes quickly', async () => {
    const middleware = createTimeoutMiddleware({ defaultTimeout: 5000 });
    const next = vi.fn().mockResolvedValue({
      result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
      duration: 100,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toHaveLength(1);
    expect(next).toHaveBeenCalled();
  });

  it('should skip timeout when timeout is 0', async () => {
    context.options = { timeout: 0 };
    const middleware = createTimeoutMiddleware({ defaultTimeout: 5000 });
    const next = vi.fn().mockResolvedValue({
      result: { rows: [], rowCount: 0, fields: [] },
      duration: 10,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toEqual([]);
  });

  it('should skip timeout when timeout is negative', async () => {
    context.options = { timeout: -1 };
    const middleware = createTimeoutMiddleware({ defaultTimeout: 5000 });
    const next = vi.fn().mockResolvedValue({
      result: { rows: [], rowCount: 0, fields: [] },
      duration: 10,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toEqual([]);
  });

  it('should use timeout from context options when available', async () => {
    context.options = { timeout: 5000 };
    const middleware = createTimeoutMiddleware({ defaultTimeout: 10000 });
    const next = vi.fn().mockResolvedValue({
      result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
      duration: 10,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toHaveLength(1);
  });

  it('should update duration in result', async () => {
    const middleware = createTimeoutMiddleware({ defaultTimeout: 5000 });
    const next = vi.fn().mockResolvedValue({
      result: { rows: [], rowCount: 0, fields: [] },
      duration: 0,
    });

    const result = await middleware(context, next);

    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('should throw TimeoutError when query exceeds timeout', async () => {
    const middleware = createTimeoutMiddleware({ defaultTimeout: 10 }); // 10ms timeout
    const next = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                result: { rows: [], rowCount: 0, fields: [] },
                duration: 200,
              }),
            100,
          ),
        ), // 100ms delay
    );

    await expect(middleware(context, next)).rejects.toThrow(TimeoutError);
  });

  it('should store timeout info in metadata when timeout occurs', async () => {
    const middleware = createTimeoutMiddleware({ defaultTimeout: 10 });
    const next = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                result: { rows: [], rowCount: 0, fields: [] },
                duration: 100,
              }),
            100,
          ),
        ),
    );

    try {
      await middleware(context, next);
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError);
    }

    expect(context.metadata['timedOut']).toBe(true);
    expect(context.metadata['timeoutMs']).toBe(10);
  });

  it('should call onTimeout callback when timeout occurs', async () => {
    const onTimeout = vi.fn();
    const middleware = createTimeoutMiddleware({ defaultTimeout: 10, onTimeout });
    const next = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                result: { rows: [], rowCount: 0, fields: [] },
                duration: 100,
              }),
            100,
          ),
        ),
    );

    await expect(middleware(context, next)).rejects.toThrow(TimeoutError);
    expect(onTimeout).toHaveBeenCalledWith(context.sql, expect.any(Number));
  });
});

describe('createDeadlineMiddleware', () => {
  let context: QueryMiddlewareContext;

  beforeEach(() => {
    context = {
      sql: 'SELECT * FROM users',
      params: [],
      startTime: Date.now(),
      metadata: {},
    };
  });

  it('should skip when no deadline is set', async () => {
    const middleware = createDeadlineMiddleware();
    const next = vi.fn().mockResolvedValue({
      result: { rows: [], rowCount: 0, fields: [] },
      duration: 10,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toEqual([]);
  });

  it('should use deadline from getDeadline callback', async () => {
    const now = Date.now();
    const middleware = createDeadlineMiddleware({
      getDeadline: () => now + 5000, // 5 seconds from now
    });
    const next = vi.fn().mockResolvedValue({
      result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
      duration: 10,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toHaveLength(1);
    expect(next).toHaveBeenCalled();
  });

  it('should use deadline from context metadata', async () => {
    context.metadata['deadline'] = Date.now() + 5000; // 5 seconds from now
    const middleware = createDeadlineMiddleware();
    const next = vi.fn().mockResolvedValue({
      result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
      duration: 10,
    });

    const result = await middleware(context, next);

    expect(result.result.rows).toHaveLength(1);
    expect(next).toHaveBeenCalled();
  });

  it('should throw immediately when deadline has passed', async () => {
    context.metadata['deadline'] = Date.now() - 100; // Already passed
    const middleware = createDeadlineMiddleware();
    const next = vi.fn();

    await expect(middleware(context, next)).rejects.toThrow('Deadline exceeded');
    expect(next).not.toHaveBeenCalled();
  });
});

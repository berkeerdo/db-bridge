import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { createRetryMiddleware, createCircuitBreakerMiddleware } from '../retry-middleware';

import type { QueryMiddlewareContext, QueryMiddlewareResult } from '../types';

describe('retry-middleware', () => {
  let context: QueryMiddlewareContext;

  beforeEach(() => {
    vi.useFakeTimers();
    context = {
      sql: 'SELECT * FROM users',
      params: [],
      startTime: Date.now(),
      metadata: {},
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createRetryMiddleware', () => {
    it('should return result on first successful attempt', async () => {
      const middleware = createRetryMiddleware();
      const next = vi.fn().mockResolvedValue({
        result: { rows: [{ id: 1 }], rowCount: 1, fields: [] },
        duration: 10,
      });

      const result = await middleware(context, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(result.retries).toBeUndefined();
    });

    it('should retry on transient errors', async () => {
      const middleware = createRetryMiddleware({ maxRetries: 3 });
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      const promise = middleware(context, next);

      // Run all pending timers to completion
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(next).toHaveBeenCalledTimes(3);
      expect(result.retries).toBe(2);
    });

    it('should not retry on non-transient errors', async () => {
      const middleware = createRetryMiddleware({ maxRetries: 3 });
      const next = vi.fn().mockRejectedValue(new Error('Syntax error in SQL'));

      await expect(middleware(context, next)).rejects.toThrow('Syntax error in SQL');
      expect(next).toHaveBeenCalledTimes(1);
    });

    it('should respect maxRetries', async () => {
      vi.useRealTimers(); // Use real timers to avoid timing issues

      const middleware = createRetryMiddleware({
        maxRetries: 2,
        baseDelay: 1, // Use minimal delay for fast tests
        maxDelay: 5,
      });
      const next = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

      let caughtError: Error | null = null;
      try {
        await middleware(context, next);
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError?.message).toBe('ECONNRESET');
      expect(next).toHaveBeenCalledTimes(3); // Initial + 2 retries

      vi.useFakeTimers(); // Restore fake timers
    });

    it('should use exponential backoff', async () => {
      const middleware = createRetryMiddleware({
        maxRetries: 3,
        baseDelay: 100,
        backoffMultiplier: 2,
      });

      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      const promise = middleware(context, next);

      // Run all pending timers to completion
      await vi.runAllTimersAsync();

      await promise;
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('should cap delay at maxDelay', async () => {
      const middleware = createRetryMiddleware({
        maxRetries: 5,
        baseDelay: 1000,
        maxDelay: 2000,
        backoffMultiplier: 4,
      });

      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      const promise = middleware(context, next);

      // Run all pending timers to completion
      await vi.runAllTimersAsync();

      await promise;
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('should store retry info in metadata', async () => {
      const middleware = createRetryMiddleware({ maxRetries: 2 });
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      const promise = middleware(context, next);
      await vi.runAllTimersAsync();
      await promise;

      expect(context.metadata['retryAttempt']).toBe(1);
      expect(context.metadata['lastError']).toBe('ECONNRESET');
    });

    it('should retry on deadlock errors', async () => {
      const middleware = createRetryMiddleware({ maxRetries: 1 });
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('Deadlock found when trying to get lock'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      const promise = middleware(context, next);
      await vi.runAllTimersAsync();
      await promise;

      expect(next).toHaveBeenCalledTimes(2);
    });

    it('should use custom retry condition', async () => {
      const middleware = createRetryMiddleware({
        maxRetries: 2,
        retryOn: (error) => error.message.includes('CUSTOM_ERROR'),
      });

      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('CUSTOM_ERROR'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      const promise = middleware(context, next);
      await vi.runAllTimersAsync();
      await promise;

      expect(next).toHaveBeenCalledTimes(2);
    });
  });

  describe('createCircuitBreakerMiddleware', () => {
    it('should allow requests in closed state', async () => {
      const middleware = createCircuitBreakerMiddleware();
      const next = vi.fn().mockResolvedValue({
        result: { rows: [], rowCount: 0, fields: [] },
        duration: 10,
      });

      const result = await middleware(context, next);

      expect(result.result.rows).toEqual([]);
      expect(next).toHaveBeenCalled();
    });

    it('should open circuit after failure threshold', async () => {
      const middleware = createCircuitBreakerMiddleware({ failureThreshold: 3 });
      const next = vi.fn().mockRejectedValue(new Error('Failed'));

      // Trigger 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(middleware(context, next)).rejects.toThrow('Failed');
      }

      // Circuit should now be open
      await expect(middleware(context, next)).rejects.toThrow('Circuit breaker is open');
      expect(next).toHaveBeenCalledTimes(3); // Not called on 4th attempt
    });

    it('should reset failures on success', async () => {
      const middleware = createCircuitBreakerMiddleware({ failureThreshold: 3 });
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'));

      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await middleware(context, next); // Success resets
      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await expect(middleware(context, next)).rejects.toThrow('Failed');

      // Circuit should still be closed (failures reset)
      expect(next).toHaveBeenCalledTimes(5);
    });

    it('should transition to half-open after reset timeout', async () => {
      const middleware = createCircuitBreakerMiddleware({
        failureThreshold: 2,
        resetTimeout: 1000,
      });
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      // Open the circuit
      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await expect(middleware(context, next)).rejects.toThrow('Failed');

      // Circuit is open
      await expect(middleware(context, next)).rejects.toThrow('Circuit breaker is open');

      // Wait for reset timeout
      await vi.advanceTimersByTimeAsync(1000);

      // Should be half-open now, allow one request
      await middleware(context, next);

      expect(next).toHaveBeenCalledTimes(3);
    });

    it('should close circuit after successful half-open requests', async () => {
      const middleware = createCircuitBreakerMiddleware({
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenRequests: 2,
      });

      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        })
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        })
        .mockResolvedValueOnce({
          result: { rows: [], rowCount: 0, fields: [] },
          duration: 10,
        });

      // Open the circuit
      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await expect(middleware(context, next)).rejects.toThrow('Failed');

      // Wait for reset timeout
      await vi.advanceTimersByTimeAsync(1000);

      // Half-open: need 2 successful requests
      await middleware(context, next);
      await middleware(context, next);

      // Circuit should be closed now
      await middleware(context, next);

      expect(next).toHaveBeenCalledTimes(5);
    });

    it('should reopen circuit on failure in half-open state', async () => {
      const middleware = createCircuitBreakerMiddleware({
        failureThreshold: 2,
        resetTimeout: 1000,
      });

      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed again'));

      // Open the circuit
      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await expect(middleware(context, next)).rejects.toThrow('Failed');

      // Wait for reset timeout
      await vi.advanceTimersByTimeAsync(1000);

      // Half-open: failure should reopen
      await expect(middleware(context, next)).rejects.toThrow('Failed again');

      // Circuit should be open again
      await expect(middleware(context, next)).rejects.toThrow('Circuit breaker is open');
    });

    it('should store circuit state in metadata', async () => {
      const middleware = createCircuitBreakerMiddleware({ failureThreshold: 2 });
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'));

      await expect(middleware(context, next)).rejects.toThrow('Failed');
      await expect(middleware(context, next)).rejects.toThrow('Failed');

      expect(context.metadata['circuitState']).toBe('open');
      expect(context.metadata['failures']).toBe(2);
    });
  });
});

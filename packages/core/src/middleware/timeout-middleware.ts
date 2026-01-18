/**
 * Timeout Middleware
 *
 * Enforces query execution time limits.
 * Throws TimeoutError if query exceeds the configured timeout.
 *
 * @example
 * ```typescript
 * const middleware = createTimeoutMiddleware({
 *   defaultTimeout: 30000, // 30 seconds
 *   onTimeout: (sql, elapsed) => {
 *     console.warn(`Query timed out after ${elapsed}ms: ${sql}`);
 *   },
 * });
 * ```
 */

import { TimeoutError } from '../errors';

import type {
  QueryMiddleware,
  QueryMiddlewareContext,
  QueryMiddlewareResult,
  NextMiddleware,
  TimeoutMiddlewareOptions,
} from './types';

/**
 * Create a timeout middleware with the given options
 */
export function createTimeoutMiddleware<T = unknown>(
  options: TimeoutMiddlewareOptions = {},
): QueryMiddleware<T> {
  const { defaultTimeout = 30_000, onTimeout } = options;

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    // Get timeout from options or use default
    const timeout = context.options?.timeout ?? defaultTimeout;

    // If timeout is 0 or negative, skip timeout handling
    if (timeout <= 0) {
      return next(context);
    }

    // Create abort controller for cancellation
    const controller = new AbortController();
    let timeoutId: NodeJS.Timeout | undefined;

    // Create timeout promise
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        const elapsed = Date.now() - context.startTime;

        // Call timeout callback if provided
        if (onTimeout) {
          try {
            onTimeout(context.sql, elapsed);
          } catch {
            // Ignore callback errors
          }
        }

        // Store timeout info in context
        context.metadata['timedOut'] = true;
        context.metadata['timeoutMs'] = timeout;
        context.metadata['elapsedMs'] = elapsed;

        reject(
          new TimeoutError(`Query timed out after ${elapsed}ms (limit: ${timeout}ms)`, elapsed),
        );
      }, timeout);
    });

    try {
      // Race between query and timeout
      const result = await Promise.race([next(context), timeoutPromise]);

      // Store timing in result
      result.duration = Date.now() - context.startTime;

      return result;
    } finally {
      // Clean up timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };
}

/**
 * Create a deadline middleware
 * Similar to timeout but uses absolute deadline instead of relative timeout
 */
export function createDeadlineMiddleware<T = unknown>(
  options: {
    getDeadline?: (context: QueryMiddlewareContext) => number | undefined;
  } = {},
): QueryMiddleware<T> {
  const { getDeadline } = options;

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    // Get deadline from options or context
    const deadline = getDeadline?.(context) ?? (context.metadata['deadline'] as number | undefined);

    // If no deadline, skip
    if (!deadline) {
      return next(context);
    }

    const now = Date.now();
    const remainingTime = deadline - now;

    // Check if deadline already passed
    if (remainingTime <= 0) {
      throw new TimeoutError(
        `Deadline exceeded: deadline was ${new Date(deadline).toISOString()}`,
        -remainingTime,
      );
    }

    // Use timeout middleware with remaining time
    const timeoutMiddleware = createTimeoutMiddleware<T>({
      defaultTimeout: remainingTime,
    });

    return timeoutMiddleware(context, next);
  };
}

/**
 * Retry Middleware
 *
 * Automatically retries failed queries with exponential backoff.
 * Supports configurable retry conditions and delays.
 *
 * @example
 * ```typescript
 * const middleware = createRetryMiddleware({
 *   maxRetries: 3,
 *   baseDelay: 100,
 *   retryOn: (error) => error.message.includes('ECONNRESET'),
 * });
 * ```
 */

import type {
  QueryMiddleware,
  QueryMiddlewareContext,
  QueryMiddlewareResult,
  NextMiddleware,
  RetryMiddlewareOptions,
} from './types';

/**
 * Default retry condition - retry on transient errors
 */
function defaultRetryCondition(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Connection errors
  if (
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('etimedout') ||
    message.includes('epipe') ||
    message.includes('connection lost') ||
    message.includes('connection closed')
  ) {
    return true;
  }

  // Deadlock errors
  if (
    message.includes('deadlock') ||
    message.includes('lock wait timeout') ||
    message.includes('could not serialize access')
  ) {
    return true;
  }

  // Server temporarily unavailable
  if (
    message.includes('server has gone away') ||
    message.includes('too many connections') ||
    message.includes('max_connections')
  ) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  maxDelay: number,
  multiplier: number,
): number {
  // Exponential backoff
  const exponentialDelay = baseDelay * Math.pow(multiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  // Add jitter (±25%)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);

  return Math.floor(cappedDelay + jitter);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a retry middleware with the given options
 */
export function createRetryMiddleware<T = unknown>(
  options: RetryMiddlewareOptions = {},
): QueryMiddleware<T> {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 5000,
    retryOn = defaultRetryCondition,
    backoffMultiplier = 2,
  } = options;

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    let lastError: Error | undefined;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        const result = await next(context);

        // Track retry count in result
        if (attempts > 0) {
          result.retries = attempts;
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        attempts++;

        // Check if we should retry
        if (attempts > maxRetries || !retryOn(lastError)) {
          throw lastError;
        }

        // Calculate and wait for backoff delay
        const delay = calculateDelay(attempts - 1, baseDelay, maxDelay, backoffMultiplier);

        // Store retry info in context metadata
        context.metadata['retryAttempt'] = attempts;
        context.metadata['retryDelay'] = delay;
        context.metadata['lastError'] = lastError.message;

        await sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw lastError || new Error('Retry failed');
  };
}

/**
 * Create a circuit breaker middleware
 * Prevents cascading failures by temporarily blocking requests
 */
export function createCircuitBreakerMiddleware<T = unknown>(
  options: {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenRequests?: number;
  } = {},
): QueryMiddleware<T> {
  const { failureThreshold = 5, resetTimeout = 30_000, halfOpenRequests = 1 } = options;

  let failures = 0;
  let lastFailureTime = 0;
  let state: 'closed' | 'open' | 'half-open' = 'closed';
  let halfOpenSuccesses = 0;

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    // Check circuit state
    if (state === 'open') {
      const now = Date.now();
      if (now - lastFailureTime >= resetTimeout) {
        state = 'half-open';
        halfOpenSuccesses = 0;
      } else {
        throw new Error(
          `Circuit breaker is open. Retry after ${Math.ceil((resetTimeout - (now - lastFailureTime)) / 1000)}s`,
        );
      }
    }

    try {
      const result = await next(context);

      // Success - update circuit state
      if (state === 'half-open') {
        halfOpenSuccesses++;
        if (halfOpenSuccesses >= halfOpenRequests) {
          state = 'closed';
          failures = 0;
        }
      } else {
        failures = 0;
      }

      return result;
    } catch (error) {
      failures++;
      lastFailureTime = Date.now();

      if (state === 'half-open' || failures >= failureThreshold) {
        state = 'open';
      }

      context.metadata['circuitState'] = state;
      context.metadata['failures'] = failures;

      throw error;
    }
  };
}

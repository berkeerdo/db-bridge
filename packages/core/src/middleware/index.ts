/**
 * Middleware Module
 *
 * Provides middleware pattern for cross-cutting concerns:
 * - Caching: Automatic query result caching
 * - Retry: Automatic retry with exponential backoff
 * - Timeout: Query execution time limits
 * - Logging: Query execution logging
 * - Circuit Breaker: Prevents cascading failures
 *
 * @module middleware
 */

// Types
export * from './types';

// Chain
export { MiddlewareChain, composeMiddleware } from './middleware-chain';

// Middleware factories
export { createCacheMiddleware, createCacheInvalidationMiddleware } from './cache-middleware';
export { createRetryMiddleware, createCircuitBreakerMiddleware } from './retry-middleware';
export { createTimeoutMiddleware, createDeadlineMiddleware } from './timeout-middleware';
export {
  createLoggingMiddleware,
  createMetricsMiddleware,
  type MiddlewareQueryMetrics,
} from './logging-middleware';

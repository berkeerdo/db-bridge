/**
 * Middleware Types
 *
 * Type definitions for the middleware pattern.
 */

import type { QueryResult, QueryOptions } from '../types';

/**
 * Context passed through the middleware chain
 */
export interface QueryMiddlewareContext {
  sql: string;
  params: unknown[];
  options?: QueryOptions;
  startTime: number;
  metadata: Record<string, unknown>;
}

/**
 * Result returned from middleware
 */
export interface QueryMiddlewareResult<T = unknown> {
  result: QueryResult<T>;
  cached?: boolean;
  retries?: number;
  duration?: number;
}

/**
 * Next function to call the next middleware in chain
 */
export type NextMiddleware<T = unknown> = (
  context: QueryMiddlewareContext,
) => Promise<QueryMiddlewareResult<T>>;

/**
 * Middleware function signature
 */
export type QueryMiddleware<T = unknown> = (
  context: QueryMiddlewareContext,
  next: NextMiddleware<T>,
) => Promise<QueryMiddlewareResult<T>>;

/**
 * Middleware configuration
 */
export interface MiddlewareConfig {
  name: string;
  enabled?: boolean;
  order?: number;
}

/**
 * Cache middleware specific options
 */
export interface CacheMiddlewareOptions {
  adapter: MiddlewareCacheAdapter;
  defaultTTL?: number;
  keyPrefix?: string;
  shouldCache?: (sql: string, params: unknown[]) => boolean;
}

/**
 * Retry middleware specific options
 */
export interface RetryMiddlewareOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOn?: (error: Error) => boolean;
  backoffMultiplier?: number;
}

/**
 * Timeout middleware specific options
 */
export interface TimeoutMiddlewareOptions {
  defaultTimeout?: number;
  onTimeout?: (sql: string, elapsed: number) => void;
}

/**
 * Logging middleware specific options
 */
export interface LoggingMiddlewareOptions {
  logger?: MiddlewareLogger;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  logParams?: boolean;
  logResults?: boolean;
  slowQueryThreshold?: number;
}

/**
 * Simple logger interface
 */
export interface MiddlewareLogger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

/**
 * Cache adapter interface for middleware
 */
export interface MiddlewareCacheAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

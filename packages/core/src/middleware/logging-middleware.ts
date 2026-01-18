/**
 * Logging Middleware
 *
 * Logs query execution details for debugging and monitoring.
 * Supports configurable log levels and slow query detection.
 *
 * @example
 * ```typescript
 * const middleware = createLoggingMiddleware({
 *   logger: console,
 *   logLevel: 'debug',
 *   slowQueryThreshold: 1000, // Log slow queries > 1s
 * });
 * ```
 */

import type {
  QueryMiddleware,
  QueryMiddlewareContext,
  QueryMiddlewareResult,
  NextMiddleware,
  LoggingMiddlewareOptions,
  MiddlewareLogger,
} from './types';

/**
 * Default console logger
 */
/* eslint-disable no-console */
const consoleLogger: MiddlewareLogger = {
  debug: (msg, ...args) => console.debug(`[db-bridge] ${msg}`, ...args),
  info: (msg, ...args) => console.info(`[db-bridge] ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`[db-bridge] ${msg}`, ...args),
  error: (msg, ...args) => console.error(`[db-bridge] ${msg}`, ...args),
};
/* eslint-enable no-console */

/**
 * Truncate long SQL for logging
 */
function truncateSql(sql: string, maxLength = 200): string {
  if (sql.length <= maxLength) {
    return sql;
  }
  return `${sql.slice(0, maxLength)}...`;
}

/**
 * Format parameters for logging (hide sensitive data)
 */
function formatParams(params: unknown[], maxLength = 100): string {
  const str = JSON.stringify(params);
  if (str.length <= maxLength) {
    return str;
  }
  return `${str.slice(0, maxLength)}...`;
}

/**
 * Create a logging middleware with the given options
 */
export function createLoggingMiddleware<T = unknown>(
  options: LoggingMiddlewareOptions = {},
): QueryMiddleware<T> {
  const {
    logger = consoleLogger,
    logLevel = 'debug',
    logParams = false,
    logResults = false,
    slowQueryThreshold = 1000,
  } = options;

  const log = logger[logLevel];

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    const truncatedSql = truncateSql(context.sql);
    const startTime = Date.now();

    // Log query start
    if (logParams) {
      log(`Executing query: ${truncatedSql}`, formatParams(context.params));
    } else {
      log(`Executing query: ${truncatedSql}`);
    }

    try {
      const result = await next(context);
      const duration = Date.now() - startTime;

      // Check for slow query
      if (duration >= slowQueryThreshold) {
        logger.warn(`Slow query detected (${duration}ms): ${truncatedSql}`, {
          duration,
          rowCount: result.result.rowCount,
        });
      }

      // Log query completion
      const logMsg = `Query completed in ${duration}ms (${result.result.rowCount} rows)`;
      if (logResults && result.result.rows.length > 0) {
        log(logMsg, { rows: result.result.rows.slice(0, 5) }); // Log first 5 rows
      } else {
        log(logMsg);
      }

      // Add cached flag if present
      if (result.cached) {
        log(`Query served from cache`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Query failed after ${duration}ms: ${(error as Error).message}`, {
        sql: truncatedSql,
        error,
      });
      throw error;
    }
  };
}

/**
 * Create a metrics middleware
 * Collects query metrics without logging
 */
export function createMetricsMiddleware<T = unknown>(
  options: {
    onQuery?: (metrics: MiddlewareQueryMetrics) => void;
    buckets?: number[];
  } = {},
): QueryMiddleware<T> {
  const { onQuery, buckets = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10_000] } = options;

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    const startTime = Date.now();
    let success = false;
    let result: QueryMiddlewareResult<T> | undefined;

    try {
      result = await next(context);
      success = true;
      return result;
    } finally {
      const duration = Date.now() - startTime;

      // Determine histogram bucket
      const bucket = buckets.find((b) => duration <= b) ?? Number.POSITIVE_INFINITY;

      // Build metrics object
      const metrics: MiddlewareQueryMetrics = {
        sql: context.sql,
        duration,
        success,
        cached: result?.cached ?? false,
        rowCount: result?.result?.rowCount ?? 0,
        retries: result?.retries ?? 0,
        bucket,
        timestamp: new Date(),
      };

      // Store in context metadata
      context.metadata['metrics'] = metrics;

      // Call metrics callback if provided
      if (onQuery) {
        try {
          onQuery(metrics);
        } catch {
          // Ignore callback errors
        }
      }
    }
  };
}

/**
 * Query metrics interface
 */
export interface MiddlewareQueryMetrics {
  sql: string;
  duration: number;
  success: boolean;
  cached: boolean;
  rowCount: number;
  retries: number;
  bucket: number;
  timestamp: Date;
}

/**
 * Cache Middleware
 *
 * Caches query results to improve performance.
 * Supports configurable TTL and cache key generation.
 *
 * @example
 * ```typescript
 * const middleware = createCacheMiddleware({
 *   adapter: redisCache,
 *   defaultTTL: 60000, // 1 minute
 *   keyPrefix: 'db:',
 * });
 * ```
 */

import { createHash } from 'node:crypto';

import type {
  QueryMiddleware,
  QueryMiddlewareContext,
  QueryMiddlewareResult,
  NextMiddleware,
  CacheMiddlewareOptions,
  MiddlewareCacheAdapter,
} from './types';

/**
 * Default function to determine if a query should be cached
 */
function defaultShouldCache(sql: string): boolean {
  const normalizedSql = sql.trim().toUpperCase();
  return (
    normalizedSql.startsWith('SELECT') ||
    normalizedSql.startsWith('SHOW') ||
    normalizedSql.startsWith('DESCRIBE') ||
    normalizedSql.startsWith('EXPLAIN')
  );
}

/**
 * Generate a cache key from SQL and params
 */
function generateCacheKey(prefix: string, sql: string, params: unknown[]): string {
  const hash = createHash('sha256');
  hash.update(sql);
  hash.update(JSON.stringify(params));
  return `${prefix}${hash.digest('hex').slice(0, 16)}`;
}

/**
 * Create a cache middleware with the given options
 */
export function createCacheMiddleware<T = unknown>(
  options: CacheMiddlewareOptions,
): QueryMiddleware<T> {
  const {
    adapter,
    defaultTTL = 60_000,
    keyPrefix = 'qcache:',
    shouldCache = defaultShouldCache,
  } = options;

  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    // Check if caching is explicitly disabled
    if (context.options?.cache === false) {
      return next(context);
    }

    // Check if query should be cached
    if (!shouldCache(context.sql, context.params)) {
      return next(context);
    }

    // Determine cache key
    const cacheOptions = typeof context.options?.cache === 'object' ? context.options.cache : {};
    const cacheKey = cacheOptions.key || generateCacheKey(keyPrefix, context.sql, context.params);

    // Try to get from cache
    try {
      const cached = await adapter.get<QueryMiddlewareResult<T>>(cacheKey);
      if (cached) {
        return {
          ...cached,
          cached: true,
          duration: Date.now() - context.startTime,
        };
      }
    } catch {
      // Ignore cache errors, proceed with query
    }

    // Execute the query
    const result = await next(context);

    // Cache the result if it has data
    if (result.result.rows.length > 0) {
      const ttl = cacheOptions.ttl || defaultTTL;
      try {
        await adapter.set(cacheKey, result, ttl);
      } catch {
        // Ignore cache errors
      }
    }

    return {
      ...result,
      cached: false,
    };
  };
}

/**
 * Create cache invalidation middleware
 * Invalidates cache entries when write operations occur
 */
export function createCacheInvalidationMiddleware<T = unknown>(
  _adapter: MiddlewareCacheAdapter,
  _keyPrefix = 'qcache:',
): QueryMiddleware<T> {
  return async (
    context: QueryMiddlewareContext,
    next: NextMiddleware<T>,
  ): Promise<QueryMiddlewareResult<T>> => {
    const result = await next(context);

    // Check if this is a write operation
    const normalizedSql = context.sql.trim().toUpperCase();
    const isWrite =
      normalizedSql.startsWith('INSERT') ||
      normalizedSql.startsWith('UPDATE') ||
      normalizedSql.startsWith('DELETE') ||
      normalizedSql.startsWith('TRUNCATE');

    if (isWrite) {
      // Extract table name from query
      const tableName = extractTableName(context.sql);
      if (tableName) {
        // Mark for invalidation in metadata
        context.metadata['invalidatedTable'] = tableName;
        context.metadata['cacheInvalidated'] = true;
      }
    }

    return result;
  };
}

/**
 * Extract table name from SQL query
 */
function extractTableName(sql: string): string | null {
  const normalizedSql = sql.trim().toUpperCase();

  // INSERT INTO table_name
  const insertMatch = normalizedSql.match(/insert\s+into\s+["'`]?(\w+)["'`]?/i);
  if (insertMatch) {
    return insertMatch[1] || null;
  }

  // UPDATE table_name
  const updateMatch = normalizedSql.match(/update\s+["'`]?(\w+)["'`]?/i);
  if (updateMatch) {
    return updateMatch[1] || null;
  }

  // DELETE FROM table_name
  const deleteMatch = normalizedSql.match(/delete\s+from\s+["'`]?(\w+)["'`]?/i);
  if (deleteMatch) {
    return deleteMatch[1] || null;
  }

  // TRUNCATE TABLE table_name
  const truncateMatch = normalizedSql.match(/truncate\s+(?:table\s+)?["'`]?(\w+)["'`]?/i);
  if (truncateMatch) {
    return truncateMatch[1] || null;
  }

  return null;
}

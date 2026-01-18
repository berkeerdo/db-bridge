/**
 * Query Builder Factory
 *
 * Factory for creating query builder instances with proper context.
 * This is the main entry point for the query builder API.
 *
 * @example
 * ```typescript
 * const qb = createQueryBuilder({
 *   dialect: MySQLDialect,
 *   executor: mysqlAdapter,
 *   crypto: cryptoProvider, // optional
 * });
 *
 * // Select
 * const users = await qb.select()
 *   .from('users')
 *   .where('active', true)
 *   .get();
 *
 * // Insert
 * const id = await qb.insert()
 *   .into('users')
 *   .values({ name: 'John' })
 *   .getInsertId();
 *
 * // Update
 * await qb.update()
 *   .table('users')
 *   .set({ name: 'Jane' })
 *   .where('id', 1)
 *   .execute();
 *
 * // Delete
 * await qb.delete()
 *   .from('users')
 *   .where('id', 1)
 *   .execute();
 * ```
 */

import { DeleteBuilder } from './delete-builder';
import { InsertBuilder } from './insert-builder';
import { QueryContext } from './query-context';
import { SelectBuilder } from './select-builder';
import { UpdateBuilder } from './update-builder';

import type { CryptoProvider } from '../crypto/crypto';
import type { SQLDialect } from '../dialect/sql-dialect';
import type { CacheAdapter } from '../interfaces';
import type { QueryExecutor } from './query-context';

/**
 * Cache configuration for query builder
 *
 * IMPORTANT: Cache is OPT-IN per query by default.
 * Use .cache() method on queries you want to cache.
 *
 * @example
 * ```typescript
 * // Configure cache (uses Redis - recommended for production)
 * const qb = createModularQueryBuilder({
 *   dialect,
 *   executor,
 *   cache: {
 *     adapter: redisAdapter,
 *     defaultTTL: 300,        // 5 minutes default
 *     maxTTL: 3600,           // Max 1 hour
 *     warnOnLargeResult: 1000 // Warn if result > 1000 rows
 *   }
 * });
 *
 * // Cache specific queries (opt-in)
 * const users = await qb.select().from('users').cache(60).get();
 * ```
 *
 * WARNING: Avoid using in-memory cache in production with high traffic.
 * Use Redis or another distributed cache instead.
 */
export interface QueryBuilderCacheConfig {
  /** Cache adapter (Redis recommended for production, Memory for dev only) */
  adapter: CacheAdapter;

  /** Default TTL in seconds (default: 300 = 5 minutes) */
  defaultTTL?: number;

  /** Maximum TTL in seconds - prevents accidental long caching (default: 3600 = 1 hour) */
  maxTTL?: number;

  /** Cache key prefix (default: 'qb:') */
  prefix?: string;

  /**
   * Enable caching globally for all SELECT queries (default: false)
   * WARNING: Not recommended! Use .cache() per query instead.
   */
  global?: boolean;

  /**
   * Warn if result row count exceeds this number (default: 1000)
   * Large results shouldn't be cached - use pagination instead
   */
  warnOnLargeResult?: number;

  /**
   * Skip caching if result exceeds this many rows (default: 10000)
   * Prevents memory issues from caching huge result sets
   */
  maxCacheableRows?: number;

  /**
   * Logger for cache warnings (optional)
   */
  logger?: { warn: (message: string) => void };
}

export interface ModularQueryBuilderOptions {
  dialect: SQLDialect;
  executor: QueryExecutor;
  crypto?: CryptoProvider;
  /** Cache configuration (optional) */
  cache?: QueryBuilderCacheConfig;
}

export interface ModularQueryBuilder {
  /**
   * Create a new SELECT query builder
   */
  select<T = unknown>(...columns: string[]): SelectBuilder<T>;

  /**
   * Create a new INSERT query builder
   */
  insert<T = unknown>(): InsertBuilder<T>;

  /**
   * Create a new UPDATE query builder
   */
  update<T = unknown>(): UpdateBuilder<T>;

  /**
   * Create a new DELETE query builder
   */
  delete<T = unknown>(): DeleteBuilder<T>;

  /**
   * Get the query context
   */
  getContext(): QueryContext;

  /**
   * Execute a raw SQL query
   */
  raw<T = unknown>(sql: string, bindings?: unknown[]): Promise<T[]>;

  /**
   * Execute a raw SQL statement
   */
  rawExecute(sql: string, bindings?: unknown[]): Promise<{ affectedRows: number }>;

  /**
   * Start a table query (shorthand)
   */
  table<T = unknown>(name: string, alias?: string): SelectBuilder<T>;
}

/**
 * Create a query builder instance with the provided options
 */
export function createModularQueryBuilder(
  options: ModularQueryBuilderOptions,
): ModularQueryBuilder {
  // Build cache config if provided with safe defaults
  const cacheConfig = options.cache
    ? {
        adapter: options.cache.adapter,
        defaultTTL: options.cache.defaultTTL ?? 300, // 5 minutes default
        maxTTL: options.cache.maxTTL ?? 3600, // Max 1 hour
        prefix: options.cache.prefix ?? 'qb:',
        global: options.cache.global ?? false, // Opt-in by default
        warnOnLargeResult: options.cache.warnOnLargeResult ?? 1000,
        maxCacheableRows: options.cache.maxCacheableRows ?? 10_000,
        logger: options.cache.logger,
      }
    : undefined;

  const context = new QueryContext(options.dialect, options.executor, options.crypto, cacheConfig);

  return {
    select<T = unknown>(...columns: string[]): SelectBuilder<T> {
      const builder = new SelectBuilder<T>(context);
      if (columns.length > 0) {
        builder.select(...columns);
      }
      return builder;
    },

    insert<T = unknown>(): InsertBuilder<T> {
      return new InsertBuilder<T>(context);
    },

    update<T = unknown>(): UpdateBuilder<T> {
      return new UpdateBuilder<T>(context);
    },

    delete<T = unknown>(): DeleteBuilder<T> {
      return new DeleteBuilder<T>(context);
    },

    getContext(): QueryContext {
      return context;
    },

    async raw<T = unknown>(sql: string, bindings: unknown[] = []): Promise<T[]> {
      const result = await context.executeQuery<T>(sql, bindings);
      return result.rows;
    },

    async rawExecute(sql: string, bindings: unknown[] = []): Promise<{ affectedRows: number }> {
      const result = await context.executeWrite(sql, bindings);
      return { affectedRows: result.affectedRows };
    },

    table<T = unknown>(name: string, alias?: string): SelectBuilder<T> {
      return new SelectBuilder<T>(context).from(name, alias);
    },
  };
}

/**
 * Type helper for extracting row type from a query builder
 */
export type InferQueryResult<T> = T extends SelectBuilder<infer R> ? R : never;

/**
 * Query Context
 *
 * Shared context for all query builders containing:
 * - Database dialect
 * - Query executor
 * - Crypto provider (optional)
 * - Cache config (optional)
 *
 * This separates execution concerns from query building.
 */

import { createHash } from 'node:crypto';

import type { CryptoProvider } from '../crypto/crypto';
import type { SQLDialect } from '../dialect/sql-dialect';
import type { CacheAdapter } from '../interfaces';
import type { QueryResult } from '../types';

/**
 * Execute result for write operations (INSERT/UPDATE/DELETE)
 */
export interface ExecuteResult {
  affectedRows: number;
  insertId?: number | bigint;
  changedRows?: number;
}

/**
 * Query executor interface - implemented by adapters
 */
export interface QueryExecutor {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  execute(sql: string, params?: unknown[]): Promise<ExecuteResult>;
}

/**
 * Cache configuration for QueryContext
 */
export interface QueryContextCacheConfig {
  adapter: CacheAdapter;
  defaultTTL: number;
  maxTTL: number;
  prefix: string;
  global: boolean;
  warnOnLargeResult: number;
  maxCacheableRows: number;
  logger?: { warn: (message: string) => void };
}

// Re-export for convenience

/**
 * Query context containing all dependencies for query execution
 */
export class QueryContext {
  public readonly cacheConfig?: QueryContextCacheConfig;

  constructor(
    public readonly dialect: SQLDialect,
    public readonly executor: QueryExecutor,
    public readonly crypto?: CryptoProvider,
    cacheConfig?: QueryContextCacheConfig,
  ) {
    this.cacheConfig = cacheConfig;
  }

  /**
   * Execute a SELECT query
   */
  async executeQuery<T>(sql: string, bindings: unknown[]): Promise<QueryResult<T>> {
    this.dialect.resetParameters();
    return this.executor.query<T>(sql, bindings);
  }

  /**
   * Execute a write query (INSERT/UPDATE/DELETE)
   */
  async executeWrite(sql: string, bindings: unknown[]): Promise<ExecuteResult> {
    this.dialect.resetParameters();
    const result = await this.executor.execute(sql, bindings);
    return result;
  }

  /**
   * Encrypt a value if crypto provider is available
   */
  encrypt(value: string): string {
    if (!this.crypto) {
      throw new Error('Crypto provider not configured');
    }
    return this.crypto.encryptField(value);
  }

  /**
   * Decrypt a value if crypto provider is available
   */
  decrypt(value: string): string {
    if (!this.crypto) {
      throw new Error('Crypto provider not configured');
    }
    const decrypted = this.crypto.decryptField(value);
    return typeof decrypted === 'string' ? decrypted : JSON.stringify(decrypted);
  }

  /**
   * Check if crypto is available
   */
  get hasCrypto(): boolean {
    return this.crypto !== undefined;
  }

  /**
   * Check if cache is available
   */
  get hasCache(): boolean {
    return this.cacheConfig !== undefined;
  }

  /**
   * Generate cache key from SQL and bindings
   */
  generateCacheKey(sql: string, bindings: unknown[]): string {
    const prefix = this.cacheConfig?.prefix || 'qb:';
    const hash = createHash('sha256')
      .update(sql + JSON.stringify(bindings))
      .digest('hex')
      .slice(0, 16);
    return `${prefix}${hash}`;
  }

  /**
   * Execute a cached SELECT query
   *
   * Safety measures:
   * - Enforces maxTTL limit
   * - Skips caching for large result sets
   * - Warns on results exceeding threshold
   */
  async executeCachedQuery<T>(
    sql: string,
    bindings: unknown[],
    options?: { ttl?: number; key?: string },
  ): Promise<QueryResult<T>> {
    if (!this.cacheConfig) {
      // No cache configured, execute directly
      return this.executeQuery<T>(sql, bindings);
    }

    const cacheKey = options?.key || this.generateCacheKey(sql, bindings);

    // Enforce TTL limits
    let ttl = options?.ttl || this.cacheConfig.defaultTTL;
    if (ttl > this.cacheConfig.maxTTL) {
      ttl = this.cacheConfig.maxTTL;
      this.cacheConfig.logger?.warn(
        `Cache TTL ${options?.ttl}s exceeds maxTTL ${this.cacheConfig.maxTTL}s, using maxTTL`,
      );
    }

    // Try to get from cache
    const cached = await this.cacheConfig.adapter.get<QueryResult<T>>(cacheKey);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // Execute query
    const result = await this.executeQuery<T>(sql, bindings);

    // Safety: Skip caching for large result sets
    if (result.rowCount > this.cacheConfig.maxCacheableRows) {
      this.cacheConfig.logger?.warn(
        `Skipping cache for query with ${result.rowCount} rows (max: ${this.cacheConfig.maxCacheableRows}). Use pagination instead.`,
      );
      return result;
    }

    // Warn on large results
    if (result.rowCount > this.cacheConfig.warnOnLargeResult) {
      this.cacheConfig.logger?.warn(
        `Caching ${result.rowCount} rows. Consider using pagination for better performance.`,
      );
    }

    // Store in cache
    await this.cacheConfig.adapter.set(cacheKey, result, ttl);

    return result;
  }

  /**
   * Invalidate cache for a table
   */
  async invalidateCache(pattern?: string): Promise<void> {
    if (!this.cacheConfig) {
      return;
    }

    const prefix = this.cacheConfig.prefix || 'qb:';
    const key = pattern ? `${prefix}${pattern}*` : `${prefix}*`;

    // If the adapter supports delete by pattern
    if (typeof (this.cacheConfig.adapter as any).deletePattern === 'function') {
      await (this.cacheConfig.adapter as any).deletePattern(key);
    }
  }
}

export { type FieldInfo, type QueryResult } from '../types';

/**
 * Cache API - Industry-leading cache interface
 *
 * Inspired by Drizzle ORM's $cache API, TypeORM's simplicity,
 * and enhanced with additional features.
 *
 * @example
 * ```typescript
 * // Invalidate by tables
 * await db.$cache.invalidate({ tables: ['users'] });
 *
 * // Invalidate by tags
 * await db.$cache.invalidate({ tags: ['user-123'] });
 *
 * // Get statistics
 * const stats = db.$cache.stats();
 *
 * // Clear all cache
 * await db.$cache.clear();
 *
 * // Warmup cache
 * await db.$cache.warmup([
 *   { sql: 'SELECT * FROM settings', ttl: 86400 }
 * ]);
 * ```
 */

import { CacheKeyGenerator } from './cache-key-generator';

import type { CacheAdapter } from '../interfaces';
import type { Logger } from '../types';

export interface CacheInvalidateOptions {
  /** Table names to invalidate */
  tables?: string | string[];
  /** Custom tags to invalidate */
  tags?: string | string[];
}

export interface CacheWarmupQuery {
  sql: string;
  params?: unknown[];
  ttl?: number;
  tags?: string[];
}

export interface CacheAPIStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  invalidations: number;
  hitRate: number;
  size: number;
  memoryUsage?: number;
}

export interface CacheAPIOptions {
  adapter: CacheAdapter;
  namespace?: string;
  logger?: Logger;
  onHit?: (key: string, sql: string) => void;
  onMiss?: (key: string, sql: string) => void;
  onError?: (error: Error, key: string) => void;
}

/**
 * Cache API - Drizzle-style $cache interface
 */
export class CacheAPI {
  private adapter: CacheAdapter;
  private keyGenerator: CacheKeyGenerator;
  private logger?: Logger;
  private stats: CacheAPIStats;
  private tableKeyMap: Map<string, Set<string>> = new Map();
  private tagKeyMap: Map<string, Set<string>> = new Map();

  // Callbacks
  public onHit?: (key: string, sql: string) => void;
  public onMiss?: (key: string, sql: string) => void;
  public onError?: (error: Error, key: string) => void;

  constructor(options: CacheAPIOptions) {
    this.adapter = options.adapter;
    this.keyGenerator = new CacheKeyGenerator({
      namespace: options.namespace || 'db-bridge',
    });
    this.logger = options.logger;
    this.onHit = options.onHit;
    this.onMiss = options.onMiss;
    this.onError = options.onError;

    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      hitRate: 0,
      size: 0,
    };
  }

  /**
   * Invalidate cache by tables or tags
   *
   * @example
   * ```typescript
   * // Single table
   * await db.$cache.invalidate({ tables: 'users' });
   *
   * // Multiple tables
   * await db.$cache.invalidate({ tables: ['users', 'posts'] });
   *
   * // By tags
   * await db.$cache.invalidate({ tags: ['user-123', 'active-users'] });
   *
   * // Combined
   * await db.$cache.invalidate({
   *   tables: ['users'],
   *   tags: ['premium-users']
   * });
   * ```
   */
  async invalidate(options: CacheInvalidateOptions): Promise<number> {
    let invalidated = 0;

    // Invalidate by tables
    if (options.tables) {
      const tables = Array.isArray(options.tables) ? options.tables : [options.tables];

      for (const table of tables) {
        const keys = this.tableKeyMap.get(table) || new Set();

        for (const key of keys) {
          try {
            const deleted = await this.adapter.delete(key);
            if (deleted) {
              invalidated++;
              this.stats.deletes++;
            }
          } catch (error) {
            this.handleError(error as Error, key);
          }
        }

        // Also try pattern-based deletion
        try {
          const pattern = `*:table:${table}:*`;
          const patternKeys = await this.adapter.keys(pattern);
          for (const key of patternKeys) {
            const deleted = await this.adapter.delete(key);
            if (deleted) {
              invalidated++;
            }
          }
        } catch {
          // Pattern matching not supported, skip
        }

        this.tableKeyMap.delete(table);
        this.logger?.debug(`Invalidated table cache: ${table}`, { count: keys.size });
      }
    }

    // Invalidate by tags
    if (options.tags) {
      const tags = Array.isArray(options.tags) ? options.tags : [options.tags];

      for (const tag of tags) {
        const tagKey = this.keyGenerator.tag(tag);

        try {
          // Get all keys associated with this tag
          const keys = (await this.adapter.get<string[]>(tagKey)) || [];

          for (const key of keys) {
            const deleted = await this.adapter.delete(key);
            if (deleted) {
              invalidated++;
              this.stats.deletes++;
            }
          }

          // Delete the tag key itself
          await this.adapter.delete(tagKey);
          this.tagKeyMap.delete(tag);

          this.logger?.debug(`Invalidated tag cache: ${tag}`, { count: keys.length });
        } catch (error) {
          this.handleError(error as Error, tagKey);
        }
      }
    }

    this.stats.invalidations += invalidated;
    this.updateHitRate();

    return invalidated;
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await this.adapter.clear();
      this.tableKeyMap.clear();
      this.tagKeyMap.clear();
      this.stats.size = 0;
      this.logger?.info('Cache cleared');
    } catch (error) {
      this.handleError(error as Error, '*');
    }
  }

  /**
   * Warmup cache with predefined queries
   *
   * @example
   * ```typescript
   * await db.$cache.warmup([
   *   { sql: 'SELECT * FROM settings', ttl: 86400 },
   *   { sql: 'SELECT * FROM categories', ttl: 3600, tags: ['catalog'] }
   * ]);
   * ```
   */
  async warmup(
    queries: CacheWarmupQuery[],
    executor: (sql: string, params?: unknown[]) => Promise<unknown>,
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    this.logger?.info('Cache warmup started', { count: queries.length });

    for (const query of queries) {
      try {
        const result = await executor(query.sql, query.params);
        const key = this.keyGenerator.query(query.sql, query.params);

        await this.set(key, result, {
          ttl: query.ttl,
          tags: query.tags,
          tables: this.extractTables(query.sql),
        });

        success++;
        this.logger?.debug('Warmup query cached', { sql: query.sql });
      } catch (error) {
        failed++;
        this.logger?.error('Warmup query failed', { sql: query.sql, error });
      }
    }

    this.logger?.info('Cache warmup completed', { success, failed });
    return { success, failed };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheAPIStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      invalidations: 0,
      hitRate: 0,
      size: this.stats.size,
    };
  }

  /**
   * Get cached value
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.adapter.get<T>(key);

      if (value === null) {
        this.stats.misses++;
        this.onMiss?.(key, '');
      } else {
        this.stats.hits++;
        this.onHit?.(key, '');
      }

      this.updateHitRate();
      return value;
    } catch (error) {
      this.handleError(error as Error, key);
      return null;
    }
  }

  /**
   * Set cached value with metadata
   */
  async set<T>(
    key: string,
    value: T,
    options?: {
      ttl?: number;
      tags?: string[];
      tables?: string[];
    },
  ): Promise<void> {
    try {
      await this.adapter.set(key, value, options?.ttl);
      this.stats.sets++;
      this.stats.size++;

      // Track table associations
      if (options?.tables) {
        for (const table of options.tables) {
          if (!this.tableKeyMap.has(table)) {
            this.tableKeyMap.set(table, new Set());
          }
          this.tableKeyMap.get(table)!.add(key);
        }
      }

      // Track tag associations
      if (options?.tags) {
        for (const tag of options.tags) {
          const tagKey = this.keyGenerator.tag(tag);
          const existing = (await this.adapter.get<string[]>(tagKey)) || [];

          if (!existing.includes(key)) {
            existing.push(key);
            await this.adapter.set(tagKey, existing);
          }

          if (!this.tagKeyMap.has(tag)) {
            this.tagKeyMap.set(tag, new Set());
          }
          this.tagKeyMap.get(tag)!.add(key);
        }
      }
    } catch (error) {
      this.handleError(error as Error, key);
    }
  }

  /**
   * Delete cached value
   */
  async delete(key: string): Promise<boolean> {
    try {
      const deleted = await this.adapter.delete(key);
      if (deleted) {
        this.stats.deletes++;
        this.stats.size = Math.max(0, this.stats.size - 1);
      }
      return deleted;
    } catch (error) {
      this.handleError(error as Error, key);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      return await this.adapter.exists(key);
    } catch (error) {
      this.handleError(error as Error, key);
      return false;
    }
  }

  /**
   * Generate cache key for query
   */
  generateKey(sql: string, params?: unknown[]): string {
    return this.keyGenerator.query(sql, params);
  }

  /**
   * Get key generator for custom keys
   */
  key(): CacheKeyGenerator {
    return this.keyGenerator;
  }

  /**
   * Extract table names from SQL
   */
  private extractTables(sql: string): string[] {
    const tables: string[] = [];
    const patterns = [
      /from\s+["'`]?(\w+)["'`]?/gi,
      /join\s+["'`]?(\w+)["'`]?/gi,
      /into\s+["'`]?(\w+)["'`]?/gi,
      /update\s+["'`]?(\w+)["'`]?/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        if (match[1]) {
          tables.push(match[1].toLowerCase());
        }
      }
    }

    return [...new Set(tables)];
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  private handleError(error: Error, key: string): void {
    this.logger?.error('Cache error', { key, error: error.message });
    this.onError?.(error, key);
  }
}

/**
 * Cache configuration for DBBridge
 */
export interface CacheConfig {
  /** Redis connection string or CacheAdapter instance */
  redis?: string | CacheAdapter;

  /** Enable global caching (default: false - explicit/opt-in) */
  global?: boolean;

  /** Default TTL in seconds (default: 3600) */
  ttl?: number;

  /** Cache namespace prefix */
  namespace?: string;

  /** Commands to cache (default: ['SELECT', 'SHOW', 'DESCRIBE']) */
  cacheableCommands?: string[];

  /** Auto-invalidate on mutations (default: true) */
  autoInvalidate?: boolean;

  /** Cache empty results (default: false) */
  cacheEmpty?: boolean;

  /** Warmup queries to preload on connect */
  warmup?: CacheWarmupQuery[];

  /** Event callbacks */
  onHit?: (key: string, sql: string) => void;
  onMiss?: (key: string, sql: string) => void;
  onError?: (error: Error, key: string) => void;
}

/**
 * Per-query cache options
 */
export interface QueryCacheConfig {
  /** Enable/disable cache for this query */
  enabled?: boolean;

  /** Custom TTL for this query */
  ttl?: number;

  /** Custom cache key */
  key?: string;

  /** Tags for bulk invalidation */
  tags?: string[];

  /** Skip auto-invalidation for this query */
  autoInvalidate?: boolean;
}

export type CacheOption = boolean | QueryCacheConfig;

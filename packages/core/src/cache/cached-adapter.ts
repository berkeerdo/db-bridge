import { EventEmitter } from 'eventemitter3';

import { SmartCacheStrategy } from './cache-strategy';
import { ModularCacheManager } from './modular-cache-manager';

import type { CacheStrategy, QueryCacheOptions } from './cache-strategy';
import type { DatabaseAdapter, CacheAdapter } from '../interfaces';
import type {
  QueryResult,
  QueryParams,
  QueryOptions,
  Transaction,
  TransactionOptions,
  PreparedStatement,
  PoolStats,
  ConnectionConfig,
  Logger,
} from '../types';

export interface CachedAdapterOptions {
  adapter: DatabaseAdapter;
  cache: CacheAdapter;
  strategy?: CacheStrategy;
  logger?: Logger;
  enabled?: boolean;
  cacheableCommands?: string[];
  defaultTTL?: number;
  cacheEmptyResults?: boolean;
  cacheErrors?: boolean;
  warmupQueries?: Array<{
    sql: string;
    params?: unknown[];
    ttl?: number;
  }>;
}

/**
 * Wraps any database adapter with automatic caching functionality
 * Works with MySQL, PostgreSQL, MongoDB or any other adapter
 */
export class CachedAdapter extends EventEmitter implements DatabaseAdapter {
  private adapter: DatabaseAdapter;
  private cacheManager: ModularCacheManager;
  private cacheableCommands: Set<string>;
  private defaultTTL: number;
  private cacheEmptyResults: boolean;
  private cacheErrors: boolean;
  private logger?: Logger;
  private warmupQueries?: CachedAdapterOptions['warmupQueries'];

  constructor(options: CachedAdapterOptions) {
    super();

    this.adapter = options.adapter;
    this.logger = options.logger;
    this.cacheableCommands = new Set(options.cacheableCommands || ['SELECT', 'SHOW', 'DESCRIBE']);
    this.defaultTTL = options.defaultTTL || 3600;
    this.cacheEmptyResults = options.cacheEmptyResults || false;
    this.cacheErrors = options.cacheErrors || false;
    this.warmupQueries = options.warmupQueries;

    // Create cache manager with strategy
    this.cacheManager = new ModularCacheManager(options.cache, {
      strategy: options.strategy || new SmartCacheStrategy(),
      logger: this.logger,
      enabled: options.enabled ?? true,
    });

    // Forward adapter events if it's an EventEmitter
    if ('on' in this.adapter && typeof this.adapter.on === 'function') {
      this.adapter.on('connect', (...args: unknown[]) => {
        this.emit('connect', ...args);
        void this.performWarmup();
      });
      this.adapter.on('disconnect', (...args: unknown[]) => this.emit('disconnect', ...args));
      this.adapter.on('error', (...args: unknown[]) => this.emit('error', ...args));
    }

    // Listen for cache events
    this.cacheManager.on('cacheHit', (data) => {
      this.logger?.debug('Cache hit', data);
      this.emit('cacheHit', data);
    });

    this.cacheManager.on('cacheMiss', (data) => {
      this.logger?.debug('Cache miss', data);
      this.emit('cacheMiss', data);
    });

    // Invalidate cache on write operations if adapter emits events
    if ('on' in this.adapter && typeof this.adapter.on === 'function') {
      this.adapter.on('query', (data: any) => {
        if (data.command && this.isWriteCommand(data.command)) {
          this.invalidateRelatedCache(data.sql).catch((error: Error) => {
            this.logger?.error('Cache invalidation error', error);
          });
        }
      });
    }
  }

  get name(): string {
    return `Cached${this.adapter.name}`;
  }

  get version(): string {
    return this.adapter.version;
  }

  get isConnected(): boolean {
    return this.adapter.isConnected;
  }

  async connect(config: ConnectionConfig): Promise<void> {
    await this.adapter.connect(config);
  }

  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
    await this.cacheManager.invalidateAll();
  }

  async query<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    const command = this.extractCommand(sql);

    // Don't cache if:
    // 1. Cache is disabled in options
    // 2. Command is not cacheable
    // 3. It's part of a transaction
    if (options?.cache === false || !this.shouldCache(command, options) || options?.transaction) {
      return this.adapter.query<T>(sql, params, options);
    }

    const cacheOptions: QueryCacheOptions = typeof options?.cache === 'object' ? options.cache : {};

    try {
      // Try to get from cache
      const cached = await this.cacheManager.get<T>(sql, params as unknown[], cacheOptions);

      if (cached) {
        // Update cache statistics for smart strategy
        const strategy = (this.cacheManager as any).strategy;
        if (strategy instanceof SmartCacheStrategy) {
          strategy.recordQueryExecution(sql, 0); // 0ms for cache hit
        }

        return cached;
      }

      // Execute query
      const startTime = Date.now();
      const result = await this.adapter.query<T>(sql, params, options);
      const duration = Date.now() - startTime;

      // Update statistics
      const strategy = (this.cacheManager as any).strategy;
      if (strategy instanceof SmartCacheStrategy) {
        strategy.recordQueryExecution(sql, duration);
      }

      // Check if we should cache the result
      if (this.shouldCacheResult(result, options)) {
        await this.cacheManager.set(sql, params as unknown[], result, cacheOptions);
      }

      return result;
    } catch (error) {
      // Optionally cache errors
      const cacheEnabled = (options?.cache as any) !== false;
      if (this.cacheErrors && cacheEnabled) {
        const errorResult = {
          rows: [] as T[],
          rowCount: 0,
          error: error as Error,
        } as QueryResult<T>;

        await this.cacheManager.set(sql, params as unknown[], errorResult, {
          ...cacheOptions,
          ttl: 60, // Cache errors for 1 minute
        });
      }

      throw error;
    }
  }

  async beginTransaction(options?: TransactionOptions): Promise<Transaction> {
    const transaction = await this.adapter.beginTransaction(options);

    // Wrap transaction to invalidate cache on commit/rollback
    const originalCommit = transaction.commit.bind(transaction);
    const originalRollback = transaction.rollback.bind(transaction);

    transaction.commit = async () => {
      const result = await originalCommit();
      // Invalidate all cache after successful commit
      await this.cacheManager.invalidateAll();
      return result;
    };

    transaction.rollback = async () => {
      const result = await originalRollback();
      // No need to invalidate on rollback
      return result;
    };

    return transaction;
  }

  async prepare<T = unknown>(sql: string, name?: string): Promise<PreparedStatement<T>> {
    return this.adapter.prepare<T>(sql, name);
  }

  getPoolStats(): PoolStats {
    return this.adapter.getPoolStats();
  }

  async ping(): Promise<boolean> {
    return this.adapter.ping();
  }

  escape(value: unknown): string {
    return this.adapter.escape(value);
  }

  escapeIdentifier(identifier: string): string {
    return this.adapter.escapeIdentifier(identifier);
  }

  execute<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    // Execute is same as query for most adapters
    return this.query<T>(sql, params, options);
  }

  createQueryBuilder<T = unknown>(): import('../interfaces').QueryBuilder<T> {
    return this.adapter.createQueryBuilder<T>();
  }

  getCacheManager(): ModularCacheManager {
    return this.cacheManager;
  }

  async warmupCache(): Promise<void> {
    if (!this.warmupQueries || this.warmupQueries.length === 0) {
      return;
    }

    this.logger?.info('Starting cache warmup', { count: this.warmupQueries.length });

    for (const query of this.warmupQueries) {
      try {
        const result = await this.query(query.sql, query.params as QueryParams, {
          cache: { ttl: query.ttl || this.defaultTTL },
        });

        this.logger?.debug('Warmup query cached', {
          sql: query.sql,
          rowCount: result.rowCount,
        });
      } catch (error) {
        this.logger?.error('Warmup query failed', {
          sql: query.sql,
          error,
        });
      }
    }

    this.logger?.info('Cache warmup completed');
  }

  private async performWarmup(): Promise<void> {
    if (this.warmupQueries && this.warmupQueries.length > 0) {
      // Perform warmup asynchronously after connection
      setTimeout(() => {
        this.warmupCache().catch((error) => {
          this.logger?.error('Cache warmup error', error);
        });
      }, 1000); // Wait 1 second after connection
    }
  }

  private shouldCache(command: string, options?: QueryOptions): boolean {
    if (!command) {
      return false;
    }

    // Check if command is cacheable
    if (!this.cacheableCommands.has(command)) {
      return false;
    }

    // Check if caching is explicitly enabled in options
    if (options?.cache === true || typeof options?.cache === 'object') {
      return true;
    }

    // Default to true for cacheable commands
    return true;
  }

  private shouldCacheResult(result: QueryResult, _options?: QueryOptions): boolean {
    // Don't cache empty results unless explicitly configured
    if (!this.cacheEmptyResults && result.rowCount === 0) {
      return false;
    }

    // Don't cache if result has an error
    if ((result as any).error) {
      return this.cacheErrors;
    }

    return true;
  }

  private extractCommand(sql: string): string {
    return sql.trim().split(/\s+/)[0]?.toUpperCase() || '';
  }

  private isWriteCommand(command: string): boolean {
    const writeCommands = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'];
    return writeCommands.includes(command.toUpperCase());
  }

  private async invalidateRelatedCache(sql: string): Promise<void> {
    const tables = this.extractTableNames(sql);
    const patterns: string[] = [];

    tables.forEach((table) => {
      patterns.push(`*${table}*`, `table:${table}:*`);
    });

    if (patterns.length > 0) {
      await this.cacheManager.invalidate(patterns);
    }
  }

  private extractTableNames(sql: string): string[] {
    const tables: string[] = [];
    const patterns = [
      /from\s+`?(\w+)`?/gi,
      /join\s+`?(\w+)`?/gi,
      /update\s+`?(\w+)`?/gi,
      /insert\s+into\s+`?(\w+)`?/gi,
      /delete\s+from\s+`?(\w+)`?/gi,
      /create\s+table\s+`?(\w+)`?/gi,
      /drop\s+table\s+`?(\w+)`?/gi,
      /truncate\s+table?\s+`?(\w+)`?/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        if (match[1]) {
          tables.push(match[1].toLowerCase());
        }
      }
    });

    return [...new Set(tables)];
  }
}

/**
 * Helper function to create a cached adapter
 */
export function createCachedAdapter(
  adapter: DatabaseAdapter,
  cache: CacheAdapter,
  options?: Partial<CachedAdapterOptions>,
): CachedAdapter {
  return new CachedAdapter({
    adapter,
    cache,
    ...options,
  });
}

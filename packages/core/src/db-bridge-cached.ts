/**
 * DBBridge with Industry-Leading Cache Support
 *
 * Combines the best features from:
 * - Drizzle ORM: $cache API, $withCache() method chaining
 * - TypeORM: Simple configuration
 * - Prisma: Extension pattern with callbacks
 *
 * @example
 * ```typescript
 * // Simple setup with cache
 * const db = CachedDBBridge.mysql({
 *   host: 'localhost',
 *   database: 'mydb',
 *   cache: {
 *     redis: 'redis://localhost:6379',
 *     ttl: 3600,
 *     global: false, // Explicit caching (opt-in)
 *   }
 * });
 *
 * await db.connect();
 *
 * // Per-query caching
 * const users = await db.query('SELECT * FROM users').$withCache();
 * const posts = await db.query('SELECT * FROM posts').$withCache({ ttl: 60 });
 *
 * // Cache invalidation
 * await db.$cache.invalidate({ tables: ['users'] });
 *
 * // Statistics
 * console.log(db.$cache.stats());
 * ```
 */

import { EventEmitter } from 'eventemitter3';

import { CacheAPI } from './cache/cache-api';
import { CacheKeyGenerator } from './cache/cache-key-generator';
import { DatabaseError } from './errors';

import type { CacheConfig, QueryCacheConfig } from './cache/cache-api';
import type { DatabaseAdapter, CacheAdapter, QueryBuilder } from './interfaces';
import type {
  QueryResult,
  QueryParams,
  Transaction,
  TransactionOptions,
  ConnectionConfig,
} from './types';

export type DatabaseType = 'mysql' | 'postgresql' | 'postgres' | 'redis';

/** Extended cache adapter with connection methods */
interface ConnectableCacheAdapter extends CacheAdapter {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected?: boolean;
}

export interface CachedDBBridgeConfig {
  type: DatabaseType;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  connectionString?: string;

  /** Cache configuration */
  cache?: CacheConfig;

  /** Additional options */
  options?: {
    logging?: boolean;
    logger?: any;
    pool?: {
      min?: number;
      max?: number;
    };
  };
}

/**
 * Chainable query result with $withCache support
 */
export class CacheableQuery<T = unknown> implements PromiseLike<QueryResult<T>> {
  private executed = false;
  private cacheConfig: QueryCacheConfig | null = null;
  private result: QueryResult<T> | null = null;

  constructor(
    private readonly sql: string,
    private readonly params: QueryParams | undefined,
    private readonly executor: (
      sql: string,
      params?: QueryParams,
      cache?: QueryCacheConfig | null,
    ) => Promise<QueryResult<T>>,
    globalCache: boolean,
  ) {
    // If global cache is enabled, use cache by default
    if (globalCache) {
      this.cacheConfig = { enabled: true };
    }
  }

  /**
   * Enable caching for this query (Drizzle-style)
   *
   * @example
   * ```typescript
   * // Simple enable
   * await db.query('SELECT * FROM users').$withCache();
   *
   * // With options
   * await db.query('SELECT * FROM users').$withCache({
   *   ttl: 60,
   *   tags: ['users']
   * });
   *
   * // Disable for global cache mode
   * await db.query('SELECT * FROM users').$withCache(false);
   * ```
   */
  $withCache(options?: boolean | QueryCacheConfig): this {
    if (options === false) {
      this.cacheConfig = null;
    } else if (options === true || options === undefined) {
      this.cacheConfig = { enabled: true };
    } else {
      this.cacheConfig = { enabled: true, ...options };
    }
    return this;
  }

  /**
   * Alias for $withCache
   */
  cache(options?: boolean | QueryCacheConfig): this {
    return this.$withCache(options);
  }

  /**
   * Execute the query
   */
  async execute(): Promise<QueryResult<T>> {
    if (!this.executed) {
      this.result = await this.executor(this.sql, this.params, this.cacheConfig);
      this.executed = true;
    }
    return this.result!;
  }

  /**
   * Implement PromiseLike for await support
   */
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

/**
 * CachedDBBridge - Database client with integrated caching
 */
export class CachedDBBridge extends EventEmitter {
  private adapter?: DatabaseAdapter;
  private cacheAdapter?: ConnectableCacheAdapter;
  private cacheAPI?: CacheAPI;
  private keyGenerator: CacheKeyGenerator;
  private readonly config: CachedDBBridgeConfig;

  constructor(config: CachedDBBridgeConfig) {
    super();
    this.config = config;
    this.keyGenerator = new CacheKeyGenerator({
      namespace: config.cache?.namespace || 'db-bridge',
    });
  }

  // ============================================
  // Static Factory Methods
  // ============================================

  /**
   * Create MySQL instance with optional cache
   */
  static mysql(
    config: Omit<CachedDBBridgeConfig, 'type'> & {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
    },
  ): CachedDBBridge {
    return new CachedDBBridge({ ...config, type: 'mysql' });
  }

  /**
   * Create PostgreSQL instance with optional cache
   */
  static postgresql(
    config: Omit<CachedDBBridgeConfig, 'type'> & {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
    },
  ): CachedDBBridge {
    return new CachedDBBridge({ ...config, type: 'postgresql' });
  }

  /**
   * Alias for postgresql
   */
  static postgres(config: Omit<CachedDBBridgeConfig, 'type'>): CachedDBBridge {
    return CachedDBBridge.postgresql(config);
  }

  // ============================================
  // $cache API (Drizzle-style)
  // ============================================

  /**
   * Cache management API
   *
   * @example
   * ```typescript
   * // Invalidate by tables
   * await db.$cache.invalidate({ tables: ['users', 'posts'] });
   *
   * // Invalidate by tags
   * await db.$cache.invalidate({ tags: ['user-123'] });
   *
   * // Get statistics
   * const stats = db.$cache.stats();
   *
   * // Clear all
   * await db.$cache.clear();
   * ```
   */
  get $cache(): {
    invalidate: CacheAPI['invalidate'];
    clear: CacheAPI['clear'];
    warmup: (
      queries: Array<{ sql: string; params?: unknown[]; ttl?: number }>,
    ) => Promise<{ success: number; failed: number }>;
    stats: () => ReturnType<CacheAPI['getStats']>;
    resetStats: () => void;
    key: () => CacheKeyGenerator;
  } {
    if (!this.cacheAPI) {
      throw new DatabaseError('Cache not configured. Add cache config to enable caching.');
    }

    return {
      invalidate: this.cacheAPI.invalidate.bind(this.cacheAPI),
      clear: this.cacheAPI.clear.bind(this.cacheAPI),
      warmup: (queries) =>
        this.cacheAPI!.warmup(queries, (sql, params) =>
          this.adapter!.query(sql, params as QueryParams),
        ),
      stats: () => this.cacheAPI!.getStats(),
      resetStats: () => this.cacheAPI!.resetStats(),
      key: () => this.keyGenerator,
    };
  }

  /**
   * Check if cache is enabled
   */
  get isCacheEnabled(): boolean {
    return !!this.cacheAPI;
  }

  // ============================================
  // Connection Methods
  // ============================================

  /**
   * Connect to database (and cache if configured)
   */
  async connect(): Promise<void> {
    // Load and connect database adapter
    this.adapter = await this.loadAdapter();
    await this.adapter.connect({
      host: this.config.host,
      port: this.config.port,
      user: this.config.user,
      password: this.config.password,
      database: this.config.database,
      connectionString: this.config.connectionString,
      pool: this.config.options?.pool,
    });

    // Setup cache if configured
    if (this.config.cache) {
      await this.setupCache();
    }

    this.emit('connect');
  }

  /**
   * Disconnect from database and cache
   */
  async disconnect(): Promise<void> {
    if (this.cacheAdapter && typeof this.cacheAdapter.disconnect === 'function') {
      await this.cacheAdapter.disconnect();
    }
    if (this.adapter) {
      await this.adapter.disconnect();
    }
    this.emit('disconnect');
  }

  // ============================================
  // Query Methods with $withCache Support
  // ============================================

  /**
   * Execute query with optional caching
   *
   * @example
   * ```typescript
   * // Simple query
   * const result = await db.query('SELECT * FROM users');
   *
   * // With cache (method chaining)
   * const cached = await db.query('SELECT * FROM users').$withCache();
   *
   * // With cache options
   * const custom = await db.query('SELECT * FROM users').$withCache({
   *   ttl: 60,
   *   tags: ['users-list']
   * });
   *
   * // Disable cache (when global is true)
   * const fresh = await db.query('SELECT * FROM users').$withCache(false);
   * ```
   */
  query<T = unknown>(sql: string, params?: QueryParams): CacheableQuery<T> {
    this.ensureConnected();

    const executor = async (
      s: string,
      p?: QueryParams,
      cacheConfig?: QueryCacheConfig | null,
    ): Promise<QueryResult<T>> => {
      // No caching
      if (!cacheConfig || !this.cacheAPI) {
        return this.adapter!.query<T>(s, p);
      }

      // Generate cache key
      const key = cacheConfig.key || this.cacheAPI.generateKey(s, p as unknown[]);

      // Try cache first
      const cached = await this.cacheAPI.get<QueryResult<T>>(key);
      if (cached) {
        this.emit('cacheHit', { key, sql: s });
        return cached;
      }

      // Execute query
      const result = await this.adapter!.query<T>(s, p);
      this.emit('cacheMiss', { key, sql: s });

      // Cache the result
      const tables = this.extractTables(s);
      await this.cacheAPI.set(key, result, {
        ttl: cacheConfig.ttl || this.config.cache?.ttl || 3600,
        tags: cacheConfig.tags,
        tables,
      });

      return result;
    };

    return new CacheableQuery<T>(sql, params, executor, this.config.cache?.global ?? false);
  }

  /**
   * Execute command (INSERT, UPDATE, DELETE)
   * Automatically invalidates related cache
   */
  async execute<T = unknown>(sql: string, params?: QueryParams): Promise<QueryResult<T>> {
    this.ensureConnected();

    const result = await this.adapter!.query<T>(sql, params);

    // Auto-invalidate cache for mutations
    if (this.cacheAPI && this.config.cache?.autoInvalidate !== false) {
      const command = sql.trim().split(/\s+/)[0]?.toUpperCase();
      const mutationCommands = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'DROP', 'ALTER'];

      if (command && mutationCommands.includes(command)) {
        const tables = this.extractTables(sql);
        if (tables.length > 0) {
          await this.$cache.invalidate({ tables });
          this.emit('cacheInvalidated', { tables, command });
        }
      }
    }

    return result;
  }

  // ============================================
  // Query Builder
  // ============================================

  /**
   * Get query builder for table
   */
  table<T = unknown>(tableName: string): QueryBuilder<T> {
    this.ensureConnected();
    const qb = this.adapter!.createQueryBuilder<T>();
    return this.configureQueryBuilder(qb, tableName);
  }

  /**
   * Alias for table()
   */
  from<T = unknown>(tableName: string): QueryBuilder<T> {
    return this.table<T>(tableName);
  }

  // ============================================
  // Transaction Support
  // ============================================

  /**
   * Execute transaction
   * Note: Cache is bypassed during transactions
   */
  async transaction<T>(
    callback: (trx: Transaction) => Promise<T>,
    options?: TransactionOptions,
  ): Promise<T> {
    this.ensureConnected();

    const trx = await this.adapter!.beginTransaction(options);

    try {
      const result = await callback(trx);
      await trx.commit();

      // Invalidate all cache after successful transaction
      if (this.cacheAPI) {
        await this.$cache.clear();
      }

      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  // ============================================
  // Utility Methods
  // ============================================

  /**
   * Get raw adapter for advanced usage
   */
  getAdapter(): DatabaseAdapter | undefined {
    return this.adapter;
  }

  /**
   * Get cache adapter
   */
  getCacheAdapter(): CacheAdapter | undefined {
    return this.cacheAdapter;
  }

  /**
   * Ping database
   */
  async ping(): Promise<boolean> {
    this.ensureConnected();
    return this.adapter!.ping();
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return !!this.adapter?.isConnected;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async setupCache(): Promise<void> {
    const cacheConfig = this.config.cache!;

    // Load Redis adapter if string connection
    if (typeof cacheConfig.redis === 'string') {
      this.cacheAdapter = await this.loadRedisAdapter();
      if (typeof this.cacheAdapter.connect === 'function') {
        await this.cacheAdapter.connect({
          connectionString: cacheConfig.redis,
        });
      }
    } else if (cacheConfig.redis) {
      this.cacheAdapter = cacheConfig.redis as ConnectableCacheAdapter;
    }

    if (!this.cacheAdapter) {
      throw new DatabaseError('Cache adapter not configured properly');
    }

    // Create Cache API
    this.cacheAPI = new CacheAPI({
      adapter: this.cacheAdapter,
      namespace: cacheConfig.namespace || 'db-bridge',
      logger: this.config.options?.logger,
      onHit: cacheConfig.onHit,
      onMiss: cacheConfig.onMiss,
      onError: cacheConfig.onError,
    });

    // Warmup if configured
    if (cacheConfig.warmup && cacheConfig.warmup.length > 0) {
      await this.$cache.warmup(cacheConfig.warmup);
    }
  }

  private async loadAdapter(): Promise<DatabaseAdapter> {
    switch (this.config.type) {
      case 'mysql': {
        return this.loadMySQLAdapter();
      }
      case 'postgresql':
      case 'postgres': {
        return this.loadPostgreSQLAdapter();
      }
      default: {
        throw new DatabaseError(`Unsupported database type: ${this.config.type}`);
      }
    }
  }

  private async loadMySQLAdapter(): Promise<DatabaseAdapter> {
    try {
      let module: any;
      try {
        module = await import('@db-bridge/mysql');
      } catch {
        module = require('@db-bridge/mysql');
      }
      const MySQLAdapter = module.MySQLAdapter || module.default?.MySQLAdapter;
      return new MySQLAdapter(
        this.config.options?.logger ? { logger: this.config.options.logger } : {},
      );
    } catch {
      throw new DatabaseError('MySQL adapter not installed. Run: npm install @db-bridge/mysql');
    }
  }

  private async loadPostgreSQLAdapter(): Promise<DatabaseAdapter> {
    try {
      let module: any;
      try {
        module = await import('@db-bridge/postgresql');
      } catch {
        module = require('@db-bridge/postgresql');
      }
      const PostgreSQLAdapter = module.PostgreSQLAdapter || module.default?.PostgreSQLAdapter;
      return new PostgreSQLAdapter(
        this.config.options?.logger ? { logger: this.config.options.logger } : {},
      );
    } catch {
      throw new DatabaseError(
        'PostgreSQL adapter not installed. Run: npm install @db-bridge/postgresql',
      );
    }
  }

  private async loadRedisAdapter(): Promise<ConnectableCacheAdapter> {
    try {
      let module: any;
      try {
        module = await import('@db-bridge/redis');
      } catch {
        module = require('@db-bridge/redis');
      }
      const RedisAdapter = module.RedisAdapter || module.default?.RedisAdapter;
      return new RedisAdapter() as ConnectableCacheAdapter;
    } catch {
      throw new DatabaseError('Redis adapter not installed. Run: npm install @db-bridge/redis');
    }
  }

  private configureQueryBuilder<T>(qb: any, tableName: string): QueryBuilder<T> {
    if (typeof qb.table === 'function') {
      return qb.table(tableName);
    }
    if (typeof qb.from === 'function') {
      return qb.from(tableName);
    }
    if ('_table' in qb || 'tableName' in qb) {
      qb._table = tableName;
      qb.tableName = tableName;
      return qb;
    }
    throw new DatabaseError('Query builder does not support table selection');
  }

  private ensureConnected(): void {
    if (!this.adapter) {
      throw new DatabaseError('Not connected. Call connect() first.');
    }
  }

  private extractTables(sql: string): string[] {
    const tables: string[] = [];
    const patterns = [
      /from\s+["'`]?(\w+)["'`]?/gi,
      /join\s+["'`]?(\w+)["'`]?/gi,
      /into\s+["'`]?(\w+)["'`]?/gi,
      /update\s+["'`]?(\w+)["'`]?/gi,
      /delete\s+from\s+["'`]?(\w+)["'`]?/gi,
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
}

// Export types

export { type CacheConfig, type QueryCacheConfig } from './cache/cache-api';

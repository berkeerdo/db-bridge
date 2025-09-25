import { CachedAdapter } from './cache/cached-adapter';
import { DatabaseAdapter, CacheAdapter } from './interfaces';
import { ConnectionConfig } from './types';
import { CryptoProvider } from './crypto/crypto';

export interface ClientOptions {
  provider: 'mysql' | 'postgresql' | 'postgres';
  url?: string;
  connection?: ConnectionConfig & {
    // Additional connection options
    poolMin?: number;
    poolMax?: number;
    poolIdleTimeout?: number;
    poolAcquireTimeout?: number;
    charset?: string;
    timezone?: string;
    multipleStatements?: boolean;
    dateStrings?: boolean;
    supportBigNumbers?: boolean;
    bigNumberStrings?: boolean;
    schema?: string;
    searchPath?: string[];
    statement_timeout?: number;
    query_timeout?: number;
    application_name?: string;
  };
  cache?: boolean | {
    provider: 'redis';
    url?: string;
    connection?: ConnectionConfig & {
      db?: number;
      sentinels?: Array<{ host: string; port: number }>;
      name?: string;
      sentinelPassword?: string;
      retryStrategy?: (times: number) => number;
      maxRetriesPerRequest?: number;
      enableReadyCheck?: boolean;
      enableOfflineQueue?: boolean;
      cluster?: Array<{ host: string; port: number }>;
    };
  };
  encryption?: boolean | {
    algorithm?: string;
    key?: string;
    keyRotationInterval?: number;
    autoEncryptFields?: Record<string, string[]>;
  };
  logger?: boolean | Console | {
    level?: string;
    prettyPrint?: boolean;
    customLogger?: (level: string, message: string, meta?: any) => void;
  };
  monitoring?: {
    enabled?: boolean;
    slowQueryThreshold?: number;
    captureStackTrace?: boolean;
    metricsCollector?: (metric: any) => void;
  };
  healthCheck?: {
    enabled?: boolean;
    interval?: number;
    timeout?: number;
    retries?: number;
  };
  multiTenant?: {
    enabled?: boolean;
    tenantIdField?: string;
    tenantIdHeader?: string;
    isolationLevel?: 'schema' | 'database' | 'row';
    tenantResolver?: (context: any) => Promise<string>;
  };
  migrations?: {
    directory?: string;
    tableName?: string;
    strategy?: 'safe' | 'force' | 'dry-run';
    beforeMigrate?: (migration: any) => Promise<void>;
    afterMigrate?: (migration: any) => Promise<void>;
    rollbackOnError?: boolean;
    validateChecksum?: boolean;
  };
  typeMappings?: {
    pg_to_js?: Record<string, (value: any) => any>;
    js_to_pg?: Record<string, (value: any) => any>;
  };
  poolSize?: number;
  ssl?: boolean | any;
}

export class DBBridge {
  private static instances: Map<string, DBBridge> = new Map();
  private adapter: DatabaseAdapter;
  private connected: boolean = false;
  
  public readonly options: ClientOptions;

  constructor(options: ClientOptions) {
    this.options = options;
    this.adapter = this.createAdapter();
  }

  /**
   * Create a new database client
   * 
   * @example
   * ```ts
   * const db = DBBridge.create({
   *   provider: 'mysql',
   *   url: 'mysql://user:pass@localhost:3306/mydb'
   * });
   * ```
   */
  static create(options: ClientOptions): DBBridge {
    return new DBBridge(options);
  }

  /**
   * Get or create a singleton instance
   * 
   * @example
   * ```ts
   * const db = DBBridge.getInstance('main', {
   *   provider: 'postgresql',
   *   url: process.env.DATABASE_URL
   * });
   * ```
   */
  static getInstance(name: string, options?: ClientOptions): DBBridge {
    if (!this.instances.has(name)) {
      if (!options) {
        throw new Error(`Instance "${name}" not found and no options provided`);
      }
      this.instances.set(name, new DBBridge(options));
    }
    return this.instances.get(name)!;
  }

  /**
   * Create from connection string
   * 
   * @example
   * ```ts
   * const db = DBBridge.fromUrl('postgresql://user:pass@localhost/mydb');
   * ```
   */
  static fromUrl(url: string, options?: Partial<ClientOptions>): DBBridge {
    const provider = this.parseProvider(url);
    return new DBBridge({
      provider,
      url,
      ...options,
    });
  }

  private static parseProvider(url: string): ClientOptions['provider'] {
    if (url.startsWith('mysql://')) return 'mysql';
    if (url.startsWith('postgresql://') || url.startsWith('postgres://')) return 'postgresql';
    throw new Error(`Unsupported database URL: ${url}`);
  }

  private createAdapter(): DatabaseAdapter {
    const logger = this.options.logger === true 
      ? console 
      : this.options.logger || undefined;

    let crypto: CryptoProvider | undefined;
    if (this.options.encryption) {
      const encryptionOpts = this.options.encryption === true ? {} : this.options.encryption;
      crypto = new CryptoProvider({
        algorithm: encryptionOpts.algorithm,
      });
      if (encryptionOpts.key) {
        process.env['DB_BRIDGE_ENCRYPTION_KEY'] = encryptionOpts.key;
      }
    }

    let adapter: DatabaseAdapter;

    // Dynamically load adapters to avoid circular dependencies
    switch (this.options.provider) {
      case 'mysql': {
        const { MySQLAdapter } = require('@db-bridge/mysql');
        adapter = new MySQLAdapter({ logger, crypto });
        break;
      }
      case 'postgresql':
      case 'postgres': {
        const { PostgreSQLAdapter } = require('@db-bridge/postgresql');
        adapter = new PostgreSQLAdapter({ logger, crypto });
        break;
      }
      default:
        throw new Error(`Unsupported provider: ${this.options.provider}`);
    }

    // Wrap with caching if enabled
    if (this.options.cache) {
      const cacheOpts = this.options.cache === true ? { provider: 'redis' as const } : this.options.cache;
      if (cacheOpts.provider === 'redis') {
        const { RedisAdapter } = require('@db-bridge/redis');
        const redisAdapter = new RedisAdapter({ logger }) as CacheAdapter;
        if (cacheOpts.url || cacheOpts.connection) {
          // Connect to Redis will be handled in connect()
        }
        adapter = new CachedAdapter({
          adapter,
          cache: redisAdapter,
          enabled: true,
        });
      }
    }

    return adapter;
  }

  private parseConnectionUrl(url: string): ConnectionConfig {
    const urlObj = new URL(url);
    return {
      host: urlObj.hostname,
      port: parseInt(urlObj.port) || (this.options.provider === 'mysql' ? 3306 : 5432),
      user: urlObj.username,
      password: urlObj.password,
      database: urlObj.pathname.slice(1),
      ssl: this.options.ssl,
    };
  }

  /**
   * Connect to the database
   */
  async connect(): Promise<void> {
    if (this.connected) return;

    const config = this.options.url 
      ? this.parseConnectionUrl(this.options.url)
      : this.options.connection;

    if (!config) {
      throw new Error('No connection configuration provided');
    }

    await this.adapter.connect({
      ...config,
      poolSize: this.options.poolSize || config.poolSize,
    });

    // Connect to cache if needed
    if (this.options.cache && this.adapter instanceof CachedAdapter) {
      const cacheOpts = this.options.cache === true ? { provider: 'redis' as const } : this.options.cache;
      const cacheAdapter = (this.adapter as any).cache;
      
      if (cacheOpts.url) {
        await cacheAdapter.connect(this.parseConnectionUrl(cacheOpts.url));
      } else if (cacheOpts.connection) {
        await cacheAdapter.connect(cacheOpts.connection);
      } else {
        // Default Redis connection
        await cacheAdapter.connect({ host: 'localhost', port: 6379 });
      }
    }

    this.connected = true;
  }

  /**
   * Get a query builder
   * 
   * @example
   * ```ts
   * const users = await db.from('users')
   *   .select('id', 'name', 'email')
   *   .where({ active: true })
   *   .limit(10);
   * ```
   */
  from<T = any>(table: string, alias?: string) {
    return this.adapter.createQueryBuilder<T>().from(table, alias);
  }

  /**
   * Execute a raw query
   * 
   * @example
   * ```ts
   * const result = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
   * ```
   */
  async query<T = any>(sql: string, params?: any[]) {
    return this.adapter.query<T>(sql, params);
  }

  /**
   * Insert data
   * 
   * @example
   * ```ts
   * await db.insert('users', { name: 'John', email: 'john@example.com' });
   * ```
   */
  async insert<T = any>(table: string, data: Record<string, any> | Record<string, any>[]) {
    return this.adapter.createQueryBuilder<T>().insert(table, data).execute();
  }

  /**
   * Update data
   * 
   * @example
   * ```ts
   * await db.update('users', { name: 'Jane' }, { id: userId });
   * ```
   */
  async update<T = any>(table: string, data: Record<string, any>, where: Record<string, any>) {
    return this.adapter.createQueryBuilder<T>()
      .update(table, data)
      .where(where)
      .execute();
  }

  /**
   * Delete data
   * 
   * @example
   * ```ts
   * await db.delete('users', { id: userId });
   * ```
   */
  async delete<T = any>(table: string, where: Record<string, any>) {
    return this.adapter.createQueryBuilder<T>()
      .delete(table)
      .where(where)
      .execute();
  }

  /**
   * Start a transaction
   * 
   * @example
   * ```ts
   * const tx = await db.transaction();
   * try {
   *   await tx.query('INSERT INTO...');
   *   await tx.commit();
   * } catch (error) {
   *   await tx.rollback();
   * }
   * ```
   */
  async transaction() {
    return this.adapter.beginTransaction();
  }

  /**
   * Disconnect from the database
   */
  async disconnect(): Promise<void> {
    if (!this.connected) return;
    
    await this.adapter.disconnect();
    
    // Disconnect from cache if needed
    if (this.adapter instanceof CachedAdapter) {
      const cacheAdapter = (this.adapter as any).cache;
      await cacheAdapter.disconnect();
    }
    
    this.connected = false;
  }

  /**
   * Get the underlying adapter
   */
  getAdapter(): DatabaseAdapter {
    return this.adapter;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Ping the database
   */
  async ping(): Promise<boolean> {
    return this.adapter.ping();
  }
}
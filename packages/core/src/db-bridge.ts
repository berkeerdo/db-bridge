import { MySQLDialect, PostgreSQLDialect } from './dialect';
import { DatabaseError } from './errors';
import { createModularQueryBuilder } from './query';

import type { SQLDialect } from './dialect';
import type { ConnectionConfig, DatabaseAdapter, QueryBuilder } from './interfaces';
import type { ModularQueryBuilder, QueryExecutor, ExecuteResult } from './query';
import type { QueryResult } from './types';

/**
 * Supported database types
 */
export enum DatabaseType {
  MySQL = 'mysql',
  PostgreSQL = 'postgresql',
  Postgres = 'postgres', // Alias for PostgreSQL
  Redis = 'redis',
}

// Also export as string literal type for backward compatibility
export type DatabaseTypeString = 'mysql' | 'postgresql' | 'postgres' | 'redis';

export interface DBBridgeConfig {
  type: DatabaseType | DatabaseTypeString;
  connection: ConnectionConfig;
  options?: {
    logging?: boolean;
    logger?: any;
    /** Auto-connect on creation (default: false) */
    autoConnect?: boolean;
    /** @deprecated Use connection.pool instead */
    pool?: {
      min?: number;
      max?: number;
    };
  };
}

/**
 * DBBridge - Simple and user-friendly database interface
 *
 * @example
 * ```typescript
 * // Basic usage
 * const db = DBBridge.mysql({
 *   host: 'localhost',
 *   user: 'root',
 *   password: '',
 *   database: 'mydb'
 * });
 *
 * await db.connect();
 *
 * // Query builder
 * const users = await db.table('users')
 *   .where('active', true)
 *   .orderBy('created_at', 'desc')
 *   .get();
 * ```
 */
export class DBBridge {
  private adapter?: DatabaseAdapter;
  private readonly config: DBBridgeConfig;
  private _dialect?: SQLDialect;
  private _queryBuilder?: ModularQueryBuilder;

  constructor(config: DBBridgeConfig) {
    this.config = config;
  }

  /**
   * Create MySQL instance (requires manual connect())
   */
  static mysql(connection: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: DatabaseType.MySQL,
      connection,
      options,
    });
  }

  /**
   * Create and connect to MySQL database
   *
   * @param connection - Connection configuration
   * @param options - Additional options
   * @param autoConnect - Whether to auto-connect (default: true)
   *
   * @example
   * ```typescript
   * // Auto-connect (default)
   * const db = await DBBridge.createMySQL({
   *   host: 'localhost',
   *   user: 'root',
   *   database: 'mydb'
   * });
   * // Ready to use - no connect() needed!
   *
   * // Without auto-connect
   * const db = await DBBridge.createMySQL(config, null, false);
   * await db.connect(); // Connect when ready
   * ```
   */
  static async createMySQL(
    connection: ConnectionConfig,
    options?: any,
    autoConnect = true,
  ): Promise<DBBridge> {
    const db = DBBridge.mysql(connection, options);
    if (autoConnect) {
      await db.connect();
    }
    return db;
  }

  /**
   * Create PostgreSQL instance (requires manual connect())
   */
  static postgresql(connection: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: DatabaseType.PostgreSQL,
      connection,
      options,
    });
  }

  /**
   * Create and connect to PostgreSQL database
   *
   * @param connection - Connection configuration
   * @param options - Additional options
   * @param autoConnect - Whether to auto-connect (default: true)
   *
   * @example
   * ```typescript
   * // Auto-connect (default)
   * const db = await DBBridge.createPostgreSQL({
   *   host: 'localhost',
   *   user: 'postgres',
   *   database: 'mydb'
   * });
   * // Ready to use!
   *
   * // Without auto-connect
   * const db = await DBBridge.createPostgreSQL(config, null, false);
   * ```
   */
  static async createPostgreSQL(
    connection: ConnectionConfig,
    options?: any,
    autoConnect = true,
  ): Promise<DBBridge> {
    const db = DBBridge.postgresql(connection, options);
    if (autoConnect) {
      await db.connect();
    }
    return db;
  }

  /**
   * Create Redis instance (requires manual connect())
   */
  static redis(connection?: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: DatabaseType.Redis,
      connection: connection || { host: 'localhost', port: 6379 },
      options,
    });
  }

  /**
   * Create and connect to Redis
   *
   * @param connection - Connection configuration
   * @param options - Additional options
   * @param autoConnect - Whether to auto-connect (default: true)
   *
   * @example
   * ```typescript
   * // Auto-connect (default)
   * const redis = await DBBridge.createRedis({
   *   host: 'localhost',
   *   port: 6379
   * });
   * // Ready to use!
   *
   * // Without auto-connect
   * const redis = await DBBridge.createRedis(config, null, false);
   * ```
   */
  static async createRedis(
    connection?: ConnectionConfig,
    options?: any,
    autoConnect = true,
  ): Promise<DBBridge> {
    const db = DBBridge.redis(connection, options);
    if (autoConnect) {
      await db.connect();
    }
    return db;
  }

  /**
   * Generic factory method - create and optionally connect
   *
   * @param config - Database configuration
   * @param autoConnect - Whether to auto-connect (default: true)
   *
   * @example
   * ```typescript
   * // Auto-connect enabled (default)
   * const db = await DBBridge.create({
   *   type: DatabaseType.MySQL,
   *   connection: { host: 'localhost', database: 'test' }
   * });
   *
   * // Auto-connect disabled
   * const db = await DBBridge.create({
   *   type: DatabaseType.MySQL,
   *   connection: { host: 'localhost', database: 'test' }
   * }, false);
   * await db.connect(); // Manual connect when ready
   * ```
   */
  static async create(config: DBBridgeConfig, autoConnect = true): Promise<DBBridge> {
    const db = new DBBridge(config);
    if (autoConnect) {
      await db.connect();
    }
    return db;
  }

  /**
   * Connect to database
   */
  async connect(): Promise<void> {
    // Create adapter based on type (will be loaded dynamically at runtime)
    const adapterModule = await this.loadAdapter();
    this.adapter = adapterModule;
    await this.adapter.connect(this.config.connection);
  }

  /**
   * Load adapter dynamically
   */
  private async loadAdapter(): Promise<DatabaseAdapter> {
    const dbType = this.config.type;

    // Enum values are string literals, so this handles both
    switch (dbType) {
      case 'mysql': {
        return this.loadMySQLAdapter();
      }

      case 'postgresql':
      case 'postgres': {
        return this.loadPostgreSQLAdapter();
      }

      case 'redis': {
        return this.loadRedisAdapter();
      }

      default: {
        throw new DatabaseError(`Unsupported database type: ${dbType}`);
      }
    }
  }

  private async loadRedisAdapter(): Promise<DatabaseAdapter> {
    try {
      let redisModule: any;

      // Try dynamic import first (for ESM)
      try {
        redisModule = await (import('@db-bridge/redis') as Promise<any>);
      } catch {
        // Fallback to require (for CJS)
        redisModule = require('@db-bridge/redis');
      }

      const RedisAdapter = redisModule.RedisAdapter || redisModule.default?.RedisAdapter;
      if (!RedisAdapter) {
        throw new Error('RedisAdapter not found in module');
      }

      const adapter = new RedisAdapter(
        this.config.options?.logger
          ? {
              logger: this.config.options.logger,
            }
          : {},
      );
      return adapter as DatabaseAdapter;
    } catch {
      throw new DatabaseError('Redis adapter not installed. Run: npm install @db-bridge/redis');
    }
  }

  private async loadMySQLAdapter(): Promise<DatabaseAdapter> {
    try {
      let mysqlModule: any;

      // Try dynamic import first (for ESM)
      try {
        mysqlModule = await (import('@db-bridge/mysql') as Promise<any>);
      } catch {
        // Fallback to require (for CJS)
        mysqlModule = require('@db-bridge/mysql');
      }

      const MySQLAdapter = mysqlModule.MySQLAdapter || mysqlModule.default?.MySQLAdapter;
      if (!MySQLAdapter) {
        throw new Error('MySQLAdapter not found in module');
      }

      const adapter = new MySQLAdapter(
        this.config.options?.logger
          ? {
              logger: this.config.options.logger,
            }
          : {},
      );
      return adapter as DatabaseAdapter;
    } catch {
      throw new DatabaseError('MySQL adapter not installed. Run: npm install @db-bridge/mysql');
    }
  }

  private async loadPostgreSQLAdapter(): Promise<DatabaseAdapter> {
    try {
      let pgModule: any;

      // Try dynamic import first (for ESM)
      try {
        pgModule = await (import('@db-bridge/postgresql') as Promise<any>);
      } catch {
        // Fallback to require (for CJS)
        pgModule = require('@db-bridge/postgresql');
      }

      const PostgreSQLAdapter = pgModule.PostgreSQLAdapter || pgModule.default?.PostgreSQLAdapter;
      if (!PostgreSQLAdapter) {
        throw new Error('PostgreSQLAdapter not found in module');
      }

      const adapter = new PostgreSQLAdapter(
        this.config.options?.logger
          ? {
              logger: this.config.options.logger,
            }
          : {},
      );
      return adapter as DatabaseAdapter;
    } catch {
      throw new DatabaseError(
        'PostgreSQL adapter not installed. Run: npm install @db-bridge/postgresql',
      );
    }
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
    }
  }

  /**
   * Execute raw SQL query
   */
  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; fields?: any[] }> {
    this.ensureConnected();
    return this.adapter!.query(sql, params);
  }

  /**
   * Execute SQL command (INSERT, UPDATE, DELETE)
   */
  async execute(sql: string, params?: any[]): Promise<any> {
    this.ensureConnected();
    return this.adapter!.execute(sql, params);
  }

  /**
   * Get query builder for table
   */
  table<T = any>(tableName: string): QueryBuilder<T> {
    this.ensureConnected();
    const qb = this.adapter!.createQueryBuilder<T>();
    return this.configureQueryBuilder(qb, tableName);
  }

  /**
   * Configure query builder with table
   */
  private configureQueryBuilder<T>(qb: any, tableName: string): QueryBuilder<T> {
    // Try common methods
    if (typeof qb.table === 'function') {
      return qb.table(tableName);
    }
    if (typeof qb.from === 'function') {
      return qb.from(tableName);
    }
    // As last resort, set internal property if exists
    if ('_table' in qb || 'tableName' in qb) {
      qb._table = tableName;
      qb.tableName = tableName;
      return qb;
    }
    throw new DatabaseError('Query builder does not support table selection');
  }

  /**
   * from() method - alias for table()
   */
  from<T = any>(tableName: string): QueryBuilder<T> {
    return this.table<T>(tableName);
  }

  /**
   * Start a transaction
   */
  async transaction<T>(callback: (trx: any) => Promise<T>): Promise<T> {
    this.ensureConnected();
    const trx = await this.adapter!.beginTransaction();

    try {
      const result = await callback(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  /**
   * Create prepared statement
   */
  async prepare(sql: string, options?: any): Promise<any> {
    this.ensureConnected();
    return this.adapter!.prepare(sql, options);
  }

  /**
   * Ensure connected
   */
  private ensureConnected(): void {
    if (!this.adapter) {
      throw new DatabaseError('Not connected. Call connect() first.');
    }
  }

  /**
   * Get adapter (for advanced usage)
   */
  getAdapter(): DatabaseAdapter | undefined {
    return this.adapter;
  }

  /**
   * Get SQL dialect for current database type
   * Auto-selects MySQL or PostgreSQL dialect based on configuration
   */
  getDialect(): SQLDialect {
    if (!this._dialect) {
      const dbType = this.config.type;

      // Enum values are string literals, so this handles both
      switch (dbType) {
        case 'mysql': {
          this._dialect = new MySQLDialect();
          break;
        }
        case 'postgresql':
        case 'postgres': {
          this._dialect = new PostgreSQLDialect();
          break;
        }
        case 'redis': {
          throw new DatabaseError('Redis does not support SQL dialects');
        }
        default: {
          throw new DatabaseError(`Unsupported database type for dialect: ${dbType}`);
        }
      }
    }
    return this._dialect;
  }

  /**
   * Get dialect-aware modular query builder
   *
   * The query builder auto-adapts SQL syntax based on database type:
   * - MySQL: Uses backticks (`) and ? placeholders
   * - PostgreSQL: Uses double quotes (") and $1, $2 placeholders
   *
   * @example
   * ```typescript
   * // Works the same for MySQL and PostgreSQL
   * const users = await db.qb()
   *   .select('id', 'name', 'email')
   *   .from('users')
   *   .where('active', true)
   *   .orderBy('created_at', 'DESC')
   *   .limit(10)
   *   .get();
   *
   * // Insert with auto-syntax
   * await db.qb()
   *   .insert()
   *   .into('users')
   *   .values({ name: 'John', email: 'john@example.com' })
   *   .execute();
   *
   * // PostgreSQL-specific: RETURNING clause works automatically
   * const inserted = await db.qb()
   *   .insert()
   *   .into('users')
   *   .values({ name: 'John' })
   *   .returning('id', 'created_at')
   *   .execute();
   * ```
   */
  qb(): ModularQueryBuilder {
    this.ensureConnected();

    if (!this._queryBuilder) {
      const dialect = this.getDialect();
      const adapter = this.adapter!;

      // Create executor that wraps the adapter
      const executor: QueryExecutor = {
        async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
          const result = await adapter.query<T>(sql, params as any);
          return {
            rows: result.rows,
            rowCount: result.rows.length,
            fields: result.fields,
          };
        },
        async execute(sql: string, params?: unknown[]): Promise<ExecuteResult> {
          const result = await adapter.execute(sql, params as any);
          return {
            affectedRows: result.affectedRows ?? 0,
            insertId: result.insertId,
            changedRows: (result as any).changedRows,
          };
        },
      };

      this._queryBuilder = createModularQueryBuilder({
        dialect,
        executor,
      });
    }

    return this._queryBuilder;
  }

  /**
   * Get database type
   */
  getDatabaseType(): DatabaseType | DatabaseTypeString {
    return this.config.type;
  }
}

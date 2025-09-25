import { ConnectionConfig, DatabaseAdapter, QueryBuilder } from './interfaces';
import { DatabaseError } from './errors';

export type DatabaseType = 'mysql' | 'postgresql' | 'postgres' | 'redis';

export interface DBBridgeConfig {
  type: DatabaseType;
  connection: ConnectionConfig;
  options?: {
    logging?: boolean;
    logger?: any;
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

  constructor(config: DBBridgeConfig) {
    this.config = config;
  }

  /**
   * Create MySQL instance
   */
  static mysql(connection: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: 'mysql',
      connection,
      options
    });
  }

  /**
   * Create PostgreSQL instance
   */
  static postgresql(connection: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: 'postgresql',
      connection,
      options
    });
  }

  /**
   * Create Redis instance
   */
  static redis(connection?: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: 'redis',
      connection: connection || { host: 'localhost', port: 6379 },
      options
    });
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
    switch (this.config.type) {
      case 'mysql':
        return this.loadMySQLAdapter();
      
      case 'postgresql':
      case 'postgres':
        return this.loadPostgreSQLAdapter();
      
      case 'redis':
        return this.loadRedisAdapter();
      
      default:
        throw new DatabaseError(`Unsupported database type: ${this.config.type}`);
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
      
      const adapter = new RedisAdapter(this.config.options?.logger ? {
        logger: this.config.options.logger
      } : {});
      return adapter as DatabaseAdapter;
    } catch (error) {
      throw new DatabaseError(
        'Redis adapter not installed. Run: npm install @db-bridge/redis'
      );
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
      
      const adapter = new MySQLAdapter(this.config.options?.logger ? {
        logger: this.config.options.logger
      } : {});
      return adapter as DatabaseAdapter;
    } catch (error) {
      throw new DatabaseError(
        'MySQL adapter not installed. Run: npm install @db-bridge/mysql'
      );
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
      
      const adapter = new PostgreSQLAdapter(this.config.options?.logger ? {
        logger: this.config.options.logger
      } : {});
      return adapter as DatabaseAdapter;
    } catch (error) {
      throw new DatabaseError(
        'PostgreSQL adapter not installed. Run: npm install @db-bridge/postgresql'
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
}
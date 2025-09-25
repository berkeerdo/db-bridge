/**
 * Database connection configuration
 * @example
 * ```typescript
 * const config: ConnectionConfig = {
 *   host: 'localhost',
 *   port: 3306,
 *   user: 'root',
 *   password: 'password',
 *   database: 'mydb',
 *   pool: {
 *     min: 2,
 *     max: 100,
 *     acquireTimeout: 30000,
 *     idleTimeout: 60000
 *   }
 * };
 * ```
 */
export interface ConnectionConfig {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  connectionString?: string;
  ssl?: boolean | Record<string, unknown>;
  
  /** @deprecated Use pool.max instead */
  poolSize?: number;
  
  /** Pool configuration */
  pool?: PoolConfig;
  
  connectionTimeout?: number;
  idleTimeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  readonly?: boolean;
}

/**
 * Connection pool configuration
 */
export interface PoolConfig {
  /** Minimum number of connections in pool */
  min?: number;
  
  /** Maximum number of connections in pool */
  max?: number;
  
  /** Maximum time to wait for a connection (ms) */
  acquireTimeout?: number;
  
  /** Time before idle connection is closed (ms) */
  idleTimeout?: number;
  
  /** Whether to validate connections before use */
  validateOnBorrow?: boolean;
  
  /** Maximum connection lifetime (ms) */
  maxLifetime?: number;
  
  /** Maximum waiting requests in queue (0 = unlimited) */
  queueLimit?: number;
  
  /** Enable keep-alive on TCP socket */
  enableKeepAlive?: boolean;
  
  /** Keep-alive initial delay (ms) */
  keepAliveInitialDelay?: number;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  fields?: FieldInfo[];
  command?: string;
  duration?: number;
}

export interface FieldInfo {
  name: string;
  type: string;
  nullable: boolean;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  defaultValue?: unknown;
}

export interface TransactionOptions {
  isolationLevel?: IsolationLevel;
  readOnly?: boolean;
  deferrable?: boolean;
}

export enum IsolationLevel {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE',
}

export interface PreparedStatement<T = unknown> {
  execute(params?: unknown[]): Promise<QueryResult<T>>;
  release(): Promise<void>;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
  invalidateOn?: string[];
  compress?: boolean;
}

export interface QueryOptions {
  cache?: boolean | CacheOptions;
  timeout?: number;
  prepare?: boolean;
  transaction?: Transaction;
}

export interface Transaction {
  id: string;
  isActive: boolean;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  query<T = unknown>(sql: string, params?: QueryParams, options?: QueryOptions): Promise<QueryResult<T>>;
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  active: number;
}

export type QueryValue = string | number | boolean | Date | Buffer | null | undefined;
export type QueryParams = QueryValue[] | Record<string, QueryValue>;

export interface LogLevel {
  ERROR: 'error';
  WARN: 'warn';
  INFO: 'info';
  DEBUG: 'debug';
}

export interface Logger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}
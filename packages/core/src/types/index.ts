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
 *
 * Production defaults (when not specified):
 * - max: 10 connections
 * - acquireTimeout: 30000ms (30 seconds)
 * - idleTimeout: 60000ms (60 seconds)
 * - queueLimit: 100 (prevent memory exhaustion)
 * - queryTimeout: 30000ms (30 seconds)
 */
export interface PoolConfig {
  /** Minimum number of connections in pool (default: 0) */
  min?: number;

  /** Maximum number of connections in pool (default: 10) */
  max?: number;

  /**
   * Maximum time to wait for a connection from pool (ms)
   * If exceeded, throws PoolExhaustedError
   * Default: 30000 (30 seconds)
   */
  acquireTimeout?: number;

  /**
   * Time before idle connection is closed (ms)
   * Default: 60000 (60 seconds)
   */
  idleTimeout?: number;

  /** Whether to validate connections before use (default: false) */
  validateOnBorrow?: boolean;

  /**
   * Maximum connection lifetime (ms)
   * Connection will be closed after this time
   * Default: 0 (no limit)
   */
  maxLifetime?: number;

  /**
   * Maximum waiting requests in queue
   * When queue is full, new requests immediately fail with PoolExhaustedError
   * Set to 0 for unlimited (NOT recommended for production!)
   * Default: 100
   */
  queueLimit?: number;

  /**
   * Maximum time for a query to execute (ms)
   * If exceeded, query is cancelled and throws QueryTimeoutError
   * Default: 30000 (30 seconds)
   */
  queryTimeout?: number;

  /** Enable keep-alive on TCP socket (default: true in production) */
  enableKeepAlive?: boolean;

  /** Keep-alive initial delay (ms) */
  keepAliveInitialDelay?: number;
}

export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
  affectedRows?: number;
  insertId?: number;
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
  close(): Promise<void>; // Alias for release() - industry standard naming
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
  query<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>>;
  execute<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>>;
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

// ============ Strict Types (Enhanced Type Safety) ============
export * from './strict-types';

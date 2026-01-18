/**
 * Strict Type Definitions
 *
 * Enhanced type definitions with:
 * - Discriminated unions for better type narrowing
 * - Strict generics for type-safe queries
 * - Branded types for runtime safety
 * - Utility types for common patterns
 */

// ============ Branded Types ============

/**
 * Branded type for SQL strings (prevents SQL injection at type level)
 */
declare const __brand: unique symbol;
type Brand<T, B> = T & { [__brand]: B };

export type SafeSQL = Brand<string, 'SafeSQL'>;
export type TableName = Brand<string, 'TableName'>;
export type ColumnName = Brand<string, 'ColumnName'>;

/**
 * Create a safe SQL string (should be used with parameterized queries)
 */
export function sql(strings: TemplateStringsArray, ..._values: unknown[]): SafeSQL {
  // This is a tagged template that marks SQL as safe
  // Values should be passed as parameters, not interpolated
  return strings.join('?') as SafeSQL;
}

// ============ Discriminated Union for Connection Config ============

/**
 * Host-based connection configuration
 */
export interface HostConnectionConfig {
  type: 'host';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: SSLConfig;
  pool?: StrictPoolConfig;
}

/**
 * Connection string based configuration
 */
export interface ConnectionStringConfig {
  type: 'connectionString';
  connectionString: string;
  ssl?: SSLConfig;
  pool?: StrictPoolConfig;
}

/**
 * Strict connection config - must be one or the other
 */
export type StrictConnectionConfig = HostConnectionConfig | ConnectionStringConfig;

/**
 * SSL configuration options
 */
export interface SSLConfig {
  enabled: boolean;
  rejectUnauthorized?: boolean;
  ca?: string | Buffer;
  cert?: string | Buffer;
  key?: string | Buffer;
}

/**
 * Strict pool configuration with defaults
 */
export interface StrictPoolConfig {
  min: number;
  max: number;
  acquireTimeout: number;
  idleTimeout: number;
  validateOnBorrow?: boolean;
  maxLifetime?: number;
}

// ============ Discriminated Union for Query Results ============

/**
 * Base query result
 */
interface BaseQueryResult {
  duration: number;
  command: SQLCommand;
}

/**
 * SELECT query result
 */
export interface SelectResult<T> extends BaseQueryResult {
  command: 'SELECT';
  rows: T[];
  rowCount: number;
  fields: StrictFieldInfo[];
}

/**
 * INSERT query result
 */
export interface InsertResult extends BaseQueryResult {
  command: 'INSERT';
  insertId: number | bigint;
  affectedRows: number;
}

/**
 * UPDATE query result
 */
export interface UpdateResult extends BaseQueryResult {
  command: 'UPDATE';
  affectedRows: number;
  changedRows: number;
}

/**
 * DELETE query result
 */
export interface DeleteResult extends BaseQueryResult {
  command: 'DELETE';
  affectedRows: number;
}

/**
 * Discriminated union of all query results
 */
export type StrictQueryResult<T = unknown> =
  | SelectResult<T>
  | InsertResult
  | UpdateResult
  | DeleteResult;

/**
 * SQL command types
 */
export type SQLCommand =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'CREATE'
  | 'ALTER'
  | 'DROP'
  | 'TRUNCATE'
  | 'BEGIN'
  | 'COMMIT'
  | 'ROLLBACK';

// ============ Strict Field Info ============

/**
 * Known database field types
 */
export type FieldType =
  // String types
  | 'varchar'
  | 'char'
  | 'text'
  | 'mediumtext'
  | 'longtext'
  | 'enum'
  | 'set'
  // Numeric types
  | 'int'
  | 'tinyint'
  | 'smallint'
  | 'mediumint'
  | 'bigint'
  | 'decimal'
  | 'float'
  | 'double'
  | 'numeric'
  // Date/Time types
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'time'
  | 'year'
  // Binary types
  | 'blob'
  | 'binary'
  | 'varbinary'
  // Other types
  | 'json'
  | 'jsonb'
  | 'uuid'
  | 'boolean'
  | 'bool'
  // Fallback
  | 'unknown';

/**
 * Strict field info with known types
 */
export interface StrictFieldInfo {
  name: string;
  type: FieldType;
  nullable: boolean;
  primaryKey: boolean;
  autoIncrement: boolean;
  defaultValue: unknown;
  maxLength?: number;
  precision?: number;
  scale?: number;
}

// ============ Type-Safe Query Builder Types ============

/**
 * Operator types for WHERE clauses
 */
export type ComparisonOperator = '=' | '!=' | '<>' | '>' | '<' | '>=' | '<=';
export type LikeOperator = 'LIKE' | 'NOT LIKE' | 'ILIKE';
export type NullOperator = 'IS NULL' | 'IS NOT NULL';
export type InOperator = 'IN' | 'NOT IN';
export type BetweenOperator = 'BETWEEN' | 'NOT BETWEEN';

export type WhereOperator =
  | ComparisonOperator
  | LikeOperator
  | NullOperator
  | InOperator
  | BetweenOperator;

/**
 * Join types
 */
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';

/**
 * Order direction
 */
export type OrderDirection = 'ASC' | 'DESC';

/**
 * Aggregate functions
 */
export type AggregateFunction = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';

// ============ Type-Safe Table Schema ============

/**
 * Define a table schema for type-safe queries
 */
export interface TableSchema<T extends Record<string, unknown>> {
  name: TableName;
  columns: {
    [K in keyof T]: ColumnDefinition<T[K]>;
  };
  primaryKey: keyof T;
}

/**
 * Column definition
 */
export interface ColumnDefinition<T> {
  type: FieldType;
  nullable: boolean;
  defaultValue?: T;
  autoIncrement?: boolean;
}

// ============ Utility Types ============

/**
 * Extract row type from query result
 */
export type ExtractRow<T> = T extends SelectResult<infer R> ? R : never;

/**
 * Make specific keys required
 */
export type RequireKeys<T, K extends keyof T> = T & Required<Pick<T, K>>;

/**
 * Make specific keys optional
 */
export type OptionalKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Type for insert data (omit auto-generated fields)
 */
export type InsertData<T, AutoFields extends keyof T = never> = Omit<T, AutoFields>;

/**
 * Type for update data (all fields optional except the ID field)
 */
export type UpdateData<T, IdField extends keyof T> = Partial<Omit<T, IdField>> & Pick<T, IdField>;

/**
 * Nullable version of a type
 */
export type Nullable<T> = T | null;

/**
 * Deep partial - makes all nested properties optional
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

/**
 * Deep required - makes all nested properties required
 */
export type DeepRequired<T> = {
  [P in keyof T]-?: T[P] extends object ? DeepRequired<T[P]> : T[P];
};

// ============ Type Guards ============

/**
 * Type guard for SelectResult
 */
export function isSelectResult<T>(result: StrictQueryResult<T>): result is SelectResult<T> {
  return result.command === 'SELECT';
}

/**
 * Type guard for InsertResult
 */
export function isInsertResult(result: StrictQueryResult): result is InsertResult {
  return result.command === 'INSERT';
}

/**
 * Type guard for UpdateResult
 */
export function isUpdateResult(result: StrictQueryResult): result is UpdateResult {
  return result.command === 'UPDATE';
}

/**
 * Type guard for DeleteResult
 */
export function isDeleteResult(result: StrictQueryResult): result is DeleteResult {
  return result.command === 'DELETE';
}

// ============ Constants ============

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: StrictPoolConfig = {
  min: 2,
  max: 10,
  acquireTimeout: 30_000,
  idleTimeout: 60_000,
  validateOnBorrow: true,
} as const;

/**
 * Default timeouts (in milliseconds)
 */
export const DEFAULT_TIMEOUTS = {
  connection: 10_000,
  query: 30_000,
  transaction: 60_000,
} as const;

/**
 * Isolation levels as const
 */
export const ISOLATION_LEVELS = {
  READ_UNCOMMITTED: 'READ UNCOMMITTED',
  READ_COMMITTED: 'READ COMMITTED',
  REPEATABLE_READ: 'REPEATABLE READ',
  SERIALIZABLE: 'SERIALIZABLE',
} as const;

export type StrictIsolationLevel = (typeof ISOLATION_LEVELS)[keyof typeof ISOLATION_LEVELS];

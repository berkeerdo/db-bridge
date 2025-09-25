# DB Bridge API Reference

## Table of Contents

- [Core Package](#core-package)
  - [DatabaseAdapter](#databaseadapter)
  - [QueryBuilder](#querybuilder)
  - [Transaction](#transaction)
  - [PreparedStatement](#preparedstatement)
  - [Error Classes](#error-classes)
  - [Utilities](#utilities)
- [MySQL Adapter](#mysql-adapter)
- [PostgreSQL Adapter](#postgresql-adapter)
- [Redis Adapter](#redis-adapter)
- [Cached Adapter](#cached-adapter)

## Core Package

### DatabaseAdapter

The main interface that all database adapters must implement.

```typescript
interface DatabaseAdapter {
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  query<T>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>>;
  execute(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult>;
  prepare(sql: string, name?: string): Promise<PreparedStatement>;
  beginTransaction(options?: TransactionOptions): Promise<Transaction>;
  createQueryBuilder<T>(): QueryBuilder<T>;
  escape(value: any): string;
  escapeIdentifier(identifier: string): string;
  getPoolStats(): PoolStats;
}
```

#### Methods

##### `connect(config: ConnectionConfig): Promise<void>`
Establishes connection to the database.

**Parameters:**
- `config`: Connection configuration object

**Example:**
```typescript
await adapter.connect({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'password',
  database: 'myapp'
});
```

##### `disconnect(): Promise<void>`
Closes all connections and cleans up resources.

##### `ping(): Promise<boolean>`
Tests if the connection is alive.

**Returns:** `true` if connection is active, `false` otherwise

##### `query<T>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>>`
Executes a SQL query and returns results.

**Parameters:**
- `sql`: SQL query string
- `params`: Optional array of query parameters
- `options`: Optional query execution options

**Returns:** QueryResult with typed rows

**Example:**
```typescript
const users = await adapter.query<User>(
  'SELECT * FROM users WHERE role = ?',
  ['admin']
);
```

##### `execute(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult>`
Executes a SQL statement (INSERT, UPDATE, DELETE).

**Returns:** QueryResult with affected rows and insert ID (if applicable)

##### `prepare(sql: string, name?: string): Promise<PreparedStatement>`
Creates a prepared statement for repeated execution.

**Parameters:**
- `sql`: SQL statement to prepare
- `name`: Optional name for the prepared statement

##### `beginTransaction(options?: TransactionOptions): Promise<Transaction>`
Starts a new database transaction.

**Parameters:**
- `options`: Optional transaction options (isolation level, etc.)

##### `createQueryBuilder<T>(): QueryBuilder<T>`
Creates a new query builder instance.

**Returns:** Fluent query builder interface

##### `escape(value: any): string`
Escapes a value for safe SQL inclusion.

**Parameters:**
- `value`: Value to escape

**Returns:** Escaped string safe for SQL

##### `escapeIdentifier(identifier: string): string`
Escapes an identifier (table/column name).

**Parameters:**
- `identifier`: Identifier to escape

**Returns:** Escaped identifier

##### `getPoolStats(): PoolStats`
Returns current connection pool statistics.

**Returns:** Object with pool statistics

### QueryBuilder

Fluent interface for building SQL queries programmatically.

```typescript
interface QueryBuilder<T> {
  // SELECT operations
  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  from(table: string, alias?: string): QueryBuilder<T>;
  
  // JOIN operations
  join(table: string, condition: string, type?: JoinType): QueryBuilder<T>;
  leftJoin(table: string, condition: string): QueryBuilder<T>;
  rightJoin(table: string, condition: string): QueryBuilder<T>;
  innerJoin(table: string, condition: string): QueryBuilder<T>;
  
  // WHERE conditions
  where(column: string, operator: string, value: any): QueryBuilder<T>;
  where(conditions: Record<string, any>): QueryBuilder<T>;
  whereIn(column: string, values: any[]): QueryBuilder<T>;
  whereNotIn(column: string, values: any[]): QueryBuilder<T>;
  whereBetween(column: string, min: any, max: any): QueryBuilder<T>;
  whereNotBetween(column: string, min: any, max: any): QueryBuilder<T>;
  whereNull(column: string): QueryBuilder<T>;
  whereNotNull(column: string): QueryBuilder<T>;
  orWhere(column: string, operator: string, value: any): QueryBuilder<T>;
  
  // Grouping and aggregation
  groupBy(...columns: string[]): QueryBuilder<T>;
  having(condition: string, value?: any): QueryBuilder<T>;
  
  // Ordering and limiting
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder<T>;
  limit(limit: number): QueryBuilder<T>;
  offset(offset: number): QueryBuilder<T>;
  
  // DML operations
  insert(table: string, data: Record<string, any> | Record<string, any>[]): QueryBuilder<T>;
  update(table: string, data: Record<string, any>): QueryBuilder<T>;
  delete(table: string): QueryBuilder<T>;
  
  // Advanced operations
  with(name: string, callback: (qb: QueryBuilder<any>) => QueryBuilder<any>): QueryBuilder<T>;
  union(query: QueryBuilder<any> | string, all?: boolean): QueryBuilder<T>;
  
  // Execution methods
  toSQL(): { sql: string; bindings: any[] };
  execute(options?: QueryOptions): Promise<QueryResult<T>>;
  first(options?: QueryOptions): Promise<T | null>;
  count(column?: string): Promise<number>;
  exists(): Promise<boolean>;
}
```

#### Common Usage Patterns

##### Basic SELECT Query
```typescript
const users = await qb
  .select('id', 'name', 'email')
  .from('users')
  .where('active', '=', true)
  .orderBy('created_at', 'DESC')
  .limit(10)
  .execute();
```

##### Complex JOIN Query
```typescript
const orders = await qb
  .select('o.*', 'u.name as user_name', 'p.name as product_name')
  .from('orders', 'o')
  .join('users u', 'u.id = o.user_id')
  .join('products p', 'p.id = o.product_id')
  .where('o.status', '=', 'pending')
  .where('o.total', '>', 100)
  .orderBy('o.created_at', 'DESC')
  .execute();
```

##### INSERT Operation
```typescript
await qb
  .insert('users', {
    name: 'John Doe',
    email: 'john@example.com',
    created_at: new Date()
  })
  .execute();

// Bulk insert
await qb
  .insert('users', [
    { name: 'User 1', email: 'user1@example.com' },
    { name: 'User 2', email: 'user2@example.com' },
    { name: 'User 3', email: 'user3@example.com' }
  ])
  .execute();
```

##### UPDATE Operation
```typescript
await qb
  .update('users', {
    last_login: new Date(),
    login_count: qb.raw('login_count + 1')
  })
  .where('id', '=', userId)
  .execute();
```

##### DELETE Operation
```typescript
await qb
  .delete('sessions')
  .where('expired_at', '<', new Date())
  .execute();
```

### Transaction

Interface for managing database transactions.

```typescript
interface Transaction {
  id: string;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  savepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  query<T>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
}
```

#### Transaction Isolation Levels

```typescript
enum IsolationLevel {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE'
}
```

#### Usage Example

```typescript
const tx = await adapter.beginTransaction({
  isolationLevel: IsolationLevel.READ_COMMITTED
});

try {
  await tx.execute('INSERT INTO accounts (balance) VALUES (?)', [1000]);
  
  await tx.savepoint('before_risky_operation');
  
  try {
    await riskyOperation(tx);
  } catch (error) {
    await tx.rollbackToSavepoint('before_risky_operation');
  }
  
  await tx.commit();
} catch (error) {
  await tx.rollback();
  throw error;
}
```

### PreparedStatement

Interface for prepared statements.

```typescript
interface PreparedStatement {
  name?: string;
  sql: string;
  execute(params?: any[]): Promise<QueryResult>;
  release(): Promise<void>;
}
```

#### Usage Example

```typescript
const stmt = await adapter.prepare(
  'SELECT * FROM products WHERE category = ? AND price < ?'
);

// Execute multiple times with different parameters
const electronics = await stmt.execute(['electronics', 1000]);
const books = await stmt.execute(['books', 50]);
const toys = await stmt.execute(['toys', 100]);

// Always release when done
await stmt.release();
```

### Error Classes

#### DatabaseError
Base error class for all database-related errors.

```typescript
class DatabaseError extends Error {
  code: string;
  cause?: Error;
}
```

#### ConnectionError
Thrown when connection fails.

```typescript
class ConnectionError extends DatabaseError {
  code = 'CONNECTION_ERROR';
  host?: string;
  port?: number;
}
```

#### QueryError
Thrown when query execution fails.

```typescript
class QueryError extends DatabaseError {
  code = 'QUERY_ERROR';
  sql?: string;
  params?: any[];
}
```

#### TransactionError
Thrown when transaction operations fail.

```typescript
class TransactionError extends DatabaseError {
  code = 'TRANSACTION_ERROR';
  transactionId?: string;
}

```

#### ValidationError
Thrown when input validation fails.

```typescript
class ValidationError extends DatabaseError {
  code = 'VALIDATION_ERROR';
  field?: string;
  value?: any;
}
```

#### TimeoutError
Thrown when operations timeout.

```typescript
class TimeoutError extends DatabaseError {
  code = 'TIMEOUT_ERROR';
  timeout?: number;
}
```

### Utilities

#### retry
Retries an operation with exponential backoff.

```typescript
function retry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    retryDelay?: number;
    exponentialBackoff?: boolean;
    onRetry?: (error: Error, attempt: number) => void;
  }
): Promise<T>
```

#### formatSQL
Formats SQL with parameters for logging.

```typescript
function formatSQL(sql: string, params?: any[]): string
```

#### validateIdentifier
Validates database identifiers.

```typescript
function validateIdentifier(identifier: string): void
```

## MySQL Adapter

MySQL-specific implementation of DatabaseAdapter.

### Additional Methods

#### `format(sql: string, values: any[]): string`
MySQL-specific SQL formatting.

#### `getConnection(): Promise<mysql.PoolConnection>`
Gets a connection from the pool.

### MySQL-Specific Options

```typescript
interface MySQLConnectionConfig extends ConnectionConfig {
  charset?: string;
  timezone?: string;
  ssl?: SslOptions;
  connectionLimit?: number;
  queueLimit?: number;
  waitForConnections?: boolean;
  enableKeepAlive?: boolean;
  keepAliveInitialDelay?: number;
}
```

## PostgreSQL Adapter

PostgreSQL-specific implementation of DatabaseAdapter.

### Additional Methods

#### `copyFrom(sql: string): Writable`
Returns a writable stream for COPY FROM operations.

#### `copyTo(sql: string): Readable`
Returns a readable stream for COPY TO operations.

#### `listen(channel: string): Promise<void>`
Listens for PostgreSQL notifications.

#### `notify(channel: string, payload?: string): Promise<void>`
Sends a PostgreSQL notification.

### PostgreSQL-Specific Options

```typescript
interface PostgreSQLConnectionConfig extends ConnectionConfig {
  ssl?: boolean | TlsOptions;
  statement_timeout?: number;
  query_timeout?: number;
  application_name?: string;
  connectionTimeoutMillis?: number;
  idle_in_transaction_session_timeout?: number;
}
```

## Redis Adapter

Redis adapter for caching and direct Redis operations.

### Methods

#### Cache Operations

##### `set(key: string, value: any, ttl?: number): Promise<void>`
Sets a cache value.

##### `get<T>(key: string): Promise<T | null>`
Gets a cached value.

##### `delete(key: string): Promise<boolean>`
Deletes a cache key.

##### `exists(key: string): Promise<boolean>`
Checks if a key exists.

##### `expire(key: string, ttl: number): Promise<void>`
Sets expiration on a key.

##### `ttl(key: string): Promise<number>`
Gets remaining TTL for a key.

##### `keys(pattern: string): Promise<string[]>`
Gets keys matching a pattern.

#### Batch Operations

##### `mset(items: Array<{key: string; value: any; ttl?: number}>): Promise<void>`
Sets multiple values.

##### `mget<T>(keys: string[]): Promise<(T | null)[]>`
Gets multiple values.

##### `mdel(keys: string[]): Promise<number>`
Deletes multiple keys.

#### Atomic Operations

##### `increment(key: string, by?: number): Promise<number>`
Atomically increments a value.

##### `decrement(key: string, by?: number): Promise<number>`
Atomically decrements a value.

### Redis Commands

Access all Redis commands through the `commands` property:

```typescript
const redis = new RedisAdapter();
const commands = redis.commands;

// String operations
await commands.set('key', 'value');
await commands.get('key');

// Hash operations
await commands.hset('hash', 'field', 'value');
await commands.hgetall('hash');

// List operations
await commands.lpush('list', 'item1', 'item2');
await commands.lrange('list', 0, -1);

// Set operations
await commands.sadd('set', 'member1', 'member2');
await commands.smembers('set');

// Sorted set operations
await commands.zadd('zset', 100, 'member1');
await commands.zrange('zset', 0, -1);
```

## Cached Adapter

Wraps any database adapter with caching capabilities.

### Constructor

```typescript
constructor(options: {
  adapter: DatabaseAdapter;
  cache: RedisAdapter;
  defaultTTL?: number;
  strategy?: 'lazy' | 'eager' | 'refresh';
  cacheableCommands?: string[];
  logger?: Logger;
})
```

### Cache Options

```typescript
interface CacheOptions {
  key?: string;
  ttl?: number;
  tags?: string[];
}
```

### Cache Manager Methods

##### `invalidate(keys: string[]): Promise<void>`
Invalidates specific cache keys.

##### `invalidateByTags(tags: string[]): Promise<void>`
Invalidates all keys with specified tags.

##### `invalidatePattern(pattern: string): Promise<void>`
Invalidates keys matching a pattern.

##### `invalidateAll(): Promise<void>`
Clears all cached data.

##### `getStatistics(): CacheStatistics`
Returns cache hit/miss statistics.

### Usage Example

```typescript
const cachedDb = new CachedAdapter({
  adapter: mysql,
  cache: redis,
  defaultTTL: 300,
  strategy: 'lazy'
});

// Query with caching
const users = await cachedDb.query(
  'SELECT * FROM users WHERE role = ?',
  ['admin'],
  {
    cache: {
      key: 'admin-users',
      ttl: 600,
      tags: ['users', 'admin']
    }
  }
);

// Invalidate by tag
await cachedDb.getCacheManager().invalidateByTags(['users']);
```

## Type Definitions

### ConnectionConfig

```typescript
interface ConnectionConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  [key: string]: any;
}
```

### QueryResult

```typescript
interface QueryResult<T = any> {
  rows: T[];
  fields?: FieldInfo[];
  rowCount: number;
  command?: string;
  duration?: number;
  insertId?: number | string;
  affectedRows?: number;
}
```

### QueryOptions

```typescript
interface QueryOptions {
  timeout?: number;
  transaction?: Transaction;
  cache?: CacheOptions | false;
  [key: string]: any;
}
```

### PoolStats

```typescript
interface PoolStats {
  total: number;
  active: number;
  idle: number;
  waiting: number;
}
```

### FieldInfo

```typescript
interface FieldInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary?: boolean;
  autoIncrement?: boolean;
  default?: any;
}
```
# @db-bridge/core

Core package for DB Bridge - Provides base classes, interfaces, and utilities for database adapters.

## Installation

```bash
npm install @db-bridge/core
```

## Overview

This package provides the foundation for all DB Bridge database adapters:

- **Base Classes**: Abstract implementations for adapters and query builders
- **Interfaces**: TypeScript interfaces for consistent API across adapters
- **Error Classes**: Typed errors for better error handling
- **Utilities**: Helper functions for retries, validation, and formatting
- **Types**: Common type definitions

## Core Components

### DatabaseAdapter

The main interface that all database adapters must implement:

```typescript
import { DatabaseAdapter } from '@db-bridge/core';

interface DatabaseAdapter {
  // Connection management
  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  
  // Query execution
  query<T>(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult<T>>;
  execute(sql: string, params?: any[], options?: QueryOptions): Promise<QueryResult>;
  
  // Prepared statements
  prepare(sql: string, name?: string): Promise<PreparedStatement>;
  
  // Transactions
  beginTransaction(options?: TransactionOptions): Promise<Transaction>;
  
  // Query builder
  createQueryBuilder<T>(): QueryBuilder<T>;
  
  // Utilities
  escape(value: any): string;
  escapeIdentifier(identifier: string): string;
  getPoolStats(): PoolStats;
}
```

### BaseAdapter

Abstract class providing common functionality for database adapters:

```typescript
import { BaseAdapter } from '@db-bridge/core';

class MyAdapter extends BaseAdapter {
  protected async doConnect(config: ConnectionConfig): Promise<void> {
    // Implementation
  }
  
  protected async doDisconnect(): Promise<void> {
    // Implementation
  }
  
  protected async doQuery<T>(
    sql: string,
    params?: any[],
    options?: QueryOptions
  ): Promise<QueryResult<T>> {
    // Implementation
  }
  
  // Other required methods...
}
```

### QueryBuilder

Fluent interface for building SQL queries:

```typescript
import { QueryBuilder } from '@db-bridge/core';

interface QueryBuilder<T> {
  // SELECT
  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  from(table: string, alias?: string): QueryBuilder<T>;
  
  // JOIN
  join(table: string, condition: string, type?: JoinType): QueryBuilder<T>;
  leftJoin(table: string, condition: string): QueryBuilder<T>;
  rightJoin(table: string, condition: string): QueryBuilder<T>;
  innerJoin(table: string, condition: string): QueryBuilder<T>;
  
  // WHERE
  where(column: string, operator: string, value: any): QueryBuilder<T>;
  where(conditions: Record<string, any>): QueryBuilder<T>;
  whereIn(column: string, values: any[]): QueryBuilder<T>;
  whereNotIn(column: string, values: any[]): QueryBuilder<T>;
  whereBetween(column: string, min: any, max: any): QueryBuilder<T>;
  whereNotBetween(column: string, min: any, max: any): QueryBuilder<T>;
  whereNull(column: string): QueryBuilder<T>;
  whereNotNull(column: string): QueryBuilder<T>;
  
  // Grouping & Ordering
  groupBy(...columns: string[]): QueryBuilder<T>;
  having(condition: string, value?: any): QueryBuilder<T>;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder<T>;
  
  // Limit & Offset
  limit(limit: number): QueryBuilder<T>;
  offset(offset: number): QueryBuilder<T>;
  
  // DML
  insert(table: string, data: Record<string, any> | Record<string, any>[]): QueryBuilder<T>;
  update(table: string, data: Record<string, any>): QueryBuilder<T>;
  delete(table: string): QueryBuilder<T>;
  
  // Execution
  toSQL(): { sql: string; bindings: any[] };
  execute(options?: QueryOptions): Promise<QueryResult<T>>;
  first(options?: QueryOptions): Promise<T | null>;
  count(column?: string): Promise<number>;
  exists(): Promise<boolean>;
}
```

### Transaction Interface

```typescript
import { Transaction, IsolationLevel } from '@db-bridge/core';

interface Transaction {
  id: string;
  
  // Transaction control
  commit(): Promise<void>;
  rollback(): Promise<void>;
  
  // Savepoints (if supported)
  savepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
  
  // Query execution within transaction
  query<T>(sql: string, params?: any[]): Promise<QueryResult<T>>;
  execute(sql: string, params?: any[]): Promise<QueryResult>;
}

// Isolation levels
enum IsolationLevel {
  READ_UNCOMMITTED = 'READ UNCOMMITTED',
  READ_COMMITTED = 'READ COMMITTED',
  REPEATABLE_READ = 'REPEATABLE READ',
  SERIALIZABLE = 'SERIALIZABLE'
}
```

### Error Classes

Typed errors for better error handling:

```typescript
import {
  DatabaseError,
  ConnectionError,
  QueryError,
  TransactionError,
  ValidationError,
  TimeoutError
} from '@db-bridge/core';

// Base error class
class DatabaseError extends Error {
  code: string;
  cause?: Error;
}

// Connection errors
class ConnectionError extends DatabaseError {
  code = 'CONNECTION_ERROR';
  host?: string;
  port?: number;
}

// Query errors
class QueryError extends DatabaseError {
  code = 'QUERY_ERROR';
  sql?: string;
  params?: any[];
}

// Transaction errors
class TransactionError extends DatabaseError {
  code = 'TRANSACTION_ERROR';
  transactionId?: string;
}

// Validation errors
class ValidationError extends DatabaseError {
  code = 'VALIDATION_ERROR';
  field?: string;
  value?: any;
}

// Timeout errors
class TimeoutError extends DatabaseError {
  code = 'TIMEOUT_ERROR';
  timeout?: number;
}
```

### Utilities

#### Retry Utility

```typescript
import { retry } from '@db-bridge/core/utils';

const result = await retry(
  async () => {
    return await riskyOperation();
  },
  {
    maxRetries: 3,
    retryDelay: 1000,
    exponentialBackoff: true,
    onRetry: (error, attempt) => {
      console.log(`Retry attempt ${attempt} after error:`, error);
    }
  }
);
```

#### SQL Utilities

```typescript
import { formatSQL, validateIdentifier } from '@db-bridge/core/utils';

// Format SQL for logging
const formatted = formatSQL('SELECT * FROM users WHERE id = ?', [123]);
// Output: "SELECT * FROM users WHERE id = 123"

// Validate identifiers
validateIdentifier('user_table'); // OK
validateIdentifier('users; DROP TABLE users'); // Throws ValidationError
```

#### Type Guards

```typescript
import { isConnectionError, isQueryError, isTransactionError } from '@db-bridge/core/utils';

try {
  await adapter.query('SELECT * FROM users');
} catch (error) {
  if (isQueryError(error)) {
    console.error('Query failed:', error.sql);
  } else if (isConnectionError(error)) {
    console.error('Connection lost');
  }
}
```

## Types

### Common Types

```typescript
// Connection configuration
interface ConnectionConfig {
  host: string;
  port?: number;
  user: string;
  password: string;
  database: string;
  [key: string]: any; // Adapter-specific options
}

// Query result
interface QueryResult<T = any> {
  rows: T[];
  fields?: FieldInfo[];
  rowCount: number;
  command?: string;
  duration?: number;
  insertId?: number | string;
  affectedRows?: number;
}

// Query options
interface QueryOptions {
  timeout?: number;
  transaction?: Transaction;
  cache?: CacheOptions | false;
  [key: string]: any; // Adapter-specific options
}

// Pool statistics
interface PoolStats {
  total: number;
  active: number;
  idle: number;
  waiting: number;
}

// Field information
interface FieldInfo {
  name: string;
  type: string;
  nullable: boolean;
  primary?: boolean;
  autoIncrement?: boolean;
  default?: any;
}
```

## Creating a Custom Adapter

To create a custom database adapter:

```typescript
import {
  BaseAdapter,
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  Transaction,
  PreparedStatement,
  ConnectionError,
  QueryError
} from '@db-bridge/core';

export class CustomAdapter extends BaseAdapter {
  private connection: any;
  
  protected async doConnect(config: ConnectionConfig): Promise<void> {
    try {
      this.connection = await customDriver.connect(config);
    } catch (error) {
      throw new ConnectionError('Failed to connect', { cause: error });
    }
  }
  
  protected async doDisconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
  }
  
  protected async doQuery<T>(
    sql: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    try {
      const result = await this.connection.query(sql, params);
      return {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields
      };
    } catch (error) {
      throw new QueryError('Query failed', {
        cause: error,
        sql,
        params
      });
    }
  }
  
  protected async doPing(): Promise<boolean> {
    try {
      await this.connection.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
  
  async beginTransaction(options?: TransactionOptions): Promise<Transaction> {
    // Implementation
  }
  
  async prepare(sql: string, name?: string): Promise<PreparedStatement> {
    // Implementation
  }
  
  escape(value: any): string {
    // Implementation
  }
  
  escapeIdentifier(identifier: string): string {
    // Implementation
  }
  
  getPoolStats(): PoolStats {
    // Implementation
  }
}
```

## Best Practices

1. **Extend BaseAdapter**: Always extend BaseAdapter for common functionality
2. **Use Typed Errors**: Throw appropriate error types for better error handling
3. **Implement Retry Logic**: Use the retry utility for transient failures
4. **Validate Input**: Use validation utilities for identifiers and values
5. **Type Everything**: Provide full TypeScript types for better developer experience
6. **Handle Cleanup**: Always clean up resources in disconnect/error handlers

## License

MIT © Berke Erdoğan
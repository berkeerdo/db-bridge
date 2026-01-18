// Legacy exports (for backward compatibility)
export { PostgreSQLAdapter } from './adapter/postgresql-adapter';
export type { PostgreSQLAdapterOptions } from './adapter/postgresql-adapter';
export { PostgreSQLTransaction } from './adapter/postgresql-transaction';
export { PostgreSQLPreparedStatement } from './adapter/postgresql-prepared-statement';
export { PostgreSQLQueryBuilder } from './query-builder/postgresql-query-builder';
export { PostgreSQLConnectionPool } from './pool/connection-pool';

// Note: New simplified API coming soon

// Re-export core types
export type {
  DatabaseAdapter,
  QueryBuilder,
  Transaction,
  PreparedStatement,
  ConnectionConfig,
  QueryResult,
  QueryOptions,
} from '@db-bridge/core';

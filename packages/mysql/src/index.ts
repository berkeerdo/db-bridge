// Legacy exports (for backward compatibility)
export { MySQLAdapter } from './adapter/mysql-adapter';
export type { MySQLAdapterOptions } from './adapter/mysql-adapter';
export { MySQLTransaction } from './adapter/mysql-transaction';
export { MySQLPreparedStatement } from './adapter/mysql-prepared-statement';
export { MySQLQueryBuilder } from './query-builder/mysql-query-builder';
export { MySQLConnectionPool } from './pool/connection-pool';

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

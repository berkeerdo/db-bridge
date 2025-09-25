import {
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  QueryParams,
  Transaction,
  TransactionOptions,
  PreparedStatement,
  PoolStats,
} from '../types';
import { QueryBuilder } from './query-builder';

export interface DatabaseAdapter {
  readonly name: string;
  readonly version: string;
  readonly isConnected: boolean;

  connect(config: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  
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
  
  prepare<T = unknown>(sql: string, name?: string): Promise<PreparedStatement<T>>;
  
  beginTransaction(options?: TransactionOptions): Promise<Transaction>;
  
  getPoolStats(): PoolStats;
  
  ping(): Promise<boolean>;
  
  escape(value: unknown): string;
  
  escapeIdentifier(identifier: string): string;
  
  createQueryBuilder<T = unknown>(): QueryBuilder<T>;
}
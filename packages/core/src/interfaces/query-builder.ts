import { QueryResult, QueryOptions } from '../types';

export interface QueryBuilder<T = unknown> {
  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  from(table: string, alias?: string): QueryBuilder<T>;
  join(table: string, on: string, type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'): QueryBuilder<T>;
  where(condition: string | Record<string, unknown>, operator?: string, value?: unknown): QueryBuilder<T>;
  where(column: string, operator: string, value: unknown): QueryBuilder<T>;
  whereIn(column: string, values: unknown[]): QueryBuilder<T>;
  whereNotIn(column: string, values: unknown[]): QueryBuilder<T>;
  whereBetween(column: string, min: unknown, max: unknown): QueryBuilder<T>;
  whereNull(column: string): QueryBuilder<T>;
  whereNotNull(column: string): QueryBuilder<T>;
  orWhere(condition: string | Record<string, unknown>, operator?: string, value?: unknown): QueryBuilder<T>;
  orWhere(column: string, operator: string, value: unknown): QueryBuilder<T>;
  groupBy(...columns: string[]): QueryBuilder<T>;
  having(condition: string): QueryBuilder<T>;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder<T>;
  limit(limit: number): QueryBuilder<T>;
  offset(offset: number): QueryBuilder<T>;
  
  insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
  update(table: string, data: Record<string, unknown>): QueryBuilder<T>;
  delete(table: string): QueryBuilder<T>;
  
  raw(sql: string, bindings?: unknown[]): QueryBuilder<T>;
  
  encrypt(...fields: string[]): QueryBuilder<T>;
  decrypt(...fields: string[]): QueryBuilder<T>;
  
  toSQL(): { sql: string; bindings: unknown[] };
  execute(options?: QueryOptions): Promise<QueryResult<T>>;
  first(options?: QueryOptions): Promise<T | null>;
  count(column?: string, options?: QueryOptions): Promise<number>;
  exists(options?: QueryOptions): Promise<boolean>;
}
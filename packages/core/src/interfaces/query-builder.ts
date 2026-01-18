import type { QueryResult, QueryOptions } from '../types';

/**
 * Pagination result interface
 */
export interface PaginationResult<T> {
  data: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
    from: number;
    to: number;
  };
}

/**
 * Cursor pagination result interface
 */
export interface CursorPaginationResult<T> {
  data: T[];
  nextCursor: number | string | null;
  hasMore: boolean;
}

export interface QueryBuilder<T = unknown> {
  // Selection
  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  from(table: string, alias?: string): QueryBuilder<T>;
  table(table: string, alias?: string): QueryBuilder<T>;
  distinct(): QueryBuilder<T>;

  // Joins
  join(table: string, on: string, type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'): QueryBuilder<T>;
  innerJoin(table: string, on: string): QueryBuilder<T>;
  leftJoin(table: string, on: string): QueryBuilder<T>;
  rightJoin(table: string, on: string): QueryBuilder<T>;
  fullJoin(table: string, on: string): QueryBuilder<T>;

  // Where clauses
  where(
    condition: string | Record<string, unknown>,
    operator?: string,
    value?: unknown,
  ): QueryBuilder<T>;
  where(column: string, operator: string, value: unknown): QueryBuilder<T>;
  whereIn(column: string, values: unknown[]): QueryBuilder<T>;
  whereNotIn(column: string, values: unknown[]): QueryBuilder<T>;
  whereBetween(column: string, min: unknown, max: unknown): QueryBuilder<T>;
  whereNull(column: string): QueryBuilder<T>;
  whereNotNull(column: string): QueryBuilder<T>;
  orWhere(
    condition: string | Record<string, unknown>,
    operator?: string,
    value?: unknown,
  ): QueryBuilder<T>;
  orWhere(column: string, operator: string, value: unknown): QueryBuilder<T>;

  // Date where clauses
  whereDate(column: string, operator: string, date: Date | string): QueryBuilder<T>;
  whereYear(column: string, operator: string, year: number): QueryBuilder<T>;
  whereMonth(column: string, operator: string, month: number): QueryBuilder<T>;
  whereDay(column: string, operator: string, day: number): QueryBuilder<T>;
  whereToday(column: string): QueryBuilder<T>;
  whereYesterday(column: string): QueryBuilder<T>;
  whereBetweenDates(
    column: string,
    startDate: Date | string,
    endDate: Date | string,
  ): QueryBuilder<T>;
  whereLastDays(column: string, days: number): QueryBuilder<T>;

  // Grouping & Ordering
  groupBy(...columns: string[]): QueryBuilder<T>;
  having(condition: string): QueryBuilder<T>;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder<T>;
  limit(limit: number): QueryBuilder<T>;
  offset(offset: number): QueryBuilder<T>;

  // CRUD operations
  insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
  update(table: string, data: Record<string, unknown>): QueryBuilder<T>;
  delete(table: string): QueryBuilder<T>;

  // Raw SQL
  raw(sql: string, bindings?: unknown[]): QueryBuilder<T>;

  // Encryption
  encrypt(...fields: string[]): QueryBuilder<T>;
  decrypt(...fields: string[]): QueryBuilder<T>;

  // SQL generation
  toSQL(): { sql: string; bindings: unknown[] };

  // Execution
  execute(options?: QueryOptions): Promise<QueryResult<T>>;
  first(options?: QueryOptions): Promise<T | null>;

  // Aggregate functions
  count(column?: string, options?: QueryOptions): Promise<number>;
  sum(column: string, options?: QueryOptions): Promise<number>;
  avg(column: string, options?: QueryOptions): Promise<number>;
  min(column: string, options?: QueryOptions): Promise<number | null>;
  max(column: string, options?: QueryOptions): Promise<number | null>;
  exists(options?: QueryOptions): Promise<boolean>;

  // Pagination
  paginate(page?: number, perPage?: number, options?: QueryOptions): Promise<PaginationResult<T>>;
  cursorPaginate(
    cursorColumn: string,
    cursor?: number | string | null,
    limit?: number,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<T>>;

  // Utility methods
  pluck<K = unknown>(column: string, options?: QueryOptions): Promise<K[]>;
  value<K = unknown>(column: string, options?: QueryOptions): Promise<K | null>;
  chunk(
    size: number,
    callback: (items: T[], page: number) => Promise<void | false>,
    options?: QueryOptions,
  ): Promise<void>;
}

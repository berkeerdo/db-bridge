/**
 * Base Query Builder
 *
 * Core query building functionality with modular organization.
 * Extended features are implemented via composition pattern.
 *
 * Related modules:
 * @see query-builder/date-filter-trait.ts - Date filter functions
 * @see query-builder/aggregate-trait.ts - Aggregate functions
 * @see query-builder/pagination-trait.ts - Pagination functions
 * @see query-builder/encryption-trait.ts - Encryption/decryption functions
 */

import { ValidationError } from './errors';
import * as dateFilterTrait from './query-builder/date-filter-trait';
import { validateTableName, validateColumnName } from './utils';

import type { CryptoProvider } from './crypto/crypto';
import type {
  QueryBuilder,
  DatabaseAdapter,
  PaginationResult,
  CursorPaginationResult,
} from './interfaces';
import type {
  QueryBuilderOptions,
  WhereClause,
  JoinClause,
} from './query-builder/query-builder-types';
import type { QueryResult, QueryOptions, QueryParams } from './types';

// Import and re-export types for backward compatibility

/**
 * Base Query Builder - Full-featured query builder
 *
 * Methods are organized into logical sections:
 * - Selection: select, from, table, distinct
 * - Joins: join, innerJoin, leftJoin, rightJoin, fullJoin
 * - Where clauses: where, orWhere, whereIn, whereNotIn, etc.
 * - Date filters: whereDate, whereToday, whereLastDays, etc.
 * - Grouping & Ordering: groupBy, having, orderBy, limit, offset
 * - Aggregates: count, sum, avg, min, max, exists
 * - Pagination: paginate, cursorPaginate, chunk
 * - Utilities: pluck, value, first, firstOrFail, sole
 * - CRUD: insert, update, delete
 * - Execution: execute, toSQL
 */
export abstract class BaseQueryBuilder<T = unknown> implements QueryBuilder<T> {
  protected adapter: DatabaseAdapter;
  protected escapeIdentifierFn: (identifier: string) => string;
  protected parameterPlaceholderFn: (index: number) => string;
  protected crypto?: CryptoProvider;
  protected encryptedFields: Set<string> = new Set();
  protected decryptedFields: Set<string> = new Set();

  // Query state
  protected selectColumns: string[] = ['*'];
  protected fromTable?: string;
  protected fromAlias?: string;
  protected joins: JoinClause[] = [];
  protected whereClauses: WhereClause[] = [];
  protected groupByColumns: string[] = [];
  protected havingClause?: string;
  protected orderByColumns: Array<{ column: string; direction: 'ASC' | 'DESC' }> = [];
  protected limitValue?: number;
  protected offsetValue?: number;
  protected bindings: unknown[] = [];
  protected isDistinct = false;

  // CRUD state
  protected insertTable?: string;
  protected insertData?: Record<string, unknown> | Record<string, unknown>[];
  protected updateTable?: string;
  protected updateData?: Record<string, unknown>;
  protected deleteTable?: string;

  // Raw SQL
  protected rawSql?: string;
  protected rawBindings?: unknown[];

  constructor(options: QueryBuilderOptions) {
    this.adapter = options.adapter;
    this.escapeIdentifierFn = options.escapeIdentifier || ((id) => `"${id}"`);
    this.parameterPlaceholderFn = options.parameterPlaceholder || ((index) => `$${index}`);
    this.crypto = options.crypto;
  }

  // ============================================
  // SELECTION
  // ============================================

  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  select(...args: Array<string | string[]>): QueryBuilder<T> {
    let cols: string[] = [];

    if (args.length === 1 && Array.isArray(args[0])) {
      cols = args[0];
    } else {
      cols = args.filter((arg) => typeof arg === 'string');
    }

    if (cols.length === 0) {
      this.selectColumns = ['*'];
    } else {
      this.selectColumns = cols
        .filter((col) => col && typeof col === 'string')
        .map((col) => {
          if (col === '*' || col.includes('.') || col.includes(' as ') || col.includes(' AS ')) {
            return col;
          }
          validateColumnName(col);
          return col;
        });
    }
    return this;
  }

  from(table: string, alias?: string): QueryBuilder<T> {
    validateTableName(table);
    this.fromTable = table;
    if (alias !== undefined) {
      this.fromAlias = alias;
    }
    return this;
  }

  table(table: string, alias?: string): QueryBuilder<T> {
    return this.from(table, alias);
  }

  distinct(): QueryBuilder<T> {
    this.isDistinct = true;
    return this;
  }

  // ============================================
  // JOINS
  // ============================================

  join(
    table: string,
    on: string,
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' = 'INNER',
  ): QueryBuilder<T> {
    const tableName = table.split(' ')[0];
    if (tableName) {
      validateTableName(tableName);
    }
    this.joins.push({ type, table, on });
    return this;
  }

  innerJoin(table: string, on: string): QueryBuilder<T> {
    return this.join(table, on, 'INNER');
  }

  leftJoin(table: string, on: string): QueryBuilder<T> {
    return this.join(table, on, 'LEFT');
  }

  rightJoin(table: string, on: string): QueryBuilder<T> {
    return this.join(table, on, 'RIGHT');
  }

  fullJoin(table: string, on: string): QueryBuilder<T> {
    return this.join(table, on, 'FULL');
  }

  // ============================================
  // WHERE CLAUSES
  // ============================================

  where(
    condition: string | Record<string, unknown>,
    operator?: string,
    value?: unknown,
  ): QueryBuilder<T>;
  where(column: string, operator: string, value: unknown): QueryBuilder<T>;
  where(...args: Array<string | Record<string, unknown> | undefined>): QueryBuilder<T> {
    switch (args.length) {
      case 3: {
        const [column, operator, value] = args;
        this.addWhereClause('AND', column as string, operator as string, value);

        break;
      }
      case 2: {
        const [condition, operator = '='] = args;
        this.addWhereClause(
          'AND',
          condition as string | Record<string, unknown>,
          operator as string,
        );

        break;
      }
      case 1: {
        const [condition] = args;
        this.addWhereClause('AND', condition as string | Record<string, unknown>, '=');

        break;
      }
      // No default
    }
    return this;
  }

  orWhere(
    condition: string | Record<string, unknown>,
    operator?: string,
    value?: unknown,
  ): QueryBuilder<T>;
  orWhere(column: string, operator: string, value: unknown): QueryBuilder<T>;
  orWhere(...args: Array<string | Record<string, unknown> | undefined>): QueryBuilder<T> {
    switch (args.length) {
      case 3: {
        const [column, operator, value] = args;
        this.addWhereClause('OR', column as string, operator as string, value);

        break;
      }
      case 2: {
        const [condition, operator = '='] = args;
        this.addWhereClause(
          'OR',
          condition as string | Record<string, unknown>,
          operator as string,
        );

        break;
      }
      case 1: {
        const [condition] = args;
        this.addWhereClause('OR', condition as string | Record<string, unknown>, '=');

        break;
      }
      // No default
    }
    return this;
  }

  whereIn(column: string, values: unknown[]): QueryBuilder<T> {
    validateColumnName(column);
    if (values.length === 0) {
      throw new ValidationError('whereIn requires at least one value');
    }

    const placeholders = values
      .map((_, index) => this.parameterPlaceholderFn(this.bindings.length + index + 1))
      .join(', ');

    this.whereClauses.push({
      type: 'AND',
      condition: `${this.escapeIdentifierFn(column)} IN (${placeholders})`,
      bindings: values,
    });
    this.bindings.push(...values);
    return this;
  }

  whereNotIn(column: string, values: unknown[]): QueryBuilder<T> {
    validateColumnName(column);
    if (values.length === 0) {
      throw new ValidationError('whereNotIn requires at least one value');
    }

    const placeholders = values
      .map((_, index) => this.parameterPlaceholderFn(this.bindings.length + index + 1))
      .join(', ');

    this.whereClauses.push({
      type: 'AND',
      condition: `${this.escapeIdentifierFn(column)} NOT IN (${placeholders})`,
      bindings: values,
    });
    this.bindings.push(...values);
    return this;
  }

  whereBetween(column: string, min: unknown, max: unknown): QueryBuilder<T> {
    validateColumnName(column);

    const minPlaceholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    const maxPlaceholder = this.parameterPlaceholderFn(this.bindings.length + 2);

    this.whereClauses.push({
      type: 'AND',
      condition: `${this.escapeIdentifierFn(column)} BETWEEN ${minPlaceholder} AND ${maxPlaceholder}`,
      bindings: [min, max],
    });
    this.bindings.push(min, max);
    return this;
  }

  whereNull(column: string): QueryBuilder<T> {
    validateColumnName(column);
    this.whereClauses.push({
      type: 'AND',
      condition: `${this.escapeIdentifierFn(column)} IS NULL`,
      bindings: [],
    });
    return this;
  }

  whereNotNull(column: string): QueryBuilder<T> {
    validateColumnName(column);
    this.whereClauses.push({
      type: 'AND',
      condition: `${this.escapeIdentifierFn(column)} IS NOT NULL`,
      bindings: [],
    });
    return this;
  }

  // ============================================
  // DATE FILTERS (delegated to date-filter-trait)
  // ============================================

  whereDate(column: string, operator: string, date: Date | string): QueryBuilder<T> {
    dateFilterTrait.whereDate(this.getDateFilterContext(), column, operator, date);
    return this;
  }

  whereYear(column: string, operator: string, year: number): QueryBuilder<T> {
    dateFilterTrait.whereYear(this.getDateFilterContext(), column, operator, year);
    return this;
  }

  whereMonth(column: string, operator: string, month: number): QueryBuilder<T> {
    dateFilterTrait.whereMonth(this.getDateFilterContext(), column, operator, month);
    return this;
  }

  whereDay(column: string, operator: string, day: number): QueryBuilder<T> {
    dateFilterTrait.whereDay(this.getDateFilterContext(), column, operator, day);
    return this;
  }

  whereToday(column: string): QueryBuilder<T> {
    dateFilterTrait.whereToday(this.getDateFilterContext(), column);
    return this;
  }

  whereYesterday(column: string): QueryBuilder<T> {
    dateFilterTrait.whereYesterday(this.getDateFilterContext(), column);
    return this;
  }

  whereBetweenDates(
    column: string,
    startDate: Date | string,
    endDate: Date | string,
  ): QueryBuilder<T> {
    dateFilterTrait.whereBetweenDates(this.getDateFilterContext(), column, startDate, endDate);
    return this;
  }

  whereLastDays(column: string, days: number): QueryBuilder<T> {
    dateFilterTrait.whereLastDays(this.getDateFilterContext(), column, days);
    return this;
  }

  private getDateFilterContext(): dateFilterTrait.DateFilterContext {
    return {
      bindings: this.bindings,
      whereClauses: this.whereClauses,
      escapeIdentifierFn: this.escapeIdentifierFn,
      parameterPlaceholderFn: this.parameterPlaceholderFn,
    };
  }

  // ============================================
  // GROUPING & ORDERING
  // ============================================

  groupBy(...columns: string[]): QueryBuilder<T> {
    columns.forEach((col) => validateColumnName(col));
    this.groupByColumns = columns;
    return this;
  }

  having(condition: string): QueryBuilder<T> {
    this.havingClause = condition;
    return this;
  }

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder<T> {
    validateColumnName(column);
    this.orderByColumns.push({ column, direction });
    return this;
  }

  limit(limit: number): QueryBuilder<T> {
    if (limit < 0) {
      throw new ValidationError('Limit must be non-negative');
    }
    this.limitValue = limit;
    return this;
  }

  offset(offset: number): QueryBuilder<T> {
    if (offset < 0) {
      throw new ValidationError('Offset must be non-negative');
    }
    this.offsetValue = offset;
    return this;
  }

  // ============================================
  // AGGREGATES
  // ============================================

  async count(column = '*', options?: QueryOptions): Promise<number> {
    const originalSelect = this.selectColumns;
    this.selectColumns = [`COUNT(${column}) as count`];

    try {
      const result = await this.execute(options);
      const row = result.rows[0] as { count: string | number } | undefined;
      return row ? Number(row.count) : 0;
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  async sum(column: string, options?: QueryOptions): Promise<number> {
    validateColumnName(column);
    const originalSelect = this.selectColumns;
    this.selectColumns = [`SUM(${this.escapeIdentifierFn(column)}) as aggregate`];

    try {
      const result = await this.execute(options);
      const row = result.rows[0] as { aggregate: string | number | null } | undefined;
      return row?.aggregate ? Number(row.aggregate) : 0;
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  async avg(column: string, options?: QueryOptions): Promise<number> {
    validateColumnName(column);
    const originalSelect = this.selectColumns;
    this.selectColumns = [`AVG(${this.escapeIdentifierFn(column)}) as aggregate`];

    try {
      const result = await this.execute(options);
      const row = result.rows[0] as { aggregate: string | number | null } | undefined;
      return row?.aggregate ? Number(row.aggregate) : 0;
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  async min(column: string, options?: QueryOptions): Promise<number | null> {
    validateColumnName(column);
    const originalSelect = this.selectColumns;
    this.selectColumns = [`MIN(${this.escapeIdentifierFn(column)}) as aggregate`];

    try {
      const result = await this.execute(options);
      const row = result.rows[0] as { aggregate: string | number | null } | undefined;
      if (row?.aggregate === null || row?.aggregate === undefined) {
        return null;
      }
      return Number(row.aggregate);
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  async max(column: string, options?: QueryOptions): Promise<number | null> {
    validateColumnName(column);
    const originalSelect = this.selectColumns;
    this.selectColumns = [`MAX(${this.escapeIdentifierFn(column)}) as aggregate`];

    try {
      const result = await this.execute(options);
      const row = result.rows[0] as { aggregate: string | number | null } | undefined;
      if (row?.aggregate === null || row?.aggregate === undefined) {
        return null;
      }
      return Number(row.aggregate);
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  async exists(options?: QueryOptions): Promise<boolean> {
    const count = await this.count('*', options);
    return count > 0;
  }

  // ============================================
  // PAGINATION
  // ============================================

  async paginate(
    page: number = 1,
    perPage: number = 15,
    options?: QueryOptions,
  ): Promise<PaginationResult<T>> {
    if (page < 1) {
      page = 1;
    }
    if (perPage < 1) {
      perPage = 15;
    }

    // Get total count
    const total = await this.count('*', options);

    // Calculate pagination
    const totalPages = Math.ceil(total / perPage);
    const offset = (page - 1) * perPage;

    // Get paginated data
    this.limitValue = perPage;
    this.offsetValue = offset;
    const result = await this.execute(options);

    const from = total > 0 ? offset + 1 : 0;
    const to = Math.min(offset + perPage, total);

    return {
      data: result.rows,
      pagination: {
        page,
        perPage,
        total,
        totalPages,
        hasMore: page < totalPages,
        from,
        to,
      },
    };
  }

  async cursorPaginate(
    cursorColumn: string,
    cursor: number | string | null = null,
    limit: number = 20,
    options?: QueryOptions,
  ): Promise<CursorPaginationResult<T>> {
    validateColumnName(cursorColumn);

    if (cursor !== null) {
      this.where(cursorColumn, '>', cursor);
    }

    this.orderBy(cursorColumn, 'ASC');
    this.limitValue = limit + 1;

    const result = await this.execute(options);
    const hasMore = result.rows.length > limit;
    const data = hasMore ? result.rows.slice(0, limit) : result.rows;

    const lastItem = data.at(-1) as Record<string, unknown> | undefined;
    const nextCursor = hasMore && lastItem ? (lastItem[cursorColumn] as number | string) : null;

    return {
      data,
      nextCursor,
      hasMore,
    };
  }

  async chunk(
    size: number,
    callback: (items: T[], page: number) => Promise<void | false>,
    options?: QueryOptions,
  ): Promise<void> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.paginate(page, size, options);

      if (result.data.length === 0) {
        break;
      }

      const shouldContinue = await callback(result.data, page);

      if (shouldContinue === false) {
        break;
      }

      hasMore = result.pagination.hasMore;
      page++;
    }
  }

  // ============================================
  // UTILITIES
  // ============================================

  async first(options?: QueryOptions): Promise<T | null> {
    this.limit(1);
    const result = await this.execute(options);
    return result.rows[0] || null;
  }

  async pluck<K = unknown>(column: string, options?: QueryOptions): Promise<K[]> {
    validateColumnName(column);
    const originalSelect = this.selectColumns;
    this.selectColumns = [column];

    try {
      const result = await this.execute(options);
      return result.rows
        .map((row: unknown) => (row as Record<string, K>)[column])
        .filter((val): val is K => val !== undefined);
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  async value<K = unknown>(column: string, options?: QueryOptions): Promise<K | null> {
    validateColumnName(column);
    const originalSelect = this.selectColumns;
    this.selectColumns = [column];
    this.limitValue = 1;

    try {
      const result = await this.execute(options);
      const row = result.rows[0] as Record<string, K> | undefined;
      if (!row) {
        return null;
      }
      const val = row[column];
      return val === undefined ? null : val;
    } finally {
      this.selectColumns = originalSelect;
    }
  }

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  insert(
    table: string,
    data: Record<string, unknown> | Record<string, unknown>[],
  ): QueryBuilder<T> {
    validateTableName(table);
    this.insertTable = table;
    this.insertData = this.processDataForEncryption(data);
    return this;
  }

  update(table: string, data: Record<string, unknown>): QueryBuilder<T> {
    validateTableName(table);
    this.updateTable = table;
    this.updateData = this.processDataForEncryption(data) as Record<string, unknown>;
    return this;
  }

  delete(table: string): QueryBuilder<T> {
    validateTableName(table);
    this.deleteTable = table;
    return this;
  }

  // ============================================
  // RAW SQL
  // ============================================

  raw(sql: string, bindings?: unknown[]): QueryBuilder<T> {
    this.rawSql = sql;
    if (bindings !== undefined) {
      this.rawBindings = bindings;
    }
    return this;
  }

  // ============================================
  // ENCRYPTION
  // ============================================

  encrypt(...fields: string[]): QueryBuilder<T> {
    fields.forEach((field) => this.encryptedFields.add(field));
    return this;
  }

  decrypt(...fields: string[]): QueryBuilder<T> {
    fields.forEach((field) => this.decryptedFields.add(field));
    return this;
  }

  // ============================================
  // SQL GENERATION
  // ============================================

  toSQL(): { sql: string; bindings: unknown[] } {
    if (this.rawSql) {
      return { sql: this.rawSql, bindings: this.rawBindings || [] };
    }

    if (this.insertTable) {
      return this.buildInsertSQL();
    }

    if (this.updateTable) {
      return this.buildUpdateSQL();
    }

    if (this.deleteTable) {
      return this.buildDeleteSQL();
    }

    return this.buildSelectSQL();
  }

  // ============================================
  // EXECUTION
  // ============================================

  async execute(options?: QueryOptions): Promise<QueryResult<T>> {
    const { sql, bindings } = this.toSQL();
    const result = await this.adapter.query<T>(sql, bindings as QueryParams, options);
    return this.processResultsForDecryption(result);
  }

  // ============================================
  // PROTECTED HELPERS
  // ============================================

  protected addWhereClause(
    type: 'AND' | 'OR',
    condition: string | Record<string, unknown>,
    operator: string,
    value?: unknown,
  ): void {
    if (value !== undefined) {
      validateColumnName(condition as string);
      const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);

      this.whereClauses.push({
        type,
        condition: `${this.escapeIdentifierFn(condition as string)} ${operator} ${placeholder}`,
        bindings: [value],
      });
      this.bindings.push(value);
    } else if (typeof condition === 'string') {
      this.whereClauses.push({
        type,
        condition,
        bindings: [],
      });
    } else {
      Object.entries(condition).forEach(([key, val]) => {
        validateColumnName(key);
        const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);

        this.whereClauses.push({
          type,
          condition: `${this.escapeIdentifierFn(key)} ${operator} ${placeholder}`,
          bindings: [val],
        });
        this.bindings.push(val);
      });
    }
  }

  protected processDataForEncryption(
    data: Record<string, unknown> | Record<string, unknown>[],
  ): Record<string, unknown> | Record<string, unknown>[] {
    if (!this.crypto || this.encryptedFields.size === 0) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((row) => this.encryptRow(row));
    }
    return this.encryptRow(data);
  }

  protected encryptRow(row: Record<string, unknown>): Record<string, unknown> {
    if (!this.crypto) {
      return row;
    }

    const encryptedRow = { ...row };
    this.encryptedFields.forEach((field) => {
      if (field in encryptedRow) {
        encryptedRow[field] = this.crypto!.encryptField(encryptedRow[field]);
      }
    });
    return encryptedRow;
  }

  protected async processResultsForDecryption(result: QueryResult<T>): Promise<QueryResult<T>> {
    if (!this.crypto || this.decryptedFields.size === 0) {
      return result;
    }

    const decryptedRows = result.rows.map((row) => {
      const decryptedRow = { ...row } as Record<string, unknown>;
      this.decryptedFields.forEach((field) => {
        if (field in decryptedRow && decryptedRow[field]) {
          try {
            const value = decryptedRow[field];
            if (typeof value === 'string') {
              decryptedRow[field] = this.crypto!.decryptField(value);
            }
          } catch {
            // If decryption fails, leave the value as is
          }
        }
      });
      return decryptedRow as T;
    });

    return {
      ...result,
      rows: decryptedRows,
    };
  }

  // ============================================
  // SQL BUILDERS (Abstract - to be implemented by dialects)
  // ============================================

  protected abstract buildSelectSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildInsertSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildUpdateSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildDeleteSQL(): { sql: string; bindings: unknown[] };
}

export {
  type QueryBuilderOptions,
  type JoinClause,
  type WhereClause,
} from './query-builder/query-builder-types';

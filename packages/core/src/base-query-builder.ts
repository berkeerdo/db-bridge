import { QueryBuilder } from './interfaces';
import { DatabaseAdapter } from './interfaces';
import { QueryResult, QueryOptions, QueryParams } from './types';
import { ValidationError } from './errors';
import { validateTableName, validateColumnName } from './utils';
import { CryptoProvider } from './crypto/crypto';

export interface QueryBuilderOptions {
  adapter: DatabaseAdapter;
  escapeIdentifier?: (identifier: string) => string;
  parameterPlaceholder?: (index: number) => string;
  crypto?: CryptoProvider;
}

interface WhereClause {
  type: 'AND' | 'OR';
  condition: string;
  bindings: unknown[];
}

interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  on: string;
}

export abstract class BaseQueryBuilder<T = unknown> implements QueryBuilder<T> {
  protected adapter: DatabaseAdapter;
  protected escapeIdentifierFn: (identifier: string) => string;
  protected parameterPlaceholderFn: (index: number) => string;
  protected crypto?: CryptoProvider;
  protected encryptedFields: Set<string> = new Set();
  protected decryptedFields: Set<string> = new Set();

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

  protected insertTable?: string;
  protected insertData?: Record<string, unknown> | Record<string, unknown>[];
  protected updateTable?: string;
  protected updateData?: Record<string, unknown>;
  protected deleteTable?: string;

  protected rawSql?: string;
  protected rawBindings?: unknown[];

  constructor(options: QueryBuilderOptions) {
    this.adapter = options.adapter;
    this.escapeIdentifierFn = options.escapeIdentifier || ((id) => `"${id}"`);
    this.parameterPlaceholderFn = options.parameterPlaceholder || ((index) => `$${index}`);
    this.crypto = options.crypto;
  }

  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  select(...args: Array<string | string[]>): QueryBuilder<T> {
    let cols: string[] = [];

    if (args.length === 1 && Array.isArray(args[0])) {
      // select(['id', 'name'])
      cols = args[0] as string[];
    } else {
      // select('id', 'name')
      cols = args.filter(arg => typeof arg === 'string') as string[];
    }

    if (cols.length === 0) {
      this.selectColumns = ['*'];
    } else {
      this.selectColumns = cols
        .filter(col => col && typeof col === 'string')
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

  /**
   * Alias for from() to provide alternative naming
   */
  table(table: string, alias?: string): QueryBuilder<T> {
    return this.from(table, alias);
  }

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

  where(
    condition: string | Record<string, unknown>,
    operator?: string,
    value?: unknown,
  ): QueryBuilder<T>;
  where(column: string, operator: string, value: unknown): QueryBuilder<T>;
  where(
    ...args: Array<
      string | Record<string, unknown> | undefined
    >
  ): QueryBuilder<T> {
    if (args.length === 3) {
      // where('age', '>=', 25)
      const [column, operator, value] = args;
      this.addWhereClause('AND', column as string, operator as string, value);
    } else if (args.length === 2) {
      // where({ age: 25 }, '=') or where('condition', '=')
      const [condition, operator = '='] = args;
      this.addWhereClause('AND', condition as string | Record<string, unknown>, operator as string);
    } else if (args.length === 1) {
      // where({ age: 25 }) or where('raw condition')
      const [condition] = args;
      this.addWhereClause('AND', condition as string | Record<string, unknown>, '=');
    }
    return this;
  }

  orWhere(
    condition: string | Record<string, unknown>,
    operator?: string,
    value?: unknown,
  ): QueryBuilder<T>;
  orWhere(column: string, operator: string, value: unknown): QueryBuilder<T>;
  orWhere(
    ...args: Array<
      string | Record<string, unknown> | undefined
    >
  ): QueryBuilder<T> {
    if (args.length === 3) {
      // orWhere('age', '>=', 25)
      const [column, operator, value] = args;
      this.addWhereClause('OR', column as string, operator as string, value);
    } else if (args.length === 2) {
      // orWhere({ age: 25 }, '=') or orWhere('condition', '=')
      const [condition, operator = '='] = args;
      this.addWhereClause('OR', condition as string | Record<string, unknown>, operator as string);
    } else if (args.length === 1) {
      // orWhere({ age: 25 }) or orWhere('raw condition')
      const [condition] = args;
      this.addWhereClause('OR', condition as string | Record<string, unknown>, '=');
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

  /**
   * Date-specific where conditions
   */
  whereDate(column: string, operator: string, date: Date | string): QueryBuilder<T> {
    validateColumnName(column);
    const dateValue = date instanceof Date ? date.toISOString().split('T')[0] : date;
    const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    
    // Use DATE() function for cross-database compatibility
    this.whereClauses.push({
      type: 'AND',
      condition: `DATE(${this.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
      bindings: [dateValue],
    });
    this.bindings.push(dateValue);
    return this;
  }

  whereYear(column: string, operator: string, year: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    
    // Extract year from date column
    this.whereClauses.push({
      type: 'AND',
      condition: `YEAR(${this.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
      bindings: [year],
    });
    this.bindings.push(year);
    return this;
  }

  whereMonth(column: string, operator: string, month: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    
    // Extract month from date column
    this.whereClauses.push({
      type: 'AND',
      condition: `MONTH(${this.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
      bindings: [month],
    });
    this.bindings.push(month);
    return this;
  }

  whereDay(column: string, operator: string, day: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    
    // Extract day from date column
    this.whereClauses.push({
      type: 'AND',
      condition: `DAY(${this.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
      bindings: [day],
    });
    this.bindings.push(day);
    return this;
  }

  /**
   * Date range helpers
   */
  whereToday(column: string): QueryBuilder<T> {
    const today = new Date().toISOString().split('T')[0];
    return this.whereDate(column, '=', today!);
  }

  whereYesterday(column: string): QueryBuilder<T> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return this.whereDate(column, '=', yesterday.toISOString().split('T')[0]!);
  }

  whereBetweenDates(column: string, startDate: Date | string, endDate: Date | string): QueryBuilder<T> {
    validateColumnName(column);
    const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
    const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;
    
    const startPlaceholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    const endPlaceholder = this.parameterPlaceholderFn(this.bindings.length + 2);
    
    this.whereClauses.push({
      type: 'AND',
      condition: `DATE(${this.escapeIdentifierFn(column)}) BETWEEN ${startPlaceholder} AND ${endPlaceholder}`,
      bindings: [start, end],
    });
    this.bindings.push(start, end);
    return this;
  }

  whereLastDays(column: string, days: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
    
    this.whereClauses.push({
      type: 'AND',
      condition: `${this.escapeIdentifierFn(column)} >= DATE_SUB(CURDATE(), INTERVAL ${placeholder} DAY)`,
      bindings: [days],
    });
    this.bindings.push(days);
    return this;
  }

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

  raw(sql: string, bindings?: unknown[]): QueryBuilder<T> {
    this.rawSql = sql;
    if (bindings !== undefined) {
      this.rawBindings = bindings;
    }
    return this;
  }

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


  async first(options?: QueryOptions): Promise<T | null> {
    this.limit(1);
    const result = await this.execute(options);
    return result.rows[0] || null;
  }

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

  async exists(options?: QueryOptions): Promise<boolean> {
    const count = await this.count('*', options);
    return count > 0;
  }

  protected addWhereClause(
    type: 'AND' | 'OR',
    condition: string | Record<string, unknown>,
    operator: string,
    value?: unknown,
  ): void {
    if (value !== undefined) {
      // Three parameter case: where('age', '>=', 25)
      validateColumnName(condition as string);
      const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
      
      this.whereClauses.push({
        type,
        condition: `${this.escapeIdentifierFn(condition as string)} ${operator} ${placeholder}`,
        bindings: [value],
      });
      this.bindings.push(value);
    } else if (typeof condition === 'string') {
      // Raw SQL condition case
      this.whereClauses.push({
        type,
        condition,
        bindings: [],
      });
    } else {
      // Object condition case: { age: 25, name: 'John' }
      Object.entries(condition).forEach(([key, value]) => {
        validateColumnName(key);
        const placeholder = this.parameterPlaceholderFn(this.bindings.length + 1);
        
        this.whereClauses.push({
          type,
          condition: `${this.escapeIdentifierFn(key)} ${operator} ${placeholder}`,
          bindings: [value],
        });
        this.bindings.push(value);
      });
    }
  }

  encrypt(...fields: string[]): QueryBuilder<T> {
    fields.forEach(field => this.encryptedFields.add(field));
    return this;
  }

  decrypt(...fields: string[]): QueryBuilder<T> {
    fields.forEach(field => this.decryptedFields.add(field));
    return this;
  }

  protected processDataForEncryption(data: Record<string, unknown> | Record<string, unknown>[]): Record<string, unknown> | Record<string, unknown>[] {
    if (!this.crypto || this.encryptedFields.size === 0) {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map(row => this.encryptRow(row));
    }
    return this.encryptRow(data);
  }

  protected encryptRow(row: Record<string, unknown>): Record<string, unknown> {
    if (!this.crypto) return row;
    
    const encryptedRow = { ...row };
    this.encryptedFields.forEach(field => {
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

    const decryptedRows = result.rows.map(row => {
      const decryptedRow = { ...row } as any;
      this.decryptedFields.forEach(field => {
        if (field in decryptedRow && decryptedRow[field]) {
          try {
            decryptedRow[field] = this.crypto!.decryptField(decryptedRow[field]);
          } catch (error) {
            // If decryption fails, leave the value as is
            console.error(`Failed to decrypt field ${field}:`, error);
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

  async execute(options?: QueryOptions): Promise<QueryResult<T>> {
    const { sql, bindings } = this.toSQL();
    const result = await this.adapter.query<T>(sql, bindings as QueryParams, options);
    return this.processResultsForDecryption(result);
  }

  protected abstract buildSelectSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildInsertSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildUpdateSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildDeleteSQL(): { sql: string; bindings: unknown[] };
}
import { QueryBuilder } from '../interfaces';
import { DatabaseAdapter } from '../interfaces';
import { QueryResult, QueryOptions } from '../types';
import { ValidationError, validateTableName, validateColumnName } from '../utils';
import { CryptoProvider } from '../crypto/crypto';
import { applyWhereMethods } from './traits/where-trait';
import { applyDateMethods } from './traits/date-trait';
import { applyJoinMethods, JoinClause } from './traits/join-trait';
import { applyDMLMethods } from './traits/dml-trait';

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


/**
 * Modular Query Builder with composition pattern
 * Separates concerns into focused traits for better maintainability
 */
export abstract class ModularQueryBuilder<T = unknown> implements QueryBuilder<T> {
  protected adapter: DatabaseAdapter;
  protected escapeIdentifierFn: (identifier: string) => string;
  protected parameterPlaceholderFn: (index: number) => string;
  protected crypto?: CryptoProvider;
  
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
  
  // DML state
  protected insertTable?: string;
  protected insertData?: Record<string, unknown> | Record<string, unknown>[];
  protected updateTable?: string;
  protected updateData?: Record<string, unknown>;
  protected deleteTable?: string;
  
  // Raw query state
  protected rawSql?: string;
  protected rawBindings?: unknown[];

  constructor(options: QueryBuilderOptions) {
    this.adapter = options.adapter;
    this.escapeIdentifierFn = options.escapeIdentifier || ((id) => `"${id}"`);
    this.parameterPlaceholderFn = options.parameterPlaceholder || ((index) => `$${index}`);
    this.crypto = options.crypto;
    
    // Apply traits
    this.applyTraits();
  }

  private applyTraits(): void {
    // Apply where methods trait
    applyWhereMethods(
      this,
      this.whereClauses,
      this.bindings,
      this.parameterPlaceholderFn,
      this.escapeIdentifierFn
    );
    
    // Apply date methods trait
    const addWhereClause = (type: 'AND' | 'OR', condition: string, bindings: unknown[]) => {
      this.whereClauses.push({ type, condition, bindings });
    };
    
    applyDateMethods(
      this,
      addWhereClause,
      this.parameterPlaceholderFn,
      this.escapeIdentifierFn,
      this.bindings
    );
    
    // Apply join methods trait
    applyJoinMethods(this, this.joins);
    
    // Apply DML methods trait
    applyDMLMethods(this, {
      insertTable: this.insertTable,
      insertData: this.insertData,
      updateTable: this.updateTable,
      updateData: this.updateData,
      deleteTable: this.deleteTable
    });
  }

  // Core SELECT methods with enhanced array support
  select(...columns: string[]): QueryBuilder<T>;
  select(columns: string[]): QueryBuilder<T>;
  select(columns: Record<string, string>): QueryBuilder<T>; // alias support
  select(...args: any[]): QueryBuilder<T> {
    let cols: string[] = [];
    
    // Handle different input types
    if (args.length === 1) {
      const firstArg = args[0];
      
      if (Array.isArray(firstArg)) {
        // select(['id', 'name']) or select(['users.id', 'users.name'])
        cols = firstArg;
      } else if (typeof firstArg === 'object' && firstArg !== null) {
        // select({ userId: 'users.id', userName: 'users.name' }) - with aliases
        cols = Object.entries(firstArg).map(([alias, column]) => {
          return `${column} AS ${alias}`;
        });
      } else if (typeof firstArg === 'string') {
        // select('id')
        cols = [firstArg];
      }
    } else {
      // select('id', 'name', 'email')
      cols = args.filter(arg => typeof arg === 'string');
    }
    
    if (cols.length === 0) {
      this.selectColumns = ['*'];
    } else {
      this.selectColumns = cols.map((col) => {
        // Allow complex expressions
        if (col === '*' || 
            col.includes('.') || 
            col.includes(' as ') || 
            col.includes(' AS ') ||
            col.includes('(') || // functions like COUNT(*)
            col.includes(',')) { // multiple columns
          return col;
        }
        validateColumnName(col);
        return col;
      });
    }
    return this;
  }

  // Add selectRaw for complex queries
  selectRaw(sql: string, bindings?: unknown[]): QueryBuilder<T> {
    this.selectColumns = [sql];
    if (bindings) {
      this.bindings.push(...bindings);
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

  // JOIN methods are provided by trait

  // GROUP BY, HAVING, ORDER BY
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

  // LIMIT, OFFSET
  limit(value: number): QueryBuilder<T> {
    if (value < 0) {
      throw new ValidationError('Limit must be non-negative');
    }
    this.limitValue = value;
    return this;
  }

  offset(value: number): QueryBuilder<T> {
    if (value < 0) {
      throw new ValidationError('Offset must be non-negative');
    }
    this.offsetValue = value;
    return this;
  }

  // DML methods are provided by trait

  // Raw SQL
  raw(sql: string, bindings?: unknown[]): QueryBuilder<T> {
    this.rawSql = sql;
    this.rawBindings = bindings;
    return this;
  }

  // Execution
  async execute(adapter?: DatabaseAdapter, options?: QueryOptions): Promise<QueryResult<T>> {
    const queryAdapter = adapter || this.adapter;
    const { sql, bindings } = this.toSQL();
    return queryAdapter.query<T>(sql, bindings, options);
  }

  // Build SQL
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

  build(): { sql: string; bindings: unknown[] } {
    return this.toSQL();
  }

  // Abstract methods for database-specific implementations
  protected abstract buildSelectSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildInsertSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildUpdateSQL(): { sql: string; bindings: unknown[] };
  protected abstract buildDeleteSQL(): { sql: string; bindings: unknown[] };
}
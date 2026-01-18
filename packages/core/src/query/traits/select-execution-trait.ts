/**
 * Select Execution Trait
 *
 * Provides query execution and result processing functionality.
 * Handles aggregates, pagination, chunking, and result fetching.
 */

import type { SQLDialect } from '../../dialect/sql-dialect';
import type { QueryResult } from '../../types';

export interface ExecutionContext {
  dialect: SQLDialect;
  executeQuery<T>(sql: string, bindings: unknown[]): Promise<QueryResult<T>>;
  executeCachedQuery<T>(
    sql: string,
    bindings: unknown[],
    options?: { ttl?: number; key?: string },
  ): Promise<QueryResult<T>>;
  hasCache: boolean;
  hasCrypto: boolean;
  decrypt(value: string): unknown;
}

export interface AggregateResult {
  value: string | number | null;
}

export interface CountResult {
  count: string | number;
}

/**
 * Standalone Execution Trait class for composition
 *
 * Note: This trait requires the host class to implement:
 * - toSQL(): { sql: string; bindings: unknown[] }
 * - ctx: ExecutionContext
 * - _cacheEnabled: boolean
 * - _cacheTTL?: number
 * - _cacheKey?: string
 * - _decryptFields: Set<string>
 * - _limit?: number
 * - _columns: string[]
 */
export abstract class SelectExecutionTrait<T = unknown> {
  protected abstract ctx: ExecutionContext;
  protected abstract _cacheEnabled: boolean;
  protected abstract _cacheTTL?: number;
  protected abstract _cacheKey?: string;
  protected abstract _decryptFields: Set<string>;
  protected abstract _limit?: number;
  protected abstract _columns: string[];

  /**
   * Build SQL without executing
   */
  abstract toSQL(): { sql: string; bindings: unknown[] };

  /**
   * Execute and get all results
   */
  async get(): Promise<T[]> {
    const { sql, bindings } = this.toSQL();

    const result =
      this._cacheEnabled && this.ctx.hasCache
        ? await this.ctx.executeCachedQuery<T>(sql, bindings, {
            ttl: this._cacheTTL,
            key: this._cacheKey,
          })
        : await this.ctx.executeQuery<T>(sql, bindings);

    return this.processResults(result.rows);
  }

  /**
   * Execute and get first result
   */
  async first(): Promise<T | null> {
    this._limit = 1;
    const results = await this.get();
    return results[0] ?? null;
  }

  /**
   * Execute and get first result or throw
   */
  async firstOrFail(): Promise<T> {
    const result = await this.first();
    if (result === null) {
      throw new Error('No record found');
    }
    return result;
  }

  /**
   * Get exactly one result or throw
   */
  async sole(): Promise<T> {
    this._limit = 2;
    const results = await this.get();

    if (results.length === 0) {
      throw new Error('No record found');
    }
    if (results.length > 1) {
      throw new Error('Multiple records found when expecting one');
    }

    return results[0] as T;
  }

  /**
   * Get count of matching records
   */
  async count(column = '*'): Promise<number> {
    const originalColumns = this._columns;
    this._columns = [`COUNT(${column}) as count`];

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<CountResult>(sql, bindings);

    this._columns = originalColumns;
    return Number(result.rows[0]?.count ?? 0);
  }

  /**
   * Check if any records exist
   */
  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  /**
   * Check if no records exist
   */
  async doesntExist(): Promise<boolean> {
    return !(await this.exists());
  }

  /**
   * Get aggregated value
   */
  async aggregate(
    fn: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT',
    column: string,
  ): Promise<number | null> {
    const originalColumns = this._columns;
    this._columns = [`${fn}(${this.ctx.dialect.escapeIdentifier(column)}) as value`];

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<AggregateResult>(sql, bindings);

    this._columns = originalColumns;
    const value = result.rows[0]?.value;
    return value === null ? null : Number(value);
  }

  /**
   * Get SUM of column
   */
  sum(column: string): Promise<number | null> {
    return this.aggregate('SUM', column);
  }

  /**
   * Get AVG of column
   */
  avg(column: string): Promise<number | null> {
    return this.aggregate('AVG', column);
  }

  /**
   * Get MIN of column
   */
  min(column: string): Promise<number | null> {
    return this.aggregate('MIN', column);
  }

  /**
   * Get MAX of column
   */
  max(column: string): Promise<number | null> {
    return this.aggregate('MAX', column);
  }

  /**
   * Get values for a single column
   */
  async pluck<V = unknown>(column: string): Promise<V[]> {
    const originalColumns = this._columns;
    this._columns = [column];

    const results = await this.get();
    this._columns = originalColumns;

    return results.map((row: any) => row[column]) as V[];
  }

  /**
   * Get key-value pairs
   */
  async pluckKeyValue<K extends string | number, V = unknown>(
    valueColumn: string,
    keyColumn: string,
  ): Promise<Map<K, V>> {
    const originalColumns = this._columns;
    this._columns = [keyColumn, valueColumn];

    const results = await this.get();
    this._columns = originalColumns;

    const map = new Map<K, V>();
    for (const row of results as any[]) {
      map.set(row[keyColumn] as K, row[valueColumn] as V);
    }
    return map;
  }

  /**
   * Chunk results for memory efficiency
   */
  async chunk(
    size: number,
    callback: (rows: T[], chunkNumber: number) => Promise<boolean | void> | boolean | void,
  ): Promise<void> {
    let offset = 0;
    let chunkNumber = 1;
    const shouldContinue = true;

    while (shouldContinue) {
      this._limit = size;
      (this as any)._offset = offset;

      const rows = await this.get();

      if (rows.length === 0) {
        break;
      }

      const result = await callback(rows, chunkNumber);

      // Allow callback to return false to stop chunking
      if (result === false) {
        break;
      }

      offset += size;
      chunkNumber++;

      if (rows.length < size) {
        break;
      }
    }
  }

  /**
   * Iterate through results lazily
   */
  async *lazy(chunkSize = 100): AsyncGenerator<T, void, unknown> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      this._limit = chunkSize;
      (this as any)._offset = offset;

      const rows = await this.get();

      for (const row of rows) {
        yield row;
      }

      if (rows.length < chunkSize) {
        hasMore = false;
      } else {
        offset += chunkSize;
      }
    }
  }

  /**
   * Process results for decryption
   */
  protected processResults(rows: T[]): T[] {
    if (this._decryptFields.size === 0 || !this.ctx.hasCrypto) {
      return rows;
    }

    return rows.map((row) => {
      const processed = { ...row } as any;
      for (const field of this._decryptFields) {
        if (processed[field] && typeof processed[field] === 'string') {
          try {
            processed[field] = this.ctx.decrypt(processed[field]);
          } catch {
            // Keep original value if decryption fails
          }
        }
      }
      return processed as T;
    });
  }
}

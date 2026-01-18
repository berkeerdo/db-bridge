/**
 * Insert Query Builder
 *
 * Fluent builder for INSERT queries following SRP.
 *
 * @example
 * ```typescript
 * const id = await insert
 *   .into('users')
 *   .values({ name: 'John', email: 'john@example.com' })
 *   .execute();
 *
 * // Bulk insert
 * await insert
 *   .into('users')
 *   .values([
 *     { name: 'John', email: 'john@example.com' },
 *     { name: 'Jane', email: 'jane@example.com' },
 *   ])
 *   .execute();
 * ```
 */

import type { QueryContext, ExecuteResult } from './query-context';
import type { InsertComponents } from '../dialect/sql-dialect';

export class InsertBuilder<T = unknown> {
  private _table?: string;
  private _data: Record<string, unknown>[] = [];
  private _returning: string[] = [];
  private _encryptFields: Set<string> = new Set();
  private _ignore = false;

  constructor(private readonly ctx: QueryContext) {}

  /**
   * Set table to insert into
   */
  into(table: string): this {
    this._table = table;
    return this;
  }

  /**
   * Alias for into()
   */
  table(table: string): this {
    return this.into(table);
  }

  /**
   * Set values to insert (single row or multiple rows)
   */
  values(data: Record<string, unknown> | Record<string, unknown>[]): this {
    if (Array.isArray(data)) {
      this._data = data;
    } else {
      this._data = [data];
    }
    return this;
  }

  /**
   * Mark fields to be encrypted before insertion
   */
  encrypt(...fields: string[]): this {
    fields.forEach((f) => this._encryptFields.add(f));
    return this;
  }

  /**
   * Add RETURNING clause (PostgreSQL)
   */
  returning(...columns: string[]): this {
    this._returning = columns;
    return this;
  }

  /**
   * Use INSERT IGNORE (MySQL) - ignore duplicate key errors
   */
  ignore(): this {
    this._ignore = true;
    return this;
  }

  /**
   * Build SQL without executing
   */
  toSQL(): { sql: string; bindings: unknown[] } {
    if (!this._table) {
      throw new Error('Table name is required for INSERT');
    }

    if (this._data.length === 0) {
      throw new Error('Insert data is required');
    }

    this.ctx.dialect.resetParameters();

    // Process encryption
    const processedData = this.processDataForEncryption(this._data);

    const components: InsertComponents = {
      table: this._table,
      data: processedData,
      returning: this._returning.length > 0 ? this._returning : undefined,
    };

    const result = this.ctx.dialect.buildInsert(components);
    let sql = result.sql;
    const { bindings } = result;

    // Handle INSERT IGNORE for MySQL
    if (this._ignore && this.ctx.dialect.name === 'mysql') {
      sql = sql.replace('INSERT INTO', 'INSERT IGNORE INTO');
    }

    return { sql, bindings };
  }

  /**
   * Execute insert and return result
   */
  async execute(): Promise<ExecuteResult> {
    const { sql, bindings } = this.toSQL();
    return this.ctx.executeWrite(sql, bindings);
  }

  /**
   * Execute and return inserted ID
   */
  async getInsertId(): Promise<number | bigint | undefined> {
    const result = await this.execute();
    return result.insertId;
  }

  /**
   * Execute and return inserted row (with RETURNING)
   */
  async getInserted<R = T>(): Promise<R | null> {
    if (this._returning.length === 0) {
      this._returning = ['*'];
    }

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<R>(sql, bindings);
    return result.rows[0] ?? null;
  }

  // ============ Private Methods ============

  private processDataForEncryption(data: Record<string, unknown>[]): Record<string, unknown>[] {
    if (this._encryptFields.size === 0 || !this.ctx.hasCrypto) {
      return data;
    }

    return data.map((row) => {
      const processed = { ...row };
      for (const field of this._encryptFields) {
        if (processed[field] && typeof processed[field] === 'string') {
          processed[field] = this.ctx.encrypt(processed[field]);
        }
      }
      return processed;
    });
  }
}

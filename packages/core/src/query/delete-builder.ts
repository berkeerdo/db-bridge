/**
 * Delete Query Builder
 *
 * Fluent builder for DELETE queries following SRP.
 *
 * @example
 * ```typescript
 * // Delete single record
 * const affected = await del
 *   .from('users')
 *   .where('id', 1)
 *   .execute();
 *
 * // Delete with conditions
 * await del
 *   .from('sessions')
 *   .where('expires_at', '<', new Date())
 *   .execute();
 *
 * // Truncate (delete all)
 * await del
 *   .from('logs')
 *   .truncate();
 * ```
 */

import { WhereBuilder } from './where-builder';

import type { QueryContext, ExecuteResult } from './query-context';
import type { DeleteComponents } from '../dialect/sql-dialect';

export class DeleteBuilder<T = unknown> {
  private _table?: string;
  private _whereBuilder: WhereBuilder;
  private _returning: string[] = [];
  private _force = false;

  constructor(private readonly ctx: QueryContext) {
    this._whereBuilder = new WhereBuilder(ctx.dialect);
  }

  /**
   * Set table to delete from
   */
  from(table: string): this {
    this._table = table;
    return this;
  }

  /**
   * Alias for from()
   */
  table(table: string): this {
    return this.from(table);
  }

  /**
   * Add RETURNING clause (PostgreSQL)
   */
  returning(...columns: string[]): this {
    this._returning = columns;
    return this;
  }

  /**
   * Allow delete without WHERE clause (dangerous!)
   */
  force(): this {
    this._force = true;
    return this;
  }

  // ============ WHERE Methods (delegated to WhereBuilder) ============

  where(column: string, value: unknown): this;
  where(column: string, operator: string, value: unknown): this;
  where(conditions: Record<string, unknown>): this;
  where(
    columnOrConditions: string | Record<string, unknown>,
    operatorOrValue?: string | unknown,
    value?: unknown,
  ): this {
    this._whereBuilder.where(columnOrConditions as any, operatorOrValue as any, value);
    return this;
  }

  orWhere(column: string, value: unknown): this;
  orWhere(column: string, operator: string, value: unknown): this;
  orWhere(conditions: Record<string, unknown>): this;
  orWhere(
    columnOrConditions: string | Record<string, unknown>,
    operatorOrValue?: string | unknown,
    value?: unknown,
  ): this {
    this._whereBuilder.orWhere(columnOrConditions as any, operatorOrValue as any, value);
    return this;
  }

  whereNull(column: string): this {
    this._whereBuilder.whereNull(column);
    return this;
  }

  whereNotNull(column: string): this {
    this._whereBuilder.whereNotNull(column);
    return this;
  }

  whereIn(column: string, values: unknown[]): this {
    this._whereBuilder.whereIn(column, values);
    return this;
  }

  whereNotIn(column: string, values: unknown[]): this {
    this._whereBuilder.whereNotIn(column, values);
    return this;
  }

  whereBetween(column: string, from: unknown, to: unknown): this {
    this._whereBuilder.whereBetween(column, from, to);
    return this;
  }

  whereLike(column: string, pattern: string): this {
    this._whereBuilder.whereLike(column, pattern);
    return this;
  }

  whereRaw(sql: string, bindings: unknown[] = []): this {
    this._whereBuilder.whereRaw(sql, bindings);
    return this;
  }

  // ============ Execution Methods ============

  /**
   * Build SQL without executing
   */
  toSQL(): { sql: string; bindings: unknown[] } {
    if (!this._table) {
      throw new Error('Table name is required for DELETE');
    }

    // Safety check: require WHERE clause unless force() is called
    if (!this._whereBuilder.hasConditions() && !this._force) {
      throw new Error(
        'DELETE without WHERE clause is dangerous. Use .force() to confirm deletion of all records.',
      );
    }

    this.ctx.dialect.resetParameters();

    const components: DeleteComponents = {
      table: this._table,
      where: this._whereBuilder.build(),
      returning: this._returning.length > 0 ? this._returning : undefined,
    };

    return this.ctx.dialect.buildDelete(components);
  }

  /**
   * Execute delete and return result
   */
  async execute(): Promise<ExecuteResult> {
    const { sql, bindings } = this.toSQL();
    return this.ctx.executeWrite(sql, bindings);
  }

  /**
   * Execute and return affected row count
   */
  async getAffectedRows(): Promise<number> {
    const result = await this.execute();
    return result.affectedRows;
  }

  /**
   * Execute and return deleted row (with RETURNING)
   */
  async getDeleted<R = T>(): Promise<R | null> {
    if (this._returning.length === 0) {
      this._returning = ['*'];
    }

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<R>(sql, bindings);
    return result.rows[0] ?? null;
  }

  /**
   * Execute and return all deleted rows (with RETURNING)
   */
  async getAllDeleted<R = T>(): Promise<R[]> {
    if (this._returning.length === 0) {
      this._returning = ['*'];
    }

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<R>(sql, bindings);
    return result.rows;
  }

  /**
   * Truncate table (delete all records efficiently)
   */
  async truncate(): Promise<void> {
    if (!this._table) {
      throw new Error('Table name is required for TRUNCATE');
    }

    const sql = `TRUNCATE TABLE ${this.ctx.dialect.escapeIdentifier(this._table)}`;
    await this.ctx.executeWrite(sql, []);
  }
}

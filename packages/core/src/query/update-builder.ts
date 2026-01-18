/**
 * Update Query Builder
 *
 * Fluent builder for UPDATE queries following SRP.
 *
 * @example
 * ```typescript
 * const affected = await update
 *   .table('users')
 *   .set({ name: 'John Doe', updated_at: new Date() })
 *   .where('id', 1)
 *   .execute();
 *
 * // Increment a value
 * await update
 *   .table('posts')
 *   .set({ views: raw('views + 1') })
 *   .where('id', postId)
 *   .execute();
 * ```
 */

import { WhereBuilder } from './where-builder';

import type { QueryContext, ExecuteResult } from './query-context';
import type { UpdateComponents } from '../dialect/sql-dialect';

export class UpdateBuilder<T = unknown> {
  private _table?: string;
  private _data: Record<string, unknown> = {};
  private _whereBuilder: WhereBuilder;
  private _returning: string[] = [];
  private _encryptFields: Set<string> = new Set();

  constructor(private readonly ctx: QueryContext) {
    this._whereBuilder = new WhereBuilder(ctx.dialect);
  }

  /**
   * Set table to update
   */
  table(table: string): this {
    this._table = table;
    return this;
  }

  /**
   * Set values to update
   */
  set(data: Record<string, unknown>): this {
    this._data = { ...this._data, ...data };
    return this;
  }

  /**
   * Mark fields to be encrypted before update
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
      throw new Error('Table name is required for UPDATE');
    }

    if (Object.keys(this._data).length === 0) {
      throw new Error('Update data is required');
    }

    this.ctx.dialect.resetParameters();

    // Process encryption
    const processedData = this.processDataForEncryption(this._data);

    const components: UpdateComponents = {
      table: this._table,
      data: processedData,
      where: this._whereBuilder.build(),
      returning: this._returning.length > 0 ? this._returning : undefined,
    };

    return this.ctx.dialect.buildUpdate(components);
  }

  /**
   * Execute update and return result
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
   * Execute and return updated row (with RETURNING)
   */
  async getUpdated<R = T>(): Promise<R | null> {
    if (this._returning.length === 0) {
      this._returning = ['*'];
    }

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<R>(sql, bindings);
    return result.rows[0] ?? null;
  }

  /**
   * Execute and return all updated rows (with RETURNING)
   */
  async getAllUpdated<R = T>(): Promise<R[]> {
    if (this._returning.length === 0) {
      this._returning = ['*'];
    }

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<R>(sql, bindings);
    return result.rows;
  }

  // ============ Private Methods ============

  private processDataForEncryption(data: Record<string, unknown>): Record<string, unknown> {
    if (this._encryptFields.size === 0 || !this.ctx.hasCrypto) {
      return data;
    }

    const processed = { ...data };
    for (const field of this._encryptFields) {
      if (processed[field] && typeof processed[field] === 'string') {
        processed[field] = this.ctx.encrypt(processed[field]);
      }
    }
    return processed;
  }
}

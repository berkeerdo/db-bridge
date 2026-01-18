/**
 * Select Query Builder
 *
 * Fluent builder for SELECT queries following SRP.
 * Modularized into logical concerns via traits.
 *
 * Related modules:
 * @see traits/select-join-trait.ts - JOIN operations
 * @see traits/select-grouping-trait.ts - GROUP BY, HAVING, ORDER BY
 * @see traits/select-cache-trait.ts - Query caching
 * @see traits/select-execution-trait.ts - Query execution
 *
 * @example
 * ```typescript
 * const users = await select
 *   .from('users')
 *   .select('id', 'name', 'email')
 *   .where('active', true)
 *   .orderBy('created_at', 'DESC')
 *   .limit(10)
 *   .get();
 * ```
 */

import { WhereBuilder } from './where-builder';

import type { QueryContext } from './query-context';
import type { SelectComponents, JoinDefinition, OrderByDefinition } from '../dialect/sql-dialect';
import type { CacheOptions, CacheState } from './traits/select-cache-trait';
import type { HavingClause } from './traits/select-grouping-trait';

// Re-export trait types for external use
export type { CacheOptions, CacheState } from './traits/select-cache-trait';
export type { HavingClause } from './traits/select-grouping-trait';

export class SelectBuilder<T = unknown> {
  // ============ Core State ============
  private _columns: string[] = [];
  private _distinct = false;
  private _table?: string;
  private _tableAlias?: string;

  // ============ Join State (from SelectJoinTrait) ============
  private _joins: JoinDefinition[] = [];

  // ============ Grouping State (from SelectGroupingTrait) ============
  private _groupBy: string[] = [];
  private _having?: HavingClause;
  private _orderBy: OrderByDefinition[] = [];

  // ============ Pagination State ============
  private _limit?: number;
  private _offset?: number;

  // ============ Where State ============
  private _whereBuilder: WhereBuilder;

  // ============ Encryption State ============
  private _encryptFields: Set<string> = new Set();
  private _decryptFields: Set<string> = new Set();

  // ============ Cache State (from SelectCacheTrait) ============
  private _cacheEnabled = false;
  private _cacheTTL?: number;
  private _cacheKey?: string;
  private _cacheTags?: string[];

  constructor(private readonly ctx: QueryContext) {
    if (ctx.cacheConfig?.global) {
      this._cacheEnabled = true;
    }
    this._whereBuilder = new WhereBuilder(ctx.dialect);
  }

  // ============ Core Selection Methods ============

  /**
   * Set columns to select
   */
  select(...columns: string[]): this {
    this._columns = columns;
    return this;
  }

  /**
   * Add columns to selection
   */
  addSelect(...columns: string[]): this {
    this._columns.push(...columns);
    return this;
  }

  /**
   * Add DISTINCT keyword
   */
  distinct(): this {
    this._distinct = true;
    return this;
  }

  /**
   * Set FROM table
   */
  from(table: string, alias?: string): this {
    this._table = table;
    this._tableAlias = alias;
    return this;
  }

  /**
   * Alias for from()
   */
  table(table: string, alias?: string): this {
    return this.from(table, alias);
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

  // ============ JOIN Methods (from SelectJoinTrait) ============

  join(table: string, condition: string, bindings: unknown[] = []): this {
    return this.innerJoin(table, condition, bindings);
  }

  innerJoin(table: string, condition: string, bindings: unknown[] = []): this {
    this._joins.push({ type: 'INNER', table, condition, bindings });
    return this;
  }

  leftJoin(table: string, condition: string, bindings: unknown[] = []): this {
    this._joins.push({ type: 'LEFT', table, condition, bindings });
    return this;
  }

  rightJoin(table: string, condition: string, bindings: unknown[] = []): this {
    this._joins.push({ type: 'RIGHT', table, condition, bindings });
    return this;
  }

  fullJoin(table: string, condition: string, bindings: unknown[] = []): this {
    this._joins.push({ type: 'FULL', table, condition, bindings });
    return this;
  }

  crossJoin(table: string): this {
    this._joins.push({ type: 'CROSS', table, condition: '', bindings: [] });
    return this;
  }

  leftJoinAs(table: string, alias: string, condition: string, bindings: unknown[] = []): this {
    this._joins.push({ type: 'LEFT', table, alias, condition, bindings });
    return this;
  }

  innerJoinAs(table: string, alias: string, condition: string, bindings: unknown[] = []): this {
    this._joins.push({ type: 'INNER', table, alias, condition, bindings });
    return this;
  }

  // ============ GROUP BY / HAVING (from SelectGroupingTrait) ============

  groupBy(...columns: string[]): this {
    this._groupBy.push(...columns);
    return this;
  }

  having(condition: string, bindings: unknown[] = []): this {
    this._having = { condition, bindings };
    return this;
  }

  // ============ ORDER BY (from SelectGroupingTrait) ============

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this._orderBy.push({ column, direction });
    return this;
  }

  orderByDesc(column: string): this {
    return this.orderBy(column, 'DESC');
  }

  orderByAsc(column: string): this {
    return this.orderBy(column, 'ASC');
  }

  orderByRaw(expression: string): this {
    this._orderBy.push({ column: expression, direction: 'ASC', raw: true });
    return this;
  }

  clearOrder(): this {
    this._orderBy = [];
    return this;
  }

  reorder(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this._orderBy = [];
    return this.orderBy(column, direction);
  }

  // ============ LIMIT / OFFSET / Pagination ============

  limit(count: number): this {
    this._limit = count;
    return this;
  }

  offset(count: number): this {
    this._offset = count;
    return this;
  }

  skip(count: number): this {
    return this.offset(count);
  }

  take(count: number): this {
    return this.limit(count);
  }

  paginate(page: number, perPage: number): this {
    this._limit = perPage;
    this._offset = (page - 1) * perPage;
    return this;
  }

  forPage(page: number, perPage = 15): this {
    return this.paginate(page, perPage);
  }

  // ============ Encryption ============

  encrypt(...fields: string[]): this {
    fields.forEach((f) => this._encryptFields.add(f));
    return this;
  }

  decrypt(...fields: string[]): this {
    fields.forEach((f) => this._decryptFields.add(f));
    return this;
  }

  // ============ Caching (from SelectCacheTrait) ============

  cache(options?: number | CacheOptions): this {
    if (!this.ctx.hasCache) {
      return this;
    }

    this._cacheEnabled = true;

    if (typeof options === 'number') {
      this._cacheTTL = options;
    } else if (options) {
      this._cacheTTL = options.ttl;
      this._cacheKey = options.key;
      this._cacheTags = options.tags;
    }

    return this;
  }

  noCache(): this {
    this._cacheEnabled = false;
    this._cacheTTL = undefined;
    this._cacheKey = undefined;
    this._cacheTags = undefined;
    return this;
  }

  cacheTTL(seconds: number): this {
    this._cacheTTL = seconds;
    return this;
  }

  cacheKey(key: string): this {
    this._cacheKey = key;
    return this;
  }

  cacheTags(...tags: string[]): this {
    this._cacheTags = tags;
    return this;
  }

  getCacheState(): CacheState {
    return {
      enabled: this._cacheEnabled,
      ttl: this._cacheTTL,
      key: this._cacheKey,
      tags: this._cacheTags,
    };
  }

  // ============ SQL Building ============

  toSQL(): { sql: string; bindings: unknown[] } {
    this.ctx.dialect.resetParameters();

    const components: SelectComponents = {
      columns: this._columns.length > 0 ? this._columns : ['*'],
      distinct: this._distinct,
      from: this._table,
      fromAlias: this._tableAlias,
      joins: this._joins,
      where: this._whereBuilder.build(),
      groupBy: this._groupBy,
      having: this._having,
      orderBy: this._orderBy,
      limit: this._limit,
      offset: this._offset,
    };

    return this.ctx.dialect.buildSelect(components);
  }

  // ============ Execution Methods (from SelectExecutionTrait) ============

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

  async first(): Promise<T | null> {
    this._limit = 1;
    const results = await this.get();
    return results[0] ?? null;
  }

  async firstOrFail(): Promise<T> {
    const result = await this.first();
    if (result === null) {
      throw new Error('No record found');
    }
    return result;
  }

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

  async count(column = '*'): Promise<number> {
    const originalColumns = this._columns;
    this._columns = [`COUNT(${column}) as count`];

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<{ count: string | number }>(sql, bindings);

    this._columns = originalColumns;
    return Number(result.rows[0]?.count ?? 0);
  }

  async exists(): Promise<boolean> {
    const count = await this.count();
    return count > 0;
  }

  async doesntExist(): Promise<boolean> {
    return !(await this.exists());
  }

  async aggregate(
    fn: 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT',
    column: string,
  ): Promise<number | null> {
    const originalColumns = this._columns;
    this._columns = [`${fn}(${this.ctx.dialect.escapeIdentifier(column)}) as value`];

    const { sql, bindings } = this.toSQL();
    const result = await this.ctx.executeQuery<{ value: string | number | null }>(sql, bindings);

    this._columns = originalColumns;
    const value = result.rows[0]?.value;
    return value === null ? null : Number(value);
  }

  sum(column: string): Promise<number | null> {
    return this.aggregate('SUM', column);
  }

  avg(column: string): Promise<number | null> {
    return this.aggregate('AVG', column);
  }

  min(column: string): Promise<number | null> {
    return this.aggregate('MIN', column);
  }

  max(column: string): Promise<number | null> {
    return this.aggregate('MAX', column);
  }

  async pluck<V = unknown>(column: string): Promise<V[]> {
    const originalColumns = this._columns;
    this._columns = [column];

    const results = await this.get();
    this._columns = originalColumns;

    return results.map((row: any) => row[column]) as V[];
  }

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

  async chunk(
    size: number,
    callback: (rows: T[], chunkNumber: number) => Promise<boolean | void> | boolean | void,
  ): Promise<void> {
    let offset = 0;
    let chunkNumber = 1;
    let hasMore = true;

    while (hasMore) {
      this._limit = size;
      this._offset = offset;

      const rows = await this.get();

      if (rows.length === 0) {
        hasMore = false;
        continue;
      }

      const result = await callback(rows, chunkNumber);

      if (result === false) {
        hasMore = false;
        continue;
      }

      offset += size;
      chunkNumber++;

      if (rows.length < size) {
        hasMore = false;
      }
    }
  }

  async *lazy(chunkSize = 100): AsyncGenerator<T, void, unknown> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      this._limit = chunkSize;
      this._offset = offset;

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

  // ============ Private Methods ============

  private processResults(rows: T[]): T[] {
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

  // ============ Utility Methods ============

  /**
   * Clone the builder
   */
  clone(): SelectBuilder<T> {
    const cloned = new SelectBuilder<T>(this.ctx);
    cloned._columns = [...this._columns];
    cloned._distinct = this._distinct;
    cloned._table = this._table;
    cloned._tableAlias = this._tableAlias;
    cloned._joins = [...this._joins];
    cloned._groupBy = [...this._groupBy];
    cloned._having = this._having ? { ...this._having } : undefined;
    cloned._orderBy = [...this._orderBy];
    cloned._limit = this._limit;
    cloned._offset = this._offset;
    cloned._encryptFields = new Set(this._encryptFields);
    cloned._decryptFields = new Set(this._decryptFields);
    cloned._cacheEnabled = this._cacheEnabled;
    cloned._cacheTTL = this._cacheTTL;
    cloned._cacheKey = this._cacheKey;
    cloned._cacheTags = this._cacheTags ? [...this._cacheTags] : undefined;
    // Clone the WhereBuilder to ensure independent state
    cloned._whereBuilder = this._whereBuilder.clone();
    return cloned;
  }

  /**
   * Debug helper - log query without executing
   */
  dump(): this {
    const { sql, bindings } = this.toSQL();
    // eslint-disable-next-line no-console
    console.log('SQL:', sql);
    // eslint-disable-next-line no-console
    console.log('Bindings:', bindings);
    return this;
  }

  /**
   * Debug helper - log and execute query
   */
  async dd(): Promise<T[]> {
    this.dump();
    return this.get();
  }
}

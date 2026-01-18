/**
 * Aggregate Trait
 *
 * Provides aggregate methods (count, sum, avg, min, max, exists) for query builders.
 */

import { validateColumnName } from '../utils';

import type { DatabaseAdapter } from '../interfaces';
import type { QueryOptions, QueryParams } from '../types';

export interface AggregateContext {
  adapter: DatabaseAdapter;
  selectColumns: string[];
  escapeIdentifierFn: (identifier: string) => string;
  toSQL: () => { sql: string; bindings: unknown[] };
}

interface AggregateRow {
  count?: string | number;
  aggregate?: string | number | null;
}

/**
 * Execute an aggregate query and return the result
 */
async function executeAggregate(
  ctx: AggregateContext,
  aggregateExpression: string,
  options?: QueryOptions,
): Promise<AggregateRow | undefined> {
  const originalSelect = ctx.selectColumns.slice();
  ctx.selectColumns.length = 0;
  ctx.selectColumns.push(aggregateExpression);

  try {
    const { sql, bindings } = ctx.toSQL();
    const result = await ctx.adapter.query<AggregateRow>(sql, bindings as QueryParams, options);
    return result.rows[0];
  } finally {
    ctx.selectColumns.length = 0;
    ctx.selectColumns.push(...originalSelect);
  }
}

/**
 * Count rows matching the query
 */
export async function count(
  ctx: AggregateContext,
  column = '*',
  options?: QueryOptions,
): Promise<number> {
  const row = await executeAggregate(ctx, `COUNT(${column}) as count`, options);
  return row ? Number(row.count) : 0;
}

/**
 * Sum of column values
 */
export async function sum(
  ctx: AggregateContext,
  column: string,
  options?: QueryOptions,
): Promise<number> {
  validateColumnName(column);
  const row = await executeAggregate(
    ctx,
    `SUM(${ctx.escapeIdentifierFn(column)}) as aggregate`,
    options,
  );
  return row?.aggregate ? Number(row.aggregate) : 0;
}

/**
 * Average of column values
 */
export async function avg(
  ctx: AggregateContext,
  column: string,
  options?: QueryOptions,
): Promise<number> {
  validateColumnName(column);
  const row = await executeAggregate(
    ctx,
    `AVG(${ctx.escapeIdentifierFn(column)}) as aggregate`,
    options,
  );
  return row?.aggregate ? Number(row.aggregate) : 0;
}

/**
 * Minimum column value
 */
export async function min(
  ctx: AggregateContext,
  column: string,
  options?: QueryOptions,
): Promise<number | null> {
  validateColumnName(column);
  const row = await executeAggregate(
    ctx,
    `MIN(${ctx.escapeIdentifierFn(column)}) as aggregate`,
    options,
  );
  if (row?.aggregate === null || row?.aggregate === undefined) {
    return null;
  }
  return Number(row.aggregate);
}

/**
 * Maximum column value
 */
export async function max(
  ctx: AggregateContext,
  column: string,
  options?: QueryOptions,
): Promise<number | null> {
  validateColumnName(column);
  const row = await executeAggregate(
    ctx,
    `MAX(${ctx.escapeIdentifierFn(column)}) as aggregate`,
    options,
  );
  if (row?.aggregate === null || row?.aggregate === undefined) {
    return null;
  }
  return Number(row.aggregate);
}

/**
 * Check if any rows exist
 */
export async function exists(ctx: AggregateContext, options?: QueryOptions): Promise<boolean> {
  const total = await count(ctx, '*', options);
  return total > 0;
}

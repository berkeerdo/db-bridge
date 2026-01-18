/**
 * Date Filter Trait
 *
 * Provides date-related WHERE clause methods for query builders.
 * Used by BaseQueryBuilder via composition.
 */

import { validateColumnName } from '../utils';

import type { WhereClause } from './query-builder-types';

export interface DateFilterContext {
  bindings: unknown[];
  whereClauses: WhereClause[];
  escapeIdentifierFn: (identifier: string) => string;
  parameterPlaceholderFn: (index: number) => string;
}

/**
 * Add a date comparison WHERE clause
 */
export function whereDate(
  ctx: DateFilterContext,
  column: string,
  operator: string,
  date: Date | string,
): void {
  validateColumnName(column);
  const dateValue = date instanceof Date ? date.toISOString().split('T')[0] : date;
  const placeholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 1);

  ctx.whereClauses.push({
    type: 'AND',
    condition: `DATE(${ctx.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
    bindings: [dateValue],
  });
  ctx.bindings.push(dateValue);
}

/**
 * Add a year comparison WHERE clause
 */
export function whereYear(
  ctx: DateFilterContext,
  column: string,
  operator: string,
  year: number,
): void {
  validateColumnName(column);
  const placeholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 1);

  ctx.whereClauses.push({
    type: 'AND',
    condition: `YEAR(${ctx.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
    bindings: [year],
  });
  ctx.bindings.push(year);
}

/**
 * Add a month comparison WHERE clause
 */
export function whereMonth(
  ctx: DateFilterContext,
  column: string,
  operator: string,
  month: number,
): void {
  validateColumnName(column);
  const placeholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 1);

  ctx.whereClauses.push({
    type: 'AND',
    condition: `MONTH(${ctx.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
    bindings: [month],
  });
  ctx.bindings.push(month);
}

/**
 * Add a day comparison WHERE clause
 */
export function whereDay(
  ctx: DateFilterContext,
  column: string,
  operator: string,
  day: number,
): void {
  validateColumnName(column);
  const placeholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 1);

  ctx.whereClauses.push({
    type: 'AND',
    condition: `DAY(${ctx.escapeIdentifierFn(column)}) ${operator} ${placeholder}`,
    bindings: [day],
  });
  ctx.bindings.push(day);
}

/**
 * Add a WHERE clause for today's date
 */
export function whereToday(ctx: DateFilterContext, column: string): void {
  const today = new Date().toISOString().split('T')[0]!;
  whereDate(ctx, column, '=', today);
}

/**
 * Add a WHERE clause for yesterday's date
 */
export function whereYesterday(ctx: DateFilterContext, column: string): void {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  whereDate(ctx, column, '=', yesterday.toISOString().split('T')[0]!);
}

/**
 * Add a WHERE clause for a date range
 */
export function whereBetweenDates(
  ctx: DateFilterContext,
  column: string,
  startDate: Date | string,
  endDate: Date | string,
): void {
  validateColumnName(column);
  const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
  const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;

  const startPlaceholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 1);
  const endPlaceholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 2);

  ctx.whereClauses.push({
    type: 'AND',
    condition: `DATE(${ctx.escapeIdentifierFn(column)}) BETWEEN ${startPlaceholder} AND ${endPlaceholder}`,
    bindings: [start, end],
  });
  ctx.bindings.push(start, end);
}

/**
 * Add a WHERE clause for the last N days
 */
export function whereLastDays(ctx: DateFilterContext, column: string, days: number): void {
  validateColumnName(column);
  const placeholder = ctx.parameterPlaceholderFn(ctx.bindings.length + 1);

  ctx.whereClauses.push({
    type: 'AND',
    condition: `${ctx.escapeIdentifierFn(column)} >= DATE_SUB(CURDATE(), INTERVAL ${placeholder} DAY)`,
    bindings: [days],
  });
  ctx.bindings.push(days);
}

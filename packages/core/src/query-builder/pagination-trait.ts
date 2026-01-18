/**
 * Pagination Trait
 *
 * Provides pagination methods for query builders.
 */

import { validateColumnName } from '../utils';

import type { PaginationResult, CursorPaginationResult } from '../interfaces';
import type { QueryOptions, QueryResult } from '../types';

export interface PaginationContext<T> {
  toSQL: () => { sql: string; bindings: unknown[] };
  where: (column: string, operator: string, value: unknown) => void;
  orderBy: (column: string, direction: 'ASC' | 'DESC') => void;
  count: (column: string, options?: QueryOptions) => Promise<number>;
  execute: (options?: QueryOptions) => Promise<QueryResult<T>>;
}

export interface PaginationState {
  limitValue?: number;
  offsetValue?: number;
}

/**
 * Paginate results with offset-based pagination
 */
export async function paginate<T>(
  ctx: PaginationContext<T>,
  state: PaginationState,
  page: number = 1,
  perPage: number = 15,
  options?: QueryOptions,
): Promise<PaginationResult<T>> {
  const safePage = page < 1 ? 1 : page;
  const safePerPage = perPage < 1 ? 15 : perPage;

  // Get total count
  const total = await ctx.count('*', options);

  // Calculate pagination
  const totalPages = Math.ceil(total / safePerPage);
  const offset = (safePage - 1) * safePerPage;

  // Set limit and offset
  state.limitValue = safePerPage;
  state.offsetValue = offset;

  // Execute query
  const result = await ctx.execute(options);

  const from = total > 0 ? offset + 1 : 0;
  const to = Math.min(offset + safePerPage, total);

  return {
    data: result.rows,
    pagination: {
      page: safePage,
      perPage: safePerPage,
      total,
      totalPages,
      hasMore: safePage < totalPages,
      from,
      to,
    },
  };
}

/**
 * Paginate results with cursor-based pagination
 */
export async function cursorPaginate<T>(
  ctx: PaginationContext<T>,
  state: PaginationState,
  cursorColumn: string,
  cursor: number | string | null = null,
  limit: number = 20,
  options?: QueryOptions,
): Promise<CursorPaginationResult<T>> {
  validateColumnName(cursorColumn);

  if (cursor !== null) {
    ctx.where(cursorColumn, '>', cursor);
  }

  ctx.orderBy(cursorColumn, 'ASC');
  state.limitValue = limit + 1;

  const result = await ctx.execute(options);
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

/**
 * Process results in chunks for memory efficiency
 */
export async function chunk<T>(
  ctx: PaginationContext<T>,
  state: PaginationState,
  size: number,
  callback: (items: T[], page: number) => Promise<void | false>,
  options?: QueryOptions,
): Promise<void> {
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const result = await paginate<T>(ctx, state, page, size, options);

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

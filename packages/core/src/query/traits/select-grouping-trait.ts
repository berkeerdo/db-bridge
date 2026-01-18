/**
 * Select Grouping Trait
 *
 * Provides GROUP BY, HAVING, and ORDER BY functionality for SELECT queries.
 */

import type { OrderByDefinition } from '../../dialect/sql-dialect';

export interface HavingClause {
  condition: string;
  bindings: unknown[];
}

/**
 * Standalone Grouping Trait class for composition
 */
export class SelectGroupingTrait {
  protected _groupBy: string[] = [];
  protected _having?: HavingClause;
  protected _orderBy: OrderByDefinition[] = [];

  /**
   * Add GROUP BY columns
   */
  groupBy(...columns: string[]): this {
    this._groupBy.push(...columns);
    return this;
  }

  /**
   * Set HAVING condition
   */
  having(condition: string, bindings: unknown[] = []): this {
    this._having = { condition, bindings };
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this._orderBy.push({ column, direction });
    return this;
  }

  /**
   * Add ORDER BY DESC
   */
  orderByDesc(column: string): this {
    return this.orderBy(column, 'DESC');
  }

  /**
   * Add ORDER BY ASC (explicit)
   */
  orderByAsc(column: string): this {
    return this.orderBy(column, 'ASC');
  }

  /**
   * Order by multiple columns
   */
  orderByMultiple(orders: Array<{ column: string; direction?: 'ASC' | 'DESC' }>): this {
    for (const order of orders) {
      this.orderBy(order.column, order.direction ?? 'ASC');
    }
    return this;
  }

  /**
   * Order by raw SQL expression
   */
  orderByRaw(expression: string): this {
    this._orderBy.push({ column: expression, direction: 'ASC', raw: true });
    return this;
  }

  /**
   * Clear all ordering
   */
  clearOrder(): this {
    this._orderBy = [];
    return this;
  }

  /**
   * Reorder (clear existing and add new)
   */
  reorder(column: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this._orderBy = [];
    return this.orderBy(column, direction);
  }

  /**
   * Get group by columns
   */
  getGroupBy(): string[] {
    return [...this._groupBy];
  }

  /**
   * Get having clause
   */
  getHaving(): HavingClause | undefined {
    return this._having ? { ...this._having } : undefined;
  }

  /**
   * Get order by definitions
   */
  getOrderBy(): OrderByDefinition[] {
    return [...this._orderBy];
  }
}

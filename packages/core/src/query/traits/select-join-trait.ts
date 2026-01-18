/**
 * Select Join Trait
 *
 * Provides JOIN functionality for SELECT queries.
 * Supports INNER, LEFT, RIGHT, and FULL joins.
 */

import type { JoinDefinition } from '../../dialect/sql-dialect';

export interface JoinCapable {
  _joins: JoinDefinition[];
}

/**
 * Mixin that adds JOIN methods to a class
 */
export function withJoinMethods<T extends new (...args: any[]) => JoinCapable>(Base: T) {
  return class extends Base {
    /**
     * Add INNER JOIN (alias for innerJoin)
     */
    join(table: string, condition: string, bindings: unknown[] = []): this {
      return this.innerJoin(table, condition, bindings);
    }

    /**
     * Add INNER JOIN
     */
    innerJoin(table: string, condition: string, bindings: unknown[] = []): this {
      this._joins.push({ type: 'INNER', table, condition, bindings });
      return this;
    }

    /**
     * Add LEFT JOIN
     */
    leftJoin(table: string, condition: string, bindings: unknown[] = []): this {
      this._joins.push({ type: 'LEFT', table, condition, bindings });
      return this;
    }

    /**
     * Add RIGHT JOIN
     */
    rightJoin(table: string, condition: string, bindings: unknown[] = []): this {
      this._joins.push({ type: 'RIGHT', table, condition, bindings });
      return this;
    }

    /**
     * Add FULL OUTER JOIN
     */
    fullJoin(table: string, condition: string, bindings: unknown[] = []): this {
      this._joins.push({ type: 'FULL', table, condition, bindings });
      return this;
    }

    /**
     * Add CROSS JOIN
     */
    crossJoin(table: string): this {
      this._joins.push({ type: 'CROSS', table, condition: '', bindings: [] });
      return this;
    }

    /**
     * Add LEFT JOIN with alias
     */
    leftJoinAs(table: string, alias: string, condition: string, bindings: unknown[] = []): this {
      this._joins.push({ type: 'LEFT', table, alias, condition, bindings });
      return this;
    }

    /**
     * Add INNER JOIN with alias
     */
    innerJoinAs(table: string, alias: string, condition: string, bindings: unknown[] = []): this {
      this._joins.push({ type: 'INNER', table, alias, condition, bindings });
      return this;
    }
  };
}

/**
 * Standalone Join Trait class for composition
 */
export class SelectJoinTrait {
  protected _joins: JoinDefinition[] = [];

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

  getJoins(): JoinDefinition[] {
    return [...this._joins];
  }

  clearJoins(): this {
    this._joins = [];
    return this;
  }
}

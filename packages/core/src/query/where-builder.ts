/**
 * Where Builder
 *
 * Handles WHERE clause construction with type-safe conditions.
 * Used by SelectBuilder, UpdateBuilder, and DeleteBuilder.
 *
 * Supports:
 * - Simple equality: where('column', value)
 * - Operators: where('column', '>=', value)
 * - Object syntax: where({ column1: value1, column2: value2 })
 * - Raw SQL: whereRaw('column > ?', [value])
 * - NULL checks: whereNull, whereNotNull
 * - IN clauses: whereIn, whereNotIn
 * - BETWEEN: whereBetween
 * - LIKE: whereLike
 */

import type { SQLDialect, WhereCondition } from '../dialect/sql-dialect';

export type WhereConditionInput =
  | { type: 'simple'; column: string; operator: string; value: unknown }
  | { type: 'object'; data: Record<string, unknown> }
  | { type: 'raw'; sql: string; bindings: unknown[] }
  | { type: 'null'; column: string; not: boolean }
  | { type: 'in'; column: string; values: unknown[]; not: boolean }
  | { type: 'between'; column: string; from: unknown; to: unknown; not: boolean }
  | { type: 'like'; column: string; pattern: string; not: boolean };

export class WhereBuilder {
  private conditions: Array<{ conjunction: 'AND' | 'OR'; input: WhereConditionInput }> = [];

  constructor(private readonly dialect: SQLDialect) {}

  /**
   * Add AND WHERE condition
   */
  where(column: string, value: unknown): this;
  where(column: string, operator: string, value: unknown): this;
  where(conditions: Record<string, unknown>): this;
  where(
    columnOrConditions: string | Record<string, unknown>,
    operatorOrValue?: string | unknown,
    value?: unknown,
  ): this {
    const input = this.parseWhereArgs(columnOrConditions, operatorOrValue, value);
    this.conditions.push({ conjunction: 'AND', input });
    return this;
  }

  /**
   * Add OR WHERE condition
   */
  orWhere(column: string, value: unknown): this;
  orWhere(column: string, operator: string, value: unknown): this;
  orWhere(conditions: Record<string, unknown>): this;
  orWhere(
    columnOrConditions: string | Record<string, unknown>,
    operatorOrValue?: string | unknown,
    value?: unknown,
  ): this {
    const input = this.parseWhereArgs(columnOrConditions, operatorOrValue, value);
    this.conditions.push({ conjunction: 'OR', input });
    return this;
  }

  /**
   * WHERE column IS NULL
   */
  whereNull(column: string): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'null', column, not: false },
    });
    return this;
  }

  /**
   * WHERE column IS NOT NULL
   */
  whereNotNull(column: string): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'null', column, not: true },
    });
    return this;
  }

  /**
   * WHERE column IN (...)
   */
  whereIn(column: string, values: unknown[]): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'in', column, values, not: false },
    });
    return this;
  }

  /**
   * WHERE column NOT IN (...)
   */
  whereNotIn(column: string, values: unknown[]): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'in', column, values, not: true },
    });
    return this;
  }

  /**
   * WHERE column BETWEEN ... AND ...
   */
  whereBetween(column: string, from: unknown, to: unknown): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'between', column, from, to, not: false },
    });
    return this;
  }

  /**
   * WHERE column NOT BETWEEN ... AND ...
   */
  whereNotBetween(column: string, from: unknown, to: unknown): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'between', column, from, to, not: true },
    });
    return this;
  }

  /**
   * WHERE column LIKE pattern
   */
  whereLike(column: string, pattern: string): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'like', column, pattern, not: false },
    });
    return this;
  }

  /**
   * WHERE column NOT LIKE pattern
   */
  whereNotLike(column: string, pattern: string): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'like', column, pattern, not: true },
    });
    return this;
  }

  /**
   * Raw WHERE clause
   */
  whereRaw(sql: string, bindings: unknown[] = []): this {
    this.conditions.push({
      conjunction: 'AND',
      input: { type: 'raw', sql, bindings },
    });
    return this;
  }

  /**
   * Build WHERE conditions for use by SQLDialect
   */
  build(): WhereCondition[] {
    return this.conditions.map(({ conjunction, input }, index) => {
      const result = this.buildCondition(input);
      return {
        type: index === 0 ? 'AND' : conjunction,
        sql: result.sql,
        bindings: result.bindings,
      };
    });
  }

  /**
   * Check if any conditions exist
   */
  hasConditions(): boolean {
    return this.conditions.length > 0;
  }

  /**
   * Clear all conditions
   */
  clear(): void {
    this.conditions = [];
  }

  /**
   * Clone the WhereBuilder
   */
  clone(): WhereBuilder {
    const cloned = new WhereBuilder(this.dialect);
    // Deep clone conditions array
    cloned.conditions = this.conditions.map((cond) => ({
      conjunction: cond.conjunction,
      input: this.cloneInput(cond.input),
    }));
    return cloned;
  }

  /**
   * Deep clone a WhereConditionInput
   */
  private cloneInput(input: WhereConditionInput): WhereConditionInput {
    switch (input.type) {
      case 'simple': {
        return { ...input };
      }
      case 'object': {
        return { ...input, data: { ...input.data } };
      }
      case 'raw': {
        return { ...input, bindings: [...input.bindings] };
      }
      case 'null': {
        return { ...input };
      }
      case 'in': {
        return { ...input, values: [...input.values] };
      }
      case 'between': {
        return { ...input };
      }
      case 'like': {
        return { ...input };
      }
    }
  }

  /**
   * Parse where method arguments into WhereConditionInput
   */
  private parseWhereArgs(
    columnOrConditions: string | Record<string, unknown>,
    operatorOrValue?: string | unknown,
    value?: unknown,
  ): WhereConditionInput {
    // Object syntax: where({ column: value })
    if (typeof columnOrConditions === 'object') {
      return { type: 'object', data: columnOrConditions };
    }

    // Three args: where('column', '>=', value)
    if (value !== undefined) {
      return {
        type: 'simple',
        column: columnOrConditions,
        operator: operatorOrValue as string,
        value,
      };
    }

    // Two args: where('column', value) - defaults to '='
    return {
      type: 'simple',
      column: columnOrConditions,
      operator: '=',
      value: operatorOrValue,
    };
  }

  /**
   * Build a single condition to SQL
   */
  private buildCondition(input: WhereConditionInput): { sql: string; bindings: unknown[] } {
    switch (input.type) {
      case 'simple': {
        return this.buildSimpleCondition(input.column, input.operator, input.value);
      }

      case 'object': {
        return this.buildObjectCondition(input.data);
      }

      case 'raw': {
        return { sql: input.sql, bindings: input.bindings };
      }

      case 'null': {
        return {
          sql: `${this.dialect.escapeIdentifier(input.column)} IS ${input.not ? 'NOT ' : ''}NULL`,
          bindings: [],
        };
      }

      case 'in': {
        return this.buildInCondition(input.column, input.values, input.not);
      }

      case 'between': {
        return this.buildBetweenCondition(input.column, input.from, input.to, input.not);
      }

      case 'like': {
        return {
          sql: `${this.dialect.escapeIdentifier(input.column)} ${input.not ? 'NOT ' : ''}LIKE ${this.dialect.getParameterPlaceholder()}`,
          bindings: [input.pattern],
        };
      }
    }
  }

  private buildSimpleCondition(
    column: string,
    operator: string,
    value: unknown,
  ): { sql: string; bindings: unknown[] } {
    const escapedColumn = this.dialect.escapeIdentifier(column);

    // Handle NULL values
    if (value === null || value === undefined) {
      if (operator === '=' || operator === '==') {
        return { sql: `${escapedColumn} IS NULL`, bindings: [] };
      }
      if (operator === '!=' || operator === '<>') {
        return { sql: `${escapedColumn} IS NOT NULL`, bindings: [] };
      }
    }

    const placeholder = this.dialect.getParameterPlaceholder();
    return {
      sql: `${escapedColumn} ${operator} ${placeholder}`,
      bindings: [value],
    };
  }

  private buildObjectCondition(data: Record<string, unknown>): {
    sql: string;
    bindings: unknown[];
  } {
    const clauses: string[] = [];
    const bindings: unknown[] = [];

    for (const [column, value] of Object.entries(data)) {
      const result = this.buildSimpleCondition(column, '=', value);
      clauses.push(result.sql);
      bindings.push(...result.bindings);
    }

    return {
      sql: clauses.length > 1 ? `(${clauses.join(' AND ')})` : clauses[0] || '1=1',
      bindings,
    };
  }

  private buildInCondition(
    column: string,
    values: unknown[],
    not: boolean,
  ): { sql: string; bindings: unknown[] } {
    if (values.length === 0) {
      // Empty IN clause - always false (or true for NOT IN)
      return { sql: not ? '1=1' : '1=0', bindings: [] };
    }

    const placeholders = values.map(() => this.dialect.getParameterPlaceholder());
    const operator = not ? 'NOT IN' : 'IN';

    return {
      sql: `${this.dialect.escapeIdentifier(column)} ${operator} (${placeholders.join(', ')})`,
      bindings: values,
    };
  }

  private buildBetweenCondition(
    column: string,
    from: unknown,
    to: unknown,
    not: boolean,
  ): { sql: string; bindings: unknown[] } {
    const escapedColumn = this.dialect.escapeIdentifier(column);
    const placeholder1 = this.dialect.getParameterPlaceholder();
    const placeholder2 = this.dialect.getParameterPlaceholder();
    const operator = not ? 'NOT BETWEEN' : 'BETWEEN';

    return {
      sql: `${escapedColumn} ${operator} ${placeholder1} AND ${placeholder2}`,
      bindings: [from, to],
    };
  }
}

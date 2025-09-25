import { QueryBuilder } from '../../interfaces';
import { ValidationError, validateColumnName } from '../../utils';

/**
 * Where clause methods trait
 * Provides where-related query methods
 */
export interface WhereQueryMethods<T> {
  where(column: string | Record<string, unknown>, operator?: string, value?: unknown): QueryBuilder<T>;
  orWhere(column: string | Record<string, unknown>, operator?: string, value?: unknown): QueryBuilder<T>;
  whereIn(column: string, values: unknown[]): QueryBuilder<T>;
  whereNotIn(column: string, values: unknown[]): QueryBuilder<T>;
  whereBetween(column: string, min: unknown, max: unknown): QueryBuilder<T>;
  whereNull(column: string): QueryBuilder<T>;
  whereNotNull(column: string): QueryBuilder<T>;
  whereRaw(sql: string, bindings?: unknown[]): QueryBuilder<T>;
}

export function applyWhereMethods<T>(
  builder: any,
  whereClauses: any[],
  bindings: unknown[],
  parameterPlaceholderFn: (index: number) => string,
  escapeIdentifierFn: (identifier: string) => string
): void {
  
  const addWhereClause = (
    type: 'AND' | 'OR',
    columnOrCondition: string | Record<string, unknown>,
    operator: string,
    value?: unknown
  ) => {
    if (typeof columnOrCondition === 'object') {
      // Handle object conditions: where({ age: 25, active: true })
      Object.entries(columnOrCondition).forEach(([col, val]) => {
        validateColumnName(col);
        const placeholder = parameterPlaceholderFn(bindings.length + 1);
        whereClauses.push({
          type,
          condition: `${escapeIdentifierFn(col)} = ${placeholder}`,
          bindings: [val],
        });
        bindings.push(val);
      });
    } else if (typeof columnOrCondition === 'string' && value !== undefined) {
      // Standard where: where('age', '>', 25)
      validateColumnName(columnOrCondition);
      const placeholder = parameterPlaceholderFn(bindings.length + 1);
      whereClauses.push({
        type,
        condition: `${escapeIdentifierFn(columnOrCondition)} ${operator} ${placeholder}`,
        bindings: [value],
      });
      bindings.push(value);
    } else {
      // Raw where: where('age > 25')
      whereClauses.push({
        type,
        condition: columnOrCondition as string,
        bindings: [],
      });
    }
  };

  builder.where = function(...args: any[]): QueryBuilder<T> {
    if (args.length === 3) {
      const [column, operator, value] = args;
      addWhereClause('AND', column, operator, value);
    } else if (args.length === 2) {
      const [column, value] = args;
      addWhereClause('AND', column, '=', value);
    } else if (args.length === 1) {
      const [condition] = args;
      addWhereClause('AND', condition, '=');
    }
    return builder;
  };

  builder.orWhere = function(...args: any[]): QueryBuilder<T> {
    if (args.length === 3) {
      const [column, operator, value] = args;
      addWhereClause('OR', column, operator, value);
    } else if (args.length === 2) {
      const [column, value] = args;
      addWhereClause('OR', column, '=', value);
    } else if (args.length === 1) {
      const [condition] = args;
      addWhereClause('OR', condition, '=');
    }
    return builder;
  };

  builder.whereIn = function(column: string, values: unknown[]): QueryBuilder<T> {
    validateColumnName(column);
    if (values.length === 0) {
      throw new ValidationError('whereIn requires at least one value');
    }

    const placeholders = values
      .map((_, index) => parameterPlaceholderFn(bindings.length + index + 1))
      .join(', ');
    
    whereClauses.push({
      type: 'AND',
      condition: `${escapeIdentifierFn(column)} IN (${placeholders})`,
      bindings: values,
    });
    bindings.push(...values);
    return builder;
  };

  builder.whereNotIn = function(column: string, values: unknown[]): QueryBuilder<T> {
    validateColumnName(column);
    if (values.length === 0) {
      throw new ValidationError('whereNotIn requires at least one value');
    }

    const placeholders = values
      .map((_, index) => parameterPlaceholderFn(bindings.length + index + 1))
      .join(', ');
    
    whereClauses.push({
      type: 'AND',
      condition: `${escapeIdentifierFn(column)} NOT IN (${placeholders})`,
      bindings: values,
    });
    bindings.push(...values);
    return builder;
  };

  builder.whereBetween = function(column: string, min: unknown, max: unknown): QueryBuilder<T> {
    validateColumnName(column);
    
    const minPlaceholder = parameterPlaceholderFn(bindings.length + 1);
    const maxPlaceholder = parameterPlaceholderFn(bindings.length + 2);
    
    whereClauses.push({
      type: 'AND',
      condition: `${escapeIdentifierFn(column)} BETWEEN ${minPlaceholder} AND ${maxPlaceholder}`,
      bindings: [min, max],
    });
    bindings.push(min, max);
    return builder;
  };

  builder.whereNull = function(column: string): QueryBuilder<T> {
    validateColumnName(column);
    whereClauses.push({
      type: 'AND',
      condition: `${escapeIdentifierFn(column)} IS NULL`,
      bindings: [],
    });
    return builder;
  };

  builder.whereNotNull = function(column: string): QueryBuilder<T> {
    validateColumnName(column);
    whereClauses.push({
      type: 'AND',
      condition: `${escapeIdentifierFn(column)} IS NOT NULL`,
      bindings: [],
    });
    return builder;
  };

  builder.whereRaw = function(sql: string, bindings?: unknown[]): QueryBuilder<T> {
    whereClauses.push({
      type: 'AND',
      condition: sql,
      bindings: bindings || [],
    });
    if (bindings) {
      builder.bindings.push(...bindings);
    }
    return builder;
  };
}
import { QueryBuilder } from '../../interfaces';
import { validateColumnName } from '../../utils';

/**
 * Date-related query methods trait
 * Provides date-specific where conditions for query builder
 */
export interface DateQueryMethods<T> {
  whereDate(column: string, operator: string, date: Date | string): QueryBuilder<T>;
  whereYear(column: string, operator: string, year: number): QueryBuilder<T>;
  whereMonth(column: string, operator: string, month: number): QueryBuilder<T>;
  whereDay(column: string, operator: string, day: number): QueryBuilder<T>;
  whereToday(column: string): QueryBuilder<T>;
  whereYesterday(column: string): QueryBuilder<T>;
  whereBetweenDates(column: string, startDate: Date | string, endDate: Date | string): QueryBuilder<T>;
  whereLastDays(column: string, days: number): QueryBuilder<T>;
}

export function applyDateMethods<T>(
  builder: any,
  addWhereClause: (type: 'AND' | 'OR', condition: string, bindings: unknown[]) => void,
  parameterPlaceholderFn: (index: number) => string,
  escapeIdentifierFn: (identifier: string) => string,
  bindings: unknown[]
): void {
  
  builder.whereDate = function(column: string, operator: string, date: Date | string): QueryBuilder<T> {
    validateColumnName(column);
    const dateValue = date instanceof Date ? date.toISOString().split('T')[0] : date;
    const placeholder = parameterPlaceholderFn(bindings.length + 1);
    
    addWhereClause('AND', `DATE(${escapeIdentifierFn(column)}) ${operator} ${placeholder}`, [dateValue]);
    bindings.push(dateValue);
    return builder;
  };

  builder.whereYear = function(column: string, operator: string, year: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = parameterPlaceholderFn(bindings.length + 1);
    
    addWhereClause('AND', `YEAR(${escapeIdentifierFn(column)}) ${operator} ${placeholder}`, [year]);
    bindings.push(year);
    return builder;
  };

  builder.whereMonth = function(column: string, operator: string, month: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = parameterPlaceholderFn(bindings.length + 1);
    
    addWhereClause('AND', `MONTH(${escapeIdentifierFn(column)}) ${operator} ${placeholder}`, [month]);
    bindings.push(month);
    return builder;
  };

  builder.whereDay = function(column: string, operator: string, day: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = parameterPlaceholderFn(bindings.length + 1);
    
    addWhereClause('AND', `DAY(${escapeIdentifierFn(column)}) ${operator} ${placeholder}`, [day]);
    bindings.push(day);
    return builder;
  };

  builder.whereToday = function(column: string): QueryBuilder<T> {
    const today = new Date().toISOString().split('T')[0];
    return builder.whereDate(column, '=', today);
  };

  builder.whereYesterday = function(column: string): QueryBuilder<T> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return builder.whereDate(column, '=', yesterday.toISOString().split('T')[0]);
  };

  builder.whereBetweenDates = function(column: string, startDate: Date | string, endDate: Date | string): QueryBuilder<T> {
    validateColumnName(column);
    const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
    const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;
    
    const startPlaceholder = parameterPlaceholderFn(bindings.length + 1);
    const endPlaceholder = parameterPlaceholderFn(bindings.length + 2);
    
    addWhereClause('AND', `DATE(${escapeIdentifierFn(column)}) BETWEEN ${startPlaceholder} AND ${endPlaceholder}`, [start, end]);
    bindings.push(start, end);
    return builder;
  };

  builder.whereLastDays = function(column: string, days: number): QueryBuilder<T> {
    validateColumnName(column);
    const placeholder = parameterPlaceholderFn(bindings.length + 1);
    
    addWhereClause('AND', `${escapeIdentifierFn(column)} >= DATE_SUB(CURDATE(), INTERVAL ${placeholder} DAY)`, [days]);
    bindings.push(days);
    return builder;
  };
}
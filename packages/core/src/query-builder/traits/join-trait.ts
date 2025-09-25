import { QueryBuilder } from '../../interfaces';
import { validateTableName } from '../../utils';

/**
 * Join-related query methods trait
 */
export interface JoinQueryMethods<T> {
  join(table: string, on: string, type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'): QueryBuilder<T>;
  leftJoin(table: string, on: string): QueryBuilder<T>;
  rightJoin(table: string, on: string): QueryBuilder<T>;
  innerJoin(table: string, on: string): QueryBuilder<T>;
  fullJoin(table: string, on: string): QueryBuilder<T>;
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  on: string;
}

export function applyJoinMethods<T>(
  builder: any,
  joins: JoinClause[]
): void {
  
  builder.join = function(
    table: string, 
    on: string, 
    type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' = 'INNER'
  ): QueryBuilder<T> {
    validateTableName(table);
    joins.push({ type, table, on });
    return builder;
  };

  builder.leftJoin = function(table: string, on: string): QueryBuilder<T> {
    return builder.join(table, on, 'LEFT');
  };

  builder.rightJoin = function(table: string, on: string): QueryBuilder<T> {
    return builder.join(table, on, 'RIGHT');
  };

  builder.innerJoin = function(table: string, on: string): QueryBuilder<T> {
    return builder.join(table, on, 'INNER');
  };

  builder.fullJoin = function(table: string, on: string): QueryBuilder<T> {
    return builder.join(table, on, 'FULL');
  };
}
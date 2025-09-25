import { QueryBuilder } from '../../interfaces';
import { validateTableName } from '../../utils';

/**
 * DML (Data Manipulation Language) methods trait
 * Provides insert, update, delete operations
 */
export interface DMLQueryMethods<T> {
  insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
  update(table: string, data: Record<string, unknown>): QueryBuilder<T>;
  delete(table: string): QueryBuilder<T>;
  insertInto(table: string): QueryBuilder<T>;
  values(data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder<T>;
  set(data: Record<string, unknown>): QueryBuilder<T>;
}

export function applyDMLMethods<T>(
  builder: any,
  state: {
    insertTable?: string;
    insertData?: Record<string, unknown> | Record<string, unknown>[];
    updateTable?: string;
    updateData?: Record<string, unknown>;
    deleteTable?: string;
  }
): void {
  
  builder.insert = function(
    table: string, 
    data: Record<string, unknown> | Record<string, unknown>[]
  ): QueryBuilder<T> {
    validateTableName(table);
    state.insertTable = table;
    state.insertData = data;
    return builder;
  };

  builder.insertInto = function(table: string): QueryBuilder<T> {
    validateTableName(table);
    state.insertTable = table;
    return builder;
  };

  builder.values = function(
    data: Record<string, unknown> | Record<string, unknown>[]
  ): QueryBuilder<T> {
    state.insertData = data;
    return builder;
  };

  builder.update = function(
    table: string, 
    data: Record<string, unknown>
  ): QueryBuilder<T> {
    validateTableName(table);
    state.updateTable = table;
    state.updateData = data;
    return builder;
  };

  builder.set = function(data: Record<string, unknown>): QueryBuilder<T> {
    state.updateData = data;
    return builder;
  };

  builder.delete = function(table: string): QueryBuilder<T> {
    validateTableName(table);
    state.deleteTable = table;
    return builder;
  };
}
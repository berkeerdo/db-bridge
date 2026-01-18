/**
 * Query Builder Module
 *
 * Provides type-safe, fluent query builders following SRP:
 * - SelectBuilder: SELECT queries
 * - InsertBuilder: INSERT queries
 * - UpdateBuilder: UPDATE queries
 * - DeleteBuilder: DELETE queries
 *
 * Each builder handles one type of query, eliminating the god-class anti-pattern.
 *
 * @module query
 */

export {
  QueryContext,
  type QueryExecutor,
  type ExecuteResult,
  type QueryContextCacheConfig,
} from './query-context';
export { SelectBuilder } from './select-builder';
export { InsertBuilder } from './insert-builder';
export { UpdateBuilder } from './update-builder';
export { DeleteBuilder } from './delete-builder';
export { WhereBuilder, type WhereConditionInput } from './where-builder';
export {
  createModularQueryBuilder,
  type ModularQueryBuilderOptions,
  type ModularQueryBuilder,
  type InferQueryResult,
  type QueryBuilderCacheConfig,
} from './query-factory';

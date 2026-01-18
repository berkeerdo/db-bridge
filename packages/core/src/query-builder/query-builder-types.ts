/**
 * Query Builder Types and Interfaces
 *
 * Shared types used by BaseQueryBuilder and its traits.
 */

import type { CryptoProvider } from '../crypto/crypto';
import type { DatabaseAdapter } from '../interfaces';

export interface QueryBuilderOptions {
  adapter: DatabaseAdapter;
  escapeIdentifier?: (identifier: string) => string;
  parameterPlaceholder?: (index: number) => string;
  crypto?: CryptoProvider;
}

export interface WhereClause {
  type: 'AND' | 'OR';
  condition: string;
  bindings: unknown[];
}

export interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
  table: string;
  on: string;
}

export interface OrderByClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

/**
 * Query state shared across traits
 */
export interface QueryState {
  selectColumns: string[];
  fromTable?: string;
  fromAlias?: string;
  joins: JoinClause[];
  whereClauses: WhereClause[];
  groupByColumns: string[];
  havingClause?: string;
  orderByColumns: OrderByClause[];
  limitValue?: number;
  offsetValue?: number;
  bindings: unknown[];
  isDistinct: boolean;

  // CRUD state
  insertTable?: string;
  insertData?: Record<string, unknown> | Record<string, unknown>[];
  updateTable?: string;
  updateData?: Record<string, unknown>;
  deleteTable?: string;

  // Raw SQL
  rawSql?: string;
  rawBindings?: unknown[];

  // Encryption
  encryptedFields: Set<string>;
  decryptedFields: Set<string>;
}

/**
 * Create initial query state
 */
export function createQueryState(): QueryState {
  return {
    selectColumns: ['*'],
    joins: [],
    whereClauses: [],
    groupByColumns: [],
    orderByColumns: [],
    bindings: [],
    isDistinct: false,
    encryptedFields: new Set(),
    decryptedFields: new Set(),
  };
}

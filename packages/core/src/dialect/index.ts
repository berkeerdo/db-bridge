/**
 * SQL Dialect Abstraction Layer
 *
 * This module provides database-agnostic SQL generation through
 * a dialect pattern, eliminating duplicate code between adapters.
 *
 * @module dialect
 */

export { SQLDialect, type DialectConfig } from './sql-dialect';
export { MySQLDialect } from './mysql-dialect';
export { PostgreSQLDialect } from './postgresql-dialect';
export { DialectFactory, type DialectDatabaseType } from './dialect-factory';

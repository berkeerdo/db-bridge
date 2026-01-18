/**
 * Schema Builder Module
 * Fluent API for database schema operations
 */

export { SchemaBuilder, AlterTableBuilder } from './SchemaBuilder';
export type { SchemaBuilderOptions } from './SchemaBuilder';

export { TableBuilder, ForeignKeyChain } from './TableBuilder';
export { ColumnBuilder, ForeignKeyBuilder } from './ColumnBuilder';

export { MySQLDialect as SchemaMySQLDialect } from './dialects/MySQLDialect';
export { PostgreSQLDialect as SchemaPostgreSQLDialect } from './dialects/PostgreSQLDialect';

export type {
  ColumnType as SchemaColumnType,
  ColumnDefinition as SchemaColumnDefinition,
  ForeignKeyDefinition as SchemaForeignKeyDefinition,
  ForeignKeyAction as SchemaForeignKeyAction,
  IndexDefinition as SchemaIndexDefinition,
  TableDefinition as SchemaTableDefinition,
  AlterOperation as SchemaAlterOperation,
  AlterTableDefinition as SchemaAlterTableDefinition,
  Dialect as SchemaDialect,
  SchemaDialect as SchemaDialectInterface,
} from './types';

/**
 * Schema Builder Types
 * Type definitions for the migration schema builder
 */

export type ColumnType =
  | 'increments'
  | 'bigIncrements'
  | 'integer'
  | 'bigInteger'
  | 'smallInteger'
  | 'tinyInteger'
  | 'float'
  | 'double'
  | 'decimal'
  | 'string'
  | 'text'
  | 'mediumText'
  | 'longText'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'time'
  | 'json'
  | 'jsonb'
  | 'uuid'
  | 'binary'
  | 'enum';

export interface ColumnDefinition {
  name: string;
  type: ColumnType;
  length?: number;
  precision?: number;
  scale?: number;
  enumValues?: string[];
  nullable: boolean;
  defaultValue?: unknown;
  defaultRaw?: string;
  unsigned: boolean;
  autoIncrement: boolean;
  primary: boolean;
  unique: boolean;
  index: boolean;
  comment?: string;
  after?: string;
  first: boolean;
  references?: ForeignKeyDefinition;
}

export interface ForeignKeyDefinition {
  column: string;
  table: string;
  referenceColumn: string;
  onDelete?: ForeignKeyAction;
  onUpdate?: ForeignKeyAction;
  name?: string;
}

export type ForeignKeyAction = 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';

export interface IndexDefinition {
  name?: string;
  columns: string[];
  unique: boolean;
  type?: 'btree' | 'hash' | 'fulltext' | 'spatial';
}

export interface TableDefinition {
  name: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
  primaryKey?: string[];
  engine?: string;
  charset?: string;
  collation?: string;
  comment?: string;
}

export type AlterOperation =
  | { type: 'addColumn'; column: ColumnDefinition }
  | { type: 'dropColumn'; name: string }
  | { type: 'renameColumn'; from: string; to: string }
  | { type: 'modifyColumn'; column: ColumnDefinition }
  | { type: 'addIndex'; index: IndexDefinition }
  | { type: 'dropIndex'; name: string }
  | { type: 'addForeignKey'; foreignKey: ForeignKeyDefinition }
  | { type: 'dropForeignKey'; name: string }
  | { type: 'addPrimary'; columns: string[] }
  | { type: 'dropPrimary' };

export interface AlterTableDefinition {
  tableName: string;
  operations: AlterOperation[];
}

export type Dialect = 'mysql' | 'postgresql';

export interface SchemaDialect {
  dialect: Dialect;
  createTable(definition: TableDefinition): string;
  dropTable(tableName: string): string;
  dropTableIfExists(tableName: string): string;
  renameTable(from: string, to: string): string;
  alterTable(definition: AlterTableDefinition): string[];
  hasTable(tableName: string): string;
  hasColumn(tableName: string, columnName: string): string;
  quoteIdentifier(name: string): string;
  quoteValue(value: unknown): string;
}

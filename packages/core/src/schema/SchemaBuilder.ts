/**
 * Schema Builder
 * Main API for database schema operations
 */

import { MySQLDialect } from './dialects/MySQLDialect';
import { PostgreSQLDialect } from './dialects/PostgreSQLDialect';
import { TableBuilder } from './TableBuilder';

import type {
  AlterOperation,
  AlterTableDefinition,
  ColumnDefinition,
  Dialect,
  SchemaDialect,
  ForeignKeyDefinition,
} from './types';
import type { DatabaseAdapter } from '../interfaces';

export interface SchemaBuilderOptions {
  dialect: Dialect;
  adapter?: DatabaseAdapter;
  /** When true, collects SQL statements instead of executing them */
  collectMode?: boolean;
}

export class SchemaBuilder {
  private dialectInstance: SchemaDialect;
  private adapter?: DatabaseAdapter;
  private collectMode: boolean;
  private collectedStatements: string[] = [];

  constructor(options: SchemaBuilderOptions) {
    this.adapter = options.adapter;
    this.collectMode = options.collectMode ?? false;

    switch (options.dialect) {
      case 'mysql': {
        this.dialectInstance = new MySQLDialect();
        break;
      }
      case 'postgresql': {
        this.dialectInstance = new PostgreSQLDialect();
        break;
      }
      default: {
        throw new Error(`Unsupported dialect: ${options.dialect}`);
      }
    }
  }

  /**
   * Get the dialect instance
   */
  get dialect(): SchemaDialect {
    return this.dialectInstance;
  }

  /**
   * Create a new table
   */
  async createTable(tableName: string, callback: (table: TableBuilder) => void): Promise<void> {
    const builder = new TableBuilder(tableName);
    callback(builder);

    const definition = builder.getDefinition();
    const sql = this.dialectInstance.createTable(definition);

    await this.execute(sql);

    // Create indexes separately for PostgreSQL
    if (this.dialectInstance.dialect === 'postgresql' && definition.indexes.length > 0) {
      const pgDialect = this.dialectInstance as PostgreSQLDialect;
      for (const index of definition.indexes) {
        const indexSql = pgDialect.createIndex(tableName, index);
        await this.execute(indexSql);
      }
    }
  }

  /**
   * Create a table if it doesn't exist
   */
  async createTableIfNotExists(
    tableName: string,
    callback: (table: TableBuilder) => void,
  ): Promise<void> {
    const exists = await this.hasTable(tableName);
    if (!exists) {
      await this.createTable(tableName, callback);
    }
  }

  /**
   * Drop a table
   */
  async dropTable(tableName: string): Promise<void> {
    const sql = this.dialectInstance.dropTable(tableName);
    await this.execute(sql);
  }

  /**
   * Drop a table if it exists
   */
  async dropTableIfExists(tableName: string): Promise<void> {
    const sql = this.dialectInstance.dropTableIfExists(tableName);
    await this.execute(sql);
  }

  /**
   * Rename a table
   */
  async renameTable(from: string, to: string): Promise<void> {
    const sql = this.dialectInstance.renameTable(from, to);
    await this.execute(sql);
  }

  /**
   * Check if a table exists
   */
  async hasTable(tableName: string): Promise<boolean> {
    const sql = this.dialectInstance.hasTable(tableName);
    const result = await this.query(sql);
    return result.length > 0;
  }

  /**
   * Check if a column exists in a table
   */
  async hasColumn(tableName: string, columnName: string): Promise<boolean> {
    const sql = this.dialectInstance.hasColumn(tableName, columnName);
    const result = await this.query(sql);
    return result.length > 0;
  }

  /**
   * Alter a table
   */
  async alterTable(tableName: string, callback: (table: AlterTableBuilder) => void): Promise<void> {
    const builder = new AlterTableBuilder(tableName);
    callback(builder);

    const definition = builder.getDefinition();
    const statements = this.dialectInstance.alterTable(definition);

    for (const sql of statements) {
      await this.execute(sql);
    }
  }

  /**
   * Execute raw SQL
   */
  async raw(sql: string, params?: unknown[]): Promise<void> {
    await this.execute(sql, params);
  }

  /**
   * Execute SQL statement
   */
  private async execute(sql: string, params?: unknown[]): Promise<void> {
    // In collect mode, just store the SQL
    if (this.collectMode) {
      let statement = sql;
      if (params && params.length > 0) {
        statement += ` -- params: ${JSON.stringify(params)}`;
      }
      this.collectedStatements.push(statement);
      return;
    }

    if (this.adapter) {
      // Cast params to the expected type
      await this.adapter.execute(sql, params as import('../types').QueryParams);
    } else {
      // If no adapter, just log the SQL (useful for dry-run)
      // eslint-disable-next-line no-console
      console.log('SQL:', sql);
      if (params && params.length > 0) {
        // eslint-disable-next-line no-console
        console.log('Params:', params);
      }
    }
  }

  /**
   * Get collected SQL statements (only in collectMode)
   */
  getCollectedStatements(): string[] {
    return [...this.collectedStatements];
  }

  /**
   * Clear collected SQL statements
   */
  clearCollectedStatements(): void {
    this.collectedStatements = [];
  }

  /**
   * Execute SQL query
   */
  private async query(sql: string): Promise<unknown[]> {
    if (this.adapter) {
      const result = await this.adapter.query(sql);
      return result.rows;
    }
    return [];
  }

  /**
   * Generate SQL without executing (for preview/dry-run)
   */
  generateCreateTableSQL(tableName: string, callback: (table: TableBuilder) => void): string {
    const builder = new TableBuilder(tableName);
    callback(builder);
    return this.dialectInstance.createTable(builder.getDefinition());
  }

  /**
   * Generate ALTER TABLE SQL without executing
   */
  generateAlterTableSQL(tableName: string, callback: (table: AlterTableBuilder) => void): string[] {
    const builder = new AlterTableBuilder(tableName);
    callback(builder);
    return this.dialectInstance.alterTable(builder.getDefinition());
  }
}

/**
 * Alter Table Builder
 * Builder for ALTER TABLE operations
 */
export class AlterTableBuilder {
  private tableName: string;
  private operations: AlterOperation[] = [];

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  /**
   * Add a new column
   */
  addColumn(
    name: string,
    type: ColumnDefinition['type'],
    options?: Partial<Omit<ColumnDefinition, 'name' | 'type'>>,
  ): this {
    this.operations.push({
      type: 'addColumn',
      column: {
        name,
        type,
        nullable: true,
        unsigned: false,
        autoIncrement: false,
        primary: false,
        unique: false,
        index: false,
        first: false,
        ...options,
      },
    });
    return this;
  }

  /**
   * Drop a column
   */
  dropColumn(name: string): this {
    this.operations.push({ type: 'dropColumn', name });
    return this;
  }

  /**
   * Rename a column
   */
  renameColumn(from: string, to: string): this {
    this.operations.push({ type: 'renameColumn', from, to });
    return this;
  }

  /**
   * Modify a column
   */
  modifyColumn(
    name: string,
    type: ColumnDefinition['type'],
    options?: Partial<Omit<ColumnDefinition, 'name' | 'type'>>,
  ): this {
    this.operations.push({
      type: 'modifyColumn',
      column: {
        name,
        type,
        nullable: true,
        unsigned: false,
        autoIncrement: false,
        primary: false,
        unique: false,
        index: false,
        first: false,
        ...options,
      },
    });
    return this;
  }

  /**
   * Add an index
   */
  addIndex(columns: string | string[], name?: string): this {
    const columnArray = Array.isArray(columns) ? columns : [columns];
    this.operations.push({
      type: 'addIndex',
      index: {
        name: name || `idx_${this.tableName}_${columnArray.join('_')}`,
        columns: columnArray,
        unique: false,
      },
    });
    return this;
  }

  /**
   * Add a unique index
   */
  addUnique(columns: string | string[], name?: string): this {
    const columnArray = Array.isArray(columns) ? columns : [columns];
    this.operations.push({
      type: 'addIndex',
      index: {
        name: name || `uniq_${this.tableName}_${columnArray.join('_')}`,
        columns: columnArray,
        unique: true,
      },
    });
    return this;
  }

  /**
   * Drop an index
   */
  dropIndex(name: string): this {
    this.operations.push({ type: 'dropIndex', name });
    return this;
  }

  /**
   * Add a foreign key
   */
  addForeign(column: string): AlterForeignKeyBuilder {
    return new AlterForeignKeyBuilder(this, column);
  }

  /**
   * Add foreign key (internal)
   */
  addForeignKeyOperation(fk: ForeignKeyDefinition): void {
    this.operations.push({ type: 'addForeignKey', foreignKey: fk });
  }

  /**
   * Drop a foreign key
   */
  dropForeign(name: string): this {
    this.operations.push({ type: 'dropForeignKey', name });
    return this;
  }

  /**
   * Add primary key
   */
  addPrimary(columns: string | string[]): this {
    const columnArray = Array.isArray(columns) ? columns : [columns];
    this.operations.push({ type: 'addPrimary', columns: columnArray });
    return this;
  }

  /**
   * Drop primary key
   */
  dropPrimary(): this {
    this.operations.push({ type: 'dropPrimary' });
    return this;
  }

  /**
   * Get the alter table definition
   */
  getDefinition(): AlterTableDefinition {
    return {
      tableName: this.tableName,
      operations: [...this.operations],
    };
  }
}

/**
 * Alter Foreign Key Builder
 */
class AlterForeignKeyBuilder {
  private builder: AlterTableBuilder;
  private fkDefinition: Partial<ForeignKeyDefinition>;

  constructor(builder: AlterTableBuilder, column: string) {
    this.builder = builder;
    this.fkDefinition = { column };
  }

  references(column: string): this {
    this.fkDefinition.referenceColumn = column;
    return this;
  }

  on(tableName: string): this {
    this.fkDefinition.table = tableName;
    this.apply();
    return this;
  }

  onDelete(action: ForeignKeyDefinition['onDelete']): this {
    this.fkDefinition.onDelete = action;
    this.apply();
    return this;
  }

  onUpdate(action: ForeignKeyDefinition['onUpdate']): this {
    this.fkDefinition.onUpdate = action;
    this.apply();
    return this;
  }

  name(name: string): this {
    this.fkDefinition.name = name;
    this.apply();
    return this;
  }

  private apply(): void {
    if (this.fkDefinition.column && this.fkDefinition.table && this.fkDefinition.referenceColumn) {
      if (!this.fkDefinition.name) {
        this.fkDefinition.name = `fk_${this.fkDefinition.column}_${this.fkDefinition.table}`;
      }
      this.builder.addForeignKeyOperation(this.fkDefinition as ForeignKeyDefinition);
    }
  }
}

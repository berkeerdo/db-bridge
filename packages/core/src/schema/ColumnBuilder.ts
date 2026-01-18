/**
 * Column Builder
 * Fluent API for defining table columns
 */

import type { ColumnDefinition, ColumnType, ForeignKeyAction, ForeignKeyDefinition } from './types';

export class ColumnBuilder {
  private definition: ColumnDefinition;

  constructor(name: string, type: ColumnType) {
    this.definition = {
      name,
      type,
      nullable: type !== 'increments' && type !== 'bigIncrements',
      unsigned: false,
      autoIncrement: type === 'increments' || type === 'bigIncrements',
      primary: type === 'increments' || type === 'bigIncrements',
      unique: false,
      index: false,
      first: false,
    };
  }

  /**
   * Set column length (for string types)
   */
  length(length: number): this {
    this.definition.length = length;
    return this;
  }

  /**
   * Set precision and scale (for decimal types)
   */
  precision(precision: number, scale?: number): this {
    this.definition.precision = precision;
    this.definition.scale = scale;
    return this;
  }

  /**
   * Mark column as nullable
   */
  nullable(): this {
    this.definition.nullable = true;
    return this;
  }

  /**
   * Mark column as not nullable
   */
  notNull(): this {
    this.definition.nullable = false;
    return this;
  }

  /**
   * Alias for notNull()
   */
  notNullable(): this {
    return this.notNull();
  }

  /**
   * Set default value
   */
  default(value: unknown): this {
    this.definition.defaultValue = value;
    return this;
  }

  /**
   * Set default value as raw SQL
   */
  defaultRaw(sql: string): this {
    this.definition.defaultRaw = sql;
    return this;
  }

  /**
   * Set default to current timestamp
   */
  defaultNow(): this {
    this.definition.defaultRaw = 'CURRENT_TIMESTAMP';
    return this;
  }

  /**
   * Mark column as unsigned (MySQL)
   */
  unsigned(): this {
    this.definition.unsigned = true;
    return this;
  }

  /**
   * Mark column as auto increment
   */
  autoIncrement(): this {
    this.definition.autoIncrement = true;
    return this;
  }

  /**
   * Mark column as primary key
   */
  primary(): this {
    this.definition.primary = true;
    return this;
  }

  /**
   * Mark column as unique
   */
  unique(): this {
    this.definition.unique = true;
    return this;
  }

  /**
   * Add index to column
   */
  index(): this {
    this.definition.index = true;
    return this;
  }

  /**
   * Add comment to column
   */
  comment(comment: string): this {
    this.definition.comment = comment;
    return this;
  }

  /**
   * Position column after another column (MySQL)
   */
  after(columnName: string): this {
    this.definition.after = columnName;
    return this;
  }

  /**
   * Position column first (MySQL)
   */
  first(): this {
    this.definition.first = true;
    return this;
  }

  /**
   * Set enum values
   */
  values(values: string[]): this {
    this.definition.enumValues = values;
    return this;
  }

  /**
   * Add foreign key reference
   */
  references(column: string): ForeignKeyBuilder {
    const fkBuilder = new ForeignKeyBuilder(this, column);
    return fkBuilder;
  }

  /**
   * Set foreign key definition (internal)
   */
  setForeignKey(fk: ForeignKeyDefinition): void {
    this.definition.references = fk;
  }

  /**
   * Get the column definition
   */
  getDefinition(): ColumnDefinition {
    return { ...this.definition };
  }
}

/**
 * Foreign Key Builder
 * Fluent API for defining foreign key constraints
 */
export class ForeignKeyBuilder {
  private columnBuilder: ColumnBuilder;
  private fkDefinition: Partial<ForeignKeyDefinition>;

  constructor(columnBuilder: ColumnBuilder, referenceColumn: string) {
    this.columnBuilder = columnBuilder;
    this.fkDefinition = {
      column: columnBuilder.getDefinition().name,
      referenceColumn,
    };
  }

  /**
   * Set the referenced table
   */
  on(tableName: string): this {
    this.fkDefinition.table = tableName;
    this.applyToColumn();
    return this;
  }

  /**
   * Alias for on()
   */
  inTable(tableName: string): this {
    return this.on(tableName);
  }

  /**
   * Set ON DELETE action
   */
  onDelete(action: ForeignKeyAction): this {
    this.fkDefinition.onDelete = action;
    this.applyToColumn();
    return this;
  }

  /**
   * Set ON UPDATE action
   */
  onUpdate(action: ForeignKeyAction): this {
    this.fkDefinition.onUpdate = action;
    this.applyToColumn();
    return this;
  }

  /**
   * Set constraint name
   */
  name(name: string): this {
    this.fkDefinition.name = name;
    this.applyToColumn();
    return this;
  }

  /**
   * Apply the foreign key definition to the column
   */
  private applyToColumn(): void {
    if (this.fkDefinition.table && this.fkDefinition.referenceColumn) {
      this.columnBuilder.setForeignKey(this.fkDefinition as ForeignKeyDefinition);
    }
  }

  /**
   * Get the column builder for chaining
   */
  getColumnBuilder(): ColumnBuilder {
    return this.columnBuilder;
  }
}

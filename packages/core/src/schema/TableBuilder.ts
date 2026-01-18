/**
 * Table Builder
 * Fluent API for defining table structure
 */

import { ColumnBuilder } from './ColumnBuilder';

import type {
  ColumnDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  TableDefinition,
  ForeignKeyAction,
} from './types';

export class TableBuilder {
  private tableName: string;
  private columns: ColumnDefinition[] = [];
  private indexes: IndexDefinition[] = [];
  private foreignKeys: ForeignKeyDefinition[] = [];
  private primaryKeyColumns?: string[];
  private tableEngine?: string;
  private tableCharset?: string;
  private tableCollation?: string;
  private tableComment?: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  // ============================================
  // Column Types
  // ============================================

  /**
   * Auto-incrementing integer primary key
   */
  increments(name: string = 'id'): ColumnBuilder {
    return this.addColumn(name, 'increments');
  }

  /**
   * Auto-incrementing big integer primary key
   */
  bigIncrements(name: string = 'id'): ColumnBuilder {
    return this.addColumn(name, 'bigIncrements');
  }

  /**
   * Integer column
   */
  integer(name: string): ColumnBuilder {
    return this.addColumn(name, 'integer');
  }

  /**
   * Big integer column
   */
  bigInteger(name: string): ColumnBuilder {
    return this.addColumn(name, 'bigInteger');
  }

  /**
   * Small integer column
   */
  smallInteger(name: string): ColumnBuilder {
    return this.addColumn(name, 'smallInteger');
  }

  /**
   * Tiny integer column
   */
  tinyInteger(name: string): ColumnBuilder {
    return this.addColumn(name, 'tinyInteger');
  }

  /**
   * Float column
   */
  float(name: string): ColumnBuilder {
    return this.addColumn(name, 'float');
  }

  /**
   * Double column
   */
  double(name: string): ColumnBuilder {
    return this.addColumn(name, 'double');
  }

  /**
   * Decimal column
   */
  decimal(name: string, precision: number = 10, scale: number = 2): ColumnBuilder {
    return this.addColumn(name, 'decimal').precision(precision, scale);
  }

  /**
   * String (VARCHAR) column
   */
  string(name: string, length: number = 255): ColumnBuilder {
    return this.addColumn(name, 'string').length(length);
  }

  /**
   * Text column
   */
  text(name: string): ColumnBuilder {
    return this.addColumn(name, 'text');
  }

  /**
   * Medium text column
   */
  mediumText(name: string): ColumnBuilder {
    return this.addColumn(name, 'mediumText');
  }

  /**
   * Long text column
   */
  longText(name: string): ColumnBuilder {
    return this.addColumn(name, 'longText');
  }

  /**
   * Boolean column
   */
  boolean(name: string): ColumnBuilder {
    return this.addColumn(name, 'boolean');
  }

  /**
   * Date column
   */
  date(name: string): ColumnBuilder {
    return this.addColumn(name, 'date');
  }

  /**
   * Datetime column
   */
  datetime(name: string): ColumnBuilder {
    return this.addColumn(name, 'datetime');
  }

  /**
   * Timestamp column
   */
  timestamp(name: string): ColumnBuilder {
    return this.addColumn(name, 'timestamp');
  }

  /**
   * Time column
   */
  time(name: string): ColumnBuilder {
    return this.addColumn(name, 'time');
  }

  /**
   * JSON column
   */
  json(name: string): ColumnBuilder {
    return this.addColumn(name, 'json');
  }

  /**
   * JSONB column (PostgreSQL)
   */
  jsonb(name: string): ColumnBuilder {
    return this.addColumn(name, 'jsonb');
  }

  /**
   * UUID column
   */
  uuid(name: string): ColumnBuilder {
    return this.addColumn(name, 'uuid');
  }

  /**
   * Binary column
   */
  binary(name: string): ColumnBuilder {
    return this.addColumn(name, 'binary');
  }

  /**
   * Enum column
   */
  enum(name: string, values: string[]): ColumnBuilder {
    return this.addColumn(name, 'enum').values(values);
  }

  // ============================================
  // Shortcut Methods
  // ============================================

  /**
   * Add created_at and updated_at timestamp columns
   */
  timestamps(): void {
    this.timestamp('created_at').notNull().defaultNow();
    this.timestamp('updated_at').notNull().defaultNow();
  }

  /**
   * Add deleted_at timestamp column for soft deletes
   */
  softDeletes(): ColumnBuilder {
    return this.timestamp('deleted_at').nullable();
  }

  /**
   * Add foreign id column with foreign key
   */
  foreignId(name: string): ColumnBuilder {
    // Extract table name from column name (e.g., user_id -> users)
    const tableName = `${name.replace(/_id$/, '')}s`;
    const column = this.integer(name).unsigned().notNull();
    // Add foreign key separately
    this.foreign(name).references('id').on(tableName);
    return column;
  }

  /**
   * Add UUID primary key column
   */
  uuidPrimary(name: string = 'id'): ColumnBuilder {
    return this.uuid(name).primary().notNull();
  }

  // ============================================
  // Indexes
  // ============================================

  /**
   * Add an index
   */
  index(columns: string | string[], name?: string): this {
    const columnArray = Array.isArray(columns) ? columns : [columns];
    this.indexes.push({
      name: name || `idx_${this.tableName}_${columnArray.join('_')}`,
      columns: columnArray,
      unique: false,
    });
    return this;
  }

  /**
   * Add a unique index
   */
  unique(columns: string | string[], name?: string): this {
    const columnArray = Array.isArray(columns) ? columns : [columns];
    this.indexes.push({
      name: name || `uniq_${this.tableName}_${columnArray.join('_')}`,
      columns: columnArray,
      unique: true,
    });
    return this;
  }

  /**
   * Add a fulltext index (MySQL)
   */
  fulltext(columns: string | string[], name?: string): this {
    const columnArray = Array.isArray(columns) ? columns : [columns];
    this.indexes.push({
      name: name || `ft_${this.tableName}_${columnArray.join('_')}`,
      columns: columnArray,
      unique: false,
      type: 'fulltext',
    });
    return this;
  }

  /**
   * Set primary key columns
   */
  primary(columns: string | string[]): this {
    this.primaryKeyColumns = Array.isArray(columns) ? columns : [columns];
    return this;
  }

  // ============================================
  // Foreign Keys
  // ============================================

  /**
   * Add a foreign key constraint
   */
  foreign(column: string): ForeignKeyChain {
    return new ForeignKeyChain(this, column);
  }

  /**
   * Add foreign key (internal)
   */
  addForeignKey(fk: ForeignKeyDefinition): void {
    this.foreignKeys.push(fk);
  }

  // ============================================
  // Table Options
  // ============================================

  /**
   * Set table engine (MySQL)
   */
  engine(engine: string): this {
    this.tableEngine = engine;
    return this;
  }

  /**
   * Set table charset (MySQL)
   */
  charset(charset: string): this {
    this.tableCharset = charset;
    return this;
  }

  /**
   * Set table collation (MySQL)
   */
  collation(collation: string): this {
    this.tableCollation = collation;
    return this;
  }

  /**
   * Set table comment
   */
  comment(comment: string): this {
    this.tableComment = comment;
    return this;
  }

  // ============================================
  // Internal Methods
  // ============================================

  /**
   * Add a column and return its builder
   */
  private addColumn(name: string, type: ColumnDefinition['type']): ColumnBuilder {
    const builder = new ColumnBuilder(name, type);
    // Store reference to add definition later
    this.columns.push(builder.getDefinition());
    // Return builder for chaining, but we need to update the stored definition
    const index = this.columns.length - 1;
    const proxy = new Proxy(builder, {
      get: (target, prop, receiver) => {
        const result = Reflect.get(target, prop, receiver);
        if (typeof result === 'function') {
          return (...args: unknown[]) => {
            const returnValue = result.apply(target, args);
            // Update stored definition after each method call
            this.columns[index] = target.getDefinition();
            return returnValue === target ? proxy : returnValue;
          };
        }
        return result;
      },
    });
    return proxy;
  }

  /**
   * Get the table definition
   */
  getDefinition(): TableDefinition {
    return {
      name: this.tableName,
      columns: [...this.columns],
      indexes: [...this.indexes],
      foreignKeys: [...this.foreignKeys],
      primaryKey: this.primaryKeyColumns,
      engine: this.tableEngine,
      charset: this.tableCharset,
      collation: this.tableCollation,
      comment: this.tableComment,
    };
  }
}

/**
 * Foreign Key Chain Builder
 */
export class ForeignKeyChain {
  private tableBuilder: TableBuilder;
  private fkDefinition: Partial<ForeignKeyDefinition>;

  constructor(tableBuilder: TableBuilder, column: string) {
    this.tableBuilder = tableBuilder;
    this.fkDefinition = { column };
  }

  /**
   * Set the referenced column
   */
  references(column: string): this {
    this.fkDefinition.referenceColumn = column;
    return this;
  }

  /**
   * Set the referenced table
   */
  on(tableName: string): this {
    this.fkDefinition.table = tableName;
    this.apply();
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
    this.apply();
    return this;
  }

  /**
   * Set ON UPDATE action
   */
  onUpdate(action: ForeignKeyAction): this {
    this.fkDefinition.onUpdate = action;
    this.apply();
    return this;
  }

  /**
   * Set constraint name
   */
  name(name: string): this {
    this.fkDefinition.name = name;
    this.apply();
    return this;
  }

  /**
   * Apply the foreign key to the table
   */
  private apply(): void {
    if (this.fkDefinition.column && this.fkDefinition.table && this.fkDefinition.referenceColumn) {
      // Generate default name if not set
      if (!this.fkDefinition.name) {
        this.fkDefinition.name = `fk_${this.fkDefinition.column}_${this.fkDefinition.table}`;
      }
      this.tableBuilder.addForeignKey(this.fkDefinition as ForeignKeyDefinition);
    }
  }
}

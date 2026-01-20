/**
 * TypeScript Type Generator
 * Generates TypeScript interfaces from database schema
 */

import type { DatabaseAdapter } from '../interfaces';

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimary: boolean;
  isAutoIncrement: boolean;
  comment?: string;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
}

export interface TypeGeneratorOptions {
  /** Tables to include (if empty, includes all) */
  tables?: string[];
  /** Tables to exclude */
  exclude?: string[];
  /** Add JSDoc comments */
  includeComments?: boolean;
  /** Use camelCase for property names */
  camelCase?: boolean;
  /** Generate optional properties for nullable columns */
  optionalNullable?: boolean;
  /** Header comment to add at the top of the file */
  header?: string;
}

/**
 * SQL type to TypeScript type mapping
 */
const SQL_TYPE_MAP: Record<string, string> = {
  // Integers
  tinyint: 'number',
  smallint: 'number',
  mediumint: 'number',
  int: 'number',
  integer: 'number',
  bigint: 'number',

  // Floats
  float: 'number',
  double: 'number',
  decimal: 'number',
  numeric: 'number',
  real: 'number',

  // Strings
  char: 'string',
  varchar: 'string',
  tinytext: 'string',
  text: 'string',
  mediumtext: 'string',
  longtext: 'string',
  enum: 'string',
  set: 'string',

  // Binary
  binary: 'Buffer',
  varbinary: 'Buffer',
  tinyblob: 'Buffer',
  blob: 'Buffer',
  mediumblob: 'Buffer',
  longblob: 'Buffer',

  // Date/Time
  date: 'Date',
  datetime: 'Date',
  timestamp: 'Date',
  time: 'string',
  year: 'number',

  // Boolean
  boolean: 'boolean',
  bool: 'boolean',

  // JSON
  json: 'Record<string, unknown>',
  jsonb: 'Record<string, unknown>',

  // UUID (PostgreSQL)
  uuid: 'string',

  // Arrays (PostgreSQL)
  array: 'unknown[]',
};

export class TypeGenerator {
  constructor(
    private readonly adapter: DatabaseAdapter,
    private readonly dialect: 'mysql' | 'postgresql',
  ) {}

  /**
   * Generate TypeScript interfaces from database schema
   */
  async generate(options: TypeGeneratorOptions = {}): Promise<string> {
    const tables = await this.getTables(options);
    const output: string[] = [];

    // Add header
    if (options.header) {
      output.push(options.header);
      output.push('');
    } else {
      output.push('/**');
      output.push(' * Auto-generated TypeScript types from database schema');
      output.push(` * Generated at: ${new Date().toISOString()}`);
      output.push(' * DO NOT EDIT - This file is auto-generated');
      output.push(' */');
      output.push('');
    }

    // Generate interface for each table
    for (const table of tables) {
      const tableInfo = await this.getTableInfo(table);
      const interfaceCode = this.generateInterface(tableInfo, options);
      output.push(interfaceCode);
      output.push('');
    }

    return output.join('\n');
  }

  /**
   * Get list of tables from database
   */
  private async getTables(options: TypeGeneratorOptions): Promise<string[]> {
    let tables: string[];

    if (this.dialect === 'mysql') {
      const result = await this.adapter.query<Record<string, unknown>>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'`,
      );
      // MySQL may return TABLE_NAME or table_name depending on settings
      tables = result.rows
        .map((r) => (r['table_name'] || r['TABLE_NAME']) as string)
        .filter((t): t is string => t !== null && t !== undefined);
    } else {
      // PostgreSQL
      const result = await this.adapter.query<Record<string, unknown>>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
      );
      tables = result.rows
        .map((r) => (r['table_name'] || r['TABLE_NAME']) as string)
        .filter((t): t is string => t !== null && t !== undefined);
    }

    // Filter tables by include list
    if (options.tables && options.tables.length > 0) {
      tables = tables.filter((t) => options.tables!.includes(t));
    }

    // Filter tables by exclude list
    if (options.exclude && options.exclude.length > 0) {
      tables = tables.filter((t) => !options.exclude!.includes(t));
    }

    // Exclude migration tables
    tables = tables.filter((t) => !t.startsWith('db_migrations') && !t.startsWith('db_bridge'));

    return tables.sort();
  }

  /**
   * Get column information for a table
   */
  private async getTableInfo(tableName: string): Promise<TableInfo> {
    let columns: ColumnInfo[];

    if (this.dialect === 'mysql') {
      columns = await this.getMySQLColumns(tableName);
    } else {
      columns = await this.getPostgreSQLColumns(tableName);
    }

    return { name: tableName, columns };
  }

  /**
   * Get MySQL column information
   */
  private async getMySQLColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.adapter.query<{
      Field: string;
      Type: string;
      Null: string;
      Key: string;
      Default: string | null;
      Extra: string;
      Comment?: string;
    }>(`SHOW FULL COLUMNS FROM \`${tableName}\``);

    return result.rows.map((row) => ({
      name: row.Field,
      type: this.parseColumnType(row.Type),
      nullable: row.Null === 'YES',
      defaultValue: row.Default,
      isPrimary: row.Key === 'PRI',
      isAutoIncrement: row.Extra.includes('auto_increment'),
      comment: row.Comment || undefined,
    }));
  }

  /**
   * Get PostgreSQL column information
   */
  private async getPostgreSQLColumns(tableName: string): Promise<ColumnInfo[]> {
    const result = await this.adapter.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
      is_identity: string;
      description?: string;
    }>(
      `
      SELECT
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        pgd.description
      FROM information_schema.columns c
      LEFT JOIN pg_catalog.pg_statio_all_tables st ON c.table_name = st.relname
      LEFT JOIN pg_catalog.pg_description pgd ON pgd.objoid = st.relid
        AND pgd.objsubid = c.ordinal_position
      WHERE c.table_name = $1
      ORDER BY c.ordinal_position
    `,
      [tableName],
    );

    return result.rows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default,
      isPrimary: false, // Would need additional query
      isAutoIncrement:
        row.is_identity === 'YES' || (row.column_default?.includes('nextval') ?? false),
      comment: row.description,
    }));
  }

  /**
   * Parse column type (extract base type from full type string)
   */
  private parseColumnType(fullType: string): string {
    // Remove size/precision info: varchar(255) -> varchar
    const baseType = fullType
      .toLowerCase()
      .replace(/\(.*\)/, '')
      .trim();

    // Handle unsigned
    return baseType.replace(' unsigned', '');
  }

  /**
   * Map SQL type to TypeScript type
   */
  private mapType(sqlType: string, nullable: boolean): string {
    const baseType = this.parseColumnType(sqlType);

    // Handle tinyint(1) as boolean
    if (sqlType.toLowerCase().includes('tinyint(1)')) {
      return nullable ? 'boolean | null' : 'boolean';
    }

    const tsType = SQL_TYPE_MAP[baseType] || 'unknown';
    return nullable ? `${tsType} | null` : tsType;
  }

  /**
   * Generate TypeScript interface for a table
   */
  private generateInterface(table: TableInfo, options: TypeGeneratorOptions): string {
    const lines: string[] = [];
    const interfaceName = this.toInterfaceName(table.name);

    // Add table comment if available
    if (options.includeComments) {
      lines.push('/**');
      lines.push(` * ${interfaceName} - ${table.name} table`);
      lines.push(' */');
    }

    lines.push(`export interface ${interfaceName} {`);

    for (const column of table.columns) {
      const propertyName = options.camelCase ? this.toCamelCase(column.name) : column.name;

      const tsType = this.mapType(column.type, column.nullable);
      const optional = options.optionalNullable && column.nullable ? '?' : '';

      // Add column comment
      if (options.includeComments && column.comment) {
        lines.push(`  /** ${column.comment} */`);
      }

      lines.push(`  ${propertyName}${optional}: ${tsType};`);
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Convert table name to PascalCase interface name
   */
  private toInterfaceName(tableName: string): string {
    return tableName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join('');
  }

  /**
   * Convert snake_case to camelCase
   */
  private toCamelCase(name: string): string {
    return name.replaceAll(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

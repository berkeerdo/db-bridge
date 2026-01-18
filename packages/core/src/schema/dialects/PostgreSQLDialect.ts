/**
 * PostgreSQL Dialect
 * SQL generation for PostgreSQL database
 */

import type {
  AlterTableDefinition,
  ColumnDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  SchemaDialect,
  TableDefinition,
} from '../types';

export class PostgreSQLDialect implements SchemaDialect {
  readonly dialect = 'postgresql' as const;

  /**
   * Quote an identifier (table/column name)
   */
  quoteIdentifier(name: string): string {
    return `"${name.replaceAll('"', '""')}"`;
  }

  /**
   * Quote a value for SQL
   */
  quoteValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'string') {
      return `'${value.replaceAll("'", "''")}'`;
    }
    return `'${String(value).replaceAll("'", "''")}'`;
  }

  /**
   * Generate CREATE TABLE statement
   */
  createTable(definition: TableDefinition): string {
    const parts: string[] = [];

    // Columns
    for (const column of definition.columns) {
      parts.push(this.columnToSQL(column));
    }

    // Primary key (if composite or not defined in column)
    if (definition.primaryKey && definition.primaryKey.length > 0) {
      const pkColumns = definition.primaryKey.map((c) => this.quoteIdentifier(c)).join(', ');
      parts.push(`PRIMARY KEY (${pkColumns})`);
    }

    // Foreign keys (inline in CREATE TABLE)
    for (const fk of definition.foreignKeys) {
      parts.push(this.foreignKeyToSQL(fk));
    }

    const sql = `CREATE TABLE ${this.quoteIdentifier(definition.name)} (\n  ${parts.join(',\n  ')}\n)`;

    // Table comment (separate statement in PostgreSQL)
    const statements = [sql];
    if (definition.comment) {
      statements.push(
        `COMMENT ON TABLE ${this.quoteIdentifier(definition.name)} IS ${this.quoteValue(definition.comment)}`,
      );
    }

    // Note: Indexes are created separately in PostgreSQL
    // This is handled by the SchemaBuilder

    return statements.join(';\n');
  }

  /**
   * Generate DROP TABLE statement
   */
  dropTable(tableName: string): string {
    return `DROP TABLE ${this.quoteIdentifier(tableName)}`;
  }

  /**
   * Generate DROP TABLE IF EXISTS statement
   */
  dropTableIfExists(tableName: string): string {
    return `DROP TABLE IF EXISTS ${this.quoteIdentifier(tableName)}`;
  }

  /**
   * Generate ALTER TABLE ... RENAME statement
   */
  renameTable(from: string, to: string): string {
    return `ALTER TABLE ${this.quoteIdentifier(from)} RENAME TO ${this.quoteIdentifier(to)}`;
  }

  /**
   * Generate ALTER TABLE statements
   */
  alterTable(definition: AlterTableDefinition): string[] {
    const statements: string[] = [];
    const tableName = this.quoteIdentifier(definition.tableName);

    for (const op of definition.operations) {
      switch (op.type) {
        case 'addColumn': {
          statements.push(`ALTER TABLE ${tableName} ADD COLUMN ${this.columnToSQL(op.column)}`);
          break;
        }

        case 'dropColumn': {
          statements.push(`ALTER TABLE ${tableName} DROP COLUMN ${this.quoteIdentifier(op.name)}`);
          break;
        }

        case 'renameColumn': {
          statements.push(
            `ALTER TABLE ${tableName} RENAME COLUMN ${this.quoteIdentifier(op.from)} TO ${this.quoteIdentifier(op.to)}`,
          );
          break;
        }

        case 'modifyColumn': {
          // PostgreSQL requires separate ALTER statements for each modification
          const col = op.column;

          // Change type
          statements.push(
            `ALTER TABLE ${tableName} ALTER COLUMN ${this.quoteIdentifier(col.name)} TYPE ${this.columnTypeToSQL(col)}`,
          );

          // Change nullable
          if (col.nullable) {
            statements.push(
              `ALTER TABLE ${tableName} ALTER COLUMN ${this.quoteIdentifier(col.name)} DROP NOT NULL`,
            );
          } else {
            statements.push(
              `ALTER TABLE ${tableName} ALTER COLUMN ${this.quoteIdentifier(col.name)} SET NOT NULL`,
            );
          }

          // Change default
          if (col.defaultRaw) {
            statements.push(
              `ALTER TABLE ${tableName} ALTER COLUMN ${this.quoteIdentifier(col.name)} SET DEFAULT ${col.defaultRaw}`,
            );
          } else if (col.defaultValue !== undefined) {
            statements.push(
              `ALTER TABLE ${tableName} ALTER COLUMN ${this.quoteIdentifier(col.name)} SET DEFAULT ${this.quoteValue(col.defaultValue)}`,
            );
          }
          break;
        }

        case 'addIndex': {
          statements.push(this.createIndex(definition.tableName, op.index));
          break;
        }

        case 'dropIndex': {
          statements.push(`DROP INDEX ${this.quoteIdentifier(op.name)}`);
          break;
        }

        case 'addForeignKey': {
          statements.push(`ALTER TABLE ${tableName} ADD ${this.foreignKeyToSQL(op.foreignKey)}`);
          break;
        }

        case 'dropForeignKey': {
          statements.push(
            `ALTER TABLE ${tableName} DROP CONSTRAINT ${this.quoteIdentifier(op.name)}`,
          );
          break;
        }

        case 'addPrimary': {
          const pkCols = op.columns.map((c) => this.quoteIdentifier(c)).join(', ');
          statements.push(`ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkCols})`);
          break;
        }

        case 'dropPrimary': {
          // PostgreSQL requires knowing the constraint name
          statements.push(
            `ALTER TABLE ${tableName} DROP CONSTRAINT ${this.quoteIdentifier(`${definition.tableName}_pkey`)}`,
          );
          break;
        }
      }
    }

    return statements;
  }

  /**
   * Generate query to check if table exists
   */
  hasTable(tableName: string): string {
    return `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${this.quoteValue(tableName)} LIMIT 1`;
  }

  /**
   * Generate query to check if column exists
   */
  hasColumn(tableName: string, columnName: string): string {
    return `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${this.quoteValue(tableName)} AND column_name = ${this.quoteValue(columnName)} LIMIT 1`;
  }

  /**
   * Create index statement
   */
  createIndex(tableName: string, index: IndexDefinition): string {
    const columns = index.columns.map((c) => this.quoteIdentifier(c)).join(', ');
    const indexName = index.name || `idx_${tableName}_${index.columns.join('_')}`;
    const unique = index.unique ? 'UNIQUE ' : '';

    return `CREATE ${unique}INDEX ${this.quoteIdentifier(indexName)} ON ${this.quoteIdentifier(tableName)} (${columns})`;
  }

  /**
   * Convert column definition to SQL
   */
  private columnToSQL(column: ColumnDefinition): string {
    const parts: string[] = [this.quoteIdentifier(column.name)];

    // Type
    parts.push(this.columnTypeToSQL(column));

    // Nullable
    if (!column.nullable) {
      parts.push('NOT NULL');
    }

    // Default value
    if (column.defaultRaw) {
      parts.push(`DEFAULT ${column.defaultRaw}`);
    } else if (column.defaultValue !== undefined) {
      parts.push(`DEFAULT ${this.quoteValue(column.defaultValue)}`);
    }

    // Primary key (inline)
    if (column.primary && column.type !== 'increments' && column.type !== 'bigIncrements') {
      parts.push('PRIMARY KEY');
    }

    // Unique (inline)
    if (column.unique && !column.primary) {
      parts.push('UNIQUE');
    }

    return parts.join(' ');
  }

  /**
   * Convert column type to PostgreSQL type
   */
  private columnTypeToSQL(column: ColumnDefinition): string {
    switch (column.type) {
      case 'increments': {
        return 'SERIAL PRIMARY KEY';
      }
      case 'bigIncrements': {
        return 'BIGSERIAL PRIMARY KEY';
      }
      case 'integer': {
        return 'INTEGER';
      }
      case 'bigInteger': {
        return 'BIGINT';
      }
      case 'smallInteger': {
        return 'SMALLINT';
      }
      case 'tinyInteger': {
        return 'SMALLINT';
      } // PostgreSQL doesn't have TINYINT
      case 'float': {
        return 'REAL';
      }
      case 'double': {
        return 'DOUBLE PRECISION';
      }
      case 'decimal': {
        const precision = column.precision ?? 10;
        const scale = column.scale ?? 2;
        return `NUMERIC(${precision},${scale})`;
      }
      case 'string': {
        return `VARCHAR(${column.length ?? 255})`;
      }
      case 'text':
      case 'mediumText':
      case 'longText': {
        return 'TEXT';
      }
      case 'boolean': {
        return 'BOOLEAN';
      }
      case 'date': {
        return 'DATE';
      }
      case 'datetime':
      case 'timestamp': {
        return 'TIMESTAMP';
      }
      case 'time': {
        return 'TIME';
      }
      case 'json': {
        return 'JSON';
      }
      case 'jsonb': {
        return 'JSONB';
      }
      case 'uuid': {
        return 'UUID';
      }
      case 'binary': {
        return 'BYTEA';
      }
      case 'enum': {
        // PostgreSQL uses VARCHAR with CHECK constraint for enums
        // or custom ENUM types (more complex)
        if (column.enumValues && column.enumValues.length > 0) {
          const values = column.enumValues.map((v) => this.quoteValue(v)).join(', ');
          return `VARCHAR(255) CHECK (${this.quoteIdentifier(column.name)} IN (${values}))`;
        }
        return 'VARCHAR(255)';
      }
      default: {
        return 'VARCHAR(255)';
      }
    }
  }

  /**
   * Convert foreign key definition to SQL
   */
  private foreignKeyToSQL(fk: ForeignKeyDefinition): string {
    const parts: string[] = ['CONSTRAINT'];

    if (fk.name) {
      parts.push(this.quoteIdentifier(fk.name));
    } else {
      parts.push(this.quoteIdentifier(`fk_${fk.column}_${fk.table}`));
    }

    parts.push(`FOREIGN KEY (${this.quoteIdentifier(fk.column)})`);
    parts.push(
      `REFERENCES ${this.quoteIdentifier(fk.table)} (${this.quoteIdentifier(fk.referenceColumn)})`,
    );

    if (fk.onDelete) {
      parts.push(`ON DELETE ${fk.onDelete}`);
    }

    if (fk.onUpdate) {
      parts.push(`ON UPDATE ${fk.onUpdate}`);
    }

    return parts.join(' ');
  }
}

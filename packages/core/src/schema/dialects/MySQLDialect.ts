/**
 * MySQL Dialect
 * SQL generation for MySQL database
 */

import type {
  AlterTableDefinition,
  ColumnDefinition,
  ForeignKeyDefinition,
  IndexDefinition,
  SchemaDialect,
  TableDefinition,
} from '../types';

export class MySQLDialect implements SchemaDialect {
  readonly dialect = 'mysql' as const;

  /**
   * Quote an identifier (table/column name)
   */
  quoteIdentifier(name: string): string {
    return `\`${name.replaceAll('`', '``')}\``;
  }

  /**
   * Quote a value for SQL
   */
  quoteValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'boolean') {
      return value ? '1' : '0';
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

    // Indexes
    for (const index of definition.indexes) {
      parts.push(this.indexToSQL(index));
    }

    // Foreign keys
    for (const fk of definition.foreignKeys) {
      parts.push(this.foreignKeyToSQL(fk));
    }

    let sql = `CREATE TABLE ${this.quoteIdentifier(definition.name)} (\n  ${parts.join(',\n  ')}\n)`;

    // Table options
    const options: string[] = [];
    if (definition.engine) {
      options.push(`ENGINE=${definition.engine}`);
    } else {
      options.push('ENGINE=InnoDB');
    }
    if (definition.charset) {
      options.push(`DEFAULT CHARSET=${definition.charset}`);
    } else {
      options.push('DEFAULT CHARSET=utf8mb4');
    }
    if (definition.collation) {
      options.push(`COLLATE=${definition.collation}`);
    }
    if (definition.comment) {
      options.push(`COMMENT=${this.quoteValue(definition.comment)}`);
    }

    if (options.length > 0) {
      sql += ` ${options.join(' ')}`;
    }

    return sql;
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
   * Generate RENAME TABLE statement
   */
  renameTable(from: string, to: string): string {
    return `RENAME TABLE ${this.quoteIdentifier(from)} TO ${this.quoteIdentifier(to)}`;
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
          statements.push(`ALTER TABLE ${tableName} MODIFY COLUMN ${this.columnToSQL(op.column)}`);
          break;
        }

        case 'addIndex': {
          statements.push(`ALTER TABLE ${tableName} ADD ${this.indexToSQL(op.index)}`);
          break;
        }

        case 'dropIndex': {
          statements.push(`ALTER TABLE ${tableName} DROP INDEX ${this.quoteIdentifier(op.name)}`);
          break;
        }

        case 'addForeignKey': {
          statements.push(`ALTER TABLE ${tableName} ADD ${this.foreignKeyToSQL(op.foreignKey)}`);
          break;
        }

        case 'dropForeignKey': {
          statements.push(
            `ALTER TABLE ${tableName} DROP FOREIGN KEY ${this.quoteIdentifier(op.name)}`,
          );
          break;
        }

        case 'addPrimary': {
          const pkCols = op.columns.map((c) => this.quoteIdentifier(c)).join(', ');
          statements.push(`ALTER TABLE ${tableName} ADD PRIMARY KEY (${pkCols})`);
          break;
        }

        case 'dropPrimary': {
          statements.push(`ALTER TABLE ${tableName} DROP PRIMARY KEY`);
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
    return `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${this.quoteValue(tableName)} LIMIT 1`;
  }

  /**
   * Generate query to check if column exists
   */
  hasColumn(tableName: string, columnName: string): string {
    return `SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${this.quoteValue(tableName)} AND column_name = ${this.quoteValue(columnName)} LIMIT 1`;
  }

  /**
   * Convert column definition to SQL
   */
  private columnToSQL(column: ColumnDefinition): string {
    const parts: string[] = [this.quoteIdentifier(column.name)];

    // Type
    parts.push(this.columnTypeToSQL(column));

    // Unsigned
    if (column.unsigned) {
      parts.push('UNSIGNED');
    }

    // Nullable
    if (column.nullable) {
      parts.push('NULL');
    } else {
      parts.push('NOT NULL');
    }

    // Default value
    if (column.defaultRaw) {
      parts.push(`DEFAULT ${column.defaultRaw}`);
    } else if (column.defaultValue !== undefined) {
      parts.push(`DEFAULT ${this.quoteValue(column.defaultValue)}`);
    }

    // Auto increment
    if (column.autoIncrement) {
      parts.push('AUTO_INCREMENT');
    }

    // Primary key (inline)
    if (column.primary && !column.autoIncrement) {
      parts.push('PRIMARY KEY');
    } else if (column.primary && column.autoIncrement) {
      parts.push('PRIMARY KEY');
    }

    // Unique (inline)
    if (column.unique && !column.primary) {
      parts.push('UNIQUE');
    }

    // Comment
    if (column.comment) {
      parts.push(`COMMENT ${this.quoteValue(column.comment)}`);
    }

    // Position
    if (column.first) {
      parts.push('FIRST');
    } else if (column.after) {
      parts.push(`AFTER ${this.quoteIdentifier(column.after)}`);
    }

    return parts.join(' ');
  }

  /**
   * Convert column type to MySQL type
   */
  private columnTypeToSQL(column: ColumnDefinition): string {
    switch (column.type) {
      case 'increments': {
        return 'INT UNSIGNED AUTO_INCREMENT';
      }
      case 'bigIncrements': {
        return 'BIGINT UNSIGNED AUTO_INCREMENT';
      }
      case 'integer': {
        return 'INT';
      }
      case 'bigInteger': {
        return 'BIGINT';
      }
      case 'smallInteger': {
        return 'SMALLINT';
      }
      case 'tinyInteger': {
        return 'TINYINT';
      }
      case 'float': {
        return 'FLOAT';
      }
      case 'double': {
        return 'DOUBLE';
      }
      case 'decimal': {
        const precision = column.precision ?? 10;
        const scale = column.scale ?? 2;
        return `DECIMAL(${precision},${scale})`;
      }
      case 'string': {
        return `VARCHAR(${column.length ?? 255})`;
      }
      case 'text': {
        return 'TEXT';
      }
      case 'mediumText': {
        return 'MEDIUMTEXT';
      }
      case 'longText': {
        return 'LONGTEXT';
      }
      case 'boolean': {
        return 'TINYINT(1)';
      }
      case 'date': {
        return 'DATE';
      }
      case 'datetime': {
        return 'DATETIME';
      }
      case 'timestamp': {
        return 'TIMESTAMP';
      }
      case 'time': {
        return 'TIME';
      }
      case 'json':
      case 'jsonb': {
        return 'JSON';
      }
      case 'uuid': {
        return 'CHAR(36)';
      }
      case 'binary': {
        return 'BLOB';
      }
      case 'enum': {
        if (column.enumValues && column.enumValues.length > 0) {
          const values = column.enumValues.map((v) => this.quoteValue(v)).join(', ');
          return `ENUM(${values})`;
        }
        return 'VARCHAR(255)';
      }
      default: {
        return 'VARCHAR(255)';
      }
    }
  }

  /**
   * Convert index definition to SQL
   */
  private indexToSQL(index: IndexDefinition): string {
    const columns = index.columns.map((c) => this.quoteIdentifier(c)).join(', ');
    const name = index.name ? this.quoteIdentifier(index.name) : '';

    if (index.type === 'fulltext') {
      return `FULLTEXT INDEX ${name} (${columns})`;
    }

    if (index.unique) {
      return `UNIQUE INDEX ${name} (${columns})`;
    }

    return `INDEX ${name} (${columns})`;
  }

  /**
   * Convert foreign key definition to SQL
   */
  private foreignKeyToSQL(fk: ForeignKeyDefinition): string {
    const parts: string[] = ['CONSTRAINT'];

    if (fk.name) {
      parts.push(this.quoteIdentifier(fk.name));
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

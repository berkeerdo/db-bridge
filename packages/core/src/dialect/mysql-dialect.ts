/**
 * MySQL Dialect Implementation
 *
 * Handles MySQL-specific SQL syntax:
 * - Backtick (`) identifier quoting
 * - Positional (?) parameter placeholders
 * - MySQL-specific functions and operators
 */

import { SQLDialect } from './sql-dialect';

import type { DialectConfig } from './sql-dialect';

export class MySQLDialect extends SQLDialect {
  readonly name = 'mysql';

  readonly config: DialectConfig = {
    identifierQuote: '`',
    namedParameters: false,
    concatOperator: 'CONCAT',
    booleanLiterals: { true: 'TRUE', false: 'FALSE' },
    dateFunctions: {
      now: 'NOW()',
      currentDate: 'CURDATE()',
      currentTime: 'CURTIME()',
      dateFormat: (column: string, format: string) => `DATE_FORMAT(${column}, '${format}')`,
    },
    limitStyle: 'LIMIT_OFFSET',
    jsonOperators: {
      extract: (column: string, path: string) => `JSON_EXTRACT(${column}, '${path}')`,
      contains: (column: string, value: string) => `JSON_CONTAINS(${column}, '${value}')`,
    },
  };

  /**
   * MySQL uses ? for all positional parameters
   */
  getParameterPlaceholder(): string {
    return '?';
  }

  /**
   * Escape value for MySQL
   */
  escapeValue(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }

    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }

    if (typeof value === 'number') {
      return String(value);
    }

    if (value instanceof Date) {
      return `'${value.toISOString().slice(0, 19).replace('T', ' ')}'`;
    }

    if (typeof value === 'string') {
      // Escape single quotes and backslashes
      return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
    }

    if (Buffer.isBuffer(value)) {
      return `X'${value.toString('hex')}'`;
    }

    // Arrays and objects - serialize as JSON
    return `'${JSON.stringify(value).replaceAll("'", "\\'")}'`;
  }

  /**
   * MySQL-specific: INSERT ... ON DUPLICATE KEY UPDATE
   */
  buildUpsert(
    table: string,
    data: Record<string, unknown>,
    conflictColumns: string[],
  ): { sql: string; bindings: unknown[] } {
    const columns = Object.keys(data);
    const bindings: unknown[] = [];

    const parts: string[] = [];
    parts.push('INSERT INTO');
    parts.push(this.escapeIdentifier(table));
    parts.push(`(${columns.map((col) => this.escapeIdentifier(col)).join(', ')})`, 'VALUES');

    const placeholders = columns.map(() => this.getParameterPlaceholder());
    parts.push(`(${placeholders.join(', ')})`);
    bindings.push(...Object.values(data));

    parts.push('ON DUPLICATE KEY UPDATE');
    const updateClauses = columns
      .filter((col) => !conflictColumns.includes(col))
      .map((col) => `${this.escapeIdentifier(col)} = VALUES(${this.escapeIdentifier(col)})`);
    parts.push(updateClauses.join(', '));

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * MySQL-specific: REPLACE INTO
   */
  buildReplace(table: string, data: Record<string, unknown>): { sql: string; bindings: unknown[] } {
    const columns = Object.keys(data);
    const bindings: unknown[] = [];

    const parts: string[] = [];
    parts.push('REPLACE INTO');
    parts.push(this.escapeIdentifier(table));
    parts.push(`(${columns.map((col) => this.escapeIdentifier(col)).join(', ')})`, 'VALUES');

    const placeholders = columns.map(() => this.getParameterPlaceholder());
    parts.push(`(${placeholders.join(', ')})`);
    bindings.push(...Object.values(data));

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * MySQL-specific: Get last insert ID
   */
  getLastInsertIdSQL(): string {
    return 'SELECT LAST_INSERT_ID() as id';
  }

  /**
   * MySQL-specific: OFFSET requires LIMIT
   * If offset is specified without limit, use a very large limit (18446744073709551615 = max bigint)
   */
  protected override appendLimitOffset(parts: string[], limit?: number, offset?: number): void {
    // MySQL requires LIMIT before OFFSET
    if (offset !== undefined && limit === undefined) {
      // Use MySQL's max bigint unsigned as unlimited
      parts.push('LIMIT 18446744073709551615');
      parts.push(`OFFSET ${offset}`);
    } else if (limit !== undefined) {
      parts.push(`LIMIT ${limit}`);
      if (offset !== undefined) {
        parts.push(`OFFSET ${offset}`);
      }
    }
  }
}

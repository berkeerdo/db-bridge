/**
 * PostgreSQL Dialect Implementation
 *
 * Handles PostgreSQL-specific SQL syntax:
 * - Double quote (") identifier quoting
 * - Numbered ($1, $2) parameter placeholders
 * - PostgreSQL-specific functions and operators
 * - RETURNING clause support
 */

import { SQLDialect } from './sql-dialect';

import type { DialectConfig } from './sql-dialect';

export class PostgreSQLDialect extends SQLDialect {
  readonly name = 'postgresql';

  readonly config: DialectConfig = {
    identifierQuote: '"',
    namedParameters: false,
    concatOperator: '||',
    booleanLiterals: { true: 'TRUE', false: 'FALSE' },
    dateFunctions: {
      now: 'NOW()',
      currentDate: 'CURRENT_DATE',
      currentTime: 'CURRENT_TIME',
      dateFormat: (column: string, format: string) => `TO_CHAR(${column}, '${format}')`,
    },
    limitStyle: 'LIMIT_OFFSET',
    jsonOperators: {
      extract: (column: string, path: string) => `${column}->'${path}'`,
      contains: (column: string, value: string) => `${column} @> '${value}'`,
    },
  };

  /**
   * PostgreSQL uses $1, $2, $3... for positional parameters
   */
  getParameterPlaceholder(): string {
    return `$${this.nextParameterIndex()}`;
  }

  /**
   * Escape value for PostgreSQL
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
      return `'${value.toISOString()}'::timestamptz`;
    }

    if (typeof value === 'string') {
      // PostgreSQL uses doubled single quotes for escaping
      return `'${value.replaceAll("'", "''")}'`;
    }

    if (Buffer.isBuffer(value)) {
      return `'\\x${value.toString('hex')}'::bytea`;
    }

    if (Array.isArray(value)) {
      // PostgreSQL array literal
      const escaped = value.map((v) => this.escapeValue(v)).join(', ');
      return `ARRAY[${escaped}]`;
    }

    // Objects - serialize as JSONB
    return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  }

  /**
   * PostgreSQL-specific: INSERT ... ON CONFLICT
   */
  buildUpsert(
    table: string,
    data: Record<string, unknown>,
    conflictColumns: string[],
    updateColumns?: string[],
  ): { sql: string; bindings: unknown[] } {
    const columns = Object.keys(data);
    const bindings: unknown[] = [];

    this.resetParameters();

    const parts: string[] = [];
    parts.push('INSERT INTO');
    parts.push(this.escapeIdentifier(table));
    parts.push(`(${columns.map((col) => this.escapeIdentifier(col)).join(', ')})`, 'VALUES');

    const placeholders = columns.map(() => this.getParameterPlaceholder());
    parts.push(`(${placeholders.join(', ')})`);
    bindings.push(...Object.values(data));

    parts.push('ON CONFLICT');
    parts.push(`(${conflictColumns.map((col) => this.escapeIdentifier(col)).join(', ')})`);

    const toUpdate = updateColumns || columns.filter((col) => !conflictColumns.includes(col));

    if (toUpdate.length > 0) {
      parts.push('DO UPDATE SET');
      const updateClauses = toUpdate.map(
        (col) => `${this.escapeIdentifier(col)} = EXCLUDED.${this.escapeIdentifier(col)}`,
      );
      parts.push(updateClauses.join(', '));
    } else {
      parts.push('DO NOTHING');
    }

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * PostgreSQL-specific: CTE (Common Table Expressions)
   */
  buildWithCTE(cteName: string, cteQuery: string, mainQuery: string, recursive = false): string {
    const withKeyword = recursive ? 'WITH RECURSIVE' : 'WITH';
    return `${withKeyword} ${this.escapeIdentifier(cteName)} AS (${cteQuery}) ${mainQuery}`;
  }

  /**
   * PostgreSQL-specific: RETURNING clause
   */
  buildReturning(columns: string[]): string {
    if (columns.length === 0) {
      return 'RETURNING *';
    }
    return `RETURNING ${columns.map((col) => this.escapeIdentifier(col)).join(', ')}`;
  }

  /**
   * PostgreSQL-specific: Array operations
   */
  buildArrayContains(column: string, value: unknown): string {
    return `${this.escapeValue(value)} = ANY(${this.escapeIdentifier(column)})`;
  }

  buildArrayOverlap(column: string, values: unknown[]): string {
    return `${this.escapeIdentifier(column)} && ARRAY[${values.map((v) => this.escapeValue(v)).join(', ')}]`;
  }

  /**
   * PostgreSQL-specific: Full-text search
   */
  buildTextSearch(column: string, query: string, config = 'english'): string {
    return `to_tsvector('${config}', ${this.escapeIdentifier(column)}) @@ plainto_tsquery('${config}', ${this.escapeValue(query)})`;
  }

  /**
   * PostgreSQL-specific: JSON/JSONB operations
   */
  buildJsonPath(column: string, path: string[]): string {
    const pathExpr = path.map((p) => `'${p}'`).join('->');
    return `${this.escapeIdentifier(column)}->${pathExpr}`;
  }

  buildJsonPathText(column: string, path: string[]): string {
    if (path.length === 0) {
      return column;
    }
    const lastPath = path.pop()!;
    const pathExpr =
      path.length > 0
        ? `${this.escapeIdentifier(column)}->${path.map((p) => `'${p}'`).join('->')}->>>'${lastPath}'`
        : `${this.escapeIdentifier(column)}->>'${lastPath}'`;
    return pathExpr;
  }
}

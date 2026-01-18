/**
 * SQL Dialect Base Class
 *
 * Provides database-agnostic SQL generation with dialect-specific
 * overrides for placeholder syntax, identifier escaping, and SQL keywords.
 *
 * Following Drizzle ORM's dialect pattern for clean separation of concerns.
 */

export interface DialectConfig {
  /** Character used to escape identifiers (e.g., ` for MySQL, " for PostgreSQL) */
  identifierQuote: string;
  /** Whether to use named parameters (:name) or positional (?, $1) */
  namedParameters: boolean;
  /** String concatenation operator */
  concatOperator: string;
  /** Boolean literal values */
  booleanLiterals: { true: string; false: string };
  /** Date/time function names */
  dateFunctions: {
    now: string;
    currentDate: string;
    currentTime: string;
    dateFormat: (column: string, format: string) => string;
  };
  /** Limit/offset syntax style */
  limitStyle: 'LIMIT_OFFSET' | 'FETCH_FIRST' | 'TOP';
  /** JSON operators */
  jsonOperators: {
    extract: (column: string, path: string) => string;
    contains: (column: string, value: string) => string;
  };
}

export abstract class SQLDialect {
  abstract readonly name: string;
  abstract readonly config: DialectConfig;

  private parameterIndex = 0;

  /**
   * Reset parameter index for new query
   */
  resetParameters(): void {
    this.parameterIndex = 0;
  }

  /**
   * Get next parameter placeholder
   * MySQL: ?
   * PostgreSQL: $1, $2, $3...
   */
  abstract getParameterPlaceholder(): string;

  /**
   * Escape an identifier (table name, column name)
   */
  escapeIdentifier(identifier: string): string {
    const quote = this.config.identifierQuote;
    // Handle schema.table format
    if (identifier.includes('.')) {
      return identifier
        .split('.')
        .map((part) => `${quote}${part}${quote}`)
        .join('.');
    }
    return `${quote}${identifier}${quote}`;
  }

  /**
   * Escape a string value for SQL
   */
  abstract escapeValue(value: unknown): string;

  /**
   * Build SELECT SQL from components
   */
  buildSelect(components: SelectComponents): BuiltSQL {
    const parts: string[] = [];
    const bindings: unknown[] = [];

    // SELECT clause
    parts.push('SELECT');
    if (components.distinct) {
      parts.push('DISTINCT');
    }
    parts.push(components.columns.length > 0 ? components.columns.join(', ') : '*');

    // FROM clause
    if (components.from) {
      parts.push('FROM');
      const fromClause = components.fromAlias
        ? `${this.escapeIdentifier(components.from)} AS ${this.escapeIdentifier(components.fromAlias)}`
        : this.escapeIdentifier(components.from);
      parts.push(fromClause);
    }

    // JOINs
    for (const join of components.joins) {
      parts.push(`${join.type} JOIN ${this.escapeIdentifier(join.table)}`);
      if (join.alias) {
        parts.push(`AS ${this.escapeIdentifier(join.alias)}`);
      }
      parts.push(`ON ${join.condition}`);
      bindings.push(...join.bindings);
    }

    // WHERE
    if (components.where.length > 0) {
      parts.push('WHERE');
      parts.push(this.buildWhereClause(components.where, bindings));
    }

    // GROUP BY
    if (components.groupBy.length > 0) {
      parts.push('GROUP BY');
      parts.push(components.groupBy.map((col) => this.escapeIdentifier(col)).join(', '));
    }

    // HAVING
    if (components.having) {
      parts.push('HAVING', components.having.condition);
      bindings.push(...components.having.bindings);
    }

    // ORDER BY
    if (components.orderBy.length > 0) {
      parts.push('ORDER BY');
      parts.push(
        components.orderBy
          .map(({ column, direction }) => `${this.escapeIdentifier(column)} ${direction}`)
          .join(', '),
      );
    }

    // LIMIT/OFFSET
    this.appendLimitOffset(parts, components.limit, components.offset);

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * Build INSERT SQL from components
   */
  buildInsert(components: InsertComponents): BuiltSQL {
    const parts: string[] = [];
    const bindings: unknown[] = [];

    parts.push('INSERT INTO');
    parts.push(this.escapeIdentifier(components.table));

    const columns = Object.keys(components.data[0] || {});
    parts.push(`(${columns.map((col) => this.escapeIdentifier(col)).join(', ')})`, 'VALUES');

    const valueSets: string[] = [];
    for (const row of components.data) {
      const placeholders: string[] = [];
      for (const col of columns) {
        placeholders.push(this.getParameterPlaceholder());
        bindings.push(row[col]);
      }
      valueSets.push(`(${placeholders.join(', ')})`);
    }
    parts.push(valueSets.join(', '));

    // RETURNING clause (PostgreSQL)
    if (components.returning && components.returning.length > 0) {
      parts.push('RETURNING');
      parts.push(components.returning.map((col) => this.escapeIdentifier(col)).join(', '));
    }

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * Build UPDATE SQL from components
   */
  buildUpdate(components: UpdateComponents): BuiltSQL {
    const parts: string[] = [];
    const bindings: unknown[] = [];

    parts.push('UPDATE');
    parts.push(this.escapeIdentifier(components.table), 'SET');

    const setClauses: string[] = [];
    for (const [column, value] of Object.entries(components.data)) {
      setClauses.push(`${this.escapeIdentifier(column)} = ${this.getParameterPlaceholder()}`);
      bindings.push(value);
    }
    parts.push(setClauses.join(', '));

    // WHERE
    if (components.where.length > 0) {
      parts.push('WHERE');
      parts.push(this.buildWhereClause(components.where, bindings));
    }

    // RETURNING clause (PostgreSQL)
    if (components.returning && components.returning.length > 0) {
      parts.push('RETURNING');
      parts.push(components.returning.map((col) => this.escapeIdentifier(col)).join(', '));
    }

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * Build DELETE SQL from components
   */
  buildDelete(components: DeleteComponents): BuiltSQL {
    const parts: string[] = [];
    const bindings: unknown[] = [];

    parts.push('DELETE FROM');
    parts.push(this.escapeIdentifier(components.table));

    // WHERE
    if (components.where.length > 0) {
      parts.push('WHERE');
      parts.push(this.buildWhereClause(components.where, bindings));
    }

    // RETURNING clause (PostgreSQL)
    if (components.returning && components.returning.length > 0) {
      parts.push('RETURNING');
      parts.push(components.returning.map((col) => this.escapeIdentifier(col)).join(', '));
    }

    return {
      sql: parts.join(' '),
      bindings,
    };
  }

  /**
   * Build WHERE clause from conditions
   */
  protected buildWhereClause(conditions: WhereCondition[], bindings: unknown[]): string {
    return conditions
      .map((condition, index) => {
        const prefix = index === 0 ? '' : ` ${condition.type} `;
        bindings.push(...condition.bindings);
        return `${prefix}${condition.sql}`;
      })
      .join('');
  }

  /**
   * Append LIMIT/OFFSET based on dialect style
   */
  protected appendLimitOffset(parts: string[], limit?: number, offset?: number): void {
    switch (this.config.limitStyle) {
      case 'LIMIT_OFFSET': {
        if (limit !== undefined) {
          parts.push(`LIMIT ${limit}`);
        }
        if (offset !== undefined) {
          parts.push(`OFFSET ${offset}`);
        }
        break;
      }
      case 'FETCH_FIRST': {
        if (offset !== undefined) {
          parts.push(`OFFSET ${offset} ROWS`);
        }
        if (limit !== undefined) {
          parts.push(`FETCH FIRST ${limit} ROWS ONLY`);
        }
        break;
      }
      case 'TOP': {
        // TOP is handled in SELECT clause for SQL Server
        break;
      }
    }
  }

  /**
   * Increment and return parameter index (for PostgreSQL-style)
   */
  protected nextParameterIndex(): number {
    return ++this.parameterIndex;
  }
}

// ============ Type Definitions ============

export interface BuiltSQL {
  sql: string;
  bindings: unknown[];
}

export interface WhereCondition {
  type: 'AND' | 'OR';
  sql: string;
  bindings: unknown[];
}

export interface JoinDefinition {
  type: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL' | 'CROSS';
  table: string;
  alias?: string;
  condition: string;
  bindings: unknown[];
}

export interface OrderByDefinition {
  column: string;
  direction: 'ASC' | 'DESC';
  raw?: boolean;
}

export interface SelectComponents {
  columns: string[];
  distinct?: boolean;
  from?: string;
  fromAlias?: string;
  joins: JoinDefinition[];
  where: WhereCondition[];
  groupBy: string[];
  having?: { condition: string; bindings: unknown[] };
  orderBy: OrderByDefinition[];
  limit?: number;
  offset?: number;
}

export interface InsertComponents {
  table: string;
  data: Record<string, unknown>[];
  returning?: string[];
}

export interface UpdateComponents {
  table: string;
  data: Record<string, unknown>;
  where: WhereCondition[];
  returning?: string[];
}

export interface DeleteComponents {
  table: string;
  where: WhereCondition[];
  returning?: string[];
}

import { BaseQueryBuilder, ValidationError } from '@db-bridge/core';

export class MySQLQueryBuilder<T = unknown> extends BaseQueryBuilder<T> {
  protected buildSelectSQL(): { sql: string; bindings: unknown[] } {
    if (!this.fromTable) {
      throw new ValidationError('FROM table is required for SELECT query');
    }

    const parts: string[] = [];

    parts.push('SELECT');
    parts.push(this.selectColumns.join(', '));
    
    parts.push('FROM');
    if (this.fromAlias) {
      parts.push(`${this.escapeIdentifierFn(this.fromTable)} AS ${this.escapeIdentifierFn(this.fromAlias)}`);
    } else {
      parts.push(this.escapeIdentifierFn(this.fromTable));
    }

    this.joins.forEach((join) => {
      parts.push(`${join.type} JOIN ${join.table} ON ${join.on}`);
    });

    if (this.whereClauses.length > 0) {
      parts.push('WHERE');
      const whereConditions = this.whereClauses.map((clause, index) => {
        const prefix = index === 0 ? '' : clause.type;
        return `${prefix} ${clause.condition}`.trim();
      });
      parts.push(whereConditions.join(' '));
    }

    if (this.groupByColumns.length > 0) {
      parts.push('GROUP BY');
      parts.push(this.groupByColumns.map((col) => this.escapeIdentifierFn(col)).join(', '));
    }

    if (this.havingClause) {
      parts.push('HAVING');
      parts.push(this.havingClause);
    }

    if (this.orderByColumns.length > 0) {
      parts.push('ORDER BY');
      const orderClauses = this.orderByColumns.map(
        ({ column, direction }) => `${this.escapeIdentifierFn(column)} ${direction}`,
      );
      parts.push(orderClauses.join(', '));
    }

    if (this.limitValue !== undefined) {
      parts.push(`LIMIT ${this.limitValue}`);
    }

    if (this.offsetValue !== undefined) {
      parts.push(`OFFSET ${this.offsetValue}`);
    }

    return { sql: parts.join(' '), bindings: this.bindings };
  }

  protected buildInsertSQL(): { sql: string; bindings: unknown[] } {
    if (!this.insertTable || !this.insertData) {
      throw new ValidationError('Table and data are required for INSERT query');
    }

    const dataArray = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
    if (dataArray.length === 0) {
      throw new ValidationError('Cannot insert empty data');
    }

    const firstRow = dataArray[0]!;
    const columns = Object.keys(firstRow);
    const bindings: unknown[] = [];

    const valueRows = dataArray.map((row) => {
      const values = columns.map((col) => {
        bindings.push(row[col]);
        return '?';
      });
      return `(${values.join(', ')})`;
    });

    const sql = `INSERT INTO ${this.escapeIdentifierFn(this.insertTable)} (${columns
      .map((col) => this.escapeIdentifierFn(col))
      .join(', ')}) VALUES ${valueRows.join(', ')}`;

    return { sql, bindings };
  }

  protected buildUpdateSQL(): { sql: string; bindings: unknown[] } {
    if (!this.updateTable || !this.updateData) {
      throw new ValidationError('Table and data are required for UPDATE query');
    }

    const parts: string[] = [];
    const bindings: unknown[] = [];

    parts.push('UPDATE');
    parts.push(this.escapeIdentifierFn(this.updateTable));
    parts.push('SET');

    const setClauses = Object.entries(this.updateData).map(([key, value]) => {
      bindings.push(value);
      return `${this.escapeIdentifierFn(key)} = ?`;
    });
    parts.push(setClauses.join(', '));

    if (this.whereClauses.length > 0) {
      parts.push('WHERE');
      const whereConditions = this.whereClauses.map((clause, index) => {
        const prefix = index === 0 ? '' : clause.type;
        return `${prefix} ${clause.condition}`.trim();
      });
      parts.push(whereConditions.join(' '));
      bindings.push(...this.bindings);
    }

    return { sql: parts.join(' '), bindings };
  }

  protected buildDeleteSQL(): { sql: string; bindings: unknown[] } {
    if (!this.deleteTable) {
      throw new ValidationError('Table is required for DELETE query');
    }

    const parts: string[] = [];
    const bindings: unknown[] = [];

    parts.push('DELETE FROM');
    parts.push(this.escapeIdentifierFn(this.deleteTable));

    if (this.whereClauses.length > 0) {
      parts.push('WHERE');
      const whereConditions = this.whereClauses.map((clause, index) => {
        const prefix = index === 0 ? '' : clause.type;
        return `${prefix} ${clause.condition}`.trim();
      });
      parts.push(whereConditions.join(' '));
      bindings.push(...this.bindings);
    }

    return { sql: parts.join(' '), bindings };
  }
}
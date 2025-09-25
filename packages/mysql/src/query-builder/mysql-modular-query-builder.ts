import { ModularQueryBuilder } from '@db-bridge/core/src/query-builder/modular-query-builder';
import { ValidationError } from '@db-bridge/core';

export class MySQLModularQueryBuilder<T = unknown> extends ModularQueryBuilder<T> {
  
  protected buildSelectSQL(): { sql: string; bindings: unknown[] } {
    if (!this.fromTable) {
      throw new ValidationError('FROM table is required for SELECT query');
    }

    const parts: string[] = [];
    
    // SELECT
    parts.push('SELECT');
    parts.push(this.selectColumns.join(', '));
    
    // FROM
    parts.push('FROM');
    if (this.fromAlias) {
      parts.push(`${this.escapeIdentifierFn(this.fromTable)} AS ${this.escapeIdentifierFn(this.fromAlias)}`);
    } else {
      parts.push(this.escapeIdentifierFn(this.fromTable));
    }

    // JOINS
    this.joins.forEach((join) => {
      parts.push(`${join.type} JOIN ${join.table} ON ${join.on}`);
    });

    // WHERE
    if (this.whereClauses.length > 0) {
      parts.push('WHERE');
      const whereConditions = this.whereClauses.map((clause, index) => {
        const prefix = index === 0 ? '' : clause.type;
        return `${prefix} ${clause.condition}`.trim();
      });
      parts.push(whereConditions.join(' '));
    }

    // GROUP BY
    if (this.groupByColumns.length > 0) {
      parts.push('GROUP BY');
      parts.push(this.groupByColumns.map((col) => this.escapeIdentifierFn(col)).join(', '));
    }

    // HAVING
    if (this.havingClause) {
      parts.push('HAVING');
      parts.push(this.havingClause);
    }

    // ORDER BY
    if (this.orderByColumns.length > 0) {
      parts.push('ORDER BY');
      const orderClauses = this.orderByColumns.map(
        ({ column, direction }) => `${this.escapeIdentifierFn(column)} ${direction}`,
      );
      parts.push(orderClauses.join(', '));
    }

    // LIMIT & OFFSET
    if (this.limitValue !== undefined) {
      parts.push(`LIMIT ${this.limitValue}`);
    }

    if (this.offsetValue !== undefined) {
      parts.push(`OFFSET ${this.offsetValue}`);
    }

    return {
      sql: parts.join(' '),
      bindings: this.bindings,
    };
  }

  protected buildInsertSQL(): { sql: string; bindings: unknown[] } {
    if (!this.insertTable || !this.insertData) {
      throw new ValidationError('Table and data are required for INSERT query');
    }

    const data = Array.isArray(this.insertData) ? this.insertData : [this.insertData];
    if (data.length === 0) {
      throw new ValidationError('Cannot insert empty data');
    }

    const columns = Object.keys(data[0]);
    const values: unknown[] = [];

    data.forEach((row) => {
      columns.forEach((col) => {
        values.push(row[col]);
      });
    });

    const placeholders = data
      .map((_, rowIndex) =>
        `(${columns
          .map((_, colIndex) => '?')
          .join(', ')})`
      )
      .join(', ');

    const sql = `INSERT INTO ${this.escapeIdentifierFn(this.insertTable)} ` +
      `(${columns.map((col) => this.escapeIdentifierFn(col)).join(', ')}) ` +
      `VALUES ${placeholders}`;

    return { sql, bindings: values };
  }

  protected buildUpdateSQL(): { sql: string; bindings: unknown[] } {
    if (!this.updateTable || !this.updateData) {
      throw new ValidationError('Table and data are required for UPDATE query');
    }

    const columns = Object.keys(this.updateData);
    const values = Object.values(this.updateData);
    const bindings = [...values];

    const setClauses = columns.map((col) => `${this.escapeIdentifierFn(col)} = ?`);

    let sql = `UPDATE ${this.escapeIdentifierFn(this.updateTable)} SET ${setClauses.join(', ')}`;

    if (this.whereClauses.length > 0) {
      sql += ' WHERE ';
      const whereConditions = this.whereClauses.map((clause, index) => {
        const prefix = index === 0 ? '' : clause.type;
        return `${prefix} ${clause.condition}`.trim();
      });
      sql += whereConditions.join(' ');
      bindings.push(...this.bindings);
    }

    return { sql, bindings };
  }

  protected buildDeleteSQL(): { sql: string; bindings: unknown[] } {
    if (!this.deleteTable) {
      throw new ValidationError('Table is required for DELETE query');
    }

    let sql = `DELETE FROM ${this.escapeIdentifierFn(this.deleteTable)}`;

    if (this.whereClauses.length > 0) {
      sql += ' WHERE ';
      const whereConditions = this.whereClauses.map((clause, index) => {
        const prefix = index === 0 ? '' : clause.type;
        return `${prefix} ${clause.condition}`.trim();
      });
      sql += whereConditions.join(' ');
    }

    return { sql, bindings: this.bindings };
  }

  // MySQL-specific parameter placeholder (always ?)
  protected parameterPlaceholderFn = () => '?';
}
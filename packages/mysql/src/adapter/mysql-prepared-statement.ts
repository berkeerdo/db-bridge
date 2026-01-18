import { QueryError } from '@db-bridge/core';

import type { PreparedStatement, QueryResult } from '@db-bridge/core';
import type * as mysql from 'mysql2/promise';

export class MySQLPreparedStatement<T = unknown> implements PreparedStatement<T> {
  private released = false;

  constructor(
    private connection: mysql.PoolConnection,
    private sql: string,
  ) {}

  async execute(params?: unknown[]): Promise<QueryResult<T>> {
    if (this.released) {
      throw new QueryError('Prepared statement has been released');
    }

    try {
      const command = this.sql.trim().split(' ')[0]?.toUpperCase();

      // For INSERT/UPDATE/DELETE, we get ResultSetHeader instead of RowDataPacket[]
      if (command === 'INSERT' || command === 'UPDATE' || command === 'DELETE') {
        const [result] = await this.connection.execute<mysql.ResultSetHeader>(
          this.sql,
          params || [],
        );
        return {
          rows: [] as T[],
          rowCount: result.affectedRows || 0,
          affectedRows: result.affectedRows || 0,
          insertId: result.insertId,
          fields: [],
          command,
        };
      }

      const [rows, fields] = await this.connection.execute<mysql.RowDataPacket[]>(
        this.sql,
        params || [],
      );

      return {
        rows: rows as T[],
        rowCount: Array.isArray(rows) ? rows.length : 0,
        affectedRows: Array.isArray(rows) ? rows.length : 0,
        fields: fields?.map((field) => ({
          name: field.name,
          type: field.type?.toString() || 'unknown',
          nullable: field.flags ? !(Number(field.flags) & 1) : true,
          primaryKey: field.flags ? !!(Number(field.flags) & 2) : false,
          autoIncrement: field.flags ? !!(Number(field.flags) & 512) : false,
          defaultValue: field.default,
        })),
        command,
      };
    } catch (error) {
      throw new QueryError(
        `Prepared statement execution failed: ${(error as Error).message}`,
        this.sql,
        params,
        error as Error,
      );
    }
  }

  async release(): Promise<void> {
    if (this.released) {
      return;
    }

    try {
      // MySQL doesn't have unprepare, just release connection
      this.connection.release();
      this.released = true;
    } catch (error) {
      throw new QueryError(
        `Failed to release prepared statement: ${(error as Error).message}`,
        this.sql,
        undefined,
        error as Error,
      );
    }
  }

  /**
   * Alias for release() - industry standard naming
   */
  async close(): Promise<void> {
    return this.release();
  }
}

import * as mysql from 'mysql2/promise';
import { PreparedStatement, QueryResult, QueryError } from '@db-bridge/core';

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
      // MySQL prepare is different, we just use the sql directly

      const [rows, fields] = await this.connection.execute<mysql.RowDataPacket[]>(
        this.sql,
        params || [],
      );

      return {
        rows: rows as T[],
        rowCount: Array.isArray(rows) ? rows.length : 0,
        fields: fields?.map((field) => ({
          name: field.name,
          type: field.type?.toString() || 'unknown',
          nullable: field.flags ? !((Number(field.flags) & 1)) : true,
          primaryKey: field.flags ? !!(Number(field.flags) & 2) : false,
          autoIncrement: field.flags ? !!(Number(field.flags) & 512) : false,
          defaultValue: field.default,
        })),
        command: this.sql.trim().split(' ')[0]?.toUpperCase(),
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
}
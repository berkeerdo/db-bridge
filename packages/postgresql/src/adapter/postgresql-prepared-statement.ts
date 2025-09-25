import { PoolClient, QueryResult as PgQueryResult } from 'pg';
import { PreparedStatement, QueryResult, QueryError } from '@db-bridge/core';

export class PostgreSQLPreparedStatement<T = unknown> implements PreparedStatement<T> {
  private released = false;

  constructor(
    private client: PoolClient,
    private sql: string,
    private name: string,
  ) {}

  async execute(params?: unknown[]): Promise<QueryResult<T>> {
    if (this.released) {
      throw new QueryError('Prepared statement has been released');
    }

    try {
      // PostgreSQL doesn't require separate prepare step when using named queries

      const result: PgQueryResult = await this.client.query({
        text: this.sql,
        name: this.name,
        values: params || [],
      });

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
        fields: result.fields?.map((field) => ({
          name: field.name,
          type: field.dataTypeID.toString(),
          nullable: true,
          primaryKey: false,
          autoIncrement: false,
          defaultValue: undefined,
        })),
        command: result.command,
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
      // PostgreSQL automatically deallocates named queries when connection is released
      this.client.release();
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
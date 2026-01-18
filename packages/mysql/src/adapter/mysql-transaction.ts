import { IsolationLevel, TransactionError, generateUUID } from '@db-bridge/core';
import * as mysql from 'mysql2/promise';

import type {
  Transaction,
  TransactionOptions,
  QueryParams,
  QueryOptions,
  QueryResult,
} from '@db-bridge/core';

export class MySQLTransaction implements Transaction {
  readonly id: string;
  private _isActive = false;
  private savepoints: Set<string> = new Set();

  constructor(
    private connection: mysql.PoolConnection,
    private options?: TransactionOptions,
  ) {
    this.id = generateUUID();
  }

  get isActive(): boolean {
    return this._isActive;
  }

  async begin(): Promise<void> {
    if (this._isActive) {
      throw new TransactionError('Transaction already active', this.id);
    }

    try {
      if (this.options?.isolationLevel) {
        await this.setIsolationLevel(this.options.isolationLevel);
      }

      await this.connection.beginTransaction();
      this._isActive = true;
    } catch (error) {
      throw new TransactionError('Failed to begin transaction', this.id, error as Error);
    }
  }

  async commit(): Promise<void> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    try {
      await this.connection.commit();
      this._isActive = false;
      this.savepoints.clear();
    } catch (error) {
      throw new TransactionError('Failed to commit transaction', this.id, error as Error);
    } finally {
      this.connection.release();
    }
  }

  async rollback(): Promise<void> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    try {
      await this.connection.rollback();
      this._isActive = false;
      this.savepoints.clear();
    } catch (error) {
      throw new TransactionError('Failed to rollback transaction', this.id, error as Error);
    } finally {
      this.connection.release();
    }
  }

  async savepoint(name: string): Promise<void> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    if (this.savepoints.has(name)) {
      throw new TransactionError(`Savepoint "${name}" already exists`, this.id);
    }

    try {
      await this.connection.query(`SAVEPOINT ${mysql.escapeId(name)}`);
      this.savepoints.add(name);
    } catch (error) {
      throw new TransactionError(`Failed to create savepoint "${name}"`, this.id, error as Error);
    }
  }

  async releaseSavepoint(name: string): Promise<void> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    if (!this.savepoints.has(name)) {
      throw new TransactionError(`Savepoint "${name}" does not exist`, this.id);
    }

    try {
      await this.connection.query(`RELEASE SAVEPOINT ${mysql.escapeId(name)}`);
      this.savepoints.delete(name);
    } catch (error) {
      throw new TransactionError(`Failed to release savepoint "${name}"`, this.id, error as Error);
    }
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    if (!this.savepoints.has(name)) {
      throw new TransactionError(`Savepoint "${name}" does not exist`, this.id);
    }

    try {
      await this.connection.query(`ROLLBACK TO SAVEPOINT ${mysql.escapeId(name)}`);
    } catch (error) {
      throw new TransactionError(
        `Failed to rollback to savepoint "${name}"`,
        this.id,
        error as Error,
      );
    }
  }

  getConnection(): mysql.PoolConnection {
    return this.connection;
  }

  async query<T = unknown>(
    sql: string,
    params?: QueryParams,
    _options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    try {
      const queryParams = Array.isArray(params) ? params : params ? Object.values(params) : [];
      const command = sql.trim().split(' ')[0]?.toUpperCase();

      // For INSERT/UPDATE/DELETE, we get ResultSetHeader instead of RowDataPacket[]
      if (command === 'INSERT' || command === 'UPDATE' || command === 'DELETE') {
        const [result] = await this.connection.execute<mysql.ResultSetHeader>(sql, queryParams);
        return {
          rows: [] as T[],
          rowCount: result.affectedRows || 0,
          affectedRows: result.affectedRows || 0,
          insertId: result.insertId,
          fields: [],
          command,
        };
      }

      const [rows, fields] = await this.connection.execute<mysql.RowDataPacket[]>(sql, queryParams);

      const result: QueryResult<T> = {
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

      return result;
    } catch (error) {
      throw new TransactionError(
        `Query failed in transaction: ${(error as Error).message}`,
        this.id,
        error as Error,
      );
    }
  }

  /**
   * Alias for query() to provide consistency with adapter's execute method
   */
  async execute<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    return this.query<T>(sql, params, options);
  }

  private async setIsolationLevel(level: IsolationLevel): Promise<void> {
    const mysqlLevel = this.mapIsolationLevel(level);
    await this.connection.query(`SET TRANSACTION ISOLATION LEVEL ${mysqlLevel}`);
  }

  private mapIsolationLevel(level: IsolationLevel): string {
    switch (level) {
      case IsolationLevel.READ_UNCOMMITTED: {
        return 'READ UNCOMMITTED';
      }
      case IsolationLevel.READ_COMMITTED: {
        return 'READ COMMITTED';
      }
      case IsolationLevel.REPEATABLE_READ: {
        return 'REPEATABLE READ';
      }
      case IsolationLevel.SERIALIZABLE: {
        return 'SERIALIZABLE';
      }
      default: {
        throw new TransactionError(`Invalid isolation level: ${level}`, this.id);
      }
    }
  }
}

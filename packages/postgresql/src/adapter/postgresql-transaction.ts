import { TransactionError, generateUUID } from '@db-bridge/core';

import type {
  Transaction,
  TransactionOptions,
  QueryParams,
  QueryOptions,
  QueryResult,
} from '@db-bridge/core';
import type { PoolClient } from 'pg';

export class PostgreSQLTransaction implements Transaction {
  readonly id: string;
  private _isActive = false;
  private savepoints: Set<string> = new Set();

  constructor(
    private client: PoolClient,
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
      const queries: string[] = [];

      if (this.options?.isolationLevel) {
        queries.push(`SET TRANSACTION ISOLATION LEVEL ${this.options.isolationLevel}`);
      }

      if (this.options?.readOnly) {
        queries.push('SET TRANSACTION READ ONLY');
      } else {
        queries.push('SET TRANSACTION READ WRITE');
      }

      if (this.options?.deferrable) {
        queries.push('SET TRANSACTION DEFERRABLE');
      }

      await this.client.query('BEGIN');

      for (const query of queries) {
        await this.client.query(query);
      }

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
      await this.client.query('COMMIT');
      this._isActive = false;
      this.savepoints.clear();
    } catch (error) {
      throw new TransactionError('Failed to commit transaction', this.id, error as Error);
    } finally {
      this.client.release();
    }
  }

  async rollback(): Promise<void> {
    if (!this._isActive) {
      throw new TransactionError('Transaction not active', this.id);
    }

    try {
      await this.client.query('ROLLBACK');
      this._isActive = false;
      this.savepoints.clear();
    } catch (error) {
      throw new TransactionError('Failed to rollback transaction', this.id, error as Error);
    } finally {
      this.client.release();
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
      const safeName = name.replaceAll(/\W/g, '_');
      await this.client.query(`SAVEPOINT ${safeName}`);
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
      const safeName = name.replaceAll(/\W/g, '_');
      await this.client.query(`RELEASE SAVEPOINT ${safeName}`);
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
      const safeName = name.replaceAll(/\W/g, '_');
      await this.client.query(`ROLLBACK TO SAVEPOINT ${safeName}`);

      const savepointsArray = Array.from(this.savepoints);
      const index = savepointsArray.indexOf(name);
      if (index !== -1) {
        for (let i = index + 1; i < savepointsArray.length; i++) {
          this.savepoints.delete(savepointsArray[i]!);
        }
      }
    } catch (error) {
      throw new TransactionError(
        `Failed to rollback to savepoint "${name}"`,
        this.id,
        error as Error,
      );
    }
  }

  getClient(): PoolClient {
    return this.client;
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
      const result = await this.client.query(sql, queryParams);

      const queryResult: QueryResult<T> = {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
        affectedRows: result.rowCount || 0,
        fields: result.fields?.map((field) => ({
          name: field.name,
          type: field.dataTypeID?.toString() || 'unknown',
          nullable: true,
          primaryKey: false,
          autoIncrement: false,
          defaultValue: undefined,
        })),
        command: result.command || sql.trim().split(' ')[0]?.toUpperCase(),
      };

      return queryResult;
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
}

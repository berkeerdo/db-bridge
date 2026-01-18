/**
 * Base Transaction
 *
 * Abstract base class for database transactions following DRY principle.
 * Handles common state management, validation, and error handling.
 * Database-specific implementations only need to override the abstract methods.
 *
 * @example
 * ```typescript
 * class MySQLTransaction extends BaseTransaction<PoolConnection> {
 *   protected async doBegin(): Promise<void> {
 *     await this.connection.beginTransaction();
 *   }
 *
 *   protected async doCommit(): Promise<void> {
 *     await this.connection.commit();
 *   }
 *
 *   protected async doRollback(): Promise<void> {
 *     await this.connection.rollback();
 *   }
 *
 *   // ... other abstract method implementations
 * }
 * ```
 */

import { TransactionError } from '../errors';
import { generateUUID } from '../utils';

import type {
  Transaction,
  TransactionOptions,
  IsolationLevel,
  QueryParams,
  QueryOptions,
  QueryResult,
} from '../types';

/**
 * Connection interface that all database connections must satisfy
 */
export interface TransactionConnection {
  release(): void | Promise<void>;
}

/**
 * Abstract base class for database transactions
 *
 * Type parameter TConnection is the database-specific connection type
 */
export abstract class BaseTransaction<
  TConnection extends TransactionConnection,
> implements Transaction {
  readonly id: string;
  protected _isActive = false;
  protected readonly savepoints: Set<string> = new Set();

  constructor(
    protected readonly connection: TConnection,
    protected readonly options?: TransactionOptions,
  ) {
    this.id = generateUUID();
  }

  get isActive(): boolean {
    return this._isActive;
  }

  // ============ Public Transaction Methods ============

  async begin(): Promise<void> {
    if (this._isActive) {
      throw new TransactionError('Transaction already active', this.id);
    }

    try {
      await this.applyTransactionOptions();
      await this.doBegin();
      this._isActive = true;
    } catch (error) {
      throw new TransactionError('Failed to begin transaction', this.id, error as Error);
    }
  }

  async commit(): Promise<void> {
    this.ensureActive('commit');

    try {
      await this.doCommit();
      this._isActive = false;
      this.savepoints.clear();
    } catch (error) {
      throw new TransactionError('Failed to commit transaction', this.id, error as Error);
    } finally {
      await this.releaseConnection();
    }
  }

  async rollback(): Promise<void> {
    this.ensureActive('rollback');

    try {
      await this.doRollback();
      this._isActive = false;
      this.savepoints.clear();
    } catch (error) {
      throw new TransactionError('Failed to rollback transaction', this.id, error as Error);
    } finally {
      await this.releaseConnection();
    }
  }

  async savepoint(name: string): Promise<void> {
    this.ensureActive('create savepoint');
    this.validateSavepointName(name);

    if (this.savepoints.has(name)) {
      throw new TransactionError(`Savepoint "${name}" already exists`, this.id);
    }

    try {
      await this.doSavepoint(name);
      this.savepoints.add(name);
    } catch (error) {
      throw new TransactionError(`Failed to create savepoint "${name}"`, this.id, error as Error);
    }
  }

  async releaseSavepoint(name: string): Promise<void> {
    this.ensureActive('release savepoint');
    this.ensureSavepointExists(name);

    try {
      await this.doReleaseSavepoint(name);
      this.savepoints.delete(name);
    } catch (error) {
      throw new TransactionError(`Failed to release savepoint "${name}"`, this.id, error as Error);
    }
  }

  async rollbackToSavepoint(name: string): Promise<void> {
    this.ensureActive('rollback to savepoint');
    this.ensureSavepointExists(name);

    try {
      await this.doRollbackToSavepoint(name);
      this.removeNewerSavepoints(name);
    } catch (error) {
      throw new TransactionError(
        `Failed to rollback to savepoint "${name}"`,
        this.id,
        error as Error,
      );
    }
  }

  async query<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    this.ensureActive('execute query');

    try {
      return await this.doQuery<T>(sql, params, options);
    } catch (error) {
      throw new TransactionError(
        `Query failed in transaction: ${(error as Error).message}`,
        this.id,
        error as Error,
      );
    }
  }

  /**
   * Alias for query() for consistency
   */
  async execute<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    return this.query<T>(sql, params, options);
  }

  /**
   * Get the underlying database connection
   */
  getConnection(): TConnection {
    return this.connection;
  }

  // ============ Abstract Methods (Database-specific) ============

  /**
   * Begin the transaction (database-specific)
   */
  protected abstract doBegin(): Promise<void>;

  /**
   * Commit the transaction (database-specific)
   */
  protected abstract doCommit(): Promise<void>;

  /**
   * Rollback the transaction (database-specific)
   */
  protected abstract doRollback(): Promise<void>;

  /**
   * Create a savepoint (database-specific)
   */
  protected abstract doSavepoint(name: string): Promise<void>;

  /**
   * Release a savepoint (database-specific)
   */
  protected abstract doReleaseSavepoint(name: string): Promise<void>;

  /**
   * Rollback to a savepoint (database-specific)
   */
  protected abstract doRollbackToSavepoint(name: string): Promise<void>;

  /**
   * Execute a query within the transaction (database-specific)
   */
  protected abstract doQuery<T>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>>;

  /**
   * Set isolation level (database-specific)
   */
  protected abstract setIsolationLevel(level: IsolationLevel): Promise<void>;

  /**
   * Escape an identifier for use in SQL (database-specific)
   */
  protected abstract escapeIdentifier(identifier: string): string;

  // ============ Protected Helper Methods ============

  /**
   * Apply transaction options (isolation level, read-only, etc.)
   */
  protected async applyTransactionOptions(): Promise<void> {
    if (!this.options) {
      return;
    }

    if (this.options.isolationLevel !== null && this.options.isolationLevel !== undefined) {
      await this.setIsolationLevel(this.options.isolationLevel);
    }

    // Database-specific options (readOnly, deferrable) can be handled
    // in subclass implementations of applyTransactionOptions
  }

  /**
   * Release the connection back to pool
   */
  protected async releaseConnection(): Promise<void> {
    try {
      await Promise.resolve(this.connection.release());
    } catch {
      // Ignore release errors
    }
  }

  /**
   * Ensure the transaction is active
   */
  protected ensureActive(operation: string): void {
    if (!this._isActive) {
      throw new TransactionError(`Cannot ${operation}: Transaction not active`, this.id);
    }
  }

  /**
   * Ensure a savepoint exists
   */
  protected ensureSavepointExists(name: string): void {
    if (!this.savepoints.has(name)) {
      throw new TransactionError(`Savepoint "${name}" does not exist`, this.id);
    }
  }

  /**
   * Validate savepoint name (alphanumeric and underscores only)
   */
  protected validateSavepointName(name: string): void {
    if (!/^[A-Z_a-z]\w*$/.test(name)) {
      throw new TransactionError(
        `Invalid savepoint name "${name}". Use only letters, numbers, and underscores.`,
        this.id,
      );
    }
  }

  /**
   * Sanitize savepoint name for use in SQL
   */
  protected sanitizeSavepointName(name: string): string {
    return name.replaceAll(/\W/g, '_');
  }

  /**
   * Remove savepoints created after the given savepoint
   */
  protected removeNewerSavepoints(name: string): void {
    const savepointsArray = Array.from(this.savepoints);
    const index = savepointsArray.indexOf(name);

    if (index !== -1) {
      for (let i = index + 1; i < savepointsArray.length; i++) {
        const sp = savepointsArray[i];
        if (sp) {
          this.savepoints.delete(sp);
        }
      }
    }
  }

  /**
   * Normalize query parameters to array format
   */
  protected normalizeParams(params?: QueryParams): unknown[] {
    if (!params) {
      return [];
    }
    return Array.isArray(params) ? params : Object.values(params);
  }
}

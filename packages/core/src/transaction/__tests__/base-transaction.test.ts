import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BaseTransaction } from '../base-transaction';

import type { QueryResult, QueryParams, QueryOptions } from '../../types';
import type { TransactionConnection } from '../base-transaction';

class MockConnection implements TransactionConnection {
  release = vi.fn();
  query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0, fields: [] });
  execute = vi.fn().mockResolvedValue({ affectedRows: 0 });
}

class TestTransaction extends BaseTransaction<MockConnection> {
  protected async doBegin(): Promise<void> {
    await this.connection.query('BEGIN');
  }

  protected async doCommit(): Promise<void> {
    await this.connection.query('COMMIT');
  }

  protected async doRollback(): Promise<void> {
    await this.connection.query('ROLLBACK');
  }

  protected async doSavepoint(name: string): Promise<void> {
    await this.connection.query(`SAVEPOINT ${name}`);
  }

  protected async doRollbackToSavepoint(name: string): Promise<void> {
    await this.connection.query(`ROLLBACK TO SAVEPOINT ${name}`);
  }

  protected async doReleaseSavepoint(name: string): Promise<void> {
    await this.connection.query(`RELEASE SAVEPOINT ${name}`);
  }

  protected async doSetIsolationLevel(): Promise<void> {
    await this.connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
  }

  protected async doQuery<T>(
    sql: string,
    params?: QueryParams,
    _options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    return this.connection.query(sql, params);
  }

  protected async doExecute(
    sql: string,
    params?: QueryParams,
    _options?: QueryOptions,
  ): Promise<{ affectedRows: number; insertId?: number | bigint }> {
    return this.connection.execute(sql, params);
  }
}

describe('BaseTransaction', () => {
  let connection: MockConnection;
  let transaction: TestTransaction;

  beforeEach(() => {
    connection = new MockConnection();
    transaction = new TestTransaction(connection);
  });

  describe('state management', () => {
    it('should start inactive', () => {
      expect(transaction.isActive).toBe(false);
    });

    it('should become active after begin', async () => {
      await transaction.begin();
      expect(transaction.isActive).toBe(true);
    });

    it('should become inactive after commit', async () => {
      await transaction.begin();
      await transaction.commit();
      expect(transaction.isActive).toBe(false);
    });

    it('should become inactive after rollback', async () => {
      await transaction.begin();
      await transaction.rollback();
      expect(transaction.isActive).toBe(false);
    });

    it('should throw when beginning an active transaction', async () => {
      await transaction.begin();
      await expect(transaction.begin()).rejects.toThrow('Transaction already active');
    });
  });

  describe('query execution', () => {
    it('should execute queries within transaction', async () => {
      await transaction.begin();
      await transaction.query('SELECT * FROM users');

      expect(connection.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
    });

    it('should throw when querying without active transaction', async () => {
      await expect(transaction.query('SELECT 1')).rejects.toThrow();
    });
  });

  describe('execute', () => {
    it('should execute commands within transaction (alias for query)', async () => {
      await transaction.begin();
      await transaction.execute('UPDATE users SET active = true');

      // execute is an alias for query
      expect(connection.query).toHaveBeenCalledWith('UPDATE users SET active = true', undefined);
    });

    it('should throw when executing without active transaction', async () => {
      await expect(transaction.execute('UPDATE users SET active = true')).rejects.toThrow();
    });
  });

  describe('savepoints', () => {
    it('should create savepoint', async () => {
      await transaction.begin();
      await transaction.savepoint('sp1');

      expect(connection.query).toHaveBeenCalledWith('SAVEPOINT sp1');
    });

    it('should rollback to savepoint', async () => {
      await transaction.begin();
      await transaction.savepoint('sp1');
      await transaction.rollbackToSavepoint('sp1');

      expect(connection.query).toHaveBeenCalledWith('ROLLBACK TO SAVEPOINT sp1');
    });

    it('should release savepoint', async () => {
      await transaction.begin();
      await transaction.savepoint('sp1');
      await transaction.releaseSavepoint('sp1');

      expect(connection.query).toHaveBeenCalledWith('RELEASE SAVEPOINT sp1');
    });

    it('should throw when creating savepoint without active transaction', async () => {
      await expect(transaction.savepoint('sp1')).rejects.toThrow();
    });
  });

  describe('complete transaction flow', () => {
    it('should complete successful transaction', async () => {
      await transaction.begin();
      await transaction.query('INSERT INTO users VALUES (1)');
      await transaction.commit();

      expect(connection.query).toHaveBeenCalledWith('BEGIN');
      expect(connection.query).toHaveBeenCalledWith('INSERT INTO users VALUES (1)', undefined);
      expect(connection.query).toHaveBeenCalledWith('COMMIT');
      expect(transaction.isActive).toBe(false);
    });

    it('should rollback failed transaction', async () => {
      await transaction.begin();
      await transaction.query('INSERT INTO users VALUES (1)');
      await transaction.rollback();

      expect(connection.query).toHaveBeenCalledWith('BEGIN');
      expect(connection.query).toHaveBeenCalledWith('ROLLBACK');
      expect(transaction.isActive).toBe(false);
    });
  });

  describe('connection management', () => {
    it('should have unique id', () => {
      const transaction2 = new TestTransaction(connection);
      expect(transaction.id).not.toBe(transaction2.id);
    });

    it('should release connection on commit', async () => {
      await transaction.begin();
      await transaction.commit();

      expect(connection.release).toHaveBeenCalled();
    });

    it('should release connection on rollback', async () => {
      await transaction.begin();
      await transaction.rollback();

      expect(connection.release).toHaveBeenCalled();
    });
  });
});

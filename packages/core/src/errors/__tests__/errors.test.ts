import { describe, it, expect } from 'vitest';

import {
  DatabaseError,
  DBBridgeError,
  ConnectionError,
  QueryError,
  TransactionError,
  TimeoutError,
  QueryTimeoutError,
  PoolExhaustedError,
  ValidationError,
  CacheError,
  NotImplementedError,
} from '../index';

describe('Error classes', () => {
  describe('DatabaseError', () => {
    it('should create error with message', () => {
      const error = new DatabaseError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('DatabaseError');
    });

    it('should create error with code', () => {
      const error = new DatabaseError('Test error', 'TEST_CODE');
      expect(error.code).toBe('TEST_CODE');
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = new DatabaseError('Test error', 'TEST_CODE', cause);
      expect(error.cause).toBe(cause);
    });

    it('should be an instance of Error', () => {
      const error = new DatabaseError('Test error');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('DBBridgeError', () => {
    it('should create error with message', () => {
      const error = new DBBridgeError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('DBBridgeError');
    });

    it('should extend DatabaseError', () => {
      const error = new DBBridgeError('Test error');
      expect(error).toBeInstanceOf(DatabaseError);
    });
  });

  describe('ConnectionError', () => {
    it('should create error with message', () => {
      const error = new ConnectionError('Connection failed');
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('ConnectionError');
      expect(error.code).toBe('CONNECTION_ERROR');
    });

    it('should create error with cause', () => {
      const cause = new Error('ECONNREFUSED');
      const error = new ConnectionError('Connection failed', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('QueryError', () => {
    it('should create error with message', () => {
      const error = new QueryError('Query failed');
      expect(error.message).toBe('Query failed');
      expect(error.name).toBe('QueryError');
      expect(error.code).toBe('QUERY_ERROR');
    });

    it('should store sql and params', () => {
      const error = new QueryError('Query failed', 'SELECT * FROM users WHERE id = ?', [1]);
      expect(error.sql).toBe('SELECT * FROM users WHERE id = ?');
      expect(error.params).toEqual([1]);
    });

    it('should create error with cause', () => {
      const cause = new Error('Syntax error');
      const error = new QueryError('Query failed', 'SELECT * FROM', [], cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('TransactionError', () => {
    it('should create error with message', () => {
      const error = new TransactionError('Transaction failed');
      expect(error.message).toBe('Transaction failed');
      expect(error.name).toBe('TransactionError');
      expect(error.code).toBe('TRANSACTION_ERROR');
    });

    it('should store transactionId', () => {
      const error = new TransactionError('Transaction failed', 'tx_123');
      expect(error.transactionId).toBe('tx_123');
    });

    it('should create error with cause', () => {
      const cause = new Error('Deadlock');
      const error = new TransactionError('Transaction failed', 'tx_123', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('TimeoutError', () => {
    it('should create error with message', () => {
      const error = new TimeoutError('Operation timed out');
      expect(error.message).toBe('Operation timed out');
      expect(error.name).toBe('TimeoutError');
      expect(error.code).toBe('TIMEOUT_ERROR');
    });

    it('should store timeout value', () => {
      const error = new TimeoutError('Operation timed out', 5000);
      expect(error.timeout).toBe(5000);
    });

    it('should create error with cause', () => {
      const cause = new Error('Network timeout');
      const error = new TimeoutError('Operation timed out', 5000, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('QueryTimeoutError', () => {
    it('should create error with sql and timeout', () => {
      const error = new QueryTimeoutError('SELECT * FROM large_table', 5000);
      expect(error.message).toContain('Query timed out after 5000ms');
      expect(error.name).toBe('QueryTimeoutError');
      expect(error.code).toBe('QUERY_TIMEOUT');
      expect(error.sql).toBe('SELECT * FROM large_table');
      expect(error.timeoutMs).toBe(5000);
    });

    it('should extend TimeoutError', () => {
      const error = new QueryTimeoutError('SELECT 1', 1000);
      expect(error).toBeInstanceOf(TimeoutError);
    });

    it('should create error with cause', () => {
      const cause = new Error('Aborted');
      const error = new QueryTimeoutError('SELECT 1', 1000, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('PoolExhaustedError', () => {
    it('should create error with pool stats', () => {
      const error = new PoolExhaustedError({ active: 10, waiting: 5, max: 10 });
      expect(error.message).toContain('Connection pool exhausted');
      expect(error.message).toContain('10/10 connections active');
      expect(error.message).toContain('5 requests waiting');
      expect(error.name).toBe('PoolExhaustedError');
      expect(error.code).toBe('POOL_EXHAUSTED');
    });

    it('should extend ConnectionError', () => {
      const error = new PoolExhaustedError({ active: 5, waiting: 3, max: 5 });
      expect(error).toBeInstanceOf(ConnectionError);
    });

    it('should store waitTimeMs', () => {
      const error = new PoolExhaustedError({ active: 10, waiting: 5, max: 10 }, 30000);
      expect(error.waitTimeMs).toBe(30000);
    });

    it('should create error with cause', () => {
      const cause = new Error('Connection timeout');
      const error = new PoolExhaustedError({ active: 10, waiting: 5, max: 10 }, 30000, cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('ValidationError', () => {
    it('should create error with message', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_ERROR');
    });

    it('should store field name', () => {
      const error = new ValidationError('Invalid email', 'email');
      expect(error.field).toBe('email');
    });

    it('should create error with cause', () => {
      const cause = new Error('Parse error');
      const error = new ValidationError('Invalid email', 'email', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('CacheError', () => {
    it('should create error with message', () => {
      const error = new CacheError('Cache miss');
      expect(error.message).toBe('Cache miss');
      expect(error.name).toBe('CacheError');
      expect(error.code).toBe('CACHE_ERROR');
    });

    it('should store key', () => {
      const error = new CacheError('Cache set failed', 'user:123');
      expect(error.key).toBe('user:123');
    });

    it('should create error with cause', () => {
      const cause = new Error('Redis connection lost');
      const error = new CacheError('Cache set failed', 'user:123', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('NotImplementedError', () => {
    it('should create error with feature name', () => {
      const error = new NotImplementedError('Stored procedures');
      expect(error.message).toContain('Feature "Stored procedures" is not implemented');
      expect(error.name).toBe('NotImplementedError');
      expect(error.code).toBe('NOT_IMPLEMENTED');
    });

    it('should extend DBBridgeError', () => {
      const error = new NotImplementedError('Feature X');
      expect(error).toBeInstanceOf(DBBridgeError);
    });
  });

  describe('Error hierarchy', () => {
    it('should have correct inheritance chain', () => {
      const poolError = new PoolExhaustedError({ active: 5, waiting: 3, max: 5 });

      expect(poolError).toBeInstanceOf(Error);
      expect(poolError).toBeInstanceOf(DatabaseError);
      expect(poolError).toBeInstanceOf(DBBridgeError);
      expect(poolError).toBeInstanceOf(ConnectionError);
      expect(poolError).toBeInstanceOf(PoolExhaustedError);
    });

    it('should support error handling by type', () => {
      const errors = [
        new ConnectionError('Connection failed'),
        new QueryError('Query failed'),
        new TransactionError('Transaction failed'),
        new TimeoutError('Timeout'),
      ];

      const connectionErrors = errors.filter((e) => e instanceof ConnectionError);
      expect(connectionErrors.length).toBe(1);

      const dbBridgeErrors = errors.filter((e) => e instanceof DBBridgeError);
      expect(dbBridgeErrors.length).toBe(4);
    });
  });
});

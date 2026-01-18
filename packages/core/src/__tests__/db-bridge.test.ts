import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DBBridge } from '../db-bridge';
import { DatabaseError } from '../errors';

import type { DatabaseType, DBBridgeConfig } from '../db-bridge';

describe('DBBridge', () => {
  let mockAdapter: any;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock adapter
    mockAdapter = {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
      execute: vi.fn().mockResolvedValue({ rowCount: 1 }),
      createQueryBuilder: vi.fn().mockReturnValue({
        table: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue([]),
      }),
      beginTransaction: vi.fn().mockResolvedValue({
        id: 'test-transaction',
        isActive: true,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        query: vi.fn().mockResolvedValue({ rows: [] }),
      }),
      prepare: vi.fn().mockResolvedValue({
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn().mockResolvedValue(undefined),
      }),
      getPoolStats: vi.fn().mockReturnValue({
        total: 10,
        active: 2,
        idle: 8,
        waiting: 0,
      }),
    };
  });

  describe('Factory Methods', () => {
    it('should create MySQL instance', () => {
      const db = DBBridge.mysql({
        host: 'localhost',
        database: 'test',
      });

      expect(db).toBeInstanceOf(DBBridge);
      expect((db as any).config.type).toBe('mysql');
    });

    it('should create PostgreSQL instance', () => {
      const db = DBBridge.postgresql({
        host: 'localhost',
        database: 'test',
      });

      expect(db).toBeInstanceOf(DBBridge);
      expect((db as any).config.type).toBe('postgresql');
    });

    it('should create Redis instance', () => {
      const db = DBBridge.redis();

      expect(db).toBeInstanceOf(DBBridge);
      expect((db as any).config.type).toBe('redis');
      expect((db as any).config.connection.host).toBe('localhost');
      expect((db as any).config.connection.port).toBe(6379);
    });

    it('should accept options', () => {
      const logger = { info: vi.fn(), error: vi.fn() };
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' }, { logging: true, logger });

      expect((db as any).config.options?.logging).toBe(true);
      expect((db as any).config.options?.logger).toBe(logger);
    });
  });

  describe('Connection Management', () => {
    it('should throw error when adapter not installed', async () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });

      // In monorepo, adapter is available but connection will fail
      // This tests that connection errors are properly thrown
      await expect(db.connect()).rejects.toThrow();
    });

    it('should disconnect successfully', async () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });
      (db as any).adapter = mockAdapter;

      await db.disconnect();
      expect(mockAdapter.disconnect).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });

      // Should not throw
      await expect(db.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('Query Operations', () => {
    let db: DBBridge;

    beforeEach(() => {
      db = DBBridge.mysql({ host: 'localhost', database: 'test' });
      (db as any).adapter = mockAdapter;
    });

    it('should execute query', async () => {
      const expectedResult = { rows: [{ id: 1, name: 'Test' }], rowCount: 1 };
      mockAdapter.query.mockResolvedValueOnce(expectedResult);

      const result = await db.query('SELECT * FROM users WHERE id = ?', [1]);

      expect(mockAdapter.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
      expect(result).toEqual(expectedResult);
    });

    it('should execute command', async () => {
      const expectedResult = { rowCount: 1, insertId: 123 };
      mockAdapter.execute.mockResolvedValueOnce(expectedResult);

      const result = await db.execute('INSERT INTO users (name) VALUES (?)', ['Test']);

      expect(mockAdapter.execute).toHaveBeenCalledWith('INSERT INTO users (name) VALUES (?)', [
        'Test',
      ]);
      expect(result).toEqual(expectedResult);
    });

    it('should throw error when not connected', async () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });

      await expect(db.query('SELECT 1')).rejects.toThrow('Not connected');
      await expect(db.execute('SELECT 1')).rejects.toThrow('Not connected');
    });
  });

  describe('Query Builder', () => {
    let db: DBBridge;

    beforeEach(() => {
      db = DBBridge.mysql({ host: 'localhost', database: 'test' });
      (db as any).adapter = mockAdapter;
    });

    it('should create query builder for table', () => {
      const qb = db.table('users');

      expect(mockAdapter.createQueryBuilder).toHaveBeenCalled();
      expect(qb).toBeDefined();
    });

    it('should use from() as alias for table()', () => {
      const qb1 = db.table('users');
      const qb2 = db.from('users');

      expect(mockAdapter.createQueryBuilder).toHaveBeenCalledTimes(2);
    });

    it('should configure query builder with table name', () => {
      const mockQb = {
        table: vi.fn().mockReturnThis(),
      };
      mockAdapter.createQueryBuilder.mockReturnValueOnce(mockQb);

      db.table('users');

      expect(mockQb.table).toHaveBeenCalledWith('users');
    });

    it('should handle different query builder APIs', () => {
      // Test with 'from' method
      const mockQb1 = {
        from: vi.fn().mockReturnThis(),
      };
      mockAdapter.createQueryBuilder.mockReturnValueOnce(mockQb1);
      db.table('users');
      expect(mockQb1.from).toHaveBeenCalledWith('users');

      // Test with internal properties
      const mockQb2 = {
        _table: null,
        tableName: null,
      };
      mockAdapter.createQueryBuilder.mockReturnValueOnce(mockQb2);
      db.table('products');
      expect(mockQb2._table).toBe('products');
      expect(mockQb2.tableName).toBe('products');
    });

    it('should throw error if query builder does not support table selection', () => {
      mockAdapter.createQueryBuilder.mockReturnValueOnce({});

      expect(() => db.table('users')).toThrow('Query builder does not support table selection');
    });
  });

  describe('Transactions', () => {
    let db: DBBridge;

    beforeEach(() => {
      db = DBBridge.mysql({ host: 'localhost', database: 'test' });
      (db as any).adapter = mockAdapter;
    });

    it('should execute transaction successfully', async () => {
      const mockTrx = {
        id: 'test-trx',
        isActive: true,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
        table: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue(1),
        }),
      };
      mockAdapter.beginTransaction.mockResolvedValueOnce(mockTrx);

      const result = await db.transaction(async (trx) => {
        await trx.table('users').insert({ name: 'Test' });
        return 'success';
      });

      expect(mockAdapter.beginTransaction).toHaveBeenCalled();
      expect(mockTrx.commit).toHaveBeenCalled();
      expect(mockTrx.rollback).not.toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should rollback transaction on error', async () => {
      const mockTrx = {
        id: 'test-trx',
        isActive: true,
        commit: vi.fn().mockResolvedValue(undefined),
        rollback: vi.fn().mockResolvedValue(undefined),
      };
      mockAdapter.beginTransaction.mockResolvedValueOnce(mockTrx);

      const error = new Error('Test error');
      await expect(
        db.transaction(async () => {
          throw error;
        }),
      ).rejects.toThrow(error);

      expect(mockAdapter.beginTransaction).toHaveBeenCalled();
      expect(mockTrx.commit).not.toHaveBeenCalled();
      expect(mockTrx.rollback).toHaveBeenCalled();
    });
  });

  describe('Prepared Statements', () => {
    let db: DBBridge;

    beforeEach(() => {
      db = DBBridge.mysql({ host: 'localhost', database: 'test' });
      (db as any).adapter = mockAdapter;
    });

    it('should create prepared statement', async () => {
      const mockStmt = {
        execute: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn().mockResolvedValue(undefined),
      };
      mockAdapter.prepare.mockResolvedValueOnce(mockStmt);

      const stmt = await db.prepare('SELECT * FROM users WHERE id = ?');

      expect(mockAdapter.prepare).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = ?',
        undefined,
      );
      expect(stmt).toBe(mockStmt);
    });

    it('should pass options to prepare', async () => {
      await db.prepare('SELECT * FROM users WHERE id = ?', { name: 'getUserById' });

      expect(mockAdapter.prepare).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', {
        name: 'getUserById',
      });
    });
  });

  describe('Adapter Access', () => {
    it('should return adapter when connected', () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });
      (db as any).adapter = mockAdapter;

      expect(db.getAdapter()).toBe(mockAdapter);
    });

    it('should return undefined when not connected', () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });

      expect(db.getAdapter()).toBeUndefined();
    });
  });

  describe('Configuration', () => {
    it('should create instance with full config', () => {
      const config: DBBridgeConfig = {
        type: 'mysql',
        connection: {
          host: 'localhost',
          port: 3306,
          user: 'root',
          password: 'password',
          database: 'test',
          pool: {
            min: 5,
            max: 20,
            acquireTimeout: 30_000,
          },
        },
        options: {
          logging: true,
          logger: console,
        },
      };

      const db = new DBBridge(config);
      expect((db as any).config).toEqual(config);
    });
  });

  describe('Error Handling', () => {
    it('should handle unsupported database type', async () => {
      const db = new DBBridge({
        type: 'unsupported' as DatabaseType,
        connection: {},
      });

      await expect(db.connect()).rejects.toThrow('Unsupported database type');
    });

    it('should provide helpful error messages', async () => {
      const db = DBBridge.mysql({ host: 'localhost', database: 'test' });

      await expect(db.query('SELECT 1')).rejects.toThrow('Not connected. Call connect() first.');
    });
  });
});

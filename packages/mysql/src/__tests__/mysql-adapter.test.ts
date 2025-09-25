import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MySQLAdapter } from '../adapter/mysql-adapter';
import { MySQLConnectionPool } from '../pool/connection-pool';
import { ConnectionError, QueryError } from '@db-bridge/core';
import * as mysql from 'mysql2/promise';

// Mock mysql2
vi.mock('mysql2/promise', () => ({
  createPool: vi.fn(),
  escape: vi.fn((value) => `'${value}'`),
  escapeId: vi.fn((id) => `\`${id}\``)
}));

// Mock connection pool
vi.mock('../pool/connection-pool', () => ({
  MySQLConnectionPool: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getConnection: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockReturnValue({
      total: 10,
      idle: 8,
      active: 2,
      waiting: 0
    })
  }))
}));

describe('MySQLAdapter', () => {
  let adapter: MySQLAdapter;
  let mockConnection: any;
  let mockPool: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    adapter = new MySQLAdapter();
    
    // Mock connection
    mockConnection = {
      execute: vi.fn().mockResolvedValue([[], []]),
      query: vi.fn().mockResolvedValue([[], []]),
      release: vi.fn(),
      ping: vi.fn().mockResolvedValue(undefined),
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined)
    };

    // Get mock pool instance
    mockPool = (MySQLConnectionPool as any).mock.results[0]?.value;
    if (mockPool) {
      mockPool.getConnection.mockResolvedValue(mockConnection);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Adapter Properties', () => {
    it('should have correct name and version', () => {
      expect(adapter.name).toBe('MySQL');
      expect(adapter.version).toBe('2.0.0');
    });

    it('should accept custom options', () => {
      const logger = { info: vi.fn(), error: vi.fn() };
      const customAdapter = new MySQLAdapter({
        logger,
        mysql2Options: {
          timezone: '+00:00',
          dateStrings: true
        }
      });

      expect((customAdapter as any).logger).toBe(logger);
      expect((customAdapter as any).mysql2Options).toEqual({
        timezone: '+00:00',
        dateStrings: true
      });
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      const config = {
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'test_db'
      };

      await adapter.connect(config);

      // Verify pool was created with correct config
      expect(MySQLConnectionPool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 3306,
        user: 'root',
        password: 'password',
        database: 'test_db',
        connectionLimit: 10,
        waitForConnections: true,
        queueLimit: 0,
        connectTimeout: 10000
      });

      expect(mockPool.initialize).toHaveBeenCalled();
    });

    it('should support SSL configuration', async () => {
      const config = {
        host: 'localhost',
        database: 'test_db',
        ssl: {
          ca: 'cert-content',
          rejectUnauthorized: true
        }
      };

      await adapter.connect(config);

      expect(MySQLConnectionPool).toHaveBeenCalledWith(
        expect.objectContaining({
          ssl: {
            ca: 'cert-content',
            rejectUnauthorized: true
          }
        })
      );
    });

    it('should support pool configuration', async () => {
      const config = {
        host: 'localhost',
        database: 'test_db',
        pool: {
          min: 5,
          max: 50,
          queueLimit: 100,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000
        }
      };

      await adapter.connect(config);

      expect(MySQLConnectionPool).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionLimit: 50,
          queueLimit: 100,
          enableKeepAlive: true,
          keepAliveInitialDelay: 10000
        })
      );
    });

    it('should disconnect successfully', async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
      await adapter.disconnect();

      expect(mockPool.end).toHaveBeenCalled();
    });

    it('should handle disconnect when not connected', async () => {
      // Should not throw
      await expect(adapter.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
    });

    it('should execute query successfully', async () => {
      const mockRows = [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' }
      ];
      const mockFields = [
        { name: 'id', type: 3, flags: 515 },
        { name: 'name', type: 253, flags: 0 }
      ];

      mockConnection.execute.mockResolvedValueOnce([mockRows, mockFields]);

      const result = await adapter.query('SELECT * FROM users WHERE active = ?', [true]);

      expect(mockPool.getConnection).toHaveBeenCalled();
      expect(mockConnection.execute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE active = ?',
        [true]
      );
      expect(mockConnection.release).toHaveBeenCalled();

      expect(result).toEqual({
        rows: mockRows,
        rowCount: 2,
        fields: [
          {
            name: 'id',
            type: '3',
            nullable: false,
            primaryKey: true,
            autoIncrement: true,
            defaultValue: undefined
          },
          {
            name: 'name',
            type: '253',
            nullable: true,
            primaryKey: false,
            autoIncrement: false,
            defaultValue: undefined
          }
        ],
        command: 'SELECT'
      });
    });

    it('should handle query errors', async () => {
      const error = new Error('Table not found');
      mockConnection.execute.mockRejectedValueOnce(error);

      await expect(adapter.query('SELECT * FROM invalid_table')).rejects.toThrow(QueryError);

      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should handle empty results', async () => {
      mockConnection.execute.mockResolvedValueOnce([[], []]);

      const result = await adapter.query('SELECT * FROM users WHERE id = ?', [999]);

      expect(result.rows).toEqual([]);
      expect(result.rowCount).toBe(0);
    });

    it('should work with object parameters', async () => {
      await adapter.query('SELECT * FROM users WHERE id = :id AND name = :name', {
        id: 1,
        name: 'John'
      });

      expect(mockConnection.execute).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE id = :id AND name = :name',
        [1, 'John']
      );
    });

    it('should throw error when not connected', async () => {
      const notConnected = new MySQLAdapter();
      
      await expect(notConnected.query('SELECT 1')).rejects.toThrow(ConnectionError);
    });
  });

  describe('Execute Operations', () => {
    beforeEach(async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
    });

    it('should execute insert successfully', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        { insertId: 123, affectedRows: 1 },
        []
      ]);

      const result = await adapter.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['John', 'john@example.com']
      );

      expect(result).toEqual({
        insertId: 123,
        affectedRows: 1
      });
    });

    it('should execute update successfully', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        { affectedRows: 5, changedRows: 5 },
        []
      ]);

      const result = await adapter.execute(
        'UPDATE users SET active = ? WHERE created_at < ?',
        [false, '2023-01-01']
      );

      expect(result).toEqual({
        affectedRows: 5,
        changedRows: 5
      });
    });

    it('should execute delete successfully', async () => {
      mockConnection.execute.mockResolvedValueOnce([
        { affectedRows: 3 },
        []
      ]);

      const result = await adapter.execute(
        'DELETE FROM users WHERE id IN (?, ?, ?)',
        [1, 2, 3]
      );

      expect(result).toEqual({
        affectedRows: 3
      });
    });
  });

  describe('Transactions', () => {
    beforeEach(async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
    });

    it('should create transaction successfully', async () => {
      const transaction = await adapter.beginTransaction();

      expect(mockPool.getConnection).toHaveBeenCalled();
      expect(mockConnection.beginTransaction).toHaveBeenCalled();
      expect(transaction).toBeDefined();
      expect(transaction.id).toBeDefined();
    });

    it('should handle transaction with isolation level', async () => {
      await adapter.beginTransaction({
        isolationLevel: 'SERIALIZABLE',
        readOnly: true
      });

      expect(mockConnection.query).toHaveBeenCalledWith(
        'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
      );
      expect(mockConnection.query).toHaveBeenCalledWith(
        'SET TRANSACTION READ ONLY'
      );
    });

    it('should handle transaction errors', async () => {
      mockConnection.beginTransaction.mockRejectedValueOnce(new Error('Lock timeout'));

      await expect(adapter.beginTransaction()).rejects.toThrow('Failed to begin transaction');
      expect(mockConnection.release).toHaveBeenCalled();
    });
  });

  describe('Prepared Statements', () => {
    beforeEach(async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
    });

    it('should create prepared statement', async () => {
      const stmt = await adapter.prepare('SELECT * FROM users WHERE id = ?');

      expect(mockPool.getConnection).toHaveBeenCalled();
      expect(stmt).toBeDefined();
      expect(stmt.execute).toBeDefined();
      expect(stmt.release).toBeDefined();
    });
  });

  describe('Pool Statistics', () => {
    it('should return pool stats when connected', async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });

      const stats = adapter.getPoolStats();

      expect(stats).toEqual({
        total: 10,
        idle: 8,
        active: 2,
        waiting: 0
      });
    });

    it('should return empty stats when not connected', () => {
      const stats = adapter.getPoolStats();

      expect(stats).toEqual({
        total: 0,
        idle: 0,
        active: 0,
        waiting: 0
      });
    });
  });

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
    });

    it('should ping successfully', async () => {
      const result = await adapter.ping();

      expect(result).toBe(true);
      expect(mockConnection.ping).toHaveBeenCalled();
      expect(mockConnection.release).toHaveBeenCalled();
    });

    it('should return false on ping failure', async () => {
      mockConnection.ping.mockRejectedValueOnce(new Error('Connection lost'));

      const result = await adapter.ping();

      expect(result).toBe(false);
    });

    it('should escape values correctly', () => {
      const escaped = adapter.escape("O'Brien");
      expect(escaped).toBe("'O'Brien'");
    });

    it('should escape identifiers correctly', () => {
      const escaped = adapter.escapeIdentifier('user-table');
      expect(escaped).toBe('`user-table`');
    });
  });

  describe('Query Builder', () => {
    beforeEach(async () => {
      await adapter.connect({ host: 'localhost', database: 'test' });
    });

    it('should create query builder', () => {
      const qb = adapter.createQueryBuilder();

      expect(qb).toBeDefined();
      expect(qb.table).toBeDefined();
      expect(qb.where).toBeDefined();
      expect(qb.select).toBeDefined();
    });

    it('should pass adapter context to query builder', () => {
      const qb = adapter.createQueryBuilder();

      // Query builder should have access to adapter methods
      expect((qb as any).adapter).toBe(adapter);
      expect((qb as any).escapeIdentifier).toBeDefined();
      expect((qb as any).parameterPlaceholder).toBeDefined();
    });
  });
});
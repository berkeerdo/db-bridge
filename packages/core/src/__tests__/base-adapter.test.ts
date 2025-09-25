import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaseAdapter, ConnectionConfig, QueryResult, QueryOptions, QueryParams } from '../index';

class TestAdapter extends BaseAdapter {
  readonly name = 'TestAdapter';
  readonly version = '1.0.0';

  protected async doConnect(config: ConnectionConfig): Promise<void> {
    return Promise.resolve();
  }

  protected async doDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  protected async doQuery<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    return Promise.resolve({
      rows: [],
      rowCount: 0,
      fields: [],
    });
  }
}

describe('BaseAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter();
  });

  afterEach(async () => {
    if (adapter.isConnected) {
      await adapter.disconnect();
    }
  });

  describe('connect', () => {
    it('should connect successfully with valid config', async () => {
      await adapter.connect({
        host: 'localhost',
        database: 'test',
      });

      expect(adapter.isConnected).toBe(true);
    });

    it('should validate connection config', async () => {
      await expect(adapter.connect({} as ConnectionConfig)).rejects.toThrow(
        'Host is required',
      );
    });

    it('should emit connect event', async () => {
      const connectHandler = vi.fn();
      adapter.on('connect', connectHandler);

      await adapter.connect({
        host: 'localhost',
        database: 'test',
      });

      expect(connectHandler).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should disconnect successfully', async () => {
      await adapter.connect({
        host: 'localhost',
        database: 'test',
      });

      await adapter.disconnect();
      expect(adapter.isConnected).toBe(false);
    });

    it('should emit disconnect event', async () => {
      await adapter.connect({
        host: 'localhost',
        database: 'test',
      });

      const disconnectHandler = vi.fn();
      adapter.on('disconnect', disconnectHandler);

      await adapter.disconnect();
      expect(disconnectHandler).toHaveBeenCalled();
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await adapter.connect({
        host: 'localhost',
        database: 'test',
      });
    });

    it('should execute query successfully', async () => {
      const result = await adapter.query('SELECT * FROM users');
      expect(result).toHaveProperty('rows');
      expect(result).toHaveProperty('rowCount');
    });

    it('should validate SQL', async () => {
      await expect(adapter.query('')).rejects.toThrow('SQL query must be a non-empty string');
    });

    it('should throw error when not connected', async () => {
      await adapter.disconnect();
      await expect(adapter.query('SELECT 1')).rejects.toThrow('Not connected to database');
    });

    it('should emit query event', async () => {
      const queryHandler = vi.fn();
      adapter.on('query', queryHandler);

      await adapter.query('SELECT * FROM users');
      expect(queryHandler).toHaveBeenCalled();
    });
  });

  describe('ping', () => {
    it('should return true when connected', async () => {
      await adapter.connect({
        host: 'localhost',
        database: 'test',
      });

      const result = await adapter.ping();
      expect(result).toBe(true);
    });

    it('should return false when not connected', async () => {
      const result = await adapter.ping();
      expect(result).toBe(false);
    });
  });
});
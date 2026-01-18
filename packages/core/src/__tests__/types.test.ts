import { describe, it, expect } from 'vitest';

import { IsolationLevel } from '../types';

import type {
  ConnectionConfig,
  PoolConfig,
  QueryResult,
  FieldInfo,
  TransactionOptions,
  CacheOptions,
  QueryOptions,
  PoolStats,
  QueryValue,
  QueryParams,
} from '../types';

describe('Type Definitions', () => {
  describe('ConnectionConfig', () => {
    it('should accept valid connection configuration', () => {
      const config: ConnectionConfig = {
        host: 'localhost',
        port: 3306,
        database: 'test_db',
        user: 'root',
        password: 'password',
        ssl: true,
        pool: {
          min: 5,
          max: 20,
          acquireTimeout: 30_000,
          idleTimeout: 60_000,
          validateOnBorrow: true,
          maxLifetime: 1_800_000,
          queueLimit: 0,
          enableKeepAlive: true,
          keepAliveInitialDelay: 0,
        },
        connectionTimeout: 10_000,
        idleTimeout: 300_000,
        maxRetries: 3,
        retryDelay: 1000,
        readonly: false,
      };

      expect(config).toBeDefined();
      expect(config.pool?.max).toBe(20);
    });

    it('should work with minimal configuration', () => {
      const config: ConnectionConfig = {
        host: 'localhost',
        database: 'test_db',
      };

      expect(config).toBeDefined();
    });

    it('should support connection string', () => {
      const config: ConnectionConfig = {
        connectionString: 'postgresql://user:pass@localhost:5432/db',
      };

      expect(config.connectionString).toBeDefined();
    });
  });

  describe('PoolConfig', () => {
    it('should define all pool configuration options', () => {
      const poolConfig: PoolConfig = {
        min: 1,
        max: 10,
        acquireTimeout: 30_000,
        idleTimeout: 60_000,
        validateOnBorrow: true,
        maxLifetime: 3_600_000,
        queueLimit: 100,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10_000,
      };

      expect(poolConfig.min).toBe(1);
      expect(poolConfig.max).toBe(10);
      expect(poolConfig.validateOnBorrow).toBe(true);
    });
  });

  describe('QueryResult', () => {
    it('should represent query results', () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const result: QueryResult<User> = {
        rows: [
          { id: 1, name: 'John', email: 'john@example.com' },
          { id: 2, name: 'Jane', email: 'jane@example.com' },
        ],
        rowCount: 2,
        fields: [
          {
            name: 'id',
            type: 'INT',
            nullable: false,
            primaryKey: true,
            autoIncrement: true,
          },
          {
            name: 'name',
            type: 'VARCHAR',
            nullable: false,
          },
          {
            name: 'email',
            type: 'VARCHAR',
            nullable: true,
          },
        ],
        command: 'SELECT',
        duration: 15,
      };

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].name).toBe('John');
      expect(result.fields).toHaveLength(3);
      expect(result.fields?.[0].primaryKey).toBe(true);
    });
  });

  describe('TransactionOptions', () => {
    it('should support all isolation levels', () => {
      const options: TransactionOptions[] = [
        { isolationLevel: IsolationLevel.READ_UNCOMMITTED },
        { isolationLevel: IsolationLevel.READ_COMMITTED },
        { isolationLevel: IsolationLevel.REPEATABLE_READ },
        { isolationLevel: IsolationLevel.SERIALIZABLE },
        { isolationLevel: IsolationLevel.SERIALIZABLE, readOnly: true },
        { isolationLevel: IsolationLevel.SERIALIZABLE, deferrable: true },
      ];

      expect(options).toHaveLength(6);
      expect(IsolationLevel.SERIALIZABLE).toBe('SERIALIZABLE');
    });
  });

  describe('CacheOptions', () => {
    it('should define cache configuration', () => {
      const cacheOptions: CacheOptions = {
        ttl: 3600,
        key: 'user:123',
        invalidateOn: ['user_update', 'user_delete'],
        compress: true,
      };

      expect(cacheOptions.ttl).toBe(3600);
      expect(cacheOptions.invalidateOn).toContain('user_update');
      expect(cacheOptions.compress).toBe(true);
    });
  });

  describe('QueryOptions', () => {
    it('should support various query options', () => {
      const options1: QueryOptions = {
        cache: true,
        timeout: 5000,
        prepare: true,
      };

      const options2: QueryOptions = {
        cache: {
          ttl: 300,
          key: 'products:featured',
          invalidateOn: ['product_update'],
          compress: false,
        },
        timeout: 10_000,
      };

      expect(options1.cache).toBe(true);
      expect(options2.cache).toHaveProperty('ttl', 300);
    });
  });

  describe('PoolStats', () => {
    it('should represent pool statistics', () => {
      const stats: PoolStats = {
        total: 20,
        idle: 15,
        active: 5,
        waiting: 2,
      };

      expect(stats.total).toBe(20);
      expect(stats.idle + stats.active).toBe(20);
    });
  });

  describe('QueryParams', () => {
    it('should accept array of values', () => {
      const params: QueryParams = [1, 'test', true, new Date(), null];
      expect(Array.isArray(params)).toBe(true);
      expect(params).toHaveLength(5);
    });

    it('should accept object of values', () => {
      const params: QueryParams = {
        id: 1,
        name: 'test',
        active: true,
        created: new Date(),
        deleted: null,
      };

      expect(params).toHaveProperty('id', 1);
      expect(params).toHaveProperty('active', true);
    });

    it('should handle various query value types', () => {
      const values: QueryValue[] = [
        'string',
        123,
        true,
        false,
        new Date(),
        Buffer.from('binary'),
        null,
        undefined,
      ];

      expect(values).toHaveLength(8);
      expect(values[5]).toBeInstanceOf(Buffer);
    });
  });

  describe('FieldInfo', () => {
    it('should describe database field metadata', () => {
      const fields: FieldInfo[] = [
        {
          name: 'id',
          type: 'BIGINT',
          nullable: false,
          primaryKey: true,
          autoIncrement: true,
          defaultValue: undefined,
        },
        {
          name: 'email',
          type: 'VARCHAR(255)',
          nullable: true,
          primaryKey: false,
          autoIncrement: false,
          defaultValue: null,
        },
        {
          name: 'created_at',
          type: 'TIMESTAMP',
          nullable: false,
          defaultValue: 'CURRENT_TIMESTAMP',
        },
      ];

      expect(fields[0].primaryKey).toBe(true);
      expect(fields[1].nullable).toBe(true);
      expect(fields[2].defaultValue).toBe('CURRENT_TIMESTAMP');
    });
  });

  describe('Type Guards and Utilities', () => {
    it('should handle optional properties correctly', () => {
      const minimal: ConnectionConfig = {
        host: 'localhost',
      };

      const full: ConnectionConfig = {
        host: 'localhost',
        port: 3306,
        database: 'test',
        user: 'root',
        password: '',
        connectionString: undefined,
        ssl: false,
        pool: {
          min: 1,
          max: 10,
        },
        connectionTimeout: 10_000,
        idleTimeout: 60_000,
        maxRetries: 3,
        retryDelay: 1000,
        readonly: false,
      };

      expect(minimal.port).toBeUndefined();
      expect(full.pool?.min).toBe(1);
    });

    it('should handle union types correctly', () => {
      const sslOptions: Array<boolean | Record<string, unknown> | undefined> = [
        true,
        false,
        undefined,
        { rejectUnauthorized: false },
        { ca: 'cert-content', rejectUnauthorized: true },
      ];

      expect(sslOptions[0]).toBe(true);
      expect(sslOptions[3]).toHaveProperty('rejectUnauthorized', false);
    });
  });
});

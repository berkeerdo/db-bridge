import {
  BaseAdapter,
  ConnectionError,
  TransactionError,
  QueryTimeoutError,
  POOL_DEFAULTS,
} from '@db-bridge/core';
import * as mysql from 'mysql2/promise';

import { MySQLPreparedStatement } from './mysql-prepared-statement';
import { MySQLTransaction } from './mysql-transaction';
import { MySQLConnectionPool } from '../pool/connection-pool';
import { MySQLQueryBuilder } from '../query-builder/mysql-query-builder';

import type {
  BaseAdapterOptions,
  ConnectionConfig,
  PoolStats,
  PreparedStatement,
  QueryOptions,
  QueryParams,
  QueryResult,
  Transaction,
  TransactionOptions,
} from '@db-bridge/core';

export interface MySQLAdapterOptions extends BaseAdapterOptions {
  mysql2Options?: mysql.ConnectionOptions;
}

export class MySQLAdapter extends BaseAdapter {
  readonly name = 'MySQL';
  readonly version = '2.0.0';

  private pool?: MySQLConnectionPool;
  private readonly mysql2Options?: mysql.ConnectionOptions;
  private poolConfig: {
    min: number;
    max: number;
    acquireTimeout: number;
    idleTimeout: number;
    queueLimit: number;
    queryTimeout: number;
  } = {
    min: POOL_DEFAULTS.min,
    max: POOL_DEFAULTS.max,
    acquireTimeout: POOL_DEFAULTS.acquireTimeout,
    idleTimeout: POOL_DEFAULTS.idleTimeout,
    queueLimit: POOL_DEFAULTS.queueLimit,
    queryTimeout: POOL_DEFAULTS.queryTimeout,
  };

  constructor(options: MySQLAdapterOptions = {}) {
    super(options);
    this.mysql2Options = options.mysql2Options;
  }

  protected async doConnect(config: ConnectionConfig): Promise<void> {
    // Merge pool config with defaults
    this.poolConfig = {
      min: config.pool?.min ?? POOL_DEFAULTS.min,
      max: config.pool?.max ?? config.poolSize ?? POOL_DEFAULTS.max,
      acquireTimeout: config.pool?.acquireTimeout ?? POOL_DEFAULTS.acquireTimeout,
      idleTimeout: config.pool?.idleTimeout ?? POOL_DEFAULTS.idleTimeout,
      queueLimit: config.pool?.queueLimit ?? POOL_DEFAULTS.queueLimit,
      queryTimeout: config.pool?.queryTimeout ?? POOL_DEFAULTS.queryTimeout,
    };

    const connectionOptions: mysql.ConnectionOptions = {
      host: config.host,
      port: config.port || 3306,
      user: config.user,
      password: config.password,
      database: config.database,

      // Pool configuration with production-ready defaults
      connectionLimit: this.poolConfig.max,
      waitForConnections: true,
      queueLimit: this.poolConfig.queueLimit,
      connectTimeout: config.connectionTimeout || 10000,
      idleTimeout: this.poolConfig.idleTimeout,

      // Additional pool options
      ...(config.pool?.enableKeepAlive !== false && {
        enableKeepAlive: true,
        keepAliveInitialDelay: config.pool?.keepAliveInitialDelay || 10000,
      }),

      ...this.mysql2Options,
    };

    if (config.ssl) {
      connectionOptions.ssl = typeof config.ssl === 'boolean' ? {} : config.ssl;
    }

    this.pool = new MySQLConnectionPool(connectionOptions);
    await this.pool.initialize();

    this.logger?.info('Connected to MySQL database', {
      database: config.database,
      poolSize: this.poolConfig.max,
      queueLimit: this.poolConfig.queueLimit,
      queryTimeout: this.poolConfig.queryTimeout,
    });
  }

  protected async doDisconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
      this.logger?.info('Disconnected from MySQL database');
    }
  }

  protected async doQuery<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new ConnectionError('Database pool not initialized');
    }

    const connection = options?.transaction
      ? (options.transaction as MySQLTransaction).getConnection()
      : await this.pool.getConnection();

    try {
      const queryParams = this.normalizeParams(params);
      const command = sql.trim().split(' ')[0]?.toUpperCase();
      const timeout = options?.timeout ?? this.poolConfig.queryTimeout;

      // Execute with timeout
      const executeWithTimeout = async <R>(executor: () => Promise<R>): Promise<R> => {
        if (!timeout) {
          return executor();
        }

        return Promise.race([
          executor(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new QueryTimeoutError(sql.slice(0, 100), timeout)), timeout),
          ),
        ]);
      };

      // For INSERT/UPDATE/DELETE, we get ResultSetHeader instead of RowDataPacket[]
      if (command === 'INSERT' || command === 'UPDATE' || command === 'DELETE') {
        const [result] = await executeWithTimeout(() =>
          connection.execute<mysql.ResultSetHeader>(sql, queryParams),
        );
        return {
          rows: [] as T[],
          rowCount: result.affectedRows || 0,
          affectedRows: result.affectedRows || 0,
          insertId: result.insertId,
          fields: [],
          command,
        };
      }

      // For SELECT and other queries
      const [rows, fields] = await executeWithTimeout(() =>
        connection.execute<mysql.RowDataPacket[]>(sql, queryParams),
      );

      return {
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
    } finally {
      if (!options?.transaction) {
        connection.release();
      }
    }
  }

  override async beginTransaction(options?: TransactionOptions): Promise<Transaction> {
    if (!this.pool) {
      throw new ConnectionError('Database pool not initialized');
    }

    const connection = await this.pool.getConnection();
    const transaction = new MySQLTransaction(connection, options);

    try {
      await transaction.begin();
      this.logger?.debug('Transaction started', { id: transaction.id });
      return transaction;
    } catch (error) {
      connection.release();
      throw new TransactionError('Failed to begin transaction', undefined, error as Error);
    }
  }

  override async prepare<T = unknown>(sql: string, _name?: string): Promise<PreparedStatement<T>> {
    if (!this.pool) {
      throw new ConnectionError('Database pool not initialized');
    }

    const connection = await this.pool.getConnection();
    return new MySQLPreparedStatement<T>(connection, sql);
  }

  override getPoolStats(): PoolStats {
    if (!this.pool) {
      return {
        total: 0,
        idle: 0,
        active: 0,
        waiting: 0,
      };
    }

    return this.pool.getStats();
  }

  override async ping(): Promise<boolean> {
    if (!this.pool) {
      return false;
    }

    try {
      const connection = await this.pool.getConnection();
      try {
        await connection.ping();
        return true;
      } finally {
        connection.release();
      }
    } catch {
      return false;
    }
  }

  override escape(value: unknown): string {
    return mysql.escape(value);
  }

  override escapeIdentifier(identifier: string): string {
    return mysql.escapeId(identifier);
  }

  createQueryBuilder<T = unknown>(): MySQLQueryBuilder<T> {
    return new MySQLQueryBuilder<T>({
      adapter: this,
      escapeIdentifier: (id) => this.escapeIdentifier(id),
      parameterPlaceholder: () => '?',
      crypto: this.crypto,
    });
  }

  private normalizeParams(params?: QueryParams): unknown[] {
    if (!params) {
      return [];
    }

    if (Array.isArray(params)) {
      return params;
    }

    return Object.values(params);
  }
}

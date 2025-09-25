import { PoolConfig, types } from 'pg';
import {
  BaseAdapter,
  BaseAdapterOptions,
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  QueryParams,
  Transaction,
  TransactionOptions,
  PreparedStatement,
  PoolStats,
  ConnectionError,
  QueryError,
  TransactionError,
} from '@db-bridge/core';
import { PostgreSQLConnectionPool } from '../pool/connection-pool';
import { PostgreSQLTransaction } from './postgresql-transaction';
import { PostgreSQLPreparedStatement } from './postgresql-prepared-statement';
import { PostgreSQLQueryBuilder } from '../query-builder/postgresql-query-builder';

export interface PostgreSQLAdapterOptions extends BaseAdapterOptions {
  pgOptions?: PoolConfig;
  parseTypes?: boolean;
}

export class PostgreSQLAdapter extends BaseAdapter {
  readonly name = 'PostgreSQL';
  readonly version = '2.0.0';

  private pool?: PostgreSQLConnectionPool;
  private readonly pgOptions?: PoolConfig;
  private readonly parseTypes: boolean;
  private preparedStatements: Map<string, string> = new Map();

  constructor(options: PostgreSQLAdapterOptions = {}) {
    super(options);
    this.pgOptions = options.pgOptions;
    this.parseTypes = options.parseTypes ?? true;
    
    if (this.parseTypes) {
      this.configurePgTypes();
    }
  }

  protected async doConnect(config: ConnectionConfig): Promise<void> {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port || 5432,
      user: config.user,
      password: config.password,
      database: config.database,
      max: config.poolSize || 10,
      idleTimeoutMillis: config.idleTimeout || 30000,
      connectionTimeoutMillis: config.connectionTimeout || 10000,
      ...this.pgOptions,
    };

    if (config.ssl) {
      poolConfig.ssl = config.ssl;
    }

    if (config.connectionString) {
      poolConfig.connectionString = config.connectionString;
    }

    this.pool = new PostgreSQLConnectionPool(poolConfig);
    await this.pool.initialize();
    
    this.logger?.info('Connected to PostgreSQL database', { database: config.database });
  }

  protected async doDisconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
      this.preparedStatements.clear();
      this.logger?.info('Disconnected from PostgreSQL database');
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

    const client = options?.transaction
      ? (options.transaction as PostgreSQLTransaction).getClient()
      : await this.pool.getClient();

    try {
      const queryParams = this.normalizeParams(params);
      const result = await client.query(sql, queryParams);

      const queryResult: QueryResult<T> = {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
        fields: result.fields?.map((field) => ({
          name: field.name,
          type: this.getFieldType(field.dataTypeID),
          nullable: true,
          primaryKey: false,
          autoIncrement: false,
          defaultValue: undefined,
        })),
        command: result.command,
      };

      return queryResult;
    } catch (error) {
      throw new QueryError(
        `Query failed: ${(error as Error).message}`,
        sql,
        Array.isArray(params) ? params : params ? Object.values(params) : undefined,
        error as Error,
      );
    } finally {
      if (!options?.transaction) {
        client.release();
      }
    }
  }

  override async beginTransaction(options?: TransactionOptions): Promise<Transaction> {
    if (!this.pool) {
      throw new ConnectionError('Database pool not initialized');
    }

    const client = await this.pool.getClient();
    const transaction = new PostgreSQLTransaction(client, options);

    try {
      await transaction.begin();
      this.logger?.debug('Transaction started', { id: transaction.id });
      return transaction;
    } catch (error) {
      client.release();
      throw new TransactionError('Failed to begin transaction', undefined, error as Error);
    }
  }

  override async prepare<T = unknown>(sql: string, name?: string): Promise<PreparedStatement<T>> {
    if (!this.pool) {
      throw new ConnectionError('Database pool not initialized');
    }

    const client = await this.pool.getClient();
    const stmtName = name || `stmt_${this.preparedStatements.size + 1}`;
    
    if (!this.preparedStatements.has(stmtName)) {
      this.preparedStatements.set(stmtName, sql);
    }

    return new PostgreSQLPreparedStatement<T>(client, sql, stmtName);
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
      const client = await this.pool.getClient();
      try {
        await client.query('SELECT 1');
        return true;
      } finally {
        client.release();
      }
    } catch {
      return false;
    }
  }

  override escape(value: unknown): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    
    if (value instanceof Date) {
      return `'${value.toISOString()}'`;
    }
    
    if (typeof value === 'object') {
      return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
    }
    
    return String(value);
  }

  override escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  createQueryBuilder<T = unknown>(): PostgreSQLQueryBuilder<T> {
    return new PostgreSQLQueryBuilder<T>({
      adapter: this,
      escapeIdentifier: (id) => this.escapeIdentifier(id),
      parameterPlaceholder: (index) => `$${index}`,
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

  private configurePgTypes(): void {
    types.setTypeParser(types.builtins.INT8, (val: string) => {
      const num = parseInt(val, 10);
      return Number.isSafeInteger(num) ? num : val;
    });

    types.setTypeParser(types.builtins.FLOAT4, (val: string) => parseFloat(val));
    types.setTypeParser(types.builtins.FLOAT8, (val: string) => parseFloat(val));
    types.setTypeParser(types.builtins.NUMERIC, (val: string) => parseFloat(val));
    
    types.setTypeParser(types.builtins.DATE, (val: string) => new Date(val));
    types.setTypeParser(types.builtins.TIMESTAMP, (val: string) => new Date(val));
    types.setTypeParser(types.builtins.TIMESTAMPTZ, (val: string) => new Date(val));
  }

  private getFieldType(oid: number): string {
    const typeMap: Record<number, string> = {
      [types.builtins.BOOL]: 'boolean',
      [types.builtins.INT2]: 'smallint',
      [types.builtins.INT4]: 'integer',
      [types.builtins.INT8]: 'bigint',
      [types.builtins.FLOAT4]: 'real',
      [types.builtins.FLOAT8]: 'double',
      [types.builtins.NUMERIC]: 'numeric',
      [types.builtins.VARCHAR]: 'varchar',
      [types.builtins.TEXT]: 'text',
      [types.builtins.DATE]: 'date',
      [types.builtins.TIMESTAMP]: 'timestamp',
      [types.builtins.TIMESTAMPTZ]: 'timestamptz',
      [types.builtins.JSON]: 'json',
      [types.builtins.JSONB]: 'jsonb',
      [types.builtins.UUID]: 'uuid',
    };

    return typeMap[oid] || 'unknown';
  }
}
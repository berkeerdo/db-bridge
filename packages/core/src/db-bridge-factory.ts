import { DatabaseError } from './errors';

import type { ConnectionConfig, DatabaseAdapter } from './interfaces';

export type DatabaseType = 'mysql' | 'postgresql' | 'postgres';

export interface DBBridgeConfig {
  type: DatabaseType;
  connection: ConnectionConfig;
  options?: {
    logging?: boolean;
    logger?: any;
    pool?: {
      min?: number;
      max?: number;
    };
  };
}

// Adapter factory interface
export interface AdapterFactory {
  createAdapter(config: DBBridgeConfig): DatabaseAdapter;
}

// Registry for adapter factories
const adapterFactories = new Map<DatabaseType, AdapterFactory>();

/**
 * Register an adapter factory
 */
export function registerAdapterFactory(type: DatabaseType, factory: AdapterFactory): void {
  adapterFactories.set(type, factory);
}

/**
 * Create adapter using registered factory
 */
export function createAdapter(config: DBBridgeConfig): DatabaseAdapter {
  const factory = adapterFactories.get(config.type);

  if (!factory) {
    throw new DatabaseError(
      `No adapter factory registered for type: ${config.type}. ` +
        `Make sure you've imported the adapter package.`,
    );
  }

  return factory.createAdapter(config);
}

/**
 * DBBridge with factory pattern - no dynamic imports
 */
export class DBBridge {
  private adapter?: DatabaseAdapter;
  private readonly config: DBBridgeConfig;

  constructor(config: DBBridgeConfig) {
    this.config = config;
  }

  static mysql(connection: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: 'mysql',
      connection,
      options,
    });
  }

  static postgresql(connection: ConnectionConfig, options?: any): DBBridge {
    return new DBBridge({
      type: 'postgresql',
      connection,
      options,
    });
  }

  async connect(): Promise<void> {
    this.adapter = createAdapter(this.config);
    await this.adapter.connect(this.config.connection);
  }

  async disconnect(): Promise<void> {
    if (this.adapter) {
      await this.adapter.disconnect();
    }
  }

  async query<T = any>(sql: string, params?: any[]): Promise<{ rows: T[]; fields?: any[] }> {
    this.ensureConnected();
    return this.adapter!.query(sql, params);
  }

  async execute(sql: string, params?: any[]): Promise<any> {
    this.ensureConnected();
    return this.adapter!.execute(sql, params);
  }

  table<T = any>(tableName: string): import('./interfaces').QueryBuilder<T> {
    this.ensureConnected();
    const qb = this.adapter!.createQueryBuilder<T>();
    return this.configureQueryBuilder(qb, tableName);
  }

  private configureQueryBuilder<T>(
    qb: any,
    tableName: string,
  ): import('./interfaces').QueryBuilder<T> {
    if (typeof qb.table === 'function') {
      return qb.table(tableName);
    }
    if (typeof qb.from === 'function') {
      return qb.from(tableName);
    }
    if ('_table' in qb || 'tableName' in qb) {
      qb._table = tableName;
      qb.tableName = tableName;
      return qb;
    }
    throw new DatabaseError('Query builder does not support table selection');
  }

  from<T = any>(tableName: string): import('./interfaces').QueryBuilder<T> {
    return this.table<T>(tableName);
  }

  async transaction<T>(callback: (trx: any) => Promise<T>): Promise<T> {
    this.ensureConnected();
    const trx = await this.adapter!.beginTransaction();

    try {
      const result = await callback(trx);
      await trx.commit();
      return result;
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  }

  async prepare(sql: string, options?: any): Promise<any> {
    this.ensureConnected();
    return this.adapter!.prepare(sql, options);
  }

  private ensureConnected(): void {
    if (!this.adapter) {
      throw new DatabaseError('Not connected. Call connect() first.');
    }
  }

  getAdapter(): DatabaseAdapter | undefined {
    return this.adapter;
  }
}

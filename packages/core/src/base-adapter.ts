import { EventEmitter } from 'eventemitter3';

import { NotImplementedError, ConnectionError, QueryError } from './errors';
import {
  validateConnectionConfig,
  validateSQL,
  retry,
  withTimeout,
  generateCacheKey,
} from './utils';

import type { CryptoProvider } from './crypto/crypto';
import type { DatabaseAdapter, CacheAdapter } from './interfaces';
import type {
  ConnectionConfig,
  QueryResult,
  QueryOptions,
  QueryParams,
  Transaction,
  TransactionOptions,
  PreparedStatement,
  PoolStats,
  Logger,
} from './types';

export interface BaseAdapterOptions {
  logger?: Logger;
  cache?: CacheAdapter;
  crypto?: CryptoProvider;
  retryOptions?: {
    maxRetries?: number;
    retryDelay?: number;
  };
}

export abstract class BaseAdapter extends EventEmitter implements DatabaseAdapter {
  protected config?: ConnectionConfig;
  protected logger?: Logger;
  protected cache?: CacheAdapter;
  protected crypto?: CryptoProvider;
  protected _isConnected = false;
  protected retryOptions = {
    maxRetries: 3,
    retryDelay: 1000,
  };

  abstract readonly name: string;
  abstract readonly version: string;

  get isConnected(): boolean {
    return this._isConnected;
  }

  constructor(options: BaseAdapterOptions = {}) {
    super();
    if (options.logger) {
      this.logger = options.logger;
    }
    if (options.cache) {
      this.cache = options.cache;
    }
    if (options.crypto) {
      this.crypto = options.crypto;
    }
    if (options.retryOptions) {
      this.retryOptions = { ...this.retryOptions, ...options.retryOptions };
    }
  }

  async connect(config: ConnectionConfig): Promise<void> {
    validateConnectionConfig(config);
    this.config = config;

    try {
      await retry(
        async () => {
          await this.doConnect(config);
          this._isConnected = true;
          this.emit('connect', { config });
        },
        {
          maxRetries: this.retryOptions.maxRetries,
          retryDelay: this.retryOptions.retryDelay,
        },
      );
    } catch (error) {
      throw new ConnectionError('Failed to connect to database', error as Error);
    }
  }

  async disconnect(): Promise<void> {
    if (!this._isConnected) {
      return;
    }

    try {
      await this.doDisconnect();
      this._isConnected = false;
      this.emit('disconnect');
    } catch (error) {
      throw new ConnectionError('Failed to disconnect from database', error as Error);
    }
  }

  async query<T = unknown>(
    sql: string,
    params?: QueryParams,
    options: QueryOptions = {},
  ): Promise<QueryResult<T>> {
    validateSQL(sql);

    if (!this._isConnected) {
      throw new ConnectionError('Not connected to database');
    }

    const startTime = Date.now();

    try {
      let result: QueryResult<T>;

      if (options.cache && this.cache) {
        const cacheKey = this.getCacheKey(sql, params, options.cache);
        const cachedResult = await this.cache.get<QueryResult<T>>(cacheKey);

        if (cachedResult) {
          this.logger?.debug('Cache hit', { key: cacheKey });
          this.emit('cacheHit', { key: cacheKey, sql });
          return cachedResult;
        }

        this.logger?.debug('Cache miss', { key: cacheKey });
        this.emit('cacheMiss', { key: cacheKey, sql });
      }

      const queryPromise = this.doQuery<T>(sql, params, options);

      if (options.timeout) {
        result = await withTimeout(
          queryPromise,
          options.timeout,
          `Query timed out after ${options.timeout}ms`,
        );
      } else {
        result = await queryPromise;
      }

      result.duration = Date.now() - startTime;

      if (options.cache && this.cache) {
        const cacheKey = this.getCacheKey(sql, params, options.cache);
        const ttl = typeof options.cache === 'object' ? options.cache.ttl : undefined;
        await this.cache.set(cacheKey, result, ttl);
        this.logger?.debug('Cached query result', { key: cacheKey, ttl });
      }

      this.emit('query', { sql, params, duration: result.duration, rowCount: result.rowCount });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.emit('queryError', { sql, params, error, duration });
      throw new QueryError(
        `Query failed: ${(error as Error).message}`,
        sql,
        params as unknown[],
        error as Error,
      );
    }
  }

  async execute<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>> {
    return this.query<T>(sql, params, { ...options, cache: false });
  }

  /**
   * Execute a batch of queries with different parameter sets
   * Industry-standard batch operations for bulk inserts/updates
   */
  async executeBatch<T = unknown>(
    sql: string,
    paramSets: QueryParams[],
    options?: QueryOptions,
  ): Promise<QueryResult<T>[]> {
    if (!this._isConnected) {
      throw new ConnectionError('Not connected to database');
    }

    const results: QueryResult<T>[] = [];
    const startTime = Date.now();

    try {
      for (const params of paramSets) {
        const result = await this.execute<T>(sql, params, options);
        results.push(result);
      }

      const duration = Date.now() - startTime;
      this.emit('batchExecute', { sql, batchSize: paramSets.length, duration });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.emit('batchError', { sql, error, duration });
      throw new QueryError(
        `Batch execution failed: ${(error as Error).message}`,
        sql,
        [],
        error as Error,
      );
    }
  }

  async prepare<T = unknown>(_sql: string, _name?: string): Promise<PreparedStatement<T>> {
    throw new NotImplementedError('prepare');
  }

  async beginTransaction(_options?: TransactionOptions): Promise<Transaction> {
    throw new NotImplementedError('beginTransaction');
  }

  getPoolStats(): PoolStats {
    throw new NotImplementedError('getPoolStats');
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  escape(_value: unknown): string {
    throw new NotImplementedError('escape');
  }

  escapeIdentifier(_identifier: string): string {
    throw new NotImplementedError('escapeIdentifier');
  }

  abstract createQueryBuilder<T = unknown>(): import('./interfaces').QueryBuilder<T>;

  protected abstract doConnect(config: ConnectionConfig): Promise<void>;
  protected abstract doDisconnect(): Promise<void>;
  protected abstract doQuery<T = unknown>(
    sql: string,
    params?: QueryParams,
    options?: QueryOptions,
  ): Promise<QueryResult<T>>;

  private getCacheKey(
    sql: string,
    params?: QueryParams,
    cacheOptions?: boolean | CacheOptions,
  ): string {
    if (typeof cacheOptions === 'object' && cacheOptions.key) {
      return cacheOptions.key;
    }

    const paramsArray = Array.isArray(params) ? params : params ? Object.values(params) : undefined;
    return generateCacheKey(sql, paramsArray);
  }
}

type CacheOptions = {
  ttl?: number;
  key?: string;
  invalidateOn?: string[];
  compress?: boolean;
};

import { RedisAdapter } from './redis-adapter';
import { CacheAdapter, DatabaseAdapter, QueryResult, CacheOptions, QueryParams, QueryOptions } from '@db-bridge/core';

export interface RedisCacheAdapterOptions {
  redis: RedisAdapter;
  defaultTTL?: number;
  keyPrefix?: string;
  invalidationPatterns?: Map<string, string[]>;
}

export class RedisCacheAdapter {
  private redis: RedisAdapter;
  private defaultTTL: number;
  private keyPrefix: string;
  private invalidationPatterns: Map<string, string[]>;

  constructor(options: RedisCacheAdapterOptions) {
    this.redis = options.redis;
    this.defaultTTL = options.defaultTTL || 3600;
    this.keyPrefix = options.keyPrefix || 'query:';
    this.invalidationPatterns = options.invalidationPatterns || new Map();
  }

  async getCachedQuery<T = unknown>(
    key: string,
    options?: CacheOptions,
  ): Promise<QueryResult<T> | null> {
    const fullKey = this.getQueryKey(key, options);
    return this.redis.get<QueryResult<T>>(fullKey);
  }

  async setCachedQuery<T = unknown>(
    key: string,
    result: QueryResult<T>,
    options?: CacheOptions,
  ): Promise<void> {
    const fullKey = this.getQueryKey(key, options);
    const ttl = options?.ttl || this.defaultTTL;
    
    await this.redis.set(fullKey, result, ttl);
    
    if (options?.invalidateOn) {
      await this.registerInvalidation(fullKey, options.invalidateOn);
    }
  }

  async invalidateQueries(patterns: string[]): Promise<number> {
    let invalidatedCount = 0;

    for (const pattern of patterns) {
      const keys = await this.redis.keys(`${this.keyPrefix}${pattern}`);
      
      for (const key of keys) {
        const deleted = await this.redis.delete(key);
        if (deleted) {
          invalidatedCount++;
        }
      }
      
      const registeredKeys = this.invalidationPatterns.get(pattern) || [];
      for (const key of registeredKeys) {
        const deleted = await this.redis.delete(key);
        if (deleted) {
          invalidatedCount++;
        }
      }
    }

    return invalidatedCount;
  }

  async invalidateAll(): Promise<void> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => this.redis.delete(key)));
    }
    
    this.invalidationPatterns.clear();
  }

  async getStatistics(): Promise<{
    totalKeys: number;
    totalSize: number;
    patterns: string[];
  }> {
    const keys = await this.redis.keys(`${this.keyPrefix}*`);
    
    let totalSize = 0;
    const patterns = new Set<string>();

    return {
      totalKeys: keys.length,
      totalSize,
      patterns: Array.from(patterns),
    };
  }

  private getQueryKey(key: string, options?: CacheOptions): string {
    if (options?.key) {
      return `${this.keyPrefix}${options.key}`;
    }
    return `${this.keyPrefix}${key}`;
  }

  private async registerInvalidation(key: string, patterns: string[]): Promise<void> {
    for (const pattern of patterns) {
      const existing = this.invalidationPatterns.get(pattern) || [];
      existing.push(key);
      this.invalidationPatterns.set(pattern, existing);
    }
  }
}

export function createDatabaseAdapterWithCache(
  adapter: DatabaseAdapter,
  cacheAdapter: CacheAdapter,
  options?: {
    defaultTTL?: number;
    cacheableCommands?: string[];
  },
): DatabaseAdapter {
  const cacheableCommands = options?.cacheableCommands || ['SELECT'];
  const defaultTTL = options?.defaultTTL || 3600;

  const originalQuery = adapter.query.bind(adapter);

  adapter.query = async function <T = unknown>(
    sql: string,
    params?: QueryParams,
    queryOptions?: QueryOptions,
  ): Promise<QueryResult<T>> {
    const command = sql.trim().split(' ')[0]?.toUpperCase();
    
    if (!queryOptions?.cache || !cacheableCommands.includes(command!)) {
      return originalQuery<T>(sql, params, queryOptions);
    }

    const cacheOptions = typeof queryOptions.cache === 'object' ? queryOptions.cache : {};
    const cacheKey = generateQueryCacheKey(sql, params);
    
    const cached = await cacheAdapter.get<QueryResult<T>>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await originalQuery<T>(sql, params, queryOptions);
    
    const ttl = cacheOptions.ttl || defaultTTL;
    await cacheAdapter.set(cacheKey, result, ttl);

    return result as QueryResult<T>;
  };

  return adapter;
}

function generateQueryCacheKey(sql: string, params?: QueryParams): string {
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256');
  hash.update(sql);
  
  if (params) {
    hash.update(JSON.stringify(params));
  }
  
  return hash.digest('hex');
}
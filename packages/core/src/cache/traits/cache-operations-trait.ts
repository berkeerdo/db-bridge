import { CacheBaseTrait } from './cache-base-trait';

import type { QueryResult } from '../../types';
import type { CacheStrategy, QueryCacheOptions } from '../cache-strategy';

export interface CachedQuery {
  key: string;
  sql: string;
  result: QueryResult;
  timestamp: Date;
  ttl: number;
  hits: number;
  tags: string[];
  size: number;
}

export class CacheOperationsTrait extends CacheBaseTrait {
  protected strategy!: CacheStrategy;
  protected queryCache = new Map<string, CachedQuery>();
  protected tagIndex = new Map<string, Set<string>>();

  setStrategy(strategy: CacheStrategy): void {
    this.strategy = strategy;
  }

  async get<T = unknown>(
    sql: string,
    params?: unknown[],
    options?: QueryCacheOptions,
  ): Promise<QueryResult<T> | null> {
    if (!this.enabled) {
      return null;
    }

    const startTime = Date.now();
    const key = this.strategy.getCacheKey(sql, params, options);

    try {
      const cached = await this.cache.get<QueryResult<T>>(key);

      if (cached) {
        const duration = Date.now() - startTime;
        this.updateStatistics('hit', duration);

        // Update hit count
        const cachedQuery = this.queryCache.get(key);
        if (cachedQuery) {
          cachedQuery.hits++;
        }

        this.emit('cacheHit', { key, sql, duration });
        this.logger?.debug('Cache hit', { key, duration });

        return cached;
      }

      const duration = Date.now() - startTime;
      this.updateStatistics('miss', duration);
      this.emit('cacheMiss', { key, sql, duration });
      this.logger?.debug('Cache miss', { key, duration });

      return null;
    } catch (error) {
      this.logger?.error('Cache get error', error);
      this.emit('cacheError', { key, error });
      return null;
    }
  }

  async set<T = unknown>(
    sql: string,
    params: unknown[] | undefined,
    result: QueryResult<T>,
    options?: QueryCacheOptions,
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    // Check if we should cache this query
    if (!this.strategy.shouldCache(sql, result)) {
      this.logger?.debug('Query not cacheable', { sql });
      return;
    }

    const key = this.strategy.getCacheKey(sql, params, options);
    const ttl = this.strategy.getCacheTTL(sql, options);
    const tags = options?.tags || [];

    try {
      await this.cache.set(key, result, ttl);

      // Store metadata
      const cachedQuery: CachedQuery = {
        key,
        sql,
        result,
        timestamp: new Date(),
        ttl,
        hits: 0,
        tags,
        size: JSON.stringify(result).length,
      };

      this.queryCache.set(key, cachedQuery);

      // Update tag index
      tags.forEach((tag) => {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(key);
      });

      this.statistics.totalCached++;
      this.emit('cacheSet', { key, sql, ttl, tags });
      this.logger?.debug('Query cached', { key, ttl, tags });

      // Register for invalidation
      if (options?.invalidateOn) {
        await this.registerInvalidation(key, options.invalidateOn);
      }
    } catch (error) {
      this.logger?.error('Cache set error', error);
      this.emit('cacheError', { key, error });
    }
  }

  getCachedQueries(): CachedQuery[] {
    return Array.from(this.queryCache.values()).sort((a, b) => b.hits - a.hits);
  }

  getCacheSize(): { entries: number; approximateSize: number } {
    let size = 0;
    this.queryCache.forEach((cached) => {
      size += cached.size;
    });

    return {
      entries: this.queryCache.size,
      approximateSize: size,
    };
  }

  protected async registerInvalidation(key: string, patterns: string[]): Promise<void> {
    // This would integrate with a pub/sub system or database triggers
    this.logger?.debug('Registered invalidation patterns', { key, patterns });
  }
}

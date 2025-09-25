import { EventEmitter } from 'eventemitter3';
import { CacheAdapter } from '../interfaces';
import { QueryResult, Logger } from '../types';
import { generateCacheKey } from '../utils';

export interface CacheStrategy {
  shouldCache(sql: string, result: QueryResult): boolean;
  getCacheTTL(sql: string, options?: CacheManagerOptions): number;
  getCacheKey(sql: string, params?: unknown[], options?: CacheManagerOptions): string;
  getInvalidationPatterns(sql: string): string[];
}

export interface CacheManagerOptions {
  ttl?: number;
  key?: string;
  tags?: string[];
  invalidateOn?: string[];
  compress?: boolean;
  cacheEmpty?: boolean;
  cacheErrors?: boolean;
}

export interface CacheStatistics {
  hits: number;
  misses: number;
  hitRate: number;
  totalCached: number;
  totalEvicted: number;
  avgHitTime: number;
  avgMissTime: number;
  memoryUsage?: number;
}

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

export class DefaultCacheStrategy implements CacheStrategy {
  private readonly cacheableCommands = ['SELECT', 'SHOW', 'DESCRIBE'];
  private readonly defaultTTL = 3600; // 1 hour

  shouldCache(sql: string, result: QueryResult): boolean {
    const command = sql.trim().split(/\s+/)[0]?.toUpperCase();
    
    // Only cache read operations
    if (!command || !this.cacheableCommands.includes(command)) {
      return false;
    }

    // Don't cache empty results by default
    if (result.rowCount === 0) {
      return false;
    }

    // Don't cache very large results
    const resultSize = JSON.stringify(result).length;
    if (resultSize > 1024 * 1024) { // 1MB
      return false;
    }

    return true;
  }

  getCacheTTL(sql: string, options?: CacheManagerOptions): number {
    if (options?.ttl !== undefined) {
      return options.ttl;
    }

    // Different TTLs for different query types
    const upperSql = sql.toUpperCase();
    
    if (upperSql.includes('COUNT(') || upperSql.includes('SUM(')) {
      return 300; // 5 minutes for aggregates
    }
    
    if (upperSql.includes('JOIN')) {
      return 600; // 10 minutes for joins
    }

    return this.defaultTTL;
  }

  getCacheKey(sql: string, params?: unknown[], options?: CacheManagerOptions): string {
    if (options?.key) {
      return options.key;
    }

    return generateCacheKey(sql, params);
  }

  getInvalidationPatterns(sql: string): string[] {
    const patterns: string[] = [];
    const tables = this.extractTableNames(sql);

    tables.forEach((table) => {
      patterns.push(`table:${table}:*`);
      patterns.push(`query:*${table}*`);
    });

    return patterns;
  }

  private extractTableNames(sql: string): string[] {
    const tables: string[] = [];
    const patterns = [
      /FROM\s+`?(\w+)`?/gi,
      /JOIN\s+`?(\w+)`?/gi,
      /UPDATE\s+`?(\w+)`?/gi,
      /INSERT\s+INTO\s+`?(\w+)`?/gi,
      /DELETE\s+FROM\s+`?(\w+)`?/gi,
    ];

    patterns.forEach((pattern) => {
      let match;
      while ((match = pattern.exec(sql)) !== null) {
        if (match[1]) {
          tables.push(match[1].toLowerCase());
        }
      }
    });

    return [...new Set(tables)];
  }
}

export class CacheManager extends EventEmitter {
  private cache: CacheAdapter;
  private strategy: CacheStrategy;
  private statistics: CacheStatistics;
  private logger?: Logger;
  private enabled = true;
  private queryCache = new Map<string, CachedQuery>();
  private tagIndex = new Map<string, Set<string>>();

  constructor(
    cache: CacheAdapter,
    options: {
      strategy?: CacheStrategy;
      logger?: Logger;
      enabled?: boolean;
    } = {}
  ) {
    super();
    this.cache = cache;
    this.strategy = options.strategy || new DefaultCacheStrategy();
    this.logger = options.logger;
    this.enabled = options.enabled ?? true;
    
    this.statistics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalCached: 0,
      totalEvicted: 0,
      avgHitTime: 0,
      avgMissTime: 0,
    };

    this.startCleanupTimer();
  }

  async get<T = unknown>(
    sql: string,
    params?: unknown[],
    options?: CacheManagerOptions
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
    options?: CacheManagerOptions
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

  async invalidate(patterns: string[]): Promise<number> {
    if (!this.enabled) {
      return 0;
    }

    let invalidated = 0;

    for (const pattern of patterns) {
      try {
        // Invalidate by pattern
        const keys = await this.cache.keys(pattern);
        
        for (const key of keys) {
          const deleted = await this.cache.delete(key);
          if (deleted) {
            invalidated++;
            this.queryCache.delete(key);
            
            // Remove from tag index
            this.tagIndex.forEach((keySet) => {
              keySet.delete(key);
            });
          }
        }

        // Invalidate by tags
        if (this.tagIndex.has(pattern)) {
          const taggedKeys = this.tagIndex.get(pattern)!;
          
          for (const key of taggedKeys) {
            const deleted = await this.cache.delete(key);
            if (deleted) {
              invalidated++;
              this.queryCache.delete(key);
            }
          }
          
          this.tagIndex.delete(pattern);
        }
      } catch (error) {
        this.logger?.error('Invalidation error', { pattern, error });
      }
    }

    this.statistics.totalEvicted += invalidated;
    this.emit('cacheInvalidated', { patterns, count: invalidated });
    this.logger?.info('Cache invalidated', { patterns, count: invalidated });

    return invalidated;
  }

  async invalidateByTable(table: string): Promise<number> {
    const patterns = [
      `*${table}*`,
      `table:${table}:*`,
      table, // tag
    ];

    return this.invalidate(patterns);
  }

  async invalidateAll(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    await this.cache.clear();
    this.queryCache.clear();
    this.tagIndex.clear();
    
    this.statistics.totalEvicted += this.statistics.totalCached;
    this.statistics.totalCached = 0;
    
    this.emit('cacheCleared');
    this.logger?.info('Cache cleared');
  }

  async warmUp(queries: Array<{ sql: string; params?: unknown[]; options?: CacheManagerOptions }>): Promise<void> {
    if (!this.enabled) {
      return;
    }

    this.logger?.info('Cache warmup started', { count: queries.length });
    
    for (const query of queries) {
      try {
        const cached = await this.get(query.sql, query.params, query.options);
        
        if (!cached) {
          this.logger?.debug('Query needs caching for warmup', { sql: query.sql });
          // The actual query execution and caching should be done by the adapter
        }
      } catch (error) {
        this.logger?.error('Warmup query failed', { sql: query.sql, error });
      }
    }

    this.emit('cacheWarmedUp', { count: queries.length });
    this.logger?.info('Cache warmup completed');
  }

  getStatistics(): CacheStatistics {
    return { ...this.statistics };
  }

  resetStatistics(): void {
    this.statistics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalCached: 0,
      totalEvicted: 0,
      avgHitTime: 0,
      avgMissTime: 0,
    };
  }

  enable(): void {
    this.enabled = true;
    this.emit('cacheEnabled');
  }

  disable(): void {
    this.enabled = false;
    this.emit('cacheDisabled');
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setStrategy(strategy: CacheStrategy): void {
    this.strategy = strategy;
  }

  private updateStatistics(type: 'hit' | 'miss', duration: number): void {
    if (type === 'hit') {
      this.statistics.hits++;
      this.statistics.avgHitTime = 
        (this.statistics.avgHitTime * (this.statistics.hits - 1) + duration) / this.statistics.hits;
    } else {
      this.statistics.misses++;
      this.statistics.avgMissTime = 
        (this.statistics.avgMissTime * (this.statistics.misses - 1) + duration) / this.statistics.misses;
    }

    const total = this.statistics.hits + this.statistics.misses;
    this.statistics.hitRate = total > 0 ? this.statistics.hits / total : 0;
  }

  private async registerInvalidation(key: string, patterns: string[]): Promise<void> {
    // This would integrate with a pub/sub system or database triggers
    // For now, we just log it
    this.logger?.debug('Registered invalidation patterns', { key, patterns });
  }

  private startCleanupTimer(): void {
    // Periodically clean up expired entries from local cache
    setInterval(() => {
      const now = Date.now();
      
      this.queryCache.forEach((cached, key) => {
        const age = now - cached.timestamp.getTime();
        
        if (age > cached.ttl * 1000) {
          this.queryCache.delete(key);
          
          // Remove from tag index
          cached.tags.forEach((tag) => {
            this.tagIndex.get(tag)?.delete(key);
          });
        }
      });
    }, 60000); // Every minute
  }

  getCachedQueries(): CachedQuery[] {
    return Array.from(this.queryCache.values())
      .sort((a, b) => b.hits - a.hits); // Sort by popularity
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
}

// Advanced cache strategies
export class SmartCacheStrategy extends DefaultCacheStrategy {
  private queryPatterns = new Map<string, { hits: number; avgDuration: number }>();

  override shouldCache(sql: string, result: QueryResult): boolean {
    if (!super.shouldCache(sql, result)) {
      return false;
    }

    // Learn from query patterns
    const pattern = this.normalizeQuery(sql);
    const stats = this.queryPatterns.get(pattern);

    if (stats) {
      // Cache frequently accessed queries
      if (stats.hits > 10) {
        return true;
      }

      // Cache slow queries
      if (stats.avgDuration > 100) {
        return true;
      }
    }

    return true;
  }

  override getCacheTTL(sql: string, options?: CacheManagerOptions): number {
    const baseTTL = super.getCacheTTL(sql, options);
    const pattern = this.normalizeQuery(sql);
    const stats = this.queryPatterns.get(pattern);

    if (stats) {
      // Longer TTL for frequently accessed queries
      if (stats.hits > 100) {
        return baseTTL * 2;
      }

      // Shorter TTL for rarely accessed queries
      if (stats.hits < 5) {
        return baseTTL / 2;
      }
    }

    return baseTTL;
  }

  recordQueryExecution(sql: string, duration: number): void {
    const pattern = this.normalizeQuery(sql);
    const stats = this.queryPatterns.get(pattern) || { hits: 0, avgDuration: 0 };

    stats.avgDuration = (stats.avgDuration * stats.hits + duration) / (stats.hits + 1);
    stats.hits++;

    this.queryPatterns.set(pattern, stats);
  }

  private normalizeQuery(sql: string): string {
    // Normalize query to identify patterns
    return sql
      .replace(/\s+/g, ' ')
      .replace(/\d+/g, '?')
      .replace(/'[^']*'/g, '?')
      .toLowerCase()
      .trim();
  }
}
import { QueryResult } from '../types';
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

  protected extractTableNames(sql: string): string[] {
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
import { CacheKeyGenerator } from './cache-key-generator';

import type { CacheAdapter } from '../interfaces';

export interface CacheEntry<T = unknown> {
  data: T;
  cachedAt: number;
  expiresAt?: number;
  tags?: string[];
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  invalidations: number;
  hitRate: number;
}

export interface CacheManagerOptions {
  adapter: CacheAdapter;
  defaultTTL?: number;
  namespace?: string;
  enableStats?: boolean;
  keyPrefix?: string;
}

export interface CacheSetOptions {
  ttl?: number;
  tags?: string[];
  skipIfExists?: boolean;
}

export class CacheManager {
  private readonly adapter: CacheAdapter;
  private readonly defaultTTL: number;
  private readonly enableStats: boolean;
  private readonly keyPrefix: string;
  public readonly key: CacheKeyGenerator;

  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    invalidations: 0,
    hitRate: 0,
  };

  constructor(options: CacheManagerOptions) {
    this.adapter = options.adapter;
    this.defaultTTL = options.defaultTTL || 300;
    this.enableStats = options.enableStats ?? true;
    this.keyPrefix = options.keyPrefix || '';
    this.key = new CacheKeyGenerator({ namespace: options.namespace || 'cache' });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const fullKey = this.getFullKey(key);
    const result = await this.adapter.get<CacheEntry<T>>(fullKey);
    if (result) {
      this.recordHit();
      return result.data;
    }
    this.recordMiss();
    return null;
  }

  async set<T = unknown>(key: string, data: T, options: CacheSetOptions = {}): Promise<void> {
    const fullKey = this.getFullKey(key);
    const ttl = options.ttl ?? this.defaultTTL;
    if (options.skipIfExists && (await this.adapter.exists(fullKey))) {
      return;
    }
    const entry: CacheEntry<T> = {
      data,
      cachedAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined,
      tags: options.tags,
    };
    await this.adapter.set(fullKey, entry, ttl);
    if (options.tags?.length) {
      await this.addKeyToTags(fullKey, options.tags);
    }
    this.recordSet();
  }

  async getOrSet<T = unknown>(
    key: string,
    fetchFn: () => Promise<T>,
    options: CacheSetOptions = {},
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const data = await fetchFn();
    await this.set(key, data, options);
    return data;
  }

  async delete(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    const result = await this.adapter.delete(fullKey);
    if (result) {
      this.recordDelete();
    }
    return result;
  }

  async deleteMany(keys: string[]): Promise<number> {
    let deleted = 0;
    for (const key of keys) {
      if (await this.delete(key)) {
        deleted++;
      }
    }
    return deleted;
  }

  async exists(key: string): Promise<boolean> {
    return this.adapter.exists(this.getFullKey(key));
  }

  async invalidateByTag(tag: string): Promise<number> {
    const tagKey = this.key.tag(tag);
    const keys = await this.adapter.get<string[]>(tagKey);
    if (!keys?.length) {
      return 0;
    }
    let invalidated = 0;
    for (const key of keys) {
      if (await this.adapter.delete(key)) {
        invalidated++;
      }
    }
    await this.adapter.delete(tagKey);
    this.recordInvalidation(invalidated);
    return invalidated;
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let total = 0;
    for (const tag of tags) {
      total += await this.invalidateByTag(tag);
    }
    return total;
  }

  async invalidateTable(table: string): Promise<number> {
    return this.invalidateByTag(`table:${table}`);
  }

  async invalidateRecord(table: string, id: string | number): Promise<boolean> {
    return this.delete(this.key.tableId(table, id));
  }

  async clear(): Promise<void> {
    const adapter = this.adapter as CacheAdapter & { flushdb?: () => Promise<void> };
    if (adapter.flushdb) {
      await adapter.flushdb();
    }
    this.resetStats();
  }

  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return { ...this.stats, hitRate: total > 0 ? this.stats.hits / total : 0 };
  }

  resetStats(): void {
    this.stats = { hits: 0, misses: 0, sets: 0, deletes: 0, invalidations: 0, hitRate: 0 };
  }

  async getTTL(key: string): Promise<number> {
    return this.adapter.ttl(this.getFullKey(key));
  }
  async extendTTL(key: string, ttl: number): Promise<boolean> {
    return this.adapter.expire(this.getFullKey(key), ttl);
  }

  scope(namespace: string): CacheManager {
    return new CacheManager({
      adapter: this.adapter,
      defaultTTL: this.defaultTTL,
      namespace,
      enableStats: this.enableStats,
      keyPrefix: this.keyPrefix,
    });
  }

  private getFullKey(key: string): string {
    return this.keyPrefix ? `${this.keyPrefix}:${key}` : key;
  }

  private async addKeyToTags(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = this.key.tag(tag);
      const existing = (await this.adapter.get<string[]>(tagKey)) || [];
      if (!existing.includes(key)) {
        existing.push(key);
        await this.adapter.set(tagKey, existing);
      }
    }
  }

  private recordHit(): void {
    if (this.enableStats) {
      this.stats.hits++;
    }
  }
  private recordMiss(): void {
    if (this.enableStats) {
      this.stats.misses++;
    }
  }
  private recordSet(): void {
    if (this.enableStats) {
      this.stats.sets++;
    }
  }
  private recordDelete(): void {
    if (this.enableStats) {
      this.stats.deletes++;
    }
  }
  private recordInvalidation(count: number): void {
    if (this.enableStats) {
      this.stats.invalidations += count;
    }
  }
}

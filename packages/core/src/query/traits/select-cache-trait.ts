/**
 * Select Cache Trait
 *
 * Provides caching functionality for SELECT queries.
 * Supports TTL, custom cache keys, and cache bypass.
 */

export interface CacheOptions {
  ttl?: number;
  key?: string;
  tags?: string[];
}

export interface CacheState {
  enabled: boolean;
  ttl?: number;
  key?: string;
  tags?: string[];
}

/**
 * Standalone Cache Trait class for composition
 */
export class SelectCacheTrait {
  protected _cacheEnabled = false;
  protected _cacheTTL?: number;
  protected _cacheKey?: string;
  protected _cacheTags?: string[];

  /**
   * Check if cache adapter is available
   * Override in subclass to provide actual check
   */
  protected hasCache(): boolean {
    return false;
  }

  /**
   * Check if global cache is enabled
   * Override in subclass to provide actual check
   */
  protected isGlobalCacheEnabled(): boolean {
    return false;
  }

  /**
   * Enable caching for this query
   *
   * @example
   * ```typescript
   * // Cache with default TTL
   * query.cache()
   *
   * // Cache with custom TTL (seconds)
   * query.cache(60)
   *
   * // Cache with options
   * query.cache({ ttl: 300, key: 'my-query', tags: ['users'] })
   * ```
   */
  cache(options?: number | CacheOptions): this {
    if (!this.hasCache()) {
      // Silently ignore if no cache adapter configured
      return this;
    }

    this._cacheEnabled = true;

    if (typeof options === 'number') {
      this._cacheTTL = options;
    } else if (options) {
      this._cacheTTL = options.ttl;
      this._cacheKey = options.key;
      this._cacheTags = options.tags;
    }

    return this;
  }

  /**
   * Disable caching for this query
   * Useful when global cache is enabled but you want to bypass it
   */
  noCache(): this {
    this._cacheEnabled = false;
    this._cacheTTL = undefined;
    this._cacheKey = undefined;
    this._cacheTags = undefined;
    return this;
  }

  /**
   * Set cache TTL (in seconds)
   */
  cacheTTL(seconds: number): this {
    this._cacheTTL = seconds;
    return this;
  }

  /**
   * Set custom cache key
   */
  cacheKey(key: string): this {
    this._cacheKey = key;
    return this;
  }

  /**
   * Set cache tags for invalidation
   */
  cacheTags(...tags: string[]): this {
    this._cacheTags = tags;
    return this;
  }

  /**
   * Check if caching is enabled for this query
   */
  isCacheEnabled(): boolean {
    return this._cacheEnabled;
  }

  /**
   * Get current cache state
   */
  getCacheState(): CacheState {
    return {
      enabled: this._cacheEnabled,
      ttl: this._cacheTTL,
      key: this._cacheKey,
      tags: this._cacheTags,
    };
  }

  /**
   * Reset cache state
   */
  resetCacheState(): this {
    this._cacheEnabled = this.isGlobalCacheEnabled();
    this._cacheTTL = undefined;
    this._cacheKey = undefined;
    this._cacheTags = undefined;
    return this;
  }
}
